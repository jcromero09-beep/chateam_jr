# Spec de módulo — Email Marketing · chateam_jr

> Grupo: **Growth / Monetización**. Playbook Fase 5 (Spec-Driven v7.0). Fuente del "qué":
> `SPEC-FIRST/fase1/01-vision-y-alcance.md §3.17`, `SPEC-FIRST/fase2/02-auditoria-tecnica.md`.
> Evidencia de código: solo lectura de `routes/`, `controllers/`, `models/`. Fecha: 2026-07-12.
> Convención: **[SUPUESTO]** requiere confirmación de negocio · **[DEUDA]** discrepancia conocida.

## Propósito

Permitir que una company cree, envíe y mida **campañas de correo electrónico** (masivas, de prueba y
automatizadas), gestione plantillas (propias, galería y generadas por IA), configure uno o varios
**proveedores de envío** (SMTP/SendGrid/Mailgun/SES/Carbonio/Listmonk/Acelle), segmente su base de
contactos por engagement y consuma un **plan de créditos de email** (envíos prepago) como palanca de
monetización. Es el canal de marketing outbound no-conversacional del CRM (complementa Campañas WhatsApp).

## Actores y capacidades

- **El usuario (agente/admin de company)** puede crear una campaña de email, subir media, enviarla o
  programarla, cancelarla/reiniciarla, hacer un envío de prueba, y ver KPIs (aperturas/clicks/rebotes) del
  dashboard y por campaña.
- **El usuario** puede gestionar plantillas: CRUD propio, instalar presets de la **galería**, duplicar,
  y generar contenido/asuntos/score-anti-spam con **IA**.
- **El usuario** puede definir **automatizaciones** (triggers) y **A/B tests** (declarar ganador), y
  construir **segmentos** (engaged/cold/custom por open-rate, click-rate, inactividad, rebotes).
- **El usuario** puede registrar y **probar** configuraciones de proveedor de email (test ad-hoc y de
  configuración guardada).
- **El super-admin** puede crear/editar/eliminar **planes de email** (créditos vendibles).
- **El sistema permite** rastrear aperturas (pixel), clicks (redirect) y bajas (unsubscribe) sin auth, e
  ingerir webhooks de estado de SendGrid/Carbonio/Mailgun; y provisionar créditos de email tras un pago
  (llamado interno desde `SubscriptionController`).
- **El sistema permite** contabilizar el consumo contra el balance del plan de email de la company.

## Rutas/Controladores (evidencia archivo:línea) y modelo de datos

**Campañas + dashboard + plantillas** — `routes/emailCampaignRoutes.ts` (montado en `routes/index.ts:600`):
- Dashboard: `GET /email-marketing/dashboard/{kpis,trend,campaigns,failures}`, `POST .../sync`
  (`emailCampaignRoutes.ts:16-20` → `EmailDashboardController`).
- Campañas: `GET/POST /email-campaigns`, `POST /email-campaigns/create-and-launch`,
  `GET/PUT/DELETE /email-campaigns/:id`, `POST /:id/{media-upload,cancel,restart,send}`,
  `POST /email-campaigns/test-send`, `GET /:id/stats` (`:22-48` → `EmailCampaignController`).
- Plantillas + galería + IA: `GET/POST /email-templates`, `GET /email-templates/gallery`,
  `POST /email-templates/gallery/install`, `POST /email-templates/ai/{subject-lines,spam-score,generate}`,
  `GET/PUT/DELETE /email-templates/:id`, `POST /:id/{duplicate,test-send}` (`:51-68` →
  `EmailCampaignController` + `EmailTemplateGalleryController`).

**Analytics** — `routes/emailAnalyticsRoutes.ts` (índice `:609`): `GET /email-analytics/overview`,
`GET /email-analytics/campaign/:id` (`:17-27` → `EmailAnalyticsController`).

**Automatizaciones / A-B / Segmentación** — `routes/emailAutomationRoutes.ts` (índice `:612`):
`GET/POST /email-automations`, `GET/PUT/DELETE /:id`, `POST /:id/{activate,pause}`, `GET /:id/stats`
(`:14-21`); `GET/POST /email-ab-tests`, `GET /:id`, `POST /:id/{start,declare-winner}`, `DELETE /:id`
(`:24-29`); `GET /email-segments/{stats,query,engaged,cold}` con **`require()` lazy** de
`services/EmailMarketing/SegmentationService` (`:33-97`).

**Proveedores** — `routes/emailProviderConfigRoutes.ts` (índice `:603`):
`GET/POST /email-provider-configs`, `PUT/DELETE /:id`, `POST /email-provider-configs/test` (ad-hoc),
`POST /:id/test` (`:20-58` → `EmailProviderConfigController`).

**Tracking + webhooks (PÚBLICOS, sin `isAuth`)** — `routes/emailTrackingRoutes.ts` (índice `:606`):
`GET /tracking/{open,click,unsubscribe}/:recipientId`, `POST /webhooks/email/{sendgrid,carbonio,mailgun}`
(`:6-13` → `EmailTrackingController` + `EmailWebhookController`).

