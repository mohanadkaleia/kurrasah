import MarkdownIt from 'markdown-it'
import {
  MarkdownParser,
  MarkdownSerializer,
} from 'prosemirror-markdown'
import { schema as defaultSchema, MAX_HEADING_LEVEL } from './schema.js'

// Configure a CommonMark tokenizer that matches our schema.
// - `html: false` disables raw HTML (we don't support arbitrary HTML nodes).
// - We start from the CommonMark preset (which disables GFM extensions) then
//   explicitly re-enable the `table` rule. CommonMark itself has no table
//   syntax; markdown-it's `table` rule implements the GFM pipe form.
// - Any token not in our schema (e.g. horizontal_rule) must be handled via
//   `ignore: true` in the token map below, otherwise the parser will throw
//   on that token.
const tokenizer = () =>
  MarkdownIt('commonmark', { html: false }).enable('table')

// True if a list is "tight" (no blank lines between items). Copied from the
// reference implementation in prosemirror-markdown/src/from_markdown.ts.
function listIsTight(tokens, i) {
  while (++i < tokens.length) {
    if (tokens[i].type !== 'list_item_open') return tokens[i].hidden
  }
  return false
}

// Build the parser's token map tied to the supplied schema. Supports schemas
// built via `buildSchema()` that may omit `image` or `link`.
function buildTokens(schema) {
  const tokens = {
    blockquote: { block: 'blockquote' },
    paragraph: { block: 'paragraph' },
    list_item: { block: 'list_item' },
    bullet_list: {
      block: 'bullet_list',
      getAttrs: (_, tokens, i) => ({ tight: listIsTight(tokens, i) }),
    },
    ordered_list: {
      block: 'ordered_list',
      getAttrs: (tok, tokens, i) => ({
        order: +tok.attrGet('start') || 1,
        tight: listIsTight(tokens, i),
      }),
    },
    heading: {
      block: 'heading',
      // Clamp levels 4-6 to MAX_HEADING_LEVEL. markdown-it emits h1..h6
      // as separate tokens; we normalize any level above 3 down to 3 so the
      // schema (which only renders 1..3) doesn't see out-of-range values.
      getAttrs: (tok) => ({
        level: Math.min(+tok.tag.slice(1), MAX_HEADING_LEVEL),
      }),
    },
    code_block: { block: 'code_block', noCloseToken: true },
    fence: {
      block: 'code_block',
      getAttrs: (tok) => ({ params: tok.info || '' }),
      noCloseToken: true,
    },
    // `hr` is not in our v1 schema. Drop it silently rather than crashing.
    hr: { ignore: true },
    hardbreak: { node: 'hard_break' },

    em: { mark: 'em' },
    strong: { mark: 'strong' },
    code_inline: { mark: 'code', noCloseToken: true },
  }

  // Table tokens. markdown-it emits `thead`/`tbody` wrappers around rows,
  // but ProseMirror's structure is table → table_row → (table_header |
  // table_cell), so we ignore the section wrappers and let the alignment
  // of `tr_open/th_open/td_open` tokens produce the right tree directly.
  if (schema.nodes.table) {
    tokens.table = { block: 'table' }
    tokens.thead = { ignore: true }
    tokens.tbody = { ignore: true }
    tokens.tr = { block: 'table_row' }
    tokens.th = { block: 'table_header' }
    tokens.td = { block: 'table_cell' }
  }

  if (schema.nodes.image) {
    tokens.image = {
      node: 'image',
      getAttrs: (tok) => ({
        src: tok.attrGet('src'),
        title: tok.attrGet('title') || null,
        alt: (tok.children && tok.children[0] && tok.children[0].content) || null,
      }),
    }
  } else {
    tokens.image = { ignore: true }
  }

  if (schema.marks.link) {
    tokens.link = {
      mark: 'link',
      getAttrs: (tok) => ({
        href: tok.attrGet('href'),
        title: tok.attrGet('title') || null,
      }),
    }
  } else {
    tokens.link = { ignore: true }
  }

  return tokens
}

// Serializer spec. Mirrors defaultMarkdownSerializer from prosemirror-markdown
// but trimmed to v1 nodes/marks. Image and link entries are included in the
// spec unconditionally; the serializer only invokes them for nodes/marks
// that actually exist in the document, so keeping them here is safe even
// when the schema was built without images/links.
function backticksFor(node, side) {
  let ticks = /`+/g
  let m
  let len = 0
  if (node.isText) {
    while ((m = ticks.exec(node.text))) len = Math.max(len, m[0].length)
  }
  let result = len > 0 && side > 0 ? ' `' : '`'
  for (let i = 0; i < len; i++) result += '`'
  if (len > 0 && side < 0) result += ' '
  return result
}

