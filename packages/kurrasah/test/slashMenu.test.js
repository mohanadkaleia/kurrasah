import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { TextSelection } from 'prosemirror-state'
import { Editor } from '../src/index.js'
import { slashMenuKey, SLASH_MENU_META } from '../src/slashMenuPlugin.js'
import {
  DEFAULT_SLASH_ITEMS,
  filterSlashItems,
} from '../src/slashMenu.js'

// Helpers --------------------------------------------------------------

function mountEditor(props = {}) {
  return mount(Editor, {
    attachTo: document.body,
    props,
  })
}

// Insert text at the current selection, going through `handleTextInput` so
// input rules + plugin state `apply` pipelines fire the same way they would
// in the browser. Falls back to a raw insertText for chars that aren't
// consumed by `handleTextInput`.
function typeChar(view, char) {
  const { from, to } = view.state.selection
  const handled = view.someProp('handleTextInput', (f) =>
    f(view, from, to, char)
  )
  if (!handled) {
    view.dispatch(view.state.tr.insertText(char))
  }
}

function typeString(view, s) {
  for (const ch of s) typeChar(view, ch)
}

function getSlashState(view) {
  return slashMenuKey.getState(view.state)
}

// Tests ----------------------------------------------------------------

describe('slashMenu — items catalog', () => {
  it('exports 10 default items (paragraph, h1–h3, two lists, quote, code, image, table)', () => {
    expect(DEFAULT_SLASH_ITEMS.length).toBe(10)
    const ids = DEFAULT_SLASH_ITEMS.map((i) => i.id)
    expect(ids).toContain('paragraph')
    expect(ids).toContain('heading-1')
    expect(ids).toContain('heading-2')
    expect(ids).toContain('heading-3')
    expect(ids).toContain('bullet-list')
    expect(ids).toContain('ordered-list')
    expect(ids).toContain('blockquote')
    expect(ids).toContain('code-block')
    expect(ids).toContain('image')
    expect(ids).toContain('table')
  })

  it('every item ships label + description + aliases + inline icon markup', () => {
    for (const item of DEFAULT_SLASH_ITEMS) {
      expect(typeof item.label).toBe('string')
      expect(item.label.length).toBeGreaterThan(0)
      expect(typeof item.description).toBe('string')
      expect(Array.isArray(item.aliases)).toBe(true)
      expect(item.aliases.length).toBeGreaterThan(0)
      expect(typeof item.icon).toBe('string')
      // Icons are either inline SVG or an HTML span with dir="ltr" —
      // the latter is used for heading glyphs so digits don't bidi-
      // mirror under an RTL ancestor.
      expect(item.icon).toMatch(/^<(svg|span)[\s>]/)
      expect(typeof item.command).toBe('string')
    }
  })
})

describe('filterSlashItems', () => {
  it('empty query returns the full list', () => {
    expect(filterSlashItems(DEFAULT_SLASH_ITEMS, '')).toHaveLength(10)
    expect(filterSlashItems(DEFAULT_SLASH_ITEMS, '   ')).toHaveLength(10)
  })

  it('matches English aliases case-insensitively', () => {
    const matches = filterSlashItems(DEFAULT_SLASH_ITEMS, 'h1')
    expect(matches.length).toBe(1)
    expect(matches[0].id).toBe('heading-1')
  })

  it('matches Arabic aliases', () => {
    const matches = filterSlashItems(DEFAULT_SLASH_ITEMS, 'عنوان')
    // عنوان appears in all three heading labels/aliases.
    const ids = matches.map((m) => m.id)
    expect(ids).toContain('heading-1')
    expect(ids).toContain('heading-2')
    expect(ids).toContain('heading-3')
  })

  it('returns an empty array when no item matches', () => {
    const matches = filterSlashItems(DEFAULT_SLASH_ITEMS, 'zzzznonsense')
    expect(matches).toEqual([])
  })
})

