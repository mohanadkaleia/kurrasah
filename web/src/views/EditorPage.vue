<script setup>
/**
 * EditorPage -- the `/editor/:id` route.
 *
 * Loads a document over REST, hosts the `@editor/core` Editor, debounces
 * content + title edits back to the server, and exposes a VersionDialog
 * and an ImportExportDialog for import/export round trips.
 */

import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { Editor } from '@editor/core'
import '@editor/core/style.css'

import AppLayout from '../components/ui/AppLayout.vue'
import ImportExportDialog from '../components/ui/ImportExportDialog.vue'
import VersionDialog from '../components/editor/VersionDialog.vue'
import { useDocuments } from '../composables/useDocuments.js'

const route = useRoute()
const router = useRouter()

const {
  currentDocument,
  loading,
  error,
  load,
  debouncedUpdate,
  flushUpdate,
} = useDocuments()

const documentId = computed(() => String(route.params.id))

// --- Editor state ----------------------------------------------------------

/** Markdown bound to the `<Editor>` v-model. Initialised after load. */
const content = ref('')

/** Title bound to the <input>. Initialised after load. */
const title = ref('')

/** Ref to the `<Editor>` component, used for setMarkdown/getMarkdown. */
const editorRef = ref(null)

/** Guard: we do not echo programmatic updates back through debouncedUpdate. */
const suppressAutoSave = ref(true)

/** Transient error toast (separate from load error). */
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

// --- Dialog open state -----------------------------------------------------

const showVersionDialog = ref(false)
const showImportDialog = ref(false)
const showExportDialog = ref(false)

// --- Import/export local state ---------------------------------------------

const importText = ref('')
const exportText = ref('')
const copySuccess = ref(false)

function openImport() {
  importText.value = ''
  showImportDialog.value = true
}

function handleImportSubmit() {
  if (!editorRef.value) return
  // The editor's update:modelValue will flow through `onContentChange`
  // and queue a debounced save like any other edit.
  editorRef.value.setMarkdown(importText.value)
  showImportDialog.value = false
}

function openExport() {
  exportText.value = editorRef.value
    ? editorRef.value.getMarkdown()
    : content.value
  copySuccess.value = false
  showExportDialog.value = true
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
  const blob = new Blob([exportText.value], {
    type: 'text/markdown;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${name}.md`
  anchor.click()
  URL.revokeObjectURL(url)
}

// --- Load + watch routes ---------------------------------------------------

async function loadDoc(id) {
  suppressAutoSave.value = true
  try {
    const doc = await load(id)
    if (doc) {
      content.value = doc.content_md || ''
      title.value = doc.title || ''
    }
  } catch (err) {
    // error ref is already set by the composable; show a toast too.
    showToast(err?.message || 'تعذّر تحميل المستند')
  } finally {
    // After the state propagates, re-enable auto-save on the next tick.
    // A microtask is enough here: the v-model watcher fires synchronously
    // when we assign `content`, so we need to give it a chance to run
    // before we unsuppress.
    queueMicrotask(() => { suppressAutoSave.value = false })
  }
}

onMounted(() => { loadDoc(documentId.value) })

// If the route changes while the component stays mounted (rare but
// supported), reload.
watch(documentId, (next, prev) => {
  if (next && next !== prev) loadDoc(next)
})

// --- Edit handlers ---------------------------------------------------------

function onContentChange(md) {
  if (suppressAutoSave.value) return
  debouncedUpdate(documentId.value, { content_md: md }).catch((err) => {
    showToast(err?.message || 'تعذّر حفظ التغييرات')
  })
}

function onTitleInput(event) {
  title.value = event.target.value
  if (suppressAutoSave.value) return
  debouncedUpdate(documentId.value, { title: title.value }).catch((err) => {
    showToast(err?.message || 'تعذّر حفظ العنوان')
  })
}

// After a restore, the composable updates currentDocument; push the new
// markdown + title into the editor state.
function onVersionRestored(doc) {
  if (!doc) return
  suppressAutoSave.value = true
  content.value = doc.content_md || ''
  title.value = doc.title || ''
  if (editorRef.value) editorRef.value.setMarkdown(content.value)
  queueMicrotask(() => { suppressAutoSave.value = false })
}

// --- Flush on navigation / unmount ----------------------------------------

onBeforeRouteLeave(async () => {
  // Best-effort flush; ignore errors, they will have toasted already.
  try { await flushUpdate(documentId.value) } catch { /* already toasted */ }
})

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer)
  // Fire-and-forget flush.
  flushUpdate(documentId.value).catch(() => {})
})

