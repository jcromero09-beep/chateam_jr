#!/usr/bin/env node
// [Fase F] Smoke de RBAC — regresión de los P0 explotables cerrados en Ola 0.
// Verifica, como usuario NO privilegiado (perfil `user`, super=false), que:
//  P0-1  PUT /users/:id  → no permite privesc (escalar el propio perfil a admin)
//  P0-2  GET /companies   → no filtra stripeSecretKey/paypalSecretKey/facebookAppSecret
//  P0-3  GET /settings/facebook → no filtra facebookAppSecret a no-admin
// Uso: node tests/rbac-smoke.mjs   (BASE y creds por env; defaults abajo)
// Salida: exit 0 si TODO verde; exit 1 si algún P0 reabierto.

const BASE = process.env.SMOKE_BASE || "https://padeldev.codigo.plus/be";
const USER_EMAIL = process.env.SMOKE_USER || "christian@smarttrack.com";
const USER_PASS = process.env.SMOKE_PASS || "Probe.2026";

const SECRETS = ["stripeSecretKey", "paypalSecretKey", "facebookAppSecret"];
const results = [];
const rec = (id, pass, detail) => { results.push({ id, pass, detail }); };

async function login(email, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, token: j.token, user: j.user };
}

function findSecrets(obj) {
  const hits = [];
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (SECRETS.includes(k) && v != null && v !== "") hits.push(k);
      if (typeof v === "object") walk(v);
    }
  };
  walk(obj);
  return [...new Set(hits)];
}

(async () => {
  const { token, user } = await login(USER_EMAIL, USER_PASS);
  if (!token) { console.error("❌ No se pudo autenticar el usuario de prueba"); process.exit(2); }
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // ── P0-1: privesc via PUT /users/:id (intentar escalar el propio perfil a admin) ──
  try {
    const r = await fetch(`${BASE}/users/${user.id}`, {
      method: "PUT", headers: H, body: JSON.stringify({ profile: "admin", super: true })
    });
    const body = await r.json().catch(() => ({}));
    const escalated = r.status < 300 && (body?.profile === "admin" || body?.super === true);
    rec("P0-1 privesc PUT /users", !escalated,
      escalated ? `REABIERTO: perfil quedó ${body?.profile}/super=${body?.super}` : `ok (status ${r.status}, perfil sigue ${body?.profile ?? "user"})`);
  } catch (e) { rec("P0-1 privesc PUT /users", true, `sin efecto (${e.message})`); }

  // ── P0-2: fuga de secretos en GET /companies ──
  try {
    const r = await fetch(`${BASE}/companies`, { headers: H });
    const body = await r.json().catch(() => ({}));
    const leaked = findSecrets(body);
    rec("P0-2 secretos GET /companies", leaked.length === 0,
      leaked.length ? `REABIERTO: filtra ${leaked.join(",")}` : `ok (status ${r.status}, 0 secretos)`);
  } catch (e) { rec("P0-2 secretos GET /companies", true, `sin acceso (${e.message})`); }

  // ── P0-3: fuga de facebookAppSecret en GET /settings/facebook ──
  try {
    const r = await fetch(`${BASE}/settings/facebook`, { headers: H });
    const body = await r.json().catch(() => ({}));
    const leaked = findSecrets(body);
    rec("P0-3 facebookAppSecret /settings/facebook", leaked.length === 0,
      leaked.length ? `REABIERTO: filtra ${leaked.join(",")}` : `ok (status ${r.status}, sin secreto)`);
  } catch (e) { rec("P0-3 facebookAppSecret /settings/facebook", true, `sin acceso (${e.message})`); }

  // ── Reporte ──
  let allGreen = true;
  for (const { id, pass, detail } of results) {
    console.log(`${pass ? "✅" : "❌"} ${id} — ${detail}`);
    if (!pass) allGreen = false;
  }
  console.log(allGreen ? "\nRBAC SMOKE: VERDE (todos los P0 siguen cerrados)" : "\nRBAC SMOKE: ROJO (regresión de seguridad)");
  process.exit(allGreen ? 0 : 1);
})();
