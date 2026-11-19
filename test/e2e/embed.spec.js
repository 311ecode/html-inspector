// test/e2e/embed.spec.js — "include the two published files on a website and it
// works": a plain third-party page (no inspector code of its own) gets the
// registry's inspector.css + inspector.js exactly the way a customer site does,
// then the real drag-copy loop is exercised.
'use strict';

const { test, expect } = require('playwright/test');
const { startServer } = require('./lib/serve');
const { dragFabTo, readClipboard } = require('./lib/gestures');
const pkg = require('../../package.json');

let srv;

test.beforeAll(async () => { srv = await startServer(); });
test.afterAll(async () => { if (srv) await srv.close(); });

async function openEmbed(page, context) {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: srv.base });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(srv.base + '/embed');
    return errors;
}

test('the two published files boot the FAB on a page with no inspector code', async ({ page, context }) => {
    const errors = await openEmbed(page, context);

    await expect(page.locator('#fab')).toBeVisible();
    await expect(page.locator('#fabSheet')).toBeAttached();
    expect(errors, 'the embed must boot without page errors').toEqual([]);
});

test('the embed copies the picked block — URL / Path / HTML land on the clipboard', async ({ page, context }) => {
    await openEmbed(page, context);
    await expect(page.locator('#fab')).toBeVisible();

    // The pick is the deepest BLOCK-level element under the drag point, so aim at
    // the paragraph itself (aiming at the card's top would pick its heading).
    const block = page.locator('#first-copy');
    const box = await block.boundingBox();
    await dragFabTo(page, box.x + box.width / 2, box.y + box.height / 2);

    await expect(page.locator('.inspector-overlay')).toBeVisible();
    await expect(page.locator('.inspector-tag')).toBeVisible();

    const payload = await readClipboard(page);
    expect(payload).toContain('URL: ' + page.url());
    expect(payload).toContain('Path: ');
    expect(payload).toContain('HTML:');
    expect(payload).toContain('id="first-copy"');
    expect(payload).toContain('The inspector should be able to pick this article');
});

test('the settled pick is cleared with ✕ and the embed stays loaded', async ({ page, context }) => {
    await openEmbed(page, context);
    await expect(page.locator('#fab')).toBeVisible();

    const block = page.locator('#second-copy');
    const box = await block.boundingBox();
    await dragFabTo(page, box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('.inspector-overlay')).toBeVisible();

    // Site mode: the settled pick is cleared by the chrome's ✕ (Esc is the
    // host-mode exit, asserted in extension.spec.js), and the FAB stays for the
    // next pick — the embed is not torn down.
    await page.locator('.inspector-x').click();
    await expect(page.locator('.inspector-overlay')).toBeHidden();
    await expect(page.locator('.inspector-tag')).toBeHidden();
    await expect(page.locator('#fab')).toBeVisible();
});

test('a page can enrich the copied payload with context + evidence metadata', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: srv.base });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(srv.base + '/embed-metadata');
    await expect(page.locator('#fab')).toBeVisible();

    const block = page.locator('#meta-copy');
    const box = await block.boundingBox();
    await dragFabTo(page, box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('.inspector-overlay')).toBeVisible();

    // The context island makes every payload carry a Context block first.
    await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toContain('Context:');
    const payload = await readClipboard(page);

    // Frozen order: Context -> Captured -> Evidence -> HTML.
    const idx = (needle) => payload.indexOf(needle);
    expect(idx('Context:')).toBeGreaterThan(-1);
    expect(idx('Context:')).toBeLessThan(idx('Captured:'));
    expect(idx('Captured:')).toBeLessThan(idx('Evidence:'));
    expect(idx('Evidence:')).toBeLessThan(idx('\nHTML:'));

    expect(payload).toContain('Context:\n  app: Example Shop\n  suite: orders-e2e');
    expect(payload).toContain('Captured: https://example-shop.test/orders/42');
    expect(payload).toContain('run: 39120487731 · orders-e2e · sha 4f2c9a1');
    expect(payload).toContain('dom: html/orders/42.html');
    expect(payload).toContain('imageSize: 1280×800 px');
    expect(payload).toContain('render: 1280×800 CSS @2×');
    expect(payload).toContain('id="meta-copy"');

    // The breadcrumb keeps identity attributes, so naming blocks pays off.
    expect(payload.split('\n')[1]).toContain('p#meta-copy');
    expect(errors).toEqual([]);
});

test('the sandbox page boots the FAB and shows the copied payload back', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: srv.base });
    await page.goto(srv.base + '/sandbox');
    await expect(page.locator('#fab')).toBeVisible();

    const block = page.locator('#sandbox-card-b');
    const box = await block.boundingBox();
    await dragFabTo(page, box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('.inspector-overlay')).toBeVisible();

    await page.locator('#read').click();
    await expect.poll(() => page.locator('#out').inputValue()).toContain('URL:');
    const text = await page.locator('#out').inputValue();
    expect(text).toContain('Path: ');
    expect(text).toContain('HTML:');
    // the pick is the deepest block-level element (the card's paragraph)
    expect(text.split('\n')[1]).toContain('article#sandbox-card-b');
});

