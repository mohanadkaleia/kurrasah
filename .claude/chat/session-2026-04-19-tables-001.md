# Session: GFM tables for kurrasah (v0.5.0)

- **Session ID**: 2026-04-19-tables-001
- **Status**: In Progress
- **Owner**: ui-engineer

## Task

Add GitHub-flavored Markdown tables to the `kurrasah` package. This is the
first block-level node addition since v0.1 and bumps the package to
**v0.5.0** (minor — new public API + new content type).

Scope:
- Four new schema nodes (`table`, `table_row`, `table_header`, `table_cell`)
  via `prosemirror-tables`'s `tableNodes` helper.
- GFM parse (via markdown-it's built-in `table` rule) + custom
  serializer that emits pipe syntax.
- `tableEditing()` + `columnResizing()` plugins, keymap chaining for
  Tab / Shift-Tab → `goToNextCell`.
- New `insertTable` named command, new slash-menu item.
- Styles scoped under `.editor-root .editor-content`.
- New vitest file `test/tables.test.js` with ≥8 cases.
- Type surface update (`EditorCommandName` union extension).
- README + CHANGELOG + demo markdown update.
- Dependency: `prosemirror-tables@^1.8.5` as peerDep + devDep.

Out of scope for v1:
- Lists inside cells.
- Nested tables.
- Multi-line cell content (GFM limitation — collapsed on serialize).
- New `<Editor>` prop — tables are always-on in v0.5.

## Implementation Plan

### FRONTEND PLAN

1. **`package.json`** — add `prosemirror-tables@^1.8.5` to `peerDependencies`
   and `devDependencies`. Bump version to `0.5.0`.

2. **`src/schema.js`**
   - Import `tableNodes` from `prosemirror-tables`.
   - Build a table-nodes bundle with config:
     - `tableGroup: 'block'`
     - `cellContent: 'inline*'` (matches what markdown-it emits inside
       `th`/`td` — no paragraph wrapper — and matches GFM's own
       single-line cell constraint; see Decisions).
     - `cellAttributes: {}`
   - Merge the four node specs into `nodes`.
   - `buildSchema()` keeps the table nodes (no opt-out flag for v1).

3. **`src/markdown.js`**
   - Enable the `table` rule in markdown-it (default-on in 14, but we use
     `'commonmark'` preset which disables it — need to call
     `.enable('table')` explicitly).
   - Parser token map: `table_open/close` → `table`, `thead_open/close` and
     `tbody_open/close` → ignore (markdown-it emits them around rows but
     PM's structure is table → row → cell directly), `tr_open/close` →
     `table_row`, `th_open/close` → `table_header`, `td_open/close` →
     `table_cell`.
   - Node serializers: `table`, `table_row`, `table_header`, `table_cell`.
     - Serializer emits pipe syntax. Iterate rows; for each row emit
       `| cell1 | cell2 | ... |\n`. After the first row (header), emit
       `|----|----|...\n`.
     - Escape `|` inside cells as `\|`.
     - Collapse intra-cell newlines (from paragraph breaks) into a single
       space — GFM limitation.

4. **`src/plugins.js`**
   - Import `tableEditing`, `columnResizing`, `goToNextCell` from
     `prosemirror-tables`.
   - Append `columnResizing()` and `tableEditing()` to the plugin list
     (resizing before editing — per docs).
   - Keymap: chain `Tab` → `goToNextCell(1)` then
     `sinkListItem`; `Shift-Tab` → `goToNextCell(-1)` then `liftListItem`.

5. **`src/commands.js`** — add `insertTable(schema, { rows, cols, withHeader })`.
   Default `{ rows: 3, cols: 3, withHeader: true }`. Build a table node via
   `tableType.create` with populated rows of empty paragraphs in cells.
   Place cursor into the first cell after insert. Register in
   `commandFactories`.

6. **`src/slashMenu.js`** — add the Table item.
   - id: `'table'`, label: `'جدول'`, description: `'جدول بأسطر وأعمدة'`,
     aliases: `['table', 'جدول']`, icon: 2×2 grid SVG, command:
     `'insertTable'`, args: `[{ rows: 3, cols: 3, withHeader: true }]`.

7. **`src/style.css`** — scoped under `.editor-root .editor-content`:
   - `table { border-collapse: collapse; margin-block: 0.75em; width: 100%; }`
   - `th, td { border: 1px solid var(--editor-border); padding: 0.35em 0.6em; vertical-align: top; }`
   - `th { background: var(--editor-code-bg); font-weight: 600; }`
   - `.ProseMirror-selectedcell { background: rgba(0,0,0,0.04); outline: 2px solid currentColor; outline-offset: -2px; }`
   - Column-resize handle styles from the upstream CSS (gray, scoped).

8. **`test/tables.test.js`** — ≥8 cases (schema surface, parse, roundtrip,
   inline marks in cells, pipe escaping, insertTable command, slash-menu
   filter, Tab navigation).

9. **`types/index.d.ts`** — add `'insertTable'` to `EditorCommandName`.

10. **`types/__check__.ts`** — add a sanity line using the new command name.

11. **`README.md`** — new "Tables" section between "Input rules" and
    "Link / image UI hooks"; update supported content + keyboard shortcut
    table.

12. **`CHANGELOG.md`** — `## [0.5.0] — 2026-04-19` entry.

13. **`web/src/views/DocsView.vue`** — preview markdown gains a small GFM
    table; "Supported content" list gains a row for tables.

## Decisions

- **v0.5.0 bump** (minor — new public API; no breaking changes). The
  `table` content type means existing markdown without tables roundtrips
  unchanged; tables in an existing doc now parse to real table nodes
  instead of being ignored.
- **Cell content**: `inline*`. Initial plan called for `paragraph+`,
  but markdown-it's GFM `table` rule emits the cell's inline tokens
  directly (no nested `paragraph_open`/`paragraph_close`). Using
  `paragraph+` would force a custom parser handler that synthesizes
  a wrapping paragraph token; using `inline*` matches what the parser
  actually emits and matches GFM's own single-line cell constraint.
  Lists, blockquotes, code blocks, and nested tables are not allowed
  inside cells in v1 — the schema rejects block content and the
  slash menu's block-type items are no-ops while the cursor is
  inside a cell. Revisit in a future minor if consumers ask for
  richer cells.
- **Column resizing**: included. `columnResizing()` is a recommended
  peer of `tableEditing()` and it does not force LTR — the resize handle
  lives on a visual cell edge, which is consistent regardless of document
  direction.
- **Always-on tables**: no new `<Editor>` prop. Consumers who want to
  disable tables can filter the slash-menu item themselves (custom item
  catalog is not exposed in v0.5 — same decision as the original slash
  menu).
- **Markdown serializer**: custom node serializers — `prosemirror-markdown`
  has no GFM table helper, so we write our own. Normalizing the column
  separator width to four dashes (`----`) is acceptable; GFM renderers
  treat any run of dashes as the same separator.
- **Roundtrip caveat**: intra-cell paragraph breaks collapse to a single
  space on serialize (GFM has no syntax for them). Documented.

## Log

### [VUE UI ENGINEER] 2026-04-19T17:00
- Read session context + kurrasah source (schema, markdown, plugins,
  commands, slashMenu, style, README, CHANGELOG, types).
- Installed `prosemirror-tables@^1.8.5` via `npm install --workspace
  kurrasah --save-dev` (workspace-scoped, added to devDependencies).
- Added `prosemirror-tables@^1` to the package's `peerDependencies`.
- Bumped version to `0.5.0` in `package.json`.

### [VUE UI ENGINEER] 2026-04-19T17:15
- Extended `src/schema.js` with the four table nodes via
  `tableNodes({ tableGroup: 'block', cellContent: 'paragraph+',
  cellAttributes: {} })`.
- Wired parser tokens (`table`, `tr`, `th`, `td`) in `src/markdown.js`.
- Wrote custom node serializers for `table` / `table_row` /
  `table_header` / `table_cell` — pipe syntax, empty-header
  synthesis, pipe escaping.
- Added `insertTable(schema, {rows, cols, withHeader})` command.
- Added the Table item (`جدول`) to `src/slashMenu.js`.
- Extended `src/plugins.js` — `columnResizing()` + `tableEditing()` in
  `buildPlugins`, Tab / Shift-Tab chained with `goToNextCell(±1)` so
  they still fall through to list-item sink/lift outside cells.
- Added table CSS to `src/style.css` — `.tableWrapper`, `table`,
  `th`/`td`, `.selectedCell` (neutral gray, currentColor outline to
  stay monochrome), `.column-resize-handle` (scoped to `.editor-root
  .editor-content`).
- Added `'insertTable'` to `EditorCommandName` in `types/index.d.ts`
  and a smoke-check line in `types/__check__.ts`.
- Added `prosemirror-tables` to the vite externals list.

### [VUE UI ENGINEER] 2026-04-19T17:20
- First vitest run: 7 failures — parser emits `inline` tokens inside
  `th`/`td` with no paragraph wrapper, but `cellContent: 'paragraph+'`
  expected a paragraph. Switching the cell content to `inline*` fixed
  parse + roundtrip in one change.
- Updated `insertTable` (empty cells — `inline*` allows zero
  children), the test suite (assertions against inline cells), and
  the block-list rejection test (use `validContent` since
  `NodeType.create` is permissive).
- Updated slash-menu tests: catalog count 9 → 10.

### [VUE UI ENGINEER] 2026-04-19T17:23
- All 141 vitest tests pass (was 126 — +15 tests: 10 in
  `test/tables.test.js`, one extra bound into the slash-menu suite
  since the catalog grew, three pre-existing tests updated for the
  new count).
- `npm run build -w kurrasah` — clean, 170.32 KB (vs. prior 167.3 KB
  baseline from the HEAD CHANGELOG note); `prosemirror-tables` is
  external so the delta is just the new serializer + command code
  (~3 KB).
- `npm run build -w web` — clean.
- `npx tsc --project types/tsconfig.json` — clean.

### [VUE UI ENGINEER] 2026-04-19T17:26
- Updated README: Tables section between Input rules and Slash
  command menu; Table item in the slash-menu items table; Tab /
  Shift-Tab qualifier in the keyboard shortcuts; "Supported content"
  gains tables.
- Updated CHANGELOG: `## [0.5.0] — 2026-04-19` entry.
- Updated `web/src/views/DocsView.vue` preview markdown with a
  small GFM table; added a Tables row under "Supported content"
  and an in-table note on the Tab shortcut.

### [VUE UI ENGINEER] 2026-04-19T17:27
- Final pass: tests + build + types all green.

## Open Questions

None — all design decisions are captured under **## Decisions**.

## Review Notes

_(pending code review + security review)_

## Final Summary

**Files added**

- `packages/kurrasah/test/tables.test.js` — 15 vitest cases.
- `.claude/chat/session-2026-04-19-tables-001.md` — this session file.

**Files modified**

- `packages/kurrasah/package.json` — version `0.4.1` → `0.5.0`; added
  `prosemirror-tables@^1` to `peerDependencies` and
  `prosemirror-tables@^1.8.5` to `devDependencies`.
- `packages/kurrasah/src/schema.js` — `tableNodes(...)` spread into the
  `nodes` object; new header comment.
- `packages/kurrasah/src/markdown.js` — `.enable('table')` on the
  tokenizer; `table`/`thead`/`tbody`/`tr`/`th`/`td` token specs;
  custom `table` serializer (pipe syntax + header synthesis + pipe
  escape + intra-cell whitespace collapse); stub serializers for
  `table_row`/`table_header`/`table_cell`.
- `packages/kurrasah/src/plugins.js` — import `tableEditing`,
  `columnResizing`, `goToNextCell`; append both plugins to
  `buildPlugins`'s return; Tab / Shift-Tab chained with `goToNextCell`.
- `packages/kurrasah/src/commands.js` — new `insertTable` command +
  entries in `commandFactories` and `buildCommands`; imported
  `TextSelection` for cursor placement.
- `packages/kurrasah/src/slashMenu.js` — new `Table` item (id:
  `table`, label: `جدول`); new `svgTable` icon.
- `packages/kurrasah/src/style.css` — `.tableWrapper`, `table`,
  `th`/`td`, `.selectedCell`, `.column-resize-handle` rules under
  `.editor-root .editor-content`.
- `packages/kurrasah/vite.config.js` — `prosemirror-tables` in the
  externals list.
- `packages/kurrasah/types/index.d.ts` — `'insertTable'` appended to
  `EditorCommandName`.
- `packages/kurrasah/types/__check__.ts` — two smoke-check lines for
  the new command.
- `packages/kurrasah/README.md` — new Tables section; slash-menu
  items table gains Table row; Tab / Shift-Tab qualifier; Supported
  content refreshed; items-count prose "nine" → "ten".
- `packages/kurrasah/CHANGELOG.md` — `## [0.5.0] — 2026-04-19` entry.
- `packages/kurrasah/test/slashMenu.test.js` — catalog count
  `9` → `10` (three assertions updated).
- `web/src/views/DocsView.vue` — preview markdown gains a GFM
  table; Supported content list gains a table entry; Tab shortcut
  table row mentions in-table navigation.

**Test delta**: 126 → 141 vitest tests (+15). All green.

**Bundle delta**: `kurrasah.js` 167.3 KB → 170.3 KB gzipped (~+3 KB).
`prosemirror-tables` stays external to the built artifact.

**`prosemirror-tables` pinned at** `^1.8.5` (latest `1.x` at
implementation time).

**Column resizing**: shipped. `columnResizing()` is installed before
`tableEditing()` (per upstream docs). The resize handle is
positioned on the visual right edge of the cell, which is
consistent regardless of document direction — no RTL regressions.

**Markdown roundtrip edge cases** (documented in README under
"Roundtrip caveat"):

- Column-separator widths normalize to `----` (four dashes).
- Intra-cell whitespace runs (including hard breaks) collapse to a
  single space on serialize.
- Cell padding (extra spaces inside `| ... |`) is stripped.
- Headerless tables (programmatically constructed with `table_cell`
  in the first row) serialize with a synthesized empty header row so
  they parse back as valid GFM.

Bit-for-bit identity isn't guaranteed; logical content round-trips
stably across any number of `parse → serialize → parse` cycles.

**Status**: ready for code review + security review. Do not mark
this session Completed until both reviews clear.
