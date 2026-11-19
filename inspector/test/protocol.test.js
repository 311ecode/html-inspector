// inspector/test/protocol.test.js — DASH-290a, extended by DASH-385/397/419/499.
//
// The protocolVersion 3 wire format, tested PURELY: no browser, no server, no
// dashboard. `node --test inspector/test/protocol.test.js`.
//
// inspector/src/inspector.js is moved verbatim and is a browser IIFE with no
// exports, so this suite lifts its protocol helpers (the payload builder, the
// evidence resolver, plus applyPaste's rejection rules) out of the shipped
// text instead of re-implementing them: function declarations hoist, so
// injecting one `return {...}` as the IIFE's first statement exposes them.
// That statement runs before the FAB lookup, so no DOM is needed — only the
// tiny `document` stub applyPaste's toast path touches. The test therefore
// exercises the shipped file, not a copy.
//
// DASH-385 — the payload grows two sections (`Captured:`/`Evidence:`) before
// `HTML:` when the picked element or an ancestor carries `data-evidence-node`
// and an `evidence-meta-<beat>` island has an entry for it. URL:/Path:/HTML:
// are byte-identical to protocolVersion 1, and a missing node, missing island
// or malformed island falls back to that exact three-line payload.
//
// DASH-419 — a page-level `evidence-context` island adds a `Context:` block
// (header + one `  key: value` per fact, island order) BEFORE those sections;
// on a page with no island the payload stays byte-identical to the three-line
// form. The island is read by id (document.getElementById), never through the
// per-node resolver.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = path.join(__dirname, '..', 'src', 'inspector.js');
const IIFE_OPEN = '(function() {';
const IIFE_CLOSE = '})();';

const IIFE_ANCHOR = '\n' + IIFE_OPEN; // the top-level IIFE starts its own line

// The helpers the suite exercises. DASH-385 adds evidenceLines/buildPayload —
// the payload builder, so byte-identity and the fallback are provable here.
// DASH-397 adds formatFactValue — the island-value display formatter itself.
// DASH-419 adds contextLines — the page-level context-island reader.
// DASH-499 adds the MD payload builder, the absolute-XPath builder and the
// DOM→Markdown converter (all pure over a hand-built node tree — §3.2 asks
// for exactly these no-browser tests). Every exposed function is a hoisted
// declaration and must not read a top-level `var`: this loader returns before
// the IIFE body runs, so only declarations exist.
const EXPOSE =
  'return { parseSnapshot: parseSnapshot, parseCollection: parseCollection, ' +
  'formatSnapshot: formatSnapshot, applyPaste: applyPaste, ' +
  'evidenceLines: evidenceLines, contextLines: contextLines, ' +
  'buildPayload: buildPayload, formatFactValue: formatFactValue, ' +
  'buildMdPayload: buildMdPayload, xpathOf: xpathOf, ' +
  'htmlToMarkdown: htmlToMarkdown };';

function loadProtocol(document, location) {
  const src = fs.readFileSync(SOURCE, 'utf8');
  if (src.split(IIFE_ANCHOR).length - 1 !== 1 || !src.trimEnd().endsWith(IIFE_CLOSE)) {
    throw new Error(
      'protocol.test.js: inspector/src/inspector.js no longer has the expected ' +
      'single IIFE shape — update this loader (the shipped file must not change)'
    );
  }
  const exposed = src
    .replace(IIFE_ANCHOR, IIFE_ANCHOR + '\n    ' + EXPOSE)
    .replace(/\}\)\(\);\s*$/, '})()');
  // `return (` stays on one line: the source begins with a comment block, and a
  // bare `return` newline would let ASI terminate it. `location` is a parameter
  // so the payload builder is testable without a browser global.
  return new Function('document', 'location', 'return (' + exposed + ');')(document, location);
}

// The only DOM the pure paths touch: createElement/body for the toast,
// querySelector recorded so the "first block's Path wins" rule is observable,
// querySelectorAll feeding the per-node evidence islands, and getElementById
// returning the DASH-419 page-level context island (when one is passed).
function makeDocument(islands, contextIsland) {
  const created = [];
  const queried = [];
  const document = {
    islands: islands || [],
    contextIsland: contextIsland || null,
    getElementById(id) {
      return id === 'evidence-context' ? this.contextIsland : null;
    },
    createElement(tag) {
      const el = { tagName: tag, className: '', textContent: '', classList: { add() {}, remove() {} } };
      created.push(el);
      return el;
    },
    body: { appendChild() {} },
    querySelector(selector) {
      queried.push(selector);
      return null; // resolver miss → the "not found" branch, after the path is chosen
    },
    querySelectorAll() {
      return this.islands;
    },
  };
  return { document, created, queried };
}

