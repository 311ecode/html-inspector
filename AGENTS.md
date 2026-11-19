# AGENTS.md — html-inspector

I am **html-inspector**: the public distribution home of the HTML Inspector FAB
(formerly `menu-inspector@0.4.11`), its Chrome MV3 shell, and the generated static
registry that serves the embeddable `inspector.js` + `inspector.css`. I was
extracted from `~/dev/menu-dashboard` (DASH-290a/b) — that repo stays the
**consumer** of what I publish, not the source.

I live in `~/dev/` next to the other projects. Every folder under `~/dev` is its
own git repo with its own remote — commit to the repo a change belongs to, and
never mix repos in one commit.

**Repository state:** bootstrap. Only docs + tickets exist today; the import and
the first public release are the job of [`INSP-001`](tickets/new/INSP-001-bootstrap-public-distribution-repo.md).

Work is tracked as `INSP-…` tickets; [`tickets/README.md`](tickets/README.md) is
the index & handoff map — fresh agents start there. The shared, cross-project
rules are in [`../rules/`](../rules/README.md) and are linked, never restated:

| rule | owns |
|---|---|
| [`../rules/tickets.md`](../rules/tickets.md) | the ticket is the unit of work; write it before the work; states; numbering |
| [`../rules/agents.md`](../rules/agents.md) | fan-out / review / land, subagent briefs |
| [`../rules/git.md`](../rules/git.md) | the push bypass, the SSH-key invariant, the plaintext PAT seams |
| [`../rules/gui.md`](../rules/gui.md) | show it before you build it (anything user-visible) |
| [`../rules/e2e.md`](../rules/e2e.md) | evidence frames for UI steps |

## Definition of done — landed on `main`, pushed, ticket moved, release verified

A ticket is not done because code works on a branch. Done means all of:

1. **Merged to `main` in the main checkout** (`~/dev/html-inspector`). Worktrees
   are for doing the work, never for leaving it.
2. **Pushed to `origin/main`** — git-over-SSH uses the bypass in
   [`../rules/git.md`](../rules/git.md).
3. **The ticket moved** `tickets/new/<ID>-*.md` → `tickets/done/<ID>-*.md`, its
   `**Status:**` line rewritten with the landed facts, and its row in
   `tickets/README.md` updated.
   `tickets/new/` = open/planning · `tickets/done/` = landed and pushed ·
   `tickets/verify/` = landed + a real-world check outstanding (short-lived) ·
   `tickets/tombstone/` = deliberately parked, not a completion · `tickets/future/`
   = wanted eventually, deliberately unscheduled.
4. **Generated files regenerated, never hand-merged.** If a ticket touches
   `inspector/src/**`, the registry is rebuilt with
   `node scripts/publish-inspector.cjs --write`; if it touches the registry,
   `node tools/sync-vendor.mjs` refreshes `extension/vendor/`. Never edit a
   generated file.
5. **If the ticket ships a version:** tag `v<version>` exists, the GitHub Release
   carries both zips + `.sha256`, and `node scripts/check-inspector-registry.cjs
   --release v<version>` passes.

## Invariants (frozen — changing one needs its own ticket)

- **`dist/` is never committed.** Release zips are GitHub Release assets; the
  build output stays gitignored. Build history must not grow for artifacts.
- **The registry is committed *text* and append-only.** `registry/inspector/<ver>/`
  is immutable once published (sha256 in `manifest.json` + `index.json`); the
  floating `registry/inspector/v1/` always mirrors the newest published version.
  Old versions are not pruned without a ticket (served embeds pin them).
- **`extension/vendor/` is generated** from `registry/inspector/v1/` by
  `tools/sync-vendor.mjs` — the drift guard compares them byte-for-byte.
- **Version is explicit, never derived from git.** `package.json#version` is the
  single source for the inspector package; the extension's `manifest.json`
  version follows the documented bump rule. `git rev-list --count` is banned
  here (the counter restarts in a new repo — the reason this repo exists).
- **Build/test without a dashboard.** No code in this repo may require a running
  `menu-dashboard` process, its fixtures, or its absolute paths.
- **Pushes go over SSH; the PAT is only for API calls** (repo create, Release
  assets, Pages). Token seams are documented in [`../rules/git.md`](../rules/git.md);
  a token never goes to argv, stdout, a committed file, or a log. The classic
  repo-creating PAT lives in the shell state as `GITHUB_TEST_TOKEN`; the
  fine-grained `~/dev/.gh-token` and `/tmp/env/GITHUB_TEST_TOKEN` **cannot create
  repositories** (verified: `POST /user/repos` → 403).

## Build / test (the post-import contract — exact commands live in INSP-001)

```bash
npm test                        # inspector protocol + ui suites, no dashboard
node scripts/publish-inspector.cjs            # --check is the default
node scripts/check-inspector-registry.cjs --immutable --determinism
node tools/sync-vendor.mjs --check
node scripts/release.cjs        # bump → build zips → tag → Release → verify
```
