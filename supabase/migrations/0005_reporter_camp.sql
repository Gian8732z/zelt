-- Reporter name + camp on each damage report.
-- `reporter_name`: who filed the report (captured in the reporter form, required there). Stamped
-- onto every row of a submission. `camp`: which camp it was filed at (e.g. "Sola 26"), stamped
-- server-side by the `melden` function from its CURRENT_CAMP env so reporters never type it and it
-- can't be spoofed. Both are additive and nullable (older rows predate them); the manager detail
-- view renders them, and `camp` gives the season/location dimension for cross-camp degradation
-- tracking.

alter table public.damages
	add column if not exists reporter_name text,
	add column if not exists camp          text;

-- Camp is the natural grouping for season-over-season rollups ("which tents failed at which camp").
create index if not exists damages_camp_idx on public.damages (camp);
