# Auditoría de Servicios — Bloque 01

Alcance: 86 servicios `.ts` en 10 carpetas de `services/`.
Método: inspección dirigida (head + grep de señales; deep-read de sospechosos). Solo lectura.
Fecha: 2026-07-27.

## Conteo por clase

| Clase | Nº |
|---|---|
| REAL | 82 |
| PARCIAL | 1 |
| MOCK | 0 |
| STUB | 0 |
| MUERTO | 3 |
| NO-VERIFICABLE | 0 |
| **Total** | **86** |

Con riesgo cross-tenant: **2** (1 grave confirmado + 1 menor).

## Servicios con señales (evidencia)

Solo se listan servicios con hallazgos; el resto son REAL sin señales relevantes.

| servicio | clase | señales (evidencia ruta:línea) |
|---|---|---|
| ContactListService/UpdateService.ts | REAL | **CROSS-TENANT GRAVE**: `ContactList.findByPk(id)` + `record.update({name})` sin `companyId` → `ContactListService/UpdateService.ts:12,18`. Contrasta con `DeleteService.ts:6` que sí fue acotado ([W1-SEC-12]). Cualquier company puede renombrar la ContactList de otra por id. |
| AIAgentServices/TicketContextService.ts | REAL | cross-tenant menor: `TicketTag.findAll({where:{ticketId}})` sin validar company del ticket → `TicketContextService.ts:35`. Bajo riesgo (TicketTag es tabla puente sin companyId). |
| UGCSocialServices/ConnectSocialAccountService.ts | REAL | Secreto débil hardcodeado como fallback: `INTEGRATION_ENCRYPTION_KEY \|\| "default-key-change-in-production"` → `ConnectSocialAccountService.ts:25`. Cifra tokens AES-256 con clave por defecto si falta la env. |
| UGCSocialServices/SyncSocialMetricsService.ts | PARCIAL | Placeholder explícito: no consulta APIs reales, solo actualiza `lastSyncAt` y marca `lastSyncSource:"placeholder"`, pero devuelve `synced:true` → `SyncSocialMetricsService.ts:3,40,50,67`. Query real acotado por companyId (OK). |
| AIAgentServices/EscalationAgentService.ts | MUERTO | Lógica real (`export default { evaluate }`) pero **0 referencias externas** en todo el repo (fuera de node_modules). |
| AIAgentServices/GuardrailsService.ts | MUERTO | Lógica real (`export default { ... }`) pero **0 referencias externas**. |
| AIAgentServices/SalesAgentService.ts | MUERTO | Lógica real (`export default { processInquiry }`, incl. query DB) pero **0 referencias externas**. |
| WebChatServices/WebChatSessionService.ts | REAL | `Math.random().toString(36)` para generar token de sesión → `WebChatSessionService.ts:316`. Débil (no cripto) para un token, aunque no es dato fabricado. |
| AIAgentServices/TicketFollowupService.ts | REAL | `Math.random()` → rotación de plantillas de mensaje (no dato fabricado, uso legítimo) `:89`. TODO×1. |
| AIAgentServices/DynamicPromptBuilder.ts | REAL | `Math.random()` → variedad de saludos/despedidas (uso legítimo) `:294,:317`. |
| AIAgentServices/ToolRegistry.ts | REAL | TODO/FIXME×1. Servicio grande (1363 L), cableado a herramientas del orquestador. |
| AIAgentServices/AppointmentAgentService.ts | REAL | TODO/FIXME×1. Servicio grande (1880 L). |
| WhatsAppAdapter/DualAdapter.ts | REAL | TODO/FIXME×1. |
| WhatsAppAdapter/HybridWhatsAppService.ts | REAL | TODO/FIXME×1. |

Notas:
- URLs "hardcodeadas" detectadas (`mcp.facebook.com/ads`, `www.facebook.com/.../oauth`, `api.getzep.com`, `chat.chateam.ws`) son endpoints legítimos de API/frontend, no secretos. No se marcan como riesgo.
- No se detectó `faker`, ni arrays hardcodeados devueltos como datos reales, ni `throw not implemented`.

## Veredicto de salud del bloque (3 líneas)

1. Bloque mayoritariamente REAL y bien cableado (82/86); la capa de agentes IA es genuina y muy consciente de `companyId` (SupervisorService 47 refs, MetaAds 31, CurrentTicketMemory 28).
2. Riesgo #1: fuga cross-tenant real en `ContactListService/UpdateService.ts` (update por id sin companyId) — patrón ya corregido en su hermano Delete, quedó pendiente en Update.
3. Deuda menor: 3 agentes IA muertos (Escalation/Guardrails/Sales) sin wiring, 1 servicio placeholder (SyncSocialMetrics) y 1 clave de cifrado con fallback inseguro en ConnectSocialAccount.

## Top servicios más problemáticos (≤10)

1. **ContactListService/UpdateService.ts** — cross-tenant grave (update sin companyId, `:12/:18`).
2. **UGCSocialServices/ConnectSocialAccountService.ts** — clave AES por defecto insegura (`:25`).
3. **UGCSocialServices/SyncSocialMetricsService.ts** — PARCIAL/placeholder, retorna synced:true sin métricas reales.
4. **AIAgentServices/SalesAgentService.ts** — MUERTO (0 refs), lógica desperdiciada.
5. **AIAgentServices/EscalationAgentService.ts** — MUERTO (0 refs).
6. **AIAgentServices/GuardrailsService.ts** — MUERTO (0 refs); crítico que un servicio de guardrails no esté cableado.
7. **AIAgentServices/TicketContextService.ts** — cross-tenant menor (TicketTag por ticketId sin company).
8. **WebChatServices/WebChatSessionService.ts** — token de sesión con `Math.random` (débil).
9. **AIAgentServices/ToolRegistry.ts** — TODO pendiente en servicio central (1363 L).
10. **AIAgentServices/AppointmentAgentService.ts** — TODO pendiente en servicio muy grande (1880 L).
