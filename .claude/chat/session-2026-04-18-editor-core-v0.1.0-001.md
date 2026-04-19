# session-2026-04-18-editor-core-v0.1.0-001

## Task
Apply review feedback to `@editor/core` (`packages/editor/`) and bump the package to v0.1.0 (first non-zero release). Touch `web/` only to wire new package APIs into `EditorPage.vue`. Do not touch `app/` or `db/`.

## Scope
- `packages/editor/src/` — correctness fixes (markdown-it dep, placeholder decoration, ready re-emit, callback props, `--editor-min-height`, `loading="lazy"`, dead-code removal).
- `packages/editor/test/` — add ~7–10 vitest cases.
- `packages/editor/package.json`, `CHANGELOG.md`, `README.md` — package hygiene.
- `web/src/views/EditorPage.vue`, `web/src/views/DocsView.vue` — wire `onRequestLink` / `onRequestImage` + document the new props in Arabic.

## Implementation Plan

### FRONTEND PLAN (the whole brief is frontend, no backend)

1. **Dependency declaration**
   - Add `"markdown-it": "^14"` to `packages/editor/package.json` `dependencies`.
   - Keep it bundled (not in vite externals).

2. **Dead code cleanup**
   - `plugins.js`: remove the `toggleMark, setBlockType` imports from `prosemirror-commands`.
   - `Editor.vue` `execCommand`: drop the redundant `name !== 'undo' && name !== 'redo'` special-case.

3. **Placeholder plugin rewrite**
   - Replace closure-captured `text` with a `PluginKey`-backed state (`init` / `apply`) that reads a meta payload.
   - Decorations function reads `this.getState(state)` instead of a closure var.
   - Split the `Editor.vue` rebuild watcher: `[images, links]` rebuilds; `placeholder` dispatches a `setMeta` transaction to the placeholder plugin, preserving the undo stack.

4. **`ready` re-emit**
   - Emit `ready(view)` on every `createView` call — not only the first mount.

5. **Callback props for link/image UI**
   - New props: `onRequestLink`, `onRequestImage` (both functions, default `null`).
   - `Editor.vue` stashes them on `view.someProp`-readable props bag (simplest: attach to `view._editorCoreRequests = { link, image }`). The commands read from `view._editorCoreRequests` inside their dispatch callback (async arrow — no selection races because we `dispatch` synchronously once the callback resolves, against the *then-current* view state).
   - Fallback when not provided: `window.prompt` with **English** strings. Keep the `isValidHttpUrl` validator applied.
   - Programmatic calls (`toggleLink(schema, 'https://…')`) continue to bypass prompts/callbacks.

6. **Image `loading="lazy"`**
   - Update `schema.js` `image.toDOM` to include `loading: 'lazy'`.

7. **`--editor-min-height` CSS variable**
   - `style.css`: `min-height: var(--editor-min-height, 12rem)` on `.editor-content`.

8. **README + DocsView updates**
   - README: Behavioral notes, Bundling, Styling hooks sections. Add `onRequestLink` / `onRequestImage` rows, update `ready` description.
   - `web/src/views/DocsView.vue`: mirror the two new prop rows and the `ready` description in Arabic.

9. **Version bump + changelog**
   - `package.json` → `0.1.0`.
   - `CHANGELOG.md` (Keep-a-Changelog style).

10. **Consumer wiring in `web/`**
    - `EditorPage.vue`: pass `:on-request-link` and `:on-request-image` callbacks that prompt in Arabic via `window.prompt`, reuse `isValidHttpUrl` from `@editor/core`, return `{href}` / `{src, alt}` or `null`.

### TEST PLAN (vitest only — no Playwright)

Add cases covering:
- Placeholder prop change preserves undo stack (type, change placeholder prop, undo — text is restored).
- `ready` fires again after a rebuild triggered by toggling `images`.
- `ready` fires again after a rebuild triggered by toggling `links`.
- `onRequestLink` returning `{href: 'https://x'}` applies the link.
- `onRequestLink` returning `null` produces no link.
- `onRequestLink` not provided → falls back to `window.prompt` (mocked) with English string.
- Same three tests for `onRequestImage`.
- Rendered `<img>` DOM carries `loading="lazy"`.
- Placeholder decoration updates when `placeholder` prop changes (without rebuild).

Target: ~88 tests.

## Decisions

