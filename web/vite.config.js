import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// Workspace dev-loop: resolve the `kurrasah` package to its SOURCE entry
// rather than the pre-built `dist/kurrasah.js` declared in its `exports`
// field. Without this, edits to `packages/kurrasah/src/*.vue` are invisible
// in dev because Vite serves the stale bundle from `dist/`.
//
// The two subpath aliases keep `kurrasah/style.css` and `kurrasah/package.json`
// resolving correctly to the package directory — they don't need to go
// through `src/`.
const kurrasahRoot = fileURLToPath(new URL('../packages/kurrasah', import.meta.url))

export default defineConfig({
  // Allow the deploy workflow to set the base path for GitHub Pages
  // (served under `/kurrasah/`). In dev and for root-origin deployments
  // this stays `/`. Vue Router picks it up via `import.meta.env.BASE_URL`.
  base: process.env.VITE_BASE || '/',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^kurrasah\/style\.css$/, replacement: `${kurrasahRoot}/src/style.css` },
      { find: /^kurrasah\/package\.json$/, replacement: `${kurrasahRoot}/package.json` },
      { find: /^kurrasah$/, replacement: `${kurrasahRoot}/src/index.js` },
    ],
  },
  optimizeDeps: {
    // `kurrasah` is a local source package — excluding it from dep
    // pre-bundling keeps HMR working for its `.vue` files.
    exclude: ['kurrasah'],
  },
})
