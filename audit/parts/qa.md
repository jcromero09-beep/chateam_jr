# Auditoría QA / Testing — chateam_jr

> Auditor: agente QA (solo lectura). Fecha: 2026-07-23.
> MODO SOLO LECTURA: no se ejecutó ninguna suite (jest/playwright/artillery). Todo lo que
> exigiría correr la suite se marca **NO VERIFICABLE**. Evidencia por lectura de código/config.

## 1. Alcance

Inventario y evaluación por lectura de la suite de pruebas del monolito `chateam_jr`, confrontada contra:
- `docs/_consolidado/spec/testing-spec.md`
- `docs/_consolidado/spec/SPEC.md` §8 (criterios de aceptación globales)
- `docs/_consolidado/spec/acceptance/*.md` (22 archivos)
- `docs/_consolidado/product/BUSINESS-REQUIREMENTS.md` (referencia de módulos/BR)

No se cubre la calidad del código de producción, solo la del andamiaje de pruebas y su alineación con los specs.

## 2. Método

- `find tests -type f` + `find . -name "*.test.*"/"*.spec.*"` (excl. node_modules) para inventario.
- Lectura de las 4 configs Jest (`jest.config.ts`, `jest.integration.config.cjs`, `jest.harness.config.cjs`, `jest.db.config.cjs`) y las 2 Playwright (`playwright.config.ts`, `playwright.live.config.ts`).
- Lectura de `package.json` scripts, `.github/workflows/ci.yml`, `scripts/ci-gate.sh`, `scripts/run-all-tests.sh`.
- Muestreo de 5+ archivos de test: `tests/unit/ticket.test.ts`, `tests/integration/api-tickets.test.ts`, `tests/integration/api-auth.test.ts`, `tests/integration/session-policy.test.ts`, `tests/harness/handleMessage.dbtest.ts`, `tests/unit/campaign-audit-conversation.test.ts`, `tests/unit/ai-credits/deduct-credits.test.ts`, `tests/e2e/rbac.spec.ts`, `tests/rbac-smoke.mjs`.
- grep de `it.skip|xit|test.todo|.skip(|.only|fit|fdescribe` → **0 skips/only/todo reales** (los matches fueron falsos positivos sobre `process.exit`/`éxito`). Confianza alta.
- `wc -l` y conteo de bloques `test(`/`it(` por archivo para estimar densidad de aserción.

## 3. Inventario

Conteo por comando `find` (ver §2). Total de archivos ejecutables de test ≈ **56** (el brief cita "51"; el delta son los `*.dbtest.ts`, `*.mjs` y `*.smoke.ts` que no matchean `*.test.*/*.spec.*`).

| Tipo | Ubicación | # | Framework / Config | Notas |
|------|-----------|---|--------------------|-------|
| Unit | `tests/unit/*.test.ts` | 32 | Jest (`jest.config.ts`) | +4 en `tests/unit/ai-credits/` = 36 |
| Unit (créditos IA) | `tests/unit/ai-credits/*.test.ts` | 4 | Jest | Los más densos (17 bloques, 540–699 líneas) |
| Integration | `tests/integration/*.test.ts` | 3 | Jest (`jest.integration.config.cjs`) | 2 son placeholders (ver H2) |
| E2E | `tests/e2e/*.spec.ts` | 4 | Playwright (`playwright.config.ts` / `.live`) | a11y, automation-rules, login, rbac |
| Harness (characterization/loads) | `tests/harness/*.test.ts` | 7 | Jest (`jest.harness.config.cjs`, AST esm-compat + stub baileys) | Aislada; NO corre con `npm test` |
| Harness DB | `tests/harness/*.dbtest.ts` | 4 | Jest (`jest.db.config.cjs`, Redis efímero :6399, `maxWorkers:1`) | Requiere `chateam_test` real |
| Smoke / standalone | `tests/rbac-smoke.mjs`, `tests/coexistence-outbound-router.smoke.ts` | 2 | Node script (`process.exit`) | Corren manualmente / en `ci-gate.sh` |
| Performance | `tests/performance/load-test.yml`, `artillery.yml` (raíz) | 2 | Artillery (YAML) | CI invoca k6 sobre `load-test.js` inexistente (ver H8) |

