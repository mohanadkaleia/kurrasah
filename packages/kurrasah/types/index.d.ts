// Hand-written type declarations for kurrasah.
//
// The package ships as JavaScript. These declarations describe the public
// surface exported from src/index.js so TypeScript consumers get prop,
// event, callback, and exposed-method typing when they
// `import { Editor } from 'kurrasah'`.
//
// Keep this file in sync with:
//   - src/index.js         — authoritative export list.
//   - src/commands.js      — `commandFactories` drives `EditorCommandName`.
//   - src/Editor.vue       — prop defaults, emitted events, defineExpose shape.
//
// Any new public symbol must be covered here or consumers lose type-checking.

import type { ComponentOptionsMixin, DefineComponent } from 'vue'
import type { EditorView } from 'prosemirror-view'
import type { Schema, Node as ProseMirrorNode } from 'prosemirror-model'

// ---------------------------------------------------------------------------
// Callback context + result shapes
// ---------------------------------------------------------------------------

/**
 * Context passed to `onRequestLink`. `href` reflects the link mark at the
 * start of the selection only — see README "context.href on mixed
 * selections" for the mixed-state caveat.
 */
export interface LinkRequestContext {
  /** Current href at the start of the selection, if a link mark is present. */
  href?: string
  /** Plain text contents of the current selection. */
  text: string
}

/**
 * Context passed to `onRequestImage`. Empty for now. Typed as a closed
 * empty object (no fields allowed) rather than `{}` — an open `{}` would
 * match any non-nullable value in strict mode, weakening the guardrail.
 * The type may gain fields in a later minor; that will be called out as
 * a non-breaking addition in the CHANGELOG.
 */
export type ImageRequestContext = Readonly<Record<string, never>>

/** Object returned from `onRequestLink` to apply a link mark. */
export interface LinkResult {
  href: string
  title?: string | null
}

/** Object returned from `onRequestImage` to insert an image node. */
export interface ImageResult {
  src: string
  alt?: string | null
  title?: string | null
}

/**
 * Consumer-provided hook invoked when the link command needs a URL and no
 * explicit value was passed to `execCommand('toggleLink', href)`.
 * Return `null` (or resolve to `null`) to cancel.
 */
export type LinkCallback = (
  ctx: LinkRequestContext
) => LinkResult | null | Promise<LinkResult | null>

/**
 * Consumer-provided hook invoked when the image command needs a URL and
 * no explicit value was passed to `execCommand('insertImage', src)`.
 * Return `null` (or resolve to `null`) to cancel.
 */
export type ImageCallback = (
  ctx: ImageRequestContext
) => ImageResult | null | Promise<ImageResult | null>

/**
 * Origin of a `onUploadImage` invocation:
 *   - `'drop'`  — user dragged-and-dropped one or more image files onto
 *     the editor surface.
 *   - `'paste'` — user pasted an image file (typically a screenshot) from
 *     the clipboard.
 * Surfaces in `UploadImageContext.source` so consumers can route between
 * the two paths if the upload pipeline differs (e.g. show a different
 * progress affordance, or only accept one of them).
 */
export type UploadImageSource = 'drop' | 'paste'

/**
 * Context passed to `onUploadImage`. The `source` field disambiguates a
 * drop event from a paste event so consumers can tailor behavior.
 */
export interface UploadImageContext {
  source: UploadImageSource
}

/**
 * Result of a successful upload. Aliases {@link ImageResult} — the shape
 * `{ src, alt?, title? }` is intentionally identical between the URL-prompt
 * path (`onRequestImage`) and the upload path (`onUploadImage`).
 */
export type UploadImageResult = ImageResult

/**
 * Consumer-provided hook invoked when the user drops or pastes one or
 * more image files onto the editor. Receives the raw `File` plus a
 * context object describing whether the trigger was a drop or a paste.
 * The package never base64-embeds the file itself — consumers run the
 * actual upload (or embed via `FileReader.readAsDataURL` for demos) and
 * resolve to `{src, alt?, title?}`. Return `null` (or resolve to `null`)
 * to cancel without inserting; the package still preventDefaults the
 * native event so the browser doesn't navigate to the file or insert a
 * stray attachment-as-text.
 *
 * Multi-file drops invoke this callback once per file, in source order.
 * Each successful resolution inserts an `image` node at the running
 * insertion point so files land in the order they were dropped.
 *
 * Errors thrown from the callback (or rejected Promises) are caught and
 * surfaced via `console.error` with a `[kurrasah]` prefix. They do not
 * crash the editor.
 */
