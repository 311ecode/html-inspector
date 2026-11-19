// test/artifact.test.js — the release artifacts are deterministic and carry the
// explicit versions from the committed tree. No dashboard, no network, no git
// history counts: `git rev-parse` / `git log -1` only.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const artifact = require('../lib/artifact');

const ROOT = path.join(__dirname, '..');

/** Local file names of a zip, read from the local file headers (no deps). */
function zipEntries(buf) {
  const names = [];
  let i = 0;
  while (i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const compressed = buf.readUInt32LE(i + 18);
    names.push(buf.slice(i + 30, i + 30 + nameLen).toString('utf8'));
    i += 30 + nameLen + extraLen + compressed;
  }
  return names;
}

test('extension artifact: explicit manifest version, expected entries, deterministic bytes', () => {
  const a = artifact.buildExtensionArtifact({ repoRoot: ROOT });
  const b = artifact.buildExtensionArtifact({ repoRoot: ROOT });

  assert.ok(a.zip.equals(b.zip), 'two consecutive builds must be byte-identical');
  assert.match(a.version, /^0\.1\.\d+$/);
  assert.equal(a.version, JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8')).version);
  assert.equal(a.file, `html-inspector-extension-${a.version}.zip`);
  assert.match(a.build, /^[0-9a-f]{64}$/);

  const entries = zipEntries(a.zip);
  const prefix = `html-inspector-${a.version}/`;
  assert.ok(entries.every((n) => n.startsWith(prefix)), 'every entry lives under one root folder');
  for (const required of ['manifest.json', 'build.json', 'src/background.js', 'vendor/inspector.js', 'vendor/inspector.css']) {
    assert.ok(entries.includes(prefix + required), `zip has ${required}`);
  }
});

test('embed artifact: published version + deterministic bytes + the two served files', () => {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'registry', 'index.json'), 'utf8'));
  const a = artifact.buildEmbedArtifact({ repoRoot: ROOT });
  const b = artifact.buildEmbedArtifact({ repoRoot: ROOT });

  assert.ok(a.zip.equals(b.zip), 'two consecutive builds must be byte-identical');
  assert.equal(a.version, index.latest);
  assert.equal(a.file, `html-inspector-embed-${index.latest}.zip`);

  const entries = zipEntries(a.zip).sort();
  const prefix = `html-inspector-embed-${index.latest}/`;
  assert.deepEqual(entries, [prefix + 'inspector.css', prefix + 'inspector.js']);

  const served = fs.readFileSync(path.join(ROOT, 'registry', 'inspector', index.latest, 'inspector.js'));
  const v1 = fs.readFileSync(path.join(ROOT, 'registry', 'inspector', 'v1', 'inspector.js'));
  assert.ok(served.equals(v1), 'the floating channel is the published version byte-for-byte');
});

test('no git-history version derivation anywhere in the release path', () => {
  for (const file of ['lib/artifact.js', 'scripts/publish-inspector.cjs', 'scripts/release.cjs']) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const src = fs.readFileSync(full, 'utf8');
    assert.ok(!src.includes('rev-list'), `${file} must not derive anything from git history counts`);
  }
});
