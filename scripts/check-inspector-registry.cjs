#!/usr/bin/env node
// scripts/check-inspector-registry.cjs — DASH-290a.
//
// The registry's verifier, and the two CI gates that are not the generator
// itself (DASH-290 §10):
//
//   --immutable   every published <version>/ is byte-identical to its
//                 manifest.json (and index.json entry) — the file hashes and
//                 byte sizes on disk are recomputed. Read-only. This is the
//                 rule that makes pinning mean something (DASH-290 Decision 5).
//   --determinism run the generator twice and prove the tree is byte-identical
//                 each time, and that publishedAt is the git source date — not
//                 Date.now().
//   --release <tag>  the tag's version exists, is immutable, and index.json's
//                 `latest` equals the tag.
//
// It never writes (except that --determinism runs the generator, whose whole
// point is to be a no-op). Usage:
//   node scripts/check-inspector-registry.cjs --immutable
//   node scripts/check-inspector-registry.cjs --determinism
//   node scripts/check-inspector-registry.cjs --release inspector-v0.1.0

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const PKG_DIR = path.join(REPO, 'inspector');
const REGISTRY = path.join(REPO, 'registry');
const REGISTRY_SRC = path.join(REGISTRY, 'inspector');
const GENERATOR = path.join(__dirname, 'publish-inspector.cjs');
const CHANNEL = 'v1';
const BUILT_FILES = ['inspector.js', 'inspector.css'];

function ok(msg) { process.stdout.write(`✓  ${msg}\n`); }
function log(msg) { process.stdout.write(`▶  ${msg}\n`); }
function fail(msg) { process.stderr.write(`✗  ${msg}\n`); }

const HELP = `check-inspector-registry (DASH-290a) — verify the committed inspector registry.

Usage:
  node scripts/check-inspector-registry.cjs --immutable        # published files match their hashes (default)
  node scripts/check-inspector-registry.cjs --determinism      # two generator runs are byte-identical
  node scripts/check-inspector-registry.cjs --release <tag>    # inspector-v<version> exists + is latest`;

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listVersions() {
  if (!fs.existsSync(REGISTRY_SRC)) return [];
  return fs.readdirSync(REGISTRY_SRC, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== CHANNEL && /^\d+\.\d+\.\d+/.test(e.name))
    .map((e) => e.name)
    .sort();
}

function readIndex() {
  const file = path.join(REGISTRY, 'index.json');
  if (!fs.existsSync(file)) throw new Error('registry/index.json is missing');
  return readJson(file);
}

function readManifest(version) {
  const file = path.join(REGISTRY_SRC, version, 'manifest.json');
  if (!fs.existsSync(file)) throw new Error(`registry/inspector/${version}/manifest.json is missing`);
  return readJson(file);
}

// ── immutability ───────────────────────────────────────────────────────

function checkVersion(version, indexEntry) {
  let errors = 0;
  const dir = path.join(REGISTRY_SRC, version);

  const present = fs.readdirSync(dir).sort();
  const expectedFiles = [...BUILT_FILES, 'manifest.json'].sort();
  const unexpected = present.filter((f) => !expectedFiles.includes(f));
  const missing = expectedFiles.filter((f) => !present.includes(f));
  if (unexpected.length) { fail(`inspector/${version}/: unexpected file(s): ${unexpected.join(', ')}`); errors++; }
  if (missing.length) { fail(`inspector/${version}/: missing file(s): ${missing.join(', ')}`); errors++; }

  let manifest;
  try { manifest = readManifest(version); }
  catch (err) { fail(err.message); return errors + 1; }

  if (manifest.schema !== 1) { fail(`inspector/${version}/manifest.json: schema != 1`); errors++; }
  if (manifest.version !== version) { fail(`inspector/${version}/manifest.json: version ${manifest.version} != directory ${version}`); errors++; }
  if (!Array.isArray(manifest.files)) { fail(`inspector/${version}/manifest.json: files is not an array`); return errors + 1; }

  const byName = new Map(manifest.files.map((f) => [f.name, f]));
  for (const name of BUILT_FILES) {
    const record = byName.get(name);
    if (!record) { fail(`inspector/${version}/manifest.json: no entry for ${name}`); errors++; continue; }
    const buf = fs.readFileSync(path.join(dir, name));
    const actualHash = sha256(buf);
    if (buf.length !== record.bytes) { fail(`inspector/${version}/${name}: ${buf.length} bytes != manifest ${record.bytes}`); errors++; }
    if (actualHash !== record.sha256) { fail(`inspector/${version}/${name}: sha256 ${actualHash} != manifest ${record.sha256}`); errors++; }
    if (indexEntry) {
      if (!indexEntry.files || indexEntry.files[name] !== record.sha256) {
        fail(`registry/index.json: inspector/${version}/${name} hash != manifest`); errors++;
      }
    }
  }
  if (indexEntry) {
    if (indexEntry.protocolVersion !== manifest.protocolVersion) { fail(`registry/index.json: ${version} protocolVersion != manifest`); errors++; }
    if (indexEntry.publishedAt !== manifest.publishedAt) { fail(`registry/index.json: ${version} publishedAt != manifest`); errors++; }
  }
  if (!errors) ok(`inspector/${version}/: ${BUILT_FILES.length} file(s) byte-identical to manifest.json`);
  return errors;
}

