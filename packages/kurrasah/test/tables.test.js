import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { TextSelection } from 'prosemirror-state'
import { schema } from '../src/schema.js'
import { parseMarkdown, serializeMarkdown } from '../src/markdown.js'
import { Editor } from '../src/index.js'
import { DEFAULT_SLASH_ITEMS, filterSlashItems } from '../src/slashMenu.js'

// Helpers --------------------------------------------------------------

function roundtrip(md) {
  return serializeMarkdown(parseMarkdown(md))
}

function mountEditor(props = {}) {
  return mount(Editor, {
    attachTo: document.body,
    props,
  })
}

// Fire a ProseMirror keydown through the registered handlers. Mirrors
// `fireKey` in plugins.test.js — duplicated here so the file stays
// self-contained.
const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iP(hone|[oa]d)/.test(navigator.platform)

function fireKey(view, key, { shift = false, mod = false } = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    shiftKey: shift,
    ctrlKey: mod && !IS_MAC,
    metaKey: mod && IS_MAC,
    bubbles: true,
    cancelable: true,
  })
  view.someProp('handleKeyDown', (handler) => handler(view, event))
  return event.defaultPrevented
}

// Tests ----------------------------------------------------------------

describe('schema — table nodes', () => {
  const tableNodeNames = ['table', 'table_row', 'table_header', 'table_cell']

  it.each(tableNodeNames)('declares node %s', (name) => {
    expect(schema.nodes[name]).toBeDefined()
  })

  it('`table` belongs to the block group so `doc` accepts it', () => {
    // `doc` is `block+`. tableNodes({ tableGroup: 'block' }) puts `table`
    // into that group — verified via NodeType.isInGroup at runtime.
    const tableType = schema.nodes.table
    expect(tableType.isInGroup('block')).toBe(true)
  })

  it('`table_cell` content is inline-only (lists and nested tables excluded)', () => {
    // The cellContent expression passed to `tableNodes` is `inline*`.
    // ContentMatch doesn't expose a raw pattern string, so we verify the
    // restriction indirectly:
    //   - An empty cell is valid (`*` allows zero children).
    //   - A cell with a single text node is valid.
    //   - Block-level content (e.g. a bullet_list) is rejected by
    //     `validContent`. NB: `NodeType.create` is permissive and will
    //     happily construct a "malformed" cell; the canonical validation
    //     entry point for content shape is `validContent`.
    const cellType = schema.nodes.table_cell
    expect(cellType.validContent(cellType.createAndFill().content)).toBe(true)
    const withText = cellType.create(null, schema.text('hi'))
    expect(withText.textContent).toBe('hi')
    const bullet = schema.nodes.bullet_list.createAndFill()
    if (bullet) {
      // A fragment containing a block-level bullet_list is not valid
      // content for a cell whose content expression is `inline*`.
      const fragment = bullet.type.schema.nodes.doc.create(null, bullet).content
      expect(cellType.validContent(fragment)).toBe(false)
    }
  })
})