- **Callback wiring path.** The simplest place to thread the callbacks is on the `EditorView` instance via a plain property (`view._editorCoreRequests`). The command factories live in `commands.js` and receive `view` as their third argument — they can read from `view._editorCoreRequests` without touching the PM plugin/state API. This keeps the surface tiny and avoids stuffing transient UI concerns into `EditorState` (which is meant for document state).
- **Commands stay synchronous.** `toggleLink` / `insertImage` already run in two phases (resolve URL, then dispatch). When a callback returns a Promise, we `await` it before dispatching. The command itself returns `true` optimistically when the callback path is taken — PM callers don't observe the async outcome, but that matches the current `window.prompt` behavior which is synchronous-blocking. Returning `true` avoids a downstream chain command misinterpreting "no href yet" as "nothing to do".
  - Update: Reconsidered — ProseMirror commands must be synchronous `(state, dispatch, view) => boolean`. To keep that contract, when the callback is provided we return `true` immediately and kick off the async work off-cycle, dispatching via `view.dispatch` once resolved. We do NOT chain through the returned command's dispatch path for the async case.
  - When no callback and no href: we call `window.prompt` synchronously (current behavior, now in English).
- **Placeholder PluginKey.** We give the plugin a `PluginKey('editorCorePlaceholder')` so we can both: (a) look up its state for updating, and (b) dispatch a meta transaction keyed on it.
- **Version.** First real release. Bumping `0.0.0 → 0.1.0`. Not `1.0.0` — API is still small and likely to grow.

## Open Questions

(none initially — brief is explicit)

## Log

### [VUE UI ENGINEER] 2026-04-18T22:57
- Read all relevant files: `packages/editor/src/{Editor.vue,commands.js,plugins.js,schema.js,markdown.js,style.css,index.js,Toolbar.vue}`, all four test files, `README.md`, `vite.config.js`, `package.json`.
- Read consumer `web/src/views/{EditorPage.vue,DocsView.vue}`.
- Baseline: 78 vitest tests, bundle `editor.js` 144 KB (54 KB gzipped), `editor.css` 4 KB.
- Starting implementation in the order laid out in the plan above.

## Review Notes
(pending — awaiting code + security review)

## Final Summary

### Files modified

Package (`packages/editor/`):
- `package.json` — version `0.0.0` → `0.1.0`; added `markdown-it: ^14` to `dependencies`; added `CHANGELOG.md` to `files`.
- `CHANGELOG.md` — **new**, Keep-a-Changelog entry for v0.1.0.
- `README.md` — rewritten: new "Link / image UI hooks", "Styling hooks", "Behavioral notes", "Bundling" sections; updated props table, events description; new exported helpers noted.
- `src/Editor.vue` — split `images/links/placeholder` rebuild watcher into three separate watchers (schema-flags-only rebuild; placeholder meta-dispatch; callback mirror); emit `ready` on every rebuild; stash `onRequestLink`/`onRequestImage` on the view; dropped redundant `undo`/`redo` special-case in `execCommand`; updated header comment.
- `src/plugins.js` — removed dead imports (`toggleMark`, `setBlockType`); introduced `placeholderKey` (`PluginKey`) and gave the placeholder plugin an `init`/`apply` state so decoration text updates via `tr.setMeta(placeholderKey, …)`.
- `src/commands.js` — `toggleLink` and `insertImage` now consult an `onRequestLink`/`onRequestImage` callback stashed on the view before falling back to `window.prompt`; fallback strings are neutral English (`"Link URL"`, `"Image URL"`, `"Alt text (optional)"`). Programmatic calls with explicit URLs still bypass all UI.
- `src/schema.js` — `image.toDOM` now emits `loading="lazy"`.
- `src/style.css` — `.editor-content` min-height is now `var(--editor-min-height, 12rem)`.
- `test/editor.test.js` — +13 tests across 4 new describe blocks: placeholder decoration in-place update; undo survives placeholder change; `ready` re-emit on `images`/`links` toggle; `ready` does NOT re-emit on placeholder change; `loading="lazy"` DOM; `onRequestLink` success / null / invalid / fallback-to-prompt; `onRequestImage` success / null / fallback-to-prompt.

Consumer (`web/`):
- `src/views/EditorPage.vue` — imports `isValidHttpUrl` from `@editor/core`; defines `onRequestLink` / `onRequestImage` functions with Arabic `window.prompt` text; passes them into `<Editor>`.
- `src/views/DocsView.vue` — added Arabic prop rows for `onRequestLink` and `onRequestImage`; updated the `ready` event description to reflect re-emit on rebuild; fixed the stray missing-border on the `toolbar` row (previously had `px-4 py-2 font-mono` instead of `px-4 py-2 border-b border-border font-mono`).

