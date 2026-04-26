<script setup>
// Floating cell-actions toolbar.
//
// Mounted once by `Editor.vue` and kept in the tree for the life of the
// editor. Surfaces the canonical row / column / table operations from
// `prosemirror-tables` while the cursor is inside a cell, so the user
// has discoverable buttons without having to memorize the underlying
// command names.
//
// Visibility:
//   - Selection's `$from` has a parent of type `table_cell` or
//     `table_header`, OR the selection is a `CellSelection`.
//   - AND the slash menu is not currently active (same coupling we use
//     in BlockControls — popovers shouldn't compete).
//   - AND the `enabled` prop is true.
//
// Position:
//   - Anchor to the table's outside top edge using
//     `view.coordsAtPos(tableStart)`, placed a few pixels above the
//     table's top.
//   - The toolbar's start-edge aligns with the table's start-edge:
//     right-aligned in RTL (the button group's right-edge sits at the
//     table's right edge), left-aligned in LTR.
//   - If there's no room above the table (anchored coord is too close
//     to the viewport top), flip below the table using
//     `view.coordsAtPos(tableEnd)`.
//
// Buttons (in reading order — same ordering for RTL and LTR, since
// `addColumnBefore` / `addColumnAfter` are LOGICAL relative to the
// current cell, not physical):
//   1. Add row above            (insert a row before the current row)
//   2. Add row below            (insert a row after the current row)
//   3. (separator)
//   4. Add column before        (insert a column before the current cell)
//   5. Add column after         (insert a column after the current cell)
//   6. (separator)
//   7. Delete row
//   8. Delete column
//   9. (separator)
//   10. Delete table
//
// Each button uses an Arabic text label inside the button glyph rather
// than a directional icon, because "before" vs "after" is genuinely
// hard to disambiguate via icon alone — discoverability beats icon
// purity when the label is short enough to fit.

import {
  computed,
  ref,
  shallowRef,
  watch,
} from 'vue'
import {
  addRowBefore,
  addRowAfter,
  addColumnBefore,
  addColumnAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
  CellSelection,
} from 'prosemirror-tables'
import { slashMenuKey } from './slashMenuPlugin.js'

const props = defineProps({
  // The ProseMirror EditorView owning this overlay. Null before mount;
  // no-ops in that window.
  view: { type: Object, default: null },
  // Revision counter — bumps on every transaction. We watch it to
  // re-read the selection state and reposition.
  revision: { type: Number, default: 0 },
  // Document direction — drives physical alignment of the toolbar
  // relative to the table's start edge (right under RTL, left under LTR).
  dir: { type: String, default: 'rtl' },
  // Master switch. `false` → component never renders.
  enabled: { type: Boolean, default: true },
})

// Snapshot of the table the cursor is currently inside, shape:
//   { node, from, to } — `from`/`to` are absolute doc positions
//   bracketing the table. `null` when the selection is not in a cell.
const tableInfo = shallowRef(null)
const coords = ref(null) // { left, top, anchor: 'top' | 'bottom', isRtl } | null

// Whether the slash menu is currently active. Updated on every
// revision tick.
const slashActive = ref(false)

// Whether the cursor / selection is inside a table cell. Mirrored from
// the view state on every revision tick (we cannot read it in a
// `computed` that depends on `props.view.state` because PM mutates the
// state in-place — Vue does not see the change).
const insideCell = ref(false)

// We re-render when the disabled state of buttons changes. Track via a
// counter that we bump whenever we re-read selection state.
const stateTick = ref(0)

// --- Helpers -------------------------------------------------------------

// Walk up the selection ancestry and return the nearest enclosing table
// node + position, or `null` if the selection is not inside a table.
//
// We accept either a TextSelection (cursor inside a cell) or a
// CellSelection (visual selection of one or more cells).
function findEnclosingTable(state) {
  if (!state) return null
  const sel = state.selection
  if (!sel) return null
  // CellSelection always sits inside a table by construction.
  let $pos = sel.$from
  if (sel instanceof CellSelection) {
    $pos = sel.$anchorCell || sel.$from
  }
  if (!$pos) return null
  for (let d = $pos.depth; d >= 0; d--) {
    const node = $pos.node(d)
    if (!node || !node.type) continue
    const role = node.type.spec && node.type.spec.tableRole
    if (role === 'table' || node.type.name === 'table') {
      // `before(d)` is the position immediately before the table opens
      // at that depth. For depth 0 this would throw, but a table can
      // never live at depth 0 — `doc` is always the depth-0 ancestor.
      const from = d === 0 ? 0 : $pos.before(d)
      const to = from + node.nodeSize
      return { node, from, to }
    }
  }
  return null
}

