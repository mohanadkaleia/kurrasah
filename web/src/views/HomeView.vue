<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDocuments } from '../composables/useDocuments.js'
import AppLayout from '../components/ui/AppLayout.vue'
import DocumentList from '../components/ui/DocumentList.vue'

const router = useRouter()
const {
  documents,
  loading,
  error,
  loadDocuments,
  create,
  remove,
} = useDocuments()

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

onMounted(async () => {
  try {
    await loadDocuments()
  } catch (err) {
    showToast(err?.message || 'تعذّر تحميل المستندات')
  }
})

async function handleCreate() {
  try {
    const doc = await create({ title: '', content_md: '' })
    router.push({ name: 'editor', params: { id: doc.id } })
  } catch (err) {
    showToast(err?.message || 'تعذّر إنشاء المستند')
  }
}

function handleSelect(docId) {
  router.push({ name: 'editor', params: { id: docId } })
}

async function handleDelete(docId) {
  const confirmed = window.confirm('هل أنت متأكد من حذف هذا المستند؟')
  if (!confirmed) return
  try {
    await remove(docId)
  } catch (err) {
    showToast(err?.message || 'تعذّر حذف المستند')
  }
}
</script>

<template>
  <AppLayout>
    <div class="max-w-2xl mx-auto py-12 px-4">
      <!-- Toast -->
      <div
        v-if="toast"
        class="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-black text-white text-sm px-4 py-2 rounded shadow-lg"
        role="alert"
        data-testid="home-toast"
      >
        {{ toast }}
      </div>

      <!-- Persistent error banner when load failed -->
      <div
        v-if="error && documents.length === 0 && !loading"
        class="mb-6 p-3 border border-red-200 bg-red-50 rounded text-sm text-red-700"
        role="alert"
        data-testid="home-error"
      >
        {{ error.message || 'تعذّر تحميل المستندات' }}
      </div>

      <DocumentList
        :documents="documents"
        :loading="loading"
        @select="handleSelect"
        @delete="handleDelete"
        @create="handleCreate"
      />
    </div>
  </AppLayout>
</template>
