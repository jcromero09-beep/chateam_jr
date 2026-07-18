# Fase 1 — Spec-First "el QUÉ" (Visión y Alcance) · chateam_jr

> Método: Spec-First. Este documento es EL QUÉ (no el cómo). Toda afirmación cita evidencia de código
> (`archivo:línea`) o de sonda al sistema vivo (`https://padeldev.codigo.plus/be`). Se reutilizan los
> conteos e inventarios ya producidos en `AUDITORIA_2026_07/` (01-backend, 02-database, 03-frontend,
> 05-integraciones, 06-seguridad, 07-infra-runtime, 08-sondas-runtime, 14-deuda-tecnica-arquitectura,
> 99-sintesis) para NO re-auditar; aquí se reorganiza esa evidencia en clave de negocio/producto.
> Fecha: 2026-07-12. Fuente: `/home/jcromero09/chateam_jr` (solo lectura) + sondas GET ya ejecutadas por
> el equipo de auditoría (no se generó tráfico nuevo en esta sesión — ver nota en §6).
>
> Convención: **[SUPUESTO]** = inferido de código/UI, requiere confirmación de negocio de JC.
> **[PROPUESTO]** = meta numérica sugerida por el analista, requiere validación de JC antes de ser un NFR contractual.

---

## 1. Visión del producto

**Qué es.** `chateam_jr` (paquete `chateam-platform` v1.1.0 backend / `jrchateam-frontend` v6.0.0 frontend,
`package.json:2-5`: *"Plataforma omnicanal completa para gestión de comunicaciones empresariales"*) es un
**CRM conversacional omnicanal multi-tenant** que centraliza WhatsApp (Baileys no-oficial + WhatsApp Cloud API
oficial de Meta, con "Coexistencia" entre ambos — `services/CoexistenceServices/`, 11 archivos), Facebook/Instagram
Messenger, comentarios de FB/IG, Telegram, TikTok y un WebChat propio, en una única bandeja de tickets
(`Tickets`, 7.442 filas reales) con pipeline de ventas tipo Kanban (`Funnel de Ventas`), agenda de citas,
campañas masivas de WhatsApp y Email Marketing, y una capa de Inteligencia Artificial generativa (agentes IA,
RAG sobre pgvector, generación de imagen/video/audio "UGC", créditos IA prepago) construida sobre 187 tablas
PostgreSQL (`AUDITORIA_2026_07/02-database/db-inventory.md:104`) y 857 servicios backend en 124 subdominios
(`AUDITORIA_2026_07/01-backend/backend-inventory.md:18-19`). El login (`frontend/src/pages/Login.tsx:94`)
resume la promesa en una frase: *"Plataforma de comunicación omnicanal"*.

**Propuesta de valor [SUPUESTO — confirmar segmento/pricing con JC].** Un solo panel para que una PyME o
agencia atienda todos sus canales de mensajería con un equipo (roles admin/supervisor/agente) y escale la
atención con IA (respuestas automáticas, agentes con base de conocimiento propia, generación de contenido para
redes) sin perder trazabilidad comercial (Kanban de leads, citas, campañas, atribución de marketing). El
modelo de negocio observado en código es **SaaS multi-tenant por planes** con **onboarding vía "Plan Demo
incluido al inicio"** (`frontend/src/pages/SignUp.tsx:280`) y **consumo de IA por créditos prepago**
(tablas `AICreditBalances`/`AICreditTransactions`/`AiTokenTransactions`, gateways Stripe/PayPal/Gerencianet-PIX/
Coingate — `AUDITORIA_2026_07/05-integraciones/integraciones.md:123-129`). No hay evidencia en código de un
posicionamiento de mercado explícito (vertical, tamaño de cliente objetivo, precio); se marca como pendiente
de negocio, no de ingeniería.

---

## 2. Usuarios y roles

**Modelo real de autorización (evidencia).** El backend define el rol en `Users.profile` (string libre,
`models/User.ts:55`) + flag booleano `Users.super` (`middleware/isSuper.ts`, requiere `user.super===true`,
usado solo en 11/129 archivos de ruta — `AUDITORIA_2026_07/01-backend/backend-inventory.md:74,207`). El
frontend traduce `profile` a 4 roles con `mapProfileToRole()` (`frontend/src/utils/permissions.ts:879-894`):
`super` (si el string incluye "super"), `admin`, `supervisor`, `user` (default). **El gating real de MENÚ y
RUTA no es por rol sino por PLAN de la company** (`user.company.plan.interfacePermissions`, JSON parseado por
`hasAccessByPlan()`/`parseInterfacePermissions()` — `frontend/src/hooks/usePermissions.ts:31-124`,
`frontend/src/utils/permissions.ts` 1.197 líneas); el rol solo decide 2 cosas: (a) acceso total si
`super===true`, y (b) los ítems marcados explícitamente `roles:['super']` en el árbol de menú
(`frontend/src/components/AppLayout.tsx`, 18+ ocurrencias, p.ej. `:614,621,628,854,861,979,1049,1056,1101,
1114,1121,1128,1134` — Optimización IA, Config UGC, Posts programados, Costos IA, Permisos, Planes,
Empresas, Consumo Tokens IA) y 4 rutas `superOnly` en `App.tsx:405,416,428,454`
(`/permissions-manager`, `/admin/ai-token-usage`, `/ai-rentability`, `/ugc/settings`). Es decir: **admin,
supervisor y user hoy tienen el MISMO techo de acceso salvo diferencias de plan** — los 3 roles "legacy" se
mantienen por compatibilidad pero no son la fuente de verdad del RBAC (`frontend-inventory.md:116`). Esto se
confirmó en vivo: la sonda RBAC (`AUDITORIA_2026_07/08-sondas-runtime/sondas-rbac.md:19-39`) muestra que
`admin`/`supervisor`/`user` reciben 200 en endpoints de costos/créditos IA que deberían ser solo-admin.

