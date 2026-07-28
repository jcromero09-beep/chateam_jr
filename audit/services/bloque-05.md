# Auditoría de Servicios — Bloque 05

Alcance: 87 servicios `.ts` en 13 grupos de `services/` (EmailMarketing +providers, WebhookService, MetaMarketingService, QueueIntegrationServices, HelpServices, ContactListItemService, AgentIdentityServices, AIAffiliateServices, AIAgentConfigServices, CampaignSettingServices, AIRealtimeAudioServices, AIMercadoPagoServices, TypebotServices).
Método: inspección dirigida (head + grep de señales: TODO/mock/stub/Math.random/hardcodes; deep-read de sospechosos y de todos los providers de email y del servicio de pagos; verificación de wiring por refs externas). Solo lectura.
Fecha: 2026-07-27.

## Conteo por clase

| Clase | Nº |
|---|---|
| REAL | 85 |
| PARCIAL | 1 |
| MOCK | 0 |
| STUB | 0 |
| MUERTO | 1 |
| NO-VERIFICABLE | 0 |
| **Total** | **87** |

Con riesgo cross-tenant: **3** (3 IDOR confirmados por update/delete sin `companyId`).
Providers de email STUB: **0** — se REFUTA la auditoría previa. Los 6 providers concretos (SendGrid, Mailgun, SES, Carbonio, Acelle, Listmonk) son integraciones REALES (SDK/axios/nodemailer con llamadas efectivas). Solo Acelle es PARCIAL.

## Servicios con señales (evidencia)

Solo se listan servicios con hallazgos; el resto (CRUD y orquestación) son REAL sin señales relevantes.

| servicio | clase | señales (evidencia ruta:línea) |
|---|---|---|
| AIAgentConfigServices/UpdateService.ts | REAL | **CROSS-TENANT GRAVE**: `AIAgentConfig.findByPk(id)` + `config.update()` sin `companyId` → `:20`. El modelo tiene `companyId` (`models/AIAgentConfig.ts:59 "// null = global"`). El servicio ni siquiera recibe companyId en su firma. Cualquier company edita el agente IA de otra por id. |
| CampaignSettingServices/UpdateServiceCampaignSettings.ts | REAL | **CROSS-TENANT GRAVE**: `CampaignSetting.findByPk(id)` + `record.update(data)` sin `companyId` → `:19`. El modelo tiene `companyId` (`models/CampaignSetting.ts:37`). Firma sin companyId. |
| WebhookService/DeleteWebHookService.ts | REAL | **CROSS-TENANT**: `WebhookModel.findOne({where:{id}})` sin companyId ni user → `:6`. Contrasta con Create/Get/Update del mismo grupo que sí acotan por `company_id`. Borra webhook ajeno por id. |
| WebhookService/botonesActionsWebhookService.ts | MUERTO | 1139 L, lógica real (motor FlowBuilder variante "botones"), pero **0 referencias externas** en todo el repo. Exporta `ActionsWebhookService` (mismo nombre que el vivo) y nada lo importa. Duplicado obsoleto de `ActionsWebhookService.ts`. |
| EmailMarketing/providers/AcelleProvider.ts | PARCIAL | Integración REAL de lists/subscribers/campaigns (axios a Acelle). Pero por diseño NO soporta transaccional/plantillas: `sendEmail`/`sendBulkEmails`/`createTemplate`/`updateTemplate`/`deleteTemplate`/`sendTest` devuelven `success:false` con mensaje "no soportado" → `:114,:122,:322,:425`. Documentado, no es engaño. |
| AIMercadoPagoServices/MercadoPagoService.ts | REAL | Pagos REALES (POST checkout/preferences + GET payments a api.mercadopago.com). Riesgos: `processWebhook(type,dataId)` **no verifica firma/HMAC** — `webhookSecret` del interface nunca se usa → `:143`; mitigado porque re-consulta el pago en la API de MP. Token **global** `MERCADOPAGO_ACCESS_TOKEN` de env (no por-tenant) pese a recibir `companyId` → `:49,:106`. |
| EmailMarketing/providers/CarbonioProvider.ts | REAL | SMTP nodemailer con pool (provider Tier 0 por defecto). `tls.rejectUnauthorized:false` → acepta certificados inválidos → `:53`. |
| AgentIdentityServices/GenerateIdentityService.ts | REAL | OpenAI + deducción de créditos + persistencia. Modelo hardcodeado `"gpt-5.5"` → `:109,:178` (id de modelo sospechoso; verificar que exista). |
| AIAffiliateServices/CalculateCommissionService.ts | REAL | Lógica DB real acotada por code/referral. `console.log` en vez de logger `:88`; `commissionRate` default `20` hardcode `:48`. |
| TypebotServices/typebotListener.ts | REAL | Integración axios a Typebot startChat/continueChat. `Math.random()` para `sessionId` → `:50` (uso legítimo de id, no dato fabricado; colisión teórica). |
| MetaMarketingService/RoasService.ts | REAL | Reemplaza explícitamente el mock `Math.random` del front: SQL real; si no hay spend/datos devuelve `roas:null` + `dataStatus:'insufficient'` (honesto, no inventa) → `:6,:72`. Acotado por companyId. |

