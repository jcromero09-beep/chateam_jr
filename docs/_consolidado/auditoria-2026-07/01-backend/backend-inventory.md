# Backend — Inventario & Auditoría (Spec-Driven)

> Proyecto: `chateam-platform` v1.1.0 · Node.js+TS (ESM/tsx) · Express · Sequelize · PostgreSQL 17 + pgvector · Redis · Bull · Socket.IO · PM2
> Fecha: 2026-07-12 · Código = SOLO LECTURA · Base: `/home/jcromero09/chateam_jr`

---

## 1. Propósito / Alcance

Plataforma omnicanal multi-tenant (WhatsApp Baileys + Meta Cloud API + Telegram + TikTok + WebChat + Email Marketing + UGC/IA generativa). Este inventario cubre el **backend HTTP + workers + colas + socket**: puntos de entrada, ciclo de vida de request, ~129 archivos de ruta, 142 controladores, 857 servicios en ~124 subdominios, middleware, jobs Bull, helpers y libs. No cubre modelos/BD ni frontend (auditados por separado).

Conteos reales (verificados con `find`/`wc`):

| Capa | Conteo | Comando |
|---|---|---|
| Archivos de ruta | **129** (`routes/*.ts` 122 + `routes/api/*.ts` 7) | `find routes -name '*.ts' \| wc -l` |
| Controladores | **142** | `find controllers -name '*.ts' \| wc -l` |
| Servicios | **857** | `find services -name '*.ts' \| wc -l` |
| Subdominios de servicios | **124** dirs | `find services -maxdepth 1 -type d` |
| Middleware | **11** | `ls middleware` |
| Jobs (Bull processors) | **37** | `ls jobs` |
| Workers | **1** (`stageClassifier.worker.ts`) | `ls workers` |
| Helpers | **40** | `find helpers -name '*.ts'` |
| Libs | **13** | `ls libs` |
| Colas Bull (queues.ts) | **~34** definidas | `grep 'new Bull' queues.ts` |

---

## 2. Inventario (el "qué")

### 2.1 Puntos de entrada

| Archivo | Rol | Notas |
|---|---|---|
| `app.ts` | Fábrica Express (middleware, rutas, error handler) | Exporta `app`. Sin `trust proxy`. |
| `server-simple.ts` | **Entry mono-proceso** (`main` = `dist/server-simple.js`, `npm start`) | Inicia colas + cron + `StartAllWhatsAppsSessions` por company + Socket.IO. |
| `server-distributed.ts` | Entry multi-nodo (`NODE_ID`, `PORT`, `MAX_SESSIONS=60`) | Sólo `node-1` corre colas/cron; reparto de sesiones vía `sessionRegistry` + `stagedStart`. |
| `server.ts` | Wrapper legacy (1.4KB) | Redundante. |
| `worker.ts` | Proceso worker autónomo | Sólo colas + schedulers (Campaign, FacebookConversion, MetaCoexistence, AppointmentCleanup). NO abre WhatsApp. Graceful shutdown cierra colas Bull. |
| `bootstrap.ts` | Carga env temprano | Importado primero por todos. |
| `backendQueues.ts` (235 líneas) | `startBackendQueueProcessors()` | MessageQueue, NotificationQueue, etc. |
| `backendCronJobs.ts` (983 líneas) | `startBackendCronJobs()` | autoclose, kanban, randomUser, queueMonitor, invoices. |
| `queues.ts` (**1617 líneas**) | Definición + procesamiento de ~34 colas Bull | Núcleo asíncrono. |

**Ciclo de request** (`app.ts`): `helmet` → `compression` → CORS dinámico → `cookieParser` → raw body parser para `/subscription/stripewebhook` (5mb) → `/internal` JSON 300mb → JSON global 50mb (con `verify` que captura `rawBody` para Stripe/fal/Meta) → urlencoded → static `/public` (con `?download`) → `traceIdMiddleware` → `httpLogger` (solo prod) → `routes` → error handler global.

### 2.2 Montaje de rutas (`routes/index.ts`, 681 líneas)

Prefijos por dominio (montaje real en `index.ts`):

