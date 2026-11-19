# INSP-008 — distribution help card: compact copy, Docs/GitHub/version line (no public switches)

**Project:** html-inspector · **Status:** NEW (implementing) · **Created:** 2026-11-19 ·
**Origin:** user after INSP-007 — the distribution tap should be "a really small pop-up that you
can drag and drop, blah blah, and maybe a link to the GitHub".
**Related:** INSP-007 (dev-tools opt-in), INSP-006 (docs/sandbox), v0.4.13.

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
