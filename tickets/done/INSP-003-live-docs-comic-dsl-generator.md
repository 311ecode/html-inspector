# INSP-003 — live documentation: a tiny comic-DSL generator (product page from real frames)

**Project:** html-inspector · **Status:** DONE (landed 2026-11-19) · **Created:** 2026-11-19 ·
**Motivation:** the repo has README/AGENTS prose and a green e2e suite, but nothing the
user (or a customer's employee doing QA) can *look at*; and prose drifts. The shared rule
[`../rules/e2e.md`](../../rules/e2e.md) already codifies the comic pattern (`run · beat ·
caption · frame`) — we reuse the *vocabulary*, not the heavy `menu/scripts/e2e-comic`
pipeline.
**Related:** INSP-001 (release flow), INSP-002 (e2e embed + extension specs),
`test/e2e/lib/{serve,extension-harness,gestures}.js`.

## 0. Landed — 2026-11-19

| Fact | Value |
|---|---|
| Generator | `npm run docs` → `scripts/docs.cjs` interprets `docs/program.js` (5 sections, **9 beats**) |
| Output | `docs/index.html` + 9 real frames under `docs/assets/` (~400 KB total, jpeg q82) |
| Page | `https://311ecode.github.io/html-inspector/docs/` (Pages serves the repo root) |
| CI | the `e2e` job runs `npm run docs` as a smoke test (never commits) |
| Release | `scripts/release.cjs` regenerates the docs before building, so a tag's docs match its version; the release notes link the page |

The live page proves, with captured frames and the clipboard payloads actually copied:

- the embed boots on a plain third-party page from the two published registry files
  (idle FAB, **mid-drag** breadcrumb + green highlight, settled pick + copied payload,
  the Developer-tools sheet, and the 390 px phone layout);
- the unpacked extension on a bare page: nothing before the shortcut, injected FAB +
  `data-html-inspector-host`, drag pick, copied payload;
- the "Who it is for" business section (employee QA on real sites, agencies, support/docs,
  anyone briefing an AI), the Pages embed snippet, the extension install steps and the
  verification links (registry index/releases/source).

Two bugs found while making the frames honest, both fixed in the generator: the
drag frame originally captured the *post-release* state (now it presses, drags, shoots,
then releases), and the sheet frame waited on the wrong open signal (now the sheet's
`open` class + transition settle).

## Summary

Add `docs/` — a **small live documentation generator** (`npm run docs`):

- `docs/program.js` — the documentation **program**: sections (what it is · who it is for ·
  embed · extension · verify) each carrying prose, optional copy-paste code, and a list of
  **beats** `{ scene, shot, caption }`.
- `scripts/docs.cjs` — interprets the program: for each beat it drives the *real* thing in
  Chromium (the embed page served from the committed registry, or the unpacked extension on
  a bare page), captures a **frame** (`docs/assets/*.png`), then renders
  `docs/index.html` — a self-contained product page with a comic-style evidence strip,
  live captions, the clipboard payload actually copied, the embed snippet and the
  extension install steps.
- The business/consumer framing lives in the "Who it is for" section: QA / employee
  testing on real sites, agencies handing a pick-and-copy tool to a client, support teams
  pinning a report to a page, docs writers capturing blocks — no dashboard, no build step.
- Regenerated on demand (`npm run docs`) **and at release time** (so the tagged docs match
  the shipped version); served by GitHub Pages at `/docs/`.

## Contract

| Piece | Contract |
|---|---|
| `docs/program.js` | pure data: `{ title, tagline, sections: [{ id, heading, body[], code?, beats[] }], footer }`; a beat is `{ scene: 'embed'|'extension', shot: '<named shot>', caption }`. Adding a beat = adding a program entry + a shot in the generator registry. |
| `scripts/docs.cjs` | one browser scene per chapter, frames capture the **visible state** the caption claims (no decorative frames); writes PNGs + `docs/index.html`; exits non-zero on any failed beat. No network in default mode (local registry + the unpacked extension); `--live` is out of scope for now. |
| Pages | `docs/index.html` is served at `https://311ecode.github.io/html-inspector/docs/` (Pages already serves the repo root). |
| `npm run docs` | generate; output committed (docs are a deliverable, not build output). |
| CI | the `e2e` job runs `npm run docs` as a smoke test (generator must keep working); it never commits. |
| Release | `scripts/release.cjs` regenerates docs before building, so a tag's docs are current. |

## Beats (the initial program)

embed scene (the two published files on a plain page):
`idle` (FAB in the corner) · `drag` (block highlighted + breadcrumb) · `copied` (settled
pick + copied toast, payload shown in the page) · `sheet` (tap opens the block/sheet) ·
`mobile` (390×700, the phone stance).

extension scene (bare page → unpacked extension):
`bare` (nothing runs until pressed) · `injected` (FAB + host mode after the extension's
trigger) · `pick` (drag highlight) · `copied` (settled pick + clipboard payload).

## Acceptance criteria

1. `npm run docs` regenerates `docs/index.html` + 9 frames from the live code; the page
   renders and links from README.
2. Every frame shows the state its caption claims (visual check against the page).
3. The page carries: one-line what-it-is, "who it is for" business section, embed snippet
   (Pages URLs), extension install steps, the comic strip with live captions, the actual
   copied payload, and version/verification links (registry latest, release, sha256 file).
4. `npm run docs` is clean/idempotent enough to run in release and CI smoke (no interactive
   input, ~10 s).
5. CI `e2e` job runs the generator; Pages `/docs/` serves the page; README links it.
6. Ticket records the beat count and evidence, moves to `done/`; README/AGENTS updated.

## Out of scope

The full `menu/scripts/e2e-comic` C1→C3 pipeline, flipbook publishing, screenshot
diffing/audit gates, translations, and video/branding assets.
