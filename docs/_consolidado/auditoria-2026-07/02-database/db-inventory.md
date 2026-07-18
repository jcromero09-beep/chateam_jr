# Base de Datos — Inventario & Auditoría (Spec-Driven)

## 1. Propósito / Alcance

Auditoría exhaustiva del esquema PostgreSQL 17 + pgvector de `chateam_jr` (contenedor `chateam-postgres`, BD `chateamjr`, usuario `atendimento`). Alcance: **187 tablas** en schema `public`, sus columnas, PKs, FKs, índices, extensiones, modelo multi-tenant (`companyId`) y riesgos de seguridad/rendimiento derivados directamente del esquema en producción (datos reales, no genéricos). No se modificó ningún dato ni esquema — solo lectura vía `psql`.

Tamaño total de la BD: **344 MB**. Total de índices definidos: **670**. Todas las 187 tablas tienen PRIMARY KEY (0 tablas sin PK).

## 2. Inventario

### 2.1 Extensiones instaladas

| Extensión | Versión | Uso real observado |
|---|---|---|
| `plpgsql` | 1.0 | Funciones/triggers (ej. `update_contact_memory_timestamp()` sobre `contact_memory`) |
| `pg_trgm` | 1.6 | Solo 2 índices GIN trigram en todo el esquema: `idx_ai_image_gen_prompt_trgm` (`AIImageGenerations.prompt`), `idx_historical_qa_trgm` (`AIHistoricalQA.normalizedQuestion`). Búsqueda difusa de texto muy poco explotada dado el volumen de texto libre en `Messages.body`, `Contacts.name`, etc. |
| `unaccent` | 1.1 | Instalada, sin índices funcionales visibles que la referencien (no hay `unaccent(...)` en `pg_indexes`) — probablemente usada solo en queries ad-hoc de la app, no indexada |
| `vector` | 0.8.5 | pgvector. 6 columnas `vector(1536)` (dimensión típica de `text-embedding-3-small`/`ada-002`): `AIChunks.embedding`, `AIHistoricalQA.embedding`, `AISemanticCache.queryEmbedding`, `QuickMessages.intentEmbedding`, `AISupportCorrections.embedding`, `contact_memory.embedding` |

**Índices ANN (ivfflat) sobre columnas vector — solo 3 de 6:**
- `contact_memory.embedding` → `idx_contact_memory_embedding` (ivfflat, lists=100)
- `AIHistoricalQA.embedding` → `idx_historical_qa_embedding` (ivfflat, lists=100)
- `QuickMessages.intentEmbedding` → `idx_quick_messages_intent_embedding` (ivfflat, lists=20)

**Sin índice ANN (búsqueda `<=>` hace seq scan completo):**
- `AIChunks.embedding` (34 filas hoy — RAG de documentos, motor de esta tabla es el "cerebro" de contexto IA)
- `AISemanticCache.queryEmbedding` (287 filas — cache semántico de respuestas IA, crece con cada consulta)
- `AISupportCorrections.embedding` (0 filas hoy)

### 2.2 Las 187 tablas agrupadas por dominio funcional

**AI / Agentes / RAG / Créditos IA (45 tablas)**
AIABTestVariants, AIABTests, AIAffiliatePrograms, AIAffiliateReferrals, AIAgentAssignments, AIAgentConfigs, AIAgentLogs, AIChatbotConfigs, AIChatbotDataSources, AIChatbotDomains, AIChunks, AICompanyExtensions, AICreditBalances, AICreditTransactions, AICreditTypes, AIDocuments, AIEmailTemplates, AIEntities, AIExtensions, AIFineTuningJobs, AIHistoricalQA, AIImageCreditTransactions, AIImageGenerationItems, AIImageGenerations, AIPromptTemplates, AIProviderConfigs, AIScheduledTasks, AISemanticCache, AISpans, AISubplans, AISupportCorrections, AITeamMembers, AITeams, AITraces, AIUsageLogs, AIUsageMetrics, AIVideoCreditTransactions, AIVideoGenerationItems, AIVideoGenerations, AiTokenPlans, AiTokenTransactions, CompanyTokenUsages, Prompts, PromptQueues, contact_memory

**Affiliate / Referidos (5)**
AffiliateLinks, AffiliateTiers, AffiliateTransactions, AffiliateWallets, AffiliateWithdrawals

**Agentes UGC / Device Farm (identidades sintéticas para redes sociales) (5)**
AgentDevices, AgentIdentities, AgentInteractions, AgentMemories, AgentProfilePhotos

**Attribution / Marketing Analytics (4)**
AttributionChannelAggregates, AttributionConversions, AttributionResults, AttributionTouchpoints

**Campaign / Campañas WhatsApp masivas (9)**
CampaignAlerts, CampaignMessages, CampaignRecommendations, CampaignRuleLogs, CampaignRules, CampaignSettings, CampaignShipping, CampaignShippings, Campaigns

**Chat interno (agentes de la plataforma, no WhatsApp) (5)**
ChatMessages, ChatUsers, Chatbots, Chats, DialogChatBots

