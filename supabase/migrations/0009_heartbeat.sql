-- Keep-alive heartbeat: a write target so the daily keep-alive Worker generates real DB activity.
--
-- Background: the `zelt-keepalive` Cloudflare Worker pinged an anon `select` on `categories` daily
-- to keep the free-tier projects from auto-pausing. That read verifiably reached Postgres every day
-- (cron fired 7/7 days, HTTP 200, cf-cache-status: DYNAMIC so it was never edge-cached) — yet
-- Supabase still emailed auto-pause warnings for BOTH prod and staging (2026-07-18 / 2026-07-19),
-- citing "not seen sufficient activity for more than 7 days". Conclusion: a lightweight anon SELECT
-- does NOT count as activity for the pause scanner; a WRITE does (it generates WAL, and is the
-- community-proven reliable keep-alive). So the Worker now calls heartbeat() below, which writes.
--
-- Security posture matches the project invariant "anonymous never touches tables directly — only
-- guarded functions". Anon gets EXECUTE on heartbeat() and nothing else; the table itself has RLS on
-- with no policies and no anon/authenticated grant, so it is invisible to the API roles. The
-- SECURITY DEFINER function runs as the owner (bypasses RLS) and is the table's only writer.

create table if not exists public.heartbeat (
	id        smallint primary key default 1,
	pinged_at timestamptz not null default now(),
	constraint heartbeat_singleton check (id = 1)  -- exactly one row
);
insert into public.heartbeat (id) values (1) on conflict (id) do nothing;

alter table public.heartbeat enable row level security;  -- no policies => only service_role / owner

-- Deterministic fence (the 0006 gotcha): a freshly-created Supabase project auto-grants the API
-- roles SELECT on new public tables via default privileges, which would make pinged_at anon-readable
-- on staging. Clear it so the table is reachable ONLY through heartbeat(), on every project vintage.
revoke all on public.heartbeat from anon, authenticated;

-- Bumps the single heartbeat row's timestamp. SECURITY DEFINER so the anon caller's write goes
-- through as the owner (RLS/grants on the table stay closed to anon). Upsert form is self-healing:
-- it recreates the row if it were ever missing, so a ping can never silently no-op.
create or replace function public.heartbeat()
returns void
language sql
security definer
set search_path = public
as $$
	insert into public.heartbeat (id, pinged_at)
	values (1, now())
	on conflict (id) do update set pinged_at = now();
$$;

-- Fence the function: strip the default PUBLIC execute, then hand anon exactly EXECUTE — the Worker
-- calls it with the bundled anon key. (Same pattern as rl_hit in 0001.)
revoke all on function public.heartbeat() from public;
grant execute on function public.heartbeat() to anon;

-- service_role keeps full access to the table for manual inspection of pinged_at.
grant all on public.heartbeat to service_role;