| Rol (backend `profile`/`super`) | 3 acciones clave (evidencia) | Pantallas principales (AppLayout) |
|---|---|---|
| **super-admin** (`super=true`, ej. sonda `admin@chateam.com`, companyId 1) | (1) Gestionar TODAS las companies/planes de la plataforma — `GET/POST /companies`, `/plans` (`routes/companyRoutes.ts`, `routes/planRoutes.ts`, gate `isSuper` en `CompanyController` salvo `store`, ver hallazgo P2-10 seguridad); (2) Configurar proveedores de IA globales y ver costos/rentabilidad — `/ai/dashboard/admin`, `/ai-costs/*` (`isSuper`, `AUDITORIA_2026_07/06-seguridad/seguridad.md:24` "financialRoutes.ts:13,17,21"); (3) Administrar permisos por plan — `/permissions-manager` (`App.tsx:405`) | `/companies`, `/plans`, `/permissions-manager`, `/admin/ai-token-usage`, `/ai-rentability`, `/ai-costs-group`, `/ugc/settings`, + todo lo de admin |
| **admin** (`profile` contiene "admin", ej. sonda `bryan@gmail.com`, companyId 8) | (1) Gestionar usuarios y colas de SU company — `/users`, `/queues` (`module:'users'`,`'queues'`, `AppLayout.tsx:1073-1076,376-379`); (2) Configurar canales (WhatsApp/Meta/Telegram/TikTok) y campañas — `/connections-group`, `/campaigns-group` (`:408-484,532-568`); (3) Ver dashboard admin de IA — `/ai/dashboard/admin` (200 para admin, 403 para supervisor/user, sonda `sondas-rbac.md:30`) | `Dashboard`, `Tickets`, `Kanban/Funnel`, `Conexiones`, `Campañas`, `Configuración General`, `Usuarios`, `Facturación` |
| **supervisor** (ej. sonda `dinaspa@gmail.com`, companyId 10) | (1) Supervisar tickets/agentes (`SupervisorService.ts`, 1.627 líneas — `AUDITORIA_2026_07/14-deuda.../deuda-arquitectura.md:235`); (2) Ver reportes de tickets/citas — `/appointments/reports`, `dashboard/ticketsUsers` (roto, 500 en los 4 perfiles); (3) Mover leads en el Kanban — `/funnel` (`module:'kanban'`, `AppLayout.tsx:388-391`) | `Tickets`, `Funnel de Ventas`, `Citas`, `Reportes`, sin `/ai/dashboard/admin` (403) |
| **user** (agente operativo, ej. sonda `christian@smarttrack.com`, companyId 6) | (1) Atender tickets/chats asignados — `/tickets`, mensajería en tiempo real (Socket.IO namespace `/{companyId}`); (2) Usar mensajes rápidos/plantillas — `/quick-replies`; (3) Agendar citas de contactos — `/appointments/bookings` | `Tickets`, `Contactos`, `Mensajes Rápidos`, `Chats Internos`, `Citas` — **hoy también ve** `/ai/agents` (con `systemPrompt`), `/ai/costs/report`, `/ai/credits/*` por el hallazgo P1-1/P1-2 de `sondas-rbac.md:59-64` (gap de RBAC, no diseño intencional) |

**[SUPUESTO]** No hay evidencia de un 5º rol "agente de solo lectura" o "cliente final con portal propio"
más allá del widget WebChat público (sin login). Si el negocio requiere un rol adicional (ej. "facturación"),
debe confirmarse — hoy el sistema de permisos por plan (`interfacePermissions`, ~90 flags booleanos en
`permissions.ts`) sería el mecanismo natural para modelarlo sin tocar el enum de `profile`.

---

## 3. Funcionalidades por módulo

Cada módulo lista lo que el **usuario puede hacer** (UI) y lo que **el sistema permite** (backend), con la
ruta/controlador real que lo respalda. Fuente: `routes/index.ts` (montaje, `backend-inventory.md:47-66`),
`controllers/*.ts` (135 archivos confirmados por `Glob`), `AppLayout.tsx` (menú), `db-inventory.md` (tablas).

### 3.1 Gestión (Dashboard, Origen de Cliente, Reportes, Leads Kanban)
- El usuario puede ver KPIs agregados de conversación/IA en `/` (Dashboard) — `dashboardRoutes` → `DashbardController` (`controllers/DashbardController.ts`). **Criterio de aceptación:** `GET /dashboard` responde 200 con `{totalUsers,activeConversations,totalMessages,aiInteractions,trends,tickets,…}` en <1s para el perfil super-admin (medido en vivo: 363ms; **admin tardó 2.629ms**, ver §6).
- El sistema permite filtrar leads convertidos desde Kanban (`/kanban-lead-conversions`, `module:'facebook_conversions'`, tabla `KanbanLeadConversionEvents`) — `KanbanLeadConversionController.ts`.
- El usuario puede segmentar contactos por "Origen de Cliente" (`/customer-origins`, tabla `CustomerOrigins`) — `CustomerOriginController.ts`.
- **Roto confirmado en vivo:** `GET /dashboard/ticketsUsers` y `/dashboard/ticketsDay` → 500 para los 4 perfiles (`sondas-rbac.md:36`). **Criterio de aceptación (fix):** ambos deben responder 200 con conteos por agente/día antes de considerarse "listo".

### 3.2 Tickets (bandeja omnicanal)
- El usuario puede ver, filtrar, asignar y cerrar tickets de todos los canales en una sola bandeja — `ticketRoutes` → `TicketController.ts`, hooks frontend `useTicketsList/useTicketActions/useTicketFilters/useTicketCounts` (`frontend-inventory.md:85,122`).
- El sistema permite adjuntar notas internas (`TicketNoteController.ts`, tabla `TicketNotes`), etiquetas (`TicketTags`), calificación del cliente al cierre (`UserRatings`), y trazabilidad de SLA (`TicketTrakings`, 6.718 filas).
- El sistema registra cada evento del ciclo de vida del ticket en `LogTickets` (225.613 filas, la tabla más grande del sistema — `db-inventory.md:110,240`).
- **Criterio de aceptación:** `GET /tickets/counts` y `/ticketreport/reports` deben responder 200 (hoy 500 en los 4 perfiles, `sondas-rbac.md:36`) — bloquea cualquier reporte gerencial de tickets.

