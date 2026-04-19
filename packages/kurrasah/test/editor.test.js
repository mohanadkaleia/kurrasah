import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

  it('updates the placeholder decoration in place when the prop changes (no rebuild)', async () => {
    const wrapper = mountEditor({ placeholder: 'first' })
    await nextTick()
    const viewBefore = wrapper.vm.view
    expect(
      wrapper.find('.editor-mount [data-placeholder]').attributes(
        'data-placeholder'
      )
    ).toBe('first')

    await wrapper.setProps({ placeholder: 'second' })
    await nextTick()

    // Same EditorView instance — the view was NOT rebuilt.
    expect(wrapper.vm.view).toBe(viewBefore)
    expect(
      wrapper.find('.editor-mount [data-placeholder]').attributes(
        'data-placeholder'
      )
    ).toBe('second')
    wrapper.unmount()
  })

  it('preserves undo history across a placeholder prop change', async () => {
    const wrapper = mountEditor({ placeholder: 'one', modelValue: '' })
    await nextTick()
    const view = wrapper.vm.view
    const { TextSelection } = await import('prosemirror-state')

    // Put the cursor at position 1 (inside the empty paragraph), type
    // characters via a dispatch so history records them.
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, 1)
      )
    )
    view.dispatch(view.state.tr.insertText('abc'))
    await nextTick()
    expect(wrapper.vm.getMarkdown()).toBe('abc')

    // Change the placeholder. Under the old implementation this would
    // rebuild the view and drop the history stack; now it dispatches a
    // meta tr and leaves history intact.
    await wrapper.setProps({ placeholder: 'two' })
    await nextTick()
    // Same view, so undo should still be able to revert `abc`.
    expect(wrapper.vm.view).toBe(view)

    wrapper.vm.execCommand('undo')
    await nextTick()
    expect(wrapper.vm.getMarkdown()).toBe('')
    wrapper.unmount()
  })
})

describe('<Editor> — ready re-emit on rebuild', () => {
  it('emits ready again when `images` prop toggles (view rebuild)', async () => {
    const wrapper = mountEditor({ images: true })
    await nextTick()
    const initialEmits = wrapper.emitted('ready')
    expect(initialEmits.length).toBe(1)
    const firstView = initialEmits[0][0]

    await wrapper.setProps({ images: false })
    await nextTick()

    const nextEmits = wrapper.emitted('ready')
    expect(nextEmits.length).toBe(2)
    const secondView = nextEmits[1][0]
    expect(secondView).not.toBe(firstView)
    // And the currently-live view matches the latest emit.
    expect(wrapper.vm.view).toBe(secondView)
    wrapper.unmount()
  })

  it('emits ready again when `links` prop toggles (view rebuild)', async () => {
    const wrapper = mountEditor({ links: true })
    await nextTick()
    const initialEmits = wrapper.emitted('ready')
    expect(initialEmits.length).toBe(1)

    await wrapper.setProps({ links: false })
    await nextTick()

    const nextEmits = wrapper.emitted('ready')
    expect(nextEmits.length).toBe(2)
    expect(nextEmits[1][0]).not.toBe(initialEmits[0][0])
    wrapper.unmount()
  })

  it('does NOT emit ready again when `placeholder` prop changes', async () => {
    const wrapper = mountEditor({ placeholder: 'a' })
    await nextTick()
    const initialCount = wrapper.emitted('ready').length

    await wrapper.setProps({ placeholder: 'b' })
    await nextTick()

    expect(wrapper.emitted('ready').length).toBe(initialCount)
    wrapper.unmount()
  })
})