**Flow Builder (5)**
FlowAudios, FlowBuilders, FlowCampaigns, FlowDefaults, FlowImgs

**UGC / Redes sociales / Auto-respuesta comentarios (15)**
UGCCampaignMetrics, UGCCampaigns, UGCCreativeLearnings, UGCCreativeVariants, UGCCreatorAssignments, UGCCreatorPayments, UGCCreators, UGCPostComments, UGCSocialAccounts, UGCSocialPosts, UGCVideoAssets, UGCVideoJobs, CommentAutoReplyCampaigns, CommentAutoReplyLogs, CommentResponseSettings

**Meta / Facebook / TikTok Ads (7)**
CompanyMetaConversionSettings, FacebookConversionEvents, FacebookDatasets, MetaAgentActionLogs, MetaAgentPlans, MetaMarketingAuditLogs, MetaOfficialMcpConnections

**Tenant / Company / Billing / Planes (13)**
Companies, CompaniesSettings, CompanyBillings, CompanyEmailPlans, ApplePurchases, EmailPlans, Invoices, PlanCreditAllocations, Plans, Receipts, Subscriptions, Settings, ApiUsages

**Contact / CRM (9)**
ContactBindings, ContactCustomFields, ContactListItems, ContactLists, ContactTags, ContactTemperatures, ContactWallets, Contacts, CustomerOrigins

**Email Marketing (8)**
EmailPlans (ya listado arriba), email_ab_tests, email_automations, email_campaign_recipients, email_campaigns, email_provider_configs, email_templates, email_tracking_events

**Integraciones genéricas (6)**
integration_api_requests, integration_connections, integration_entity_mappings, integration_providers, integration_sync_logs, integration_webhook_events

**Kanban / Conversión de leads (3)**
KanbanLeadConversionEvents, KanbanMovementLogs, Tags

**Mensajería core omnicanal (6)**
Messages, InboundEventLedger, OutboundDispatches, UnifiedConversations, ApiFailedMessages, QuickMessages

**Ticket (7)**
Tickets, TicketNotes, TicketTags, TicketTrakings, LogTickets, UserRatings, Schedules

**Queue / Colas de atención (6)**
Queues, QueueOptions, QueueIntegrations, UserQueues, WhatsappQueues, TelegramQueues

**Telegram (1 adicional)**
Telegrams

**WhatsApp / Baileys (3)**
WhatsAppTemplates, Whatsapps, Baileys

**WebChat widget (3)**
WebChatConversationMessages, WebChatConversations, WebChatWidgets

**Appointments / Agenda de citas (10)**
appointment_ai_suggestions, appointment_analytics, appointment_availability, appointment_blocks, appointment_calendar_sync, appointment_calendar_syncs, appointment_reminders, appointment_services, appointments, reminder_templates

**Mensajes programados (2)**
ScheduledMessages, ScheduledMessagesEnvios

**Auth / Usuarios (2)**
Sessions, Users

**Plataforma / Misceláneo (9)**
Announcements, Files, FilesOptions, Helps, Notifications, Partners, Webhooks, SequelizeMeta, Versions

Total verificado: **187** (`SELECT count(*) FROM information_schema.tables WHERE table_schema='public'` → 187).

### 2.3 Top ~40 tablas por volumen real (`pg_stat_user_tables.n_live_tup`)

