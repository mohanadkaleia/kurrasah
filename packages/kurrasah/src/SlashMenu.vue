<script setup>
// Slash-menu popover.
//
// The component is mounted once by Editor.vue and stays in the tree for the
// life of the editor. It renders (via Teleport) only when the plugin state
// marks the menu as active. Reactive updates come through a `revision`
// counter that Editor.vue increments on every transaction — on each bump
// we read the plugin state fresh and recompute.
//
// Responsibilities owned by this component:
//   - Positioning the popover at the cursor / trigger position.
//   - Filtering the item list against the live query.
//   - Keyboard navigation (ArrowUp / ArrowDown / Enter / Escape).
//   - Click-outside dismissal.
//   - Running the selected command AND — when we were invoked by the `@`
//     trigger — deleting the trigger+query range from the doc.

import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'
import { DEFAULT_SLASH_ITEMS, filterSlashItems } from './slashMenu.js'
import { slashMenuKey, SLASH_MENU_META } from './slashMenuPlugin.js'
import { commandFactories } from './commands.js'

const props = defineProps({
  // The ProseMirror EditorView owning this menu. `null` before the editor
  // view mounts; the component no-ops in that window.
  view: { type: Object, default: null },
  // Revision counter from Editor.vue — changes on every transaction. We
  // watch it to re-read plugin state and reposition the popover.
  revision: { type: Number, default: 0 },
  // The editor's schema — needed because `commandFactories` that take
  // `(schema, ...args)` need to be bound before dispatching.
  schema: { type: Object, default: null },
})

// Current snapshot of the plugin state (not reactive on its own; we mirror
// it into a ref on every revision tick).
const pluginState = shallowRef(readPluginState(props.view))
const coords = ref(null) // { left, top }
const selectedIndex = ref(0)

const filtered = computed(() => {
  const state = pluginState.value
  if (!state || !state.active) return []
  return filterSlashItems(DEFAULT_SLASH_ITEMS, state.query)
})

const active = computed(() => {
  const state = pluginState.value
  if (!state || !state.active) return false
  // Hide the menu when there are no results — but don't close the plugin
  // state, because the user might backspace back to a matching query.
  return filtered.value.length > 0
})

function readPluginState(view) {
  if (!view) return null
  try {
    return slashMenuKey.getState(view.state) || null
  } catch {
    return null
  }
}

// Compute screen coordinates for the popover. For the trigger path, anchor
// at the trigger character so the menu reads as "attached to this query".
// For the command-palette path, anchor at the current cursor.
function computeCoords() {
  const view = props.view
  const state = pluginState.value
  if (!view || !state || !state.active) {
    coords.value = null
    return
  }
  let anchorPos
  if (state.range && typeof state.range.from === 'number') {
    anchorPos = state.range.from
  } else {
    const sel = view.state.selection
    anchorPos = sel && typeof sel.from === 'number' ? sel.from : 1
  }
  try {
    const rect = view.coordsAtPos(anchorPos)
    coords.value = {
      left: Math.round(rect.left),
      top: Math.round(rect.bottom + 6),
    }
  } catch {
    coords.value = null
  }
}

// Re-read plugin state and reposition whenever the editor dispatches a
// transaction (revision counter bumps), or whenever the view reference
// changes (prop swap / unmount).
watch(
  [() => props.revision, () => props.view],
  () => {
    pluginState.value = readPluginState(props.view)
    // Reset selected index whenever the filter could have changed —
    // cheaper than deep-equaling the filtered list.
    selectedIndex.value = 0
    computeCoords()
  },
  { immediate: true }
)

// Keep selectedIndex in bounds as the filter list shrinks.
watch(filtered, (list) => {
  if (selectedIndex.value >= list.length) {
    selectedIndex.value = Math.max(0, list.length - 1)
  }
})

// --- Keyboard + click-outside wiring ------------------------------------
//
// Listeners are attached on the document while the menu is visible. Using
// `capture: true` means we run BEFORE ProseMirror's own keydown handler,
// so our preventDefault() actually prevents PM from seeing the key.

function onKeyDown(event) {
  if (!active.value) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    event.stopPropagation()
    const n = filtered.value.length
    if (n > 0) selectedIndex.value = (selectedIndex.value + 1) % n
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    event.stopPropagation()
    const n = filtered.value.length
    if (n > 0) {
      selectedIndex.value = (selectedIndex.value - 1 + n) % n
    }
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    applyItem(filtered.value[selectedIndex.value])
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeMenu()
    return
  }
}

function onMouseDown(event) {
  if (!active.value) return
  const popover = popoverEl.value
  if (popover && popover.contains(event.target)) return
  // Clicked outside the popover — close. Leave any typed `@query` text in
  // the doc; the user might want to keep it as prose.
  closeMenu()
}

