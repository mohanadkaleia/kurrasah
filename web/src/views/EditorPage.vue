<script setup>
/**
 * EditorPage — the one and only view.
 *
 * Hosts:
 *   - The editable title input.
 *   - The `<Editor>` with `toolbar={false}`.
 *   - `<FloatingToolbar>`, `<VersionDialog>`, `<ImportExportDialog>` (x2).
 *
 * Document resolution at mount:
 *   1. `listDocuments()`
 *   2. If empty → `createDocument({})` and use that.
 *   3. Otherwise → most recently updated (first item).
 *
 * Never creates a second document through the UI. There is no new-
 * document action.
 *
 * Dialog visibility is driven by `useEditorChrome`, which the header's
 * overflow menu writes to.
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Editor, isValidHttpUrl } from '@editor/core'
import '@editor/core/style.css'

import FloatingToolbar from '../components/editor/FloatingToolbar.vue'
import ImportExportDialog from '../components/ui/ImportExportDialog.vue'
import VersionDialog from '../components/editor/VersionDialog.vue'
import { useDocuments } from '../composables/useDocuments.js'
import { useEditorChrome } from '../composables/useEditorChrome.js'

const {
  currentDocument,
  loading,
  error,
  load,
  loadDocuments,
  create,
  debouncedUpdate,
  flushUpdate,
} = useDocuments()

const {
  showVersionDialog,
  showImportDialog,
  showExportDialog,
  updatedAt,
  documentReady,
} = useEditorChrome()

// --- Editor state ----------------------------------------------------------

const documentId = ref(null)
const content = ref('')
const title = ref('')
const editorRef = ref(null)
const editorExposed = ref(null)
/**
 * True while we're applying programmatic content updates — e.g. the
 * initial load or a version restore — so the debounced save path does
 * not round-trip those back to the server.
 */
const suppressAutoSave = ref(true)

// --- Transient error toast (separate from persistent `error`) --------------

const toast = ref(null)
let toastTimer = null
function showToast(message) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = null
    toastTimer = null
  }, 4000)
}

// --- Import / Export local state -------------------------------------------

const importText = ref('')
const exportText = ref('')
const copySuccess = ref(false)

watch(showImportDialog, (open) => {
  if (open) importText.value = ''
})

watch(showExportDialog, (open) => {
  if (!open) return
  exportText.value = editorRef.value
    ? editorRef.value.getMarkdown()
    : content.value
  copySuccess.value = false
})

function handleImportSubmit() {
  if (!editorRef.value) return
  editorRef.value.setMarkdown(importText.value)
  showImportDialog.value = false
}

async function copyExport() {
  try {
    await navigator.clipboard.writeText(exportText.value)
    copySuccess.value = true
    setTimeout(() => { copySuccess.value = false }, 2000)
  } catch {
    showToast('تعذّر النسخ')
  }
}

