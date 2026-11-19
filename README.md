# html-inspector

The public home of the **HTML Inspector** — an in-page inspection FAB for any page
(embed two files) plus a thin Chrome MV3 shell that drops the same FAB onto any tab.

Extracted from `~/dev/menu-dashboard` (DASH-290a/b), where it lived as
`menu-inspector@0.4.11`. This repo owns the source, the generated static
registry, the extension shell, and the release flow.

> **State: live.** Tag [`inspector-v0.4.11`](https://github.com/311ecode/html-inspector/releases/tag/inspector-v0.4.11)
> carries the Chrome zip + the embeddable zip (each with a `.sha256`); the
> registry is served from GitHub Pages. The import + release record is
> [`INSP-001`](tickets/done/INSP-001-bootstrap-public-distribution-repo.md).

## Quick start

**Embed the FAB** on any page (served registry, GitHub Pages):

```html
<link rel="stylesheet" href="https://311ecode.github.io/html-inspector/registry/inspector/v1/inspector.css">
<script defer src="https://311ecode.github.io/html-inspector/registry/inspector/v1/inspector.js"></script>
```

Or vendor the same two files from the `html-inspector-embed-<version>.zip` Release asset.

**Chrome extension** — download `html-inspector-extension-<version>.zip` from the latest
[Release](https://github.com/311ecode/html-inspector/releases), unzip, then
`chrome://extensions` → Developer mode → Load unpacked.

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
