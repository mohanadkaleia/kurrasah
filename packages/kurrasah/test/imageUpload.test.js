import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { Editor } from '../src/index.js'

// Helpers --------------------------------------------------------------

function mountEditor(props = {}) {
  return mount(Editor, {
    attachTo: document.body,
    props,
  })
}

// jsdom's `DataTransfer` / `ClipboardEvent` are partial — `ClipboardEvent`
// in particular ignores any `clipboardData` passed in init, and
// `DataTransferItemList` cannot be constructed directly. We synthesize the
// minimal subset the editor's drop / paste handlers actually read:
//   - `files` — array-like of File objects
//   - `items` — array-like of `{kind, type, getAsFile()}` entries
//   - `types` — present so `eventHasImageFiles` could short-circuit if we
//     ever add a fast-path check on it (matches real browsers, which set
//     `['Files']` when files are attached).
function mockDataTransfer(files) {
  return {
    files,
    items: files.map((f) => ({
      kind: 'file',
      type: f.type,
      getAsFile: () => f,
    })),
    types: files.length ? ['Files'] : [],
    dropEffect: 'none',
    // ProseMirror's drop handler calls `getData('text/plain')` and
    // `getData('text/html')` even when files are present (its bubble-phase
    // listener fires before our handler in jsdom). Real browsers always
    // expose the method on `DataTransfer`; the jsdom mock has to too or PM
    // throws and the test surfaces a phantom uncaught exception.
    getData: () => '',
  }
}

// Synthesize a `DragEvent`-shaped event. jsdom doesn't expose a real
// `DragEvent` constructor, so we build a generic Event and attach the
// fields ProseMirror's `posAtCoords` and our handlers read.
function makeDropEvent({ files, clientX = 0, clientY = 0 }) {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: mockDataTransfer(files),
    writable: false,
  })
  Object.defineProperty(event, 'clientX', { value: clientX })
  Object.defineProperty(event, 'clientY', { value: clientY })
  return event
}

function makePasteEvent({ files }) {
  // `ClipboardEvent` in jsdom does NOT honor `clipboardData` from init, so
  // we build the event then assign the field explicitly.
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: mockDataTransfer(files),
    writable: false,
  })
  return event
}

function makeImageFile(name = 'pic.png', type = 'image/png') {
  // jsdom's `File` exists; pass empty content — the handler only inspects
  // `type` and `name`, never reads bytes.
  return new File([new Uint8Array([0])], name, { type })
}

// Stub `view.posAtCoords` so drop tests have a deterministic resolution.
// jsdom doesn't lay out text, so the real `posAtCoords` returns null and
// the handler would fall back to the current selection — which is fine
// for "happens at all" assertions but makes "lands at coords X" assertions
// flaky. Stubbing keeps the cause of the assertion the handler under test,
// not jsdom's text layout.
function stubPosAtCoords(view, pos) {
  view.posAtCoords = () => ({ pos, inside: pos - 1 })
}

// Flush a chain of awaited callbacks. Each step is a `then(async () => ...)`,
// so we need a few microtask flushes to let everything land.
async function flushAsync(times = 4) {
  for (let i = 0; i < times; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve()
  }
  await nextTick()
}

// Tests ----------------------------------------------------------------

describe('<Editor> — onUploadImage drop path', () => {
  it('calls the callback with (file, {source: "drop"}) and inserts the returned image', async () => {
    const onUploadImage = vi.fn(async (file) => ({
      src: 'https://example.com/uploaded.png',
      alt: file.name,
    }))
    const wrapper = mountEditor({
      modelValue: 'hello',
      onUploadImage,
    })
    await nextTick()
    const view = wrapper.vm.view
    stubPosAtCoords(view, view.state.doc.content.size - 1)

    const file = makeImageFile('drop.png')
    view.dom.dispatchEvent(makeDropEvent({ files: [file], clientX: 5, clientY: 5 }))
    await flushAsync()

    expect(onUploadImage).toHaveBeenCalledTimes(1)
    expect(onUploadImage).toHaveBeenCalledWith(file, { source: 'drop' })
    expect(wrapper.find('.editor-mount img[loading]').exists()).toBe(true)
    expect(wrapper.find('.editor-mount img[loading]').attributes('src')).toBe(
      'https://example.com/uploaded.png'
    )
    expect(wrapper.vm.getMarkdown()).toContain(
      '![drop.png](https://example.com/uploaded.png)'
    )
    wrapper.unmount()
  })
})