const stubs = makeDocument();
const protocol = loadProtocol(stubs.document, { href: 'http://bundle:64400/flipbook/x/story.html' });
// showToast schedules a 1.5 s class removal; stub the timer so the test process
// does not linger on it.
const realSetTimeout = global.setTimeout;

function applyPaste(text) {
  stubs.queried.length = 0;
  global.setTimeout = () => 0;
  try {
    protocol.applyPaste(text);
  } finally {
    global.setTimeout = realSetTimeout;
  }
  const toast = stubs.created[stubs.created.length - 1];
  return { message: toast ? toast.textContent : null, queried: stubs.queried.slice() };
}

function block(url, p, html) {
  return 'URL: ' + url + '\nPath: ' + p + '\nHTML:\n' + html;
}

// A minimal element for the payload builder: enough for pathText/selectorName
// (tagName/id/className/dataset/parentElement/outerHTML) and the evidence
// lookup (getAttribute/closest).
function element(props) {
  const el = Object.assign({
    tagName: 'DIV',
    id: '',
    className: '',
    dataset: {},
    outerHTML: '<div></div>',
    parentElement: null,
    evidenceNode: null,
    getAttribute(name) {
      return name === 'data-evidence-node' ? this.evidenceNode : null;
    },
    closest() {
      let node = this;
      while (node) {
        if (node.evidenceNode) return node;
        node = node.parentElement;
      }
      return null;
    },
  }, props);
  return el;
}

// An island <script> stub: the resolver only reads textContent.
function island(json) {
  return { textContent: typeof json === 'string' ? json : JSON.stringify(json) };
}

// ── protocolVersion 2: URL/Path/HTML are unchanged ─────────────────────

test('protocolVersion 2: a bare block round-trips format → parse (unchanged three lines)', () => {
  const snap = {
    url: 'http://host:8081/?dev=1',
    path: 'div.container > div#machineGrid > div.machine-card',
    html: '<div class="machine-card">x</div>',
  };
  const text = protocol.formatSnapshot(snap);
  // The wire shape is frozen: three labelled lines, HTML last and multiline.
  assert.strictEqual(text, block(snap.url, snap.path, snap.html));
  assert.deepStrictEqual(protocol.parseSnapshot(text), snap);
});

test('protocolVersion 2: a ---delimited collection parses into N snapshots', () => {
  const snaps = [
    { url: 'http://a:8081/', path: 'div.a', html: '<div class="a">1</div>' },
    { url: 'http://b:8081/', path: 'div.b', html: '<div class="b">2</div>' },
    { url: 'http://c:8081/', path: 'div.c', html: '<div class="c">3</div>' },
  ];
  const text = snaps.map(protocol.formatSnapshot).join('\n---\n');
  const parsed = protocol.parseCollection(text);
  assert.strictEqual(parsed.length, 3);
  assert.deepStrictEqual(parsed, snaps);
});

test('protocolVersion 2: a truncated path (containing …) is rejected', () => {
  const result = applyPaste(block('http://a:8081/', 'div.container > … > div.machine-name', '<div>x</div>'));
  assert.strictEqual(result.message, 'Path is truncated — re-copy it');
  assert.deepStrictEqual(result.queried, []); // never resolved
});

test('protocolVersion 2: a non-inspection clipboard payload ("hello") is rejected', () => {
  const result = applyPaste('hello');
  assert.strictEqual(result.message, 'Clipboard is not an inspection block');
  assert.deepStrictEqual(result.queried, []);
});

test('protocolVersion 2: the first block\u2019s Path wins (applyPaste rule)', () => {
  const first = 'div.container > div.first';
  const second = 'div.container > div.second';
  const result = applyPaste(
    protocol.formatSnapshot({ url: 'http://a:8081/', path: first, html: '<div class="first">1</div>' }) +
    '\n---\n' +
    protocol.formatSnapshot({ url: 'http://b:8081/', path: second, html: '<div class="second">2</div>' })
  );
  assert.deepStrictEqual(result.queried, [first]); // only the FIRST path is asked for
  assert.strictEqual(result.message, 'Element not found on this dashboard');
});

// ── DASH-385: the evidence block ───────────────────────────────────────

const NODE = 'mock-off-calls-waiter/f1/customer-iphone-16';
const ENTRY = {
  run: '38894073341 · staff-e2e · sha ed2a83c',
  test: 'T#### · Product behavior',
  beat: 'mock-off-calls-waiter · passed',
  frame: '1/2 entry',
  panel: 'actor customer · profile iphone-16',
  view: 'iPhone 16 portrait · 393×852 CSS → 1179×2556 px',
  captured: 'http://captured-host:3000/payment/customer-flow',
};
const EVIDENCE_BLOCK =
  'Captured: ' + ENTRY.captured + '\n' +
  'Evidence:\n' +
  '  run: ' + ENTRY.run + '\n' +
  '  test: ' + ENTRY.test + '\n' +
  '  beat: ' + ENTRY.beat + '\n' +
  '  frame: ' + ENTRY.frame + '\n' +
  '  panel: ' + ENTRY.panel + '\n' +
  '  view: ' + ENTRY.view + '\n';

