// DASH-471 — the site-mode capture relay, injected into the extension's
// ISOLATED world by background.js when the page already has its own inspector.
// The page's MAIN-world shim (site-bridge-main.js) cannot reach chrome.*; this
// file carries only the postMessage ↔ chrome.runtime.sendMessage round-trip,
// reusing the worker's existing 'capture-element' handler unchanged. It does
// no DOM work and touches no page globals other than its own guard.
//
//   site-bridge-main.js (MAIN)                this file (ISOLATED)
//   postMessage capture-element        →      chrome.runtime.sendMessage
//   postMessage capture-element-result ←      worker reply
//
// Idempotent: a second injection into the same document is a no-op.
(function () {
    'use strict';

    if (window.__htmlInspectorSiteRelay) return;
    window.__htmlInspectorSiteRelay = true;

    var SOURCE = 'menu-inspector-site-bridge';
    var RESULT = 'capture-element-result';

    function reply(id, body) {
        var message = { source: SOURCE, type: RESULT, id: id };
        for (var key in body) {
            if (Object.prototype.hasOwnProperty.call(body, key)) message[key] = body[key];
        }
        window.postMessage(message, '*');
    }

    window.addEventListener('message', function (event) {
        var data = event && event.data;
        if (!data || data.source !== SOURCE || data.type !== 'capture-element') return;
        if (typeof data.id !== 'string') return;

        try {
            chrome.runtime.sendMessage({ type: 'capture-element', rect: data.rect }, function (response) {
                var err = chrome.runtime.lastError;
                if (err) {
                    reply(data.id, { ok: false, error: err.message || 'the extension could not be reached' });
                    return;
                }
                if (!response || response.ok !== true) {
                    reply(data.id, { ok: false, error: (response && response.error) || 'capture failed' });
                    return;
                }
                if (!response.dataUrl) {
                    reply(data.id, { ok: false, error: 'capture returned no image' });
                    return;
                }
                reply(data.id, { ok: true, dataUrl: response.dataUrl });
            });
        } catch (e) {
            reply(data.id, { ok: false, error: (e && e.message) || String(e) });
        }
    });
})();
