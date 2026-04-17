import {
  toggleMark,
  setBlockType,
  wrapIn,
  lift,
  chainCommands,
} from 'prosemirror-commands'
import {
  wrapInList,
  liftListItem,
} from 'prosemirror-schema-list'
import { undo as pmUndo, redo as pmRedo } from 'prosemirror-history'
import { MAX_HEADING_LEVEL } from './schema.js'

// Named command wrappers. Each factory returns a command of the standard
// ProseMirror shape `(state, dispatch, view) => boolean`, allowing callers
// to compose via `execCommand` without importing ProseMirror directly.

function markActive(state, markType) {
  const { from, $from, to, empty } = state.selection
  if (empty) return !!markType.isInSet(state.storedMarks || $from.marks())
  return state.doc.rangeHasMark(from, to, markType)
}

function nodeTypeActive(state, nodeType, attrs = null) {
  const { $from, to } = state.selection
  const sameParent = $from.parent.type === nodeType
  if (!sameParent) return false
  if (!attrs) return $from.end() >= to
  return Object.keys(attrs).every(
    (key) => $from.parent.attrs[key] === attrs[key]
  )
}

export function toggleBold(schema) {
  return toggleMark(schema.marks.strong)
}

export function toggleItalic(schema) {
  return toggleMark(schema.marks.em)
}

export function toggleCode(schema) {
  return toggleMark(schema.marks.code)
}

export function setParagraph(schema) {
  return setBlockType(schema.nodes.paragraph)
}

export function setHeading(schema, level) {
  const clamped = Math.min(Math.max(level | 0, 1), MAX_HEADING_LEVEL)
  return setBlockType(schema.nodes.heading, { level: clamped })
}

// Toggle helpers: if the block already has the requested type, revert to
// paragraph; otherwise set the requested type. This is what the toolbar calls.
export function toggleHeading(schema, level) {
  const clamped = Math.min(Math.max(level | 0, 1), MAX_HEADING_LEVEL)
  return (state, dispatch, view) => {
    const active = nodeTypeActive(state, schema.nodes.heading, {
      level: clamped,
    })
    if (active) return setParagraph(schema)(state, dispatch, view)
    return setHeading(schema, clamped)(state, dispatch, view)
  }
}

export function setCodeBlock(schema) {
  return setBlockType(schema.nodes.code_block)
}

export function toggleCodeBlock(schema) {
  return (state, dispatch, view) => {
    const active = nodeTypeActive(state, schema.nodes.code_block)
    if (active) return setParagraph(schema)(state, dispatch, view)
    return setCodeBlock(schema)(state, dispatch, view)
  }
}

export function toggleBlockquote(schema) {
  return chainCommands(
    // If we're already inside a blockquote, lift out of it.
    (state, dispatch, view) => {
      const { $from } = state.selection
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type === schema.nodes.blockquote) {
          return lift(state, dispatch, view)
        }
      }
      return false
    },
    wrapIn(schema.nodes.blockquote)
  )
}

export function toggleBulletList(schema) {
  return chainCommands(
    liftListItem(schema.nodes.list_item),
    wrapInList(schema.nodes.bullet_list)
  )
}

export function toggleOrderedList(schema) {
  return chainCommands(
    liftListItem(schema.nodes.list_item),
    wrapInList(schema.nodes.ordered_list)
  )
}

/*
 * URL validator used by the link/image prompt flows. A valid URL must start
 * with `http://` or `https://` (case-insensitive) followed by at least one
 * character. Exported so tests can exercise the predicate independently of
 * the window prompt flow. Keep the pattern conservative — we are not trying
 * to implement full RFC 3986 validation, just reject obviously-broken input
 * like `foo`, `//bar`, `javascript:alert(1)`, or a bare domain.
 */
export function isValidHttpUrl(value) {
  if (typeof value !== 'string') return false
  return /^https?:\/\/.+/i.test(value.trim())
}

// Prompt the user for an http(s) URL via `window.prompt`. Re-prompts exactly
// once on an invalid answer (per Phase 5 spec) and aborts silently on the
// second invalid answer or on cancel. Returns the trimmed URL or null.
function promptForHttpUrl(message) {
  if (typeof window === 'undefined' || !window.prompt) return null
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = window.prompt(message)
    if (answer == null) return null
    const trimmed = answer.trim()
    if (isValidHttpUrl(trimmed)) return trimmed
  }
  return null
}

