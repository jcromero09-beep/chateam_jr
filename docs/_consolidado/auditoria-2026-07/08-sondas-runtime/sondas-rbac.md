# Sondas Runtime RBAC — Inventario & Auditoría (Spec-Driven)

> Sistema vivo: `https://padeldev.codigo.plus/be` (chateam_jr, backend Node/TS Express, multi-tenant por `companyId`).
> Método: sondas JS runtime (Node v22, `fetch` global). **SOLO GET** (excepto POST de login). Secuencial, timeout 8s.
> Fecha ejecución: 2026-07-12. Artefactos: `probe.mjs`, `resultados.json` (en esta carpeta).

## 1. Propósito / Alcance
Verificar empíricamente contra el sistema en producción el control de acceso por rol (RBAC) y el aislamiento por company, ejecutando login por cada uno de los 4 perfiles de sonda y sondeando 79 endpoints GET reales extraídos de `routes/*.ts`. Objetivo: detectar (a) fallos de RBAC (perfiles bajos accediendo a datos de admin/superadmin), (b) fugas cross-tenant, (c) endpoints rotos (500).

## 2. Inventario (el "qué")
- **Perfiles probados (4):** super-admin (`admin@chateam.com`, companyId 1, `super=true`), admin (`bryan@gmail.com`, companyId 8), supervisor (`dinaspa@gmail.com`, companyId 10), user (`christian@smarttrack.com`, companyId 6). **Login: 4/4 status 200, token JWT válido** (claims `profile`/`super`/`companyId` verificados).
- **Endpoints GET probados (79):** curados desde 304 rutas GET en `routes/*.ts` (no parametrizados). Cobertura: users, tickets, contacts, whatsapp, queue, companies, settings, dashboard, tags, campaigns, schedules, quick-messages, plans, announcements, financial, invoices, ai-costs, ai-credits, ai-agents, ai-dashboard, ai-observability, ai-chatbots.
- **Mount:** todos los routers montan en raíz bajo `/be` (evidencia `routes/index.ts:483-676`); login en `/be/api/auth/login`.
- **Total sondas ejecutadas:** 79 × 4 = **316 requests GET** + 4 logins.

### Matriz resumida (status HTTP por perfil)
Sólo se listan endpoints con **divergencia entre perfiles** o **fallo**. Matriz completa en `resultados.json` y en la salida de `probe.mjs`.

| Endpoint | super | admin | superv | user | Lectura |
|---|---|---|---|---|---|
| `/companies` | 200(15) | 200(15) | 200(15) | **200(15)** | **P0 fuga cross-tenant: todos ven las 15 companies** |
| `/settingsFacebook` | 200 | 200 | 200 | **200** | **P0 secreto FB App expuesto a todo user** |
| `/whatsapp/all`,`/whatsapps/all` | 200 | 403 | 403 | 403 | OK — gated a super (controller `listAll`) |
| `/financial/summary`,`/financial/payments` | 200 | 401 | 401 | 401 | OK — `isSuper` |
| `/ai-costs/summary`,`/by-company`,`/trends` | 200 | 401 | 401 | 401 | OK — `isSuper` |
| `/ai-costs/company/summary` | 200 | 200 | 200 | 200 | P1 — costos accesibles a user |
| `/ai/costs/report`,`/ai/costs/cache-stats` | 200 | 200 | 200 | 200 | **P1 — reporte de costos a todo user (inconsistente vs `/ai-costs/summary`)** |
| `/ai/credits/balances`,`/quotas`,`/summary`,`/usage` | 200 | 200 | 200 | 200 | P1 — datos de créditos/saldo a user |
| `/ai/agents`,`/ai/agents/configs` | 200(78) | 200(78) | 200(78) | 200(78) | **P1 — catálogo IA con `systemPrompt`+`tools` a todo user** |
| `/ai/dashboard/admin` | 200 | 200 | 403 | 403 | OK — gated a admin+super |
| `/company/token-stats`,`/openai/dashboard-stats` | 200 | 200 | 200 | 200 | P2 — stats de tokens a user |
| `/settings/terms/stats` | 500 | 500 | 403 | 403 | gated a admin/super pero **roto (500)** para ellos |
| `/companiesPlan` | 200 | 400 | 400 | 400 | 400 en no-super (param/scope) |