Distribución temática (sesgo): de los 36 unit, ~**20** cubren monetización/IA (UGC, `fal-*`, créditos IA, `meta-*conversion`, pipeline, higgsfield, correction-learning). El CRM omnicanal núcleo (Tickets, Campañas envío, Contactos, WhatsApp) está comparativamente delgado.

## 4. Hallazgos clasificados

### H1 — Núcleo de unit tests con aserción real — **EXISTE** (confianza alta)
La mayoría de los unit tests importan el servicio real y asertan comportamiento, no literales.
- Evidencia: `tests/unit/ticket.test.ts:84` invoca `CreateTicketService(...)` real y verifica `Ticket.create`/`Ticket.findOne` con `expect.objectContaining` (7 bloques, deps mockeadas con comentarios de *drift* documentado, línea 22-27).
- `tests/unit/campaign-audit-conversation.test.ts:15` prueba `buildConversationTranscript` real (truncado, elipsis, media label).
- `tests/unit/ai-credits/deduct-credits.test.ts:2` importa `DeductCreditsService` real, mockea modelos Sequelize, 17 bloques.
- Densidad: `ai-credits/*`, `fal-adapters*`, `meta-status-handler`, `kanban-stage-transition` = 17–28 bloques cada uno.

### H2 — Tests de integración `api-auth` y `api-tickets` son PLACEHOLDERS — **MOCK** (confianza alta)
No ejercen la app: asertan objetos-literal escritos en el propio test (tautológicos). La llamada HTTP real está comentada.
- Evidencia: `tests/integration/api-tickets.test.ts:9-25` construye `expectedResponse` a mano y hace `expect(expectedResponse).toHaveProperty('tickets')`. Variables `authToken`, `queryParams`, `API_BASE` sin uso.
- `tests/integration/api-auth.test.ts:4` `const mockApp = {...}`; línea 36-46 comentario literal *"This would be actual API call"* y luego `expect(credentials).toHaveProperty('email')`. Importa `supertest` pero nunca lo usa contra una app.
- Impacto: 38 "tests de integración" (18+20 bloques) dan verde sin tocar rutas/DB. Falsa sensación de cobertura API.

### H3 — `session-policy.test.ts` es integración de lógica real — **EXISTE** (confianza alta)
- Evidencia: `tests/integration/session-policy.test.ts:22-49` mockea `database.transaction` con serialización tipo `LOCK FOR UPDATE` y ejercita `LoginSessionService`/`RefreshTokenService`/`isAuth` (política de sesión única por canal web/app, 6 bloques). Es un test de verdad, aunque sin BD.

### H4 — Harness de characterization (DB + monolito) — **EXISTE**, runtime **NO VERIFICABLE** (confianza alta/exists; NO VERIFICABLE runtime)
Golden tests serios que importan el monolito con transform AST y stub de Baileys.
- Evidencia: `tests/harness/handleMessage.dbtest.ts:48` ejercita `handleMessage` real contra `chateam_test` (crea contacto+ticket+persiste mensaje). `jest.db.config.cjs` levanta Redis efímero :6399 y fuerza `maxWorkers:1`.
- `tests/harness/wbotMessageParsers.test.ts` (21 bloques), `verifyQueue.dbtest.ts`, `monolith.loads.test.ts`.
- **NO VERIFICABLE**: requieren `chateam_test` migrada + Redis; `jest.config.ts` los excluye (`testPathIgnorePatterns: tests/harness/`) y **ningún script de package.json los invoca** (no hay `test:harness`/`test:db`). Riesgo: quedan huérfanos del pipeline.

### H5 — E2E Playwright y `rbac-smoke.mjs` apuntan a entorno EN VIVO con credenciales hardcodeadas — **EXISTE**, ejecución **NO VERIFICABLE** (confianza alta)
- Evidencia: `tests/e2e/rbac.spec.ts:6-8` y `tests/rbac-smoke.mjs:10-12` fijan `BASE/BE = https://padeldev.codigo.plus/be`, `USER = christian@smarttrack.com`, `PASS = Probe.2026` como defaults. Verifican los 3 P0 de RBAC (privesc `PUT /users/:id`, fuga de secretos en `GET /companies` y `GET /settings/facebook`).
- `playwright.config.ts` (local) usa `webServer: npm run dev` en `:3000`; `playwright.live.config.ts` corre serial contra padeldev.
- Observación de seguridad menor: credenciales de prueba y host en claro en el repo. La cobertura E2E es esencialmente 3 pruebas RBAC + login + a11y + automation-rules (no cubre flujos de negocio).

