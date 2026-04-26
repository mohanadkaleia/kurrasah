import { history } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import {
  baseKeymap,
  chainCommands,
  exitCode,
  newlineInCode,
  createParagraphNear,
  liftEmptyBlock,
  splitBlock,
} from 'prosemirror-commands'
import {
  splitListItem,
  liftListItem,
  sinkListItem,
} from 'prosemirror-schema-list'
import {
  inputRules,
  wrappingInputRule,
  textblockTypeInputRule,
  undoInputRule,
  InputRule,
} from 'prosemirror-inputrules'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { undo, redo } from 'prosemirror-history'
import {
  tableEditing,
  goToNextCell,
  addRowAfter,
  isInTable,
} from 'prosemirror-tables'
import {
  toggleBold,
  toggleItalic,
  toggleCode,
  toggleBlockquote,
  toggleBulletList,
  toggleOrderedList,
  setHeading,
  toggleLink,
} from './commands.js'
import { MAX_HEADING_LEVEL } from './schema.js'
import { slashMenuPlugin, slashMenuKey, SLASH_MENU_META } from './slashMenuPlugin.js'

// Build an input rule for inline marks like `**bold**`, `*italic*`,
// and `` `code` ``. The regex must match the closing delimiter typed by
// the user — i.e., the second `*` or the second backtick.
//
// Expected capture groups: [fullMatch, leading, openMarker, inner].
//  - `leading` (optional): any non-marker text consumed before the opening
//    delimiter. Left alone in the replacement. Used to avoid matching the
//    `**bold**` sequence as an `em` rule. At start-of-block `leading` is ''.
//  - `openMarker`: the opening delimiter (`*`, `**`, or `` ` ``).
//  - `inner`: the marked-up text.
function markInputRule(regexp, markType, getAttrs) {
  return new InputRule(regexp, (state, match, start, end) => {
    const attrs = getAttrs instanceof Function ? getAttrs(match) : getAttrs
    const [, leading = '', openMarker, inner] = match
    if (inner == null || openMarker == null) return null
    const tr = state.tr
    const innerStart = start + leading.length
    // Replace only the `openMarker + inner + closeMarker` slice, preserving
    // any `leading` text that the regex consumed to disambiguate.
    tr.replaceWith(
      innerStart,
      end,
      state.schema.text(inner, [])
    )
    tr.addMark(innerStart, innerStart + inner.length, markType.create(attrs))
    tr.removeStoredMark(markType)
    return tr
  })
}

function buildInputRules(schema) {
  const rules = []

  // Headings: `# `, `## `, `### ` at the start of a block.
  if (schema.nodes.heading) {
    rules.push(
      textblockTypeInputRule(
        new RegExp('^(#{1,' + MAX_HEADING_LEVEL + '})\\s$'),
        schema.nodes.heading,
        (match) => ({ level: match[1].length })
      )
    )
  }

  // Bullet list: `- ` or `* ` at start.
  if (schema.nodes.bullet_list) {
    rules.push(wrappingInputRule(/^\s*([-*])\s$/, schema.nodes.bullet_list))
  }

  // Ordered list: `1. ` at start.
  if (schema.nodes.ordered_list) {
    rules.push(
      wrappingInputRule(
        /^(\d+)\.\s$/,
        schema.nodes.ordered_list,
        (match) => ({ order: +match[1] }),
        (match, node) => node.childCount + node.attrs.order === +match[1]
      )
    )
  }

  // Blockquote: `> `.
  if (schema.nodes.blockquote) {
    rules.push(wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote))
  }

  // Code block: ``` at start of a paragraph.
  if (schema.nodes.code_block) {
    rules.push(
      textblockTypeInputRule(/^```$/, schema.nodes.code_block)
    )
  }

  // Inline marks. Each regex captures (leading, openMarker, inner).
  if (schema.marks.strong) {
    // Match `**text**` where `text` has no leading/trailing space and does
    // not contain `**`. Fires when the user types the final `*`.
    rules.push(
      markInputRule(
        /()(\*\*)([^*\s](?:[^*]*[^*\s])?)\*\*$/,
        schema.marks.strong
      )
    )
  }
  if (schema.marks.em) {
    // Match `*text*`. Avoid matching the `**bold**` case by requiring the
    // character before the opening `*` not be another `*`. At start-of-block
    // the leading group is empty — which is what we want. `[^*\s]` in the
    // inner group prevents `* text*` from firing with a leading space.
    rules.push(
      markInputRule(
        /(^|[^*])(\*)([^*\s](?:[^*]*[^*\s])?)\*$/,
        schema.marks.em
      )
    )
  }
  if (schema.marks.code) {
    rules.push(
      markInputRule(
        /()(`)([^`\s](?:[^`]*[^`\s])?)`$/,
        schema.marks.code
      )
    )
  }

  return inputRules({ rules })
}

