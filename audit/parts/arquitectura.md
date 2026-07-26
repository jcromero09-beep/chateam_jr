# Auditoría de Arquitectura — chateam_jr

> Parte del informe de auditoría. Confronta `docs/_consolidado/spec/SPEC.md §4` y
> `docs/_consolidado/spec-first/fase1/01-vision-y-alcance.md §5` + `product/BUSINESS-REQUIREMENTS.md`
> contra el código real. **Solo lectura.** Fecha: 2026-07-23.

## 1. Alcance

Arquitectura backend de `/home/jcromero09/chateam_jr`:

1. Entrypoints reales vs. declarados (deuda de 3 entrypoints).
2. Capas `routes → controllers → services → models` (patrón real y violaciones).
3. Rutas sin montar en `routes/index.ts`.
4. Modelos sin registrar en `database/index.ts`.
5. Servicios/controladores huérfanos (existen, nadie los importa).
6. God-objects / dependencias circulares (`wbotMessageListener.ts`).
7. Cobertura multi-tenant (`tenantMiddleware`) por `companyId`.

Fuera de alcance (otros auditores): esquema DB detallado, contratos API, seguridad RBAC endpoint-por-endpoint.

## 2. Método

- Lectura de config PM2 (`chateam.config.cjs`, `ecosystem.config.cjs`, `ecosystem.chateam.local.cjs`), los 3
  entrypoints (`server-simple.ts`, `server-distributed.ts`, `server.ts`), `worker.ts`, `app.ts`, `bootstrap.ts`,
  `routes/index.ts` (480 líneas), `database/index.ts` (537 líneas).
- Reutilización de artefactos existentes: `audit/_data/routes_no_montadas.txt`, `models_no_registrados.txt`,
  `mounts.json`, `models.tsv`.
- Verificación por muestreo con `grep`/`find`/`wc` (comandos citados en cada hallazgo). Sin ejecutar builds,
  tests, migraciones ni reinicios. `madge` no está instalado → el conteo de ciclos no se pudo re-derivar.

## 3. Hallazgos clasificados

### H-1 · Deuda de 3 (de facto 4) entrypoints — **EXISTE** (deuda persiste) · confianza alta

El SPEC §4.1 declara `server-distributed.ts` como canónico y describe la deuda. **Verificado y vigente:**

| Entrypoint | Declarado en | Realidad (verificada) | Estado |
|---|---|---|---|
| `server-distributed.ts` | `chateam.config.cjs` (PM2 activo, app `chateam-node`, `--require tsx/cjs server-distributed.ts`) | **El que corre.** Multi-nodo (`NODE_ID`, `MAX_SESSIONS`), `initIO`, heartbeat, watchdog, `sessionRegistry`, colas/cron solo en `node-1`. | Canónico |
| `server-simple.ts` | `package.json:6` `"main":"dist/server-simple.js"`, `package.json:12` `"start":"tsx server-simple.ts"` | Mono-proceso (`StartAllWhatsAppsSessions` de todas las companies). **`npm start`/`main` apuntan aquí, NO a producción.** | **Divergencia P0/P1 confirmada** |
| `server.ts` | wrapper 1.4KB | **No es un server:** contiene `startWorker()` con `startQueueProcess()` — **duplicado degradado de `worker.ts`**. Sin uso en ningún PM2. | **OBSOLETO** |
| `worker.ts` | `chateam.config.cjs` app `chateam-worker` | 4.º entrypoint real (scheduler autónomo: campañas, FacebookConversion, MetaCoexistence, AppointmentCleanup). | Canónico (worker) |

Evidencia: `chateam.config.cjs:34,45` (`server-distributed.ts`, `worker.ts`); `server.ts:9-23` (`startWorker`);
`package.json:6,12`. **Matiz vs SPEC:** el SPEC llama a `server.ts` "wrapper legacy redundante"; en realidad es un
worker legacy casi-duplicado de `worker.ts` (dos definiciones de `startWorker`). Además coexisten **3 ecosystems
PM2** (`chateam.config.cjs`, `ecosystem.config.cjs` con paths `/home/deploy/...` y 2 nodos + frontend,
`ecosystem.chateam.local.cjs`). Mapea: NFR-004 (disponibilidad), deuda de arquitectura.

### H-2 · Capas routes→controllers→services→models — **PARCIAL** · confianza alta

- **routes → controllers: limpio.** Solo **2/136** archivos de ruta importan modelos directamente
  (`routes/internal.ts`, `routes/debugRoutes.ts` — este último ni siquiera montado).
  `grep -rln "from '../models/" routes` → 2.
- **controllers → services → models: violado con frecuencia.** **82 de 151 controladores (54%) importan
  `../models/*` directamente**, saltándose la capa de servicios que el SPEC §4.3 declara canónica.
  `grep -rln "from '../models/" controllers` → 82.
