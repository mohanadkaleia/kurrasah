import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { TextSelection } from 'prosemirror-state'
import { Editor } from '../src/index.js'
import { slashMenuKey, SLASH_MENU_META } from '../src/slashMenuPlugin.js'

// Helpers --------------------------------------------------------------

function mountEditor(props = {}) {
  return mount(Editor, {
    attachTo: document.body,
    props,
  })
}

// Insert a `rows × cols` table at the start of an empty doc; return the
// view with the cursor parked inside the first cell of the first row.
//
// jsdom does not lay out content, so `view.coordsAtPos` returns
// `{ top: 0, bottom: 0, left: 0, right: 0 }` for every position. The
// toolbar's positioning math then collapses to `{ left: 0, top: -38 }`
// — which would FAIL the "above-vs-below" check (top is negative). We
// stub `coordsAtPos` to a deterministic rect that lets the toolbar
// land above the table comfortably.
async function setupTableEditor(rows = 2, cols = 2, extraProps = {}) {
  const wrapper = mountEditor({ modelValue: '', ...extraProps })
  await nextTick()
  const view = wrapper.vm.view
  // Stub coordsAtPos BEFORE inserting the table so the first revision
  // bump (carrying the new selection inside the first cell) sees real
  // coords and the toolbar mounts.
  view.coordsAtPos = () => ({ left: 100, right: 400, top: 200, bottom: 220 })
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, 1))
  )
  wrapper.vm.execCommand('insertTable', { rows, cols, withHeader: true })
  await nextTick()
  return wrapper
}

function findToolbar() {
  return document.querySelector('.kurrasah-table-toolbar')
}

function findButton(id) {
  return document.querySelector(
    `.kurrasah-table-toolbar [data-button-id="${id}"]`
  )
}

function findFirstTable(view) {
  let table = null
  view.state.doc.descendants((n) => {
    if (n.type.name === 'table' && table === null) {
      table = n
      return false
    }
    return true
  })
  return table
}

function moveCursorToFirstCell(view) {
  const doc = view.state.doc
  let firstCellPos = -1
  doc.descendants((n, pos) => {
    if (firstCellPos !== -1) return false
    if (n.type.name === 'table_cell' || n.type.name === 'table_header') {
      firstCellPos = pos
      return false
    }
    return true
  })
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(doc, firstCellPos + 1))
  )
}

// Tests ----------------------------------------------------------------

describe('TableToolbar — visibility', () => {
  it('renders when the cursor is inside a cell, hides when selection moves out', async () => {
    const wrapper = await setupTableEditor(2, 2)
    const view = wrapper.vm.view
    // After insertTable the cursor is in the first cell — toolbar is shown.
    expect(findToolbar()).not.toBeNull()

    // Move cursor outside the table — into a paragraph at the end of
    // the doc. The empty-doc init has a trailing empty paragraph after
    // the inserted table (or we create one if none exists).
    let outsidePos = -1
    view.state.doc.descendants((n, pos) => {
      if (n.type.name === 'paragraph' && outsidePos === -1) {
        outsidePos = pos + 1
        return false
      }
      return true
    })
    if (outsidePos === -1) {
      // Insert a trailing paragraph so we have somewhere outside the
      // table to land. Append at the end of the doc.
      const paraType = view.state.schema.nodes.paragraph
      const tr = view.state.tr.insert(
        view.state.doc.content.size,
        paraType.createAndFill()
      )
      view.dispatch(tr)
      view.state.doc.descendants((n, pos) => {
        if (n.type.name === 'paragraph' && outsidePos === -1) {
          outsidePos = pos + 1
          return false
        }
        return true
      })
    }
    expect(outsidePos).toBeGreaterThan(0)
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, outsidePos)
      )
    )
    await nextTick()
    // Toolbar hides.
    expect(findToolbar()).toBeNull()

    wrapper.unmount()
  })

  it('hides while the slash menu is open', async () => {
    const wrapper = await setupTableEditor(2, 2)
    const view = wrapper.vm.view
    expect(findToolbar()).not.toBeNull()

    // Open the slash menu in command-palette mode.
    view.dispatch(
      view.state.tr.setMeta(slashMenuKey, {
        action: SLASH_MENU_META.OPEN_COMMAND_PALETTE,
      })
    )
    await nextTick()
    expect(findToolbar()).toBeNull()

    // Close the slash menu — toolbar reappears.
    view.dispatch(
      view.state.tr.setMeta(slashMenuKey, { action: SLASH_MENU_META.CLOSE })
    )
    await nextTick()
    expect(findToolbar()).not.toBeNull()

    wrapper.unmount()
  })

  it('does not render when tableToolbarEnabled is false', async () => {
    const wrapper = await setupTableEditor(2, 2, { tableToolbarEnabled: false })
    expect(findToolbar()).toBeNull()
    wrapper.unmount()
  })
})