// Determine if the cursor is inside a cell (or a CellSelection is
// active). Used as the visibility gate.
function isInsideCell(state) {
  if (!state) return false
  const sel = state.selection
  if (!sel) return false
  if (sel instanceof CellSelection) return true
  const $pos = sel.$from
  if (!$pos) return false
  for (let d = $pos.depth; d > 0; d--) {
    const t = $pos.node(d).type.name
    if (t === 'table_cell' || t === 'table_header') return true
  }
  return false
}

function readSlashActive(view) {
  if (!view) return false
  try {
    const state = slashMenuKey.getState(view.state)
    return !!(state && state.active)
  } catch {
    return false
  }
}

// Compute the toolbar's screen position. Returns `{ left, top, anchor }`
// or `null` if we can't resolve the table's coords. `anchor` reports
// whether we landed above ('top') or flipped below ('bottom') so the
// caller can render an appropriate visual cue if desired (currently
// unused — we render the same DOM in both positions).
function computePosition(view, info, dir) {
  if (!view || !info) return null

  // Estimated toolbar height in px. The toolbar is short and fixed
  // height — measuring the real DOM would require a render-then-measure
  // cycle, which complicates Teleport mounting. The estimate only
  // matters for the "no room above → flip below" decision; off by a
  // few pixels just shifts when we flip.
  const TOOLBAR_HEIGHT_ESTIMATE = 32
  const VERTICAL_GAP = 6
  // `info.from` is the position immediately before the table opens.
  // Nudge to `from + 1` so coordsAtPos lands inside the first row,
  // which is where PM can produce a stable rect for the table's
  // top-left/top-right.
  let topRect, bottomRect
  try {
    topRect = view.coordsAtPos(Math.min(info.from + 1, info.to - 1))
    bottomRect = view.coordsAtPos(Math.max(info.to - 1, info.from + 1))
  } catch {
    return null
  }
  if (!topRect) return null

  const isRtl = dir === 'rtl'
  const tableLeft = topRect.left
  const tableRight = (bottomRect && bottomRect.right) || topRect.right

  // Vertical placement: prefer above the table; flip below if there's
  // no room above.
  const aboveTop = topRect.top - TOOLBAR_HEIGHT_ESTIMATE - VERTICAL_GAP
  let top
  let anchor
  if (aboveTop >= 0) {
    top = aboveTop
    anchor = 'top'
  } else {
    top = (bottomRect ? bottomRect.bottom : topRect.bottom) + VERTICAL_GAP
    anchor = 'bottom'
  }

  // Horizontal placement: align the toolbar's start-edge with the
  // table's start-edge. Under RTL the start-edge is the right; under
  // LTR it's the left. We don't measure the toolbar's own width
  // (Teleport-then-measure complicates the mount cycle), so we set
  // `left` at the table's start-edge x and let the template apply
  // `transform: translateX(-100%)` under RTL — the browser then
  // shifts the toolbar leftward by its natural width, ending with its
  // right edge at the table's right edge. Under LTR no transform is
  // needed; `left = tableLeft` aligns the toolbar's left edge with
  // the table's left edge naturally.
  const startX = isRtl ? Math.round(tableRight) : Math.round(tableLeft)

  return {
    left: startX,
    top: Math.round(top),
    anchor,
    isRtl,
  }
}

// --- Reactive plumbing ---------------------------------------------------

const visible = computed(() => {
  if (!props.enabled) return false
  if (slashActive.value) return false
  if (!insideCell.value) return false
  if (!tableInfo.value || !coords.value) return false
  return true
})

// Re-read state on every revision bump (i.e., every PM transaction).
watch(
  [() => props.revision, () => props.view],
  () => {
    const view = props.view
    if (!view) {
      tableInfo.value = null
      coords.value = null
      slashActive.value = false
      insideCell.value = false
      return
    }
    slashActive.value = readSlashActive(view)
    const cellNow = isInsideCell(view.state)
    insideCell.value = cellNow
    if (!cellNow) {
      tableInfo.value = null
      coords.value = null
      stateTick.value++
      return
    }
    const info = findEnclosingTable(view.state)
    tableInfo.value = info
    coords.value = info ? computePosition(view, info, props.dir) : null
    stateTick.value++
  },
  { immediate: true }
)

