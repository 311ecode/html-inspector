# INSP-010 — download-image pill beside the camera (⬇)

**Project:** html-inspector · **Status:** DONE (landed 2026-11-19, released v0.4.15) · **Created:** 2026-11-19 ·
**Origin:** user request + approved sketch — a second round pill next to 📷, same look and feel,
that **downloads** the picked block as a PNG instead of copying it to the clipboard.
**Related:** INSP-009 (capture ladder / this-tab rules), the settled-pick chrome in
`inspector/src/inspector.js`. Sketch: `/tmp/download-pill-sketch.html` (rendered variant A).

## 0. Landed — 2026-11-19

| Fact | Value |
|---|---|
| Release | https://github.com/311ecode/html-inspector/releases/tag/inspector-v0.4.15 |
| Assets | `html-inspector-extension-0.4.15.zip` (48,308 B, `sha256:d890f458…`) · `html-inspector-embed-0.4.15.zip` (36,244 B, `sha256:7cfbcc02…`) + `.sha256` |
| Pill | `⬇` round 28 px beside 📷 (`aria-label`/`title` “Download image (PNG)”); the pair shares the camera's row, the 📋 HTML / MD pills stay under it |
| Ladder | additive bridge contract `window.__htmlInspectorCaptureBlob(rect)` (extension `bridge.js` + the site donation shim; `__htmlInspectorCapture` still copies as before) → else the display tier with the INSP-009 this-tab guards; the camera path also accepts legacy bridges that copy and resolve no blob |
| File | `html-inspector-<element-id-or-tag>-<yyyymmdd-hhmm>.png`; busy ⏳ + disabled while capturing; success `⬇ Saved <file>`; cancel `Screen capture cancelled`; failures download nothing |
| Clamps | the DASH-509 corner band re-derives the ⬇↔📷 pair after a bottom-edge shift (found by the lower-right-corner spec: 📋 HTML was overlapped by ⬇ before the fix) |
| Tests | ui **40/40** (new host-mode download spec + every clamp list includes the pill) · protocol 38 · node 9 · e2e **14 passed** (2 network-gated skipped) incl. a download event with the expected filename · registry immutable/determinism green |
| Docs | 11 frames regenerated (settled picks show the pair) + embed note mentions ⬇ |

## Summary

Add one more round 28 px pill — `⬇`, `aria-label`/`title` “Download image (PNG)” — placed
**beside the camera** (row: 📷 ⬇, then the 📋 HTML and MD pills below). It reuses the exact same
capture ladder as 📷 (extension bridge → silent; plain page → this-tab display grant with the
INSP-009 guards) and saves the cropped PNG via a download link instead of the clipboard.

- File name: `html-inspector-<element-id-or-tag>-<yyyymmdd-hhmm>.png` (sanitised slug; fallback
  `element`), e.g. `html-inspector-order-card-20261119-2320.png`.
- Busy: the pill is disabled and shows `⏳` while the capture runs; restored in `finally`.
- Success toast: `⬇ Saved <file>`; cancel: `Screen capture cancelled`; other failures: the
  existing honest `captureMessageOf` text. Nothing is downloaded on failure.
- Armed/positioned/hidden/cleaned up exactly like the camera (same gating, same settle state);
  the corner stack's band clamp and tag-slide logic include the new pill.

## Acceptance criteria

1. A settled pick on a plain page shows 📷 ⬇ side by side and 📋 HTML / MD below; the pair stays
   clamped in the viewport (existing DASH-509 controls lists include the new pill).
2. Clicking ⬇ downloads a PNG named `html-inspector-<slug>-<stamp>.png`; the camera still copies.
3. Both tiers work (bridge silently, display grant with the this-tab guards).
4. e2e: a download event with the right filename in the embed probe; host mode (extension)
   download also asserted; refusal/cancel keeps `nothing downloaded`.
5. Docs frames regenerate (the settled-pick frames show the pill); release `inspector-v0.4.15`
   published and verified; ticket moved to `done/`.

## Out of scope

Downloading HTML/Markdown as files (camera/download stay image-only), changing the extension
bridge protocol, and a settings toggle for the pill.
