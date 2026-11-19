# html-inspector tickets — index & handoff map (fresh agent starts here)

Every ticket is a self-contained planning/landing document in the house style:
metadata block → status → summary → contract → decisions → acceptance criteria →
references. A ticket must be executable by an agent with a clean context — it
carries the agreed contract **verbatim** ([`../../rules/tickets.md`](../../rules/tickets.md)).

## States

| folder | means |
|---|---|
| `new/` | open or planning — no code yet, or work in progress |
| `done/` | landed **and pushed** (definition of done in [`../AGENTS.md`](../AGENTS.md)) |
| `verify/` | landed + pushed, one real-world check still outstanding (short-lived) |
| `tombstone/` | deliberately parked — deferred/uncertain/superseded, **not** a completion |
| `future/` | wanted eventually, deliberately unscheduled |

A branch is not a landing: merged to `main`, pushed, ticket moved, README row
updated. Merely unfinished work stays in `new/`; tombstone is a deliberate park.

## Numbering

`INSP-NNN`, monotonic, allocated by the agent — **check the id is actually free**
before writing it (`ls tickets/*/`), concurrent sessions take ids. Sub-tickets use
letter suffixes (`INSP-002a/b/c`) when one topic needs several hands.

## Executing a ticket — fan out, qualify, land immediately

1. **The ticket is the brief.** Paste its contract verbatim to any subagent;
   subagents do not see the session that wrote it.
2. **Fan out only where the seams are real** — one subagent = one slice = one
   worktree + branch, no shared files, and the subagent never writes the main
   checkout (`~/dev/html-inspector`).
3. **Qualify before landing** — the coordinator reads the diff, runs the tests
   and the registry checks itself; the author's "green" is a claim, not evidence.
4. **Land + push each qualified slice at once** — merge to `main`, regenerate any
   generated files, push. Never batch finished work.
5. **Move the ticket** `new/` → `done/` after the last slice, update its row
   below, restart nothing (there is no running service in this repo).

## The map

| Ticket | Status | What it does | Remaining / where a fresh agent starts |
|---|---|---|---|
| **INSP-001** public distribution repo bootstrap | DONE (2026-11-19) | imported inspector/ + extension/ + registry/ from `menu-dashboard`, explicit versions, both zips as GitHub Release assets, verify-only CI, Pages registry | landed: repo public, `inspector-v0.4.11` release with both zips + sha256, Pages serving `registry/`, CI green — see [`done/INSP-001-bootstrap-public-distribution-repo.md`](done/INSP-001-bootstrap-public-distribution-repo.md) §0 |
| **INSP-002** e2e: embed + extension on a third-party site | DONE (2026-11-19) | Playwright `e2e` project: the two-file HTML embed on a plain site, the unpacked extension in Chromium (inject, drag-copy, Esc cleanup, re-inject), plus a network-gated live spec proving Pages + the released zip | landed — hermetic 7/7, live 9/9, CI `e2e` job (verify-only) — see [`done/INSP-002-e2e-embed-and-extension-on-third-party-site.md`](done/INSP-002-e2e-embed-and-extension-on-third-party-site.md) §0 |
| **INSP-003** live documentation (comic-DSL generator) | DONE (2026-11-19) | `docs/program.js` beats → `scripts/docs.cjs` drives the embed page + unpacked extension in Chromium, captures 9 frames, renders a small product/business page (`npm run docs`; served at Pages `/docs/`) | landed — 9/9 frames, page live, CI smoke + release regeneration wired — see [`done/INSP-003-live-docs-comic-dsl-generator.md`](done/INSP-003-live-docs-comic-dsl-generator.md) §0 |
| **INSP-004** docs: clipboard metadata contract | DONE (2026-11-19) | live-docs sections documenting `Context:` / `Captured:` / `Evidence:` islands + rendering/degradation rules, proved by a new annotated fixture picked through the published embed (10th frame carries the real enriched payload; e2e asserts it) | landed — see [`done/INSP-004-docs-clipboard-metadata-contract.md`](done/INSP-004-docs-clipboard-metadata-contract.md) §0 |
| **INSP-005** docs: zoomable frames | DONE (2026-11-19) | generated-page lightbox: larger default tiles (440 px), click/Enter opens fit-to-viewport, click toggles fit ↔ 1:1, ✕/backdrop/Esc close and restore focus | landed — evidence screenshots + browser check; see [`done/INSP-005-docs-zoomable-frames.md`](done/INSP-005-docs-zoomable-frames.md) §0 |
| **INSP-006** docs: rainbow payload + sandbox | DONE (2026-11-19) | token-coloured live payload blocks (gradient panel, per-section colours) and a `docs/sandbox.html` try-it page (embed + pickable cards + read-clipboard box), linked from the docs and README | landed — e2e proves the sandbox pick+read; see [`done/INSP-006-docs-rainbow-payload-and-sandbox.md`](done/INSP-006-docs-rainbow-payload-and-sandbox.md) §0 |
| **INSP-007** dev tools opt-in | DONE (2026-11-19, v0.4.12) | distribution sheet = "HTML Inspector" (drag hint, Paste, snapshots); Inspect/Append only when the page opts in via `?dev=1`/`data-html-inspector-dev`; public switch and reload removed | landed + released `inspector-v0.4.12`; dashboard consumer needs the explicit opt-in (DASH-600 addendum) — see [`done/INSP-007-dev-tools-opt-in.md`](done/INSP-007-dev-tools-opt-in.md) §0 |
| **INSP-008** distribution help card | DONE (2026-11-19, v0.4.13) | compact default sheet: two-line drag hint, Paste inspection, Docs · GitHub · version footer; snapshots only when non-empty; runtime version stamped by the registry generator | landed + released `inspector-v0.4.13` — see [`done/INSP-008-distribution-help-card.md`](done/INSP-008-distribution-help-card.md) §0 |
| **INSP-009** camera: this tab only | DONE (2026-11-19, v0.4.14) | display-tier 📷 asks for the current tab only (no whole-screen/window surface), proves the grant (Capture Handle + viewport-shape backstop), falls back cropTo→manual crop, pre-prompt toast; extension tier unchanged | landed + released `inspector-v0.4.14`; e2e proves accept/refuse with stubbed streams — see [`done/INSP-009-camera-this-tab-only.md`](done/INSP-009-camera-this-tab-only.md) §0 |
| **INSP-010** download-image pill | DONE (2026-11-19, v0.4.15) | a `⬇` round pill beside 📷 saves the same captured PNG (named file, busy state) instead of copying; additive bridge blob contract keeps the camera path compatible; corner-stack clamp updated | landed + released `inspector-v0.4.15` — see [`done/INSP-010-download-image-pill.md`](done/INSP-010-download-image-pill.md) §0 |
| **INSP-011** manual npm release script | DONE (2026-11-19; publish remains owner-run) | `npm run release:npm` stages `menu-inspector` from the published registry, packs, gates on `npm whoami` (refuses with login instructions), typed-confirm publish + verify; `--dry-run` works without auth | landed — dry-run + auth gate verified, package not yet on npm (owner runs `npm login` then the script) — see [`done/INSP-011-manual-npm-release-script.md`](done/INSP-011-manual-npm-release-script.md) §0 |
