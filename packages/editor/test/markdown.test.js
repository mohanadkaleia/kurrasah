import { describe, it, expect } from 'vitest'
import { parseMarkdown, serializeMarkdown } from '../src/markdown.js'

function roundtrip(md) {
  return serializeMarkdown(parseMarkdown(md))
}

describe('markdown — roundtrip fidelity', () => {
  it('roundtrips a simple paragraph', () => {
    const md = 'Hello, world.'
    expect(roundtrip(md)).toBe('Hello, world.')
  })

  it('roundtrips headings H1–H3', () => {
    expect(roundtrip('# Title')).toBe('# Title')
    expect(roundtrip('## Subtitle')).toBe('## Subtitle')
    expect(roundtrip('### Section')).toBe('### Section')
  })

  it('clamps H4–H6 to H3', () => {
    // markdown-it emits level 4-6 tokens; our parser clamps to 3.
    expect(roundtrip('#### Four')).toBe('### Four')
    expect(roundtrip('##### Five')).toBe('### Five')
    expect(roundtrip('###### Six')).toBe('### Six')
  })

  it('roundtrips a bullet list', () => {
    const md = '* one\n\n* two\n\n* three'
    expect(roundtrip(md)).toBe(md)
  })

  it('roundtrips an ordered list', () => {
    const md = '1. one\n\n2. two\n\n3. three'
    expect(roundtrip(md)).toBe(md)
  })

  it('roundtrips a nested bullet list one level deep', () => {
    // Nested markdown indentation is tricky; the serializer normalizes to
    // the form produced by prosemirror-markdown, which is stable even if
    // the input whitespace differs slightly.
    const md = '* outer\n\n  * inner'
    expect(roundtrip(md)).toBe(md)
  })

  it('roundtrips a blockquote', () => {
    expect(roundtrip('> quoted')).toBe('> quoted')
  })

  it('roundtrips a fenced code block', () => {
    const md = '```\ncode line 1\ncode line 2\n```'
    expect(roundtrip(md)).toBe(md)
  })

  it('roundtrips bold', () => {
    expect(roundtrip('This is **bold** text.')).toBe('This is **bold** text.')
  })

  it('roundtrips italic', () => {
    expect(roundtrip('This is *italic* text.')).toBe('This is *italic* text.')
  })

  it('roundtrips inline code', () => {
    expect(roundtrip('Call `foo()` now.')).toBe('Call `foo()` now.')
  })

  it('roundtrips links', () => {
    expect(roundtrip('[home](https://example.com)')).toBe(
      '[home](https://example.com)'
    )
  })

  it('roundtrips an image', () => {
    expect(roundtrip('![logo](https://example.com/logo.png)')).toBe(
      '![logo](https://example.com/logo.png)'
    )
  })

  it('roundtrips a hard break within a paragraph', () => {
    // CommonMark represents a hard break as a trailing `\` then newline.
    // The serializer emits exactly that form; the parser accepts both
    // trailing-two-spaces and backslash-newline syntax.
    const md = 'line one\\\nline two'
    expect(roundtrip(md)).toBe(md)
  })

  it('preserves a mixed Arabic + English paragraph', () => {
    const md = 'مرحبا world — هذا نص **مختلط**'
    expect(roundtrip(md)).toBe(md)
  })

  it('preserves an Arabic heading', () => {
    expect(roundtrip('# مرحبا')).toBe('# مرحبا')
  })

  it('preserves an Arabic bullet list', () => {
    const md = '* أول\n\n* ثاني\n\n* ثالث'
    expect(roundtrip(md)).toBe(md)
  })

  it('preserves a nested ordered list (structural, not bit-exact)', () => {
    // Nested list serialization in CommonMark depends on the number-width
    // of each item (the "  " indent grows with `start + count` digits). The
    // serializer in prosemirror-markdown normalizes the form, so the output
    // is not guaranteed to be bit-exact with every input. We therefore
    // assert the *structure* of the parsed tree rather than the exact
    // markdown bytes: an ordered_list whose list_item's paragraph is
    // followed by a nested ordered_list.
    const md = '1. outer\n\n   1. inner one\n\n   2. inner two'
    const doc = parseMarkdown(md)
    const outer = doc.firstChild
    expect(outer.type.name).toBe('ordered_list')
    expect(outer.childCount).toBe(1)

    const li = outer.firstChild
    expect(li.type.name).toBe('list_item')
    // list_item content is "paragraph block*": first child must be a
    // paragraph carrying the item's text; the next child is the nested
    // ordered_list.
    expect(li.childCount).toBe(2)
    expect(li.child(0).type.name).toBe('paragraph')
    expect(li.child(0).textContent).toBe('outer')
    expect(li.child(1).type.name).toBe('ordered_list')
    expect(li.child(1).childCount).toBe(2)
    expect(li.child(1).child(0).textContent).toBe('inner one')
    expect(li.child(1).child(1).textContent).toBe('inner two')

    // Sanity check: re-serializing yields a string that re-parses to the
    // same structure. This is the practical "roundtrip is idempotent"
    // guarantee rather than a byte-for-byte match.
    const reparsed = parseMarkdown(serializeMarkdown(doc))
    expect(reparsed.firstChild.type.name).toBe('ordered_list')
    expect(reparsed.firstChild.firstChild.childCount).toBe(2)
    expect(
      reparsed.firstChild.firstChild.child(1).type.name
    ).toBe('ordered_list')
  })
})

describe('markdown — parser attaches correct attributes', () => {
  it('heading level is parsed into attrs.level', () => {
    const doc = parseMarkdown('## Hello')
    const heading = doc.firstChild
    expect(heading.type.name).toBe('heading')
    expect(heading.attrs.level).toBe(2)
  })

  it('image attrs come from the markdown token', () => {
    const doc = parseMarkdown('![alt text](https://example.com/a.png "t")')
    const para = doc.firstChild
    const img = para.firstChild
    expect(img.type.name).toBe('image')
    expect(img.attrs.src).toBe('https://example.com/a.png')
    expect(img.attrs.alt).toBe('alt text')
    expect(img.attrs.title).toBe('t')
  })

  it('link attrs come from the markdown token', () => {
    const doc = parseMarkdown('[label](https://example.com "tt")')
    const para = doc.firstChild
    const textNode = para.firstChild
    const link = textNode.marks.find((m) => m.type.name === 'link')
    expect(link.attrs.href).toBe('https://example.com')
    expect(link.attrs.title).toBe('tt')
  })
})

describe('markdown — empty input', () => {
  it('parses an empty string to a document with one empty paragraph', () => {
    const doc = parseMarkdown('')
    // prosemirror-markdown yields a doc with one empty paragraph so that
    // the editor has somewhere to place the cursor.
    expect(doc.type.name).toBe('doc')
    expect(doc.childCount).toBe(1)
    expect(doc.firstChild.type.name).toBe('paragraph')
    expect(doc.firstChild.content.size).toBe(0)
  })

  it('serializes an empty doc to an empty string', () => {
    const doc = parseMarkdown('')
    expect(serializeMarkdown(doc)).toBe('')
  })
})