function checkImmutable() {
  let errors = 0;
  let index;
  try { index = readIndex(); }
  catch (err) { fail(err.message); return 1; }

  if (index.schema !== 1) { fail('registry/index.json: schema != 1'); errors++; }
  if (!Array.isArray(index.versions)) { fail('registry/index.json: versions is not an array'); return errors + 1; }
  if (index.channel !== CHANNEL) { fail(`registry/index.json: channel != ${CHANNEL}`); errors++; }
  if (index.channelPath !== `inspector/${CHANNEL}/`) { fail('registry/index.json: channelPath != inspector/v1/'); errors++; }

  const byVersion = new Map(index.versions.map((e) => [e.version, e]));
  const versions = listVersions();
  for (const version of versions) errors += checkVersion(version, byVersion.get(version));

  for (const entry of index.versions) {
    if (!versions.includes(entry.version)) { fail(`registry/index.json lists ${entry.version} with no directory`); errors++; }
  }
  if (!index.versions.some((e) => e.version === index.latest)) { fail(`registry/index.json: latest ${index.latest} is not in versions[]`); errors++; }

  // v1 is real files, byte-identical to `latest` (never a symlink/redirect).
  const latest = index.latest;
  if (versions.includes(latest)) {
    for (const name of BUILT_FILES) {
      const channelFile = path.join(REGISTRY_SRC, CHANNEL, name);
      const latestFile = path.join(REGISTRY_SRC, latest, name);
      if (!fs.existsSync(channelFile)) { fail(`registry/inspector/${CHANNEL}/${name} is missing`); errors++; continue; }
      if (!fs.readFileSync(channelFile).equals(fs.readFileSync(latestFile))) {
        fail(`registry/inspector/${CHANNEL}/${name} is not byte-identical to ${latest}`); errors++;
      }
    }
    if (!errors) ok(`registry/inspector/${CHANNEL}/: real files byte-identical to ${latest}`);
  }

  if (errors) { fail(`${errors} immutability error(s)`); return 1; }
  ok(`all ${versions.length} published version(s) are immutable`);
  return 0;
}

// ── determinism ────────────────────────────────────────────────────────

function treeHash() {
  const entries = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) {
        const rel = path.relative(REGISTRY, full).split(path.sep).join('/');
        entries.push(`${rel}:${sha256(fs.readFileSync(full))}`);
      }
    }
  };
  if (fs.existsSync(REGISTRY)) walk(REGISTRY);
  return sha256(Buffer.from(entries.join('\n'), 'utf8'));
}

function sourceDate() {
  return execFileSync('git', ['-C', REPO, 'log', '-1', '--format=%cI', '--', 'inspector/src'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function runGenerator() {
  execFileSync(process.execPath, [GENERATOR, '--write'], { cwd: REPO, stdio: 'inherit' });
}

function checkDeterminism() {
  let errors = 0;
  const before = treeHash();
  runGenerator();
  const first = treeHash();
  if (first !== before) {
    fail(`generator is not idempotent on a clean tree — registry changed (${before} → ${first})`);
    errors++;
  }
  runGenerator();
  const second = treeHash();
  if (second !== first) {
    fail(`two consecutive generator runs are not byte-identical (${first} → ${second})`);
    errors++;
  }

  // publishedAt must be the source's git date, not the wall clock.
  try {
    const want = sourceDate();
    const pkg = readJson(path.join(PKG_DIR, 'package.json'));
    const manifest = readManifest(pkg.version);
    if (manifest.publishedAt !== want) {
      fail(`publishedAt ${manifest.publishedAt} != git source date ${want}`);
      errors++;
    } else {
      ok(`publishedAt is the git source date (${want})`);
    }
  } catch (err) {
    fail(`publishedAt check failed: ${err.message}`);
    errors++;
  }

  if (errors) { fail(`${errors} determinism error(s)`); return 1; }
  ok('generator is deterministic — two runs byte-identical');
  return 0;
}

// ── release ────────────────────────────────────────────────────────────

function checkRelease(tag) {
  const match = /^inspector-v(.+)$/.exec(tag);
  if (!match) { fail(`tag ${JSON.stringify(tag)} does not match inspector-v<version>`); return 2; }
  const version = match[1];
  const index = readIndex();
  if (!index.versions.some((e) => e.version === version)) {
    fail(`registry/index.json has no published version ${version}`);
    return 1;
  }
  if (index.latest !== version) {
    fail(`registry/index.json latest is ${index.latest}, tag is ${version}`);
    return 1;
  }
  const immutable = checkImmutable();
  if (immutable) return immutable;
  ok(`release inspector-v${version} exists, is immutable, and is latest`);
  return 0;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { process.stdout.write(HELP + '\n'); return 0; }

  const i = args.indexOf('--release');
  if (i !== -1) {
    const tag = args[i + 1];
    if (!tag) { fail('--release requires a tag'); return 2; }
    return checkRelease(tag);
  }
  if (args.includes('--determinism')) return checkDeterminism();
  return checkImmutable();
}

process.exit(main());
