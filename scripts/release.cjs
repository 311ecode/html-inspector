#!/usr/bin/env node
// scripts/release.cjs — cut one html-inspector release FROM THIS MACHINE ONLY.
//
// The user's rule: releases are pushed from our side, never from CI. GitHub
// Actions in this repo only *verifies* (see .github/workflows/ci.yml). This
// script is the one place that pushes git refs and uploads Release assets.
//
// Flow (all steps abort loudly on the first failure):
//   0. clean tree on `main`, `origin` present
//   1. version: explicit; `--version X.Y.Z` sets it, otherwise current
//      package.json#version is used (no implicit bump)
//   2. regenerate the registry for that version, sync the vendored copy
//   3. gates: registry --check, --immutable, --determinism, vendor --check,
//      node test suites (skip with --skip-tests)
//   4. build the two deterministic zips into dist/ + .sha256 sidecars
//   5. commit the version bump (if any), tag `inspector-v<version>`, push
//   6. create the GitHub Release for the tag and upload the assets; an asset
//      that already exists with the same sha256 is skipped, a different one is
//      an error (published versions are immutable)
//   7. verify via the API and print the summary
//
// Usage:
//   GITHUB_TEST_TOKEN=$(cat /tmp/env/GITHUB_TEST_TOKEN) node scripts/release.cjs --dry-run
//   GITHUB_TEST_TOKEN=... node scripts/release.cjs            # release current version
//   GITHUB_TEST_TOKEN=... node scripts/release.cjs --bump      # 0.4.11 → 0.4.12, ext patch +1
//   GITHUB_TEST_TOKEN=... node scripts/release.cjs --version 0.4.12
//   GITHUB_TEST_TOKEN=... node scripts/release.cjs --pages    # also enable Pages
//
// Flags: --bump · --version X.Y.Z · --dry-run · --skip-tests · --pages
//
// Version rule (explicit, never derived): ONE version number covers the FAB,
// the registry and the Chrome extension. --bump increments its patch; --version
// sets it outright. package.json#version is stamped into inspector/package.json
// and extension/manifest.json at release time, so the tag is reproducible.
// Token: read from GITHUB_TEST_TOKEN or GH_TOKEN (never argv). The fine-grained
// drop-ins cannot create repos; this script does not create repos either — the
// repo exists already, it only pushes + uploads.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ORG = process.env.HTML_INSPECTOR_ORG || '311ecode';
const REPO = process.env.HTML_INSPECTOR_REPO || 'html-inspector';
const API = 'https://api.github.com';
const SSH_BYPASS = 'SSH_AUTH_SOCK= ssh -F /dev/null -i ' + path.join(process.env.HOME || '', '.ssh/id_ed25519');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipTests = args.includes('--skip-tests');
const bump = args.includes('--bump');
const enablePages = args.includes('--pages');
const versionArg = (() => {
    const i = args.indexOf('--version');
    if (i === -1) return null;
    const v = args[i + 1];
    if (!v) die('--version needs a value');
    return v;
})();
const unknown = args.filter((a) => !['--dry-run', '--skip-tests', '--pages', '--version', '--bump'].includes(a) && !/^\d+\.\d+\.\d+$/.test(a));
if (unknown.length) die(`unknown argument(s): ${unknown.join(' ')}`);

function die(msg) {
    process.stderr.write(`release: ${msg}\n`);
    process.exit(1);
}
function ok(msg) { process.stdout.write(`✓  ${msg}\n`); }
function log(msg) { process.stdout.write(`▶  ${msg}\n`); }

