# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repo hosts **`@editor/core`**, a reusable Vue 3 + ProseMirror markdown editor with RTL-first defaults, and a thin demo app (`app/` + `web/`) that exercises the package end-to-end. The editor is the primary deliverable; the app is a reference consumer and will eventually be replaced by Kurras (a separate publishing platform for Arabic writers) as the real consumer. The editor itself is backend-agnostic — markdown in, markdown out.

## Architecture

npm-workspaces monorepo with four parts:

- **`packages/editor/`** — `@editor/core`, the reusable Vue 3 + ProseMirror package. **Primary product.** Backend-agnostic; zero fetch, zero storage, zero auth.
  - `src/Editor.vue` — the public component
  - `src/Toolbar.vue` — optional minimal toolbar
  - `src/schema.js` — ProseMirror schema (paragraph, heading 1–3, lists, blockquote, code_block, hard_break, image; marks: strong, em, link, code)
  - `src/markdown.js` — `parseMarkdown` / `serializeMarkdown` via `prosemirror-markdown`
  - `src/plugins.js` — history, keymap, input rules, placeholder
  - `src/commands.js` — named command factories (`toggleBold`, `setHeading`, `toggleLink`, ...)
  - `src/style.css` — prose CSS, logical properties, RTL-safe, scoped under `.editor-root`
  - `test/` — Vitest unit tests (schema, markdown roundtrip, editor, plugins)
  - Built with Vite in lib mode; externalizes `vue` and all `prosemirror-*` so consumers dedup.
- **`app/`** — Python/Flask backend with a minimal REST API at `/api` (SQLite-backed).
  - `app/api/` — Flask blueprint with eight endpoints for document + version CRUD
  - `app/models/document_repo.py` — parameterized SQL through `db.DatabaseManager`
  - `app/libs/` — supporting modules
- **`web/`** — Vue 3 + Vite + Tailwind frontend. **Consumer of `@editor/core`.**
  - `web/src/views/` — HomeView, EditorPage (hosts `<Editor>`)
  - `web/src/api/documents.js` — REST client (`fetch` wrapper)
  - `web/src/composables/useDocuments.js` — reactive state + debounced update helper
  - `web/src/components/` — UI (layout, dialogs) and editor (VersionDialog)
- **`db/`** — SQLite with a custom migration system
  - `db/db.py` — `DatabaseManager`
  - `db/migrations/` — numbered migration files

## Development Commands

From the repo root:

```bash
npm install                              # Hoists workspace deps (web + packages/editor)

npm run dev:api                          # Start Flask backend (localhost:5000)
npm run dev:web                          # Start Vite dev server (localhost:5173, proxies /api)

npm run test:editor                      # Vitest for @editor/core
npm run build:editor                     # Vite lib build for @editor/core (outputs to packages/editor/dist/)

python -m pytest app/tests/ -v           # Backend tests
bandit -r app/                           # Security scan
```

## Key Conventions

- **Editor code lives in `packages/editor/` and must stay backend-agnostic.** No fetch, no localStorage, no auth hooks, no routing. The package takes markdown in and emits markdown out. Anything beyond that belongs in the consumer (`web/` today, Kurras tomorrow).
- **RTL-first**: default `dir="rtl"` everywhere. In the package, use **logical CSS properties only** (`padding-inline-start`, `margin-inline-end`, `border-inline-start`). Never `padding-left`/`margin-right`/etc. The only deliberate exception is the forced-LTR `<pre>` rule for code blocks. Test RTL immediately, not as an afterthought.
- **Black & white aesthetic**: no colors except for semantic feedback (errors/success) and minor neutral grays for code backgrounds and deemphasized text. No brand palette.
- **Vue 3 Composition API**: `<script setup>` exclusively. Reuse existing composables before creating new ones.
- **REST, not GraphQL**: eight flat endpoints under `/api`. Strict `Content-Type: application/json` on writes. Error shape `{error, code}` with codes `NOT_FOUND`, `INVALID_INPUT`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`. Size limits: `title` ≤ 500, `label` ≤ 200, `content_md` ≤ 1 MB.
- **Parameterized SQL only** via `db/db.py` `DatabaseManager`. No string interpolation into queries.
- **Debouncing is the consumer's job**: the editor emits on every transaction. `web/` debounces PATCH calls (`useDocuments.debouncedUpdate`, 500 ms).
- **Package API stability**: `@editor/core` props/events/methods are a consumer contract (`web/` today, Kurras later). Treat changes as potentially breaking; prefer adding props over changing existing behavior.

## Agent Workflow

This project uses specialized agents coordinated through session files in `.claude/chat/`:

- **tech-lead**: Plans features, creates session files, coordinates agents. Only agent that talks to the user.
- **python-engineer**: Implements backend code in `app/` and `db/`.
- **ui-engineer**: Implements frontend code in `web/` and the editor package in `packages/editor/`.
- **code-reviewer**: Reviews code for correctness, design, style, tests, and RTL compliance.
- **security-reviewer**: Reviews for security vulnerabilities. Not required for the current no-auth surface (localhost trust boundary only). **Becomes mandatory when authentication lands.**

### Session files

Each task gets a session file: `.claude/chat/session-YYYY-MM-DD-<task-slug>-NNN.md`

Sections: Header, Implementation Plan (BACKEND/FRONTEND/DATA/TEST), Decisions, Open Questions, Log, Review Notes, Final Summary.

Workflow: explore → plan → implement → test → review. A session is only marked Completed after all MUST-FIX and HIGH/MEDIUM items from code review (and security review, when applicable) are resolved.
