# kurrasah

A reusable Vue 3 + ProseMirror markdown editor with RTL-first defaults.

The package (`kurrasah`) is the deliverable — backend-agnostic, markdown in and markdown out, zero coupling to any storage layer. This repo also ships a small front-end-only demo that exercises the package end-to-end; it persists a single document in `localStorage`, which is just a stand-in for whatever storage a real consumer brings.

## Highlights

- **Headless ProseMirror** — not Tiptap. Direct schema + commands, full control.
- **RTL-first** — `dir="rtl"` by default, logical CSS properties throughout, forced-LTR code blocks.
- **Markdown is the truth** — documents are stored as markdown strings. No custom AST, no operation log. Uses `prosemirror-markdown` for parse/serialize.
- **Small surface** — 9 props, 3 events, 4 exposed methods. Hand-written `.d.ts` ships with the package.
- **v1 content**: paragraph, heading 1–3, bullet/ordered lists, blockquote, code block, hard break, image, plus bold / italic / link / inline code marks.

## Repository layout

```
/
├── packages/kurrasah/   # the reusable package (primary product)
└── web/                 # Vue 3 demo consumer (single document, localStorage)
```

Monorepo via npm workspaces.

## Quick start

Prereqs: Node 18+.

```bash
git clone https://github.com/mohanadkaleia/kurrasah.git
cd kurrasah
npm install
npm run dev:web
```

Open `http://localhost:5173`. Package usage docs live at `/docs`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev:web` | Start the demo Vite dev server |
| `npm run build:editor` | Build `kurrasah` in Vite lib mode |
| `npm run test:editor` | Run the package's vitest suite |

## Using the package

See `packages/kurrasah/README.md` for the full API reference — props, events, exposed methods, callback hooks, keyboard shortcuts, input rules, styling hooks. Or run the demo and open `/docs`.

Minimal usage:

```vue
<script setup>
import { ref } from 'vue'
import { Editor } from 'kurrasah'
import 'kurrasah/style.css'

const markdown = ref('# مرحبا')
</script>

<template>
  <Editor v-model="markdown" dir="rtl" />
</template>
```

The package is workspace-private while the API surface stabilizes. It will go to npm once a second real consumer has validated it.

## Status

- Package: **v0.2.0**, 91 vitest tests passing, TypeScript declarations shipped.
- Demo app: single-document editor persisted to `localStorage`, with import/export and a floating selection toolbar.

## Architecture notes

- The package is **backend-agnostic**. It does not fetch, persist, or authenticate. All of that belongs in the consumer. The demo persists to `localStorage`; real consumers will use their own storage (a REST/GraphQL API, IndexedDB, a CRDT, whatever fits).
- The consumer is responsible for **debouncing** writes. The package emits `update:modelValue` on every transaction — do not wire that directly to a persistence call. The demo debounces its `localStorage` writes at 500 ms.
- Styling is **scoped to `.editor-root`** inside the package. Consumers can override prose styles via a wrapper class (the demo uses `.editor-canvas`).

## License

TBD.
