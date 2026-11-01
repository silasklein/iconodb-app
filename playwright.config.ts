import { defineConfig } from '@playwright/test'

const PORTA = 4173

// Serve o resultado de `npm run build` com `vite preview` (a base é /iconodb-app/, como no GitHub Pages).
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
    baseURL: `http://localhost:${PORTA}/iconodb-app/`,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'celular-375x812', use: { browserName: 'chromium', viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true } },
    { name: 'computador-1280x800', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORTA} --strictPort`,
    url: `http://localhost:${PORTA}/iconodb-app/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
