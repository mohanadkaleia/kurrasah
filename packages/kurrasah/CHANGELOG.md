# Changelog

All notable changes to `kurrasah` will be documented here.

Each release lists changes under some of these subsections:
- **Breaking** — consumer must adapt.
- **Added** — new public API.
- **Changed** — non-breaking behavior changes.
- **Fixed** — bug fixes.
- **Notes** — behaviors worth surfacing but not strictly actionable.

## [0.6.0] — 2026-04-25

### Added
- **`onUploadImage` callback prop.** Drag-and-drop and clipboard-paste of
  image files now route through a new consumer callback so the
  application can run its actual upload pipeline. The callback receives
  `(file, {source})` where `source` is `'drop'` or `'paste'`, and
  resolves to `{src, alt?, title?}` (or `null` to cancel). When the prop
  is omitted, the editor does not interfere with the browser's native
  drop / paste behavior — opt-in only.
  - Multi-file drops fan out: each file invokes the callback in source
    order, and each successful result inserts an `image` node at the
    running insertion point so the order is preserved.
  - Drop position is computed via `view.posAtCoords({left, top})`, with
    a fallback to the current selection's `from` when coords don't
    resolve. No direction-specific math — works the same in RTL and LTR.
  - The fallback `window.prompt`-URL path on the slash menu / toolbar
    (`onRequestImage`) is **unchanged**. Both paths coexist.

### Notes
- Errors thrown from `onUploadImage` (or rejected Promises) are caught
  and surfaced via `console.error` with a `[kurrasah]` prefix. The
  editor stays alive; the file simply isn't inserted.
- The package never base64-embeds files itself — that is the consumer's
  call. The demo in `web/` uses `FileReader.readAsDataURL` for a
  storage-free localStorage-backed flow; production consumers should
  upload to their own backend and return the resulting URL.
- Drop / paste are ignored when the editor is `readonly` — parity with
  typing input.
- The handlers are wired on `view.dom` directly (not via PM's
  `handleDrop` / `handlePaste`) because the consumer callback may be
  async; PM's plugin hooks expect a synchronous boolean.

## [0.5.0] — 2026-04-25

### Fixed
- The block-controls `+` button now sits centered on the hovered line
  instead of floating a few pixels below it. The positioning math
  switched from "top of the line + 2px" to "vertical midpoint of the
  line", with `transform: translateY(-50%)` on the overlay so the
  alignment is independent of overlay height or line-height.
- `insertTable` now lands the cursor in the first cell of the first
  row deterministically. Previous releases used
  `TextSelection.near(from + 3)`, which resolves against "the closest
  natural text position" and could drift to a middle-column cell on
  some doc shapes. The replacement walks `tr.doc` forward from the
  insertion point and seats the cursor at `firstCell + 1` via
  `TextSelection.create`.
- `Tab` past the final cell of the final row now reliably creates a
  new row. Upstream `goToNextCell(1)` returns `false` rather than
  growing the table — the keymap chain now adds `addRowAfter` as a
  fallback before falling through to the list-item handler.
- Trailing-paragraph guard — a new plugin keeps the doc's top-level
  shape navigable: empty paragraphs are appended after a trapping
  block (table, code block, blockquote, list) at the end of the doc,
  AND inserted between two adjacent trapping blocks. Solves "I
  inserted a table and can't escape it" + "two tables are visually
  glued together" in one rule. The plugin runs on every transaction
  via `appendTransaction`, AND once on initial view creation so the
  invariant survives a markdown reload (markdown collapses empty
  paragraphs between blocks, so a parsed doc may have adjacent
  trapping blocks). Empty paragraphs render with `min-height: 1em`
  so the cursor target is visible.

### Added
- **GFM tables** — a new block-level content type. Four schema nodes
  (`table`, `table_row`, `table_header`, `table_cell`), GitHub-flavored
  pipe-syntax markdown round-trip, and cell-aware editing plugins.
  Notable bits:
  - Cells hold **inline content only** — text + marks. Matches GFM's
    own constraints (no in-cell line breaks, lists, or nested tables).
  - `Tab` / `Shift-Tab` move between cells while the cursor is inside
    a table; outside a table they still sink / lift list items.
    `Tab` past the final cell of the final row creates a new row and
    seats the cursor in its first cell.
  - `CellSelection` decoration renders the selection as a neutral gray
    overlay with a `currentColor` outline — stays inside the package's
    monochrome aesthetic (upstream prosemirror-tables uses blue).
- **Cell-actions toolbar** — a small floating toolbar that appears
  above the table while the cursor is inside one of its cells. Buttons:
  add row above / below, add column before / after, delete row,
  delete column, delete table. Each action dispatches the
  corresponding `prosemirror-tables` command and refocuses the editor;
  buttons disable themselves when their command would no-op (e.g.
  delete-row with one row left). Hides while the slash menu is open
  so the two popovers don't compete. New `<Editor>` prop
  `tableToolbarEnabled: boolean` (default `true`) opts out without
  forking. Aria-labels and tooltips are in Arabic.
