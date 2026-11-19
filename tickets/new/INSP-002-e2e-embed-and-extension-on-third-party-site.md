# INSP-002 — e2e: prove the HTML embed and the Chrome extension on a real third-party site

**Project:** html-inspector · **Status:** DONE (landed 2026-11-19) · **Created:** 2026-11-19 ·
**Motivation:** we ship two zips and a Pages registry, but nothing proves that (a) the two
files actually work when a *different* website includes them, or (b) the extension zip
actually injects + copies when loaded unpacked. `test/extension-site-bridge.test.js` and
`inspector/test/ui.spec.js` are textual/fixture guards, not a real browser with a real
extension.
**Related:** INSP-001 (bootstrap + release), `inspector/test/ui.spec.js` (fixture suite),
`extension/src/background.js` (the injection trigger), DASH-600 (dashboard consumer).

## 0. Landed — 2026-11-19

| Fact | Value |
|---|---|
| Hermetic run | `npx playwright test --project=e2e` → **7 passed, 2 skipped** (live) |
| Live run | `HTML_INSPECTOR_LIVE=1 npx playwright test --project=e2e` → **9 passed** |
| Whole suite still green | `npm test` (protocol 38 / artifact 3 / site-bridge 6 + registry + vendor), `npm run test:ui` (39) |
| CI | `.github/workflows/ci.yml` gains the `e2e` job (chromium install, hermetic only) — still verify-only |

What the specs prove (all in `test/e2e/`):

- **`embed.spec.js`** — a plain third-party page (`fixtures/third-party`) that only adds
  `__REGISTRY_BASE__/inspector/v1/inspector.{css,js}` becomes a working inspector: `#fab`
  visible, no page errors, drag picks the paragraph, clipboard gets
  `URL: <page url>` + `Path:` + `HTML: <p id="first-copy">…`, and ✕ clears the settled
  pick without tearing the embed down.
- **`extension.spec.js`** — real Chromium (`channel: 'chromium'`, persistent context) with
  the unpacked extension: a page with **no** inspector gets `#fab` + `#fabSheet` +
  `data-html-inspector-host="extension"`, drag-copy works, Esc removes every injected node
  and attribute, a second press re-injects once (no duplicate FAB), and pressing while the
  inspector exists takes the donation path without double-wiring.
- **`live.spec.js`** — the published distribution: Pages `index.json.latest` ==
  `package.json#version`, served `inspector.js`/`.css` sha256 == committed registry files;
  and the **released** `html-inspector-extension-0.4.11.zip` is downloaded, its `.sha256`
  verified, unzipped, loaded in Chromium, and drives the same inject + copy assertions.

Harness caveat (deliberate, documented in `test/e2e/lib/extension-harness.js` and the
README): the test copy of `extension/` gets `host_permissions: ["http://localhost/*"]`
added, standing in for the `activeTab` grant a user gives by invoking the action —
Playwright cannot click browser toolbar UI. The shipped manifest is still asserted
unchanged (`test/extension-site-bridge.test.js`), and the copy never ships.

Follow-ups noted, not done: a scheduled (not CI-blocking) live run, and driving the real
toolbar action via a headed Chrome profile, which Playwright cannot do today.

## Summary

