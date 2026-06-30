# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

**Deployed and live in the cloud.** SvelteKit (Svelte 5 runes, TypeScript, SPA via
`adapter-static`) + Supabase (Postgres, Auth, Storage, one Edge Function), German-only UI.
`npm run check` and `npm run build` pass. The reporter form, manager login → dashboard → tent
detail, and the `melden` function (token gate, insert, idempotency) were all driven in a real
browser against the *local* stack with zero console errors; demo data is seeded (tents 5/7/12
damaged). The app still degrades to a "not configured" notice when env is absent.

**Production (deployed 2026-06-22; damage form redesigned 2026-06-27; camp-groups + damage-form features deployed 2026-06-28; manager overview + Statistik deployed 2026-06-29):**
- **App:** https://zelt.pages.dev (Cloudflare Pages, project `zelt`, direct-upload deploy)
- **Supabase:** cloud project `kzlmbkadbzfhqzhaupiu` ("Zelt", eu-central-1). Schema pushed
  (through migration `0005`), `melden` + `zelt-info` functions deployed, `REPORTER_TOKEN` +
  `CURRENT_CAMP` secrets set.
- **Reporter URL / QR target:** token-less per-tent URLs `https://zelt.pages.dev/zelt/<id>` (1–20);
  the shared secret is bundled in-app (`PUBLIC_REPORTER_TOKEN`), not in the URL. A token-less
  `/melden` picker is the single-poster fallback. Generate the 20 QR SVGs with
  `BASE_URL=https://zelt.pages.dev node scripts/generate-tent-qr.mjs` (no QRs printed for Sola 26 yet).
- **Manager login:** `gian.ledergerber@gmail.com` at `/verwalten/anmelden`.
- **Keep-alive:** Cloudflare Worker `zelt-keepalive` (cron `0 6 * * *`) pings an anon `categories`
  read daily so the seasonal free-tier Supabase project doesn't auto-pause. Source in `keepalive/`.
- **2026-06-27 — component-first damage form shipped:** the reporter now picks a component
  (Aussenzelt/Innenzelt/Vorzelt/Stangen/Heringe/Sonstiges) then damage modes from that component's
  submenu (see the taxonomy decision below). Migration `0003` (split `component` + `damage_kind`
  columns) pushed, both functions redeployed, front-end redeployed, and **all cloud damage history
  cleared** (damages + the orphaned demo photo) — every tent reads "In Ordnung".
- **2026-06-28 — camp-grouped tent overview (deployed):** the
  reporter picker and the manager grid now group tents by an editable `camp_group` (this camp: 1–4
  Leiter*innenzelter, 5 Venner*innenzelt, 6–11 TN-Zelter), with 12–20 marked `out_of_service` and
  rendered dimmed under a trailing "Nicht im Lager" section. DB-backed (migration `0004`:
  `camp_group` column, anon-readable `tent_groups` view, `camp_group` added to `tent_overview`) and
  manager-editable at `/verwalten/lager`. `npm run check`/`build` pass and the anon read path was
  proven against the local stack (anon reads `tent_groups`; denied on `tents`/`damages` directly).
  **Pushed to cloud 2026-06-28 (migration `0004`); uncommitted in git.**
- **2026-06-28 — damage-form features (deployed):** two new
  Innenzelt modes (`reissverschluss_defekt` "Reissverschluss defekt", `boden_gerissen` "Boden
  gerissen"); the reporter URL simplified to a **token-less** `/zelt/<id>` (the shared secret moved
  out of the QR path into the app bundle as `PUBLIC_REPORTER_TOKEN`, so rotating it never reprints
  QRs); a **required reporter name** (remembered in `localStorage`, stamped per row); **per-damage**
  photos and an always-available comment (replacing the single per-submission photo and the
  Sonstiges-only text box); and a **camp name** stamped onto every row server-side from a
  `CURRENT_CAMP` function env (e.g. "Sola 26"). Migration `0005_reporter_camp.sql` adds `reporter_name`
  + `camp` to `damages`. **Deployed to cloud 2026-06-28** (schema + functions + `CURRENT_CAMP` secret +
  Pages); the 14 pre-existing reports were backfilled to `reporter_name='Gromit'`, `camp='Sola 26'`,
  and the shared tent 3 & 5 photos pinned to their `stoff_gerissen` rows. End-to-end write verified on
  prod (new mode accepted + camp stamped). **Uncommitted in git.**

