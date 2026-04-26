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
import { TextSelection } from 'prosemirror-state'
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
// once on an invalid answer and aborts silently on the second invalid answer
// or on cancel. Returns the trimmed URL or null. Messages are caller-supplied
// so the package stays locale-neutral; see `toggleLink` / `insertImage` for
// the default English strings used when no callback is provided.
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

// Read the consumer-supplied link/image callbacks that `Editor.vue` stashes
// on the view. We avoid stuffing this into EditorState because it is a
// transient UI concern, not document state. Returns `null` when not set.
function getRequestCallbacks(view) {
  if (!view) return null
  return view._editorCoreRequests || null
}

// Apply a link mark with `{href, title}` to the current selection range,
// using the current state of the view. Used by the async callback path so
// we can dispatch after an await against whatever state the view is in
// then — not the state captured at command-dispatch time.
function applyLinkAtCurrentSelection(view, markType, attrs) {
  if (!view) return
  const state = view.state
  const { from, to, empty } = state.selection
  if (empty) return
  const tr = state.tr.addMark(from, to, markType.create(attrs))
  view.dispatch(tr)
}

// Insert an image node at the current selection of the view. Same rationale
// as `applyLinkAtCurrentSelection` — fresh state after await.
function insertImageAtCurrentSelection(view, imageType, attrs) {
  if (!view) return
  const node = imageType.createAndFill(attrs)
  if (!node) return
  const state = view.state
  view.dispatch(state.tr.replaceSelectionWith(node).scrollIntoView())
}

