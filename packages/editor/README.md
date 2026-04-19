# @editor/core

Reusable Vue 3 + ProseMirror markdown editor with RTL-first defaults.

Standalone package — no backend coupling, no fetch, no storage. Takes markdown in, emits markdown out.

## Install

Within this monorepo, consumed via npm workspaces as `@editor/core`. Outside this repo, not yet published.

## Usage

```js
import { Editor } from '@editor/core'
import '@editor/core/style.css'
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
import { isValidHttpUrl } from '@editor/core'

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

`isValidHttpUrl` is exported from `@editor/core` for consumer-side reuse.

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

## Bundling

`markdown-it` is bundled into the package output (~30 KB gzipped) rather than externalized. This keeps consumer install friction low at the cost of a slightly larger `@editor/core` bundle. If you need to dedupe with your own `markdown-it` instance, open an issue — we'll revisit if it becomes common.

The ProseMirror packages (`prosemirror-*`) and Vue are declared as peer dependencies and expected to be provided by the consumer; they are excluded from the output.

## Status

v0.1.0 — first non-zero release. Backend-agnostic, Vue 3 only, ready for consumer integration.
