import { test, expect } from '@playwright/test';

// [Fase F] E2E de navegador — login real por UI. Este test habría cazado el bug
// de la URL de API horneada (appro.chateam.ws) → CORS → pantalla en blanco.
// Usa la cuenta QA dedicada (qa-agent) para NO revocar la sesión web real.

const ORIGIN = process.env.E2E_ORIGIN || 'https://padeldev.codigo.plus';
const EMAIL = process.env.E2E_ADMIN || 'qa-agent@chateam.com';
const PASS = process.env.E2E_ADMIN_PASS || 'QaAgent.2026';

test('login por UI llega al dashboard sin errores de red/CORS', async ({ page }) => {
  const badConsole: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (/CORS|Access-Control|Failed to fetch|net::ERR|Error de conexión/i.test(t)) badConsole.push(t);
    }
  });
  const badRequests: string[] = [];
  page.on('requestfailed', (req) => {
    // Ignorar cancelaciones benignas; registrar fallos de red reales a la API.
    const f = req.failure()?.errorText || '';
    if (/be\/|\/api\//.test(req.url()) && !/ERR_ABORTED/.test(f)) badRequests.push(`${req.url()} ${f}`);
  });

  await page.goto(`${ORIGIN}/login`, { waitUntil: 'networkidle' });

  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASS);
  await page.locator('button[type="submit"]').click();

  // Debe salir de /login (a dashboard). Damos margen para el redirect + carga.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });

  // El shell del dashboard debe renderizar (hay navegación/sidebar).
  await expect(page.locator('#main-content, nav, [id="root"]').first()).toBeVisible({ timeout: 10000 });

  // Ninguna llamada a la API debe ir a un origen cruzado (regresión de URL horneada).
  expect(badConsole, `errores CORS/red en consola:\n${badConsole.join('\n')}`).toHaveLength(0);
  expect(badRequests, `requests de API fallidas:\n${badRequests.join('\n')}`).toHaveLength(0);
});
