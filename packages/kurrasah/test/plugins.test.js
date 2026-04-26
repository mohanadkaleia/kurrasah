import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from '../src/schema.js'
import { buildPlugins } from '../src/plugins.js'
import { createMarkdownIO } from '../src/markdown.js'
import { isValidHttpUrl } from '../src/commands.js'

// Utilities -------------------------------------------------------------

function makeView(markdown = '') {
  const io = createMarkdownIO(schema)
  const state = EditorState.create({
    doc: io.parseMarkdown(markdown),
    plugins: buildPlugins({ schema }),
  })
  const place = document.createElement('div')
  document.body.appendChild(place)
  const view = new EditorView(place, {
    state,
    dispatchTransaction(tr) {
      view.updateState(view.state.apply(tr))
    },
  })
  return {
    view,
    io,
    destroy() {
      view.destroy()
      place.remove()
    },
  }
}

function currentMarkdown(view, io) {
  return io.serializeMarkdown(view.state.doc)
}

// Fire a ProseMirror keydown through the keymap chain by synthesizing a
// KeyboardEvent with the expected `key` property. `mod` resolves to ctrl on
// non-Mac platforms and meta on Mac (matching ProseMirror's `Mod-` prefix).
// Returns whether any handler called preventDefault (i.e. consumed the
// event).
const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iP(hone|[oa]d)/.test(navigator.platform)

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

// Insert text into the view at the current selection, triggering any
// applicable input rules. This mimics what the DOM adapter does when the
// user types a character.
function typeChar(view, char) {
  const tr = view.state.tr
  // Replace the current selection with `char`. Input rules fire on
  // `view.someProp('handleTextInput')`, not on raw dispatch, so we route
  // through that path the same way the DOM adapter does.
  const { from, to } = view.state.selection
  const handled = view.someProp('handleTextInput', (f) =>
    f(view, from, to, char)
  )
  if (!handled) {
    view.dispatch(tr.insertText(char))
  }
}

// Tests -----------------------------------------------------------------

describe('isValidHttpUrl', () => {
  it('accepts http:// and https:// URLs', () => {
    expect(isValidHttpUrl('https://example.com')).toBe(true)
    expect(isValidHttpUrl('http://example.com')).toBe(true)
    expect(isValidHttpUrl('HTTPS://EXAMPLE.COM/path?q=1')).toBe(true)
  })

  it('accepts URLs with path, query, and fragment', () => {
    expect(
      isValidHttpUrl('https://example.com/a/b?c=1&d=2#frag')
    ).toBe(true)
  })

  it('rejects URLs without scheme', () => {
    expect(isValidHttpUrl('example.com')).toBe(false)
    expect(isValidHttpUrl('foo')).toBe(false)
    expect(isValidHttpUrl('//cdn.example.com/x')).toBe(false)
  })

  it('rejects non-http(s) schemes', () => {
    expect(isValidHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isValidHttpUrl('ftp://example.com')).toBe(false)
    expect(isValidHttpUrl('mailto:foo@bar')).toBe(false)
    expect(isValidHttpUrl('data:text/plain,hello')).toBe(false)
  })

  it('rejects empty, null, or non-string input', () => {
    expect(isValidHttpUrl('')).toBe(false)
    expect(isValidHttpUrl('   ')).toBe(false)
    expect(isValidHttpUrl(null)).toBe(false)
    expect(isValidHttpUrl(undefined)).toBe(false)
    expect(isValidHttpUrl(42)).toBe(false)
  })

  it('trims surrounding whitespace before checking', () => {
    expect(isValidHttpUrl('  https://example.com  ')).toBe(true)
  })
})

describe('Shift-Enter inserts a hard break', () => {
  it('replaces the selection with a hard_break node', () => {
    const { view, io, destroy } = makeView('hello world')
    // Put the cursor between `hello` and ` world`.
    const pos = view.state.doc.resolve(1 + 'hello'.length).pos
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, pos)
      )
    )
    fireKey(view, 'Enter', { shift: true })
    const md = currentMarkdown(view, io)
    // CommonMark hard break is `\` then newline; serializer emits exactly
    // that, so the presence of the backslash before the newline is the
    // signal that a hard_break node was inserted.
    expect(md).toContain('\\\n')
    destroy()
  })
})

