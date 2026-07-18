# Fase 4f — Análisis técnico de WhatsJet SaaS (benchmark para chateam_jr)

> Fuente: código Laravel `src/Source-7.2.0` + `data-schema.sql` (46 tablas) del bundle CodeCanyon 51167362 "WhatsJet SaaS – A WhatsApp Marketing Platform with Bulk Sending, Campaigns, Chat Bots" v7.2.0. Análisis SOLO técnico de features (lectura). Evidencia citada por ruta/tabla/ruta-nombrada.

---

## 1) Qué es + stack

**WhatsJet** es una plataforma **SaaS multi-tenant de WhatsApp Marketing** centrada en envío masivo (bulk), campañas por plantilla, bots (keyword + flow visual + IA), team inbox y venta como servicio con planes/billing. Es **100% WhatsApp Cloud API oficial de Meta** (embedded signup), **NO** usa QR/WhatsApp-Web no oficial (Baileys) ni es omnicanal — es mono-canal WhatsApp.

Evidencia mono-canal Cloud API: `WhatsAppConnectApiService.php:202` → *"You are now connected to WhatsApp Cloud API"*; `setupWhatsAppEmbeddedSignUpProcess()`, `processRegisterPhoneNumber()`, `processTwoStepVerification()`, `processSyncPhoneNumbers()` en `WhatsAppServiceEngine.php`. El "WhatsApp QR" (`vendor.whatsapp_qr` → `HomeController::generateWhatsAppQR`, dep `endroid/qr-code`) es un **QR click-to-chat** (wa.me público), no login de sesión.

**Stack:**
- **Laravel 12 / PHP 8.2+** (`composer.json`), arquitectura propia **Yantrana** (Engine + Repository + Interface por componente, patrón `livelyworks/laraware`).
- **Cashier/Stripe** (`laravel/cashier ^15`) + gateways: **PayPal, Paystack, PhonePe, Razorpay, Yoomoney, UPI** (`Subscription/PaymentEngines/*`).
- **Fortify** (2FA), **Socialite** (social login), **OpenAI PHP** (`openai-php/laravel`) + **Flowise** (config vendor-settings), **Pusher** (chat realtime, `config/broadcasting.php` driver pusher), **libphonenumber**, **box/spout + xlsxwriter** (import/export contactos), **dompdf** (invoices), **google/apiclient**, **predis**.
- **Sistema de Addons** instalables por ZIP (`central.addons.write.upload/install`, carpeta `addons/`) → features premium fuera del core (p.ej. `response_webhook_actions`, template message por webhook).
- Jobs/queue (`jobs`, `failed_jobs`, `background_tasks`, `whatsapp_message_queue`, `whatsapp_webhook_queue`).

---

## 2) Tabla EXHAUSTIVA de funciones × área

