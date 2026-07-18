# 04g — Análisis Técnico WhatsWay (benchmark para chateam_jr)

> Método spec. SOLO análisis técnico de features + patrones de arquitectura TS.
> Fuente: `whatsway/.../src` (CodeCanyon 59831604). Producto **Diploy WhatsWay v3.7.7**.
> Fecha: 2026-07-12.

---

## 1) Qué es + stack

**WhatsWay** (marca *Diploy* de Bisht Technologies) es una plataforma **SaaS multi-tenant de WhatsApp Marketing Automation**: bots/flows, chats team-inbox, bulk sender/campañas, IA con RAG, plantillas Meta, billing con 5 pasarelas, API pública REST v1 y webhooks salientes. Es un competidor directo/superset de chateam_jr.

### Stack (versiones reales, `package.json` raíz)
| Capa | Tecnología | Versión | Evidencia |
|---|---|---|---|
| Runtime | Node.js + **TypeScript** | TS 5.6.3 | `package.json:187` |
| Backend HTTP | **Express 4** | 4.21.2 | `package.json:94` |
| ORM | **Drizzle ORM** + drizzle-zod + drizzle-kit | 0.45.2 / 0.7.0 / 0.31.4 | `package.json:90,91,181` |
| DB | **PostgreSQL** (`pg` + Neon serverless driver) | pg 8.16 | `package.json:126,32` |
| Colas | **BullMQ** sobre Redis (`ioredis`) | 5.70 | `package.json:80,103` · `server/services/bull-queue.ts` |
| Realtime | **Socket.IO 4** (+ `@socket.io/redis-adapter`) **y** `ws` (WebSocketServer nativo) | 4.8.1 | `package.json:139,61,151` · `server/socket.ts`, `routes/index.ts:109` |
| Frontend | **React 18** SPA | 18.3.1 | `package.json:129` |
| Router SPA | **wouter** (no react-router en el shell) | 3.3.5 | `App.tsx` usa `<Route>` de wouter |
| Data-fetching | **TanStack Query 5** | 5.60 | `package.json:64` |
| State | **Zustand 5** | 5.0.7 | `package.json:154` |
| UI | **Radix UI** + Tailwind 3 + `class-variance-authority` (patrón shadcn) | — | `package.json:34-60` |
| Flow builder | **@xyflow/react** (React Flow) | 12.8.4 | `package.json:76` · usado en `automation-flow-builder` |
| IA | **OpenAI SDK 6** (baseURL configurable → cualquier proveedor OpenAI-compatible) | 6.7.0 | `package.json:119` · `webhook-handler.ts:824`, `training.service.ts:36` |
| Build | **Vite 7** (front) + **esbuild** (bundle server ESM) | — | `package.json:11` |
| Auth | Passport local + express-session + connect-pg-simple + JWT + bcryptjs | — | `package.json:104,122,86` |
| Pagos | Stripe, Razorpay, PayPal, Paystack (custom), MercadoPago | — | `package.json:110,128,33,141` · schema.ts:73-77 |
| Storage | AWS S3 / DigitalOcean Spaces / Google Cloud Storage + `multer-s3` + `sharp` | — | `package.json:27,29,138` |
| Monorepo | Paquete local **`@diploy/core`** (`packages/diploy-core`) alias en build | — | `package.json:11,28` |
| Proceso | PM2 (`ecosystem.config.cjs`), nginx, deploy.sh | — | raíz |

**Nota estructural:** el prompt asumía `brain/` (backend) + `client/` + `migrations/`. La realidad: `brain/` es un scratch vacío (`ee5f0718.../scratch/sync_translations.py`). El **backend real está en `server/`**, el schema en `shared/schema.ts` (1900 líneas, monolítico), migraciones en `migrations/*.sql` (Drizzle) y el front en `client/src`. El "brain/client" es marketing; la arquitectura efectiva es **server/ (controllers→services→repositories) + shared/ (schema+tipos+roles) + client/ (React SPA)**.

