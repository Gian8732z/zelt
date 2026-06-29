-- Camp grouping for the tent overview (reporter picker + manager grid).
-- A tent's camp_group names the section it belongs to in the CURRENT camp (e.g. 'TN-Zelter').
-- NULL camp_group = not assigned to a section; combined with the existing out_of_service flag this
-- is how tents sitting in storage between camps render as a dimmed "Nicht im Lager" bucket.
-- Group display order is derived (lowest tent number wins), so no sort column is needed.

alter table public.tents
	add column if not exists camp_group text;   -- camp section name; NULL = not in this camp

-- ---------------------------------------------------------------------------
-- Manager fleet overview: surface camp_group so the grid can render sections.
-- camp_group is appended at the END of the select list: CREATE OR REPLACE VIEW only permits
-- ADDING columns after the existing ones (tent_id, label, out_of_service, open_count, status) —
-- inserting it mid-list would change their positions and error. The grid reads columns by name.
-- security_invoker stays on (the caller's — a manager's — RLS applies).
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
	end as status,
	t.camp_group
from public.tents t
left join (
	select tent_id, count(*)::int as open_count
	from public.damages
	where status = 'open'
	group by tent_id
) o on o.tent_id = t.tent_id;

-- ---------------------------------------------------------------------------
-- Anon-readable camp layout for the reporter picker.
-- The picker is anonymous, so anon must read the layout. We use explicit, deterministic privileges
-- rather than relying on a view owner bypassing RLS (which is not guaranteed on Supabase cloud,
-- where `db push` runs under a temporary role):
--   * a COLUMN-level grant limits anon to exactly (tent_id, camp_group, out_of_service) even on the
--     base table — RLS is row-level, so a table-wide grant would otherwise leak notes/acquired_on;
--   * an anon SELECT policy exposes every tent row. The layout is physically public anyway (it is
--     printed on the per-tent QR codes staked in camp).
-- The view is security_invoker, so the anon caller's own grant + policy govern access. It exists as
-- a stable, *-safe API name for the picker; the column grant is what actually fences off the
-- sensitive columns.
-- ---------------------------------------------------------------------------
grant select (tent_id, camp_group, out_of_service) on public.tents to anon;

drop policy if exists tents_anon_read_layout on public.tents;
create policy tents_anon_read_layout on public.tents
	for select to anon using (true);

create or replace view public.tent_groups
with (security_invoker = on) as
select
	t.tent_id,
	t.camp_group,
	t.out_of_service
from public.tents t;

grant select on public.tent_groups to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed the current camp so grouping is live on deploy; the /verwalten/lager editor owns all later
-- changes. Guarded by `camp_group is null` so a manual re-run never clobbers manager edits.
-- 1–4 Leiter*innenzelter · 5 Venner*innenzelt · 6–11 TN-Zelter · 12–20 stored (out of service).
-- ---------------------------------------------------------------------------
update public.tents set camp_group = 'Leiter*innenzelter' where tent_id between 1 and 4  and camp_group is null;
update public.tents set camp_group = 'Venner*innenzelt'    where tent_id = 5               and camp_group is null;
update public.tents set camp_group = 'TN-Zelter'           where tent_id between 6 and 11 and camp_group is null;
update public.tents set out_of_service = true              where tent_id between 12 and 20 and camp_group is null and out_of_service = false;
