# INSP-007 — distribution sheet vs developer tools: dev tools become opt-in (no public switch, no reload)

**Project:** html-inspector · **Status:** NEW (implementing) · **Created:** 2026-11-19 ·
**Origin:** user decision after the INSP-006 review — the public embed opened a "Developer tools"
sheet on a single tap, whose "Developer mode" switch reloaded the page with `?dev=1`. The
user's call: dev mode must be **independent of how the bundle is served**; when the host asks
for it we have it, otherwise not; the capability stays in the source but is **not public**
("too specific").
**Related:** INSP-006 (docs sandbox exposed the behaviour), DASH-600 (dashboard consumer),
`inspector/src/inspector.js` (`devMode` / sheet markup), `inspector/test/ui.spec.js`.

## Summary

Split the FAB sheet into two modes, decided **explicitly by the embedder**, never by the host
type:

| mode | how it is requested | sheet |
|---|---|---|
| **distribution (default)** | just the bundle present | title **"HTML Inspector"**, one drag-hint intro line, **Paste inspection**, collected snapshots + "Copy all" — **no Developer mode switch, no Inspect/Append rows** |
| **developer (opt-in)** | page URL `?dev=1` **or** `data-html-inspector-dev="1"` on `<html>` / the embedding `<script>` | title **"Developer tools"**, the Inspect & copy and Append switches visible |
| extension host | extension's own marker | unchanged: tap = hint toast, drag = copy |

Removed outright: the public `#fabDevMode` switch and the `location.search` **reload** it
triggered. Dev mode is resolved once at boot and never navigates. The extension bundle keeps
working (host mode is sheet-less), and the dashboard can keep its developer sheet by passing
`?dev=1` (or the attribute) — that is the consumer's change, tracked in DASH-600.

## Contract

- `devMode()` = `?dev=1` **or** `documentElement[data-html-inspector-dev="1"]` **or** the
  embedding script tag's `data-html-inspector-dev="1"` (captured via `document.currentScript`
  during synchronous boot).
- Default sheet DOM: `#fabSheet` (`aria-label="HTML Inspector"`), `#fabSheetTitle` =
  `"HTML Inspector"`, `#fabIntro` visible, `#fabInspectRow` / `#fabAppendRow` hidden,
  `#fabPaste` visible. `#fabDevMode` **no longer exists**.
- Dev sheet: title `"Developer tools"`, `#fabIntro` hidden, Inspect + Append rows visible.
- No navigation/reload from any sheet control; the URL is never rewritten by the bundle.
- `protocolVersion` unchanged (clipboard wire format untouched).

## Changes

| File | Change |
|---|---|
| `inspector/src/inspector.js` | markup (title id, intro line, dev switch removed), `devMode()` opt-in detection, `applyDevMode()` boot projection, no reload, paste hint wording ("this page") |
| `inspector/src/inspector.scss` | `.fab-sheet-intro` line style |
| `test/e2e/embed.spec.js` | default sheet = distribution (no dev ids, no navigation); `?dev=1` = developer sheet, URL unchanged |
| `docs/program.js` + `scripts/docs.cjs` | sheet caption updated; new "Developer tools are opt-in" chapter with a live `?dev=1` frame |
| `docs/sandbox.html` | site-owner note on the opt-in |
| registry / extension / release | new inspector version (0.4.12), vendor sync, release assets, docs regenerated |

## Acceptance criteria

1. Default embed: tap opens the distribution sheet — "HTML Inspector", drag hint, Paste,
   snapshots; no developer rows; **no `#fabDevMode`**; URL unchanged.
2. `?dev=1` (and the data attribute) opens the developer sheet with Inspect/Append; still no
   reload and no switch.
3. Extension host mode unchanged (tap = hint toast, drag copies).
4. `npm test` + `npm run test:ui` + `npm run test:e2e` green; docs regenerate with the two
   sheet states; release `inspector-v0.4.12` published and verified; Pages updated.
5. DASH-600 notes that the dashboard must request dev mode explicitly.
