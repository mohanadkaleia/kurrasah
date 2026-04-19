// Hand-written type declarations for @editor/core.
//
// The package ships as JavaScript. These declarations describe the public
// surface exported from src/index.js so TypeScript consumers get prop,
// event, callback, and exposed-method typing when they
// `import { Editor } from '@editor/core'`.
//
// Keep this file in sync with:
//   - src/index.js         — authoritative export list.
//   - src/commands.js      — `commandFactories` drives `EditorCommandName`.
//   - src/Editor.vue       — prop defaults, emitted events, defineExpose shape.
//
// Any new public symbol must be covered here or consumers lose type-checking.

import type { DefineComponent } from 'vue'
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
 * Context passed to `onRequestImage`. Empty for now; the field is reserved
 * so we can grow the shape without a breaking change.
 */
export interface ImageRequestContext {}

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
  /** Optional hook for link UI. See `LinkCallback`. */
  onRequestLink?: LinkCallback | null
  /** Optional hook for image UI. See `ImageCallback`. */
  onRequestImage?: ImageCallback | null
}

// ---------------------------------------------------------------------------
// <Editor> events
// ---------------------------------------------------------------------------

/**
 * Events emitted by `<Editor>`. Expressed in Vue 3's tuple-emits syntax
 * so `<script setup lang="ts">` consumers get precise payload typing.
 */
export interface EditorEmits {
  /** Markdown changed — drives v-model. */
  'update:modelValue': [markdown: string]
  /** Alias of `update:modelValue` for consumers not using v-model. */
  change: [markdown: string]
  /**
   * Fires on initial mount and on every internal view rebuild (e.g. when
   * `images` or `links` props toggle). Consumers that hold long-term view
   * references should re-capture on every emit.
   */
  ready: [view: EditorView]
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
 */
export const Editor: DefineComponent<
  EditorProps,
  EditorInstance,
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