describe('slashMenuPlugin — trigger recognition', () => {
  it('activates when `@` is typed at the start of an empty doc', async () => {
    const wrapper = mountEditor({ modelValue: '' })
    await nextTick()
    const view = wrapper.vm.view
    // Place the cursor inside the empty initial paragraph.
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1))
    )
    typeChar(view, '@')
    await nextTick()

    const state = getSlashState(view)
    expect(state.active).toBe(true)
    expect(state.query).toBe('')
    expect(state.source).toBe('trigger')
    expect(state.range).toBeDefined()
    expect(state.range.from).toBeLessThan(state.range.to)
    wrapper.unmount()
  })

  it('updates query as the user types after `@`', async () => {
    const wrapper = mountEditor({ modelValue: '' })
    await nextTick()
    const view = wrapper.vm.view
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1))
    )
    typeString(view, '@h1')
    await nextTick()

    const state = getSlashState(view)
    expect(state.active).toBe(true)
    expect(state.query).toBe('h1')

    // Simulate how the popover component filters the live query.
    const filtered = filterSlashItems(DEFAULT_SLASH_ITEMS, state.query)
    expect(filtered.length).toBe(1)
    expect(filtered[0].id).toBe('heading-1')
    wrapper.unmount()
  })

  it('does NOT activate for `@` in an email-like context', async () => {
    const wrapper = mountEditor({ modelValue: 'user' })
    await nextTick()
    const view = wrapper.vm.view
    // Position cursor at the end of 'user' (position 5 in a 1-indexed doc).
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, view.state.doc.content.size - 1)
      )
    )
    typeChar(view, '@')
    await nextTick()

    const state = getSlashState(view)
    expect(state.active).toBe(false)
    wrapper.unmount()
  })

  it('activates after a space (even mid-paragraph)', async () => {
    const wrapper = mountEditor({ modelValue: 'hello' })
    await nextTick()
    const view = wrapper.vm.view
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, view.state.doc.content.size - 1)
      )
    )
    typeString(view, ' @')
    await nextTick()
    const state = getSlashState(view)
    expect(state.active).toBe(true)
    expect(state.query).toBe('')
    wrapper.unmount()
  })

  it('does NOT activate inside a code block', async () => {
    const wrapper = mountEditor({ modelValue: '```\n\n```' })
    await nextTick()
    const view = wrapper.vm.view
    // Position inside the empty code block — the doc has one code_block
    // node as the first child. Cursor goes at blockStart + 0.
    const codeBlock = view.state.doc.firstChild
    expect(codeBlock.type.name).toBe('code_block')
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1))
    )
    typeChar(view, '@')
    await nextTick()
    const state = getSlashState(view)
    expect(state.active).toBe(false)
    wrapper.unmount()
  })

  it('deactivates when the user types a space after the query', async () => {
    const wrapper = mountEditor({ modelValue: '' })
    await nextTick()
    const view = wrapper.vm.view
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1))
    )
    typeString(view, '@h1')
    await nextTick()
    expect(getSlashState(view).active).toBe(true)
    typeChar(view, ' ')
    await nextTick()
    expect(getSlashState(view).active).toBe(false)
    wrapper.unmount()
  })
})

describe('slashMenuPlugin — meta actions', () => {
  it('OPEN_COMMAND_PALETTE activates with empty query and null range', async () => {
    const wrapper = mountEditor({ modelValue: 'hello' })
    await nextTick()
    const view = wrapper.vm.view
    view.dispatch(
      view.state.tr.setMeta(slashMenuKey, {
        action: SLASH_MENU_META.OPEN_COMMAND_PALETTE,
      })
    )
    await nextTick()

    const state = getSlashState(view)
    expect(state.active).toBe(true)
    expect(state.query).toBe('')
    expect(state.range).toBe(null)
    expect(state.source).toBe('command')
    wrapper.unmount()
  })

  it('CLOSE meta resets the state to inactive', async () => {
    const wrapper = mountEditor({ modelValue: '' })
    await nextTick()
    const view = wrapper.vm.view
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1))
    )
    typeChar(view, '@')
    await nextTick()
    expect(getSlashState(view).active).toBe(true)

    view.dispatch(
      view.state.tr.setMeta(slashMenuKey, { action: SLASH_MENU_META.CLOSE })
    )
    await nextTick()
    const state = getSlashState(view)
    expect(state.active).toBe(false)
    expect(state.range).toBe(null)
    // Escape leaves the typed `@` in the doc intact — we only reset
    // plugin state, we don't delete anything.
    expect(wrapper.vm.getMarkdown().includes('@')).toBe(true)
    wrapper.unmount()
  })
})

