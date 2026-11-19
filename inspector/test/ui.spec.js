// inspector/test/ui.spec.js — DASH-290a.
//
// The package's fixture-page suite: Playwright against
// inspector/test/fixtures/page.html, served by a throwaway static-only server
// on its own dedicated port (8093 — the dashboard's inspector spec owns 8091).
// No dashboard process, no server.js, no PM2, no poller: if this suite needs
// any of those, the extraction has not happened.
//
// It reproduces the five behaviours the ticket names, drawn from
// tests/e2e/inspector.spec.js and tests/fleet/fleet-inspector.spec.js:
//   1. the FAB renders always-visible and safe-area aware
//   2. a drag highlights the deepest BLOCK-level element (never a span/text)
//   3. lifting copies URL: / Path: / HTML: + outerHTML
//   4. paste inspection resolves a path, highlights + scrolls, appends a
//      snapshot, and writes the merged collection back
//   5. the badge counts collected snapshots
//   6. DASH-499 — the settled pick's MD pill: the frozen Markdown payload, the
//      📋 HTML rename, the no-capture fallback anchor, the converter palette
//      (headings/lists/links/images/tables/fences/quotes/checkboxes/skipping
//      and the flex-gap spacing rule), and the paste-inspection rejection.
'use strict';

const { test, expect } = require('playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const sass = require('sass');

const PORT = 8093;
const BASE = `http://localhost:${PORT}`;

const PKG = path.join(__dirname, '..');        // inspector/
const FIXTURE = path.join(PKG, 'test', 'fixtures', 'page.html');
const JS_SRC = path.join(PKG, 'src', 'inspector.js');
const SCSS_SRC = path.join(PKG, 'src', 'inspector.scss');

// The fixture consumes the package the way a plain host will in DASH-290b:
// one <script> and one <link>. Here the server maps those two URLs to the
// package source (verbatim JS) and the SCSS compiled the same way the
// generator compiles it — with NO load path: DASH-290b made the stylesheet
// self-contained, so sass must resolve it standing alone. If this compile
// ever needs the dashboard's styles/ again, the extraction has regressed.
let server;

test.beforeAll(async () => {
  const css = sass.compile(SCSS_SRC).css;
  const html = fs.readFileSync(FIXTURE);
  // DASH-466 — the extension's host marker is on <html> before the bundle
  // executes. Serve the same fixture with that one attribute added so the
  // host-mode test needs no init-script timing trick.
  const hostHtml = Buffer.from(
    html.toString('utf8').replace('<html lang="en">', '<html lang="en" data-html-inspector-host="extension">')
  );
  // DASH-509 — the host FAB collision fixture: the /host page plus one page-
  // owned FAB in the same bottom-right corner, injected BEFORE the bundle so
  // the inspector boots on a page that already owns its z 999999 corner.
  const HOST_FAB = '<div id="host-fab" style="position:fixed;right:24px;bottom:24px;width:64px;height:64px;' +
    'border-radius:50%;background:#111;color:#fff;z-index:999999;display:flex;' +
    'align-items:center;justify-content:center">HOST</div>';
  const hostFabHtml = Buffer.from(
    hostHtml.toString('utf8').replace('<script src="/inspector.js"></script>', HOST_FAB + '\n<script src="/inspector.js"></script>')
  );
  const js = fs.readFileSync(JS_SRC);

  server = http.createServer((req, res) => {
    const pathname = new URL(req.url, BASE).pathname;
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    } else if (pathname === '/host') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(hostHtml);
    } else if (pathname === '/host-fab') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(hostFabHtml);
    } else if (pathname === '/inspector.css') {
      res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
      res.end(css);
    } else if (pathname === '/inspector.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(js);
    } else {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, resolve);
  });
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

// ── helpers ────────────────────────────────────────────────────────────

// The pull-the-FAB gesture (DASH-065): press the FAB, cross the 8 px
// tap-vs-drag threshold, glide to (x, y), release.
async function dragFabTo(page, x, y) {
  const fab = page.locator('#fab');
  const box = await fab.boundingBox();
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx - 120, sy, { steps: 5 });
  await page.mouse.move(x, y, { steps: 10 });
  await page.mouse.up();
}

async function blockCount(text) {
  return text.split(/^---$/m).length;
}

function snapshotBlock(url, p, html) {
  return `URL: ${url}\nPath: ${p}\nHTML:\n${html}`;
}

// The untruncated breadcrumb the inspector writes for a fixture probe.
const PROBE_PATH = 'div.fixture > div#card.fixture-card > div#probe.probe-row';
const PROBE2_PATH = 'div.fixture > div#card.fixture-card > div#probe2.probe-row';

// DASH-385 — the evidence-carrying panel: the FIGURE carries the node id, the
// block inside it is the pick, so the resolver must walk to the ancestor.
const PANEL_PATH = 'div.fixture > div#card.fixture-card > figure#panel.panel > div#panelBody.panel-body';
const MALFORMED_PATH = 'div.fixture > div#card.fixture-card > div#probe3.probe-row > div#panelBody3.panel-body';
const EVIDENCE_ROUTE = 'http://captured-host:3000/payment/customer-flow';
// DASH-397 — the fixture island carries the real object facts too: `dom` is
// the MEANINGFUL fact the defect lost (`dom: [object Object]`); imageSize and
// render are MENU-067's shapes. Their display forms are asserted verbatim.
const EVIDENCE_KEYS = [
  ['run', '38894073341 · staff-e2e · sha ed2a83c'],
  ['test', 'T#### · Product behavior / payment / customer flow'],
  ['file', 'payment-customer-flow.spec.ts : 436'],
  ['beat', 'mock-off-calls-waiter · passed'],
  ['frame', '1/2 entry'],
  ['panel', 'actor customer · profile iphone-16'],
  ['view', 'iPhone 16 portrait · 393×852 CSS → 1179×2556 px'],
  ['dom', 'html/mock-off-calls-waiter/f1/customer-iphone-16.html'],
  ['imageSize', '2319×1071 px'],
  ['render', '892×412 CSS @2.6×'],
];

// DASH-419 — the page-level context island (MENU-075): seven facts, generator
// order. The payload copies them verbatim (the formatter is a no-op on these
// display strings) before Captured:/Evidence: and before HTML:.
const CONTEXT_FACTS = [
  ['app', 'Example App'],
  ['suite', 'staff-e2e'],
  ['services', 'quillib · menu-api'],
  ['repo', '/srv/example-app'],
  ['workspace', '/srv'],
  ['commit', 'https://github.com/example-org/example-app/commit/9a5133efe'],
  ['manifest', 'staff-e2e/manifest.json'],
];

const CONTEXT_BLOCK =
  'Context:\n' + CONTEXT_FACTS.map(([k, v]) => `  ${k}: ${v}`).join('\n') + '\n';

// The two sections the island contributes, in payload order (values verbatim,
// island key order, route hoisted out of the Evidence block).
function evidenceBlock() {
  return 'Captured: ' + EVIDENCE_ROUTE + '\n' +
    'Evidence:\n' +
    EVIDENCE_KEYS.map(([k, v]) => `  ${k}: ${v}`).join('\n') + '\n';
}

// ── 1. the FAB renders always-visible and safe-area aware ──────────────

test('the FAB renders always-visible and safe-area aware — injected on a bare page with no poller and no query parameter', async ({ page }) => {
  // DASH-290b — the fixture has NO FAB markup; the tool injects it. Prove both
  // halves: the served HTML is markup-free, and the live DOM has a FAB after
  // the script runs. Also prove the page is bare — no poller hook, no query
  // parameter — so the injection does not depend on either coupling.
  const fixtureHtml = fs.readFileSync(FIXTURE, 'utf8');
  expect(fixtureHtml).not.toContain('id="fab"');
  expect(fixtureHtml).not.toContain('fab-sheet');

  await page.goto(BASE);

  expect(await page.evaluate(() => typeof window.__dashCompareSyncTags)).toBe('undefined'); // no poller
  expect(await page.evaluate(() => typeof window.__dashInspectorSync)).toBe('function');    // hook exposed, still optional
  expect(await page.evaluate(() => location.search)).toBe('');                              // no query parameter

  const fab = page.locator('#fab');
  await expect(fab).toBeVisible();
  await expect(fab).toHaveAttribute('aria-expanded', 'false');
  await expect(fab).not.toHaveClass(/hidden/);   // sheet closed → FAB shown
  await expect(page.locator('#fabSheet')).not.toHaveClass(/open/);

  const pos = await fab.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { position: cs.position, right: cs.right, bottom: cs.bottom, zIndex: cs.zIndex };
  });
  expect(pos.position).toBe('fixed');
  expect(pos.right).toBe('16px');
  expect(pos.bottom).toBe('16px'); // calc(16px + env(…, 0px)) with no inset in headless

  const safeAreaAware = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const rule of rules) {
        if (rule.selectorText === '.fab' && rule.style && rule.style.bottom &&
            rule.style.bottom.indexOf('env(') !== -1) return true;
      }
    }
    return false;
  });
  expect(safeAreaAware).toBe(true);
});

