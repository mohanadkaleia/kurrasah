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
| `images` | `boolean` | `true` | Enable image node |
| `links` | `boolean` | `true` | Enable link mark |
| `placeholder` | `string` | `''` | Shown when doc is empty |
| `readonly` | `boolean` | `false` | Disable editing |
| `toolbar` | `boolean \| 'minimal'` | `'minimal'` | Toolbar mode |

### Events

- `update:modelValue` — markdown changed
- `change` — alias of above for non-v-model consumers
- `ready(editorView)` — emitted once on mount

### Exposed methods

- `focus()`
- `getMarkdown(): string`
- `setMarkdown(md: string): void`
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

## Status

Phase 2 — ProseMirror integration complete. Package is backend-agnostic and ready for consumer integration.
