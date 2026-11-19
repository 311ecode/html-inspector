# INSP-004 — docs: the clipboard metadata contract (context + evidence islands), with a live enriched example

**Project:** html-inspector · **Status:** DONE (landed 2026-11-19) · **Created:** 2026-11-19 ·
**Motivation:** the shipped FAB already enriches the copied payload (`Context:` / `Captured:` /
`Evidence:`), but nothing user-facing documents it — "how do I add more metadata to the
clipboard?" is unanswerable from the README. The live-docs generator (INSP-003) can prove the
contract instead of describing it.
**Related:** INSP-002 (e2e), INSP-003 (docs generator), `inspector/src/inspector.js`
(`contextLines` / `evidenceLines` / `formatFactValue`), `inspector/test/protocol.test.js`
(the frozen payload contract).

## 0. Landed — 2026-11-19

| Fact | Value |
|---|---|
| Docs | two new sections in `docs/program.js` ("Add your own metadata to the clipboard" + "Per-block evidence" + "Rendering and degradation rules"); **10 frames** now (frame 6 is the enriched payload) |
| Live payload (captured, on the page) | `Context:` (app/suite/environment/commit) → `Captured:` → `Evidence:` (run/dom/imageSize/render) → `HTML:`; `Path:` shows identity (`article#order-card.card[data-env="staging"] > p#meta-copy.total`) |
| e2e proof | `test/e2e/embed.spec.js` — "a page can enrich the copied payload…" asserts the frozen order, the context facts, captured route, evidence renderings (`dom`, `imageSize`, `render`) and the identity path |
| New fixture | `test/e2e/fixtures/embed-metadata/index.html` served at `/embed-metadata` (context island + `data-evidence-node` card + `evidence-meta-orders-1` island) |
| Suite status | e2e 8 passed / 2 live-skipped; node suites 47 pass; docs regenerated from the live code |

Documented contract (matching the shipped bundle, verified against `inspector/test/protocol.test.js`):
page-level `evidence-context` facts → `Context:`; nearest `[data-evidence-node]` + any
`evidence-meta-<beat>` island → `Captured:` + `Evidence:`; `formatFactValue` renderings
(`dom`/`imageSize`/`render`/arrays/compact JSON/300-char truncation); malformed/missing islands
degrade to the byte-identical plain payload. `Path:` identity = `id` + up to two real classes +
`data-env`/`data-host` (the `data-*` claim in the first draft was wrong and was corrected while
checking the shipped `pathName`).

## Summary

Add a **"Add your own metadata to the clipboard"** section to the live docs and prove it with a
real frame: a second third-party fixture page that declares a page-level `evidence-context`
island and a per-block `evidence-meta-<beat>` island, picked through the published embed. The
docs page documents both levels, the exact islands, the rendering rules, and shows the payload
that was actually copied.

## Contract (from the shipped bundle — document exactly this, do not invent)

Plain payload (unchanged baseline):

```
URL: <page url>
Path: <breadcrumb — includes id/class/data-* identity attributes>
HTML:
<outerHTML>
```

Enrichment, in this frozen order (none of the plain lines change):

1. **Page-level context** — exactly one island per page:
   `<script type="application/json" id="evidence-context">{"schema":"evidence-context/v1","facts":{…}}</script>`
   → a `Context:` block (header + one two-space-indented `key: value` per fact, island/JSON order)
   inserted before every payload from that page.
2. **Per-block evidence** — the picked element or its nearest ancestor carries
   `data-evidence-node="<node-id>"`, and any `<script type="application/json" id="evidence-meta-<beat>">`
   provides `{ "<node-id>": { "captured" | "page": <route>, …facts } }`:
   - the route becomes `Captured: <route>` (string, or `{url}`);
   - the remaining entry keys become an `Evidence:` block (`  key: value` each).
3. **Value rendering** (`formatFactValue`): primitives are `String(value)`; `dom` → `path`
   (+ ` (missing)`), `imageSize` → `WxH px`, `render` → `WxH CSS @N×`, arrays join with `, `,
   other objects are compact single-line JSON; strings longer than 300 chars truncate with `…`.
4. **Degradation is total, never an exception**: missing/malformed island, no entry for the
   node, or an empty entry → the plain payload, byte-identical to before the feature.

## Changes

| File | Change |
|---|---|
| `test/e2e/fixtures/embed-metadata/index.html` | new demo page: context island, `data-evidence-node` card, `evidence-meta-orders-1` island, identity attributes on the pickable paragraph |
| `test/e2e/lib/serve.js` | serve it at `/embed-metadata` |
| `test/e2e/embed.spec.js` | new test: picking `#meta-copy` copies Context + Captured + Evidence before `HTML:`, values verbatim |
| `scripts/docs.cjs` | new embed-scene shot `metadata` (fresh `/embed-metadata`, pick `#meta-copy`, capture frame + payload) |
| `docs/program.js` | new section "Add your own metadata to the clipboard" (prose + island JSON code + the `metadata` beat); regenerated page shows the live payload |

## Acceptance criteria

1. `docs/program.js` documents both levels, the frozen order, the rendering rules and the
   degradation rule; the page shows the **live** enriched payload under the frame.
2. `npm run docs` regenerates 10 frames; the metadata frame shows the picked block with the
   inspector chrome and the payload contains `Context:`, `Captured:` and `Evidence:`.
3. `npm run test:e2e` includes a green assertion that the embed produces that enriched payload.
4. `npm test` / `npm run test:ui` stay green; CI `e2e` (which runs the docs generator) stays green;
   Pages `/docs/` serves the updated page.
5. Ticket records the evidence and moves to `done/`; map row updated.

## Out of scope

Changing the payload format, adding new island schemas, a UI for editing metadata, and
dashboard-side evidence generation (the dashboard writes those islands for its own pages).