### H6 — Colisión de config Jest vs Playwright — **PARCIAL / bug de config** (confianza alta config; NO VERIFICABLE runtime)
- Evidencia: `jest.config.ts` tiene `roots:["tests"]`, `testMatch:["**/*.spec.ts", ...]` y `testPathIgnorePatterns` que **solo** excluye `node_modules` y `tests/harness/` — **no** excluye `tests/e2e/`. Por tanto `npm test`/`npm run test:unit` (= `jest`) intentará recolectar `tests/e2e/*.spec.ts`, que hacen `import { test } from '@playwright/test'` → el runner de Jest fallará/errará esas suites.
- `scripts/run-all-tests.sh:19` corre `npm test -- --coverage` (mismo problema).
- Coherente con SPEC §8: *"CI roto"*.

### H7 — Job de tests del CI arranca sin build previo → **PARCIAL/roto** (confianza alta)
- Evidencia: `.github/workflows/ci.yml:95-96` corre `npm run db:migrate` que en `package.json` es `node dist/scripts/runMigrations.js`. No hay paso `npm run build` antes, ni `prepare`/`postinstall` (verificado: ambos `NONE`), y **no existe `dist/`** en el repo. El job `test` falla en migraciones antes de correr Jest. Corrobora el *"CI roto"* de SPEC §8.

### H8 — Job de performance del CI referencia archivo inexistente — **PARCIAL/roto** (confianza alta)
- Evidencia: `.github/workflows/ci.yml:303-306` ejecuta `grafana/k6 run /workspace/load-test.js`, pero `tests/performance/` solo contiene `load-test.yml` (formato Artillery, no k6/JS). No hay `load-test.js`. El job fallaría. (Además `artillery.yml` vive en la raíz.)

### H9 — Criterios de aceptación: prosa, no ligados a tests — **PARCIAL** (confianza alta)
- Evidencia: 22 archivos en `docs/_consolidado/spec/acceptance/`, casi todos de 150–400 bytes. Varios **vacíos** de criterios (`campanias.md`, `flowbuilder.md` solo tienen el encabezado "Cada criterio debe ser verificable por un test"). Los poblados (`tickets.md`, `whatsapp-conexiones.md`) tienen **1** criterio Given/When/Then cada uno.
- **Ninguno** cita ruta de test, ID de test ni está enlazado a un archivo en `tests/`. `grep` de `test|spec|jest|\.ts` sobre la carpeta no arroja ninguna referencia a rutas reales de prueba. Son prosa aspiracional, no ejecutables ni trazables.
- SPEC.md:269 lo admite: *"criterios de aceptación ejecutables por módulo (vacío, a poblar en /plan)"*.

### H10 — `testing-spec.md` desactualizado — **OBSOLETO** (confianza alta)
- Evidencia: `testing-spec.md:9` afirma *"77 archivos de test en el repo"*; el inventario real es ≈56 (o 51 según patrón `*.test.*/*.spec.*`). Línea 17 referencia `jest.integration.config.js` cuando el real es `.cjs`. La nota de auto-auditoría (líneas 21-23) confirma que scripts se agregaron a posteriori porque el CI los invocaba sin existir.

### H11 — Cobertura de módulos core

| Módulo | Clasificación | Evidencia |
|--------|---------------|-----------|
| **Tickets** | **EXISTE** (unit) + **MOCK** (integración) | `tests/unit/ticket.test.ts` real (7 bloques) + `harness/handleMessage.dbtest.ts` (DB) real, pero `integration/api-tickets.test.ts` es placeholder (H2) |
| **Campaigns** | **PARCIAL** | Solo `tests/unit/campaign-audit-conversation.test.ts` (helper de transcript). Los servicios núcleo `CampaignService/CreateService|ListService|RestartService|CancelService`, envío y scheduling **no tienen test**. `verifyQueue.dbtest.ts` toca colas tangencialmente |
| **WhatsApp / Baileys** | **PARCIAL** + **MOCK** (conexión) | Parsers e ingreso vía `harness/wbotMessageParsers.test.ts` y `handleMessage.dbtest.ts`, pero con **stub** de Baileys (`__mocks__/baileysStub.cjs`). Coexistencia: `coexistence-aware-sender`, `coexistence-ticket-routing`. Ciclo de vida real de conexión Baileys/QR → **NO VERIFICABLE** (imposible mockear sesión real) |