function buildKeymap(schema) {
  const binds = {}

  function bind(key, cmd) {
    binds[key] = cmd
  }

  // Bind `Mod-z` to `undoInputRule` first so that undoing an input-rule
  // transformation (e.g. `# ` → heading) reverts to the literal text
  // instead of popping the whole heading off the history stack. Fall
  // through to `undo` when no input rule was just applied.
  bind('Mod-z', chainCommands(undoInputRule, undo))
  bind('Shift-Mod-z', redo)
  bind('Mod-y', redo)

  if (schema.marks.strong) {
    bind('Mod-b', toggleBold(schema))
    bind('Mod-B', toggleBold(schema))
  }
  if (schema.marks.em) {
    bind('Mod-i', toggleItalic(schema))
    bind('Mod-I', toggleItalic(schema))
  }
  if (schema.marks.code) {
    bind('Mod-`', toggleCode(schema))
  }
  // `Mod-k` plays two roles depending on whether the selection is empty:
  //   - Non-empty selection  → toggle a link mark (pre-existing behavior).
  //   - Empty selection      → open the slash menu's command-palette path.
  // The slash plugin's state carries the enabled flag, so when a consumer
  // sets `slashEnabled: false` the first branch is a no-op and `Mod-k`
  // still falls through to `toggleLink` for link-wrapping.
  const slashCommandPaletteCmd = (state, dispatch) => {
    const sm = slashMenuKey.getState(state)
    if (!sm || !sm.enabled) return false
    if (!state.selection.empty) return false
    if (dispatch) {
      dispatch(
        state.tr.setMeta(slashMenuKey, {
          action: SLASH_MENU_META.OPEN_COMMAND_PALETTE,
        })
      )
    }
    return true
  }
  if (schema.marks.link) {
    const link = toggleLink(schema)
    bind('Mod-k', chainCommands(slashCommandPaletteCmd, link))
    bind('Mod-K', chainCommands(slashCommandPaletteCmd, link))
  } else {
    bind('Mod-k', slashCommandPaletteCmd)
    bind('Mod-K', slashCommandPaletteCmd)
  }

  if (schema.nodes.blockquote) {
    bind('Ctrl->', toggleBlockquote(schema))
  }
  if (schema.nodes.bullet_list) {
    bind('Shift-Ctrl-8', toggleBulletList(schema))
  }
  if (schema.nodes.ordered_list) {
    bind('Shift-Ctrl-9', toggleOrderedList(schema))
  }

  // H1/H2/H3 keyboard shortcuts.
  if (schema.nodes.heading) {
    for (let level = 1; level <= MAX_HEADING_LEVEL; level++) {
      bind('Shift-Ctrl-' + level, setHeading(schema, level))
    }
  }

  // Mod-Enter exits a code block into a following paragraph (no-op outside
  // a code block).
  if (schema.nodes.code_block) {
    bind('Mod-Enter', exitCode)
  }

  // Shift-Enter inserts a hard break. Inside a code block the chained
  // `exitCode` runs first so Shift-Enter exits the block rather than
  // inserting a literal `<br>` into it.
  if (schema.nodes.hard_break) {
    bind(
      'Shift-Enter',
      chainCommands(exitCode, (state, dispatch) => {
        const br = schema.nodes.hard_break
        if (!br) return false
        if (dispatch) {
          dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView())
        }
        return true
      })
    )
  }

  // Enter inside a code block: if the cursor is at the end of the block
  // AND the preceding character is a newline (i.e. the user already hit
  // Enter once and is about to produce a visually-empty line), remove
  // that trailing newline and run `exitCode` to drop a paragraph after
  // the block. Without this the user gets stuck inside the block —
  // plain Enter only ever inserts another `\n`.
  function exitCodeBlockOnEmptyLine(state, dispatch, view) {
    const codeBlockType = schema.nodes.code_block
    if (!codeBlockType) return false
    const { $from, empty } = state.selection
    if (!empty) return false
    const node = $from.parent
    if (node.type !== codeBlockType) return false
    // Must be at the end of the block's content.
    if ($from.parentOffset !== node.content.size) return false
    // Must be immediately after a newline (or the code block must be
    // empty — two Enters from an empty block exits).
    const text = node.textContent
    if (text.length > 0 && !text.endsWith('\n')) return false
    if (!dispatch) return true
    // If there's a trailing `\n`, drop it before exiting so the code
    // block doesn't keep an invisible blank line.
    if (text.endsWith('\n')) {
      dispatch(state.tr.delete($from.pos - 1, $from.pos))
      return exitCode(view.state, view.dispatch)
    }
    // Empty code block → just exit.
    return exitCode(state, dispatch)
  }

  // Enter on an empty list item exits the list. `splitListItem` is the
  // canonical ProseMirror command for lists: when the selection is at the
  // end of a non-empty item it inserts a new item; when the item is empty
  // it lifts the item out of the list (exiting the list). It must run
  // before `liftEmptyBlock`/`splitBlock` so the list-exit behaviour wins
  // over a generic block split. The code-block-exit check runs before
  // `newlineInCode` so double-Enter escapes the block.
  if (schema.nodes.list_item) {
    bind(
      'Enter',
      chainCommands(
        exitCodeBlockOnEmptyLine,
        newlineInCode,
        createParagraphNear,
        splitListItem(schema.nodes.list_item),
        liftEmptyBlock,
        splitBlock
      )
    )
    // Tab / Shift-Tab: inside a table, `goToNextCell` moves between cells.
    // Upstream `goToNextCell(1)` returns `false` when there is no next
    // cell (i.e., the cursor is in the very last cell of the very last
    // row) — it does NOT auto-create a new row. We chain a small fallback
    // that adds a row and then advances into it, so Tab past the last
    // cell creates a new row and lands the cursor in its first cell.
    //
    // Outside a table, fall through to the list-item sink/lift so the
    // existing list behaviour is preserved. `chainCommands` stops at the
    // first command that returns `true`, so the table handlers only win
    // when the selection is actually inside a cell.
    if (schema.nodes.table) {
      const goToNextOrAddRow = (state, dispatch, view) => {
        if (!isInTable(state)) return false
        // Try the upstream "move to next cell" first.
        if (goToNextCell(1)(state, dispatch, view)) return true
        // No next cell — we're in the last cell of the last row.
        // Add a new row, then move into its first cell.
        if (!dispatch) return true
        if (!addRowAfter(state, dispatch)) return false
        // After the dispatch, the view's state has the new row. Run
        // `goToNextCell(1)` against the up-to-date state so the
        // selection lands inside the freshly inserted row's first
        // cell.
        if (view) {
          goToNextCell(1)(view.state, view.dispatch)
        }
        return true
      }
      bind(
        'Tab',
        chainCommands(goToNextOrAddRow, sinkListItem(schema.nodes.list_item))
      )
      bind(
        'Shift-Tab',
        chainCommands(
          goToNextCell(-1),
          liftListItem(schema.nodes.list_item)
        )
      )
    } else {
      bind('Tab', sinkListItem(schema.nodes.list_item))
      bind('Shift-Tab', liftListItem(schema.nodes.list_item))
    }
  }

  return binds
}

