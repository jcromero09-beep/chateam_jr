# Bloque 08 — Auditoría de Servicios (SOLO LECTURA)

Alcance: 13 directorios de servicio, **87 archivos `.ts`**. Clasificación por archivo.
Fecha: 2026-07-27. Sin builds/tests/escrituras a BD.

## Tabla por servicio (directorio)

| Servicio | #arch | Desglose de clases | Cross-tenant | Notas clave |
|---|---|---|---|---|
| IntegrationsServices | 18 | REAL 15 · PARCIAL 1 · MOCK 1 · MUERTO 1 | latente (0 wired) | `OpenaiServicesF&G` embedding dummy (MOCK); `pdfReader` self-exec (MUERTO); `clasificarEtapaCliente` clasificador comentado (PARCIAL) |
| SocialCommentServices | 14 | REAL 13 · PARCIAL 1 | 1 (Ingest) | `CommentModerationService` funciones muertas (PARCIAL); Ingest sin gate de moderación en auto-reply |
| ChatService | 11 | REAL 9 · MUERTO 2 | 5 | Update/Delete/ShowFromUuid **wired sin companyId** (IDOR); FindAll/Show MUERTOS |
| Statistics | 9 | REAL 8 · NO-VERIFICABLE 1 | 0 | KPIs = SQL real scopeado por companyId. `DashTicketsAndTimes` usa schema legacy `tenantId`/`LogTickets` (drift, NV) |
| AppointmentServices | 7 | REAL 5 · PARCIAL 2 | 4 | Slots **reales desde BD** (no fabricados); `findByPk(serviceId/contactId)` sin companyId; `getServiceStats`/`processReminders` stubs |
| AIImageGenerationService | 6 | REAL 6 | 0 | Débito créditos con SELECT FOR UPDATE; anti path-traversal; check IDOR en delete. Sólido |
| QueueService | 6 | REAL 6 | 0 | CRUD scopeado; `normalizeQueueChatbots` helper puro |
| IntegrationServices | 5 | REAL 3 · PARCIAL 2 | 2 (latente) | `BaseIntegrationService` clave AES por defecto + salt estático; `SGR.processWebhook` no-op; `AriaLite` sync solo-log |
| ReportService | 4 | REAL 4 | 0 | `DashbardDataService` KPIs/NPS reales scopeados |
| FlowDefaultService | 3 | REAL 3 | 0 | CRUD scopeado por companyId |
| DashboardServices | 2 | REAL 2 | 0 | companyId en todas las queries; `console.log` debug en prod (menor) |
| AutomationServices | 1 | REAL 1 | 0 | Motor de reglas real; valida tenant vía Show{User,Queue}Service; try/catch aislado |
| WhatsAppCloudAPI | 1 | REAL 1 | 0 | Cliente axios real a graph.facebook.com; wired vía WhatsAppAdapter; config inyectada por caller |

## Conteo por clase (nivel archivo, n=87)

| Clase | # |
|---|---|
| REAL | 76 |
| PARCIAL | 6 |
| MOCK | 1 |
| STUB | 0 |
| MUERTO | 3 |
| NO-VERIFICABLE | 1 |

**Math.random para KPIs: 0** (Statistics/Dashboard/Report son SQL real scopeado — sin fabricación).
**Archivos con exposición cross-tenant: 12** (7 alcanzables/wired: ChatService Update/Delete/ShowFromUuid, Appointment CRUD/Booking/Availability/AIScheduling; 5 latentes/muertos: ChatService FindAll/Show, SmartTrack, Billie, Ingest).

## Veredicto (3 líneas)