**Root (sin prefijo, cada archivo declara su path completo):** userRoutes, notificationRoutes, settingRoutes, contactRoutes, ticketRoutes, whatsappRoutes, messageRoutes, whatsappSessionRoutes, telegramRoutes (`/telegram`), tiktokRoutes (`/tiktok`), queueRoutes (`/queue`), companyRoutes (`/companies`), planRoutes (`/plans`), ticketNoteRoutes, receiptsRoutes (`/recepts`), quickMessageRoutes, helpRoutes, dashboardRoutes, scheduleRoutes (`/schedules`), tagRoutes (`/tags`), contactList*, campaign*, announcementRoutes, chatRoutes, chatBotRoutes (`/chatbot`), subScriptionRoutes (`/subscription`), invoiceRoutes (`/invoices`), versionRouter, filesRoutes (`/files`), queueOption/queueIntegration, ticketTagRoutes, flow* (`/flowdefault`, `/flowcampaign`, flowBuilder), promptRoutes (`/prompt`), statisticsRoutes, companySettingsRoutes, scheduleMessageRoutes (`/schedules-message`), coexistenceDispatchRoutes (`/coexistence`), paypalRoutes (`/paypal`), financialRoutes (`/financial`), facebookConversionRoutes, kanbanLeadConversionRoutes, campaignRuleRoutes, metaMarketingRoutes, campaignAuditRoutes, attributionRoutes, campaignMessageRoutes, customerOriginRoutes (`/customer-origins`), email* (7 routers), aiAffiliate/affiliate, ticketFlowRoutes (`/tickets/:id/flow`), emailPlanRoutes, paymentConfigRoutes (`/payment-config`), comment/socialComment (`/social-comments`), drive/mediaBackup, +19 routers AI Platform (`/ai/*`), agentDevice/agentInteraction (`/ugc/*`).

**Prefijo `/api`:**
- `/api/auth` → authRoutes (login, signup, refresh, me, validate, forgot/reset)
- `/api/messages` → apiRoutes (**API externa**, auth por `tokenAuth` de Whatsapp.token)
- `/api` → apiCompanyRoutes, apiContactRoutes, apiMessageRoutes (`routes/api/*`)
- `/api/ai-image-generation`, `/api/ai-video-generation`
- `/api/generation/*` + `/api/webhooks/higgsfield` (generationRoutes)

**Prefijo `/webhook`:** webHookRoutes (`GET/POST /`, `/metaws`, `/meta`, `/facebook`) · `/webhook/meta` → whatsappCoexistenceRoutes (Embedded Signup).

**Prefijos dedicados:** `/whatsapp-monitor`, `/whatsapp-meta`, `/whatsapp` (coexistence), `/whatsapp-templates`, `/ai`, `/ai/subplan-purchase`, `/webchat`, `/appointments`, `/integrations`.

**`/internal` (localhost-only):** internalRoutes — `/internal/send`, `/send-media`, `/session/:id/status`, `/session/:id/restart`, `/health`, `/msg-status`, `/msg-pending/:wid`, **`/wbot-call`** (invoca `wbot[method](...args)` arbitrario), `/delete-message`, `/edit-message`.

**Stubs inline en `index.ts`:** `GET /health`, `GET /analytics` (isAuth, devuelve datos vacíos, l.464), `POST /email-marketing/packs/purchase` (isAuth, no-op, l.473).

### 2.3 Middleware (`middleware/`, 11 archivos)

| Archivo | Función | Riesgo |
|---|---|---|
| `isAuth.ts` (106) | JWT + validación de `Session` en BD (revocación, expiración, sid). Throttle `lastSeenAt` (60s). | Sólido. |
| `isAuthCompany.ts` (37) | Auth con scope de company. | — |
| `isSuper.ts` (17) | Requiere `user.super` (relee de BD). Error en portugués "Acesso não permitido". | Usado sólo en 11 archivos de ruta. |
| `tokenAuth.ts` (40) | Auth de **API externa** por `Whatsapp.token`. `console.log` de tokens. | Ver P1. |
| `envTokenAuth.ts` (36) | Compara `req.query.token`/`body.token` con `process.env.ENV_TOKEN`. `console.log(req.query)`. | Ver P1. Usado en settingRoutes + authRoutes. |
| `tenantMiddleware.ts` (232) | Multi-tenant por companyId. | **Sólo montado en 2 archivos** (aislamiento tenant depende de queries, no de middleware). |
| `rateLimiter.ts` (255) | Rate limiting. | **Sólo en 4 archivos de ruta** de 129. |
| `validateAICredits.ts` (85) | Gate de créditos IA. | — |
| `validateChatAccess.ts` (75) | Acceso a chat. | — |
| `checkTermsAcceptance.ts` (54) | Aceptación de términos. | — |
| `traceIdMiddleware.ts` (50) | `X-Trace-Id` + AsyncLocalStorage. | Correcto. |

### 2.4 Servicios (857 archivos, top subdominios)