// Public key so the editor can dispatch a meta transaction to update the
// placeholder text in place without rebuilding the view (which would wipe
// the undo stack).
export const placeholderKey = new PluginKey('editorCorePlaceholder')

// Placeholder plugin. Stores the current placeholder string in plugin state
// and renders it as a CSS-visible hint decoration on the lone empty first
// paragraph. Consumers update the text by dispatching a transaction with
// `tr.setMeta(placeholderKey, newText)`; the plugin's `apply` reads the meta
// and rewrites state, and the decoration function picks the new value up on
// the next render cycle.
function placeholderPlugin(text) {
  return new Plugin({
    key: placeholderKey,
    state: {
      init() {
        return text || ''
      },
      apply(tr, value) {
        const meta = tr.getMeta(placeholderKey)
        if (typeof meta === 'string') return meta
        return value
      },
    },
    props: {
      decorations(state) {
        const current = placeholderKey.getState(state)
        if (!current) return null
        const { doc } = state
        if (doc.childCount !== 1) return null
        const firstChild = doc.firstChild
        if (!firstChild || firstChild.content.size > 0) return null
        if (firstChild.type.name !== 'paragraph') return null
        const placeholderDeco = Decoration.node(0, firstChild.nodeSize, {
          class: 'editor-placeholder',
          'data-placeholder': current,
        })
        return DecorationSet.create(doc, [placeholderDeco])
      },
    },
  })
}

