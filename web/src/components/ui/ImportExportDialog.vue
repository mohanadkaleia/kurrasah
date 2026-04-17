<script setup>
/**
 * ImportExportDialog -- Reusable modal dialog for import/export and version features.
 *
 * A minimal, black-and-white modal with a title, content slot, and action buttons.
 * Closes on backdrop click or the close button.
 *
 * Usage:
 *   <ImportExportDialog :visible="showDialog" title="تصدير" @close="showDialog = false">
 *     <p>Content here</p>
 *     <template #actions>
 *       <button @click="doSomething">Action</button>
 *     </template>
 *   </ImportExportDialog>
 */

defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: '' },
})

const emit = defineEmits(['close'])
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="emit('close')"
    >
      <div class="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col" data-testid="dialog-content">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold">{{ title }}</h2>
          <button
            @click="emit('close')"
            class="text-gray-400 hover:text-black transition-colors text-xl leading-none cursor-pointer"
            title="إغلاق"
          >
            &times;
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-auto">
          <slot />
        </div>

        <!-- Actions footer -->
        <div class="flex justify-end gap-2 mt-4">
          <button
            @click="emit('close')"
            class="px-4 py-2 border border-gray-300 rounded hover:bg-gray-100 transition-colors cursor-pointer"
          >
            إغلاق
          </button>
          <slot name="actions" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