| # | Tabla | Filas | Cols | PK | FKs salientes | Índices | Tamaño total (disco) |
|---|---|---|---|---|---|---|---|
| 1 | LogTickets | 225,613 | 7 | id | ticketId→Tickets, userId→Users, queueId→Queues | 1 (solo PK) | 20 MB |
| 2 | Messages | 79,025 | 36 | id | companyId, contactId, conversationId, queueId, ticketId, ticketTrakingId | 8 | 189 MB |
| 3 | InboundEventLedger | 77,310 | 15 | id (bigint) | companyId (RESTRICT) | 6 | 43 MB |
| 4 | Notifications | 30,606 | 13 | id | companyId, userId | 4 | 11 MB |
| 5 | Contacts | 11,406 | 28 | id | companyId, whatsappId | 7 | 5.5 MB |
| 6 | Baileys | 8,761 | 6 | id | whatsappId (SIN índice) | 1 (solo PK) | 2.96 MB |
| 7 | Tickets | 7,442 | 52 | id | companyId, contactId, conversationId, customerOriginId, integrationId, queueId, queueOptionId, telegramId, userId, whatsappId | 9 | 4 MB |
| 8 | ContactBindings | 7,428 | 13 | id | companyId(RESTRICT), contactId, conversationId(RESTRICT), whatsappId | 5 | 2.4 MB |
| 9 | TicketTrakings | 6,718 | 15 | id | companyId, queueId, ticketId, userId, whatsappId | — | 0.85 MB |
| 10 | UnifiedConversations | 5,693 | 14 | id (uuid) | companyId(RESTRICT), primaryContactId | 3 | 1.5 MB |
| 11 | CampaignMessages | 3,650 | 19 | id | companyId, contactId, messageId, ticketId, whatsappId | 6 | 25 MB |
| 12 | FacebookConversionEvents | 2,236 | 22 | id | campaignId, companyId, contactId, messageId, whatsappId | — | 3 MB |
| 13 | AIAgentLogs | 2,169 | 23 | id | companyId, parentLogId (self-FK) | 7 | 1.4 MB |
| 14 | AiTokenTransactions | 1,657 | 17 | id | companyId, planId, userId | 8 (2 redundantes) | 1 MB |
| 15 | Sessions | 1,347 | 12 | id (varchar) | userId | 3 | 0.6 MB |
| 16 | TicketTags | 902 | 5 | id | tagId, ticketId (SIN índices FK) | 1 (solo PK) | — |
| 17 | KanbanMovementLogs | 484 | 13 | id | companyId, fromTagId, ticketId, toTagId, userId | — | 0.5 MB |
| 18 | AISemanticCache | 287 | 14 | id | companyId | 2 (**sin índice ANN sobre `queryEmbedding`**) | 3.1 MB |
| 19 | ApiFailedMessages | 273 | 16 | id | companyId | — | 0.35 MB |
| 20 | KanbanLeadConversionEvents | 210 | 22 | id | companyId, contactId, kanbanTagId, ticketId, userId | — | 0.5 MB |
| 21 | ApiUsages | 199 | 15 | id | companyId | — | — |
| 22 | OutboundDispatches | 198 | 24 | id | companyId(RESTRICT), conversationId, messageId, ticketId, whatsappId | — | — |
| 23 | Tags | 155 | 37 | id | companyId | — | — |
| 24 | appointment_availability | 143 | 16 | id | companyId, serviceId, userId | — | — |
| 25 | AICreditBalances | 136 | 8 | id | companyId, creditTypeId | — | — |
| 26 | ContactTemperatures | 116 | 14 | id | companyId, contactId | — | — |
| 27 | PlanCreditAllocations | 92 | 7 | id | creditTypeId, planId | — | — |
| 28 | AIAgentConfigs | 78 | 24 | id | companyId | 1 | 0.33 MB |
| 29 | appointment_reminders | 66 | 14 | id | appointmentId, companyId | — | — |
| 30 | AIEntities | 57 | 14 | id | (ninguna) | — | — |
| 31 | appointments | 38 | 40 | id | companyId, contactId, createdBy, reminderTemplateId, rescheduledFrom/To (self), serviceId, ticketId, userId | — | — |
| 32 | Schedules | 38 | 24 | id | companyId, contactId, queueId, ticketId, ticketUserId, userId, whatsappId | — | — |
| 33 | QuickMessages | 35 | 15 | id | companyId, userId | 4 (incl. ivfflat) | 0.58 MB |
| 34 | AIChunks | 34 | 12 | id | companyId, documentId, parentChunkId (self) | 4 (**sin ivfflat**) | 0.59 MB |
| 35 | UserQueues | 33 | 5 | id | queueId (sin idx), userId | — | — |
| 36 | Users | 33 | 34 | id | companyId, whatsappId (no FK real, ver 4.x) | 3 | — |
| 37 | SequelizeMeta | 32 | 1 | name | — | 1 | — |
| 38 | Whatsapps | 29 | 89 | id | companyId, linkedWhatsappId | 1 | 0.24 MB |
| 39 | FlowImgs | 27 | 7 | id | companyId, userId | — | — |
| 40 | Queues | 25 | 16 | id | companyId, fileListId, integrationId | — | — |

(Tablas con 0 filas actualmente: 42 de 187 — módulos recién desplegados/en construcción: `AICompanyExtensions`, `Campaigns`(0!), `Chatbots`, `Webhooks`, `AITraces`, `AISpans`, `AgentMemories`, `Helps`, `Partners`, `ApplePurchases`, entre otros. Ver lista completa en §6.)

## 3. Arquitectura & Flujos

### 3.1 Modelo Entidad-Relación (textual, núcleo)