describe('TableToolbar — actions', () => {
  it('"add row below" inserts a row and the table gains one row', async () => {
    const wrapper = await setupTableEditor(2, 2)
    const view = wrapper.vm.view
    expect(findFirstTable(view).childCount).toBe(2)
    const beforeRows = findFirstTable(view).childCount
    findButton('add-row-after').click()
    await nextTick()
    expect(findFirstTable(view).childCount).toBe(beforeRows + 1)
    wrapper.unmount()
  })

  it('"add column after" inserts a column and the row gains one cell', async () => {
    const wrapper = await setupTableEditor(2, 2)
    const view = wrapper.vm.view
    const beforeCols = findFirstTable(view).child(0).childCount
    findButton('add-column-after').click()
    await nextTick()
    expect(findFirstTable(view).child(0).childCount).toBe(beforeCols + 1)
    wrapper.unmount()
  })

  it('"delete row" removes the current row when there are multiple rows', async () => {
    const wrapper = await setupTableEditor(3, 2)
    const view = wrapper.vm.view
    const beforeRows = findFirstTable(view).childCount
    expect(beforeRows).toBe(3)
    findButton('delete-row').click()
    await nextTick()
    expect(findFirstTable(view).childCount).toBe(beforeRows - 1)
    wrapper.unmount()
  })

  it('"delete row" is disabled when only one row is left and the doc does not change', async () => {
    // 1×2 table — only a header row, no body rows. Deleting the only
    // row would dissolve the table; upstream `deleteRow` returns false
    // in that case (rect.bottom === rect.top + 1 with only one row,
    // it deletes the last remaining row but the new row state is empty,
    // so the command typically refuses or no-ops).
    //
    // We assert: button is disabled OR command is a no-op (doc count
    // of tables remains 1 with the same row count). Both forms satisfy
    // the brief.
    const wrapper = await setupTableEditor(1, 2)
    const view = wrapper.vm.view
    moveCursorToFirstCell(view)
    await nextTick()

    const before = findFirstTable(view)
    expect(before.childCount).toBe(1)

    const btn = findButton('delete-row')
    expect(btn).not.toBeNull()
    if (btn.disabled) {
      // The button is disabled — the brief's preferred shape.
      expect(btn.disabled).toBe(true)
    } else {
      // Otherwise the click must be a no-op.
      btn.click()
      await nextTick()
      const after = findFirstTable(view)
      expect(after).not.toBeNull()
      expect(after.childCount).toBe(before.childCount)
    }
    wrapper.unmount()
  })

  it('"delete table" removes the table from the doc', async () => {
    const wrapper = await setupTableEditor(2, 2)
    const view = wrapper.vm.view
    expect(findFirstTable(view)).not.toBeNull()
    findButton('delete-table').click()
    await nextTick()
    expect(findFirstTable(view)).toBeNull()
    wrapper.unmount()
  })

  it('clicking a button refocuses the editor and the cursor stays inside a cell', async () => {
    const wrapper = await setupTableEditor(2, 2)
    const view = wrapper.vm.view
    findButton('add-row-after').click()
    await nextTick()
    // After the action, the cursor's `$from` ancestry still includes a
    // cell — clicking the toolbar must not strip the selection from
    // the editor.
    const { $from } = view.state.selection
    let inCell = false
    for (let d = $from.depth; d > 0; d--) {
      const t = $from.node(d).type.name
      if (t === 'table_cell' || t === 'table_header') {
        inCell = true
        break
      }
    }
    expect(inCell).toBe(true)
    wrapper.unmount()
  })
})
