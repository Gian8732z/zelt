-- Tent lifecycle: add/remove tents from the fleet instead of a fixed 1..20.
-- Two-tier removal preserves the append-only damage log:
--   * a tent with NO damage rows can be hard-DELETEd by a manager (it was never really used);
--   * a tent WITH history is RETIRED instead (retired = true) — its rows stay for seasonal stats,
--     but it leaves the active fleet. Retire is one-way (no reactivation path in the UI).
-- `retired` is distinct from `out_of_service` (which means "not in this camp / in storage").

alter table public.tents
	add column if not exists retired boolean not null default false;

-- ---------------------------------------------------------------------------
-- Manager fleet overview: hide retired tents. CREATE OR REPLACE keeps the exact column list/order
-- (tent_id, label, out_of_service, open_count, status, camp_group) — only the WHERE clause changes.
-- security_invoker stays on (a manager's RLS applies).
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
) o on o.tent_id = t.tent_id
where not t.retired;

-- ---------------------------------------------------------------------------
-- Anon reporter picker layout: hide retired tents too. The view is security_invoker, so the WHERE
-- clause runs as the anon caller and needs column-level SELECT on `retired` (not sensitive). The
-- existing column grant fences off notes/acquired_on; we just widen it by one harmless column.
-- ---------------------------------------------------------------------------
grant select (retired) on public.tents to anon;

create or replace view public.tent_groups
with (security_invoker = on) as
select
	t.tent_id,
	t.camp_group,
	t.out_of_service
from public.tents t
where not t.retired;
