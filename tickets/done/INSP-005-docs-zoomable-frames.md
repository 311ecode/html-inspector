# INSP-005 — docs: zoomable frames (lightbox) + larger default tiles

**Project:** html-inspector · **Status:** DONE (landed 2026-11-19) · **Created:** 2026-11-19 ·
**Motivation:** user feedback — "the pictures at the bottom seem too small, at least it shall be
zoomable… click on it and some collapsible/zoomable view". The frames are captured at 1280×800
but render ~400 px wide in the docs grid; the detail (overlay edges, breadcrumb, sheet rows) is
unreadable.
**Related:** INSP-003 (docs generator), INSP-004 (metadata frame).

## 0. Landed — 2026-11-19

Implemented in the generated page (`scripts/docs.cjs`, inline CSS + ~30 lines of script):

- default strip tiles: `minmax(320px)` → **`minmax(440px)`**;
- every frame image is a keyboard-focusable button (`role="button"`, `tabindex="0"`,
  `aria-label="Enlarge frame N: <caption>"`) with a `⤢` hint badge and `cursor: zoom-in`;
- click / Enter / Space opens the **lightbox**: frame fit to `≤94vw × ≤86vh` + repeated caption;
- clicking the enlarged image toggles **fit ↔ 1:1** (scrollable stage, `cursor: zoom-out`);
- ✕ button, backdrop click and **Esc** close it; focus returns to the triggering frame
  (verified in a browser: `#lightbox` hidden after Esc, `document.activeElement` = the
  zoomable image);
- no dependency, works from `file://` and from Pages.

Verified with real screenshots of the enlarged tiles and the open lightbox (fit + 1:1), and the
live page serves the same markup after push. `npm run docs` output: 10 frames + `docs/index.html`.

## Summary

Make every evidence frame zoomable in the generated `docs/index.html`:

1. **Bigger default tiles** — the strip grid goes from `minmax(320px)` to `minmax(440px)`
   so desktop tiles are noticeably larger; the mobile frame keeps its aspect.
2. **Click to enlarge** — an image opens a lightbox with the frame fit to the viewport
   (≤94vw × ≤86vh), the caption repeated, and a ✕ close button.
3. **Fit ↔ 1:1 toggle** — clicking the enlarged image toggles natural size (scrollable stage),
   so pixel-level detail (breadcrumb text, control pills) is inspectable.
4. **Collapse paths** — ✕ button, backdrop click, and `Esc` all close and restore focus.
5. **Semantics/a11y** — images are keyboard-focusable buttons (`role="button"`,
   `aria-label="Enlarge frame"`), Enter/Space opens, focus returns to the trigger on close.
6. A small `⤢` hint badge marks zoomable frames.

All of this is generated markup in `scripts/docs.cjs` (inline CSS + a tiny script) — no
dependency, no separate page, works from `file://` and Pages.

## Acceptance criteria

1. `npm run docs` emits the lightbox markup + script; frames get the zoom affordance.
2. Clicking a frame opens the enlarged view with the caption; clicking the image toggles
   fit ↔ 1:1; ✕ / backdrop / Esc close it; focus returns to the trigger.
3. Default tiles are visibly larger (grid min 440 px).
4. Verified with a browser screenshot of both the page and the opened lightbox; the live
   Pages page serves it after push.
5. CI stays green (e2e job runs the docs generator); ticket moves to `done/` with the evidence.

## Out of scope

Pinch-zoom gestures, per-frame galleries/carousels, video frames, and a docs build pipeline.
