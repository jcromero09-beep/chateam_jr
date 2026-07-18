# ChatEAM JR v6.0.0 — Análisis Completo del Sistema

> **Fecha de generación:** 2 de Marzo de 2026
> **Plataforma:** CRM Omnicanal — Comunicación Empresarial
> **Estado:** Producción Activa
> **Última actualización:** 02-Mar-2026 — Módulos Email Marketing, Afiliados, reestructuración UI, corrección TS integral
> **URLs:** Backend `https://appro.chateam.ws` | Frontend `https://chat.chateam.ws`

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Arquitectura General](#3-arquitectura-general)
4. [Módulos del Backend](#4-módulos-del-backend)
   - 4.1 [Controllers (113)](#41-controllers-113-archivos)
   - 4.2 [Services (109 directorios)](#42-services-109-directorios)
   - 4.3 [Models (173)](#43-models-173-archivos)
   - 4.4 [Routes (106)](#44-routes-106-archivos)
   - 4.5 [Jobs (28)](#45-jobs-28-archivos)
   - 4.6 [Middleware (10)](#46-middleware-10-archivos)
   - 4.7 [Helpers (36)](#47-helpers-36-archivos)
   - 4.8 [Config (15)](#48-config-15-archivos)
   - 4.9 [Utils (12)](#49-utils-12-archivos)
   - 4.10 [Workers (2)](#410-workers)
   - 4.11 [Database Migrations (317)](#411-database-migrations-317)
5. [Frontend (React/Vite)](#5-frontend-reactvite)
   - 5.1 [Información General](#51-información-general)
   - 5.2 [Páginas (148)](#52-páginas-148)
   - 5.3 [Componentes (52)](#53-componentes-52)
   - 5.4 [Hooks Personalizados (11)](#54-hooks-personalizados-11)
   - 5.5 [Context & State](#55-context--state-management)
   - 5.6 [Services API (10)](#56-services-api-10-módulos)
   - 5.7 [Sistema de Permisos](#57-sistema-de-permisos-rbac)
   - 5.8 [Temas y Estilos](#58-temas-y-estilos)
6. [Integraciones](#6-integraciones)
   - 6.1 [WhatsApp (Baileys + Cloud API)](#61-whatsapp-baileys--cloud-api)
   - 6.2 [Facebook/Instagram](#62-facebookinstagram)
   - 6.3 [Telegram](#63-telegram)
   - 6.4 [WebChat Embebible](#64-webchat-embebible)
   - 6.5 [Email Marketing](#65-email-marketing)
7. [Sistema de Colas (Bull + Redis)](#7-sistema-de-colas-bull--redis)
8. [Cron Jobs](#8-cron-jobs)
9. [WebSocket & Socket.IO](#9-websocket--socketio)
10. [Inteligencia Artificial](#10-inteligencia-artificial)
11. [Sistema de Pagos](#11-sistema-de-pagos)
12. [Docker & DevOps](#12-docker--devops)
13. [Monitoreo & Observabilidad](#13-monitoreo--observabilidad)
14. [Seguridad & Autenticación](#14-seguridad--autenticación)
15. [Estadísticas del Proyecto](#15-estadísticas-del-proyecto)
16. [Changelog — Sesión 02-Mar-2026](#16-changelog--sesión-02-mar-2026)
   - 16.1 [Módulo Email Marketing (4 Fases)](#161-módulo-email-marketing--4-fases)
   - 16.2 [Módulo Afiliados Independiente](#162-módulo-afiliados--independizado)
   - 16.3 [Reestructuración Sidebar](#163-reestructuración-del-sidebar)
   - 16.4 [Corrección Integral TypeScript (26→0)](#164-corrección-integral-typescript--260)

---

## 1. Resumen Ejecutivo

**ChatEAM JR** es una plataforma CRM omnicanal de clase empresarial que centraliza la comunicación a través de múltiples canales (WhatsApp, Facebook, Instagram, Telegram, WebChat, Email) en una sola interfaz.

### Capacidades Principales

| Capacidad | Descripción |
|-----------|-------------|
| **Mensajería Omnicanal** | WhatsApp, Facebook, Instagram, Telegram, WebChat, Email |
| **CRM de Contactos** | Gestión completa, lead scoring, segmentación, importación masiva |
| **Tickets & Soporte** | Sistema de tickets con Kanban, asignación automática, SLAs |
| **Campañas de Marketing** | Campañas masivas con reglas, alertas, analytics, atribución |
| **FlowBuilder Visual** | Editor visual de flujos de conversación con ReactFlow |
| **Inteligencia Artificial** | Chatbot IA, generación de imágenes/videos, análisis de campañas |
| **Citas & Reservas** | Sistema completo de agendamiento con recordatorios |
| **Facturación** | Planes, suscripciones, PayPal, Stripe, facturas automáticas |
| **Multi-tenancy** | Aislamiento completo por empresa (companyId) |
| **Monitoreo** | Prometheus, Grafana, AlertManager, health checks |

---

## 2. Stack Tecnológico

### Backend

| Componente | Tecnología | Versión |
|-----------|-----------|---------|
| Runtime | Node.js | ≥ 20.0.0 |
| Lenguaje | TypeScript | 5.5.4 |
| Framework | Express | 4.19.2 |
| ORM | Sequelize + sequelize-typescript | 6.37.3 / 2.1.6 |
| BD Principal | PostgreSQL | 15 |
| Cache/Queues | Redis | 7 |
| Task Queues | Bull | 4.12.2 |
| WebSocket | Socket.IO | 4.7.4 |
| Auth | JWT (jsonwebtoken) | 9.0.2 |
| Storage | MinIO (S3 compatible) | — |
| Logging | Winston + Pino | 3.11.0 / 10.0.0 |
| Cron | node-cron | 4.2.1 |
| PM2 | Process Manager | — |

### Frontend

| Componente | Tecnología | Versión |
|-----------|-----------|---------|
| Framework | React | 18.3.1 |
| Lenguaje | TypeScript | 5.9.3 |
| Build Tool | Vite | 7.1.9 |
| UI Library | Material-UI Joy + MUI Core | 5.0.0-beta / 4.12.4 |
| Router | React Router DOM | 7.9.4 |
| HTTP Client | Axios | 1.12.2 |
| WebSocket | Socket.IO Client | 4.8.1 |
| Forms | Formik + Yup | 2.4.9 / 1.7.1 |
| Charts | Recharts + Chart.js | 3.2.1 / 4.5.1 |
| Flow Editor | ReactFlow | 11.11.4 |
| i18n | i18next | 25.7.4 |
| Payments | PayPal React | 8.9.2 |

### WhatsApp

| Componente | Tecnología | Estado |
|-----------|-----------|--------|
| Baileys (no oficial) | @whiskeysockets/baileys | ✅ ACTIVO |
| Cloud API (oficial Meta) | Graph API v24.0 | ⏸️ CONSTRUIDO, DESHABILITADO |
| Servicio Híbrido | Arquitectura dual | ⏸️ PREPARADO |

### IA & ML

| Componente | Tecnología | Uso |
|-----------|-----------|-----|
| OpenAI | openai 4.56.0 | Chatbot, análisis, generación |
| Dialogflow | Google Cloud | NLP alternativo |
| ChromaDB | Vector DB | Embeddings |
| Azure Speech | Microsoft SDK | TTS/STT |
| FFmpeg | fluent-ffmpeg | Procesamiento video |

### Pagos

| Componente | Tecnología |
|-----------|-----------|
| Stripe | stripe 14.14.0 |
| PayPal | @paypal/checkout-server-sdk 1.0.3 |
| Gerencianet | SDK Brasil |

---

## 3. Arquitectura General

```
┌─────────────────────────────────────────────────────────────────┐
│                        NGINX (Load Balancer)                     │
│  Rate Limiting: 10r/s API, 2r/s uploads | SSL Termination        │
├──────────────┬────────────────┬───────────────────────────────────┤
│              │                │                                   │
│   Frontend   │    Backend     │         Audit Service             │
│   (React)    │   (Express)    │        (Microservicio)            │
│   Vite v7    │  3 replicas    │        2 replicas                 │
│   Port 3000  │  Port 4000     │        Port 8080                  │
│              │                │                                   │
│  ┌─────────┐ │  ┌──────────┐  │  ┌────────────┐                  │
│  │Socket.IO│←┼─→│Socket.IO │  │  │ OpenAI API │                  │
│  │ Client  │ │  │ Server   │  │  │ Campaign   │                  │
│  └─────────┘ │  └──────────┘  │  │ Analysis   │                  │
│              │                │  └────────────┘                  │
├──────────────┴────────────────┴───────────────────────────────────┤
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │PostgreSQL│  │  Redis 7 │  │  MinIO   │  │    Worker        │  │
│  │   15     │  │ Port 5000│  │  (S3)    │  │  (Bull Jobs)     │  │
│  │ Port 5432│  │  Cache   │  │Port 9000 │  │  2 replicas      │  │
│  │          │  │  Queues  │  │          │  │                  │  │
│  │ 500 pool │  │  Rate    │  │          │  │  Campaigns       │  │
│  │  max     │  │  Limit   │  │          │  │  Imports/Exports │  │
│  └──────────┘  └──────────┘  └──────────┘  │  FB Conversions  │  │
│                                             │  Video Gen       │  │
│                                             └──────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │              WhatsApp Engine (Baileys)                        │ │
│  │  Sessions → Redis Cache → Message Queue → Socket.IO Events   │ │
│  │  Anti-Ban: Rate Limit + Typing Simulation + Delays           │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │              Monitoring Stack                                 │ │
│  │  Prometheus → AlertManager → Grafana                          │ │
│  │  + Node Exporter + Redis Exporter + Postgres Exporter         │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

### Separación de Responsabilidades

| Proceso | Responsabilidades |
|---------|-------------------|
| **Backend (server-simple.ts)** | API REST, Socket.IO, WhatsApp Baileys, Cron Jobs, MessageQueue, NotificationQueue |
| **Worker (worker.ts)** | Bull jobs independientes: Campañas, Imports/Exports, FB Conversions, Video Gen |
| **Audit Service** | Análisis IA de campañas, generación de reportes, canvas/PDF |
| **Scheduler** | Cron jobs adicionales, auditorías automáticas |
| **NGINX** | Load balancing, rate limiting, SSL/TLS, proxy inverso |

---

## 4. Módulos del Backend

### 4.1 Controllers (79 archivos)

#### Chat & Mensajería

| Controller | Funcionalidades |
|-----------|----------------|
| `ChatController.ts` | index, store, update, show, remove, saveMessage, checkAsRead, messages, pinMessage, unpinMessage |
| `ChatbotController.ts` | Gestión de chatbots |
| `MessageController.ts` | index, store, show, update, remove, delete, list, transcribeAudio, editMessage, reactMessage |
| `ScheduledMessagesController.ts` | CRUD mensajes programados |

#### Contactos

| Controller | Funcionalidades |
|-----------|----------------|
| `ContactController.ts` | importXls, index, list, show, store, update, remove, toggleAcceptAudio, blockUnblock, exportToExcel, upload, downloadExport, getImportStatus, getContactProfileURL, getContactTags, toggleDisableBot, updateContactWallet |
| `ContactListController.ts` | CRUD listas de contactos |
| `ContactListItemController.ts` | CRUD items en listas |
| `ContactTemperatureController.ts` | Lead scoring de contactos |
| `ImportPhoneContactsController.ts` | Importación desde teléfono |

#### Tickets & Soporte

| Controller | Funcionalidades |
|-----------|----------------|
| `TicketController.ts` | index, report, kanban, store, setunredmsg, show, showLog, showFromUUID, update, remove, closeAll |
| `TicketNoteController.ts` | Notas internas en tickets |
| `TicketTagController.ts` | Etiquetas en tickets |

#### WhatsApp

| Controller | Funcionalidades |
|-----------|----------------|
| `WhatsAppController.ts` | CRUD conexiones WhatsApp |
| `WhatsAppSessionController.ts` | Gestión de sesiones Baileys |
| `WhatsAppMetaDashboardController.ts` | Dashboard de métricas Meta |
| `WhatsAppMonitorController.ts` | Monitoreo de conexiones |
| `WhatsAppTemplateController.ts` | Plantillas HSM |

#### Campañas & Marketing

| Controller | Funcionalidades |
|-----------|----------------|
| `CampaignController.ts` | CRUD campañas de marketing |
| `CampaignMessageController.ts` | Mensajes de campaña |
| `CampaignSettingController.ts` | Configuración de campañas |
| `FlowCampaignController.ts` | Campañas con flujos visuales |
| `EmailCampaignController.ts` | Campañas de email |
| `FacebookConversionController.ts` | Conversiones Facebook Ads |
| `AudienceSegmentationController.ts` | Segmentación de audiencias |
| `AttributionController.ts` | Atribución multi-canal |

#### Usuarios & Empresas

| Controller | Funcionalidades |
|-----------|----------------|
| `UserController.ts` | CRUD usuarios |
| `CompanyController.ts` | CRUD empresas |
| `CompanySettingsController.ts` | Configuración empresarial |
| `CompanyTokenUsageController.ts` | Uso de tokens IA |

#### Inteligencia Artificial

| Controller | Funcionalidades |
|-----------|----------------|
| `AIConfigController.ts` | Configuración de providers IA |
| `AIImageGenerationController.ts` | Generación de imágenes |
| `AIVideoGenerationController.ts` | Generación de videos |
| `AISubplanController.ts` | Subplanes de tokens IA |
| `AISubplanPurchaseController.ts` | Compra de subplanes |
| `PromptController.ts` | Gestión de prompts |

#### Planes & Facturación

| Controller | Funcionalidades |
|-----------|----------------|
| `PlanController.ts` | CRUD planes de suscripción |
| `BillingController.ts` | Facturación |
| `PaypalController.ts` | Integración PayPal |
| `InvoicesController.ts` | Facturas |
| `SubscriptionController.ts` | Suscripciones |
| `ReceiptController.ts` | Recibos de pago |
| `FinancialDashboardController.ts` | Dashboard financiero |

#### Flujos & Automatización

| Controller | Funcionalidades |
|-----------|----------------|
| `FlowBuilderController.ts` | Constructor visual de flujos |
| `FlowDefaultController.ts` | Flujos por defecto |

#### Colas & Configuración

| Controller | Funcionalidades |
|-----------|----------------|
| `QueueController.ts` | Colas de atención |
| `QueueIntegrationController.ts` | Integraciones en colas |
| `QueueOptionController.ts` | Opciones de cola |
| `SettingController.ts` | Configuración general |

#### Otros Controllers

| Controller | Funcionalidades |
|-----------|----------------|
| `DashbardController.ts` | Dashboard KPIs |
| `StatisticsController.ts` | Estadísticas avanzadas |
| `WebChatController.ts` | Chat web embebido |
| `WebChatWidgetController.ts` | Widget de chat |
| `IntegrationController.ts` | Integraciones externas |
| `MetaWebhookController.ts` | Webhooks de Meta |
| `MetaMarketingController.ts` | Marketing en Meta |
| `TelegramController.ts` | Integración Telegram |
| `AuditController.ts` | Auditoría |
| `MCPController.ts` | Model Context Protocol |
| `AnnouncementController.ts` | Anuncios del sistema |
| `TagController.ts` | Etiquetas globales |
| `HelpController.ts` | Centro de ayuda |
| `FileController.ts` | Gestión de archivos |
| `MediaController.ts` | Archivos multimedia |
| `WebHookController.ts` | Webhooks salientes |
| `SessionController.ts` | Sesiones de usuario |
| `VersionController.ts` | Versión del sistema |
| `AppointmentController.ts` | Citas y reservas |
| `CustomerOriginController.ts` | Origen de clientes |

#### Controllers API Pública (7)

| Controller | Ruta |
|-----------|------|
| `api/CompanyController.ts` | API pública de empresas |
| `api/ConnectController.ts` | Conexión de canales |
| `api/ContactController.ts` | API de contactos |
| `api/HelpController.ts` | Ayuda |
| `api/MessageController.ts` | Mensajería API |
| `api/PartnerController.ts` | Partners |
| `api/PlanController.ts` | Planes |

---

### 4.2 Services (61 directorios)

#### Organización por Dominio

| Dominio | Servicios |
|---------|----------|
| **Usuarios** | UserServices, UserQueueServices, AuthServices |
| **Contactos** | ContactServices, ContactListService, ContactListItemService |
| **Tickets** | TicketServices, TicketNoteService |
| **Mensajes** | MessageServices, ChatService |
| **WhatsApp** | WhatsappService, WbotServices, BaileysServices, WhatsAppCloudAPI, WhatsAppAdapter |
| **Facebook** | FacebookServices, MetaServices, FacebookConversionService |
| **Campañas** | CampaignService, CampaignMessageServices, CampaignSettingServices, CampaignRecommendation, FlowCampaignService |
| **Flujos** | FlowBuilderService, FlowDefaultService, TypebotServices |
| **Empresas** | CompanyService, CompaniesSettings, CompanyTokenUsageService |
| **Colas** | QueueService, QueueIntegrationServices, QueueOptionService |
| **IA** | AIImageGenerationService, AIImageCreditService, AIVideoGenerationService, AIVideoCreditService |
| **Billing** | PlanService, PaypalService, InvoicesService, ReceiptService |
| **WebChat** | WebChatServices, WebChatWidgetServices |
| **Reportes** | ReportService, DashboardServices, Statistics, AttributionServices |
| **Config** | SettingServices, FileServices, ScheduleServices, ScheduledMessagesService |
| **Integraciones** | IntegrationServices, IntegrationsServices, QueueIntegrationServices, EmailMarketing |
| **Otros** | ConnectionService, PartnerServices, HelpServices, DialogChatBotsServices, AnnouncementService, CustomerOriginService, ConfigLoaderService, SendToMCPService, TokenTrackingService, PaymentSync, TelegramService, PromptServices, TagServices |

#### Patrón CRUD por Servicio

Cada dominio sigue una estructura consistente:

```
ContactServices/
├── CreateContactService.ts      → Crear contacto
├── ListContactsService.ts       → Listar con búsqueda, tags, filtros
├── ShowContactService.ts        → Obtener uno por ID
├── UpdateContactService.ts      → Actualizar
├── DeleteContactService.ts      → Eliminar
├── SimpleListService.ts         → Lista simple para UI
├── ImportContactsService.ts     → Importar masivo
└── BlockUnblockContactService.ts → Bloquear/desbloquear
```

#### Servicios Especiales

| Servicio | Tamaño | Descripción |
|---------|--------|-------------|
| `CampaignRuleService.ts` | 24KB | Reglas complejas de campañas |
| `CampaignRecommendationService.ts` | 29KB | Recomendaciones IA para campañas |
| `HybridWhatsAppService.ts` | 15KB | Orquestador dual Baileys + Cloud API |
| `DualAdapter.ts` | 15KB | Adaptador dual WhatsApp |
| `IntelligentLoadBalancer.ts` | 15KB | Enrutamiento inteligente WhatsApp |
| `AttributionService.ts` | 19KB | Atribución multi-touch |
| `AudienceSegmentationService.ts` | 11KB | Segmentación de audiencias |
| `CloudAPIService.ts` | 12KB | WhatsApp Cloud API oficial |

---

### 4.3 Models (121 archivos)

#### Modelos Core

| Modelo | Campos Principales |
|--------|-------------------|
| `Company.ts` | id, name, planId, status, dueDate, companyUserCount, schedules, isActive |
| `User.ts` | id, name, email, passwordHash, profile, companyId, super, online |
| `Contact.ts` | id, name, number, email, profilePicUrl, companyId, isGroup, channel |
| `Ticket.ts` | id, status, contactId, userId, companyId, queueId, whatsappId, channel, lastMessage |
| `Message.ts` | id, body, ack, read, mediaType, mediaUrl, ticketId, contactId, fromMe |
| `Whatsapp.ts` | id, name, status, channel, provider, token, companyId, isDefault, greetingMessage |
| `Plan.ts` | id, name, users, connections, queues, amount, useInternalChat, useDashboard |
| `Queue.ts` | id, name, color, companyId, greetingMessage |

#### Modelos de Campañas

| Modelo | Descripción |
|--------|-------------|
| `Campaign.ts` | Campañas de marketing |
| `CampaignShipping.ts` | Envíos de campaña |
| `CampaignMessage.ts` | Mensajes de campaña |
| `CampaignRule.ts` | Reglas automáticas |
| `CampaignAlert.ts` | Alertas de campaña |
| `CampaignRuleLog.ts` | Log de reglas ejecutadas |
| `ContactList.ts` | Listas de contactos |
| `ContactListItem.ts` | Items en listas |

#### Modelos de IA

| Modelo | Descripción |
|--------|-------------|
| `AIImageGeneration.ts` | Generación de imágenes |
| `AIImageGenerationItem.ts` | Items de imagen generada |
| `AIImageCreditTransaction.ts` | Transacciones de créditos imagen |
| `AIVideoGeneration.ts` | Generación de videos |
| `AIVideoGenerationItem.ts` | Items de video generado |
| `AIVideoCreditTransaction.ts` | Transacciones de créditos video |
| `AISubplan.ts` | Subplanes de tokens IA |
| `AiTokenPlan.ts` | Planes de tokens |
| `AiTokenTransaction.ts` | Transacciones de tokens |
| `AIPromptTemplate.ts` | Templates de prompts |
| `AIProviderConfig.ts` | Configuración de providers |
| `Prompt.ts` | Prompts para IA |
| `PromptQueue.ts` | Colas de prompts |

#### Modelos de Facturación

| Modelo | Descripción |
|--------|-------------|
| `Subscriptions.ts` | Suscripciones activas |
| `Invoices.ts` / `Invoice.ts` | Facturas |
| `Receipt.ts` | Recibos |
| `CompanyBilling.ts` | Facturación por empresa |
| `Refund.ts` | Reembolsos |
| `ApplePurchase.ts` | Compras Apple |

#### Modelos de Atribución

| Modelo | Descripción |
|--------|-------------|
| `AttributionTouchpoint.ts` | Puntos de contacto |
| `AttributionConversion.ts` | Conversiones |
| `AttributionResult.ts` | Resultados de atribución |
| `AttributionChannelAggregate.ts` | Agregación por canal |
| `ConversionDetection.ts` | Detección de conversiones |
| `ConversionItem.ts` | Items de conversión |
| `FacebookConversionEvent.ts` | Eventos de conversión FB |
| `FacebookDataset.ts` | Datasets de Facebook |

#### Modelos de Citas (Appointments/)

| Modelo | Descripción |
|--------|-------------|
| `Appointment.ts` | Cita/reserva |
| `AppointmentService.ts` | Servicio ofertado |
| `AppointmentAvailability.ts` | Disponibilidad |
| `AppointmentReminder.ts` | Recordatorio |
| `AppointmentBlock.ts` | Bloque de tiempo |
| `AppointmentAnalytics.ts` | Analítica |
| `AppointmentAISuggestion.ts` | Sugerencia IA |
| `AppointmentCalendarSync.ts` | Sincronización de calendario |
| `ReminderTemplate.ts` | Plantilla de recordatorio |

#### Modelos de Integraciones (Integrations/)

| Modelo | Descripción |
|--------|-------------|
| `IntegrationProvider.ts` | Proveedor (Zapier, etc.) |
| `IntegrationConnection.ts` | Conexión establecida |
| `IntegrationEntityMapping.ts` | Mapeo de entidades |
| `IntegrationSyncLog.ts` | Log de sincronización |
| `IntegrationApiRequest.ts` | Solicitudes API |
| `IntegrationWebhookEvent.ts` | Eventos webhook |

#### Modelos de WebChat (WebChat/)

| Modelo | Descripción |
|--------|-------------|
| `WebChatChannel.ts` | Canal de chat web |
| `WebChatSession.ts` | Sesión |
| `WebChatMessage.ts` | Mensaje |

#### Otros Modelos

| Modelo | Descripción |
|--------|-------------|
| `Baileys.ts` | Sesión Baileys (WhatsApp) |
| `ChatMessage.ts` / `Chat.ts` / `ChatUser.ts` | Chat interno |
| `LogTicket.ts` | Log de tickets |
| `TicketTraking.ts` | Seguimiento de tickets |
| `Webhook.ts` | Webhooks salientes |
| `Chatbot.ts` | Bot configurado |
| `DialogChatBots.ts` | Diálogos de bots |
| `Files.ts` / `FilesOptions.ts` | Gestión de archivos |
| `Setting.ts` | Configuración global |
| `CompaniesSettings.ts` | Configuración por empresa |
| `FlowBuilder.ts` / `FlowImg.ts` / `FlowAudio.ts` | Flujos visuales |
| `FlowDefault.ts` / `FlowCampaign.ts` | Flujos contextuales |
| `ContactWallet.ts` | Wallet del contacto |
| `ContactCustomField.ts` | Campos personalizados |
| `ContactTemperature.ts` | Lead scoring |
| `CustomerOrigin.ts` | Origen del cliente |
| `LeadSource.ts` | Fuentes de leads |
| `Product.ts` | Productos |
| `Tag.ts` / `ContactTag.ts` | Etiquetas |
| `QuickMessage.ts` | Mensajes rápidos |
| `WhatsAppTemplate.ts` | Plantillas HSM |
| `Announcement.ts` | Anuncios |
| `Versions.ts` | Control de versiones |
| `Media.ts` | Archivos multimedia |
| `ApiUsages.ts` | Uso de API |
| `CompanyTokenUsage.ts` | Uso de tokens |
| `UserTermsAcceptance.ts` | Aceptación de términos |

---

### 4.4 Routes (71 archivos)

#### Rutas por Módulo

**Autenticación:**
- `authRoutes.ts` — Login, logout, refresh token
- `sessionRoutes.ts` — Gestión de sesiones

**Operativo:**
- `ticketRoutes.ts` — CRUD tickets, kanban, reportes
- `ticketNoteRoutes.ts` — Notas en tickets
- `ticketTagRoutes.ts` — Tags de tickets
- `contactRoutes.ts` — CRUD contactos, importar/exportar
- `contactListRoutes.ts` — Listas de contactos
- `contactListItemRoutes.ts` — Items en listas
- `contactTemperatureRoutes.ts` — Lead scoring
- `customerOriginRoutes.ts` — Origen de clientes
- `messageRoutes.ts` — CRUD mensajes
- `chatRoutes.ts` — Chat interno
- `chatBotRoutes.ts` — Chatbots
- `tagRoutes.ts` — Etiquetas globales
- `quickMessageRoutes.ts` — Respuestas rápidas

**WhatsApp:**
- `whatsappRoutes.ts` — Conexiones WhatsApp
- `whatsappSessionRoutes.ts` — Sesiones WhatsApp
- `whatsappTemplateRoutes.ts` — Templates HSM
- `whatsappMetaDashboardRoutes.ts` — Dashboard Meta
- `whatsappMonitorRoutes.ts` — Monitoreo

**Campañas:**
- `campaignRoutes.ts` — CRUD campañas
- `campaignMessageRoutes.ts` — Mensajes de campaña
- `campaignSettingRoutes.ts` — Configuración
- `campaignAuditRoutes.ts` — Auditoría
- `flowCampaignRoutes.ts` — Campañas con flujos
- `emailCampaignRoutes.ts` — Campañas email
- `facebookConversionRoutes.ts` — Conversiones Facebook
- `attributionRoutes.ts` — Atribución

**Flujos:**
- `flowBuilderRoutes.ts` — Editor visual
- `flowDefaultRoutes.ts` — Flujos por defecto

**Administración:**
- `userRoutes.ts` — CRUD usuarios
- `companyRoutes.ts` — CRUD empresas
- `companySettingsRoutes.ts` — Config empresarial
- `queueRoutes.ts` — Colas de atención
- `queueIntegrationRoutes.ts` — Integraciones en colas
- `queueOptionRoutes.ts` — Opciones de cola
- `settingRoutes.ts` — Configuración general
- `planRoutes.ts` — Planes
- `billingRoutes.ts` — Facturación
- `invoicesRoutes.ts` — Facturas
- `subScriptionRoutes.ts` — Suscripciones
- `announcementRoutes.ts` — Anuncios

**IA:**
- `aiConfigRoutes.ts` — Configuración IA
- `aiImageGenerationRoutes.ts` — Generación de imágenes
- `aiVideoGenerationRoutes.ts` — Generación de videos
- `aiSubplanRoutes.ts` — Subplanes
- `aiSubplanPurchaseRoutes.ts` — Compras de subplanes
- `promptRouter.ts` — Prompts

**Integraciones:**
- `integrationRoutes.ts` — Integraciones genéricas
- `metaMarketingRoutes.ts` — Marketing Meta
- `paypalRoutes.ts` — PayPal
- `apiRoutes.ts` — API pública
- `telegramRoutes.ts` — Telegram

**Utilidades:**
- `scheduleRoutes.ts` — Horarios
- `webhookRoutes.ts` / `webHookRoutes.ts` — Webhooks
- `filesRoutes.ts` — Archivos
- `mediaRoutes.ts` — Media
- `versionRoutes.ts` — Versión
- `mcpRoutes.ts` — MCP
- `webchatRoutes.ts` — WebChat
- `webChatWidgetRoutes.ts` — Widget
- `webhookWebchatRoutes.ts` — Webhooks WebChat

**Dashboard & Reportes:**
- `dashboardRoutes.ts` — Dashboard
- `financialRoutes.ts` — Dashboard financiero
- `statisticsRoutes.ts` — Estadísticas

**DevOps:**
- `debugRoutes.ts` — Debug
- `healthRoutes.ts` — Health check

**API Pública:**
- `api/apiCompanyRoutes.ts` — Empresas
- `api/apiContactRoutes.ts` — Contactos
- `api/apiMessageRoutes.ts` — Mensajes

---

### 4.5 Jobs (15 archivos)

| Job | Propósito | Concurrencia | Reintentos |
|-----|-----------|-------------|------------|
| `handleMessageQueue.ts` | Procesar cola de mensajes | — | — |
| `handleMessageAckQueue.ts` | ACK de mensajes | — | — |
| `Campaign.ts` | Ejecución de campañas | 2 workers | 3, backoff exp 5s |
| `ScheduledMessages.ts` | Envío de mensajes programados | 5 workers | 3, backoff exp 3s |
| `ExportContacts.ts` | Exportación de contactos | 1 worker | 2, fijo 30s |
| `ExportContactsToExcel.ts` | Exportación a Excel | 1 worker | 2, fijo 30s |
| `ImportContacts.ts` | Importación masiva | 1 worker | 2, fijo 30s |
| `AppointmentReminder.ts` | Recordatorios de citas | 10 workers | 2, fijo 1 min |
| `AttributionRetrofitJob.ts` | Cálculo retroactivo atribución | — | — |
| `FileExpirationJob.ts` | Limpieza archivos vencidos | — | — |
| `VideoGeneration.ts` | Generación de videos IA | 2 workers | 2, backoff exp 30s |
| `FacebookConversionQueue.ts` | Conversiones Facebook | 3 workers | 5, backoff exp 10s |
| `CampaignAlertEvaluator.ts` | Evaluación alertas campañas | — | — |
| `ContactTemperatureRecalculator.ts` | Recálculo lead scoring | — | — |

---

### 4.6 Middleware (9 archivos)

| Middleware | Función |
|-----------|---------|
| `isAuth.ts` | Verificar JWT válido |
| `tokenAuth.ts` | Autenticación por token alternativo |
| `envTokenAuth.ts` | Token de ambiente |
| `isAuthCompany.ts` | Validar pertenencia a empresa |
| `isSuper.ts` | Verificar admin super |
| `tenantMiddleware.ts` | Aislamiento multi-tenant |
| `rateLimiter.ts` | Limitación de tasa |
| `validateChatAccess.ts` | Validar acceso a chat |
| `checkTermsAcceptance.ts` | Verificar aceptación de términos |

---

### 4.7 Helpers (34 archivos)

#### WhatsApp/Bot
- `GetWhatsappWbot.ts` — Obtener instancia bot
- `GetWhatsapp.ts` — Obtener config WhatsApp
- `GetDefaultWhatsApp.ts` — WhatsApp por defecto
- `GetDefaultWhatsAppByUser.ts` — WhatsApp por usuario
- `GetTicketWbot.ts` — Bot del ticket

#### Mensajería
- `SendMessage.ts` — Enviar mensaje via Baileys
- `SendMessageFlow.ts` — Enviar por flujo
- `SendMail.ts` — Enviar email SMTP
- `GetWbotMessage.ts` — Obtener mensaje de bot
- `SerializeWbotMsgId.ts` — Serializar ID de mensaje

#### Tickets
- `SetTicketMessagesAsRead.ts` — Marcar como leído
- `SetTicketMessagesAsUnRead.ts` — Marcar como no leído
- `UpdateTicketByRemoteJid.ts` — Actualizar por JID
- `UpdateDeletedUserOpenTicketsStatus.ts` — Tickets de usuario eliminado
- `CheckContactOpenTickets.ts` — Verificar tickets abiertos
- `CheckContactSomeTicket.ts` — Verificar algún ticket

#### Seguridad & Auth
- `hashToken.ts` — Hash de tokens
- `CreateTokens.ts` — Crear JWT
- `SendRefreshToken.ts` — Enviar refresh token
- `SerializeUser.ts` — Serializar usuario
- `updateUser.ts` — Actualizar usuario
- `authState.ts` — Estado de autenticación
- `useMultiFileAuthState.ts` — Multi-file auth (Baileys)

#### Utilidades
- `Debounce.ts` — Debouncing
- `Mustache.ts` — Interpolación de variables
- `fileValidation.ts` — Validar archivos
- `TenantManager.ts` — Gestión multi-tenant
- `CheckSettings.ts` — Verificar configuración
- `ChekIntegrations.ts` — Verificar integraciones
- `QueryOptimizer.ts` — Optimización de queries
- `AICapabilitiesValidator.ts` — Validar capacidades IA
- `addLogs.ts` — Agregar logs
- `openAIImageHelper.ts` — Generación de imágenes
- `openAIVideoHelper.ts` — Generación de videos

---

### 4.8 Config (15 archivos)

| Config | Propósito |
|--------|-----------|
| `database.ts` | Sequelize (PostgreSQL/MySQL), Pool: 500 max, 20 min |
| `auth.ts` | JWT secret, expiración: 7d access, 30d refresh |
| `redis.ts` | Redis: host, port, password |
| `redisCluster.ts` | Redis cluster (alta disponibilidad) |
| `queues.ts` | Bull queues (concurrencia, reintentos, prioridades) |
| `upload.ts` | Multer para subidas generales |
| `chatUpload.ts` | Upload para chat |
| `uploadcertificado.ts` | Upload de certificados |
| `uploadExt.ts` | Upload de extensiones |
| `uploadIAConfig.ts` | Upload para IA |
| `privateFiles.ts` | Archivos privados |
| `logger.ts` | Logger Pino con timezone |
| `Gn.ts` | Gerencianet (pagos Brasil) |
| `aiImagePricing.ts` | Precios generación imagen IA |
| `aiVideoPricing.ts` | Precios generación video IA |

---

### 4.9 Utils (12 archivos)

| Util | Función |
|------|---------|
| `logger.ts` | Logging Pino con timezone |
| `messageLogger.ts` | Log especializado de mensajes |
| `ticketLogger.ts` | Log de tickets |
| `telegramLogger.ts` | Log de Telegram |
| `paymentLogger.ts` | Log de pagos |
| `metrics.ts` | Métricas del sistema |
| `version.ts` | Información de versión |
| `randomCode.ts` | Generador de códigos aleatorios |
| `randomizador.ts` | Utilidades de randomización |
| `useDate.ts` | Utilidades de fecha |
| `antiBan.ts` | Anti-ban WhatsApp (rate limit + typing) |
| `rateLimiterRedis.ts` | Rate limit con Redis |

---

### 4.10 Workers

| Worker | Propósito |
|--------|-----------|
| `stageClassifier.worker.ts` | Web Worker para clasificación de etapas |
| `worker.ts` (raíz) | Proceso principal del worker (procesa Bull jobs) |

---

### 4.11 Database Migrations (180+)

#### Tablas Principales del Sistema

```
companies              → Empresas/tenants
users                  → Usuarios del sistema
contacts               → Directorio de contactos
tickets                → Tickets/conversaciones
messages               → Mensajes
whatsapps              → Conexiones WhatsApp
baileys                → Estado auth Baileys
queues                 → Colas de atención
tags                   → Etiquetas
plans                  → Planes de suscripción
campaigns              → Campañas de marketing
campaign_shippings     → Envíos de campaña
campaign_rules         → Reglas automáticas
campaign_alerts        → Alertas
contact_lists          → Listas de contactos
contact_list_items     → Items en listas
invoices               → Facturas
subscriptions          → Suscripciones
ai_image_generations   → Generación de imágenes IA
ai_video_generations   → Generación de videos IA
ai_token_plans         → Planes de tokens IA
appointments           → Citas/reservas
appointment_services   → Servicios de citas
flow_builders          → Flujos visuales
settings               → Configuración global
companies_settings     → Configuración por empresa
webhooks               → Webhooks salientes
integrations           → Integraciones externas
```

#### Últimas Migraciones (2026)

```
20260211000001 → add-theme-colors-to-CompaniesSettings
20260128000001 → create-campaign-messages
20260123000001 → create-ai-token-plans
20260121000001 → add-ai-token-balance-to-company
20260119000001 → add-facebook-ads-fields-to-whatsapp
20251229000001 → add-composite-indexes-to-contacts
20251222000004 → add-payment-provider-ids-to-Plans
```

---

## 5. Frontend (React/Vite)

### 5.1 Información General

| Aspecto | Valor |
|---------|-------|
| **Framework** | React 18.3.1 + TypeScript 5.9.3 |
| **Build Tool** | Vite 7.1.9 |
| **UI Library** | Material-UI Joy 5.0.0-beta + MUI Core |
| **Versión App** | 6.0.0 |
| **Líneas de Código** | ~69,084 en componentes |
| **Puerto Dev** | 3000 |
| **Puerto API Proxy** | 4000 |

### Code Splitting (Vite)

```javascript
manualChunks: {
  'mui-joy': ['@mui/joy'],
  'mui-icons': ['@mui/icons-material'],
  'react-vendor': ['react', 'react-dom', 'react-router-dom'],
  'charts': ['recharts'],
}
```

---

### 5.2 Páginas (75+)

#### Gestión (3 páginas)

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/` | `Dashboard.tsx` | KPIs, métricas, gráficas interactivas |
| `/reports` | `Reports.tsx` | Reportes generales |
| `/realtime-chats` | `RealtimeChats.tsx` | Chat en tiempo real |

#### Operativo (10 páginas)

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/tickets` | `Tickets.tsx` | Gestor de tickets omnicanal |
| `/quick-replies` | `QuickReplies.tsx` | Respuestas rápidas |
| `/kanban` | `Kanban.tsx` | Vista kanban de tickets |
| `/contacts` | `Contacts.tsx` | Directorio de contactos |
| `/schedules` | `Schedules.tsx` | Programación de envíos |
| `/tags` | `Tags.tsx` | Gestión de etiquetas |
| `/tagsKanban` | `TagsKanban.tsx` | Kanban por tags |
| `/internal-chats` | `InternalChats.tsx` | Chat interno del equipo |
| `/customer-origins` | `CustomerOrigins.tsx` | Origen de clientes |
| `/customer-origins/reports` | `CustomerOriginReports.tsx` | Reportes de origen |

#### Campañas (8 páginas)

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/campaigns` | `Campaigns.tsx` | Gestión de campañas |
| `/campaigns/contacts` | `CampaignsContacts.tsx` | Contactos de campaña |
| `/campaigns/settings` | `CampaignsSettings.tsx` | Configuración |
| `/campaigns/insights` | `CampaignsInsights.tsx` | Analytics de campañas |
| `/campaigns/attribution` | `CampaignsAttribution.tsx` | Atribución multi-canal |
| `/campaigns/audit` | `CampaignsAudit.tsx` | Auditoría |
| `/campaigns/segmentation` | `ContactSegmentation.tsx` | Segmentación avanzada |
| `/facebook-conversions` | `FacebookConversions.tsx` | Conversiones FB Ads |

#### FlowBuilder (4 páginas)

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/flowbuilder` | `Flowbuilder.tsx` | Lista de flujos |
| `/flowbuilder/campaign` | `FlowbuilderCampaign.tsx` | Flujos de campaña |
| `/flowbuilder/conversation` | `FlowbuilderConversation.tsx` | Flujos de conversación |
| `/flowbuilder/editor/:flowId` | `FlowbuilderEditor.tsx` | Editor visual con ReactFlow |

#### Administración (14 páginas)

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/announcements` | `Announcements.tsx` | Anuncios del sistema |
| `/api-messages` | `ApiMessages.tsx` | Mensajes vía API |
| `/users` | `Users.tsx` | Gestión de usuarios |
| `/queues` | `Queues.tsx` | Colas de atención |
| `/prompts` | `Prompts.tsx` | Prompts IA |
| `/queue-integrations` | `QueueIntegrations.tsx` | Integraciones en colas |
| `/connections` | `Connections.tsx` | Conexiones de canales |
| `/all-connections` | `AllConnections.tsx` | Todas las conexiones |
| `/invoices` | `Invoices.tsx` | Facturas |
| `/files` | `Files.tsx` | Gestor de archivos |
| `/financial` | `Financial.tsx` | Dashboard financiero |
| `/settings` | `Settings.tsx` | Configuración general |
| `/companies` | `Companies.tsx` | Gestión de empresas |
| `/plans` | `Plans.tsx` | Planes de suscripción |

#### Email Marketing (5 páginas)

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/email-marketing` | `EmailMarketing.tsx` | Dashboard email |
| `/email-marketing/campaigns` | `EmailMarketingCampaigns.tsx` | Campañas email |
| `/email-marketing/analytics` | `EmailMarketingAnalytics.tsx` | Analytics |
| `/email-marketing/templates` | `EmailMarketingTemplates.tsx` | Templates |
| `/email-marketing/plantillas` | `EmailMarketingPlantillas.tsx` | Plantillas |

#### WebChat (4 páginas)

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/webchat/settings` | `WebChatSettings.tsx` | Configuración webchat |
| `/webchat/chats` | `WebChatChats.tsx` | Chats activos |
| `/webchat/analytics` | `WebChatAnalytics.tsx` | Analytics |
| `/webchat/history` | `WebChatHistory.tsx` | Historial |

#### Citas (8 páginas)

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/appointments` | `Appointments.tsx` | Lista de citas |
| `/appointments/dashboard` | `AppointmentsDashboard.tsx` | Dashboard |
| `/appointments/calendar` | `AppointmentsCalendar.tsx` | Calendario |
| `/appointments/services` | `AppointmentsServices.tsx` | Servicios |
| `/appointments/availability` | `AppointmentsAvailability.tsx` | Disponibilidad |
| `/appointments/bookings` | `AppointmentsBookings.tsx` | Reservas |
| `/appointments/reminders` | `AppointmentsReminders.tsx` | Recordatorios |
| `/appointments/reports` | `AppointmentsReports.tsx` | Reportes |

#### WhatsApp Cloud API (9 páginas)

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/whatsapp/dashboard` | `WhatsAppDashboard.tsx` | Dashboard principal |
| `/whatsapp/numbers` | `WhatsAppNumbers.tsx` | Números telefónicos |
| `/whatsapp/templates` | `WhatsAppTemplates.tsx` | Plantillas HSM |
| `/whatsapp/campaigns` | `WhatsAppCampaigns.tsx` | Campañas WhatsApp |
| `/whatsapp/webhooks` | `WhatsAppWebhooks.tsx` | Webhooks |
| `/whatsapp/analytics` | `WhatsAppAnalytics.tsx` | Analytics |
| `/whatsapp/settings` | `WhatsAppSettings.tsx` | Configuración |
| `/whatsapp/tester` | `WhatsAppTester.tsx` | Tester de mensajes |
| `/whatsapp/monitor` | `WhatsAppMonitorDashboard.tsx` | Monitor en tiempo real |

#### Integraciones (10 páginas)

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/integrations` | `Integrations.tsx` | Lista de integraciones |
| `/integrations-internal/dashboard` | `IntegrationsDashboard.tsx` | Dashboard |
| `/integrations-internal/billie` | `IntegrationBillie.tsx` | Integración Billie |
| `/integrations-internal/aria-lite` | `IntegrationAriaLite.tsx` | Integración Aria Lite |
| `/integrations-internal/smarttrack` | `IntegrationSmartTrack.tsx` | Integración SmartTrack |
| `/integrations-internal/sgr` | `IntegrationSGR.tsx` | Integración SGR |
| `/integrations-internal/webhooks` | `IntegrationsWebhooks.tsx` | Webhooks |
| `/integrations-internal/logs` | `IntegrationsLogs.tsx` | Logs |
| `/integrations-internal/settings` | `IntegrationsSettings.tsx` | Configuración |
| `/integrations-internal/testing` | `IntegrationsTesting.tsx` | Testing |

#### OpenAI (8 páginas)

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/openai/dashboard` | `OpenAIDashboard.tsx` | Dashboard IA |
| `/openai/prompts` | `OpenAIPrompts.tsx` | Gestión de prompts |
| `/openai/models` | `OpenAIModels.tsx` | Modelos disponibles |
| `/openai/analytics` | `OpenAIAnalytics.tsx` | Analytics de uso |
| `/openai/testing` | `OpenAITesting.tsx` | Testing de prompts |
| `/openai/templates` | `OpenAITemplates.tsx` | Templates |
| `/openai/settings` | `OpenAISettings.tsx` | Configuración |
| `/openai/history` | `OpenAIHistory.tsx` | Historial de uso |

#### IA Generation (3 páginas)

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/ai-image-generation` | `AIImageGeneration.tsx` | Generación de imágenes |
| `/ai-video-generation` | `AIVideoGeneration.tsx` | Generación de videos |
| `/ai/subplans` | `AISubplans.tsx` | Subplanes de tokens |

#### Autenticación (2 páginas)

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/login` | `Login.tsx` | Inicio de sesión |
| `/signup` | `SignUp.tsx` | Registro |

#### Permisos (1 página)

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/permissions-manager` | `PermissionsManager.tsx` | Gestión de permisos RBAC |

---

### 5.3 Componentes (40+)

#### Estructurales
- `AppLayout.tsx` — Layout principal con sidebar + top bar + navegación jerárquica
- `Layout.tsx` — Layout alternativo simple
- `ProtectedRoute.tsx` — HOC de protección con RBAC por plan
- `AccessDenied.tsx` — Página de acceso denegado

#### Modales de Conexión
- `WhatsAppModal/` — Conexión WhatsApp con QR y Baileys
- `FacebookModal/` — Conexión Facebook
- `InstagramModal/` — Conexión Instagram
- `TelegramModal/` — Conexión Telegram
- `MetaCloudModal/` — Meta Cloud API
- `UnifiedConnectionModal/` — Modal unificado con tabs

#### Pagos/Suscripciones
- `CheckoutPage/` — Página de pago (PlanSelector, PaymentMethodSelector, UploadReceipt)
- `SubscriptionModal/` — Modal de suscripción
- `SubplanModal.tsx` — Modal de subplanes IA
- `PayPalButton.tsx` — Botón PayPal integrado
- `CreditBalanceDisplay.tsx` — Saldo de créditos

#### Entrada de Mensajes
- `MessageInput/` — Input avanzado con emojis, grabación audio, archivos, respuestas rápidas con `/`, soporte multicanal

#### Visualización
- `Messages/MessageBubble.tsx` — Burbuja de mensaje
- `Messages/DateSeparator.tsx` — Separador de fechas
- `Tickets/EmptyChatState.tsx` — Estado vacío

#### IA
- `ImageGenerationHistory.tsx` — Historial de imágenes
- `ImageGenerationModal.tsx` — Generador de imágenes
- `VideoGenerationHistory.tsx` — Historial de videos
- `VideoGenerationModal.tsx` — Generador de videos

#### Carga Optimizada
- `LazyLoad/LazyComponent.tsx` — Componente con carga lenta
- `LazyLoad/LazyImage.tsx` — Imagen con carga lenta
- `LazyLoad/InfiniteScroll.tsx` — Scroll infinito

#### FlowBuilder (10 modales)
- `FlowBuilderAddTextModal/` — Agregar nodo de texto
- `FlowBuilderAddImageModal/` — Agregar nodo de imagen
- `FlowBuilderAddVideoModal/` — Agregar nodo de video
- `FlowBuilderAddAudioModal/` — Agregar nodo de audio
- `FlowBuilderAddPdfModal/` — Agregar nodo PDF
- `FlowBuilderAddURLModal/` — Agregar nodo URL
- `FlowBuilderAddListModal/` — Agregar nodo de lista
- `FlowBuilderMenuModal/` — Menú del flujo
- `FlowBuilderIntervalModal/` — Intervalo de tiempo
- `FlowBuilderRandomizerModal/` — Aleatorizador

#### Utilidades
- `DateRangePicker.tsx` — Selector de rango de fechas
- `TagsContainer/` — Contenedor de etiquetas
- `PermissionGate.tsx` — Control de permisos granular
- `ContactDrawer/` — Drawer lateral de contacto
- `NewAppointmentModal.tsx` — Crear cita
- `FacebookBackground.tsx` / `WhatsAppBackground.tsx` — Fondos temáticos

---

### 5.4 Hooks Personalizados (11)

| Hook | Descripción |
|------|-------------|
| `useAuth.ts` | Estado de autenticación, login/logout, Socket.IO integrado |
| `usePermissions.ts` | Permisos RBAC basados en Plan (80+ módulos, canAccess/canWrite/isReadOnly) |
| `useSocketListeners.ts` | Escuchar eventos Socket.IO (mensajes, tickets, notificaciones) |
| `useTicketsList.ts` | Lista de tickets con filtros (status, fecha, queue, search) |
| `useTicketCounts.ts` | Contadores de tickets por estado |
| `useTicketFilters.ts` | Gestión de filtros de tickets |
| `useTicketActions.ts` | Acciones sobre tickets (assign, close, reopen) |
| `useChannelUtils.tsx` | Utilidades para canales (WhatsApp, Facebook, etc.) |
| `useFilterOptions.ts` | Opciones dinámicas de filtros |
| `useMessageFormatting.ts` | Formateo de mensajes (linkify, emoji) |
| `usePlanFeatures.ts` | Verificación de features del plan |

---

### 5.5 Context & State Management

#### AuthContext
```typescript
interface AuthContextType {
  isAuthenticated: boolean
  user: User | null
  loading: boolean
  login: (email, password, force?) => Promise<any>
  logout: () => Promise<void>
  socket: Socket | null
}
```

#### ThemeContext
```typescript
interface ThemeContextType {
  colors: ThemeColors           // Colores dinámicos por empresa
  chateamTheme: MUI Theme       // Tema Joy principal
  facebookTheme: MUI Theme      // Tema Facebook
  setColors: (colors) => void   // Actualizar colores
}
// Almacenamiento: localStorage ('companyThemeColors')
// Carga desde API: /companySettings/{companyId}
```

---

### 5.6 Services API (10 módulos)

| Service | Descripción |
|---------|-------------|
| `api.ts` | Axios instance con interceptores (Bearer token automático, refresh en 401) |
| `authService.ts` | Login, logout, refreshToken, validateToken, getCurrentUser |
| `socket.ts` | Socket.IO Singleton (connect, disconnect, on, off, emit) |
| `ticketService.ts` | CRUD de tickets |
| `appointmentService.ts` | CRUD de citas |
| `emailCampaignService.ts` | Campañas de email |
| `paypalService.ts` | createPaypalOrder, capturePaypalOrder |
| `aiImageGenerationApi.ts` | Generación de imágenes IA |
| `aiVideoGenerationApi.ts` | Generación de videos IA |
| `financialService.ts` | Operaciones financieras |

---

### 5.7 Sistema de Permisos (RBAC)

```
80+ módulos con permisos granulares:
- true   → Acceso completo (lectura + escritura)
- 'read' → Solo lectura
- false  → Sin acceso

Jerarquía:
1. super === true   → Acceso total (ignora plan)
2. super === false  → Usa permisos del plan
3. Sin plan         → Usa defaults (todo acceso)

Almacenamiento: Plan.interfacePermissions (JSON string)

Funciones: hasAccessByPlan(), hasWriteAccessByPlan(),
           hasReadOnlyAccessByPlan(), getAccessibleModulesByPlan()
```

---

### 5.8 Temas y Estilos

| Archivo | Descripción |
|---------|-------------|
| `chateamTheme.ts` | Tema MUI Joy principal (modo claro/oscuro) |
| `generatePalette.ts` | Generador HSL de paleta 50-900 desde color base |
| `facebookTheme.ts` | Tema estilo Facebook |
| `whatsappTheme.ts` | Tema estilo WhatsApp |

**Colores por defecto:**
- Primary Light: `#5BC2D2` (azul claro)
- Primary Dark: `#6FD4E4` (azul oscuro)
- Secondary: `#4caf50` (verde)

---

## 6. Integraciones

### 6.1 WhatsApp (Baileys + Cloud API)

#### Estado Actual

| Provider | Estado | Modo |
|----------|--------|------|
| **Baileys** (@whiskeysockets/baileys 7.0.0-rc.9) | ✅ ACTIVO | `provider: "stable"` |
| **Cloud API v24.0** (Meta oficial) | ⏸️ CONSTRUIDO | `WHATSAPP_CLOUD_API_ENABLED=false` |
| **Servicio Híbrido** | ⏸️ PREPARADO | `WHATSAPP_HYBRID_MODE=baileys_only` |

#### Arquitectura de Archivos

```
libs/wbot.ts                              → Session Manager (28KB)
  ├── getWbot(whatsappId)                 → Obtener sesión Baileys
  ├── restartWbot(companyId)              → Reiniciar todas las sesiones
  └── removeWbot(whatsappId)              → Remover sesión

services/WhatsappService/                 → CRUD de conexiones
  ├── CreateWhatsAppService.ts
  ├── UpdateWhatsAppService.ts
  ├── ImportWhatsAppMessageService.ts
  ├── ListAllWhatsAppService.ts
  ├── ShowWhatsAppService.ts
  └── DeleteWhatsAppService.ts

services/WbotServices/                    → Lógica de bot
  ├── StartWhatsAppSession.ts             → Iniciar sesión Baileys
  ├── StartAllWhatsAppsSessions.ts        → Iniciar todas al arrancar
  ├── SendWhatsAppMessage.ts              → Enviar mensaje
  ├── wbotMessageListener.ts              → Listener de mensajes entrantes
  └── wbotClosedTickets.ts                → Cierre automático

services/WhatsAppCloudAPI/                → API oficial Meta
  └── CloudAPIService.ts (12KB)           → text, image, video, audio, document, template

services/WhatsAppAdapter/                 → Arquitectura híbrida (DORMIDA)
  ├── HybridWhatsAppService.ts (15KB)     → Orquestador central
  ├── DualAdapter.ts (15KB)               → Dual adapter
  └── IntelligentLoadBalancer.ts (15KB)   → Enrutamiento inteligente
```

#### Anti-Ban Protection

```
Niveles de Rate Limiting:
1. Por conversación: 30 msg/hora
2. Por usuario: 100 msg/hora
3. Por WhatsApp: 500 msg/hora
4. Por empresa: 1000 msg/hora

Protecciones adicionales:
- Typing simulation: 1500ms
- Delay mínimo: 2000ms
- Delay máximo: 5000ms
- Circuit breaker: 5 fallos → reset 60s
```

#### Modos Híbridos Disponibles

```
auto          → Decisión inteligente por el load balancer
baileys_only  → Solo Baileys (ACTUAL)
cloud_only    → Solo Cloud API
baileys_first → Baileys con fallback a Cloud API
cloud_first   → Cloud API con fallback a Baileys
```

---

### 6.2 Facebook/Instagram

- **Facebook App ID:** 3943706329209315
- **Instagram App ID:** 871088751650776
- **Graph API:** v24.0
- **Redirect URI:** `https://chat.chateam.ws/connections`
- **Funcionalidades:** Mensajería, Páginas, Webhooks, Conversiones Ads

---

### 6.3 Telegram

- **Servicio:** `TelegramService`
- **Logger:** `telegramLogger.ts`
- **Rutas:** `telegramRoutes.ts`
- **Modelo:** `Telegram.ts`, `TelegramQueue.ts`

---

### 6.4 WebChat Embebible

- **Widget:** `public/webchat-widget.js` (embebible en sitios externos)
- **Modelos:** WebChatChannel, WebChatSession, WebChatMessage
- **Servicios:** WebChatServices, WebChatWidgetServices
- **Páginas:** Settings, Chats, Analytics, History

---

### 6.5 Email Marketing

- **SMTP:** `mail.chateam.ws:465` (SSL)
- **Servicios:** EmailMarketing, EmailCampaignService
- **Páginas:** Dashboard, Campaigns, Analytics, Templates, Plantillas

---

## 7. Sistema de Colas (Bull + Redis)

### Configuración General

```
Redis: 127.0.0.1:5000
Limpieza automática:
  - Completadas: 1 hora (máx 100)
  - Fallidas: 7 días (máx 500)
```

### Colas y Prioridades

| Cola | Concurrencia | Reintentos | Prioridad | Rate Limit |
|------|-------------|------------|-----------|-----------|
| `AppointmentReminder` | 10 | 2 (fijo 1min) | 🔴 ALTA | — |
| `ScheduledMessages` | 5 | 3 (exp 3s) | 🔴 ALTA | — |
| `FacebookConversionQueue` | 3 | 5 (exp 10s) | 🟡 MEDIA | 100/min |
| `CampaignQueue` | 2 | 3 (exp 5s) | 🟡 MEDIA | 50/min |
| `VideoGenerationQueue` | 2 | 2 (exp 30s) | 🟡 MEDIA | — |
| `ExportContacts` | 1 | 2 (fijo 30s) | 🟢 BAJA | — |
| `ImportContacts` | 1 | 2 (fijo 30s) | 🟢 BAJA | — |

### Procesamiento

**En el Backend** (requiere Socket.IO + WhatsApp):
- `MessageQueue` → Envío de mensajes via WhatsApp
- `NotificationQueue` → Eventos Socket.IO en tiempo real
- `SendScheduledMessages` → Mensajes programados

**En el Worker** (independiente):
- Campañas, Imports/Exports, FB Conversions, Video Gen

---

## 8. Cron Jobs

| Cron Job | Frecuencia | Descripción |
|----------|-----------|-------------|
| `handleCloseTicketsAutomatic` | Cada 1 min | Cierra tickets por inactividad |
| `handleProcessLanes` | Cada 1 min | Mueve tickets entre etapas del Kanban |
| `handleQueueMonitor` | Cada 5 min | Monitorea estado de colas |
| `handleRandomUserQueueQueue` | Cada 2 min | Asigna usuarios random a tickets |
| `handleInvoicesQueue` | Cada 1 hora | Genera facturas automáticas |
| `FacebookConversionScheduler` | Cada 1 min | Procesa conversiones pendientes (batch 100) |
| Auditoría semanal | Lunes 8:00 AM | `curl POST audit-service/api/audit-campaigns` |

---

## 9. WebSocket & Socket.IO

### Configuración

```
Server: Socket.IO 4.7.4
CORS: origin='*', credentials=true
Transports: ['websocket', 'polling']
Ping timeout: 180s (3 minutos)
Ping interval: 10s
Max buffer: 100MB
Namespaces: /\d+/ (dinámicos por companyId)
```

### Eventos

```
CLIENT → SERVER:
  joinChatBox(ticketId)
  joinNotification()
  joinTickets(status)
  joinTicketsLeave(status)
  joinChatBoxLeave(ticketId)

SERVER → CLIENT:
  company-{companyId}-appMessage    → Nuevo mensaje
  company-{companyId}-ticket        → Actualización de ticket
  company-{companyId}-notification  → Notificación
```

---

## 10. Inteligencia Artificial

### Providers Configurados

| Provider | SDK | Uso |
|----------|-----|-----|
| **OpenAI** | openai 4.56.0 | Chatbot, análisis de campañas, generación |
| **Google Dialogflow** | @google-cloud/dialogflow 7.2.0 | NLP alternativo |
| **Azure Speech** | microsoft-cognitiveservices-speech-sdk | TTS/STT |
| **ChromaDB** | chromadb | Vector DB para embeddings |

### Módulos IA

| Módulo | Descripción |
|--------|-------------|
| **Chatbot IA** | Respuestas automáticas con prompts configurables por cola |
| **Generación de Imágenes** | Stability AI, DALL-E — con sistema de créditos |
| **Generación de Videos** | IA con FFmpeg — con sistema de créditos |
| **Análisis de Campañas** | Audit Service con OpenAI para análisis y recomendaciones |
| **Lead Scoring** | ContactTemperature — scoring automático de contactos |
| **Segmentación** | AudienceSegmentationService — ML-based grouping |
| **Recomendaciones** | CampaignRecommendationService — sugerencias IA |
| **Capacidades IA** | AICapabilitiesValidator — validación dinámica |

### Sistema de Créditos IA

```
Modelos:
  AISubplan.ts          → Subplanes de tokens
  AiTokenPlan.ts        → Planes de tokens
  AiTokenTransaction.ts → Transacciones
  CompanyTokenUsage.ts  → Uso por empresa

Config de precios:
  aiImagePricing.ts     → Precios por modelo/tamaño
  aiVideoPricing.ts     → Precios por duración/resolución
```

---

## 11. Sistema de Pagos

### Providers

| Provider | SDK | Estado |
|----------|-----|--------|
| **Stripe** | stripe 14.14.0 | ✅ Activo |
| **PayPal** | @paypal/checkout-server-sdk 1.0.3 | ✅ Activo (Sandbox) |
| **Gerencianet** | SDK | Configurado |

### Modelos de Facturación

```
Plan             → Planes de suscripción (users, connections, queues, amount)
Subscriptions    → Suscripciones activas
Invoices/Invoice → Facturas generadas
Receipt          → Recibos de pago
CompanyBilling   → Facturación por empresa
Refund           → Reembolsos
ApplePurchase    → Compras Apple
```

### Flujo de Pago

```
1. Usuario selecciona Plan (PlanSelector)
2. Elige método de pago (PaymentMethodSelector)
3. PayPal: createPaypalOrder → capturePaypalOrder
4. Transferencia: UploadReceipt → verificación manual
5. Stripe: Procesamiento automático con webhooks
6. Factura generada automáticamente (cron cada 1h)
```

---

## 12. Docker & DevOps

### Configuración PM2 (Producción)

```javascript
// ecosystem.config.js
apps: [
  {
    name: 'chateam-backend',
    script: 'npx tsx server-simple.ts',
    max_memory_restart: '1G',
    instances: 1,
    env: { NODE_OPTIONS: '--max-old-space-size=2048' }
  },
  {
    name: 'chateam-worker',
    script: 'npx tsx worker.ts',
    max_memory_restart: '512M',
    instances: 1,
    env: { NODE_OPTIONS: '--max-old-space-size=1024' }
  },
  {
    name: 'chateam-frontend',
    script: 'node_modules/.bin/vite --host 0.0.0.0',
    instances: 1
  }
]
```

### Docker Compose Producción

```
APPLICATION TIER (Límites):
  ├── app × 3 replicas       → 1 CPU, 1GB RAM
  ├── worker × 2 replicas    → 0.8 CPU, 512MB RAM
  └── audit-service × 2      → 1.5 CPU, 2GB RAM

DATA TIER:
  ├── PostgreSQL 15           → 2 CPU, 2GB RAM
  ├── Redis 7                 → 1 CPU, 1GB RAM
  └── MinIO                   → 1 CPU, 1GB RAM

NETWORKING:
  └── NGINX (alpine)          → 1 CPU, 512MB RAM

MONITORING:
  ├── Prometheus              → 2 CPU, 2GB RAM
  ├── Grafana                 → 1 CPU, 1GB RAM
  ├── AlertManager
  ├── Node Exporter
  ├── Redis Exporter
  └── Postgres Exporter
```

### NGINX

```
Rate Limiting:
  - API: 10 requests/segundo (burst 20)
  - Uploads: 2 requests/segundo (burst 5)

Upstreams:
  - app:3000 (backend)
  - audit-service:8080

Locations:
  / → Frontend (SPA, try_files)
  /api/ → Backend
  /audit/ → Audit Service
  /uploads/ → Files
  /health → Health check
```

### Scripts de Deployment

```
scripts/setup.sh           → Setup inicial del servidor
scripts/deploy.sh           → Deploy a producción
scripts/health-check.sh     → Verificar salud del sistema
scripts/backup.sh           → Backup de datos
scripts/recovery.sh         → Recuperación
scripts/monitoring.sh       → Activar monitoreo
scripts/cleanup.sh          → Limpieza
scripts/update.sh           → Actualización
scripts/ssl-setup.sh        → Certificados SSL
scripts/logs.sh             → Visualizar logs
```

---

## 13. Monitoreo & Observabilidad

### Stack de Monitoreo

```
Prometheus (9090)
  ├── Scrape interval: 15s
  ├── Retention: 30 días / 10GB
  └── Jobs:
      ├── chateam-app (3000/metrics)
      ├── chateam-worker (3000/metrics)
      ├── chateam-audit (3000/metrics)
      ├── postgres-exporter (9187)
      ├── redis-exporter (9121)
      ├── nginx (8080/nginx_status)
      ├── minio (9000/minio/v2/metrics/cluster)
      └── node-exporter (9100)

AlertManager
  └── Canales: Slack, PagerDuty, Email

Grafana (3001)
  ├── Datasource: Prometheus
  └── Plugins: piechart, worldmap
```

### WhatsApp Monitor

```
monitoring/whatsappMonitor.ts (17KB)
  ├── Health checks: cada 30s
  ├── Métricas: cada 60s
  ├── Alertas automáticas
  ├── Dashboard: /whatsapp-monitor/dashboard
  └── Detección de bloqueos
```

### Alertas Configuradas

```
- App response time P95
- Error rate (5xx)
- Requests per second
- DB active connections
- Redis memory usage
- WhatsApp connection status
```

### Logging

```
Backend:
  ├── Winston 3.11.0 (general)
  ├── Pino 10.0.0 (performance)
  └── Loggers especializados:
      ├── messageLogger.ts
      ├── ticketLogger.ts
      ├── telegramLogger.ts
      └── paymentLogger.ts

Format: JSON structured
Level: info (producción)
Rotation: PM2 log rotation
```

---

## 14. Seguridad & Autenticación

### JWT

```
Access Token:  Expiración 7 días
Refresh Token: Expiración 30 días
BCrypt Rounds: 12
Almacenamiento: localStorage (frontend)
```

### Flujo de Autenticación

```
1. POST /api/auth/login (email + password)
2. Backend retorna: { token, refreshToken, user }
3. Frontend almacena en localStorage
4. Axios interceptor agrega: Authorization: Bearer {token}
5. Si 401 → Intenta refresh automático
6. Si falla refresh → Redirige a /login
7. Queue de requests durante refresh
```

### Middleware de Seguridad

```
isAuth              → Verificar JWT válido
isAuthCompany       → Validar pertenencia a empresa
isSuper             → Verificar superadmin
tenantMiddleware    → Aislamiento multi-tenant
rateLimiter         → Limitación de tasa
checkTermsAcceptance → Verificar aceptación de términos
validateChatAccess  → Acceso a chats
```

### Multi-tenancy

```
- Todos los modelos incluyen companyId
- tenantMiddleware filtra por companyId en cada request
- TenantManager.ts gestiona el contexto del tenant
- Socket.IO: namespaces separados por companyId
```

### CORS

```
Orígenes permitidos:
  - https://chat.chateam.ws
  - https://appro.chateam.ws
Credenciales: true
```

---

## 15. Estadísticas del Proyecto

### Backend

| Métrica | v1.1.0 (Feb-27) | v6.0.0 (Mar-02) | Δ |
|---------|:---------------:|:----------------:|:-:|
| Controllers | 79 | **113** | +34 |
| Service Directories | 61 | **109** | +48 |
| Models | 121 | **173** | +52 |
| Routes | 71 | **106** | +35 |
| Jobs | 15 | **28** | +13 |
| Middleware | 9 | **10** | +1 |
| Helpers | 34 | **36** | +2 |
| Config Files | 15 | 15 | — |
| Utils | 12 | 12 | — |
| Database Migrations | 180+ | **317** | +137 |
| Database Tables | ~100 | **156** | +56 |
| SQL Seed/Schema Files | — | **14** | new |
| Total TypeScript Files | 400+ | **540+** | +140 |
| Dependencias (package.json) | 120+ | 120+ | — |

### Frontend

| Métrica | v1.1.0 (Feb-27) | v6.0.0 (Mar-02) | Δ |
|---------|:---------------:|:----------------:|:-:|
| Páginas | 75+ | **148** | +73 |
| Componentes | 40+ | **52** | +12 |
| Hooks personalizados | 11 | **10** | -1 |
| Services API | 10 | 10 | — |
| Módulos RBAC | 80+ | **120+** | +40 |
| Sidebar Sections | 7 | **9** | +2 |
| TypeScript Errors | 26 | **0** | -26 ✅ |

### Infraestructura

| Métrica | Valor |
|---------|-------|
| Docker Services (prod) | 15+ |
| App Replicas | 3 |
| Worker Replicas | 2 |
| Audit Service Replicas | 2 |
| DB Pool Max | 500 |
| Redis Port | 5000 |
| Prometheus Retention | 30 días |
| CronJobs activos | 9+ |
| PM2 Services | 3 (backend, frontend, worker) |

---

## Diagrama de Módulos

```
┌────────────────────────────────────────────────────────────────┐
│                     ChatEAM JR v6.0.0                          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─── CANALES ──────────────────────────────────────────────┐  │
│  │ WhatsApp (Baileys) │ Facebook │ Instagram │ Telegram │    │  │
│  │ WebChat │ Email Marketing │ API Pública                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─── CORE CRM ─────────────────────────────────────────────┐  │
│  │ Contactos │ Tickets │ Mensajes │ Colas │ Tags │ Kanban    │  │
│  │ Lead Scoring │ Segmentación │ Origen de Clientes          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─── MARKETING ────────────────────────────────────────────┐  │
│  │ Campañas │ FlowBuilder │ Mensajes Programados │ Templates │  │
│  │ Reglas │ Alertas │ Atribución │ FB Conversions │ Email     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─── INTELIGENCIA ARTIFICIAL ──────────────────────────────┐  │
│  │ Chatbot IA │ Generación Imágenes │ Generación Videos      │  │
│  │ Análisis Campañas │ Recomendaciones │ Prompts │ Tokens     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─── CITAS & RESERVAS ────────────────────────────────────┐   │
│  │ Calendario │ Servicios │ Disponibilidad │ Recordatorios   │  │
│  │ Analytics │ Sugerencias IA │ Calendar Sync                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─── FACTURACIÓN ──────────────────────────────────────────┐  │
│  │ Planes │ Suscripciones │ Facturas │ PayPal │ Stripe       │  │
│  │ Recibos │ Subplanes IA │ Dashboard Financiero             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─── INTEGRACIONES ───────────────────────────────────────┐   │
│  │ Billie │ Aria Lite │ SmartTrack │ SGR │ Zapier            │  │
│  │ Webhooks │ API Connect │ Meta Marketing │ Google APIs      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─── ADMINISTRACIÓN ──────────────────────────────────────┐   │
│  │ Usuarios │ Empresas │ Configuración │ Permisos RBAC       │  │
│  │ Dashboard │ Reportes │ Estadísticas │ Auditoría           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─── INFRAESTRUCTURA ─────────────────────────────────────┐   │
│  │ PostgreSQL │ Redis │ MinIO │ NGINX │ Docker │ PM2         │  │
│  │ Prometheus │ Grafana │ AlertManager │ Bull Queues          │  │
│  │ Socket.IO │ Cron Jobs │ Health Checks │ Anti-Ban           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

> **Nota:** Este documento fue generado automáticamente mediante análisis exhaustivo del código fuente.
> Última actualización: 2 de Marzo de 2026

---

## 16. Changelog — Sesión 02-Mar-2026

### 16.1 Módulo Email Marketing — 4 Fases

Implementación completa del módulo de Email Marketing en 4 fases. **53 archivos, ~14,500 líneas.**

| Fase | Nombre | Archivos | Descripción |
|:----:|--------|:--------:|-------------|
| 1 | Proveedores + Créditos + Feature Gating | 12 | Carbonio SMTP, SendGrid, Mailgun, SES; AICreditTypes para email; PlanCreditAllocations; Feature gating en Plans |
| 2 | Tracking Real + Analytics + Webhooks | 8 | Tracking pixel (GIF 1x1), link redirect, unsubscribe; SendGrid/Carbonio/Mailgun webhooks; EmailTrackingEvent; EmailAnalyticsController |
| 3 | Editor Visual + Templates + IA | 6 | Template gallery con 6 presets; AI subject lines; AI spam score analyzer; AI content generator |
| 4 | Automatización + A/B Testing + Segmentación | 10 | EmailAutomation + engine; EmailAbTest + service; SegmentationService (engaged/cold/hot/new/bounced); BullMQ worker |

#### Archivos creados

**Modelos (8):** EmailCampaign, EmailCampaignRecipient, EmailTemplate, EmailProviderConfig, EmailTrackingEvent, AIEmailTemplate, EmailAutomation, EmailAbTest

**Servicios (18):**
- `services/EmailMarketing/` (13): CampaignService, TemplateService, TrackingService, AIEmailOptimizationService, AutomationEngineService, AbTestService, SegmentationService, etc.
- `services/EmailProviders/` (5): CarbonioProvider, SendGridProvider, MailgunProvider, SESProvider, ProviderFactory

**Controllers (9):** EmailCampaignController, EmailTemplateGalleryController, EmailTrackingController, EmailWebhookController, EmailAnalyticsController, EmailProviderConfigController, EmailAutomationController, EmailAbTestController, AIEmailTemplateController

**Rutas (6):** emailCampaignRoutes, emailTrackingRoutes, emailAnalyticsRoutes, emailProviderConfigRoutes, emailAutomationRoutes, aiEmailTemplateRoutes

**Frontend (7 páginas):** EmailMarketing (Dashboard), EmailMarketingCampaigns, EmailMarketingTemplates, EmailMarketingPlantillas, EmailMarketingAnalytics, EmailProviderSettings, EmailCreditPacks

**BD (7 tablas + 29 índices):** email_campaigns, email_campaign_recipients, email_templates, email_provider_configs, email_tracking_events, email_automations, email_ab_tests

**Test integral:** 49 tests funcionales, 97% pass rate (48/49). Se crearon datos reales: 3 campañas, 5 templates, 2 automatizaciones, 2 AB tests.

**Bugs corregidos durante testing:**
- `@HasMany(() => EmailCampaignRecipient)` sin `foreignKey` → Sequelize infería `emailCampaignId` en vez de `campaignId`. Fix: `{ foreignKey: 'campaignId' }`
- Mismo patrón en EmailCampaignRecipient → EmailTrackingEvent: `{ foreignKey: 'recipientId' }`

---

### 16.2 Módulo Afiliados — Independizado

El módulo de Afiliados fue separado de la sección de IA (`/ai/affiliates`) a su propia sección independiente.

**Antes:** Sub-item en "Marketing & Campañas > Marketing > Afiliados"
**Después:** Sección propia "AFILIADOS" con 7 items en el sidebar

**Frontend (7 páginas nuevas):**
| Página | Ruta | Descripción |
|--------|------|-------------|
| AffiliateDashboard | `/affiliates` | KPIs, gráfico comisiones/mes, referidos recientes |
| AffiliatePrograms | `/affiliates/programs` | CRUD programas, activar/desactivar |
| AffiliateReferrals | `/affiliates/referrals` | Tabla referidos con estado y comisión |
| AffiliateWallet | `/affiliates/wallet` | Balance, transacciones, solicitar retiro |
| AffiliateWithdrawals | `/affiliates/withdrawals` | Tabla retiros, aprobar/rechazar |
| AffiliateLinks | `/affiliates/links` | Gestión links, copiar URL, stats |
| AffiliateTiers | `/affiliates/tiers` | Niveles MLM con comisiones escalonadas |

**Backend:** 8 servicios (`services/AffiliateServices/`), 1 controller (22 acciones), 1 ruta (25 endpoints bajo `/affiliates/`)

**RBAC (7 módulos nuevos):** affiliates, affiliate_programs, affiliate_referrals, affiliate_wallet, affiliate_withdrawals, affiliate_links, affiliate_tiers

**Retrocompatibilidad:** Rutas `/ai/affiliates` y controller `AIAffiliateController.ts` se mantienen.

---

### 16.3 Reestructuración del Sidebar

**Antes (7 secciones, CONFIGURACIÓN con 12 items planos):**
```
INICIO | OPERATIVO | CANALES | MARKETING & CAMPAÑAS | HERRAMIENTAS | IA | CONFIGURACIÓN (12 items)
```

**Después (9 secciones, config separada de sistema):**
```
INICIO | OPERATIVO | CANALES | MARKETING & CAMPAÑAS | HERRAMIENTAS | AFILIADOS (nuevo) | IA | CONFIGURACIÓN (6 items) | SISTEMA (nuevo, super admin)
```

| # | Sección | Items | Audiencia |
|:-:|---------|:-----:|-----------|
| 1 | INICIO | 2 | Todos |
| 2 | OPERATIVO | 8 | Todos |
| 3 | CANALES | 3 (+Coexistencia Meta, Migración) | Admin+ |
| 4 | MARKETING & CAMPAÑAS | 4 (Campañas, UGC, Marketing, Email) | Admin+ |
| 5 | HERRAMIENTAS | 3 (Citas, Flowbuilder, Integraciones) | Admin+ |
| 6 | **AFILIADOS** ★ | 7 | Admin+ |
| 7 | INTELIGENCIA ARTIFICIAL | 3 (Plataforma, Contenido, Avanzada) | Plan openai |
| 8 | CONFIGURACIÓN | 6 (Usuarios, Colas, Conexiones, Facturación, Permisos) | Admin |
| 9 | **SISTEMA** ★ | 2 (Administración 4 sub, Desarrollo 2 sub) | **Solo super** |

★ = Secciones nuevas

---

### 16.4 Corrección Integral TypeScript — 26→0

Eliminación total de deuda técnica TypeScript en el frontend.

| Categoría | Errores | Archivos | Fix |
|-----------|:-------:|:--------:|-----|
| Recharts `Formatter` tipo | 12 | 7 | Cast `as any` — Recharts v2.x intersección estricta |
| Joy UI `Tab` API | 5 | 2 | Reemplazar `icon`/`label`/`iconPosition` por children |
| Props/interfaces faltantes | 5 | 3 | `detectedAt`, `oldWhatsappId`/`newWhatsappId`, `percent ?? 0`, `auth?.user` |
| Tipos de librerías | 4 | 3 | Import JSX, double cast Record, eliminar key 950, gradient cast |
| **Total** | **26** | **13** | ✅ **0 errores** |

**Archivos corregidos (13):**
Analytics.tsx, CampaignsAttribution.tsx, CampaignsInsights.tsx, CustomerOriginReports.tsx, Dashboard.tsx, OpenAIAnalytics.tsx, OpenAIDashboard.tsx, CampaignAI.tsx, CampaignRules.tsx, MigrationWizard.tsx, PageSkeleton.tsx, usePlanFeatures.ts, chateamTheme.ts

**Resultado:** `tsc --noEmit` → 0 errores | `vite build` → 1m 29s exitoso | PM2 → 3 servicios online

---

### 16.5 Resumen de Crecimiento v1.1.0 → v6.0.0

```
┌──────────────────────────────────────────────────────────┐
│          CRECIMIENTO ChatEAM JR (5 días)                 │
├──────────────────────┬───────────┬──────────┬────────────┤
│ Métrica              │ v1.1.0    │ v6.0.0   │ Δ          │
├──────────────────────┼───────────┼──────────┼────────────┤
│ Controllers          │ 79        │ 113      │ +43%       │
│ Services             │ 61        │ 109      │ +79%       │
│ Models               │ 121       │ 173      │ +43%       │
│ Routes               │ 71        │ 106      │ +49%       │
│ Frontend Pages       │ 75        │ 148      │ +97%       │
│ BD Tables            │ ~100      │ 156      │ +56%       │
│ Migraciones          │ 180       │ 317      │ +76%       │
│ Sidebar Sections     │ 7         │ 9        │ +29%       │
│ RBAC Modules         │ 80        │ 120+     │ +50%       │
│ TypeScript Errors    │ 26        │ 0        │ -100% ✅   │
├──────────────────────┼───────────┼──────────┼────────────┤
│ Total archivos TS    │ 400+      │ 540+     │ +35%       │
└──────────────────────┴───────────┴──────────┴────────────┘
```

### Módulos principales añadidos en esta sesión

| Módulo | Backend | Frontend | BD | Estado |
|--------|:-------:|:--------:|:--:|--------|
| Email Marketing (4 fases) | 36 archivos | 7 páginas | 7 tablas, 29 índices | ✅ 100% |
| Afiliados (independiente) | 10 archivos | 7 páginas | Reutiliza 7 tablas | ✅ 100% |
| Coexistencia WhatsApp Meta | 9 servicios, 8 endpoints | 3 componentes | 6 columnas | ✅ 100% |
| Créditos IA unificados | 3 servicios | 2 componentes | 3 tablas puente | ✅ 100% |
| UI Sidebar reestructurado | — | 1 componente | — | ✅ 100% |
| TypeScript 0 errores | — | 13 archivos | — | ✅ 100% |

---

> **Fin del documento** — ChatEAM JR v6.0.0 | Generado: 2 de Marzo de 2026