**Canales:** solo **WhatsApp Cloud API oficial** (Meta Graph API). Dos métodos de conexión: `manual` (pegar phone_number_id + token) y `embedded` (Embedded Signup OAuth de Meta) — `channels.controller.ts:265,669`. **No hay QR / WhatsApp Web no-oficial** (Baileys/whatsapp-web.js). La página `QRCodes.tsx` genera QR *click-to-chat*, no login. Soporta **coexistence** (`channels.isCoexistence`) y **MM Lite API** (Marketing Messages Lite, `campaign.apiType='mm_lite'`).

---

## 2) Tabla EXHAUSTIVA funciones × área

Derivada de: 3 archivos de migración + `shared/schema.ts` (≈50 tablas), 33 route-modules (`server/routes/`), 27 controllers, 20 services, 13 repositories, y 70+ páginas del SPA (`client/src/pages/`).

### 2.1 Canales WhatsApp / Números
| Función | Evidencia |
|---|---|
| Multi-número / multi-canal (WABA) | tabla `channels`, `whatsappChannels` · `MultiNumber.tsx` |
| Conexión manual (token+phoneNumberId) | `channels.controller.ts:265` |
| Embedded Signup (Meta OAuth) | `channels.controller.ts:402 embeddedSignup`, `whatsappBusinessAccountsConfig` (appId/appSecret/configId) |
| Coexistence mode | `channels.isCoexistence` schema:258 |
| Health monitor de canal (quality rating, messaging tier) | `cron/channel-health-monitor.ts`, `channels.healthStatus/healthDetails`, `HealthMonitor.tsx`, `utils/messaging-tiers.ts` |
| Messaging limit / tier fetch | `whatsapp-api.ts:75 fetchMessagingLimit`, `whatsappChannels.rateLimitTier/messageLimit` |
| Rate limit por canal | `whatsapp-api.ts:291 checkRateLimit` |
| Signup logs / diagnóstico | `channelSignupLogs` schema:1038 |
| Verificación phone↔WABA | `whatsapp-api.ts:423` |

### 2.2 Bots / Automation / Flow
| Función | Evidencia |
|---|---|
| Visual Flow Builder (React Flow drag&drop) | `@xyflow/react`, `components/automation-flow-builder`, `BotFlowBuilder.tsx`, `Workflows.tsx` |
| Persistencia nodos+edges | `automationNodes` (position/measured/data/connections), `automationEdges` schema:872-934 |
| Triggers | `automations.trigger`: `message_received`, `keyword`, `schedule`, `api_webhook` schema:856 |
| Nodos de acción (16 subtipos) | `automation-execution-service.ts:310-369`: `start, custom_reply, user_reply, time_gap, send_template, assign_user, conditions, add_to_group, update_contact, set_variable, send_location, send_list_message, send_media, mark_as_read, webhook, end` |
| Condiciones/branching | operadores `equals, starts_with, contains, regex, variable, keyword` (líneas 458-538) |
| Variables de contexto/interpolación | `automationExecutions.variables`, `sanitizeAutomationVariables`, resolución `firstName/lastName/fullName/phone/custom` (l.2005) |
| Ejecución idempotente | `automationExecutions` unique(automationId, conversationId, triggerMessageId) schema:968 |
| Logs de ejecución por nodo | `automationExecutionLogs` (input/output/error) schema:977 |
| Contador de ejecución / last executed | `automations.executionCount/lastExecutedAt` |
| Auto-respuestas | `AutoResponses.tsx`, `automations.tsx` |

### 2.3 Chatbots IA + RAG / Knowledge Base
| Función | Evidencia |
|---|---|
| Chatbot widget web embebible | `chatbots` (uuid, bubbleMessage, welcomeMessage, embedWidth/Height, primaryColor, logoUrl) schema:512 · `WidgetChat.tsx`, `widget-builder/` |
| Modos interacción | `chatbots.interactionType` default `ai-only` |
| Sites / widget multi-dominio | `sites` (domain, widgetCode, widgetConfig, autoAssignmentConfig round_robin) schema:1218 |
| Entrenamiento IA (text/pdf/website/qa) | `trainingData.type` schema:545 · `training.routes.ts`, `training.service.ts` |
| RAG con embeddings | `training.service.ts:69 embeddings.create` model `text-embedding-3-small`; chunking (l.55); `cosineSimilarity` (l.76) |
| Vector store en Postgres (jsonb) | `trainingChunks.embedding jsonb`, `trainingQaPairs.embedding` schema:1677-1702 |
| Ingesta docs | `pdf-parse`, `mammoth` (docx), `cheerio` (scrape web) package.json:124,107,82 |
| Knowledge Base (categorías+artículos) | `knowledgeCategories`, `knowledgeArticles` (views/helpful) schema:557-602 |
| IA en inbox WhatsApp (auto-reply) | `webhook-handler.ts:824` OpenAI chat completions; trigger words `aiSettings.words` |
| Config IA por canal | `aiSettings` (provider, model gpt-4o-mini, endpoint, temperature, maxTokens, siteId) schema:1187 |
| Diagnóstico "por qué no respondió la IA" | `aiSettings.lastSkipReason/lastSkipAt` schema:1210 |