Add a Playwright **e2e** project (`test/e2e/`) with three specs, all driven through a
throwaway local "third-party site" fixture (a plain HTML page with block elements — never
the inspector's own fixture page):

1. **`embed.spec.js` (hermetic, default)** — the page includes the two published registry
   files exactly the way a host site would (`<link rel="stylesheet">` +
   `<script defer>`). Asserts the FAB boots and the full copy loop works: drag the FAB over
   a block → overlay + breadcrumb, lift → clipboard carries `URL:` / `Path:` / `HTML:`.
   Proves "load it as an HTML dependency and it works".
2. **`extension.spec.js` (hermetic, default)** — real Chromium (`channel: 'chromium'`,
   persistent context) with the **unpacked extension** loaded
   (`--disable-extensions-except` + `--load-extension`). The page is a plain site with **no**
   inspector. The test drives the extension's own trigger from its service worker
   (`chrome.tabs.query` → `trigger(tabId)`) and asserts: `#fab` visible,
   `<html data-html-inspector-host="extension">`, drag → clipboard payload, Esc exits and
   removes every injected node + attributes, and a second trigger boots a fresh inspector
   (no double-wiring).
3. **`live.spec.js` (network, env-gated `HTML_INSPECTOR_LIVE=1`)** — the distribution
   itself: fetch the Pages registry index (latest == `package.json#version`), fetch the
   served `inspector.js` and compare sha256 with the committed registry file; download the
   **released** `html-inspector-extension-<version>.zip`, verify its `.sha256`, unzip it and
   load *that* unpacked build in Chromium, then repeat the injection assertion. Proves the
   shipped artifact, not just the checkout.

## Contract / mechanics (pinned)

- **Namespace**: `test/e2e/**` is a Playwright project named `e2e`; `npm run test:e2e`
  runs it, `npm run test:ui` keeps the existing fixture suite. Both can run in one
  `npx playwright test`.
- **Third-party fixture**: `test/e2e/fixtures/third-party/index.html` — plain page,
  `h1`/`article`/`section` blocks only, no `#fab`, no registry script. The embed fixture
  `test/e2e/fixtures/embed/index.html` is the same page plus
  `__REGISTRY_BASE__/inspector/v1/inspector.{css,js}`; the test server substitutes
  `__REGISTRY_BASE__` (default `/registry` → repo `registry/`; live mode passes the Pages
  URL). One fixture, two modes — no duplicated page.
- **Server**: a per-test `node:http` server on port 0 (ephemeral) serving the fixture and
  (hermetic mode) `registry/**` from the repo. Closed in `afterEach`; never a fixed port.
- **Extension harness** (`test/e2e/lib/extension-harness.js`): copies `extension/` to a temp
  dir and **adds `"host_permissions": ["http://localhost/*"]` to the test copy's manifest**
  only. Reason, recorded here so nobody "fixes" it: the shipped manifest uses `activeTab`,
  whose grant comes from the user invoking the action — Playwright cannot click browser
  toolbar UI, so the harness stands in for that grant. The **shipped** manifest is asserted
  unchanged (`activeTab`, no `host_permissions`) in `extension-site-bridge.test.js`; the
  harness copy is never shipped.
- **Trigger**: from the extension service worker —
  `chrome.tabs.query({active:true,currentWindow:true})` → `chrome.tabs.update(tabId,{active:true})`
  → call the global `trigger(tabId)` (the same function `chrome.action.onClicked` calls).
- **Clipboard**: read via `navigator.clipboard.readText()` with
  `context.grantPermissions(['clipboard-read','clipboard-write'], { origin: server origin })`.
- **No dashboard, no network** in specs 1–2; spec 3 is the only one that touches the
  internet and is skipped unless `HTML_INSPECTOR_LIVE=1`.

## Acceptance criteria

1. `npx playwright test --project=e2e` passes locally and in CI (CI installs chromium).
2. `embed.spec.js` proves the FAB + drag-copy works from a plain third-party page that only
   includes the two registry files; the page itself has no inspector code.
3. `extension.spec.js` proves the injected extension boots on a page with no inspector,
   copies a block, cleans up fully on Esc, and is re-injectable.
4. `HTML_INSPECTOR_LIVE=1 npx playwright test --project=e2e` passes: Pages registry
   sha256 == committed registry, and the **released extension zip** injects + copies.
5. The existing suites stay green (`npm test`, `npm run test:ui`).
6. CI workflow gains the e2e job (chromium install); it still **never pushes or releases**.
7. Ticket records the evidence (spec names, counts, and the live-mode result) and moves to
   `done/`; README/AGENTS gain the new commands.

## Out of scope

Chrome Web Store automation, real Chrome (Google's branded build) rather than Playwright's
Chromium, screenshots/comic evidence (no UI change), and testing other browsers.
