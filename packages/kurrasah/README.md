# kurrasah

Reusable Vue 3 + ProseMirror markdown editor with RTL-first defaults.

Standalone package — no backend coupling, no fetch, no storage. Takes markdown in, emits markdown out.

## Install

```bash
npm install kurrasah
```

Inside this monorepo, `web/` consumes the package via npm workspaces rather than the published artifact.

## TypeScript

Hand-written type declarations ship in `types/index.d.ts`. Consumers that use TypeScript get full autocomplete and type-checking for props, events, callbacks, and exposed methods, without needing to configure anything.

## Usage

```js
import { Editor } from 'kurrasah'
import 'kurrasah/style.css'
```

```vue
<Editor v-model="markdown" dir="rtl" :images="true" :links="true" toolbar="minimal" />
```

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `modelValue` | `string` | `''` | v-model markdown source |
| `dir` | `'rtl' \| 'ltr'` | `'rtl'` | Writing direction |
| `images` | `boolean` | `true` | Enable image node (toggling rebuilds the view — see behavioral notes) |
| `links` | `boolean` | `true` | Enable link mark (toggling rebuilds the view — see behavioral notes) |
| `placeholder` | `string` | `''` | Shown when doc is empty. Updates in place — does not reset undo. |
| `readonly` | `boolean` | `false` | Disable editing |
| `toolbar` | `boolean \| 'minimal'` | `'minimal'` | Toolbar mode |
| `slashTrigger` | `string` | `'@'` | Trigger character for the slash (block-type) menu. See [Slash command menu](#slash-command-menu). |
| `slashEnabled` | `boolean` | `true` | Enable the slash menu. |
| `blockControlsEnabled` | `boolean` | `true` | Enable the hover-shown "+" button on empty paragraphs. See [Per-block hover controls](#per-block-hover-controls). |
| `onRequestLink` | `(context) => Promise<{href, title?} \| null> \| {href, title?} \| null` | `null` | Optional hook called when the link command needs a URL. Return `null` to cancel. See [Link / image UI hooks](#link--image-ui-hooks). |
| `onRequestImage` | `(context) => Promise<{src, alt?, title?} \| null> \| {src, alt?, title?} \| null` | `null` | Same, for images. |

### Events

- `update:modelValue` — markdown changed
- `change` — alias of above for non-v-model consumers
- `ready(editorView)` — emitted on initial mount **and** on every internal view rebuild (e.g. when `images` or `links` toggle). Consumers that only need the first-mount case can ignore subsequent emits; consumers that hold long-term references should re-capture on every emit.

### Exposed methods

- `focus()`
- `getMarkdown(): string`
- `setMarkdown(md: string): void` — replaces the document and resets undo history (see behavioral notes).
- `execCommand(name, ...args)` — dispatches a named command

## Supported content

Nodes: paragraph, heading (levels 1–3), bullet list, ordered list, list item, blockquote, code block, hard break, image, **table** (with rows, header cells, and body cells).
Marks: strong, em, link, inline code.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Mod-B | Toggle bold |
| Mod-I | Toggle italic |
| Mod-` | Toggle inline code |
| Mod-K | Non-empty selection: insert/remove link (prompts for URL). Empty selection: open the [slash command menu](#slash-command-menu). |
| Shift-Ctrl-1/2/3 | Heading level 1/2/3 |
| Ctrl-> | Blockquote |
| Shift-Ctrl-8 | Bullet list |
| Shift-Ctrl-9 | Ordered list |
| Tab / Shift-Tab | Sink / lift list item. **Inside a table**: move to the next / previous cell (creates a new row when tabbing past the last cell of the last row). |
| Mod-Enter | Exit code block |
| Mod-Z / Shift-Mod-Z | Undo / redo |

## Input rules

- `# `, `## `, `### ` → heading 1/2/3
- `- ` or `* ` → bullet list
- `1. ` → ordered list
- `> ` → blockquote
- ` ``` ` → code block
- `**x**` → bold
- `*x*` → italic
- `` `x` `` → inline code

## Tables

Tables use GitHub-flavored Markdown (GFM) pipe syntax and round-trip
between the editor and markdown without information loss for the
supported shapes.

```md
| الاسم | الوصف |
|-------|-------|
| أبجد  | حرف   |
| هوّز  | حرف   |
```

### Inserting a table

- Open the slash menu (`@` trigger or `Cmd/Ctrl+K`) and pick **جدول**
  — this inserts a 3×3 table with a header row and places the cursor
  in the first cell.
- Or dispatch programmatically:

  ```js
  editor.execCommand('insertTable', { rows: 3, cols: 3, withHeader: true })
  ```

### Keyboard

| Shortcut | Action |
|---|---|
| Tab | Move to the next cell. Tabbing past the final cell of the final row creates a new row. |
| Shift-Tab | Move to the previous cell. |

Tab / Shift-Tab fall through to the list-item sink / lift behaviour when
the cursor is not inside a cell — the existing list shortcuts continue
to work everywhere else.

### Cell contents (v1)

Cells hold **inline content only** — text with inline marks (bold,
italic, inline code, links). This matches GFM's own constraints:

- Paragraph breaks inside a cell collapse to a single space on
  serialize. GFM has no syntax for an in-cell newline, and trying to
  round-trip a multi-paragraph cell would lose information silently.
- Block-level content — lists, blockquotes, code blocks, nested tables
  — is **not** supported inside cells in v1. The schema rejects it, so
  the slash menu's block-type items are effectively no-ops while the
  cursor is inside a cell.

### Column resizing

Drag the right edge of a column to resize it. Widths are stored on each
cell's `colwidth` attr and survive markdown round-trip as stable column
widths on the rendered table (`<col>` elements inside a wrapping
`<colgroup>`).

### Header row

GFM requires a header row. If a consumer programmatically builds a
table whose first row is body cells, the serializer synthesizes an
empty header row so the output re-parses cleanly:

```md
|   |   |
|---|---|
| a | b |
| c | d |
```

### Roundtrip caveat

Tables survive a parse → serialize → parse cycle with stable structure
but not necessarily bit-for-bit identical markdown bytes:

- Column separator widths are normalized to `----`.
- Cell padding (extra spaces inside `| ... |`) is normalized.
- Intra-cell whitespace runs are collapsed to a single space.

The resulting markdown is a valid GFM table with the same logical
content.

## Slash command menu

A Notion-style block-type picker surfaces when the user types the trigger
character (default `@`) at a valid position, or presses `Cmd/Ctrl+K` with
an empty selection.

**Why `@` rather than `/`?** On the standard Arabic keyboard layout, `/`
maps to `ظ` — using it as the trigger would collide with natural typing.
`@` sits on the same key in both Arabic and Latin layouts (`Shift+2`) and
is not otherwise used in Arabic prose. Consumers who prefer a different
character can pass `slashTrigger`.

### Trigger rules

- Typing the trigger character activates the menu when:
  - The cursor is at the start of an empty block, or
  - The character immediately before the trigger is whitespace
    (so `user@example.com` does NOT open the menu).
- The menu is inactive inside code blocks (`@` is valid code content).
- As the user types after the trigger, the query updates live. Typing a
  space closes the menu.
- `Cmd/Ctrl+K` with an empty selection opens the menu at the current cursor
  position, without inserting any trigger character. With a non-empty
  selection, `Mod-K` still toggles the link mark (pre-existing behavior).

### Items

The menu ships ten block-type items in this order, each with English and
Arabic aliases so `@h1` and `@عنوان` both match:

| Item | Aliases |
|---|---|
| Paragraph | `paragraph`, `p`, `text`, `فقرة`, `نص` |
| Heading 1 | `heading 1`, `h1`, `عنوان 1`, `ترويسة 1` |
| Heading 2 | `heading 2`, `h2`, `عنوان 2`, `ترويسة 2` |
| Heading 3 | `heading 3`, `h3`, `عنوان 3`, `ترويسة 3` |
| Bullet list | `bullet`, `ul`, `unordered`, `قائمة`, `قائمة نقطية` |
| Ordered list | `ordered`, `ol`, `numbered`, `قائمة مرقمة` |
| Blockquote | `quote`, `blockquote`, `اقتباس` |
| Code block | `code`, `pre`, `كود`, `شيفرة` |
| Image | `image`, `img`, `picture`, `صورة` |
| Table | `table`, `جدول` |

Filter matches are case-insensitive substrings against the label + aliases.

### Dismissal

- `Escape` closes the menu and leaves any typed `@query` text in the doc.
- Clicking outside the popover closes the menu.
- `ArrowUp` / `ArrowDown` navigate items; `Enter` applies the selected item,
  which (on the `@`-trigger path) also removes the `@query` range before
  running the command.
- If the filtered result set is empty, the popover is hidden; it reappears
  as soon as the query changes to match.

## Per-block hover controls

When the user hovers an **empty paragraph**, a small "+" button appears
on its start-edge — the right side under `dir="rtl"`, the left side
under `dir="ltr"`. Clicking it inserts an empty paragraph immediately
below and opens the slash menu's command-palette mode so the user can
pick a block type (heading, list, quote, code, image, etc.).

Populated blocks (text, headings, lists, quotes, code) don't surface
the button — keeping the reading surface calm.

### A note on transit regions

When the cursor moves from the hovered paragraph into an "unsupported region" — the whitespace between blocks, editor padding, a non-paragraph block — the overlay keeps the last hover alive so it doesn't flicker during mouse transit. An 80ms grace timer hides it only if the cursor stays off both the editor and the overlay. This can occasionally leave the `+` visible slightly longer than expected; it's intentional, not a bug.

### Keyboard-only users

The overlay is hover-only. Keyboard users should use the slash menu —
type the trigger character (default `@`) at the start of a new line,
or press `Cmd/Ctrl+K` with an empty selection.

### Disabling

Pass `blockControlsEnabled="false"` on `<Editor>` to turn the overlay
off. The prop can be toggled live without rebuilding the view.

### Interaction with the slash menu

The overlay hides while the slash menu is open, so the two popovers
never compete visually. Clicking "+" transfers the focus to the slash
menu directly — no intermediate state where both are visible.

## Link / image UI hooks

By default, when the link or image command is dispatched without an explicit URL, the editor falls back to `window.prompt` with neutral English strings (`"Link URL"`, `"Image URL"`, `"Alt text (optional)"`). This keeps the bare `<Editor>` working everywhere without hard-coding any one language.

To provide localized UI (or a non-blocking dialog), supply `onRequestLink` and/or `onRequestImage`:

```vue
<Editor
  v-model="markdown"
  :on-request-link="askForLink"
  :on-request-image="askForImage"
/>
```

```js
import { isValidHttpUrl } from 'kurrasah'

async function askForLink({ href, text }) {
  // Return null to cancel.
  const answer = window.prompt('أدخل رابط URL', href || '')
  if (!answer) return null
  const trimmed = answer.trim()
  if (!isValidHttpUrl(trimmed)) return null
  return { href: trimmed }
}

async function askForImage() {
  const src = window.prompt('أدخل رابط الصورة')
  if (!isValidHttpUrl(src || '')) return null
  const alt = window.prompt('النص البديل للصورة') || ''
  return { src: src.trim(), alt }
}
```

Callbacks may return a value synchronously or as a Promise. Returning `null` (or resolving to `null`) cancels the command. Invalid `href` / `src` values (anything `isValidHttpUrl` rejects) are dropped silently.

`isValidHttpUrl` is exported from `kurrasah` for consumer-side reuse.

**`context.href` on mixed selections.** When the selection spans characters that carry the link mark plus characters that don't, `context.href` reflects only the mark at the start of the selection and ignores the rest. Consumers that need to detect mixed-state selections should inspect the full range themselves.

**Callback errors.** Rejections from `onRequestLink` / `onRequestImage` are caught so the editor doesn't crash. They are surfaced via `console.error` with a `[kurrasah]` prefix; check the console if your callback is silently not applying.

## Styling hooks

A subset of CSS custom properties can be overridden on `.editor-root` (or any ancestor):

| Variable | Default | Purpose |
|---|---|---|
| `--editor-min-height` | `12rem` | Minimum height of the editable surface |
| `--editor-border` | `#e5e5e5` | Border color (toolbar divider, blockquote rule) |
| `--editor-fg` | `#111` | Body text color |
| `--editor-muted` | `#888` | Placeholder / de-emphasized text |
| `--editor-bg` | `transparent` | Editor background |
| `--editor-focus` | `#000` | Focus outline |
| `--editor-code-bg` | `#f5f5f5` | Inline code and code block background |

## Behavioral notes

- **Setting `modelValue` externally or calling `setMarkdown(md)` replaces the document and resets undo history.** User edits through the UI preserve undo as expected.
- **Toggling `images` or `links` rebuilds the underlying `EditorView`.** This is needed because those props change the schema. The undo stack is reset and a new view is emitted via the `ready` event. Consumers should treat these as infrequent configuration changes, not per-interaction state.
- **Changing the `placeholder` prop does not rebuild the view** and does not affect the undo stack. The placeholder decoration updates in place.
- **`execCommand` returns `true` on the async link/image path as soon as the callback is dispatched, not when the edit lands.** For sync commands (`toggleBold` etc.) the boolean is "edit applied". For `toggleLink` / `insertImage` when a consumer callback is active, the boolean is "request accepted"; the edit is committed later when the callback resolves, or skipped silently if the consumer returns `null` / an invalid URL. If you need to await the edit, hold a reference to the editor view and observe the next transaction.
- **`focus()` is not called after an async link/image command.** The consumer modal owns focus until the callback resolves. Sync commands still auto-focus as before.
- **Link clicks.** A plain click on a link follows it in a new tab (edit or readonly). **Cmd/Ctrl+click** places the cursor inside the link — use that when you need to edit the link text itself. Matches Medium / Substack.

## Bundling

`markdown-it` is bundled into the package output (~30 KB gzipped) rather than externalized. This keeps consumer install friction low at the cost of a slightly larger `kurrasah` bundle. If you need to dedupe with your own `markdown-it` instance, open an issue — we'll revisit if it becomes common.

The ProseMirror packages (`prosemirror-*`) and Vue are declared as peer dependencies and expected to be provided by the consumer; they are excluded from the output.

## Status

v0.1.0 — first non-zero release. Backend-agnostic, Vue 3 only, ready for consumer integration.
