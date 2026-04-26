<script setup>
import {
  ref,
  shallowRef,
  onMounted,
  onBeforeUnmount,
  watch,
  computed,
  h,
} from 'vue'
import { EditorState, NodeSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import Toolbar from './Toolbar.vue'
import SlashMenu from './SlashMenu.vue'
import BlockControls from './BlockControls.vue'
import TableToolbar from './TableToolbar.vue'
import { buildSchema } from './schema.js'
import { createMarkdownIO } from './markdown.js'
import {
  buildPlugins,
  enforceTrailingParagraphs,
  placeholderKey,
} from './plugins.js'
import { commandFactories } from './commands.js'

// Public API:
//
// Props
//   modelValue: string              v-model markdown
//   dir: 'rtl' | 'ltr'              writing direction (default rtl)
//   images: boolean                 enable image node (default true)
//   links: boolean                  enable link mark (default true)
//   placeholder: string             placeholder text for empty doc
//   readonly: boolean               disables editing
//   toolbar: boolean | 'minimal'    'minimal' renders the default toolbar
//   slashTrigger: string            trigger character for the slash menu
//                                   (default '@' — '/' maps to 'ظ' on the
//                                   standard Arabic keyboard).
//   slashEnabled: boolean           enable the slash menu (default true)
//   onRequestLink: (context) =>
//       Promise<{href, title?} | null> | {href, title?} | null
//                                   called when the link command needs a URL
//   onRequestImage: (context) =>
//       Promise<{src, alt?, title?} | null> | {src, alt?, title?} | null
//                                   called when the image command needs a URL
//   onUploadImage: (file, {source: 'drop' | 'paste'}) =>
//       Promise<{src, alt?, title?} | null> | {src, alt?, title?} | null
//                                   called when the user drops or pastes an
//                                   image file. Consumer runs the actual
//                                   upload (or embeds as a data URL) and
//                                   returns the final src to insert.
//
// Events
//   update:modelValue(md: string)
//   change(md: string)
//   ready(view: EditorView)         fires on initial mount AND on every
//                                   internal view rebuild (e.g. when the
//                                   images/links props toggle)
//
// Exposed (via defineExpose)
//   focus()
//   getMarkdown(): string
//   setMarkdown(md: string): void   replaces the doc AND resets undo history
//   execCommand(name: string, ...args): boolean

const props = defineProps({
  modelValue: { type: String, default: '' },
  dir: { type: String, default: 'rtl' },
  images: { type: Boolean, default: true },
  links: { type: Boolean, default: true },
  placeholder: { type: String, default: '' },
  readonly: { type: Boolean, default: false },
  toolbar: { type: [Boolean, String], default: 'minimal' },
  slashTrigger: { type: String, default: '@' },
  slashEnabled: { type: Boolean, default: true },
  // Per-block hover controls (drag handle + "+" button). Default on.
  // Set `false` to disable the overlay entirely — consumers who ship
  // their own block-level UI or need a keyboard-only surface.
  blockControlsEnabled: { type: Boolean, default: true },
  // Floating cell-actions toolbar (add/remove rows/columns, delete
  // table). Surfaces above a table while the cursor is inside one of
  // its cells. Default on. Set `false` to opt out without forking.
  tableToolbarEnabled: { type: Boolean, default: true },
  onRequestLink: { type: Function, default: null },
  onRequestImage: { type: Function, default: null },
  // Drop / paste image-file handler. When supplied, the editor takes over
  // the native drop / paste path for image files: it preventDefaults the
  // browser's default (which would either navigate to the file or insert
  // a base64 fallback) and routes each File through this callback. The
  // callback returns the final `{src, alt?, title?}` to insert — typically
  // after running an actual upload — or `null` to cancel. The slash-menu
  // / toolbar URL-prompt path (`onRequestImage`) is unaffected.
  onUploadImage: { type: Function, default: null },
})

const emit = defineEmits(['update:modelValue', 'change', 'ready'])

const rootEl = ref(null)
const mountEl = ref(null)

// Use shallowRef for PM objects — they are not reactive and mutating them
// through Vue reactivity proxies would break internal identity checks.
const view = shallowRef(null)
const schema = shallowRef(null)
const markdownIO = shallowRef(null)
// Tracks a revision counter — used by the toolbar to recompute active
// states without touching PM internals from outside the component. The
// slash-menu popover also watches this value so it can re-read plugin
// state on every transaction.
const revision = ref(0)

// Internal flag: true while we're applying an external `modelValue` to the
// view, so the resulting transaction does not re-emit `update:modelValue`
// and cause a feedback loop.
let applyingExternal = false

function createSchemaAndIO() {
  const s = buildSchema({ images: props.images, links: props.links })
  schema.value = s
  markdownIO.value = createMarkdownIO(s)
}

function createView() {
  createSchemaAndIO()
  const doc = markdownIO.value.parseMarkdown(props.modelValue || '')
  const state = EditorState.create({
    doc,
    plugins: buildPlugins({
      schema: schema.value,
      placeholder: props.placeholder,
      readonly: props.readonly,
      slashEnabled: props.slashEnabled,
      slashTrigger: props.slashTrigger,
    }),
  })
  view.value = new EditorView(mountEl.value, {
    state,
    editable: () => !props.readonly,
    attributes: {
      class: 'editor-content',
    },
    // Clicking an image selects it as a NodeSelection so the user can
    // press Backspace / Delete to remove it. Without this the click
    // lands the caret next to the image (since `image` is inline) and
    // there's no obvious way to delete the image other than dragging
    // the cursor across it. Returns `true` to tell PM we handled the
    // click and to skip the default text-cursor placement.
    handleClickOn(view, _pos, node, nodePos) {
      if (node.type.name !== 'image') return false
      try {
        view.dispatch(
          view.state.tr.setSelection(
            NodeSelection.create(view.state.doc, nodePos)
          )
        )
      } catch {
        return false
      }
      return true
    },
    dispatchTransaction(tr) {
      const newState = view.value.state.apply(tr)
      view.value.updateState(newState)
      revision.value++
      if (tr.docChanged && !applyingExternal) {
        const md = markdownIO.value.serializeMarkdown(newState.doc)
        emit('update:modelValue', md)
        emit('change', md)
      }
    },
  })
  // Stash consumer-supplied link/image callbacks on the view itself. The
  // command factories in commands.js read from here when they need a URL
  // and no explicit value was passed. Using a plain property (rather than
  // plugin state) keeps this transient UI concern out of EditorState.
  syncRequestCallbacks()

  // Link-click handler. Registered directly on the editor's DOM element
  // so it runs independently of ProseMirror's internal event machinery —
  // which has been unreliable for anchor clicks inside contenteditable.
  //
  //   - Plain click (edit or readonly): follow the link in a new tab.
  //   - Cmd/Ctrl-click: let PM handle it so the cursor can land inside
  //     the link for editing the anchor text.
  view.value.dom.addEventListener('click', onLinkClickCapture, true)

  // Drop / paste image upload. Registered on the editor's DOM rather than
  // as PM `handleDrop` / `handlePaste` plugin hooks because we need to
  // await the async upload callback before dispatching the inserting
  // transaction. PM hooks expect a synchronous boolean.
  // Capture phase — ProseMirror also installs paste / drop handlers on
  // `view.dom` (bubble phase) and registered them BEFORE we got the
  // chance, since `new EditorView(...)` ran first. If we listened on
  // bubble too, PM's clipboard parser would already have inserted the
  // image (e.g. as a base64 attachment) by the time our `preventDefault`
  // fires, and the user would see two images. Capture lets us run first
  // and call `preventDefault` so PM's bubble handler bails (PM checks
  // `event.defaultPrevented` and exits when set).
  view.value.dom.addEventListener('dragover', onEditorDragOver, true)
  view.value.dom.addEventListener('dragenter', onEditorDragOver, true)
  view.value.dom.addEventListener('drop', onEditorDrop, true)
  view.value.dom.addEventListener('paste', onEditorPaste, true)

  // Apply trailing-paragraph invariants to the *initial* state. Plugins'
  // `appendTransaction` hook only fires on `docChanged` events, so a
  // doc parsed from markdown that ends in (or stacks) trapping blocks
  // — markdown can't preserve empty paragraphs between two tables, so
  // `parseMarkdown` produces back-to-back tables on round-trip — would
  // otherwise stay un-enforced until the user types.
  const initialEnforce = enforceTrailingParagraphs(view.value.state)
  if (initialEnforce) {
    // `addToHistory: false` keeps this synthetic insertion out of the
    // user's undo stack — they didn't ask for it.
    initialEnforce.setMeta('addToHistory', false)
    view.value.dispatch(initialEnforce)
  }

  // Emit on initial mount AND on every rebuild so consumers that toggle
  // `images`/`links` always have a live view reference. Consumers that
  // only care about the first mount can ignore subsequent emits.
  emit('ready', view.value)
}

// Mirror `onRequestLink` / `onRequestImage` / `onUploadImage` onto the
// current view. Re-run whenever the view is rebuilt or the props change.
function syncRequestCallbacks() {
  if (!view.value) return
  view.value._editorCoreRequests = {
    link: props.onRequestLink || null,
    image: props.onRequestImage || null,
    upload: props.onUploadImage || null,
  }
}

// --- Drop / paste image upload handlers -----------------------------------
//
// Wired directly on `view.dom` (not as PM plugin event handlers) because
// the consumer-supplied `onUploadImage` callback may return a Promise; we
// need to await it before dispatching the inserting transaction, and the
// PM `handleDrop` / `handlePaste` hooks expect a synchronous boolean.
//
// Behavior contract (matches README):
//   - When `onUploadImage` is NOT provided, these handlers are no-ops and
//     the browser's default drop / paste behavior runs unchanged.
//   - When `onUploadImage` IS provided AND the event carries one or more
//     image files, we preventDefault and route each file through the
//     callback. Other file types (e.g. text/plain attachments) are
//     ignored — we don't preventDefault and the browser handles them.
//   - When the editor is `readonly`, drop / paste are ignored entirely.

function eventHasImageFiles(dataTransfer) {
  if (!dataTransfer) return false
  // `files` is the canonical source for drop. `items` is broader (covers
  // paste's clipboardData and modern drag scenarios). Either is fine.
  if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (const f of dataTransfer.files) {
      if (f && typeof f.type === 'string' && f.type.startsWith('image/')) {
        return true
      }
    }
  }
  if (dataTransfer.items && dataTransfer.items.length > 0) {
    for (const item of dataTransfer.items) {
      if (
        item &&
        item.kind === 'file' &&
        typeof item.type === 'string' &&
        item.type.startsWith('image/')
      ) {
        return true
      }
    }
  }
  return false
}

