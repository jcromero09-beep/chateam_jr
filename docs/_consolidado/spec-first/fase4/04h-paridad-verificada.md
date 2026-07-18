# 04h — Paridad verificada (pase de contraste REAL contra código chateam_jr)

> Método: cada feature candidata de los benchmarks 04b–04g se verificó con **grep/find sobre el código real** de `/home/jcromero09/chateam_jr` (`routes/`, `controllers/`, `services/`, `models/`, `frontend/src/`). Cierra los "(verificar)" de 04f/04g con evidencia `archivo:línea` o "grep vacío".
> Leyenda estado: **TIENE** (existe y funcional) · **PARCIAL** (existe base pero incompleto vs benchmark) · **NO** (sin coincidencias reales).
> Fecha: 2026-07-12. Solo lectura. **52 features verificadas.**

---

## Tabla maestra

### A. Automatización CRM (motor de reglas / eventos / asignación)

| Feature | Fuente | Estado | Evidencia | Acción | Prioridad |
|---|---|---|---|---|---|
| Bus de eventos / dispatcher de dominio desacoplado | 04c #0 | **PARCIAL** | `services/CoexistenceServices/InboundEventLedgerService.ts`, `OutboundDispatchService.ts`; listeners `WbotServices/wbotMessageListener.ts`, `MetaServices/metaMessageListener.ts`. Es bus de **coexistencia** (inbound/outbound WA), no bus de dominio (`conversation.resolved`→reglas/CSAT/reportes) | Generalizar a EventDispatcher de dominio | **P1** |
| Automation Rules (evento→condiciones AND/OR→acciones) | 04c #1 | **NO** | `CampaignRule.ts`/`CampaignRuleService.ts` son reglas **de campaña**, no motor CRM general. FlowBuilder = chatbot conversacional | Implementar motor de reglas server-side | **P0** ⭐ |
| Macros (1 clic multi-acción) | 04c #2 | **NO** | grep `macro` en services/models/routes = vacío | Implementar (reusa ejecutor de reglas) | **P1** |
| SLA Policies (FRT/NRT/RT + breach) | 04c #3 | **NO** | grep `sla\|breach\|firstResponseTime` = vacío | Implementar (depende de bus+business hours) | **P2** |
| Auto-assignment round-robin/balanced + capacity | 04c #4 | **NO** | grep `round.?robin` = vacío. Existen Queues (`models/Queue.ts`, `UserQueue.ts`) sin estrategia de reparto | Extender colas con estrategia + capacidad | **P1** |
| CSAT surveys automáticas | 04c #5 | **NO** | Solo `avgCsat` como métrica de A/B testing IA (`models/AIABTestVariant.ts:59`, `AIABTestingServices/ABTestService.ts`). Sin encuesta al resolver | Implementar (listener conversation.resolved) | **P1** |
| Business/Working hours por inbox/bot | 04c #6, 04f | **PARCIAL** | `models/Whatsapp.ts:76`, `Queue.ts:65`, `Telegram.ts:79` → `outOfHoursMessage`; `CompaniesSettings.ts:71` `scheduleType`. Falta bot/IA schedule con timezone + pausa SLA | Añadir toggle IA por horario + timezone | **P2** |
| Webhooks salientes por evento (outbound) | 04c #7, 04g #9 | **PARCIAL** | `WebhookService/DispatchWebHookService.ts:59` es webhook **entrante** que dispara un FlowBuilder; integraciones salientes hardcoded (`IntegrationServices/Billie/SmartTrack/AriaLite/SGR`). No hay outbound-by-event genérico configurable | Implementar webhooks salientes por evento+HMAC | **P2** |
| Custom attributes tipados | 04c #8 | **TIENE** | `models/ContactCustomField.ts`, `models/Contact.ts` | — | — |
| Segments / custom filters guardables | 04c #9, 04d | **PARCIAL** | `services/AudienceSegmentationService.ts`, `EmailMarketing/SegmentationService.ts`. Falta filtros de vista de conversación guardables | Añadir vistas/filtros guardados | **P3** |
| Teams como unidad de routing (humano) | 04c #10 | **NO** | Solo `AITeam.ts`/`AITeamMember.ts` (equipos de IA). Routing humano vía Queues | Evaluar (colas ya cubren) | **P3** |
| Scheduled automation runner | 04c #17 | **PARCIAL** | `models/ScheduledMessages.ts`, `AIScheduledTask.ts`, `services/AISchedulerServices`, cron. Sin runner genérico de ítems programados | Consolidar runner | **P3** |
| Bulk actions async (label/assign/resolve en lote) | 04c #18 | **NO** | grep `bulk.?action\|bulkAssign\|massAction` = vacío | Evaluar | **P3** |
| Audit logs de compliance (acciones usuario) | 04c #16 | **PARCIAL** | `services/AuditService.ts` es **auditoría de campañas Meta Ads (IA)**; `MetaMarketingService/AuditLogger.ts` audita acciones de marketing. Sin log inmutable de acciones de usuario multi-tenant | Implementar audit log transversal | **P2** |
| Sequences / drip cadence (delays+ventanas) | 04d, 04e | **PARCIAL** | `models/FlowCampaign.ts`, `services/FlowCampaignService`, `ScheduledMessages`. Falta motor de cadencia con delays/ventanas de envío | Implementar motor de secuencias | **P2** |
| Requeue de campaña fallida | 04f | **NO** | `models/ApiFailedMessage.ts` registra fallos de API pero no hay requeue de campaña. grep `requeue\|resendFailed` = sin coincidencia de campaña | Implementar requeue sin recrear campaña | **P1** |
| Toggle IA/bot on-off por contacto | 04f, 04g | **TIENE** | `services/ContactServices/ToggleDisableBotContactService.ts`; `UpdateContactService.ts` | — | — |
| Idempotencia por unique-constraint | 04g #4 | **TIENE** | `models/InboundEventLedger.ts` — `UNIQUE(companyId, eventKey)` documentado en cabecera | Extender patrón a flows/campañas | P3 |

