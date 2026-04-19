// Slash-menu item catalog + filter helper. Plain data module — no ProseMirror
// or Vue imports — so the file is easy to test and easy to mock.
//
// Each item is a descriptor that the menu component renders and dispatches:
//   - id           stable key used for Vue :key and selection identity.
//   - label        Arabic user-facing label. Rendered bold in the menu row.
//   - description  short Arabic description, de-emphasized.
//   - aliases      array of strings (English + transliterated + Arabic
//                  synonyms). The query match runs against label + aliases.
//   - icon         inline SVG markup. Rendered via v-html inside a fixed-
//                  size wrapper. We ship inline SVGs (not class names for
//                  Font Awesome / Material Icons) so the package works
//                  without any consumer-side icon font setup. Keep them
//                  small; they inline into every item row.
//   - command      name of a `commandFactories[name]` entry in commands.js.
//   - args         optional array of args passed after the schema.
//
// Icons are intentionally tiny — 16×16, currentColor stroke — so they
// inherit the editor's text color (enforcing the black/white aesthetic)
// and stay legible at the default font size.

/** @type {ReadonlyArray<object>} */
export const DEFAULT_SLASH_ITEMS = [
  {
    id: 'paragraph',
    label: 'فقرة',
    description: 'نصّ عادي',
    aliases: ['paragraph', 'p', 'text', 'فقرة', 'نص'],
    icon: svgParagraph(),
    command: 'setParagraph',
    args: [],
  },
  {
    id: 'heading-1',
    label: 'عنوان 1',
    description: 'عنوان رئيسي كبير',
    aliases: ['heading 1', 'h1', 'عنوان 1', 'ترويسة 1'],
    icon: svgHeading(1),
    command: 'setHeading',
    args: [1],
  },
  {
    id: 'heading-2',
    label: 'عنوان 2',
    description: 'عنوان من المستوى الثاني',
    aliases: ['heading 2', 'h2', 'عنوان 2', 'ترويسة 2'],
    icon: svgHeading(2),
    command: 'setHeading',
    args: [2],
  },
  {
    id: 'heading-3',
    label: 'عنوان 3',
    description: 'عنوان من المستوى الثالث',
    aliases: ['heading 3', 'h3', 'عنوان 3', 'ترويسة 3'],
    icon: svgHeading(3),
    command: 'setHeading',
    args: [3],
  },
  {
    id: 'bullet-list',
    label: 'قائمة نقطية',
    description: 'قائمة غير مرتّبة',
    aliases: ['bullet', 'bullet list', 'ul', 'unordered', 'قائمة', 'قائمة نقطية'],
    icon: svgBulletList(),
    command: 'toggleBulletList',
    args: [],
  },
  {
    id: 'ordered-list',
    label: 'قائمة مرقمة',
    description: 'قائمة مرتّبة بالأرقام',
    aliases: ['ordered', 'ordered list', 'ol', 'numbered', 'قائمة مرقمة'],
    icon: svgOrderedList(),
    command: 'toggleOrderedList',
    args: [],
  },
  {
    id: 'blockquote',
    label: 'اقتباس',
    description: 'كتلة اقتباس',
    aliases: ['quote', 'blockquote', 'اقتباس'],
    icon: svgQuote(),
    command: 'toggleBlockquote',
    args: [],
  },
  {
    id: 'code-block',
    label: 'كتلة شيفرة',
    description: 'كتلة شيفرة بخط أحادي العرض',
    aliases: ['code', 'code block', 'pre', 'كود', 'شيفرة'],
    icon: svgCodeBlock(),
    command: 'toggleCodeBlock',
    args: [],
  },
  {
    id: 'image',
    label: 'صورة',
    description: 'إدراج صورة من رابط',
    aliases: ['image', 'img', 'picture', 'صورة'],
    icon: svgImage(),
    command: 'insertImage',
    args: [],
  },
]

// Case-insensitive substring match against label + aliases joined by a space.
// An empty (or whitespace-only) query returns the full list — no-op filter,
// used by the command-palette entry point. Arabic characters pass through
// `.toLowerCase()` unchanged, so this works for both script families.
export function filterSlashItems(items, query) {
  if (!items || !Array.isArray(items)) return []
  const q = (query || '').trim().toLowerCase()
  if (!q) return items.slice()
  return items.filter((item) => {
    const haystack = [item.label, ...(item.aliases || [])]
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
}

// --- Icon markup --------------------------------------------------------
//
// Minimal inline SVGs. Each returns a string that the component drops into
// the row via v-html. Stroke uses `currentColor` so the icon inherits the
// black/white theme. The viewBox stays 16×16 so icons line up regardless
// of their shape.

function svgParagraph() {
  return `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M3 3h10M3 7h10M3 11h7"/>
</svg>`
}

function svgHeading(level) {
  // HTML text rather than SVG <text>: SVG's <text> inherits bidi from the
  // document direction, and under an RTL ancestor the "H1" string renders
  // with the digit mirrored or glyph-substituted. A plain HTML span with
  // an explicit dir="ltr" is the safest path and looks cleaner anyway.
  return `<span class="kurrasah-slash-menu-glyph" dir="ltr" aria-hidden="true">H${level}</span>`
}

function svgBulletList() {
  return `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<circle cx="3" cy="4" r="1" fill="currentColor"/>
<circle cx="3" cy="8" r="1" fill="currentColor"/>
<circle cx="3" cy="12" r="1" fill="currentColor"/>
<path d="M6.5 4h7M6.5 8h7M6.5 12h7"/>
</svg>`
}

function svgOrderedList() {
  // No <text> — same bidi reason as the heading icon. Use thick short
  // horizontal marks on the left as digit-stand-ins, and longer thin
  // lines on the right for the list content. Distinct from the bullet
  // icon (which uses round dots).
  return `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true">
<path d="M2 4h2M2 8h2M2 12h2" stroke-width="2"/>
<path d="M6.5 4h7M6.5 8h7M6.5 12h7" stroke-width="1.25"/>
</svg>`
}

function svgQuote() {
  return `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M3 3v10"/>
<path d="M6 5h7M6 8h7M6 11h5"/>
</svg>`
}

function svgCodeBlock() {
  return `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M5 5 2 8l3 3"/>
<path d="M11 5l3 3-3 3"/>
<path d="M9 3.5 7 12.5"/>
</svg>`
}

function svgImage() {
  return `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<rect x="2" y="3" width="12" height="10" rx="1.5"/>
<circle cx="6" cy="7" r="1.25"/>
<path d="m2.5 12 3.5-3.5 3 3 2-2 4 4"/>
</svg>`
}
