import { describe, it, expect } from 'vitest'
import {
  schema,
  buildSchema,
  MAX_HEADING_LEVEL,
} from '../src/schema.js'

describe('schema — v1 nodes', () => {
  const requiredNodes = [
    'doc',
    'paragraph',
    'heading',
    'bullet_list',
    'ordered_list',
    'list_item',
    'blockquote',
    'code_block',
    'hard_break',
    'image',
    'text',
  ]

  it.each(requiredNodes)('declares node %s', (name) => {
    expect(schema.nodes[name]).toBeDefined()
  })

  it('heading has a level attribute defaulting to 1', () => {
    const heading = schema.nodes.heading
    expect(heading.spec.attrs.level.default).toBe(1)
  })

  it('caps heading levels to 3 via MAX_HEADING_LEVEL', () => {
    expect(MAX_HEADING_LEVEL).toBe(3)
  })

  it('image node has src (required), alt, title attrs', () => {
    const image = schema.nodes.image
    expect(image.spec.attrs.src).toBeDefined()
    expect(image.spec.attrs.alt.default).toBeNull()
    expect(image.spec.attrs.title.default).toBeNull()
  })

  it('code_block has marks: "" (no marks allowed inside)', () => {
    expect(schema.nodes.code_block.spec.marks).toBe('')
  })

  it('list_item content starts with paragraph for command compatibility', () => {
    expect(schema.nodes.list_item.spec.content).toMatch(/^paragraph/)
  })
})

describe('schema — v1 marks', () => {
  const requiredMarks = ['strong', 'em', 'link', 'code']

  it.each(requiredMarks)('declares mark %s', (name) => {
    expect(schema.marks[name]).toBeDefined()
  })

  it('link has href (required) and title attrs', () => {
    const link = schema.marks.link
    expect(link.spec.attrs.href).toBeDefined()
    expect(link.spec.attrs.title.default).toBeNull()
  })

  it('link is non-inclusive so typing past a link does not extend it', () => {
    expect(schema.marks.link.spec.inclusive).toBe(false)
  })

  it('code mark is marked as code', () => {
    expect(schema.marks.code.spec.code).toBe(true)
  })
})

describe('buildSchema — feature flags', () => {
  it('returns the default schema when both images and links are enabled', () => {
    const s = buildSchema({ images: true, links: true })
    expect(s).toBe(schema)
  })

  it('omits the image node when images=false', () => {
    const s = buildSchema({ images: false })
    expect(s.nodes.image).toBeUndefined()
    expect(s.nodes.paragraph).toBeDefined()
  })

  it('omits the link mark when links=false', () => {
    const s = buildSchema({ links: false })
    expect(s.marks.link).toBeUndefined()
    expect(s.marks.strong).toBeDefined()
  })
})
