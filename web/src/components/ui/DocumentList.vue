<script setup>
/**
 * DocumentList -- home page list of document summaries.
 *
 * Presentation-only: receives the `documents` array and `loading` flag,
 * emits `create`, `select`, `delete`. Timestamps come from the REST
 * backend as `updated_at` (snake_case, epoch seconds).
 */

defineProps({
  documents: { type: Array, required: true },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'delete', 'create'])

function formatDate(timestamp) {
  if (timestamp === null || timestamp === undefined) return ''
  const ms = typeof timestamp === 'number' ? timestamp * 1000 : Date.parse(timestamp)
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ar', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function handleDelete(event, docId) {
  event.stopPropagation()
  emit('delete', docId)
}
</script>

<template>
  <div>
    <!-- Header with new document button -->
    <div class="flex items-center justify-between mb-8">
      <h1 class="text-2xl font-bold" data-testid="documents-title">المستندات</h1>
      <button
        @click="emit('create')"
        class="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors text-sm cursor-pointer"
        data-testid="new-document-btn"
      >
        مستند جديد
      </button>
    </div>

    <!-- Loading state -->
    <div
      v-if="loading && documents.length === 0"
      class="text-center py-12 text-gray-500"
      data-testid="documents-loading"
    >
      جاري التحميل...
    </div>

    <!-- Empty state -->
    <div
      v-else-if="documents.length === 0"
      class="text-center py-12 text-gray-400"
      data-testid="documents-empty"
    >
      <p class="text-lg mb-2">لا توجد مستندات</p>
      <p class="text-sm">أنشئ مستنداً جديداً للبدء بالكتابة</p>
    </div>

    <!-- Document list -->
    <div v-else class="space-y-3">
      <div
        v-for="doc in documents"
        :key="doc.id"
        @click="emit('select', doc.id)"
        class="flex items-center justify-between p-4 border border-gray-200 rounded hover:border-gray-400 transition-colors cursor-pointer group"
        data-testid="document-item"
      >
        <div class="min-w-0 flex-1">
          <h2 class="font-medium truncate">{{ doc.title || 'بدون عنوان' }}</h2>
          <p class="text-sm text-gray-500 mt-1">
            {{ formatDate(doc.updated_at) }}
          </p>
        </div>
        <button
          @click="handleDelete($event, doc.id)"
          class="opacity-0 group-hover:opacity-100 ms-4 px-3 py-1 text-sm text-gray-500 hover:text-red-600 border border-transparent hover:border-red-200 rounded transition-all cursor-pointer"
          title="حذف المستند"
          data-testid="delete-document-btn"
        >
          حذف
        </button>
      </div>
    </div>
  </div>
</template>
