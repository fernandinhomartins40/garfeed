import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Importa só os módulos de @garfeed/shared que o cliente usa: o index puxa o zod inteiro (~50 KB gz) sem necessidade.
  resolve: { alias: [{ find: /^@garfeed\/shared\/(money|brand)$/, replacement: fileURLToPath(new URL('../../packages/shared/src/$1.ts', import.meta.url)) }] },
  server: { port: 5174, strictPort: true },
  preview: { port: 5174 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'],
      workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg,png,ico}', '**/*-latin-wght-*.woff2'] },
      manifest: {
        name: 'Garfeed — Cardápio',
        short_name: 'Garfeed',
        description: 'Deu fome? Rolou, pediu.',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#142433',
        theme_color: '#142433',
        icons: [
          { src: 'icone-app-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-app-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-app-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