- 129 módulos de ruta montados (`grep -cE "routes\.use\(" routes/index.ts` = 129, e igual nº de imports),
  coincidiendo con el "129 rutas" del SPEC.

Conclusión: el flujo de 4 capas es **aspiracional, no uniforme**; >50% de los controladores acceden a Sequelize
directamente (patrón heredado tipo Whaticket). Mapea: NFR-020 (envelope/consistencia), FR-024.

### H-3 · Rutas sin montar en `routes/index.ts` — **EXISTE** (7/7 confirmadas) · confianza alta

Las 7 rutas de `routes_no_montadas.txt` **no están importadas ni montadas en ningún agregador** (verificado
buscando importadores en todo el repo, 0 en cada caso):

| Ruta huérfana | Nota verificada |
|---|---|
| `routes/billingRoutes.ts` | Sin importadores. Usa `tenantMiddleware` (ver H-7) → capa billing muerta. |
| `routes/mediaRoutes.ts` | Sin importadores. Usa `tenantMiddleware`. `mediaBackupRoutes` (distinto) sí se monta. |
| `routes/contactTemperatureRoutes.ts` | Sin importadores, **pese a que el modelo `ContactTemperature` SÍ está registrado**. |
| `routes/healthRoutes.ts` | Sin importadores; `/health` se sirve inline en `routes/index.ts:246` (redundante). |
| `routes/debugRoutes.ts` | Sin importadores (correcto por seguridad; único que importa modelos directo). |
| `routes/webchatRoutes.ts` | Sin importadores; el widget usa `webChatWidgetRoutes` montado en `/webchat`. |
| `routes/webhookWebchatRoutes.ts` | Sin importadores. |

Aritmética: 136 archivos en `routes/` − 129 montados = **7 huérfanos**. Evidencia: bucle
`grep -rl` por basename → "(no importers found)" en las 7. Mapea: FR-010 (WebChat), FR-013/014 (billing).

### H-4 · Modelos sin registrar en `database/index.ts` — **EXISTE** (6/6 confirmadas) · confianza alta

Los 6 de `models_no_registrados.txt` existen como archivo pero tienen **0 referencias** en `database/index.ts`
(no se importan ni se pasan a `sequelize.addModels(models)` en la línea 486). 198 modelos sí registrados.

Evidencia: `for m in ...; grep -c "\b$m\b" database/index.ts` → 0 en los 6; `find models -name "$m.ts"` → existe.
**Matiz crítico no señalado en SPEC:** `models/Invoice.ts` está SIN registrar mientras que `models/Invoices.ts`
(plural, línea 38) SÍ lo está → **dos modelos de factura coexisten**, con el singular como código muerto/confuso.

### H-5 · Riesgo de fallo en runtime por modelos importados-pero-no-registrados — **PARCIAL** · confianza media-alta

Los 6 modelos no registrados **sí son importados** por controladores/servicios reales. En sequelize-typescript,
invocar `Model.findOne()/create()` sobre un modelo no pasado a `addModels` lanza en runtime. Blast radius:

- **Contenido tras rutas huérfanas (bajo riesgo):** `CompanyBilling`, `Invoice`, `Refund` → `StripeService`
  + `BillingController` → **solo `billingRoutes` (no montada)**. `Media` → `MediaController` → **solo
  `mediaRoutes` (no montada)**.
- **Alcanzable desde rutas MONTADAS (bug latente):**
  - `ApplePurchase` → `SubscriptionController.verifyApplePurchase` (llama `ApplePurchase.findOne`/`.create` en
    `controllers/SubscriptionController.ts:1100,1117`) → `subScriptionRoutes` **y** `emailPlanRoutes`, **ambas
    montadas** (`routes/index.ts:308,427`). **Confianza alta:** verificación de compra Apple IAP fallaría al ejecutarse.
  - `LeadSource` → `AttributionService` → `AuditController` → `campaignAuditRoutes` **montada**
    (`routes/index.ts:389`). **Confianza media** (depende de que el path ejecute métodos ORM de `LeadSource`).

Evidencia: `grep -rln "models/<M>" services controllers routes`; `grep -rln <Controller> routes`. Mapea:
FR-014 (Suscripciones/Planes), FR-018 (atribución), NFR-003 (0 endpoints en 500).

### H-6 · Servicios/controladores huérfanos — **EXISTE** · confianza media

Muestreo de 399 archivos en `services/`: ~17 sin importador por basename. **Confirmados 0 referencias en todo el
repo** (código muerto real): `services/CircuitBreakerService.ts`, `services/S3Service.ts`,
`services/AIAgentServices/GuardrailsService.ts`, `services/AIAgentServices/SalesAgentService.ts`,
`services/WebChatWidgetServices/ProcessWebChatMessageService.ts`. Evidencia:
`grep -rln <name> --include=*.ts . | grep -v self` → 0. (No exhaustivo; hay ~868 servicios totales — se recomienda
barrido completo con herramienta de dead-code en Fase 2.)

