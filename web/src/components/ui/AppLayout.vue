<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

function goHome() {
  router.push({ name: 'home' })
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Navigation bar -->
    <nav class="bg-black text-white" data-testid="navbar">
      <div class="max-w-4xl mx-auto flex items-center justify-between px-4 py-3">
        <button
          @click="goHome"
          class="text-xl font-bold tracking-tight hover:opacity-80 transition-opacity cursor-pointer"
          data-testid="app-title"
        >
          كُرّاس
        </button>
        <div class="text-sm opacity-70" data-testid="app-subtitle">
          محرر النصوص
        </div>
      </div>
    </nav>

    <!-- Main content area -->
    <main class="flex-1 bg-white">
      <slot />
    </main>
  </div>
</template>