// ── 2. deepest block-level element; blocks only ────────────────────────

test('a drag highlights the deepest block-level element — blocks only, never a span/text', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(BASE);

  // The inline span is the topmost thing under this point; the blocks-only
  // rule must skip it and pick the enclosing block (#probe).
  const inline = page.locator('#inline');
  await inline.scrollIntoViewIfNeeded();
  const b = await inline.boundingBox();
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;

  const fab = page.locator('#fab');
  const fabBox = await fab.boundingBox();
  await page.mouse.move(fabBox.x + fabBox.width / 2, fabBox.y + fabBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(fabBox.x + fabBox.width / 2 - 120, fabBox.y + fabBox.height / 2, { steps: 5 });
  await page.mouse.move(cx, cy, { steps: 10 });
  await expect(page.locator('.inspector-overlay')).toBeVisible(); // live green overlay
  await expect(page.locator('.inspector-tag')).not.toBeEmpty();   // breadcrumb chip
  await page.mouse.up();

  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const pathLine = clip.split('\n').find((line) => line.startsWith('Path: '));
  expect(pathLine).toBe('Path: ' + PROBE_PATH);
  expect(pathLine).not.toContain('span'); // the inline element was never the pick
});

// ── 3. lifting copies URL: / Path: / HTML: + outerHTML ─────────────────

test('lifting copies URL: / Path: / HTML: plus the element outerHTML', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(BASE);

  const probe = page.locator('#probe2');
  await probe.scrollIntoViewIfNeeded();
  const box = await probe.boundingBox();
  await dragFabTo(page, box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.locator('.inspector-toast')).toContainText('Copied');

  const expected = await page.evaluate(() => document.getElementById('probe2').outerHTML);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip.startsWith('URL: ' + page.url() + '\n')).toBe(true);
  expect(clip).toContain('Path: ' + PROBE2_PATH + '\n');
  expect(clip.endsWith('HTML:\n' + expected)).toBe(true);
  await expect(page.locator('.inspector-overlay')).toBeVisible();
});

// ── 3b. DASH-505/507 — the settled pick reflows; the chrome hides off-screen ─
// A settled pick is position:fixed, so every scroll/resize must re-place it
// from the element's CURRENT viewport rect — in site mode too, not only in
// the extension host. DASH-507 reverses the off-screen half: fully outside the
// viewport NOTHING of the chrome is drawn, and scrolling the block back shows
// the SAME settled pick again. A dismissed pick is never resurrected.
test('DASH-507 site mode: the settled pick reflows on scroll, its chrome hides when fully off-screen and returns with the pick, and ✕ is final', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(BASE);

  const probe = page.locator('#probe');
  const box = await probe.boundingBox();
  await dragFabTo(page, box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.inspector-overlay')).toBeVisible();
  await expect(page.locator('.inspector-tag')).toBeVisible();

  const overlayTop = () => page.locator('.inspector-overlay').evaluate((el) => el.getBoundingClientRect().top);
  const probeTop = () => probe.evaluate((el) => el.getBoundingClientRect().top);
  const chromeDisplay = () => page.evaluate(() => {
    const sels = ['.inspector-overlay', '.inspector-tag', '.inspector-x', '.inspector-camera', '.inspector-text', '.inspector-md'];
    return sels.map((s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).display : 'absent'; });
  });

  async function expectControlsInsideAndClickable(label) {
    const vp = page.viewportSize();
    for (const sel of ['.inspector-x', '.inspector-camera', '.inspector-text', '.inspector-md']) {
      const r = await page.locator(sel).evaluate((el) => {
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return {
          left: b.left, top: b.top, right: b.right, bottom: b.bottom,
          hit: !!hit && (hit === el || el.contains(hit)),
          hitClass: hit ? String(hit.className || hit.tagName) : null,
        };
      });
      expect(r.left, label + ' ' + sel + ' left margin').toBeGreaterThanOrEqual(2);
      expect(r.top, label + ' ' + sel + ' top margin').toBeGreaterThanOrEqual(2);
      expect(r.right, label + ' ' + sel + ' right margin').toBeLessThanOrEqual(vp.width - 2);
      expect(r.bottom, label + ' ' + sel + ' bottom margin').toBeLessThanOrEqual(vp.height - 2);
      expect(r.hit, label + ' ' + sel + ' hit-testable (got ' + r.hitClass + ')').toBe(true);
    }
    const tag = await page.locator('.inspector-tag').evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, display: getComputedStyle(el).display };
    });
    expect(tag.display, label + ' tag is shown').not.toBe('none');
    expect(tag.left, label + ' tag left margin').toBeGreaterThanOrEqual(2);
    expect(tag.top, label + ' tag top margin').toBeGreaterThanOrEqual(2);
    expect(tag.right, label + ' tag right margin').toBeLessThanOrEqual(vp.width - 2);
    expect(tag.bottom, label + ' tag bottom margin').toBeLessThanOrEqual(vp.height - 2);
  }

  // A small scroll: the overlay top tracks the element's current rect (±1 px).
  await page.evaluate(() => window.scrollBy(0, 120));
  await expect.poll(async () => Math.abs((await overlayTop()) - (await probeTop()))).toBeLessThanOrEqual(1);
  await expectControlsInsideAndClickable('after 120px scroll');

  // A sliver still visible is NOT off-screen: the chrome stays on screen.
  const sliver = await probe.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { scrollY: window.scrollY, top: r.top, height: r.height };
  });
  await page.evaluate(({ scrollY, top, height }) => window.scrollTo(0, scrollY + top + height - 5), sliver);
  await expect.poll(probeTop).toBeLessThan(0);
  expect(await chromeDisplay(), 'a 5 px sliver keeps the chrome').not.toContain('none');
  await expectControlsInsideAndClickable('block sliver visible');

  // Fully outside the viewport: all six chrome nodes disappear — the pick
  // itself stays settled (no hideOverlay, no clipboard write).
  await page.evaluate(() => window.scrollBy(0, 400));
  await expect.poll(probeTop).toBeLessThan(-1);
  await expect.poll(async () => (await chromeDisplay()).every((d) => d === 'none')).toBe(true);
  await expect(page.locator('.inspector-overlay')).toBeHidden();
  await expect(page.locator('.inspector-x')).toBeHidden();

  // Scrolling back brings the SAME pick back: overlay tracks the rect and the
  // controls are on screen and hit-testable again.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.inspector-overlay')).toBeVisible();
  await expect.poll(async () => Math.abs((await overlayTop()) - (await probeTop()))).toBeLessThanOrEqual(1);
  await expectControlsInsideAndClickable('back in view');

  // ✕ dismisses; a further scroll must not resurrect the pick.
  await page.locator('.inspector-x').click();
  await expect(page.locator('.inspector-overlay')).toBeHidden();
  await expect(page.locator('.inspector-tag')).toBeHidden();
  await page.evaluate(() => window.scrollBy(0, -80));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(page.locator('.inspector-overlay')).toBeHidden();
  await expect(page.locator('.inspector-tag')).toBeHidden();
  await expect(page.locator('.inspector-x')).toBeHidden();
  await expect(page.locator('.inspector-md')).toBeHidden();
});

// ── 4. paste inspection: resolve, highlight + scroll, append, write back ─

test('paste inspection resolves a path, highlights + scrolls, appends a snapshot and writes the merged collection back', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(BASE);

  // A block copied on ANOTHER host, targeting the far probe on this fixture.
  const foreign = snapshotBlock('http://other-host:8081/?dev=1', PROBE2_PATH, '<div class="probe-row" id="probe2">other</div>');
  await page.evaluate((t) => navigator.clipboard.writeText(t), foreign);

  const beforeScroll = await page.evaluate(() => window.scrollY);

  await page.locator('#fab').click();
  await expect(page.locator('#fabSheet')).toHaveClass(/open/);
  await page.locator('#fabPaste').click();

  // Resolved + highlighted + appended toast.
  await expect(page.locator('.inspector-overlay')).toBeVisible();
  await expect(page.locator('.inspector-toast')).toContainText('📎 Appended');
  await expect(page.locator('.inspector-toast')).toContainText('2 total');

  // The highlight scrolls the element into view (the probe is below the fold).
  const afterScroll = await page.evaluate(() => window.scrollY);
  expect(afterScroll).toBeGreaterThan(beforeScroll);

  // The clipboard now carries both blocks: the original foreign one first and
  // THIS host's snapshot (this page's URL + the element's current outerHTML).
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(await blockCount(clip)).toBe(2);
  expect(clip).toContain('URL: http://other-host:8081/?dev=1');
  expect(clip).toContain('Path: ' + PROBE2_PATH);
  const current = await page.evaluate(() => document.getElementById('probe2').outerHTML);
  expect(clip.startsWith(foreign + '\n---\n')).toBe(true);
  expect(clip.endsWith('URL: ' + page.url() + '\nPath: ' + PROBE2_PATH + '\nHTML:\n' + current)).toBe(true);
});