### 2.4 Bulk Sender / Campañas
| Función | Evidencia |
|---|---|
| Campañas (contacts / CSV / API) | `campaigns.campaignType` schema:175 |
| Tipo marketing vs transactional | `campaigns.type` |
| Cloud API vs MM Lite | `campaigns.apiType` (`cloud_api`/`mm_lite`) schema:177 |
| Mapeo variables plantilla→campo | `campaigns.variableMapping jsonb` schema:181 |
| Segmentación por grupos de contacto | `campaigns.contactGroups`, `csvData` schema:184 |
| Programación (scheduled) | `campaigns.scheduledAt`, `cron/scheduledCampaigns.cron.ts` |
| Cola de mensajes / throttling | `messageQueue` (attempts, scheduledFor, sentVia, cost) + **BullMQ** `bull-queue.ts` |
| Recipients con tracking granular | `campaignRecipients` (status, whatsappMessageId, retryCount, error) schema:209 |
| Métricas por campaña | `campaigns` sent/delivered/read/replied/failedCount schema:190-195 · `campaign-analytics.tsx` |
| Costo por mensaje | `messageQueue.cost` schema:1084 |
| Reintentos | `campaignRecipients.retryCount`, `messageQueue.attempts` |

### 2.5 Chats / Team Inbox
| Función | Evidencia |
|---|---|
| Inbox omnicanal | `conversations.type` (whatsapp/chatbot/sms/email) schema:358 · `pages/inbox`, `ChatHub.tsx` |
| Asignación a agentes | `conversationAssignments` (priority, status, notes, resolvedAt) schema:86 |
| Estados conversación | open/closed/assigned/pending; priority low→urgent |
| Mensajes con media | `messages` (mediaId/mediaUrl/mimeType/sha256, type text/image/document/template) schema:386 |
| Estados de entrega (WA) | `messages.status` sent/delivered/read/failed/received + deliveredAt/readAt |
| Unread count / last message cache | `conversations.unreadCount/lastMessageText/lastMessageAt` schema:362 |
| Pin de conversaciones | `conversationPins` (unique user+conv) schema:1856 |
| Tags en conversación | `conversations.tags jsonb` |
| Realtime (typing/nuevos msgs) | `ws` broadcast `broadcastToConversation` routes/index.ts:171 + Socket.IO |
| Auto-assignment round-robin | `sites.autoAssignmentConfig` schema:1233 |
| Media proxy/stream desde Graph | `whatsapp-api.ts:1292 streamMedia`, `fetchMediaUrl` |

### 2.6 Contactos / Segmentos / Grupos
| Función | Evidencia |
|---|---|
| Contactos por canal | `contacts` (phone, email, groups, tags, status, source) schema:125 |
| Unicidad canal+phone | unique index schema:154 |
| Origen (manual/import/api/chatbot) | `contacts.source` schema:141 |
| Grupos de contactos | `groups` schema:1142 · `Groups.tsx`, `group-list.tsx` |
| Import CSV/Excel masivo | `papaparse`, `exceljs` · `BulkImport.tsx` |
| Export | `file-saver` · permisos `contacts:export` |
| Segmentación | `Segmentation.tsx` |
| CRM / Leads | `CRMSystem.tsx`, `LeadManagement.tsx` (páginas SPA) |
| Estado (active/blocked/unsubscribed) | `contacts.status` schema:140 |

