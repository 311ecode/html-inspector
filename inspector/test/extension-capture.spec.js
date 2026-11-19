// inspector/test/extension-capture.spec.js — DASH-469 / DASH-471, the REAL
// extension e2e.
//
// Unlike ui.spec.js (which stubs window.__htmlInspectorCapture), the extension
// tests here load the unpacked extension in Chromium and exercise the whole
// path. Host mode (DASH-469): worker injects src/bridge.js + vendor bundle →
// pick settles → 📷 → bridge sends {type:'capture-element'} → worker
// captureVisibleTab → page crop → clipboard PNG. Site mode (DASH-471): the
// page already serves the published bundle itself; pressing the extension
// donates the MAIN-world shim + isolated relay, and the event arms the settled
// overlay. The site-mode stub cases need no extension at all.
//
// Hermetic: own temp profile, own temp extension copy, own ephemeral-port
// server. No dashboard, no shared port, no network.
//
// TEST-ONLY manifest tweak: the shipped extension uses activeTab, which a real
// user grants by invoking the toolbar action. A headless harness cannot press
// that browser-level button, so the staged COPY adds a host permission that
// lets the real worker inject into the fixture tab. extension/manifest.json
// itself is untouched and still ships with exactly activeTab/scripting/
// clipboardWrite.
//
// Skip policy: only when this browser cannot load an unpacked extension at
// all (launch rejects, or no extension service worker appears). Every ordinary
// assertion failure fails the test.
'use strict';

const { test, expect, chromium } = require('playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sass = require('sass');

const ROOT = path.join(__dirname, '..', '..');
const EXT = path.join(ROOT, 'extension');
const FIXTURE = path.join(__dirname, 'fixtures', 'page.html');

function stageExtension() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash469-ext-'));
  fs.cpSync(EXT, dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.host_permissions = ['<all_urls>']; // test-only injection grant (see header)
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  return dir;
}

async function serveFixture() {
  const css = sass.compile(path.join(ROOT, 'inspector/src/inspector.scss')).css;
  const html = fs.readFileSync(FIXTURE);
  const js = fs.readFileSync(path.join(ROOT, 'inspector/src/inspector.js'));
  // The extension injects the bundle; strip the fixture's own <script> so the
  // third-party tab (host mode) has no second bundle booting.
  const htmlOnly = Buffer.from(html.toString('utf8').replace('\n<script src="/inspector.js"></script>', ''));
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(htmlOnly);
    } else if (pathname === '/site') {
      // DASH-471 — a page that already carries its own (site) inspector: the
      // fixture's own <script> boots the published bundle.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
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
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, base: `http://localhost:${server.address().port}` };
}

// DASH-471 — the pull-the-FAB gesture (DASH-065): press the FAB, cross the
// 8 px tap-vs-drag threshold, glide to the probe, release. It settles a pick
// without needing ?dev=1 / the Inspect switch.
async function dragFabToProbe(page) {
  const probe = page.locator('#probe');
  await probe.scrollIntoViewIfNeeded();
  const box = await probe.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const fabBox = await page.locator('#fab').boundingBox();
  const sx = fabBox.x + fabBox.width / 2;
  const sy = fabBox.y + fabBox.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx - 120, sy, { steps: 5 });
  await page.mouse.move(cx, cy, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.inspector-overlay')).toBeVisible();
  return box;
}

// DASH-473 — the mobile/insecure simulation: no mediaDevices at all, so the
// native display tier cannot exist. (localhost is always a secure context, so
// deleting the API — not the secure flag — is the honest no-tier probe.)
async function stubNoDisplay(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      get: () => undefined,
    });
  });
}

async function readClipboardImage(page) {
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (item.types.includes('image/png')) {
        const blob = await item.getType('image/png');
        const bmp = await createImageBitmap(blob);
        return { type: blob.type, width: bmp.width, height: bmp.height };
      }
    }
    return null;
  });
}