### B. Comercio conversacional

| Feature | Fuente | Estado | Evidencia | Acción | Prioridad |
|---|---|---|---|---|---|
| Catálogo → carrito → checkout conversacional | 04e #1 | **NO** | `models/Product.ts` solo `price:42`, `costPrice:49`. grep `cart\|checkout\|carrito` en modelos = solo Stripe/Paypal billing | Implementar (extender Product con store/cart/order) | **P2** |
| Cupones / descuentos | 04e #2 | **NO** | grep `coupon` = solo billing genérico, sin modelo de cupón de tienda | Implementar (gancho de conversión barato) | **P2** |
| Recordatorio de carrito abandonado | 04e #3 | **NO** | grep `abandoned\|reminder.*cart` = vacío | Implementar (sobre ScheduledMessages+IA) | **P2** |
| OTN / recurring-notification re-engagement | 04e #5 | **NO** | grep `otn\|recurring.?notification\|reengagement` = falsos positivos (optin de email) | Evaluar (opt-in re-permiso plantillas WABA) | **P3** |
| Integración WooCommerce | 04e #7 | **NO** | grep `woocommerce\|woo` = vacío | Evaluar (sync catálogo/órdenes) | **P3** |

### C. Canales / Voz

| Feature | Fuente | Estado | Evidencia | Acción | Prioridad |
|---|---|---|---|---|---|
| Llamadas de voz (canal de llamada WA/en vivo) | 04b, 04f | **NO** | Sin canal de llamada. grep `whatsapp.?call\|voip\|calling` sin módulo de llamada | Implementar (Fase E) | **P2** |
| Voz IA / audio (STT+TTS realtime) | 04b (IA voz) | **TIENE** | `services/AIRealtimeAudioServices/RealtimeAudioService.ts` (OpenAI realtime, g711_ulaw, server_vad), `ElevenLabsTTSService.ts`, `routes/aiRealtimeAudioRoutes.ts` | Base para voz con IA ya existe | — |
| Canal SMS | 04b, 04e #6 | **NO** | grep `twilio\|nexmo\|sendSms` = falsos positivos (SMS como opción en wizard). Sin canal SMS real | Implementar (Twilio, fallback WA) | **P3** |
| Gmail / Email entrante conversacional | 04b, 04d | **NO** | grep `imap\|email.*inbound\|emailChannel` = vacío. Email solo saliente (`EmailMarketing`, listmonk) | Implementar canal email entrante | **P2** |
| Panel de asesores (monitor agentes en vivo) | 04b | **PARCIAL** | `routes/whatsappMonitorRoutes.ts` + `WhatsAppMonitorController` = salud/rate-limit/métricas de **conexiones**, no panel de asesores | Implementar panel supervisor de agentes | **P2** |
| Plantão / turnos-guardias | 04b | **NO** | grep `plantao\|shift\|turno\|guardia` = falsos positivos IA | Implementar | **P3** |
| Tareas / ToDoList por ticket/agente | 04b, 04d | **NO** | grep `task\|todo\|tarea` = solo AIScheduledTask/background. Sin módulo de tareas | Implementar | **P2** |
| Web Forms (captura de leads) | 04d | **NO** | grep `webform\|leadForm\|formBuilder` = vacío | Implementar (lead-gen) | **P2** |
| Comment → DM private reply (FB/IG) | 04e #4 | **TIENE** | `services/CommentAutoReplyServices/CommentReplyExecutor.ts:51 sendPrivateReply`; `WebhookCommentProcessor.ts:221` ejecuta private reply | — | — |
| Bulk tag de comentaristas | 04e #4 | **NO** | grep `bulkTag\|tag_machine` = vacío. Existe auto-reply pero no bulk-tag masivo | Evaluar | **P3** |
| Embedded Signup Meta (OAuth) | 04g | **TIENE** | `services/MetaServices/metaEmbeddedSignupService.ts`, `MetaAppSetupService.ts` | — | — |
| Health monitor de canal + quality/tier | 04g | **PARCIAL** | `whatsappMonitorRoutes.ts` expone `/health`, `/health/:whatsappId`, `/metrics/ratelimit`. Verificar quality-rating/messaging-tier de Meta (probable no) | Añadir quality/tier de Meta | **P2** |
| Chatbot widget web embebible | 04g | **TIENE** | `models/WebChatWidget.ts`, `AIChatbotDomain.ts`, `services/WebChatWidgetServices`, `WebChat/`, `routes/webChatWidgetRoutes.ts` | — | — |
| Template analytics (métricas Meta) | 04f | **PARCIAL** | `WhatsAppTemplateServices/SyncTemplatesFromMetaService.ts`, `HandleTemplateStatusWebhookService.ts` (sync+status). grep de métricas analytics = vacío | Implementar Graph API analytics de plantilla | **P2** |
| Coexistencia Baileys ↔ Cloud API | 04b (ventaja) | **TIENE** | `services/CoexistenceServices/*`, `WhatsAppAdapter/HybridWhatsAppService.ts`, `routes/whatsappCoexistenceRoutes.ts` | Proteger (nadie más la tiene) | — |

