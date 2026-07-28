# Bloque 04 — Auditoría de Servicios

Alcance: 12 carpetas de `services/` (WhatsappService, UserServices, SettingServices, PartnerServices, CustomerOriginService, AILearningServices, AIChatbotDomainServices, AISchedulerServices, AIFineTuningServices, AIABTestingServices, AIHeygenServices, SubscriptionService). Inspección dirigida, solo lectura. MetaServices excluido (ya auditado).

## Tabla resumen

| Servicio | Clase | Señales (evidencia) |
|---|---|---|
| **WhatsappService** | REAL | CRUD real de conexiones. `ShowWhatsAppService.ts:48` valida `companyId`. **Cross-tenant (defensa en profundidad):** `DeleteWhatsAppService.ts:5` hace `findOne({where:{id}})`+`destroy()` sin `companyId` (mitigado aguas arriba: `WhatsAppController.ts:557` llama `ShowWhatsAppService(id,companyId)`+`profile==="admin"` antes). `ShowWhatsAppServiceAdmin.ts:43` `findByPk(id)` sin `companyId` (variante admin; usada en `WhatsAppController.ts:733`, `WhatsAppSessionController.ts:284`). `ListAllWhatsAppService` global por diseño (super-admin). |
| **UserServices** | REAL | Auth delega en `AuthServices/LoginSessionService` (real, revoca sesión previa por canal). `CreateUserService`/`UpdateUserService`: Yup + enforcement de asientos por plan (`CreateUserService.ts:79`) + guards anti-privesc [Ola 0.3] (`UpdateUserService.ts:67-72,139-143`). Hashing en modelo User. Sin cross-tenant. |
| **SettingServices** | REAL | `UpdateSettingService.ts:27` guarda cross-tenant; `GetPublicSettingService` con allowlist de claves públicas (no filtra secretos), pero `console.log` de debug (`:33-35`). **Cross-tenant real:** `GetSettingService.ts:11` `findOne({where:{key}})` SIN `companyId` (Setting tiene `companyId`, `models/Setting.ts:38`), expuesto por `SettingController.getSetting:106` sin scope de empresa. |
| **PartnerServices** | REAL | `FindAll`/`findByPk`/`update` sin `companyId` PERO `models/Partner.ts` no tiene `companyId` → modelo global (afiliados, super-admin). No es cross-tenant. |
| **CustomerOriginService** | REAL | Totalmente scopeado a `companyId` (List/Update/GetReport). `GetReportService` con agregaciones reales (count + raw SQL parametrizado con `:companyId`). |
| **AILearningServices** | REAL | Loop de aprendizaje genuino. `CorrectionLearningService` (23KB): idempotencia, pg_trgm similarity, supersede QA, todo por `companyId`, solo INSERT/UPDATE. `HumanCorrectionClassifierAgent`: clasificador LLM real (JSON mode, sanitización defensiva). `AILearningFeatureFlag`: niveles por env/company. |
| **AIChatbotDomainServices** | REAL | CRUD scopeado por `companyId` (`models/AIChatbotDomain.ts:33`). `CreateService` verifica ownership del chatbot y genera `appKey` real (`crypto.randomBytes(24)`). Unicidad de dominio global (correcto). |
| **AISchedulerServices** | REAL | `SchedulerService` CRUD por `companyId`; `getDueTasks`/`runDueTasks` globales por diseño (worker cron). `TaskExecutorService`: 11 handlers reales cablean servicios existentes. **Riesgo SQLi menor:** `TaskExecutorService.ts:194,385` interpola `INTERVAL '${days} days'` con `days=(config.days as number)||30` (cast TS, sin coerción runtime; config admin). |
| **AIFineTuningServices** | REAL | Integración OpenAI genuina: upload de `/v1/files`, `/v1/fine_tuning/jobs` create/status/cancel/events (`FineTuningService`). `DatasetService` construye JSONL desde tickets/KB, SQL parametrizado por `companyId`. Todo scopeado. NO simulado. |
| **AIABTestingServices** | REAL | `ABTestService`: Z-test de dos proporciones + normalCDF (Abramowitz-Stegun) real. `Math.random()` (`:277`) = asignación ponderada de variante A/B (uso legítimo, NO dato de negocio fabricado). Todo por `companyId`. NO simulado. |
| **AIHeygenServices** | REAL | Integración real API Heygen (`api.heygen.com` v1/v2): createVideo/status/avatars/voices/quota. API key vía `getApiKeyWithFallback`. `getVideoStatus(videoId)` sin check de ownership (llamada externa por id, menor). |
| **SubscriptionService** | REAL | `PlanPaymentService.processPaidPlanPayment`: crea/actualiza factura, provisiona créditos IA, reinicia sesiones WA, marca referral, emite socket + FB CAPI. **Webhooks SÍ firmados** aguas arriba: `SubscriptionController.ts:719` (`STRIPE_WEBHOOK_SECRET`+`stripe-signature`), `StripeService.ts:314` (`constructEvent`). Llamado por `SubscriptionController`/`PaypalController`. |

## Conteo por clase

- **REAL: 12**
- PARCIAL: 0
- MOCK: 0
- STUB: 0
- MUERTO: 0 (todas las carpetas tienen referencias externas confirmadas)
- NO-VERIFICABLE: 0

## Veredicto (3 líneas)

Bloque de altísima calidad: las 12 carpetas son implementaciones genuinas y cableadas; las integraciones de pago (Stripe/PayPal con webhook firmado), fine-tuning OpenAI, A/B testing (estadística real) y Heygen NO están simuladas. El único cross-tenant *explotable* es `GetSettingService` (lectura de Setting por `key` sin `companyId`, expuesta sin scope). El resto de señales son defensa-en-profundidad (Delete/ShowAdmin de Whatsapp, gateados en controller) y un SQLi teórico por interpolación de `${days}` en TaskExecutor (config solo-admin).

## Top peores (≤10)

1. **`SettingServices/GetSettingService.ts:11`** — Cross-tenant real: `findOne({where:{key}})` sin `companyId` sobre modelo con `companyId`; alcanzable vía `SettingController.getSetting` (`:106`) sin scope de empresa → un tenant puede leer el valor de un setting de otro tenant por su `key`.
2. **`WhatsappService/DeleteWhatsAppService.ts:5`** — `destroy()` por `id` sin `companyId` (mitigado hoy por `ShowWhatsAppService(id,companyId)`+`admin` en el controller, pero el servicio no autoprotege). Mismo patrón lectura: `ShowWhatsAppServiceAdmin.ts:43` `findByPk` sin `companyId`.
3. **`AISchedulerServices/TaskExecutorService.ts:194,385`** — Interpolación cruda `INTERVAL '${days} days'` (`days` con cast `as number`, sin coerción real); SQLi teórico si `config.days` no numérico. Riesgo bajo (config de tareas solo-admin).
4. **`SettingServices/GetPublicSettingService.ts:33-35`** — `console.log` de debug en caliente (ruido/log-leak menor; la allowlist de claves está bien).
5. **`AIHeygenServices/HeygenService.ts:153`** — `getVideoStatus(videoId)` sin verificación de propiedad por `companyId` (llamada a API externa por id; impacto menor).