export type UploadImageCallback = (
  file: File,
  ctx: UploadImageContext
) => UploadImageResult | null | Promise<UploadImageResult | null>

// ---------------------------------------------------------------------------
// <Editor> props
// ---------------------------------------------------------------------------

/**
 * Props accepted by `<Editor>`. All are optional; defaults mirror
 * `Editor.vue`.
 */
export interface EditorProps {
  /** v-model markdown source. Default `''`. */
  modelValue?: string
  /** Writing direction. Default `'rtl'`. */
  dir?: 'rtl' | 'ltr'
  /** Enable image node. Toggling rebuilds the view. Default `true`. */
  images?: boolean
  /** Enable link mark. Toggling rebuilds the view. Default `true`. */
  links?: boolean
  /** Placeholder shown when the document is empty. Default `''`. */
  placeholder?: string
  /** Disable editing. Default `false`. */
  readonly?: boolean
  /**
   * Toolbar mode. `'minimal'` or `true` renders the bundled toolbar; `false`
   * renders the editor surface only. Default `'minimal'`.
   */
  toolbar?: boolean | 'minimal'
  /**
   * Trigger character for the slash (block-type) menu. Default `'@'`.
   * `'/'` is intentionally NOT the default because it maps to `ظ` on the
   * standard Arabic keyboard, which would collide with natural typing.
   * Changing this prop rebuilds the view.
   */
  slashTrigger?: string
  /**
   * Enable the slash menu. Default `true`. When `false`, the trigger
   * character is inert and `Mod-K` falls through to its `toggleLink`
   * binding (if a link mark is present). Changing this prop rebuilds
   * the view.
   */
  slashEnabled?: boolean
  /**
   * Enable per-block hover controls (drag handle + "+" button) on
   * top-level blocks. Default `true`. Set `false` to disable the
   * overlay entirely. Keyboard-only users should rely on the slash
   * menu (`@` trigger or `Cmd/Ctrl+K`) — the overlay is hover-only.
   */
  blockControlsEnabled?: boolean
  /**
   * Enable the floating cell-actions toolbar that appears above a
   * table while the cursor is inside one of its cells. Provides
   * row/column insert and delete actions plus delete-table. Default
   * `true`. Set `false` to opt out without forking — consumers who
   * ship their own table chrome or want a fully keyboard-driven
   * surface.
   */
  tableToolbarEnabled?: boolean
  /** Optional hook for link UI. See `LinkCallback`. */
  onRequestLink?: LinkCallback | null
  /** Optional hook for image UI. See `ImageCallback`. */
  onRequestImage?: ImageCallback | null
  /**
   * Optional hook called when the user drops or pastes an image file onto
   * the editor. Distinct from `onRequestImage`, which handles the
   * slash-menu / toolbar URL-prompt path. See `UploadImageCallback`.
   *
   * When this callback is **not** provided, the editor does not interfere
   * with the browser's native drop / paste handling. When it **is**
   * provided, the editor preventDefaults the native event for image files
   * and routes each one through this callback.
   */
  onUploadImage?: UploadImageCallback | null
}

// ---------------------------------------------------------------------------
// <Editor> events
// ---------------------------------------------------------------------------

/**
 * Events emitted by `<Editor>`, in `EmitsOptions` form — the shape Vue's
 * `DefineComponent` generic expects. Each entry is an event validator that
 * declares the payload type. `<script setup lang="ts">` consumers using
 * `@change="(md) => ..."` get `md` narrowed to `string` via vue-tsc.
 */
export type EditorEmits = {
  /** Markdown changed — drives v-model. */
  'update:modelValue': (markdown: string) => boolean
  /** Alias of `update:modelValue` for consumers not using v-model. */
  change: (markdown: string) => boolean
  /**
   * Fires on initial mount and on every internal view rebuild (e.g. when
   * `images` or `links` props toggle). Consumers that hold long-term view
   * references should re-capture on every emit.
   */
  ready: (view: EditorView) => boolean
}

// ---------------------------------------------------------------------------
// Exposed instance methods (defineExpose in Editor.vue)
// ---------------------------------------------------------------------------