function isPlainURL(link, parent, index) {
  if (link.attrs.title || !/^\w+:/.test(link.attrs.href)) return false
  const content = parent.child(index)
  if (
    !content.isText ||
    content.text !== link.attrs.href ||
    content.marks[content.marks.length - 1] !== link
  )
    return false
  return (
    index === parent.childCount - 1 ||
    !link.isInSet(parent.child(index + 1).marks)
  )
}

const nodeSerializers = {
  blockquote(state, node) {
    state.wrapBlock('> ', null, node, () => state.renderContent(node))
  },
  code_block(state, node) {
    const backticks = node.textContent.match(/`{3,}/gm)
    const fence = backticks ? backticks.sort().slice(-1)[0] + '`' : '```'
    state.write(fence + (node.attrs.params || '') + '\n')
    state.text(node.textContent, false)
    state.write('\n')
    state.write(fence)
    state.closeBlock(node)
  },
  heading(state, node) {
    state.write(state.repeat('#', node.attrs.level) + ' ')
    state.renderInline(node, false)
    state.closeBlock(node)
  },
  bullet_list(state, node) {
    state.renderList(node, '  ', () => (node.attrs.bullet || '*') + ' ')
  },
  ordered_list(state, node) {
    const start = node.attrs.order || 1
    const maxW = String(start + node.childCount - 1).length
    const space = state.repeat(' ', maxW + 2)
    state.renderList(node, space, (i) => {
      const nStr = String(start + i)
      return state.repeat(' ', maxW - nStr.length) + nStr + '. '
    })
  },
  list_item(state, node) {
    state.renderContent(node)
  },
  paragraph(state, node) {
    state.renderInline(node)
    state.closeBlock(node)
  },
  image(state, node) {
    state.write(
      '![' +
        state.esc(node.attrs.alt || '') +
        '](' +
        node.attrs.src.replace(/[()]/g, '\\$&') +
        (node.attrs.title
          ? ' "' + node.attrs.title.replace(/"/g, '\\"') + '"'
          : '') +
        ')'
    )
  },
  hard_break(state, node, parent, index) {
    for (let i = index + 1; i < parent.childCount; i++) {
      if (parent.child(i).type !== node.type) {
        state.write('\\\n')
        return
      }
    }
  },
  text(state, node) {
    state.text(node.text, !state.inAutolink)
  },

  // ---- Table nodes --------------------------------------------------
  //
  // GFM pipe syntax. Example:
  //
  //     | col1 | col2 |
  //     |------|------|
  //     | a    | b    |
  //
  // The parse-side uses markdown-it's native `table` rule (GFM). The
  // serialize-side is hand-rolled because prosemirror-markdown does not
  // ship a helper for GFM tables.
  //
  // Implementation notes:
  //
  // - We render rows by calling `serializeCellLine` on each cell, which
  //   produces the cell's inline content using the current serializer
  //   state, with pipes escaped and intra-cell newlines collapsed to a
  //   single space. GFM has no syntax for paragraph breaks inside a
  //   cell, so two paragraphs in a cell must serialize to one visible
  //   line on output — documented under "Roundtrip caveat" in the
  //   README.
  //
  // - The header row is emitted first, followed by an alignment line of
  //   `|---|---|...|`. If the document has no `table_header` cells in
  //   the first row (legal in ProseMirror but not in GFM, which requires
  //   a header), we still emit an empty header row so the output parses
  //   back as a valid GFM table.
  //
  // - Column count is taken from the first row; malformed tables where
  //   rows have different widths fall back to the first row's count.
  //   prosemirror-tables's normalizer should have fixed this before we
  //   ever see the node.
  table(state, node) {
    const firstRow = node.firstChild
    if (!firstRow || firstRow.childCount === 0) {
      // Degenerate table; skip rather than emit malformed markdown.
      state.closeBlock(node)
      return
    }
    const colCount = firstRow.childCount
    const firstRowIsHeader =
      firstRow.firstChild &&
      firstRow.firstChild.type.name === 'table_header'

    // Header row. If the first row is already `table_header` cells,
    // serialize it as-is. Otherwise emit an empty header row (GFM
    // requires one), then serialize every row as a body row.
    if (firstRowIsHeader) {
      state.write(serializeRow(state, firstRow))
      state.write('\n')
    } else {
      const emptyHeader =
        '| ' + new Array(colCount).fill(' ').join(' | ') + ' |'
      state.write(emptyHeader + '\n')
    }

    // Separator line.
    const separator =
      '|' + new Array(colCount).fill('----').join('|') + '|'
    state.write(separator + '\n')

    // Body rows. Skip the header (already emitted) when it was the first
    // row; otherwise include every row.
    const bodyStart = firstRowIsHeader ? 1 : 0
    for (let i = bodyStart; i < node.childCount; i++) {
      const row = node.child(i)
      state.write(serializeRow(state, row))
      state.write('\n')
    }

    state.closeBlock(node)
  },

  // `table_row`, `table_header`, `table_cell` serializers exist so the
  // `MarkdownSerializer` constructor validates the schema, but they are
  // never actually invoked — the `table` serializer above handles the
  // whole structure in one pass. ProseMirror walks `renderContent` per
  // node otherwise, which would double-emit cells.
  table_row() {
    /* handled by `table` */
  },
  table_header() {
    /* handled by `table` */
  },
  table_cell() {
    /* handled by `table` */
  },
}

// Render a single row as `| cell1 | cell2 | ... |` with no trailing
// newline. Each cell's inline content is produced by rendering the cell's
// paragraphs with the same serializer state, then collapsing paragraph
// breaks into a single space and escaping pipes.
function serializeRow(state, row) {
  const parts = []
  for (let i = 0; i < row.childCount; i++) {
    const cell = row.child(i)
    parts.push(serializeCellContent(state, cell))
  }
  return '| ' + parts.join(' | ') + ' |'
}

// Serialize a cell to a single inline string. Cells hold inline content
// directly (`cellContent: 'inline*'` in the schema), so we render the
// cell itself as inline — no paragraph unwrapping needed.
//
// Post-processing:
//   * Collapse any whitespace run (including soft newlines from hard
//     breaks) into a single space — GFM has no in-cell line-break
//     syntax. Documented under "Tables" in the README.
//   * Escape literal `|` as `\|` so the cell boundary isn't broken.
function serializeCellContent(state, cell) {
  const rendered = renderInlineToString(state, cell)
  const collapsed = rendered.replace(/\s+/g, ' ').trim()
  return collapsed.replace(/\|/g, '\\|')
}

// Render a node's inline content through the serializer's usual
// mark/text pipeline, but capture the output into a string instead of
// appending it to the enclosing document. Uses the serializer's own
// `renderInline` so inline marks (em, strong, code, link) go through
// their canonical open/close handlers.
function renderInlineToString(state, node) {
  // Stash and swap the serializer's internal write buffer. `MarkdownSerializerState`
  // maintains `state.out` as the accumulated output and `state.delim` as the
  // current line prefix; swap `state.out` for a fresh empty string, render,
  // then restore.
  const savedOut = state.out
  const savedClosed = state.closed
  const savedInTightList = state.inTightList
  state.out = ''
  state.closed = false
  // Render marks + text. `renderInline` appends to `state.out` via `state.text`.
  state.renderInline(node)
  const produced = state.out
  state.out = savedOut
  state.closed = savedClosed
  state.inTightList = savedInTightList
  return produced
}

const markSerializers = {
  em: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
  strong: {
    open: '**',
    close: '**',
    mixable: true,
    expelEnclosingWhitespace: true,
  },
  link: {
    open(state, mark, parent, index) {
      state.inAutolink = isPlainURL(mark, parent, index)
      return state.inAutolink ? '<' : '['
    },
    close(state, mark, parent, index) {
      const { inAutolink } = state
      state.inAutolink = undefined
      return inAutolink
        ? '>'
        : '](' +
            mark.attrs.href.replace(/[()"]/g, '\\$&') +
            (mark.attrs.title
              ? ` "${mark.attrs.title.replace(/"/g, '\\"')}"`
              : '') +
            ')'
    },
    mixable: true,
  },
  code: {
    open(_state, _mark, parent, index) {
      return backticksFor(parent.child(index), -1)
    },
    close(_state, _mark, parent, index) {
      return backticksFor(parent.child(index - 1), 1)
    },
    escape: false,
  },
}

// Build a configured parser/serializer pair against the given schema.
export function createMarkdownIO(schema = defaultSchema) {
  const parser = new MarkdownParser(schema, tokenizer(), buildTokens(schema))
  const serializer = new MarkdownSerializer(nodeSerializers, markSerializers)
  return {
    parseMarkdown(md) {
      return parser.parse(md || '')
    },
    serializeMarkdown(doc) {
      return serializer.serialize(doc)
    },
    parser,
    serializer,
  }
}

// Convenience top-level helpers bound to the default schema.
const defaultIO = createMarkdownIO(defaultSchema)
export const parseMarkdown = (md) => defaultIO.parseMarkdown(md)
export const serializeMarkdown = (doc) => defaultIO.serializeMarkdown(doc)