// The three-line payload for this fake element (the protocolVersion 1 shape).
const FIXTURE_HTML = '<div id="panelBody"></div>';
const BARE =
  'URL: http://bundle:64400/flipbook/x/story.html\n' +
  'Path: figure#panel > div#panelBody\n' +
  'HTML:\n' + FIXTURE_HTML;

// The DASH-385 fixture: a picked element (the block) inside the panel figure
// that carries the node. Each test loads the shipped source against its own
// island set, so the island scan is exercised, never a copy of the resolver.
function panelFixture(islands, contextIsland) {
  const doc = makeDocument(islands, contextIsland);
  const loaded = loadProtocol(doc.document, { href: 'http://bundle:64400/flipbook/x/story.html' });
  const figure = element({ tagName: 'FIGURE', id: 'panel' });
  const body = element({
    tagName: 'DIV', id: 'panelBody',
    parentElement: figure, outerHTML: FIXTURE_HTML,
  });
  return {
    figure, body,
    buildPayload: loaded.buildPayload,
    evidenceLines: loaded.evidenceLines,
    contextLines: loaded.contextLines,
    formatFactValue: loaded.formatFactValue,
  };
}

test('DASH-385: a node on the picked element adds Captured + Evidence before HTML', () => {
  const { buildPayload, body } = panelFixture([island({ [NODE]: ENTRY })]);
  body.evidenceNode = NODE;
  assert.strictEqual(buildPayload(body), BARE.replace('HTML:', EVIDENCE_BLOCK + 'HTML:'));
});

test('DASH-385: the nearest ANCESTOR node resolves, and a second island is scanned (beat never inferred from the node id)', () => {
  // The first island is malformed and the second belongs to another beat —
  // the node lives in the third, found only by scanning all of them.
  const { buildPayload, body } = panelFixture([
    island('{ this is not json }'),
    island({ 'other-beat/f1/x': { run: 'nope' } }),
    island({ [NODE]: ENTRY }),
  ]);
  const figure = body.parentElement;
  figure.evidenceNode = NODE; // node on the ancestor, not on the pick
  const text = buildPayload(body);
  assert.strictEqual(text, BARE.replace('HTML:', EVIDENCE_BLOCK + 'HTML:'));
  // URL:/Path:/HTML: byte-identical to the bare payload for the same element.
  assert.strictEqual(text.replace(EVIDENCE_BLOCK, ''), BARE);
});

test('DASH-385: the C1 `page` { url } shape is hoisted to Captured and not repeated', () => {
  const { buildPayload, body } = panelFixture([
    island({ [NODE]: { page: { url: 'http://captured-host:3000/route' }, run: 'r' } }),
  ]);
  body.evidenceNode = NODE;
  assert.strictEqual(
    buildPayload(body),
    BARE.replace('HTML:', 'Captured: http://captured-host:3000/route\nEvidence:\n  run: r\nHTML:')
  );
});

test('DASH-385: no node anywhere → the exact three-line payload (the dashboard)', () => {
  const { buildPayload, body } = panelFixture([island({ [NODE]: ENTRY })]);
  assert.strictEqual(buildPayload(body), BARE);
});

test('DASH-385: a missing island degrades to the three-line payload', () => {
  const { buildPayload, body } = panelFixture([]);
  body.evidenceNode = NODE;
  assert.strictEqual(buildPayload(body), BARE);
});

test('DASH-385: a malformed island degrades to the three-line payload and never throws', () => {
  const { buildPayload, evidenceLines, body } = panelFixture([island('{ not json at all')]);
  body.evidenceNode = NODE;
  assert.doesNotThrow(() => evidenceLines(body));
  assert.strictEqual(evidenceLines(body), null);
  assert.strictEqual(buildPayload(body), BARE);
});

test('DASH-385: an island with no entry for the node degrades to the three-line payload', () => {
  const { buildPayload, body } = panelFixture([island({ 'someone-else/f1/x': { run: 'r' } })]);
  body.evidenceNode = NODE;
  assert.strictEqual(buildPayload(body), BARE);
});

// ── DASH-397: island values are DISPLAY text, never [object Object] ────

// The Evidence lines for an arbitrary island entry, resolved through the
// shipped evidenceLines (the renderer, not a copy).
function linesForEntry(entry) {
  const { evidenceLines, body } = panelFixture([island({ [NODE]: entry })]);
  body.evidenceNode = NODE;
  return evidenceLines(body);
}