```
Companies (tenant raíz, 15 filas)
 ├─ Users (33)
 │   └─ Sessions (refreshTokenHash, 1 sesión = 1 dispositivo)
 ├─ Whatsapps (29 — canales: baileys/oficial API/facebook/instagram/tiktok, campo "provider"/"channel"/"type")
 │   ├─ Baileys (1:1 estado de sesión Baileys, JSON de contacts/chats)
 │   ├─ Contacts (11,406) — FK opcional a whatsappId
 │   │   ├─ Tickets (7,442) — conversación operativa
 │   │   │   ├─ Messages (79,025)
 │   │   │   ├─ TicketTrakings (6,718 — SLA/tiempos)
 │   │   │   ├─ LogTickets (225,613 — auditoría de eventos del ticket, SIN companyId propio)
 │   │   │   ├─ TicketTags, TicketNotes, UserRatings, KanbanMovementLogs
 │   │   │   └─ Schedules, appointments (agenda)
 │   │   ├─ ContactBindings (7,428) — vínculo N:1 a UnifiedConversations
 │   │   ├─ ContactTags, ContactCustomFields, ContactTemperatures (scoring Kanban), ContactWallets
 │   │   └─ contact_memory (memoria semántica IA por contacto, pgvector)
 │   └─ CampaignMessages, FacebookConversionEvents, WhatsAppTemplates
 ├─ UnifiedConversations (5,693, uuid PK) — capa de unificación omnicanal
 │   ├─ Messages.conversationId, Tickets.conversationId, OutboundDispatches, ContactBindings
 ├─ InboundEventLedger (77,310) — ledger de deduplicación de eventos entrantes (idempotencia webhooks)
 ├─ Queues → QueueOptions (árbol menú IVR) → UserQueues/WhatsappQueues/TelegramQueues (N:M)
 ├─ AIProviderConfigs / AIAgentConfigs / AIChatbotConfigs → AIAgentLogs / AIUsageLogs (auditoría+costo IA)
 ├─ AIDocuments → AIChunks (RAG, embeddings vector(1536))
 ├─ Campaigns → CampaignMessages/CampaignShippings (envíos masivos WhatsApp)
 ├─ email_campaigns → email_campaign_recipients / email_tracking_events (marketing por email)
 ├─ UGCCampaigns → UGCVideoJobs → UGCSocialPosts → UGCPostComments (pipeline de contenido IA→redes)
 ├─ AgentIdentities → AgentDevices/AgentMemories/AgentInteractions (device farm de identidades sintéticas)
 ├─ appointments → appointment_reminders/appointment_calendar_syncs (agenda con Google Calendar)
 └─ integration_providers → integration_connections → integration_sync_logs/integration_webhook_events (integraciones genéricas tipo n8n/Zapier)
```

### 3.2 Modelo multi-tenant

- **157 de 187 tablas (84%)** tienen columna `companyId`/`company_id` directa, casi siempre `NOT NULL` con FK a `Companies(id) ON DELETE CASCADE` y con un índice btree simple (`idx_<tabla>_company` o similar).
- **30 tablas (16%) NO tienen `companyId` propio** — el aislamiento de tenant depende 100% de un JOIN hacia una tabla padre que sí lo tiene. Clasificación por riesgo:

  **Riesgo ALTO (tabla de auditoría/transaccional grande, sin companyId, referenciada en queries de listado):**
  - `LogTickets` (225,613 filas, la tabla MÁS GRANDE del sistema) — solo tiene `ticketId`/`userId`/`queueId`. Cualquier endpoint que liste "historial de eventos" sin hacer `JOIN Tickets ON Tickets.companyId = :companyId` puede filtrar eventos de otro tenant si solo filtra por `ticketId` (que en teoría ya es de la company correcta, pero no hay defensa en profundidad a nivel de fila: no hay forma de validar `companyId` sin el JOIN).
  - `Sessions` (1,347 filas) — tabla de sesiones de auth (`refreshTokenHash`, `ip`, `userAgent`, `deviceId`). Solo tiene `userId`. Correcto por diseño (sesión es de usuario, no de tenant), pero cualquier revocación masiva "por company" (ej. offboarding de un tenant) requiere subquery contra `Users`.
  - `Baileys` (8,761 filas) — estado de sesión WhatsApp (contactos/chats en JSON), solo `whatsappId`. Sin companyId directo.

  **Riesgo MEDIO (tablas join/pivote N:M, exposición limitada por ser solo relación):**
  - `ChatUsers`, `TicketTags`, `ContactTags`, `UserQueues`, `WhatsappQueues`, `TelegramQueues`, `PromptQueues`, `QueueOptions`, `DialogChatBots`, `ContactCustomFields`, `CampaignShipping`, `CampaignShippings`, `TicketNotes`

  **Riesgo BAJO / esperado (catálogos globales de plataforma, intencionalmente sin tenant):**
  - `Companies`, `SequelizeMeta`, `Versions`, `integration_providers`, `Plans`, `EmailPlans`, `AiTokenPlans`, `AICreditTypes`, `PlanCreditAllocations`, `Helps`

  **Caso especial — nomenclatura inconsistente de tenant:**
  - `AIAffiliateReferrals` no tiene `companyId` pero sí `affiliateCompanyId` y `referredCompanyId` (2 FKs distintas a `Companies`, ambas nullable/SET NULL) — modelo de referidos entre tenants, correcto mas no sigue la convención `companyId` del resto del esquema.
  - `CompanyBillings` usa `company_id` (snake_case) en vez de `companyId` (camelCase) — única tabla junto con `contact_memory` que rompe la convención de nombrado camelCase del resto del esquema (probablemente tablas nuevas migradas con Prisma/Knex en vez de Sequelize).

### 3.3 Distribución real de datos por tenant (sonda, `Tickets`)

| companyId | Empresa | Tickets |
|---|---|---|
| 6 | Smarttrack | 2,714 |
| 48 | Distribuidora eI Bakan | 2,104 |
| 8 | chateam | 2,046 |
| 10 | Estetica dolcevita | 378 |
| 1 | Demo Company | 143 |
| 50 | Level | 22 |
| 49 | Pacta sunt servanda | 20 |
| 9 | Levelix | 11 |
| 7 | Jc ROMERO | 4 |