function collectImageFiles(dataTransfer) {
  const out = []
  if (!dataTransfer) return out
  if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (const f of dataTransfer.files) {
      if (f && typeof f.type === 'string' && f.type.startsWith('image/')) {
        out.push(f)
      }
    }
    if (out.length > 0) return out
  }
  // Fallback: synthesize from `items` (paste path always lands here since
  // `clipboardData.files` is often empty in non-Chrome browsers).
  if (dataTransfer.items && dataTransfer.items.length > 0) {
    for (const item of dataTransfer.items) {
      if (
        item &&
        item.kind === 'file' &&
        typeof item.type === 'string' &&
        item.type.startsWith('image/') &&
        typeof item.getAsFile === 'function'
      ) {
        const file = item.getAsFile()
        if (file) out.push(file)
      }
    }
  }
  return out
}

// Insert an image node at `pos` and return the position immediately AFTER
// the inserted leaf so subsequent inserts in the same drop-batch land in
// source order. Returns null if the insert was aborted (no image type, no
// non-empty src).
function insertImageAtPos(pos, attrs) {
  if (!view.value) return null
  const v = view.value
  const imageType = v.state.schema.nodes.image
  if (!imageType) return null
  if (!attrs || typeof attrs.src !== 'string' || attrs.src.length === 0) {
    return null
  }
  const node = imageType.createAndFill({
    src: attrs.src,
    alt: attrs.alt != null ? attrs.alt : null,
    title: attrs.title != null ? attrs.title : null,
  })
  if (!node) return null
  // Clamp pos within the doc — `posAtCoords` can resolve to slightly past
  // the end on some browsers when the cursor is dropped on the trailing
  // padding region.
  const safePos = Math.max(0, Math.min(pos, v.state.doc.content.size))
  const tr = v.state.tr.insert(safePos, node).scrollIntoView()
  v.dispatch(tr)
  // After insert the doc grew by 1 (image is a leaf inline node, size 1).
  return safePos + node.nodeSize
}