function downloadExport() {
  const name = (title.value || 'document').trim() || 'document'
  const blob = new Blob([exportText.value], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${name}.md`
  anchor.click()
  URL.revokeObjectURL(url)
}

// --- Document resolution ---------------------------------------------------

/** Pick the most recently updated document from a summary list. */
function pickMostRecent(list) {
  const sorted = [...list].sort((a, b) => {
    const ta = typeof a.updated_at === 'number'
      ? a.updated_at
      : Date.parse(a.updated_at) / 1000 || 0
    const tb = typeof b.updated_at === 'number'
      ? b.updated_at
      : Date.parse(b.updated_at) / 1000 || 0
    return tb - ta
  })
  return sorted[0]
}

async function resolveAndLoad() {
  suppressAutoSave.value = true
  documentReady.value = false
  try {
    const list = await loadDocuments()
    let doc
    if (!Array.isArray(list) || list.length === 0) {
      doc = await create({ title: '', content_md: '' })
    } else {
      const pick = pickMostRecent(list)
      doc = await load(pick.id)
    }
    if (!doc) throw new Error('تعذّر تحميل المستند')
    documentId.value = doc.id
    content.value = doc.content_md || ''
    title.value = doc.title || ''
    updatedAt.value = doc.updated_at ?? null
    documentReady.value = true
  } catch (err) {
    showToast(err?.message || 'تعذّر تحميل المستند')
  } finally {
    // Release the save-suppression on the next microtask so the initial
    // value binding to `<Editor>` doesn't trigger a spurious save.
    queueMicrotask(() => { suppressAutoSave.value = false })
  }
}

/** Surfaced as a data attribute so tests / tooling can wait deterministically. */
const loaded = computed(() => !!currentDocument.value && !suppressAutoSave.value)

onMounted(() => {
  resolveAndLoad()
})

// --- Edit handlers ---------------------------------------------------------

function onContentChange(md) {
  if (suppressAutoSave.value || !documentId.value) return
  debouncedUpdate(documentId.value, { content_md: md })
    .then((doc) => { if (doc?.updated_at != null) updatedAt.value = doc.updated_at })
    .catch((err) => showToast(err?.message || 'تعذّر حفظ التغييرات'))
}

function onTitleInput(event) {
  title.value = event.target.value
  if (suppressAutoSave.value || !documentId.value) return
  debouncedUpdate(documentId.value, { title: title.value })
    .then((doc) => { if (doc?.updated_at != null) updatedAt.value = doc.updated_at })
    .catch((err) => showToast(err?.message || 'تعذّر حفظ العنوان'))
}

function onEditorReady() {
  editorExposed.value = editorRef.value
}

// --- Link / image UI hooks --------------------------------------------------
//
// `@editor/core` defaults to English `window.prompt` strings when no callback
// is provided. Kurras is an Arabic-first product, so we localize the prompts
// here — i18n belongs in the consumer, not in the package. Reuses the
// package's own URL validator to keep behavior consistent with the default.

function promptArabicHttpUrl(message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = window.prompt(message)
    if (answer == null) return null
    const trimmed = answer.trim()
    if (isValidHttpUrl(trimmed)) return trimmed
  }
  return null
}

function onRequestLink({ href } = {}) {
  const initial = href || ''
  const answer = window.prompt('أدخل رابط URL (http:// أو https://)', initial)
  if (answer == null) return null
  const trimmed = answer.trim()
  if (!isValidHttpUrl(trimmed)) return null
  return { href: trimmed }
}

function onRequestImage() {
  const src = promptArabicHttpUrl('أدخل رابط الصورة (URL)')
  if (!src) return null
  const alt = window.prompt('النص البديل للصورة') || ''
  return { src, alt }
}

function onVersionRestored(doc) {
  if (!doc) return
  suppressAutoSave.value = true
  content.value = doc.content_md || ''
  title.value = doc.title || ''
  updatedAt.value = doc.updated_at ?? null
  if (editorRef.value) editorRef.value.setMarkdown(content.value)
  queueMicrotask(() => { suppressAutoSave.value = false })
}

// --- Cleanup --------------------------------------------------------------

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer)
  if (documentId.value) flushUpdate(documentId.value).catch(() => {})
  // Reset chrome state so if the view ever re-mounts, the header
  // starts cleanly.
  documentReady.value = false
  updatedAt.value = null
  showVersionDialog.value = false
  showImportDialog.value = false
  showExportDialog.value = false
})
</script>

<template>
  <main
    class="flex-1 w-full"
    data-testid="editor-page"
  >
    <!-- Toast -->
    <div
      v-if="toast"
      class="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-accent text-white text-sm px-4 py-2 rounded shadow-lg"
      role="alert"
      data-testid="editor-toast"
    >
      {{ toast }}
    </div>

    <!-- Loading skeleton (only before the first doc resolves) -->
    <div
      v-if="loading && !currentDocument"
      class="flex items-center justify-center py-24 text-text-secondary"
      data-testid="editor-loading"
    >
      جاري التحميل...
    </div>

    <!-- Load error (no doc) -->
    <div
      v-else-if="error && !currentDocument"
      class="flex flex-col items-center justify-center gap-4 py-24"
      data-testid="editor-error"
    >
      <p class="text-red-600">
        {{ error.message || 'تعذّر تحميل المستند' }}
      </p>
      <button
        type="button"
        @click="resolveAndLoad"
        class="px-4 py-2 border border-border rounded hover:bg-surface-hover transition-colors cursor-pointer"
      >
        إعادة المحاولة
      </button>
    </div>

    <!-- Editor surface -->
    <div
      v-else-if="currentDocument"
      class="max-w-3xl mx-auto px-6 py-12 md:py-16 editor-canvas"
    >
      <!-- Title -->
      <input
        :value="title"
        @input="onTitleInput"
        type="text"
        placeholder="عنوان بلا عنوان"
        dir="rtl"
        class="w-full mb-6 text-[2.25rem] leading-tight font-semibold tracking-tight text-text-primary bg-transparent outline-none placeholder:text-gray-300 text-right"
        data-testid="document-title"
        aria-label="عنوان المستند"
      />

      <!-- Editor host (toolbar disabled; FloatingToolbar supplies formatting) -->
      <div
        data-testid="editor-content"
        :data-loaded="loaded ? 'true' : 'false'"
      >
        <Editor
          ref="editorRef"
          v-model="content"
          :dir="'rtl'"
          :images="true"
          :links="true"
          placeholder="ابدأ الكتابة..."
          :toolbar="false"
          :on-request-link="onRequestLink"
          :on-request-image="onRequestImage"
          @change="onContentChange"
          @ready="onEditorReady"
        />
      </div>
    </div>

    <!-- Floating inline formatting toolbar -->
    <FloatingToolbar v-if="editorExposed" :editor="editorExposed" />

    <!-- Version dialog -->
    <VersionDialog
      v-if="currentDocument && documentId"
      v-model="showVersionDialog"
      :document-id="documentId"
      @restored="onVersionRestored"
    />

    <!-- Import dialog -->
    <ImportExportDialog
      :visible="showImportDialog"
      title="استيراد من Markdown"
      @close="showImportDialog = false"
    >
      <p class="text-sm text-text-secondary mb-3">
        الصق محتوى Markdown أدناه. سيتم استبدال محتوى المستند الحالي.
      </p>
      <textarea
        v-model="importText"
        dir="auto"
        placeholder="# العنوان&#10;&#10;محتوى المستند..."
        class="w-full h-64 p-3 border border-border rounded font-mono text-sm resize-none outline-none focus:border-accent"
        data-testid="import-textarea"
      ></textarea>
      <template #actions>
        <button
          type="button"
          @click="handleImportSubmit"
          :disabled="!importText.trim()"
          class="px-4 py-2 bg-accent text-white rounded hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="import-submit-btn"
        >
          استيراد
        </button>
      </template>
    </ImportExportDialog>

    <!-- Export dialog -->
    <ImportExportDialog
      :visible="showExportDialog"
      title="تصدير كـ Markdown"
      @close="showExportDialog = false"
    >
      <textarea
        :value="exportText"
        readonly
        dir="ltr"
        class="w-full h-64 p-3 border border-border rounded font-mono text-sm resize-none outline-none focus:border-accent bg-surface"
        data-testid="export-textarea"
      ></textarea>
      <template #actions>
        <button
          type="button"
          @click="copyExport"
          class="px-4 py-2 border border-border rounded hover:bg-surface-hover transition-colors cursor-pointer"
          data-testid="export-copy-btn"
        >
          {{ copySuccess ? 'تم النسخ' : 'نسخ' }}
        </button>
        <button
          type="button"
          @click="downloadExport"
          class="px-4 py-2 bg-accent text-white rounded hover:bg-accent-hover transition-colors cursor-pointer"
          data-testid="export-download-btn"
        >
          تحميل
        </button>
      </template>
    </ImportExportDialog>
  </main>
</template>