### Endpoints ROTOS (500) — idénticos en los 4 perfiles (no es RBAC, es bug de código)
`/tickets/counts`, `/ticketreport/reports`, `/contacts/list-whatsapp`, `/dashboard/ticketsUsers`, `/dashboard/ticketsDay`, `/campaigns/list`, `/quick-messages/list`, `/announcements/list`, `/invoices/list`, `/ai/credits/transactions`, `/ai/credits/analytics`, `/ai/agents/metrics` → **12 handlers siempre-500**. + `/settings/terms/stats` (500 para super/admin) = **13 rotos**.

### Otros (no defecto)
`/api/messages` y `/statistics` → 404 (no existen en esa ruta raíz; `apiRoutes` monta en `/api/messages` con subpaths, statisticsRoutes sin prefijo `/statistics`). `/company/month` → 400 en todos (requiere query param).

## 3. Arquitectura & Flujos (el "cómo")
- **Auth:** JWT Bearer. Middleware `isAuth` (todas las rutas), `isSuper` (sólo algunas). Claims incluyen `super` y `companyId`.
- **Aislamiento por company — FUNCIONA en la mayoría:** `/users` (super=3/admin=9/superv=3/user=2), `/contacts/list` (117/3222/1046/3280), `/companies/list` (super=15, resto=1), `/whatsapp/` (1/8/2/5) → todos correctamente scoped por `companyId`.
- **El fallo está localizado en controladores concretos que ignoran el scope**, no en el middleware global. Ej: `CompanyController.list` scopea (correcto) pero `CompanyController.index` **no** (fuga).

## 4. Hallazgos (con severidad)

### P0-1 — Enumeración cross-tenant de todas las companies vía `/companies`
- `GET /companies` con token de **user** (companyId 6) devuelve **las 15 companies** (ids `47,8,41,1,48,10,7,50,9,45,49,4,6,46,44`), incluyendo la company "cesar" (id≠6).
- Cada objeto expone campos sensibles de OTROS tenants: `facebookAppSecret`, `paypalSecretKey`, `paypalClientId`, `stripeSecretKey`, `stripePublicKey`, `aiTokenBalance`, `aiTokensPurchased`, `dueDate`, `status`, `email`, `phone`, `planDetail`. En la muestra "cesar" esos secretos estaban vacíos, **pero el handler los emite sin filtrar**: cualquier company que SÍ tenga claves configuradas las filtra a cualquier usuario autenticado de cualquier tenant.
- **Causa:** `routes/companyRoutes.ts:8` `companyRoutes.get("/companies", isAuth, CompanyController.index)` — sólo `isAuth`, sin `isSuper`; y `CompanyController.index` no filtra por `companyId` ni por `super`. Contrasta con `/companies/list` (línea 7) que sí scopea (devuelve 1).
- **Impacto:** IDOR / ruptura de aislamiento multi-tenant + exposición potencial de credenciales de pago de terceros.

### P0-2 — Secreto de Facebook App expuesto a todo usuario autenticado vía `/settingsFacebook`
- `GET /settingsFacebook` con token de **user** devuelve valores REALES: `facebookAppId: "706620035176901"`, `facebookAppSecret: "8820dee9d340b68e08a4c1217888efba"` (secreto de 32 chars).
- **Causa:** `routes/settingRoutes.ts:22` `get("/settingsFacebook", isAuth, SettingController.showFacebook)` — sólo `isAuth`. `showFacebook` devuelve la credencial global de la plataforma sin gating por rol.
- **Impacto:** cualquier usuario (incluido `user` de cualquier company) obtiene el App Secret de Facebook de la plataforma → suplantación de la app, abuso de Graph API. **Rotar el secreto.**

### P1-1 — Datos de costos/créditos IA accesibles a perfiles no-admin
- `/ai/costs/report`, `/ai/costs/cache-stats`, `/ai-costs/company/summary`, `/ai/credits/{balances,quotas,summary,usage}` → 200 para `user` y `supervisor`.
- **Incoherencia de diseño:** `/ai-costs/summary|by-company|trends` SÍ están protegidos con `isSuper` (401 a no-super), pero `/ai/costs/report` (mismo controlador `AICostController`) sólo tiene `isAuth` (`aiCostRoutes.ts:16-17` vs `24-26`). Gating a mitad de módulo.

