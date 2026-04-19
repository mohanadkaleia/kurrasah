# editor

A reusable Vue 3 + ProseMirror markdown editor with RTL-first defaults, plus a minimal demo app that showcases it.

The editor package (`@editor/core`) is the deliverable — backend-agnostic, markdown in and markdown out, zero coupling to any storage layer. The demo app exists to exercise the package end-to-end; it will eventually be replaced by Kurras (a separate Arabic publishing platform) as the real consumer.

## Highlights

- **Headless ProseMirror** — not Tiptap. Direct schema + commands, full control.
- **RTL-first** — `dir="rtl"` by default, logical CSS properties throughout, forced-LTR code blocks.
- **Markdown is the truth** — documents are stored as markdown strings. No custom AST, no operation log. Uses `prosemirror-markdown` for parse/serialize.
- **Small surface** — 7 props, 3 events, 4 exposed methods.
- **v1 content**: paragraph, heading 1–3, bullet/ordered lists, blockquote, code block, hard break, image, plus bold / italic / link / inline code marks.

## Repository layout

```
/
├── packages/editor/      # @editor/core — the reusable package
├── web/                  # Vue 3 demo consumer (single-document surface)
├── app/                  # Flask REST backend (demo storage)
└── db/                   # SQLite + migrations
```

Monorepo via npm workspaces.

## Quick start

Prereqs: Node 18+, Python 3.13+, macOS or Linux.

```bash
# clone + install
git clone https://github.com/mohanadkaleia/editor.git
cd editor
npm install
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# run (two terminals)
npm run dev:api      # Flask on :5000
npm run dev:web      # Vite on :5173
```

Open `http://localhost:5173`. Package docs live at `/docs`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev:web` | Start the demo Vite dev server |
| `npm run dev:api` | Start the Flask backend |
| `npm run build:editor` | Build `@editor/core` in Vite lib mode |
| `npm run test:editor` | Run the package's vitest suite |
| `python -m pytest app/tests/ -v` | Backend tests |

## Using the package in your own app

See `packages/editor/README.md` for the full API reference, or run the demo and visit `/docs`.

Minimal usage:

```vue
<script setup>
import { ref } from 'vue'
import { Editor } from '@editor/core'
import '@editor/core/style.css'

const markdown = ref('# مرحبا')
</script>

<template>
  <Editor v-model="markdown" dir="rtl" />
</template>
```

The package is currently workspace-private. When it stabilizes around a second real consumer (Kurras), it will be published to npm.

## Status

- Package: v0.1.0, 91 vitest tests passing.
- Backend: 8 REST endpoints, 63 pytest tests passing, bandit clean.
- Demo app: single-document editor surface with versions, import/export, floating toolbar.

## Architecture notes

- The package is **backend-agnostic**. It does not fetch, persist, or authenticate. All of that belongs in the consumer. Storage in the demo is Flask + SQLite; for Kurras it will be something else.
- The consumer is responsible for **debouncing** writes. The package emits `update:modelValue` on every transaction — do not connect that directly to a PATCH request.
- Styling is **scoped to `.editor-root`** in the package. Consumers can override prose styles via a wrapper class (the demo uses `.editor-canvas`).

## License

TBD.
