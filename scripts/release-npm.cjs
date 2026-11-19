#!/usr/bin/env node
// scripts/release-npm.cjs — publishes the inspector package to npm.
//
// OWNER-RUN AND MANUAL BY DESIGN: this machine/session has no npm credentials
// (`npm whoami` → 401), so the agent cannot publish. The script never reads,
// stores or prints a token; it uses your interactive npm session, refuses when
// that session is missing, and asks for a typed confirmation before the
// irreversible publish. It is never wired into CI.
//
// What it publishes: the npm name from inspector/package.json (`menu-inspector`),
// built from the PUBLISHED registry artifacts (registry/inspector/<version>/),
// not from inspector/src — so the tarball carries the version-stamped bundle and
// the compiled stylesheet.
//
// Usage:
//   npm run release:npm:dry     # stage + npm pack preview, no auth needed
//   npm run release:npm         # preflight → stage → pack → auth gate → confirm → publish → verify
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const readline = require('node:readline');

const ROOT = path.join(__dirname, '..');
const STAGE = path.join(ROOT, '.npm-stage');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const unknown = args.filter((a) => a !== '--dry-run');
if (unknown.length) die(`unknown argument(s): ${unknown.join(' ')}`);

function ok(msg) { process.stdout.write(`✓  ${msg}\n`); }
function log(msg) { process.stdout.write(`▶  ${msg}\n`); }
function warn(msg) { process.stderr.write(`!  ${msg}\n`); }
function die(msg) { process.stderr.write(`✗  ${msg}\n`); process.exit(1); }