### 2.7 Plantillas (Meta Templates)
| Función | Evidencia |
|---|---|
| CRUD plantillas Meta | `templates` schema:269 · `templates.controller.ts`, `templates.tsx` |
| Categorías | marketing/transactional/authentication/utility |
| Media header (image/video/doc/carousel) | `templates.mediaType/mediaHandle/carouselCards` schema:289-292 |
| Botones | `templates.buttons jsonb` |
| Variables body | `templates.variables/bodyVariables` |
| Sync con WhatsApp + estado aprobación | `whatsapp-api.ts:345 createTemplate/editTemplate/deleteTemplate/getTemplateStatus`; `templates.status` draft/pending/approved/rejected + `rejectionReason` |
| Upload media handle | `whatsapp-api.ts:1024 uploadTemplateMedia`, `getImageTemplateHeaderHandle` |
| Contador de uso | `templates.usage_count` |

### 2.8 IA (proveedores / agentes)
| Función | Evidencia |
|---|---|
| Proveedor | **OpenAI SDK** con `baseURL` configurable → cualquier endpoint OpenAI-compatible (Azure, Groq, DeepSeek, LocalAI, etc.). NO hay SDK nativo de Anthropic/Gemini | `webhook-handler.ts:824`, `training.service.ts:36`, `aiSettings.endpoint` |
| Modelo por defecto | `gpt-4o-mini`; embeddings `text-embedding-3-small` |
| IA como agente de inbox | responde WhatsApp entrante con contexto RAG del site |
| IA en chatbot widget | `interactionType: ai-only` |
| Trigger words | `aiSettings.words[]` |
| Página asistente | `AIAssistant.tsx` |

### 2.9 Tickets de soporte
| Función | Evidencia |
|---|---|
| Tickets (status/priority enums) | `supportTickets` + `ticketStatusEnum`, `ticketPriorityEnum` schema:764-807 |
| Mensajería en ticket + notas internas | `ticketMessages.isInternal` schema:810 |
| Creator/assignee polimórfico | `creatorType`/`senderType` (`userTypeEnum`) |
| Páginas | `support-tickets.tsx`, `user-support-tickets.tsx` |

### 2.10 Integraciones / Webhooks / API pública
| Función | Evidencia |
|---|---|
| Webhook entrante Meta (verify+receive) | `webhooks.routes.ts`, `webhook-handler.ts` (1285 líneas) |
| Webhook config eventos | `webhookConfigs.events` (messages, message_status, template_status) schema:1054 |
| **API REST pública v1** | `rest-api-v1.routes.ts`: `/api/v1/messages/template`, `/reply`, `/status/:id`, `/contacts`, `/contacts/groups`, `/templates`, `/campaigns`, `/account`, `/account/usage`, `/webhooks` |
| API Keys de cliente (scoped) | `clientApiKeys` (secretHash, permissions[], monthlyRequestCount, rate limits) schema:1756 · `client-api.routes.ts` |
| Usage logs de API | `clientApiUsageLogs` schema:1773 |
| **Webhooks salientes de cliente** | `clientWebhooks` (secret, events[], failureCount) schema:1786 |
| Middleware apikey + permission | `middlewares/apikey.middleware.ts`, `requirePermission("messages.send")` |
| API docs UI | `api-docs.tsx` |
| Firebase push (FCM) | `firebaseConfig`, `users.fcmToken` schema:1154 |

