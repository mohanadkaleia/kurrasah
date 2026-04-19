# kurrasah

Reusable Vue 3 + ProseMirror markdown editor with RTL-first defaults.

Standalone package — no backend coupling, no fetch, no storage. Takes markdown in, emits markdown out.

## Install

Within this monorepo, consumed via npm workspaces as `kurrasah`. Outside this repo, not yet published.

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

## Supported v1 content

Nodes: paragraph, heading (levels 1–3), bullet list, ordered list, list item, blockquote, code block, hard break, image.
Marks: strong, em, link, inline code.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Mod-B | Toggle bold |
| Mod-I | Toggle italic |
| Mod-` | Toggle inline code |
| Mod-K | Insert/remove link (prompts for URL) |
| Shift-Ctrl-1/2/3 | Heading level 1/2/3 |
| Ctrl-> | Blockquote |
| Shift-Ctrl-8 | Bullet list |
| Shift-Ctrl-9 | Ordered list |
| Tab / Shift-Tab | Sink / lift list item |
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
- **Link clicks.** In **readonly** mode, a plain click on a link follows it in a new tab. In **edit** mode, a plain click places the cursor inside the link (so the anchor text stays editable); **Cmd/Ctrl+click** follows the link. This matches Notion / Google Docs.

## Bundling

`markdown-it` is bundled into the package output (~30 KB gzipped) rather than externalized. This keeps consumer install friction low at the cost of a slightly larger `kurrasah` bundle. If you need to dedupe with your own `markdown-it` instance, open an issue — we'll revisit if it becomes common.

The ProseMirror packages (`prosemirror-*`) and Vue are declared as peer dependencies and expected to be provided by the consumer; they are excluded from the output.

## Status

v0.1.0 — first non-zero release. Backend-agnostic, Vue 3 only, ready for consumer integration.
