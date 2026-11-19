// test/e2e/extension.spec.js — the unpacked Chrome extension, loaded in a real
// Chromium, on a page that has NO inspector: the extension's trigger injects the
// vendored bundle + styles, the FAB pick copies, Esc leaves a clean page, and a
// second press injects fresh (no double-wiring).
'use strict';

const path = require('node:path');
const { test, expect } = require('playwright/test');
const { startServer } = require('./lib/serve');
const { dragFabTo, readClipboard } = require('./lib/gestures');
const { copyExtension, launchWithExtension, triggerInjection } = require('./lib/extension-harness');

let srv;
let context;
let worker;

test.beforeAll(async () => {
    srv = await startServer();
    const extensionDir = copyExtension(path.join(__dirname, '..', '..', 'extension'));
    ({ context, worker } = await launchWithExtension(extensionDir));
});

test.afterAll(async () => {
    if (context) await context.close();
    if (srv) await srv.close();
});

async function openBareSite() {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: srv.base });
    const page = await context.newPage();
    await page.goto(srv.base + '/');
    return page;
}

test('the extension injects the FAB into a plain page and marks host mode', async () => {
    const page = await openBareSite();
    await expect(page.locator('#fab')).toHaveCount(0); // nothing until the extension acts
    await triggerInjection(worker, page);
    await expect(page.locator('#fab')).toBeVisible();
    await expect(page.locator('#fabSheet')).toBeAttached();
    await expect(page.locator('html')).toHaveAttribute('data-html-inspector-host', 'extension');
    await page.close();
});

test('the injected picker copies a block (URL / Path / HTML) to the clipboard', async () => {
    const page = await openBareSite();
    await triggerInjection(worker, page);
    await expect(page.locator('#fab')).toBeVisible();

    const block = page.locator('#second-copy');
    const box = await block.boundingBox();
    await dragFabTo(page, box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('.inspector-overlay')).toBeVisible();

    const payload = await readClipboard(page);
    expect(payload).toContain('URL: ' + page.url());
    expect(payload).toContain('Path: ');
    expect(payload).toContain('HTML:');
    expect(payload).toContain('id="second-copy"');
    await page.close();
});

test('Esc removes every injected node + attribute, and a second press re-injects', async () => {
    const page = await openBareSite();
    await triggerInjection(worker, page);
    await expect(page.locator('#fab')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#fab')).toHaveCount(0);
    await expect(page.locator('#fabSheet')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-html-inspector-host', 'extension');

    await triggerInjection(worker, page);
    await expect(page.locator('#fab')).toBeVisible();
    await expect(page.locator('#fab')).toHaveCount(1); // fresh boot, never a duplicate
    await page.close();
});

test('a second press while the inspector is present does not double-wire', async () => {
    const page = await openBareSite();
    await triggerInjection(worker, page);
    await expect(page.locator('#fab')).toBeVisible();
    const fabCount = await page.locator('#fab').count();

    await triggerInjection(worker, page); // page already has the inspector -> donation path
    await expect.poll(async () => page.locator('#fab').count()).toBe(fabCount);
    await expect(page.locator('#fab')).toHaveCount(1);
    await page.close();
});