### 2.11 SaaS / Tenant / Billing
| Función | Evidencia |
|---|---|
| Multi-tenant por canal | `tenant.middleware.ts:resolveTenantChannels`, `contacts.tenantId`, `req.tenantChannelIds` |
| Roles | superadmin/admin/manager/agent/team (`shared/roles.ts`, `role-permissions.ts`) |
| RBAC granular (permisos string) | `PERMISSIONS` const map + `DEFAULT_PERMISSIONS` por rol schema:1275-1380 |
| Planes / pricing multi-moneda | `plans` (monthly/annual, multiCurrencyPrices, permissions límites, features[]) schema:605 |
| Suscripciones | `subscriptions` (billingCycle, autoRenew, gatewaySubscriptionId) schema:689 |
| Transacciones | `transactions` (5 provider ids, metadata card/upi, refund) schema:713 |
| 5 pasarelas | Stripe/Razorpay/PayPal/Paystack/MercadoPago (`paymentProviders`, `payment-gateway.service.ts`) |
| Reconciliación de pagos | `cron/payment-reconciler.cron.ts` |
| Gate por suscripción | `middlewares/requireSubscription.ts` |
| Límites de uso (API/mes, rate/min) | `plans.permissions.apiRequestsPerMonth/apiRateLimitPerMinute` schema:632 |
| OTP verificación email | `otpVerifications` schema:1258 · `VerifyOtp.tsx` |
| Branding panel (white-label) | `panelConfig` (logo/favicon/colors/appearanceConfig/publicOrigin) schema:1112 |
| i18n dinámico (DB) | `platformLanguages` (translations jsonb, direction ltr/rtl) schema:1887 · `LanguageManagement.tsx` |
| Auto-update de la app | `updateRuns`/`updateRunEvents`, `app-update.controller.ts`, `startup-migration.ts` |

### 2.12 Reportes / Analytics
| Función | Evidencia |
|---|---|
| Dashboard | `dashboard.controller.ts`, `dashboard.tsx` |
| Analytics agregado diario | `analytics` (sent/delivered/read/replied/newContacts) schema:1001 |
| Reportes / campaign analytics | `Reports.tsx`, `campaign-analytics.tsx`, charts recharts+chart.js |
| Message logs (superadmin) | `messages.logs.controller.ts`, `SuperadminMessageLogs.tsx`, `logs.tsx` |
| Activity logs de usuario | `userActivityLogs` (action, entityType, ip, userAgent) schema:109 |
| API logs (debug) | `apiLogs` (request/response body, duration) schema:1095 |

### 2.13 Notificaciones
| Función | Evidencia |
|---|---|
| Notificaciones in-app + email | `notifications`, `sentNotifications`, `notificationTemplates` (html), prefs por usuario/evento schema:443-510 |
| SMTP config | `smtpConfig` · `email.service.ts`, `nodemailer` |
| Push FCM | `firebaseConfig` |
| Realtime notif | Socket.IO |

---

## 3) Features × ¿chateam lo tiene? × acción

> Marcado según lo conocido de chateam_jr (omnicanal WhatsApp/IA, restaurado de backup, PM2 node22 en padeldev; ver `project_chateam.md`). Donde no tengo certeza del estado interno de chateam, marco **(verificar)**. La acción prioriza *gap* real de producto.

| Feature WhatsWay | ¿chateam? | Acción sugerida |
|---|---|---|
| WhatsApp Cloud API oficial multi-número | Sí (omnicanal WA) | Paridad — mantener |
| Embedded Signup (Meta OAuth) | (verificar) | **Adoptar** si hoy es solo token manual: reduce fricción onboarding |
| Health monitor de canal + quality/tier | (verificar) | **Añadir** cron `channel-health-monitor` — alto valor operativo bajo esfuerzo |
| MM Lite API (Marketing Messages Lite) | Probablemente no | **Evaluar** — abarata marketing masivo |
| Visual Flow Builder (React Flow) nodos+edges persistidos | (verificar) | **Gap probable P1** — diferenciador fuerte; ver §4 |
| 16 subtipos de nodo + condiciones regex/branching | (verificar) | Alinear catálogo de nodos |
| Ejecución idempotente (unique triggerMessageId) | (verificar) | **Adoptar patrón** — evita doble-disparo por reintento webhook |
| Bulk sender con BullMQ + throttling + costo | (verificar) | **Adoptar cola BullMQ** si hoy es envío síncrono/ad-hoc |
| Campaign recipients con tracking granular+retry | (verificar) | Paridad recomendada |
| Team inbox + asignación + prioridad + pin | Parcial (verificar) | Completar asignación/pin si falta |
| RAG con embeddings en Postgres (jsonb + cosine) | (verificar) | **Gap probable** — chateam tiene IA; verificar si tiene KB/RAG |
| Chatbot widget web embebible + sites multi-dominio | Probablemente no | **Oportunidad** — canal web además de WA |
| Knowledge Base (categorías/artículos) | Probablemente no | Opcional |
| Plantillas Meta CRUD+sync+carousel | Sí (verificar carousel) | Paridad; añadir carousel si falta |
| IA OpenAI-compatible endpoint configurable | Sí (IA) | Confirmar que endpoint es configurable (no hard-coded) |
| Diagnóstico lastSkipReason IA | No | **Adoptar** — barato, gran soporte/DX |
| Tickets de soporte in-app | (verificar) | Opcional |
| **API REST pública v1 + API keys scoped + usage/rate limit** | (verificar) | **Gap probable P1** — clave para B2B/integradores |
| Webhooks salientes de cliente (`clientWebhooks`) | (verificar) | **Adoptar** — habilita integraciones externas |
| Multi-tenant + RBAC granular (permisos string) | Sí (verificar granularidad) | Alinear a modelo de permisos string map |
| Billing 5 pasarelas + planes multi-moneda + límites | (verificar) | Según modelo de negocio chateam |
| Reconciliación de pagos (cron) | (verificar) | Si hay billing, adoptar |
| White-label panelConfig | (verificar) | Útil para revender |
| i18n dinámico desde DB | (verificar) | Opcional |
| Auto-update in-app (updateRuns) | No (deploy PM2 manual) | Opcional — riesgoso, baja prioridad |
| Analytics diario agregado + activity/api logs | Parcial | Completar logs de auditoría |
| Notificaciones in-app+email+FCM con templates+prefs | (verificar) | Adoptar templates/prefs si falta |

