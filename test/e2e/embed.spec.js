// test/e2e/embed.spec.js — "include the two published files on a website and it
// works": a plain third-party page (no inspector code of its own) gets the
// registry's inspector.css + inspector.js exactly the way a customer site does,
// then the real drag-copy loop is exercised.
'use strict';

const { test, expect } = require('playwright/test');
const { startServer } = require('./lib/serve');
const { dragFabTo, readClipboard } = require('./lib/gestures');

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
