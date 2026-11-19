// DASH-469 — the host-mode capture bridge. Injected as a FILE (not an inline
// func) by background.js right after the host attribute and before the
// published bundle, in the same isolated world. It is deliberately
// self-contained: the coordinator's acceptance harness (and any browser test)
// can inject this exact file into a plain tab and exercise the real
// capture → crop → clipboard path without re-implementing it.
//
// Flow:
//   window.__htmlInspectorCapture(rect)            (bundle calls this)
//     → chrome.runtime.sendMessage({type:'capture-element', rect})
//     → worker replies { ok:true, dataUrl } | { ok:false, error }
//     → fetch(dataUrl) → createImageBitmap → canvas (clamped crop, DPR)
//     → canvas.toBlob('image/png')
//     → navigator.clipboard.write([new ClipboardItem({'image/png': blob})])
//   resolve  ⇒ the PNG is on the clipboard
//   reject   ⇒ clipboard refused: the blob was downloaded as element.png
//              (the error message says so); or "outside the viewport".
//
// The bundle stays chrome-free: this file is the only place `chrome.*` is
// referenced on the page side.
(function (root) {
    'use strict';

    // ── Crop math (pure, AC 4) ──────────────────────────────────────────
    // Drift guard: tests/unit/extension-site-bridge.test.js extracts this
    // exact cropRect block from site-bridge-main.js and asserts it is
    // byte-identical — change both copies together.
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

    // Node exports make the pure math unit-testable without a browser; the
    // page-side install below never runs under node (no window/chrome).
    if (typeof module === 'object' && module.exports) {
        module.exports = { cropRect: cropRect };
    }

    if (typeof window === 'undefined') return;
    if (typeof chrome === 'undefined' || !chrome.runtime) return;
    // Guard against a second injection into the same document: the bridge is
    // stateless and the first install stays valid.
    if (typeof window.__htmlInspectorCapture === 'function') return;

    // ── Worker round-trip: { ok, dataUrl } | { ok:false, error } ────────
    function requestDataUrl(rect) {
        return new Promise(function (resolve, reject) {
            try {
                chrome.runtime.sendMessage({ type: 'capture-element', rect: rect }, function (reply) {
                    var err = chrome.runtime.lastError;
                    if (err) {
                        reject(new Error(err.message || 'the extension could not be reached'));
                        return;
                    }
                    if (!reply || reply.ok !== true) {
                        reject(new Error((reply && reply.error) || 'capture failed'));
                        return;
                    }
                    if (!reply.dataUrl) {
                        reject(new Error('capture returned no image'));
                        return;
                    }
                    resolve(reply.dataUrl);
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    // ── Crop in the page + clipboard (AC 4/5) ───────────────────────────
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

    function cropAndCopy(dataUrl, rect) {
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
            })
            .then(copyPng);
    }

    // The bundle awaits this; resolving means "on the clipboard", rejecting
    // means "nothing was copied" (the error is the toast text).
    window.__htmlInspectorCapture = function (rect) {
        return requestDataUrl(rect).then(function (dataUrl) {
            return cropAndCopy(dataUrl, rect);
        });
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