// `dir` change → recompute coords against the current table.
watch(
  () => props.dir,
  () => {
    if (!props.view || !tableInfo.value) return
    coords.value = computePosition(props.view, tableInfo.value, props.dir)
  }
)

// No `onBeforeUnmount` cleanup — the component is purely reactive
// (no global listeners, no timers, no rAF handles).

// --- Button definitions --------------------------------------------------
//
// Each entry is `(state, dispatch?) -> boolean`. The disabled state is
// computed by running the command with no `dispatch` — same pattern PM
// uses for its menu disabled checks.

const BUTTONS = [
  {
    id: 'add-row-before',
    label: 'صفّ أعلاه',
    aria: 'إضافة صفّ أعلى الصفّ الحالي',
    cmd: addRowBefore,
    group: 'row',
  },
  {
    id: 'add-row-after',
    label: 'صفّ أسفل',
    aria: 'إضافة صفّ أسفل الصفّ الحالي',
    cmd: addRowAfter,
    group: 'row',
  },
  { id: 'sep-1', sep: true },
  {
    id: 'add-column-before',
    label: 'عمود قبل',
    aria: 'إضافة عمود قبل العمود الحالي',
    cmd: addColumnBefore,
    group: 'column',
  },
  {
    id: 'add-column-after',
    label: 'عمود بعد',
    aria: 'إضافة عمود بعد العمود الحالي',
    cmd: addColumnAfter,
    group: 'column',
  },
  { id: 'sep-2', sep: true },
  {
    id: 'delete-row',
    label: 'حذف صفّ',
    aria: 'حذف الصفّ الحالي',
    cmd: deleteRow,
    group: 'delete-row',
  },
  {
    id: 'delete-column',
    label: 'حذف عمود',
    aria: 'حذف العمود الحالي',
    cmd: deleteColumn,
    group: 'delete-column',
  },
  { id: 'sep-3', sep: true },
  {
    id: 'delete-table',
    label: 'حذف الجدول',
    aria: 'حذف الجدول كاملاً',
    cmd: deleteTable,
    group: 'delete-table',
    danger: true,
  },
]

function isDisabled(button) {
  // `stateTick.value` is read here so Vue treats this computation as
  // dependent on every revision update. Without that touch the disabled
  // state would lag behind the cursor.
  void stateTick.value
  if (!button || button.sep) return false
  const view = props.view
  if (!view) return true
  try {
    return !button.cmd(view.state, null, view)
  } catch {
    return true
  }
}

function runButton(button) {
  if (!button || button.sep) return
  const view = props.view
  if (!view) return
  if (isDisabled(button)) return
  const ok = button.cmd(view.state, view.dispatch, view)
  if (ok) {
    try { view.focus() } catch { /* view gone */ }
  }
}

// Stop mousedown from bubbling so clicking the toolbar doesn't move
// the caret or deselect the cell — same pattern as BlockControls.
function onOverlayMouseDown(event) {
  event.stopPropagation()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="kurrasah-table-toolbar"
      role="toolbar"
      aria-label="إجراءات الجدول"
      :style="{
        left: coords.left + 'px',
        top: coords.top + 'px',
        transform: coords.isRtl ? 'translateX(-100%)' : 'translateX(0)',
      }"
      @mousedown="onOverlayMouseDown"
    >
      <template v-for="button in BUTTONS" :key="button.id">
        <span
          v-if="button.sep"
          class="kurrasah-table-toolbar-sep"
          aria-hidden="true"
        ></span>
        <button
          v-else
          type="button"
          class="kurrasah-table-toolbar-btn"
          :class="{ 'kurrasah-table-toolbar-btn-danger': button.danger }"
          :disabled="isDisabled(button)"
          :aria-label="button.aria"
          :title="button.aria"
          :data-button-id="button.id"
          @mousedown.prevent
          @click="runButton(button)"
        >
          {{ button.label }}
        </button>
      </template>
    </div>
  </Teleport>
</template>