// Trailing-paragraph guard. Ensures the user can always navigate the
// caret past a "trapping" block (table, code block, blockquote, list)
// by enforcing two invariants on the doc's top-level children:
//
//   1. The doc never ENDS in a trapping block — a paragraph is appended
//      after one if it does, so ArrowDown / Enter at the cell boundary
//      always has a target.
//   2. Two trapping blocks are never adjacent — a paragraph is inserted
//      between them so the user can place the caret between two tables
//      (or a table and a code block, etc.).
//
// Plain paragraph endings and paragraph-separated blocks are left alone:
// adding extra trailing `\n` to plain prose would churn the serialized
// markdown and surprise consumers reading `getMarkdown()`.
const TRAILING_GUARD_TYPES = [
  'table',
  'code_block',
  'blockquote',
  'bullet_list',
  'ordered_list',
]
/**
 * Build a transaction that enforces the trailing-paragraph invariants on
 * the given state, or return `null` if the doc already satisfies them.
 *
 * Exported so `Editor.vue` can run the enforcement once on view creation
 * — the initial state never goes through `appendTransaction` (no
 * `docChanged` event), so a doc parsed from markdown that ends in a
 * trapping block (or stacks two of them, since markdown collapses
 * separating empty paragraphs on serialize) would otherwise stay
 * un-enforced until the user types.
 */
export function enforceTrailingParagraphs(state) {
  const schema = state.schema
  const trappingTypes = new Set(
    TRAILING_GUARD_TYPES.map((name) => schema.nodes[name]).filter(Boolean)
  )
  const paragraphType = schema.nodes.paragraph
  if (!paragraphType || trappingTypes.size === 0) return null
  const doc = state.doc
  if (doc.childCount === 0) return null
  const insertAt = []
  let pos = 0
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i)
    const childEnd = pos + child.nodeSize
    if (trappingTypes.has(child.type)) {
      const isLast = i === doc.childCount - 1
      const next = isLast ? null : doc.child(i + 1)
      const nextTrapping = next ? trappingTypes.has(next.type) : false
      if (isLast || nextTrapping) insertAt.push(childEnd)
    }
    pos = childEnd
  }
  if (insertAt.length === 0) return null
  const tr = state.tr
  for (let i = insertAt.length - 1; i >= 0; i--) {
    const para = paragraphType.createAndFill()
    if (para) tr.insert(insertAt[i], para)
  }
  return tr.docChanged ? tr : null
}

function trailingParagraphPlugin(schema) {
  const trappingTypes = new Set(
    TRAILING_GUARD_TYPES.map((name) => schema.nodes[name]).filter(Boolean)
  )
  const paragraphType = schema.nodes.paragraph
  if (!paragraphType || trappingTypes.size === 0) {
    return new Plugin({})
  }
  return new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null
      return enforceTrailingParagraphs(newState)
    },
  })
}

// Build the plugin list for an editor. `readonly` returns a minimal set
// (no keymap, no input rules, no history) because the view is not editable.
//
// Slash-menu flags (`slashEnabled`, `slashTrigger`) are threaded through to
// the plugin so `<Editor>` can pass them down without knowing about the
// plugin's internals. Readonly mode never installs the slash plugin — the
// user can't type a trigger and the command-palette keymap isn't registered.
export function buildPlugins({
  schema,
  placeholder = '',
  readonly = false,
  slashEnabled = true,
  slashTrigger = '@',
} = {}) {
  if (readonly) {
    const plugins = []
    if (placeholder) plugins.push(placeholderPlugin(placeholder))
    return plugins
  }

  const plugins = [
    buildInputRules(schema),
    keymap(buildKeymap(schema)),
    keymap(baseKeymap),
    history(),
    placeholderPlugin(placeholder),
    slashMenuPlugin({ trigger: slashTrigger, enabled: slashEnabled }),
  ]

  // Trailing-paragraph guard. When the last block in the doc is a
  // "trapping" type — a table, code block, blockquote, or list — the
  // user has nowhere to navigate to after it: there's no paragraph
  // below to receive the caret on ArrowDown, and inside a table cell
  // there's no Enter shortcut that escapes the table cleanly. The
  // plugin appends an empty paragraph after every transaction whose
  // result leaves the doc ending in one of those types. Plain
  // paragraph endings are left alone so we don't silently produce
  // trailing blank lines on serialize for normal docs.
  plugins.push(trailingParagraphPlugin(schema))

  // Table editing plugin. Hooks off `schema.nodes.table` internally;
  // guarding here keeps the plugin stack small in a hypothetical
  // reduced-schema build. Column resizing was dropped after v0.5.0
  // — the schema's `colwidth` attribute survives (it's part of
  // `tableNodes`) but no resize handle ships.
  if (schema.nodes.table) {
    plugins.push(tableEditing())
  }

  return plugins
}
