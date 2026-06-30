-- Reclassify the pre-existing damage history into its own (inactive) camp: "VOR SOLA".
--
-- All damage rows currently in the DB were filed BEFORE the "Sola 26" camp actually started; they
-- were backfilled to camp='Sola 26' in migration-era 0005 only because that was the camp env at the
-- time. This migration moves that historical log into a distinct camp label so the Statistik
-- "Pro Saison" view separates the pre-Sola history from the real Sola 26 season.
--
-- "VOR SOLA" is *inactive* by construction: there is no camps table — the active camp is whatever
-- the `CURRENT_CAMP` function secret is (still "Sola 26"), which `melden` stamps onto every NEW
-- report. So no new reports ever flow into "VOR SOLA"; this is a one-time relabel of existing rows.
--
-- Scope: only rows currently stamped 'Sola 26' (the entire current history). A genuine Sola 26
-- report filed between authoring and deploy is not expected (the camp hasn't begun); the WHERE
-- keeps the relabel idempotent and re-run-safe (it touches nothing once no 'Sola 26' rows remain).
update public.damages
set camp = 'VOR SOLA'
where camp = 'Sola 26';