// DASH-469/471/473 — the clipboard PNG's decoded dimensions are the element's
// CSS size × DPR, ±1 px.
function expectElementPng(image, box, dpr) {
  expect(image, 'clipboard holds an image/png').not.toBeNull();
  expect(image.type).toBe('image/png');
  expect(Math.abs(image.width - Math.round(box.width * dpr))).toBeLessThanOrEqual(1);
  expect(Math.abs(image.height - Math.round(box.height * dpr))).toBeLessThanOrEqual(1);
}

test('DASH-510 site mode: no bridge and no display API ⇒ no 📷, but the 📋 HTML + MD pills are still there', async () => {
  const { server, base } = await serveFixture();
  let browser;
  let context;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    const page = await context.newPage();
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    await stubNoDisplay(page);
    await page.goto(base + '/site');
    await expect(page.locator('#fab')).toHaveCount(1);
    expect(await page.evaluate(() => window.__menuInspectorCaptureTier())).toBe(null);
    // No bridge and no capture API: the 📷 never exists, but the chrome
    // itself is still created lazily on the first drag.
    await expect(page.locator('.inspector-camera')).toHaveCount(0);
    await expect(page.locator('.inspector-text')).toHaveCount(0);

    await dragFabToProbe(page);
    await expect(page.locator('.inspector-x')).toBeVisible();
    await expect(page.locator('.inspector-camera')).toHaveCount(0);
    // DASH-510 — the 📋 HTML pill is unconditional now (it used to be created
    // with the capture pair, which made an insecure host look "MD only").
    await expect(page.locator('.inspector-text')).toHaveCount(1);
    await expect(page.locator('.inspector-text')).toBeVisible();
    await expect(page.locator('.inspector-md')).toBeVisible();
    // The drop itself still copies the full text payload.
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain('Path: div.fixture > div#card.fixture-card > div#probe.probe-row');
    // …and 📋 re-copies exactly that payload.
    await page.evaluate(() => navigator.clipboard.writeText('clobbered'));
    await page.locator('.inspector-text').click();
    await expect(page.locator('.inspector-toast')).toContainText('📋 Copied text');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain('Path: div.fixture > div#card.fixture-card > div#probe.probe-row');
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
});

test('DASH-471 site mode: a bridge before boot arms 📷/📋 on settle; 📷 passes the rect, resolves, then reports a rejection', async () => {
  const { server, base } = await serveFixture();
  let browser;
  let context;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    const page = await context.newPage();
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    await page.addInitScript(() => {
      window.__captureCalls = [];
      window.__captureMode = 'resolve';
      window.__htmlInspectorCapture = function (rect) {
        window.__captureCalls.push(rect);
        if (window.__captureMode === 'reject') return Promise.reject(new Error('capture nope'));
        return Promise.resolve('data:image/png;base64,AAAA');
      };
    });
    await page.goto(base + '/site');
    await expect(page.locator('#fab')).toHaveCount(1);

    const box = await dragFabToProbe(page);
    await expect(page.locator('.inspector-x')).toBeVisible();
    await expect(page.locator('.inspector-camera')).toBeVisible();
    await expect(page.locator('.inspector-text')).toBeVisible();

    // 📷 → exactly one bridge call with the settled element's CSS-px rect + DPR.
    await page.locator('.inspector-camera').click();
    await expect.poll(() => page.evaluate(() => window.__captureCalls.length)).toBe(1);
    const calls = await page.evaluate(() => window.__captureCalls);
    expect(calls).toEqual([{ x: box.x, y: box.y, width: box.width, height: box.height, dpr: 1 }]);
    await expect(page.locator('.inspector-toast')).toContainText('📸 Copied image');
    // Success stays settled; the site chrome persists like host mode.
    await expect(page.locator('.inspector-overlay')).toBeVisible();
    await expect(page.locator('.inspector-camera')).toBeVisible();

    // The honest failure path: a rejecting bridge surfaces its reason.
    await page.evaluate(() => { window.__captureMode = 'reject'; });
    await page.locator('.inspector-camera').click();
    await expect.poll(() => page.evaluate(() => window.__captureCalls.length)).toBe(2);
    await expect(page.locator('.inspector-toast')).toContainText('capture nope');
    await expect(page.locator('.inspector-overlay')).toBeVisible();
    await expect(page.locator('.inspector-camera')).toBeVisible();
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
});