### 3.3 WhatsApp / Conexiones (Baileys + Cloud API + Coexistencia)
- El usuario puede conectar un número por QR (Baileys) o vía Embedded Signup oficial de Meta (Cloud API), y ver el estado de cada conexión — `/connections`, `WhatsAppModal`/`EmbeddedSignupModal`/`UnifiedConnectionModal` (`frontend-inventory.md:74`); backend `whatsappRoutes`/`whatsappSessionRoutes` → `WhatsAppController.ts` (`routes/whatsappRoutes.ts:4,17-22`).
- El sistema permite decidir dinámicamente qué canal físico usar por ticket (`force_meta`/`force_baileys`/`sticky_inbound`/`auto`) vía `OutboundRoutingService.ts` (`integraciones.md:74`), con failover automático Meta↔Baileys.
- El usuario puede gestionar plantillas de WhatsApp Cloud API (`/whatsapp/templates`) — `WhatsAppTemplateController.ts`.
- **Estado real en vivo:** de 29 conexiones (`Whatsapps`), **22 en `qrcode`, 7 `DISCONNECTED`, 0 `CONNECTED`** (`infra-runtime.md:164-165`) — el módulo core de mensajería está inactivo en este entorno restaurado (por diseño anti-secuestro, no bug).

### 3.4 Contactos (CRM)
- El usuario puede crear/editar/importar (Excel)/exportar contactos, agruparlos en listas (`ContactLists`), asignarles etiquetas (`ContactTags`) y campos personalizados (`ContactCustomFields`) — `contactRoutes` → `ContactController.ts`, `ContactListController.ts`, `ImportPhoneContactsController.ts`.
- El sistema calcula "temperatura" del contacto para scoring de Kanban (`ContactTemperatures`, 116 filas) y guarda memoria semántica IA por contacto (`contact_memory`, pgvector).
- **Riesgo de negocio:** la importación usa `xlsx@0.18.5` con CVE sin parche (`RESUMEN.md:54`, P0-M) — cualquier import masivo de Excel es superficie de ataque hasta migrar la librería.

### 3.5 Mensajes Rápidos (Quick Replies)
- El usuario puede guardar respuestas predefinidas con embeddings para sugerencia semántica — tabla `QuickMessages` (35 filas, columna `intentEmbedding` vector(1536) con índice ivfflat — `db-inventory.md:23,142`), `quickMessageRoutes`.
- **Roto confirmado en vivo:** `GET /quick-messages/list` → 500 en los 4 perfiles (`sondas-rbac.md:36`).

### 3.6 Chats Internos
- El usuario puede chatear con otros agentes de la plataforma (no WhatsApp) — tablas `ChatMessages`/`ChatUsers`/`Chats`, ruta `chatRoutes`, hook `useInternalChatSocket.ts`.

### 3.7 Funnel de Ventas / Kanban / Dashboard Kanban
- El usuario puede mover leads entre etapas arrastrando tarjetas (`@hello-pangea/dnd`) en `/funnel` (`Kanban.tsx`, redirige desde `/kanban`) — el sistema registra cada movimiento en `KanbanMovementLogs` (484 filas) con `fromTagId`/`toTagId`/`userId`.
- El sistema clasifica automáticamente la etapa de un contacto con un worker dedicado (`workers/stageClassifier.worker.ts`, único worker del sistema — `backend-inventory.md:22`).
- **Criterio de aceptación:** un movimiento de tarjeta debe persistir en `KanbanMovementLogs` y reflejarse en tiempo real vía socket (namespace `/{companyId}`) a los demás agentes conectados en <2s [PROPUESTO].

### 3.8 Agendas / Citas (Appointments)
- El usuario puede definir servicios, disponibilidad por agente y reservar/reprogramar citas — 8 páginas dedicadas (`Appointments*`, `frontend-inventory.md:59`), 10 tablas (`appointments`, `appointment_services`, `appointment_availability`, `appointment_blocks`, `appointment_reminders`, `appointment_calendar_sync(s)`, `appointment_analytics`, `appointment_ai_suggestions`, `reminder_templates` — `db-inventory.md:92-93`).
- El sistema permite sincronizar con Google Calendar y Outlook (`CalendarSyncService.ts`, `integraciones.md:142-143`) y sugerir horarios con IA (`appointment_ai_suggestions`).
- El sistema envía recordatorios automáticos vía cola Bull `AppointmentReminder`/`SendAppointmentReminder` (`backend-inventory.md:109`).

### 3.9 Etiquetas (Tags)
- El usuario puede crear etiquetas de color para clasificar tickets/contactos — tabla `Tags` (155 filas, 37 columnas — la tabla con más columnas del CRM, `db-inventory.md:132`), `tagRoutes` → `TagController.ts`.

### 3.10 Comentarios FB/IG (Auto-Responder de comentarios)
- El usuario puede configurar respuestas automáticas a comentarios de Facebook/Instagram y ver la bandeja de comentarios — `/social-comments`, `/comment-autoreply-group` (`AppLayout.tsx:446-461,723-744`); backend `CommentAutoReplyController.ts`, tablas `CommentAutoReplyCampaigns`/`CommentAutoReplyLogs`/`CommentResponseSettings`, `UGCPostComments`.
- **Riesgo de negocio:** el webhook `/webhook/facebook` de comentarios entra **sin ninguna verificación de firma** (`integraciones.md:84,159-161`, P1-2) — cualquiera puede inyectar comentarios falsos que disparan auto-respuesta.

### 3.11 WebChat (widget embebible)
- El usuario puede configurar y embeber un widget de chat público en su sitio web (`/webchat/settings`, `apiKey` por company) y verlo en `/webchat/chats`, `/webchat/analytics`, `/webchat/history` — `WebChatController.ts`, tablas `WebChatWidgets`/`WebChatConversations`/`WebChatConversationMessages`.
- El sistema procesa mensajes públicos sin autenticación por diseño (`POST /webchat/public/message`, `integraciones.md:94`).