// Insert or remove a link mark.
//
// Resolution order when `href` is omitted:
//   1. Consumer-provided `onRequestLink` callback (stashed on the view by
//      `Editor.vue`) — lets the consumer render localized UI. Can return a
//      Promise; when it resolves we apply against the view's then-current
//      state. A `null` return is treated as "cancelled" and the command is
//      a no-op. Validation still runs: an invalid `href` is dropped silently.
//   2. Fallback `window.prompt` with neutral English strings. The package
//      stays monolingual here on purpose — consumers who want Arabic UX
//      should supply `onRequestLink`.
//
// Programmatic callers passing an explicit `href` bypass both paths.
export function toggleLink(schema, href, title) {
  const markType = schema.marks.link
  if (!markType) return () => false
  return (state, dispatch, view) => {
    const active = markActive(state, markType)
    if (active) {
      return toggleMark(markType)(state, dispatch, view)
    }

    // Explicit programmatic call.
    if (href != null) {
      if (!isValidHttpUrl(href)) return false
      return toggleMark(markType, { href, title: title || null })(
        state,
        dispatch,
        view
      )
    }

    const callbacks = getRequestCallbacks(view)
    if (callbacks && typeof callbacks.link === 'function') {
      // Callback path: return `true` eagerly so the dispatcher treats this
      // as a successful command (the same way a sync prompt would if the
      // user accepted). The actual edit is dispatched asynchronously once
      // the callback resolves, against the view's current state.
      //
      // `context.href` is taken from the start of the selection only
      // (`$from.marks()`). For a mixed selection where some characters
      // carry the link mark and some don't, this surfaces the first run's
      // href and ignores the rest — consumers that care about mixed state
      // should compare against the full range themselves.
      //
      // Stamp the view so the dispatcher skips its auto-focus call; the
      // consumer modal needs focus.
      view._editorCoreAsyncPending = true
      const existing = Array.from(state.selection.$from.marks()).find(
        (m) => m.type === markType
      )
      const context = {
        href: existing ? existing.attrs.href : undefined,
        text: state.doc.textBetween(
          state.selection.from,
          state.selection.to,
          ' '
        ),
      }
      Promise.resolve(callbacks.link(context))
        .then((result) => {
          if (!result || typeof result !== 'object') return
          const nextHref = result.href
          if (!isValidHttpUrl(nextHref)) return
          applyLinkAtCurrentSelection(view, markType, {
            href: nextHref,
            title: result.title || null,
          })
        })
        .catch((err) => {
          // Don't crash the editor, but surface for debugging. Silent
          // swallowing of callback errors is a debugging nightmare.
          // eslint-disable-next-line no-console
          console.error('[kurrasah] onRequestLink callback failed:', err)
        })
      return true
    }

    // Default: synchronous `window.prompt` with neutral English strings.
    const finalHref = promptForHttpUrl('Link URL')
    if (!finalHref) return false
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
  return (state, dispatch, view) => {
    // Explicit programmatic call.
    if (url != null) {
      if (!isValidHttpUrl(url)) return false
      const node = imageType.createAndFill({
        src: url,
        alt: alt || null,
        title: title || null,
      })
      if (!node) return false
      if (dispatch) {
        dispatch(state.tr.replaceSelectionWith(node).scrollIntoView())
      }
      return true
    }

    const callbacks = getRequestCallbacks(view)
    if (callbacks && typeof callbacks.image === 'function') {
      // Same async pattern as toggleLink above. Stamp the view so the
      // dispatcher skips its auto-focus call; consumer modal needs focus.
      view._editorCoreAsyncPending = true
      Promise.resolve(callbacks.image({}))
        .then((result) => {
          if (!result || typeof result !== 'object') return
          const src = result.src
          if (!isValidHttpUrl(src)) return
          insertImageAtCurrentSelection(view, imageType, {
            src,
            alt: result.alt || null,
            title: result.title || null,
          })
        })
        .catch((err) => {
          // Don't crash the editor, but surface for debugging.
          // eslint-disable-next-line no-console
          console.error('[kurrasah] onRequestImage callback failed:', err)
        })
      return true
    }

    // Default: synchronous `window.prompt` with neutral English strings.
    const src = promptForHttpUrl('Image URL')
    if (!src) return false
    let finalAlt = alt
    if (finalAlt == null) {
      if (typeof window !== 'undefined' && window.prompt) {
        finalAlt = window.prompt('Alt text (optional)') || ''
      } else {
        finalAlt = ''
      }
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

/**
 * Insert a fresh GFM-style table at the current selection.
 *
 * Options:
 *   rows        number of rows (including the header row when `withHeader`
 *               is true). Default 3. Clamped to [1, 20] so a typo in the
 *               slash-menu args doesn't blow the document up.
 *   cols        number of columns. Default 3. Same clamp.
 *   withHeader  if true, the first row uses `table_header` cells; otherwise
 *               all rows use `table_cell`. Default true. GFM requires a
 *               header row, so serialization synthesizes one even when this
 *               is false — but the editor experience is clearer if the
 *               actual node is a header.
 *
 * Places the cursor inside the first cell of the inserted table. Returns
 * false if the schema lacks table nodes (i.e. the consumer built a custom
 * schema without them — unsupported in v1 but left as a soft-fail).
 */
export function insertTable(schema, options = {}) {
  const tableType = schema.nodes.table
  const rowType = schema.nodes.table_row
  const cellType = schema.nodes.table_cell
  const headerType = schema.nodes.table_header
  if (!tableType || !rowType || !cellType || !headerType) {
    return () => false
  }

  const { rows = 3, cols = 3, withHeader = true } = options || {}
  // Clamp to a sensible range — user-provided args from the slash menu are
  // mostly fine, but a malformed preset shouldn't create a 10000x10000
  // table and OOM the tab.
  const rowCount = Math.max(1, Math.min(rows | 0 || 1, 20))
  const colCount = Math.max(1, Math.min(cols | 0 || 1, 20))

  return (state, dispatch) => {
    // Cells have `content: 'inline*'` — `*`, not `+` — so empty cells are
    // valid without fill content. `createAndFill` returns an empty cell
    // directly.
    const buildRow = (useHeader) => {
      const cells = []
      for (let c = 0; c < colCount; c++) {
        const cellNodeType = useHeader ? headerType : cellType
        cells.push(cellNodeType.createAndFill())
      }
      return rowType.create(null, cells)
    }

    const rowsArr = []
    for (let r = 0; r < rowCount; r++) {
      rowsArr.push(buildRow(withHeader && r === 0))
    }
    const table = tableType.create(null, rowsArr)

    if (dispatch) {
      // Remember the insertion start position so we can compute the
      // first-cell cursor target *after* the replace lands.
      const { from } = state.selection
      const tr = state.tr.replaceSelectionWith(table)
      // Boundary layout after insertion (using `from` as the position of
      // the table_open boundary that replaceSelectionWith writes):
      //   from + 0   table_open
      //   from + 1   row_open
      //   from + 2   header_open (or cell_open)
      //   from + 3   first valid cursor position inside the cell
      //
      // `TextSelection.near` resolves against the post-insert doc and
      // lands the cursor on the closest valid text position.
      const targetPos = from + 3
      const targetDoc = tr.doc
      if (targetPos <= targetDoc.content.size) {
        tr.setSelection(TextSelection.near(targetDoc.resolve(targetPos)))
      }
      tr.scrollIntoView()
      dispatch(tr)
    }
    return true
  }
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
  insertTable,
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
    insertTable: (options) => insertTable(schema, options),
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
