# Bloque 10 — Auditoría de Servicios

Alcance: 12 grupos de servicio bajo `services/`. Solo lectura. Clasificación por grupo + riesgo por archivo (`ruta:línea`).
Leyenda: REAL=lógica+cableado real · PARCIAL=real con rutas incompletas · MOCK=datos fabricados · STUB=vacío/no-implementado · MUERTO=sin refs · NV=requiere ejecución.

## Tabla de clasificación

| # | Servicio | Clase | Evidencia / Riesgo principal |
|---|----------|-------|------------------------------|
| 1 | CompanyService | REAL | CRUD + notificaciones/schedules reales. IDOR superadmin: `ShowCompanyService.ts:5`, `DeleteCompanyService.ts:5` (por id crudo, sin tenant). `generateRandomColor.ts:10` Math.random (benigno). |
| 2 | TicketServices (núcleo) | REAL | `ShowTicketService.ts:25` scoped por companyId + doble check `:130`. Núcleo (ListTickets 24KB, UpdateTicket 37KB) real. Bug menor orden null-check `ShowTicketService.ts:130` (antes de `:134`). |
| 3 | TelegramService | REAL | Telegram Bot API real (`TelegramBotAPI.ts:133` api.telegram.org). Cross-tenant IDOR `DeleteTelegramService.ts:5` (id sin companyId). `StartTelegramSession.ts:221` TODO polling. |
| 4 | AnnouncementService | REAL | Tenant-hardened (Delete `:6`, List `:27` scoped). Cross-tenant: `FindAllService.ts:4` devuelve TODOS los anuncios (sin companyId). |
| 5 | WhatsAppTemplateServices | REAL | Meta Graph API real (`SubmitTemplateToMetaService.ts:104`, `SyncTemplatesFromMetaService.ts:65`). PARCIAL: `DeleteWhatsAppTemplateService.ts:33` TODO (borra local, no en Meta). Placeholder `HandleTemplateStatusWebhookService.ts:124`. |
| 6 | AIVideoGenerationService | REAL | OpenAI Sora real, patrón worker async. `GenerateVideoWithOpenAIService.ts:268` TODO: débito real a AICreditBalance pendiente (contabilidad incompleta). |
| 7 | ReceiptService | REAL (con fugas $) | Cross-tenant sin scope: `UpdateReceiptService.ts:17` marca Invoice "paid" `:39` sin ownership; `ListReceiptsService.ts:20` global; `ShowReceiptService.ts:7`; `DeleteReceiptService.ts:5`. |
| 8 | QueueOptionService | PARCIAL | `ListService.ts:36` scoped (Ola 3), pero IDOR: `ShowService.ts:5`, `UpdateService.ts:17`, `DeleteService.ts:4` (por id, sin tenant). |
| 9 | UGCCreatorServices | PARCIAL | Registro pago + scope OK (`ProcessCreatorPaymentService.ts:47,57`), pero desembolso es STUB: `:98-114` Stripe Transfer y `:116-128` PayPal Payout son placeholders; marca `processing` sin enviar dinero. |
| 10 | PaypalService | REAL | PayPal SDK real + idempotencia (`CapturePaypalOrderService.ts:55`). Riesgo $: NO revalida monto capturado vs esperado; confía `custom_id.months` `:96-98` → loop dueDate `:144`. Ownership de invoice no validado en servicio. Creds superadmin global cacheadas `paypalConfig.ts:11`. |
| 11 | TokenTrackingService | REAL | Cobro transaccional con `LOCK.UPDATE` `TokenTrackingService.ts:53`, chequeo saldo `:64`, auditoría `:120`. Pricing hardcode `AITokenPricingService.ts:7` (config, aceptable). |
| 12 | ConnectionService | REAL | `ListConnectionsService.ts:35,52` scoped por companyId. Menor: expone `botToken` en respuesta `:109`. |

## Conteo por clase

- REAL: 10 (Company, Tickets, Telegram, Announcement, WhatsAppTemplate, AIVideo, Receipt, Paypal, TokenTracking, Connection)
- PARCIAL: 2 (QueueOption, UGCCreator)
- MOCK: 0 · STUB: 0 (aislado dentro de UGC) · MUERTO: 0 · NV: 0

Cross-tenant / IDOR: 9 gaps claros de scoping — ReceiptService(4), QueueOptionService(3), TelegramService(1), AnnouncementService(1); + 2 por-id superadmin (Company Show/Delete) y 1 controller-level (Paypal invoice ownership).

## Veredicto (3 líneas)

1. La mayoría de servicios son REAL y cableados; la deuda real es de **aislamiento multi-tenant**, no de mocks: ReceiptService y QueueOptionService tienen huecos IDOR explotables por id.
2. Dos rutas de **dinero** están incompletas: UGC no desembolsa (STUB) y PayPal no revalida el monto capturado — ambos permiten inconsistencia financiera silenciosa.
3. Sin MOCK/MUERTO; el patrón muestra hardening tenant previo (Announcement/QueueOption List) que no se replicó a Show/Update/Delete ni a ReceiptService.

## Top-10 peores (prioridad)

1. `ReceiptService/UpdateReceiptService.ts:17,39` — marca Invoice "paid" sin scope/ownership → IDOR financiero.
2. `UGCCreatorServices/ProcessCreatorPaymentService.ts:98-128` — desembolso (Stripe/PayPal) es placeholder/STUB; estado "processing" sin transferir.
3. `PaypalService/CapturePaypalOrderService.ts:96-98,144` — no revalida monto; confía `custom_id.months` para loop de dueDate.
4. `ReceiptService/ListReceiptsService.ts:20` — lista recibos de TODAS las empresas (sin companyId).
5. `QueueOptionService/DeleteService.ts:4` (+ `ShowService.ts:5`, `UpdateService.ts:17`) — IDOR cross-tenant por id.
6. `TelegramService/DeleteTelegramService.ts:5` — borra bot de otra empresa (id sin companyId).
7. `ReceiptService/ShowReceiptService.ts:7` / `DeleteReceiptService.ts:5` — lectura/borrado sin tenant.
8. `AnnouncementService/FindAllService.ts:4` — fuga global de anuncios.
9. `WhatsAppTemplateServices/DeleteWhatsAppTemplateService.ts:33` — TODO: no elimina en Meta (drift local↔Meta).
10. `AIVideoGenerationService/GenerateVideoWithOpenAIService.ts:268` — débito de video no migrado a AICreditBalance (contabilidad IA parcial).