// Attach / detach listeners based on active state. We avoid the expense of
// keeping them around when the menu is closed — there are usually none,
// but a user editing in a long session would otherwise accumulate unused
// handlers on every open/close cycle.
let listenersAttached = false
function attachListeners() {
  if (listenersAttached) return
  document.addEventListener('keydown', onKeyDown, { capture: true })
  document.addEventListener('mousedown', onMouseDown, { capture: true })
  listenersAttached = true
}
function detachListeners() {
  if (!listenersAttached) return
  document.removeEventListener('keydown', onKeyDown, { capture: true })
  document.removeEventListener('mousedown', onMouseDown, { capture: true })
  listenersAttached = false
}

watch(active, (isActive) => {
  if (isActive) {
    attachListeners()
  } else {
    detachListeners()
  }
})

onBeforeUnmount(() => {
  detachListeners()
})

// --- Apply + close -------------------------------------------------------

function closeMenu() {
  const view = props.view
  if (!view) return
  const tr = view.state.tr.setMeta(slashMenuKey, {
    action: SLASH_MENU_META.CLOSE,
  })
  view.dispatch(tr)
}

function applyItem(item) {
  const view = props.view
  const schema = props.schema
  if (!item || !view || !schema) {
    closeMenu()
    return
  }

  const factory = commandFactories[item.command]
  if (!factory) {
    closeMenu()
    return
  }

  const state = pluginState.value
  const range = state && state.range
  const source = state && state.source

  // Step 1 (trigger path only): delete the `@query` range. We do this BEFORE
  // running the block command so the command operates on a clean block,
  // not on one that still has `@h1` in it.
  if (source === 'trigger' && range) {
    const tr = view.state.tr.delete(range.from, range.to)
    // Also close the menu as part of the same tr.
    tr.setMeta(slashMenuKey, { action: SLASH_MENU_META.CLOSE })
    view.dispatch(tr)
  } else {
    // Command-palette path: just close via meta (no range to delete).
    closeMenu()
  }

  // Step 2: run the command against the (now possibly shortened) state.
  // We match the pattern used by Editor.execCommand: factories with arity
  // ≥ 1 expect the schema as the first arg.
  const args = item.args || []
  let cmd
  if (factory.length >= 1) {
    cmd = factory(schema, ...args)
  } else {
    cmd = factory(...args)
  }
  cmd(view.state, view.dispatch, view)

  // Refocus the editor — the menu was rendered in a Teleport, so focus may
  // have been in a limbo state. Wait a tick so the dispatch settles.
  nextTick(() => {
    try { view.focus() } catch { /* view gone */ }
  })
}

function onItemClick(index) {
  selectedIndex.value = index
  applyItem(filtered.value[index])
}

function onItemMouseEnter(index) {
  selectedIndex.value = index
}

// Ref for the popover element — used by click-outside.
const popoverEl = ref(null)

// Refs for each item row, keyed by index. We use them to scroll the
// currently-selected item into view when the user arrows past the
// popover's visible area.
const itemRefs = useTemplateRef('itemRefs')

// Scroll-into-view whenever the selection index changes while the menu
// is open. `block: 'nearest'` avoids jarring recentering when the item
// is already visible — it only nudges the list when necessary.
watch(selectedIndex, (i) => {
  if (!active.value) return
  const el = itemRefs.value?.[i]
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'nearest' })
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="active && coords"
      ref="popoverEl"
      class="kurrasah-slash-menu"
      role="listbox"
      aria-label="Block type menu"
      :style="{
        left: coords.left + 'px',
        top: coords.top + 'px',
      }"
      @mousedown.prevent
    >
      <ul class="kurrasah-slash-menu-list">
        <li
          v-for="(item, index) in filtered"
          :key="item.id"
          ref="itemRefs"
          role="option"
          class="kurrasah-slash-menu-item"
          :class="{ 'is-selected': index === selectedIndex }"
          :aria-selected="index === selectedIndex"
          @mouseenter="onItemMouseEnter(index)"
          @click="onItemClick(index)"
        >
          <!--
            Trusted-source-only: `item.icon` is a hard-coded string
            assembled inside this package (see src/slashMenu.js).
            If a future release exposes a consumer-supplied items
            API, sanitize or switch to a slot + component map — do
            NOT pipe untrusted HTML through v-html.
          -->
          <span class="kurrasah-slash-menu-icon" v-html="item.icon"></span>
          <span class="kurrasah-slash-menu-labels">
            <span class="kurrasah-slash-menu-label">{{ item.label }}</span>
            <span class="kurrasah-slash-menu-description">{{ item.description }}</span>
          </span>
        </li>
      </ul>
    </div>
  </Teleport>
</template>