describe('<Editor> — onUploadImage paste path', () => {
  it('calls the callback with (file, {source: "paste"}) and inserts at cursor', async () => {
    const onUploadImage = vi.fn(async () => ({
      src: 'https://example.com/pasted.png',
      alt: 'pasted',
    }))
    const wrapper = mountEditor({
      modelValue: 'hello',
      onUploadImage,
    })
    await nextTick()
    const view = wrapper.vm.view

    const file = makeImageFile('pasted.png')
    view.dom.dispatchEvent(makePasteEvent({ files: [file] }))
    await flushAsync()

    expect(onUploadImage).toHaveBeenCalledTimes(1)
    expect(onUploadImage).toHaveBeenCalledWith(file, { source: 'paste' })
    expect(wrapper.find('.editor-mount img[loading]').exists()).toBe(true)
    expect(wrapper.find('.editor-mount img[loading]').attributes('src')).toBe(
      'https://example.com/pasted.png'
    )
    wrapper.unmount()
  })
})

describe('<Editor> — onUploadImage multi-file drop', () => {
  it('processes each image file in source order and inserts multiple image nodes', async () => {
    let counter = 0
    const onUploadImage = vi.fn(async (file) => ({
      src: `https://example.com/${counter++}-${file.name}`,
      alt: file.name,
    }))
    const wrapper = mountEditor({
      modelValue: '',
      onUploadImage,
    })
    await nextTick()
    const view = wrapper.vm.view
    stubPosAtCoords(view, 1)

    const fileA = makeImageFile('a.png')
    const fileB = makeImageFile('b.png')
    const fileC = makeImageFile('c.png')
    view.dom.dispatchEvent(
      makeDropEvent({ files: [fileA, fileB, fileC], clientX: 5, clientY: 5 })
    )
    await flushAsync(8)

    expect(onUploadImage).toHaveBeenCalledTimes(3)
    expect(onUploadImage.mock.calls[0][0]).toBe(fileA)
    expect(onUploadImage.mock.calls[1][0]).toBe(fileB)
    expect(onUploadImage.mock.calls[2][0]).toBe(fileC)
    // ProseMirror inserts a `<img class="ProseMirror-separator">` widget
    // alongside content images; filter by `[loading]` so only the schema
    // image nodes (which set `loading="lazy"` in `toDOM`) match.
    const imgs = wrapper.findAll('.editor-mount img[loading]')
    expect(imgs.length).toBe(3)
    // Source order — earliest file first in the DOM.
    expect(imgs[0].attributes('src')).toContain('a.png')
    expect(imgs[1].attributes('src')).toContain('b.png')
    expect(imgs[2].attributes('src')).toContain('c.png')
    wrapper.unmount()
  })
})

describe('<Editor> — onUploadImage skips non-image drops', () => {
  it('does not call the callback and does not preventDefault for plain-text drops', async () => {
    const onUploadImage = vi.fn(async () => ({
      src: 'https://example.com/x.png',
    }))
    const wrapper = mountEditor({
      modelValue: 'hello',
      onUploadImage,
    })
    await nextTick()
    const view = wrapper.vm.view
    // Stub posAtCoords so PM's own drop handler — which still runs because
    // we deliberately don't preventDefault — has a valid pos to work with.
    // PM's handler then receives an empty slice (mock getData returns '')
    // and exits early, leaving the doc unchanged.
    stubPosAtCoords(view, 1)

    const textFile = new File(['plain text'], 'note.txt', {
      type: 'text/plain',
    })
    const dropEvent = makeDropEvent({
      files: [textFile],
      clientX: 5,
      clientY: 5,
    })
    view.dom.dispatchEvent(dropEvent)
    await flushAsync()

    expect(onUploadImage).not.toHaveBeenCalled()
    // The handler should NOT have called preventDefault — let the browser
    // do its native thing for non-image drops.
    expect(dropEvent.defaultPrevented).toBe(false)
    expect(wrapper.find('.editor-mount img[loading]').exists()).toBe(false)
    expect(wrapper.vm.getMarkdown()).toBe('hello')
    wrapper.unmount()
  })
})

