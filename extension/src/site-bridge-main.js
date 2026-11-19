// DASH-471 — the site-mode capture shim, injected into the page's MAIN world
// by background.js when the page already has its own inspector (#fab+#fabSheet).
// It installs the SAME page global the host-mode bridge exposes
// (window.__htmlInspectorCapture) so the published bundle can arm its 📷 by
// looking for exactly that function — the bundle never learns about the
// extension, and this page-world file never touches the extension APIs (it has
// no access to them).
//
// Flow (the isolated relay carries the worker round-trip):
//   window.__htmlInspectorCapture(rect)                  (bundle calls this)
//     → postMessage({source, type:'capture-element', id, rect})
//     → site-bridge-relay.js (isolated world) → runtime message
//     → worker captureVisibleTab → { ok, dataUrl } | { ok:false, error }
//     → postMessage({source, type:'capture-element-result', id, …})
//     → crop in the page (DPR-clamped) → PNG → clipboard
//   resolve ⇒ the PNG is on the clipboard
//   reject  ⇒ clipboard refused: the blob was downloaded as element.png
//              (the error message says so); or "outside the viewport".
//
// The page-side work after the worker's data URL is exactly bridge.js's: the
// cropRect block below is a byte-identical copy, guarded by
// tests/unit/extension-site-bridge.test.js (the extension is unbuilt, so a
// textual drift guard is the honest cheap one — keep both copies identical).
(function () {
    'use strict';

    var SOURCE = 'menu-inspector-site-bridge';
    var RESULT = 'capture-element-result';
    var REPLY_TIMEOUT = 5000;

    // ── Crop math — keep this block BYTE-IDENTICAL to bridge.js ──────────
    // (rect, viewport, dpr) → {srcX, srcY, srcW, srcH} in DEVICE pixels, or
    // null when the clamped area is empty (the caller rejects with "outside
    // the viewport"). rect/viewport are CSS px; the viewport is
    // window.innerWidth/innerHeight. A rect that is half (or fully) outside
    // is clamped to the visible part, never sampled off-canvas.
    function cropRect(rect, viewport, dpr) {
        var scale = dpr > 0 ? dpr : 1;
        var vw = viewport && viewport.width > 0 ? viewport.width : 0;
        var vh = viewport && viewport.height > 0 ? viewport.height : 0;
        var left = Math.min(Math.max(rect.x, 0), vw);
        var top = Math.min(Math.max(rect.y, 0), vh);
        var right = Math.min(Math.max(rect.x + rect.width, 0), vw);
        var bottom = Math.min(Math.max(rect.y + rect.height, 0), vh);
        var width = right - left;
        var height = bottom - top;
        if (!(width > 0) || !(height > 0)) return null;
        return {
            srcX: Math.round(left * scale),
            srcY: Math.round(top * scale),
            srcW: Math.round(width * scale),
            srcH: Math.round(height * scale),
        };
    }
    // ── end cropRect ─────────────────────────────────────────────────────

    if (typeof window === 'undefined') return;
    // Guard against a second injection into the same document: the shim is
    // stateless apart from pending requests, and the first install stays valid.
    if (typeof window.__htmlInspectorCapture === 'function') return;

    var pending = {};
    var seq = 0;

    function onMessage(event) {
        var data = event && event.data;
        if (!data || data.source !== SOURCE || data.type !== RESULT) return;
        var entry = pending[data.id];
        if (!entry) return; // someone else's request (or a stale reply)
        delete pending[data.id];
        clearTimeout(entry.timer);
        if (data.ok === true) entry.resolve(data.dataUrl);
        else entry.reject(new Error(data.error || 'capture failed'));
    }
    window.addEventListener('message', onMessage);

    function uniqueId() {
        seq += 1;
        return SOURCE + '-' + Date.now() + '-' + seq + '-' + Math.random().toString(36).slice(2);
    }

    // Ask the isolated relay for the worker's PNG data URL. Bounded: a page
    // without the extension (or a torn-down worker) must reject, not hang.
    function requestDataUrl(rect) {
        return new Promise(function (resolve, reject) {
            var id = uniqueId();
            var timer = setTimeout(function () {
                if (!pending[id]) return;
                delete pending[id];
                reject(new Error('the extension did not answer the capture request'));
            }, REPLY_TIMEOUT);
            pending[id] = { resolve: resolve, reject: reject, timer: timer };
            try {
                window.postMessage({ source: SOURCE, type: 'capture-element', id: id, rect: rect }, '*');
            } catch (e) {
                delete pending[id];
                clearTimeout(timer);
                reject(e);
            }
        });
    }

    // ── Crop in the page + clipboard (same as bridge.js) ────────────────
    function canvasToPng(canvas) {
        return new Promise(function (resolve, reject) {
            canvas.toBlob(function (blob) {
                if (blob) resolve(blob);
                else reject(new Error('could not encode the image'));
            }, 'image/png');
        });
    }

    function savePng(blob) {
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'element.png';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(function () {
            URL.revokeObjectURL(url);
            if (link.parentNode) link.parentNode.removeChild(link);
        }, 0);
        return Promise.reject(new Error('Clipboard write failed — saved element.png instead'));
    }

    function copyPng(blob) {
        if (navigator.clipboard && typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
            try {
                return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                    .catch(function () { return savePng(blob); });
            } catch (e) {
                return savePng(blob);
            }
        }
        return savePng(blob);
    }

    function cropAndCapture(dataUrl, rect) {
        var dpr = rect && rect.dpr > 0 ? rect.dpr : (window.devicePixelRatio || 1);
        var plan = cropRect(rect, { width: window.innerWidth, height: window.innerHeight }, dpr);
        if (!plan) return Promise.reject(new Error('outside the viewport'));
        return fetch(dataUrl)
            .then(function (res) { return res.blob(); })
            .then(function (blob) { return createImageBitmap(blob); })
            .then(function (bitmap) {
                try {
                    var canvas = document.createElement('canvas');
                    canvas.width = plan.srcW;
                    canvas.height = plan.srcH;
                    var ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error('canvas is unavailable');
                    ctx.drawImage(bitmap, -plan.srcX, -plan.srcY);
                    return canvasToPng(canvas);
                } finally {
                    if (bitmap.close) bitmap.close();
                }
            });
    }

    // The bundle awaits this; resolving means "on the clipboard", rejecting
    // means "nothing was copied" (the error is the toast text).
    window.__htmlInspectorCapture = function (rect) {
        return window.__htmlInspectorCaptureBlob(rect).then(copyPng);
    };

    // INSP-010 — the download pill asks for the cropped PNG without copying.
    window.__htmlInspectorCaptureBlob = function (rect) {
        return requestDataUrl(rect).then(function (dataUrl) {
            if (!dataUrl) throw new Error('capture returned no image');
            return cropAndCapture(dataUrl, rect);
        });
    };
})();
