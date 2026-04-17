import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.js', import.meta.url)),
      name: 'EditorCore',
      fileName: () => 'editor.js',
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'vue',
        'prosemirror-state',
        'prosemirror-view',
        'prosemirror-model',
        'prosemirror-schema-basic',
        'prosemirror-schema-list',
        'prosemirror-markdown',
        'prosemirror-history',
        'prosemirror-keymap',
        'prosemirror-commands',
        'prosemirror-inputrules',
      ],
      output: {
        assetFileNames: (asset) => {
          if (asset.name && asset.name.endsWith('.css')) return 'editor.css'
          return asset.name || 'assets/[name]-[hash][extname]'
        },
      },
    },
    sourcemap: true,
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