| Área | Funciones (evidencia: ruta-nombrada / tabla / método) |
|---|---|
| **WhatsApp API (Cloud oficial)** | Embedded signup Meta (`vendor.whatsapp_setup.embedded_signup.write`); registrar nº (`register_phone_number.write`); 2-step verification; sync phone numbers; **health status** de la línea (`vendor.whatsapp.health.status`, `refreshHealthStatus()`); business profile read/write; display name read/write; disconnect account/webhook; connect/disconnect base webhook. Sin QR/no-oficial. |
| **Mensajería** | Texto, **media** (img/audio/doc/video), **plantilla**, **interactivos** (botones/listas: `sendInteractiveMessageProcess`), **carousel template** (`send-carousel-template-message`), marketing messages onboarding. Tablas `whatsapp_message_logs`, `whatsapp_message_queue`, `message_labels`. |
| **Campañas / Bulk** | Crear campaña por plantilla y **non-template presets**; scheduling con **timezone** (`campaigns.scheduled_at/timezone`); `campaign_groups`; conteo de contactos objetivo (`targeted_contact_count`); logs **queue / executed / expired** con reportes exportables; **requeue de fallidos** (`campaign.requeue.log.write.failed`); abort / archive / unarchive / delete; procesamiento por cron (`campaign.run_schedule.process`, `processCampaignSchedule()`). API pública de campañas (`api.vendor.campaign.write.schedule`). |
| **Plantillas (Templates)** | CRUD, **sync** desde Meta, create/update/delete, **template analytics** (`templates.read.analytics`, `enable_template_analytics`), preview, carousel; tabla `whatsapp_templates`. |
| **Chatbots / Automatización** | (a) **Bot Reply** por keyword (`bot_replies.trigger_type` contains/is, `reply_trigger`, `priority_index`), reply text/media, duplicar, quick-reply. (b) **Bot Flow** visual builder (`bot_flow.builder.read.view`, `bot_flows` con `start_trigger`, `is_strict_flow`, `session_timeout_minutes`; sesiones en `contact_bot_flow_sessions`). (c) Restricciones de horario del bot (`bot_timing_settings`, `bot_start/end_timing`). |
| **IA** | **OpenAI**: RAG con embeddings + cosine similarity sobre training data del vendor (`OpenAiService::embedLargeData/findTopRelevantSections/generateAnswerFromMultipleSections`), modo **Assistant API** (`open_ai_assistant_id`), historial de chat como contexto (`use_existing_chat_history`), `open_ai_model_key/max_token/bot_name`. **Flowise** como motor alterno (`enable_flowise_ai_bot`, `flowise_url/access_token`). Toggle IA por contacto (`vendor.contact.write.toggle_ai_bot`). Restricción horaria IA. |
| **Contactos / Segmentos** | CRUD, **import/export** (spout/xlsx, `contact.write.import/export`, `abort_import`), **grupos** (`contact_groups`, archive/unarchive), **labels/tags** (`labels`, `contact_labels`, `message_labels`), **custom fields** (`contact_custom_fields` + `_values`), **filtros avanzados guardables** (`store_contact_filter`, `contact_advance_filter_data`), block/unblock, asignar grupos/labels/**team member** en bloque. API de contactos completa. |
| **Team Inbox / Agentes** | Chat en vivo (`vendor.chat_message.contact.view`, `chatData`, `contactsData`); **asignar conversación a usuario** (`chat.assign_user`); **labels de chat** CRUD; **notas** internas (`chat.update_notes`); **unread count** realtime (Pusher); quick replies; clear history; delete message; upload/send media; sonido de notificación configurable. |
| **WhatsApp Calling** | Registro/log de **llamadas WhatsApp** (`whatsapp_calls`: direction, started/ended, duración, user_action, session); `enable_whatsapp_calling`; vistas `calling-message.blade`, `recording-modal.blade`. |
| **Integraciones / Webhooks** | Webhook entrante de Meta (`processWebhookRequest`, `whatsapp_webhook_queue`); **webhook saliente por vendor** (`enable_vendor_webhook`, `webhook.connect/disconnect`); **response webhook actions** (tabla `response_webhook_actions` + `_logs` + `action_logs`: dispara plantilla según `condition_key/value` — vía **addon**); API REST con token (`vendor_api_access_token`, sección Settings → api-access). |
| **SaaS / Multi-tenant / Billing** | **Vendors** = tenants (`vendors`, `vendor_settings`, `vendor_users`, `vendor_notifications`); **planes con límites por feature** (`config/lw-plans.php`: contacts, campaigns, bot_replies, bot_flows, ai_chat_bot, api_access, contact_custom_fields, system_users, con `limit`/`limit_duration`, trial_days, monthly/yearly); **subscriptions** (Stripe Cashier) + **manual subscriptions** (aprobación admin, `credit_transactions`, `transactions`); billing portal, download invoice, cancel/resume/change; **login-as vendor/user** (impersonation); super-admin central (vendors, stats, addons). |
| **Reportes / Analytics** | Dashboard vendor + central con stat filters (`read.stat_data_filter`); logs de mensajes con filtro fecha/tipo (`fetchWhatsappMessageLogData`); template analytics; reportes de campaña exportables; `activity_logs`, `login_logs`, `login_attempts`. |
| **Plataforma / Misc** | CMS **Pages** (`pages`), **Media library** (`files-media`, bulk delete), **Translations** i18n (gettext, auto-translate, scan, import/export idiomas), theming (logo/favicon/dark), 2FA, social login, `user_devices` (push token app móvil), **API para app móvil** (`app_api.*`, chat box base data). |
| **Tablas sin cableado en core** | `tickets` (subject/priority/status/assigned_user) y `info_materials` **existen en schema pero SIN controlador/engine en el core** → feature planeada o de addon, no funcional en 7.2.0. |

---

## 3) Features WhatsJet × ¿chateam lo tiene? × acción

> chateam_jr = CRM **omnicanal** WhatsApp/IA (base tipo Chatwoot: FlowBuilder, Campañas, RAG/AIAgent, multi-tenant, Citas, FB CAPI). Columna chateam = evaluación de benchmark; marcar "por verificar" donde no se inspeccionó su código en esta tarea.

| Feature WhatsJet | ¿chateam? | Acción |
|---|---|---|
| Team inbox + asignar agente + notas + labels de chat | **Sí** (core Chatwoot) | Paridad OK |
| Chatbot flow visual (builder) | **Sí** (FlowBuilder) | Paridad OK |
| Bot reply por keyword (contains/is, prioridad) | Parcial (por verificar) | Verificar; complementar el flow con reglas keyword simples |
| **IA RAG (embeddings + cosine) + OpenAI Assistant + Flowise** | **Sí** (RAG/AIAgent) | Paridad; considerar **toggle IA por contacto** y **Assistant API** si falta |
| Toggle IA on/off **por contacto** | Por verificar | **Implementar** si no existe (control fino agente humano vs bot) |
| **Restricción horaria del bot** (start/end + timezone) | Por verificar | **Implementar** (bajo esfuerzo, alto valor: horario laboral) |
| Campañas bulk por plantilla + scheduling con timezone | **Sí** | Paridad OK |
| **Non-template message presets** en campaña (sesión 24h) | Por verificar | Evaluar |
| **Requeue de mensajes fallidos** de campaña | Por verificar | **Implementar** (recupera entregas fallidas sin recrear campaña) |
| Logs de campaña queue/executed/expired + export | Parcial | Mejorar reporting exportable |
| **Template analytics** (métricas de plantilla Meta) | Por verificar | **Implementar** (usa Graph API analytics de Meta) |
| Sync plantillas desde Meta + carousel + interactivos | Parcial | Verificar carousel/interactivos |
| **WhatsApp health status** de la línea (Meta) | Probable no | **Implementar** (monitoreo de calidad/tier del número) |
| **WhatsApp Business Calling** (registro/log de llamadas) | No | Evaluar (feature nueva Meta; nicho) |
| Business profile + display name management desde panel | Por verificar | Implementar (autoservicio del cliente) |
| Contactos: custom fields + labels + grupos + filtros guardables | **Sí** | Paridad OK |
| Import/export contactos (xlsx) con abort | Parcial | Verificar abort/progreso |
| **Response webhook actions** (dispara plantilla por condición) | Por verificar | Evaluar como automatización server-side |
| Webhook saliente por tenant | **Sí** (probable) | Paridad |
| **Planes SaaS con límites por feature** (lw-plans) | **Sí** (multi-tenant) | Paridad; revisar granularidad de límites |
| **Manual subscriptions** (pago manual + aprobación admin) | Por verificar | **Implementar** (clave para mercado EC/LATAM sin tarjeta) |
| Multi-gateway (PayPal/Paystack/PhonePe/Razorpay/Yoomoney/UPI) | Parcial | Adoptar los relevantes a LATAM |
| **Login-as / impersonation** (admin→vendor→user) | Por verificar | **Implementar** (soporte y debugging de tenants) |
| Addons instalables por ZIP | No | **NO adoptar** (complejidad; chateam usa deploy directo) |
| App móvil API (device tokens, chat box) | Por verificar | Evaluar según roadmap móvil |
| Tickets | Schema-only en WhatsJet (no funcional) | Sin acción (chateam ya tiene conversaciones/tickets Chatwoot) |
| Omnicanal (IG/FB/Email/Web) | **WhatsJet NO** | Ventaja de chateam — no perder foco |
| QR WhatsApp-Web no oficial (Baileys) | **WhatsJet NO** (solo Cloud API) | N/A |

---

## 4) Top oportunidades para chateam (impacto / esfuerzo)

1. **Restricción horaria del bot/IA** (start/end + timezone, `bot_timing_settings`) — *Impacto alto / Esfuerzo bajo.* Que la IA solo responda fuera/dentro de horario laboral es petición comercial constante.
2. **Requeue de mensajes de campaña fallidos** — *Impacto alto / Esfuerzo bajo-medio.* Recupera entregas sin recrear la campaña; diferenciador operativo directo.
3. **Manual subscriptions (pago manual + aprobación admin)** — *Impacto alto / Esfuerzo medio.* Habilita venta SaaS en LATAM sin pasarela de tarjeta (transferencia/depósito), con créditos y comprobante.
4. **WhatsApp line health status + template analytics** (Graph API de Meta) — *Impacto alto / Esfuerzo medio.* Autoservicio de calidad del número y rendimiento de plantillas; reduce tickets de soporte.
5. **Toggle IA por contacto** + **Business profile/display name self-service** — *Impacto medio / Esfuerzo bajo.* Control fino bot↔humano y branding gestionado por el propio cliente.
6. **Login-as / impersonation de tenant** — *Impacto medio / Esfuerzo bajo.* Soporte y diagnóstico multi-tenant mucho más rápido.

**Fuera de alcance (no perseguir paridad):** WhatsJet es mono-canal WhatsApp Marketing; chateam es **omnicanal de conversación/soporte + IA**. No adoptar el sistema de addons ZIP ni el QR (WhatsJet ni siquiera lo tiene). Los `tickets`/`info_materials` de WhatsJet son schema muerto: sin valor a copiar.

---

**Evidencia principal:** `routes/web.php` (204 rutas nombradas), `routes/api.php` (`app_api.*` móvil + `api.vendor.*`), `app/Yantrana/Components/WhatsAppService/WhatsAppServiceEngine.php` (43 métodos públicos), `Services/{OpenAiService,WhatsAppApiService,WhatsAppConnectApiService}.php`, `Components/BotReply/*`, `config/{lw-plans,__vendor-settings,broadcasting,openai}.php`, `composer.json`, `data-schema.sql` (46 tablas).

Confirmado: análisis técnico de features de WhatsJet SaaS 7.2.0 completado y contrastado con chateam_jr. Entregable escrito en `/home/jcromero09/chateam_jr/SPEC-FIRST/fase4/04f-whatsjet.md`.