test('DASH-397: known object facts render their display forms (dom path, imageSize, render)', () => {
  const { buildPayload, body } = panelFixture([island({
    [NODE]: {
      run: '39039772250 · staff-e2e · sha 73a32bce',
      dom: { path: 'html/galaxy-a57-landscape/mock-off-calls-waiter/panel.html' },
      imageSize: { width: 2319, height: 1071 },
      render: { cssWidth: 892, cssHeight: 412, dpr: 2.6 },
    },
  })]);
  body.evidenceNode = NODE;
  const text = buildPayload(body);
  // The defect: `dom` (MENU-051) used to print `[object Object]`. The path is
  // the exact bundle-relative string, unquoted, in island order.
  assert.deepStrictEqual(text.split('\n').slice(2, -2), [
    'Evidence:',
    '  run: 39039772250 · staff-e2e · sha 73a32bce',
    '  dom: html/galaxy-a57-landscape/mock-off-calls-waiter/panel.html',
    '  imageSize: 2319×1071 px',
    '  render: 892×412 CSS @2.6×',
  ]);
  assert.ok(!text.includes('[object Object]'));
  // The payload still ends with HTML: + the element's outerHTML.
  assert.ok(text.endsWith('HTML:\n' + FIXTURE_HTML));
});

test('DASH-397: dom renders its path and flags (missing) — other values in the same entry unaffected', () => {
  assert.deepStrictEqual(linesForEntry({ run: 'r', dom: { path: 'html/beat/x.html', missing: true } }), [
    'Evidence:',
    '  run: r',
    '  dom: html/beat/x.html (missing)',
  ]);
  // missing:false (or absent) prints the path alone.
  assert.deepStrictEqual(linesForEntry({ dom: { path: 'html/beat/x.html', missing: false } }), [
    'Evidence:',
    '  dom: html/beat/x.html',
  ]);
});

test('DASH-397: an unknown object is compact single-line JSON — never [object Object]', () => {
  const lines = linesForEntry({ future: { a: 1, b: 'two', nested: { c: [3] } } });
  assert.deepStrictEqual(lines, [
    'Evidence:',
    '  future: {"a":1,"b":"two","nested":{"c":[3]}}',
  ]);
  assert.ok(!lines.join('\n').includes('[object Object]'));
});

test('DASH-397: an array renders comma-joined display values, each through the formatter', () => {
  assert.deepStrictEqual(
    linesForEntry({ tags: ['alpha', 2, true, { k: 'v' }] }),
    ['Evidence:', '  tags: alpha, 2, true, {"k":"v"}']
  );
  // The array's key selects the item formatter too.
  assert.deepStrictEqual(
    linesForEntry({ dom: [{ path: 'html/a.html' }, { path: 'html/b.html', missing: true }] }),
    ['Evidence:', '  dom: html/a.html, html/b.html (missing)']
  );
});

test('DASH-397: primitive facts are unchanged (String(value): string/number/boolean/null)', () => {
  assert.deepStrictEqual(
    linesForEntry({ s: 'text', n: 12, b: true, z: null }),
    ['Evidence:', '  s: text', '  n: 12', '  b: true', '  z: null']
  );
  // The landed all-string block is byte-identical: the formatter is a no-op
  // for the primitives DASH-385 already rendered.
  const { buildPayload: build, body: picked } = panelFixture([island({ [NODE]: ENTRY })]);
  picked.evidenceNode = NODE;
  assert.strictEqual(build(picked), BARE.replace('HTML:', EVIDENCE_BLOCK + 'HTML:'));
});

test('DASH-397: a very long string truncates deterministically with … (threshold 300)', () => {
  const long = 'x'.repeat(400);
  const truncated = protocol.formatFactValue('note', long);
  assert.strictEqual(truncated.length, 301);
  assert.strictEqual(truncated, 'x'.repeat(300) + '…');
  assert.strictEqual(protocol.formatFactValue('note', long), truncated); // deterministic
  assert.strictEqual(protocol.formatFactValue('note', 'x'.repeat(300)), 'x'.repeat(300)); // only > 300
  assert.deepStrictEqual(linesForEntry({ note: long }), ['Evidence:', '  note: ' + truncated]);
});

// ── DASH-385: paste-inspection survives the new lines ──────────────────

test('DASH-385: a block carrying Captured/Evidence still parses — the HTML body starts after HTML:', () => {
  const text = 'URL: http://a:8081/\nPath: div.first\n' + EVIDENCE_BLOCK + 'HTML:\n<div>body</div>';
  assert.deepStrictEqual(protocol.parseSnapshot(text), {
    url: 'http://a:8081/', path: 'div.first', html: '<div>body</div>',
  });
  assert.deepStrictEqual(protocol.parseCollection(text).map((s) => s.path), ['div.first']);
});

