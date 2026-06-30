---
description: On-ramp a feature through the Zelt pipeline — branch off fresh main, build (single-stream or agent-factory fan-out), gate locally, open a PR, /code-review, and drive it to tiered merge.
argument-hint: <short description of the feature or fix>
---

You are running the Zelt **`/feature`** on-ramp. Goal: take the request in `$ARGUMENTS` from idea to
merged-and-deployed through the PR pipeline, choosing single-stream vs. agent-factory fan-out, and
respecting the tiered code-owner gate. The pipeline is the only deploy path — never `wrangler`/
`supabase` deploy from the laptop.

If `$ARGUMENTS` is empty, ask what the feature is before doing anything else.

## 1. Branch off fresh `main`
- `git fetch origin -q`, then create an isolated worktree on a new branch off `origin/main`
  (`EnterWorktree`, or `git worktree add` if already in a pinned worktree). Name the branch for the
  work, e.g. `feat/<slug>` or `fix/<slug>`.
- Never build on `main` or on a stale branch.

## 2. Plan and decide coupling
- Plan the change. Then judge: does it split into **independent slices** (separate files/features that
  don't depend on each other's edits)?
  - **Coupled / small** → single-stream: implement it yourself on this branch.
  - **Independent slices** → **agent factory**: spawn one subagent per slice, each in its **own
    worktree**, each opening its **own PR**. Coordinate, don't let them edit the same files. Then run
    steps 3–6 per PR.

## 3. Implement, then gate locally
- Make the change. Match surrounding code style (Svelte 5 runes, TS, German UI strings).
- Run the local gate before opening a PR: `npm run check` && `npm test` (Vitest).
  - Do **not** run Playwright locally — it needs the ephemeral Supabase boot; CI owns E2E.
- If you added logic that the Vitest suite should cover (status/severity/grouping/validation), add a
  test. Keep it green.

## 4. Open the PR
- Commit (end the message with the `Co-Authored-By` trailer) and push.
- `gh pr create` with a clear title + body (what changed, why, how verified). End the body with the
  Claude Code generated-with footer.

## 5. Classify risk against CODEOWNERS — this drives merge mode
Diff the PR's changed files against `.github/CODEOWNERS` using **`scripts/codeowner-match.mjs`** —
the **single source of truth** for the matcher, shared with the CI `codeowner-gate` job (it dynamic-
imports the same script), so local and CI can never disagree. The matcher semantics:
- A pattern `/foo/` (trailing slash) matches a file that equals `foo` or starts with `foo/`.
- A pattern `/foo/bar.ts` (exact file) matches that file or anything under `foo/bar.ts/`.
- Strip the leading `/` before comparing; compare against repo-root-relative paths.

Quick check:
```
gh pr diff --name-only | node scripts/codeowner-match.mjs
```
It prints one `HIGH-RISK: <file> (owner: @x)` line per owned file, or `No high-risk paths touched.`
(it's a classifier — always exits 0).

- **No high-risk hit (low-risk PR):** run `/code-review`, address findings, then
  `gh pr merge --auto --squash`. With the merge queue enabled, `--auto` routes the PR **through the
  queue** (which re-runs the unit lane on the queued merge commit) rather than merging directly;
  behavior is otherwise the same — it lands once `gate` + `codeowner-gate` are green.
- **High-risk hit (CODEOWNERS path touched):** do **NOT** auto-merge. `gh pr edit --add-reviewer
  Gian8732z`, run `/code-review`, then **stop and tell Gian** the PR needs his approval +
  admin-merge (sole owner can't self-approve — that's the documented escape hatch). Name which
  high-risk paths it touched.

## 6. Drive-to-merge tail
- Watch CI: `gh pr checks --watch` (or poll `gh pr checks`). Report `gate` and `codeowner-gate`
  results in your own words.
- On merge, confirm the push-to-`main` `deploy-prod` run goes green (migrate + functions to staging
  & prod, build, CF Pages prod): `gh run list --branch main -L 3`.
- Report the deployed result. If anything fails, surface the failing job's log, don't silently retry.

## Notes
- Three backends: ephemeral-local Supabase (CI test gate) / staging (backs the CF preview) / prod
  (on merge to `main`). You don't manage these by hand.
- Function secrets (`REPORTER_TOKEN`/`CURRENT_CAMP`) are hand-managed, never in CI/PRs.