describe('Enter at end of code block exits after a blank line', () => {
  it('two consecutive Enters inside a code block exit into a new paragraph', () => {
    const { view, io, destroy } = makeView('```\nconst x = 1\n```')
    // Cursor at the end of the code block (after "const x = 1").
    view.dispatch(
      view.state.tr.setSelection(TextSelection.atEnd(view.state.doc))
    )

    // First Enter: inserts a `\n` inside the code block. The trailing-
    // paragraph guard plugin also kicks in here — the doc was
    // `[code_block]` and code_block is in the trapping set, so the
    // plugin appends an empty paragraph after it. After this Enter the
    // doc is `[code_block, paragraph]`.
    fireKey(view, 'Enter')
    expect(view.state.doc.firstChild.type.name).toBe('code_block')
    expect(view.state.doc.firstChild.textContent).toBe('const x = 1\n')

    // Second Enter: the trailing `\n` is stripped AND `exitCode` inserts
    // a new paragraph after the code block, landing the cursor in it.
    // The trailing guard from the first Enter is still present, so the
    // doc ends up as `[code_block, paragraph (cursor), paragraph (guard)]`.
    fireKey(view, 'Enter')
    const children = []
    view.state.doc.forEach((child) => children.push(child))
    expect(children[0].type.name).toBe('code_block')
    expect(children[0].textContent).toBe('const x = 1')
    // Every child after the code block is a paragraph — the cursor's
    // paragraph plus the trailing-guard paragraph at the end.
    for (const child of children.slice(1)) {
      expect(child.type.name).toBe('paragraph')
    }
    destroy()
  })
})

describe('Enter at end of empty list item exits the list', () => {
  it('a second Enter inside an empty bullet item lifts into a paragraph', () => {
    const { view, io, destroy } = makeView('* first item')
    // Place the cursor at the end of the doc (which is inside the paragraph
    // of the single list item).
    view.dispatch(
      view.state.tr.setSelection(TextSelection.atEnd(view.state.doc))
    )
    // First Enter: splits into a new (empty) list item.
    fireKey(view, 'Enter')
    // Second Enter on that empty item: splitListItem lifts it into a
    // paragraph, exiting the list.
    fireKey(view, 'Enter')

    // After the two enters, the last block should be a paragraph (outside
    // the list). The first block is still a bullet_list containing the
    // original item.
    const children = []
    view.state.doc.forEach((child) => children.push(child))
    expect(children[0].type.name).toBe('bullet_list')
    expect(children[children.length - 1].type.name).toBe('paragraph')
    destroy()
  })
})

describe('`# ` input rule undo behavior', () => {
  it('Mod-z after `# ` → heading reverts to the literal `# ` text', () => {
    const { view, io, destroy } = makeView('')
    // Place cursor at position 1 (inside the initial empty paragraph).
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, 1)
      )
    )
    typeChar(view, '#')
    typeChar(view, ' ')

    // After the input rule, the first block should be a heading.
    expect(view.state.doc.firstChild.type.name).toBe('heading')

    // Now fire Mod-z; undoInputRule should revert to literal `# `.
    fireKey(view, 'z', { mod: true })

    expect(view.state.doc.firstChild.type.name).toBe('paragraph')
    expect(view.state.doc.firstChild.textContent).toBe('# ')
    // The markdown serializer escapes leading `#` on a paragraph line so
    // the text doesn't round-trip into a heading. We assert the structural
    // property: the first block is a paragraph, not a heading.
    const md = io.serializeMarkdown(view.state.doc)
    expect(md).toMatch(/^\\?# /)
    destroy()
  })

  it('Mod-z with no pending input rule falls through to history undo', () => {
    const { view, io, destroy } = makeView('hello')
    // Insert text via a plain transaction (not a text input, so no input
    // rule fires) and then ensure Mod-z still undoes it.
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, view.state.doc.content.size - 1)
      )
    )
    view.dispatch(view.state.tr.insertText(' world'))
    expect(currentMarkdown(view, io)).toBe('hello world')
    fireKey(view, 'z', { mod: true })
    expect(currentMarkdown(view, io)).toBe('hello')
    destroy()
  })
})

describe('italic input rule at line start', () => {
  it('`*italic*` at the start of an empty paragraph fires the em rule', () => {
    const { view, io, destroy } = makeView('')
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, 1)
      )
    )
    for (const ch of '*italic*') typeChar(view, ch)

    const md = currentMarkdown(view, io)
    expect(md).toBe('*italic*')
    destroy()
  })

  it('`*italic*` mid-line still fires and leaves leading text untouched', () => {
    // markdown-it trims the trailing space from `say `, so we seed with a
    // placeholder word and type the space ourselves before the mark.
    const { view, io, destroy } = makeView('say')
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, view.state.doc.content.size - 1)
      )
    )
    for (const ch of ' *hi*') typeChar(view, ch)

    const md = currentMarkdown(view, io)
    expect(md).toBe('say *hi*')
    destroy()
  })

  it('`**bold**` fires the strong rule without collapsing to italic', () => {
    const { view, io, destroy } = makeView('')
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, 1)
      )
    )
    for (const ch of '**bold**') typeChar(view, ch)

    const md = currentMarkdown(view, io)
    expect(md).toBe('**bold**')
    destroy()
  })
})
