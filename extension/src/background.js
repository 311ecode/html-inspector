// DASH-466 v0 — on-demand inspector injection. The extension is a trigger, not
// a second inspector: it probes the page first, and only when neither #fab nor
// #fabSheet exists does it inject the published bundle. If they do exist, the
// page's own inspector wins and we draw nothing (and avoid double-wiring the
// bundle's listeners in the same document). activeTab + scripting mean nothing
// runs until the user invokes the shortcut or the toolbar icon.
//
// The JS bundle carries no styles — the dashboard page supplies them. On a
// third-party page we must insert the vendored CSS or the FAB is invisible.
const BUNDLE = 'vendor/inspector.js';
const STYLES = 'vendor/inspector.css';
const BRIDGE = 'src/bridge.js'; // DASH-469 — capture bridge, injected before the bundle
const SITE_RELAY = 'src/site-bridge-relay.js';   // DASH-471 — isolated-world round-trip
const SITE_MAIN = 'src/site-bridge-main.js';     // DASH-471 — MAIN-world capture shim
const BADGE_MS = 3000;

// Runs in the page. Presence is markup, not a global, so an isolated-world
// probe can see it; both ids together prove a fully booted inspector.
function hasInspector() {
    return !!(document.getElementById('fab') && document.getElementById('fabSheet'));
}

// Runs in the page BEFORE the bundle. DASH-466 host mode: the bundle reads
// this attribute at boot, hides its FAB/sheet chrome and arms a desktop
// picker instead. The bundle removes the attribute again on exit, so a second
// press is a fresh injection rather than a no-op.
function setHostMode() {
    document.documentElement.setAttribute('data-html-inspector-host', 'extension');
}

// DASH-471 — MAIN-world signal: the site's settled overlay re-checks for the
// capture bridge and arms its 📷/📋 immediately. Never re-injects the bundle
// or its listeners; it only tells the page's own inspector that the
// capability it was missing is now there.
function dispatchCaptureBridge() {
    document.dispatchEvent(new CustomEvent('menu-inspector:capture-bridge'));
}

function quiet(p) {
    if (p && typeof p.catch === 'function') p.catch(function() {});
}

// A page we cannot touch (chrome://, Web Store, PDF viewer, a closed tab) is
// expected, not fatal. The badge is the only feedback; the timer is best effort
// because the service worker may be torn down first.
function flashError(tabId) {
    quiet(chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: '#c0392b' }));
    quiet(chrome.action.setBadgeText({ tabId: tabId, text: '!' }));
    setTimeout(function() {
        quiet(chrome.action.setBadgeText({ tabId: tabId, text: '' }));
    }, BADGE_MS);
}

async function trigger(tabId) {
    if (typeof tabId !== 'number') {
        console.log('[html-inspector] no active tab — nothing to do');
        return;
    }
    try {
        const results = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: hasInspector });
        const present = !!(results && results[0] && results[0].result);
        if (present) {
            // DASH-471 — the site's own inspector wins the UI (no re-injection,
            // no double-wiring), but a page cannot capture its own screen. Donate
            // exactly that capability: the isolated relay carries the worker
            // round-trip, the MAIN-world shim installs the page global the
            // bundle already looks for, and the event arms an overlay that is
            // already settled. The site bundle 0.4.3 does the rest.
            await chrome.scripting.executeScript({ target: { tabId: tabId }, files: [SITE_RELAY] });
            await chrome.scripting.executeScript({ target: { tabId: tabId }, files: [SITE_MAIN], world: 'MAIN' });
            await chrome.scripting.executeScript({ target: { tabId: tabId }, func: dispatchCaptureBridge, world: 'MAIN' });
            console.log('[html-inspector] tab ' + tabId + ': site inspector present — donated the capture bridge');
            return;
        }
        // The host marker must be in the page before the bundle boots.
        await chrome.scripting.executeScript({ target: { tabId: tabId }, func: setHostMode });
        // DASH-469 — the capture bridge, in the same isolated world and
        // BEFORE the bundle: the bundle caches "bridge present?" at boot.
        await chrome.scripting.executeScript({ target: { tabId: tabId }, files: [BRIDGE] });
        // insertCSS is idempotent per document; only the not-present path runs.
        await chrome.scripting.insertCSS({ target: { tabId: tabId }, files: [STYLES] });
        await chrome.scripting.executeScript({ target: { tabId: tabId }, files: [BUNDLE] });
        console.log('[html-inspector] tab ' + tabId + ': injected ' + BRIDGE + ' + ' + BUNDLE + ' + ' + STYLES);
    } catch (e) {
        console.log('[html-inspector] tab ' + tabId + ': cannot inject (' + (e && e.message) + ')');
        flashError(tabId);
    }
}

chrome.action.onClicked.addListener(function(tab) {
    if (tab && typeof tab.id === 'number') {
        trigger(tab.id); // fire-and-forget; trigger() catches its own failures
        return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        trigger(tabs && tabs[0] ? tabs[0].id : undefined);
    });
});

// ── DASH-469 — capture-element: the bridge's worker half ────────────────
// captureVisibleTab is viewport-only and allowed by activeTab (the action
// click that injected the bundle is the user gesture); no new permission.
// Answer the page with a PNG data URL, or an error string it can toast.
async function captureVisible(sender) {
    let windowId = sender && sender.tab ? sender.tab.windowId : undefined;
    if (typeof windowId !== 'number') {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        windowId = tabs && tabs[0] ? tabs[0].windowId : undefined;
    }
    if (typeof windowId !== 'number') throw new Error('no active window to capture');
    return chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (!message || message.type !== 'capture-element') return false;
    captureVisible(sender).then(
        function(dataUrl) { sendResponse({ ok: true, dataUrl: dataUrl }); },
        function(err) { sendResponse({ ok: false, error: (err && err.message) || String(err) }); }
    );
    return true; // keep the reply channel open for the async capture
});
