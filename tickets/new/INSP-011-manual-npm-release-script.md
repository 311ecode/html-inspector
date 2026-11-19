# INSP-011 — manual npm release script (owner-run; the agent has no npm credentials)

**Project:** html-inspector · **Status:** NEW (implementing) · **Created:** 2026-11-19 ·
**Origin:** user — "we should have a script called release to npm… standalone one, and I will
have to do it manually myself, because you don't have the right".
**Related:** INSP-001/008/009/010 (registry + release flow), `inspector/package.json`
(`menu-inspector`), the manual-only push policy in `../rules/git.md`.

## Summary

Add `scripts/release-npm.cjs` (`npm run release:npm`, `npm run release:npm:dry`): a
**standalone, owner-run** npm publisher for the inspector package. It never holds a token and
never runs from CI; it refuses to publish when the npm session is not authenticated and prints the
`npm login` instruction instead. The agent cannot publish (verified `npm whoami` → 401).

What it does:

1. **Preflight** — clean tree; tag `inspector-v<version>` exists locally and on the remote; the
   tag's registry files are byte-identical to the working tree (sha256); `registry/index.json`
   latest == package version; the version is not already on npm.
2. **Stage** `.npm-stage/` (gitignored) — a publish-ready package for the npm name
   `menu-inspector` built from the **published registry artifacts** (not `inspector/src`):
   `inspector.js` + `inspector.css` (version-stamped), `README.md`, `LICENSE`, and a derived
   `package.json` (`main`/`browser`/`style`/`unpkg`/`jsdelivr`, `files`, repository, homepage,
   `publishConfig.access: public`).
3. **Pack preview** — `npm pack --dry-run` in the stage (works without auth) and a file/hash table.
4. **Dry run** (`--dry-run`) stops here.
5. **Auth gate** — `npm whoami`; if unauthenticated: print `npm login` (2FA note), exit 2.
6. **Typed confirm** — must type `publish <version>` before the irreversible step.
7. **Publish** — `npm publish .npm-stage --access public` with inherited stdio (so npm's OTP
   prompt works interactively), then verify with `npm view <name>@<version>` and print the
   package URL.

## Acceptance criteria

1. `npm run release:npm:dry` builds the stage, packs it, prints the contents and stops without
   auth; the packaged `inspector.js`/`.css` sha256 match the registry version.
2. Without auth the real run refuses at the auth gate with the login instruction (exit 2) and
   publishes nothing.
3. `npm whoami`/`npm view` checks use the owner's own npm session; no token is read, written or
   printed; nothing runs from CI.
4. README/AGENTS document the manual flow; ticket moved to `done/`.
5. Existing suites stay green.

## Out of scope

Automated npm publishing (no CI credentials, no provenance), scoped package names, and publishing
the extension (it ships as a GitHub Release zip).
