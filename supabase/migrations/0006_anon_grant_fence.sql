-- Make the anonymous read fence on `tents`/`damages` DETERMINISTIC across environments.
--
-- The anon boundary is enforced by two things working together: a column-level GRANT (anon may read
-- only the three layout columns of `tents`) and the `tents_anon_read_layout` SELECT policy. But a
-- column grant only fences anon if anon does NOT also hold a broader table-wide grant — column and
-- table privileges are ADDITIVE, so a table-wide SELECT wins and exposes every column.
--
-- Migration 0004 added the column grant but never REVOKEd a pre-existing broad grant first, so the
-- fence depended on whatever default privileges a given Supabase project happened to start with:
--   * prod + local: anon had NO table-wide grant, so 0004's column grant was the only one -> fenced
--     (anon reads only tent_id/camp_group/out_of_service; `notes`/`acquired_on` stay hidden).
--   * a freshly-created cloud project (e.g. the new staging project): anon inherits a table-wide
--     SELECT on new public tables from default privileges, which overrides the column grant -> LEAK
--     (anon reads ALL `tents` columns, including `notes`/`acquired_on`).
-- `damages` is row-safe everywhere (no anon policy => RLS denies all anon rows), but a stray
-- default-privilege grant makes anon queries return `[]` (empty) instead of a clean 42501 denial,
-- which is an inconsistent, fingerprintable boundary.
--
-- Fix: REVOKE ALL from anon on both tables (clears table- AND column-level grants, whatever a
-- project started with), then re-grant exactly the three layout columns on `tents`. `damages` gets
-- nothing back — anon never reads it directly (the token-gated `zelt-info` function does, as the
-- service role). After this the fence holds regardless of a project's default privileges. Idempotent
-- and safe to re-run.

-- Clear any inherited/stray grants (table-wide or column-level) so we start from a known-empty state.
revoke all on public.tents   from anon;
revoke all on public.damages from anon;

-- Re-grant the minimal, deterministic anon surface: the three layout columns the reporter picker
-- reads (directly and via the security_invoker `tent_groups` view). Mirrors 0004; RLS row access is
-- still governed by the `tents_anon_read_layout` policy.
grant select (tent_id, camp_group, out_of_service) on public.tents to anon;