| Subdominio | Archivos | Función |
|---|---|---|
| AIAgentServices | 46 | Orquestador de agentes IA, guardrails, memoria, procesamiento. |
| UGCProviders | 43 | Proveedores generativos (ComfyUI, Fal, Heygen, etc.). |
| MetaServices | 26 | Meta Cloud API / estrategias / colas. |
| EmailMarketing | 24 | Envío, providers (SendGrid, SES, Carbonio — varios stub). |
| WbotServices | 20 | Baileys: Start/StartAll sesión, envío media, ACK. |
| IntegrationsServices | 20 | CRM/ERP. |
| ContactServices | 18 | Contactos. |
| TicketServices | 16 | Tickets/omnichannel. |
| CompanyService | 16 | Companies. |
| TikTokService | 15 | — |
| AICreditServices | 14 | Créditos IA. |
| WhatsappService / WebhookService / SocialCommentServices / MessageServices | 13 c/u | — |
| FlowBuilderService | 12 | Constructor de flujos. |
| CoexistenceServices | 11 | Coexistencia WA/Meta + `MetaSignatureValidator`. |
| RAGServices | 7 | RAG/pgvector. |
| WhatsAppCloudAPI | **1** | Casi vacío (posible consolidado en MetaServices). |

Resto: ~100 subdominios AI* / UGC* / Campaign* / Email* / Payment (Paypal, MercadoPago, Coingate, Stripe vía Subscription), Statistics, Kanban, Attribution, etc.

### 2.5 Colas Bull (`queues.ts`, ~34 colas)

Definidas: ScheduledMessages, AppointmentReminder, SendPendingMessage, CampaignQueue, ExportContacts, VerifyContactsWhatsapp, ImportContacts, FacebookConversionQueue, VideoGenerationQueue, UGCVideoGeneration/Pipeline/ImageGeneration, GenerationPollQueue, EmailSend/Campaign/Webhook/Automation, MessageQueue, NotificationQueue, SendAppointmentReminder, SendScheduledMessages, FeedbackInference, HumanCorrectionExtractor, ExtractMemory, CommentResponderQueue, +factory dinámica (l.798). Jobs procesadores en `jobs/` (37).

### 2.6 Socket.IO (`libs/socket.ts`, 259 líneas)

- `initIO`: CORS **`origin:"*"` + `credentials:true`**, `maxHttpBufferSize:1e8` (100MB), transports websocket+polling.
- Adapter Redis en `DISTRIBUTED_MODE` (pub/sub, fallback sin AUTH).
- **Namespace dinámico** `io.of(/^\/\w+$/)` = un namespace por `companyId` (l.125). `userId` viene de `handshake.query`, `companyId` del nombre del namespace.
- Rooms: `joinChatBox(ticketId)`, `joinNotification`, `joinTickets(status)`, presencia `company-{id}-user`.

---

## 3. Arquitectura & Flujos

- **Multi-tenant** por columna `companyId`; el aislamiento se aplica principalmente en cada query de servicio (JWT lleva `companyId`), NO en un middleware global (`tenantMiddleware` sólo en 2 rutas).
- **Auth HTTP**: 121/129 archivos importan `isAuth` (JWT + Session en BD). API externa (`/api/messages/send`) usa `tokenAuth` (Whatsapp.token).
- **Webhooks entrantes**: Meta (`/webhook/metaws`, `/webhooks/meta`) valida HMAC `X-Hub-Signature-256` vía `MetaSignatureValidator`, **modo por defecto `warn` (fail-open)**. Stripe usa raw body + `constructEvent`.
- **Distribución**: `sessionRegistry` (Redis) asigna sesiones WhatsApp a nodos; `watchdog` reasigna; comunicación inter-nodo por `/internal/*` (HTTP localhost) + `messageRegistry`.
- **Logging**: pino (`utils/logger`) + `httpLogger` sólo en prod. Muchos `console.log`/emoji dispersos (23 archivos de ruta/middleware).
- **traceId**: `X-Trace-Id` propagado con AsyncLocalStorage; correlación con companyId.
- **Envelope de respuesta**: **inconsistente** — coexisten `{success, message, data}` (75 archivos), `res.json(entidad)` plano (85 archivos), y errores `{error, message}` (app.ts). No hay envelope único.

---

## 4. Hallazgos (severidad P0–P3)

### P0 — Críticos

