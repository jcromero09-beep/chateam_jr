import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// [Fase F] Gate de accesibilidad (axe-core, WCAG 2.0/2.1 A+AA).
// Gate DURO: 0 violaciones de impacto `critical`. Las `serious`/`moderate` se
// listan como advertencia (no bloquean) para ir bajándolas sin frenar el deploy.

const ADMIN = { email: process.env.E2E_ADMIN || 'qa-agent@chateam.com', password: process.env.E2E_ADMIN_PASS || 'QaAgent.2026' };

async function scan(page: any, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const by = (imp: string) => results.violations.filter((v) => v.impact === imp);
  const crit = by('critical');
  const serious = by('serious');
  console.log(`[a11y:${label}] critical=${crit.length} serious=${serious.length} moderate=${by('moderate').length}`);
  crit.forEach((v) => console.log(`  ✘ CRÍTICO ${v.id}: ${v.help} (${v.nodes.length} nodos)`));
  serious.slice(0, 8).forEach((v) => console.log(`  ⚠ serio ${v.id}: ${v.help}`));
  return crit;
}

test('a11y: página de login sin violaciones críticas', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'networkidle' });
  const crit = await scan(page, 'login');
  expect(crit, crit.map((v) => v.id).join(', ')).toHaveLength(0);
});

test('a11y: dashboard (autenticado) sin violaciones críticas', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  const crit = await scan(page, 'dashboard');
  expect(crit, crit.map((v) => v.id).join(', ')).toHaveLength(0);
});
