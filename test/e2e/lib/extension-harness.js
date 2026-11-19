// test/e2e/lib/extension-harness.js — load the unpacked extension in Chromium
// and drive its own trigger.
//
// Two deliberate choices, both explained in tickets/new/INSP-002-*:
//
// 1. `channel: 'chromium'` — Playwright's headless-shell build cannot load
//    extensions; the full Chromium build can (headless too).
// 2. The test copy of `extension/` gets `host_permissions: ["http://localhost/*"]`
//    added to its manifest. The shipped manifest uses `activeTab`, whose grant
//    comes from the user invoking the action — Playwright cannot click browser
//    toolbar UI. The shipped manifest is asserted unchanged elsewhere
//    (test/extension-site-bridge.test.js); the copy never ships.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const LOCATOR_TIMEOUT = 15000;

function copyExtension(sourceDir) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'html-inspector-ext-'));
    fs.cpSync(sourceDir, tmp, { recursive: true });
    const manifestPath = path.join(tmp, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.host_permissions = ['http://localhost/*', 'http://127.0.0.1/*'];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    return tmp;
}

async function launchWithExtension(extensionDir) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'html-inspector-profile-'));
    const context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        headless: true,
        args: [
            `--disable-extensions-except=${extensionDir}`,
            `--load-extension=${extensionDir}`,
        ],
    });
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: LOCATOR_TIMEOUT });
    return { context, worker };
}

/**
 * Fire the extension's own injection path in the page's tab — the same
 * `trigger(tabId)` that chrome.action.onClicked calls, after making the tab
 * active (the extension resolves the active tab itself in the real flow).
 */
async function triggerInjection(worker, page) {
    const tabId = await worker.evaluate(async (url) => {
        const tabs = await chrome.tabs.query({});
        const target = tabs.find((t) => t.url && t.url.startsWith(url));
        if (!target) return null;
        await chrome.tabs.update(target.id, { active: true });
        return target.id;
    }, page.url());
    if (tabId === null) throw new Error('extension harness: no tab for ' + page.url());
    await worker.evaluate(async (id) => { await trigger(id); }, tabId);
    return tabId;
}

async function waitForInspector(page) {
    await page.waitForSelector('#fab', { state: 'attached', timeout: LOCATOR_TIMEOUT });
}

module.exports = { copyExtension, launchWithExtension, triggerInjection, waitForInspector };
