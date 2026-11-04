import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // registered from App, and only in the browser: Electron serves app:// where service workers do not apply
      injectRegister: false,
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'voice/*.mp3'],
      manifest: {
        name: 'Cadence',
        short_name: 'Cadence',
        description: 'A speedcubing timer with deep analysis, Stackmat and smart cube support.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#141416',
        theme_color: '#141416',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3,wasm}'],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
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