test('DASH-471 site mode: a bridge attached after boot + menu-inspector:capture-bridge arms the SHOWING settled overlay immediately', async () => {
  const { server, base } = await serveFixture();
  let browser;
  let context;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    const page = await context.newPage();
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    // DASH-473 — start with NO tier (no bridge, no display API) so the
    // donation is the only thing that can arm the settled pick.
    await stubNoDisplay(page);
    await page.goto(base + '/site');
    await expect(page.locator('#fab')).toHaveCount(1);

    // Settle first, with no bridge: only the ✕.
    await dragFabToProbe(page);
    await expect(page.locator('.inspector-x')).toBeVisible();
    await expect(page.locator('.inspector-camera')).toHaveCount(0);

    // The extension's MAIN-world shim arrives after boot; the event is the
    // signal that the capability now exists.
    await page.evaluate(() => {
      window.__captureCalls = [];
      window.__htmlInspectorCapture = function (rect) {
        window.__captureCalls.push(rect);
        return Promise.resolve('data:image/png;base64,AAAA');
      };
      document.dispatchEvent(new CustomEvent('menu-inspector:capture-bridge'));
    });

    // No new pick, no reload: the already-settled overlay gains both controls.
    await expect(page.locator('.inspector-overlay')).toBeVisible();
    await expect(page.locator('.inspector-camera')).toBeVisible();
    await expect(page.locator('.inspector-text')).toBeVisible();

    await page.locator('.inspector-camera').click();
    await expect.poll(() => page.evaluate(() => window.__captureCalls.length)).toBe(1);
    await expect(page.locator('.inspector-toast')).toContainText('📸 Copied image');
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
});

// ── DASH-473 — the native display tier (no extension at all) ───────────
// These run on the package fixture's own /site page. localhost is a secure
// context, so the capability check passes; getDisplayMedia is stubbed (a
// canvas.captureStream at viewport × DPR) because a headless run cannot press
// the browser's share picker. The assertions are still the real ones: a PNG
// on the clipboard whose decoded size is the settled element × DPR.
test('DASH-473 site mode: display tier (manual crop, no CropTarget) puts the element × DPR PNG on the clipboard and stops every track', async () => {
  const { server, base } = await serveFixture();
  let browser;
  let context;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    let downloads = 0;
    page.on('download', () => { downloads += 1; });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    await page.addInitScript(() => {
      window.__displayCalls = 0;
      const dpr = window.devicePixelRatio || 1;
      // The "shared tab": a canvas at viewport size × DPR, repainted every
      // frame so captureStream keeps delivering live frames.
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      const ctx = canvas.getContext('2d');
      let n = 0;
      (function paint() {
        ctx.fillStyle = n++ % 2 ? '#1d4ed8' : '#f97316';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        requestAnimationFrame(paint);
      })();
      const stream = canvas.captureStream(30);
      window.__tracks = stream.getTracks();
      navigator.mediaDevices.getDisplayMedia = async () => {
        window.__displayCalls += 1;
        return stream;
      };
      // NO CropTarget on purpose ⇒ the manual-crop branch.
    });
    await page.goto(base + '/site');
    await expect(page.locator('#fab')).toHaveCount(1);
    expect(await page.evaluate(() => window.__menuInspectorCaptureTier())).toBe('display');

    const box = await dragFabToProbe(page);
    // Site mode arms the pair on a settled pick when either tier exists.
    await expect(page.locator('.inspector-camera')).toBeVisible();
    await expect(page.locator('.inspector-text')).toBeVisible();

    await page.locator('.inspector-camera').click();
    await expect(page.locator('.inspector-toast')).toContainText('📸 Copied image');
    expect(await page.evaluate(() => window.__displayCalls)).toBe(1);

    const dpr = await page.evaluate(() => window.devicePixelRatio);
    expect(dpr).toBe(2);
    expectElementPng(await readClipboardImage(page), box, dpr);

    // finally: every track stopped, the hidden video removed, nothing downloaded.
    expect(await page.evaluate(() => window.__tracks.every((t) => t.readyState === 'ended'))).toBe(true);
    expect(await page.evaluate(() => document.querySelectorAll('video').length)).toBe(0);
    expect(downloads, 'a successful clipboard write never downloads').toBe(0);

    // Success keeps the settled overlay usable (the 📋 is the way back).
    await expect(page.locator('.inspector-overlay')).toBeVisible();
    await expect(page.locator('.inspector-camera')).toBeVisible();
    await expect(page.locator('.inspector-text')).toBeVisible();
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
});