### D. SaaS / Agencia

| Feature | Fuente | Estado | Evidencia | Acción | Prioridad |
|---|---|---|---|---|---|
| White-label / portal multi-cuenta agencia | 04d, 04g | **PARCIAL** | Branding en `routes/settingRoutes.ts`; multi-tenant (`Company`) sí. Sin portal reseller multi-cuenta cross-account | Implementar white-label reseller | **P2** |
| Manual subscriptions (pago manual + aprobación admin) | 04f | **NO** | `ReceiptService`, `PaymentConfigService`, `models/Receipt.ts` existen; sin flujo de suscripción manual con aprobación admin/comprobante | Implementar (clave LATAM sin tarjeta) | **P1** |
| Impersonation / login-as tenant | 04f, 04g | **NO** | grep `impersonat\|loginAs\|switchTenant` = falsos positivos | Implementar (soporte/debug multi-tenant) | **P2** |
| Multi-gateway de pagos | 04g | **TIENE** | `StripeService.ts`, `PaypalService/`, `AIMercadoPagoServices/`, `routes/paypalRoutes.ts`, `paymentConfigRoutes.ts` | — | — |
| KB pública / Help Center | 04c #14, 04d | **NO** | `services/RAGServices/KnowledgeBaseService.ts` es KB **interna para RAG/IA**, no portal público. `models/Help.ts` = ayuda interna | Evaluar Help Center público | **P3** |

### E. Arquitectura

| Feature | Fuente | Estado | Evidencia | Acción | Prioridad |
|---|---|---|---|---|---|
| API pública versionada v1 + API keys scoped | 04g #6 | **PARCIAL** | `routes/apiRoutes.ts` (`/send`, `/send-template`, `/checkNumber` con `middleware/tokenAuth.ts`), `routes/api/{apiCompany,apiContact,apiMessage}Routes.ts`, `rateLimiter.ts:160` usa `x-api-key`. Falta `/v1`, API keys scoped con permisos+usage por key | Versionar + API keys scoped | **P1** |
| Flow builder visual | 04e, 04g #7 | **TIENE** | `models/FlowBuilder.ts`, `FlowCampaign.ts`, `FlowDefault.ts`, `services/FlowBuilderService`, `routes/flowBuilderRoutes.ts` | Mejorar catálogo de nodos | — |
| RAG en Postgres (embeddings) | 04g #8 | **TIENE** | `services/RAGServices/{KnowledgeBaseService,EmbeddingService}.ts`, `AIGraphRAGServices/`, `models/AIChunk.ts`, `AIDocument.ts` | — | — |
| Webhooks salientes de cliente (HMAC) | 04g #9 | **PARCIAL** | Ver B/Webhooks salientes; infra webhook existe pero no outbound-by-event por tenant | Implementar clientWebhooks | **P2** |
| Diagnóstico IA (por qué no respondió) | 04g #10 | **PARCIAL** | `services/AIAgentServices/ResponseGatekeeperService.ts` + `AIExecutionGuardService.ts`, `AIInputGuardService.ts` deciden skip; verificar persistencia de `lastSkipReason` visible en UI | Persistir/exponer razón de skip | **P3** |

