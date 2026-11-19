#!/usr/bin/env node
// scripts/publish-inspector.cjs — DASH-290a, the inspector registry's
// "createrepo" (DASH-290 §Design 1/4).
//
// Builds the committed, versioned static package repository under
// `registry/` from the source of truth `inspector/`. This is the
// `scripts/regen-*.cjs` idiom (deterministic render + `--check` default +
// `--write`), specialised for the RPM-style layout of DASH-290:
//
//   registry/index.json                        the index ("repomd.xml")
//   registry/inspector/<version>/manifest.json per-version metadata + hashes
//   registry/inspector/<version>/inspector.js  the built, READABLE bundle
//   registry/inspector/<version>/inspector.css the compiled stylesheet
//   registry/inspector/v1/…                    the floating channel — real
//                                              copies of `latest`, never a 302
//
// What "built" means (DASH-290 §4) — and must not mean:
//   JS:  concatenate inspector/src/*.js in the fixed explicit JS_ORDER + a
//        version/protocol banner. No transform, no minify, no bundler.
//   CSS: `sass inspector/src/inspector.scss` (the shared vars/theme live in
//        the package stylesheet is self-contained — no host load path).
// Then sha256 + byte size per file into manifest.json and regenerate
// index.json + the v1 copy. Old versions are never rebuilt or removed.
//
// Determinism is part of the contract, not a nicety (DASH-290 §5):
//   - publishedAt comes from the git commit date of inspector/src, never
//     Date.now();
//   - versions[] is sorted explicitly, ascending by semver — readdir order
//     never leaks into the output;
//   - no absolute paths, hostnames or run ids appear in any generated file;
//   - two consecutive runs are byte-identical.
//
// Usage:
//   node scripts/publish-inspector.cjs            # --check (default, exit 1 on drift)
//   node scripts/publish-inspector.cjs --write    # (re)generate registry/
//   node scripts/publish-inspector.cjs --help
//
// Dependency note: the ticket says "only fs, path, crypto (+ sass)". That is
// true of every third-party dependency — but `publishedAt` is contractually
// the git commit date of the source, so `node:child_process` runs `git log`
// (the same call scripts/regen-systemd-units.cjs and friends make). fs/path/
// crypto are the only modules used to read, hash and write the tree.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const PKG_DIR = path.join(REPO, 'inspector');
const SRC_DIR = path.join(PKG_DIR, 'src');
const REGISTRY = path.join(REPO, 'registry');
const REGISTRY_SRC = path.join(REGISTRY, 'inspector');

// The floating channel and the fixed, explicit JS concatenation order. Listing
// the order here (rather than trusting readdir) is what makes the bundle
// deterministic; buildJs() fails loudly if src/*.js no longer matches it.
const CHANNEL = 'v1';
const JS_ORDER = ['inspector.js'];

function ok(msg) { process.stdout.write(`✓  ${msg}\n`); }
function log(msg) { process.stdout.write(`▶  ${msg}\n`); }
function fail(msg) { process.stderr.write(`✗  ${msg}\n`); }

const HELP = `publish-inspector — build the html-inspector static registry.

Usage:
  node scripts/publish-inspector.cjs            # check the committed registry (default)
  node scripts/publish-inspector.cjs --write    # regenerate registry/ in place

  --check    report drift against registry/, exit 1 on any drift (default)
  --write    (re)build the current version, refresh index.json and the v1 channel
  --help     this text`;