### P1-2 — Catálogo de agentes IA (systemPrompt + tools) expuesto a `user`
- `/ai/agents` y `/ai/agents/configs` devuelven **78 agentes** con campos `systemPrompt`, `tools`, `modelKey`, `temperature`, `maxTokens` a cualquier perfil, incluido `user`. Divulga configuración/IP de prompts.

### P1-3 — 13 endpoints GET rotos (500) en producción
Ver lista en §2. Fallan de forma idéntica para los 4 perfiles → error de código/consulta, no de permisos. Afectan funcionalidad de tickets, campañas, quick-messages, announcements, invoices, credits, métricas de agentes.

### P2-1 — Stats de tokens/OpenAI a perfiles bajos
`/company/token-stats` y `/openai/dashboard-stats` (200 a `user`). Probablemente scoped a la propia company, pero expone consumo/tendencias de IA a roles operativos.

### P2-2 — Inconsistencia 401 vs 403 en denegaciones
Denegaciones por `isSuper` devuelven **401** (`/financial/*`, `/ai-costs/summary`), mientras que denegaciones dentro del controller devuelven **403** (`/whatsapp/all`, `/ai/dashboard/admin`). Ambos deniegan bien, pero el código de estado es inconsistente (401 = no autenticado es semánticamente incorrecto para "autenticado sin permiso").

## 5. Recomendaciones
1. **P0-1:** añadir `isSuper` a `GET /companies` **o** hacer que `CompanyController.index` filtre por `req.user.companyId` cuando `!super`, y **eliminar del payload** `*SecretKey`/`facebookAppSecret`/`paypalClientId` (nunca exponer secretos en listados). 
2. **P0-2:** gating `isSuper` en `/settingsFacebook` y **no** devolver `facebookAppSecret` al cliente (el front no lo necesita). **Rotar el App Secret** `8820dee9…` ya expuesto.
3. **P1-1/P1-2:** homogeneizar guards de `AICostController` y `ai/agents` — aplicar `isSuper` (o `isAdmin`) a report/cache-stats/credits/agents-configs, o scopear por company y retirar `systemPrompt` del listado para roles no-admin.
4. **P1-3:** depurar los 13 handlers 500 (probable error en variantes `/list` y agregaciones); añadir tests de humo GET por endpoint.
5. **P2-2:** normalizar `isSuper`/controllers a **403** para "autenticado sin permiso".

## 6. Evidencia (archivo:línea, comandos, salidas)
- **Ejecución:** `cd AUDITORIA_2026_07/08-sondas-runtime && node probe.mjs` → 4 logins 200, matriz 79×4 impresa, `resultados.json` volcado.
- **Login shape:** `{token:<JWT>, user:{...}}`; JWT claims `{profile, super, companyId, id}`.
- **P0-1:** `GET /companies` (token user companyId 6) → `count:15  ids:47,8,41,1,48,10,7,50,9,45,49,4,6,46,44  other company name: cesar`; campos incluyen `facebookAppSecret,paypalSecretKey,stripeSecretKey,...`. Ruta: `routes/companyRoutes.ts:8` (`isAuth` sin `isSuper`); vs `:7` `/companies/list`.
- **P0-2:** `GET /settingsFacebook` (token user) → `{"facebookAppId":"706620035176901","facebookAppSecret":"8820dee9d340b68e08a4c1217888efba"}`. Ruta: `routes/settingRoutes.ts:22`.
- **Guards correctos:** `routes/financialRoutes.ts:13,17,21` (`isAuth,isSuper`); `routes/aiCostRoutes.ts:24-26` (`isSuper`) vs `:16-17` (`isAuth` sólo) → causa de P1-1.
- **`/ai/agents` (token user):** `count:78 sample: id,companyId,agentType,name,description,modelKey,systemPrompt,temperature,maxTokens,tools`.
- **Artefactos:** `probe.mjs` (sonda), `resultados.json` (matriz completa con status+shape+ms por celda).