test('DASH-473 site mode: a clipboard refusal downloads element.png with the bridge wording, and still stops the track', async () => {
  const { server, base } = await serveFixture();
  let browser;
  let context;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    await page.addInitScript(() => {
      const dpr = window.devicePixelRatio || 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      const ctx = canvas.getContext('2d');
      let n = 0;
      (function paint() {
        ctx.fillStyle = n++ % 2 ? '#4c1d95' : '#fde68a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        requestAnimationFrame(paint);
      })();
      const stream = canvas.captureStream(30);
      window.__tracks = stream.getTracks();
      navigator.mediaDevices.getDisplayMedia = async () => stream;
    });
    await page.goto(base + '/site');
    await expect(page.locator('#fab')).toHaveCount(1);
    await dragFabToProbe(page);
    await expect(page.locator('.inspector-camera')).toBeVisible();

    // Refuse the clipboard exactly like a browser without image-write rights.
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, 'write', {
        configurable: true,
        value: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
      });
    });

    const downloadPromise = page.waitForEvent('download');
    await page.locator('.inspector-camera').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('element.png');
    await expect(page.locator('.inspector-toast'))
      .toContainText('Clipboard write failed — saved element.png instead');
    expect(await page.evaluate(() => window.__tracks.every((t) => t.readyState === 'ended'))).toBe(true);
    expect(await page.evaluate(() => document.querySelectorAll('video').length)).toBe(0);
    // The fallback is the bridge's honest path: still settled, 📋 still there.
    await expect(page.locator('.inspector-overlay')).toBeVisible();
    await expect(page.locator('.inspector-camera')).toBeVisible();
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
});

test('DASH-473 site mode: CropTarget + track.cropTo crops via Region Capture; the PNG is the element × DPR', async () => {
  const { server, base } = await serveFixture();
  let browser;
  let context;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    let downloads = 0;
    page.on('download', () => { downloads += 1; });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    await page.addInitScript(() => {
      window.__displayCalls = 0;
      window.__cropFrom = [];
      window.__cropTo = 0;
      window.__tracks = [];
      const dpr = window.devicePixelRatio || 1;
      // Region Capture's observable effect: the track now carries just the
      // element region. Simulate that post-crop track with an element-sized
      // canvas (a headless run cannot present a real share surface).
      navigator.mediaDevices.getDisplayMedia = async () => {
        window.__displayCalls += 1;
        const el = document.querySelector('#probe');
        const r = el.getBoundingClientRect();
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(r.width * dpr);
        canvas.height = Math.round(r.height * dpr);
        const ctx = canvas.getContext('2d');
        let n = 0;
        (function paint() {
          ctx.fillStyle = n++ % 2 ? '#0f766e' : '#facc15';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          requestAnimationFrame(paint);
        })();
        const stream = canvas.captureStream(30);
        window.__tracks = stream.getTracks();
        return stream;
      };
      window.CropTarget = {
        fromElement: async (el) => {
          window.__cropFrom.push(el.id);
          return { region: true };
        },
      };
      Object.defineProperty(MediaStreamTrack.prototype, 'cropTo', {
        configurable: true,
        writable: true,
        value: async function () { window.__cropTo += 1; },
      });
    });
    await page.goto(base + '/site');
    await expect(page.locator('#fab')).toHaveCount(1);

    const box = await dragFabToProbe(page);
    await expect(page.locator('.inspector-camera')).toBeVisible();

    await page.locator('.inspector-camera').click();
    await expect(page.locator('.inspector-toast')).toContainText('📸 Copied image');

    // The Region Capture path was taken, on the SETTLED element.
    expect(await page.evaluate(() => window.__displayCalls)).toBe(1);
    expect(await page.evaluate(() => window.__cropFrom)).toEqual(['probe']);
    expect(await page.evaluate(() => window.__cropTo)).toBe(1);

    const dpr = await page.evaluate(() => window.devicePixelRatio);
    expectElementPng(await readClipboardImage(page), box, dpr);

    expect(await page.evaluate(() => window.__tracks.every((t) => t.readyState === 'ended'))).toBe(true);
    expect(await page.evaluate(() => document.querySelectorAll('video').length)).toBe(0);
    expect(downloads).toBe(0);
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
});

