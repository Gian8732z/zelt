# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

**Deployed and live in the cloud.** SvelteKit (Svelte 5 runes, TypeScript, SPA via
`adapter-static`) + Supabase (Postgres, Auth, Storage, one Edge Function), German-only UI.
`npm run check` and `npm run build` pass. The reporter form, manager login → dashboard → tent
detail, and the `melden` function (token gate, insert, idempotency) were all driven in a real
browser against the *local* stack with zero console errors; demo data is seeded (tents 5/7/12
damaged). The app still degrades to a "not configured" notice when env is absent.

**Production (deployed 2026-06-22):**
- **App:** https://zelt.pages.dev (Cloudflare Pages, project `zelt`, direct-upload deploy)
- **Supabase:** cloud project `kzlmbkadbzfhqzhaupiu` ("Zelt", eu-central-1). Schema pushed,
  `melden` function deployed, `REPORTER_TOKEN` secret set.
- **Reporter URL / QR target:** `https://zelt.pages.dev/melden/aY0CHNgDt6u_DUdRhyGuyXJRQnmP0vfC`
  (QR images at repo root: `zelt-reporter-qr.{png,svg}`).
- **Manager login:** `gian.ledergerber@gmail.com` at `/verwalten/anmelden`.
- **Keep-alive:** Cloudflare Worker `zelt-keepalive` (cron `0 6 * * *`) pings an anon `categories`
  read daily so the seasonal free-tier Supabase project doesn't auto-pause. Source in `keepalive/`.

**Not yet done:** the photo and offline-sync paths are written but not yet exercised in a browser
**against the cloud**; no tests; not a git repo. See "Status — what's left" below.

`README.md` holds both runbooks (cloud and local). Local dev runs on **Colima + local Supabase**;
the cloud values live in `.env.production` (used by `npm run build`), local in `.env` — see Commands.

### Commands

- `npm run dev` — dev server (http://localhost:5173). Uses `.env` → **local** Supabase.
- `npm run build` — static SPA into `build/`. Production mode loads `.env.production` → **cloud**
  Supabase (`kzlmbkadbzfhqzhaupiu`). Both env files are gitignored; they hold only the public
  anon key.
- `npm run check` — `svelte-check` type checking (run this after edits; it's the gate)
- Local backend: `colima start && supabase start` (stop with `supabase stop` then `colima stop`).
  `supabase status` prints local URLs/keys; Studio at http://localhost:54323. Local manager demo
  login `materialwart@example.com` / `zelt-demo-1234`; local reporter URL `/melden/demo-token`
  (token set in `supabase/functions/.env`).
- **Cloud deploy** (CLI is logged in + linked to `kzlmbkadbzfhqzhaupiu`):
  - Schema: `supabase db push` (uses a temporary login role from the access token — no DB password
    needed). Function: `supabase functions deploy melden`. Secret: `supabase secrets set REPORTER_TOKEN=…`.
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

- `src/lib/` — `supabase.ts` (client, null until configured), `config.ts` (dynamic public env),
  `types.ts`, `categories.ts` (cached for offline), `photo.ts` (canvas downscale + EXIF strip),
  `outbox.ts` (IndexedDB queue via `idb`), `submit.ts` (network-first submit + `flushOutbox`).
- `src/routes/melden/[token]/` — reporter form. `src/routes/verwalten/` — manager area
  (`+layout.svelte` auth guard, `anmelden/` login, `+page` fleet grid, `zelt/[id]/` detail,
  `kategorien/` CRUD). Outbox flush is wired globally in the root `+layout.svelte`.
- `supabase/migrations/0001_init.sql` — schema, RLS, `tent_overview` view, seeds, photo bucket.
- `supabase/functions/melden/` — guarded public submit (Deno): token gate, rate limit, idempotent
  upsert by `report_id`, photo to Storage. `verify_jwt = false` (token is the gate).

Key invariant: anonymous reporters never touch `damages` directly — writes go through the
`melden` function (service role). Only `categories` (active rows) are anon-readable.

### Status — what's left (as of 2026-06-22)

- **✅ Deployed to production** (this session): cloud Supabase + Cloudflare Pages + real
  `REPORTER_TOKEN` + first manager account + QR generated + keep-alive Worker. See "Current state".
  Smoke-tested via curl: app routes (incl. the reporter deep link via the `_redirects` SPA
  fallback) and the `melden` function (OPTIONS 200, wrong-token 401) all respond correctly.
- **Verify in a browser against the cloud (built but unproven):** (1) the offline outbox — go
  offline in DevTools, submit, return online, confirm it syncs; (2) the photo path end-to-end —
  client EXIF-strip → function upload → manager signed-URL view. Still the two riskiest "written
  but unrun" paths; the curl smoke test does not cover them.
- **Cloud cleanup before a real camp:** the cloud DB still has the demo seed (open damage on tents
  5/7/12) — clear it for a clean production start. Consider rotating `REPORTER_TOKEN` if the current
  one has been shared anywhere insecure, and pointing the QR at a redirect you control so future
  rotations don't require reprinting.
- **Polish / nice-to-have:** PNG maskable icons (only an SVG today); a few tests (status
  computation, idempotency, outbox); manager-created reports; CSV export for J+S. None block the
  core flows.

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
- **Single shared secret URL** for reporters; the user still picks the tent (1-20) manually from
  the grid. No per-tent links. Plan token rotation by pointing the QR at a redirect you control.
- **Mixed iOS + Android** reporter devices → design the sync mechanism to the iOS floor
  (no Background Sync API, ~7-day IndexedDB eviction); treat Background Sync as an Android-only
  progressive enhancement.
- **Manager is online-only** — no offline support needed for the dashboard.
- **Damage categories are manager-editable** (CRUD in the dashboard), not a fixed enum. Give each
  category a stable id and snapshot its label onto each report at submit time, so a later rename or
  delete doesn't rewrite history. Reporters must read the current list to render the form — a small,
  non-sensitive read exception to "write-only"; cache it (Service Worker / IndexedDB) so the form
  still works offline.
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

## Open decisions (deferrable — sensible defaults proposed)

- **Photo privacy policy:** EXIF/GPS stripped on upload, photos served via signed URLs. Confirm
  (defaults in parens): retention (keep until the tent is retired), who may view (any logged-in
  manager), and whether a CSV export of the log is needed for J+S records (defer to post-v1).
- **Seed damage categories:** managers can edit them, so v1 ships a few German defaults
  (e.g. Gestänge/Stangen, Heringe, Reissverschluss, Zeltbahn-Riss, Nähte, fehlendes Teil) for them
  to adjust. Confirm or replace this starter list.

## Architecture-shaping requirements

These constraints are the reason this app is non-trivial. Honor them in any implementation:

- **Two-audience split, one backend.** Reporter and manager surfaces have opposite access models.
  Reporters reach the app via a single *shared secret URL* (a QR code on material boxes / tent
  bags) — no login, and they must never be able to read fleet data or other tents' status. That
  QR is physically public, so treat the URL as a low-secrecy capability: rate-limit submissions
  server-side, give the manager a way to mark a report invalid, and keep the token rotatable via
  a redirect. Managers authenticate and see everything.

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