test('DASH-385: applyPaste resolves the Path from a block with the new lines present', () => {
  const text = 'URL: http://a:8081/\nPath: div.container > div.first\n' + EVIDENCE_BLOCK + 'HTML:\n<div>1</div>';
  const result = applyPaste(text);
  assert.deepStrictEqual(result.queried, ['div.container > div.first']);
  assert.strictEqual(result.message, 'Element not found on this dashboard');
});

// ── DASH-419: the page-level context island ────────────────────────────

// MENU-075's frozen shape, facts in generator order (JSON object order —
// the payload must not sort or filter them).
const CONTEXT_FACTS = {
  app: 'Example App',
  suite: 'staff-e2e',
  services: 'quillib · menu-api',
  repo: '/srv/example-app',
  workspace: '/srv',
  commit: 'https://github.com/example-org/example-app/commit/9a5133efe',
  manifest: 'staff-e2e/manifest.json',
};
const CONTEXT_ISLAND = { schema: 'evidence-context/v1', facts: CONTEXT_FACTS };

// The `Context:` block exactly as the payload must carry it: the header line,
// then one two-space-indented `key: value` line per fact, in island order.
function contextBlock(facts) {
  const f = facts || CONTEXT_FACTS;
  return 'Context:\n' + Object.keys(f).map((k) => `  ${k}: ${f[k]}`).join('\n') + '\n';
}

test('DASH-419: a non-node pick on a page with the island gets URL/Path/Context/HTML — values verbatim, no evidence sections', () => {
  const { buildPayload, body } = panelFixture([], island(CONTEXT_ISLAND));
  // No data-evidence-node anywhere: the old payload was URL/Path/HTML only.
  assert.strictEqual(buildPayload(body), BARE.replace('HTML:', contextBlock() + 'HTML:'));
  const text = buildPayload(body);
  assert.ok(!text.includes('Captured:'));
  assert.ok(!text.includes('Evidence:'));
  // The facts are verbatim display strings (the formatter is a no-op on
  // primitives), one line each, in island order.
  assert.deepStrictEqual(
    text.split('\n').slice(2, -2),
    ['Context:', ...Object.keys(CONTEXT_FACTS).map((k) => `  ${k}: ${CONTEXT_FACTS[k]}`)]
  );
});

test('DASH-419: a panel pick gets Context THEN Captured THEN Evidence, each exactly once, all before HTML', () => {
  const { buildPayload, body } = panelFixture([island({ [NODE]: ENTRY })], island(CONTEXT_ISLAND));
  body.evidenceNode = NODE;
  const text = buildPayload(body);
  assert.strictEqual(
    text,
    BARE.replace('HTML:', contextBlock() + EVIDENCE_BLOCK + 'HTML:')
  );
  // Frozen section order.
  assert.ok(text.indexOf('Context:') < text.indexOf('Captured:'));
  assert.ok(text.indexOf('Captured:') < text.indexOf('Evidence:'));
  assert.ok(text.indexOf('Evidence:') < text.indexOf('\nHTML:'));
  assert.strictEqual(text.split('Context:').length - 1, 1);
  assert.strictEqual(text.split('Captured:').length - 1, 1);
  assert.strictEqual(text.split('Evidence:').length - 1, 1);
});

test('DASH-419: arbitrary island key order is untouched and a fact value containing ": " survives', () => {
  const facts = { zeta: 'a: b: c', alpha: 'first: value: deeper', beta: 7 };
  const { buildPayload, body } = panelFixture([], island({ schema: 'evidence-context/v1', facts }));
  const text = buildPayload(body);
  assert.strictEqual(text, BARE.replace('HTML:', contextBlock(facts) + 'HTML:'));
  // The keys keep insertion order — never sorted (alpha would come first).
  const lines = text.split('\n');
  assert.deepStrictEqual(lines.slice(2, -2), [
    'Context:',
    '  zeta: a: b: c',
    '  alpha: first: value: deeper',
    '  beta: 7',
  ]);
});

test('DASH-419: a malformed context island contributes nothing and never throws — the payload equals today\u2019s', () => {
  const { buildPayload, contextLines, body } = panelFixture([], island('{oops'));
  assert.doesNotThrow(() => contextLines());
  assert.strictEqual(contextLines(), null);
  assert.strictEqual(buildPayload(body), BARE);
  assert.ok(!buildPayload(body).includes('Context:'));
});

test('DASH-419: an empty or facts-less context island contributes nothing', () => {
  for (const malformed of [
    island(''),
    island('{}'),
    island({ schema: 'evidence-context/v1' }),          // no facts
    island({ schema: 'evidence-context/v1', facts: {} }), // empty facts
    island({ facts: [] }),                              // wrong shape
    island({ facts: 'nope' }),                          // wrong shape
  ]) {
    const { buildPayload, contextLines, body } = panelFixture([], malformed);
    assert.strictEqual(contextLines(), null);
    assert.strictEqual(buildPayload(body), BARE);
  }
});

