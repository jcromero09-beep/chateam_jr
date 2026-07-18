import { test, expect, request } from '@playwright/test';

// [Fase F] E2E de API — motor de reglas (Fase E): CRUD + gating admin.
// Admin = qa-agent (cuenta QA, no revoca la sesión real). User = christian.

const BE = process.env.E2E_BE || 'https://padeldev.codigo.plus/be';
const ADMIN = { email: process.env.E2E_ADMIN || 'qa-agent@chateam.com', password: process.env.E2E_ADMIN_PASS || 'QaAgent.2026' };
const USER = { email: process.env.E2E_USER || 'christian@smarttrack.com', password: process.env.E2E_USER_PASS || 'Probe.2026' };

async function login(ctx: any, creds: any): Promise<string> {
  const r = await ctx.post(`${BE}/api/auth/login`, { data: creds });
  expect(r.ok(), `login ${creds.email}`).toBeTruthy();
  return (await r.json()).token;
}

test.describe.serial('Automation Rules (Fase E)', () => {
  let ctx: any, adminToken: string, userToken: string, ruleId: number;

  test.beforeAll(async () => {
    ctx = await request.newContext();
    adminToken = await login(ctx, ADMIN);
    userToken = await login(ctx, USER);
  });
  test.afterAll(async () => {
    if (ruleId) await ctx.delete(`${BE}/automation-rules/${ruleId}`, { headers: { Authorization: `Bearer ${adminToken}` } }).catch(() => {});
    await ctx.dispose();
  });

  test('GET /automation-rules responde 200 (admin)', async () => {
    const r = await ctx.get(`${BE}/automation-rules`, { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(r.status()).toBe(200);
    expect(Array.isArray(await r.json())).toBeTruthy();
  });

  test('POST como usuario NO admin → 403', async () => {
    const r = await ctx.post(`${BE}/automation-rules`, {
      headers: { Authorization: `Bearer ${userToken}` },
      data: { name: 'x', event: 'ticket_created' },
    });
    expect(r.status()).toBe(403);
  });

  test('POST con event inválido → 400', async () => {
    const r = await ctx.post(`${BE}/automation-rules`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: 'x', event: 'foo' },
    });
    expect(r.status()).toBe(400);
  });

  test('POST regla válida (admin) → 201 y persiste', async () => {
    const r = await ctx.post(`${BE}/automation-rules`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: 'E2E auto-assign', event: 'ticket_created', conditions: [], actions: [{ type: 'assign_user', userId: 2 }] },
    });
    expect(r.status()).toBe(201);
    const rule = await r.json();
    ruleId = rule.id;
    expect(rule.event).toBe('ticket_created');
    // Verificar que aparece en el listado
    const list = await (await ctx.get(`${BE}/automation-rules`, { headers: { Authorization: `Bearer ${adminToken}` } })).json();
    expect(list.some((x: any) => x.id === ruleId)).toBeTruthy();
  });

  test('DELETE regla (admin) → 200 y desaparece', async () => {
    const r = await ctx.delete(`${BE}/automation-rules/${ruleId}`, { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(r.status()).toBe(200);
    const list = await (await ctx.get(`${BE}/automation-rules`, { headers: { Authorization: `Bearer ${adminToken}` } })).json();
    expect(list.some((x: any) => x.id === ruleId)).toBeFalsy();
    ruleId = 0; // ya borrada
  });
});
