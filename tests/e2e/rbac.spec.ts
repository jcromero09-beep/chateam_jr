import { test, expect, request } from '@playwright/test';

// [Fase F] E2E de API — regresión de los 3 P0 de RBAC (Ola 0), como usuario NO
// privilegiado (christian, perfil user). Independiente de la sesión admin.

const BE = process.env.E2E_BE || 'https://padeldev.codigo.plus/be';
const USER = process.env.E2E_USER || 'christian@smarttrack.com';
const PASS = process.env.E2E_USER_PASS || 'Probe.2026';
const SECRETS = ['stripeSecretKey', 'paypalSecretKey', 'facebookAppSecret'];

function findSecrets(obj: any): string[] {
  const hits: string[] = [];
  const walk = (o: any) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (SECRETS.includes(k) && v != null && v !== '') hits.push(k);
      if (typeof v === 'object') walk(v);
    }
  };
  walk(obj);
  return [...new Set(hits)];
}

test.describe('RBAC P0 (usuario no privilegiado)', () => {
  let ctx: Awaited<ReturnType<typeof request.newContext>>;
  let token: string;
  let userId: number;

  test.beforeAll(async () => {
    ctx = await request.newContext();
    const r = await ctx.post(`${BE}/api/auth/login`, { data: { email: USER, password: PASS } });
    expect(r.ok()).toBeTruthy();
    const j = await r.json();
    token = j.token;
    userId = j.user?.id;
    expect(token).toBeTruthy();
  });

  test.afterAll(async () => { await ctx.dispose(); });

  test('P0-1: PUT /users/:id no permite privesc a admin/super', async () => {
    const r = await ctx.put(`${BE}/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { profile: 'admin', super: true },
    });
    const body = await r.json().catch(() => ({}));
    const escalated = r.ok() && (body?.profile === 'admin' || body?.super === true);
    expect(escalated, `perfil quedó ${body?.profile}/super=${body?.super}`).toBeFalsy();
  });

  test('P0-2: GET /companies no filtra secretos', async () => {
    const r = await ctx.get(`${BE}/companies`, { headers: { Authorization: `Bearer ${token}` } });
    const leaked = findSecrets(await r.json().catch(() => ({})));
    expect(leaked, `filtra ${leaked.join(',')}`).toHaveLength(0);
  });

  test('P0-3: GET /settings/facebook no filtra facebookAppSecret', async () => {
    const r = await ctx.get(`${BE}/settings/facebook`, { headers: { Authorization: `Bearer ${token}` } });
    const leaked = findSecrets(await r.json().catch(() => ({})));
    expect(leaked, `filtra ${leaked.join(',')}`).toHaveLength(0);
  });
});
