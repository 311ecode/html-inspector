# INSP-009 — camera: capture THIS tab only (and prove it), no other-tab/whole-screen crops

**Project:** html-inspector · **Status:** DONE (landed 2026-11-19, released v0.4.14) · **Created:** 2026-11-19 ·
**Origin:** user on the docs sandbox — the 📷 pill opened Chrome's share picker listing *any* tab
and the whole screen; picking a different surface crops a shifted region because the crop math
assumes the current tab's viewport. "It should be only that specific tab."
**Related:** INSP-006 (sandbox), the capture ladder in `inspector/src/inspector.js`
(`displayCapture`, tier 2), `extension/src/bridge.js` (tier 1, unaffected).

## 0. Landed — 2026-11-19

| Fact | Value |
|---|---|
| Release | https://github.com/311ecode/html-inspector/releases/tag/inspector-v0.4.14 |
| Assets | `html-inspector-extension-0.4.14.zip` (47,108 B, `sha256:0637d969…`) · `html-inspector-embed-0.4.14.zip` (35,181 B, `sha256:3474d537…`) + `.sha256` |
| Picker | `getDisplayMedia` with `preferCurrentTab: true`, `selfBrowserSurface: 'include'`, `monitorTypeSurfaces: 'exclude'`, `surfaceSwitching: 'exclude'`, `systemAudio: 'exclude'`; a browser rejecting the modern keys gets the minimal-options retry |
| Proof | per-boot Capture Handle (`setCaptureHandleConfig` + `track.getCaptureHandle()`) refuses another tab; for the manual-crop path a viewport-shape backstop (±2%) refuses a window/whole-screen grant — the old shifted-crop case |
| Degradation | `cropTo` failure falls back to the manual crop (with the shape guard), instead of failing the capture |
| UX | pre-prompt toast “Choose this tab to capture the block”; cancel still toasts “Screen capture cancelled” |
| Tests | ui **39/39** (incl. the existing Region-Capture site-mode specs, now geometry-aware) · e2e **13 passed** (2 network-gated skipped): same-shape fake stream → “📸 Copied image” + non-empty `image/png`; different-shape stream → “does not match this tab”, nothing copied · node suites 47 |

## Summary

Tier-2 (plain-page `getDisplayMedia`) capture is constrained and validated:

1. **Picker hints** — `getDisplayMedia` gets `preferCurrentTab: true`,
   `selfBrowserSurface: 'include'`, `monitorTypeSurfaces: 'exclude'`,
   `surfaceSwitching: 'exclude'`, `systemAudio: 'exclude'` (retry with the minimal options when a
   browser rejects the modern keys). Tabs only, current tab preselected — no whole-screen option,
   which is where the shifted crops came from.
2. **This-tab proof (Capture Handle)** — at boot the bundle exposes a per-boot handle via
   `navigator.mediaDevices.setCaptureHandleConfig({ handle: 'html-inspector:<random>' })`; after
   the grant, `track.getCaptureHandle()` must return the same handle. Another tab (even the same
   origin) has a different per-boot handle → the capture is refused with
   *"That is another tab — pick this one"* and the stream is stopped.
3. **Geometry backstop** — when the browser exposes no capture handle, the shared frame must match
   this viewport's aspect ratio (±2%); otherwise the same refusal. This is what catches a
   whole-screen/window grant on browsers that ignore the surface hints (the old shifted crop).
4. **Region Capture fallback** — if `cropTo` throws (tab switched, element detached), fall back to
   the manual DPR crop instead of failing the whole capture.
5. **One-line pre-prompt** — before the picker: toast *"Choose this tab to capture the block"*, so
   the dialog is not information overload with no context.

The extension tier (tier 1 bridge) is untouched: silent, no prompt.

## Acceptance criteria

1. Bundle: modern `getDisplayMedia` options + minimal-options retry; capture-handle match; aspect
   backstop; `cropTo` → manual-crop fallback; pre-prompt toast.
2. e2e: with a stubbed `getDisplayMedia` (canvas stream at this viewport's size) and a stubbed
   `clipboard.write`, clicking 📷 on a settled pick reaches *"📸 Copied image"* and captures a
   non-empty `image/png` blob; a *different-aspect* fake stream is refused with the mismatch toast.
   (The real OS picker stays a manual check — it cannot be driven by Playwright.)
3. Docs/sandbox: a line explaining "📷 asks Chrome to share this tab — pick the tab with the
   inspector; other tabs are refused; the extension captures silently".
4. `npm test` / `test:ui` / `test:e2e` green; release `inspector-v0.4.14` published and verified;
   Pages updated.
5. Ticket moved to `done/` with the release evidence.

## Out of scope

Changing the extension capture path, a custom in-page picker UI, and capture on insecure origins
(the 📷 is not armed there by design).
