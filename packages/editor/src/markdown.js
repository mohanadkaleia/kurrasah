import MarkdownIt from 'markdown-it'
import {
  MarkdownParser,
  MarkdownSerializer,
} from 'prosemirror-markdown'
import { schema as defaultSchema, MAX_HEADING_LEVEL } from './schema.js'

// Configure a CommonMark tokenizer that matches our v1 schema.
// - `html: false` disables raw HTML (we don't support arbitrary HTML nodes).
// - We leave the default CommonMark features on; any token that is not in
//   our schema (e.g. horizontal_rule) must be handled via `ignore: true`
//   in the token map below, otherwise the parser will throw on that token.
const tokenizer = () => MarkdownIt('commonmark', { html: false })

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
