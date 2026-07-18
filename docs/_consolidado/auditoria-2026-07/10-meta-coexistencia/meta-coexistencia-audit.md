# Meta & Coexistencia — Inventario & Auditoría (Spec-Driven)

> Fecha: 2026-07-12 · Proyecto: `chateam_jr` (chateam-platform v1.1.0)
> Alcance: integración con APIs de Meta (Graph API / WhatsApp Cloud API / Conversions API / Marketing API / Instagram Graph) y el sistema de **Coexistencia** Baileys↔Meta.
> Complementa (no repite) `05-integraciones/integraciones.md` y `06-seguridad/seguridad.md`. Profundiza en **versiones**, **endpoints**, **firma de webhook** y **contrato de coexistencia**.

---

## 1. Propósito / Alcance

Verificar que el código use **versiones, endpoints y payloads adecuados y ACTUALIZADOS** de las APIs de Meta, y que el sistema de coexistencia (enrutamiento dinámico Baileys vs Meta Cloud API, migración, liveness, refresh de tokens, dedupe cross-provider) esté correctamente implementado.

Fuentes verificadas (WebSearch, julio 2026):
- Graph API vigente: **v25.0** (lanzada 2026-02-18). Rango soportado: **v20.0 – v25.0**.
- Política Meta: cada versión se garantiza **≥ 2 años** desde su release.
- Expiraciones confirmadas: **v18.0 expiró 2026-01-26**, **v19.0 expiró 2026-05-21** (devuelven HTTP 400), **v20.0 se deprecia 2026-09-24**.
- WhatsApp Cloud API no exige la última versión; cualquier versión no expirada funciona (docs Meta muestran v21.0–v23.0 como ejemplos vigentes).

Refs:
- https://developers.facebook.com/docs/graph-api/changelog/versions/
- https://developers.facebook.com/blog/post/2026/02/18/introducing-graph-api-v25-and-marketing-api-v25/
- https://developers.facebook.com/blog/post/2025/10/08/introducing-graph-api-v24-and-marketing-api-v24/

---

## 2. Inventario (el "qué") — TODAS las versiones de Graph API en uso

Enumeración exhaustiva por `archivo:línea` (todo el árbol `services/` + `controllers/`, no solo los 58 archivos de alcance, para dimensionar la fragmentación real):

### 2.1 Versiones HARDCODED en URLs de Graph/Instagram

| Versión | Estado Meta (2026-07) | Ubicaciones (archivo:línea) | Nº usos |
|---|---|---|---|
| **v25.0** | Última (vigente hasta ~2028) | `services/AIAgentServices/MetaOfficialMCPClientService.ts:43` (dialog/oauth), `:44` (oauth/access_token) | 2 |
| **v24.0** | Vigente (release 2025-10, ~hasta 2027) | Base de `FacebookServices/graphAPI.ts:8` + **~28 llamadas** en ese archivo (líneas 19,62,121,189,226,250,377,409,502,511,520,535,560,710,737,773,805,830,856,880); `MetaServices/metaClient.ts:8`; `MetaServices/metaSendService.ts:29` (log); `MetaServices/metaMessageListener.ts:163`; `controllers/WhatsAppController.ts:767,785`; `controllers/MessageController.ts:1062` (log); `SocialCommentServices/{Sync,Moderate,Ingest}*.ts` (3); `CommentAutoReplyServices/{PostDiscovery,CommentReplyExecutor}.ts` (2); `FacebookConversionService/FacebookAuthHelper.ts:93,107,128,163`; `WhatsAppCloudAPI/CloudAPIService.ts:90,526` (default) | ~38 |
| **v23.0** | Vigente | `services/MetaMarketingService/TokenManager.ts:5` (`FB_GRAPH_VERSION || "v23.0"`) | 1 |
| **v22.0** | Vigente (~hasta 2027) | `services/UGCSocialProviders/FacebookProvider.ts:59` (`FB_API_BASE`) | 1 |
| **v21.0** | Vigente pero **cercano a EOL** (release 2024-10, ~hasta fines 2026) | `services/UGCSocialProviders/InstagramProvider.ts:60` (`IG_API_BASE`) | 1 |
| **v20.0** | **Se deprecia 2026-09-24** (< 3 meses) | `services/FacebookConversionService/SendConversionEvent.ts:300` (`FACEBOOK_CONVERSIONS_API_VERSION || "v20.0"`) | 1 |
| **v19.0** | **EXPIRADA 2026-05-21 → HTTP 400** | `services/FacebookConversionService/SendWebsiteEvent.ts:65` (`FACEBOOK_CONVERSIONS_API_VERSION || "v19.0"`) | 1 |
| **v17.0** | Expirada hace tiempo | `services/FacebookServices/graphAPI.ts:87` (código comentado) | 1 (muerto) |