- **2026-06-29 — manager overview features (deployed):** four front-end additions to the manager
  area (no schema/function changes — all read existing `damages`/`tent_overview`): (1) a fleet-wide
  **Reparaturliste** (`/verwalten/reparaturen`) — every open damage as a flat, sortable triage queue,
  default sort **by severity** (`severity(component, kind)` appended to `damage-types.ts`:
  Aussenzelt/Innenzelt/Stangen structural failures = `hoch`, `heringe/fehlt` = `niedrig`, rest =
  `mittel`; oldest-first tiebreak), with Status + Komponente filters, inline resolve/dismiss, and
  photo thumbnails; (2) a **summary KPI strip** atop the fleet grid (Einsatzbereit / Reparatur nötig /
  Ausser Betrieb / Offene Schäden -> links to the worklist); (3) the tent-detail resolve/dismiss moved
  to **inline forms** (no browser `prompt()`/`confirm()`) plus a **bulk "alle erledigen"**; (4) the
  old Material page **replaced by a Statistik page** (`/verwalten/statistik`, **Chart.js**) — five
  sections (Uebersicht incl. oe Reparaturzeit, Nach Komponente, Nach Zelt, Nach Schadenstyp [the
  former procurement breakdown + a Nur-offene/Alle toggle], Pro Saison), a page-level Saison filter,
  counting open+resolved and excluding `invalid`. Nav is now Flotte / Reparaturen / Statistik. Added
  the `chart.js` dependency. Built by parallel **Sonnet** agents in isolated worktrees, merged to
  `main`, `npm run check`/`build` green, and **deployed to Cloudflare Pages** (https://zelt.pages.dev).

**Not yet done:** the photo and offline-sync paths are written but not yet exercised in a browser
**against the cloud**; no automated tests; the 2026-06-27 component-first redesign is deployed but
uncommitted in git. See "Status — what's left" below.

`README.md` holds both runbooks (cloud and local). Local dev runs on **Colima + local Supabase**;
the cloud values live in `.env.production` (used by `npm run build`), local in `.env` — see Commands.

### Commands

- `npm run dev` — dev server (http://localhost:5173). Uses `.env` → **local** Supabase.
- `npm run build` — static SPA into `build/`. Production mode loads `.env.production` → **cloud**
  Supabase (`kzlmbkadbzfhqzhaupiu`). Both env files are gitignored; they hold only the public
  anon key.
- `npm run check` — `svelte-check` type checking (run this after edits; it's the gate)
- Local backend: `colima start && supabase start` (stop with `supabase stop` then `colima stop`).
  `supabase status` prints local URLs/keys; Studio at http://localhost:54323. New migrations only
  apply to a **fresh** DB — run `supabase db reset` to re-apply them on an existing local volume
  (`supabase start` won't re-run them). Local manager demo
  login `materialwart@example.com` / `zelt-demo-1234`; local reporter URL `/melden/demo-token`
  (token set in `supabase/functions/.env`).
- **Cloud deploy** (⚠️ SUPERSEDED by the CI/CD pipeline — see "Pipeline & contribution workflow"
  below. Deploys now flow through PR → CI → merge; the manual commands below are break-glass only,
  for when CI is down. CLI is logged in + linked to `kzlmbkadbzfhqzhaupiu`):
  - Schema: `supabase db push` (uses a temporary login role from the access token — no DB password
    needed). Functions: `supabase functions deploy melden` and `supabase functions deploy zelt-info`.
    Secrets: `supabase secrets set REPORTER_TOKEN=…` and `supabase secrets set CURRENT_CAMP="Sola 26"`
    (the camp stamped onto new reports; change it per camp).
  - Front-end: `npm run build && npx wrangler pages deploy build --project-name=zelt --branch=main`.
  - Keep-alive Worker: `npx wrangler deploy -c keepalive/wrangler.jsonc`; watch with
    `npx wrangler tail zelt-keepalive`.
- Two Colima gotchas already handled in-repo: `[analytics] enabled = false` in `config.toml` (its
  `vector` container can't mount the Docker socket), and explicit table `GRANT`s in the migration
  (RLS gates rows but Postgres still checks grants; Supabase default privileges don't cover CLI
  migrations — this bit both `anon` reads and `service_role` inserts).
- Cloud deploy gotcha: a fresh Cloudflare account must open the Workers & Pages dashboard once to
  auto-create a `workers.dev` subdomain before any Worker **cron schedule** will register (CF error
  10063) — even for a cron-only Worker with `workers_dev: false`. Subdomain here is `gangstagian`.

### Layout

- `src/lib/` — `supabase.ts` (client, null until configured), `config.ts` (dynamic public env, incl.
  the bundled `REPORTER_TOKEN`), `types.ts`, `damage-types.ts` (component-first damage taxonomy:
  components → per-component damage modes; every selected mode also carries an optional per-item
  comment + photo, `sonstiges` requires the comment),
  `camp-groups.ts` (`groupTents()` — buckets tents into camp sections by `camp_group`, ordered by
  lowest tent #, trailing "Nicht im Lager"; shared by the picker + manager grid), `tent-info.ts`
  (public single-tent status read), `photo.ts` (canvas downscale + EXIF strip), `outbox.ts`
  (IndexedDB queue via `idb`), `submit.ts` (network-first submit + `flushOutbox`).
- `src/routes/zelt/[id]/` — **public per-tent page** (status + component-first report form), the
  canonical reporter flow reached by the per-tent QR. The reporter token is no longer a URL segment —
  it's read from the bundled `REPORTER_TOKEN` (`config.ts`). The `TentModel` SVG diagram is **not** used
  here — it's a local-only experiment (`src/lib/components/TentModel.svelte`, `tent-parts.ts`, route
  `/zelt-preview`), deliberately kept out of the shipped form. `src/routes/melden/` — fallback for
  the single shared link: a tent picker (grouped by `camp_group` read from `tent_groups`, cached to
  localStorage so a later offline open still renders the camp; cold cache offline → flat 1–20) that
  routes into the per-tent page. `src/routes/verwalten/` — manager area (`+layout.svelte` auth guard,
  `anmelden/` login, `+page` fleet grid grouped by `camp_group`, `lager/` bulk camp-setup editor,
  `zelt/[id]/` detail, `reparaturen/` fleet-wide repair worklist, `statistik/` Chart.js stats; the fleet `+page` also carries a summary KPI strip). Outbox flush is wired globally in the root `+layout.svelte`.
- `supabase/migrations/0001_init.sql` — schema, RLS, `tent_overview` view, seeds, photo bucket.
  `0002_damage_structure.sql` — `damage_type` + `quantity` columns (the flat `damage_type` is
  superseded by `0003`). `0003_component_damage.sql` — `component` + `damage_kind` columns + index
  for the component-first form; old `damage_type` left in place but unused. `0004_camp_groups.sql` —
  `camp_group` column on `tents` (camp section; NULL = not in this camp), `camp_group` appended to
  the end of `tent_overview` (CREATE OR REPLACE VIEW only allows adding columns last), and the
  anon-readable `tent_groups` view (`security_invoker` + a column-level anon grant + SELECT policy on
  `tents`, so anon reads only the three layout columns); seeds the current camp.
  `0005_reporter_camp.sql` — `reporter_name` + `camp` columns on `damages` (both nullable, additive)
  + a `camp` index; the German label still lives in `category_labels`.
- `supabase/functions/melden/` — guarded public submit (Deno): token gate, rate limit; one
  submission inserts one row per damage item, idempotent upsert by `report_id`; a **per-item** photo
  (multipart part `photo_<report_id>` → `<report_id>.jpg`, ≤4 MB each / ≤10 MB total) and stamps
  `reporter_name` + the `CURRENT_CAMP` env onto every row. `supabase/functions/zelt-info/` —
  token-gated single-tent status read (no photos/history to anon). Both `verify_jwt = false` (token
  is the gate).
- Full design rationale for the per-tent QR + structured form: `docs/PRD-per-tent-qr-info-page.md`.

Key invariant: anonymous reporters never touch `damages` directly — writes go through the
`melden` function (service role). Anon-readable surfaces are deliberately minimal: `categories`
(active rows) and the `tent_groups` camp layout — only `tent_id` / `camp_group` / `out_of_service`,
fenced by a **column-level** anon grant + a `for select to anon` policy on `tents`, so the
manager-only `notes`/`acquired_on` stay hidden even though RLS itself is row-level.

### Status — what's left (as of 2026-06-27)

- **✅ Deployed to production** (2026-06-22): cloud Supabase + Cloudflare Pages + real
  `REPORTER_TOKEN` + first manager account + QR generated + keep-alive Worker. See "Current state".
  Smoke-tested via curl: app routes (incl. the reporter deep link via the `_redirects` SPA
  fallback) and the `melden` function (OPTIONS 200, wrong-token 401) all respond correctly.
- **✅ Component-first damage form (2026-06-27):** redesigned reporter (pick component → damage
  modes), `component`/`damage_kind` column split (`0003`), `melden`/`zelt-info` updated. Type-checks;
  smoke-tested end-to-end on the local stack (insert, idempotency, invalid-pair reject, read-back);
  deployed to cloud. Not yet driven in a browser **against the cloud**, and **uncommitted in git**.
- **Verify in a browser against the cloud (built but unproven):** (1) the offline outbox — go
  offline in DevTools, submit, return online, confirm it syncs; (2) the photo path end-to-end —
  client EXIF-strip → function upload → manager signed-URL view. Still the two riskiest "written
  but unrun" paths; the curl smoke test does not cover them.
- **✅ Cloud history cleared (2026-06-27):** all `damages` rows + the orphaned demo photo removed;
  every tent reads "In Ordnung", clean for a real camp. Still open: consider rotating `REPORTER_TOKEN`
  if it's been shared anywhere insecure, and pointing the QR at a redirect you control so future
  rotations don't require reprinting.
- **Polish / nice-to-have:** PNG maskable icons (only an SVG today); a few tests (status
  computation, idempotency, outbox); manager-created reports; CSV export for J+S. None block the
  core flows.

## Pipeline & contribution workflow

**Deploys go through git, not the laptop.** As of 2026-06-30 the project has a PR-based CI/CD
pipeline (GitHub: `github.com/Gian8732z/zelt`, now public). The manual `wrangler`/`supabase` deploy
commands in the Commands section are **break-glass only**. Normal flow: branch → PR → green CI →
merge → auto-deploy.

### The CI gate (`.github/workflows/ci.yml`)
On every PR and push to `main` (and on `merge_group`, see below). The quality bar is split into two
parallel lanes behind one required check name so feedback is fast:
- **`unit`** (fast lane, runs on all events): `npm run check` → Vitest unit tests. Seconds, no backend.
- **`e2e`** (slow lane, skipped in the merge queue): boots an **ephemeral local Supabase** inside the
  runner + applies all migrations from scratch → `npm run build` → Playwright E2E (reporter happy-path
  + offline-outbox→reconnect→sync). The Playwright browser is cached (`~/.cache/ms-playwright`).
- **`gate`** (the required check — name unchanged so branch protection is untouched): an aggregator
  (`needs: [unit, e2e]`, `if: always()`) that passes iff `unit` succeeded **and** `e2e` succeeded
  except inside the merge queue (where `e2e` is intentionally skipped — unit-only there for speed).
- **`codeowner-gate`** (required, PRs + `merge_group`): diffs the PR's changed files against
  `.github/CODEOWNERS` using the **shared matcher `scripts/codeowner-match.mjs`** (single source of
  truth, also used by `/feature`) and **fails** if a high-risk path is touched without an APPROVED
  review from a code owner. No owned path → passes instantly (low-risk PRs stay 0-review
  auto-mergeable). On `merge_group` it short-circuits to pass (gating already happened at PR time).
- **`deploy-preview`** (PRs): builds against **staging** Supabase and deploys a per-PR Cloudflare
  Pages preview (`pr-<n>.zelt.pages.dev`), comments the URL.
- **`deploy-prod`** (push to `main`): migrates + deploys functions to **staging then prod**, builds,
  deploys the prod SPA to `zelt.pages.dev`. (Runs full `unit`+`e2e` on the post-merge `main` push, so
  an e2e-only break the queue skipped is still caught before prod ships.)

**Merge queue (plumbed, dormant):** the `merge_group` trigger + the `gate`/`codeowner-gate` handling
above are ready for a GitHub merge queue, but one **cannot be enabled on this repo** — it's an
**organization-only** feature (the `merge_queue` ruleset rule 422s; classic branch protection has no
merge-queue field) and `zelt` is owned by a **personal account**. The plumbing is harmless and stays
ready in case the repo ever moves into an org.

### Three backends
1. **ephemeral-local** — booted per CI run, the isolated test gate (parallel-safe, migrations fresh).
2. **staging** (`lcfmxoaejtlnxtczenqu`) — backs the deployed CF previews; migrates on merge.
3. **prod** (`kzlmbkadbzfhqzhaupiu`) — migrates + deploys on merge to `main` only.

Build-time env (URLs, anon keys, `PUBLIC_REPORTER_TOKEN`) is injected by CI from GitHub
secrets/vars, picked by branch. `.env*` files stay local-dev-only. Function secrets
(`REPORTER_TOKEN`/`CURRENT_CAMP`) remain hand-managed via `supabase secrets set` — never in CI.

### Tiered merge (the code-owner gate)
`.github/CODEOWNERS` lists **high-risk paths** (schema + functions, the reporter write/sync/photo
path, `supabase.ts`/`config.ts`, `damage-types.ts`, `routes/zelt/**`, manager auth, `.github/**`).
- **Low-risk PR** (no owned path): green CI → eligible for **auto-merge** (`gh pr merge --auto`).
- **High-risk PR** (touches an owned path): needs **@Gian8732z's approval**. As sole owner he can't
  self-approve, so he clears it via **admin merge** (`enforce_admins=false` is the escape hatch).
  Branch protection on `main`: required checks `gate` + `codeowner-gate`, no force-push/deletion.

### `/feature` command + agent factory
- **`/feature [--grill] <description>`** (`.claude/commands/feature.md`) is the on-ramp: branch off
  fresh `main` → plan → build → local gate (`check` + Vitest) → PR → classify risk vs. CODEOWNERS →
  `/code-review` → auto-merge if low-risk, else hand to Gian → drive to merge + confirm deploy.
- **`--grill` (opt-in):** before any code, runs the **`grilling`** skill to stress-test the idea, then
  carries the hardened spec into planning. **Hybrid Q&A:** decidable choices are asked as selectable
  chips via `AskUserQuestion` (recommended option first, `Other` for off-menu); open-ended questions
  stay free text; one question at a time. Without the flag, behavior is unchanged (plan directly, ask
  only when blocked).
- **Agent factory:** when work splits into **independent slices**, fan out one subagent per slice in
  its **own worktree**, each opening its **own PR** through the same tiered gate. **Coupled work
  stays single-stream** (one branch, one PR) to avoid merge conflicts.
- A **Stop hook** (`.claude/settings.json`) runs `npm run check && npm test` (Vitest, not Playwright)
  locally so type/logic regressions are caught before a PR is opened — but **guarded**: it skips when
  `git diff` shows no changes under `src`/`supabase` (working tree or index), so Q&A/docs-only turns
  don't pay the full gate.

## What the project is

"Zelt" (German for *tent*) is a **Tent Management PWA** for tracking damage and maintenance
across a fleet of **20 modular Spatz tents** used in Swiss scout camps. It serves J+S
(Jugend+Sport) material tracking. Two distinct user experiences share one data store:

- **Reporter (camp member):** unauthenticated, write-only. Online-first with an offline fallback
  — camps usually have connectivity, so offline is the exception, not the norm; reports must
  still succeed when it drops.
- **Manager (Quartermaster / *Materialwart*):** authenticated, full read/write, online-only.

## Resolved decisions (2026-06-22)

These supersede the SRS where they conflict:

- **Online-first, offline-capable** (not offline-first). The SRS reads as offline-first; in
  practice camps usually have a connection. Build the happy path as a normal online submit, with
  a local outbox that catches submissions when the network is down and flushes on reconnect.
- **Photos queue offline too.** Capture the photo as a Blob in IndexedDB alongside the report and
  upload on reconnect — reversing the SRS's "photos are online-only."
- **~~Single shared secret URL~~ → Per-tent QR codes → token-less per-tent URLs** _(per-tent QR
  added 2026-06-22 per `docs/PRD-per-tent-qr-info-page.md`; token dropped from the URL 2026-06-28)._
  Each tent has its own QR encoding a clean `/zelt/<id>` (no token). The shared `REPORTER_TOKEN` is
  **bundled into the app** (`PUBLIC_REPORTER_TOKEN`) and sent to `melden`/`zelt-info` — as secret as a
  token printed on a QR sticker, i.e. low, which is fine. Because the secret is no longer in the
  printed URL, **rotating it no longer requires reprinting the QRs**. A token-less `/melden` picker
  remains as the single-poster fallback.
- **Mixed iOS + Android** reporter devices → design the sync mechanism to the iOS floor
  (no Background Sync API, ~7-day IndexedDB eviction); treat Background Sync as an Android-only
  progressive enhancement.
- **Manager is online-only** — no offline support needed for the dashboard.
- **~~Damage categories manager-editable~~ → ~~Fixed flat taxonomy~~ → Component-first form**
  _(manager-editable retired 2026-06-22; the flat `damage_type` taxonomy was superseded 2026-06-27 by
  a component-first form)._ The damage list is a fixed structured form in `src/lib/damage-types.ts`,
  not a manager-editable table; the Kategorien CRUD page is retired. The reporter **first picks a
  component** (Aussenzelt = outer tent/flysheet, Innenzelt = inner tent, Vorzelt = porch/vestibule,
  Stangen = poles, Heringe = pegs/tent stakes, Sonstiges = other/miscellaneous), then one or more
  **damage modes** from that component's own submenu. Modes are a shared vocabulary
  (`stoff_gerissen`, `abspannung_gerissen`, `aufhaengung_gerissen`, `schnur_aussenzelt_gerissen`,
  `oese_kaputt`, `reissverschluss_defekt`, `boden_gerissen`, `verbogen`, `fehlt`, `sonstiges`); each
  component offers a curated subset (Innenzelt gained `reissverschluss_defekt` + `boden_gerissen` on
  2026-06-28). `fehlt` is exclusive (the whole part is gone); other modes multi-select; cord modes +
  `oese_kaputt` + Heringe-`fehlt` carry a count (Anzahl). **Every selected mode also carries an
  optional free-text comment and an optional photo, both per item** (2026-06-28; replaced the single
  per-submission photo and the Sonstiges-only text box); `sonstiges` is the one mode whose comment is
  **required**. Each selected `(component, damage_kind)` inserts **one `damages` row** (independently
  resolvable, with its own photo + `notes`), the German label snapshotted into `category_labels`
  (e.g. "Vorzelt – Stoff gerissen") and `component` + `damage_kind` + optional `quantity` in their own
  columns. The `melden` function hand-mirrors the valid `(component → modes)` map from
  `damage-types.ts` (Deno can't import from `src`) — keep in sync.
- **Per-tent status is anon-readable, scoped to one tent** _(new 2026-06-22, narrows the read
  boundary below)._ A scanner sees only the tent they scanned (status + open damages), via the
  token-gated `zelt-info` function — never the fleet, never photos/history.
- **UI language: German only.** No i18n framework needed; user-facing strings are German (code
  identifiers stay English). Managers author category names in German.
- **Stack: SvelteKit PWA + Supabase (free tier, EU region).** SvelteKit for an installable,
  offline-capable front end (small bundles, built-in service-worker support; deploy free to
  Cloudflare Pages / Vercel / Netlify). Supabase provides Postgres + Auth + Storage + an Edge
  Function for the guarded public submit endpoint, with Row-Level Security enforcing the
  two-audience boundary. The reporter outbox stays custom client code.
  - **Free-tier caveat:** Supabase pauses a free project after ~1 week of inactivity. This app is
    seasonal, so expect pauses between camps. **Mitigated** by the `zelt-keepalive` Cloudflare
    Worker (daily cron pings an anon `categories` read). It keeps the project from pausing on
    *inactivity*; it does not help if the project is manually paused or hits free-tier limits.
- **Multiple manager accounts** (not a shared passphrase): Supabase Auth email/password with
  **invite-only / closed signup** (public signup would void the access boundary). `resolved_by` on
  each resolution references the acting manager's user id.
- **Camp-grouped tent overview** _(new 2026-06-28)._ The reporter picker and manager grid group
  tents by an editable `camp_group` (this camp: 1–4 Leiter*innenzelter, 5 Venner*innenzelt, 6–11
  TN-Zelter; sections ordered by lowest tent number, a trailing "Nicht im Lager" bucket for the
  rest). Grouping is **DB-backed and manager-editable** (`camp_group` column, edited in the bulk
  `/verwalten/lager` form), not hard-coded — it survives camp-to-camp without a redeploy. Tents not
  in the camp are grayed by **reusing `out_of_service`** (the picker dims + disables them; the
  manager grid keeps them clickable so they can be flipped back) — accepting that "not in this camp"
  and "broken/stored" share one flag. The anon picker reads the layout from `tent_groups` and caches
  it to localStorage (offline → cache, cold cache → flat 1–20, so reporting is never blocked). The
  per-tent QR page (`/zelt/<id>/<token>`) is deliberately **not** gated on `out_of_service` — out of
  scope, since stored tents' QR codes aren't deployed in camp.
- **Reporter name + camp name on every report** _(new 2026-06-28)._ The reporter form **requires** a
  name (remembered in `localStorage`, so it's typed once per device) and stamps it onto every row
  (`reporter_name`) for accountability. Each report is also tagged with the **camp** it was filed at
  (`camp`, e.g. "Sola 26"), stamped **server-side** by `melden` from a `CURRENT_CAMP` function env so
  reporters never type it and can't spoof it — change camps with one `supabase secrets set`. Note this
  `camp` (which camp/season a report belongs to) is distinct from `camp_group` (which section a tent
  sits in within a camp). Late-synced offline reports get the camp current at sync time (acceptable —
  camps don't overlap). Shown to managers per damage card as `camp · von {name} · {date}`.

## Open decisions (deferrable — sensible defaults proposed)

- **Photo privacy policy:** EXIF/GPS stripped on upload, photos served via signed URLs. Confirm
  (defaults in parens): retention (keep until the tent is retired), who may view (any logged-in
  manager), and whether a CSV export of the log is needed for J+S records (defer to post-v1).
- **~~Seed damage categories~~ — resolved:** the damage list is a fixed taxonomy in
  `src/lib/damage-types.ts`, **component-first** (component → per-component damage modes), not a
  manager-seeded table. See the "Component-first form" decision above for the full matrix.

## Architecture-shaping requirements

These constraints are the reason this app is non-trivial. Honor them in any implementation:

- **Two-audience split, one backend.** Reporter and manager surfaces have opposite access models.
  Reporters reach the app via a per-tent QR (clean `/zelt/<id>`; the shared secret is bundled in the
  app, not the URL) — no login. They may read **only the one tent they scanned** (status + that tent's open
  damages, via `zelt-info`) and must never see the fleet, other tents, or photos/history. That QR
  is physically public, so treat the token as a low-secrecy capability: rate-limit server-side
  (both `melden` and `zelt-info`), give the manager a way to mark a report invalid, and keep the
  token rotatable. Managers authenticate and see everything.

- **The reporter outbox is the one genuinely hard part** — everything else is a small CRUD app, so
  size the rest accordingly.
  - A **Service Worker** caches the app shell so the UI loads instantly and survives brief drops.
  - Submit is **network-first**: on success, done; on failure/offline, write the report (JSON +
    photo Blob) to an **IndexedDB** outbox and confirm to the user that it is queued.
  - **Flush the outbox** on the next app-open-while-online and on the `online` event. Android may
    also use Background Sync; iOS cannot, so foreground flush is the baseline. Offline is rare and
    short, so that is acceptable — but a report left un-synced for ~7 days risks iOS eviction.
  - Don't trust `navigator.onLine` alone (it reports `true` on uplink-less camp wifi / captive
    portals); confirm reachability against the API before deciding a submit truly failed.
  - Generate `report_id` (UUID) on the client and have the server **upsert** by it, so a retried
    submit after a lost ack cannot create duplicate rows.

- **Append-only damage log, computed tent status.** Static inventory is separated from dynamic
  events to keep the schema light. A tent's status is *derived*: **Damaged** while any report is
  Open, otherwise **Active** — except **Out of Service**, which is a manual manager override and
  must be stored explicitly (it is not derivable). Resolving the *last* open report returns the
  tent to functional; resolving one of several leaves it Damaged. Never delete history — the
  long-term log is what lets the camp track structural degradation across seasons.

## Data model (from SRS §4)

- **Tents** — source of truth for inventory.
  - `tent_id` (PK, integer 1–20)
  - `status` (enum, computed: Active / Damaged / Out of Service)

- **Damages** — append-only event log, one row per report.
  - `report_id` (PK, UUID)
  - `tent_id` (FK → Tents)
  - `timestamp` (DateTime, UTC)
  - `damage_categories` (array of preset enum strings)
  - `notes` (text, nullable)
  - `photo_url` (string, nullable)
  - `status` (enum: Open / Resolved)
  - `resolution_timestamp` (DateTime, UTC, nullable)

**Corrections to apply when implementing the model:**

- **`timestamp` = client creation time** (`reported_at`). Offline reports may sync days later, so
  server-receipt time would corrupt the chronological log; optionally also keep a `received_at`.
- **Add fields the SRS omits:** `resolved_by` (matters once there is >1 manager) and
  `resolution_notes` (what was repaired/replaced — this is the lifespan-tracking payoff).
- **Spam handling without deletes:** since the log is append-only, add an `Invalid`/`Dismissed`
  state rather than deleting bogus reports.
- **`photo_url`:** store originals in object storage behind signed URLs; strip EXIF/GPS and cap
  size/type on upload (privacy — see Open decisions).
- **Tents:** seed a growable table rather than hard-coding the 1-20 range (tents get added and
  retired), and store the manual `Out of Service` flag separately from the computed status.

The full specification lives in `Spatz_Tent_Management_SRS.md`; treat it as the source of truth
for behavior **except where the Resolved decisions above override it**, and consult it before
implementing a feature.
