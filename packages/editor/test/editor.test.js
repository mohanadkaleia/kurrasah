import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { Editor } from '../src/index.js'

function mountEditor(props = {}) {
  return mount(Editor, {
    attachTo: document.body,
    props,
  })
}

describe('<Editor> — mount and DOM defaults', () => {
  it('mounts and exposes dir="rtl" by default', () => {
    const wrapper = mountEditor()
    expect(wrapper.get('.editor-root').attributes('dir')).toBe('rtl')
    wrapper.unmount()
  })

  it('respects dir prop', () => {
    const wrapper = mountEditor({ dir: 'ltr' })
    expect(wrapper.get('.editor-root').attributes('dir')).toBe('ltr')
    wrapper.unmount()
  })

  it('renders the minimal toolbar by default', () => {
    const wrapper = mountEditor()
    expect(wrapper.find('.editor-toolbar').exists()).toBe(true)
    wrapper.unmount()
  })

  it('hides the toolbar when toolbar=false', () => {
    const wrapper = mountEditor({ toolbar: false })
    expect(wrapper.find('.editor-toolbar').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('<Editor> — markdown in, markdown out', () => {
  it('reflects initial modelValue in the rendered DOM', async () => {
    const wrapper = mountEditor({ modelValue: '# Hello\n\nWorld.' })
    await nextTick()
    const mount = wrapper.get('.editor-mount')
    expect(mount.find('h1').text()).toBe('Hello')
    expect(mount.find('p').text()).toBe('World.')
    wrapper.unmount()
  })

  it('exposes getMarkdown() returning current markdown', async () => {
    const wrapper = mountEditor({ modelValue: '# Hello' })
    await nextTick()
    expect(wrapper.vm.getMarkdown()).toBe('# Hello')
    wrapper.unmount()
  })

  it('setMarkdown() replaces the document and DOM reflects it', async () => {
    const wrapper = mountEditor({ modelValue: 'original' })
    await nextTick()
    wrapper.vm.setMarkdown('## Replaced')
    await nextTick()
    expect(wrapper.get('.editor-mount').find('h2').text()).toBe('Replaced')
    expect(wrapper.vm.getMarkdown()).toBe('## Replaced')
    wrapper.unmount()
  })

  it('execCommand("toggleBold") toggles the bold mark', async () => {
    const wrapper = mountEditor({ modelValue: 'abc' })
    await nextTick()
    const view = wrapper.vm.view
    // Select the whole paragraph "abc" (positions 1..4).
    const { TextSelection } = await import('prosemirror-state')
    const state = view.state
    const tr = state.tr.setSelection(
      TextSelection.create(state.doc, 1, 4)
    )
    view.dispatch(tr)
    wrapper.vm.execCommand('toggleBold')
    await nextTick()
    expect(wrapper.vm.getMarkdown()).toContain('**abc**')
    wrapper.unmount()
  })

  it('emits update:modelValue when the doc changes', async () => {
    const wrapper = mountEditor({ modelValue: 'abc' })
    await nextTick()
    const view = wrapper.vm.view
    const { TextSelection } = await import('prosemirror-state')
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, 1, 4)
      )
    )
    wrapper.vm.execCommand('toggleBold')
    await nextTick()
    const emits = wrapper.emitted('update:modelValue')
    expect(emits).toBeDefined()
    expect(emits[emits.length - 1][0]).toContain('**abc**')
    wrapper.unmount()
  })

  it('preserves Arabic initial content in the DOM', async () => {
    const wrapper = mountEditor({ modelValue: 'مرحبا' })
    await nextTick()
    expect(wrapper.get('.editor-mount').find('p').text()).toBe('مرحبا')
    wrapper.unmount()
  })

  it('external modelValue changes reflect into the view', async () => {
    const wrapper = mountEditor({ modelValue: 'one' })
    await nextTick()
    await wrapper.setProps({ modelValue: '## two' })
    await nextTick()
    expect(wrapper.get('.editor-mount').find('h2').text()).toBe('two')
    wrapper.unmount()
  })
})

describe('<Editor> — readonly mode', () => {
  it('does not accept editing when readonly=true', async () => {
    const wrapper = mountEditor({
      modelValue: 'locked',
      readonly: true,
    })
    await nextTick()
    const view = wrapper.vm.view
    expect(view.editable).toBe(false)
    // Transactions dispatched programmatically still apply (this is PM's
    // design — `editable` only gates user input). So we assert editable()
    // returns false, which is what governs DOM-level typing.
    wrapper.unmount()
  })
})

describe('<Editor> — ready event', () => {
  it('emits ready with the EditorView on mount', async () => {
    const wrapper = mountEditor()
    await nextTick()
    const emits = wrapper.emitted('ready')
    expect(emits).toBeDefined()
    expect(emits.length).toBeGreaterThan(0)
    // The payload should be an object with a `dispatch` method.
    const view = emits[0][0]
    expect(typeof view.dispatch).toBe('function')
    wrapper.unmount()
  })
})

describe('<Editor> — placeholder visibility', () => {
  it('renders a decoration carrying the placeholder text on an empty doc', async () => {
    const wrapper = mountEditor({ placeholder: 'ابدأ الكتابة...' })
    await nextTick()
    // The placeholder plugin decorates the lone empty paragraph with
    // `class="editor-placeholder"` and `data-placeholder="<text>"`. CSS
    // then renders the text via `::before { content: attr(data-placeholder) }`.
    // Asserting the data attribute (rather than computed pseudo-content) is
    // the reliable jsdom-compatible signal.
    const placeholderNode = wrapper
      .find('.editor-mount [data-placeholder]')
    expect(placeholderNode.exists()).toBe(true)
    expect(placeholderNode.attributes('data-placeholder')).toBe(
      'ابدأ الكتابة...'
    )
    expect(placeholderNode.classes()).toContain('editor-placeholder')
    wrapper.unmount()
  })

  it('hides the placeholder once the doc has content', async () => {
    const wrapper = mountEditor({
      modelValue: 'hello',
      placeholder: 'ابدأ الكتابة...',
    })
    await nextTick()
    // The placeholder decoration only applies to an empty first paragraph,
    // so it should NOT be present when the user has typed something.
    const placeholderNode = wrapper.find('.editor-mount [data-placeholder]')
    expect(placeholderNode.exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not render a placeholder when the prop is empty', async () => {
    const wrapper = mountEditor({ placeholder: '' })
    await nextTick()
    const placeholderNode = wrapper.find('.editor-mount [data-placeholder]')
    expect(placeholderNode.exists()).toBe(false)
    wrapper.unmount()
  })
})