// ── 5. the badge counts collected snapshots ────────────────────────────

test('the badge counts the collected snapshots', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(BASE);

  const a = snapshotBlock('http://host-a:8081/?dev=1', PROBE2_PATH, '<div class="probe-row" id="probe2">a</div>');
  const b = snapshotBlock('http://host-b:8081/?dev=1', PROBE2_PATH, '<div class="probe-row" id="probe2">b</div>');
  await page.evaluate((t) => navigator.clipboard.writeText(t), a + '\n---\n' + b);

  await page.locator('#fab').click();
  await expect(page.locator('#fabSnapshots')).toBeHidden();
  await page.locator('#fabPaste').click();

  await expect(page.locator('.inspector-toast')).toContainText('3 total');
  await expect(page.locator('#fabSnapshots')).toBeVisible();
  await expect(page.locator('#fabSnapshotsCount')).toContainText('3 snapshots collected');
  await expect(page.locator('#fabBadge')).toHaveText('3');
  expect(await blockCount(await page.evaluate(() => navigator.clipboard.readText()))).toBe(3);
});

// ── 6. DASH-385 — the evidence block ───────────────────────────────────

async function copyAt(page, context, selector, prepare) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(BASE);
  if (prepare) await prepare(page);
  const probe = page.locator(selector);
  await probe.scrollIntoViewIfNeeded();
  const box = await probe.boundingBox();
  await dragFabTo(page, box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.inspector-toast')).toContainText('Copied');
  return page.evaluate(() => navigator.clipboard.readText());
}

async function outerHtml(page, id) {
  return page.evaluate((i) => document.getElementById(i).outerHTML, id);
}

test('DASH-385: a node-carrying panel copies Captured + multi-line Evidence BEFORE HTML — URL/Path/HTML unchanged', async ({ page, context }) => {
  const clip = await copyAt(page, context, '#panelBody');
  const html = await outerHtml(page, 'panelBody');
  const bare = `URL: ${page.url()}\nPath: ${PANEL_PATH}\nHTML:\n${html}`;

  // The frozen shape, byte for byte (DASH-419 added Context: before these).
  expect(clip).toBe(`URL: ${page.url()}\nPath: ${PANEL_PATH}\n${CONTEXT_BLOCK}${evidenceBlock()}HTML:\n${html}`);
  // The three v1 lines are unchanged: removing the new sections yields today's
  // exact payload for the same element.
  expect(clip.replace(CONTEXT_BLOCK + evidenceBlock(), '')).toBe(bare);
  // DASH-419 — Context: comes first, then Captured:/Evidence:; all precede
  // HTML: (parseSnapshot takes everything after it).
  expect(clip.indexOf('Context:')).toBeLessThan(clip.indexOf('Captured:'));
  expect(clip.indexOf('Captured:')).toBeLessThan(clip.indexOf('\nHTML:'));
  expect(clip.indexOf('Evidence:')).toBeLessThan(clip.indexOf('\nHTML:'));
  // Multi-line: one label line plus one line per island key, both blocks.
  expect(clip.split('\n').filter((l) => l.startsWith('  '))).toHaveLength(
    CONTEXT_FACTS.length + EVIDENCE_KEYS.length
  );
});

// ── 6b. DASH-397 — object facts render their display forms ─────────────

test('DASH-397: the copied payload renders object facts (dom path, imageSize, render) and never [object Object]', async ({ page, context }) => {
  const clip = await copyAt(page, context, '#panelBody');

  // `dom` is MENU-051's {path, missing?} — the captured-DOM path the defect
  // replaced with `[object Object]`. Exact bundle-relative string, unquoted.
  expect(clip).toContain('\n  dom: html/mock-off-calls-waiter/f1/customer-iphone-16.html\n');
  // MENU-067's object facts render their documented forms.
  expect(clip).toContain('\n  imageSize: 2319×1071 px\n');
  expect(clip).toContain('\n  render: 892×412 CSS @2.6×\n');
  // The whole defect: no object value may ever stringify to [object Object].
  expect(clip).not.toContain('[object Object]');
});

test('DASH-385: a malformed evidence island contributes no Captured/Evidence and never breaks the FAB', async ({ page, context }) => {
  const clip = await copyAt(page, context, '#panelBody3');
  const html = await outerHtml(page, 'panelBody3');
  // DASH-419 — the PAGE-level context island is still valid and copied.
  expect(clip).toBe(`URL: ${page.url()}\nPath: ${MALFORMED_PATH}\n${CONTEXT_BLOCK}HTML:\n${html}`);
  expect(clip).not.toContain('Captured:');
  expect(clip).not.toContain('Evidence:');
});

test('DASH-385: with no context island an element with no node copies the exact three-line payload (the dashboard)', async ({ page, context }) => {
  // A served DASHBOARD page has neither an evidence node nor a context island;
  // removing it here proves the byte-identical fallback through the FAB.
  const clip = await copyAt(page, context, '#probe2', (p) =>
    p.evaluate(() => document.getElementById('evidence-context').remove())
  );
  const html = await outerHtml(page, 'probe2');
  expect(clip).toBe(`URL: ${page.url()}\nPath: ${PROBE2_PATH}\nHTML:\n${html}`);
  expect(clip).not.toContain('Context:');
});

// ── 6c. DASH-419 — a non-node pick carries the page context ─────────────

test('DASH-419: a drag onto a non-panel block copies URL/Path/Context/HTML — no Captured/Evidence', async ({ page, context }) => {
  const clip = await copyAt(page, context, '#probe2');
  const html = await outerHtml(page, 'probe2');
  // The island is PAGE-level: it reaches a pick with no data-evidence-node.
  expect(clip).toBe(`URL: ${page.url()}\nPath: ${PROBE2_PATH}\n${CONTEXT_BLOCK}HTML:\n${html}`);
  expect(clip).not.toContain('Captured:');
  expect(clip).not.toContain('Evidence:');
  // Every context value is verbatim, in island order.
  expect(clip.split('\n').slice(2, 2 + CONTEXT_FACTS.length + 1)).toEqual([
    'Context:', ...CONTEXT_FACTS.map(([k, v]) => `  ${k}: ${v}`),
  ]);
});

test('DASH-385: paste-inspection still parses, resolves and appends a block carrying Captured/Evidence', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(BASE);

  // A block copied on ANOTHER host — with the new sections present. The parser
  // must still take the HTML after the HTML: line and ignore the rest.
  const foreign =
    'URL: http://other-host:8081/?dev=1\nPath: ' + PROBE2_PATH + '\n' +
    evidenceBlock() + 'HTML:\n<div class="probe-row" id="probe2">other</div>';
  await page.evaluate((t) => navigator.clipboard.writeText(t), foreign);

  await page.locator('#fab').click();
  await page.locator('#fabPaste').click();

  await expect(page.locator('.inspector-overlay')).toBeVisible();
  await expect(page.locator('.inspector-toast')).toContainText('📎 Appended');
  await expect(page.locator('.inspector-toast')).toContainText('2 total');

  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(await blockCount(clip)).toBe(2);
  // applyPaste re-serialises each parsed snapshot with formatSnapshot(), so the
  // pasted block's new sections are not carried through the append round-trip
  // (explicitly out of scope for DASH-385) — but the block PARSED: the path
  // resolved, the HTML came after the HTML: line, and both snapshots appended.
  const foreignBare =
    'URL: http://other-host:8081/?dev=1\nPath: ' + PROBE2_PATH + '\n' +
    'HTML:\n<div class="probe-row" id="probe2">other</div>';
  expect(clip.startsWith(foreignBare + '\n---\n')).toBe(true);
  const current = await outerHtml(page, 'probe2');
  expect(clip.endsWith('URL: ' + page.url() + '\nPath: ' + PROBE2_PATH + '\nHTML:\n' + current)).toBe(true);
});