---

## 4) Top oportunidades para chateam (impacto / esfuerzo)

Priorizadas por valor de producto **y** por patrón de arquitectura TS moderno reutilizable. Enfoque en lo que chateam (Node/TS) puede adoptar directamente.

### A. Patrones de arquitectura TS a adoptar (transversal)

1. **Schema-first con Drizzle + drizzle-zod (single source of truth)** — *Impacto ALTO / Esfuerzo MEDIO.*
   WhatsWay define tablas, índices, relaciones, tipos (`$inferSelect`) y **validadores Zod de inserción** (`createInsertSchema(...).omit(...)`) en un solo `shared/schema.ts`, reexportando tipos a front y back (`InsertContact`, `Contact`...). Elimina drift tipo-DB-validación. Evidencia: `schema.ts:1383-1531`.
   *Matiz:* el archivo de 1900 líneas es monolítico — chateam debería adoptar el **patrón** pero **modularizar por dominio** (`schema/contacts.ts`, `schema/campaigns.ts`, barrel `index.ts`) para evitar el anti-patrón de god-file.

2. **Capas server: controllers → services → repositories** — *Impacto ALTO / Esfuerzo MEDIO.*
   Separación limpia (`server/controllers/*.controller.ts`, `services/*.ts`, `repositories/*.repository.ts`) con `asyncHandler` (`utils/async-handler.ts`) y `error.middleware.ts` centralizado. Repositorios encapsulan Drizzle → testeable y swappable. Chateam debería mapear a esta estructura si hoy mezcla lógica en rutas.

3. **`@diploy/core` como paquete interno (monorepo file:)** — *Impacto MEDIO / Esfuerzo BAJO.*
   `packages/diploy-core` (logger, HTTP_STATUS, response envelope, validate, format, errors) linkeado con `"@diploy/core": "file:packages/diploy-core"` y alias en esbuild. Da **envelope de respuesta y logger consistentes** cross-módulo. Alineado con `reference_standards.md` (API envelope). Chateam puede extraer un `@chateam/core` similar.

4. **Idempotencia por unique-constraint en ejecuciones** — *Impacto ALTO / Esfuerzo BAJO.*
   `automationExecutions` con `uniqueIndex(automationId, conversationId, triggerMessageId)` (schema:968) hace la ejecución de automatizaciones idempotente frente a reintentos de webhook Meta. Patrón directamente portable a los flows/bots de chateam.

5. **BullMQ para envío/campañas con degradación** — *Impacto ALTO / Esfuerzo MEDIO.*
   `bull-queue.ts` con `isBullQueueAvailable()` y fallback si Redis no está: cola desacoplada, worker con reintentos, `queueEvents`. Portable para bulk sender y para procesar webhooks entrantes sin bloquear el HTTP.

