# HTML Inspector — Chrome extension (v0)

An on-demand HTML picker for any page: it triggers the already-published
inspector bundle. Press the
shortcut on any page; if the page does not already have `#fab` + `#fabSheet`,
the extension injects `vendor/inspector.js` and the familiar FAB appears. Drag
it onto an element to copy `URL: / Path: / HTML:` to the clipboard. A settled
pick also carries a `MD` chip under the `📋 HTML` one: it copies
`URL: / XPath: / Selector:` plus the element translated to Markdown (a one-way
summary — the HTML payload stays the round-trippable one).

The release zip's version is the **explicit** `manifest.json#version` — there is
no git-history derivation anymore (this repo exists partly because that counter
restarted). Bump `manifest.json` in the version commit; `node scripts/release.cjs`
stamps that value into the archive only.

## Load unpacked

1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked** → select this `extension/` directory.
3. Press `Alt+Shift+I` (or click the toolbar icon) on any http(s) page. The FAB
   appears bottom-right.

Nothing runs until invoked (`activeTab` only): no backend, no install-time host
warning, no persistent content script.

## Refresh the vendored bundle

The shell vendors the JS **and** the CSS from the registry channel, both
byte-for-byte copies of `registry/inspector/v1/`:

```sh
node extension/tools/sync-vendor.mjs          # copy
node extension/tools/sync-vendor.mjs --check  # drift guard (exit 1 on diff)
```

Then reload the extension (↻ on its card).

## Limitation

A press on a page that already has `#fab` does nothing — by design. The site's
inspector wins, and re-injecting would double-wire the bundle in that document.
