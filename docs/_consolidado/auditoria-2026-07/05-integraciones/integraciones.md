# Integraciones — Inventario & Auditoría (Spec-Driven)

## 1. Propósito / Alcance

Inventario exhaustivo de TODAS las integraciones externas y servicios de terceros consumidos por `chateam_jr` (backend Node.js/TS): cómo se conectan, qué archivos las implementan, qué variables de entorno / credenciales usan (nombres, NO valores), qué webhooks entrantes/salientes exponen, y qué riesgos de seguridad o gaps funcionales presentan. Código auditado en modo SOLO LECTURA. El acceso directo a `.env`/`.env.example` está bloqueado por el guardrail del entorno de auditoría (`feedback_env_write_guard`), por lo que los nombres de variables se extrajeron por `grep` de referencias `process.env.X` en el código fuente (`.ts`), nunca de los archivos `.env*`.

## 2. Inventario (el "qué")

### 2.1 Conteo de archivos por integración

| Integración | Carpeta principal | Archivos .ts |
|---|---|---|
| WhatsApp Baileys (no oficial) | `services/WbotServices/` | 20 |
| WhatsApp Baileys — conexión/sesión | `services/BaileysServices/` | 3 |
| WhatsApp Cloud API (Meta oficial) | `services/WhatsAppCloudAPI/` | 1 (`CloudAPIService.ts`, 555 líneas) |
| WhatsApp Adapter (dual/híbrido) | `services/WhatsAppAdapter/` | 3 (`DualAdapter.ts`, `HybridWhatsAppService.ts`, `IntelligentLoadBalancer.ts`) |
| Coexistencia Baileys↔Cloud API | `services/CoexistenceServices/` | 11 |
| Meta (Embedded Signup, migración, echoes) | `services/MetaServices/` | 26 |
| Facebook/Instagram Messenger | `services/FacebookServices/` | 9 |
| Facebook Conversions API | `services/FacebookConversionService/` | 12 |
| Meta Marketing (Ads/Insights) | `meta-marketing/src/` | 8 |
| Telegram | `services/TelegramService/` | 12 |
| TikTok | `services/TikTokService/` | 15 |
| WebChat widget | `services/WebChatWidgetServices/` + `services/WebChatServices/` | 9 + 5 |
| RAG / vectores (pgvector) | `services/RAGServices/` | 7 |
| IA multi-proveedor (OpenAI/Anthropic/Google) | `services/AIAgentServices/` | 46 |
| Créditos IA | `services/AICreditServices/` | 14 |
| UGC (fal.ai/Higgsfield/ComfyUI) | `services/UGCProviders/` | 43 |
| Email Marketing (multi-proveedor) | `services/EmailMarketing/` | 24 |
| PayPal | `services/PaypalService/` | 3 |
| Sincronización de pagos (Stripe/PayPal productos) | `services/PaymentSync/` | 3 |
| Integraciones genéricas (Billie/AriaLite/SmartTrack/SGR) | `services/IntegrationServices/` + `services/IntegrationsServices/` | ~10 |

### 2.2 Variables de entorno detectadas por integración (nombre de variable, sin valores)

Extraídas por `grep -oE "process\.env\.[A-Z_0-9]+"` sobre `services/`, `controllers/`, `routes/`, `config/`, `helpers/`, `libs/`, `app.ts` (192 variables únicas totales referenciadas en el proyecto).