### 2.2 Versión vía variable de entorno (defaults inconsistentes)

La variable de entorno real es **`FB_GRAPH_VERSION`** (NO `GRAPH_API_VERSION` — ese es el nombre de la *constante local* que la lee). Defaults divergentes:

| Default | Ubicaciones |
|---|---|
| `v24.0` | `MetaServices/metaManualConnectService.ts:19`, `MetaServices/MetaAppSetupService.ts:19`, `MetaServices/metaEmbeddedSignupService.ts:24`, `MetaServices/metaPhoneLookupService.ts:14`, `SocialCommentServices/ConnectPageService.ts:29`, `controllers/WhatsAppCoexistenceController.ts:103`, `MetaMarketingService/index.ts:242` |
| `v23.0` | `MetaMarketingService/TokenManager.ts:5` |
| `v20.0` | `FacebookConversionService/SendConversionEvent.ts:300` (env `FACEBOOK_CONVERSIONS_API_VERSION`) |
| `v19.0` | `FacebookConversionService/SendWebsiteEvent.ts:65` (env `FACEBOOK_CONVERSIONS_API_VERSION`) |
| `v24.0` fijo (const, sin env) | `WhatsAppTemplateServices/SubmitTemplateToMetaService.ts:39`, `WhatsAppTemplateServices/SyncTemplatesFromMetaService.ts:34` |

**Total: 7 versiones distintas activas simultáneamente (v19→v25) + 1 comentada (v17). No hay una fuente única de verdad.**

### 2.3 Endpoints WhatsApp Cloud API auditados

| Endpoint | Ubicación | Payload/campos | Veredicto |
|---|---|---|---|
| `POST /{phoneNumberId}/messages` | `metaSendService.ts` (text/template/interactive/list/location/contacts), `metaClient.ts:createMetaClient` | `messaging_product:"whatsapp"`, `type`, `to`, header `X-Idempotency-Key` (uuid). Campos correctos y actuales. | ✅ Correcto |
| `POST /{phoneNumberId}/register` | `graphAPI.ts:850-872` | `{ messaging_product:"whatsapp", pin:"000000" }` | ⚠️ PIN hardcodeado `000000` (ver P2-6) |
| `GET/POST/DELETE /{wabaId}/subscribed_apps` | `graphAPI.ts:799-843` | vacío / `access_token` param | ✅ Correcto |
| `POST /{pageId}/subscribed_apps` (FB Messenger/IG) | `graphAPI.ts:287-361` | `subscribed_fields:[messages, messaging_postbacks, message_deliveries, message_reads, message_echoes, conversations, message_reactions, feed]` | ✅ Correcto |
| `GET /debug_token` | `graphAPI.ts:186`, `metaEmbeddedSignupService.ts:235`, `FacebookAuthHelper.ts:128` | `input_token` + `access_token=APP_ID\|APP_SECRET` | ✅ Correcto |
| `GET /oauth/access_token` (embedded signup) | `metaEmbeddedSignupService.ts:131,199` | `client_id/secret/code` y `grant_type=fb_exchange_token` | ✅ Correcto |
| `POST /{phoneNumberId}/message_templates` | `SubmitTemplateToMetaService.ts` | v24.0 fija | ✅ Vigente |

### 2.4 Webhooks Meta

| Handler | Verificación (GET) | Firma (POST) |
|---|---|---|
| `MetaWebhookController.verifyMetaWebhook` (`/webhooks/metaws`) | `hub.verify_token` vs `VERIFY_TOKEN` (default `"whaticket"`) o `tokenMeta` per-WABA | `X-Hub-Signature-256` vía `MetaSignatureValidator` |
| `MetaWebhookController.receiveMetaWebhook` | — | `shouldAcceptWebhook(rawBody, sig)` — modo default **`warn`** (acepta inválidas) |
| `WebHookController` (`/webhook`) | `hub.verify_token` vs `VERIFY_TOKEN` (default `"whaticket"`) | (Baileys legacy) |
| `FBPageWebhookController` | `FACEBOOK_VERIFY_TOKEN\|VERIFY_TOKEN` (default `"chateam_fb_verify"`) | **Sin HMAC** (ya en integraciones P1-2) |

