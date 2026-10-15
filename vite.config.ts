import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Swayam - FieldOS',
        short_name: 'Swayam',
        description: 'Your personal operating system for field sales.',
        theme_color: '#0F172A',
        background_color: '#F8FAFC',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
          // R3: PNG icons (Android install, reminder notifications, Play Store later)
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
        ]
      },
      // R3: phone reminders — push handling lives in public/push-sw.js
      workbox: {
        importScripts: ['push-sw.js']
      }
    })
  ]
})