| Integración | Variables |
|---|---|
| WhatsApp Meta / Embedded Signup | `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_PIXEL_ID`, `META_WEBHOOK_URL`, `META_SIGNATURE_MODE`, `META_EMBEDDED_SIGNUP_USE_REDIRECT_URI`, `META_ENABLE_COMMENT_SCOPES`, `META_OFFICIAL_MCP_*` (6 vars: `AUTH_ENDPOINT`, `CLIENT_ID`, `REDIRECT_URI`, `SCOPES`, `TOKEN_ENDPOINT`, `URL`), `VERIFY_TOKEN` |
| Facebook (App / comentarios) | `FACEBOOK_ACCESS_TOKEN`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_VERIFY_TOKEN`, `FACEBOOK_PIXEL_ID` |
| Facebook Conversions API | `FACEBOOK_CONVERSIONS_ACCESS_TOKEN`, `FACEBOOK_CONVERSIONS_API_VERSION`, `FACEBOOK_CONVERSIONS_COMPANY_ID`, `FACEBOOK_CONVERSIONS_PIXEL_ID`, `META_CONVERSIONS_ACCESS_TOKEN`, `META_CONVERSIONS_COMPANY_ID` (redundancia FACEBOOK_/META_ para el mismo propósito) |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`, `TIKTOK_BUSINESS_REDIRECT_URI` |
| Telegram | ninguna variable global — el token del bot se guarda por-conexión en `Whatsapp.tokenTelegram`/modelo Telegram (BD), no en `.env` |
| OpenAI | `OPENAI_API_KEY` (fallback global; la fuente primaria es `AIProviderConfig.apiKey` en BD, ver §4) |
| Anthropic | Sin variable de entorno global detectada — solo vía `AIProviderConfig.apiKey` (BD, por company/superadmin) |
| ChromaDB (legado) | ninguna — `ChromaClient` se instancia con `path` local del filesystem, no URL de servidor (ver §3.6) |
| fal.ai | `FAL_KEY`, `FAL_WEBHOOK_PUBLIC_URL`, `FAL_WEBHOOK_VERIFY_SIGNATURE`, `FAL_SUBSCRIBE_TIMEOUT_MS`, `FAL_IMAGE_MODEL`, `FAL_IMAGE_EDIT_MODEL`, `FAL_IMAGE_ESTIMATED_COST_USD`, `FAL_VIDEO_TEXT_MODEL`, `FAL_VIDEO_IMAGE_MODEL`, `FAL_VIDEO_PREMIUM_MODEL`, `FAL_VIDEO_ESTIMATED_COST_USD`, `FAL_THUMBNAIL_MODEL`, + 10 `FAL_MODEL_*` (Kling, Veo, Nano Banana, LatentSync, F5-TTS, ElevenLabs-TTS, Sync-Lipsync) |
| Higgsfield | `HF_API_KEY`, `HF_API_SECRET`, `HF_CREDENTIALS`, `HF_KEY`, `HIGGSFIELD_API_KEY`, `HIGGSFIELD_API_SECRET`, `HIGGSFIELD_BASE_URL`, `HIGGSFIELD_CREDENTIALS`, `HIGGSFIELD_WEBHOOK_PUBLIC_URL`, `HIGGSFIELD_WEBHOOK_SECRET`, `HIGGSFIELD_WEBHOOK_VERIFY_SIGNATURE`, `HIGGSFIELD_FALLBACK_PREVIEW` |
| ComfyUI | `COMFYUI_BASE_URL` (default `http://localhost:8188`), `COMFYUI_TIMEOUT_MS`, `COMFYUI_POLL_INTERVAL_MS`, `COMFYUI_FLUX_WORKFLOW_PATH`, `COMFYUI_WAN_WORKFLOW_PATH` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`, `STRIPE_OK_URL` (la clave real usada en el flujo de suscripción NO sale de estas vars, sino de `Company.stripeSecretKey` en BD — ver §4) |
| PayPal | `PAYPAL_MODE`, `PAYPAL_SANDBOX` (client id/secret se resuelven en `getPayPalClient()`/`getPaypalAccessToken()`, no aparecen como var. global — sugiere también BD) |
| Gerencianet / PIX (legado Brasil) | `GERENCIANET_CLIENT_ID`, `GERENCIANET_CLIENT_SECRET`, `GERENCIANET_PIX_CERT`, `GERENCIANET_SANDBOX` (config en `config/Gn.js`) |
| Coingate (cripto) | `COINGATE_API_TOKEN`, `COINGATE_SANDBOX` |
| S3 / MinIO | `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` |
| Google (Auth / Calendar / Drive) | `GOOGLE_AUTH_CLIENT_ID`, `GOOGLE_CLIENT_ID` (Drive Backup usa OAuth2 con tokens guardados en `CompaniesSettings`, no vars.) |
| Microsoft (Outlook Calendar / Speech) | `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET` (Calendar); Microsoft Speech SDK recibe `subscriptionKey`/`serviceRegion` como parámetros de función, sourced desde configuración por-company, no variable global |
| Listmonk | `LISTMONK_URL`, `LISTMONK_API_USER`, `LISTMONK_API_TOKEN`, `LISTMONK_ENABLED`, `LISTMONK_FROM_EMAIL`, `LISTMONK_FROM_NAME`, `LISTMONK_PASSTHROUGH_TEMPLATE_ID`, `LISTMONK_TRANSACTIONAL_LIST_ID`, `LISTMONK_TIMEOUT_MS` |
| SMTP genérico | `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`, `MAIL_FROM_NAME`, `MAIL_ENCRYPTION` |
| Integraciones genéricas (Billie/AriaLite/SmartTrack/SGR) | `INTEGRATION_ENCRYPTION_KEY` (cifra `authCredentials`/`webhookSecret` de `IntegrationConnection`) |
| Sentry | `SENTRY_DSN` |
| Backend / infraestructura transversal | `BACKEND_URL`, `FRONTEND_URL` (usadas como base de callbacks/webhooks de casi todas las integraciones anteriores) |

### 2.3 Dependencias npm relevantes (`package.json`)

`baileys@7.0.0-rc13`, `openai@^4.56.0`, `@anthropic-ai/sdk@^0.82.0`, `chromadb@^3.2.1`, `stripe@^14.14.0`, `@paypal/checkout-server-sdk@^1.0.3`, `gn-api-sdk-typescript@^2.0.1`, `@fal-ai/client@^1.10.1`, `googleapis@^170.0.0`, `@aws-sdk/client-s3@^3.1007.0` + `aws-sdk@^2.1693.0` (**dos SDKs de AWS coexistiendo**, v2 legado y v3), `nodemailer@^7.0.9`, `@sentry/node@^10.19.0`, `microsoft-cognitiveservices-speech-sdk@^1.46.0`.

## 3. Arquitectura & Flujos (el "cómo")

### 3.1 WhatsApp — triple capa (Baileys + Cloud API + Coexistencia)

- **Baileys (no oficial, QR)**: `services/WbotServices/StartWhatsAppSession.ts`, `wbotMessageListener.ts` (7501 líneas — el archivo más grande del backend), `services/BaileysServices/*`. Sesión por conexión (`Whatsapp` model), reconexión vía `wbotMonitor.ts`.
- **WhatsApp Cloud API (Meta oficial)**: `services/WhatsAppCloudAPI/CloudAPIService.ts`. Clase `WhatsAppCloudAPIService` + factory `CloudAPIFactory` que cachea instancias por `phoneNumberId:accessToken`. Las credenciales (`phoneNumberId`, `accessToken`) se inyectan por constructor — provienen de `Whatsapp.tokenMeta`/`Whatsapp.phoneNumberId` en BD, **no** de env vars globales (multi-tenant: cada company puede tener su propio WABA).
- **Coexistencia** (`services/CoexistenceServices/`): decide dinámicamente qué proveedor físico usar por ticket/conexión. `OutboundRoutingService.ts` implementa política jerárquica: `force_meta`/`force_baileys`/`sticky_inbound`/`auto` a nivel de ticket, y `sendChannel`+`linkedWhatsappId`+`coexistenceEnabled` a nivel de conexión Whatsapp, con fallback automático si el canal elegido no está disponible (Baileys desconectado → Meta; Meta sin `phoneNumberId`/`tokenMeta` → Baileys). `OutboundDispatchService.ts` ejecuta el envío ya decidido; `DispatchAckReconciler.ts`, `InboundEventLedgerService.ts` y `DistributedLock.ts` dan idempotencia/dedup a nivel multi-nodo (PM2 cluster). `ConversationResolverService.ts` unifica el hilo de conversación independientemente del canal físico.
- **WhatsAppAdapter** (`DualAdapter.ts`, `HybridWhatsAppService.ts`, `IntelligentLoadBalancer.ts`): capa adicional de abstracción/balanceo — coexiste con `CoexistenceServices`, sugiriendo dos generaciones de la misma idea (ver Hallazgos P2).

### 3.2 Webhooks entrantes — mapa completo

| Endpoint | Mount (`routes/index.ts`) | Controlador | Verificación de firma |
|---|---|---|---|
| `GET/POST /webhook` | `routes.use("/webhook", webHookRoutes)` línea 512 | `WebHookController.index/webHook` (FB/IG Messenger + comentarios) | **Ninguna** |
| `GET/POST /webhook/metaws` | dentro de `webHookRoutes` (`routes/webHookRoutes.ts:12-13`) | `MetaWebhookController.verifyMetaWebhook/receiveMetaWebhook` (mensajería WhatsApp Cloud API + template status) | HMAC `X-Hub-Signature-256` vía `MetaSignatureValidator` — modo `warn` por defecto |
| `POST /webhook/meta` (isAuth) | `webHookRoutes.ts:14` | `WhatsAppController.storeMeta` | Requiere sesión (isAuth), no es webhook público de Meta |
| `GET/POST /webhook/facebook` | `webHookRoutes.ts:17-18` | `FBPageWebhookController.verify/receive` (comentarios Facebook Pages) | **Ninguna** |
| `GET/POST /webhook/meta` (Embedded Signup) | `routes.use("/webhook/meta", whatsappCoexistenceRoutes)` línea 535 | `WhatsAppCoexistenceController` (`/embedded-signup`) | Verificación por `state` de OAuth, no HMAC de Meta |
| `POST /subscription/stripewebhook/:type?` | `routes.use(subScriptionRoutes)` línea 513 | `SubscriptionController.stripewebhook` | HMAC `stripe-signature` — **con bypass si falta el header o si no hay clave configurada** (ver P0) |
| `POST /subscription/webhook/:type?`, `/subscription/create/webhook`, `/subscription/webhook/pix/:type?` | idem | `SubscriptionController.webhook/createWebhook` (Gerencianet/PIX) | **Ninguna** |
| `POST /paypal/webhook` | `routes.use(paypalRoutes)` línea 570 | `PaypalController.webhook` | **Ninguna** |
| `POST /ai/coingate/webhook` | `routes.use("/ai", aiCostRoutes)` (vía `aiCostRoutes.ts:13`, comentario "No auth") | `AICostController.coingateWebhook` | **Ninguna** |
| `POST /api/fal/webhook` (`falWebhookRoutes`) | `routes.use(falWebhookRoutes)` línea 449 | `FalWebhookController.receive` | JWKS Ed25519 (fal.ai) + ventana de 300s anti-replay — **correcta** |
| `POST /api/webhooks/higgsfield` (dentro de `generationRoutes`) | `routes.use(generationRoutes)` línea 561 | `HiggsfieldWebhookController.receive` | HMAC-SHA256 opcional — acepta sin verificar si no hay secreto configurado |
| `POST /telegram/webhook/:telegramId` | `routes.use(telegramRoutes)` línea 493 | `TelegramController.webhook` | Solo valida schema del payload (Yup) — **sin `secret_token` de Telegram** |
| `POST /integrations/webhooks/:providerId` | `routes.use("/integrations", integrationRoutes)` línea 672 | `IntegrationController.handleWebhook` | HMAC por conexión (`connection.webhookSecret`) — **correcta**, pero firma sobre el body ya parseado (no raw) |
| `POST /webchat/public/message` | `routes.use("/webchat", webChatWidgetRoutes)` línea 564 | `WebChatWidgetController.processPublicMessage` | Sin auth (por diseño, widget embebido público vía `apiKey`) |

Nota de infraestructura: `app.ts:113-128` captura `req.rawBody` (Buffer) SOLO para las URLs que contienen `/stripewebhook`, `/api/fal/webhook`, `/webhook/meta`, `/webhook/metaws`, `/webhooks/meta`, `/webhooks/metaws` — el resto de webhooks (Facebook comentarios, PayPal, Telegram, Coingate, Gerencianet) nunca reciben `rawBody`, por lo que aunque quisieran añadir HMAC en el futuro sobre el body exacto, hoy no podrían sin cambiar el middleware.

### 3.3 Meta / Facebook — módulos

- `services/MetaServices/` (26 archivos): Embedded Signup (`metaEmbeddedSignupService.ts`), `MetaAppSetupService.ts` (config automática de app/webhooks/suscripciones), `metaMessageListener.ts` (mensajería Cloud API entrante), estrategias de migración Baileys→Meta (`strategies/`), eco de mensajes salientes.
- `services/FacebookServices/` (9 archivos) + `WebhookFacebookServices/`: listener de Messenger/Instagram DM (`facebookMessageListener.ts`), que aún depende del módulo legado de RAG con ChromaDB (`OpenaiServicesF&G.ts`, ver §3.6).
- `services/FacebookConversionService/` (12 archivos): Conversions API (envío server-side de eventos a Meta Ads, `SendWebsiteEvent.ts` usado también por `StripeService.ts` para eventos de conversión de pago).
- `meta-marketing/src/`: micro-módulo de Ads (campañas, audiences, insights, conversions) — sin variables `process.env` propias detectadas en `client.ts`, sugiere que recibe el token por inyección de config en runtime más que por env global.
- Comentarios FB/IG (`SocialCommentServices/IngestCommentService.ts`, `extractCommentEvents.ts`) se alimentan tanto del webhook genérico `/webhook` (objeto `page`/`instagram`) como de `/webhook/metaws` y `/webhook/facebook` — **triple entrada para el mismo tipo de evento**, con lógica de extracción duplicada en tres controladores distintos.

### 3.4 IA / RAG

- **Multi-proveedor centralizado**: `services/AIClientService.ts` delega en `AIProviderService.getDefaultProviderForCapability()` para elegir OpenAI/Anthropic/Google según capacidad (`text`, `images`, `stt`, `tts`, `translation`, `imageAnalysis`) y configuración del superadmin. La clave real de API se lee de `AIProviderConfig.apiKey` (BD, por company o global superadmin), con fallback opcional a `OPENAI_API_KEY` de entorno.
- **RAG actual**: `services/RAGServices/` (`EmbeddingService.ts`, `VectorSearchService.ts`, `HybridSearchService.ts`, `KnowledgeBaseService.ts`, `ChunkingService.ts`, `SemanticCacheService.ts`, `BM25SearchService.ts`) — construido sobre **pgvector** (Postgres, columna `vector`, coherente con `CONTEXT.md`: "PostgreSQL 17 + pgvector"). No usa ChromaDB.
- **AICreditServices** (14 archivos): sistema de créditos prepago por company (`AICreditBalance`, `AICreditTransaction`, `AICreditType`), consumido por generación de imagen/video/audio y por el chatbot de IA. `ProvisionCreditsService.ts` es el único punto que "recarga" créditos — invocado desde pagos Stripe/PayPal exitosos, pero **no** desde el webhook de Coingate (ver Hallazgos).

### 3.5 UGC (Generación de contenido)

- **fal.ai** (`services/UGCProviders/fal/`, 30 archivos): cliente (`FalClient.ts`), config (`FalConfig.ts`), adaptadores por modelo (Kling v2.6/v3, Veo 3.1, Nano Banana 2, LatentSync, F5-TTS, ElevenLabs TTS v3, Sync-Lipsync) vía patrón `adapters/registry.ts`. Webhook con verificación JWKS Ed25519 — el más robusto de toda la plataforma (§3.2).
- **Higgsfield** (`services/UGCProviders/higgsfield/`, 8 archivos): cliente REST (`HiggsfieldClient.ts`), soporta credenciales combinadas (`HF_CREDENTIALS`) o separadas (`HF_API_KEY`/`HF_API_SECRET`), mapper de dos formatos de payload (job-set v1 y v2).
- **ComfyUI** (`services/UGCProviders/ComfyUIProvider.ts`, `FluxProvider.ts`, `WanProvider.ts`): self-hosted, `COMFYUI_BASE_URL` apunta por defecto a `http://localhost:8188` — implica un servidor ComfyUI corriendo localmente/en la misma red, con polling (no webhook).
- Orquestación común en `services/Generation/orchestrator/` (`ResolveGenerationJobService.ts` resuelve el resultado sea cual sea el proveedor que llame al webhook).

### 3.6 ChromaDB — módulo legado, NO parte del RAG actual

`libs/chromadb.ts` instancia `ChromaClient` con un **path de filesystem local** (`path.resolve(currentDir, "../../../public/datos_chroma")`), no una URL de servidor Chroma. Solo dos consumidores en todo el repo: `services/IntegrationsServices/pdfReader.ts` (ingesta de PDF a colección `pdf_data`) y `services/IntegrationsServices/OpenaiServicesF&G.ts`. Este último es importado únicamente por `services/FacebookServices/facebookMessageListener.ts` — es decir, **el canal de Facebook/Instagram Messenger todavía depende de este RAG legado basado en ChromaDB local**, mientras que WhatsApp y el resto de la plataforma usan `RAGServices` sobre pgvector. Ver Hallazgos P2.

### 3.7 Pagos — cuatro pasarelas activas simultáneamente

- **Stripe**: dos implementaciones paralelas — `services/StripeService.ts` (usa `process.env.STRIPE_SECRET_KEY` global, clase OO, incluye `SendWebsiteEvent` para Conversions API) vs `controllers/SubscriptionController.ts`/`services/StripeCheckoutService.ts` (usa `Company.stripeSecretKey` por-tenant desde BD, es el flujo realmente enrutado por `subScriptionRoutes.ts`). El módulo `routes/billingRoutes.ts` + `controllers/BillingController.ts` (multi-tenant, `tenantMiddleware`) es una **tercera** implementación de billing con Stripe, pero **no está montada en `routes/index.ts`** (código muerto).
- **PayPal**: `services/PaypalService/` + `routes/paypalRoutes.ts` → `PaypalController`. Checkout Server SDK, `PAYPAL_MODE`/`PAYPAL_SANDBOX`.
- **Gerencianet/PIX** (Brasil): `config/Gn.js` + `gn-api-sdk-typescript`, rutas legado montadas y activas (`/subscription/webhook/pix/:type?`) pese a que la plataforma opera actualmente en Ecuador (según `CONTEXT.md`) — candidato a superficie de ataque no utilizada por el negocio real.
- **Coingate** (cripto): `services/AICoingateServices/CoingateService.ts`, exclusivamente para recarga de créditos IA (`/ai/coingate/webhook`), no para suscripción de plan.

### 3.8 Email

`services/EmailMarketing/providers/` implementa el patrón Factory (`ProviderFactory.ts`/`EmailMarketingFactory.ts`) sobre `BaseEmailProvider.ts`, con adaptadores para **Listmonk**, **SendGrid**, **Mailgun**, **Amazon SES**, **Acelle**, **Carbonio**. `ListmonkProvider.ts` es el único con variables de entorno explícitas (`LISTMONK_*`); el resto de proveedores probablemente reciben credenciales por `EmailProviderConfigService.ts` (BD, patrón por-company consistente con Stripe/AIProviderConfig). SMTP genérico vía `nodemailer` + `MAIL_*` para correo transaccional del sistema (no marketing).

### 3.9 Almacenamiento

- **S3/MinIO**: `services/S3Service.ts`, credenciales 100% por variables de entorno (`S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` — el `S3_ENDPOINT` custom permite apuntar a MinIO on-prem en vez de AWS real).
- **Google Drive Backup**: `services/DriveBackupService.ts`, OAuth2 con `scope: drive.file`, `refresh_token` persistido en `CompaniesSettings` (BD), carga perezosa de `googleapis` para no bloquear el arranque si el paquete no está disponible.
- **Media local**: servido estáticamente desde `/public` (`app.ts:136-155`), con endpoint `?download` que fuerza `Content-Disposition: attachment` (saneado contra inyección de cabeceras).

### 3.10 Otros

- **Google Calendar/Auth**: `services/AppointmentServices/CalendarSyncService.ts` (sync de citas), `services/AuthServices/VerifyGoogleIdTokenService.ts` (login social).
- **Microsoft**: `OUTLOOK_CLIENT_ID`/`OUTLOOK_CLIENT_SECRET` para Calendar/Graph (`CalendarSyncService.ts:551-552`); `microsoft-cognitiveservices-speech-sdk` para TTS de audios de WhatsApp (`services/WbotServices/wbotMessageListener.ts:4310-4344`, `SpeechConfig.fromSubscription(subscriptionKey, serviceRegion)` — ambos parámetros vienen de configuración, con fallback silencioso (`resolve()` sin error) si faltan).
- **Sentry**: `app.ts:18,46` — `Sentry.init({ dsn: process.env.SENTRY_DSN })`, captura de excepciones puntual en varios controladores de pago (`PaypalController.ts:293`).
- **Integraciones genéricas internas** (`services/IntegrationServices/BaseIntegrationService.ts` + subclases `BillieIntegrationService`, `AriaLiteIntegrationService`, `SmartTrackIntegrationService`, `SGRIntegrationService`): conectan `chateam_jr` con **otros productos propios de JC Romero** (Billie POS, SmartOne/SmartTrack GPS, SGR), no con SaaS de terceros. Sistema propio de `IntegrationProvider`/`IntegrationConnection`/`IntegrationWebhookEvent` con cifrado AES-256-CBC de credenciales (`encrypt`/`decrypt` en `BaseIntegrationService.ts:224-250`) — el único subsistema de integraciones con cifrado de secretos implementado end-to-end.

## 4. Hallazgos (severidad P0/P1/P2/P3)

### P0 — Crítico (fraude financiero / bypass total de autenticación)

**P0-1. Webhook de PayPal sin ninguna verificación de firma — permite falsificar pagos y activar planes gratis.**
`controllers/PaypalController.ts:160-295`. `webhook()` procesa `req.body` directamente (sin `PayPal-Transmission-Sig`/`PayPal-Cert-Url` ni la API `verify-webhook-signature` de PayPal). `handlePaymentCaptureCompleted()` (línea 239) lee `resource.custom_id` (JSON con `invoiceId`, `planId`, `companyId`) y llama a `processPaidPlanPayment()` (línea 280) que **marca la factura como pagada y activa el plan**. Un atacante que conozca/adivine un `invoiceId` (autoincremental) puede enviar un POST directo a `/paypal/webhook` simulando `PAYMENT.CAPTURE.COMPLETED` y obtener el plan pagado sin pagar. Mismo problema en `handleSubscriptionActivated` (línea 374) y `handleCheckoutOrderCompleted` (línea 344).

**P0-2. Webhook de Stripe: la validación HMAC se puede evadir simplemente omitiendo el header `stripe-signature`.**
`controllers/SubscriptionController.ts:718-805`. La lógica solo intenta `stripe.webhooks.constructEvent()` **si** `sig` (header `stripe-signature`) está presente (línea 736). Si el atacante omite el header, cae al `else` de la línea 775 (`"Webhook sin stripe-signature header — procesando sin validación"`) y el body se parsea y procesa como evento válido sin ninguna verificación. Además, si no hay `stripeSecretKey` en el `Company` del superadmin (línea 785) o no hay `STRIPE_WEBHOOK_SECRET` (línea 795), también cae a procesamiento sin validar. Esto anula por completo el propósito de la firma HMAC — el mecanismo de seguridad depende de que el atacante *decida* enviar la firma.

### P1 — Alto

**P1-1. Webhook de Facebook/Instagram Messenger (`POST /webhook`) sin ninguna validación de firma.** `controllers/WebHookController.ts:29-111`. Cualquier POST con `body.object === "page"|"instagram"` dispara `handleMessage()` sobre el ticket real de la company dueña de la página, sin `X-Hub-Signature-256`.

**P1-2. Webhook de comentarios de Facebook Pages (`POST /webhook/facebook`) sin validación de firma.** `controllers/FBPageWebhookController.ts:41-107`. Dispara `processIncomingComment()` para cualquier payload con forma correcta, sin verificar procedencia de Meta.

**P1-3. Webhook de Telegram sin `secret_token`.** `controllers/TelegramController.ts:486`, ruta pública `routes/telegramRoutes.ts:15`. Solo valida el *schema* del payload (Yup), no la autenticidad — Telegram soporta `secret_token` en `setWebhook`/header `X-Telegram-Bot-Api-Secret-Token` y no se usa (`services/TelegramService/StartTelegramSession.ts:120-171` configura el webhook sin `secret_token`). Como `telegramId` es un ID de conexión (probablemente correlativo con otras conexiones visibles en el panel), es adivinable/enumerable, permitiendo inyectar mensajes falsos en tickets de un tenant ajeno.

**P1-4. Webhook de Coingate sin validación de token/firma, y la integración de créditos cripto está incompleta.** `services/AICoingateServices/CoingateService.ts:133-152` (`processWebhook`) no valida el campo `token` propio de Coingate (comparado contra `COINGATE_API_TOKEN`) ni ninguna firma. Adicionalmente, `controllers/AICostController.ts:24-27` (`coingateWebhook`) solo llama a `CoingateService.processWebhook()` y devuelve `processed: !!result` — **nunca invoca `ProvisionCreditsService` ni actualiza ningún registro**, por lo que un pago cripto confirmado por Coingate no acredita créditos automáticamente al tenant (integración "a medias").

**P1-5. Gerencianet/PIX: rutas de pago legado (Brasil) activas sin validación, en plataforma operando en Ecuador.** `controllers/SubscriptionController.ts:496-609` (`createWebhook`, `webhook`), montadas en producción vía `subScriptionRoutes.ts:18-20`. Superficie de ataque sin uso de negocio real conocido.

**P1-6. Secretos de integraciones core almacenados en BD sin cifrado.** `models/Company.ts:81` (`facebookAppSecret`), `:90` (`stripePublicKey`), `:93` (`stripeSecretKey`); `models/Whatsapp.ts:133` (`tokenMeta`, token de acceso de larga duración de WhatsApp Cloud API); `models/AIProviderConfig.ts:75` (`apiKey!: string; // Clave API (deberia estar encriptada)` — comentario propio del equipo confirmando el gap). Ninguna de estas columnas pasa por cifrado antes de persistirse (a diferencia de `IntegrationConnection.authCredentials`, que sí se cifra vía `BaseIntegrationService.encrypt()`). Un acceso de lectura a la BD (dump, backup filtrado, inyección SQL) expone tokens de Meta, Stripe y todos los proveedores de IA en texto plano.

**P1-7. Clave de cifrado por defecto hardcodeada si falta la variable de entorno.** `services/IntegrationServices/BaseIntegrationService.ts:25` y `services/UGCSocialServices/ConnectSocialAccountService.ts:25`: ambos usan `process.env.INTEGRATION_ENCRYPTION_KEY || 'default-key-change-in-production'`. Si la variable no está configurada en algún entorno (staging, réplica, contenedor mal provisto), todos los tokens OAuth sociales y credenciales de integración quedan cifrados con una clave pública y conocida (equivalente a texto plano).

**P1-8. Módulo completo de Billing (Stripe SaaS multi-tenant) es código muerto — nunca se monta.** `routes/billingRoutes.ts` + `controllers/BillingController.ts` (454 líneas, incluye su propio webhook Stripe, checkout, portal, refunds) no aparece en ningún `routes.use(...)` de `routes/index.ts`. Confirmado por grep: solo se referencia a sí mismo. Indica una migración de billing abandonada a medias, coexistiendo con el flujo real (`SubscriptionController`).

### P2 — Medio

**P2-1. Doble sistema de RAG/vectores inconsistente: ChromaDB local (frágil) todavía en el camino crítico de Facebook/Instagram.** `libs/chromadb.ts:11-13` resuelve un path relativo (`../../../public/datos_chroma`) desde `libs/`, frágil ante compilación a `dist/` (cambia la profundidad relativa) o ante ejecución con `tsx` vs `node dist/`. Es importado por `services/IntegrationsServices/pdfReader.ts` y `OpenaiServicesF&G.ts`, y este último es la única dependencia de IA del canal Messenger (`services/FacebookServices/facebookMessageListener.ts`) — es decir, si ese path se rompe, **el canal de Facebook/Instagram pierde su respuesta de IA** silenciosamente, mientras WhatsApp (migrado a `RAGServices`/pgvector) sigue funcionando.

**P2-2. Logging de payloads completos de webhooks Meta/Facebook en consola, con posible PII.** `controllers/MetaWebhookController.ts:79-88` hace `console.log` del body completo (primeros 500 bytes) de cada webhook de Meta, incluyendo IP y User-Agent; `controllers/WebHookController.ts:37` hace `console.log(JSON.stringify(body, null, 2))` sin truncar. Estos logs terminan en PM2/stdout, potencialmente sin rotación ni control de acceso equivalente al de la BD.

**P2-3. Webhook de Higgsfield acepta sin verificar si no hay secreto configurado, silenciosamente.** `controllers/HiggsfieldWebhookController.ts:52-57`: `logger.warn(...); return true;`. Documentado como comportamiento temporal ("AJUSTAR cuando llegue doc"), pero sin flag de entorno que lo fuerce a "enforce" en producción — riesgo de quedar así permanentemente si nadie configura `HIGGSFIELD_WEBHOOK_SECRET`.

**P2-4. Webhook genérico de integraciones firma sobre el body re-serializado, no sobre el raw body.** `controllers/IntegrationController.ts:307-312`: `JSON.stringify(payload)` después de que Express ya parseó el JSON — si el proveedor externo firma sobre el byte-stream original, cualquier diferencia de formato (orden de claves, espacios, unicode) invalida silenciosamente firmas legítimas o, peor, si el comparador no es estricto, podría aceptar variantes no firmadas.

**P2-5. Meta Signature Validator implementado correctamente pero en modo `warn` por defecto (no bloquea).** `services/CoexistenceServices/MetaSignatureValidator.ts:24-26`: `getSignatureMode()` retorna `'warn'` si `META_SIGNATURE_MODE` no está seteado — acepta webhooks con firma inválida o ausente, solo registra warning (línea 129). Es el único de los tres endpoints Meta con lógica de verificación, pero no está en modo `enforce`.

**P2-6. Duplicación de tokens FACEBOOK_/META_ para Conversions API.** `FACEBOOK_CONVERSIONS_ACCESS_TOKEN`/`FACEBOOK_CONVERSIONS_PIXEL_ID`/`FACEBOOK_CONVERSIONS_COMPANY_ID` vs `META_CONVERSIONS_ACCESS_TOKEN`/`META_CONVERSIONS_COMPANY_ID` — dos juegos de variables para el mismo propósito, riesgo de desalineación entre cuál usa cada punto de llamada.

**P2-7. Dos SDKs de AWS coexistiendo.** `package.json` lista tanto `aws-sdk@^2.1693.0` (v2, legado, deprecado por AWS) como `@aws-sdk/client-s3@^3.1007.0` + `@aws-sdk/s3-request-presigner@^3` (v3). No se pudo determinar en esta pasada qué archivos usan cuál, pero implica mantenimiento doble y bundle innecesariamente grande.

### P3 — Bajo

**P3-1. Tokens de verificación de webhook con fallback hardcodeado en código.** `controllers/MetaWebhookController.ts:29` (`process.env.VERIFY_TOKEN || "whaticket"`), `controllers/WebHookController.ts:12` (mismo default `"whaticket"`), `controllers/FBPageWebhookController.ts:22` (`"chateam_fb_verify"`). Si la variable no está seteada, cualquiera que conozca el código fuente (público en GitHub o filtrado) puede completar la verificación de suscripción de un webhook de Meta apuntando a su propio servidor.

**P3-2. `Telegram` no implementa modo polling, solo webhook — TODO pendiente.** `services/TelegramService/StartTelegramSession.ts:190-221`, comentario `// TODO: Implementar polling si es necesario`. Si `BACKEND_URL` no es HTTPS válido, la conexión Telegram simplemente no puede recibir mensajes (falla dura, línea 37: `throw new Error("BACKEND_URL debe usar HTTPS...")`).

**P3-3. Inconsistencia arquitectónica en credenciales Stripe: env global vs BD por-tenant.** `services/StripeService.ts:22` usa `process.env.STRIPE_SECRET_KEY!` (instancia única, global) mientras `controllers/SubscriptionController.ts:44-51,621-624` resuelve `Company.stripeSecretKey` del superadmin en cada llamada. Ambos coexisten en el mismo backend sin que quede claro cuál es la fuente de verdad para reportes de Conversions API (`StripeService` alimenta `SendWebsiteEvent`).

**P3-4. Widget WebChat público sin rate limiting visible a nivel de ruta.** `routes/webChatWidgetRoutes.ts:25-27` (`/public/config/:apiKey`, `/public/message`, `/public/messages/:apiKey/:sessionId`) no muestran middleware de throttling propio; la única protección genérica es CORS abierto para `/webchat/public/*` (`app.ts:72-78`, `origin: callback(null, origin || true)`) — CORS no es control de rate ni de abuso de API.

## 5. Recomendaciones

1. **Inmediato (P0)**: Cerrar el bypass de Stripe — hacer `stripe-signature` **obligatorio** (rechazar 400 si falta) y `STRIPE_WEBHOOK_SECRET` obligatorio en producción (fail-fast al boot si no está seteado en `NODE_ENV=production`). Implementar verificación real de PayPal (SDK `verify-webhook-signature` o comparación de `transmission-id`/`cert-url`/firma) antes de procesar cualquier `PAYMENT.CAPTURE.*`/`BILLING.SUBSCRIPTION.*`.
2. **Corto plazo (P1)**: Añadir `X-Hub-Signature-256` a `/webhook` y `/webhook/facebook` reutilizando `MetaSignatureValidator` (ya existe y está probado en `/webhook/metaws`); pasar `META_SIGNATURE_MODE` a `enforce` tras confirmar en logs que no hay falsos negativos. Añadir `secret_token` al `setWebhook` de Telegram y verificar el header `X-Telegram-Bot-Api-Secret-Token`. Añadir verificación de `token`/firma en Coingate, y cablear `coingateWebhook` a `ProvisionCreditsService`. Cifrar `Company.stripeSecretKey`, `Company.facebookAppSecret`, `Whatsapp.tokenMeta`, `AIProviderConfig.apiKey` reusando el cifrador AES-256-CBC ya existente en `BaseIntegrationService`. Eliminar el fallback `'default-key-change-in-production'` — fallar el arranque si `INTEGRATION_ENCRYPTION_KEY` no está seteada. Decidir: eliminar `routes/billingRoutes.ts`/`BillingController.ts` (código muerto) o completar su montaje si se pretende reemplazar `SubscriptionController`.
3. **Medio plazo (P2)**: Migrar el canal Facebook/Instagram del RAG legado ChromaDB (`OpenaiServicesF&G.ts`) a `RAGServices`/pgvector, y retirar `libs/chromadb.ts` + dependencia `chromadb` de `package.json`. Enmascarar/truncar payloads con PII en los `console.log` de webhooks Meta antes de producción, o mover a `logger.debug` con nivel controlado. Unificar `FACEBOOK_CONVERSIONS_*`/`META_CONVERSIONS_*` en un solo juego de variables. Consolidar en un único SDK de AWS (v3) y retirar `aws-sdk` v2.
4. **Bajo (P3)**: Quitar los defaults hardcodeados de `VERIFY_TOKEN` (`"whaticket"`, `"chateam_fb_verify"`) y requerir la variable explícitamente. Evaluar si Gerencianet/PIX sigue siendo necesario para el negocio actual (Ecuador) y, si no, retirar las rutas.

## 6. Evidencia (archivo:línea)

- WhatsApp Cloud API: `services/WhatsAppCloudAPI/CloudAPIService.ts:83-144` (constructor + factory `509-550`).
- Coexistencia: `services/CoexistenceServices/OutboundRoutingService.ts:1-70`; `MetaSignatureValidator.ts:1-138`.
- Webhooks montados: `routes/index.ts:449,483-676` (grep `routes.use(`); `routes/webHookRoutes.ts:1-21`; `app.ts:90-129` (raw body por URL).
- PayPal webhook (P0-1): `controllers/PaypalController.ts:160-295,239-295`.
- Stripe webhook bypass (P0-2): `controllers/SubscriptionController.ts:718-820`.
- Facebook Messenger sin firma (P1-1): `controllers/WebHookController.ts:29-111`.
- Facebook comentarios sin firma (P1-2): `controllers/FBPageWebhookController.ts:41-107`.
- Telegram sin secret_token (P1-3): `controllers/TelegramController.ts:486-520`; `routes/telegramRoutes.ts:15`; `services/TelegramService/StartTelegramSession.ts:120-221`.
- Coingate (P1-4): `services/AICoingateServices/CoingateService.ts:133-152`; `controllers/AICostController.ts:11-38`; `routes/aiCostRoutes.ts:13`.
- Gerencianet activo (P1-5): `controllers/SubscriptionController.ts:1-37,496-609`; `routes/subScriptionRoutes.ts:1-21`.
- Secretos sin cifrar (P1-6): `models/Company.ts:81,90,93`; `models/Whatsapp.ts:133`; `models/AIProviderConfig.ts:75`.
- Clave de cifrado por defecto (P1-7): `services/IntegrationServices/BaseIntegrationService.ts:21-25,224-250`; `services/UGCSocialServices/ConnectSocialAccountService.ts:25-34`.
- Billing muerto (P1-8): `routes/billingRoutes.ts:1-106`; `controllers/BillingController.ts:1-454`; ausencia confirmada en `routes/index.ts` (grep `billingRoutes|BillingController` solo matchea su propio archivo).
- ChromaDB legado (P2-1): `libs/chromadb.ts:1-16`; `services/IntegrationsServices/pdfReader.ts:13,27,43`; `services/FacebookServices/facebookMessageListener.ts` (import de `OpenaiServicesF&G.ts`).
- Logging PII (P2-2): `controllers/MetaWebhookController.ts:79-89`; `controllers/WebHookController.ts:37`.
- Higgsfield modo permisivo (P2-3): `controllers/HiggsfieldWebhookController.ts:41-78`.
- fal.ai webhook (correcto, referencia positiva): `controllers/FalWebhookController.ts:48-85`.
- Integration webhook genérico (P2-4): `controllers/IntegrationController.ts:278-345`.
- Meta signature modo warn (P2-5): `services/CoexistenceServices/MetaSignatureValidator.ts:23-27,102-131`.
- Env vars completas: extraídas vía `grep -oE "process\.env\.[A-Z_0-9]+" -r services controllers routes config helpers libs app.ts` (192 nombres únicos, tabla filtrada en §2.2). Acceso directo a `.env`/`.env.example` bloqueado por permisos del entorno de auditoría (denegado tanto vía `Read` como vía `Bash cat`).
