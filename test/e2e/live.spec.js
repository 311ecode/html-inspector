// test/e2e/live.spec.js — the distribution itself, over the network. Skipped
// unless HTML_INSPECTOR_LIVE=1 (CI runs hermetic only).
//
// Proves: the Pages registry serves exactly the committed registry, and the
// RELEASED extension zip (not this checkout) injects + copies in Chromium.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test, expect } = require('playwright/test');

const { startServer } = require('./lib/serve');
const { dragFabTo, readClipboard } = require('./lib/gestures');
const { copyExtension, launchWithExtension, triggerInjection } = require('./lib/extension-harness');

const ROOT = path.join(__dirname, '..', '..');
const PAGES = 'https://311ecode.github.io/html-inspector';
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const LIVE = process.env.HTML_INSPECTOR_LIVE === '1';

function sha256(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

async function download(url) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`download ${url} -> HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

test('Pages serves the committed registry (version + bundle bytes)', async () => {
    test.skip(!LIVE, 'set HTML_INSPECTOR_LIVE=1');
    const index = JSON.parse((await download(`${PAGES}/registry/index.json`)).toString('utf8'));
    expect(index.latest).toBe(pkg.version);

    const served = await download(`${PAGES}/registry/inspector/${pkg.version}/inspector.js`);
    const committed = fs.readFileSync(path.join(ROOT, 'registry', 'inspector', pkg.version, 'inspector.js'));
    expect(sha256(served), 'served inspector.js is the committed one').toBe(sha256(committed));

    const servedCss = await download(`${PAGES}/registry/inspector/${pkg.version}/inspector.css`);
    const committedCss = fs.readFileSync(path.join(ROOT, 'registry', 'inspector', pkg.version, 'inspector.css'));
    expect(sha256(servedCss)).toBe(sha256(committedCss));
});

test('the released extension zip injects the FAB and copies a block', async () => {
    test.skip(!LIVE, 'set HTML_INSPECTOR_LIVE=1');
    const name = `html-inspector-extension-${pkg.version}.zip`;
    const base = `https://github.com/311ecode/html-inspector/releases/download/inspector-v${pkg.version}`;

    const zip = await download(`${base}/${name}`);
    const sidecar = (await download(`${base}/${name}.sha256`)).toString('utf8').trim().split(/\s+/)[0];
    expect(sha256(zip), 'release asset matches its .sha256').toBe(sidecar);

    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'html-inspector-release-'));
    const zipPath = path.join(work, name);
    fs.writeFileSync(zipPath, zip);
    execFileSync('unzip', ['-q', '-o', zipPath, '-d', work]);
    const unpacked = fs.readdirSync(work).map((d) => path.join(work, d)).find((d) => fs.statSync(d).isDirectory());
    expect(unpacked, 'the zip contains the unpacked extension folder').toBeTruthy();
    expect(JSON.parse(fs.readFileSync(path.join(unpacked, 'manifest.json'), 'utf8')).version).toBe(pkg.version);

    const srv = await startServer();
    const extDir = copyExtension(unpacked);
    const { context, worker } = await launchWithExtension(extDir);
    try {
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: srv.base });
        const page = await context.newPage();
        await page.goto(srv.base + '/');
        await expect(page.locator('#fab')).toHaveCount(0);
        await triggerInjection(worker, page);
        await expect(page.locator('#fab')).toBeVisible();

        const box = await page.locator('#first-block').boundingBox();
        await dragFabTo(page, box.x + box.width / 2, box.y + 40);
        const payload = await readClipboard(page);
        expect(payload).toContain('URL: ' + page.url());
        expect(payload).toContain('HTML:');
    } finally {
        await context.close();
        await srv.close();
    }
});