function onEditorDragOver(event) {
  if (!view.value || props.readonly) return
  if (!props.onUploadImage) return
  if (!eventHasImageFiles(event.dataTransfer)) return
  // Tell the browser we'll accept the drop. Both `dragenter` and
  // `dragover` need to preventDefault for the drop event to fire at all.
  if (event.dataTransfer) {
    try {
      event.dataTransfer.dropEffect = 'copy'
    } catch {
      // Some browsers throw on assignment in certain phases — safe to
      // ignore; preventDefault below is what actually opens the drop.
    }
  }
  event.preventDefault()
}

function onEditorDrop(event) {
  if (!view.value || props.readonly) return
  const callback = props.onUploadImage
  if (!callback) return
  const files = collectImageFiles(event.dataTransfer)
  if (files.length === 0) return

  event.preventDefault()
  event.stopPropagation()

  // Resolve insertion position from the drop coordinates. Fall back to
  // the current selection's `from` when `posAtCoords` declines (e.g. drop
  // landed on padding outside any text node).
  let insertPos
  const coordsResult = view.value.posAtCoords({
    left: event.clientX,
    top: event.clientY,
  })
  if (coordsResult && typeof coordsResult.pos === 'number') {
    insertPos = coordsResult.pos
  } else {
    insertPos = view.value.state.selection.from
  }

  // Process files sequentially; advance `insertPos` past each insert so
  // multi-file drops land in source order.
  let runningPos = insertPos
  let chain = Promise.resolve()
  for (const file of files) {
    chain = chain.then(async () => {
      try {
        const result = await callback(file, { source: 'drop' })
        if (!result || typeof result !== 'object') return
        if (typeof result.src !== 'string' || result.src.length === 0) return
        const after = insertImageAtPos(runningPos, result)
        if (after != null) runningPos = after
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[kurrasah] onUploadImage callback failed:', err)
      }
    })
  }
}