// ── 7. DASH-478 — host mode: the extension keeps the in-site target icon ─
// The extension sets <html data-html-inspector-host="extension"> before
// injecting the bundle. The same boot must KEEP the visible FAB — the
// extension's picker is the DASH-065 pull-the-FAB gesture, exactly what the
// download panel promises — while the "Developer tools" sheet stays in-site
// only: a FAB tap toasts the hint instead of opening it. No hover-follow, no
// page-wide click hijack (`body.inspecting` absent). The settled ✕ clears the
// highlight (site behaviour); Esc tears the injected boot down so a second
// injection finds a clean page.
async function injectBundleAgain(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    document.documentElement.setAttribute('data-html-inspector-host', 'extension');
    const s = document.createElement('script');
    s.src = '/inspector.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('re-injection failed'));
    document.body.appendChild(s);
  }));
}

async function expectHostChromeGone(page) {
  await expect(page.locator('#fab')).toHaveCount(0);
  await expect(page.locator('#fabBackdrop')).toHaveCount(0);
  await expect(page.locator('#fabSheet')).toHaveCount(0);
  await expect(page.locator('.inspector-capture')).toHaveCount(0);
  await expect(page.locator('.inspector-overlay')).toHaveCount(0);
  await expect(page.locator('.inspector-tag')).toHaveCount(0);
  await expect(page.locator('.inspector-x')).toHaveCount(0);
  await expect(page.locator('.inspector-camera')).toHaveCount(0);
  await expect(page.locator('.inspector-text')).toHaveCount(0);
  await expect(page.locator('.inspector-md')).toHaveCount(0);
  await expect(page.locator('.inspector-toast')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-html-inspector-host'))).toBeNull();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-html-inspector-active'))).toBeNull();
  expect(await page.evaluate(() => document.body.classList.contains('inspecting'))).toBe(false);
}

// DASH-478 — the extension-mode pick: scroll the probe into view, drag the
// visible FAB onto it, assert the overlay settled.
async function hostSettleProbe(page) {
  const probe = page.locator('#probe');
  await probe.scrollIntoViewIfNeeded();
  const box = await probe.boundingBox();
  await dragFabTo(page, box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.inspector-overlay')).toBeVisible();
  return { box };
}

test('DASH-478 host mode: the target icon is visible, a tap toasts (never the sheet), drag copies and settles, ✕ clears it, Esc exits, a second injection works', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(BASE + '/host');

  // The same target icon as an in-site page — visible, bottom-right, 60×60.
  await expect(page.locator('#fab')).toHaveCount(1);
  await expect(page.locator('#fab')).toBeVisible();
  const fabBox = await page.locator('#fab').boundingBox();
  expect(fabBox.width).toBe(60);
  expect(fabBox.height).toBe(60);
  expect(fabBox.x).toBeGreaterThan(1280 / 2);
  expect(fabBox.y).toBeGreaterThan(800 / 2);
  expect(await page.evaluate(() => document.getElementById('fab').getAttribute('aria-label'))).toBe('HTML Inspector');
  // The sheet is in-site only: present (the extension probe needs both ids)
  // but never shown, and no page-wide picker is armed.
  await expect(page.locator('#fabSheet')).toBeHidden();
  await expect(page.locator('#fabBackdrop')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-html-inspector-host'))).toBe('extension');
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-html-inspector-active'))).toBe('1');
  expect(await page.evaluate(() => document.body.classList.contains('inspecting'))).toBe(false);

  // A tap teaches the drag; it never opens the sheet.
  await page.locator('#fab').click();
  await expect(page.locator('.inspector-toast')).toContainText('Drag the target onto a block to copy it');
  await expect(page.locator('#fabSheet')).toBeHidden();
  expect(await page.evaluate(() => document.getElementById('fabSheet').classList.contains('open'))).toBe(false);

  // The picker is the pull-the-FAB gesture: the same payload through the same
  // buildPayload/writeClipboard path, and it SETTLES with the ✕. No bridge at
  // boot → no 📷; DASH-510 made the 📋 HTML pill unconditional.
  const { box } = await hostSettleProbe(page);
  const expected = `URL: ${page.url()}\nPath: ${PROBE_PATH}\n${CONTEXT_BLOCK}HTML:\n` +
    await outerHtml(page, 'probe');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  await expect(page.locator('.inspector-tag')).toContainText('div#probe.probe-row');
  await expect(page.locator('.inspector-toast')).toContainText('📋 Copied div#probe.probe-row');
  await expect(page.locator('.inspector-x')).toBeVisible();
  await expect(page.locator('.inspector-camera')).toHaveCount(0);
  await expect(page.locator('.inspector-text')).toHaveCount(1);
  await expect(page.locator('.inspector-text')).toBeVisible();
  expect(box.width).toBeGreaterThan(0);

  // ✕ keeps its SITE behaviour in extension mode: the highlight goes, the
  // target icon stays (no extension teardown).
  await page.locator('.inspector-x').click();
  await expect(page.locator('.inspector-overlay')).toBeHidden();
  await expect(page.locator('#fab')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-html-inspector-host'))).toBe('extension');

  // Esc is the exit; the page is clean enough for a second injection.
  await page.keyboard.press('Escape');
  await expectHostChromeGone(page);

  // The extension's re-entry probe would now inject again — prove it: a
  // second bundle boot re-arms the same visible icon and the picker works.
  await injectBundleAgain(page);
  await expect(page.locator('#fab')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-html-inspector-active'))).toBe('1');
  const { box: box2 } = await hostSettleProbe(page);
  await expect(page.locator('.inspector-x')).toBeVisible();
  expect(box2.width).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expectHostChromeGone(page);
});

// DASH-469 — the stubbed bridge: the picked element settles, the 📷 calls the
// bridge exactly once with its viewport rect + DPR, and a resolved capture
// toasts and STAYS settled (the image has replaced the text clipboard, so the
// 📋 pill is the way back). Only Esc exits.
async function stubBridge(page, mode) {
  await page.addInitScript((mode) => {
    window.__captureCalls = [];
    window.__htmlInspectorCapture = function (rect) {
      window.__captureCalls.push(rect);
      if (mode === 'reject') return Promise.reject(new Error('capture nope'));
      return Promise.resolve('data:image/png;base64,AAAA');
    };
  }, mode);
}

test('DASH-469 host mode: 📷 calls the stub once with the element rect, resolve toasts and stays settled; 📋 re-copies the text', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await stubBridge(page, 'resolve');
  await page.goto(BASE + '/host');

  const { box } = await hostSettleProbe(page);
  await expect(page.locator('.inspector-x')).toBeVisible();
  await expect(page.locator('.inspector-camera')).toBeVisible();
  await expect(page.locator('.inspector-text')).toBeVisible();

  // The 📋 pill re-copies the SAME three-line payload and says so.
  await page.locator('.inspector-text').click();
  const expected = `URL: ${page.url()}\nPath: ${PROBE_PATH}\n${CONTEXT_BLOCK}HTML:\n` +
    await outerHtml(page, 'probe');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  await expect(page.locator('.inspector-toast')).toContainText('📋 Copied text');

  // 📷 → exactly one bridge call with the settled element's CSS-px rect + DPR.
  await page.locator('.inspector-camera').click();
  await expect.poll(() => page.evaluate(() => window.__captureCalls.length)).toBe(1);
  const calls = await page.evaluate(() => window.__captureCalls);
  expect(calls).toEqual([{ x: box.x, y: box.y, width: box.width, height: box.height, dpr: 1 }]);
  await expect(page.locator('.inspector-toast')).toContainText('📸 Copied image');

  // Success does NOT exit: the settled overlay and both controls stay.
  await expect(page.locator('.inspector-overlay')).toBeVisible();
  await expect(page.locator('.inspector-camera')).toBeVisible();
  await expect(page.locator('.inspector-text')).toBeVisible();

  await page.keyboard.press('Escape');
  await expectHostChromeGone(page);
});

test('DASH-469 host mode: a rejected bridge toasts the reason and stays settled, no crash', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await stubBridge(page, 'reject');
  await page.goto(BASE + '/host');

  await hostSettleProbe(page);
  await page.locator('.inspector-camera').click();
  await expect.poll(() => page.evaluate(() => window.__captureCalls.length)).toBe(1);
  await expect(page.locator('.inspector-toast')).toContainText('capture nope');
  await expect(page.locator('.inspector-overlay')).toBeVisible();
  await expect(page.locator('.inspector-x')).toBeVisible();
  await expect(page.locator('.inspector-camera')).toBeVisible();

  await page.keyboard.press('Escape');
  await expectHostChromeGone(page);
});

// DASH-469 §A — the owner's exact bar: a 2000×2000 block at top:-600px;
// left:-600px puts BOTH top corners far off-screen. Every corner control must
// be fully inside the viewport (≥ 2 px margin) and hit-testable, and must stay
// so after the page scrolls (host mode keeps the DASH-469 reflow for a settled
// pick). Not the overlay, not the block — the controls (DASH-499 adds MD).
test('DASH-469 host mode: ✕/📷/📋 stay inside the viewport and hit-testable on a 2000×2000 off-corner pick, before and after scroll', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await stubBridge(page, 'resolve');
  await page.goto(BASE + '/host');

  await page.evaluate(() => {
    const el = document.createElement('div');
    el.id = 'huge';
    el.style.cssText = 'position:absolute;top:-600px;left:-600px;width:2000px;height:2000px;' +
      'background:#fee2e2;display:block;z-index:5';
    document.body.appendChild(el);
  });

  // Settle a pick on the block (it covers the whole viewport at scroll 0).
  await dragFabTo(page, 600, 300);
  await expect(page.locator('.inspector-overlay')).toBeVisible();

  const controlState = (sel) => page.locator(sel).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      left: r.left, top: r.top, right: r.right, bottom: r.bottom,
      hit: !!hit && (hit === el || el.contains(hit)),
      hitClass: hit ? String(hit.className || hit.tagName) : null,
    };
  });

  async function expectControlsInsideAndClickable() {
    const vp = page.viewportSize();
    for (const sel of ['.inspector-x', '.inspector-camera', '.inspector-text', '.inspector-md']) {
      const r = await controlState(sel);
      expect(r.left, sel + ' left margin').toBeGreaterThanOrEqual(2);
      expect(r.top, sel + ' top margin').toBeGreaterThanOrEqual(2);
      expect(r.right, sel + ' right margin').toBeLessThanOrEqual(vp.width - 2);
      expect(r.bottom, sel + ' bottom margin').toBeLessThanOrEqual(vp.height - 2);
      expect(r.hit, sel + ' is the topmost hit at its centre (got ' + r.hitClass + ')').toBe(true);
    }
    // DASH-505 — the breadcrumb is pinned with the controls, never dropped:
    // the pick keeps naming itself even when the block is off-screen.
    const tag = await page.locator('.inspector-tag').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left, top: r.top, right: r.right, bottom: r.bottom,
        display: getComputedStyle(el).display,
      };
    });
    expect(tag.display, '.inspector-tag is shown').not.toBe('none');
    expect(tag.left, '.inspector-tag left margin').toBeGreaterThanOrEqual(2);
    expect(tag.top, '.inspector-tag top margin').toBeGreaterThanOrEqual(2);
    expect(tag.right, '.inspector-tag right margin').toBeLessThanOrEqual(vp.width - 2);
    expect(tag.bottom, '.inspector-tag bottom margin').toBeLessThanOrEqual(vp.height - 2);
  }

  await expectControlsInsideAndClickable('before scroll');

  // Scroll: the block moves up 400 px; the reflow moves overlay/tag with it and
  // the controls stay clamped fully inside the viewport.
  const overlayTop = () => page.locator('.inspector-overlay').evaluate((el) => el.getBoundingClientRect().top);
  const beforeTop = await overlayTop();
  await page.evaluate(() => window.scrollBy(0, 400));
  await expect.poll(overlayTop).toBeCloseTo(beforeTop - 400, 0);

  await expectControlsInsideAndClickable('after scroll');

  // The clamped controls are actually usable; Esc tears the boot down.
  await page.locator('.inspector-text').click();
  await expect(page.locator('.inspector-toast')).toContainText('📋 Copied text');
  await page.locator('.inspector-camera').click();
  await expect.poll(() => page.evaluate(() => window.__captureCalls.length)).toBe(1);
  await page.keyboard.press('Escape');
  await expectHostChromeGone(page);
});

