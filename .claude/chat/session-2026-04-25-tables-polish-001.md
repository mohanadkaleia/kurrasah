# Tables polish — kurrasah v0.5.0 follow-up

## Header
- Session: session-2026-04-25-tables-polish-001
- Branch: master
- Status: In Progress
- Owner: ui-engineer

## Task
Land four polish items on the tables feature in `kurrasah` (v0.5.0 local, unpublished). Single follow-up commit, no version bump — amend the existing CHANGELOG entry.

1. Cursor on `insertTable` lands deterministically in the **first** cell of the **first** row (currently uses `TextSelection.near(from + 3)` which can drift).
2. Tab past the last cell creates a new row (verify `goToNextCell(1)` actually does this; chain a fallback if not).
3. Drop column resizing entirely (plugin import, plugin entry, `.column-resize-handle` CSS, README mentions).
4. Floating cell-actions toolbar — new `TableToolbar.vue` modeled on the existing slash menu / block controls plumbing. New `tableToolbarEnabled` prop on `<Editor>` (default `true`).

## Scope
- `packages/kurrasah/src/commands.js` — `insertTable` cursor placement.
- `packages/kurrasah/src/plugins.js` — drop `columnResizing`; verify Tab/new-row chain.
- `packages/kurrasah/src/style.css` — drop `.column-resize-handle` rules, add `.kurrasah-table-toolbar` block.
- `packages/kurrasah/src/Editor.vue` — mount the new toolbar; new `tableToolbarEnabled` prop.
- `packages/kurrasah/src/TableToolbar.vue` — NEW.
- `packages/kurrasah/test/tableToolbar.test.js` — NEW (7-8 cases).
- `packages/kurrasah/test/tables.test.js` — extend `insertTable` test to assert first-cell placement; add Tab-past-last-cell test.
- `packages/kurrasah/types/index.d.ts` — `tableToolbarEnabled` prop type.
- `packages/kurrasah/CHANGELOG.md` — amend 0.5.0 entry.
- `packages/kurrasah/README.md` — drop column-resizing prose, add cell-actions section, list new prop.
- `web/src/views/DocsView.vue` — props table + drop column-resizing mention.

## Implementation Plan

### FRONTEND PLAN

