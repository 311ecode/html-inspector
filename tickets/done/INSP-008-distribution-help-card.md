# INSP-008 — distribution help card: compact copy, Docs/GitHub/version line (no public switches)

**Project:** html-inspector · **Status:** DONE (landed 2026-11-19, released v0.4.13) · **Created:** 2026-11-19 ·
**Origin:** user after INSP-007 — the distribution tap should be "a really small pop-up that you
can drag and drop, blah blah, and maybe a link to the GitHub".
**Related:** INSP-007 (dev-tools opt-in), INSP-006 (docs/sandbox), v0.4.13.

## 0. Landed — 2026-11-19

| Fact | Value |
|---|---|
| Release | https://github.com/311ecode/html-inspector/releases/tag/inspector-v0.4.13 |
| Assets | `html-inspector-extension-0.4.13.zip` (46,021 B, `sha256:89aa2ef1…`) · `html-inspector-embed-0.4.13.zip` (34,092 B, `sha256:b6cc3fea…`) + `.sha256` |
| Card | title "HTML Inspector" · *"Drag the round target onto a block, then lift — URL, path and HTML are copied."* · *"Works with mouse and touch."* · 📋 Paste inspection · **Docs · GitHub · v0.4.13** footer; snapshots only when non-empty; no auto-show, no navigation |
| Version chip | the registry generator stamps `__INSPECTOR_VERSION__` with the package version (`VERSION = '0.4.13'` verified in the published `v1` bundle); source fixtures hide the chip |
| Dev sheet | same footer (switches unchanged) |
| Tests | ui 39/39 · protocol 38 · artifact+site-bridge 9 · e2e **11 passed** (2 network-gated skipped — asserts the copy, both link hrefs with `target="_blank" rel="…noopener…"`, and `#fabVersion` == package version on the served channel) |
| Docs | regenerated: 11 frames, frame 4 is the new compact card; docs/sandbox live |

## Summary

The default (distribution) sheet becomes a compact help card — same container, less content:

- title **HTML Inspector** + ✕ (unchanged),
- two short lines: *"Drag the round target onto a block, then lift — URL, path and HTML are
  copied."* / *"Works with mouse and touch."*
- keep **📋 Paste inspection**,
- a quiet footer line: **Docs** · **GitHub** · **v<version>**,
- snapshots row only when something was collected (unchanged).

No auto-show, no public switches (INSP-007 stays), no reload. The developer sheet gets the same
footer line (the version is useful in bug reports for both modes).

**Version at runtime.** The bundle has no version today (only the generated banner comment). The
registry generator now stamps a `__INSPECTOR_VERSION__` placeholder in `inspector/src/inspector.js`
with `inspector/package.json#version`; the source page (ui fixtures) keeps the placeholder and the
chip hides itself unless it looks like semver.

## Contract

- markup: `#fabIntro` (two lines), `#fabLinks` with `<a href="<pages>/docs/" target="_blank"
  rel="noopener noreferrer">Docs</a>`, `<a href="https://github.com/311ecode/html-inspector"
  target="_blank" rel="noopener noreferrer">GitHub</a>`, `#fabVersion` (text `v<version>`).
- generator: `buildJs()` replaces `__INSPECTOR_VERSION__` with `pkg.version` (the source file keeps
  the placeholder; only generated registry bundles carry the version).
- footer visible in both sheet modes; hidden only when the version placeholder remains (source-only).
- links are plain anchors inside the sheet (backdrop click still closes; links open in a new tab).

## Acceptance criteria

1. Default sheet: intro copy + Paste + Docs/GitHub/version; no dev rows; no auto-show; no reload.
2. Developer sheet (`?dev=1` / data attribute): switches + the same footer line.
3. Generated registry bundle carries the real version; the e2e asserts `#fabVersion` equals
   `package.json#version` on the served channel; a source-served fixture hides the chip.
4. `npm test`, `npm run test:ui`, `npm run test:e2e` green; docs frames regenerated (the sheet
   frame shows the new card); new release `inspector-v0.4.13` published + verified; Pages updated.
5. Ticket moved to `done/` with the release evidence.