### H12 — Sin umbral de cobertura configurado — **AUSENTE** (confianza alta)
- Evidencia: `jest.config.ts:21-25` define `coverageDirectory` y `coveragePathIgnorePatterns`, pero **no** hay `coverageThreshold`. El CI sube cobertura a Codecov (`ci.yml:117-120`) sin gate mínimo. SPEC §8 reporta *"~8% cobertura"*. El % real → **NO VERIFICABLE** (requiere ejecutar `jest --coverage`).

## 5. Tabla resumen

| ID | Hallazgo | Clasificación | Confianza |
|----|----------|---------------|-----------|
| H1 | Núcleo unit con aserción real | EXISTE | alta |
| H2 | `api-auth`/`api-tickets` integración = literales tautológicos | MOCK | alta |
| H3 | `session-policy` integración de lógica real | EXISTE | alta |
| H4 | Harness characterization DB + monolito | EXISTE / runtime NO VERIFICABLE | alta |
| H5 | E2E + rbac-smoke contra entorno vivo (creds hardcodeadas) | EXISTE / ejecución NO VERIFICABLE | alta |
| H6 | Colisión config: Jest recolecta specs de Playwright | PARCIAL (bug config) | alta |
| H7 | CI job `test` corre `db:migrate` sin build → dist/ ausente | PARCIAL (roto) | alta |
| H8 | CI job performance apunta a `load-test.js` inexistente | PARCIAL (roto) | alta |
| H9 | Acceptance criteria = prosa, sin enlace a tests | PARCIAL | alta |
| H10 | `testing-spec.md` cuenta 77 vs ~56 reales; ref `.js` vs `.cjs` | OBSOLETO | alta |
| H11a | Tickets | EXISTE (+MOCK integración) | alta |
| H11b | Campaigns (solo transcript helper) | PARCIAL | alta |
| H11c | WhatsApp/Baileys (stub, sin conexión real) | PARCIAL (+MOCK/NO VERIFICABLE) | alta |
| H12 | Sin `coverageThreshold`; % real desconocido | AUSENTE / NO VERIFICABLE | alta |

**Conteo por clasificación (13 filas):** EXISTE ×4 · MOCK ×1 · PARCIAL ×5 · OBSOLETO ×1 · AUSENTE ×1 · NO VERIFICABLE (puro) ×1 (H12; además H4/H5/H11c arrastran un componente NO VERIFICABLE).

## 6. Elementos NO VERIFICABLES (requieren ejecutar — sin autorización)

1. Verde/rojo real de `npm run test:unit` y `test:integration` (SPEC §8 los exige en verde). No ejecutado.
2. % de cobertura real (SPEC §8 dice ~8%). Requiere `jest --coverage`.
3. Comportamiento efectivo de la colisión H6 (¿Jest aborta o solo warnea las specs e2e?).
4. Fallo real de los jobs de CI H7/H8 (inferido por lectura; alta confianza pero no ejecutado).
5. Harness `*.dbtest.ts` contra `chateam_test` migrada + Redis (H4).
6. E2E Playwright y `rbac-smoke.mjs` contra padeldev en vivo (H5).
7. Ciclo de conexión real de Baileys/WhatsApp (H11c) — mockeado por diseño con `baileysStub.cjs`.

## 7. Recomendaciones priorizadas (no aplicadas — solo lectura)

- **P0** Desbloquear CI: añadir `npm run build` antes de `db:migrate` en el job `test`, o cambiar `db:migrate` a `tsx` (H7); corregir `load-test.js`→`.yml`/k6 (H8).
- **P0** Excluir `tests/e2e/` de `jest.config.ts` `testPathIgnorePatterns` (H6).
- **P1** Reescribir `api-auth`/`api-tickets` con `supertest` contra la app real, o eliminarlos para no inflar el conteo (H2).
- **P1** Enganchar los `*.dbtest.ts`/harness a un script de package.json y al CI (H4).
- **P2** Poblar `acceptance/*.md` con criterios Given/When/Then trazables a rutas de test; añadir `coverageThreshold` (H9, H12).
- **P2** Mover credenciales/host de smoke y E2E a variables de entorno obligatorias (H5).
- **P2** Cubrir `CampaignService` núcleo (create/list/restart/envío) — hoy huérfano (H11b).