test('the default sheet is a compact help card — copy, links, version, no switches', async ({ page, context }) => {
    const errors = await openEmbed(page, context);
    await page.locator('#fab').click();
    await expect(page.locator('#fabSheet')).toHaveClass(/open/);
    await expect(page.locator('#fabSheetTitle')).toHaveText('HTML Inspector');

    // the two-line drag hint
    await expect(page.locator('#fabIntro')).toBeVisible();
    await expect(page.locator('#fabIntro')).toContainText('Drag the round target onto a block');
    await expect(page.locator('#fabIntro')).toContainText('Works with mouse and touch');

    // the always-useful action and the Docs/GitHub/version footer
    await expect(page.locator('#fabPaste')).toBeVisible();
    await expect(page.locator('#fabLinks a', { hasText: 'Docs' })).toHaveAttribute(
        'href', 'https://311ecode.github.io/html-inspector/docs/');
    await expect(page.locator('#fabLinks a', { hasText: 'GitHub' })).toHaveAttribute(
        'href', 'https://github.com/311ecode/html-inspector');
    for (const a of await page.locator('#fabLinks a').all()) {
        await expect(a).toHaveAttribute('target', '_blank');
        expect(await a.getAttribute('rel')).toContain('noopener');
    }
    // the generated bundle carries the real version (registry, not a source fixture)
    await expect(page.locator('#fabVersion')).toHaveText('v' + pkg.version);

    // no developer controls, no public switch, no navigation
    await expect(page.locator('#fabInspectRow')).toBeHidden();
    await expect(page.locator('#fabAppendRow')).toBeHidden();
    await expect(page.locator('#fabDevMode')).toHaveCount(0);
    expect(errors).toEqual([]);
    await expect(page).toHaveURL(srv.base + '/embed');
});

test('?dev=1 opts into the developer sheet without a switch or a reload', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: srv.base });
    await page.goto(srv.base + '/embed?dev=1');
    await expect(page.locator('#fab')).toBeVisible();
    const before = page.url();

    await page.locator('#fab').click();
    await expect(page.locator('#fabSheetTitle')).toHaveText('Developer tools');
    await expect(page.locator('#fabInspectRow')).toBeVisible();
    await expect(page.locator('#fabAppendRow')).toBeVisible();
    await expect(page.locator('#fabIntro')).toBeHidden();
    await expect(page.locator('#fabDevMode')).toHaveCount(0);
    await expect(page.locator('#fabLinks a', { hasText: 'GitHub' })).toBeVisible();
    await expect(page.locator('#fabVersion')).toHaveText('v' + pkg.version);
    expect(page.url()).toBe(before); // opt-in is resolved at boot; nothing navigates
});

// INSP-009 — the display-tier camera is pinned to THIS tab. The browser's own
// picker cannot be driven by Playwright, so these tests stub getDisplayMedia
// with a canvas stream: same-shape frame = captured; wrong-shape = refused.
async function stubDisplayCapture(page, width, height) {
    await page.evaluate(({ width, height }) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(0, 0, width, height);
        const stream = canvas.captureStream(30);
        Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
            configurable: true,
            value: async () => stream,
        });
        window.__capturedImage = null;
        if (navigator.clipboard && navigator.clipboard.write) {
            navigator.clipboard.write = async (items) => {
                const blob = await items[0].getType('image/png');
                window.__capturedImage = { type: blob.type, size: blob.size };
            };
        }
    }, { width, height });
}

async function pickFirstBlock(page) {
    const block = page.locator('#first-copy');
    const box = await block.boundingBox();
    await dragFabTo(page, box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('.inspector-overlay')).toBeVisible();
    await expect(page.locator('.inspector-camera')).toBeVisible();
}

test('📷 captures the settled block when the shared surface is this tab', async ({ page, context }) => {
    const errors = await openEmbed(page, context);
    await stubDisplayCapture(page, 1280, 800); // this viewport's shape
    await pickFirstBlock(page);
    await page.locator('.inspector-camera').click();
    await expect(page.locator('.inspector-toast')).toContainText('Copied image');
    const captured = await page.evaluate(() => window.__capturedImage);
    expect(captured).not.toBeNull();
    expect(captured.type).toBe('image/png');
    expect(captured.size).toBeGreaterThan(0);
    expect(errors).toEqual([]);
});

test('⬇ downloads the settled block as a named PNG (display tier)', async ({ page, context }) => {
    const errors = await openEmbed(page, context);
    await stubDisplayCapture(page, 1280, 800);
    await pickFirstBlock(page);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('.inspector-download').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^html-inspector-first-copy-\d{8}-\d{4}\.png$/);
    expect(await download.path()).toBeTruthy();
    await expect(page.locator('.inspector-toast')).toContainText('⬇ Saved html-inspector-first-copy-');

    // downloading does not disturb the settled pick
    await expect(page.locator('.inspector-overlay')).toBeVisible();
    await expect(page.locator('.inspector-download')).toBeVisible();
    expect(errors).toEqual([]);
});

test('📷 refuses a surface that is not this tab (no shifted crop)', async ({ page, context }) => {
    await openEmbed(page, context);
    await stubDisplayCapture(page, 1000, 300); // a different surface's shape
    await pickFirstBlock(page);
    await page.locator('.inspector-camera').click();
    await expect(page.locator('.inspector-toast')).toContainText('does not match this tab');
    expect(await page.evaluate(() => window.__capturedImage)).toBeNull();
});