test('DASH-419: no context island at all keeps the three-line payload byte-identical', () => {
  const { buildPayload, body } = panelFixture([], null);
  assert.strictEqual(buildPayload(body), BARE);
  // With per-node evidence present and no page island the old v2 payload is
  // also unchanged (Context is absent, URL/Path/HTML untouched).
  const panel = panelFixture([island({ [NODE]: ENTRY })], null);
  panel.body.evidenceNode = NODE;
  assert.strictEqual(panel.buildPayload(panel.body), BARE.replace('HTML:', EVIDENCE_BLOCK + 'HTML:'));
});

// ── DASH-499 — the MD payload, the XPath builder and the converter ─────
//
// These are pure functions over a node tree, so the shipped file is exercised
// with hand-built stubs (§3.2 names exactly this for xpathOf). Only the
// flex/grid rule needs getComputedStyle — stubbed for the duration of that one
// test; everything else needs no DOM at all.

// A text node.
function mdText(value) {
  return { nodeType: 3, nodeValue: value };
}

// An element node with exactly the surface the converter/XPath/path helpers
// read. `attributes` is a plain object; child element nodes get their
// parentElement set, so pathText/xpathOf can walk back up.
function mdNode(tag, opts = {}) {
  const element = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    id: opts.id || '',
    className: opts.className || '',
    dataset: {},
    textContent: opts.textContent || '',
    attributes: opts.attributes || {},
    childNodes: [],
    children: [],
    parentElement: opts.parentElement || null,
    previousElementSibling: opts.previousElementSibling || null,
    checked: !!opts.checked,
    value: opts.value,
    display: opts.display,
    rows: opts.rows,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name);
    },
  };
  for (const child of opts.childNodes || []) {
    if (child.nodeType === 1) {
      if (!child.parentElement) child.parentElement = element;
      element.children.push(child);
    }
    element.childNodes.push(child);
  }
  return element;
}

// The fixture page's URL is irrelevant here; only an absolute base matters.
const MD_LOCATION = { href: 'http://bundle:64400/flipbook/x/story.html' };

// ── §3.2 — the absolute XPath ──────────────────────────────────────────

test('DASH-499: xpathOf — an id restarts the path as //*[@id="…"]', () => {
  assert.strictEqual(protocol.xpathOf(mdNode('div', { id: 'machineGrid' })), '//*[@id="machineGrid"]');
});

test('DASH-499: xpathOf — tag[n] under the nearest id, indexed among SAME-TAG siblings', () => {
  const root = mdNode('div', { id: 'machineGrid' });
  const first = mdNode('div', { parentElement: root });
  const second = mdNode('div', { parentElement: root, previousElementSibling: first });
  const third = mdNode('div', { parentElement: root, previousElementSibling: second });
  root.childNodes = root.children = [first, second, third];
  assert.strictEqual(protocol.xpathOf(third), '//*[@id="machineGrid"]/div[3]');

  // A different tag between them does not count toward n.
  const span = mdNode('span', { parentElement: root, previousElementSibling: third });
  assert.strictEqual(protocol.xpathOf(span), '//*[@id="machineGrid"]/span[1]');
});

test('DASH-499: xpathOf — no id anywhere → /html[1]/body[1]/…', () => {
  const html = mdNode('html', { id: '' });
  const body = mdNode('body', { parentElement: html });
  const first = mdNode('div', { parentElement: body });
  const second = mdNode('div', { parentElement: body, previousElementSibling: first });
  html.childNodes = html.children = [body];
  body.childNodes = body.children = [first, second];
  assert.strictEqual(protocol.xpathOf(second), '/html[1]/body[1]/div[2]');
});

test('DASH-499: xpathOf — the id is quote-escaped and non-elements yield ""', () => {
  assert.strictEqual(protocol.xpathOf(mdNode('div', { id: 'a"b' })), '//*[@id="a\\"b"]');
  assert.strictEqual(protocol.xpathOf(null), '');
  assert.strictEqual(protocol.xpathOf(mdText('x')), '');
});

// ── §3 — the frozen MD payload ─────────────────────────────────────────