**P0-1 · `/internal/*` potencialmente expuesto: `trust proxy` no configurado.**
`internal.ts:109-116` autoriza si `req.ip ∈ {127.0.0.1, ::1, ::ffff:127.0.0.1}`. En `app.ts` **no se llama `app.set('trust proxy', ...)`**. Detrás de nginx (backend en 127.0.0.1:3010, prefijo `/be/`), `req.ip` = IP del socket = **127.0.0.1 para TODA petición proxeada** → el filtro localhost pasa para cualquier cliente externo salvo que nginx bloquee `/internal`. El `nginx/conf.d/default.conf` del repo NO tiene `location /internal` (locations: `/`, `/api/`, `/audit/`, `/uploads/`, `/health`). `/internal/wbot-call` ejecuta `wbot[method](...args)` arbitrario y `/internal/send*` envía WhatsApp a cualquier número. **Verificar el nginx de producción (padeldev) y añadir `deny`/`return 403` en `location /internal`.** Evidencia: `app.ts:105-108`, `routes/internal.ts:109-116,310-345`, `nginx/conf.d/default.conf`.

### P1 — Altos

**P1-1 · Socket.IO sin autenticación ni aislamiento de tenant.**
`libs/socket.ts` no registra `io.use(authMiddleware)`. El namespace se deriva de `companyId` en la URL y `userId` de `handshake.query` **sin verificar JWT**. Un cliente puede conectarse a `/{cualquierCompanyId}`, `joinChatBox(ticketId)` y recibir eventos/mensajes de otro tenant. Agravado por `origin:"*"`. Evidencia: `libs/socket.ts:88-100,125-133,216-239`.

**P1-2 · Validación de firma Meta en fail-open por defecto (`warn`).**
`MetaSignatureValidator.ts:24` → `META_SIGNATURE_MODE` default `warn` = loguea pero **acepta firmas inválidas** (`receiveMetaWebhook`, `MetaWebhookController.ts:56-73`). Permite inyección de eventos webhook falsos (mensajes/estados spoofed) si no se fija `enforce` en `.env`. Evidencia: `services/CoexistenceServices/MetaSignatureValidator.ts:7-26,100-128`.

**P1-3 · Fuga de secretos en logs (`console.log` de tokens).**
`tokenAuth.ts:19,25,29` imprime `token enviado`/`token base chat`. `envTokenAuth.ts:18` imprime `req.query` completo (incluye `token`). Los tokens de API quedan en logs de PM2. Evidencia: `middleware/tokenAuth.ts:19-29`, `middleware/envTokenAuth.ts:18`.

**P1-4 · CORS Socket.IO `origin:"*"` con `credentials:true`.**
Configuración inválida/insegura (navegadores rechazan `*`+credentials, pero deja la puerta abierta a orígenes arbitrarios en el handshake). `libs/socket.ts:90-93`.

### P2 — Medios

**P2-1 · 7 archivos de ruta muertos (definidos, no montados).** `billingRoutes.ts`, `contactTemperatureRoutes.ts`, `debugRoutes.ts`, `healthRoutes.ts`, `mediaRoutes.ts`, `webchatRoutes.ts`, `webhookWebchatRoutes.ts`. Ninguno referenciado en `index.ts`/`app.ts`/`server-*`. Riesgo de re-montaje accidental. Evidencia: `grep -c '<name>' routes/index.ts` = 0 para cada uno.

**P2-2 · `debugRoutes.ts` marcado "BORRAR DESPUÉS" sigue en el árbol.** Contiene `GET /webchat/:apiKey` que hace queries SQL crudas y devuelve `error.stack` (fuga de info). No montado (mitigado) pero debe eliminarse. `routes/debugRoutes.ts:1,84-87`.

**P2-3 · Envelope de respuesta inconsistente.** Conviven `{success,message,data}` (75 files), objeto plano `res.json(x)` (85 files) y `{error,message}`/`{error}` en el handler global (`app.ts:171-211`). Los webhooks internos usan `{success,result}` / `{error}`. Frontend debe manejar múltiples formas. Sin envelope estándar documentado.

**P2-4 · Rate limiting casi inexistente.** `rateLimiter` sólo en **4/129** archivos de ruta. Endpoints públicos sensibles (`/api/auth/login`, `/signup`, `/forgot-password`, webhooks, `/api/messages/send`) sin throttling visible → fuerza bruta / abuso. `middleware/rateLimiter.ts` existe pero infrautilizado.

**P2-5 · `tenantMiddleware` montado en sólo 2 rutas.** El aislamiento multi-tenant recae 100% en que cada servicio filtre por `companyId` — un solo query sin `where companyId` = fuga cross-tenant. No hay defensa en profundidad a nivel middleware.

**P2-6 · Doble arranque de sesiones WhatsApp según entry point.** `server-simple.ts` abre sesiones de TODAS las companies en un proceso; `server-distributed.ts` reparte por nodo. Si ambos modos conviven mal configurados (PM2), riesgo de sesiones duplicadas / conflictos Baileys.

### P3 — Bajos / Higiene