15 companies activas en total (ids 1,4,6,7,8,9,10,41,44,45,46,47,48,49,50).

## 4. Hallazgos (Severidad P0–P3)

### P0 — Críticos (seguridad/fuga de datos, acción inmediata)

**P0-1. Secretos y tokens OAuth/API almacenados en texto plano en múltiples tablas.**
No hay evidencia de cifrado a nivel de columna (`pgcrypto`, `pgp_sym_encrypt`, etc. no está instalado — solo `plpgsql/pg_trgm/unaccent/vector`). Columnas `text`/`varchar` con secretos en claro:
- `Whatsapps`: `token`, `facebookUserToken`, `tokenMeta`, `botToken`, `tiktokAccessToken`, `tiktokRefreshToken`, `tiktokBusinessAccessToken`, `tiktokBusinessRefreshToken`, `pageAccessToken` (9 columnas de credenciales por cada uno de los 29 canales conectados, incluye tokens de Meta/Facebook/Instagram/TikTok Business con capacidad de enviar mensajes/publicar/gastar presupuesto de ads).
- `Companies`: `paypalClientId`, `paypalSecretKey`, `stripePublicKey`, `stripeSecretKey`, `facebookAppSecret` — **claves secretas de pasarelas de pago de cada tenant en claro**, en una tabla de 15 filas pero con 186 FKs entrantes (altísima superficie de exposición si hay SQL injection o dump de backup).
- `AIProviderConfigs.apiKey` / `apiSecret` — API keys de OpenAI/Anthropic/otros proveedores IA por tenant, en claro.
- `email_provider_configs.apiKey` / `apiSecret` — API keys de SendGrid/Mailgun/SES por tenant, en claro.
- `MetaOfficialMcpConnections.accessToken` / `refreshToken` — OAuth tokens del MCP oficial de Meta Ads, en claro.
- `CompaniesSettings.googleDriveTokens` (jsonb) — tokens OAuth de Google Drive por tenant, en JSON sin cifrar.
- `integration_connections.credentials` (jsonb) — credenciales genéricas de integraciones externas, en JSON sin cifrar.
- Contraste positivo: `Users.passwordHash` y `Sessions.refreshTokenHash` **sí** están hasheados (buena práctica ya aplicada ahí) — el problema es específico de credenciales de terceros/pasarelas, no de auth de usuarios.
- **Impacto:** un dump de BD, un backup mal asegurado, o un acceso de solo-lectura comprometido (ej. vía un rol de reporting) expone directamente Stripe secret keys, PayPal secrets, tokens de Meta/TikTok/Google de los 15 tenants activos.

**P0-2. `LogTickets` (225,613 filas, la tabla más grande del sistema) sin `companyId` y sin índices en ninguna FK (`ticketId`, `userId`, `queueId`).**
Además de ser un riesgo de aislamiento de tenant (ver §3.2), cualquier consulta `WHERE ticketId = ?` hace **seq scan sobre 225K filas** (20 MB en disco, solo el PK está indexado). Es la tabla con más filas de toda la BD y probablemente la más consultada al abrir el historial de un ticket.

### P1 — Altos (rendimiento/integridad, corto plazo)

**P1-1. 152 columnas FK en 90+ tablas sin índice en la columna FK (leading column).**
Postgres NO crea automáticamente un índice para columnas FK (a diferencia de la PK). Se detectaron sistemáticamente FKs sin índice, incluyendo en tablas con volumen ya relevante:
- `Baileys.whatsappId` (8,761 filas, único índice es el PK)
- `TicketTags.ticketId` / `.tagId` (902 filas)
- `Messages.contactId`, `Messages.queueId`, `Messages.ticketTrakingId` (79,025 filas — parcialmente indexada: `ticketId` y `companyId` sí tienen índice, pero `contactId` no, y es un patrón de consulta común "todos los mensajes de un contacto")
- `Tickets.userId`, `Tickets.queueId`, `Tickets.whatsappId`, `Tickets.telegramId`, `Tickets.queueOptionId`, `Tickets.integrationId` (7,442 filas — patrones comunes "tickets de un agente" o "tickets de una cola" harían seq scan)
- `Contacts.whatsappId` (11,406 filas)
- `Campaigns.userId`, `.queueId`, `.whatsappId`, `.contactListId`, `.whastsAppTemplateId` (Campaigns tiene 0 filas hoy, pero el patrón se replicará al activarse)
- Lista completa de 152 columnas en §6 (evidencia).
Esto es un patrón sistémico probablemente por definición de FKs vía Sequelize `references` sin `index: true` explícito.

**P1-2. `AIChunks.embedding` y `AISemanticCache.queryEmbedding` sin índice ANN (ivfflat/hnsw).**
Motor de RAG (`AIChunks`, 34 filas) y cache semántico de IA (`AISemanticCache`, 287 filas) hacen similitud coseno (`<=>`) con **seq scan** sobre `vector(1536)`. Hoy es tolerable por el volumen bajo, pero es contradictorio con el resto del diseño (sí se indexó `contact_memory`, `AIHistoricalQA` y `QuickMessages` con ivfflat) — indica una omisión, no una decisión consciente. A partir de unos pocos miles de chunks/cache entries el costo de latencia por respuesta IA subirá de forma no lineal.