describe('<Editor> — onUploadImage callback returns null', () => {
  it('does not insert an image but still preventDefaults the drop', async () => {
    const onUploadImage = vi.fn(async () => null)
    const wrapper = mountEditor({
      modelValue: 'hello',
      onUploadImage,
    })
    await nextTick()
    const view = wrapper.vm.view
    stubPosAtCoords(view, 1)

    const file = makeImageFile('cancel.png')
    const dropEvent = makeDropEvent({ files: [file], clientX: 5, clientY: 5 })
    view.dom.dispatchEvent(dropEvent)
    await flushAsync()

    expect(onUploadImage).toHaveBeenCalledTimes(1)
    expect(dropEvent.defaultPrevented).toBe(true)
    expect(wrapper.find('.editor-mount img[loading]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('<Editor> — no onUploadImage prop', () => {
  it('lets the drop fall through to native handling — no preventDefault, no callback', async () => {
    const wrapper = mountEditor({ modelValue: 'hello' })
    await nextTick()
    const view = wrapper.vm.view
    // Same rationale as the non-image-drop test: PM's own drop handler
    // runs when we don't preventDefault. Stub `posAtCoords` so jsdom's
    // missing `elementFromPoint` doesn't surface as an uncaught error.
    stubPosAtCoords(view, 1)

    const file = makeImageFile('untouched.png')
    const dropEvent = makeDropEvent({ files: [file], clientX: 5, clientY: 5 })
    view.dom.dispatchEvent(dropEvent)
    await flushAsync()

    expect(dropEvent.defaultPrevented).toBe(false)
    expect(wrapper.find('.editor-mount img[loading]').exists()).toBe(false)
    expect(wrapper.vm.getMarkdown()).toBe('hello')
    wrapper.unmount()
  })
})

describe('<Editor> — onUploadImage callback rejection', () => {
  it('catches rejections via console.error with a [kurrasah] prefix and does not insert', async () => {
    const onUploadImage = vi.fn(async () => {
      throw new Error('boom')
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const wrapper = mountEditor({
        modelValue: 'hello',
        onUploadImage,
      })
      await nextTick()
      const view = wrapper.vm.view
      stubPosAtCoords(view, 1)

      const file = makeImageFile('boom.png')
      view.dom.dispatchEvent(
        makeDropEvent({ files: [file], clientX: 5, clientY: 5 })
      )
      await flushAsync()

      expect(onUploadImage).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalled()
      const firstArg = errorSpy.mock.calls[0][0]
      expect(typeof firstArg).toBe('string')
      expect(firstArg).toContain('[kurrasah]')
      expect(wrapper.find('.editor-mount img[loading]').exists()).toBe(false)
      // Doc unchanged.
      expect(wrapper.vm.getMarkdown()).toBe('hello')
      wrapper.unmount()
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe('<Editor> — onUploadImage readonly mode', () => {
  it('ignores drops when the editor is readonly', async () => {
    const onUploadImage = vi.fn(async () => ({
      src: 'https://example.com/x.png',
    }))
    const wrapper = mountEditor({
      modelValue: 'hello',
      onUploadImage,
      readonly: true,
    })
    await nextTick()
    const view = wrapper.vm.view
    // PM's drop handler is wired to the bubble phase regardless of
    // readonly mode (it bails internally when `view.editable` is false).
    // Stub `posAtCoords` so jsdom doesn't surface an uncaught error from
    // PM's pre-bail traversal.
    stubPosAtCoords(view, 1)

    const file = makeImageFile()
    const dropEvent = makeDropEvent({ files: [file], clientX: 5, clientY: 5 })
    view.dom.dispatchEvent(dropEvent)
    await flushAsync()

    expect(onUploadImage).not.toHaveBeenCalled()
    expect(dropEvent.defaultPrevented).toBe(false)
    expect(wrapper.find('.editor-mount img[loading]').exists()).toBe(false)
    wrapper.unmount()
  })
})