describe('markdown — GFM tables', () => {
  it('parses a simple GFM table into a table node', () => {
    const md = [
      '| h1 | h2 |',
      '|----|----|',
      '| a  | b  |',
    ].join('\n')
    const doc = parseMarkdown(md)
    const table = doc.firstChild
    expect(table.type.name).toBe('table')
    // Two rows: header + body.
    expect(table.childCount).toBe(2)
    const [headerRow, bodyRow] = [table.child(0), table.child(1)]
    expect(headerRow.type.name).toBe('table_row')
    expect(headerRow.firstChild.type.name).toBe('table_header')
    expect(bodyRow.firstChild.type.name).toBe('table_cell')
    // Two columns per row.
    expect(headerRow.childCount).toBe(2)
    expect(bodyRow.childCount).toBe(2)
    // Cell text content round-trips through the paragraph wrapper.
    expect(headerRow.child(0).textContent).toBe('h1')
    expect(bodyRow.child(1).textContent).toBe('b')
  })

  it('roundtrips a 2x2 table', () => {
    const md = [
      '| h1 | h2 |',
      '|----|----|',
      '| a  | b  |',
    ].join('\n')
    // Serializer normalizes column-separator width to `----` and drops
    // padding inside cells, so assert on structure rather than bytes.
    const serialized = roundtrip(md)
    const reparsed = parseMarkdown(serialized)
    const table = reparsed.firstChild
    expect(table.type.name).toBe('table')
    expect(table.childCount).toBe(2)
    expect(table.child(0).child(0).textContent).toBe('h1')
    expect(table.child(0).child(1).textContent).toBe('h2')
    expect(table.child(1).child(0).textContent).toBe('a')
    expect(table.child(1).child(1).textContent).toBe('b')
  })

  it('preserves inline marks inside cells', () => {
    const md = [
      '| col1 | col2 |',
      '|------|------|',
      '| **bold** *italic* | `code` |',
    ].join('\n')
    const serialized = roundtrip(md)
    // The serialized output is a valid GFM table again.
    expect(serialized).toMatch(/\|[^\n]*\*\*bold\*\*[^\n]*\|/)
    expect(serialized).toMatch(/\*italic\*/)
    expect(serialized).toMatch(/`code`/)
    // Reparse to confirm the marks land on the right text runs. Cells
    // hold inline content directly (no paragraph wrapper).
    const reparsed = parseMarkdown(serialized)
    const firstBodyCell = reparsed.firstChild.child(1).child(0)
    const textNodes = []
    firstBodyCell.descendants((n) => {
      if (n.isText) textNodes.push(n)
    })
    const boldText = textNodes.find((t) =>
      t.marks.some((m) => m.type.name === 'strong')
    )
    const italicText = textNodes.find((t) =>
      t.marks.some((m) => m.type.name === 'em')
    )
    expect(boldText?.text).toBe('bold')
    expect(italicText?.text).toBe('italic')
  })

  it('escapes `|` inside cells on serialize and restores it on reparse', () => {
    // Author a table with a literal pipe in a cell via the ProseMirror
    // side: build the doc programmatically, then serialize. Starting
    // from markdown would require a pre-escaped pipe — which is exactly
    // what we want to confirm the serializer produces.
    const tableType = schema.nodes.table
    const rowType = schema.nodes.table_row
    const headerType = schema.nodes.table_header
    const cellType = schema.nodes.table_cell
    // Cells hold inline content directly (no paragraph wrapper).
    const headerRow = rowType.create(null, [
      headerType.create(null, schema.text('h')),
    ])
    const bodyRow = rowType.create(null, [
      cellType.create(null, schema.text('a | b')),
    ])
    const table = tableType.create(null, [headerRow, bodyRow])
    const doc = schema.nodes.doc.create(null, [table])
    const serialized = serializeMarkdown(doc)
    // The pipe in the cell must be escaped as `\|`.
    expect(serialized).toContain('a \\| b')
    // And it must roundtrip — markdown-it's GFM table rule reads `\|` as
    // a literal pipe in the cell.
    const reparsed = parseMarkdown(serialized)
    expect(reparsed.firstChild.child(1).child(0).textContent).toBe('a | b')
  })

  it('synthesizes an empty header row when the first row is body cells (headerless table)', () => {
    // Build a table whose first row is `table_cell`s, not `table_header`s.
    // This is a legal ProseMirror tree but invalid GFM — the serializer
    // must add an empty header row so the output parses back cleanly.
    const tableType = schema.nodes.table
    const rowType = schema.nodes.table_row
    const cellType = schema.nodes.table_cell
    // Inline cell content — no paragraph wrapper under `cellContent: 'inline*'`.
    const row1 = rowType.create(null, [
      cellType.create(null, schema.text('a')),
      cellType.create(null, schema.text('b')),
    ])
    const row2 = rowType.create(null, [
      cellType.create(null, schema.text('c')),
      cellType.create(null, schema.text('d')),
    ])
    const table = tableType.create(null, [row1, row2])
    const doc = schema.nodes.doc.create(null, [table])
    const serialized = serializeMarkdown(doc)
    // First line is an empty header row.
    const lines = serialized.trim().split('\n')
    expect(lines[0]).toMatch(/^\|\s*\|\s*\|\s*$/)
    // Second line is the alignment separator.
    expect(lines[1]).toMatch(/^\|-+\|-+\|\s*$/)
    // Lines 3+ are the body rows.
    expect(lines[2]).toContain('a')
    expect(lines[2]).toContain('b')
    expect(lines[3]).toContain('c')
    expect(lines[3]).toContain('d')
    // Roundtrip reparses as a table.
    const reparsed = parseMarkdown(serialized)
    expect(reparsed.firstChild.type.name).toBe('table')
  })
})

