import { Schema } from 'prosemirror-model'
import { tableNodes } from 'prosemirror-tables'

// ProseMirror schema for kurrasah.
//
// Nodes:
//   doc, paragraph, heading (levels 1-3 only), bullet_list, ordered_list,
//   list_item, blockquote, code_block, hard_break, image (src/alt/title),
//   table, table_row, table_header, table_cell.
// Marks:
//   strong, em, link (href/title), code.
//
// Build a fresh schema rather than reusing prosemirror-schema-basic's `schema`
// export, because we need to restrict heading levels to 1..3 and give list
// nodes a content expression compatible with the list commands (liftListItem,
// sinkListItem, splitListItem, wrapInList).
//
// Table nodes are produced via prosemirror-tables's `tableNodes` helper.
// The helper-emitted `colwidth` attribute remains in the schema for
// future compatibility (e.g. if column resizing returns), but the
// resize plugin itself is not shipped — see CHANGELOG 0.5. Cell
// content is restricted to `inline*` — lists and nested tables are
// intentionally out of scope for v1 to avoid GFM-vs-ProseMirror edge
// cases (GFM has no syntax for either inside a cell).

const pDOM = ['p', 0]
const blockquoteDOM = ['blockquote', 0]
const preDOM = ['pre', ['code', 0]]
const brDOM = ['br']
const olDOM = ['ol', 0]
const ulDOM = ['ul', 0]
const liDOM = ['li', 0]
const emDOM = ['em', 0]
const strongDOM = ['strong', 0]
const codeDOM = ['code', 0]

export const MAX_HEADING_LEVEL = 3

const nodes = {
  doc: {
    content: 'block+',
  },

  paragraph: {
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p' }],
    toDOM() {
      return pDOM
    },
  },

  blockquote: {
    content: 'block+',
    group: 'block',
    defining: true,
    parseDOM: [{ tag: 'blockquote' }],
    toDOM() {
      return blockquoteDOM
    },
  },

  heading: {
    attrs: { level: { default: 1 } },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [
      { tag: 'h1', attrs: { level: 1 } },
      { tag: 'h2', attrs: { level: 2 } },
      { tag: 'h3', attrs: { level: 3 } },
      // Levels 4-6 collapse to level 3; markdown parser also clamps.
      { tag: 'h4', attrs: { level: 3 } },
      { tag: 'h5', attrs: { level: 3 } },
      { tag: 'h6', attrs: { level: 3 } },
    ],
    toDOM(node) {
      const level = Math.min(Math.max(node.attrs.level, 1), MAX_HEADING_LEVEL)
      return ['h' + level, 0]
    },
  },

  code_block: {
    content: 'text*',
    marks: '',
    group: 'block',
    code: true,
    defining: true,
    attrs: { params: { default: '' } },
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (node) => ({
          params: node.getAttribute('data-params') || '',
        }),
      },
    ],
    toDOM(node) {
      return [
        'pre',
        node.attrs.params ? { 'data-params': node.attrs.params } : {},
        ['code', 0],
      ]
    },
  },

  ordered_list: {
    content: 'list_item+',
    group: 'block',
    attrs: { order: { default: 1 }, tight: { default: false } },
    parseDOM: [
      {
        tag: 'ol',
        getAttrs(dom) {
          return {
            order: dom.hasAttribute('start') ? +dom.getAttribute('start') : 1,
            tight: dom.hasAttribute('data-tight'),
          }
        },
      },
    ],
    toDOM(node) {
      return [
        'ol',
        {
          start: node.attrs.order === 1 ? null : node.attrs.order,
          'data-tight': node.attrs.tight ? 'true' : null,
        },
        0,
      ]
    },
  },

  bullet_list: {
    content: 'list_item+',
    group: 'block',
    attrs: { tight: { default: false } },
    parseDOM: [
      {
        tag: 'ul',
        getAttrs: (dom) => ({ tight: dom.hasAttribute('data-tight') }),
      },
    ],
    toDOM(node) {
      return [
        'ul',
        { 'data-tight': node.attrs.tight ? 'true' : null },
        0,
      ]
    },
  },

  list_item: {
    content: 'paragraph block*',
    defining: true,
    parseDOM: [{ tag: 'li' }],
    toDOM() {
      return liDOM
    },
  },

  text: {
    group: 'inline',
  },

  image: {
    inline: true,
    attrs: {
      src: {},
      alt: { default: null },
      title: { default: null },
    },
    group: 'inline',
    draggable: true,
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs(dom) {
          return {
            src: dom.getAttribute('src'),
            title: dom.getAttribute('title'),
            alt: dom.getAttribute('alt'),
          }
        },
      },
    ],
    toDOM(node) {
      const { src, alt, title } = node.attrs
      // `loading="lazy"` defers off-screen image loads — matters for
      // long-form articles where the user may have many images below the
      // fold. Browsers without native support (safe to ignore modern-only
      // here since ProseMirror's own view requires a modern engine) treat
      // the attribute as a no-op.
      return ['img', { src, alt, title, loading: 'lazy' }]
    },
  },

  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM() {
      return brDOM
    },
  },

  // Table nodes produced by `tableNodes`. Spread last so they appear at the
  // top level of the schema — `doc` declares `content: 'block+'` and the
  // `tableGroup: 'block'` option below puts `table` in that group.
  //
  // `cellContent: 'inline*'` — single-line, inline-only cells.
  //   * Matches GFM's single-line cell constraint on both sides of the
  //     pipeline: markdown-it's `table` rule emits inline content
  //     directly inside `th`/`td` tokens (no nested paragraphs), and GFM
  //     has no syntax for paragraph breaks, lists, blockquotes, code
  //     blocks, or nested tables inside a cell. Using `inline*` here
  //     aligns the schema with what the parser actually produces and
  //     what the serializer can round-trip.
  //   * Inline marks (bold, italic, code, links) still work — they
  //     attach to the inline text inside the cell directly.
  //   * Hard break is inline, so it's technically allowed; the
  //     serializer collapses it to a space on output (GFM can't express
  //     a line break inside a cell). See "Tables" in the README.
  ...tableNodes({
    tableGroup: 'block',
    cellContent: 'inline*',
    cellAttributes: {},
  }),
}

