# PRD — Per-Tent QR Info & Damage Page

_Status: ready to build. Drafted 2026-06-22 from a grilling session. Supersedes three
"Resolved decisions" in `CLAUDE.md` (see Implementation Decisions §1)._

## Problem Statement

Today a camp member who notices a damaged tent must open the single shared reporter URL and then
manually figure out and pick the right tent number (1–20) from a grid. They can't see whether the
damage has already been reported, so the same broken Hering or torn Aussenzelt gets reported over
and over. The shared damage list is also a flat set of generic categories that doesn't match how
Spatz-tent damage is actually described in the field (how _many_ Heringe are missing? _which_
Abspannung tore? is a part broken-but-present or missing entirely?), so reports are vague and the
Materialwart can't track which specific part of which tent degrades over the seasons.

## Solution

Put a unique QR code on each physical tent. Scanning it opens a page _for that tent_ that:

- shows the tent's current status and its list of open damages (so a reporter can see "already
  reported, don't bother" — or "this is new"), without exposing any other tent or the fleet; and
- lets them report damage on that tent directly, using a structured form that matches real
  Spatz-tent damage: broken-but-present parts (gerissen / verbogen), missing parts (with a count
  for Heringe), a "describe what" note for Abspannung, and a free-text Sonstiges.

Each distinct damage becomes its own entry so the Materialwart can resolve parts independently
(found the Heringe, but the Aussenzelt is still torn) and, over seasons, see which parts of which
tents keep failing.

## User Stories

### Reporter (camp member, anonymous, at the tent)
1. As a camp member, I want to scan the QR on a tent and land on a page for _that exact tent_, so
   that I never have to know or pick the tent number.
2. As a camp member, I want to see the tent's current status (In Ordnung / Reparatur nötig /
   Ausser Betrieb) at the top of the page, so that I immediately know its condition.
3. As a camp member, I want to see the list of damages already reported as open on this tent, so
   that I don't file a duplicate report for something already known.
4. As a camp member, I want to report "Aussenzelt gerissen", "Innenzelt gerissen", "Aufhängung
   gerissen", "Stange verbogen", "Vorzelt gerissen" as simple checkboxes, so that the common
   damage types are one tap each.
5. As a camp member, I want to report "Abspannung gerissen" and describe _which_ one / what
   happened in a text field, so that the Materialwart knows what to fix without guessing.
6. As a camp member, I want to report missing Heringe _with a count_, so that the Materialwart
   knows how many to replace.
7. As a camp member, I want a "Fehlt" section to mark whole missing parts (Vorzelt, Stangen,
   Aussenzelt, Innenzelt), so that lost equipment is tracked, not just damage.
8. As a camp member, I want a "Sonstiges" free-text option, so that I can report anything the
   fixed list doesn't cover.
9. As a camp member, I want to attach one optional photo to my report, so that the damage is
   visually documented.
10. As a camp member, I want to submit several damages in one go (e.g. a torn Aussenzelt _and_ 3
    missing Heringe) and tap send once, so that reporting is quick.
11. As a camp member, I want confirmation that my report was saved, so that I trust it went
    through.
12. As a camp member with a flaky connection, I want my report queued offline and sent
    automatically when the connection returns, so that a dropout doesn't lose my report.
13. As a camp member, I want to never see other tents' data or the fleet overview, so that the
    physically-public QR can't leak fleet information.

### Manager (Materialwart, authenticated)
14. As a Materialwart, I want each reported damage to be its own resolvable entry, so that I can
    mark the Heringe found while leaving the torn Aussenzelt open.
15. As a Materialwart, I want a tent to stay "Reparatur nötig" until its _last_ open damage is
    resolved, so that status reflects reality (this already works and must keep working unchanged).
16. As a Materialwart, I want the Hering count and the Abspannung/Sonstiges descriptions stored on
    the report, so that I know quantities and specifics.
17. As a Materialwart, I want each damage labelled with a stable human-readable snapshot, so that
    my existing dashboard and tent-detail views render the new reports without change.
18. As a Materialwart, I want to keep seeing photos and full resolution history on my authenticated
    pages, so that the manager experience is unchanged.

### Operator / project
19. As the operator, I want to generate one QR per tent (1–20) pointing at that tent's page, so
    that I can print and attach them.
20. As the operator, I want all 20 QRs to carry the one existing shared token, so that there is
    only one secret to manage and rotate.

## Implementation Decisions

1. **Reverses three `CLAUDE.md` "Resolved decisions" — update that doc as part of the work:**
   - "Single shared secret URL … No per-tent links" → now **one QR per tent**, shared token + tent
     id in the URL path (`/zelt/<id>/<token>`).
   - "Reporters … must never read fleet data or other tents' status" → now a **deliberate, narrow
     read exception**: an anonymous scanner may read _only the one tent they scanned_ (status +
     its open damages), never the fleet.
   - "Damage categories are manager-editable (CRUD)" → now a **fixed structured form in code**; the
     manager Kategorien CRUD is retired.

2. **New public route** for the per-tent page, keyed by tent id + token. Renders status + open
   damages + the structured report form. The existing shared `/melden/<token>` form is **kept** as
   a manual-tent-pick fallback; the per-tent route is canonical.