function goHome() {
  router.push({ name: 'home' })
}
</script>

<template>
  <AppLayout>
    <div class="max-w-3xl mx-auto py-8 px-4" data-testid="editor-page">
      <!-- Toast -->
      <div
        v-if="toast"
        class="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-black text-white text-sm px-4 py-2 rounded shadow-lg"
        role="alert"
        data-testid="editor-toast"
      >
        {{ toast }}
      </div>

      <!-- Loading skeleton -->
      <div
        v-if="loading && !currentDocument"
        class="text-center py-12 text-gray-500"
        data-testid="editor-loading"
      >
        جاري التحميل...
      </div>

      <!-- Load error (no doc) -->
      <div
        v-else-if="error && !currentDocument"
        class="text-center py-12"
        data-testid="editor-error"
      >
        <p class="text-red-600 mb-4">
          {{ error.message || 'تعذّر تحميل المستند' }}
        </p>
        <button
          type="button"
          @click="loadDoc(documentId)"
          class="px-4 py-2 border border-gray-300 rounded hover:bg-gray-100 transition-colors cursor-pointer"
        >
          إعادة المحاولة
        </button>
      </div>

      <!-- Editor -->
      <template v-else-if="currentDocument">
        <!-- Top bar: back + title + actions -->
        <div
          class="mb-6 pb-4 border-b border-gray-200"
          data-testid="editor-top-bar"
        >
          <div class="flex items-center gap-3 mb-4">
            <button
              type="button"
              @click="goHome"
              class="text-gray-400 hover:text-black transition-colors text-lg cursor-pointer"
              title="العودة للمستندات"
              aria-label="العودة للمستندات"
              data-testid="editor-back-btn"
            >
              →
            </button>
            <input
              :value="title"
              @input="onTitleInput"
              type="text"
              placeholder="بدون عنوان"
              class="flex-1 text-xl font-bold outline-none bg-transparent"
              dir="auto"
              data-testid="document-title"
              aria-label="عنوان المستند"
            />
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              @click="showVersionDialog = true"
              class="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100 transition-colors cursor-pointer"
              data-testid="toolbar-versions"
            >
              المحفوظات
            </button>
            <button
              type="button"
              @click="openImport"
              class="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100 transition-colors cursor-pointer"
              data-testid="toolbar-import"
            >
              استيراد
            </button>
            <button
              type="button"
              @click="openExport"
              class="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100 transition-colors cursor-pointer"
              data-testid="toolbar-export"
            >
              تصدير
            </button>
          </div>
        </div>

        <!-- Editor host -->
        <div
          class="border border-gray-200 rounded"
          data-testid="editor-content"
        >
          <Editor
            ref="editorRef"
            v-model="content"
            :dir="'rtl'"
            :images="true"
            :links="true"
            placeholder="ابدأ الكتابة..."
            toolbar="minimal"
            @change="onContentChange"
          />
        </div>
      </template>
    </div>

    <!-- Version dialog -->
    <VersionDialog
      v-if="currentDocument"
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
      <p class="text-sm text-gray-500 mb-3">
        الصق محتوى Markdown أدناه. سيتم استبدال محتوى المستند الحالي.
      </p>
      <textarea
        v-model="importText"
        dir="auto"
        placeholder="# العنوان&#10;&#10;محتوى المستند..."
        class="w-full h-64 p-3 border border-gray-300 rounded font-mono text-sm resize-none outline-none focus:border-black"
        data-testid="import-textarea"
      ></textarea>
      <template #actions>
        <button
          type="button"
          @click="handleImportSubmit"
          :disabled="!importText.trim()"
          class="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
        class="w-full h-64 p-3 border border-gray-300 rounded font-mono text-sm resize-none outline-none focus:border-black bg-gray-50"
        data-testid="export-textarea"
      ></textarea>
      <template #actions>
        <button
          type="button"
          @click="copyExport"
          class="px-4 py-2 border border-gray-300 rounded hover:bg-gray-100 transition-colors cursor-pointer"
          data-testid="export-copy-btn"
        >
          {{ copySuccess ? 'تم النسخ' : 'نسخ' }}
        </button>
        <button
          type="button"
          @click="downloadExport"
          class="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors cursor-pointer"
          data-testid="export-download-btn"
        >
          تحميل
        </button>
      </template>
    </ImportExportDialog>
  </AppLayout>
</template>