1. **`insertTable` cursor placement** (`commands.js`)
   - After `replaceSelectionWith(table)`, walk `tr.doc` from the post-insertion position and find the first node whose type is `table_cell` or `table_header`.
   - Place `TextSelection.create(doc, cellPos + 1)` (inside the cell's inline content), not `.near`.

2. **Tab past last cell creates a row** (`plugins.js`)
   - `goToNextCell(1)` returns `false` when there's no next cell. Need a fallback: in the Tab chain, after `goToNextCell(1)` fails, run `addRowAfter` followed by `goToNextCell(1)` so the cursor lands in the first cell of the new row.
   - Wrap the fallback in a small command that only fires when the selection is inside a table.

3. **Drop column resizing** (`plugins.js`, `style.css`)
   - Remove `columnResizing` import + `columnResizing()` from the plugin list.
   - Remove `.column-resize-handle` and `.editor-content.resize-cursor` CSS rules.
   - Schema's `colwidth` attribute stays (part of `tableNodes`).

4. **Floating `TableToolbar.vue`**
   - Mirror the `SlashMenu.vue` plumbing: `view`, `revision`, `dir` props; reactive `pluginState`-style snapshot watching the revision; Teleport-to-body popover.
   - Visibility: selection inside a `table_cell`/`table_header` (or a `CellSelection`) AND slash menu not active.
   - Position: anchor to the table's outside top edge using `view.coordsAtPos(tableStart)`. Flip below if no room above.
   - Buttons: addRowBefore, addRowAfter, addColumnBefore, addColumnAfter, deleteRow, deleteColumn, deleteTable. Group with separators.
   - Each button: aria-label in Arabic; click runs the command then `view.focus()`; disabled when the command's `(state, null)` dry-run returns `false`.
   - Mount via Editor.vue alongside slash menu and block controls; new `tableToolbarEnabled` prop (default `true`).

5. **Tests**
   - Extend `insertTable` test in `tables.test.js`: insert 3×3 → assert `$from.parent` is the FIRST header/cell of the FIRST row.
   - Add Tab-past-last-cell test: 1×2 table, cursor in last cell, Tab → 2 rows, cursor in first cell of new row.
   - New `tableToolbar.test.js`: 7-8 cases covering visibility, button actions, disabled states, and the `tableToolbarEnabled: false` opt-out.

6. **Docs**
   - README.md: drop column-resize subsection, add "إدارة الأسطر والأعمدة" subsection, add `tableToolbarEnabled` row in the props table.
   - CHANGELOG.md: amend 0.5.0 entry — drop resize bullet, add toolbar bullet, mention cursor-fix and tab-row-guarantee.
   - DocsView.vue: add `tableToolbarEnabled` row, drop column-resizing mention from supported content.

## Decisions
- Replace `TextSelection.near` with `TextSelection.create` at `cellPos + 1`. The brief calls for the FIRST header/cell — walk forward and pick the first match.
- Tab fallback: chain `goToNextCell(1)` → small "add row after + goToNextCell" wrapper → `sinkListItem`. The wrapper is gated by `isInTable(state)` so it doesn't fire from outside a table.
- Cell-action toolbar uses TEXT labels (Arabic) where directional ambiguity would hurt readability — specifically for "before/after" row/column operations. Trash glyphs for delete operations are unambiguous.
- Position the toolbar anchored at the *table's start-edge* (right under RTL, left under LTR), placed `8px` above the table's top. If `view.coordsAtPos(tableStart).top < 8 + toolbarHeightEstimate`, flip below.
- Toolbar uses `position: fixed` with physical `left`/`top` (same exception as slash menu / block controls), since `view.coordsAtPos` returns physical coords.
- Only the destructive `deleteTable` is grouped behind a separator on its own — matches the brief's "thin separator between row-ops, column-ops, and the destructive delete-table".

## Open Questions
None blocking — brief is detailed enough.

## Log

### [VUE UI ENGINEER] 2026-04-25T17:40
- Read the plan and session context.
- Confirmed all 141 existing tests pass before changes.
- Inspected `prosemirror-tables` source: `goToNextCell(1)` returns `false` when there's no next cell — it does NOT create a new row by itself. The 0.5.0 README wording is incorrect; the test in `tables.test.js` only checks Tab between existing cells, not Tab-past-last. We'll need the fallback chain.
- Starting implementation.

### [VUE UI ENGINEER] 2026-04-25T17:55
- All four polish items landed:
  1. **`insertTable` cursor placement.** Replaced `TextSelection.near(from + 3)` with a forward-walk over `tr.doc` for the first `table_cell`/`table_header`, then `TextSelection.create(doc, cellPos + 1)`. Deterministic — always lands in row 1, col 1.
  2. **Tab-past-last-cell.** Confirmed upstream `goToNextCell(1)` returns `false` rather than auto-growing the table — the previous CHANGELOG/README claim was untrue. Added a small `goToNextOrAddRow` wrapper that runs `goToNextCell(1)` first, falls back to `addRowAfter` + `goToNextCell(1)` against the post-dispatch view state when there's no next cell. Chained inside the Tab keymap before `sinkListItem`.
  3. **Column resizing dropped end-to-end.** Removed `columnResizing` import and plugin entry, removed `.column-resize-handle` and `.editor-content.resize-cursor` rules from style.css, dropped the README "Column resizing" subsection plus the docs-view "تغيير عرض الأعمدة" line. The `colwidth` schema attribute stays — it's part of `tableNodes(...)` and removing it would change the schema shape.
  4. **`TableToolbar.vue` shipped.** New component, modeled on `SlashMenu.vue`'s plumbing — Teleport-to-body, `view`/`revision`/`dir`/`enabled` props, watcher on `revision` that re-reads selection state. Visibility coupled to `isInsideCell(state)` AND `!slashMenuKey.active`. Position anchored to `view.coordsAtPos(tableStart)`, flips below the table when there's no room above. RTL transform: `translateX(-100%)` so the toolbar's right edge aligns with the table's right edge under RTL. Buttons use Arabic text labels — directional icons for "before/after" were judged genuinely ambiguous; text labels read clearly in 12px and stay monochrome. Each button: Arabic aria-label + title, click runs the command + `view.focus()`, disabled when `cmd(state, null)` returns false. Wired into Editor.vue alongside the existing slash menu and block controls; new `tableToolbarEnabled` prop (default `true`) opts out without forking. Type added to `types/index.d.ts` and exercised in `types/__check__.ts`.

- **Tests delta**: 141 → 152 (+11).
  - 2 new in `tables.test.js`: cursor lands in first header/cell of first row; Tab past last cell creates new row + lands in its first cell.
  - 9 new in `tableToolbar.test.js`: visibility on/off when cursor enters/leaves cells, hides while slash menu active, opt-out via `tableToolbarEnabled: false`, add-row-after / add-column-after / delete-row / delete-table functional checks, single-row delete handled (disabled-or-noop), refocus + cursor-stays-in-cell after action.

- **Bundle delta**:
  - `kurrasah.js`: 170.34 KB → 176.13 KB (+5.79 KB raw, gzipped 61.92 → 63.13 KB / +1.21 KB)
  - `kurrasah.css`: 6.76 KB → 7.83 KB (+1.07 KB raw, gzipped 1.73 → 1.80 KB / +0.07 KB)
  - The drop of `columnResizing` saves a few hundred bytes; the new TableToolbar.vue + its CSS adds the rest. Net wash on the gzipped JS bundle, +0.07 KB on gzipped CSS.

- **Verification (manual)**:
  - All 152 vitest tests green.
  - `npm run build -w kurrasah` — clean, no warnings.
  - `npm run build -w web` — clean, no warnings.
  - `npx tsc --project types/tsconfig.json` — clean.
  - Confirmed via test that `insertTable` lands cursor in `table.child(0).child(0)` (first header/cell of first row).
  - Confirmed via test that Tab from the last cell of a 1×2 table grows the table to 2 rows AND lands the cursor in the new row's first cell.
  - Confirmed grep that no `columnResizing` / `column-resize-handle` / `resize-cursor` strings remain in `packages/kurrasah` or `web`.

- **Decisions left ambiguous in the brief**:
  - **Icon style for directional row/column buttons**: chose Arabic text labels (`صفّ أعلاه`, `صفّ أسفل`, `عمود قبل`, `عمود بعد`, `حذف صفّ`, `حذف عمود`, `حذف الجدول`) over directional icons. The brief explicitly permits this fall-back: "If your icons end up too cluttered to differentiate 'before/after' visually, fall back to text labels in Arabic". The labels stay short, the buttons are min 24×24, and the discoverability gain over a generic-arrow-with-plus icon is significant.
  - **RTL "before/after" semantics**: kept logical, matching `prosemirror-tables`. Under `dir="rtl"`, "add column before" inserts a column to the right of the current cell (logical-before in reading order). Documented in the new README subsection.

- **`goToNextCell(1)` was already creating rows?** No — confirmed via reading `node_modules/prosemirror-tables/dist/index.js`: `goToNextCell` calls `findNextCell` which returns `null` when there's no next cell (last cell of last row), causing `goToNextCell` to return `false`. The previous CHANGELOG/README claim that "Tab past the final cell creates a new row" was aspirational. The fix is the new `goToNextOrAddRow` wrapper in `plugins.js`.

- Files modified:
  - `packages/kurrasah/src/commands.js`
  - `packages/kurrasah/src/plugins.js`
  - `packages/kurrasah/src/style.css`
  - `packages/kurrasah/src/schema.js` (stale comment about colwidth/resizing)
  - `packages/kurrasah/src/Editor.vue`
  - `packages/kurrasah/types/index.d.ts`
  - `packages/kurrasah/types/__check__.ts`
  - `packages/kurrasah/CHANGELOG.md`
  - `packages/kurrasah/README.md`
  - `packages/kurrasah/test/tables.test.js`
  - `web/src/views/DocsView.vue`

- Files created:
  - `packages/kurrasah/src/TableToolbar.vue`
  - `packages/kurrasah/test/tableToolbar.test.js`
  - `.claude/chat/session-2026-04-25-tables-polish-001.md`

- Status: implementation complete, awaiting review.
