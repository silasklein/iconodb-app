import { defineConfig } from '@playwright/test'
import { baseDoEndereco, enderecoPublicado } from './src/app/endereco.ts'

const PORTA = 4173
// A mesma base do build (VITE_ENDERECO ou o padrão): /iconodb-app/ no GitHub Pages, / no domínio próprio.
const BASE = baseDoEndereco(enderecoPublicado(process.env.VITE_ENDERECO))

// Serve o resultado de `npm run build` com `vite preview`, na base do endereço publicado.
// O Chromium usado é o que já está instalado no ambiente (PLAYWRIGHT_BROWSERS_PATH); nunca `playwright install`.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORTA}${BASE}`,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'celular-375x812', use: { browserName: 'chromium', viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true } },
    { name: 'computador-1280x800', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORTA} --strictPort`,
    url: `http://localhost:${PORTA}${BASE}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