### 3.12 Campañas (WhatsApp masivas)
- El usuario puede crear una campaña, seleccionar lista de contactos y plantilla, y lanzarla — `/campaigns`, `/campaigns/contacts`, `/campaigns/settings` (`AppLayout.tsx:532-568`); backend `campaignRoutes` → `CampaignController.ts`, cola Bull `CampaignQueue`, tablas `Campaigns`/`CampaignMessages`/`CampaignShipping(s)`.
- **P0 confirmado en código:** `WhatsAppCampaigns.tsx` usa `fetch()` crudo sin baseURL ni token (5 ocurrencias, `frontend-inventory.md:134-138`) → **el módulo de campañas WhatsApp está roto en producción** (404/401). **Criterio de aceptación (fix):** los 5 `fetch()` deben migrar a `api.get/post` y una campaña de prueba debe completar el ciclo crear→enviar→ver estado.
- **Dato llamativo de negocio:** la tabla `Campaigns` tiene **0 filas** en producción mientras `CampaignMessages` tiene 3.650 (`db-inventory.md:151,283`) — sugiere que el flujo real de envío no pasa por el modelo `Campaigns` esperado, a confirmar con backend-developer.

### 3.13 FlowBuilder (constructor de flujos conversacionales)
- El usuario puede diseñar flujos de bot con nodos (reactflow) — `/flowbuilder/conversation`, `/flowbuilder/campaign` (`AppLayout.tsx:805-826`); backend `FlowBuilderController.ts`, `FlowDefaultController.ts`, `FlowCampaignController.ts`, tablas `FlowBuilders`/`FlowDefaults`/`FlowCampaigns`/`FlowAudios`/`FlowImgs`.
- **Deuda confirmada:** 11 carpetas `FlowBuilder*Modal/` (Audio/Img/List/Pdf/Text/URL/Video/Interval/Menu/Randomizer/SingleBlock) están **vacías** (`frontend-inventory.md:72,176`) — nodos de flujo referenciados en el diseño pero sin implementación de UI; confirmar con producto si son features planeadas o descartadas antes de venderlas.

### 3.14 Créditos IA / Costos IA
- El usuario (según plan) puede ver su saldo/uso de créditos IA — `/ai/credits` (Paquetes), tablas `AICreditBalances`/`AICreditTransactions`/`AICreditTypes`; controlador `AICreditController.ts`.
- El super-admin puede ver rentabilidad y costos globales — `/ai-costs-group`, `roles:['super']` (`AppLayout.tsx:1045-1058`).
- **P1 confirmado en vivo:** `/ai/credits/{balances,quotas,summary,usage}` y `/ai/costs/report` responden 200 a perfiles `user`/`supervisor` (`sondas-rbac.md:26-28`) — fuga de datos financieros a roles operativos, inconsistente con el gate `isSuper` de `/ai-costs/summary`.
- **Roto confirmado en vivo:** `/ai/credits/transactions`, `/ai/credits/analytics` → 500 en los 4 perfiles (`sondas-rbac.md:36`).

### 3.15 Suscripciones / Planes (billing SaaS)
- El super-admin puede definir planes con `interfacePermissions` (features por plan) — `/plans`, `PlanController.ts`, tabla `Plans`.
- El usuario/company puede pagar/renovar su plan vía Stripe, PayPal, Gerencianet/PIX o Coingate (créditos IA) — `subScriptionRoutes` → `SubscriptionController.ts` (1.594 líneas, `deuda-arquitectura.md:235`).
- **P0 de negocio (no explotable hoy vía padeldev, sí en código):** el webhook de Stripe procesa el evento **sin validar la firma** si falta el header `stripe-signature` o `STRIPE_WEBHOOK_SECRET` (`SubscriptionController.ts:718-820`, `RESUMEN.md:45` P0-D); el de PayPal **no valida firma en absoluto** (`PaypalController.ts:160-295`, `RESUMEN.md:46` P0-E). **Criterio de aceptación (fix):** ningún webhook de pago debe activar un plan/crédito sin verificación criptográfica de origen.

### 3.16 Afiliados / Partners
- El usuario (afiliado) puede generar links de referido y ver comisiones/retiros — `/affiliates`, `/affiliates/programs` (`roles:['super']` para dashboard/programas), `/affiliates/referrals`, `/affiliates/links`, `/affiliates/wallet` (`AppLayout.tsx:844-880`); tablas `AffiliateLinks`/`AffiliateTiers`/`AffiliateTransactions`/`AffiliateWallets`/`AffiliateWithdrawals`, controlador `AffiliateController.ts`.
- Existe un módulo paralelo de "Afiliados IA" (`/ai/affiliates`, `AIAffiliateController.ts`, tablas `AIAffiliatePrograms`/`AIAffiliateReferrals`) — **dos sistemas de afiliados coexistiendo** (uno de plataforma, uno de IA); confirmar con negocio si es intencional o duplicación a consolidar.

### 3.17 Email Marketing
- El usuario puede crear campañas de email, plantillas y automatizaciones, y ver analíticas de apertura/click — `/email-marketing*` (6 sub-páginas, `AppLayout.tsx:667-720`); backend con Factory de proveedores (Listmonk/SendGrid/Mailgun/SES/Acelle/Carbonio — `integraciones.md:132`), tablas `email_campaigns`/`email_campaign_recipients`/`email_templates`/`email_tracking_events`/`email_automations`/`email_ab_tests`.
- **Riesgo de negocio:** los providers SendGrid/AmazonSES/Carbonio son **stubs** según heurística de código (`backend-inventory.md:173`, P3-3) — verificar cuáles canales están realmente operativos antes de venderlos comercialmente.

### 3.18 UGC & Contenido (generación IA para redes)
- El usuario puede generar imágenes/videos/audio con IA (fal.ai — Kling, Veo, Nano Banana; Higgsfield; ComfyUI self-hosted) para campañas de contenido — `/ugc/dashboard`, `/ugc/generate` (Cinema Studio), `/ugc/video-studio`, `/ugc/campaigns` (12 páginas, `frontend-inventory.md:56`).
- El sistema permite asignar "creadores" (identidades sintéticas / device farm) a campañas UGC — tablas `AgentIdentities`/`AgentDevices`/`AgentMemories`, controladores `AgentIdentityController.ts`/`AgentDeviceController.ts`/`UGCCreatorController.ts`.
- El webhook de fal.ai es el **único** con verificación robusta (JWKS Ed25519 + anti-replay, `integraciones.md:90,114`) — referencia positiva a replicar en los demás.