`rawBody` se captura correctamente en `app.ts:113-128` (`bodyParser.json` con `verify`) solo para rutas `/webhook(s)/meta(ws)` + Stripe/fal. La base HMAC es sólida (`createHmac('sha256')` + `timingSafeEqual`, `MetaSignatureValidator.ts:37-44,88-93`).

---

## 3. Arquitectura & Flujos (el "cómo")

### 3.1 Coexistencia — decisión Baileys vs Meta (`OutboundRoutingService.ts`)
`resolveOutbound()` decide el proveedor físico con jerarquía:
1. **Modo efectivo** (`resolveEffectiveMode`): override del agente (`request`) > `routingPolicy` de `UnifiedConversation` (`conversation`) > `auto` (`default`).
2. Modos: `force_meta` / `force_baileys` / `sticky_inbound` (usa `lastInboundChannel`) / `auto` (usa `sendChannel` de la conexión con `coexistenceEnabled`) / `meta_first_baileys_after_23h`.
3. **Ventana 24h Meta** (`computeMetaWindow`, líneas 136-190): busca último inbound `fromMe=false`; margen propio a las **23h** (`META_WINDOW_BAILEYS_THRESHOLD_HOURS=23`) para preferir Baileys antes del límite y evitar errores `131047`/`470`.
4. **Fallback** (líneas 407-428): si el provider elegido no está listo (`isMetaReady`: `channel=meta`+`phoneNumberId`+`tokenMeta`; `isBaileysAlive`: `status=CONNECTED`), intenta el alterno; si ninguno, usa `seedWa` "best effort".
5. Solo decide; el envío lo hace `OutboundDispatchService` (con retry meta→baileys, líneas 205-230).

Diseño **sólido y bien documentado**. Observaciones en Hallazgos (P2/P3).

### 3.2 Migración Baileys→Meta (`BaileysToMetaMigrationService.ts`)
`startMigration` (elegibilidad → `removeWbot` → `DeleteBaileysService` → limpiar Redis → `coexistenceStatus="migrating"`) y `completeMigration` (reasigna tickets `open/pending` a la Meta, marca vieja `MIGRATED`). Respeta "BD sagrada" (no borra, marca). Correcto.

### 3.3 Echoes SMB (`metaSmbMessageEchoesService.ts`)
`handleSmbMessageEchoes`: mensajes que el staff envía desde la Business App entran como `fromMe:true`, `sourceChannel:'business_app'`; NO disparan IA/chatbot/FlowBuilder; dedupe por `wid` vía `InboundEventLedgerService`. Respeta `receiveChannel=baileys`. Correcto.

### 3.4 Liveness (`CoexistenceLivenessService.ts`) y Refresh de tokens (`MetaTokenRefreshService.ts`)
- Liveness: Meta exige abrir la Business App cada **14 días**; alertas a 11 (warning), 13 (critical), 14+ (`coexistenceStatus="disabled"`). Correcto respecto a la regla de Meta.
- Refresh: tokens long-lived de **60 días**; renueva si `updatedAt` > 50 días (`refreshLongLivedToken`). Ver P1-2 (proxy frágil por `updatedAt`).

---

## 4. Hallazgos (severidad P0/P1/P2/P3)

> Nota: la firma en modo `warn` y `VERIFY_TOKEN=whaticket` ya están cubiertas como **P1-5** en `06-seguridad/seguridad.md`, y los tokens en claro como **P1-6/P1-6**. Aquí se **profundiza el ángulo de versiones/endpoints** y se referencia lo anterior sin duplicar la remediación.

### P1 — Alto

**P1-1 · Conversions API usa versiones EXPIRADA / casi-expirada (rotura funcional inminente).**
`FacebookConversionService/SendWebsiteEvent.ts:65` default **`v19.0` — EXPIRÓ 2026-05-21** (Meta devuelve HTTP 400 a menos que `FACEBOOK_CONVERSIONS_API_VERSION` esté seteada). `SendConversionEvent.ts:300` default **`v20.0` — se deprecia 2026-09-24**. Impacto: eventos de conversión server-side (CAPI) — incluidos los disparados por pagos Stripe vía `SendWebsiteEvent` — pueden estar **fallando silenciosamente hoy** o romperse en < 3 meses. Fix: subir a v24.0/v23.0 y centralizar. **Verificar en runtime si `FACEBOOK_CONVERSIONS_API_VERSION` está seteada en `.env` de prod** — si no lo está, el CAPI ya está roto.

