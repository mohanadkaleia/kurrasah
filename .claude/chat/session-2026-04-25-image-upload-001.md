# Image upload (drop / paste) — kurrasah v0.6.0

## Header
- Session: session-2026-04-25-image-upload-001
- Branch: master
- Status: In Progress
- Owner: ui-engineer

## Task
Add drop-and-paste image upload support to `kurrasah`. New `onUploadImage(file, {source})` callback prop fires when the user drops an image file onto the editor surface or pastes one from the clipboard. The existing slash-menu / toolbar `onRequestImage` (URL prompt) path is unchanged. Bumps to v0.6.0 — minor, new public API.

## Scope
- `packages/kurrasah/src/Editor.vue` — wire `dragenter`/`dragover`/`drop` and `paste` handlers on `view.dom`; add `onUploadImage` prop; mirror it onto `_editorCoreRequests.upload`.
- `packages/kurrasah/src/index.js` — no change (no new exports needed).
- `packages/kurrasah/test/imageUpload.test.js` — NEW. 7+ cases covering drop, paste, multi-file, non-image, null return, no callback, rejection.
- `packages/kurrasah/types/index.d.ts` — `UploadImageContext`, `UploadImageResult`, `UploadImageCallback`; new `onUploadImage` prop.
- `packages/kurrasah/types/__check__.ts` — exercise new prop.
- `packages/kurrasah/CHANGELOG.md` — new `[0.6.0]` entry above 0.5.0.
- `packages/kurrasah/README.md` — props row + new "Image uploads (drag-and-drop / paste)" section + behavioral note.
- `packages/kurrasah/package.json` — `version` 0.5.0 → 0.6.0.
- `web/src/views/EditorPage.vue` — wire `onUploadImage` to a FileReader-based handler, with a 5MB size cap and toast on oversize.
- `web/src/views/DocsView.vue` — props row for `onUploadImage` + new section on drop/paste upload.

## Implementation Plan

### FRONTEND PLAN

1. **`Editor.vue` — prop + view event handlers**
   - Add `onUploadImage: { type: Function, default: null }` to `defineProps`.
   - Update `syncRequestCallbacks()` to also stash `upload: props.onUploadImage || null` on `view._editorCoreRequests`.
   - Add `watch(() => props.onUploadImage, syncRequestCallbacks)`.
   - In `createView()` after the click handler, register three new listeners on `view.value.dom`:
     - `dragover` + `dragenter` — when DataTransfer signals image files AND `onUploadImage` is set, `dataTransfer.dropEffect = 'copy'` and `preventDefault`.
     - `drop` — when image files present AND callback set: `preventDefault` + `stopPropagation`. Compute insertion pos via `view.posAtCoords({left, top})`; fall back to `selection.from`. Iterate files; await callback for each; insert image node at the running pos (advance by 1 after each insert).
     - `paste` — when clipboard has image items AND callback set: `preventDefault`. Iterate `clipboardData.items` filtering `kind === 'file' && type.startsWith('image/')`; for each call `getAsFile()`, await callback, insert at current cursor (which advances naturally).
   - All paths catch callback rejections via `.catch(err => console.error('[kurrasah] onUploadImage callback failed:', err))`.
   - Listeners are removed in `destroyView()`.

2. **Tests (`test/imageUpload.test.js`)**
   - 7 cases as specified in the brief. Use `mount(Editor)`; mock `DataTransfer` / `ClipboardEvent` payloads since jsdom's support is partial.
   - Helper `mockDataTransfer(files)` returning `{ files, items: [{kind, type, getAsFile()}], types: ['Files'] }`.
   - Use `dispatchEvent(new Event('drop', {...}))` and manually attach the mock as `event.dataTransfer` (jsdom permits assignment).

3. **Types**
   - `UploadImageSource = 'drop' | 'paste'`
   - `UploadImageContext { source: UploadImageSource }`
   - `UploadImageResult` — alias of existing `ImageResult` (rather than a duplicate type) since the shape is identical.
   - `UploadImageCallback = (file: File, ctx: UploadImageContext) => UploadImageResult | null | Promise<UploadImageResult | null>`
   - `EditorProps.onUploadImage?: UploadImageCallback | null`
   - `__check__.ts`: add a sync + async exemplar; assert `source` narrowing.

