# Bloque 06 — Auditoría de Servicios (SOLO LECTURA)

Alcance: 13 módulos de `services/` — **87 archivos `.ts`** (84 top-level + 3 en `Generation/orchestrator/`).
Fecha: 2026-07-27. Clasificación: REAL / PARCIAL / MOCK / STUB / MUERTO / NO-VERIFICABLE.

## Conteo por clase

| Clase | Nº | Notas |
|-------|----|-------|
| REAL | 85 | Lógica + cableado + integración real (OpenAI, fal.ai, Higgsfield, Baileys, créditos) |
| PARCIAL | 1 | `DeviceCommandService` (transporte ADB/WebSocket placeholder) |
| MUERTO | 1 | `OptimizationSchedulerService` (0 referencias externas) |
| MOCK | 0 | Ningún servicio devuelve datos fabricados al usuario |
| STUB | 0 | Ningún servicio vacío/not-implemented |
| NO-VERIFICABLE | 0 | — |

**Cross-tenant:** 6 servicios sin scoping por `companyId` (5 en ChatBotServices + SyncTagsService).

## Tabla por módulo (solo no-REAL y de riesgo; el resto = REAL)

| Servicio | Líneas | Clase | Riesgo (ruta:línea) |
|----------|-------:|-------|---------------------|
| WbotServices/wbotMessageListener.ts | **6764** | REAL | God-object. `verifyQueue` ~1813 líneas (L1861-3674); `handleMessage` ~1281 (L4806-6087); `handleMessageIntegration` ~625 (L4062-4687). Sin TODO/FIXME. |
| WbotServices/ChatBotListener.ts | 1675 | REAL | 2º god-object. Math.random L643 (charset ID, benigno) |
| UGCOptimizationServices/OptimizationSchedulerService.ts | 69 | **MUERTO** | 0 callers (comentario dice "worker/CronJob" pero nada lo invoca) |
| AgentDeviceServices/DeviceCommandService.ts | 102 | **PARCIAL** | L93-99: transporte es placeholder, retorna `sent:true` sin enviar realmente |
| ChatBotServices/ListChatBotServices.ts | 17 | REAL | **cross-tenant** L4-12: `findAll` SIN companyId → lista chatbots de TODAS las empresas |
| ChatBotServices/ShowChatBotServices.ts | 50 | REAL | **cross-tenant** L6-8: `findOne({where:{id}})` sin companyId (IDOR) |
| ChatBotServices/UpdateChatBotServices.ts | 69 | REAL | **cross-tenant** L18: `findOne` por id sin companyId + upsert/destroy opciones (IDOR write) |
| ChatBotServices/ShowChatBotByChatbotIdServices.ts | 33 | REAL | **cross-tenant** L7: `findOne({where:{chatbotId}})` sin companyId |
| ChatBotServices/DeleteChatBotServices.ts | 11 | REAL | **cross-tenant** L8: `destroy()` sin verificación companyId |
| TagServices/SyncTagsService.ts | 26 | REAL | **cross-tenant** L14,18: `Contact.findByPk` + `ContactTag.destroy/bulkCreate` por contactId sin companyId |
| UGCOptimizationServices/BudgetOptimizationService.ts | 219 | REAL | Hardcode modelo `"gpt-5.5"` L106 (comentario dice GPT-4o); modelo inexistente → riesgo runtime |
| UGCOptimizationServices/FeedbackLoopService.ts | 353 | REAL | Hardcode `"gpt-5.5"` L247,296 (doc dice GPT-4o) |
| UGCOptimizationServices/LearningExtractionService.ts | 231 | REAL | Hardcode `"gpt-5.5"` L107,202 (doc dice GPT-4o-mini) |
| AIWriterServices/AIWriterService.ts | 246 | REAL | Hardcode `"gpt-5.5"` L56,167,198 |
| WbotServices/SendWhatsAppMessageLink.ts / SendWhatsappMediaImage.ts | 67/76 | REAL | Math.random (charset filename, benigno) |

Resto de módulos = **REAL** y correctamente scopeados por `companyId`:
MessageServices (13), NotificationServices (8), CompaniesSettings (3, `UpdateCompanySettingService` con whitelist anti-SQLi), AIEmailTemplateServices (3, fallback template de sistema), Generation (7: contrato + registry + markup + orquestador con idempotencia y reserva/refund de créditos), AIVideoCreditService (1), UGCImageServices (1, fal.ai + deduct/refund), y el resto de WbotServices/TagServices/AgentDeviceServices.

## Veredicto (3 líneas)

1. Base madura y **real**: 85/87 servicios con lógica e integraciones productivas (OpenAI, fal.ai, Higgsfield, Baileys, sistema de créditos con reserva/refund y scoping multi-tenant); no hay MOCK ni STUB.
2. **Deuda estructural crítica:** `wbotMessageListener.ts` es un god-object de 6764 líneas con funciones de ~1800 líneas (`verifyQueue`), inmantenible y de alto riesgo de regresión.
3. **Seguridad:** módulo legacy `ChatBotServices` (5 servicios) + `SyncTagsService` operan sin `companyId` → IDOR cross-tenant; además `"gpt-5.5"` hardcodeado (modelo inexistente) en 4 servicios de IA amenaza fallos en runtime.

## ≤10 peores

1. `WbotServices/wbotMessageListener.ts:1861` — `verifyQueue` ~1813 líneas (god-object, mantenibilidad crítica).
2. `ChatBotServices/ListChatBotServices.ts:4` — `findAll` sin companyId: fuga cross-tenant de chatbots de todas las empresas.
3. `ChatBotServices/UpdateChatBotServices.ts:18` — update/destroy por id sin companyId (IDOR escritura).
4. `ChatBotServices/ShowChatBotServices.ts:6` — `findOne` por id sin companyId (IDOR lectura).
5. `ChatBotServices/DeleteChatBotServices.ts:8` — `destroy()` sin verificación de tenant.
6. `ChatBotServices/ShowChatBotByChatbotIdServices.ts:7` — `findOne` por chatbotId sin companyId.
7. `TagServices/SyncTagsService.ts:14` — `Contact.findByPk` + reescritura de ContactTag por contactId sin companyId.
8. `UGCOptimizationServices/OptimizationSchedulerService.ts:13` — MUERTO: scheduler sin ningún caller (optimización autónoma nunca se dispara).
9. `AgentDeviceServices/DeviceCommandService.ts:93` — PARCIAL: retorna `sent:true` sin transporte real (ADB/WebSocket).
10. `UGCOptimizationServices/BudgetOptimizationService.ts:106` (y FeedbackLoop:247, LearningExtraction:107, AIWriter:56) — `"gpt-5.5"` hardcodeado (modelo inexistente; doc dice GPT-4o).