function run(cmd, argv, opts) {
    const out = execFileSync(cmd, argv, Object.assign({ cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }, opts));
    return typeof out === 'string' ? out.trim() : '';
}
function git(...a) { return run('git', a); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

// ── the manifest facts ─────────────────────────────────────────────────
const rootPkg = readJson(path.join(ROOT, 'package.json'));
const pkg = readJson(path.join(ROOT, 'inspector', 'package.json'));
const version = rootPkg.version;
const npmName = pkg.name;
const tag = `inspector-v${version}`;

// ── 1. preflight ───────────────────────────────────────────────────────
function preflight() {
    if (git('status', '--porcelain')) die('working tree is dirty — commit/land the release first');

    const tagSha = (() => {
        try { return git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`); } catch (e) { return ''; }
    })();
    if (!tagSha) die(`tag ${tag} does not exist locally — cut the release first (node scripts/release.cjs)`);
    const remote = git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`);
    if (!remote) die(`tag ${tag} is not on origin`);

    const index = readJson(path.join(ROOT, 'registry', 'index.json'));
    if (index.latest !== version) die(`registry latest is ${index.latest}, package version is ${version}`);

    const regDir = path.join(ROOT, 'registry', 'inspector', version);
    const manifest = readJson(path.join(regDir, 'manifest.json'));
    if (manifest.version !== version) die(`registry manifest version ${manifest.version} != ${version}`);
    for (const file of manifest.files) {
        const disk = fs.readFileSync(path.join(regDir, file.name));
        if (disk.length !== file.bytes || sha256(disk) !== file.sha256) {
            die(`registry/${version}/${file.name} does not match its manifest — regenerate the registry`);
        }
        // The published tag must agree with the working tree we are about to pack.
        const tagged = execFileSync('git', ['-C', ROOT, 'show', `${tag}:registry/inspector/${version}/${file.name}`]);
        if (!Buffer.from(tagged).equals(disk)) die(`${tag}:registry/inspector/${version}/${file.name} differs from the working tree`);
    }
    ok(`preflight: clean tree, tag ${tag} local + remote, registry ${version} matches the tag`);
    return regDir;
}

// ── 2. the publishable stage ───────────────────────────────────────────
function buildStage(regDir) {
    fs.rmSync(STAGE, { recursive: true, force: true });
    fs.mkdirSync(STAGE, { recursive: true });

    for (const file of ['inspector.js', 'inspector.css']) {
        fs.copyFileSync(path.join(regDir, file), path.join(STAGE, file));
    }
    fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(STAGE, 'LICENSE'));
    fs.writeFileSync(path.join(STAGE, 'README.md'), npmReadme());

    const manifest = {
        name: npmName,
        version,
        description: pkg.description,
        license: pkg.license || 'ISC',
        main: 'inspector.js',
        browser: 'inspector.js',
        unpkg: 'inspector.js',
        jsdelivr: 'inspector.js',
        style: 'inspector.css',
        sideEffects: true,
        files: ['inspector.js', 'inspector.css', 'README.md', 'LICENSE'],
        keywords: ['html-inspector', 'inspector', 'devtools', 'clipboard', 'xpath', 'markdown', 'browser'],
        repository: { type: 'git', url: 'git+https://github.com/311ecode/html-inspector.git' },
        homepage: 'https://311ecode.github.io/html-inspector/docs/',
        bugs: { url: 'https://github.com/311ecode/html-inspector/issues' },
        publishConfig: { access: 'public' },
    };
    writeJson(path.join(STAGE, 'package.json'), manifest);

    const js = fs.readFileSync(path.join(STAGE, 'inspector.js'));
    const css = fs.readFileSync(path.join(STAGE, 'inspector.css'));
    ok(`staged ${npmName}@${version} in .npm-stage/`);
    log(`inspector.js ${js.length} B sha256 ${sha256(js)}`);
    log(`inspector.css ${css.length} B sha256 ${sha256(css)}`);
}

function npmReadme() {
    return `# ${npmName}

The HTML Inspector FAB — drag a block on any page, get \`URL: / Path: / HTML:\` on the
clipboard. Zero dependencies. This package ships the published registry artifacts
(version-stamped bundle + compiled stylesheet).

## Use it

From a CDN:

\`\`\`html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/${npmName}@${version}/inspector.css">
<script defer src="https://cdn.jsdelivr.net/npm/${npmName}@${version}/inspector.js"></script>
\`\`\`

Or install and copy the two files out of \`node_modules/${npmName}/\`:

\`\`\`bash
npm i ${npmName}
\`\`\`

\`inspector.js\` is a browser IIFE (no exports, no build step): load it with a
\`<script>\`; the FAB injects itself. The Chrome extension and the embeddable zip live on
GitHub Releases: https://github.com/311ecode/html-inspector/releases

Docs: https://311ecode.github.io/html-inspector/docs/
`;
}

// ── 3. pack preview ────────────────────────────────────────────────────
function packPreview() {
    log('npm pack --dry-run:');
    const out = execFileSync('npm', ['pack', '--dry-run'], { cwd: STAGE, encoding: 'utf8' });
    process.stdout.write(out.split('\n').filter((line) => line.trim()).slice(-18).join('\n') + '\n');
    ok('pack preview ok');
}

// ── 4. npm availability / auth ─────────────────────────────────────────
function npmVersionInfo() {
    const res = spawnSync('npm', ['view', `${npmName}@${version}`, 'version', '--json'], {
        cwd: ROOT, encoding: 'utf8',
    });
    const stdout = (res.stdout || '').trim();
    if (res.status === 0 && stdout && stdout !== 'null') return { exists: true, raw: stdout };
    if (/E404|not found|404/i.test(res.stderr || '')) return { exists: false };
    return { exists: false, note: (res.stderr || '').trim().split('\n')[0] };
}

function requireAuth() {
    const res = spawnSync('npm', ['whoami'], { cwd: ROOT, encoding: 'utf8' });
    const who = (res.stdout || '').trim();
    if (res.status === 0 && who) {
        ok(`npm session: ${who}`);
        return who;
    }
    process.stderr.write(
        '\n✗  Not logged in to npm — this step must be done by the package owner.\n' +
        '   1) npm login            (answer the 2FA prompt; the token stays in ~/.npmrc)\n' +
        '   2) npm run release:npm  (this script again)\n\n' +
        '   The agent cannot publish: it has no npm credentials, and no token ever\n' +
        '   goes near this script (nothing is read, stored or printed).\n'
    );
    process.exit(2);
}

function confirm() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
        process.stderr.write(`Type "publish ${version}" to publish ${npmName}@${version} to npm: `);
        rl.question('', (answer) => {
            rl.close();
            resolve(answer.trim() === `publish ${version}`);
        });
    });
}

// ── main ───────────────────────────────────────────────────────────────
(async () => {
    preflight();
    buildStage(path.join(ROOT, 'registry', 'inspector', version));
    packPreview();

    const npmInfo = npmVersionInfo();
    if (npmInfo.exists) die(`${npmName}@${version} is already published on npm`);
    ok(`${npmName}@${version} is not on npm yet`);

    if (dryRun) {
        ok(`dry run complete — nothing published. Real run: npm run release:npm (needs npm login)`);
        return;
    }

    requireAuth();
    if (!(await confirm())) die('aborted — nothing published');

    log(`publishing ${npmName}@${version} (interactive npm session; OTP prompt may follow)`);
    const pub = spawnSync('npm', ['publish', STAGE, '--access', 'public'], { cwd: ROOT, stdio: 'inherit' });
    if (pub.status !== 0) die(`npm publish failed with exit ${pub.status}`);

    const check = spawnSync('npm', ['view', `${npmName}@${version}`, 'version', 'dist.tarball'], {
        cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
    });
    if (check.status !== 0) die('published, but npm view could not verify it — check the npm page');
    ok('verified on npm:');
    process.stdout.write(check.stdout);
    process.stdout.write(`\n✅ https://www.npmjs.com/package/${npmName}\n`);
})().catch((err) => {
    process.stderr.write(`npm-release: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
});