function run(cmd, cmdArgs, opts) {
    const out = execFileSync(cmd, cmdArgs, Object.assign({ cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }, opts));
    return typeof out === 'string' ? out.trim() : '';
}
function git(...a) { return run('git', a, { env: Object.assign({}, process.env, { GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND || SSH_BYPASS }) }); }
function gitRaw(...a) { return run('git', a, { stdio: ['ignore', 'inherit', 'inherit'] }); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function token() {
    const t = process.env.GITHUB_TEST_TOKEN || process.env.GH_TOKEN;
    if (!t) die('no token: set GITHUB_TEST_TOKEN (classic PAT with repo scope) or GH_TOKEN');
    return t;
}

async function api(method, url, body, headers) {
    const res = await fetch(API + url, {
        method,
        headers: Object.assign({
            Authorization: `Bearer ${token()}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'html-inspector-release',
        }, headers || {}),
        body,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON */ }
    return { status: res.status, json, text };
}

// ── 0. preflight ───────────────────────────────────────────────────────

function preflight() {
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    if (branch !== 'main') die(`must be on main (on ${branch})`);
    const dirty = git('status', '--porcelain');
    if (dirty) die(`working tree is dirty:\n${dirty}`);
    try { git('remote', 'get-url', 'origin'); } catch (e) { die('origin remote is missing'); }
    ok('preflight: main, clean tree, origin present');
}

// ── 1. version ─────────────────────────────────────────────────────────

function setVersion(version) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) die(`bad version ${JSON.stringify(version)}`);
    const pkgPath = path.join(ROOT, 'package.json');
    const pkg = readJson(pkgPath);
    pkg.version = version;
    writeJson(pkgPath, pkg);
    const innerPath = path.join(ROOT, 'inspector', 'package.json');
    const inner = readJson(innerPath);
    inner.version = version;
    writeJson(innerPath, inner);
    syncExtensionVersion(version);
    ok(`version set to ${version} (package.json + inspector/package.json + extension/manifest.json)`);
}

/** One version number for everything: the extension manifest follows the package. */
function syncExtensionVersion(version) {
    const extPath = path.join(ROOT, 'extension', 'manifest.json');
    const ext = readJson(extPath);
    if (ext.version !== version) {
        ext.version = version;
        writeJson(extPath, ext);
        log(`extension/manifest.json version -> ${version}`);
    }
}

function currentVersion() {
    return readJson(path.join(ROOT, 'package.json')).version;
}

function nextPatch(version) {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
    if (!m) die(`bad version ${JSON.stringify(version)}`);
    return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

/** --bump: package (inspector) patch + extension manifest patch, both explicit. */
function bumpVersions() {
    const next = nextPatch(currentVersion());
    setVersion(next);   // also stamps extension/manifest.json — one version
    return next;
}

// ── 2. regenerate generated files ──────────────────────────────────────

function regenerate() {
    run(process.execPath, ['scripts/publish-inspector.cjs', '--write'], { stdio: ['ignore', 'inherit', 'inherit'] });
    run(process.execPath, ['extension/tools/sync-vendor.mjs'], { stdio: ['ignore', 'inherit', 'inherit'] });
    ok('registry regenerated + vendor synced');
}

// ── 3. gates ───────────────────────────────────────────────────────────

function gates() {
    const checks = [
        ['scripts/publish-inspector.cjs'],
        ['scripts/check-inspector-registry.cjs', '--immutable'],
        ['scripts/check-inspector-registry.cjs', '--determinism'],
        ['extension/tools/sync-vendor.mjs', '--check'],
    ];
    for (const c of checks) {
        run(process.execPath, c, { stdio: ['ignore', 'inherit', 'inherit'] });
    }
    ok('registry + vendor gates passed');
    if (!skipTests) {
        run(process.execPath, ['--test', '--test-concurrency=1', 'inspector/test/protocol.test.js'], { stdio: ['ignore', 'inherit', 'inherit'] });
        run(process.execPath, ['--test', 'test/artifact.test.js'], { stdio: ['ignore', 'inherit', 'inherit'] });
        run(process.execPath, ['--test', 'test/extension-site-bridge.test.js'], { stdio: ['ignore', 'inherit', 'inherit'] });
        ok('node test suites passed (use --skip-tests to skip)');
    }
}

// ── 4. build ───────────────────────────────────────────────────────────

function regenerateDocs() {
    run(process.execPath, ['scripts/docs.cjs'], { stdio: ['ignore', 'inherit', 'inherit'] });
    ok('live docs regenerated (docs/index.html + frames)');
}

function build() {
    const artifact = require('../lib/artifact');
    fs.rmSync(DIST, { recursive: true, force: true });
    fs.mkdirSync(DIST, { recursive: true });
    const built = artifact.buildReleaseArtifacts({ repoRoot: ROOT });
    const assets = [];
    for (const a of built) {
        const file = path.join(DIST, a.file);
        fs.writeFileSync(file, a.zip);
        const digest = artifact.sha256(a.zip);
        fs.writeFileSync(file + '.sha256', `${digest}  ${a.file}\n`);
        assets.push({ kind: a.kind, name: a.file, file, digest, bytes: a.bytes, sidecar: file + '.sha256' });
        log(`built ${a.file} (${a.bytes} B) sha256 ${digest}`);
    }
    ok(`built ${assets.length} artifacts into dist/ (never committed)`);
    return assets;
}

// ── 5. commit + tag + push ─────────────────────────────────────────────

function commitTagPush(version, assets) {
    const tag = `inspector-v${version}`;
    const dirty = git('status', '--porcelain');
    if (dirty) {
        gitRaw('add', '-A');
        gitRaw('commit', '-m', `release: ${tag}`);
        ok(`committed version/registry changes for ${tag}`);
    } else {
        ok('no tree changes to commit');
    }
    if (dryRun) { log(`[dry-run] would tag ${tag} and push main + tag`); return tag; }

    const existing = git('tag', '--list', tag);
    if (existing) {
        const localSha = git('rev-parse', tag);
        const headSha = git('rev-parse', 'HEAD');
        if (localSha !== headSha) die(`tag ${tag} already exists on ${localSha} (HEAD is ${headSha}) — bump the version`);
        log(`tag ${tag} already exists on HEAD (reusing for a resumed release)`);
    } else {
        gitRaw('tag', '-a', tag, '-m', `HTML Inspector v${version}`);
    }
    gitRaw('push', 'origin', 'main');
    gitRaw('push', 'origin', tag);
    ok(`pushed main + ${tag}`);
    return tag;
}

// ── 6. publish the assets ──────────────────────────────────────────────

/**
 * releaseBody(tag, assets) — the release page is a product page: real asset
 * names/sizes/hashes, the copy-paste embed snippet and the extension install
 * steps. Never placeholders.
 */
function releaseBody(tag, assets) {
    const version = tag.replace(/^inspector-v/, '');
    const ext = assets.find((a) => a.kind === 'extension') || assets[0];
    const embed = assets.find((a) => a.kind === 'embed') || assets[1];
    const row = (a) => `| \`${a.name}\` | ${a.bytes.toLocaleString('en-US')} B | \`${a.digest}\` |`;
    const pages = `https://${ORG}.github.io/${REPO}`;
    return [
        `**HTML Inspector v${version}** — the in-page inspection FAB (drag a block, copy \`URL: / Path: / HTML:\`) and its Chrome MV3 shell.`,
        '',
        '| asset | size | sha256 |',
        '|---|---|---|',
        row(ext),
        row(embed),
        '',
        'Each zip ships beside a `.zip.sha256` file; the zips are deterministic — the commit history never carries binaries.',
        '',
        '### Embed the FAB in any page',
        '',
        '```html',
        `<link rel="stylesheet" href="${pages}/registry/inspector/v1/inspector.css">`,
        `<script defer src="${pages}/registry/inspector/v1/inspector.js"></script>`,
        '```',
        '',
        `Or vendor the two files from \`${embed.name}\`.`,
        '',
        '### Chrome extension',
        '',
        `1. Download \`${ext.name}\` and unzip it.`,
        '2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, select the unzipped `html-inspector-' + version + '` folder.',
        '3. Press `Alt+Shift+I` on any page (or click the toolbar button) to inject the FAB.',
        '',
        `Docs: https://${ORG}.github.io/${REPO}/docs/ — the same claims, captured live from this release.`,
        '',
        '### Registry (HTTP)',
        '',
        `Latest index: ${pages}/registry/index.json · floating channel: ${pages}/registry/inspector/v1/`,
    ].join('\n');
}

async function publish(tag, assets) {
    const rel = await api('GET', `/repos/${ORG}/${REPO}/releases/tags/${tag}`);
    let release = rel.status === 200 ? rel.json : null;
    if (!release) {
        const created = await api('POST', `/repos/${ORG}/${REPO}/releases`, JSON.stringify({
            tag_name: tag,
            name: `HTML Inspector ${tag.replace(/^inspector-v/, 'v')}`,
            body: releaseBody(tag, assets),
        }));
        if (created.status !== 201) die(`create release failed: ${created.status} ${created.text}`);
        release = created.json;
        ok(`created Release ${tag}`);
    } else {
        log(`Release ${tag} already exists`);
    }

    const existing = new Map((release.assets || []).map((a) => [a.name, a]));
    for (const asset of assets) {
        const uploaded = existing.get(asset.name);
        if (uploaded) {
            const remoteDigest = uploaded.digest ? String(uploaded.digest).replace(/^sha256:/, '') : null;
            if (remoteDigest && remoteDigest === asset.digest) { ok(`${asset.name}: identical, skipped`); continue; }
            if (!remoteDigest && uploaded.size === asset.bytes) { ok(`${asset.name}: same size, skipped`); continue; }
            die(`${asset.name} already exists with different content — published versions are immutable`);
        }
        for (const [file, name] of [[asset.file, asset.name], [asset.sidecar, asset.name + '.sha256']]) {
            const body = fs.readFileSync(file);
            const res = await fetch(`https://uploads.github.com/repos/${ORG}/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token()}`,
                    'Content-Type': 'application/octet-stream',
                    'User-Agent': 'html-inspector-release',
                },
                body,
            });
            if (res.status !== 201) die(`upload ${name} failed: ${res.status} ${await res.text()}`);
            ok(`uploaded ${name} (${body.length} B)`);
        }
    }
    return release;
}

// ── 7. verify ──────────────────────────────────────────────────────────

async function verify(tag, assets) {
    const rel = await api('GET', `/repos/${ORG}/${REPO}/releases/tags/${tag}`);
    if (rel.status !== 200) die(`verify: release ${tag} not found`);
    const byName = new Map((rel.json.assets || []).map((a) => [a.name, a]));
    for (const asset of assets) {
        const remote = byName.get(asset.name);
        if (!remote) die(`verify: asset ${asset.name} missing`);
        const digest = remote.digest ? String(remote.digest).replace(/^sha256:/, '') : null;
        if (digest && digest !== asset.digest) die(`verify: ${asset.name} digest mismatch`);
        if (!digest && remote.size !== asset.bytes) die(`verify: ${asset.name} size mismatch`);
        ok(`verified ${asset.name} (${remote.size} B)`);
    }
    const tagRel = await api('GET', `/repos/${ORG}/${REPO}/git/ref/tags/${tag}`);
    if (tagRel.status !== 200) die(`verify: tag ${tag} not on the remote`);
    ok(`verified tag ${tag} on the remote`);
    return rel.json;
}

// ── 8. pages (optional, idempotent) ────────────────────────────────────

async function pages() {
    const existing = await api('GET', `/repos/${ORG}/${REPO}/pages`);
    if (existing.status === 200) { ok('Pages already enabled'); return; }
    const created = await api('POST', `/repos/${ORG}/${REPO}/pages`, JSON.stringify({
        source: { branch: 'main', path: '/' },
    }));
    if (created.status !== 201) die(`enable Pages failed: ${created.status} ${created.text}`);
    ok(`Pages enabled on main → https://${ORG}.github.io/${REPO}/`);
}

// ── main ───────────────────────────────────────────────────────────────

(async () => {
    preflight();
    if (versionArg && bump) die('use either --version or --bump, not both');
    if (versionArg && versionArg !== currentVersion()) setVersion(versionArg);
    const version = bump ? bumpVersions() : (versionArg || currentVersion());
    syncExtensionVersion(version);   // one version everywhere, also on a re-cut
    log(`releasing html-inspector ${version} (tag inspector-v${version})${dryRun ? ' [dry-run]' : ''}`);
    regenerate();
    gates();
    regenerateDocs();
    const assets = build();
    if (dryRun) {
        ok(`[dry-run] would publish: ${assets.map((a) => a.name).join(', ')}`);
        return;
    }
    const tag = commitTagPush(version, assets);
    await publish(tag, assets);
    if (enablePages) await pages();
    const release = await verify(tag, assets);
    process.stdout.write(`\n✅ ${release.html_url}\n`);
    for (const a of assets) {
        process.stdout.write(`   ${a.name}  sha256:${a.digest}\n`);
    }
})().catch((err) => {
    process.stderr.write(`release: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
});
