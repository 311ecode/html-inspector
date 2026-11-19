# INSP-001 — bootstrap the public distribution repo: import inspector + extension, release both zips from GitHub Releases

**Project:** html-inspector · **Status:** DONE (landed 2026-11-19) · **Created:** 2026-11-19 ·
**Origin:** extracted from `~/dev/menu-dashboard` — inspector `menu-inspector@0.4.11`, DASH-290a/b ·
**Related:** `~/dev/menu-dashboard/tickets/` (DASH-596 "the served gate report carries the inspector FAB"),
`scripts/publish-inspector.cjs`, `scripts/check-inspector-registry.cjs`, `lib/extension-artifact.js` ·
**Environment facts verified 2026-11-19** (see §10): git-over-SSH green, classic PAT in state carries
`repo, delete_repo`, `POST /user/repos` + push + `DELETE` proven live.

## Summary

Create `311ecode/html-inspector` (public) as the single home of the HTML Inspector: the
`inspector/` source (currently `menu-inspector@0.4.11`), the Chrome MV3 `extension/`, the generated
static `registry/`, the tooling that regenerates/verifies the registry, and the release flow that
attaches **two zips** (extension + embeddable bundle) to a GitHub Release. `dist/` is never
committed, so build artifacts never enter the commit history. `menu-dashboard` keeps serving the
FAB and becomes a **consumer** of this repo (its own DASH ticket, §8).

**"Now only":** no history migration. One import commit of the current tree. Registry versions
`0.1.0 … 0.4.10` and the extension's `git rev-list` version counter stay behind in `menu-dashboard`.

## 0. Landed — 2026-11-19

| Fact | Value |
|---|---|
| Repo | https://github.com/311ecode/html-inspector (public, `main` = the release commit) |
| Release | https://github.com/311ecode/html-inspector/releases/tag/inspector-v0.4.11 |
| Extension asset | `html-inspector-0.1.23-86c7316.zip` — 45,132 B, `sha256:dc9bb26be35a8f1c99b2c26e899654735ae5da010714fde7088aaa72ace2cfb5` |
| Embed asset | `html-inspector-embed-0.4.11.zip` — 33,204 B, `sha256:1d990617fe817a3ef22375da638e0749e58ce9ea654ebff64227fe80a7a898a2` |
| Registry (Pages) | `https://311ecode.github.io/html-inspector/registry/index.json` (+ `inspector/v1/`) — served `inspector.js` sha256 identical to the committed file |
| CI | `.github/workflows/ci.yml` — **verify-only** (never pushes/releases); green on `e68594d` (`verify` job: registry drift/immutable/determinism, vendor, protocol+artifact+site-bridge, binary guard, version-derivation guard; `ui` job: Playwright fixture suite) |
| Consumer handoff | `menu-dashboard/tickets/new/DASH-600-rewire-served-fab-to-public-inspector-repo.md` (filed + pushed) |

What actually landed vs this ticket's plan:

- **No history migration** — two import commits, current tree only (`registry/` = 0.4.11 + `v1/`).
- **Versions explicit** — `package.json` 0.4.11, `extension/manifest.json` 0.1.23; `lib/artifact.js` replaces
  the dashboard's `lib/extension-artifact.js` (clean rewrite: deterministic zip only, no `app-watch`,
  no git-history derivation).