### 3.19 Marketing (Meta Ads / Atribución / Facebook Conversions)
- El usuario puede ver insights de campañas, atribución multi-touch y auditoría de campañas — `/campaigns/insights`, `/campaigns/attribution`, `/campaigns/audit`, `/facebook-conversions` (`AppLayout.tsx:633-663`); tablas `AttributionChannelAggregates`/`AttributionConversions`/`AttributionTouchpoints`, `FacebookConversionEvents` (2.236 filas), `meta-marketing/src/` (micro-módulo de Ads, 8 archivos).

### 3.20 Super-admin (Sistema)
- El super-admin puede ver todas las companies, planes, consumo de tokens IA por tenant, y gestionar términos y condiciones — `/companies`, `/plans`, `/admin/ai-token-usage`, `/terms` (`AppLayout.tsx:1105-1138`, todos `roles:['super']`).
- **P0 confirmado EN VIVO (sonda):** `GET /companies` con token de perfil `user` (companyId 6) devuelve **las 15 companies** con `facebookAppSecret`/`stripeSecretKey`/`paypalSecretKey`/`paypalClientId` de TODOS los tenants (`sondas-rbac.md:48-52`, `RESUMEN.md:42` P0-A) — el endpoint solo tiene `isAuth`, no `isSuper` (`routes/companyRoutes.ts:8`). **Criterio de aceptación (fix):** `GET /companies` debe requerir `isSuper` y excluir columnas `*SecretKey`/`*Secret` del payload SIEMPRE, incluso para super-admin salvo pantalla explícita de gestión de credenciales.
- **P0 confirmado EN VIVO (sonda):** `GET /settingsFacebook` devuelve el `facebookAppSecret` real (32 chars) a cualquier `user` autenticado (`sondas-rbac.md:54-57`, `RESUMEN.md:43` P0-B).

---

## 4. Flujos de usuario (los 5 más importantes)

### 4.1 Recibir y responder un mensaje de WhatsApp
**Happy path:** cliente escribe por WhatsApp → Baileys (`services/WbotServices/wbotMessageListener.ts`,
7.501 líneas, el archivo más grande del backend — `deuda-arquitectura.md:35,68`) o Cloud API recibe el
evento → se crea/actualiza `Ticket` + `Message` → Socket.IO emite al namespace `/{companyId}` → el agente ve
el mensaje en `/tickets` en tiempo real → responde desde la UI → `OutboundDispatchService` decide el canal
físico (Coexistencia) → se envía y se registra `ACK`.
**Ramas de error:**
- *Sin conexión activa:* si las 29 conexiones están en `qrcode`/`DISCONNECTED` (estado real hoy,
  `infra-runtime.md:164-165`), el mensaje entrante nunca llega — no hay canal para probar el flujo hasta
  reconectar al menos una sesión.
- *Sin permisos:* un `user` sin la cola (`Queue`) asignada no debería ver el ticket — depende de que el
  query de listado filtre por `UserQueues`; no se auditó a nivel de código en esta ronda (fuera de alcance
  de Fase 1, se recomienda para Fase de pruebas).
- *Canal caído (Meta sin token / Baileys desconectado):* `OutboundRoutingService` hace failover automático
  al canal alterno (`integraciones.md:74`); si ambos fallan, el mensaje debe quedar en `OutboundDispatches`
  con estado de error para reintento (no se verificó el criterio de reintento exacto — pendiente Fase 2).

### 4.2 Crear y asignar un ticket
**Happy path:** un mensaje entrante sin ticket abierto dispara `FindOrCreateTicketService` (ciclo de
dependencia con `UpdateTicketService`, `deuda-arquitectura.md:113-114`) → se crea el `Ticket` con `queueId`
según reglas del bot/IVR (`QueueOptions`) → un admin/supervisor lo asigna a un `userId` desde la UI (drag
en Kanban de tickets o botón "Asignar") → `TicketTrakings` registra el evento con timestamp para SLA.
**Ramas de error:**
- *Sin colas configuradas:* si la company no tiene `Queues`/`QueueOptions`, el ticket queda sin `queueId`
  y no aparece en los filtros por cola de los agentes.
- *Reporte roto:* `GET /tickets/counts` y `/dashboard/ticketsUsers` (conteo de tickets por agente) están
  en **500 confirmado en los 4 perfiles** (`sondas-rbac.md:36`) — hoy es imposible ver cuántos tickets
  tiene asignados cada agente desde el dashboard.
- *Permisos:* asignar un ticket a un usuario de otra company debería fallar por scope de `companyId`; no
  se probó explícitamente en esta ronda (la sonda RBAC confirma que `/users` sí está bien scopeado por
  company — `sondas-rbac.md:43`).

### 4.3 Mover un lead en el Kanban (Funnel de Ventas)
**Happy path:** el agente abre `/funnel`, arrastra la tarjeta de un contacto/ticket de una etapa (`Tag`) a
otra → `@hello-pangea/dnd` dispara el evento → se llama al endpoint de movimiento → se inserta un registro
en `KanbanMovementLogs` (`fromTagId`,`toTagId`,`userId`) → Socket.IO notifica a los demás agentes.
**Ramas de error:**
- *Sin datos:* si la company no tiene `Tags` configurados como etapas, el tablero aparece vacío — no hay
  seed/onboarding de etapas por defecto verificado en código en esta ronda.
- *Concurrencia:* dos agentes moviendo la misma tarjeta a la vez — no se identificó un lock optimista en
  el modelo `KanbanMovementLogs`; riesgo de condición de carrera a validar en Fase 2 (plan).
- *Sin permisos:* el módulo está gateado por plan (`module:'kanban'`), no por rol — un `user` sin ese
  feature en su plan ve `AccessDenied` (`ProtectedRoute.tsx:29-64`).

### 4.4 Lanzar una campaña de WhatsApp
**Happy path (según diseño):** el usuario crea una lista de contactos, selecciona plantilla aprobada,
configura la campaña en `/campaigns` → el backend la encola en `CampaignQueue` (Bull) → el worker
(`worker.ts`) la procesa y despacha mensajes de forma escalonada (evitar baneo) → progreso visible en
`/campaigns` con conteos de `CampaignMessages` (enviado/entregado/leído/fallido).
**Ramas de error (confirmadas, no hipotéticas):**
- **P0 — el flujo está roto en producción:** `WhatsAppCampaigns.tsx` llama `fetch('/campaigns')` sin
  `baseURL` ni `Authorization` (`frontend-inventory.md:134-138`) → el usuario ve un error genérico
  (`Unexpected token '<'`) al intentar listar/crear campañas vía ese componente.