- New named command `insertTable(options)` — dispatch via
  `editor.execCommand('insertTable', { rows, cols, withHeader })`.
  Defaults to a 3×3 table with a header row. Rows and columns are
  clamped to the range `[1, 20]` to cap accidental huge inserts.
- Slash-menu item **جدول** (aliases: `table`, `جدول`) inserts the
  default 3×3 table.
- New peer dependency: `prosemirror-tables` (`^1`). Pinned at `1.8.5`
  in the package's own devDependencies for vitest + build.

### Notes
- **Roundtrip caveats**. Tables survive `parse → serialize → parse`
  with stable structure, but the output markdown is normalized:
  column-separator widths collapse to `----`, cell padding is
  stripped, and intra-cell whitespace runs (including paragraph
  breaks, which can exist on the ProseMirror side even though GFM has
  no syntax for them) collapse to a single space. The resulting
  markdown re-parses to the same logical content.
- **Headerless tables** — if a consumer programmatically builds a
  table whose first row is `table_cell`s (legal in ProseMirror,
  invalid in GFM), the serializer synthesizes an empty header row so
  the output re-parses as a valid GFM table.
- Tables are always-on in v0.5 (no opt-out for the schema node or the
  table-editing plugin). Consumers who don't want users to insert
  tables can ignore the slash-menu item; the cell-actions toolbar can
  be turned off via `tableToolbarEnabled="false"`.
- **No column resizing.** The schema's `colwidth` attribute is part
  of `tableNodes(...)` and stays for compatibility, but the resize
  drag handle is not shipped in v0.5. A future release may add it
  back if the affordance proves valuable in user testing.

## [0.4.1] — 2026-04-19

### Fixed
- Double-Enter inside a code block now exits the block into a new
  paragraph. Previously plain Enter always inserted another `\n` and
  the user could get stuck inside a code block at the end of the doc
  with no way to add a following line. `Mod-Enter` still works as the
  explicit exit shortcut; this is the natural-typing path.

## [0.4.0] — 2026-04-19

### Added
- **Per-block "+" affordance** — hovering an **empty paragraph**
  surfaces a small "+" button on the block's start-edge (right in RTL,
  left in LTR). Clicking it inserts an empty paragraph below the
  hovered one and opens the slash menu in command-palette mode so the
  user can pick a block type. The button is mouse-hover only;
  keyboard users should use the slash menu (`@` trigger or
  `Cmd/Ctrl+K`).
- New prop `blockControlsEnabled: boolean` (default `true`) — turn the
  overlay off.

### Notes
- The overlay only renders on empty paragraphs — populated blocks
  (text, headings, lists, quotes, code) show nothing, keeping the
  reading surface calm.
- The overlay hides automatically while the slash menu is open so the
  two popovers never compete visually.
- Hover detection uses a single global `mousemove` listener on
  `document`, throttled via `requestAnimationFrame`. A short grace
  period (80 ms) lets the cursor transit the small gap between the
  block and the button without the overlay vanishing mid-move.
- An earlier draft of this release included a drag handle for
  reordering blocks. It was dropped before release: the interaction
  was not obvious to users and reordering whole blocks isn't a common
  gesture for the target audience. If reordering becomes a real need,
  it'll return as a separate feature with a clearer affordance.

## [0.3.1] — 2026-04-19

### Fixed
- Slash menu popover now positions correctly under `dir="rtl"`. The
  previous release used `inset-inline-start: <viewport-left>px`, which
  in RTL measures from the right edge of the viewport — the menu
  landed far off to the side instead of next to the cursor. Switched
  to physical `left` / `top`.
- Arrow-key navigation now scrolls the selected item into view when it
  would otherwise fall outside the popover's scroll window.
- Heading (H1/H2/H3) and ordered-list icons no longer render as
  garbled glyphs. SVG `<text>` elements inherit bidi from their
  ancestor, so "H1" inside an RTL document rendered with mirrored
  digits or font fallback. The heading icon is now a plain HTML span
  with `dir="ltr"`, and the ordered-list icon uses SVG paths only.

### Added
- **Slash command menu** — a Notion-style block-type picker that opens
  when the user types the trigger character (default `@`) at a valid
  position, or presses `Cmd/Ctrl+K` with an empty selection. Nine items:
  Paragraph, Heading 1–3, Bullet list, Ordered list, Blockquote, Code
  block, Image. Filter-as-you-type with English **and** Arabic aliases
  (`@h1` and `@عنوان` both match). Keyboard-first navigation (ArrowUp /
  ArrowDown / Enter / Escape) plus click-outside dismissal.
- New prop `slashTrigger: string` (default `'@'`) — override the trigger
  character. Changing this prop rebuilds the view.
- New prop `slashEnabled: boolean` (default `true`) — turn the menu off.
  When disabled, `Mod-K` falls through to `toggleLink` for all selection
  states. Changing this prop rebuilds the view.

### Changed
- `Mod-K` behavior is now selection-sensitive: with a non-empty selection
  it still toggles the link mark (pre-existing behavior); with an empty
  selection, it opens the slash menu's command-palette path. Consumers
  who relied on `Mod-K` triggering the link prompt on an empty selection
  will find it no longer does — there was nothing to wrap anyway, so the
  previous behavior was effectively a no-op prompt.

