# Testing / QA — Inventario & Auditoría (Spec-Driven)

> Auditoría estática (SOLO LECTURA). NO se ejecutó la suite (requiere BD de test).
> Fecha: 2026-07-12. Fuente: `spec/testing-spec.md`, `jest.config.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`, `package.json`, árbol `tests/`.

## 1. Propósito / Alcance
Evaluar la cobertura real y la calidad de la suite de pruebas de `chateam-platform v1.1.0` frente a la superficie de código (857 servicios, 142 controladores, 198 modelos, 129 rutas, 11 middlewares) y frente a los P0 de seguridad/pagos detectados por otros agentes (privesc PUT /users, fuga /companies, webhooks forjables). Se audita: inventario de tests, config (jest/playwright/CI), estimación de cobertura, módulos críticos sin test, calidad (RBAC, snapshots, tests deshabilitados/falsos) y CI.

## 2. Inventario (el "qué")

### 2.1 Archivos de test (conteo real)
- **39 archivos `*.test.ts`** ejecutables por Jest:
  - `tests/unit/` → **36** archivos
  - `tests/integration/` → **3** archivos (`api-auth`, `api-tickets`, `session-policy`)
- **1 script** `tests/coexistence-outbound-router.smoke.ts` — NO es test Jest (usa `process.exit`, se corre con `ts-node`; no está en CI). `tests/coexistence-outbound-router.smoke.ts:186`.
- `tests/performance/` → placeholder para k6 (`load-test.js` referenciado en CI, no verificado).
- **Frontend (`frontend/`, React+Vite): 0 tests.** No hay vitest/jest configurado.
- **E2E: 0 tests.** `playwright.config.ts:6` apunta a `testDir: './tests/e2e'` → **el directorio NO existe**.

> DISCREPANCIA: `spec/testing-spec.md` afirma "77 archivos de test en el repo". El conteo real ejecutable es **39**. ~38 archivos son fantasma (probablemente contando `node_modules` o inexistentes).

### 2.2 Distribución por dominio (39 tests)
| Dominio | Nº tests | Comentario |
|---|---|---|
| UGC / Generación de video / fal / higgsfield / billing tokens | ~13 | fal-adapters(308L), fal-adapters-pr2(291L), ugc-*, generation-*, higgsfield-*, pipeline-validation, ai-token-pricing |
| AI-credits (deduct/provision/validate/tx) | 4 | `tests/unit/ai-credits/` |
| Meta / Facebook Ads conversions | 5 | meta-*, tag-meta-conversion-ai, kanban-custom-conversion-dispatch |
| Coexistencia Meta↔Baileys | 2 (+1 smoke) | coexistence-aware-sender, coexistence-ticket-routing |
| Auth / sesiones | 3 | auth, session-policy, api-auth(FALSO) |
| Core CRM (ticket, contact, message, user, queue, schedule, kanban-stage) | ~12 | |

**~56% de la suite cubre features NUEVAS (UGC/AI/Meta Ads); el core omnicanal está subrepresentado.**

### 2.3 SUT (System Under Test) realmente importado
- **69 servicios distintos** importados por tests (de **857** → ~8%).
- De esos 69, **36 son UGC/Generation/Billing/fal/AICredit** y solo **24 son servicios "core"** (Auth, Ticket, Contact, Queue, Schedule, Coexistence, WbotServices/SendWhatsAppMessage, User).
- **Controladores importados directamente: 1** (`controllers/AICreditTransactionController`) de **142** → **~99% de los controladores sin test unitario**.

### 2.4 Configuración
- `jest.config.ts`: preset ts-jest, `isolatedModules:true` + `diagnostics:false` (no type-check en tests), `roots:["<rootDir>/tests"]`, `setupFilesAfterEnv: tests/setup.ts`. **SIN `coverageThreshold`** → coverage no es gate.
- `tests/setup.ts:15` mockea `stripe` globalmente y `../database` globalmente (transaction pasa un stub) → tests unitarios nunca tocan BD real.
- `.env.test`: **NO existe** (`setup.ts:4` hace `dotenv.config({path:'.env.test'})` y cae a defaults `JWT_SECRET` hardcodeado).
- `playwright.config.ts`: 5 proyectos (Chrome/FF/WebKit/Mobile), `baseURL http://localhost:3000`, `webServer: npm run dev`. Inútil: `testDir './tests/e2e'` vacío.