// Insert or remove a link mark. If `href` is omitted and a view is provided,
// prompts the user via `window.prompt` with Arabic copy and validates that
// the URL starts with http:// or https://. This is a convenience command
// for the toolbar; programmatic callers should pass an explicit href (or
// use the ProseMirror `toggleMark` command directly).
export function toggleLink(schema, href, title) {
  const markType = schema.marks.link
  if (!markType) return () => false
  return (state, dispatch, view) => {
    const active = markActive(state, markType)
    if (active) {
      return toggleMark(markType)(state, dispatch, view)
    }
    let finalHref = href
    if (finalHref == null) {
      finalHref = promptForHttpUrl('أدخل رابط URL (http:// أو https://)')
      if (!finalHref) return false
    } else if (!isValidHttpUrl(finalHref)) {
      // Explicit programmatic call with an invalid href — refuse silently.
      return false
    }
    return toggleMark(markType, { href: finalHref, title: title || null })(
      state,
      dispatch,
      view
    )
  }
}

export function insertImage(schema, url, alt, title) {
  const imageType = schema.nodes.image
  if (!imageType) return () => false
  return (state, dispatch) => {
    let src = url
    let finalAlt = alt
    if (src == null) {
      src = promptForHttpUrl('أدخل رابط الصورة (URL)')
      if (!src) return false
      if (finalAlt == null) {
        if (typeof window !== 'undefined' && window.prompt) {
          finalAlt = window.prompt('النص البديل للصورة') || ''
        } else {
          finalAlt = ''
        }
      }
    } else if (!isValidHttpUrl(src)) {
      return false
    }
    const node = imageType.createAndFill({
      src,
      alt: finalAlt || null,
      title: title || null,
    })
    if (!node) return false
    if (dispatch) {
      dispatch(state.tr.replaceSelectionWith(node).scrollIntoView())
    }
    return true
  }
}

export function undo() {
  return pmUndo
}

export function redo() {
  return pmRedo
}

// Name -> factory. The exposed `editor.execCommand(name, ...args)` looks a
// command up here and invokes it against the current state/view. Factories
// that take `(schema, ...args)` are bound to the editor's schema at call
// time inside `Editor.vue`.
export const commandFactories = {
  toggleBold,
  toggleItalic,
  toggleCode,
  setParagraph,
  setHeading,
  toggleHeading,
  setCodeBlock,
  toggleCodeBlock,
  toggleBlockquote,
  toggleBulletList,
  toggleOrderedList,
  toggleLink,
  insertImage,
  undo,
  redo,
}

// Build a bound command map against a schema. The returned values are
// `(state, dispatch, view) => boolean` commands, already wired to the
// schema where relevant.
export function buildCommands(schema) {
  return {
    toggleBold: toggleBold(schema),
    toggleItalic: toggleItalic(schema),
    toggleCode: toggleCode(schema),
    setParagraph: setParagraph(schema),
    setHeading: (level) => setHeading(schema, level),
    toggleHeading: (level) => toggleHeading(schema, level),
    setCodeBlock: setCodeBlock(schema),
    toggleCodeBlock: toggleCodeBlock(schema),
    toggleBlockquote: toggleBlockquote(schema),
    toggleBulletList: toggleBulletList(schema),
    toggleOrderedList: toggleOrderedList(schema),
    toggleLink: (href, title) => toggleLink(schema, href, title),
    insertImage: (url, alt, title) => insertImage(schema, url, alt, title),
    undo: undo(),
    redo: redo(),
  }
}

// Query helpers used by the toolbar to compute active state.
export function isMarkActive(state, markName) {
  const markType = state.schema.marks[markName]
  if (!markType) return false
  return markActive(state, markType)
}

export function isNodeActive(state, nodeName, attrs = null) {
  const nodeType = state.schema.nodes[nodeName]
  if (!nodeType) return false
  return nodeTypeActive(state, nodeType, attrs)
}
