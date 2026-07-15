import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(),
    VitePWA({
      registerType: 'autoUpdate',
      // Custom worker (src/sw.ts): keeps the old precache behavior and adds
      // the Web Push handlers. vite-plugin-pwa builds it and injects the
      // precache manifest.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Shifty Type',
        short_name: 'Shifty Type',
        description:
          "Shifty Type — it's your word against theirs. Chain overlapping words, bluff freely, challenge wisely.",
        theme_color: '#F6F3EE',
        background_color: '#F6F3EE',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // Precache the whole client (solo mode fully offline); the SPA
        // fallback + /api/ denylist live in src/sw.ts now.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
      },
    }),
  ],
})
