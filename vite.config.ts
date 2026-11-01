import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// O app é publicado em https://silasklein.github.io/iconodb-app/ (base do build e do preview).
// No servidor de desenvolvimento (`npm run dev`) a base é "/", porque o redirect do login do
// Dropbox em desenvolvimento é http://localhost:5173/.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/iconodb-app/' : '/',
  plugins: [react()],
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