### 2.5 Scripts package.json (roto)
- `test:integration` → `jest --config jest.integration.config.js` → **el archivo NO existe** (`jest.integration.config.js`/`.ts` ausentes). El comando **falla siempre**.
- `test:e2e` → `playwright test` → 0 specs, corre en vacío.
- `test:unit` === `test` === `jest` (los tres corren TODO, incl. los 3 "integration" que están en `tests/`).

## 3. Arquitectura & Flujos (el "cómo")

### 3.1 Estrategia real de testing
Pirámide invertida y hueca: casi todo unit con mocks pesados de Sequelize a nivel modelo. **No hay** tests que levanten Express y golpeen rutas reales (supertest importado pero no usado). No hay E2E ni tests de frontend.

### 3.2 Tests de CALIDAD ALTA (reales, exhaustivos)
- `tests/integration/session-policy.test.ts` — **EXCELENTE**. Emula un `store` en memoria de `Session`, serializa transacciones y ejercita de verdad `LoginSessionService` + `RefreshTokenService`: revocación por canal web/app, `session_revoked`, concurrencia (2 logins → 1 sesión). Líneas 242-352.
- `tests/unit/auth.test.ts` — bueno; cubre credenciales, horario laboral, política sin-409, canal app. **Ojo**: `auth.test.ts:190-202` **consagra como comportamiento esperado el backdoor `MASTER_KEY`** (bypass de password de CUALQUIER usuario). El test lo protege como feature, no lo marca como riesgo.
- `tests/unit/user.test.ts` — cubre aislamiento multi-tenant en `UpdateUserService` (rechaza cambio de `companyId` por no-super `user.test.ts:76`; valida propiedad de colas `:125`).

### 3.3 Tests FALSOS / teatro (siempre verdes, no prueban nada)
- `tests/integration/api-auth.test.ts` — **FALSO**. Importa `supertest` y define `mockApp` pero **nunca importa la app ni hace requests**. Cada test define un literal `expectedResponse`/`credentials` y hace `expect(literal).toHaveProperty(...)`. Ej. `api-auth.test.ts:43-45` asserta sobre un objeto que él mismo acaba de escribir. **13 "tests" que no ejercitan una sola línea de producción.**
- `tests/integration/api-tickets.test.ts` — **FALSO** (idéntico patrón, `api-tickets.test.ts:23-25`). ~20 asserts sobre literales.
- Además `api-auth.test.ts:93-107` asserta un flujo `ERR_WEB_SESSION_ALREADY_ACTIVE`/409 que `auth.test.ts` declara **obsoleto** ("login nuevo siempre toma control") → contradicción latente que nadie detecta porque el test no ejecuta código.

### 3.4 Tests deshabilitados / snapshots
- **0 `.skip` / `.only` / `xit` / `todo`** en la suite (bien).
- **0 snapshots** (`toMatchSnapshot`), **0 archivos `.snap`** → sin fragilidad de snapshot.

## 4. Hallazgos (SEVERIDAD P0/P1/P2/P3)

### P0-1 — Cobertura ~0 en módulos financieros (pagos/suscripciones)
`controllers/PaypalController.ts`, `controllers/SubscriptionController.ts`, `controllers/InvoicesController.ts`, `services/StripeService.ts`, `services/StripeCheckoutService.ts`, `services/PaypalService/*`, `services/SubscriptionService/*`, `services/PaymentSync/*`, `services/InvoicesService/*` → **NINGÚN test**. `tests/setup.ts:15` incluso mockea Stripe global, garantizando que jamás se prueba lógica de cobro. Un cambio en cálculo de cobro/captura de orden pasa CI sin red.

### P0-2 — Webhooks forjables sin ninguna prueba de verificación de firma
`controllers/MetaWebhookController.ts`, `WebHookController.ts`, `FalWebhookController.ts`, `HiggsfieldWebhookController.ts`, `FBPageWebhookController.ts`, `EmailWebhookController.ts` → **0 tests**. No hay ni un test que verifique validación de firma/hub.verify_token. **El P0 de seguridad "webhooks forjables" NO habría sido detectado por la suite.**