test('DASH-473 site mode: a cancelled share picker (NotAllowedError / AbortError) toasts "Screen capture cancelled", stays settled and downloads nothing', async () => {
  const { server, base } = await serveFixture();
  let browser;
  let context;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    const page = await context.newPage();
    let downloads = 0;
    page.on('download', () => { downloads += 1; });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    await page.addInitScript(() => {
      window.__displayCalls = 0;
      window.__cancelName = 'NotAllowedError';
      navigator.mediaDevices.getDisplayMedia = async () => {
        window.__displayCalls += 1;
        throw new DOMException('the user cancelled the picker', window.__cancelName);
      };
    });
    await page.goto(base + '/site');
    await expect(page.locator('#fab')).toHaveCount(1);
    await dragFabToProbe(page);
    await expect(page.locator('.inspector-camera')).toBeVisible();

    await page.locator('.inspector-camera').click();
    await expect(page.locator('.inspector-toast')).toContainText('Screen capture cancelled');
    // Stay settled, exactly as before the click.
    await expect(page.locator('.inspector-overlay')).toBeVisible();
    await expect(page.locator('.inspector-x')).toBeVisible();
    await expect(page.locator('.inspector-camera')).toBeVisible();
    expect(await page.evaluate(() => window.__displayCalls)).toBe(1);
    expect(downloads, 'a cancelled picker never downloads').toBe(0);
    expect(await readClipboardImage(page), 'a cancelled picker writes no image').toBeNull();

    // AbortError is the other honest cancellation spelling.
    await page.evaluate(() => { window.__cancelName = 'AbortError'; });
    await page.locator('.inspector-camera').click();
    await expect(page.locator('.inspector-toast')).toContainText('Screen capture cancelled');
    expect(await page.evaluate(() => window.__displayCalls)).toBe(2);
    expect(downloads).toBe(0);
    await expect(page.locator('.inspector-overlay')).toBeVisible();
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
});

test('DASH-473 site mode: the bridge wins over the display tier — getDisplayMedia is never prompted', async () => {
  const { server, base } = await serveFixture();
  let browser;
  let context;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    const page = await context.newPage();
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    await page.addInitScript(() => {
      window.__captureCalls = [];
      window.__displayCalls = 0;
      window.__htmlInspectorCapture = function (rect) {
        window.__captureCalls.push(rect);
        return Promise.resolve('data:image/png;base64,AAAA');
      };
      navigator.mediaDevices.getDisplayMedia = async () => {
        window.__displayCalls += 1;
        throw new Error('the display tier must not be prompted when a bridge exists');
      };
    });
    await page.goto(base + '/site');
    await expect(page.locator('#fab')).toHaveCount(1);
    expect(await page.evaluate(() => window.__menuInspectorCaptureTier())).toBe('bridge');

    const box = await dragFabToProbe(page);
    await expect(page.locator('.inspector-camera')).toBeVisible();
    await page.locator('.inspector-camera').click();
    await expect(page.locator('.inspector-toast')).toContainText('📸 Copied image');

    expect(await page.evaluate(() => window.__displayCalls)).toBe(0);
    const calls = await page.evaluate(() => window.__captureCalls);
    expect(calls).toEqual([{ x: box.x, y: box.y, width: box.width, height: box.height, dpr: 1 }]);
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
});