3. **New token-gated read Edge Function** (working name `zelt-info`): input = token + tent_id;
   verifies the token equals `REPORTER_TOKEN`; uses the service role to return _only_ that tent's
   computed status and its list of open damages (label + quantity + description). Returns **no
   photos and no resolution history** to anonymous callers. Mirrors the `melden` security pattern
   (token gate, service role, anon never touches tables). This is the single new read seam.

4. **`melden` Edge Function extended** to accept an array of damage items in one submission and
   insert **one `damages` row per item**. Each item carries its own client-generated `report_id`
   (idempotency preserved), a `damage_type`, an optional `quantity`, and an optional per-item
   description (stored in the existing `notes`). One optional photo per submission is uploaded once
   and the same `photo_path` is referenced by every row from that submission. Token gate, rate
   limit, and idempotency-by-`report_id` are unchanged.

5. **Schema change (additive):** add to `public.damages`:
   - `damage_type text` — stable key (e.g. `hering_fehlt`), independent of the German label.
   - `quantity int` (nullable) — only populated for `hering_fehlt`.
   `category_labels[]` continues to be populated with the single snapshot label so existing
   manager views (dashboard, tent detail) render new rows unchanged. `category_ids[]` is left
   nullable/empty for new rows (no category UUIDs in the fixed-schema model); old demo rows keep
   their values. No change to status computation, the `tent_overview` view, open-count logic, or
   the resolve UI — per-item resolution falls out of "one row per item" for free.

6. **Damage taxonomy (fixed, in code)** — stable key → German label → input type:

   | key | label | input |
   |---|---|---|
   | `aussenzelt_gerissen` | Aussenzelt gerissen | checkbox |
   | `innenzelt_gerissen` | Innenzelt gerissen | checkbox |
   | `aufhaengung_gerissen` | Aufhängung gerissen | checkbox |
   | `stange_verbogen` | Stange verbogen | checkbox |
   | `abspannung_gerissen` | Abspannung gerissen | checkbox + text ("was?") |
   | `vorzelt_gerissen` | Vorzelt gerissen | checkbox |
   | `hering_fehlt` | Hering fehlt | checkbox + number (Anzahl) |
   | `fehlt_vorzelt` | Vorzelt fehlt | checkbox (Fehlt group) |
   | `fehlt_stangen` | Stangen fehlen | checkbox (Fehlt group) |
   | `fehlt_aussenzelt` | Aussenzelt fehlt | checkbox (Fehlt group) |
   | `fehlt_innenzelt` | Innenzelt fehlt | checkbox (Fehlt group) |
   | `sonstiges` | Sonstiges | checkbox + text |

   Hering appears once (top-level, with count) and is intentionally **not** in the Fehlt group.

7. **QR generation:** produce 20 codes targeting `/zelt/<n>/<token>` for n = 1..20, alongside the
   existing single-URL QR at repo root. All carry the current shared token. (Rotation-without-
   reprinting via a redirect remains future work, as already noted in `CLAUDE.md`.)

8. **Offline outbox** keeps working: the structured multi-item report (JSON + optional photo Blob)
   queues in IndexedDB when offline and flushes on reconnect, exactly as today.

## Testing Decisions

This project currently has **no test harness** (noted in `CLAUDE.md`). This PRD does not introduce
one as a blocker, but the highest-value seams, if/when tests are added, are:

- **The `melden` Edge Function** (highest seam, already the system's trust boundary): given a valid
  token + a multi-item payload, it inserts one row per item with correct `damage_type` / `quantity`
  / `notes`, is idempotent per `report_id`, and rejects a wrong token. Test external behaviour
  (rows produced, status codes), not internals.
- **The `zelt-info` read function:** given a valid token + tent_id, returns only that tent's status
  and open damages and never another tent's; a wrong token returns 401. This is the new read
  boundary and is the one most worth a test because it guards the access exception.
- **Status computation** stays at the report row level and is unchanged, so existing behaviour
  (tent damaged while any row open; active when the last open row resolves) is the regression
  surface to protect — a pure function over rows is the natural unit to test.

Prior art: none in-repo yet; the curl smoke tests described in `CLAUDE.md` (OPTIONS 200,
wrong-token 401 against `melden`) are the closest existing pattern and should be extended to
`zelt-info`.

## Out of Scope

- Manager-initiated reports from the dashboard (still a `CLAUDE.md` nice-to-have).
- Per-tent _tokens_ and rotation-without-reprinting via a redirect (deferred; single shared token
  for now).
- Per-item photos (one photo per submission only).
- Showing photos / resolution history to anonymous scanners.
- A general manager-editable category system (explicitly retired in favour of the fixed taxonomy).
- CSV export for J+S, PNG maskable icons, automated tests (pre-existing backlog, untouched here).

## Further Notes

- The physical QR is public, so the `zelt-info` read is deliberately minimal and single-tent; the
  token remains a low-secrecy capability (rate-limited writes, rotatable, manager can mark a report
  invalid — all unchanged).
- Because each damage is its own row, "Fehlt: Stangen + Hering" naturally becomes two independently
  resolvable rows, which is the season-over-season degradation tracking the SRS calls the payoff.
- After this ships, the cloud demo seed (open damage on tents 5/7/12) should still be cleared
  before a real camp, as already flagged in `CLAUDE.md`.
