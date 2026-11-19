#!/usr/bin/env node
// DASH-466 — keep extension/vendor/inspector.{js,css} byte-identical to the
// artifacts published at registry/inspector/v1/. The JS bundle does not carry
// its styles, so the CSS is vendored too; without it the injected FAB is
// invisible on a page that has no dashboard stylesheet. `--check` is the drift
// guard (exit 1 on any difference); the default mode refreshes both copies.
// No dependencies.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const SOURCE_DIR = join(repoRoot, 'registry', 'inspector', 'v1');
const DEST_DIR = join(repoRoot, 'extension', 'vendor');
const FILES = ['inspector.js', 'inspector.css'];
const check = process.argv.includes('--check');

for (const name of FILES) {
    const source = readFileSync(join(SOURCE_DIR, name));
    const dest = join(DEST_DIR, name);

    if (!check) {
        mkdirSync(DEST_DIR, { recursive: true });
        writeFileSync(dest, source);
        console.log('synced ' + dest + ' from ' + join(SOURCE_DIR, name));
        continue;
    }

    let current;
    try {
        current = readFileSync(dest);
    } catch (e) {
        console.error('extension/vendor/' + name + ' is missing — run `node extension/tools/sync-vendor.mjs`');
        process.exit(1);
    }

    if (!current.equals(source)) {
        console.error('extension/vendor/' + name + ' is out of date — it must be a byte-for-byte copy of');
        console.error('  registry/inspector/v1/' + name);
        console.error('Run `node extension/tools/sync-vendor.mjs` to refresh it, then reload the extension.');
        process.exit(1);
    }
}

if (check) console.log('extension/vendor/inspector.{js,css} match registry/inspector/v1/');