test('DASH-499: buildMdPayload — the exact block, first line, no Path:, trimmed body', () => {
  const picked = mdNode('div', {
    id: 'picked',
    childNodes: [
      mdText('Hello '),
      mdNode('strong', { childNodes: [mdText('world')] }),
    ],
  });
  assert.strictEqual(
    protocol.buildMdPayload(picked),
    'HTML Inspector — selected area\n' +
    'URL: ' + MD_LOCATION.href + '\n' +
    'XPath: //*[@id="picked"]\n' +
    'Selector: div#picked\n' +
    'Markdown:\n' +
    'Hello **world**'
  );
  // The first line is the literal U+2014-em-dash header, and there is no
  // trailing newline after the last body character.
  assert.ok(protocol.buildMdPayload(picked).startsWith('HTML Inspector — selected area\n'));
  assert.ok(!protocol.buildMdPayload(picked).endsWith('\n'));
});

test('DASH-499: buildMdPayload — an empty conversion still copies, named placeholder', () => {
  const bare = mdNode('div', { id: 'bare', childNodes: [mdNode('svg', {})] });
  assert.strictEqual(
    protocol.buildMdPayload(bare),
    'HTML Inspector — selected area\n' +
    'URL: ' + MD_LOCATION.href + '\n' +
    'XPath: //*[@id="bare"]\n' +
    'Selector: div#bare\n' +
    'Markdown:\n' +
    '_(no textual content)_'
  );
});

test('DASH-499: an MD block never parses as an inspection snapshot — paste keeps rejecting it', () => {
  const block = protocol.buildMdPayload(mdNode('div', { id: 'picked', childNodes: [mdText('x')] }));
  // The deliberate absence of a `Path:` line is the contract (parseSnapshot
  // keys on it, and parseCollection filters snapshots without a path).
  assert.ok(!/^Path:/m.test(block));
  assert.deepStrictEqual(protocol.parseCollection(block), []);
  assert.deepStrictEqual(protocol.parseSnapshot(block), { url: MD_LOCATION.href, path: null, html: null });
  assert.strictEqual(applyPaste(block).message, 'Clipboard is not an inspection block');
});

// ── §3.1 — the inline rules ────────────────────────────────────────────

test('DASH-499 converter: inline marks, backtick fences, links and images (absolute), javascript: degradation', () => {
  const markdown = protocol.htmlToMarkdown;
  const marks = mdNode('div', {
    childNodes: [
      mdText('a '),
      mdNode('strong', { childNodes: [mdText('bold')] }),
      mdText(' '),
      mdNode('em', { childNodes: [mdText('it')] }),
      mdText(' '),
      mdNode('del', { childNodes: [mdText('gone')] }),
      mdText(' '),
      mdNode('code', { textContent: 'a`b' }),
    ],
  });
  assert.strictEqual(markdown(marks), 'a **bold** *it* ~~gone~~ ``a`b``');

  const links = mdNode('div', {
    childNodes: [
      mdNode('a', { attributes: { href: '/x?q=1' }, childNodes: [mdText('go')] }),
      mdText(' '),
      mdNode('a', { attributes: { href: 'javascript:void(0)' }, childNodes: [mdText('js')] }),
      mdText(' '),
      // icon-only anchor: the svg is skipped, so the anchor carries no text.
      mdNode('a', { attributes: { href: '/icon' }, childNodes: [mdNode('svg', {})] }),
    ],
  });
  assert.strictEqual(markdown(links), '[go](http://bundle:64400/x?q=1) js');

  const images = mdNode('div', {
    childNodes: [
      mdNode('img', { attributes: { src: '/dot.png', alt: 'dot' } }),
      mdText(' '),
      mdNode('img', { attributes: { src: 'data:image/png;base64,AA', alt: 'inline' } }),
    ],
  });
  assert.strictEqual(markdown(images), '![dot](http://bundle:64400/dot.png) ![inline]((inline data image omitted))');
});

test('DASH-499 converter: inputs — checkbox/radio marks, hidden skipped, other types as `[type: value]`', () => {
  const inputs = mdNode('div', {
    childNodes: [
      mdNode('input', { attributes: { type: 'checkbox', checked: '' }, checked: true }),
      mdNode('input', { attributes: { type: 'checkbox' } }),
      mdNode('input', { attributes: { type: 'hidden', value: 'x' } }),
      mdNode('input', { attributes: { type: 'text', value: 'hi' } }),
    ],
  });
  assert.strictEqual(protocol.htmlToMarkdown(inputs), '[x][ ]`[text: hi]`');
});