**Planes de email** — `routes/emailPlanRoutes.ts` (índice `:626`): `GET /email-plans` (público),
`GET /email-plans/{balance,usage}` (`isAuth`), `GET /email-plans/:id` (público),
`POST/PUT/DELETE /email-plans[/:id]` (`isAuth`+`isSuperAdmin`), `POST /email-plans/provision` (**interno,
sin guard**) (`emailPlanRoutes.ts:25-51`).

**Modelo de datos (tablas):** `email_campaigns` (`models/EmailMarketing/EmailCampaign.ts`),
`email_campaign_recipients` (`EmailCampaignRecipient.ts`), `email_templates` (`EmailTemplate.ts`),
`email_tracking_events` (`EmailTrackingEvent.ts`), `email_automations` (`EmailAutomation.ts`),
`email_ab_tests` (`EmailAbTest.ts`), `email_provider_configs` (`EmailProviderConfig.ts`),
`email_plans` (`models/EmailPlan.ts`), `company_email_plans` (`models/CompanyEmailPlan.ts`),
plantillas IA `ai_email_templates` (`models/AIEmailTemplate.ts`).

## Flujos clave

**Happy path — crear y enviar campaña:** usuario crea `email_campaign` (`POST /email-campaigns`) →
adjunta media (`/:id/media-upload`) → hace `test-send` a su correo → lanza (`POST /:id/send` o
`create-and-launch`) → el envío se encola y consume créditos del `company_email_plan` → cada destinatario
queda en `email_campaign_recipients` → aperturas/clicks entran por `GET /tracking/*` y actualizan
`email_tracking_events` → KPIs visibles en `GET /email-analytics/overview` y `/campaign/:id`.

**Errores:**
- *Sin proveedor válido:* si no hay `email_provider_config` activo/probado, el envío falla; `POST
  /email-provider-configs[/:id]/test` debe validar antes de lanzar.
- *Sin créditos:* si el `company_email_plan` no tiene balance, la campaña no debe salir (se corta y
  reporta en `dashboard/failures`).
- *Bounce/complaint:* el webhook (`/webhooks/email/*`) marca al destinatario; envíos futuros a esa
  dirección deben suprimirse (segmento cold / bounce).

## Deuda/bugs conocidos (Fase 2)

- **[DEUDA] Providers stub (P3-3, `backend-inventory.md:173`):** SendGrid/AmazonSES/Carbonio son stubs por
  heurística de código — **verificar cuáles canales envían de verdad antes de venderlos** (`Fase1 §3.17`).
- **Segmentación con `require()` lazy bajo ESM** (`emailAutomationRoutes.ts:36,56,83,95`): mismo patrón que
  tumbó el worker (C-4). Si `SegmentationService` se importa mal, los 4 `GET /email-segments/*` caen a 500.
- **`POST /email-plans/provision` sin ningún middleware** (`emailPlanRoutes.ts:51`): endpoint que acredita
  envíos de email; si es alcanzable desde fuera del proceso, permite créditos gratis. Debe exigir secreto
  interno / IP-allowlist como el resto de rutas `/internal/*`.
- **Webhooks de email sin verificación de firma** (`emailTrackingRoutes.ts:6-13`): SendGrid/Mailgun firman
  sus eventos; hoy no se valida → estados de entrega/rebote forjables (mismo patrón P1 que Meta webhook).
- **Multi-tenant por columna:** todo listado (`/email-campaigns`, `/email-templates`, `/email-analytics/*`)
  depende de que el query filtre `companyId`; sin defensa en profundidad (`Fase1 §5.4`).

## Criterios de aceptación (Given/When/Then, testables)

1. **Given** una company sin `email_provider_config` activo, **When** llama `POST /email-campaigns/:id/send`,
   **Then** responde 4xx con mensaje de "proveedor no configurado" y la campaña NO cambia a estado enviado.
2. **Given** una company con balance 0 en su `company_email_plan`, **When** lanza una campaña de N>balance
   destinatarios, **Then** el sistema no envía por encima del balance y registra el corte en
   `GET /email-marketing/dashboard/failures`.
3. **Given** un destinatario con pixel de apertura, **When** se hace `GET /tracking/open/:recipientId`,
   **Then** responde un GIF 1x1 y crea exactamente un `email_tracking_event` tipo `open` idempotente por
   apertura repetida en la misma ventana.
4. **Given** un usuario NO super-admin, **When** hace `POST /email-plans`, **Then** responde 403 (gate
   `isSuperAdmin`, `emailPlanRoutes.ts:44`).
5. **Given** un webhook `POST /webhooks/email/sendgrid` con firma inválida o ausente, **When** se procesa,
   **Then** (objetivo) responde 403 sin mutar `email_campaign_recipients` [DEUDA: hoy no valida firma].
6. **Given** dos companies distintas, **When** la company A pide `GET /email-analytics/campaign/:id` de una
   campaña de la company B, **Then** responde 404/403 y nunca datos de B.