- **Release tag is `inspector-v<version>`** (the verifier's contract), not plain `v<version>`.
- **`scripts/release.cjs`** implements the whole flow from this side (`--bump`, `--version`, `--dry-run`,
  `--pages`); CI only verifies.
- **Pages enabled** on `main` (serves the registry tree).
- **Not ported (deferred, tracked as follow-ups):** the dashboard's `tests/unit/extension-artifact.test.js`
  and `tests/unit/extension-site-bridge.test.js` in their dashboard shape — the site-bridge textual
  guards WERE ported (`test/extension-site-bridge.test.js`), the artifact builder is covered by
  `test/artifact.test.js`; the dashboard's own copy stays for its panel until DASH-600 prunes it.

## 1. Frozen decisions (user, 2026-11-19 — do not re-litigate)

1. **One repo** holds `inspector/` + `extension/` + `registry/` + tooling. Splitting them
   reintroduces the vendor-drift problem `extension/vendor/` exists to prevent.
2. **No history migration.** The new repo starts at one import commit; no `filter-repo`, no
   flattened paths, no `inspector-v*` tag archaeology (there are **zero** such tags today).
3. **Explicit versions:** `package.json#version = 0.4.11`; extension `manifest.json = 0.1.23`
   (monotonic after `0.1.22` — Chrome/Web Store must never see a lower version). The
   `git rev-list --count HEAD -- extension registry/inspector/v1` derivation is **deleted**.
4. **Zips are GitHub Release assets, never committed.** `dist/` stays gitignored. Committed
   growth is text-only: the versioned `registry/` (≈124 KB per version, delta-compressed by git)
   and the small vendored extension copy.
5. **Registry ships current-only:** `registry/inspector/0.4.11/` + `registry/inspector/v1/`
   (1.6 MB / 17 versions → ≈244 KB / 1 + floating). Old versions are not copied.
6. **Push over SSH** (host keys already on the account); the PAT is used **only** for API calls
   (repo create, Release assets, Pages enable).
7. **No dashboard coupling:** the imported test suites must run without a `menu-dashboard`
   process, its fixtures or its absolute paths.

## 2. Target repo layout

```
html-inspector/
├── package.json                  # version = 0.4.11 (single source)
├── README.md  AGENTS.md  LICENSE  .gitignore
├── inspector/                    # SOURCE OF TRUTH (~304K)
│   ├── package.json
│   ├── inspector.js              # readable, unminified single-file bundle
│   ├── src/*.js                  # concatenated in fixed order by the publish script
│   ├── src/inspector.scss        # self-contained (all vars inlined; sass)
│   ├── test/{ui.spec.js,protocol.test.js}
│   └── fixtures/page.html
├── extension/                    # Chrome MV3 shell (~172K)
│   ├── manifest.json             # version 0.1.23
│   ├── vendor/{inspector.js,inspector.css}   # GENERATED from registry v1
│   └── tools/sync-vendor.mjs
├── registry/                     # committed static distribution (text)
│   ├── index.json
│   └── inspector/{0.4.11/, v1/}  # manifest.json + inspector.js + inspector.css each
├── scripts/
│   ├── publish-inspector.cjs     # registry generator/verifier (from dashboard)
│   ├── check-inspector-registry.cjs
│   └── release.cjs               # NEW — §5
├── lib/extension-artifact.js     # deterministic zip builder (from dashboard)
├── tests/                        # moved: extension-artifact, extension-site-bridge,
│                                 #        extension-capture.spec, inspector.spec
└── dist/                         # gitignored — zips only
```

## 3. Import list (verbatim from `~/dev/menu-dashboard`)

| Path | Action |
|---|---|
| `inspector/` | copy as-is; replace version derivation; genericize fixture literals (§7) |
| `extension/` | copy as-is; drop any dashboard URL/branding that remains; `manifest.json` → 0.1.23 |
| `registry/inspector/0.4.11/`, `registry/inspector/v1/`, `registry/index.json` | copy, then **regenerate in-repo** (§4) |
| `scripts/publish-inspector.cjs` | copy; remove the obsolete `styles/` sass load path; keep `--check` default |
| `scripts/check-inspector-registry.cjs` | copy as-is (`--immutable`, `--determinism`, `--release <tag>`) |
| `lib/extension-artifact.js` | copy; **drop** `require('./app-watch')` + `builtAge: humanAge(...)` (the one dashboard coupling) and the HTTP routes |
| `tests/unit/extension-artifact.test.js`, `tests/unit/extension-site-bridge.test.js` | move |
| `tests/extension-capture.spec.js`, `tests/inspector.spec.js` | move; paths/ports (8091/8093) stay |
| `playwright.config.js` inspector project | move (only the inspector projects) |
| root `package.json` scripts: `test:inspector*`, `test:extension*`, `publish-inspector*` | move the inspector subset |
| `.github/workflows/ci.yml` gates (§6) | port as this repo's CI |
| `extension/tools/sync-vendor.mjs` | copy as-is |

**Stays in `menu-dashboard`:** `lib/extension-routes.js`, extension download/panel routes,
`scripts/check-inspector-fleet.mjs`, `e2e-flipbook/**` contract tests + mirror, dashboard-only specs,
`.github/workflows/ci.yml` fleet jobs.

## 4. Registry contract (unchanged semantics, new home)

- Generator: `node scripts/publish-inspector.cjs --write` — concatenates `inspector/src/*.js` in
  fixed order, compiles `inspector/src/inspector.scss`, writes
  `registry/inspector/<version>/{inspector.js,inspector.css,manifest.json}` + `registry/index.json`
  (per-file `sha256` + bytes), and the floating `v1/` copy.
- `publishedAt` = `git log -1 --format=%cI -- inspector/src` (contractual: the **source's commit
  date**, never wall clock). In the fresh repo the import commit is that date — regenerate after
  the import commit so `--check` passes by construction.
- `node scripts/publish-inspector.cjs` (no flag) = `--check`: fails if the committed registry does
  not match what the current sources generate.
- `node scripts/check-inspector-registry.cjs --immutable` = every published version is
  byte-identical to its manifest; `--determinism` = regeneration is byte-stable; `--release <tag>`
  = the tag's version exists, is immutable, and equals `index.json.latest`.
- **Never hand-edit `registry/`.** It is generated output that happens to be committed.

## 5. Release flow — `scripts/release.cjs` (the new code, keep it small)

Contract for the script (`node scripts/release.cjs [--version X.Y.Z] [--dry-run]`):

1. **Preflight** — clean tree, on `main`; `publish-inspector.cjs --check`;
   `check-inspector-registry.cjs --immutable --determinism`; `sync-vendor.mjs --check`.
2. **Bump** — `package.json#version` (default: patch bump of current; `--version` overrides) and
   extension `manifest.json` per rule: inspector `X.Y.Z` → extension patch+1 from its own line.
3. **Regenerate** — `publish-inspector.cjs --write`, then `sync-vendor.mjs` (vendor from `v1/`).
4. **Build** — via `lib/extension-artifact.js` into `dist/`:
   - extension: the builder's own name, `html-inspector-<extver>-<shortSha>.zip` — from
     `buildArtifact().file` (verified live: `html-inspector-0.1.22-e0c18ff.zip`, 45,120 B;
     contains `build.json`); do not invent a second name
   - embed: `html-inspector-embed-<ver>.zip` — ours to name (verified live:
     `html-inspector-embed-0.4.11.zip`, 33,204 B, `inspector.js` + `inspector.css`)
   - one `.sha256` per zip. Zips must be **deterministic** (fixed mtimes/order; reuse the existing
     builder's `buildZip`/`buildHash`; verified: building twice gives identical bytes).
5. **Commit + tag** — single commit of the version bump + regenerated registry; tag `inspector-v<version>`.
6. **Push** — `git push origin main` and `git push origin v<version>` over SSH
   ([`../rules/git.md`](../../rules/git.md) bypass). No force-push.
7. **Publish assets** — create the GitHub Release for the tag and upload both zips + hashes.
   Token: `GITHUB_TEST_TOKEN` from the shell state (classic PAT with `repo`); never in argv — read
   from the environment, `curl --data-binary @file`. Idempotency: if a same-named asset already
   exists on the release with the same sha256, skip (port the content-hash skip from
   `~/bash.sh/vcs/git/github/upload_github_release/`).
8. **Verify** — re-read the release via API (`assets[].name,size,digest`), then
   `check-inspector-registry.cjs --release v<version>`; print a summary (version, tag, asset names,
   sha256s, URLs).

Asset names carry versions on purpose: two zips on one release, and a same-named re-upload would
silently lose provenance.

## 6. CI contract (`.github/workflows/ci.yml` in this repo)

Port these gates, same semantics, from `menu-dashboard/.github/workflows/ci.yml`:

| job | command |
|---|---|
| `inspector-protocol` | `npm run test:inspector:protocol` |
| `inspector-ui` | `npm run test:inspector:ui` (Playwright, ports 8091/8093) |
| `registry-drift` | `node scripts/publish-inspector.cjs --check` |
| `registry-immutable` | `node scripts/check-inspector-registry.cjs --immutable` |
| `registry-determinism` | `node scripts/check-inspector-registry.cjs --determinism` |
| `extension-vendor` | `node tools/sync-vendor.mjs --check` (byte-for-byte) |
| `release` (on `v*` tags) | `node scripts/check-inspector-registry.cjs --release "$GITHUB_REF_NAME"` |

## 7. Repo creation + first push

- Name: **`html-inspector`**, visibility **public**, description = the FAB's one-liner.
  (Rename in `AGENTS.md`/`README.md` first if the user picks a different name — the npm package
  name is a separate decision and `menu-inspector` is still unclaimed.)
- Create via the GitHub API with a classic PAT (`repo` scope — the fine-grained
  `~/dev/.gh-token` and `/tmp/env/GITHUB_TEST_TOKEN` return **403 "Resource not accessible by
  personal access token"** on `POST /user/repos`), or via the UI. Verified working PAT lives in
  the shell state on `z640` and `zbook-14` (`addState`, 2026-11-19).
- `git init -b main` locally, import commit, then `git remote add origin
  git@github.com:311ecode/html-inspector.git` + push over SSH (key already on the account).
- `LICENSE`: the repo has only `"license": "ISC"` metadata today — add a real `LICENSE` file and
  make `package.json`/`README` agree (open decision §9.2).
- Genericize the ~5 dashboard literals in the moved tests/fixtures (`/home/imre/dev/...`,
  `311ecode` URLs) — no absolute paths in this repo.

### 7.1 Live probe — mechanics proven end-to-end (2026-11-19)

A throwaway **public** repo (`html-inspector-release-probe-<epoch>`) was driven through the whole
flow and then deleted. Harness + record: [`tickets/assets/INSP-001/`](../assets/INSP-001/)
(`probe-release.sh`, `probe-record.txt`). Result:

| Step | Evidence |
|---|---|
| create repo (API, classic PAT) | `POST /user/repos` → 201 |
| push text distribution tree + tag over SSH | registry 0.4.11 + `v1/` + `index.json` (260K), `main` + tag `v0.4.11` on remote |
| create Release for the tag | `POST /releases` → 201 |
| upload 2 zips + 2 `.sha256` | 4 × `POST uploads.github.com/.../assets` → 201, `state=uploaded` |
| user-side download (unauthenticated `browser_download_url`) | both zips round-trip with **identical sha256** |
| delete + verify | `DELETE` → 204, then `GET` → 404; no leftovers |

Gotchas learned (encode these in `release.cjs`):

1. **Private repos + auth header on the asset URL break the download** — `browser_download_url`
   redirects to a signed S3 URL and re-sending `Authorization` corrupts it (first probe runs got a
   hash mismatch). The target repo is public so plain unauthenticated download works; for
   verification against a private probe, use the API asset endpoint
   (`/repos/{owner}/{repo}/releases/assets/{id}` + `Accept: application/octet-stream`).
2. **Fine-grained PAT cannot create repos** (403) — repo creation needs the classic `repo` scope
   (the shell-state `GITHUB_TEST_TOKEN`), as already recorded in `AGENTS.md`.
3. Release-asset uploads accept the `.sha256` sidecar as a plain asset — no extra API needed.

## 8. Consumer handoff (filed as a DASH ticket in `menu-dashboard`, not here)

After the first release exists: point the served-FAB pipeline at this repo instead of the
dashboard's local registry — `e2e-flipbook/scripts/mirror-registry.sh` already takes
`REGISTRY_SRC` (default `<repo>/registry`), so the mirror either checks out this repo or fetches
its registry (Pages or release tarball). Served pages must resolve to `v1/` or the shipped
version before the dashboard's older `registry/` versions can stop being mirrored (old pins 404
otherwise). Contract tests (`e2e-flipbook/tests/inspector_contract.rs` etc.) stay in the dashboard
and keep asserting the served surface; only the mirror source changes.

## 9. Decisions (settled 2026-11-19 by "let the repository fly")

1. **Name** — `html-inspector` (repo); the npm-facing package stays `menu-inspector` (free on npm;
   `html-inspector` there is taken). Rename only with a ticket.
2. **License** — ISC, with a real `LICENSE` file; `package.json`/`inspector/package.json` agree.
3. **HTTP distribution** — GitHub Pages serving the committed `registry/` (enabled; the embed URLs
   are Pages URLs). The dashboard mirror keeps verifying via sha256 until DASH-600 switches it.
4. **Embed zip contents** — `inspector.js` + `inspector.css` only (the two files a host vendors);
   the README/quick-start carries the rest.

## 10. Acceptance criteria (all verifiable, run by the coordinator)

1. `~/dev/html-inspector` has the §2 layout; `git status` clean; one import commit + one release
   commit on `main`.
2. `npm test` green (protocol + UI) **with no dashboard process running**.
3. `node scripts/publish-inspector.cjs` (`--check`) → pass; `--determinism` → pass;
   `check-inspector-registry.cjs --immutable` → pass; `sync-vendor.mjs --check` → pass.
4. `git log --all --stat` contains **no** `.zip`/binary build artifact (`dist/` never committed).
5. GitHub repo `311ecode/html-inspector` is public, `main` pushed (`git ls-remote origin` matches
   local `main`).
6. Tag `inspector-v0.4.11` exists on the remote; its Release carries
   `html-inspector-<extver>-<shortSha>.zip` (builder name, e.g. `html-inspector-0.1.22-e0c18ff.zip`)
   and `html-inspector-embed-0.4.11.zip` + `.sha256`; sizes and sha256s match a local rebuild
   (determinism) and match an unauthenticated download.
7. `check-inspector-registry.cjs --release inspector-v0.4.11` → pass on that tag.
8. `extension/manifest.json` version `0.1.23`; no `git rev-list --count` anywhere in the repo
   (`grep -rn 'rev-list' .` → empty).
9. The dashboard handoff ticket (§8) exists in `menu-dashboard/tickets/new/`.

## 11. Out of scope

Chrome Web Store publishing, npm publish, history migration, dashboard route/panel changes,
pruning dashboard's old registry versions, and any live deploy.

## 12. References (read these before executing)

- `~/dev/menu-dashboard/scripts/publish-inspector.cjs` — generator + `publishedAt` contract
- `~/dev/menu-dashboard/scripts/check-inspector-registry.cjs` — `--immutable/--determinism/--release`
- `~/dev/menu-dashboard/lib/extension-artifact.js` — deterministic zip builder (`stageFromRepo`)
- `~/dev/menu-dashboard/extension/tools/sync-vendor.mjs` — vendor drift guard
- `~/dev/menu-dashboard/.github/workflows/ci.yml` — the inspector jobs to port
- `~/dev/menu-dashboard/e2e-flipbook/scripts/mirror-registry.sh` — consumer `REGISTRY_SRC`
- `~/bash.sh/vcs/git/github/upload_github_release/` — content-hash idempotent release upload
  (port the pattern; it is bash, this repo is node)
- `~/dev/html-inspector/AGENTS.md` — definition of done + invariants