- **P0 operativo — worker de colas caído:** `chateam-worker` está `stopped` (`infra-runtime.md:145-149`);
  aunque el frontend funcionara, ninguna campaña encolada se procesaría hasta reparar el worker
  (`require()` de ESM roto en `queues.ts:434`).
- *Sin conexión WhatsApp activa:* 0 conexiones `CONNECTED` hoy — no hay canal físico de salida.

### 4.5 Agendar una cita
**Happy path:** el agente o el propio contacto (vía flujo IA/bot) elige un servicio (`appointment_services`)
y un horario disponible (`appointment_availability`) → se crea `appointments` con `ticketId`/`contactId` →
se agenda un recordatorio (`appointment_reminders`, cola `AppointmentReminder`) → opcionalmente se
sincroniza con Google Calendar/Outlook (`CalendarSyncService.ts`).
**Ramas de error:**
- *Sin disponibilidad configurada:* `appointment_availability` tiene solo 143 filas en producción
  (`db-inventory.md:133`) — si un agente/servicio no tiene bloques definidos, no hay horarios que ofrecer.
- *Conflicto de horario:* `appointments.rescheduledFrom/To` (self-FK) sugiere manejo de reprogramación,
  pero no se verificó en código si hay validación de solapamiento de horarios (doble-booking) — pendiente
  Fase 2.
- *Recordatorio no enviado:* si el worker de colas está caído (ver 4.4), `SendAppointmentReminder` no se
  procesa — la cita queda sin recordatorio automático.

---

## 5. Arquitectura

### 5.1 Entry point canónico — DEUDA CONFIRMADA (3 candidatos, sin uno "oficial" único)

| Candidato | Declarado en | Uso real |
|---|---|---|
| `server-simple.ts` | `package.json:6` `"main": "dist/server-simple.js"`, `npm start` → `tsx server-simple.ts` (`package.json:12-13`) | **Mono-proceso**: abre sesiones WhatsApp de TODAS las companies + colas + cron en un solo proceso (`backend-inventory.md:36`). Es el que `npm start`/`main` consideran "el" entrypoint. |
| `server-distributed.ts` | `chateam.config.cjs` (perfil PM2 **activo hoy**, `infra-runtime.md:22`: `node --import tsx/esm server-distributed.ts`) | **Es el que REALMENTE corre en producción** (`pm2 list` id 10, `chateam-node`, online). Multi-nodo (`NODE_ID`, `MAX_SESSIONS=60`), solo `node-1` corre colas/cron. |
| `server.ts` | Wrapper legacy de 1.4KB (`backend-inventory.md:38`) | Redundante, sin uso confirmado. |

**Conclusión (deuda de arquitectura, no ambigüedad de negocio):** el `package.json` dice que el entrypoint
es `server-simple.ts` pero PM2 en producción corre `server-distributed.ts` vía una config paralela
(`chateam.config.cjs`, perfil "lean" 1-nodo distinto del `ecosystem.config.cjs` original de 2 nodos —
`infra-runtime.md:119-135`). Esto es **D-P0/P1 de facto**: cualquier operador que lea `package.json`/`npm
start` desplegaría el entrypoint equivocado (mono-proceso, sin sharding de sesiones) frente al que realmente
está en producción. **Recomendación para Fase 2 (plan):** declarar `server-distributed.ts` como único
entrypoint soportado en `package.json` (`main`+`start`), borrar `server.ts` y `server-simple.ts` (o
degradarlo a modo "dev/single-tenant" documentado explícitamente), y canonizar `chateam.config.cjs` como el
único ecosystem PM2 (renombrar `ecosystem.config.cjs` a `.example`, `deuda-arquitectura.md:196-197,251`).

### 5.2 Diagrama de componentes (textual, confirmado contra el sistema vivo)

```
INTERNET
   │  https://padeldev.codigo.plus
   ▼
Router/NAT (port-forward :443)
   ▼
nginx :443 (TLS, Let's Encrypt) — /etc/nginx/server.d/padeldev.codigo.plus.conf
   ├─ location /            → frontend/dist (SPA React/Vite estática, try_files → index.html)
   ├─ location /be/         → proxy_pass http://127.0.0.1:3010/  (strippea /be)
   └─ location /socket.io/  → proxy_pass http://127.0.0.1:3010   (WS upgrade, timeout 3600s)
                                        │
                          chateam-node (PM2 fork, tsx/esm, *:3010)
                          server-distributed.ts · heap 2GB · Express 4 + Sequelize + Socket.IO
                                        │
                     ┌──────────────────┼───────────────────┐
                     ▼                  ▼                   ▼
        127.0.0.1:5434 (Docker)   127.0.0.1:6390 (Docker)   Integraciones externas
        chateam-postgres pg17     chateam-redis 7           (Meta/WhatsApp Cloud API,
        + pgvector, 187 tablas    Bull queues + adapter      Stripe/PayPal/Gerencianet/
        344 MB, 670 índices       Socket.IO                  Coingate, fal.ai/Higgsfield/
                                                              ComfyUI, SendGrid/Listmonk/SES,
                                                              Google Calendar/Drive, S3/MinIO,
                                                              Telegram, TikTok)

        [chateam-worker] — proceso PM2 separado (worker.ts) — HOY STOPPED
        Debería consumir ~34 colas Bull (CampaignQueue, EmailSend, FacebookConversionQueue,
        UGCVideoGeneration, AppointmentReminder, MessageQueue, NotificationQueue, ...)
```

Fuente del diagrama: `AUDITORIA_2026_07/07-infra-runtime/infra-runtime.md:75-109` (verificado en vivo con
`pm2 list`, `docker ps`, `ss -ltnp`, `curl /health`).

### 5.3 Variables de entorno — superficie de configuración