test('DASH-499 converter: block rules — headings, nested/started lists, quote, fenced pre (language), GFM table', () => {
  const markdown = protocol.htmlToMarkdown;
  assert.strictEqual(markdown(mdNode('h2', { childNodes: [mdText('Title')] })), '## Title');

  const nested = mdNode('ul', {
    childNodes: [
      mdNode('li', {
        childNodes: [
          mdText('one'),
          mdNode('ul', { childNodes: [mdNode('li', { childNodes: [mdText('one-a')] })] }),
        ],
      }),
      mdNode('li', { childNodes: [mdText('two')] }),
    ],
  });
  assert.strictEqual(markdown(nested), '- one\n\n  - one-a\n- two');

  const ordered = mdNode('ol', {
    attributes: { start: '3' },
    childNodes: [
      mdNode('li', { childNodes: [mdText('c')] }),
      mdNode('li', { childNodes: [mdText('d')] }),
    ],
  });
  assert.strictEqual(markdown(ordered), '3. c\n4. d');

  assert.strictEqual(markdown(mdNode('blockquote', { childNodes: [mdText('quiet')] })), '> quiet');
  assert.strictEqual(markdown(mdNode('hr')), '---');

  // Fenced code keeps its body verbatim (the cleaner must not strip the
  // indentation) and takes the language from class="language-*".
  assert.strictEqual(
    markdown(mdNode('pre', {
      attributes: { class: 'language-js' },
      textContent: 'const x = 1;\n  indented();\n',
    })),
    '```js\nconst x = 1;\n  indented();\n```'
  );
  // class="lang-*" is accepted too, and no class means a bare fence.
  assert.strictEqual(
    markdown(mdNode('pre', { attributes: { class: 'lang-json' }, textContent: '{"a":1}' })),
    '```json\n{"a":1}\n```'
  );

  // GFM pipe table: header row, separator, `|` escaped, rows padded.
  const headerCell = (value) => mdNode('th', { childNodes: [mdText(value)] });
  const bodyCell = (value) => mdNode('td', { childNodes: [mdText(value)] });
  const table = mdNode('table', {
    rows: [
      { cells: [headerCell('A'), headerCell('B')] },
      { cells: [bodyCell('x|y'), bodyCell('')] },
    ],
  });
  const tableLines = markdown(table).split('\n');
  assert.deepStrictEqual(tableLines.slice(0, 2), ['| A | B |', '| --- | --- |']);
  assert.ok(tableLines[2].startsWith('| x\\|y |'));
  assert.ok(tableLines[2].endsWith('|'));
});

test('DASH-499 converter: skipped nodes — script/style/svg, aria-hidden="true", [hidden]', () => {
  const markdown = protocol.htmlToMarkdown;
  const root = mdNode('div', {
    childNodes: [
      mdNode('span', { attributes: { 'aria-hidden': 'true' }, childNodes: [mdText('secret')] }),
      mdNode('svg', { childNodes: [mdText('graphic')] }),
      mdNode('span', { attributes: { hidden: '' }, childNodes: [mdText('gone')] }),
      mdNode('span', { childNodes: [mdText('shown')] }),
    ],
  });
  assert.strictEqual(markdown(root), 'shown');
  assert.strictEqual(markdown(mdNode('div', { attributes: { 'aria-hidden': 'true' } })), '');
  assert.strictEqual(markdown(mdNode('div', { childNodes: [mdNode('svg', {})] })), '');
});

test('DASH-499 converter: a flex/grid parent joins its children with ONE space; inline siblings concatenate', () => {
  const markdown = protocol.htmlToMarkdown;
  const realComputedStyle = global.getComputedStyle;
  global.getComputedStyle = (el) => ({ display: el.display || 'block' });
  try {
    const row = mdNode('div', {
      display: 'flex',
      childNodes: [
        mdNode('span', { childNodes: [mdText('alpha')] }),
        mdNode('span', { childNodes: [mdText('beta')] }),
        mdNode('span', { childNodes: [mdText('gamma')] }),
      ],
    });
    assert.strictEqual(markdown(row), 'alpha beta gamma');

    // CSS gap carries the spacing where the html has none — and the chunk's
    // own whitespace must never produce two.
    const spaced = mdNode('div', {
      display: 'grid',
      childNodes: [
        mdNode('span', { childNodes: [mdText('a ')] }),
        mdNode('span', { childNodes: [mdText(' b')] }),
      ],
    });
    assert.strictEqual(markdown(spaced), 'a b');

    // A trailing punctuation chunk gets no inserted space (never "x , y").
    const punctuated = mdNode('div', {
      display: 'flex',
      childNodes: [
        mdNode('span', { childNodes: [mdText('100%')] }),
        mdNode('span', { childNodes: [mdText(', online')] }),
      ],
    });
    assert.strictEqual(markdown(punctuated), '100%, online');

    // Inline parents concatenate as-is (the html's own text is the spacing).
    const inline = mdNode('div', {
      childNodes: [
        mdNode('span', { childNodes: [mdText('a')] }),
        mdNode('span', { childNodes: [mdText('b')] }),
      ],
    });
    assert.strictEqual(markdown(inline), 'ab');
  } finally {
    if (realComputedStyle === undefined) delete global.getComputedStyle;
    else global.getComputedStyle = realComputedStyle;
  }
});
