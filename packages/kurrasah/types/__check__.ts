// Type-only verification for kurrasah's hand-written `.d.ts`.
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
} from 'kurrasah'

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
  slashTrigger: '@',
  slashEnabled: true,
  blockControlsEnabled: true,
  tableToolbarEnabled: true,
  onRequestLink: async ({ href, text }): Promise<LinkResult | null> => {
    if (!text) return null
    return { href: href ?? 'https://example.com' }
  },
  onRequestImage: async (_ctx: ImageRequestContext) => ({
    src: 'https://example.com/pic.png',
    alt: 'alt',
  }),
}

// Slash-menu props are both optional strings / booleans.
const _slashDefaults: EditorProps = {}
const _slashOnlyTrigger: EditorProps = { slashTrigger: '/' }
const _slashOnlyEnabled: EditorProps = { slashEnabled: false }
// @ts-expect-error — slashTrigger must be a string.
const _slashBadTrigger: EditorProps = { slashTrigger: 42 }
// @ts-expect-error — slashEnabled must be a boolean.
const _slashBadEnabled: EditorProps = { slashEnabled: 'yes' }
const _blockControlsOn: EditorProps = { blockControlsEnabled: true }
const _blockControlsOff: EditorProps = { blockControlsEnabled: false }
// @ts-expect-error — blockControlsEnabled must be a boolean.
const _blockControlsBad: EditorProps = { blockControlsEnabled: 'on' }
const _tableToolbarOn: EditorProps = { tableToolbarEnabled: true }
const _tableToolbarOff: EditorProps = { tableToolbarEnabled: false }
// @ts-expect-error — tableToolbarEnabled must be a boolean.
const _tableToolbarBad: EditorProps = { tableToolbarEnabled: 'on' }
void _slashDefaults
void _slashOnlyTrigger
void _slashOnlyEnabled
void _blockControlsOn
void _blockControlsOff
void _tableToolbarOn
void _tableToolbarOff

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

// ---- Emits shape --------------------------------------------------------
// Each event is a validator function in EmitsOptions form — the shape Vue's
// DefineComponent generic requires. Type-check the signatures directly.
const _updateFn: EditorEmits['update:modelValue'] = (md) => {
  void md
  return true
}
const _changeFn: EditorEmits['change'] = (md) => {
  void md
  return true
}
// `ready` payload is an EditorView — we just assert the signature shape.
type _ReadyHandler = EditorEmits['ready']
const _readyParams: Parameters<_ReadyHandler>['length'] = 1
void _updateFn
void _changeFn
void _readyParams

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
const tableCmd: EditorCommandName = 'insertTable'
void tableCmd
// `execCommand` accepts an options bag for `insertTable`.
instance.execCommand('insertTable', { rows: 3, cols: 3, withHeader: true })
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

// ---- Consumer-style instance-type flow ---------------------------------
// These checks replicate what a `<script setup lang="ts">` consumer would
// write. They verify that the DefineComponent generics wire `EditorInstance`
// through `InstanceType<typeof Editor>` (template refs) and the emits
// interface through `instance.$emit`.

// (1) Template-ref shape. Consumer writes:
//     const editor = ref<InstanceType<typeof Editor> | null>(null)
//     editor.value?.execCommand('toggleBold')
type EditorRefShape = InstanceType<typeof Editor>
declare const editorRef: EditorRefShape | null
editorRef?.focus()
const _refMd: string | undefined = editorRef?.getMarkdown()
editorRef?.setMarkdown('# test')
const _refOk: boolean | undefined = editorRef?.execCommand('toggleBold')
const _refView = editorRef?.view
void _refMd
void _refOk
void _refView
// @ts-expect-error — `wat` is not on the exposed surface.
editorRef?.wat()

// (2) Emit signature flow. Consumer writes `<Editor @change="(md) => ..." />`;
// vue-tsc narrows the `md` parameter via the component's emits. We can't
// simulate the template compiler in a `.ts` file, but we can verify that
// the emits reach the instance's `$emit`.
type EmitFn = InstanceType<typeof Editor>['$emit']
declare const emit: EmitFn
emit('change', '# hello')
emit('update:modelValue', '# world')
// @ts-expect-error — payload must be a string, not a number.
emit('change', 123)
// @ts-expect-error — 'unknownEvent' is not declared in EditorEmits.
emit('unknownEvent')
