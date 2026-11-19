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
            id: 'metadata',
            heading: 'Add your own metadata to the clipboard',
            body: [
                'The plain payload is `URL: / Path: / HTML:`. A host page can enrich it, and the FAB does',
                'the rest — no configuration, no options. There are two levels, both JSON islands in the',
                'page, both optional:',
                '',
                '**Page-level context** — one island per page, read by id. Every payload from that page then',
                'carries a `Context:` block, facts in island order:',
            ],
            code: [
                '<script type="application/json" id="evidence-context">',
                '{"schema":"evidence-context/v1","facts":{"app":"Example Shop","suite":"orders-e2e"}}',
                '</script>',
            ],
            beats: [],
        },
        {
            id: 'metadata-block',
            heading: 'Per-block evidence',
            body: [
                'Put `data-evidence-node="<id>"` on the block (or an ancestor) and `evidence-meta-<beat>`',
                'islands anywhere in the page. The island entry for that id becomes `Captured:` (its',
                '`captured` / `page` route) plus an `Evidence:` block of the remaining facts:',
            ],
            code: [
                '<article data-evidence-node="order-card-42"> … </article>',
                '',
                '<script type="application/json" id="evidence-meta-orders-1">',
                '{"order-card-42":{"captured":"https://example-shop.test/orders/42",',
                '  "run":"39120487731 · orders-e2e", "dom":{"path":"html/orders/42.html"}}}',
                '</script>',
            ],
            beats: [
                { scene: 'embed', shot: 'metadata', caption: 'The paragraph inside an annotated card: Context, Captured and Evidence land before the HTML.' },
            ],
        },
        {
            id: 'metadata-rules',
            heading: 'Rendering and degradation rules',
            body: [
                'Section order is frozen: context first, then `Captured:`, then `Evidence:`, then `HTML:` —',
                'a page with no islands keeps the byte-identical three-line payload.',
                '',
                'Values are display text, not raw JSON: primitives are printed as-is; `dom` → `path`',
                '(plus ` (missing)`), `imageSize` → `1280×800 px`, `render` → `1280×800 CSS @2×`, arrays',
                'join with `, `, any other object is compact single-line JSON. Strings longer than 300',
                'characters are truncated with `…`, so one runaway value cannot make the paste unreadable.',
                '',
                'Nothing here can break the copy: a malformed island, a missing entry for the id or an',
                'empty entry degrades to the plain payload — never an exception. The frozen format is',
                'covered by `inspector/test/protocol.test.js`, and the embed above is re-proved on every',
                '`npm run test:e2e`. The breadcrumb `Path:` carries the element\'s identity: its `id`,',
                'up to two real classes, and the dashboard\'s `data-env` / `data-host` attributes — so',
                'naming your blocks well makes the path alone useful on the receiving dashboard.',
            ],
            code: [],
            beats: [],
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