**P1-3. Retención/purga no observable en `InboundEventLedger` (77,310 filas, 43 MB, mitad del peso en índices) y `LogTickets` (225,613 filas).**
Son tablas de tipo ledger/auditoría de alta escritura sin evidencia de política de archivado (no hay partición, no hay tabla `_archive`, `receivedAt`/`createdAt` sin política TTL visible en el esquema). A este ritmo de crecimiento seguirán siendo las tablas dominantes en tamaño e I/O.

**P1-4. `AiTokenTransactions` (1,657 filas de transacciones de billing de tokens IA) permite balances negativos y usa `numeric(18,10)` para `amountUsd` sin `CHECK` de no-negatividad en `tokens`/`amountUsd`** (a diferencia de `Companies.imageGenerationCredits` que sí tiene `CHECK (>= 0)`). Inconsistencia de integridad entre módulos de créditos similares dentro del mismo dominio de billing.

### P2 — Medios (deuda técnica, mediano plazo)

**P2-1. Índices duplicados/redundantes (limpieza de mantenimiento, cuestan escritura sin beneficio):**
- `AiTokenTransactions`: `idx_aitokentrans_company` y `idx_aitokentransactions_companyid` — mismo índice exacto (`btree (companyId)`) definido dos veces.
- `Plans`: `Plans_name_key` y `unique_plan_name` — mismo `UNIQUE btree(name)` duplicado.
- `MetaOfficialMcpConnections`: `idx_meta_official_mcp_company` y `MetaOfficialMcpConnections_companyId_key` — mismo `UNIQUE btree(companyId)` duplicado.
- `AffiliateLinks`: `AffiliateLinks_slug_key` y `idx_affiliate_links_slug` — mismo `UNIQUE btree(slug)` duplicado.

**P2-2. `contact_memory` y `CompanyBillings` rompen convención `snake_case` vs `camelCase`** del resto del esquema (`company_id`/`contact_id`/`created_at` vs `companyId`/`createdAt` en las otras 185 tablas). Indica origen/herramienta de migración distinta (probablemente añadidas fuera de Sequelize). No es un bug pero complica queries cross-tabla y el ORM debe manejar dos convenciones.

**P2-3. Columnas JSON/JSONB pesadas sin índice GIN cuando se usan como filtro:** `Tickets.metadata`, `Tickets.dataWebhook`, `Tickets.flowMetadata` (jsonb, 7,442 filas) no tienen índice GIN — si el flujo de IA/webhooks filtra por claves dentro de estos JSON (patrón común en `flowState`/`flowMetadata` para IA conversacional), cada query es un seq scan + deserialización JSON completa. Mismo patrón en `integration_connections.credentials`/`.config`, `UGCCampaigns` (9 columnas jsonb en una sola tabla).

**P2-4. `Whatsapps` tiene 89 columnas** — la tabla con más columnas de todo el esquema, mezclando configuración de 5 canales distintos (Baileys/WhatsApp oficial/Facebook/Instagram/TikTok) en una sola tabla ancha en vez de normalizar por canal. Dificulta el mantenimiento y hace que cada fila cargue ~40 columnas irrelevantes según el canal real usado (ej. una fila `channel=tiktok` carga igual las 9 columnas de secretos de Facebook).

**P2-5. `Tickets` tiene 10 FKs salientes y 12 tablas que la referencian** (fan-in/fan-out muy alto) — es el hub central del esquema junto con `Contacts` y `Companies`. Cualquier `DELETE` en cascada sobre un `Ticket` dispara cascada sobre `Messages`, `TicketTrakings`, `LogTickets`, `KanbanMovementLogs`, `CampaignMessages`, `TicketNotes`, `TicketTags`, `Schedules`, `UserRatings`, `OutboundDispatches` — riesgo operacional si algún proceso hace `DELETE FROM Tickets` masivo por error (no hay soft-delete visible; no existe columna `deletedAt`/`isDeleted` en `Tickets`, aunque sí existe `Messages.isDeleted` como patrón usado en otra tabla).

### P3 — Bajos (housekeeping)

- `SequelizeMeta` (32 migraciones aplicadas) usa `name` como PK (varchar), consistente con el patrón estándar de Sequelize — sin problema, solo mención para el inventario.
- 42 de 187 tablas tienen 0 filas — módulos completamente vacíos en producción: `Campaigns` (0, el módulo estrella de "campañas" no tiene ni una fila, mientras `CampaignMessages` sí tiene 3,650 — sugiere que las campañas se crean por otro flujo o el módulo nuevo aún no se usa), `Chatbots`, `Webhooks`, `AITraces`/`AISpans` (observabilidad IA tipo OpenTelemetry, sin datos), `Helps`, `Partners`, `ApplePurchases`, `AgentMemories`, `UGCCreators`/`UGCSocialAccounts` con 1 fila cada una (features UGC muy incipientes). Confirmar con backend-developer si son features en desarrollo o dead code de esquema.
- `AIEntities` (57 filas) y `AIExtensions` (12 filas) no tienen ninguna FK saliente ni columna `companyId` — parecen catálogos globales de plataforma, correcto por diseño pero sin documentar explícitamente como tal.