// ── 8. DASH-499 — the MD pill (the settled pick's third output) ──────────
// In-site mode arms the capture pair too (localhost is a secure context in
// headless Chromium, so the display tier exists), which is exactly the
// stacked shape the ticket freezes: 📷 → 📋 HTML → MD on the top-left, ✕
// alone on the top-right. The MD payload is one self-describing block with
// no `Path:` line, so paste inspection still rejects it.

// The frozen MD block for a picked fixture element, byte for byte.
function mdPayload(pageUrl, xpath, selector, markdown) {
  return 'HTML Inspector — selected area\n' +
    'URL: ' + pageUrl + '\n' +
    'XPath: ' + xpath + '\n' +
    'Selector: ' + selector + '\n' +
    'Markdown:\n' + markdown;
}

async function markdownOf(page) {
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip.startsWith('HTML Inspector — selected area\n')).toBe(true);
  expect(clip).not.toMatch(/^Path:/m);
  return clip.slice(clip.indexOf('Markdown:\n') + 'Markdown:\n'.length);
}

// `offset` (px from the element's top-left) picks a point over the CONTAINER
// itself — a list's padding is the only place the pick isn't a nested <li>.
async function pickAndCopyMarkdown(page, selector, offset) {
  const picked = page.locator(selector);
  // Centre it: the corner stack is clamped at the viewport edges, so a pick
  // flush with the bottom would stack the controls onto each other.
  await picked.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const box = await picked.boundingBox();
  const x = offset && offset.x !== undefined ? box.x + offset.x : box.x + box.width / 2;
  const y = offset && offset.y !== undefined ? box.y + offset.y : box.y + box.height / 2;
  await dragFabTo(page, x, y);
  await page.locator('.inspector-md').click();
  await expect(page.locator('.inspector-toast')).toContainText('📝 Copied Markdown');
  return markdownOf(page);
}

test('DASH-499: the settled pick stacks 📷 → 📋 HTML → MD (✕ alone top-right) and MD copies the frozen block', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(BASE);

  const probe = page.locator('#probe2');
  await probe.scrollIntoViewIfNeeded();
  const box = await probe.boundingBox();

  // Mid-drag: the live overlay carries NO corner chip (nothing is settled).
  const fab = page.locator('#fab');
  const fabBox = await fab.boundingBox();
  await page.mouse.move(fabBox.x + fabBox.width / 2, fabBox.y + fabBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(fabBox.x + fabBox.width / 2 - 120, fabBox.y + fabBox.height / 2, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
  await expect(page.locator('.inspector-overlay')).toBeVisible();
  await expect(page.locator('.inspector-md')).toBeHidden();
  await page.mouse.up();
  await expect(page.locator('.inspector-overlay')).toBeVisible();

  // The settled pick: ✕ alone top-right; the left stack in frozen order.
  await expect(page.locator('.inspector-x')).toBeVisible();
  await expect(page.locator('.inspector-camera')).toBeVisible();
  await expect(page.locator('.inspector-text')).toBeVisible();
  await expect(page.locator('.inspector-md')).toBeVisible();
  const xBox = await page.locator('.inspector-x').boundingBox();
  const cameraBox = await page.locator('.inspector-camera').boundingBox();
  const textBox = await page.locator('.inspector-text').boundingBox();
  const mdBox = await page.locator('.inspector-md').boundingBox();
  expect(xBox.x).toBeGreaterThan(cameraBox.x);           // ✕ is the right-hand control
  expect(cameraBox.y).toBeLessThan(textBox.y);            // 📷 → 📋 HTML
  expect(textBox.y).toBeLessThan(mdBox.y);                // 📋 HTML → MD
  expect(mdBox.y).toBeCloseTo(textBox.y + textBox.height + 4, 0); // 4 px gap
  expect(mdBox.x).toBe(textBox.x);                        // same clamped left
  expect(mdBox.height).toBe(22);

  // The chip's identity and the frozen 22 px pill box (same family as the
  // 📋 HTML pill: green border, white/green, rounded, z 941).
  await expect(page.locator('.inspector-md')).toHaveText('MD');
  await expect(page.locator('.inspector-md')).toHaveAttribute('title', 'Copy as Markdown');
  await expect(page.locator('.inspector-md')).toHaveAttribute('aria-label', 'Copy as Markdown');
  const mdStyle = await page.locator('.inspector-md').evaluate((el) => {
    const cs = getComputedStyle(el);
    return { height: cs.height, border: cs.borderTopWidth + ' ' + cs.borderTopColor, radius: cs.borderRadius, z: cs.zIndex };
  });
  expect(mdStyle).toEqual({ height: '22px', border: '2px rgb(34, 197, 94)', radius: '999px', z: '2147483141' }); // DASH-507 top layer

  // The renamed HTML chip: class kept, label/title/aria flipped.
  await expect(page.locator('.inspector-text')).toHaveText('📋 HTML');
  await expect(page.locator('.inspector-text')).toHaveAttribute('title', 'Copy HTML again');
  await expect(page.locator('.inspector-text')).toHaveAttribute('aria-label', 'Copy HTML again');
  await expect(page.locator('.inspector-text')).not.toHaveText('📋 text');

  // Click MD → the frozen payload (URL / XPath / Selector / Markdown:body).
  await page.locator('.inspector-md').click();
  await expect(page.locator('.inspector-toast')).toContainText('📝 Copied Markdown');
  const expected = mdPayload(page.url(), '//*[@id="probe2"]', PROBE2_PATH, 'the far block');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected);

  // The HTML chip still copies TODAY'S payload, byte for byte.
  await page.locator('.inspector-text').click();
  await expect(page.locator('.inspector-toast')).toContainText('📋 Copied text');
  const htmlExpected = `URL: ${page.url()}\nPath: ${PROBE2_PATH}\n${CONTEXT_BLOCK}HTML:\n` +
    await outerHtml(page, 'probe2');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(htmlExpected);

  // ✕ alone removes every corner chip, MD included.
  await page.locator('.inspector-x').click();
  await expect(page.locator('.inspector-overlay')).toBeHidden();
  await expect(page.locator('.inspector-x')).toBeHidden();
  await expect(page.locator('.inspector-md')).toBeHidden();
});