test('DASH-469 extension e2e: 📷 sends the pick to the worker, crops it and puts the element PNG on the clipboard', async () => {
  test.setTimeout(60000); // a fresh persistent profile + extension boot is slower than the 15 s default
  const extDir = stageExtension();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash469-profile-'));
  const { server, base } = await serveFixture();

  let context;
  try {
    try {
      context = await chromium.launchPersistentContext(profileDir, {
        // channel: 'chromium' is the full browser — Playwright's default
        // headless shell cannot load unpacked extensions.
        channel: 'chromium',
        headless: true,
        args: [
          '--headless=new',
          `--disable-extensions-except=${extDir}`,
          `--load-extension=${extDir}`,
        ],
        viewport: { width: 900, height: 700 },
        deviceScaleFactor: 2,
      });
    } catch (err) {
      test.skip(true, 'this browser cannot load an unpacked extension: ' + err.message);
      return;
    }

    let worker = context.serviceWorkers()[0];
    if (!worker) {
      try {
        worker = await context.waitForEvent('serviceworker', { timeout: 10000 });
      } catch (err) {
        test.skip(true, 'the unpacked extension did not start a service worker: ' + err.message);
        return;
      }
    }

    const page = context.pages()[0] || await context.newPage();
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    await page.goto(base + '/');
    await page.bringToFront();

    // The real worker does the injection the action-click path would do:
    // host attribute → bridge → CSS → bundle, in this order.
    await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0].id;
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => document.documentElement.setAttribute('data-html-inspector-host', 'extension'),
      });
      await chrome.scripting.executeScript({ target: { tabId }, files: ['src/bridge.js'] });
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['vendor/inspector.css'] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ['vendor/inspector.js'] });
    });

    await expect(page.locator('#fab')).toHaveCount(1);
    // DASH-478 — extension mode keeps the in-site target icon visible; the
    // picker is the pull-the-FAB gesture, not a hover picker.
    await expect(page.locator('#fab')).toBeVisible();
    // Created at boot (bridge present) but hidden until a pick settles.
    await expect(page.locator('.inspector-camera')).toBeHidden();
    await expect(page.locator('.inspector-text')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-html-inspector-active'))).toBe('1');
    expect(await page.evaluate(() => typeof window.__htmlInspectorCapture)).toBe('undefined'); // isolated world

    // Pick a block by dragging the visible target icon onto it (DASH-065).
    const box = await dragFabToProbe(page);
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    await expect(page.locator('.inspector-camera')).toBeVisible();
    await expect(page.locator('.inspector-text')).toBeVisible();

    // 📷 → worker captureVisibleTab → page crop → clipboard.
    await page.locator('.inspector-camera').click();
    await expect(page.locator('.inspector-toast')).toContainText('📸 Copied image');

    const image = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes('image/png')) {
          const blob = await item.getType('image/png');
          const bmp = await createImageBitmap(blob);
          return { type: blob.type, width: bmp.width, height: bmp.height };
        }
      }
      return null;
    });

    expect(image, 'clipboard holds an image/png').not.toBeNull();
    expect(image.type).toBe('image/png');
    // AC 5 — decoded dimensions are the element's CSS size × DPR, ±1 px.
    expect(Math.abs(image.width - Math.round(box.width * dpr))).toBeLessThanOrEqual(1);
    expect(Math.abs(image.height - Math.round(box.height * dpr))).toBeLessThanOrEqual(1);

    // A successful image copy STAYS settled; Esc is the exit (DASH-478 — the
    // settled ✕ clears the highlight only, like the in-site tool).
    await expect(page.locator('.inspector-overlay')).toBeVisible();
    await expect(page.locator('.inspector-camera')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.inspector-overlay')).toHaveCount(0);
    await expect(page.locator('.inspector-camera')).toHaveCount(0);
    await expect(page.locator('#fab')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-html-inspector-host'))).toBeNull();
  } finally {
    if (context) await context.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
});

