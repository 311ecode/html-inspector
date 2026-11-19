# html-inspector

The public home of the **HTML Inspector** — an in-page inspection FAB for any page
(embed two files) plus a thin Chrome MV3 shell that drops the same FAB onto any tab.

Extracted from `~/dev/menu-dashboard` (DASH-290a/b), where it lived as
`menu-inspector@0.4.11`. This repo owns the source, the generated static
registry, the extension shell, and the release flow.

> **State: bootstrap.** This repo currently carries docs + tickets only. The
> import and the first public release are
> [`INSP-001`](tickets/new/INSP-001-bootstrap-public-distribution-repo.md).

## What ships

| Artifact | Source | Where it goes |
|---|---|---|
| `inspector.js` + `inspector.css` (the FAB) | `inspector/` → generated `registry/inspector/<ver>/` | committed text — served to pages as an embed |
| Chrome MV3 extension ("HTML Inspector") | `extension/` (+ vendored registry copy) | `html-inspector-extension-<ver>.zip` → GitHub Release |
| Embeddable bundle (vendoring copy) | same registry files | `html-inspector-embed-<ver>.zip` → GitHub Release |

Version, layout and the release flow contracts live in the project
[`AGENTS.md`](AGENTS.md) and [`tickets/README.md`](tickets/README.md).

## Work tracking

`INSP-…` tickets under `tickets/`; fresh agents start at
[`tickets/README.md`](tickets/README.md). Shared rules: [`../rules/`](../rules/README.md).
