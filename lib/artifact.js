// lib/artifact.js — the release artifacts for the HTML Inspector, built
// deterministically from the committed tree.
//
// Two archives ship per release and they are the ONLY binary outputs of this
// repo (they go to GitHub Release assets; `dist/` is never committed):
//
//   html-inspector-extension-<version>.zip   the Chrome MV3 shell (extension/**)
//   html-inspector-embed-<version>.zip       inspector.js + inspector.css for
//                                            people who vendor the FAB
//
// One version number covers both: package.json#version is stamped into
// extension/manifest.json at release time (single version, never two).
//
// Version facts are EXPLICIT, never derived from git history:
//   - extension version = extension/manifest.json#version
//   - embed version     = registry/index.json#latest
// The extension version is stamped into the archive's manifest.json only (the
// tracked source manifest is the single source of truth).
//
// Everything is a pure function of (tree bytes, fixed mtime): ZIP entries are
// sorted, mtimes come from the git commit / registry publishedAt, and deflate
// is level 9 — so building twice yields identical bytes.

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

const EXTENSION_NAME = 'HTML Inspector';
const EXTENSION_ROOT = 'html-inspector';
const EMBED_ROOT = 'html-inspector-embed';

function sha256(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function shortSha(sha) {
    return String(sha || '').slice(0, 7);
}

function git(repoRoot, args) {
    return execFileSync('git', ['-C', repoRoot, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}

/** The git facts a build stamps — sha + last commit time. Never commit counts. */
function readGitFacts(repoRoot) {
    return {
        sha: git(repoRoot, ['rev-parse', 'HEAD']),
        builtAt: git(repoRoot, ['log', '-1', '--format=%cI', 'HEAD']),
    };
}

/** Every file under `dir`, POSIX-relative, sorted, values as Buffers. */
function readTree(dir) {
    const out = new Map();
    function walk(abs, rel) {
        const entries = fs.readdirSync(abs, { withFileTypes: true })
            .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        for (const entry of entries) {
            if (entry.name === '.DS_Store') continue;
            const childAbs = path.join(abs, entry.name);
            const childRel = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.isDirectory()) walk(childAbs, childRel);
            else if (entry.isFile()) out.set(childRel, fs.readFileSync(childAbs));
        }
    }
    walk(dir, '');
    return out;
}

/** Canonical bytes of a payload for the content `build` hash (manifest version blanked). */
function buildHashInput(files) {
    const chunks = [];
    for (const rel of [...files.keys()].sort()) {
        let content = files.get(rel);
        if (rel === 'manifest.json') {
            const manifest = JSON.parse(content.toString('utf8'));
            manifest.version = '';
            content = Buffer.from(JSON.stringify(manifest), 'utf8');
        }
        chunks.push(Buffer.from(rel + '\0' + content.length + '\0', 'utf8'), content);
    }
    return Buffer.concat(chunks);
}

function computeBuild(files) {
    return sha256(buildHashInput(files));
}

// ── the deterministic zip ──────────────────────────────────────────────

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c;
    }
    return table;
})();

function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}

/** DOS time/date in UTC, so the archive does not depend on the machine's TZ. */
function dosDateTime(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) throw new Error(`artifact: invalid mtime ${JSON.stringify(iso)}`);
    const year = Math.max(1980, d.getUTCFullYear());
    const date = ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
    const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
    return { date: date & 0xffff, time: time & 0xffff };
}

/**
 * buildZip(files, { root, mtime }) — deterministic deflate archive. `files` is
 * a Map of relative POSIX path → Buffer; `root` prefixes every entry; `mtime`
 * is the fixed timestamp. Sorted entries, mode 0644.
 */
