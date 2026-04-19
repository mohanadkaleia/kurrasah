import { Plugin, PluginKey } from 'prosemirror-state'

// Public plugin key — exported so `Editor.vue` and the `SlashMenu` component
// can both read current state + dispatch meta transactions.
export const slashMenuKey = new PluginKey('slashMenu$')

// Meta actions understood by the plugin. Anything else on the meta channel
// is ignored. We intentionally keep the action vocabulary tiny.
export const SLASH_MENU_META = {
  OPEN_COMMAND_PALETTE: 'open-command-palette',
  CLOSE: 'close',
}

const DEFAULT_TRIGGER = '@'

/**
 * Build the ProseMirror plugin that tracks slash-menu state.
 *
 * @param {object} options
 * @param {string} [options.trigger]   Trigger character. Default `'@'`.
 * @param {boolean} [options.enabled]  If false, the plugin never activates
 *                                     the menu — used so `<Editor>` can
 *                                     opt consumers out without rebuilding.
 */
export function slashMenuPlugin({ trigger, enabled = true } = {}) {
  const triggerChar = typeof trigger === 'string' && trigger.length > 0
    ? trigger
    : DEFAULT_TRIGGER

  return new Plugin({
    key: slashMenuKey,
    state: {
      init() {
        return {
          active: false,
          range: null,
          query: '',
          source: null,
          trigger: triggerChar,
          enabled,
        }
      },
      apply(tr, prev) {
        // Honor the enabled flag: if off, the menu is always inactive.
        if (!prev.enabled) {
          // Still propagate trigger/enabled so external callers can read
          // them, but never activate.
          return { ...prev, active: false, range: null, query: '', source: null }
        }

        // Meta: close.
        const meta = tr.getMeta(slashMenuKey)
        if (meta && meta.action === SLASH_MENU_META.CLOSE) {
          return {
            ...prev,
            active: false,
            range: null,
            query: '',
            source: null,
          }
        }

        // Meta: open command palette at current cursor position. Range is
        // null (there is no trigger character to later strip).
        if (meta && meta.action === SLASH_MENU_META.OPEN_COMMAND_PALETTE) {
          return {
            ...prev,
            active: true,
            range: null,
            query: '',
            source: 'command',
          }
        }

        // Command-palette mode stays open across non-trigger transactions;
        // a selection change into a code block or similar shouldn't close
        // it. Only explicit CLOSE meta dismisses the palette. This lets
        // the Vue component drive dismissal on arrow navigation, Escape,
        // and outside click.
        if (prev.source === 'command' && prev.active) {
          return prev
        }

        // Trigger-character tracking (source: 'trigger'). Recompute from
        // the current selection on every tr so we reflect live typing,
        // deletions, and selection moves. Cheaper than trying to maintain
        // incremental state.
        const next = computeTriggerState(tr.doc, tr.selection, triggerChar)
        if (next) {
          return { ...prev, ...next, source: 'trigger' }
        }
        // Inactive.
        return {
          ...prev,
          active: false,
          range: null,
          query: '',
          source: null,
        }
      },
    },
  })
}

// Inspect the current selection + doc and return the trigger-state fields
// if the menu should be active, or null otherwise.
//
// Rules for activation:
//   - Selection must be a text selection (not a node selection).
//   - Cursor must be inside a text block that is NOT a code block.
//   - Looking backward from the cursor within the current block's text,
//     find the most recent trigger char. Characters between the trigger
//     and the cursor must all be word-characters (Arabic, Latin, digits,
//     underscore). Whitespace means the user typed past the query.
//   - The character immediately BEFORE the trigger must be either
//     start-of-block (i.e., the trigger is the first char) or a whitespace
//     character (space/tab/newline). This rejects `user@example.com`.
export function computeTriggerState(doc, selection, triggerChar) {
  if (!selection || selection.empty !== true) {
    // Non-text or non-collapsed selection — no trigger matching.
    if (!selection || !selection.$from || !selection.$to) return null
  }
  const { $from } = selection
  if (!$from) return null
  // Require a text block (not e.g. image inline selection).
  const parent = $from.parent
  if (!parent || !parent.isTextblock) return null
  // Code blocks are excluded — `@` is valid source text.
  if (parent.type.spec.code) return null

  const blockStart = $from.start()
  const cursor = $from.pos
  // Extract the text from block start up to cursor. `textBetween` with a
  // newline delimiter keeps offsets aligned 1:1 inside a single-block slice
  // for plain text. We pass `'\n'` for block separators (not used here but
  // safe) and `'\ufffc'` for leaves — any leaf between blockStart and
  // cursor would invalidate activation, so we check the length below.
  const textBefore = doc.textBetween(blockStart, cursor, '\n', '\ufffc')
  // Guard: if textBetween returned fewer chars than the position delta,
  // something non-text (an image inline, for example) is in the way. Bail.
  if (textBefore.length !== cursor - blockStart) return null

  // Find the last trigger char in textBefore that is followed only by
  // word characters up to the cursor.
  const lastIdx = textBefore.lastIndexOf(triggerChar)
  if (lastIdx === -1) return null

  const query = textBefore.slice(lastIdx + triggerChar.length)
  if (!isWordQuery(query)) return null

  // Validate the character before the trigger.
  if (lastIdx > 0) {
    const before = textBefore.charAt(lastIdx - 1)
    if (!isWhitespace(before)) return null
  }

  const triggerPos = blockStart + lastIdx
  return {
    active: true,
    range: { from: triggerPos, to: cursor },
    query,
  }
}

function isWhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
}

// "Word query" means: zero or more characters, none of which are whitespace.
// We allow any non-whitespace here (rather than a strict `\w` plus Arabic
// range) so typos like `h1!` still show "no results" instead of silently
// closing the menu. The net effect: the menu stays open as long as the user
// is typing on the same logical "word" — it dismisses on space.
function isWordQuery(s) {
  if (!s) return true
  for (let i = 0; i < s.length; i++) {
    if (isWhitespace(s.charAt(i))) return false
  }
  return true
}