describe('<Editor> — image renders loading="lazy"', () => {
  it('renders `loading="lazy"` on the image node DOM', async () => {
    const wrapper = mountEditor({
      modelValue: '![alt](https://example.com/x.png)',
    })
    await nextTick()
    const img = wrapper.find('.editor-mount img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('loading')).toBe('lazy')
    wrapper.unmount()
  })
})

describe('<Editor> — onRequestLink callback', () => {
  it('applies the link when callback returns {href}', async () => {
    const onRequestLink = vi.fn(async () => ({ href: 'https://example.com' }))
    const wrapper = mountEditor({
      modelValue: 'click',
      onRequestLink,
    })
    await nextTick()

    // Select all text "click" (positions 1..6).
    const view = wrapper.vm.view
    const { TextSelection } = await import('prosemirror-state')
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6))
    )

    wrapper.vm.execCommand('toggleLink')
    // Callback is async — flush the microtask queue once.
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    expect(onRequestLink).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.getMarkdown()).toContain(
      '[click](https://example.com)'
    )
    wrapper.unmount()
  })

  it('does not apply a link when callback returns null', async () => {
    const onRequestLink = vi.fn(async () => null)
    const wrapper = mountEditor({
      modelValue: 'click',
      onRequestLink,
    })
    await nextTick()

    const view = wrapper.vm.view
    const { TextSelection } = await import('prosemirror-state')
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6))
    )

    wrapper.vm.execCommand('toggleLink')
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    expect(onRequestLink).toHaveBeenCalledTimes(1)
    // No link mark in the serialized markdown.
    expect(wrapper.vm.getMarkdown()).toBe('click')
    wrapper.unmount()
  })

  it('rejects an invalid href returned by the callback', async () => {
    const onRequestLink = vi.fn(async () => ({ href: 'javascript:alert(1)' }))
    const wrapper = mountEditor({
      modelValue: 'click',
      onRequestLink,
    })
    await nextTick()

    const view = wrapper.vm.view
    const { TextSelection } = await import('prosemirror-state')
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6))
    )

    wrapper.vm.execCommand('toggleLink')
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    expect(wrapper.vm.getMarkdown()).toBe('click')
    wrapper.unmount()
  })

  it('falls back to window.prompt when no callback is provided', async () => {
    const promptSpy = vi
      .spyOn(window, 'prompt')
      .mockReturnValue('https://fallback.example')
    try {
      const wrapper = mountEditor({ modelValue: 'click' })
      await nextTick()

      const view = wrapper.vm.view
      const { TextSelection } = await import('prosemirror-state')
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6))
      )

      wrapper.vm.execCommand('toggleLink')
      await nextTick()

      // Neutral English string — no Arabic in the package default.
      expect(promptSpy).toHaveBeenCalledWith('Link URL')
      expect(wrapper.vm.getMarkdown()).toContain(
        '[click](https://fallback.example)'
      )
      wrapper.unmount()
    } finally {
      promptSpy.mockRestore()
    }
  })
})

describe('<Editor> — onRequestImage callback', () => {
  it('inserts the image when callback returns {src, alt}', async () => {
    const onRequestImage = vi.fn(async () => ({
      src: 'https://example.com/pic.png',
      alt: 'a picture',
    }))
    const wrapper = mountEditor({ onRequestImage })
    await nextTick()

    wrapper.vm.execCommand('insertImage')
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    expect(onRequestImage).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.getMarkdown()).toContain(
      '![a picture](https://example.com/pic.png)'
    )
    wrapper.unmount()
  })

  it('does nothing when the image callback returns null', async () => {
    const onRequestImage = vi.fn(async () => null)
    const wrapper = mountEditor({ onRequestImage })
    await nextTick()

    wrapper.vm.execCommand('insertImage')
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    expect(onRequestImage).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.editor-mount img').exists()).toBe(false)
    wrapper.unmount()
  })

  it('falls back to window.prompt for URL + alt when no callback is provided', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockImplementation((msg) => {
      if (msg === 'Image URL') return 'https://example.com/fallback.png'
      if (msg === 'Alt text (optional)') return 'fallback'
      return null
    })
    try {
      const wrapper = mountEditor()
      await nextTick()

      wrapper.vm.execCommand('insertImage')
      await nextTick()

      expect(promptSpy).toHaveBeenCalledWith('Image URL')
      expect(promptSpy).toHaveBeenCalledWith('Alt text (optional)')
      expect(wrapper.vm.getMarkdown()).toContain(
        '![fallback](https://example.com/fallback.png)'
      )
      wrapper.unmount()
    } finally {
      promptSpy.mockRestore()
    }
  })
})

describe('<Editor> — link clicks', () => {
  let openSpy
  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
  })
  afterEach(() => {
    openSpy.mockRestore()
  })

  it('Cmd+click on a link opens it in a new tab', async () => {
    const wrapper = mountEditor({
      modelValue: '[site](https://example.com)',
    })
    await nextTick()
    const anchor = wrapper.find('.editor-content a')
    expect(anchor.exists()).toBe(true)
    await anchor.trigger('click', { metaKey: true })
    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com',
      '_blank',
      'noopener,noreferrer'
    )
    wrapper.unmount()
  })

  it('plain click on a link does NOT navigate in edit mode', async () => {
    const wrapper = mountEditor({
      modelValue: '[site](https://example.com)',
    })
    await nextTick()
    const anchor = wrapper.find('.editor-content a')
    await anchor.trigger('click')
    expect(openSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('plain click on a link DOES navigate in readonly mode', async () => {
    const wrapper = mountEditor({
      modelValue: '[site](https://example.com)',
      readonly: true,
    })
    await nextTick()
    const anchor = wrapper.find('.editor-content a')
    await anchor.trigger('click')
    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com',
      '_blank',
      'noopener,noreferrer'
    )
    wrapper.unmount()
  })
})
