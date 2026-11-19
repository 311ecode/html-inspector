# INSP-010 — download-image pill beside the camera (⬇)

**Project:** html-inspector · **Status:** NEW (implementing) · **Created:** 2026-11-19 ·
**Origin:** user request + approved sketch — a second round pill next to 📷, same look and feel,
that **downloads** the picked block as a PNG instead of copying it to the clipboard.
**Related:** INSP-009 (capture ladder / this-tab rules), the settled-pick chrome in
`inspector/src/inspector.js`. Sketch: `/tmp/download-pill-sketch.html` (rendered variant A).

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
