# Changelog

All notable changes to `@editor/core` will be documented here.

## [0.1.0] — 2026-04-18

### Added
- `onRequestLink` and `onRequestImage` callback props for consumer-side
  link/image UIs. Falls back to English `window.prompt` if not provided.
- `--editor-min-height` CSS variable for consumer-side height control.
- `loading="lazy"` on image nodes.

### Changed
- `markdown-it` is now a declared runtime dependency (previously
  undeclared, relied on transitive resolution).
- `ready` event re-emits after internal view rebuilds (e.g., when
  `images` or `links` props change), so consumers always have a live
  `EditorView` reference.
- Changing the `placeholder` prop no longer rebuilds the editor view
  or wipes the undo stack.

### Fixed
- Dropped dead imports in `plugins.js`.
- Removed redundant dispatcher special-case in `execCommand`.

### Notes
- External `modelValue` changes / `setMarkdown()` calls replace the
  document and reset undo history. User edits through the UI preserve
  undo as expected.

## [0.0.0]
- Initial pre-release.
