import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// O app é publicado em https://silasklein.github.io/iconodb-app/
export default defineConfig({
  base: '/iconodb-app/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    css: true,
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
