# Bloque 09 — Auditoría de Servicios (SOLO LECTURA)

Alcance: `services/{FacebookConversionService, TikTokService, CoexistenceServices, WebChatWidgetServices, CommentAutoReplyServices, AITeamServices, QuickMessageService, PromptServices, ScheduledMessagesEnvioService, PaymentSync, FinancialService, ConfigLoaderService, public}`

Total archivos `.ts` auditados: **86** (`public/` no contiene servicios — solo 2 imágenes .jpeg).
Taxonomía: REAL=lógica+cableado · PARCIAL · MOCK=datos fabricados · STUB=vacío/not-impl · MUERTO=sin refs externas · NV=requiere ejecutar.

---

## Tabla por servicio (resumen)

| Servicio | Archivos | REAL | MUERTO | Notas |
|---|---|---|---|---|
| FacebookConversionService | 17 | 16 | 1 | Motor CAPI Meta real y cableado (10 refs ext). Muerto: `ProcessWhatsAppConversion` (placeholder + 0 refs) |
| TikTokService | 15 | 14 | 1 | Cableado real: cron poll comentarios (5min) + refresh token (1h). Muerto: `CreateTikTokService` (0 refs, sustituido por OAuth) |
| CoexistenceServices | 11 | 10 | 1 | Ruteo Meta/Baileys real, companyId-scoped. Muerto: `DispatchAckReconciler` (lógica real, sin wiring a webhooks) |
| WebChatWidgetServices | 9 | 8 | 1 | CRUD + conversación reales. Muerto: `ProcessWebChatMessageService` (0 refs, sustituido por `WebChatConversationService`) |
| CommentAutoReplyServices | 7 | 7 | 0 | Cableado a `FBPageWebhookController` + `CommentAutoReplyController` |
| AITeamServices | 6 | 6 | 0 | CRUD Sequelize companyId-scoped |
| QuickMessageService | 6 | 6 | 0 | CRUD Sequelize companyId-scoped |
| PromptServices | 5 | 5 | 0 | CRUD + validación queueIds por compañía |
| ScheduledMessagesEnvioService | 4 | 0 | 4 | **Directorio entero MUERTO** (0 refs externas). `CreateService` con schema Yup desalineado |
| PaymentSync | 3 | 3 | 0 | Stripe/PayPal SDK reales; keys desde Company del SuperAdmin |
| FinancialService | 2 | 2 | 0 | Agregaciones reales; **sin filtro companyId (por diseño super-admin)** |
| ConfigLoaderService | 1 | 1 | 0 | Config 100% hardcodeada (funcional) |
| public | 0 | — | — | No es servicio (assets .jpeg) — N/A / NV |

### Detalle de archivos NO-REAL

| Archivo | Clase | Motivo |
|---|---|---|
| `FacebookConversionService/ProcessWhatsAppConversion.ts` | MUERTO (+placeholder) | 0 refs; `extractCtwaClid()` es placeholder (regex naïve sobre body) → atribución click-to-WhatsApp no funcional |
| `TikTokService/CreateTikTokService.ts` | MUERTO | 227 líneas, 0 refs; TikToks se crean vía flujo OAuth |
| `CoexistenceServices/DispatchAckReconciler.ts` | MUERTO | Lógica de reconciliación ACK real pero NO cableada (solo citado en doc de smoke test) → gap de tracking de ACK |
| `WebChatWidgetServices/ProcessWebChatMessageService.ts` | MUERTO | 0 refs; usa `Math.random` para wid |
| `ScheduledMessagesEnvioService/{Create,Update,List,Delete}Service.ts` | MUERTO | Directorio sin refs externas; controllers usan `ScheduledMessagesService/` (sin "Envio") |

---

## Conteo por clase (archivos .ts)