### Notes
- `@` was chosen over `/` because `/` maps to `ظ` on the standard Arabic
  keyboard layout and would collide with natural typing.
- The slash menu is mounted via `<Teleport to="body">`, so its popover
  escapes `overflow: hidden` ancestors. Consumers styling the popover
  must target `.kurrasah-slash-menu` globally (outside `.editor-root`).
- The plugin, item catalog, and plugin key are intentionally **not**
  re-exported from the package index in v0.3 — they're internal so we can
  evolve them without a breaking change. If you need to customize the
  item list, open an issue.

## [0.2.2] — 2026-04-19

### Changed
- Link-click behavior inverted (follow-up to v0.2.1): a **plain click**
  on a link now navigates in a new tab whether the editor is readonly
  or editable. **Cmd/Ctrl+click** falls through to ProseMirror so the
  cursor lands inside the link when the user needs to edit its text.
  v0.2.1's Notion/Google-Docs pattern felt hidden; Medium/Substack's
  click-to-navigate is closer to what users expect.
- `cursor: pointer` on editor anchors so the clickability is visible.

## [0.2.1] — 2026-04-19

### Fixed
- Clicking a link inside the editor now navigates. In **readonly** mode,
  a plain click follows the link in a new tab. In **edit** mode, a
  plain click still places the cursor (so the user can edit the link
  text), and **Cmd/Ctrl+click** follows the link — the pattern used
  by Notion and Google Docs. Previously, clicks inside links in edit
  mode appeared to do nothing.

## [0.2.0] — 2026-04-19

### Breaking
- **Package renamed from `@editor/core` to `kurrasah`.** Consumers must
  update imports: `from '@editor/core'` → `from 'kurrasah'`;
  `'@editor/core/style.css'` → `'kurrasah/style.css'`;
  dependency entry `"@editor/core"` → `"kurrasah"`.
- Build output filenames changed: `dist/editor.js` → `dist/kurrasah.js`,
  `dist/editor.css` → `dist/kurrasah.css`. The change propagates via
  the `exports` map; consumers importing via the public entry are not
  affected.

### Added
- `./package.json` is now exposed in the `exports` map so consumers can
  `import pkg from 'kurrasah/package.json'` to read the current version
  at build time. The demo app uses this to render its version pill.

## [0.1.2] — 2026-04-18

### Fixed
- `<Editor>` emits (`update:modelValue`, `change`, `ready`) are now
  typed for `<script setup lang="ts">` consumers. Previously the types
  compiled but `@change="(md) => ..."` gave `md` an implicit `any` and
  `$emit('change', 123)` was not rejected. The `DefineComponent` generic
  positioning was wrong — emits live at slot 8, not slot 3. Now explicit.

### Changed
- `ImageRequestContext` changed from `{}` to `Readonly<Record<string, never>>`
  so consumers cannot accidentally pass non-object values. The type is
  still empty; this is a tightening, not a field addition.

### Notes
- `EditorEmits` is now an `EmitsOptions`-shaped type (event name → handler
  signature). Consumers that imported the old tuple-syntax `EditorEmits`
  interface to construct payloads directly should use
  `Parameters<EditorEmits['change']>` instead.

## [0.1.1] — 2026-04-18

### Added
- TypeScript type declarations via a hand-written `types/index.d.ts`.
  Consumers get autocomplete and type-checking for props, events,
  callback signatures, and exposed methods.

### Fixed
- `execCommand` no longer auto-focuses the editor after the async
  link / image path. When a consumer `onRequestLink` / `onRequestImage`
  callback is active, the consumer modal keeps focus until it resolves.
- Callback rejections from `onRequestLink` / `onRequestImage` are now
  surfaced via `console.error` (previously swallowed silently).

### Notes
- `execCommand` returns `true` on the async link / image path as soon
  as the callback is dispatched — not when the edit lands. Documented
  in the README under "Behavioral notes".
- `context.href` in `onRequestLink` reflects the link mark at the
  start of the selection only; mixed-state selections are the
  consumer's problem to detect.

## [0.1.0] — 2026-04-18

### Added
- `onRequestLink` and `onRequestImage` callback props for consumer-side
  link/image UIs. Falls back to English `window.prompt` if not provided.
- `--editor-min-height` CSS variable for consumer-side height control.
- `loading="lazy"` on image nodes.

### Changed
- `markdown-it` is now a declared runtime dependency (previously
  undeclared, relied on transitive resolution).
- `ready` event re-emits after internal view rebuilds (e.g., when
  `images` or `links` props change), so consumers always have a live
  `EditorView` reference.
- Changing the `placeholder` prop no longer rebuilds the editor view
  or wipes the undo stack.

### Fixed
- Dropped dead imports in `plugins.js`.
- Removed redundant dispatcher special-case in `execCommand`.

### Notes
- External `modelValue` changes / `setMarkdown()` calls replace the
  document and reset undo history. User edits through the UI preserve
  undo as expected.

## [0.0.0]
- Initial pre-release.