function buildZip(files, opts) {
    const root = String((opts && opts.root) || '').replace(/^\/+|\/+$/g, '');
    const prefix = root ? root + '/' : '';
    const { date, time } = dosDateTime(opts && opts.mtime);
    const names = [...files.keys()].map((rel) => prefix + rel).sort();

    const localParts = [];
    const centralParts = [];
    let offset = 0;
    for (const name of names) {
        const rel = name.slice(prefix.length);
        const content = files.get(rel);
        if (!Buffer.isBuffer(content)) throw new Error(`artifact: ${rel} is not a Buffer`);
        const nameBuf = Buffer.from(name, 'utf8');
        const compressed = zlib.deflateRawSync(content, { level: 9 });
        const crc = crc32(content);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0, 6);
        local.writeUInt16LE(8, 8);           // deflate
        local.writeUInt16LE(time, 10);
        local.writeUInt16LE(date, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(compressed.length, 18);
        local.writeUInt32LE(content.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);
        localParts.push(local, nameBuf, compressed);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(0x0314, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0, 8);
        central.writeUInt16LE(8, 10);
        central.writeUInt16LE(time, 12);
        central.writeUInt16LE(date, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(compressed.length, 20);
        central.writeUInt32LE(content.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt16LE(0, 30);
        central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34);
        central.writeUInt16LE(0, 36);
        central.writeUInt32LE(((0o100644 << 16) >>> 0), 38);
        central.writeUInt32LE(offset, 42);
        centralParts.push(central, nameBuf);

        offset += local.length + nameBuf.length + compressed.length;
    }

    const centralDir = Buffer.concat(centralParts);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(names.length, 8);
    eocd.writeUInt16LE(names.length, 10);
    eocd.writeUInt32LE(centralDir.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);
    return Buffer.concat([...localParts, centralDir, eocd]);
}

// ── the two artifacts ──────────────────────────────────────────────────

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * buildExtensionArtifact({ repoRoot }) → the MV3 shell zip.
 * `version` MUST already be the explicit value in the source manifest.
 */
function buildExtensionArtifact(opts) {
    const repoRoot = (opts && opts.repoRoot) || path.join(__dirname, '..');
    const facts = readGitFacts(repoRoot);
    const files = readTree(path.join(repoRoot, 'extension'));
    if (!files.has('manifest.json')) throw new Error('artifact: extension/manifest.json is missing');

    const manifest = JSON.parse(files.get('manifest.json').toString('utf8'));
    const version = String(manifest.version || '');
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
        throw new Error(`artifact: extension/manifest.json version ${JSON.stringify(version)} is not major.minor.patch`);
    }
    const name = manifest.name || EXTENSION_NAME;

    const build = computeBuild(files);
    const buildJson = {
        name,
        version,
        build,
        baseVersion: version,
        sha: facts.sha,
        builtAt: facts.builtAt,
    };
    const withMeta = new Map(files);
    withMeta.set('build.json', Buffer.from(JSON.stringify(buildJson, null, 2) + '\n', 'utf8'));
    const zip = buildZip(withMeta, { root: `${EXTENSION_ROOT}-${version}`, mtime: facts.builtAt });
    return {
        kind: 'extension',
        name,
        version,
        build,
        sha: facts.sha,
        builtAt: facts.builtAt,
        zip,
        bytes: zip.length,
        file: `${EXTENSION_ROOT}-extension-${version}.zip`,
    };
}

/** buildEmbedArtifact({ repoRoot, version? }) → inspector.js + inspector.css zip. */
function buildEmbedArtifact(opts) {
    const repoRoot = (opts && opts.repoRoot) || path.join(__dirname, '..');
    const index = readJson(path.join(repoRoot, 'registry', 'index.json'));
    const version = String((opts && opts.version) || index.latest || '');
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`artifact: no publishable embed version (got ${JSON.stringify(version)})`);

    const dir = path.join(repoRoot, 'registry', 'inspector', version);
    const files = new Map([
        ['inspector.js', fs.readFileSync(path.join(dir, 'inspector.js'))],
        ['inspector.css', fs.readFileSync(path.join(dir, 'inspector.css'))],
    ]);
    const entry = (index.versions || []).find((v) => v.version === version);
    const mtime = (entry && entry.publishedAt) || readGitFacts(repoRoot).builtAt;
    const zip = buildZip(files, { root: `${EMBED_ROOT}-${version}`, mtime });
    return {
        kind: 'embed',
        version,
        zip,
        bytes: zip.length,
        file: `${EMBED_ROOT}-${version}.zip`,
    };
}

/** Both artifacts, in release order. */
function buildReleaseArtifacts(opts) {
    return [buildExtensionArtifact(opts), buildEmbedArtifact(opts)];
}

module.exports = {
    EXTENSION_NAME,
    sha256,
    shortSha,
    readGitFacts,
    readTree,
    computeBuild,
    buildZip,
    buildExtensionArtifact,
    buildEmbedArtifact,
    buildReleaseArtifacts,
};