- **REAL: 78**
- **MUERTO: 8** (ProcessWhatsAppConversion, CreateTikTokService, DispatchAckReconciler, ProcessWebChatMessageService, + 4 de ScheduledMessagesEnvioService)
- PARCIAL: 0 · MOCK: 0 · STUB: 0 · NV: 0
- (`public/` = N/A, no es servicio)

Sin secretos hardcodeados. Sin datos fabricados (MOCK). Los `Math.random` hallados son legítimos (jitter de delay, spintax, generación de wid fallback) — no fabrican datos de negocio.

---

## Veredicto (3 líneas)

1. Bloque mayormente **REAL y en producción**: los motores críticos (Meta CAPI, ruteo de coexistencia Meta/Baileys, TikTok con crons activos, Stripe/PayPal) tienen lógica completa y cableado verificado.
2. **8 archivos MUERTOS** (deuda): destaca `ScheduledMessagesEnvioService/` entero y `DispatchAckReconciler` (lógica válida pero desconectada del pipeline de webhooks → ACKs no se reconcilian).
3. **Riesgo tenant**: `FinancialService` consulta `Invoices` sin `companyId` — mitigado por gate `isAuth+isSuper` y check `companyId===1||profile==='superadmin'`; seguro mientras el guard no se altere.

---

## Top riesgos (≤10, ruta:línea)

1. **[Dinero/Tenant] FinancialService sin scope de tenant** — `services/FinancialService/GetFinancialSummaryService.ts:49-71` y `GetPaymentsByPeriodService.ts:30-60` agregan TODAS las `Invoices` sin `companyId`. Mitigado por `routes/financialRoutes.ts:13,17` (isAuth+isSuper) y `controllers/FinancialDashboardController.ts:11` (hardcode `companyId!==1` como proxy de superadmin). Si el guard se remueve → exposición financiera cross-tenant total.
2. **[Muerto/Feature rota] ProcessWhatsAppConversion placeholder** — `services/FacebookConversionService/ProcessWhatsAppConversion.ts:74` — extracción de `ctwa_clid` es placeholder; 0 refs. La atribución de conversiones desde anuncios click-to-WhatsApp no opera.
3. **[Muerto/Gap] DispatchAckReconciler no cableado** — `services/CoexistenceServices/DispatchAckReconciler.ts` (`reconcileAck`, 0 usos en prod). El tracking de ACK (sent/delivered/read) de OutboundDispatch no se actualiza desde webhooks.
4. **[Muerto] ScheduledMessagesEnvioService completo** — `services/ScheduledMessagesEnvioService/*` (0 refs). `CreateService.ts:26` valida `data_mensagem_programada`/`nome` inexistentes en el payload → lanzaría si se cableara.
5. **[Tenant menor] LopdpService.hasMarketingConsent** — `services/FacebookConversionService/LopdpService.ts:21` — `Contact.findByPk(contactId)` sin `companyId` (lectura de consentimiento cross-tenant; contactId interno → severidad baja).
6. **[Muerto/ID] ProcessWebChatMessageService** — `services/WebChatWidgetServices/ProcessWebChatMessageService.ts:134` — 0 refs; `Math.random` para wid (colisión potencial). Sustituido por `WebChatConversationService`.
7. **[Deuda] CreateTikTokService** — `services/TikTokService/CreateTikTokService.ts` — 227 líneas sin refs; superseded por OAuth.
8. **[Config] ConfigLoaderService hardcodeado** — `services/ConfigLoaderService/configLoaderService.ts:20` — webhook attempts/backoff/limiter fijos, sin override por env.
9. **[Dinero/Config] PaymentSync depende de 1 SuperAdmin** — `services/PaymentSync/StripeProductService.ts:41-51` y `PaypalProductService.ts:50-60` — `User.findOne({super:true})` → si hay varios super users, el primero gana (origen de keys no determinista).
10. **[ID] Math.random en wid de coexistencia** — `services/CoexistenceServices/CoexistenceOutboundRouterService.ts:234` — id de mensaje no-cripto (colisión bajo carga alta; severidad baja).
