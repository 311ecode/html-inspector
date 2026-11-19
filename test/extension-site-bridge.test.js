// test/extension-site-bridge.test.js — DASH-471 (ported from menu-dashboard).
//
// The extension's site-mode donation has three parts: a MAIN-world shim that
// installs the same page global (window.__htmlInspectorCapture) the host-mode
// bridge exposes, an isolated-world relay that carries only the existing
// worker round-trip, and the background branch that injects both for a page
// that already has its own inspector. These pins keep the split honest:
//   - the shim cannot reference the extension APIs (it runs in the page world);
//   - the crop math is not a second, divergent implementation (textual drift
//     guard against bridge.js — the extension is unbuilt);
//   - no manifest permission was added;
//   - background.js really references and injects both files, in order, with
//     world:'MAIN' for the shim + event;
//   - the published registry latest, its byte-identical v1 channel, the vendored
//     copy and the derived artifact facts still line up.
//   - DASH-473: the release is READ from registry/index.json, never pinned, so
//     a bundle bump (0.4.3 → 0.4.4) cannot red this suite.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const BACKGROUND = path.join(EXT, 'src', 'background.js');
const BRIDGE = path.join(EXT, 'src', 'bridge.js');
const RELAY = path.join(EXT, 'src', 'site-bridge-relay.js');
const MAIN = path.join(EXT, 'src', 'site-bridge-main.js');
const REGISTRY = path.join(ROOT, 'registry', 'inspector');
const INDEX = path.join(ROOT, 'registry', 'index.json');
const artifact = require('../lib/artifact');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

// Extract `function cropRect(...) { ... }` by brace matching. cropRect has no
// braces inside strings/comments, so a depth counter is exact.
function extractCropRect(source) {
  const start = source.indexOf('function cropRect(');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

const bundleHeader = (text) => text.split('\n')[0];

test('the two site-bridge files exist and background.js injects relay → MAIN shim → MAIN event', function() {
  assert.ok(fs.existsSync(MAIN), 'extension/src/site-bridge-main.js is missing');
  assert.ok(fs.existsSync(RELAY), 'extension/src/site-bridge-relay.js is missing');

  const source = read(BACKGROUND);
  assert.ok(source.includes("const SITE_RELAY = 'src/site-bridge-relay.js'"), 'background declares the relay');
  assert.ok(source.includes("const SITE_MAIN = 'src/site-bridge-main.js'"), 'background declares the main shim');

  const relayAt = source.indexOf('files: [SITE_RELAY]');
  const mainAt = source.indexOf("files: [SITE_MAIN], world: 'MAIN'");
  const eventAt = source.indexOf("func: dispatchCaptureBridge, world: 'MAIN'");
  assert.ok(relayAt !== -1, 'the isolated relay is injected as a file');
  assert.ok(mainAt !== -1, "the MAIN shim is injected with world: 'MAIN'");
  assert.ok(eventAt !== -1, "the capture-bridge event is dispatched in world: 'MAIN'");
  assert.ok(relayAt < mainAt, 'the isolated relay is injected before the MAIN shim');
  assert.ok(mainAt < eventAt, 'the MAIN shim is installed before the event is dispatched');

  // The site branch must NOT re-inject the bundle or the stylesheet — the
  // page's own inspector wins; only the capture capability is donated.
  const present = source.slice(source.indexOf('if (present)'), source.indexOf('// The host marker must be in the page'));
  assert.ok(present.includes('donated the capture bridge'));
  assert.ok(!present.includes('files: [BUNDLE]'), 'the site branch never re-injects the bundle');
  assert.ok(!present.includes('files: [STYLES]'), 'the site branch never re-injects the CSS');

  assert.ok(source.includes("document.dispatchEvent(new CustomEvent('menu-inspector:capture-bridge'))"));
});

test('the MAIN-world shim references no extension API (it runs in the page world)', function() {
  const source = read(MAIN);
  // Strip comments first so the prose may name the extension without tripping
  // the guard; the executable code must never touch the APIs.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/\bchrome\s*[.[]/.test(code), 'site-bridge-main.js must not reference chrome.*');
  assert.ok(!/\bbrowser\s*[.[]/.test(code), 'site-bridge-main.js must not reference browser.*');
  assert.ok(source.includes('window.__htmlInspectorCapture = function'), 'it installs the page global');
  assert.ok(source.includes("source: SOURCE, type: 'capture-element'"), 'it posts the capture request');
});

test('the isolated relay is idempotent, does no DOM work, and reuses the worker message type', function() {
  const source = read(RELAY);
  assert.ok(source.includes('if (window.__htmlInspectorSiteRelay) return;'), 'a second injection is a no-op');
  assert.ok(source.includes("type: 'capture-element'"), 'it sends the existing worker message type');
  assert.ok(source.includes("type: RESULT"), 'it posts the result back');
  assert.ok(!/\bdocument\s*\./.test(source), 'the relay touches no page DOM');
});

test('the manifest gains no permission for the MAIN-world injection', function() {
  const manifest = JSON.parse(read(path.join(EXT, 'manifest.json')));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'clipboardWrite', 'scripting']);
  assert.equal(manifest.host_permissions, undefined);
  assert.ok(!Object.prototype.hasOwnProperty.call(manifest, 'content_scripts'));
});

test('cropRect in site-bridge-main.js is byte-identical to bridge.js (drift guard)', function() {
  const host = extractCropRect(read(BRIDGE));
  const site = extractCropRect(read(MAIN));
  assert.ok(host, 'bridge.js has a cropRect block');
  assert.ok(site, 'site-bridge-main.js has a cropRect block');
  assert.equal(
    site,
    host,
    'the crop math drifted — site-bridge-main.js must carry the exact bridge.js cropRect block'
  );
});

test('registry latest (protocol 3) is the byte-identical v1 channel + vendor, and the extension artifact still builds', function() {
  const index = JSON.parse(read(INDEX));
  const latestVersion = index.latest;
  const latest = index.versions.find((v) => v.version === latestVersion);
  assert.ok(latest, `index.json lists ${latestVersion}`);
  assert.equal(latest.protocolVersion, 3);
  assert.equal(latest.version, index.latest);

  const versionedJs = fs.readFileSync(path.join(REGISTRY, latestVersion, 'inspector.js'));
  const channelJs = fs.readFileSync(path.join(REGISTRY, 'v1', 'inspector.js'));
  const vendorJs = fs.readFileSync(path.join(EXT, 'vendor', 'inspector.js'));
  assert.ok(channelJs.equals(versionedJs), `registry/inspector/v1 is a byte-identical copy of ${latestVersion}`);
  assert.ok(vendorJs.equals(versionedJs), `extension/vendor/inspector.js is the published ${latestVersion} bundle`);
  assert.match(
    bundleHeader(versionedJs.toString('utf8')),
    new RegExp('^// menu-inspector v' + latestVersion.replace(/\./g, '\\.') + ' — protocolVersion 3$')
  );

  const built = artifact.buildExtensionArtifact({ repoRoot: ROOT });
  assert.match(built.version, /^0\.1\.\d+$/, 'the extension version is explicit in manifest.json');
  assert.match(built.build, /^[0-9a-f]{64}$/);
});
