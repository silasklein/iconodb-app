import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// O app é publicado em https://silasklein.github.io/iconodb-app/ (base do build e do preview).
// No servidor de desenvolvimento (`npm run dev`) a base é "/", porque o redirect do login do
// Dropbox em desenvolvimento é http://localhost:5173/.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/iconodb-app/' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    css: true,
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
}))
