# Spec de módulo — Créditos & Costos IA · chateam_jr

> Grupo: **Growth / Monetización**. Playbook Fase 5 (Spec-Driven v7.0). Fuente del "qué":
> `SPEC-FIRST/fase1/01-vision-y-alcance.md §3.14`, `SPEC-FIRST/fase2/02-auditoria-tecnica.md` (S-10, C-1),
> `AUDITORIA_2026_07/08-sondas-runtime/sondas-rbac.md`. Evidencia: solo lectura. Fecha: 2026-07-12.

## Propósito

Modelar el **consumo prepago de IA** de la plataforma: cada company tiene balances de créditos por tipo,
que se **acreditan** (compra/subplan/provisión tras pago) y se **deducen** por cada uso de IA (chat,
generación de imagen/video/audio, RAG). En paralelo, medir el **costo real** en tokens/USD de los
proveedores (OpenAI/Anthropic/fal.ai/etc.) para calcular **rentabilidad** (lo que cobra la plataforma vs.
lo que paga al proveedor). Es el núcleo económico de la monetización de IA y el que decide si el negocio de
IA es rentable. Incluye pasarelas de compra de créditos (Coingate/PayPal/MercadoPago) y subplanes IA.

## Actores y capacidades

- **El usuario (según plan)** puede ver su **saldo/uso** de créditos IA, tipos de crédito, quotas, resumen,
  transacciones (y exportarlas) y analítica de consumo.
- **El admin** puede **agregar** créditos (`addCredits`), **deducir** e **inicializar** balances de su
  company (y —hoy— de otra company, ver deuda).
- **El usuario** puede comprar créditos/tokens vía **Coingate** (crypto), **PayPal** o subplanes IA
  (`aiSubplanPurchaseRoutes`: checkout, paypal, comprobante).
- **El super-admin** puede ver **costos globales** (`/ai-costs/summary`, `/by-company`, `/trends`),
  **rentabilidad** (`/ai-rentability`, `App.tsx:428` superOnly) y el **dashboard financiero** de pagos.
- **El super-admin** puede gestionar **subplanes IA** (CRUD) y el super-admin ve el **consumo de tokens IA
  por tenant** (ver módulo Super-admin, `/admin/ai-token-usage`).
- **El sistema permite** contabilizar cada consumo contra `AICreditBalance` y registrar la transacción en
  `AICreditTransaction`/`AiTokenTransaction`, y agregar el costo por company en `CompanyTokenUsage`.

## Rutas/Controladores (evidencia archivo:línea) y modelo de datos

**Créditos IA** — `routes/aiCreditRoutes.ts` (todos `isAuth`): `GET /ai/credits/types`,
`GET /ai/credits/balances`, `GET /ai/credits/quotas`, `GET /ai/credits/summary`,
`GET /ai/credits/balance/:key`, `GET /ai/credits/usage`, `GET /ai/credits/transactions`,
`GET /ai/credits/transactions/export`, `GET /ai/credits/analytics`, `POST /ai/credits/{add,deduct,
initialize}` (`aiCreditRoutes.ts:9-29` → `AICreditController`).

**Costos + rentabilidad + Coingate** — `routes/aiCostRoutes.ts`: `GET /ai/costs/report`,
`GET /ai/costs/cache-stats` (`isAuth`, `:16-17`); `GET /ai-costs/{summary,by-company,trends}`
(`isAuth`+`isSuper`, `:24-26`); `GET /ai-costs/company/summary` (`isAuth`, `:29`); compra crypto
`/ai/coingate/{orders,orders/:orderId,currencies,status}` (`isAuth`) + `/ai/coingate/webhook` (público,
`:9-13`) → `AICostController`.

**Dashboard financiero (super-only)** — `routes/financialRoutes.ts`: `GET /financial/{summary,payments,
export}` — todos `isAuth`+`isSuper` (`financialRoutes.ts:13-21` → `FinancialDashboardController`).

**Subplanes IA** — `routes/aiSubplanRoutes.ts`: `GET /subplans` (`isSuper`), `GET /subplans/public`
(`isAuth`), CRUD `/subplans[/:id]` (`isSuper`) (`:11-26`); compra `routes/aiSubplanPurchaseRoutes.ts`:
`GET /token-info`, `GET /available`, `POST /checkout`, `POST /paypal`, `POST /paypal/capture`,
`POST /comprobante` (todos `isAuth`, `:17-32`).

