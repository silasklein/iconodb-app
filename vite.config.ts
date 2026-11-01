import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'
import { pluginCsp } from './scripts/csp.ts'

// O app é publicado em https://silasklein.github.io/iconodb-app/ (base do build e do preview).
// No servidor de desenvolvimento (`npm run dev`) a base é "/", porque o redirect do login do
// Dropbox em desenvolvimento é http://localhost:5173/.
const BASE_PUBLICADA = '/iconodb-app/'

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? BASE_PUBLICADA : '/',
  plugins: [
    react(),
    pluginCsp(),
    VitePWA({
      // "prompt": a versão nova espera; o app só recarrega quando o usuário pede (nunca no meio de
      // uma sincronização). O aviso é src/pwa/AvisoDeAtualizacao.tsx.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: BASE_PUBLICADA,
        name: 'IconoDB',
        short_name: 'IconoDB',
        description: 'Banco de dados iconográfico pessoal e fechado.',
        lang: 'pt-BR',
        dir: 'ltr',
        theme_color: '#111111',
        background_color: '#FFFFFF',
        display: 'standalone',
        start_url: BASE_PUBLICADA,
        scope: BASE_PUBLICADA,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // O ícone da Tela de Início do iOS (apple-touch-icon) não vem do manifesto.
      includeAssets: ['apple-touch-icon.png'],
      workbox: {
        // O shell do app, o worker do banco, o .wasm do sqlite e as fontes (só woff2: todo navegador
        // que roda este app o entende). As imagens e os bancos NÃO passam por aqui: o pacote mora no
        // OPFS e no Cache Storage "iconodb-imagens" (src/pacote/). Sem runtimeCaching: nenhuma
        // resposta do Dropbox é guardada pelo service worker.
        globPatterns: ['**/*.{html,js,css,wasm,woff2,png,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
      },
    }),
  ],
  // O sqlite-wasm carrega o próprio .wasm por import.meta.url: não pode passar pelo pré-empacotamento.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  // O worker do banco importa módulos (sqlite-wasm, pacote/): precisa sair como módulo ES.
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    css: true,
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
}))