function onEditorPaste(event) {
  if (!view.value || props.readonly) return
  const callback = props.onUploadImage
  if (!callback) return
  const clipboardData = event.clipboardData
  if (!clipboardData) return
  const files = collectImageFiles(clipboardData)
  if (files.length === 0) return

  event.preventDefault()

  // Paste inserts at the current selection. After each insert, advance
  // by reading the live state — the dispatched transaction has already
  // moved the selection past the new node.
  let chain = Promise.resolve()
  for (const file of files) {
    chain = chain.then(async () => {
      try {
        const result = await callback(file, { source: 'paste' })
        if (!result || typeof result !== 'object') return
        if (typeof result.src !== 'string' || result.src.length === 0) return
        if (!view.value) return
        const pos = view.value.state.selection.from
        insertImageAtPos(pos, result)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[kurrasah] onUploadImage callback failed:', err)
      }
    })
  }
}

function onLinkClickCapture(event) {
  const target = event.target
  if (!(target instanceof Element)) return
  const anchor = target.closest('a[href]')
  if (!anchor) return
  const href = anchor.getAttribute('href')
  if (!href) return
  // Modifier held — fall through so PM can position the cursor.
  if (event.metaKey || event.ctrlKey) return
  event.preventDefault()
  event.stopPropagation()
  // Programmatic click on a detached anchor — bypasses any
  // contenteditable-related suppression and popup blockers that
  // `window.open` hits in some browser configurations.
  const nav = document.createElement('a')
  nav.href = href
  nav.target = '_blank'
  nav.rel = 'noopener noreferrer'
  nav.style.display = 'none'
  document.body.appendChild(nav)
  nav.click()
  document.body.removeChild(nav)
}

function destroyView() {
  if (view.value) {
    view.value.dom.removeEventListener('click', onLinkClickCapture, true)
    view.value.dom.removeEventListener('dragover', onEditorDragOver, true)
    view.value.dom.removeEventListener('dragenter', onEditorDragOver, true)
    view.value.dom.removeEventListener('drop', onEditorDrop, true)
    view.value.dom.removeEventListener('paste', onEditorPaste, true)
    view.value.destroy()
    view.value = null
  }
}

// Replace the entire document with new markdown. Used by `setMarkdown` and
// by the external `modelValue` watcher. Wrapped in `applyingExternal` to
// suppress the echo.
function replaceDoc(md) {
  if (!view.value || !markdownIO.value) return
  applyingExternal = true
  try {
    const doc = markdownIO.value.parseMarkdown(md || '')
    const state = EditorState.create({
      doc,
      plugins: view.value.state.plugins,
      selection: undefined,
    })
    view.value.updateState(state)
    revision.value++
  } finally {
    applyingExternal = false
  }
}

function getCurrentMarkdown() {
  if (!view.value || !markdownIO.value) return props.modelValue || ''
  return markdownIO.value.serializeMarkdown(view.value.state.doc)
}

