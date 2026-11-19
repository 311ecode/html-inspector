# INSP-006 — docs: rainbow payload blocks + a live "Try it" sandbox page

**Project:** html-inspector · **Status:** DONE (landed 2026-11-19) · **Created:** 2026-11-19 ·
**Motivation:** user feedback on the live docs — the `pre.clip` payload block is "too small and
too gray"; it should be visible ("rainbow and sunshine"), and the docs need a **sandbox / try-out
page to link to** so a visitor can actually press the FAB instead of reading about it.
**Related:** INSP-003 (docs generator), INSP-004 (metadata payloads), INSP-005 (frame lightbox).

## 0. Landed — 2026-11-19

| Fact | Value |
|---|---|
| Rainbow payloads | generator tokenises every live `pre.clip` block: `.pk-url` blue, `.pk-path` purple, `.pk-context` green, `.pk-captured` orange, `.pk-evidence` yellow, `.pk-html` red, fact keys/values cyan, HTML body warm; gradient panel + purple edge + soft glow; 14.5 px / 1.62 type |
| Sandbox | `docs/sandbox.html` — served at `…/docs/sandbox.html` (and `file://`), embeds `../registry/inspector/v1/…` (resolves correctly from Pages `/docs/`, from disk, and from the e2e server's `/sandbox`), rainbow hero, two-line snippet, 3 pickable cards, "Read the clipboard" → textarea, link back to the docs |
| Links | docs header "▶ Try it live in the sandbox" strip + README |
| e2e proof | `test/e2e/embed.spec.js` — sandbox boots the FAB, a drag pick copies the card, and the Read button fills the textarea with the payload (9 passed, 2 network-gated skipped) |
| Node suites | 47 pass, unchanged |

Verified with screenshots of the coloured payload block (metadata frame) and the sandbox page
(FAB visible, cards, read panel). The raw copied text is unchanged — colouring is render-time
only (`highlightPayload` escapes before wrapping).

## Summary

1. **Payload blocks get syntax colour** — the live `pre.clip` blocks (and the static code samples)
   are tokenised when the generator renders them: section keys (`URL:`, `Path:`, `Context:`,
   `Captured:`, `Evidence:`, `HTML:`) each get a distinct bright colour, fact keys/values are
   coloured separately, the HTML body has its own warm colour, on a soft gradient panel with a
   glow. Larger type (14.5 px / 1.6 line-height) and more padding.
2. **`docs/sandbox.html` — a try-it page** — a standalone page served by Pages at
   `/docs/sandbox.html` (and from `file://`) that embeds the published registry with relative
   `../registry/...` URLs (works from both roots), shows pickable demo blocks, and has a
   "paste what you copied" area plus a "Read clipboard" button so the visitor sees the payload.
   Linked from the docs header and the embed section.
3. The sandbox is exercised in e2e (served at `/sandbox` by the test server): FAB boots and a
   pick copies on it, so it cannot rot.

## Contract

- `docs/sandbox.html`: self-contained, no build step, embedded via
  `../registry/inspector/v1/inspector.{css,js}` (relative: resolves to `/registry/…` from
  `/docs/sandbox.html`, from `file://`, and from the e2e server's `/sandbox` route).
  Sections: hero + two-line embed snippet shown as copyable code, 3–4 pickable demo blocks,
  a paste/read-clipboard panel, and a link back to the docs.
- Payload tokenising is render-time only (`scripts/docs.cjs`): escaping stays correct, and the
  raw copied text remains byte-identical (only the presentation changes).
- Colour vocabulary (CSS classes): `.pk` section key, `.pfk` fact key, `.pfv` fact value,
  `.ph` HTML body; panel = `linear-gradient` background + accent glow border.

## Acceptance criteria

1. `npm run docs` renders payload blocks with the token colours (screenshot evidence).
2. `docs/sandbox.html` exists, embeds the FAB, and a real pick works on it (e2e test green;
   screenshot evidence of the page with the FAB + a pick).
3. Docs page links the sandbox from the header and the embed section; README links it too.
4. `npm run test:e2e` stays green (new sandbox test), `npm test`/`test:ui` unchanged.
5. Pages serves `/docs/` and `/docs/sandbox.html` after push; CI green; ticket moved to `done/`.

## Out of scope

A full interactive playground (source editing, multi-page demos), shareable payload URLs,
and extracting the sandbox into a separate app.