### B. Features producto (gap de negocio)

6. **API REST pública v1 + API Keys scoped + usage/rate-limit** — *Impacto ALTO / Esfuerzo MEDIO.*
   `rest-api-v1.routes.ts` + `clientApiKeys` (secretHash, `permissions[]`, `monthlyRequestCount`, `monthlyResetAt`) + `clientApiUsageLogs`. Habilita integradores/B2B — típico "gap" de plataformas jóvenes. Patrón: middleware `requireApiKey` + `requirePermission(scope)`.

7. **Visual Flow Builder con @xyflow/react persistido (nodes/edges)** — *Impacto ALTO / Esfuerzo ALTO.*
   Diferenciador de bots. Modelo de datos limpio: `automationNodes` (position/data/connections) + `automationEdges` + `automationExecutions/Logs`. Motor de ejecución en `automation-execution-service.ts` (2949 líneas) con 16 subtipos de nodo. Si chateam no lo tiene, es la mayor oportunidad de diferenciación (aunque cara).

8. **RAG en Postgres sin vector-DB externa** — *Impacto ALTO / Esfuerzo MEDIO.*
   `training.service.ts`: chunking + `embeddings.create(text-embedding-3-small)` + `cosineSimilarity` en app, embeddings en `jsonb`. Cero infra extra (no Qdrant/pgvector requerido, aunque pgvector sería mejora). Rápido de adoptar para dar KB a la IA del inbox. *Mejora sobre WhatsWay:* usar **pgvector** en vez de cosine en JS para escalar.

9. **Webhooks salientes de cliente (`clientWebhooks`)** — *Impacto MEDIO / Esfuerzo BAJO.*
   Eventos → URL cliente con `secret` (HMAC) y `failureCount`. Complemento natural de la API pública.

10. **Diagnóstico de IA (`lastSkipReason/lastSkipAt`)** — *Impacto MEDIO / Esfuerzo MUY BAJO.*
    El webhook-handler escribe por qué la IA NO respondió (sin acceso a DB por soporte). Win de DX/soporte casi gratis.

### Anti-patrones observados en WhatsWay (evitar al copiar)
- **`shared/schema.ts` monolítico de 1900 líneas** — modularizar.
- **Doble capa realtime** (`ws` nativo en `routes/index.ts` **y** Socket.IO en `socket.ts`) con `(global as any).broadcastToConversation` — usar **una** (Socket.IO + redis-adapter) y sin globals.
- **Tokens/secrets en texto plano en DB** (`whatsappChannels.accessToken` comenta "should be encrypted in production" pero no lo hace; `aiSettings.apiKey`, `storageSettings.secretKey`) — chateam debe **cifrar en reposo**.
- **`connectionMethod`/tipos vía `text()` con comentario** en vez de `pgEnum` en varias tablas — preferir enums.
- Métodos muertos/duplicados en `whatsapp-api.ts` (`sendMediaMessageOLDDDAA`, `sendMediaMessagee`) — deuda técnica.

---

## Confirmación

Análisis técnico completado sobre **WhatsWay/Diploy v3.7.7** (Node/TS + Express + Drizzle/Postgres + BullMQ + React18/Radix + @xyflow). Cubiertas las 13 áreas solicitadas (canales, bots/flow, bulk/campañas, team inbox, contactos/segmentos, IA/RAG, plantillas, tickets, integraciones/API/webhooks, SaaS/tenant/billing, reportes, realtime, notificaciones) con ~50 tablas, 33 route-modules, 27 controllers, 20 services y 70+ páginas SPA citados con evidencia (archivo:línea).

Hallazgos de estructura clave: el backend real vive en `server/` (no en `brain/`, que es scratch vacío); schema en `shared/schema.ts`; canales solo Cloud API oficial (manual + Embedded Signup, con coexistence y MM Lite), **sin QR/no-oficial**; IA es OpenAI-SDK con endpoint configurable (compatible con cualquier proveedor OpenAI-style), no SDK nativo Anthropic/Gemini.

Entregable escrito en:
**`/home/jcromero09/chateam_jr/SPEC-FIRST/fase4/04g-whatsway.md`**
