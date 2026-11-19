# AGENTS.md — html-inspector

I am **html-inspector**: the public distribution home of the HTML Inspector FAB
(formerly `menu-inspector@0.4.11`), its Chrome MV3 shell, and the generated static
registry that serves the embeddable `inspector.js` + `inspector.css`. I was
extracted from `~/dev/menu-dashboard` (DASH-290a/b) — that repo stays the
**consumer** of what I publish, not the source.

I live in `~/dev/` next to the other projects. Every folder under `~/dev` is its
own git repo with its own remote — commit to the repo a change belongs to, and
never mix repos in one commit.

**Repository state:** live. The inspector + extension were imported from
`menu-dashboard` on 2026-11-19 and the first public release is cut:
tag `inspector-v0.4.11`, Release assets for the Chrome zip + the embeddable zip,
registry served from GitHub Pages. [`INSP-001`](tickets/done/INSP-001-bootstrap-public-distribution-repo.md)
is the bootstrap record; `menu-dashboard/tickets/new/DASH-600-*` is the consumer
rewire on the dashboard side.

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
   `node extension/tools/sync-vendor.mjs` refreshes `extension/vendor/`. Never edit a
   generated file.
5. **If the ticket ships a version:** tag `inspector-v<version>` exists, the GitHub Release
   carries both zips + `.sha256`, and `node scripts/check-inspector-registry.cjs
   --release inspector-v<version>` passes.

## Invariants (frozen — changing one needs its own ticket)

- **`dist/` is never committed.** Release zips are GitHub Release assets; the
  build output stays gitignored. Build history must not grow for artifacts.
- **The registry is committed *text* and append-only.** `registry/inspector/<ver>/`
  is immutable once published (sha256 in `manifest.json` + `index.json`); the
  floating `registry/inspector/v1/` always mirrors the newest published version.
  Old versions are not pruned without a ticket (served embeds pin them).
- **`extension/vendor/` is generated** from `registry/inspector/v1/` by
  `tools/sync-vendor.mjs` — the drift guard compares them byte-for-byte.
- **One explicit version, never derived from git.** `package.json#version` is
  the single source: the release stamps it into `inspector/package.json` and
  `extension/manifest.json`, and tags `inspector-v<version>`. Asset names:
  `html-inspector-extension-<version>.zip` + `html-inspector-embed-<version>.zip`.
  `git rev-list --count` is banned here (the counter restarts in a new repo —
  the reason this repo exists).
- **Build/test without a dashboard.** No code in this repo may require a running
  `menu-dashboard` process, its fixtures, or its absolute paths.
- **Dev tools are opt-in, never public.** The distribution sheet exposes only the drag hint,
  Paste inspection and the collected snapshots. The Inspect/Append switches appear only when the
  page asks for them — `?dev=1` or `data-html-inspector-dev="1"` on `<html>`/the embed `<script>`
  (INSP-007). There is no public switch and the bundle never rewrites the URL or reloads the page.
- **Pushes go over SSH; the PAT is only for API calls** (repo create, Release
  assets, Pages). Token seams are documented in [`../rules/git.md`](../rules/git.md);
  a token never goes to argv, stdout, a committed file, or a log. The classic
  repo-creating PAT lives in the shell state as `GITHUB_TEST_TOKEN`; the
  fine-grained `~/dev/.gh-token` and `/tmp/env/GITHUB_TEST_TOKEN` **cannot create
  repositories** (verified: `POST /user/repos` → 403).

## Build / test

```bash
npm ci
npm test                                      # protocol + artifact + site-bridge + registry + vendor (no dashboard, no browser)
npm run test:ui                               # Playwright fixture-page suite (ports 8091/8093)
npm run test:e2e                              # INSP-002: the HTML embed on a plain third-party page +
                                              # the unpacked extension in Chromium (hermetic, headless)
npm run test:e2e:live                         # also proves the PUBLISHED distribution (Pages sha256 +
                                              # the released extension zip) — network, not CI
npm run docs                                  # INSP-003: regenerate docs/index.html + frames from a live browser run
node scripts/publish-inspector.cjs            # --check is the default; --write regenerates registry/
node scripts/check-inspector-registry.cjs --immutable --determinism
node extension/tools/sync-vendor.mjs --check
```

## Release — from this side only

```bash
# token: the classic PAT (repo scope) in the shell state; never commit it
GITHUB_TEST_TOKEN=<classic PAT> node scripts/release.cjs            # current version
GITHUB_TEST_TOKEN=<classic PAT> node scripts/release.cjs --bump     # +1 inspector & extension patch
GITHUB_TEST_TOKEN=<classic PAT> node scripts/release.cjs --dry-run  # build only
GITHUB_TEST_TOKEN=<classic PAT> node scripts/release.cjs --pages    # also (re)enable Pages
```

Asset names are clean and versioned (`html-inspector-extension-<version>.zip`,
`html-inspector-embed-<version>.zip` + `.sha256` siblings); the release notes are
generated from the actual built files (sizes + sha256 + embed snippet + install
steps), never placeholders.
The script regenerates the registry, runs every gate, builds both zips into
`dist/` (gitignored), commits the version bump, tags `inspector-v<version>`,
pushes `main` + tag over SSH, creates the Release, uploads the zips (skipping an
identical asset, refusing to overwrite a different one) and verifies via the API.
**CI never pushes and never releases** — `.github/workflows/ci.yml` only verifies.

Registry serving (GitHub Pages, enabled 2026-11-19):

```
https://311ecode.github.io/html-inspector/registry/inspector/v1/inspector.js
https://311ecode.github.io/html-inspector/registry/inspector/v1/inspector.css
https://311ecode.github.io/html-inspector/registry/index.json
```

Releases: https://github.com/311ecode/html-inspector/releases