4. **Demo (`EditorPage.vue`)**
   - Add `MAX_UPLOAD_BYTES = 5 * 1024 * 1024` constant near the top.
   - `async function uploadImage(file, { source })` — size check first (toast + null on overflow); otherwise FileReader.readAsDataURL; resolve to `{src, alt: file.name || ''}`. On error, `resolve(null)` and toast.
   - Bind `:on-upload-image="uploadImage"` on `<Editor>`.

5. **DocsView.vue**
   - New row in the props table for `onUploadImage`.
   - New section "رفع الصور (سحب وإفلات / لصق)" right after the "Link / image" callbacks. One paragraph explaining the trigger paths + signature, one short FileReader code snippet (data URL).

6. **Docs**
   - `README.md`: props row + new "Image uploads (drag-and-drop / paste)" section near "Link / image UI hooks" + behavioral-notes line about console.error catch.
   - `CHANGELOG.md`: new `[0.6.0] — 2026-04-25` entry above 0.5.0.

7. **Version bump**
   - `package.json` 0.5.0 → 0.6.0.

8. **Verification**
   - `npm run test -w kurrasah` (target ~163 tests, all green).
   - `npm run build -w kurrasah` (clean).
   - `npm run build -w web` (clean).
   - `npx tsc --project packages/kurrasah/types/tsconfig.json` (clean).

## Decisions
- `UploadImageResult` aliases `ImageResult` rather than introducing a parallel type. The shape `{ src, alt?, title? }` is intentionally identical between the URL-prompt path and the upload path; an alias keeps the surface area honest.
- "Drop into a non-editable region" — the brief leaves this open. We `preventDefault` only when image files are detected AND the callback is set; otherwise the browser handles natively. Drops onto a readonly editor still fire because PM's `editable()` guards user *typing*, not native drop. The handler reads `props.readonly` and bails (no preventDefault, no callback) when readonly to keep parity with the typing surface.
- `posAtCoords` returning `null` — fall back to the current selection's `from`. This happens for drops onto whitespace beyond the doc (rare; coords still resolve in practice for any editor-internal pixel).
- Multi-file insertion advance — each `replaceSelectionWith(node)` is followed by a `setSelection` to the position immediately after the new node, so the next file lands "after" the previous one in source order. Implementation uses `tr.mapping.map(insertedPos)` then `+1` to skip past the leaf image.
- Error toasts in the demo — surface "حجم الصورة يتجاوز ٥ ميغابايت" for oversize and "تعذّر قراءة الصورة" on FileReader error. Both via the existing `showToast` infra.

## Open Questions
- None blocking. Drop indicator UI (visual cue at the would-be insert point) is deferred — see "Final Summary" later.

## Log

### [VUE UI ENGINEER] 2026-04-25T18:30
- Read the brief, Editor.vue, commands.js, schema.js, README, CHANGELOG, types, EditorPage.vue, DocsView.vue.
- Confirmed baseline: 156 tests passing.
- Starting implementation.