// Named-command dispatcher. Looks the command up by name, binds it to the
// current schema if necessary, and runs it through the view.
//
// Note on the return value: `ok` here means "the command accepted the
// request", NOT "the edit landed". For sync paths (toggleBold etc.) the
// two are identical. For async paths (toggleLink / insertImage when a
// consumer callback is active) `ok` is `true` the moment the callback is
// dispatched — the actual edit lands later when the callback resolves,
// or never if the consumer cancels / returns an invalid URL. Documented
// in the README under "Behavioral notes".
function execCommand(name, ...args) {
  const factory = commandFactories[name]
  if (!factory || !view.value) return false
  // Factories come in two shapes:
  //   (schema, ...args) -> command          e.g. toggleBold(schema)
  //   () -> command                         e.g. undo()
  // `factory.length` is the declared (non-default) arity — zero for `undo`
  // and `redo`, ≥1 for everything else — so it alone is a sufficient guard.
  let cmd
  if (factory.length >= 1) {
    cmd = factory(schema.value, ...args)
  } else {
    cmd = factory(...args)
  }
  const state = view.value.state
  const ok = cmd(state, view.value.dispatch, view.value)
  // Async command paths (link/image with a consumer callback) stamp the
  // view so the dispatcher knows to skip the auto-focus. Otherwise the
  // editor steals focus from the consumer's modal the instant it opens.
  // The flag is read-then-cleared unconditionally so a stale `true` from a
  // cancelled async command cannot leak into the next `execCommand` call.
  const pendingAsync = view.value._editorCoreAsyncPending === true
  view.value._editorCoreAsyncPending = false
  if (!pendingAsync) view.value.focus()
  return ok
}

function focus() {
  if (view.value) view.value.focus()
}

// External modelValue watcher: if the parent sets a different markdown
// value than what's currently in the view, apply it. Guard with a diff
// against the current serialization to avoid reparsing on our own emits.
watch(
  () => props.modelValue,
  (newValue) => {
    if (!view.value || !markdownIO.value) return
    if (applyingExternal) return
    const current = markdownIO.value.serializeMarkdown(view.value.state.doc)
    if ((newValue || '') === current) return
    replaceDoc(newValue)
  }
)

// Readonly toggle — PM's `editable` is a function so it reflects live, but
// we still need to trigger a re-render to refresh decorations.
watch(
  () => props.readonly,
  () => {
    if (view.value) view.value.updateState(view.value.state)
  }
)

// When feature flags flip (images/links), rebuild the view entirely. These
// change the schema, so a full rebuild is the only correct answer. This
// does reset the undo stack — which is documented behavior.
watch(
  () => [props.images, props.links],
  () => {
    const md = getCurrentMarkdown()
    destroyView()
    createView()
    if (md) replaceDoc(md)
  }
)

// Slash-menu config changes (`slashTrigger`, `slashEnabled`) also require a
// view rebuild, because they're baked into the plugin instance at
// construction time. In practice consumers rarely toggle these mid-session;
// the rebuild is a worst-case correctness choice, matching how `images` and
// `links` are handled.
watch(
  () => [props.slashTrigger, props.slashEnabled],
  () => {
    const md = getCurrentMarkdown()
    destroyView()
    createView()
    if (md) replaceDoc(md)
  }
)

// Placeholder changes are decoration-only — no schema change, no rebuild.
// Dispatch a meta transaction to the placeholder plugin instead, which
// preserves the undo stack.
watch(
  () => props.placeholder,
  (newValue) => {
    if (!view.value) return
    const tr = view.value.state.tr.setMeta(placeholderKey, newValue || '')
    view.value.dispatch(tr)
  }
)

// Keep the request-callback bag on the view in sync if the consumer swaps
// handlers mid-session. Reactive props on Vue are picked up lazily — mirror
// them explicitly so the commands see the current function reference.
watch(
  () => [props.onRequestLink, props.onRequestImage, props.onUploadImage],
  () => {
    syncRequestCallbacks()
  }
)

onMounted(() => {
  createView()
})

onBeforeUnmount(() => {
  destroyView()
})

const exposed = {
  focus,
  getMarkdown: getCurrentMarkdown,
  setMarkdown: replaceDoc,
  execCommand,
  get view() {
    return view.value
  },
}

defineExpose(exposed)

const showToolbar = computed(
  () => props.toolbar === true || props.toolbar === 'minimal'
)
</script>

<template>
  <div ref="rootEl" class="editor-root" :dir="dir">
    <Toolbar v-if="showToolbar" :editor="exposed" :dir="dir" />
    <div ref="mountEl" class="editor-mount" :data-revision="revision"></div>
    <SlashMenu
      v-if="slashEnabled"
      :view="view"
      :schema="schema"
      :revision="revision"
    />
    <BlockControls
      v-if="blockControlsEnabled"
      :view="view"
      :revision="revision"
      :dir="dir"
      :enabled="blockControlsEnabled"
    />
    <TableToolbar
      v-if="tableToolbarEnabled"
      :view="view"
      :revision="revision"
      :dir="dir"
      :enabled="tableToolbarEnabled"
    />
  </div>
</template>
