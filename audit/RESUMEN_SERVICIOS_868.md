# Re-auditoría exhaustiva de los 868 servicios — síntesis y calificación

> 2026-07-27 · 10 agentes read-only en paralelo, cobertura de **los 868 servicios** de `services/`
> (no muestreo). Detalle por bloque en `audit/services/bloque-01..10.md`. Clasificación por servicio:
> REAL / PARCIAL / MOCK / STUB / MUERTO / NO-VERIFICABLE.

## Distribución (agregado de los 10 bloques + MetaServices)
- **REAL ≈ 92 %** — lógica genuina y cableada. La gran mayoría del árbol funciona de verdad; **no es
  vaporware ni mayormente mock**.
- **MUERTO ≈ 30-40 servicios (~4 %)** — andamiaje sin cablear: agentes IA (`Escalation`, **`Guardrails`**,
  `Sales`), cluster `MetaServices/strategies/` completo, `MetaMessageForwardService`, `saveInboundMessage`,
  `DispatchAckReconciler`, `ProcessWhatsAppConversion`, dir `ScheduledMessagesEnvioService/` entero,
  `CircuitBreakerService`, `S3Service`, `botonesActionsWebhookService` (1.139 L duplicadas), `pdfReader`.
- **PARCIAL ≈ 15-20** — reales con rutas incompletas o simuladas.
- **MOCK real (datos fabricados) ≈ 5** — `AttributionService` (revenue $86.700/289 conv inventados),
  `OpenaiServicesF&G` (embedding dummy), `AuditService` (CSV inexistente + persistencia solo
  `console.log`), `TrainChatbotService` (RAG simulado, marca `trained` sin embeddings), `GraphRAGService`
  (scores 0.8/0.5 hardcodeados).
- **STUB ≈ 6-8** — `MetaMessage{Edit,Delete}` (Cloud API no soporta), `strategyIA/Queue`, `FalTTS/Lipsync`.

## Hallazgo dominante: aislamiento multi-tenant roto de forma sistémica
**~55-65 servicios** con `find/update/destroy` sobre modelos con `companyId` **sin filtrarlo** (IDOR).
Muchos **cableados y explotables**:
- `FindAllTicketNotesService` — fuga total de notas internas de TODAS las empresas.
- `InvoicesService` List/Delete/Update, `ReceiptService` (marca "paid") — **financiero cross-tenant**.
- `GetSettingService` (por `key`), `ChatService` Update/Delete, `AppointmentServiceCRUD`,
  `Campaign` Cancel/Restart, `ContactList`/`AIAgentConfig`/`CampaignSetting` Update, `ListChatBots`,
  `FileLifecycleService` (media)…
- Los 6 DELETE que remedié en esta jornada (W1-SEC-12) eran **~10 %** de los gaps. El resto sigue abierto.
  (Parte mitigada por guards de controller o super-gate; ~25-40 genuinamente alcanzables.)

## Otros hallazgos transversales
- **Defaults de secreto débiles**: `"changeme"`, `"whaticket"`, pin `"000000"`, salt `'salt'`,
  `"default-key-change-in-production"`, `REDIS_SECRET_KEY "MULTI100"`.
- **Webhooks de pago sin firma**: Coingate, MercadoPago (sin HMAC); PayPal no revalida monto capturado.
  (Núcleo Stripe/PayPal de `SubscriptionService` **sí** firmado — confirmado.)
- **god-object** `wbotMessageListener.ts` 6.764 L (`verifyQueue` 1.813, `handleMessage` 1.281).
- **`IngestCommentService`** auto-responde comentarios **sin gate de moderación** → viola el invariante
  declarado ("cola de revisión obligatoria, cero publicación automática").
- **`gpt-5.5`** (modelo inexistente) hardcodeado como fallback en ~4-8 servicios IA.
- Token de sesión WebChat con `Math.random` (débil).

## Correcciones a auditorías previas (refutadas por evidencia)
- Providers de email (SendGrid/SES/Carbonio) **son reales, no stubs**.
- KPIs de Statistics/Dashboard/Report son **SQL real scopeado**, sin `Math.random`.
- TikTok **real y en producción** (cron 5 min + refresh 1 h).
- Créditos/Billing/Plan/Stripe/PayPal **reales, transaccionales, fail-closed** (LOCK/idempotencia).

## Calificación real: **5.5 / 10**
La re-auditoría exhaustiva movió mi estimación previa (6) en dos direcciones opuestas que casi se
compensan, con saldo levemente negativo:
- **↑ El producto está genuinamente construido** (~92 % real; varias afirmaciones pesimistas refutadas;
  dinero sólido). Mejor de lo temido.
- **↓ El aislamiento multi-tenant —la propuesta de valor central del SaaS— está roto de forma
  sistémica** (~55-65 IDOR a nivel servicio, muchos explotables, incl. financiero y notas internas),
  muy por encima de los P0 de endpoint que se cerraron. Para un SaaS multi-tenant es la clase de defecto
  más dañina.

| Eje | Nota |
|---|---|
| Realidad/funcionalidad (no-mock) | 8 |
| Manejo de dinero (core) | 7 |
| **Aislamiento multi-tenant** | **3** (sistémicamente roto) |
| Deuda técnica (muerto + god-object) | 4 |
| Seguridad transversal (defaults, webhooks) | 4 |
| Rendimiento / ops / contratos | 4 |

**Media ponderada ≈ 5.5.** Veredicto en una frase: *un producto real y ambicioso, pero cuya garantía
central —que la empresa A no vea/toque los datos de la empresa B— falla en decenas de servicios; hasta
cerrar eso, no es apto para operar `live` con datos de clientes distintos con confianza.*

Confianza: **alta** (clasificación de los 868, no muestreo). Matiz: "exhaustivo" = cada servicio tocado y
clasificado por inspección dirigida; los IDOR son señales con ruta:línea que requieren confirmar
alcanzabilidad ruta-por-ruta antes de contarlos todos como explotables.