test('DASH-499: an MD block pasted into paste inspection is rejected (no Path: line)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(BASE);

  const block = mdPayload(page.url(), '//*[@id="probe2"]', PROBE2_PATH, 'the far block');
  await page.evaluate((t) => navigator.clipboard.writeText(t), block);

  await page.locator('#fab').click();
  await expect(page.locator('#fabSheet')).toHaveClass(/open/);
  await page.locator('#fabPaste').click();

  // Today's rejection toast, and no highlight: the MD block is not a snapshot.
  await expect(page.locator('.inspector-toast')).toContainText('Clipboard is not an inspection block');
  await expect(page.locator('.inspector-overlay')).toBeHidden();
});

test('DASH-510 host mode (no capture bridge): the HTML pill takes the 📷 slot, MD hangs under it, both copy', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(BASE + '/host');

  const { box } = await hostSettleProbe(page);
  const picked = page.locator('#probe');
  const pickedBox = await picked.boundingBox();
  expect(pickedBox.width).toBeGreaterThan(0);

  // No bridge at boot → no 📷. DASH-510: the 📋 HTML pill is unconditional,
  // so it takes the 📷 slot and MD hangs under it.
  await expect(page.locator('.inspector-camera')).toHaveCount(0);
  await expect(page.locator('.inspector-text')).toHaveCount(1);
  await expect(page.locator('.inspector-text')).toBeVisible();
  await expect(page.locator('.inspector-x')).toBeVisible();
  await expect(page.locator('.inspector-md')).toBeVisible();

  // Stack geometry: the 28 px 📷-slot anchor on the overlay's top-left
  // corner, HTML 32 px under it, MD 4 px under HTML — every box clamped.
  const geom = await page.evaluate(() => {
    const overlay = document.querySelector('.inspector-overlay').getBoundingClientRect();
    const text = document.querySelector('.inspector-text');
    const md = document.querySelector('.inspector-md');
    const clamp = (l, t, w, h) => ({
      left: Math.max(2, Math.min(l, window.innerWidth - w - 2)),
      top: Math.max(2, Math.min(t, window.innerHeight - h - 2)),
    });
    const anchor = clamp(overlay.left - 14, overlay.top - 14, 28, 28);
    const textPos = clamp(anchor.left, anchor.top + 32, text.offsetWidth, text.offsetHeight);
    const mdPos = clamp(textPos.left, textPos.top + text.offsetHeight + 4, md.offsetWidth, md.offsetHeight);
    const tr = text.getBoundingClientRect();
    const mr = md.getBoundingClientRect();
    return {
      text: { left: tr.left, top: tr.top, expectedLeft: textPos.left, expectedTop: textPos.top },
      md: { left: mr.left, top: mr.top, expectedLeft: mdPos.left, expectedTop: mdPos.top },
    };
  });
  expect(Math.abs(geom.text.left - geom.text.expectedLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(geom.text.top - geom.text.expectedTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(geom.md.left - geom.md.expectedLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(geom.md.top - geom.md.expectedTop)).toBeLessThanOrEqual(1);

  // 📋 re-copies the HTML payload the drop wrote.
  await page.locator('.inspector-text').click();
  await expect(page.locator('.inspector-toast')).toContainText('📋 Copied text');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('Path: ' + PROBE_PATH + '\n');

  // MD still copies its own block.
  await page.locator('.inspector-md').click();
  await expect(page.locator('.inspector-toast')).toContainText('📝 Copied Markdown');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(mdPayload(page.url(), '//*[@id="probe"]', PROBE_PATH, 'drag me inline text'));

  // Esc tears the injected boot down — HTML + MD included.
  await page.keyboard.press('Escape');
  await expectHostChromeGone(page);
});

test('DASH-499 converter: the palette on the fixture page (headings, lists, links, images, tables, fences, quotes, checkboxes, skipping, flex gap)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(BASE);

  // The fixture page is the package's own bare page; the converter fixture is
  // appended here at test time (the shared fixture file stays untouched).
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'md-fixture';
    host.innerHTML = [
      '<h2 id="md-heading">Title</h2>',
      '<p id="md-inline">run <code>npm test</code> now and <strong>bold</strong> <em>it</em> <del>gone</del></p>',
      '<ul id="md-list" style="padding:24px 24px 24px 44px;margin:0">' +
        '<li>one<ul><li>one-a</li></ul></li><li>two</li></ul>',
      '<ol id="md-ordered" start="3" style="padding:24px 24px 24px 44px;margin:0"><li>c</li><li>d</li></ol>',
      '<blockquote id="md-quote">quiet</blockquote>',
      '<pre id="md-pre" class="language-js">const x = 1;\n  indented();\n</pre>',
      '<table id="md-table"><thead><tr><th>A</th><th>B</th></tr></thead>' +
        '<tbody><tr><td>x|y</td><td>z</td></tr></tbody></table>',
      '<p id="md-link"><a href="/elsewhere?x=1">link text</a> <a href="javascript:void(0)">js only</a></p>',
      '<p id="md-image"><img src="/dot.png" alt="dot"> <img src="data:image/png;base64,AA" alt="inline"></p>',
      '<div id="md-inputs"><input type="checkbox" checked> <input type="checkbox"> ' +
        '<input type="hidden" value="x"><input type="text" value="hi"></div>',
      '<div id="md-flex" style="display:flex;gap:8px"><span>alpha</span><span>beta</span><span>gamma</span></div>',
      '<div id="md-skip"><span aria-hidden="true">secret</span>' +
        '<svg width="10" height="10"><text>svg</text></svg><span>visible</span></div>',
      '<div id="md-empty"><svg width="10" height="10"><text>icon only</text></svg></div>',
      '<div style="height:600px"></div>',
    ].join('');
    document.body.appendChild(host);
  });

  const cases = [
    ['#md-heading', '## Title'],
    ['#md-inline', 'run `npm test` now and **bold** *it* ~~gone~~'],
    ['#md-list', '- one\n\n  - one-a\n- two', { x: 8, y: 8 }],
    ['#md-ordered', '3. c\n4. d', { x: 8, y: 8 }],
    ['#md-quote', '> quiet'],
    ['#md-pre', '```js\nconst x = 1;\n  indented();\n```'],
    ['#md-table', '| A | B |\n| --- | --- |\n| x\\|y | z |'],
    ['#md-link', `[link text](${BASE}/elsewhere?x=1) js only`],
    ['#md-image', `![dot](${BASE}/dot.png) ![inline]((inline data image omitted))`],
    ['#md-inputs', '[x] [ ] `[text: hi]`'],
    ['#md-flex', 'alpha beta gamma'],
    ['#md-skip', 'visible'],
    ['#md-empty', '_(no textual content)_'],
  ];
  for (const [selector, expected, offset] of cases) {
    expect(await pickAndCopyMarkdown(page, selector, offset), selector).toBe(expected);
  }
});

// ── 9. DASH-509 — the reachable coverage gaps (tests only) ───────────────
// Each test below pins one hole the 2026-11-11 audit found; none of them
// changes production behaviour. The shared fixture server above still serves
// every page (the host-FAB page is a route of it, not a second server).