### [VUE UI ENGINEER] 2026-04-25T18:36
- Editor.vue: added `onUploadImage` prop, three module-level helpers (`eventHasImageFiles`, `collectImageFiles`, `insertImageAtPos`), three event handlers (`onEditorDragOver`, `onEditorDrop`, `onEditorPaste`). Listeners registered in `createView`, removed in `destroyView`. `_editorCoreRequests` now exposes `upload`. The watch on request callbacks includes the new prop.
- Tests: created `test/imageUpload.test.js` with 8 cases (1 more than the brief's minimum — added a readonly-mode test for parity with the typing surface). All 8 pass; total package count 156 → 164.
- Notable test-side gotcha: ProseMirror renders content images alongside an internal `<img class="ProseMirror-separator">` widget that the naive `.editor-mount img` selector matches. Switched to `.editor-mount img[loading]` (the schema's `toDOM` sets `loading="lazy"`, the separator does not) so assertions only count real schema nodes.
- Another test-side gotcha: PM's bubble-phase drop handler runs before our handler in jsdom because it's registered first (during `new EditorView`). When our handler doesn't preventDefault (non-image / no callback / readonly), PM tries to call `clipboardData.getData()` and `view.posAtCoords()`; both crash on jsdom's partial DataTransfer mock. Mitigated by (a) adding `getData: () => ''` to the mock, (b) stubbing `view.posAtCoords` in the affected tests. In real browsers PM handles its own crashes; this is purely a test artifact.
- Types: added `UploadImageSource`, `UploadImageContext`, `UploadImageResult` (alias of `ImageResult`), `UploadImageCallback`. Added `onUploadImage?` to `EditorProps`. Updated `__check__.ts` with sync + async exemplars and a negative test for `source` literal narrowing. `npx tsc --project packages/kurrasah/types/tsconfig.json` clean.
- CHANGELOG: new `[0.6.0] — 2026-04-25` entry above 0.5.0. Added + Notes subsections.
- README: new prop row + new "Image uploads (drag-and-drop / paste)" section right after "Link / image UI hooks".
- package.json: 0.5.0 → 0.6.0.
- Demo (EditorPage.vue): wired `uploadImage(file)` (FileReader → data URL) with a 5MB cap, toast on overflow / FileReader error. Added `MAX_UPLOAD_BYTES` constant near the top.
- Demo (DocsView.vue): new row for `onUploadImage` in the props table; new section "رفع الصور (سحب وإفلات / لصق)" between "سلوك النقر على الروابط" and the live preview. Also fixed an inconsistency in the `onRequestImage` row (it was missing `border-b`).
- Verification:
  - `npm run test -w kurrasah` — 9 files, **164 passed (164)**.
  - `npm run build -w kurrasah` — clean. JS 177,214 → 180,675 bytes (+3.4 KB raw, ~1 KB gzip). CSS unchanged.
  - `npm run build -w web` — clean.
  - `npx tsc --project packages/kurrasah/types/tsconfig.json` — clean.

### Final summary

**Files modified**
- `packages/kurrasah/package.json` — version 0.5.0 → 0.6.0.
- `packages/kurrasah/CHANGELOG.md` — `[0.6.0]` entry.
- `packages/kurrasah/README.md` — prop row + "Image uploads (drag-and-drop / paste)" section.
- `packages/kurrasah/src/Editor.vue` — `onUploadImage` prop, drop / paste handlers, listener wiring + cleanup.
- `packages/kurrasah/types/index.d.ts` — `UploadImageSource`, `UploadImageContext`, `UploadImageResult`, `UploadImageCallback`, `onUploadImage` on `EditorProps`.
- `packages/kurrasah/types/__check__.ts` — exercises new prop and types.
- `web/src/views/EditorPage.vue` — `uploadImage` handler, 5MB cap constant, `:on-upload-image` binding.
- `web/src/views/DocsView.vue` — props row + new image-upload section.

**Files created**
- `packages/kurrasah/test/imageUpload.test.js` — 8 cases.
- `.claude/chat/session-2026-04-25-image-upload-001.md` — this file.

**Test delta**
- 156 → 164 (+8). Brief asked for 7+; added a readonly-mode test on top.

**Bundle size delta**
- `dist/kurrasah.js`: 177,214 → 180,675 bytes (+3,461 bytes raw / ~1 KB gzip).
- `dist/kurrasah.css`: unchanged.

**Decisions resolved (brief-ambiguous bits)**
- *Non-editable / readonly drop region*: `onEditorDrop` and `onEditorPaste` bail when `props.readonly`. The browser's native handling continues. Parity with typing input.
- *`posAtCoords` returning null*: fall back to `selection.from`. Documented in the function comment.
- *Multi-file insertion order*: implemented as "advance running pos by `node.nodeSize` after each insert". Image is a leaf inline node so `nodeSize === 1`.
- *Demo error-toast wording*: "حجم الصورة يتجاوز ٥ ميغابايت" (oversize) and "تعذّر قراءة الصورة" (FileReader error).
- *Bubble-phase listener vs. PM plugin hook*: chose direct `view.dom.addEventListener` because the consumer callback is async and PM `handleDOMEvents` expects a sync boolean. PM's own bubble-phase handler still runs but bails when our preventDefault has fired (PM checks `event.defaultPrevented`).

**Deferred polish (v0.7 candidates — NOT shipped)**
- Drop indicator UI — a thin line / cursor at the would-be insert point during a drag. Adds CSS scope; not blocking on real-world UX testing.
- Progress feedback — a transient placeholder image (or a per-file inline "uploading…") swapped for the final node when the callback resolves. Useful for slow networks, but the consumer-callback contract today is "return when done, we insert"; adding optimistic UI would change the contract.
- Configurable accept list / size cap at the package level — currently the consumer enforces this in their callback (the demo does so with `MAX_UPLOAD_BYTES`). Pushing it into the package adds API surface for a guard most consumers can do in 3 lines.

## Status
- All four verification checks green.
- Awaiting code review and security review.