const marks = {
  em: {
    parseDOM: [
      { tag: 'i' },
      { tag: 'em' },
      { style: 'font-style=italic' },
      {
        style: 'font-style=normal',
        clearMark: (m) => m.type.name === 'em',
      },
    ],
    toDOM() {
      return emDOM
    },
  },

  strong: {
    parseDOM: [
      { tag: 'strong' },
      {
        tag: 'b',
        getAttrs: (node) => node.style.fontWeight !== 'normal' && null,
      },
      {
        style: 'font-weight=400',
        clearMark: (m) => m.type.name === 'strong',
      },
      {
        style: 'font-weight',
        getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null,
      },
    ],
    toDOM() {
      return strongDOM
    },
  },

  link: {
    attrs: {
      href: {},
      title: { default: null },
    },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs(dom) {
          return {
            href: dom.getAttribute('href'),
            title: dom.getAttribute('title'),
          }
        },
      },
    ],
    toDOM(node) {
      const { href, title } = node.attrs
      return ['a', { href, title }, 0]
    },
  },

  code: {
    code: true,
    parseDOM: [{ tag: 'code' }],
    toDOM() {
      return codeDOM
    },
  },
}

export const schema = new Schema({ nodes, marks })

// Convenience helper: build a schema with/without certain optional features.
// `images: false` removes the image node; `links: false` removes the link mark.
// The default export above keeps everything on; consumers that need a trimmed
// schema should call this helper.
export function buildSchema({ images = true, links = true } = {}) {
  if (images && links) return schema

  const trimmedNodes = { ...nodes }
  if (!images) delete trimmedNodes.image

  const trimmedMarks = { ...marks }
  if (!links) delete trimmedMarks.link

  return new Schema({ nodes: trimmedNodes, marks: trimmedMarks })
}