// A control's z-index, viewport rect and whether it is the topmost hit at its
// own centre. `.inspector-tag` is pointer-events:none, so it is NEVER passed
// here (its z/geometry are asserted instead).
async function inspectorControlState(page, sel) {
  return page.locator(sel).evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      display: cs.display,
      zIndex: parseInt(cs.zIndex, 10),
      left: r.left, top: r.top, right: r.right, bottom: r.bottom,
      hit: !!hit && (hit === el || el.contains(hit)),
      hitName: hit ? String(hit.className || hit.tagName) : null,
    };
  });
}

// DASH-509 #1 — a page-owned FAB in the same corner (z 999999) cannot cover
// the inspector chrome. The inspector keeps the top layer, its own FAB wins
// the corner hit, and the host's FAB is left untouched.
test('DASH-509: a host-page FAB in the corner cannot cover the inspector chrome or the inspector FAB', async ({ page }) => {
  // /host-fab is the /host (extension) fixture. In host mode the 📷/📋 are
  // created only when a capture bridge exists at boot, so stub one — the
  // ticket's four-control list is otherwise reduced to ✕ + MD.
  await stubBridge(page, 'resolve');
  await page.goto(BASE + '/host-fab');
  await expect(page.locator('#host-fab')).toHaveCount(1);

  const probe = page.locator('#probe');
  const box = await probe.boundingBox();
  await dragFabTo(page, box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.locator('.inspector-overlay')).toBeVisible();
  await expect(page.locator('.inspector-x')).toBeVisible();
  await expect(page.locator('.inspector-md')).toBeVisible();

  // The four interactive controls own the top layer AND the hit at their
  // centres — the host page's z 999999 FAB is not in their way.
  for (const sel of ['.inspector-x', '.inspector-camera', '.inspector-text', '.inspector-md']) {
    const state = await inspectorControlState(page, sel);
    expect(state.display, sel + ' is shown').not.toBe('none');
    expect(state.zIndex, sel + ' z-index').toBeGreaterThanOrEqual(2147483000);
    expect(state.hit, sel + ' is the topmost hit at its centre (got ' + state.hitName + ')').toBe(true);
  }

  // The breadcrumb lives on the same top layer but is pointer-events:none,
  // so it is asserted by computed z only — never hit-tested.
  const tagZ = await page.locator('.inspector-tag').evaluate((el) => parseInt(getComputedStyle(el).zIndex, 10));
  expect(tagZ).toBeGreaterThanOrEqual(2147483000);

  // The inspector FAB is the topmost element at its own centre (the two FABs
  // overlap in the corner), and the host FAB still exists underneath.
  const fabHit = await page.locator('#fab').evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { self: !!hit && (hit === el || el.contains(hit)), name: hit ? String(hit.className || hit.tagName) : null };
  });
  expect(fabHit.self, 'inspector FAB owns its own centre (got ' + fabHit.name + ')').toBe(true);
  await expect(page.locator('#host-fab')).toHaveCount(1);
});

// DASH-509 #2 — `resize` re-runs the same reflow as scroll: the settled pick
// tracks the element's CURRENT rect at the new viewport size, the controls are
// re-clamped inside it, and the FAB returns to the new bottom-right corner.
test('DASH-509: resize re-runs the reflow and re-clamps the settled pick and FAB', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(BASE);

  const probe = page.locator('#probe');
  const box = await probe.boundingBox();
  await dragFabTo(page, box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.inspector-overlay')).toBeVisible();

  const overlayTop = () => page.locator('.inspector-overlay').evaluate((el) => el.getBoundingClientRect().top);
  const probeTop = () => probe.evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs((await overlayTop()) - (await probeTop()))).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 900, height: 620 });
  const vp = page.viewportSize();
  expect(vp).toEqual({ width: 900, height: 620 });

  await expect.poll(async () => Math.abs((await overlayTop()) - (await probeTop()))).toBeLessThanOrEqual(1);

  for (const sel of ['.inspector-x', '.inspector-camera', '.inspector-text', '.inspector-md']) {
    const state = await inspectorControlState(page, sel);
    expect(state.left, sel + ' left margin at the new size').toBeGreaterThanOrEqual(2);
    expect(state.top, sel + ' top margin at the new size').toBeGreaterThanOrEqual(2);
    expect(state.right, sel + ' right margin at the new size').toBeLessThanOrEqual(vp.width - 2);
    expect(state.bottom, sel + ' bottom margin at the new size').toBeLessThanOrEqual(vp.height - 2);
    expect(state.hit, sel + ' is hit-testable at the new size (got ' + state.hitName + ')').toBe(true);
  }

  const fabBox = await page.locator('#fab').boundingBox();
  expect(Math.abs(fabBox.x + fabBox.width - (vp.width - 16)), 'FAB right edge').toBeLessThanOrEqual(1);
  expect(Math.abs(fabBox.y + fabBox.height - (vp.height - 16)), 'FAB bottom edge').toBeLessThanOrEqual(1);
});

// DASH-509 #3 — a nested scroller's scroll must reflow too. The listener is
// registered on window in the CAPTURE phase precisely because `scroll` does
// not bubble: this passes only if it is capture-phase (a bubble listener on
// window would never see #nested-scroller's scroll).
test('DASH-509: a nested scroller scroll reflows the settled pick (capture-phase listener)', async ({ page }) => {
  await page.goto(BASE);

  await page.evaluate(() => {
    const scroller = document.createElement('div');
    scroller.id = 'nested-scroller';
    scroller.style.cssText = 'position:fixed;left:10px;top:10px;width:300px;height:200px;overflow:auto';
    const before = document.createElement('div');
    before.style.height = '120px';
    const target = document.createElement('div');
    target.id = 'nested-target';
    target.style.cssText = 'display:block;height:120px;background:#eef2ff';
    const after = document.createElement('div');
    after.style.height = '600px';
    scroller.appendChild(before);
    scroller.appendChild(target);
    scroller.appendChild(after);
    document.body.appendChild(scroller);
  });

  const target = page.locator('#nested-target');
  const box = await target.boundingBox();
  await dragFabTo(page, box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.inspector-overlay')).toBeVisible();

  const overlayTop = () => page.locator('.inspector-overlay').evaluate((el) => el.getBoundingClientRect().top);
  const targetTop = () => target.evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs((await overlayTop()) - (await targetTop()))).toBeLessThanOrEqual(1);

  await page.evaluate(() => { document.getElementById('nested-scroller').scrollTop = 100; });
  await expect.poll(async () => Math.abs((await overlayTop()) - (await targetTop()))).toBeLessThanOrEqual(1);
});

// DASH-509 #4 — the DASH-507 hide/restore works in the extension host too: a
// settled pick scrolled fully off-screen hides all six chrome nodes, and
// scrolling it back shows the SAME pick, still tracking its rect.
test('DASH-509 host mode: the settled pick hides off-screen and restores on scroll back', async ({ page }) => {
  // Host mode only creates the capture pair when a bridge existed at boot;
  // the ticket's six-node poll includes 📷/📋, so stub the bridge.
  await stubBridge(page, 'resolve');
  await page.goto(BASE + '/host');

  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.id = 'off-screen-spacer';
    spacer.style.height = '3000px';
    document.body.appendChild(spacer);
  });

  const probe = page.locator('#probe');
  const box = await probe.boundingBox();
  await dragFabTo(page, box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.inspector-overlay')).toBeVisible();

  const chromeDisplay = () => page.evaluate(() => {
    const sels = ['.inspector-overlay', '.inspector-tag', '.inspector-x', '.inspector-camera', '.inspector-text', '.inspector-md'];
    return sels.map((s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).display : 'absent'; });
  });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(async () => (await chromeDisplay()).every((d) => d === 'none')).toBe(true);
  await expect(page.locator('.inspector-overlay')).toBeHidden();

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.inspector-overlay')).toBeVisible();
  const overlayTop = () => page.locator('.inspector-overlay').evaluate((el) => el.getBoundingClientRect().top);
  const probeTop = () => probe.evaluate((el) => el.getBoundingClientRect().top);
  await expect.poll(async () => Math.abs((await overlayTop()) - (await probeTop()))).toBeLessThanOrEqual(1);
});

