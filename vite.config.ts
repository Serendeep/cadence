import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // cubing.js generates scrambles in module workers
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    // the preload helper touches `document`, which does not exist inside cubing's scramble worker
    modulePreload: false,
    rollupOptions: {
      output: {
        // cubing.js locates its scramble worker via the URL of its own `search-worker-entry` file;
        // if the bundler merges that file into the app chunk, the worker boots the whole UI and crashes.
        // Keeping cubing's files as separate chunks preserves that boundary.
        manualChunks(id) {
          const m = /node_modules\/cubing\/dist\/lib\/cubing\/(?:chunks\/)?([^/]+)\.js$/.exec(id)
          return m ? `cubing-${m[1]}` : undefined
        },
      },
    },
  },
})