**Consumo tokens por tenant (super)** — `routes/aiTokenUsageAdminRoutes.ts`:
`GET /admin/ai-token-usage[/filters]` (`isAuth`+`isSuper`, `:9-18` → `AITokenUsageAdminController`).

**Modelo de datos (tablas):** `AICreditBalance`, `AICreditTransaction`, `AICreditType`, `AISubplan`,
`AiTokenPlan`, `AiTokenTransaction`, `CompanyTokenUsage`, `PlanCreditAllocation` (`models/`).

## Flujos clave

**Happy path — comprar y consumir créditos:** company compra un pack (`POST /ai/coingate/orders` o subplan
`POST /checkout`) → el pago confirma vía webhook → se acreditan créditos (`AICreditBalance` +
`AICreditTransaction`) → el usuario usa una función IA → `DeductCreditsService` descuenta del balance y
registra `AiTokenTransaction` con el costo real → `CompanyTokenUsage` agrega el gasto → el super-admin ve
rentabilidad en `/ai-costs/summary` y `/ai-rentability`.

**Errores:**
- *Saldo insuficiente:* una operación IA sin balance debe bloquearse antes de llamar al proveedor.
- *Reintento de pago:* un webhook de pago repetido NO debe acreditar dos veces (idempotencia).
- *Deducción concurrente:* dos consumos simultáneos no deben dejar balance negativo (lock de fila).

## Deuda/bugs conocidos (Fase 2)

- **S-10 (P1) — Provisión de créditos NO idempotente:** un replay del webhook de pago/provisión resetea
  `usedCredits=0` → **créditos infinitos** (`Fase2 §2`). **Fix (spec):** clave idempotente por
  `paymentId`/`referenceId`; `AddCreditsService` debe ser upsert idempotente, no reset.
- **P1 (sondas-rbac.md:26-28) — fuga de datos financieros a roles operativos:** `/ai/credits/{balances,
  quotas,summary,usage}` y `/ai/costs/report` responden **200 a `user` y `supervisor`** (solo tienen
  `isAuth`), inconsistente con el gate `isSuper` de `/ai-costs/summary`. **Fix:** unificar RBAC — costos/
  rentabilidad solo super; balances propios solo admin de la company.
- **`POST /ai/credits/add` — cross-tenant grant (código):** `AICreditController.ts:88-96` solo exige
  `profile==="admin"` y toma `companyId` del body (`targetCompanyId = companyId || userCompanyId`) **sin
  verificar que `targetCompanyId===userCompanyId`** → un admin de la company A puede acreditar créditos a
  cualquier company. **Fix:** restringir a la propia company (o exigir `isSuper` para otra).
- **C-1 (P0) — endpoints en 500:** `GET /ai/credits/transactions` y `/ai/credits/analytics` responden
  **500 en los 4 perfiles** (`sondas-rbac.md:36`) → bug de handler (include/columna). Bloquea ver el
  historial de consumo.
- **`/ai/coingate/webhook` público sin evidencia de verificación de firma en la ruta** (`aiCostRoutes.ts:13`):
  validar HMAC/secreto de Coingate antes de acreditar (mismo patrón que Stripe/PayPal, S-4/S-5).

## Criterios de aceptación (Given/When/Then, testables)

1. **Given** un pago que ya acreditó N créditos, **When** su webhook se re-entrega (replay), **Then** el
   `AICreditBalance` NO aumenta de nuevo ni resetea `usedCredits` (idempotencia por referenceId) — hoy
   falla (S-10).
2. **Given** un perfil `user` o `supervisor`, **When** hace `GET /ai/costs/report` o
   `GET /ai/credits/summary`, **Then** (objetivo) responde 403 — hoy responde 200 (fuga P1).
3. **Given** un admin de la company A, **When** hace `POST /ai/credits/add` con `companyId` de la company B,
   **Then** responde 403 y no modifica el balance de B — hoy no valida (`AICreditController.ts:88-104`).
4. **Given** una company con balance 0 de un `creditType`, **When** intenta una operación IA que lo
   consume, **Then** se rechaza con error de saldo y NO se llama al proveedor.
5. **Given** el sistema estable, **When** se hace `GET /ai/credits/transactions`, **Then** responde 200 con
   la lista paginada — hoy responde 500 (C-1).
6. **Given** un perfil no-super, **When** hace `GET /financial/summary`, **Then** responde 403 (gate
   `isSuper`, `financialRoutes.ts:13`).