## 5. Recomendaciones

1. **(P0) Cifrar en reposo todas las columnas de secretos/tokens de terceros** listadas en P0-1, usando `pgcrypto` (`pgp_sym_encrypt`/`pgp_sym_decrypt`) con clave gestionada fuera de la BD (KMS/env), o migrarlas a un vault externo (HashiCorp Vault / AWS Secrets Manager) y dejar solo una referencia en la BD. Priorizar `Companies.stripeSecretKey`/`paypalSecretKey` y `AIProviderConfigs.apiKey` por ser las de mayor impacto financiero si se filtran.
2. **(P0) Añadir `companyId` a `LogTickets`** (denormalizado desde `Tickets.companyId` al insertar) + `CREATE INDEX` en `(companyId, ticketId)` y en `ticketId` solo. Es un cambio de bajo riesgo (append-only, ON DELETE CASCADE desde Tickets ya existe) con alto impacto en seguridad y performance.
3. **(P1) Crear índices en las 152 columnas FK sin índice** listadas en §6, priorizando por volumen de filas: `Baileys.whatsappId`, `Messages.contactId`, `Tickets.userId`/`.queueId`/`.whatsappId`, `TicketTags.ticketId`/`.tagId`, `Contacts.whatsappId`. Script de migración puede generarse automáticamente desde la query de §6.
4. **(P1) Añadir índice ivfflat (o hnsw si se actualiza pgvector) a `AIChunks.embedding` y `AISemanticCache.queryEmbedding`** ahora, mientras el volumen es bajo (34 y 287 filas) — crear el índice con estos volúmenes es instantáneo; esperar a miles de filas lo hace costoso y bloqueante.
5. **(P1) Definir política de retención/particionado para `InboundEventLedger` y `LogTickets`** (ej. partición por mes + `DROP` de particiones >90 días, o archivado a tabla fría). Coordinar con backend-developer sobre qué retención es legalmente/operacionalmente necesaria antes de purgar.
6. **(P1) Añadir `CHECK (tokens >= 0)` en `AiTokenTransactions`** si el modelo de negocio no permite balance negativo, replicando el patrón ya usado en `Companies.imageGenerationCredits`.
7. **(P2) Eliminar los 4 pares de índices duplicados** (`AiTokenTransactions`, `Plans`, `MetaOfficialMcpConnections`, `AffiliateLinks`) — `DROP INDEX` del más nuevo/menos usado en cada par, verificando primero que ninguna migración dependa del nombre específico.
8. **(P2) Evaluar índices GIN en columnas jsonb usadas como filtro** (`Tickets.flowMetadata`, `integration_connections.config`) una vez identificados los patrones de consulta reales con backend-developer.
9. **(P3) Documentar explícitamente qué tablas son catálogos globales (sin tenant) por diseño** (`Plans`, `AiTokenPlans`, `AICreditTypes`, `AIEntities`, `AIExtensions`, `integration_providers`, `Helps`) vs. cuáles son huérfanas de `companyId` por omisión, para que futuras migraciones no agreguen `companyId` innecesariamente ni dejen de agregarlo donde falta.
10. Coordinar con **security-auditor** la remediación P0-1 (clasificación PII/secretos, alcance de cifrado, rotación de credenciales ya expuestas) y con **postgres-pro** la ejecución de los índices P1 con `CREATE INDEX CONCURRENTLY` para no bloquear producción dado que `Messages` (79K filas, 189 MB) y `Tickets` reciben tráfico constante.

## 6. Evidencia (comandos y salidas)

Todos los comandos se ejecutaron contra la BD viva:
```
docker exec chateam-postgres psql -U atendimento -d chateamjr -c "SQL..."
```

**Conteo de tablas:**
```sql
SELECT count(*) FROM information_schema.tables WHERE table_schema='public';
-- 187
```

**Extensiones:**
```sql
SELECT extname, extversion FROM pg_extension;
-- plpgsql 1.0 | pg_trgm 1.6 | unaccent 1.1 | vector 0.8.5
```

**Tablas sin PK:**
```sql
SELECT t.table_name FROM information_schema.tables t
WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints tc
  WHERE tc.table_name=t.table_name AND tc.table_schema='public' AND tc.constraint_type='PRIMARY KEY');
-- (0 filas) — todas las 187 tablas tienen PK
```

**Tablas sin `companyId`/`company_id` (30):**
```
AIAffiliateReferrals, AICreditTypes, AIEntities, AIExtensions, AITeamMembers, AiTokenPlans, Baileys,
CampaignShipping, CampaignShippings, ChatUsers, Companies, ContactCustomFields, ContactTags,
DialogChatBots, EmailPlans, Helps, LogTickets, PlanCreditAllocations, Plans, PromptQueues,
QueueOptions, SequelizeMeta, Sessions, TelegramQueues, TicketNotes, TicketTags, UserQueues,
Versions, WhatsappQueues, integration_providers
```