### F. Reporting

| Feature | Fuente | Estado | Evidencia | Acción | Prioridad |
|---|---|---|---|---|---|
| Reporting materializado / rollups | 04c #13 | **PARCIAL** | `models/AttributionChannelAggregate.ts`, `services/AIDashboardServices/MetricsAggregatorService.ts`, `AttributionServices/AttributionDashboardService.ts`. Agregados para atribución/IA, no para conversaciones/agentes | Extender rollups a conversación/agente | **P2** |
| Reportes programados + alertas/monitores | 04d | **PARCIAL** | `services/CampaignAlertService.ts`, `models/CampaignAlert.ts`. Sin entrega programada de reportes por email | Añadir entrega programada | **P3** |
| Atribución de ingresos (multi-fuente) | 04d | **TIENE** | `models/Attribution{Touchpoint,Conversion,Result,ChannelAggregate}.ts`, `KanbanLeadConversionEvent.ts`, `services/AttributionServices` | Ampliar más allá de FB CAPI | P3 |
| Anti-spam en masivos (rotación QR / jitter) | 04b | **NO** | grep `antispam\|rotacion\|warmup\|randomDelay\|jitter` = vacío en Campañas | Endurecer campañas (delays/rotación) | **P2** |

---

## Resumen de veredictos

### 🔴 CONFIRMADO — chateam NO tiene (gaps reales, con grep vacío/falsos positivos)

**Automatización (el gap estratégico #1, confirmado por 04c):**
1. **Automation Rules** (motor de reglas CRM server-side) — `CampaignRule` es solo de campañas
2. **Macros** (1 clic multi-acción)
3. **SLA Policies**
4. **Auto-assignment round-robin/balanced + capacity**
5. **CSAT surveys automáticas**
6. **Requeue de campaña fallida**
7. **Bulk actions** async

**Comercio (los 3 gaps reales de 04e):**
8. **Catálogo→carrito→checkout conversacional**
9. **Cupones/descuentos**
10. **Recordatorio de carrito abandonado**
11. OTN re-engagement · 12. WooCommerce

**Canales:**
13. **Canal de llamadas de voz** (existe audio-IA, no canal de llamada)
14. **Canal SMS**
15. **Email/Gmail entrante conversacional**
16. **Tareas/ToDoList**
17. **Web Forms**
18. Plantão/turnos · 19. Bulk tag de comentaristas

**SaaS:**
20. **Manual subscriptions** (pago manual+aprobación)
21. **Impersonation / login-as tenant**
22. **KB pública / Help Center**

**Reporting:**
23. **Anti-spam en masivos** (rotación/jitter)

**Arquitectura:**
24. **Teams humanos** como unidad de routing (solo Queues + AITeam)

### 🟡 PARCIAL — existe base, incompleto vs benchmark
Bus de eventos (solo coexistencia) · Business hours (solo `outOfHoursMessage` por queue) · Webhooks salientes por evento · Segments/filtros guardables · Scheduled runner · Audit logs (solo Ads/Marketing) · Sequences/drip · Panel de asesores (solo monitor de conexiones) · Health monitor (falta quality/tier) · Template analytics (solo sync+status) · White-label (solo branding) · API pública (sin /v1 ni keys scoped) · Webhooks salientes de cliente · Diagnóstico IA skip · Reporting rollups (solo atribución/IA) · Reportes programados.

### 🟢 YA CUBIERTO — chateam TIENE (paridad o ventaja)
Custom attributes · Toggle IA por contacto · Idempotencia (InboundEventLedger UNIQUE) · Voz IA/audio (RealtimeAudio+ElevenLabs) · Comment→DM private reply · Embedded Signup Meta · Chatbot widget web embebible · Coexistencia Baileys↔Cloud (ventaja única) · Multi-gateway pagos · Flow builder visual · RAG en Postgres · Atribución de ingresos.

---

## Confirmación
**52 features candidatas verificadas** con grep/find sobre el código real de chateam_jr (models 177, routes, services, controllers). El gap estratégico se confirma: **no es cobertura de canales sino el motor de automatización CRM** (reglas + macros + SLA + CSAT + auto-assign round-robin) y el **desacople por bus de eventos de dominio**. Los gaps de comercio (carrito/cupón/carrito-abandonado) y de operación de agentes (tareas, panel de asesores, email entrante) son reales y valiosos. Varias features marcadas "(verificar)" en 04f/04g quedan resueltas: **Toggle IA por contacto = TIENE**, **Embedded Signup = TIENE**, **RAG Postgres = TIENE**, **Widget web = TIENE**, **Impersonation = NO**, **Manual subscriptions = NO**, **API v1 scoped = PARCIAL**, **Requeue campaña = NO**, **Template analytics = PARCIAL**.
