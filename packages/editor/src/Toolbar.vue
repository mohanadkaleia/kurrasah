<script setup>
// Minimal toolbar for the editor. Dispatches commands via the exposed
// `execCommand` API on the editor ref — the toolbar never imports
// ProseMirror directly.
//
// Accepts an `editor` prop (the exposed ref from `<Editor ref="editorRef">`)
// and a `dir` prop for RTL/LTR layout. Renders plain HTML with scoped
// `.editor-toolbar` CSS; no framework styling assumptions.

const props = defineProps({
  editor: { type: Object, default: null },
  dir: { type: String, default: 'rtl' },
})

function run(name, ...args) {
  if (!props.editor) return
  props.editor.execCommand(name, ...args)
}
</script>

<template>
  <div class="editor-toolbar" :dir="dir" role="toolbar">
    <button
      type="button"
      class="editor-toolbar-btn"
      title="Bold"
      aria-label="Bold"
      @mousedown.prevent
      @click="run('toggleBold')"
    >
      <strong>B</strong>
    </button>
    <button
      type="button"
      class="editor-toolbar-btn"
      title="Italic"
      aria-label="Italic"
      @mousedown.prevent
      @click="run('toggleItalic')"
    >
      <em>I</em>
    </button>
    <button
      type="button"
      class="editor-toolbar-btn"
      title="Inline code"
      aria-label="Inline code"
      @mousedown.prevent
      @click="run('toggleCode')"
    >
      <code>{ }</code>
    </button>

    <span class="editor-toolbar-sep" aria-hidden="true"></span>

    <button
      type="button"
      class="editor-toolbar-btn"
      title="Paragraph"
      aria-label="Paragraph"
      @mousedown.prevent
      @click="run('setParagraph')"
    >
      P
    </button>
    <button
      type="button"
      class="editor-toolbar-btn"
      title="Heading 1"
      aria-label="Heading 1"
      @mousedown.prevent
      @click="run('toggleHeading', 1)"
    >
      H1
    </button>
    <button
      type="button"
      class="editor-toolbar-btn"
      title="Heading 2"
      aria-label="Heading 2"
      @mousedown.prevent
      @click="run('toggleHeading', 2)"
    >
      H2
    </button>
    <button
      type="button"
      class="editor-toolbar-btn"
      title="Heading 3"
      aria-label="Heading 3"
      @mousedown.prevent
      @click="run('toggleHeading', 3)"
    >
      H3
    </button>

    <span class="editor-toolbar-sep" aria-hidden="true"></span>

    <button
      type="button"
      class="editor-toolbar-btn"
      title="Bullet list"
      aria-label="Bullet list"
      @mousedown.prevent
      @click="run('toggleBulletList')"
    >
      &bull;
    </button>
    <button
      type="button"
      class="editor-toolbar-btn"
      title="Ordered list"
      aria-label="Ordered list"
      @mousedown.prevent
      @click="run('toggleOrderedList')"
    >
      1.
    </button>
    <button
      type="button"
      class="editor-toolbar-btn"
      title="Blockquote"
      aria-label="Blockquote"
      @mousedown.prevent
      @click="run('toggleBlockquote')"
    >
      &ldquo;
    </button>
    <button
      type="button"
      class="editor-toolbar-btn"
      title="Code block"
      aria-label="Code block"
      @mousedown.prevent
      @click="run('toggleCodeBlock')"
    >
      &lt;/&gt;
    </button>

    <span class="editor-toolbar-sep" aria-hidden="true"></span>

    <button
      type="button"
      class="editor-toolbar-btn"
      title="Link"
      aria-label="Link"
      @mousedown.prevent
      @click="run('toggleLink')"
    >
      &#128279;
    </button>
    <button
      type="button"
      class="editor-toolbar-btn"
      title="Image"
      aria-label="Image"
      @mousedown.prevent
      @click="run('insertImage')"
    >
      &#128247;
    </button>

    <span class="editor-toolbar-sep" aria-hidden="true"></span>

    <button
      type="button"
      class="editor-toolbar-btn"
      title="Undo"
      aria-label="Undo"
      @mousedown.prevent
      @click="run('undo')"
    >
      &#8630;
    </button>
    <button
      type="button"
      class="editor-toolbar-btn"
      title="Redo"
      aria-label="Redo"
      @mousedown.prevent
      @click="run('redo')"
    >
      &#8631;
    </button>
  </div>
</template>
