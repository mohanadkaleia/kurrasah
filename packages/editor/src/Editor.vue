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
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import Toolbar from './Toolbar.vue'
import { buildSchema } from './schema.js'
import { createMarkdownIO } from './markdown.js'
import { buildPlugins, placeholderKey } from './plugins.js'
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
//   onRequestLink: (context) =>
//       Promise<{href, title?} | null> | {href, title?} | null
//                                   called when the link command needs a URL
//   onRequestImage: (context) =>
//       Promise<{src, alt?, title?} | null> | {src, alt?, title?} | null
//                                   called when the image command needs a URL
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
  onRequestLink: { type: Function, default: null },
  onRequestImage: { type: Function, default: null },
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
// states without touching PM internals from outside the component.
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
    }),
  })
  view.value = new EditorView(mountEl.value, {
    state,
    editable: () => !props.readonly,
    attributes: {
      class: 'editor-content',
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
  // Emit on initial mount AND on every rebuild so consumers that toggle
  // `images`/`links` always have a live view reference. Consumers that
  // only care about the first mount can ignore subsequent emits.
  emit('ready', view.value)
}

// Mirror `onRequestLink` / `onRequestImage` onto the current view. Re-run
// whenever the view is rebuilt or the props change.
function syncRequestCallbacks() {
  if (!view.value) return
  view.value._editorCoreRequests = {
    link: props.onRequestLink || null,
    image: props.onRequestImage || null,
  }
}

function destroyView() {
  if (view.value) {
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
  view.value.focus()
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
  () => [props.onRequestLink, props.onRequestImage],
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
  </div>
</template>