**P1-2 · Refresh de token Meta usa `updatedAt` como proxy de expiración (renovaciones perdidas / tokens caducados).**
`MetaTokenRefreshService.ts:57-65` decide renovar según `updatedAt > 50 días`. Pero `updatedAt` cambia con **cualquier** update del registro `Whatsapp` (p.ej. `lastAppOpenedAt`, `coexistenceStatus`, cambios de `sendChannel`), reseteando el reloj **sin** renovar el token. Un número activo puede llegar a los 60 días con un `updatedAt` reciente y **nunca renovarse → token expira → conexión Meta muere**. Además `metaEmbeddedSignupService.ts` calcula `tokenExpiresAt` pero **no lo persiste** (no hay columna dedicada; el propio header del servicio lo admite). Fix: columna `tokenMetaExpiresAt` poblada en signup/refresh y usada como criterio.

### P2 — Medio

**P2-3 · Fragmentación de versión Graph API: 7 versiones simultáneas sin fuente única.**
v19/v20/v21/v22/v23/v24/v25 conviven (§2.1). La variable `FB_GRAPH_VERSION` existe pero: (a) no la usan los ~38 hardcodes de `v24.0`, (b) tiene defaults divergentes (`v24.0` vs `v23.0`), (c) `FacebookConversionService` usa OTRA variable (`FACEBOOK_CONVERSIONS_API_VERSION`) con defaults v19/v20, (d) `WhatsAppCloudAPI/CloudAPIService.ts` y `WhatsAppTemplateServices/*` fijan `v24.0` sin env. Riesgo: al expirar cualquier versión hay que editar decenas de archivos; imposible rotar versión de forma atómica. Fix: `config/metaGraph.ts` con `GRAPH_API_VERSION` única (default v24.0) consumida por todos.

**P2-4 · `UGCSocialProviders` clavados en v22.0/v21.0 (Facebook/Instagram) fuera del esquema env.**
`FacebookProvider.ts:59` (`v22.0`) e `InstagramProvider.ts:60` (`v21.0`, cercano a EOL) son constantes de módulo sin env. Al expirar v21 (~fines 2026) el proveedor IG dejará de publicar. Fix: mover a config central.

**P2-5 · `MetaOfficialMCPClientService` en v25.0 mientras el resto va en v24.0.**
`MetaOfficialMCPClientService.ts:43-44` usa v25.0 (correcto, es lo más nuevo) pero evidencia la falta de estándar: el mismo repo mezcla la más nueva y versiones expiradas. No rompe, pero confirma P2-3.

**P2-6 · `POST /{phoneNumberId}/register` con PIN hardcodeado `"000000"`.**
`graphAPI.ts:859`. Si el número tiene verificación en dos pasos (two-step PIN) con un PIN distinto, `register` falla con error 133xxx. Aceptable para números nuevos sin PIN, frágil para migraciones de números existentes. Fix: PIN configurable por conexión.

### P3 — Bajo

**P3-7 · Idioma de plantilla default inconsistente.** `metaSendService.ts:121` usa `lang="es"` (dynamic) vs `:306` `lang="es_ES"` (legacy). Meta valida el `language.code` exacto contra la plantilla aprobada; un default equivocado produce error `132001` (template does not exist in the specified language). Unificar y forzar el code exacto de la plantilla.

**P3-8 · Endpoints/funciones muertas y `console.log` de payloads.** `graphAPI.ts` conserva bloques comentados (v17.0 en `:87`, `sendInstagramAttachment` duplicada x2) y `metaSendService.ts` / `metaClient.ts` loguean payloads completos (incluye prefijo de token, ya notado en seguridad P2-8). Limpiar código muerto y logs.

**P3-9 · `computeMetaWindow` hace query por ticket en cada envío.** `OutboundRoutingService.ts:150` (`Message.findOne` último inbound) se ejecuta en cada `resolveOutbound`; sin índice `(ticketId, companyId, fromMe, createdAt)` puede ser costoso en tickets con historial grande. Verificar índice.

---

## 5. Recomendaciones (prioridad)

