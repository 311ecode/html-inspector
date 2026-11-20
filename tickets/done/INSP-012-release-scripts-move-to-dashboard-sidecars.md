# INSP-012 — release drivers move out of the mirror into owner-only dashboard sidecars

**Project:** html-inspector · **Status:** DONE (2026-11-20) · **Created:** 2026-11-20 ·
**Origin:** user decision — the release script must be a sidecar (same level as `inspector/`,
never inside the package), split into **three separate scripts**, because only the owner releases.

## Landed

| Script | Lives | Does |
|---|---|---|
| `inspector-github-sync.d/publish_inspector.sh` | `~/dev/menu-dashboard` | dashboard → mirror sync, byte-for-byte (`--check`, `--dry-run`) |
| `inspector-release.d/release_inspector.cjs` | `~/dev/menu-dashboard` | GitHub Release **on the mirror checkout**: regenerate docs/registry, build both zips, tag, push, Release assets, Pages, verify; `--dry-run` / `--skip-tests` / `--pages`; never bumps |
| `inspector-release.d/release_inspector_npm.cjs` | `~/dev/menu-dashboard` | owner-run npm publish of the mirror's current version (`npm login` gate, typed confirm) |

- Both release scripts target `HTML_INSPECTOR_SYNC_TARGET` (default `~/dev/html-inspector`).
- Version bumps stay in the dashboard; sync happens first; release scripts only ship what the
  mirror carries (they refuse a version mismatch).
- Removed from the mirror (`~/dev/html-inspector`, commit `751b776`): `scripts/release.cjs`,
  `scripts/release-npm.cjs`, and the `release*` package.json scripts. The mirror keeps only
  distribution tooling (`publish-inspector.cjs`, registry verifier, docs generator, e2e, CI).
- Mirror AGENTS/README/CI references repointed to the sidecar; the inspector package itself was
  never touched (it contains only src/tests/manifest, as before).
- `inspector-release.d/README.md` documents the three scripts in a few lines (owner-only; no
  contributor-facing ceremony needed).

## Verification

- `release_inspector.cjs --dry-run --skip-tests` against the mirror: docs regenerated (11 frames),
  both deterministic zips built, nothing published.
- `release_inspector_npm.cjs --dry-run`: `menu-inspector@0.4.15` pack preview, not on npm yet,
  auth gate intact.
- Mirror `npm test` 47 pass after the script removal; mirror CI `verify`+`e2e`+`ui` green on
  `751b776`; `publish_inspector.sh --check` in sync at `menu-dashboard@a2fde1e2`.