// DASH-471 — the site-mode world split, proved end-to-end with the real
// extension. The page boots the published bundle itself (site mode wins); the
// worker only donates the capture capability: relay (isolated) + shim (MAIN) +
// the event. The settled overlay arms, one 📷 click round-trips through the
// unchanged worker handler and lands an element PNG on the clipboard.
test('DASH-471 extension e2e: site mode — isolated relay + MAIN-world shim donate 📷 to the page bundle', async () => {
  test.setTimeout(60000); // a fresh persistent profile + extension boot is slower than the 15 s default
  const extDir = stageExtension();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash471-profile-'));
  const { server, base } = await serveFixture();

  let context;
  try {
    try {
      context = await chromium.launchPersistentContext(profileDir, {
        channel: 'chromium',
        headless: true,
        args: [
          '--headless=new',
          `--disable-extensions-except=${extDir}`,
          `--load-extension=${extDir}`,
        ],
        viewport: { width: 900, height: 700 },
        deviceScaleFactor: 2,
      });
    } catch (err) {
      test.skip(true, 'this browser cannot load an unpacked extension: ' + err.message);
      return;
    }

    let worker = context.serviceWorkers()[0];
    if (!worker) {
      try {
        worker = await context.waitForEvent('serviceworker', { timeout: 10000 });
      } catch (err) {
        test.skip(true, 'the unpacked extension did not start a service worker: ' + err.message);
        return;
      }
    }

    const page = context.pages()[0] || await context.newPage();
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    // DASH-473 — no native display tier, so the extension's donation is the
    // only capture capability this page can gain; the pre-donation pick has
    // no 📷 (the DASH-471 proof survives the new ladder).
    await stubNoDisplay(page);
    await page.goto(base + '/site'); // the page's OWN inspector boots here
    await expect(page.locator('#fab')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-html-inspector-host'))).toBeNull();

    // Settle with no bridge: the page has no capture capability yet.
    const box = await dragFabToProbe(page);
    await expect(page.locator('.inspector-x')).toBeVisible();
    await expect(page.locator('.inspector-camera')).toHaveCount(0);

    // The "site inspector present" branch: isolated relay → MAIN shim → event.
    await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0].id;
      await chrome.scripting.executeScript({ target: { tabId }, files: ['src/site-bridge-relay.js'] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ['src/site-bridge-main.js'], world: 'MAIN' });
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => document.dispatchEvent(new CustomEvent('menu-inspector:capture-bridge')),
        world: 'MAIN',
      });
    });

    // The world split, from the page's own world: the shim global is visible
    // (MAIN), the relay guard is not (ISOLATED). This is the proof that the
    // page bundle can call the bridge while chrome.* stays out of the page.
    expect(await page.evaluate(() => typeof window.__htmlInspectorCapture)).toBe('function');
    expect(await page.evaluate(() => typeof window.__htmlInspectorSiteRelay)).toBe('undefined');

    // The event armed the overlay that was already settled — no second pick.
    await expect(page.locator('.inspector-overlay')).toBeVisible();
    await expect(page.locator('.inspector-camera')).toBeVisible();
    await expect(page.locator('.inspector-text')).toBeVisible();

    // 📷 → postMessage → isolated relay → worker captureVisibleTab → MAIN crop.
    await page.locator('.inspector-camera').click();
    await expect(page.locator('.inspector-toast')).toContainText('📸 Copied image');

    const image = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes('image/png')) {
          const blob = await item.getType('image/png');
          const bmp = await createImageBitmap(blob);
          return { type: blob.type, width: bmp.width, height: bmp.height };
        }
      }
      return null;
    });
    expect(image, 'clipboard holds an image/png').not.toBeNull();
    expect(image.type).toBe('image/png');
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    expect(Math.abs(image.width - Math.round(box.width * dpr))).toBeLessThanOrEqual(1);
    expect(Math.abs(image.height - Math.round(box.height * dpr))).toBeLessThanOrEqual(1);

    // Still settled, still the site's own inspector; ✕ is the page's own out.
    await expect(page.locator('.inspector-overlay')).toBeVisible();
    await expect(page.locator('.inspector-camera')).toBeVisible();
    await page.locator('.inspector-x').click();
    // Site mode's ✕ HIDES the highlight (it is not the host-mode teardown).
    await expect(page.locator('.inspector-overlay')).toBeHidden();
    await expect(page.locator('.inspector-camera')).toBeHidden();
    // The page's FAB was never re-injected or removed by the extension.
    await expect(page.locator('#fab')).toHaveCount(1);
  } finally {
    if (context) await context.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(extDir, { recursive: true, force: true });
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
});
