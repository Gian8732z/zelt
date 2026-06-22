-- Zelt-Verwaltung — initial schema
-- Two audiences: anonymous reporters (write damages via the `melden` Edge Function only) and
-- authenticated managers (full read/write). RLS enforces that boundary; the Edge Function uses
-- the service role to insert damages, so anonymous clients never touch the table directly.

-- ---------------------------------------------------------------------------
-- Inventory: tents (growable, not a hard-coded 1..20 range)
-- ---------------------------------------------------------------------------
create table if not exists public.tents (
	tent_id        int primary key,
	label          text,
	out_of_service boolean not null default false,  -- manual manager override
	acquired_on    date,
	notes          text,
	created_at     timestamptz not null default now()
);

insert into public.tents (tent_id)
select generate_series(1, 20)
on conflict (tent_id) do nothing;

-- ---------------------------------------------------------------------------
-- Manager-editable damage categories
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
	id         uuid primary key default gen_random_uuid(),
	label      text not null,
	active     boolean not null default true,
	sort_order int not null default 0,
	created_at timestamptz not null default now()
);

insert into public.categories (label, sort_order)
values
	('Gestänge / Stangen', 10),
	('Heringe', 20),
	('Reissverschluss', 30),
	('Zeltbahn (Riss / Loch)', 40),
	('Nähte', 50),
	('Abspannleinen', 60),
	('Fehlendes Teil', 70),
	('Sonstiges', 80)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Append-only damage log
-- report_id is client-generated (idempotency key); reported_at is the client's creation time,
-- received_at is server arrival — they differ when a report was queued offline.
-- ---------------------------------------------------------------------------
create table if not exists public.damages (
	report_id            uuid primary key,
	tent_id              int not null references public.tents (tent_id),
	reported_at          timestamptz not null,
	received_at          timestamptz not null default now(),
	category_ids         uuid[] not null default '{}',
	category_labels      text[] not null default '{}',   -- snapshot, survives category renames
	notes                text,
	photo_path           text,                            -- object path in the damage-photos bucket
	status               text not null default 'open' check (status in ('open', 'resolved', 'invalid')),
	resolution_timestamp timestamptz,
	resolution_notes     text,
	resolved_by          uuid references auth.users (id)
);

create index if not exists damages_tent_idx on public.damages (tent_id, reported_at desc);
create index if not exists damages_open_idx on public.damages (tent_id) where status = 'open';

-- ---------------------------------------------------------------------------
-- Computed fleet overview. security_invoker => RLS of the base tables applies to the caller.
-- A tent is Damaged while any report is open, Out of Service when manually flagged, else Active.
-- ---------------------------------------------------------------------------
create or replace view public.tent_overview
with (security_invoker = on) as
select
	t.tent_id,
	t.label,
	t.out_of_service,
	coalesce(o.open_count, 0) as open_count,
	case
		when t.out_of_service then 'out_of_service'
		when coalesce(o.open_count, 0) > 0 then 'damaged'
		else 'active'
	end as status
from public.tents t
left join (
	select tent_id, count(*)::int as open_count
	from public.damages
	where status = 'open'
	group by tent_id
) o on o.tent_id = t.tent_id;

-- ---------------------------------------------------------------------------
-- Best-effort rate limiter for the public submit endpoint (called by the Edge Function only)
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limit (
	bucket_key   text not null,
	window_start timestamptz not null,
	count        int not null default 0,
	primary key (bucket_key, window_start)
);

create or replace function public.rl_hit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
	w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
	c int;
begin
	insert into public.rate_limit (bucket_key, window_start, count)
	values (p_key, w, 1)
	on conflict (bucket_key, window_start)
	do update set count = public.rate_limit.count + 1
	returning count into c;
	return c <= p_max;
end;
$$;

revoke all on function public.rl_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rl_hit(text, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.tents enable row level security;
alter table public.categories enable row level security;
alter table public.damages enable row level security;
alter table public.rate_limit enable row level security;  -- no policies => only service_role

-- Tents: managers only.
create policy tents_auth_all on public.tents
	for all to authenticated using (true) with check (true);

-- Categories: anonymous reporters may read ACTIVE ones (to render the form); managers manage all.
create policy categories_anon_read_active on public.categories
	for select to anon using (active = true);
create policy categories_auth_all on public.categories
	for all to authenticated using (true) with check (true);

-- Damages: managers only. Anonymous inserts happen via the Edge Function (service role), which
-- bypasses RLS — so there is deliberately no anon policy here.
create policy damages_auth_all on public.damages
	for all to authenticated using (true) with check (true);

-- Table privileges. RLS gates rows, but Postgres checks table-level GRANTs first, so the API
-- roles need explicit grants — don't rely on Supabase's default privileges, which don't cover
-- tables created by CLI migrations.
grant select on public.categories to anon;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.tents to authenticated;
grant select, insert, update on public.damages to authenticated;  -- no delete: append-only log
grant select on public.tent_overview to authenticated;

-- The `melden` Edge Function writes as the service role (which bypasses RLS) but still needs
-- table-level grants.
grant all on public.categories, public.tents, public.damages to service_role;
grant select on public.tent_overview to service_role;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for damage photos
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('damage-photos', 'damage-photos', false)
on conflict (id) do nothing;

-- Managers can read photos (needed to mint signed URLs). Uploads are done by the Edge Function
-- via the service role, so no anon/authenticated insert policy is required.
create policy damage_photos_auth_read on storage.objects
	for select to authenticated using (bucket_id = 'damage-photos');