El inventario de integraciones extrajo **192 variables `process.env.X` únicas** referenciadas en el código
(`grep -oE "process\.env\.[A-Z_0-9]+" -r services controllers routes config helpers libs app.ts`,
`integraciones.md:36,229`), agrupadas por integración: Meta/WhatsApp (~15), Facebook/Conversions (~8),
TikTok (4), IA/UGC — fal.ai (16) + Higgsfield (12) + ComfyUI (5) + OpenAI/Anthropic (2), Pagos — Stripe (5) +
PayPal (2) + Gerencianet (4) + Coingate (2), Almacenamiento S3/MinIO (5), Google/Microsoft (4), Email —
Listmonk (9) + SMTP (6), Sentry (1), infraestructura transversal `BACKEND_URL`/`FRONTEND_URL` +
`INTEGRATION_ENCRYPTION_KEY`, más las de auth (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `MASTER_KEY` —
`config/auth.ts`, `06-seguridad/seguridad.md:12,46-47`) y DB/Redis. El acceso directo a `.env`/`.env.example`
está bloqueado por guardrail del entorno de auditoría, por lo que el conteo es por referencia en código, no
por archivo `.env` real — **el número exacto de variables configuradas en producción puede diferir** (rango
esperado 90-200 según cobertura real vs. dead code). **[PROPUESTO]** Fase 2 (plan) debería generar un
`.env.example` completo y canónico a partir de este grep como entregable de higiene de configuración.

### 5.4 Deuda arquitectónica relevante para "el qué" (resumen, detalle en `14-deuda-tecnica-arquitectura`)
- **154 dependencias circulares** en el grafo backend (105 entre modelos Sequelize — patrón benigno de
  `sequelize-typescript`; 49 de lógica de negocio — deuda real que dificulta testear módulos aislados),
  concentradas en `wbotMessageListener.ts` (7.501 líneas, hub de 40+ ciclos) — `deuda-arquitectura.md:29-70`.
- **Envelope de respuesta HTTP inconsistente**: 75 archivos `{success,message,data}`, 85 `res.json(x)`
  plano, `{error,message}` en el handler global — el frontend debe manejar 3 formas distintas
  (`backend-inventory.md:128,159`). Relevante para "el qué" porque cualquier especificación de API nueva
  (Fase 2) debe declarar explícitamente qué envelope usa.
- **Multi-tenant por columna, sin defensa en profundidad**: 157/187 tablas tienen `companyId`, pero el
  aislamiento depende 100% de que cada query lo filtre (`tenantMiddleware` solo montado en 2 rutas de 129).
  Confirmado en vivo con la fuga de `/companies` (§3.20). Esto es un requisito no funcional de seguridad
  transversal a TODOS los módulos de §3, no solo del módulo Super-admin.

---

## 6. Requisitos No Funcionales (RNF)

**Nota de método:** esta sesión de Fase 1 fue de solo lectura de código y reutilización de sondas GET ya
ejecutadas por el equipo de auditoría (`AUDITORIA_2026_07/08-sondas-runtime/resultados.json`, capturadas
2026-07-12). No se generó tráfico nuevo contra `padeldev.codigo.plus` en esta sesión (sin herramienta de
shell/curl disponible en este contexto) — las métricas de tiempo de respuesta abajo son las **ya medidas**
por `probe.mjs` en la Fase 0/Auditoría, no una repetición. Las cifras del brief de negocio (~20.8 días de
tiempo de respuesta, 117 tickets sin asignar, satisfacción 0%, mencionadas en `00-baseline.md:55`) **no se
pudieron corroborar en esta sesión** porque `GET /dashboard` devuelve un objeto agregado
(`{totalUsers,activeConversations,totalMessages,aiInteractions,trends,tickets,…}`) cuyo contenido numérico
no quedó capturado en `resultados.json` (solo la "shape", no los valores — `resultados.json:707-727`) y los
endpoints de detalle de tickets (`/tickets/counts`, `/dashboard/ticketsUsers`, `/dashboard/ticketsDay`) están
**rotos (500)**. **[PENDIENTE]** re-ejecutar `probe.mjs` (o una variante) capturando el body completo de
`GET /dashboard` para validar esas 3 cifras del brief antes de fijarlas como línea base contractual.

