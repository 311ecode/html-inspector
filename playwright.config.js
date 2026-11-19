// playwright.config.js — the inspector package's own spec suite. It proves the
// FAB on a plain fixture page with a throwaway static server (ports 8093 /
// 8091): no dashboard, no PM2, no poller. If this suite needs any of those,
// the extraction regressed.
'use strict';

const { defineConfig } = require('playwright/test');

module.exports = defineConfig({
    testDir: './inspector/test',
    // Only the Playwright specs — protocol.test.js is a node:test suite and is
    // run by `npm run test:protocol`.
    testMatch: '**/*.spec.js',
    testIgnore: ['**/*.test.js'],
    timeout: 30000,
    retries: 0,
    fullyParallel: false,
    workers: 1,
    reporter: [['list']],
    use: {
        headless: true,
        actionTimeout: 5000,
    },
    projects: [
        {
            name: 'inspector',
            testDir: './inspector/test',
            testMatch: '**/*.spec.js',
        },
    ],
});