### P0-3 — Privilege escalation en PUT /users NO cubierto
`tests/unit/user.test.ts` cubre `companyId` (multi-tenant) y colas, pero **NO existe test que impida que un `user`/`admin` eleve su propio `profile` a `admin`/`super`**. Grep de `profile|super|escala` en el test: solo aparece como dato mock (`user.test.ts:22,54`), nunca como aserción de bloqueo. **El P0 privesc PUT /users NO sería atrapado.**

### P0-4 — Fuga de datos en /companies NO cubierta
Ningún test importa `CompanyController`/`ListCompaniesService`/`ShowCompanyService`. No hay test de aislamiento de tenant a nivel de listado de companies. **El P0 "fuga /companies" NO sería atrapado.**

### P0-5 — CI de tests roto (falso verde / job que nunca corre bien)
`.github/workflows/ci.yml`:
- Job `integration-tests` (`ci.yml:~128`) ejecuta `docker-compose -f docker-compose.test.yml exec -T app npm run test:integration`, y `test:integration` invoca `jest --config jest.integration.config.js` → **config inexistente → el job falla o (peor) el error se enmascara**. Los deploys `deploy-staging`/`deploy-production` dependen de `integration-tests` (`needs`), por lo que o bloquean siempre o el job está efectivamente muerto.
- No hay evidencia de que el pipeline haya corrido verde con esta config.

### P1-1 — Tests de integración son teatro (falsos positivos)
`api-auth.test.ts` y `api-tickets.test.ts` (~33 asserts) **no ejercitan código de producción**; asertan sobre literales. Dan sensación de cobertura de API (auth, RBAC 403, rate-limit) que **no existe**. Riesgo alto: inducen falsa confianza en endpoints críticos.

### P1-2 — Frontend sin ninguna prueba
`frontend/` (React+Vite, SPA completa) → **0 tests, sin runner**. Toda la UI (login, kanban, campañas, panel pagos) sin red de seguridad.

### P1-3 — E2E inexistente pese a config Playwright
`playwright.config.ts` configura 5 navegadores pero `tests/e2e/` no existe. `test:e2e` es decorativo. Ningún flujo omnicanal (recibir WhatsApp → ticket → responder) probado extremo a extremo.

### P1-4 — Sin gate de cobertura
`jest.config.ts` no define `coverageThreshold`; CI no falla por baja cobertura. Con ~8% de servicios tocados, la cobertura de líneas real del core es de un dígito bajo.

### P2-1 — MASTER_KEY consagrado como feature en tests
`auth.test.ts:190` protege el backdoor de password universal. Un test debería, como mínimo, exigir que `MASTER_KEY` esté ausente/deshabilitado en `NODE_ENV=production`. Cruza con hallazgos de 06-seguridad.

### P2-2 — Suite sesgada a features nuevas (UGC/AI/Meta Ads)
~56% de los tests cubren generación de video/creditos IA/conversiones Meta (features recientes), mientras el motor omnicanal histórico (Wbot/baileys, flows/chatbot, campañas de envío, conexiones WhatsApp) queda con 1-2 tests testimoniales. `WbotServices/SendWhatsAppMessage` aparece importado pero el grueso de `WbotServices` (envío/recepción real) no.

### P2-3 — `.env.test` ausente; integración documentada no reproducible
`spec/testing-spec.md` pide `.env.test` basado en `.env.example`, pero `.env.test` no existe y `test:integration` no tiene config. La "secuencia recomendada" del spec no corre tal cual.

### P3-1 — Smoke de coexistencia fuera de CI
`tests/coexistence-outbound-router.smoke.ts` es lógica de fallback Meta↔Baileys valiosa (window 24h, code 131047) pero como script `process.exit`; no lo corre ni Jest ni CI → se pudre en silencio.

### P3-2 — `diagnostics:false` + `isolatedModules` en ts-jest
Los tests no type-checkean; errores de tipo en el propio test no se ven (se delega a `type-check`, que corre en otro job). Aceptable por velocidad, pero reduce señal.

## 5. Recomendaciones (plan de cobertura priorizado)