**P3-1 · Ruido de logging.** `routes/index.ts` conserva ~90 `console.log` comentados de bootstrap; 23 archivos de ruta/middleware con `console.log` activos; emojis en logs de producción. Migrar todo a pino.

**P3-2 · Stubs en producción devuelven éxito falso.** `GET /analytics` (index.ts:464) y `POST /email-marketing/packs/purchase` (index.ts:473) responden `success:true` con datos vacíos/`null` — el cliente no distingue "sin datos" de "no implementado".

**P3-3 · Providers de email stub.** `EmailMarketing/providers/{SendGrid,AmazonSes,Carbonio}Provider.ts` aparecen como stubs (heurística "no implementado/placeholder"). Verificar antes de vender esos canales.

**P3-4 · Servicios cuasi-vacíos / dirección dudosa.** `services/WhatsAppCloudAPI/` tiene 1 archivo; `services/MetaServices/strategies/strategyQueue.ts` <60 bytes. Consolidar o eliminar.

**P3-5 · 36 archivos con TODO/FIXME/HACK/BORRAR** en routes/controllers/services/middleware. Revisar los de seguridad/pagos.

**P3-6 · `server.ts` legacy redundante** frente a `server-simple.ts`/`server-distributed.ts`.

---

## 5. Recomendaciones

1. **P0**: Añadir `location /internal { deny all; }` (o allow 127.0.0.1) en el nginx de producción **y** configurar `app.set('trust proxy', 1)` + validar `req.socket.remoteAddress` en `internal.ts` en vez de `req.ip`. Confirmar exposición real con una sonda GET a `https://padeldev.codigo.plus/be/internal/health`.
2. **P1**: Registrar `io.use()` en Socket.IO que verifique el JWT (mismo `isAuth`) y **fuerce** que el namespace `companyId` coincida con el `companyId` del token. Cambiar `origin:"*"` por `FRONTEND_URL`.
3. **P1**: Poner `META_SIGNATURE_MODE=enforce` en `.env` de producción tras confirmar firmas válidas; documentar el flag.
4. **P1**: Eliminar todos los `console.log` de tokens (`tokenAuth`, `envTokenAuth`).
5. **P2**: Borrar los 7 route files muertos + `debugRoutes.ts`. Adoptar un envelope único (`{success,data,error,traceId}`) y un helper `respond()`.
6. **P2**: Aplicar `rateLimiter` a auth, signup, forgot-password, webhooks públicos y API externa. Introducir `tenantMiddleware` global o un guard de query.
7. **P3**: Consolidar entry points (elegir simple vs distributed por env), migrar logging a pino, resolver stubs (`/analytics`, packs, email providers).

---

## 6. Evidencia (comandos y archivo:línea)

```
find routes -name '*.ts' | wc -l           → 129
find controllers -name '*.ts' | wc -l      → 142
find services -name '*.ts' | wc -l         → 857
find services -maxdepth 1 -type d | wc -l  → 124
ls jobs | wc -l                            → 37 processors
wc -l queues.ts                            → 1617
grep -rln isAuth routes | wc -l            → 121 / 129
grep -rln rateLimiter routes | wc -l       → 4
grep -rln tenantMiddleware routes app.ts   → 2
grep -rln isSuper routes | wc -l           → 11
```

- Entry points: `app.ts:62-168`, `server-simple.ts:37-74`, `server-distributed.ts:40-98`, `worker.ts:15-55`.
- Montaje rutas: `routes/index.ts:447-680`.
- `/internal` sin trust proxy: `app.ts` (sin `set('trust proxy')`), `routes/internal.ts:109-116,310-345`; `nginx/conf.d/default.conf:14-50` (sin `/internal`).
- Socket sin auth: `libs/socket.ts:88-100,125-133,216-248`.
- HMAC fail-open: `controllers/MetaWebhookController.ts:56-73`, `services/CoexistenceServices/MetaSignatureValidator.ts:7-26,100-128`.
- Logs de tokens: `middleware/tokenAuth.ts:19-29`, `middleware/envTokenAuth.ts:18`.
- Auth JWT+Session: `middleware/isAuth.ts:42-104`.
- API externa por token: `routes/apiRoutes.ts:14-23`, `middleware/tokenAuth.ts:16-24`.
- Rutas muertas: `routes/{billingRoutes,contactTemperatureRoutes,debugRoutes,healthRoutes,mediaRoutes,webchatRoutes,webhookWebchatRoutes}.ts` (0 refs en `index.ts`).
- Stubs: `routes/index.ts:464-479`.
- Envelope mixto: `app.ts:171-211` vs `routes/internal.ts:126,269`.