### H-7 · Multi-tenant / cobertura de `tenantMiddleware` — **AUSENTE** (peor que SPEC) · confianza alta

El SPEC §5.4 dice "`tenantMiddleware` montado solo en 2 de 129 rutas". **La realidad es más grave:**
`tenantMiddleware` (`middleware/tenantMiddleware.ts` existe) se importa/usa **únicamente en 2 archivos:
`routes/mediaRoutes.ts:3,11` y `routes/billingRoutes.ts:3,11` — y AMBOS están en la lista de rutas NO montadas
(H-3).** Por tanto:

- **`routes/index.ts` no referencia `tenantMiddleware` en absoluto** (`grep tenant routes/index.ts` → 0).
- La cobertura efectiva de defensa-en-profundidad multi-tenant en la app viva es **0 rutas activas**.
- El aislamiento por `companyId` depende **100%** de que cada query filtre manualmente — sin red de seguridad.

Evidencia: `grep -rn "tenantMiddleware" --include=*.ts .` → solo `mediaRoutes.ts`, `billingRoutes.ts` y scripts de
validación (`scripts/validate-multi-tenant.ts`, `pre-deploy-validation.ts`). Mapea: **BR-001 (multi-tenant),
NFR-008 (RBAC sin fugas cross-tenant)**. Corrobora la fuga `/companies` reportada en SPEC §3.20.

### H-8 · God-object `wbotMessageListener.ts` — **EXISTE** (cifra del SPEC OBSOLETA) · confianza alta

- Líneas reales: **6.764** (`wc -l services/WbotServices/wbotMessageListener.ts`). El SPEC §4.3 afirma **7.501** →
  **cifra desactualizada** (el archivo se redujo ~737 líneas o se contó distinto). Sigue siendo god-object.
- Fan-out: **90** sentencias `import`. Fan-in: **28** archivos lo importan. Confirma su rol de hub central.

Mapea: FR-002 (WhatsApp), deuda de arquitectura, testabilidad.

## 4. Tabla resumen

| ID | Hallazgo | Clasificación | Confianza | IDs BR/FR/NFR |
|---|---|---|---|---|
| H-1 | 3-4 entrypoints; `package.json` apunta a `server-simple`, PM2 corre `server-distributed`; `server.ts` = worker legacy | **EXISTE** (deuda); `server.ts` **OBSOLETO** | alta | NFR-004 |
| H-2 | 4 capas no uniformes; 82/151 controladores acceden a modelos directo | **PARCIAL** | alta | FR-024, NFR-020 |
| H-3 | 7 rutas sin montar (0 importadores) | **EXISTE** | alta | FR-010, FR-013/014 |
| H-4 | 6 modelos sin registrar; `Invoice` vs `Invoices` duplicado | **EXISTE** | alta | FR-014 |
| H-5 | `ApplePurchase`/`LeadSource` (no registrados) alcanzables desde rutas montadas → bug latente | **PARCIAL** | media-alta | FR-014, FR-018, NFR-003 |
| H-6 | Servicios huérfanos (≥5 confirmados con 0 refs) | **EXISTE** | media | — |
| H-7 | `tenantMiddleware` solo en 2 rutas, ambas no montadas → 0 cobertura activa | **AUSENTE** | alta | BR-001, NFR-008 |
| H-8 | `wbotMessageListener.ts` god-object 6.764 líneas (SPEC dice 7.501) | **EXISTE**; cifra SPEC **OBSOLETA** | alta | FR-002 |

**Conteo por clasificación:** EXISTE 4 · PARCIAL 2 · AUSENTE 1 · OBSOLETO 1 (H-8 cifra; + `server.ts` en H-1) ·
NO VERIFICABLE 1 (ver §5). MOCK 0.

## 5. Elementos NO VERIFICABLES en esta sesión

- **154 dependencias circulares (SPEC §4.3):** **NO VERIFICABLE.** `madge` no está instalado
  (`node_modules/.bin/madge` ausente) y instalar/compilar está fuera del modo solo-lectura. Se reutiliza la cifra
  del SPEC sin re-derivar; el rol de hub de `wbotMessageListener` sí queda corroborado por su fan-in 28 / fan-out 90.
- **Estado runtime de PM2 (`chateam-worker` stopped, nodo SPOF, swap 100%):** no re-sondado aquí (sin `pm2 list`
  en este contexto); se hereda de `AUDITORIA_2026_07/07-infra-runtime`. El código confirma que el worker es un
  proceso separado del que dependen campañas/recordatorios (H-1), consistente con el riesgo del SPEC §4.2.
- **Ejecución real del bug H-5 (ApplePurchase/LeadSource):** confirmado por lectura estática (llamadas ORM sobre
  modelo no registrado); no se ejecutó el endpoint para observar el 500. Confianza media-alta, no verificada en vivo.
