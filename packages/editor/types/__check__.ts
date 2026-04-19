// Type-only verification for @editor/core's hand-written `.d.ts`.
//
// Not part of the build; not published. Run from `packages/editor/`:
//
//   npx tsc --noEmit --strict types/__check__.ts
//
// Consumers resolve types via `package.json` `exports.types`, so we import
// from the package name (rather than `../src/index.js`) to exercise the
// real consumer path. This file has no runtime value — every expression
// below is a shape-check.

import {
  Editor,
  Toolbar,
  buildSchema,
  schema,
  parseMarkdown,
  serializeMarkdown,
  createMarkdownIO,
  isValidHttpUrl,
  MAX_HEADING_LEVEL,
  type EditorProps,
  type ToolbarProps,
  type LinkCallback,
  type ImageCallback,
  type LinkRequestContext,
  type ImageRequestContext,
  type LinkResult,
  type ImageResult,
  type EditorInstance,
  type EditorCommandName,
  type EditorEmits,
  type MarkdownIO,
  type BuildSchemaOptions,
} from '@editor/core'

// ---- Component references ----------------------------------------------
// Smoke-check that the component exports exist and are non-null.
const _editorComponent = Editor
const _toolbarComponent = Toolbar

// ---- Props shape --------------------------------------------------------
const props: EditorProps = {
  modelValue: '# hi',
  dir: 'rtl',
  images: true,
  links: true,
  placeholder: 'اكتب هنا',
  readonly: false,
  toolbar: 'minimal',
  onRequestLink: async ({ href, text }): Promise<LinkResult | null> => {
    if (!text) return null
    return { href: href ?? 'https://example.com' }
  },
  onRequestImage: async (_ctx: ImageRequestContext) => ({
    src: 'https://example.com/pic.png',
    alt: 'alt',
  }),
}

// `dir` must be one of the string literals.
// @ts-expect-error — 'diagonal' is not a valid writing direction.
const _badDir: EditorProps = { dir: 'diagonal' }

// `toolbar` accepts boolean | 'minimal' only.
const _toolbarTrue: EditorProps = { toolbar: true }
const _toolbarFalse: EditorProps = { toolbar: false }
const _toolbarMinimal: EditorProps = { toolbar: 'minimal' }
// @ts-expect-error — 'full' is not a valid toolbar mode.
const _badToolbar: EditorProps = { toolbar: 'full' }

// ---- Callback signatures -----------------------------------------------
const linkSync: LinkCallback = ({ href, text }) => {
  void text
  return href ? { href } : null
}
const linkAsync: LinkCallback = async (ctx: LinkRequestContext) => ({
  href: 'https://x.com',
  title: null,
})
const imgSync: ImageCallback = () => ({ src: 'https://x.com/p.png' })
const imgAsync: ImageCallback = async () => null

void linkSync
void linkAsync
void imgSync
void imgAsync

// ---- Emits tuple syntax -------------------------------------------------
// Exercise the tuple types directly.
const _updatePayload: EditorEmits['update:modelValue'] = ['# hello']
const _changePayload: EditorEmits['change'] = ['# world']
// `ready` payload is an `EditorView` — we don't construct one here, just
// assert the tuple length is 1.
type _ReadyArity = EditorEmits['ready']['length']
const _readyArity: _ReadyArity = 1

// ---- Exposed instance methods ------------------------------------------
declare const instance: EditorInstance
instance.focus()
const md: string = instance.getMarkdown()
instance.setMarkdown(md)
const ok: boolean = instance.execCommand('toggleBold')
void ok
// Command name is a string-literal union.
const cmdName: EditorCommandName = 'insertImage'
void cmdName
// @ts-expect-error — 'toggleRainbow' is not a known command.
const _badCmd: EditorCommandName = 'toggleRainbow'
// view getter is EditorView | null.
const maybeView = instance.view
void maybeView

// ---- Toolbar props ------------------------------------------------------
const _toolbarPropsNull: ToolbarProps = { editor: null }
const _toolbarPropsWithInstance: ToolbarProps = {
  editor: instance,
  dir: 'ltr',
}

// ---- Schema helpers -----------------------------------------------------
const opts: BuildSchemaOptions = { images: true, links: false }
const s = buildSchema(opts)
const s2 = buildSchema()
const defaultSchema = schema
void s
void s2
void defaultSchema
const maxLevel: 3 = MAX_HEADING_LEVEL
void maxLevel

// ---- Markdown helpers ---------------------------------------------------
const doc = parseMarkdown('# hi')
const roundtrip: string = serializeMarkdown(doc)
void roundtrip
const io: MarkdownIO = createMarkdownIO(schema)
const parsed = io.parseMarkdown('text')
const serialized: string = io.serializeMarkdown(parsed)
void serialized

// ---- Utilities ----------------------------------------------------------
// `isValidHttpUrl` is a type guard — inside the `if` block `x` is `string`.
const x: unknown = 'https://example.com'
if (isValidHttpUrl(x)) {
  const narrowed: string = x
  void narrowed
}
