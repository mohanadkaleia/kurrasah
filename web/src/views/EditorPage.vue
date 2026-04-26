<script setup>
/**
 * EditorPage — the one and only view.
 *
 * Hosts:
 *   - The editable title input.
 *   - The `<Editor>` with `toolbar={false}`.
 *   - `<FloatingToolbar>` and `<ImportExportDialog>` (x2).
 *
 * Document resolution at mount:
 *   `useDocument().load()` reads the single record from localStorage
 *   (or seeds an empty shape if none exists). No lists, no versions,
 *   no ids. The first real edit writes the record back via
 *   `debouncedUpdate`.
 *
 * Dialog visibility is driven by `useEditorChrome`, which the header's
 * overflow menu writes to.
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Editor, isValidHttpUrl } from 'kurrasah'
import 'kurrasah/style.css'

import FloatingToolbar from '../components/editor/FloatingToolbar.vue'
import ImportExportDialog from '../components/ui/ImportExportDialog.vue'
import { useDocument } from '../composables/useDocument.js'
import { useEditorChrome } from '../composables/useEditorChrome.js'

// Cap dropped / pasted image files at 5 MB. The demo persists everything
// to localStorage as a data URL (see `uploadImage` below); a 10 MB image
// becomes ~14 MB of base64 in storage and quickly blows the per-origin
// quota. Production consumers wiring an actual upload backend can drop
// or raise this constant — it's a demo guard, not a package limit.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

const { document: doc, ready, load, debouncedUpdate, flushUpdate } = useDocument()

const { showImportDialog, showExportDialog, updatedAt, documentReady } =
  useEditorChrome()

// --- Editor state ----------------------------------------------------------

const content = ref('')
const title = ref('')
const editorRef = ref(null)
const editorExposed = ref(null)
/**
 * True while we're applying programmatic content updates — e.g. the
 * initial load or an import — so the debounced save path does not
 * round-trip those back to localStorage.
 */
const suppressAutoSave = ref(true)

// --- Transient error toast -------------------------------------------------

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
  // Same pattern as a load: pause autosave, set content, then release
  // on the next microtask so the programmatic setMarkdown doesn't
  // immediately round-trip to localStorage. The user's next edit
  // will persist it.
  suppressAutoSave.value = true
  editorRef.value.setMarkdown(importText.value)
  content.value = importText.value
  showImportDialog.value = false
  // Persist immediately so a quick reload after "import" doesn't lose
  // the imported content.
  debouncedUpdate({ content_md: importText.value }, { delayMs: 0 })
    .then((saved) => {
      if (saved?.updated_at != null) updatedAt.value = saved.updated_at
    })
    .catch((err) => showToast(err?.message || 'تعذّر حفظ التغييرات'))
    .finally(() => {
      queueMicrotask(() => { suppressAutoSave.value = false })
    })
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
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = `${name}.md`
  anchor.click()
  URL.revokeObjectURL(url)
}

// --- Document resolution ---------------------------------------------------

function hydrateFromDocument() {
  suppressAutoSave.value = true
  documentReady.value = false
  try {
    const record = load()
    if (!record) throw new Error('تعذّر تحميل المستند')
    content.value = record.content_md || ''
    title.value = record.title || ''
    updatedAt.value = record.updated_at ?? null
    documentReady.value = true
  } catch (err) {
    showToast(err?.message || 'تعذّر تحميل المستند')
  } finally {
    // Release autosave on the next microtask so the initial binding to
    // `<Editor>` doesn't trigger a spurious save.
    queueMicrotask(() => { suppressAutoSave.value = false })
  }
}

/** Surfaced as a data attribute so dev/tooling can wait deterministically. */
const loaded = computed(() => ready.value && !suppressAutoSave.value)

onMounted(() => {
  hydrateFromDocument()
})

// --- Edit handlers ---------------------------------------------------------

function onContentChange(md) {
  if (suppressAutoSave.value) return
  debouncedUpdate({ content_md: md })
    .then((saved) => { if (saved?.updated_at != null) updatedAt.value = saved.updated_at })
    .catch((err) => showToast(err?.message || 'تعذّر حفظ التغييرات'))
}

function onTitleInput(event) {
  title.value = event.target.value
  if (suppressAutoSave.value) return
  debouncedUpdate({ title: title.value })
    .then((saved) => { if (saved?.updated_at != null) updatedAt.value = saved.updated_at })
    .catch((err) => showToast(err?.message || 'تعذّر حفظ العنوان'))
}

function onEditorReady() {
  editorExposed.value = editorRef.value
}

// --- Link / image UI hooks --------------------------------------------------
//
// `kurrasah` defaults to English `window.prompt` strings when no callback
// is provided. The demo is Arabic-first, so we localize the prompts here —
// i18n belongs in the consumer, not in the package. Reuses the package's own
// URL validator to keep behavior consistent with the default.

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

// Drop / paste image upload. The demo runs a storage-free flow: read the
// file as a data URL (base64) via FileReader, then return that as the
// `src`. This means the localStorage record carries the full image bytes
// inline — practical for a single-document demo, hostile for anything
// larger. Consumers wiring a real backend should swap this for an actual
// upload (POST -> URL).
//
// Size cap is enforced here, NOT in the package. The package trusts the
// consumer's MIME / size policy.
function uploadImage(file /* , { source } */) {
  if (file.size > MAX_UPLOAD_BYTES) {
    showToast('حجم الصورة يتجاوز ٥ ميغابايت')
    return null
  }
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string' || result.length === 0) {
        showToast('تعذّر قراءة الصورة')
        resolve(null)
        return
      }
      resolve({ src: result, alt: file.name || '' })
    }
    reader.onerror = () => {
      showToast('تعذّر قراءة الصورة')
      resolve(null)
    }
    reader.readAsDataURL(file)
  })
}

// --- Cleanup --------------------------------------------------------------

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer)
  // Best-effort: write any pending debounced edit so a rapid navigation
  // or reload doesn't lose the last keystroke.
  try { flushUpdate() } catch { /* swallow — we're unmounting */ }
  // Reset chrome state so if the view ever re-mounts, the header
  // starts cleanly.
  documentReady.value = false
  updatedAt.value = null
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
      v-if="!ready"
      class="flex items-center justify-center py-24 text-text-secondary"
      data-testid="editor-loading"
    >
      جاري التحميل...
    </div>

    <!-- Editor surface -->
    <div
      v-else-if="doc"
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
          :on-upload-image="uploadImage"
          @change="onContentChange"
          @ready="onEditorReady"
        />
      </div>
    </div>

    <!-- Floating inline formatting toolbar -->
    <FloatingToolbar v-if="editorExposed" :editor="editorExposed" />

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