// DASH-509 #5 — the owner's literal lower-right-corner case: a huge block
// whose top-left corner is near the viewport's bottom-right. Every control is
// clamped fully inside on both axes, hit-testable, and the ✕ sits at that
// bottom-right corner with the FAB underneath it (the ✕ owns the hit).
test('DASH-509: a lower-right-corner pick clamps and hit-tests every control', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(BASE);
  const vp = page.viewportSize();
  expect(vp).toEqual({ width: 1280, height: 800 });

  await page.evaluate(() => {
    const trap = document.createElement('div');
    trap.id = 'br-trap';
    trap.style.cssText = 'position:absolute;left:1200px;top:760px;width:3000px;height:3000px';
    document.body.appendChild(trap);
  });

  await dragFabTo(page, 1240, 780);
  await expect(page.locator('.inspector-overlay')).toBeVisible();

  for (const sel of ['.inspector-x', '.inspector-camera', '.inspector-text', '.inspector-md']) {
    const state = await inspectorControlState(page, sel);
    expect(state.display, sel + ' is shown').not.toBe('none');
    expect(state.left, sel + ' left margin').toBeGreaterThanOrEqual(2);
    expect(state.top, sel + ' top margin').toBeGreaterThanOrEqual(2);
    expect(state.right, sel + ' right margin').toBeLessThanOrEqual(vp.width - 2);
    expect(state.bottom, sel + ' bottom margin').toBeLessThanOrEqual(vp.height - 2);
    expect(state.hit, sel + ' is hit-testable (got ' + state.hitName + ')').toBe(true);
  }

  // DASH-509 fix — the three pills are one vertical band under the clamp:
  // 📷 → 📋 HTML → MD, never stacked on top of each other (the defect was the
  // HTML pill painting over MD when both clamped to the same top row).
  const cameraBand = await inspectorControlState(page, '.inspector-camera');
  const textBand = await inspectorControlState(page, '.inspector-text');
  const mdBand = await inspectorControlState(page, '.inspector-md');
  expect(textBand.top, '📋 HTML starts at/below the 📷 bottom').toBeGreaterThanOrEqual(
    cameraBand.top + (cameraBand.bottom - cameraBand.top)
  );
  expect(mdBand.top, 'MD starts at/below the 📋 HTML bottom').toBeGreaterThanOrEqual(
    textBand.top + (textBand.bottom - textBand.top)
  );

  // The ✕ is pinned to the corner. Its 28 px centre sits ON the overlay's
  // top-right corner, so the centre (not the box's top edge, which hangs 14 px
  // above it by design) is what "near the corner" means geometrically.
  const x = await inspectorControlState(page, '.inspector-x');
  const cx = x.left + (x.right - x.left) / 2;
  const cy = x.top + (x.bottom - x.top) / 2;
  expect(cx, '✕ centre left').toBeGreaterThanOrEqual(vp.width - 40);
  expect(cy, '✕ centre top').toBeGreaterThanOrEqual(vp.height - 40);

  // The FAB still occupies the corner underneath, but the ✕ is the top hit —
  // the dismiss control is never covered by the tool's own FAB.
  await expect(page.locator('#fab')).toBeVisible();
  expect(x.hit, '✕ is the topmost hit, not the FAB').toBe(true);
});

// DASH-509 #6 — touch: a tap opens the sheet, a synthetic touch drag copies
// and settles, and both drag surfaces declare `touch-action:none` so the
// browser never claims the gesture for scrolling/zooming.
test('DASH-509 touch: tap opens the sheet, a touch drag copies, and both drag surfaces are touch-action:none', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 700 } });
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    const page = await context.newPage();
    await page.goto(BASE);

    const fab = page.locator('#fab');
    const fabBox = await fab.boundingBox();
    await page.touchscreen.tap(fabBox.x + fabBox.width / 2, fabBox.y + fabBox.height / 2);
    await expect(page.locator('#fabSheet')).toHaveClass(/open/);

    // Close the sheet again so the drag's destination is plain page content.
    await page.touchscreen.tap(fabBox.x + fabBox.width / 2, fabBox.y + fabBox.height / 2);
    await expect(page.locator('#fabSheet')).not.toHaveClass(/open/);

    const points = await page.evaluate(() => {
      const f = document.getElementById('fab').getBoundingClientRect();
      const p = document.getElementById('probe').getBoundingClientRect();
      return {
        sx: f.left + f.width / 2, sy: f.top + f.height / 2,
        ex: p.left + p.width / 2, ey: p.top + p.height / 2,
      };
    });
    await page.evaluate(({ sx, sy, ex, ey }) => {
      const el = document.getElementById('fab');
      const fire = (type, x, y) => el.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
        clientX: x, clientY: y,
      }));
      fire('pointerdown', sx, sy);
      for (let i = 1; i <= 10; i++) {
        fire('pointermove', sx + (ex - sx) * i / 10, sy + (ey - sy) * i / 10);
      }
      fire('pointerup', ex, ey);
    }, points);

    await expect(page.locator('.inspector-overlay')).toBeVisible();
    await expect(page.locator('.inspector-toast')).toContainText('Copied');

    const touchActions = await page.evaluate(() => ({
      fab: getComputedStyle(document.getElementById('fab')).touchAction,
      capture: getComputedStyle(document.querySelector('.inspector-capture')).touchAction,
    }));
    expect(touchActions.fab).toBe('none');
    expect(touchActions.capture).toBe('none');
  } finally {
    await context.close();
  }
});

// DASH-509 #7 — keyboard activation: the ✕ is a labelled button and Enter on
// it dismisses the pick; every corner control exposes an aria-label and is a
// `type="button"` button (no default submit behaviour on a host page).
test('DASH-509 keyboard: the ✕ is labelled and Enter dismisses; every control is a labelled type=button', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(BASE);

  const probe = page.locator('#probe');
  const box = await probe.boundingBox();
  await dragFabTo(page, box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.inspector-overlay')).toBeVisible();

  for (const sel of ['.inspector-x', '.inspector-camera', '.inspector-text', '.inspector-md']) {
    const control = page.locator(sel);
    await expect(control, sel + ' is a button').toHaveJSProperty('tagName', 'BUTTON');
    await expect(control, sel + ' has an aria-label').toHaveAttribute('aria-label', /./);
    await expect(control, sel + ' is type=button').toHaveAttribute('type', 'button');
  }

  await page.locator('.inspector-x').focus();
  expect(await page.evaluate(() => document.activeElement.classList.contains('inspector-x'))).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('.inspector-overlay')).toBeHidden();
  await expect(page.locator('.inspector-md')).toBeHidden();
});

// DASH-509 #8 — the 320 px narrow viewport: the breadcrumb stays inside and
// under 90 % of the width, the chrome adds no horizontal overflow, and every
// control is still clamped and hit-testable.
test('DASH-509: at 320px the tag stays inside and the chrome adds no horizontal overflow', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(BASE);

  const vp = page.viewportSize();
  expect(vp).toEqual({ width: 320, height: 640 });

  const probe = page.locator('#probe');
  const box = await probe.boundingBox();
  await dragFabTo(page, box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.inspector-overlay')).toBeVisible();
  await expect(page.locator('.inspector-tag')).toBeVisible();

  const tag = await page.locator('.inspector-tag').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left, right: r.right, boxWidth: r.width,
      // The tag is content-box: max-width:90vw is the CONTENT width, and the
      // 8px side padding + 1px border paint outside it. The ticket's 90 %
      // bound is the declared content width; the bounding box is still held
      // inside the viewport by the left/right assertions below.
      contentWidth: parseFloat(getComputedStyle(el).width),
    };
  });
  expect(tag.left).toBeGreaterThanOrEqual(2);
  expect(tag.right).toBeLessThanOrEqual(vp.width - 2);
  expect(tag.contentWidth).toBeLessThanOrEqual(0.9 * vp.width);
  expect(tag.boxWidth).toBeLessThanOrEqual(vp.width - 2);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);

  for (const sel of ['.inspector-x', '.inspector-camera', '.inspector-text', '.inspector-md']) {
    const state = await inspectorControlState(page, sel);
    expect(state.left, sel + ' left margin at 320px').toBeGreaterThanOrEqual(2);
    expect(state.right, sel + ' right margin at 320px').toBeLessThanOrEqual(vp.width - 2);
    expect(state.hit, sel + ' is hit-testable at 320px (got ' + state.hitName + ')').toBe(true);
  }
});

// DASH-509 #9 — the insecure-host clipboard fallback: with navigator.clipboard
// gone, the copy must go through execCommand('copy') and still toast Copied.
// Proves the fallback runs, not just the secure-context happy path.
test('DASH-509: with no navigator.clipboard the copy falls back to execCommand and still toasts Copied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    window.__exec = [];
    Document.prototype.execCommand = function (command) {
      window.__exec.push(command);
      return true;
    };
  });
  await page.goto(BASE);

  const probe = page.locator('#probe');
  const box = await probe.boundingBox();
  await dragFabTo(page, box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.locator('.inspector-overlay')).toBeVisible();
  await expect(page.locator('.inspector-toast')).toContainText('Copied');
  expect(await page.evaluate(() => window.__exec)).toContain('copy');
});