describe('insertTable — command', () => {
  it('inserts a 3x3 table via execCommand and lands the cursor in the first cell', async () => {
    const wrapper = mountEditor({ modelValue: '' })
    await nextTick()
    const view = wrapper.vm.view
    // Place the cursor inside the empty initial paragraph.
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1))
    )
    const ok = wrapper.vm.execCommand('insertTable', {
      rows: 3,
      cols: 3,
      withHeader: true,
    })
    expect(ok).toBe(true)
    await nextTick()

    // The doc now contains a table as one of its children.
    const tables = []
    view.state.doc.descendants((n) => {
      if (n.type.name === 'table') tables.push(n)
    })
    expect(tables.length).toBe(1)
    const table = tables[0]
    expect(table.childCount).toBe(3)
    // First row is header, remaining rows are body.
    expect(table.child(0).firstChild.type.name).toBe('table_header')
    expect(table.child(1).firstChild.type.name).toBe('table_cell')
    // Each row has 3 cells.
    for (let r = 0; r < 3; r++) {
      expect(table.child(r).childCount).toBe(3)
    }
    // Cursor is a text selection inside a cell — the parent up the tree
    // is a cell (header or body).
    const { $from } = view.state.selection
    let inCell = false
    for (let d = $from.depth; d > 0; d--) {
      const n = $from.node(d)
      if (n.type.name === 'table_header' || n.type.name === 'table_cell') {
        inCell = true
        break
      }
    }
    expect(inCell).toBe(true)
    wrapper.unmount()
  })
})

describe('slashMenu — table item', () => {
  it('catalog includes a Table item with the expected shape', () => {
    const item = DEFAULT_SLASH_ITEMS.find((i) => i.id === 'table')
    expect(item).toBeDefined()
    expect(item.label).toBe('جدول')
    expect(item.command).toBe('insertTable')
    expect(item.args).toEqual([{ rows: 3, cols: 3, withHeader: true }])
    expect(item.aliases).toContain('table')
    expect(item.aliases).toContain('جدول')
  })

  it('filterSlashItems matches the Table item by English and Arabic aliases', () => {
    const matchesEnglish = filterSlashItems(DEFAULT_SLASH_ITEMS, 'table')
    expect(matchesEnglish.map((m) => m.id)).toContain('table')
    const matchesArabic = filterSlashItems(DEFAULT_SLASH_ITEMS, 'جدول')
    expect(matchesArabic.map((m) => m.id)).toContain('table')
  })
})

describe('plugins — Tab inside a cell', () => {
  it('Tab advances the cursor to the next cell; Shift-Tab goes back', async () => {
    const wrapper = mountEditor({ modelValue: '' })
    await nextTick()
    const view = wrapper.vm.view
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1))
    )
    wrapper.vm.execCommand('insertTable', {
      rows: 2,
      cols: 3,
      withHeader: true,
    })
    await nextTick()

    // After insertTable, the cursor is in the first cell. Fire Tab —
    // the selection should move to the second cell.
    const firstCellPos = view.state.selection.from
    fireKey(view, 'Tab')
    await nextTick()
    const afterTabPos = view.state.selection.from
    // The cursor moved forward (next cell is at a higher document pos).
    expect(afterTabPos).toBeGreaterThan(firstCellPos)

    // Shift-Tab goes back to the first cell.
    fireKey(view, 'Tab', { shift: true })
    await nextTick()
    const afterShiftTabPos = view.state.selection.from
    expect(afterShiftTabPos).toBeLessThan(afterTabPos)

    wrapper.unmount()
  })
})