function git(args) {
  return execFileSync('git', ['-C', REPO, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

// publishedAt: the commit date of the source, never the wall clock. An
// uncommitted inspector/src (first generation) falls back to HEAD's date with
// a warning — the committed run then pins the real source date.
function sourceDate() {
  let iso = '';
  try { iso = git(['log', '-1', '--format=%cI', '--', 'inspector/src']); } catch (e) { iso = ''; }
  if (!iso) {
    process.stderr.write('publish-inspector: inspector/src has no commit yet — falling back to HEAD commit date\n');
    iso = git(['log', '-1', '--format=%cI']);
  }
  if (!iso) throw new Error('cannot derive publishedAt: no git commit date available');
  return iso;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function json(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function readPackage() {
  const pkg = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'));
  for (const key of ['name', 'version', 'protocolVersion']) {
    if (!pkg[key]) throw new Error(`inspector/package.json is missing "${key}"`);
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) {
    throw new Error(`inspector/package.json version ${JSON.stringify(pkg.version)} is not semver`);
  }
  return pkg;
}

// ── the two builds ─────────────────────────────────────────────────────

function buildJs(pkg) {
  const present = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.js')).sort();
  const declared = [...JS_ORDER].sort();
  const extra = present.filter((f) => !declared.includes(f));
  const missing = declared.filter((f) => !present.includes(f));
  if (extra.length || missing.length) {
    throw new Error(
      'inspector/src/*.js does not match the fixed build order JS_ORDER ' +
      `[${JS_ORDER.join(', ')}]` +
      (extra.length ? ` — unlisted: ${extra.join(', ')}` : '') +
      (missing.length ? ` — missing: ${missing.join(', ')}` : '')
    );
  }
  const banner =
    `// ${pkg.name} v${pkg.version} — protocolVersion ${pkg.protocolVersion}\n` +
    '// GENERATED by scripts/publish-inspector.cjs from inspector/src/ — do not edit.\n' +
    '// Readable by design: no minify, no bundle, no transform.\n\n';
  // INSP-008 — the runtime version chip. Source keeps the placeholder (ui
  // fixtures hide the chip); only the generated registry bundle is stamped.
  const body = JS_ORDER.map((f) => fs.readFileSync(path.join(SRC_DIR, f), 'utf8'))
    .join('')
    .split('__INSPECTOR_VERSION__').join(pkg.version);
  return Buffer.from(banner + body, 'utf8');
}

function buildCss() {
  // Required lazily so `--check` still runs if sass is absent (it is not).
  const sass = require('sass');
  const result = sass.compile(path.join(SRC_DIR, 'inspector.scss'));
  const css = result.css.endsWith('\n') ? result.css : result.css + '\n';
  return Buffer.from(css, 'utf8');
}

// ── semver, ascending and explicit ─────────────────────────────────────

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(v);
  if (!m) throw new Error(`not a semver version: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.') : [] };
}

function compareSemver(a, b) {
  const A = parseSemver(a);
  const B = parseSemver(b);
  for (const key of ['major', 'minor', 'patch']) {
    if (A[key] !== B[key]) return A[key] - B[key];
  }
  if (A.pre.length === 0 && B.pre.length === 0) return 0;
  if (A.pre.length === 0) return 1; // a release ranks above its prereleases
  if (B.pre.length === 0) return -1;
  for (let i = 0; i < Math.max(A.pre.length, B.pre.length); i++) {
    const x = A.pre[i];
    const y = B.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) { if (+x !== +y) return +x - +y; }
    else if (xn) return -1;       // numeric identifiers rank below alphanumeric
    else if (yn) return 1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// ── the registry model ─────────────────────────────────────────────────

function listPublishedVersions() {
  if (!fs.existsSync(REGISTRY_SRC)) return [];
  return fs.readdirSync(REGISTRY_SRC, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== CHANNEL && /^\d+\.\d+\.\d+/.test(e.name))
    .map((e) => e.name);
}

function readDeprecated() {
  const file = path.join(REGISTRY, 'index.json');
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  const index = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const entry of index.versions || []) map.set(entry.version, !!entry.deprecated);
  return map;
}

// The complete expected tree: repo-relative POSIX path → Buffer. `--check`
// compares it to disk; `--write` writes it. Nothing here depends on readdir
// order or the wall clock.
function buildRegistry() {
  const pkg = readPackage();
  const js = buildJs(pkg);
  const css = buildCss();
  const publishedAt = sourceDate();
  const currentManifest = {
    schema: 1,
    package: pkg.name,
    version: pkg.version,
    protocolVersion: pkg.protocolVersion,
    publishedAt,
    files: [
      { name: 'inspector.js', bytes: js.length, sha256: sha256(js) },
      { name: 'inspector.css', bytes: css.length, sha256: sha256(css) },
    ],
  };

  const versions = [...new Set([...listPublishedVersions(), pkg.version])].sort(compareSemver);
  const deprecated = readDeprecated();
  const manifests = new Map();
  for (const version of versions) {
    if (version === pkg.version) { manifests.set(version, currentManifest); continue; }
    const file = path.join(REGISTRY_SRC, version, 'manifest.json');
    if (!fs.existsSync(file)) throw new Error(`published version ${version} has no manifest.json`);
    manifests.set(version, JSON.parse(fs.readFileSync(file, 'utf8')));
  }

  const index = {
    schema: 1,
    package: pkg.name,
    latest: versions[versions.length - 1],
    channel: CHANNEL,
    channelPath: `inspector/${CHANNEL}/`,
    versions: versions.map((version) => {
      const manifest = manifests.get(version);
      const files = {};
      for (const f of manifest.files) files[f.name] = f.sha256;
      return {
        version,
        path: `inspector/${version}/`,
        protocolVersion: manifest.protocolVersion,
        publishedAt: manifest.publishedAt,
        deprecated: deprecated.has(version) ? deprecated.get(version) : false,
        files,
      };
    }),
  };

  // The floating channel is real files: the latest version's byte-identical copies.
  const latest = index.latest;
  const channelJs = latest === pkg.version ? js : fs.readFileSync(path.join(REGISTRY_SRC, latest, 'inspector.js'));
  const channelCss = latest === pkg.version ? css : fs.readFileSync(path.join(REGISTRY_SRC, latest, 'inspector.css'));

  const files = new Map();
  files.set('index.json', Buffer.from(json(index), 'utf8'));
  files.set(`inspector/${pkg.version}/inspector.js`, js);
  files.set(`inspector/${pkg.version}/inspector.css`, css);
  files.set(`inspector/${pkg.version}/manifest.json`, Buffer.from(json(currentManifest), 'utf8'));
  files.set(`inspector/${CHANNEL}/inspector.js`, channelJs);
  files.set(`inspector/${CHANNEL}/inspector.css`, channelCss);
  return { files, pkg, latest };
}

function abs(rel) {
  return path.join(REGISTRY, ...rel.split('/'));
}

function check(files) {
  let drift = 0;
  for (const [rel, expected] of files) {
    const file = abs(rel);
    const actual = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if (actual === null) { fail(`${rel}: MISSING`); drift++; }
    else if (!actual.equals(expected)) { fail(`${rel}: DIFFERS`); drift++; }
    else log(`${rel}: identical`);
  }
  if (drift) {
    fail(`${drift} file(s) drift — run: node scripts/publish-inspector.cjs --write`);
    return 1;
  }
  ok('registry is up to date');
  return 0;
}

function write(files) {
  let written = 0;
  for (const [rel, content] of files) {
    const file = abs(rel);
    const actual = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if (actual && actual.equals(content)) { log(`${rel}: identical`); continue; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    ok(`${actual === null ? 'created' : 'updated'} ${rel}`);
    written++;
  }
  if (!written) ok('no drift — nothing to write');
  return 0;
}

// DASH-467 — a publish also refreshes the extension's vendored bundle. The
// zip is repo-exact, so an unsynced extension/vendor/ would ship a stale
// bundle under the new version. `--write` only: the default check and the
// determinism gate stay read-only and byte-identical.
function syncExtensionVendor() {
  const script = path.join(REPO, 'extension', 'tools', 'sync-vendor.mjs');
  execFileSync(process.execPath, [script], { cwd: REPO, stdio: 'inherit' });
  ok('synced extension/vendor/ from registry/inspector/v1/');
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { process.stdout.write(HELP + '\n'); return 0; }
  const unknown = args.filter((a) => a !== '--check' && a !== '--write');
  if (unknown.length) { fail(`unknown argument: ${unknown[0]}`); return 2; }

  let files;
  try {
    ({ files } = buildRegistry());
  } catch (err) {
    fail(err.message);
    return 2;
  }
  if (!args.includes('--write')) return check(files);
  const status = write(files);
  if (status !== 0) return status;
  try {
    syncExtensionVendor();
  } catch (err) {
    fail(`extension vendor sync failed — ${err.message}`);
    return 2;
  }
  return 0;
}

process.exit(main());
