-- Component-first structured damage form (supersedes the flat damage_type from 0002).
-- The reporter now picks a COMPONENT and one or more DAMAGE KINDS from that component's menu; each
-- selected (component, damage_kind) pair becomes one append-only damages row, independently
-- resolvable. These additive columns store the structured pair alongside the snapshot German label
-- in category_labels (which existing manager/zelt-info views already render). History was cleared,
-- so no backfill from the old damage_type column is needed; it is left in place but unused.

alter table public.damages
	add column if not exists component   text,   -- e.g. 'vorzelt'  (see src/lib/damage-types.ts)
	add column if not exists damage_kind text;   -- e.g. 'stoff_gerissen'

-- Index the structured pair so season-over-season "which component of which tent keeps failing"
-- queries (and per-failure-mode rollups) don't table-scan.
create index if not exists damages_component_idx on public.damages (component, damage_kind);
