<script setup>
/**
 * VersionDialog -- lists, creates, and restores manual version snapshots.
 *
 * Props:
 *   - documentId (String, required): the document whose versions to manage
 *   - modelValue (Boolean): v-model for the open/closed state
 *
 * Emits:
 *   - update:modelValue (bool): close
 *   - restored (doc): after a successful restore; parent should reload
 *     the editor content from the returned doc
 *
 * All copy is Arabic. The dialog is black-and-white and RTL-aware.
 */

import { ref, watch } from 'vue'
import ImportExportDialog from '../ui/ImportExportDialog.vue'
import { useDocuments } from '../../composables/useDocuments.js'

const props = defineProps({
  documentId: { type: String, required: true },
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'restored'])

const {
  versions,
  loading,
  error,
  loadVersions,
  saveVersion,
  restore,
} = useDocuments()

const savingLabel = ref('')
const saving = ref(false)
const restoring = ref(false)
const localError = ref(null)

// Reload versions whenever the dialog opens.
watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    localError.value = null
    try {
      await loadVersions(props.documentId)
    } catch (err) {
      localError.value = err?.message || 'تعذّر تحميل النسخ'
    }
  },
)

function close() {
  emit('update:modelValue', false)
}

async function handleSave() {
  if (saving.value) return
  saving.value = true
  localError.value = null
  // Arabic UX: prompt for an optional label. Cancel aborts the save so
  // the user can back out without creating a throwaway version.
  const labelInput = window.prompt(
    'وصف النسخة (اختياري)',
    savingLabel.value || '',
  )
  if (labelInput === null) {
    saving.value = false
    return
  }
  const label = labelInput.trim() ? labelInput.trim() : null
  try {
    await saveVersion(props.documentId, label)
    savingLabel.value = ''
  } catch (err) {
    localError.value = err?.message || 'تعذّر حفظ النسخة'
  } finally {
    saving.value = false
  }
}

async function handleRestore(versionId) {
  if (restoring.value) return
  const confirmed = window.confirm(
    'هل أنت متأكد من استعادة هذه النسخة؟ سيتم استبدال المحتوى الحالي.',
  )
  if (!confirmed) return
  restoring.value = true
  localError.value = null
  try {
    const doc = await restore(props.documentId, versionId)
    emit('restored', doc)
    close()
  } catch (err) {
    localError.value = err?.message || 'تعذّر استعادة النسخة'
  } finally {
    restoring.value = false
  }
}

function formatDate(value) {
  if (value === null || value === undefined) return ''
  // Backend returns epoch seconds (float). Multiply to ms.
  const ms = typeof value === 'number' ? value * 1000 : Date.parse(value)
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ar', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <ImportExportDialog
    :visible="modelValue"
    title="المحفوظات"
    @close="close"
  >
    <!-- Save row -->
    <div
      class="flex items-center justify-between gap-3 mb-4 pb-4 border-b border-gray-200"
    >
      <p class="text-sm text-gray-600">
        احفظ لقطة من المحتوى الحالي للرجوع إليها لاحقًا.
      </p>
      <button
        type="button"
        @click="handleSave"
        :disabled="saving"
        class="px-4 py-2 bg-black text-white rounded text-sm whitespace-nowrap hover:bg-gray-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="version-save-btn"
      >
        {{ saving ? 'جاري الحفظ...' : 'حفظ نسخة' }}
      </button>
    </div>

    <!-- Error -->
    <p
      v-if="localError || error"
      class="text-red-600 text-sm mb-4"
      role="alert"
    >
      {{ localError || (error && error.message) }}
    </p>

    <!-- Loading -->
    <div
      v-if="loading && versions.length === 0"
      class="text-center py-8 text-gray-500"
    >
      جاري التحميل...
    </div>

    <!-- Empty -->
    <div
      v-else-if="versions.length === 0"
      class="text-center py-8 text-gray-400"
      data-testid="versions-empty"
    >
      لا توجد نسخ محفوظة بعد
    </div>

    <!-- List -->
    <ul v-else class="divide-y divide-gray-100" data-testid="versions-list">
      <li
        v-for="version in versions"
        :key="version.id"
        class="py-3 flex items-center justify-between gap-3"
        data-testid="version-item"
      >
        <div class="flex-1 min-w-0">
          <div class="font-medium truncate" data-testid="version-label">
            {{ version.label || 'بدون وصف' }}
          </div>
          <div class="text-sm text-gray-500">
            {{ formatDate(version.created_at) }}
          </div>
        </div>
        <button
          type="button"
          @click="handleRestore(version.id)"
          :disabled="restoring"
          class="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="version-restore-btn"
        >
          استعادة
        </button>
      </li>
    </ul>
  </ImportExportDialog>
</template>