1. La capa está mayormente **REAL y cableada**: KPIs (Statistics/Dashboard/Report) son SQL real con filtro `companyId`, sin `Math.random` ni datos fabricados; AutomationServices es un motor de reglas legítimo y AIImageGeneration está bien blindado.
2. El problema sistémico es **aislamiento multi-tenant a nivel de servicio**: `findByPk/findOne` por id sin `companyId` en ChatService y AppointmentServices producen **IDOR cross-tenant reales y alcanzables** (editar/borrar chats y servicios de otra empresa).
3. Deuda menor: 3 MUERTOS (destacado `pdfReader` self-exec), 1 MOCK que degrada silenciosamente el RAG social, cifrado de credenciales con clave/salt por defecto, y un gate de moderación de comentarios que se puentea en el path de auto-reply.

## ≤10 peores (ruta:línea)

1. **ChatService/UpdateService.ts:13** — `Chat.findByPk(data.id)` sin companyId/owner; **wired** (ChatController:85). IDOR: cualquiera edita título y **destruye+recrea membresía** de un chat ajeno.
2. **ChatService/DeleteService.ts:7** — `Chat.findOne({where:{id}})` sin companyId; **wired** (ChatController:12). IDOR: borrado cross-tenant de chats.
3. **AppointmentServices/AppointmentServiceCRUD.ts:62** — `update()` con `findByPk(data.id)` sin companyId; **wired**. IDOR: renombrar/reprecio/desactivar servicios de otra empresa. (`getServiceStats` stub, TODO :167).
4. **IntegrationServices/BaseIntegrationService.ts:25,226,241** — clave AES por defecto + salt estático `'salt'` si `INTEGRATION_ENCRYPTION_KEY` no está seteada → secretos de integración recuperables.
5. **IntegrationsServices/OpenaiServicesF&G.ts:63-68** — vector de embedding **dummy (ceros)**: la recuperación de base de conocimiento en FB/IG siempre retorna vacío; el bot responde sin contexto y sin error (MOCK).
6. **SocialCommentServices/IngestCommentService.ts:368-384** — encola auto-reply cuando modo≠manual **sin clasificación de sensibilidad**; `moderateIncomingComment`/`canAutoReply` (CommentModerationService.ts:54,77) son código muerto → comentarios ofensivos/legales pueden auto-publicarse.
7. **AppointmentServices/BookingService.ts:83,143 · AvailabilityService.ts:146 · AISchedulingService.ts:52,74,363** — `AppointmentService/Contact/Appointment.findByPk` sin companyId → reservar contra servicio de otro tenant y fuga de precio/duración/contacto (usado también en prompts IA).
8. **SocialCommentServices/IngestCommentService.ts:111-120** — `resolveConnection` sin companyId: webhook sin tenant; si una misma página está conectada por 2 empresas, los comentarios se atribuyen a la fila que devuelva `findOne`.
9. **IntegrationsServices/pdfReader.ts:54** — MUERTO auto-ejecutable: corre `procesarPdf()` en cualquier import contra archivo hardcodeado (`smartrack.pdf`, `ada-002`), mutando ChromaDB.
10. **Statistics/DashTicketsAndTimes.ts** — NO-VERIFICABLE: usa esquema legacy (`tenantId`, `LogTickets`, `isActiveDemand`, `closedAt`ms) inexistente en el modelo actual; wired en statisticsRoutes pero probablemente roto en runtime (schema drift). Honorable: `ChatService/ShowFromUuidService.ts:5` lectura cross-tenant (wired, mitigada por uuid).

### Menores / observaciones
- `ChatService/FileCleanupService.ts:37` — operador Sequelize legacy `$ne` (debería `[Op.ne]`): el filtro de `mediaPath` no aplica.
- `Statistics/ContactsReportService.ts:7-38` — tabla DDD→estado **brasileña** hardcodeada (chateam es Ecuador; código legacy, funcional pero region-mismatch).
- `IntegrationServices/SmartTrack:210,292,331,372` y `Billie:293,326,356,382` — `findByPk` sin companyId (mitigado por connection-scope; vector latente).
- `procesarArchivoYEmbeddings.ts:182` — `chmodSync 0o777`.
- `SGRIntegrationService.ts:177-180` (webhook no-op) y `AriaLiteIntegrationService.ts:282,330,369,378` (sync solo-log, `value:0`) → PARCIAL.
