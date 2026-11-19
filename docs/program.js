// docs/program.js — the documentation PROGRAM (pure data).
//
// This is the tiny comic-DSL: every section is prose plus a list of BEATS, and a
// beat is one real action in a real browser that produces one frame:
//
//     beat = { scene, shot, caption }
//
// `scene` picks the live setup (the embeddable page, or the packed extension on
// a bare page); `shot` names the state to capture (the generator owns the shot
// registry — adding a beat means adding a program entry + a shot there).
//
// The generator (scripts/docs.cjs) drives these beats, captures the frames and
// renders docs/index.html. Nothing here is a fixture: the frames are the shipped
// registry files and the shipped extension build.
'use strict';

const PAGES = 'https://311ecode.github.io/html-inspector';

module.exports = {
    title: 'HTML Inspector',
    tagline:
        'Drag a block on any page, get `URL: / Path: / HTML:` on the clipboard. Two files to embed, or one Chrome extension.',

    sections: [
        {
            id: 'what',
            heading: 'What it is',
            body: [
                'A mobile-friendly inspection FAB for any web page. Drag the button onto a block-level',
                'element and lift your finger: the page URL, the element path and its outerHTML land on',
                'the clipboard, ready to paste into a ticket, a chat or an AI assistant.',
                '',
                'It is deliberately tiny: a zero-dependency browser script plus a stylesheet. There is no',
                'dashboard, no build step, no account. The same bundle is served as a static registry',
                '(GitHub Pages) and ships as two zips on GitHub Releases: an embeddable bundle and a',
                'Chrome MV3 shell that injects it into any tab on demand.',
            ],
            beats: [
                { scene: 'embed', shot: 'idle', caption: 'Embedded on a plain third-party page: the FAB waits in the corner.' },
            ],
        },
        {
            id: 'who',
            heading: 'Who it is for',
            body: [
                '**Employee QA on real sites.** Testers and support engineers stop re-typing "the third card',
                'on the payments page" — they hand over the exact block, path and markup.',
                '',
                '**Agencies and freelancers.** Hand a client a website that can explain itself; two tags in',
                'the page and every stakeholder can pick the block that looks wrong.',
                '',
                '**Support and docs teams.** Paste a picked block into a ticket, a knowledge-base draft or a',
                'bug report — the payload is the same on every host, so the receiving side can replay it.',
                '',
                '**Anyone briefing an AI.** Picked blocks carry a stable XPath/selector and a Markdown',
                'translation, so "fix this" arrives with the exact context instead of a screenshot.',
            ],
            beats: [],
        },
        {
            id: 'embed',
            heading: 'Embed it on any page',
            body: [
                'Two lines, served from the published registry. The floating channel (`v1/`) follows the',
                'latest release, so a bundle update needs no page deploy.',
            ],
            code: [
                `<link rel="stylesheet" href="${PAGES}/registry/inspector/v1/inspector.css">`,
                `<script defer src="${PAGES}/registry/inspector/v1/inspector.js"></script>`,
            ],
            beats: [
                { scene: 'embed', shot: 'drag', caption: 'Drag the FAB onto a block: the deepest block-level element lights up with a breadcrumb.' },
                { scene: 'embed', shot: 'copied', caption: 'Lift: the payload is on the clipboard (URL, path and outerHTML were just copied).' },
                { scene: 'embed', shot: 'sheet', caption: 'Tap instead of drag to open the sheet: collected snapshots and the inspection switches.' },
                { scene: 'embed', shot: 'mobile', caption: 'The same embed on a 390 px phone — the FAB is always visible and safe-area aware.' },
            ],
        },
        {
            id: 'extension',
            heading: 'Or use the Chrome extension',
            body: [
                'The extension is a thin trigger: nothing runs until you press `Alt+Shift+I`. It probes the',
                'page, injects the same vendored bundle and stylesheet, and either adds its FAB (a page with',
                'no inspector) or donates the screen-capture bridge to a page that already has one.',
            ],
            code: [
                '1. Download html-inspector-extension-<version>.zip from the latest release',
                '2. chrome://extensions  ->  Developer mode  ->  Load unpacked  ->  the unzipped folder',
                '3. Press Alt+Shift+I on any page',
            ],
            beats: [
                { scene: 'extension', shot: 'bare', caption: 'A bare page before the shortcut: no inspector, nothing injected.' },
                { scene: 'extension', shot: 'injected', caption: 'After the shortcut: the extension injected the bundle and the FAB appears.' },
                { scene: 'extension', shot: 'pick', caption: 'The injected picker highlights the block — the same pick loop as the embed.' },
                { scene: 'extension', shot: 'copied', caption: 'Lift: the copied payload comes from the injected bundle, not from the page.' },
            ],
        },
        {
            id: 'verify',
            heading: 'Verify what you ship',
            body: [
                'Every zip ships with a `.sha256` sibling, and the static registry is hash-pinned by',
                '`registry/index.json` — the same verification the repo runs in CI. The current version and',
                'its links are below.',
            ],
            code: [
                `curl -sL ${PAGES}/registry/index.json`,
                '# latest, channel paths and per-file sha256 for every published version',
            ],
            beats: [],
        },
    ],

    footer:
        'Generated from the live code by `npm run docs` (`scripts/docs.cjs`). The frames above are real browser runs of the committed registry and the unpacked extension — regenerate after changing the FAB, the extension or the registry.',
};