1. **[P1-1] Inmediato**: setear `FACEBOOK_CONVERSIONS_API_VERSION=v24.0` en `.env` de prod HOY (mitiga la rotura de CAPI por v19 expirada) y cambiar los defaults del código a v24.0. Verificar logs de CAPI por errores 400/"version" recientes.
2. **[P2-3] Centralizar**: crear `config/metaGraph.ts` exportando `GRAPH_API_VERSION` (env `GRAPH_API_VERSION`, default **`v24.0`**) + helpers `graphBase()`, `graphUrl(path)`. Reemplazar los ~38 hardcodes v24.0, los defaults `FB_GRAPH_VERSION`, y unificar `FACEBOOK_CONVERSIONS_API_VERSION` bajo la misma fuente. Meta recomendada vigente: **v25.0** (última); **v24.0** es el mínimo seguro (soportado ~hasta 2027) y ya es el de facto del repo.
3. **[P1-2] Persistir expiración de token**: añadir `tokenMetaExpiresAt` a `Whatsapp`, poblarla en `processEmbeddedSignupCallback`/`refreshLongLivedToken`, y que `MetaTokenRefreshService` compare contra ella (no `updatedAt`).
4. **[Seguridad, ya en P1-5 seguridad.md]** Migrar `META_SIGNATURE_MODE=enforce` y `VERIFY_TOKEN` fuerte (quitar defaults `whaticket`/`chateam_fb_verify`). El código ya soporta `enforce`; es un cambio de env + verificación de logs.
5. **[P2-4/P2-5]** Migrar `UGCSocialProviders` y unificar el MCP client a la config central; planear salto coordinado a v25.0.
6. **[P2-6/P3-7]** PIN de `register` configurable; unificar `language.code` de plantillas al code exacto aprobado.
7. **[P3]** Limpiar código muerto/logs de payloads; verificar índice para `computeMetaWindow`.

---

## 6. Evidencia (archivo:línea, comandos, salidas)

**Versiones (grep sobre `services/` + `controllers/`):**
- v25.0 → `services/AIAgentServices/MetaOfficialMCPClientService.ts:43-44`
- v24.0 → base `services/FacebookServices/graphAPI.ts:8` (+ ~28 usos internos), `services/MetaServices/metaClient.ts:8`, `services/WhatsAppCloudAPI/CloudAPIService.ts:90,526`, `controllers/WhatsAppController.ts:767,785`
- v23.0 → `services/MetaMarketingService/TokenManager.ts:5`
- v22.0 → `services/UGCSocialProviders/FacebookProvider.ts:59`
- v21.0 → `services/UGCSocialProviders/InstagramProvider.ts:60`
- v20.0 → `services/FacebookConversionService/SendConversionEvent.ts:300`
- v19.0 → `services/FacebookConversionService/SendWebsiteEvent.ts:65`
- v17.0 (comentado) → `services/FacebookServices/graphAPI.ts:87`
- env `FB_GRAPH_VERSION` defaults → `MetaServices/{metaManualConnectService:19,MetaAppSetupService:19,metaEmbeddedSignupService:24,metaPhoneLookupService:14}`, `SocialCommentServices/ConnectPageService.ts:29`, `controllers/WhatsAppCoexistenceController.ts:103`, `MetaMarketingService/index.ts:242`

**Coexistencia / webhooks / firma:**
- Routing: `services/CoexistenceServices/OutboundRoutingService.ts:284-465`; ventana 24h `:115-190`; fallback `:407-428`.
- Firma HMAC: `services/CoexistenceServices/MetaSignatureValidator.ts:23-27` (default `warn`), `:88-93` (HMAC), `:102-131` (`shouldAcceptWebhook`).
- rawBody: `app.ts:113-128`.
- Verify token: `controllers/MetaWebhookController.ts:29` (`whaticket`), `controllers/WebHookController.ts:12`, `controllers/FBPageWebhookController.ts:22`.
- Refresh: `services/MetaServices/MetaTokenRefreshService.ts:57-65`; expiración no persistida `services/MetaServices/metaEmbeddedSignupService.ts:329`.
- Liveness: `services/MetaServices/CoexistenceLivenessService.ts:86-137`.
- Migración: `services/MetaServices/BaileysToMetaMigrationService.ts:59-276`.
- Echoes: `services/MetaServices/metaSmbMessageEchoesService.ts:30-55`.

**Fuentes externas (versiones vigentes/deprecación):**
- https://developers.facebook.com/docs/graph-api/changelog/versions/
- https://developers.facebook.com/blog/post/2026/02/18/introducing-graph-api-v25-and-marketing-api-v25/
- https://www.socialcrawl.dev/blog/facebook-data-api-2026 (v18 expiró 2026-01-26, v19 expiró 2026-05-21, v20 deprecia 2026-09-24)