Notas:
- No se detectaron secretos/tokens hardcodeados ni IPs embebidas en Meta/Webhook/Typebot/Queue.
- ContactListItemService y QueueIntegrationServices YA están acotados por `companyId` (llevan fixes `[W1-SEC-12]`/`[Aislamiento cross-tenant]`); el mismo patrón faltó en AIAgentConfig/CampaignSetting/DeleteWebHook.
- HelpServices usa `findByPk(id)` sin companyId pero es entidad **global** (`models/Help.ts` sin columna companyId) → NO es cross-tenant.
- `Math.random` solo aparece en typebotListener (id de sesión) y como comentario en RoasService. Ningún `faker`, ni arrays devueltos como datos reales, ni `throw not implemented`.

## Veredicto de salud del bloque (3 líneas)

1. Bloque muy sólido y mayoritariamente REAL (85/87): EmailMarketing es una integración multi-provider genuina (nodemailer/SendGrid/Mailgun/SES/Listmonk/Acelle), Meta Ads y pagos MercadoPago son reales — se **refuta** que los providers de email sean stubs.
2. Riesgo #1: tres IDOR cross-tenant por update/delete sin `companyId` (AIAgentConfig, CampaignSetting, DeleteWebHook) — el mismo patrón ya se corrigió en ContactListItem y QueueIntegration, quedó pendiente aquí.
3. Deuda: 1 archivo muerto de 1139 L (botonesActionsWebhookService, duplicado obsoleto), webhook de pagos MP sin verificación HMAC, y SMTP Carbonio con `rejectUnauthorized:false`.

## Top servicios más problemáticos (≤10)

1. **AIAgentConfigServices/UpdateService.ts** — cross-tenant grave (update sin companyId, `:20`).
2. **CampaignSettingServices/UpdateServiceCampaignSettings.ts** — cross-tenant grave (update sin companyId, `:19`).
3. **WebhookService/DeleteWebHookService.ts** — cross-tenant (delete solo por id, `:6`).
4. **AIMercadoPagoServices/MercadoPagoService.ts** — pagos: webhook sin HMAC (`:143`) + token global no-tenant (`:49`).
5. **WebhookService/botonesActionsWebhookService.ts** — MUERTO, 1139 L de duplicado obsoleto sin refs.
6. **EmailMarketing/providers/AcelleProvider.ts** — PARCIAL: transaccional/plantillas no soportados (`:114,:322`).
7. **EmailMarketing/providers/CarbonioProvider.ts** — `tls.rejectUnauthorized:false` en SMTP por defecto (`:53`).
8. **AgentIdentityServices/GenerateIdentityService.ts** — modelo `"gpt-5.5"` hardcodeado dudoso (`:109,:178`).
9. **AIAffiliateServices/CalculateCommissionService.ts** — `console.log` + rate default hardcode (`:48,:88`).
10. **TypebotServices/typebotListener.ts** — `Math.random` como sessionId (`:50`, débil).
