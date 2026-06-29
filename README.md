# Zelt-Verwaltung

A PWA for tracking damage on a fleet of 20 modular Spatz tents (Swiss scout camps / J+S material).
Two surfaces, one Supabase backend:

- **Reporter** (`/melden/<token>`) — anonymous, write-only, works offline. Reached via a secret
  QR-code URL. Picks a tent (1–20), checks damage categories, adds an optional note and photo, and
  submits. Online submits go straight through; offline submits (including the photo) queue in
  IndexedDB and sync automatically when the connection returns.
- **Manager** (`/verwalten`) — authenticated. Fleet grid with computed status, per-tent damage
  history, resolve / mark-invalid workflow, out-of-service toggle, and category management.

Built with **SvelteKit** (SPA, `adapter-static`) + **Supabase** (Postgres, Auth, Storage, Edge
Function), German UI.

## Local development

```bash
npm install
cp .env.example .env   # fill in once you have a Supabase project (below)
npm run dev            # http://localhost:5173
```

The app runs without Supabase — manager/reporter pages just show a "not configured" notice until
`.env` is filled in.

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build → `build/` (static SPA) |
| `npm run preview` | Serve the production build locally |
| `npm run check` | `svelte-check` type checking |

## Run it fully locally (Colima)

A self-contained local stack — no cloud account. Requires Homebrew.

```bash
brew install colima docker supabase/tap/supabase
colima start --cpu 4 --memory 6     # container runtime (one-time small VM boot)
supabase start                      # Postgres/Auth/Storage/Functions + applies migrations
npm run dev                         # http://localhost:5173
```

Local URLs / credentials:

- Reporter (per-tent): http://localhost:5173/zelt/5 · picker fallback: http://localhost:5173/melden
- Manager: http://localhost:5173/verwalten → `materialwart@example.com` / `zelt-demo-1234`
- Studio (DB/Auth UI): http://localhost:54323 · Mailpit (email): http://localhost:54324

Notes:

- `config.toml` sets `[analytics] enabled = false` — its `vector` container can't bind-mount the
  Docker socket under Colima, which otherwise aborts `supabase start`.
- Copy the local URL + anon key from `supabase status` into `.env` (already done in this copy).
  `.env` also holds `PUBLIC_REPORTER_TOKEN` (bundled into the app; locally `demo-token`). The
  `melden`/`zelt-info` functions read `supabase/functions/.env` (`REPORTER_TOKEN=demo-token` — must
  match `PUBLIC_REPORTER_TOKEN`; plus `CURRENT_CAMP="Sola 26"`, stamped onto new reports).
- Create a manager user from the CLI:
  ```bash
  eval "$(supabase status -o env)"
  curl -s -X POST "$API_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H 'content-type: application/json' \
    -d '{"email":"you@example.com","password":"a-password","email_confirm":true}'
  ```
- Stop everything: `supabase stop` (keeps data) and `colima stop`.

## Supabase setup (one-time)

You need a free Supabase project. Everything below is from the [Supabase CLI](https://supabase.com/docs/guides/cli)
unless noted.

1. **Create the project** at supabase.com (pick an EU region for the photos). Note the project ref.
2. **Client env** — from *Project Settings → API*, copy the URL and the `anon` public key into `.env`
   (production values go in `.env.production`):
   ```
   PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"
   PUBLIC_SUPABASE_ANON_KEY="<anon-key>"
   PUBLIC_REPORTER_TOKEN="<same-as-the-REPORTER_TOKEN-secret-below>"
   ```
3. **Apply the schema** (tables, RLS, the `tent_overview` view, the `damage-photos` bucket, seed
   tents 1–20 and the default German categories):
   ```bash
   supabase link --project-ref <ref>
   supabase db push        # applies supabase/migrations/0001_init.sql
   ```
   (Or paste the migration into the SQL editor.)
4. **Deploy the reporter endpoints** and set the shared secret:
   ```bash
   supabase functions deploy melden     # public submit (one row per damage item)
   supabase functions deploy zelt-info  # public single-tent status read
   supabase secrets set REPORTER_TOKEN="<a-long-random-string>"   # must equal PUBLIC_REPORTER_TOKEN
   supabase secrets set CURRENT_CAMP="Sola 26"                    # stamped onto new reports; per camp
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically. `verify_jwt = false`
   is set for both in `supabase/config.toml` — they are public but gated by `REPORTER_TOKEN`.
5. **Create manager accounts** (invite-only — do NOT enable public signup): *Authentication → Users
   → Add user* for each Materialwart.
6. **Per-tent QR codes** — each tent gets its own code encoding a clean, token-less URL:
   ```
   https://<your-app-domain>/zelt/<n>     # n = 1..20
   ```
   The shared secret is bundled into the app (`PUBLIC_REPORTER_TOKEN`), not the URL. Generate all 20
   at once and print one per tent bag:
   ```bash
   npm i -D qrcode
   BASE_URL=https://<your-app-domain> node scripts/generate-tent-qr.mjs
   ```
   The single shared link `https://<your-app-domain>/melden` still works as a fallback (a tent picker
   that routes into the per-tent page). Because the token is no longer in the printed URL, rotating it
   (change both `REPORTER_TOKEN` and `PUBLIC_REPORTER_TOKEN`, then redeploy) **does not** require
   reprinting the QRs.

## Deployment

`npm run build` emits a static site in `build/`. Deploy it to any static host (Cloudflare Pages,
Netlify, Vercel). Set `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, and `PUBLIC_REPORTER_TOKEN`
as build env vars there (or via `.env.production` for the bundled direct-upload deploy).

## Notes & caveats

- **Free-tier pause:** Supabase pauses an inactive free project after ~1 week. Usage is seasonal,
  so unpause before a camp (or add a small keep-alive ping).
- **Photo privacy:** photos are downscaled and re-encoded client-side (`src/lib/photo.ts`), which
  strips EXIF/GPS before upload — important for photos taken at a children's camp. They live in a
  private bucket and are shown to managers via short-lived signed URLs.
- **Offline cold start:** the PWA must be opened online once so the Service Worker can cache the
  shell; only then will the reporter URL load offline.
- **iOS:** no Background Sync API, so the offline queue flushes in the foreground (on app open and
  on the `online` event). Reports left unsynced for ~7 days risk IndexedDB eviction.

See `CLAUDE.md` for the architecture rationale and the decisions that shaped this build.
