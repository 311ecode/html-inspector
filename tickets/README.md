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