/** Named command understood by `execCommand`. Mirrors `commandFactories`. */
export type EditorCommandName =
  | 'toggleBold'
  | 'toggleItalic'
  | 'toggleCode'
  | 'setParagraph'
  | 'setHeading'
  | 'toggleHeading'
  | 'setCodeBlock'
  | 'toggleCodeBlock'
  | 'toggleBlockquote'
  | 'toggleBulletList'
  | 'toggleOrderedList'
  | 'toggleLink'
  | 'insertImage'
  | 'insertTable'
  | 'undo'
  | 'redo'

/**
 * Object returned by `defineExpose` inside `Editor.vue`. Accessible via a
 * template ref pointing at the `<Editor>` component.
 */
export interface EditorInstance {
  /** Focus the editor. No-op after an async link/image dispatch. */
  focus(): void
  /** Serialize the current document to markdown. */
  getMarkdown(): string
  /** Replace the document and reset the undo stack. */
  setMarkdown(md: string): void
  /**
   * Dispatch a named command. Returns `true` when the command accepted the
   * request. For async link/image paths, `true` means "callback dispatched"
   * — the edit lands later (or never, if the callback returns null / an
   * invalid URL). See README "Behavioral notes".
   */
  execCommand(name: EditorCommandName, ...args: unknown[]): boolean
  /** Underlying ProseMirror view. `null` before mount / after unmount. */
  readonly view: EditorView | null
}

// ---------------------------------------------------------------------------
// Component declarations
// ---------------------------------------------------------------------------

/**
 * The main `<Editor>` component. Consumers in `<script setup lang="ts">`
 * get prop + emit typing automatically; template refs are typed as
 * `EditorInstance | null`.
 *
 * The generic positional order matters: Vue's `DefineComponent` places
 * `RawBindings` (which merges into the public instance type) at position 2
 * and `EmitsOptions` at position 8. The intermediate slots are filled with
 * sensible defaults so both emits and exposed methods reach consumers.
 */
export const Editor: DefineComponent<
  EditorProps,
  EditorInstance,
  {},
  {},
  {},
  ComponentOptionsMixin,
  ComponentOptionsMixin,
  EditorEmits
>

/**
 * Props for the bundled `<Toolbar>`. Consumers rarely render this directly —
 * it is wired by `<Editor>` when the `toolbar` prop is truthy.
 */
export interface ToolbarProps {
  /** Editor instance the toolbar drives; matches `defineExpose` output. */
  editor: EditorInstance | null
  /** Writing direction, mirrors `<Editor>`'s `dir` prop. Default `'rtl'`. */
  dir?: 'rtl' | 'ltr'
}

export const Toolbar: DefineComponent<ToolbarProps>

// ---------------------------------------------------------------------------
// Schema helpers
// ---------------------------------------------------------------------------

/** Maximum supported heading level. Fixed at 3 in v0.1. */
export const MAX_HEADING_LEVEL: 3

export interface BuildSchemaOptions {
  /** Include the image node. Default `true`. */
  images?: boolean
  /** Include the link mark. Default `true`. */
  links?: boolean
}

/**
 * Build a ProseMirror schema optionally omitting the `image` node and/or
 * the `link` mark. Used internally by `<Editor>` when `images`/`links`
 * props toggle.
 */
export function buildSchema(options?: BuildSchemaOptions): Schema

/** Default schema with images + links both enabled. */
export const schema: Schema

// ---------------------------------------------------------------------------
// Markdown helpers
// ---------------------------------------------------------------------------

/**
 * Configured markdown parser/serializer pair. Returned by
 * `createMarkdownIO`; the top-level `parseMarkdown` / `serializeMarkdown`
 * helpers use the default schema instance.
 */
export interface MarkdownIO {
  parseMarkdown(md: string): ProseMirrorNode
  serializeMarkdown(node: ProseMirrorNode): string
}

/** Build a markdown IO pair for a specific schema. */
export function createMarkdownIO(schema: Schema): MarkdownIO

/** Parse markdown against the default schema. */
export function parseMarkdown(md: string): ProseMirrorNode

/** Serialize a document produced by the default schema back to markdown. */
export function serializeMarkdown(node: ProseMirrorNode): string

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Predicate: true when `value` is a string whose trimmed form starts with
 * `http://` or `https://` followed by at least one character.
 * Exported for consumer-side URL validation in link/image modals.
 */
export function isValidHttpUrl(value: unknown): value is string
