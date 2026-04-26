// Per-block hover-controls helpers.
//
// This module is deliberately dependency-free at import time — no Vue, no
// ProseMirror static imports — so it can be unit-tested in isolation and
// kept tiny. It operates on an `EditorView` instance passed in by the
// caller.
//
// Responsibilities split between `BlockControls.vue` and this file:
//   - This file: pure helpers. Resolve the top-level block under cursor
//     coordinates, compute physical overlay coords for a given block.
//   - BlockControls.vue: reactive state, event listeners, DOM render,
//     slash-menu integration.

/**
 * Top-level block node types that receive the hover overlay.
 *
 * `list_item` is intentionally excluded — it's a child of a list and
 * single-item dragging is a different gesture than "move this block".
 * `hard_break` is inline and never a top-level block. `doc` is the
 * root and can't be a drag source.
 *
 * Consumers that add custom block nodes can extend this list by editing
 * the set below; it is not currently a public API surface.
 */
export const TOP_LEVEL_BLOCK_NAMES = Object.freeze([
  'paragraph',
  'heading',
  'blockquote',
  'code_block',
  'bullet_list',
  'ordered_list',
  'image',
])

const TOP_LEVEL_BLOCK_SET = new Set(TOP_LEVEL_BLOCK_NAMES)

/**
 * Resolve the top-level block at viewport-relative coords `(x, y)`. Returns
 * `null` when the point is outside the doc, over a disallowed node, or
 * when `view.posAtCoords` bails for any reason.
 *
 * Shape: `{ node, from, to }` — `from`/`to` are absolute document
 * positions (0-indexed, the usual PM convention). `from` points BEFORE
 * the block's opening and `to` points AFTER the block's closing, so
 * `doc.nodesBetween(from, to)` iterates the block and its contents, and
 * `view.state.doc.slice(from, to)` yields a slice suitable for drag.
 */
export function findTopLevelBlockAtCoords(view, x, y) {
  if (!view || !view.state || !view.state.doc) return null
  let hit = null
  try {
    hit = view.posAtCoords({ left: x, top: y })
  } catch {
    return null
  }
  if (!hit || typeof hit.pos !== 'number') return null

  const doc = view.state.doc
  // Prefer `pos` — PM reports it as the position at (or nearest to) the
  // coord, and resolving it gives us the block ancestry. `inside` is
  // PM's pointer "inside an atom" concept (non-text leaves like images);
  // it's frequently -1 for text blocks and can underpoint when it's
  // set. Clamp to the doc's content size defensively.
  let resolvePos = hit.pos
  if (resolvePos < 0) resolvePos = 0
  if (resolvePos > doc.content.size) resolvePos = doc.content.size

  let $pos
  try {
    $pos = doc.resolve(resolvePos)
  } catch {
    return null
  }

  // Walk up to depth 1 (the direct child of doc). Depth 0 is the doc
  // itself; any pos that resolves at depth 0 sits between top-level
  // blocks (e.g. exactly on a block boundary). Snap to the block just
  // AFTER the pos in that case — matches user intent when hovering near
  // the top of a block.
  if ($pos.depth < 1) {
    const childIdx = $pos.indexAfter(0)
    if (childIdx >= doc.childCount) return null
    const child = doc.child(childIdx)
    if (!TOP_LEVEL_BLOCK_SET.has(child.type.name)) return null
    let offset = 0
    for (let i = 0; i < childIdx; i++) offset += doc.child(i).nodeSize
    return { node: child, from: offset, to: offset + child.nodeSize }
  }

  const blockNode = $pos.node(1)
  if (!blockNode || !TOP_LEVEL_BLOCK_SET.has(blockNode.type.name)) return null

  const from = $pos.before(1)
  const to = from + blockNode.nodeSize
  return { node: blockNode, from, to }
}

/**
 * Compute physical viewport coords for the overlay next to a block.
 *
 * We deliberately use physical `left` / `top` here (NOT logical
 * `inset-inline-start`). Under `dir="rtl"` an ancestor with
 * `inset-inline-start: 10px` places the element 10px from the RIGHT edge
 * of its containing block. For an overlay anchored to a specific cursor
 * position that's reported in viewport pixels, we always want the
 * physical offset — the slash menu hit this same bug and we learned
 * to use `left` / `top` unconditionally for the absolute positioning.
 *
 * The LOGICAL "start edge" of the block is determined from `dir`:
 *   - LTR: the block's physical left edge — overlay sits at
 *     `left = leftRect.left - overlayWidth - gap`.
 *   - RTL: the block's physical right edge — overlay sits at
 *     `left = rightRect.right + gap`.
 *
 * Returns `null` when `view.coordsAtPos` fails (detached view, etc.).
 */
export function computeControlsPosition({
  view,
  from,
  to,
  dir,
  overlayWidth = 48,
  gap = 8,
}) {
  if (!view || typeof from !== 'number' || typeof to !== 'number') return null
  let leftRect, rightRect
  try {
    // `from` is the position BEFORE the block opens. Nudge to `from + 1`
    // so `coordsAtPos` lands inside the block — PM returns the rect of
    // the first text position, which is what we want for vertical
    // alignment.
    leftRect = view.coordsAtPos(Math.min(from + 1, to - 1))
    // `to - 1` lands at the last inline position inside the block, which
    // for wrapped blocks reports the bottom-right rect. For single-line
    // blocks it's the same physical right edge as the start rect.
    rightRect = view.coordsAtPos(Math.max(to - 1, from + 1))
  } catch {
    return null
  }
  if (!leftRect) return null

  const isRtl = dir === 'rtl'
  // For RTL: the start edge is visually on the right. We use the rightmost
  // x coordinate observed between the two rects (handles wrapped blocks
  // where `leftRect.right` would be mid-line).
  //
  // Vertical alignment: we return the midpoint of the first line's rect,
  // not its top. The overlay's CSS adds `transform: translateY(-50%)` so
  // its own vertical center snaps to this value — the result is
  // line-aligned regardless of overlay height, line-height, or whether
  // the hovered block is a paragraph (~1.7em) or a heading (~1.25em).
  const lineCenter = (leftRect.top + leftRect.bottom) / 2
  const blockTop = Math.round(lineCenter)
  const left = isRtl
    ? Math.round(Math.max(leftRect.right, rightRect ? rightRect.right : leftRect.right) + gap)
    : Math.round(Math.min(leftRect.left, rightRect ? rightRect.left : leftRect.left) - overlayWidth - gap)

  return { left, top: blockTop }
}