describe('slashMenuPlugin — applying an item', () => {
  it('trigger-path apply removes the `@query` range and runs the command', async () => {
    const wrapper = mountEditor({ modelValue: '' })
    await nextTick()
    const view = wrapper.vm.view
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1))
    )
    typeString(view, '@h1')
    await nextTick()
    const state = getSlashState(view)
    expect(state.active).toBe(true)

    // Simulate what SlashMenu.applyItem does: delete range, close meta, run
    // the command.
    const tr = view.state.tr
      .delete(state.range.from, state.range.to)
      .setMeta(slashMenuKey, { action: SLASH_MENU_META.CLOSE })
    view.dispatch(tr)
    await nextTick()

    wrapper.vm.execCommand('setHeading', 1)
    await nextTick()

    // The `@h1` trigger is gone, and the block is a heading-1.
    expect(view.state.doc.firstChild.type.name).toBe('heading')
    expect(view.state.doc.firstChild.attrs.level).toBe(1)
    expect(wrapper.vm.getMarkdown().includes('@')).toBe(false)
    expect(getSlashState(view).active).toBe(false)
    wrapper.unmount()
  })

  it('command-palette-path apply runs the command with no range deletion', async () => {
    const wrapper = mountEditor({ modelValue: 'existing text' })
    await nextTick()
    const view = wrapper.vm.view
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 2))
    )
    view.dispatch(
      view.state.tr.setMeta(slashMenuKey, {
        action: SLASH_MENU_META.OPEN_COMMAND_PALETTE,
      })
    )
    await nextTick()
    const state = getSlashState(view)
    expect(state.active).toBe(true)
    expect(state.range).toBe(null)

    // Close via meta (apply-like flow), then run the command — this mirrors
    // SlashMenu.applyItem for the command-palette branch.
    view.dispatch(
      view.state.tr.setMeta(slashMenuKey, { action: SLASH_MENU_META.CLOSE })
    )
    wrapper.vm.execCommand('toggleBulletList')
    await nextTick()

    // Original text still there, now wrapped in a bullet list.
    expect(wrapper.vm.getMarkdown()).toContain('existing text')
    expect(wrapper.vm.getMarkdown()).toMatch(/^\*\s/)
    wrapper.unmount()
  })
})

describe('slashMenuPlugin — slashEnabled: false', () => {
  it('never activates the trigger when disabled', async () => {
    const wrapper = mountEditor({ slashEnabled: false, modelValue: '' })
    await nextTick()
    const view = wrapper.vm.view
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1))
    )
    typeString(view, '@h1')
    await nextTick()
    const state = getSlashState(view)
    expect(state.active).toBe(false)
    expect(state.enabled).toBe(false)
    // The `@h1` text landed in the doc as plain prose.
    expect(wrapper.vm.getMarkdown()).toContain('@h1')
    wrapper.unmount()
  })

  it('ignores OPEN_COMMAND_PALETTE when disabled', async () => {
    const wrapper = mountEditor({ slashEnabled: false, modelValue: 'x' })
    await nextTick()
    const view = wrapper.vm.view
    view.dispatch(
      view.state.tr.setMeta(slashMenuKey, {
        action: SLASH_MENU_META.OPEN_COMMAND_PALETTE,
      })
    )
    await nextTick()
    const state = getSlashState(view)
    expect(state.active).toBe(false)
    wrapper.unmount()
  })
})

describe('slashMenuPlugin — configurable trigger', () => {
  it('respects a custom trigger character', async () => {
    const wrapper = mountEditor({ slashTrigger: '#', modelValue: '' })
    await nextTick()
    const view = wrapper.vm.view
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1))
    )
    // Typing `@` should NOT activate the menu — `@` isn't the trigger.
    typeChar(view, '@')
    await nextTick()
    expect(getSlashState(view).active).toBe(false)
    wrapper.unmount()
  })
})

describe('SlashMenu — keymap integration', () => {
  it('Mod-K with empty selection opens the command-palette path', async () => {
    const wrapper = mountEditor({ modelValue: 'text' })
    await nextTick()
    const view = wrapper.vm.view
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1))
    )
    // Synthesize a Mod-K keydown through PM's keymap.
    const IS_MAC =
      typeof navigator !== 'undefined' &&
      /Mac|iP(hone|[oa]d)/.test(navigator.platform)
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: !IS_MAC,
      metaKey: IS_MAC,
      bubbles: true,
      cancelable: true,
    })
    view.someProp('handleKeyDown', (handler) => handler(view, event))
    await nextTick()

    const state = getSlashState(view)
    expect(state.active).toBe(true)
    expect(state.source).toBe('command')
    expect(state.range).toBe(null)
    wrapper.unmount()
  })
})
