-- Per-tent QR info & structured damage form (see docs/PRD-per-tent-qr-info-page.md).
-- The reporter form is now a fixed structured taxonomy and each submission inserts ONE damages
-- row per damage item. These additive columns carry the per-item structure; status computation,
-- the tent_overview view, and the resolve flow are unchanged (per-item resolution falls out of
-- one-row-per-item for free). category_labels keeps the single snapshot label so existing manager
-- views render new rows without change.

alter table public.damages
	add column if not exists damage_type text,         -- stable key, e.g. 'hering_fehlt'
	add column if not exists quantity    int;          -- only set for countable items (Heringe)

-- Index the stable key so season-over-season "which part of which tent keeps failing" queries
-- don't table-scan.
create index if not exists damages_type_idx on public.damages (damage_type);