| Categoría | Métrica | Valor observado (evidencia) | Meta objetivo | Estado |
|---|---|---|---|---|
| Rendimiento — Dashboard | Tiempo de respuesta `GET /dashboard` | super-admin 363ms · admin **2.629ms** · supervisor 392ms · user 706ms (`resultados.json:707-727`) | **[PROPUESTO] p95 < 800ms** para cualquier perfil/company | admin excede 3x la meta propuesta hoy |
| Rendimiento — listados grandes | `GET /dashboard/moments` (feed de eventos) | admin (2.046 tickets) → **8.067ms** (`resultados.json:779-793`) | **[PROPUESTO] p95 < 1.500ms** con paginación obligatoria (hoy trae el array completo) | Incumple; requiere paginación/límite server-side |
| Disponibilidad de endpoints | Handlers GET siempre-500 | **13 endpoints** (`/tickets/counts`, `/ticketreport/reports`, `/contacts/list-whatsapp`, `/dashboard/ticketsUsers`, `/dashboard/ticketsDay`, `/campaigns/list`, `/quick-messages/list`, `/announcements/list`, `/invoices/list`, `/ai/credits/transactions`, `/ai/credits/analytics`, `/ai/agents/metrics`, `/settings/terms/stats`) — `sondas-rbac.md:35-36` | **[PROPUESTO] 0 endpoints en 500** antes de cualquier release comercial; SLA de error rate < 0.1% en producción | 13/79 endpoints sondados (16%) rotos hoy |
| Disponibilidad — plataforma | Backend nodo único (SPOF) | `chateam-node` = 1 sola instancia; worker de colas `stopped` (`infra-runtime.md:22,141-149`) | **[PROPUESTO] 99.5% uptime mensual** (≈3.6h/mes de downtime tolerado) mientras se justifique costo de HA; **[SUPUESTO]** requiere decidir con JC si el negocio necesita 99.9%+ | No medible hoy (sin monitoreo de uptime); worker caído = 0% de colas asíncronas procesadas |
| Capacidad / recursos | RAM/swap del host | 15 Gi total, 14 Gi usados, **swap 9.7 Gi al 100%**, load avg 34.5 (`infra-runtime.md:151-153`) | **[PROPUESTO]** swap < 80% sostenido; RAM libre > 2 Gi | Host al borde de OOM-killer hoy (afecta a chateam Y a otros proyectos co-residentes) |
| Seguridad — secretos en reposo | Columnas de secretos de terceros sin cifrar | `Companies.stripeSecretKey/paypalSecretKey/facebookAppSecret`, `Whatsapps.tokenMeta/facebookUserToken/pageAccessToken`, `AIProviderConfigs.apiKey` — 100% en claro salvo `IntegrationConnection` (AES-256-CBC) (`db-inventory.md:228-238`, `seguridad.md:56-57`) | **[PROPUESTO]** 100% de columnas de credenciales de terceros cifradas en reposo (AES-256-GCM) antes de operar con claves `live` | 0% cifrado hoy fuera de `IntegrationServices` |
| Seguridad — autenticación | Rate limiting en login/signup | `authLimiter`/`signupLimiter` definidos, **0 montados** en `/api/auth/*` (`seguridad.md:18,49-50`) | **[PROPUESTO]** máx. 5 intentos/15min por IP+email en login; 3/hora en signup (ya definidos en código, solo falta montar) | No aplicado |
| Seguridad — RBAC | Fuga cross-tenant confirmada en vivo | `GET /companies` expone 15 companies con secretos a perfil `user`; `GET /settingsFacebook` expone secreto FB a `user` (`sondas-rbac.md:48-57`) | **[PROPUESTO] 0 fugas cross-tenant** verificadas por suite de sondas automatizada (79+ endpoints × 4 perfiles) en cada release | 2 fugas P0 confirmadas hoy en producción |
| Seguridad — contraseñas | Costo de hash bcrypt | `hash(password, 8)` (`models/User.ts:141`, `seguridad.md:71-72`) | **[PROPUESTO] cost ≥ 12** (estándar OWASP 2026) | Por debajo del estándar recomendado |
| Escalabilidad — tenants | Companies activas hoy | 15 companies, mayor tenant (Smarttrack, id6) con 2.714 tickets (`db-inventory.md:212-222`) | **[SUPUESTO — confirmar con JC]** meta de tenants objetivo a 12 meses (ej. 100? 500?) para dimensionar RAM/DB/particionado | Sin meta de negocio declarada en código |
| Escalabilidad — mensajería | Sesiones WhatsApp concurrentes | `MAX_SESSIONS=60` por nodo en `server-distributed.ts` (`backend-inventory.md:37`); 29 conexiones registradas hoy, 0 `CONNECTED` | **[PROPUESTO]** validar el límite real de sesiones Baileys concurrentes por nodo con prueba de carga antes de vender >30 conexiones activas por tenant grande | No probado bajo carga en esta auditoría |
| Escalabilidad — datos | Tablas de alto crecimiento sin retención | `LogTickets` (225.613 filas, +20MB), `InboundEventLedger` (77.310 filas, 43MB) sin partición/TTL (`db-inventory.md:259-260`) | **[PROPUESTO]** política de retención (ej. 90-180 días) + particionado antes de 12 meses de operación continua | Sin política definida |
| i18n | Soporte multi-idioma | `i18next` configurado en deps pero **0 páginas** usan `useTranslation` (`frontend-inventory.md:185-186`); toda la UI en español hardcodeado | **[SUPUESTO — confirmar con JC]** si el negocio requiere inglés/portugués (dado el legado Gerencianet/PIX de Brasil) para vender fuera de Ecuador | Sin i18n funcional hoy pese a la dependencia instalada |
| Compliance — PII/RGPD | Datos personales en claro sin política de retención/borrado | `Contacts` (11.406 filas: nombre, teléfono, foto), `Messages` (79.025 filas, cuerpo de conversaciones), sin evidencia de endpoint de "derecho al olvido" o exportación de datos personales en el código auditado | **[SUPUESTO — confirmar con JC]** si aplica LOPDP (Ecuador) o RGPD (si hay clientes UE); de ser así, definir proceso de borrado/exportación por contacto y política de retención de `Messages`/`LogTickets` | No evaluado en profundidad (fuera del alcance de esta ronda de solo-lectura de código; requiere revisión legal) |
| Observabilidad | Cobertura de métricas/tracing | `prom-client`, Sentry, pino/winston presentes pero "mayormente desconectados" (`00-baseline.md:26`); healthcheck de contenedores `health=none` (`infra-runtime.md:35-36,155-158`) | **[PROPUESTO]** `/health` consumido por un probe externo (cron/systemd timer) + dashboards de error-rate/latencia por endpoint antes de cualquier SLA comercial | Sin monitoreo activo confirmado hoy |

---

## Resumen de pendientes explícitos para JC (no bloquean, refinan Fase 2)

1. **[SUPUESTO §1]** Segmento de mercado, tamaño de cliente objetivo y modelo de pricing exacto (más allá
   de "plan demo" observado en código).
2. **[SUPUESTO §2]** Si se requiere un 5º rol o el modelo actual (super/admin/supervisor/user + permisos
   por plan) es suficiente para el roadmap comercial.
3. **[SUPUESTO §3.13]** Si los 11 nodos de FlowBuilder sin implementar (Audio/Img/List/Pdf/Text/URL/Video/
   Interval/Menu/Randomizer/SingleBlock) son features planeadas a completar o descartadas.
4. **[SUPUESTO §3.16]** Si el doble sistema de afiliados (plataforma vs. IA) es intencional.
5. **[SUPUESTO §3.17]** Qué proveedores de Email Marketing están realmente operativos (varios son stub).
6. **[PROPUESTO §6]** Validar/ajustar cada meta numérica de RNF con el negocio antes de convertirla en
   compromiso contractual (SLA de uptime, p95 de latencia, retención de datos, costo bcrypt, meta de tenants).
7. **[PENDIENTE §6]** Re-ejecutar una sonda GET autenticada contra `/dashboard` capturando el body completo
   para confirmar o descartar las cifras del brief (~20.8 días de respuesta, 117 tickets sin asignar,
   satisfacción 0%) — no se pudo hacer en esta sesión por falta de herramienta de red/shell autenticada.
8. **[SUPUESTO §6]** Alcance real de compliance (LOPDP Ecuador / RGPD si hay clientes UE) — requiere
   revisión legal, no solo técnica.
