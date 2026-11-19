// test/e2e/lib/serve.js — the throwaway "third-party site" server.
//
// Serves the plain fixture at `/`, the embed fixture at `/embed` (with
// __REGISTRY_BASE__ substituted, so the same page proves the local registry and
// the published Pages registry), and the repo's registry tree at `/registry/**`
// for hermetic mode. Ephemeral port, one server per spec, closed in afterAll.
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const FIXTURES = path.join(__dirname, '..', 'fixtures');

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
};

function sendFile(res, file) {
    const resolved = path.resolve(file);
    if (!resolved.startsWith(ROOT) && !resolved.startsWith(FIXTURES)) {
        res.writeHead(403).end('forbidden');
        return;
    }
    let body;
    try {
        body = fs.readFileSync(resolved);
    } catch (e) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(resolved)] || 'application/octet-stream' });
    res.end(body);
}

function startServer(opts) {
    const registryBase = (opts && opts.registryBase) || '/registry';
    const server = http.createServer((req, res) => {
        let pathname;
        try {
            pathname = decodeURIComponent(new URL(req.url, 'http://fixture.invalid').pathname);
        } catch (e) {
            res.writeHead(400).end('bad url');
            return;
        }
        if (pathname === '/' || pathname === '/index.html') {
            sendFile(res, path.join(FIXTURES, 'third-party', 'index.html'));
            return;
        }
        if (pathname === '/embed' || pathname === '/embed/') {
            const html = fs
                .readFileSync(path.join(FIXTURES, 'embed', 'index.html'), 'utf8')
                .replaceAll('__REGISTRY_BASE__', registryBase);
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
        }
        if (pathname.startsWith('/registry/')) {
            sendFile(res, path.join(ROOT, pathname.replace(/^\/+/, '')));
            return;
        }
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                port,
                base: `http://127.0.0.1:${port}`,
                close: () => new Promise((done) => server.close(done)),
            });
        });
    });
}

module.exports = { startServer, ROOT, FIXTURES };
