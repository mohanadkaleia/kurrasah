# session-2026-04-18-editor-core-types-001

## Task
Add hand-written TypeScript type declarations for `@editor/core` (the reusable
Vue 3 + ProseMirror markdown editor at `packages/editor/`). Package stays pure
JavaScript; we are only shipping a consumer-facing `types/index.d.ts` so that
TypeScript consumers of `@editor/core` get autocomplete and type-checking for
props, events, callback signatures, and exposed methods.

## Scope
- `packages/editor/types/index.d.ts` — new hand-written declarations.
- `packages/editor/types/__check__.ts` — TS verification harness (not built,
  not published).
- `packages/editor/package.json` — wire `types` field and `exports` types
  entry; extend `files` to include `types`.
- `packages/editor/README.md` — short "TypeScript" section near the top.
- `packages/editor/CHANGELOG.md` — append an `Added` subsection to the
  existing `0.1.1` block.
- Do NOT touch source JS / Vue files. Do NOT touch `app/`, `db/`, or `web/`.
- Do NOT export plugin internals (`buildKeymap`, `buildInputRules`,
  `placeholderPlugin`).

## Decisions
- Source of truth for exported symbols is `src/index.js`. The task brief
  mentioned `placeholderKey` in the export list, but the current
  `src/index.js` does NOT export it, and the task constraints forbid
  touching JS / exposing plugin internals. I am therefore omitting
  `placeholderKey` from `types/index.d.ts`. Flagged for v0.2 review.
- `EditorCommandName` mirrors `commandFactories` in `src/commands.js`
  (14 entries: toggleBold, toggleItalic, toggleCode, setParagraph,
  setHeading, toggleHeading, setCodeBlock, toggleCodeBlock,
  toggleBlockquote, toggleBulletList, toggleOrderedList, toggleLink,
  insertImage, undo, redo). Keep this union in sync when commands are
  added or removed.
- Using `DefineComponent<Props, RawBindings, ...>` rather than `Component`
  so consumers get prop / event typing in `<script setup lang="ts">`
  templates. Emits typed as tuple syntax per Vue 3 docs.
- ProseMirror types are imported from `prosemirror-view`,
  `prosemirror-model`, `prosemirror-state` — those packages ship
  `.d.ts` already, so we reference them rather than re-declaring.

## Open Questions
- Should `placeholderKey` be part of the public surface for v0.2? Useful
  for consumers who want to update the placeholder via their own
  transactions, but today it is an internal plugin key.

## Log

### [VUE UI ENGINEER] 2026-04-18T00:00
- Read the task brief and explored `packages/editor/src/` to confirm
  the actual public surface.
- Confirmed `src/index.js` does not export `placeholderKey` today — the
  task brief appears to have been written from a v0.2 wishlist. Per
  "do not touch JS" constraint I will omit it from the `.d.ts`.
- Confirmed `commandFactories` in `src/commands.js` has 15 names; my
  `EditorCommandName` union will mirror it verbatim.
- Starting on `types/index.d.ts`, then the TS check harness.

### [VUE UI ENGINEER] 2026-04-18T00:30
- Wrote `packages/editor/types/index.d.ts` covering every symbol exported
  from `src/index.js`:
  * `Editor` (DefineComponent<EditorProps, EditorInstance, EditorEmits>)
  * `Toolbar` (DefineComponent<ToolbarProps>)
  * `schema`, `buildSchema`, `MAX_HEADING_LEVEL`
  * `parseMarkdown`, `serializeMarkdown`, `createMarkdownIO`, `MarkdownIO`
  * `isValidHttpUrl` (type predicate)
  * Supporting types: `EditorProps`, `EditorEmits`, `EditorInstance`,
    `EditorCommandName`, `LinkCallback`, `ImageCallback`,
    `LinkRequestContext`, `ImageRequestContext`, `LinkResult`,
    `ImageResult`, `BuildSchemaOptions`, `ToolbarProps`.
- Wired `types` field and `exports['.'].types` in `package.json`. Added
  `typescript@^5.9.3` to devDependencies (not present anywhere else in
  the monorepo).
- Used `files: ["dist", "src", "types/index.d.ts", ...]` (specific file,
  not the whole `types/` directory) so the check harness and tsconfig
  do not ship in the published tarball. Verified with `npm pack --dry-run`
  (15 files listed, `index.d.ts` included, `__check__.ts`/`tsconfig.json`
  excluded).
- Wrote `types/__check__.ts` that exercises every exported symbol via
  `import … from '@editor/core'` (package-name resolution, the real
  consumer path) plus a `types/tsconfig.json` (strict, noEmit,
  allowJs:false, skipLibCheck, lib ES2020+DOM, moduleResolution bundler,
  jsx preserve). Deviated slightly from the brief's literal example
  (`from '../src/index.js'`) because TS with `--allowJs false` cannot
  resolve types for a JS file without a sibling `.d.ts` — using the
  package name is both equivalent and more realistic. Included `@ts-expect-error`
  negative assertions to lock in that bad `dir`/`toolbar`/command values
  are rejected.
- TS check passes cleanly: `npx tsc --project types/tsconfig.json` exits
  0 with no diagnostics. Also verified with the flag-style invocation
  from the brief (adding `--skipLibCheck --lib ES2020,DOM --target
  ES2020 --module ESNext --moduleResolution Bundler --jsx preserve`;
  pure `--strict` alone hits Vue's `.d.ts` file using `Map`/`Set` because
  the default lib is ES5).
- Vitest: 91/91 green.
- Build: clean (`vite build` — editor.js 149.4 kB / 55.89 kB gzipped).
- README: added a short "TypeScript" section immediately above "Usage".
- CHANGELOG: appended an `Added` subsection inside the existing 0.1.1
  block.
- No `app/`, `db/`, `web/`, or JS source changes.

## Final Summary

Files created:
- `packages/editor/types/index.d.ts` — hand-written type declarations.
- `packages/editor/types/__check__.ts` — consumer-perspective TS harness
  (not shipped).
- `packages/editor/types/tsconfig.json` — harness-only TS config (not
  shipped).

Files modified:
- `packages/editor/package.json` — `types` field, `exports['.'].types`,
  tighter `files` entry (`types/index.d.ts`), `typescript` devDep.
- `packages/editor/README.md` — short "TypeScript" section.
- `packages/editor/CHANGELOG.md` — `Added` entry under 0.1.1.

Verifications:
- `npx tsc --project types/tsconfig.json` — 0 errors.
- `npm run test -w @editor/core` — 91/91 passing.
- `npm run build -w @editor/core` — clean.
- `npm pack --dry-run` — 15 files, harness excluded, declarations
  included.

TS-vs-JS interop notes:
- `DefineComponent<Props, RawBindings, Emits>` picks up tuple-form emits
  cleanly; Vue 3.5's runtime-core `.d.ts` accepts the tuple-style emits
  we declared. No quirks.
- ProseMirror package `.d.ts` files resolve fine via `import type` —
  no need to depend on or bundle their types.
- `@editor/core` resolves from the monorepo via npm workspaces; the
  harness import `from '@editor/core'` picks up `types/index.d.ts`
  through the `exports['.'].types` entry.
- The brief's literal check-file example used `from '../src/index.js'`.
  That path only resolves under `--allowJs true` or with a sibling
  `.d.ts` inside `src/`. I documented the deviation in `__check__.ts`
  and used the package name instead — which is closer to what actual
  consumers will do.

Status: Awaiting code review + security review before marking Completed.
