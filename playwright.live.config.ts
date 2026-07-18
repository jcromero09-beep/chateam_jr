import { defineConfig, devices } from '@playwright/test';

// [Fase F] Config E2E contra el entorno EN VIVO (padeldev), sin webServer local.
// Uso: npx playwright test --config=playwright.live.config.ts
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results-live',
  timeout: 45 * 1000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  workers: 1, // serial: evita que logins de la misma cuenta se revoquen entre sí (sesión única)
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_ORIGIN || 'https://padeldev.codigo.plus',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