**Sprint 0 (arreglar el andamiaje — días):**
1. Crear `jest.integration.config.js` (o corregir el script a `jest.config.ts`) para desbloquear `test:integration`; o eliminar el job/deps hasta tener integración real. (P0-5)
2. **Reescribir** `api-auth.test.ts` y `api-tickets.test.ts` con `supertest` contra la app real (`server-simple.ts` exportando el `app`), con BD de test efímera (`docker-compose.test.yml`). Borrar los asserts sobre literales. (P1-1)
3. Añadir `coverageThreshold` progresivo (arrancar en el % actual + subir) y publicarlo en CI. (P1-4)
4. Generar `.env.test` desde `.env.example` y documentar migraciones de test. (P2-3)

**Sprint 1 (blindar los P0 de seguridad/pagos):**
5. Tests de RBAC en `UpdateUserService`/PUT users: no-admin no puede setear `profile`/`super`; admin no cruza `companyId`. (P0-3)
6. Tests de aislamiento tenant en Company/list & show (fuga /companies). (P0-4)
7. Tests de verificación de firma en cada `*WebhookController` (rechazar firma inválida/ausente, replay). (P0-2)
8. Tests de `SubscriptionController`/`PaypalService`/`StripeCheckoutService`: cálculo de monto, captura de orden, idempotencia de `checkout.session.completed`, doble cobro. Desmockear Stripe puntualmente. (P0-1)

**Sprint 2 (core omnicanal):**
9. Wbot/baileys envío-recepción, flows/chatbot, `CampaignController`/envío de campañas (rate, dedupe, opt-out). (P2-2)
10. E2E Playwright mínimo: login → recibir mensaje → crear ticket → responder → cerrar. Poblar `tests/e2e/`. (P1-3)
11. Setup de tests de frontend (Vitest + Testing Library) para login, kanban y panel de pagos. (P1-2)

**Continuo:**
12. Añadir el smoke de coexistencia a Jest y a CI. (P3-1)
13. Test guard: `MASTER_KEY` deshabilitado si `NODE_ENV=production`. (P2-1)

## 6. Evidencia (archivo:línea, comandos, salidas)

- Conteo tests: `find . -path '*/node_modules' -prune -o -name '*.test.ts' -print` → **39** (36 unit + 3 integration). Frontend: 0. E2E: 0.
- Superficie: `services 857`, `controllers 142`, `models 198`, `routes 129`, `middleware 11`.
- SUT importado: **69 servicios distintos** (36 UGC/AI, 24 core), **1 controlador** (`AICreditTransactionController`).
- `jest.config.ts` — sin `coverageThreshold`, `diagnostics:false`.
- `playwright.config.ts:6` `testDir './tests/e2e'` (dir inexistente).
- `package.json` → `test:integration: jest --config jest.integration.config.js` + verificación `FALTA jest.integration.config.js`.
- Tests falsos: `tests/integration/api-auth.test.ts:5-10` (`mockApp` sin app) y `:43-45` (assert sobre literal); `tests/integration/api-tickets.test.ts:23-25`.
- Test real fuerte: `tests/integration/session-policy.test.ts:121-178` (mock de store) `:242-352` (casos).
- MASTER_KEY: `tests/unit/auth.test.ts:190-202`.
- RBAC parcial: `tests/unit/user.test.ts:76` (companyId), `:125` (colas); sin test de escalada de `profile`.
- Sin skips: grep `.skip/.only/xit/todo` en `tests/` → 0 (solo `process.exit` en smoke `:186`).
- CI: `.github/workflows/ci.yml` jobs `lint`(eslint+format+type-check), `test`(unit, postgres:15+redis:7), `integration-tests`(docker-compose exec → config faltante), `security`(npm audit+snyk), `build`, `deploy-*`(needs integration-tests), `performance`(k6).
- Módulos críticos sin test (verificado por ausencia en imports): `PaypalController`, `SubscriptionController`, `InvoicesController`, `StripeService`, `StripeCheckoutService`, `PaypalService/*`, `PaymentSync/*`, `MetaWebhookController`, `WebHookController`, `Fal/Higgsfield/FBPage/EmailWebhookController`, `CampaignController`, `FlowCampaignController`, `EmailCampaignController`, `CompanyController`.