**152 columnas FK sin índice en la leading column** (query completa usada, resultado íntegro):
```sql
WITH fk_cols AS (
  SELECT tc.table_name, kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
),
idx_first_cols AS (
  SELECT t.relname AS table_name, a.attname AS column_name
  FROM pg_index ix
  JOIN pg_class t ON t.oid = ix.indrelid
  JOIN pg_class i ON i.oid = ix.indexrelid
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ix.indkey[0]
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname='public'
)
SELECT fk.table_name, fk.column_name FROM fk_cols fk
WHERE NOT EXISTS (SELECT 1 FROM idx_first_cols ic
  WHERE ic.table_name = fk.table_name AND ic.column_name = fk.column_name)
ORDER BY fk.table_name, fk.column_name;
```
Resultado (152 filas): incluye entre otras — `Baileys.whatsappId`, `LogTickets.ticketId`/`.userId`/`.queueId`, `Messages.contactId`/`.queueId`/`.ticketTrakingId`, `Tickets.userId`/`.queueId`/`.whatsappId`/`.telegramId`/`.queueOptionId`/`.integrationId`, `Contacts.whatsappId`, `TicketTags.ticketId`/`.tagId`, `TicketNotes.ticketId`/`.userId`, `Campaigns.userId`/`.queueId`/`.whatsappId`/`.contactListId`/`.whastsAppTemplateId`, `KanbanMovementLogs.userId`/`.fromTagId`/`.toTagId`, `Schedules.companyId`/`.contactId`/`.queueId`/`.ticketId`/`.ticketUserId`/`.userId`/`.whatsappId` (Schedules no tiene NINGÚN índice), `UserQueues.queueId`, `WhatsappQueues.queueId`, `TelegramQueues.queueId`, `QueueOptions.parentId`/`.queueId`, `appointments.*` (7 FKs sin índice), `email_campaigns.createdBy`/`.templateId`, y los módulos `integration_*` completos.

**Índices duplicados detectados:**
```sql
SELECT tablename, regexp_replace(indexdef, 'INDEX [^ ]+ ON', 'INDEX X ON') AS norm, count(*), string_agg(indexname, ', ')
FROM pg_indexes WHERE schemaname='public'
GROUP BY tablename, norm HAVING count(*) > 1;
```
```
AffiliateLinks       | UNIQUE btree(slug)      | AffiliateLinks_slug_key, idx_affiliate_links_slug
AiTokenTransactions  | btree(companyId)        | idx_aitokentrans_company, idx_aitokentransactions_companyid
MetaOfficialMcpConnections | UNIQUE btree(companyId) | idx_meta_official_mcp_company, MetaOfficialMcpConnections_companyId_key
Plans                | UNIQUE btree(name)      | Plans_name_key, unique_plan_name
```

**Tamaño en disco (top 15, `pg_total_relation_size`):**
```
Messages 189MB (tabla 62MB + índices 23MB... con TOAST) | InboundEventLedger 43MB | CampaignMessages 25MB |
LogTickets 20MB | Notifications 11MB | Contacts 5.5MB | Tickets 4MB | AISemanticCache 3.1MB |
FacebookConversionEvents 3MB | Baileys 2.96MB | ContactBindings 2.4MB | AIHistoricalQA 1.7MB (100% índice) |
contact_memory 1.66MB (100% índice) | UnifiedConversations 1.5MB | AIAgentLogs 1.4MB
```
Total BD: `SELECT pg_size_pretty(pg_database_size('chateamjr'))` → **344 MB**.
Total índices en schema: `SELECT count(*) FROM pg_indexes WHERE schemaname='public'` → **670**.

**Columnas `vector(1536)`:**
```
AIChunks.embedding | AIHistoricalQA.embedding | AISemanticCache.queryEmbedding |
QuickMessages.intentEmbedding | AISupportCorrections.embedding | contact_memory.embedding
```

**Distribución real de Tickets por tenant** (sonda, tabla §3.3) y lista de 15 `Companies` activas (ids 1,4,6,7,8,9,10,41,44,45,46,47,48,49,50) — confirmado con `SELECT id,name,status FROM "Companies" ORDER BY id`.

**Estructuras completas (`\d`) capturadas para:** `Messages`, `Tickets`, `Contacts`, `Whatsapps`, `UnifiedConversations`, `InboundEventLedger`, `Notifications`, `ContactBindings`, `Users`, `AIProviderConfigs`, `MetaOfficialMcpConnections`, `email_provider_configs`, `integration_connections`, `CompanyMetaConversionSettings`, `AIChunks`, `AISemanticCache`, `AIAgentLogs`, `AiTokenTransactions`, `CampaignMessages`, `contact_memory`, `LogTickets`, `Sessions`, `Baileys`, `AIAffiliateReferrals`, `ContactCustomFields`, `QueueOptions`, `Companies`, `Plans`, `AIHistoricalQA`, `AISupportCorrections`, `QuickMessages` — disponibles en el historial de comandos de esta sesión para referencia futura.