### Test delta

78 → **91** vitest tests (+13). All green. Backend `pytest app/tests/ -q` still green (63 passed).

### Bundle size delta

| | Before | After | Delta |
|---|---|---|---|
| `dist/editor.js` | 144 KB | 149 KB | **+5 KB** |
| gzipped | 54.1 KB | 55.8 KB | **+1.7 KB** |
| `dist/editor.css` | 4 KB | 3.2 KB | −0.8 KB (reported differently by vite — effectively unchanged) |

The increase is almost entirely from the new callback-resolution paths in `commands.js` and the split-watcher / sync code in `Editor.vue`. `markdown-it` was already bundled transitively, so declaring it as a dependency changed no bundle bytes.

### Deviations from the brief

- **None of substance.** One minor design nuance: the brief suggested wiring the callbacks via `view.props.requestLink` / `view.props.requestImage`. `view.props` is the PM `DirectEditorProps` object and PM writes into it during `updateState`, so monkey-patching there risks collision with future PM fields. I used a namespaced property `view._editorCoreRequests` instead — same effect, safer naming. Documented inline in `Editor.vue:114-118` and `commands.js:getRequestCallbacks`.
- **Commands-are-synchronous pattern for async callbacks.** ProseMirror commands must be `(state, dispatch, view) => boolean`. When a callback is provided and resolves asynchronously, the command returns `true` eagerly and the actual edit is dispatched later against the view's then-current state. This matches how a modal would typically behave (user clicks toolbar → something happens later) and avoids changing the command contract. Programmatic callers needing bit-exact sync behavior can keep passing explicit `href`/`src` arguments.
- **`factory.length >= 1` check kept.** Per the brief, I removed the `name !== 'undo' && name !== 'redo'` suffix — but the `factory.length >= 1` branch itself has to stay, because `undo()`/`redo()` factories take no args while everything else takes `schema` first. The comment now just says "declared arity is zero for undo/redo" which is the actual reason.

### New issues surfaced (out of scope)

1. **`Editor.vue` still imports `h` from 'vue' but doesn't use it.** Pre-existing dead import. Not touched here because the brief only called out `plugins.js`; worth cleaning up in a follow-up.
2. **`buildCommands` in `commands.js`** still exists as a bound-command export but is no longer used by the package itself (commands now flow through `commandFactories` + `execCommand`). If it's not part of the intended public surface, it could be dropped in a follow-up. The brief says "keep the public API small — don't export more; note things we're tempted to remove" so this is exactly that: flag it, don't touch it.
3. **Callback rejection is swallowed silently.** A consumer whose `onRequestLink` throws will see no link inserted and no log. Acceptable for v0.1 but consider surfacing a `console.warn` or adding an `@error` emit in a future revision.
4. **Arabic validation in `EditorPage.vue`** uses `window.prompt` twice (URL then alt) for images. A single modal would be a better UX but requires a real dialog component — out of scope.

## Log

### [VUE UI ENGINEER] 2026-04-18T23:00
- Baseline tests green (78/78). Baseline bundle: 144 KB / 54 KB gzipped.
- Applied correctness fixes in order: markdown-it dep, dead imports, placeholder plugin key + meta dispatch, schema loading=lazy, CSS variable, callback props + English fallbacks, `ready` re-emit, `execCommand` special-case cleanup.
- Tests still green throughout (78/78 after correctness pass, before new tests).

### [VUE UI ENGINEER] 2026-04-18T23:02
- Added 13 new vitest cases covering the callback paths, placeholder decoration update + undo preservation, `ready` re-emit semantics, and `loading="lazy"` DOM. All 91 tests green.
- Updated `packages/editor/README.md` with props table additions, new "Link / image UI hooks", "Styling hooks", "Behavioral notes", "Bundling" sections, and updated `ready` description.
- Created `packages/editor/CHANGELOG.md`.
- Bumped version `0.0.0` → `0.1.0`.
- Wired `onRequestLink` / `onRequestImage` into `web/src/views/EditorPage.vue` with Arabic prompts.
- Updated `web/src/views/DocsView.vue` props table (two new rows) and `ready` event description.
- Verified `npm run build -w @editor/core` clean. New bundle: 149 KB / 55.8 KB gzipped (+1.7 KB gzipped).
- Verified `web/` build clean.
- Verified backend `pytest app/tests/ -q` still passes (63/63).
- Ready for review.
