# Auditoría de Servicios — Bloque 02

Alcance: 87 servicios `.ts` en 11 carpetas de `services/` (UGCProviders, CampaignService, AIChatbotServices, TicketNoteService, ScheduleServices, ScheduledMessagesService, UGCSocialProviders, AIDashboardServices, AIGraphRAGServices, AICoingateServices, monitoring).
Método: inspección dirigida (find + wc + grep de señales: Math.random/faker/TODO/secretos/URLs/companyId/findByPk; deep-read de sospechosos y de todos los CRUD tenant-scoped). Verificación de importadores para código muerto. Solo lectura.
Fecha: 2026-07-27.

## Conteo por clase

| Clase | Nº |
|---|---|
| REAL | 81 |
| PARCIAL | 2 |
| MOCK | 0 |
| STUB | 2 |
| MUERTO | 2 |
| NO-VERIFICABLE | 0 |
| **Total** | **87** |

Con riesgo cross-tenant: **8 confirmados** + **3 condicionales** (companyId opcional / widget global).
`Math.random` como dato fabricado: **0** (único uso es semilla legítima en `ComfyUIProvider.ts:139`).

## Servicios con señales (evidencia)

Solo se listan servicios con hallazgos; el resto son REAL sin señales relevantes.

| servicio | clase | señales (evidencia ruta:línea) |
|---|---|---|
| TicketNoteService/FindAllTicketNotesService.ts | REAL | **CROSS-TENANT GRAVE**: `TicketNote.findAll()` **sin ningún filtro** → devuelve notas internas de TODAS las empresas. `FindAllTicketNotesService.ts:4`. TicketNote no tiene `companyId`; el scope correcto es vía include de Ticket (ver ShowTicketNoteService). |
| TicketNoteService/ListTicketNotesService.ts | REAL | **CROSS-TENANT**: `findAndCountAll` filtra sólo por `note LIKE searchParam`, sin acotar por Ticket/company → `ListTicketNotesService.ts:33`. Lista notas de otras empresas. |
| TicketNoteService/UpdateTicketNoteService.ts | REAL | **CROSS-TENANT**: `TicketNote.findByPk(id)` + `update({note})` sin validar company → `UpdateTicketNoteService.ts:14,20`. Edita nota de otra empresa por id. |
| TicketNoteService/DeleteTicketNoteService.ts | REAL | **CROSS-TENANT**: `TicketNote.findOne({where:{id}})` + `destroy()` sin scope → `DeleteTicketNoteService.ts:5,13`. Borra nota de otra empresa por id. |
| TicketNoteService/FindNotesByContactIdAndTicketId.ts | REAL | cross-tenant menor: filtra sólo por `ticketId`, sin validar company del ticket → `:22,27`. Depende de que el caller pase un ticketId propio. |
| TicketNoteService/CreateTicketNoteService.ts | REAL | Escribe `contactId` (línea 8,32) pero la tabla **no tiene** columna `contactId` (comentado en FindNotesByContactIdAndTicketId:13); campo probablemente ignorado. Menor. |
| CampaignService/CancelService.ts | REAL | **CROSS-TENANT**: `Campaign.findByPk(id)` sin validar `companyId` del solicitante → `CancelService.ts:21`. `companyId` sólo se lee de la fila para log/socket. Cancela + limpia jobs de campaña ajena. |
| CampaignService/RestartService.ts | REAL | **CROSS-TENANT**: `Campaign.findByPk(id)` sin validar company → `RestartService.ts:20`. Reencola campaña de otra empresa. |
| ScheduledMessagesService/UpdateService.ts | REAL | **CROSS-TENANT**: llama `ShowService(id)` **sin companyId** → `UpdateService.ts:42`; `ShowService(id,companyId)` con companyId `undefined` degrada a `where:{id}` → actualiza mensaje programado ajeno. Además `console.log(data)` debug `:84`. |
| CampaignService/DeleteService.ts | REAL | cross-tenant condicional: `companyId` **opcional**; `where.companyId` sólo se añade `if (companyId !== undefined)` → `:9-14`. Si el controller no lo pasa, borra por id sin scope. |
| CampaignService/ShowService.ts | REAL | cross-tenant condicional: mismo patrón `companyId?` opcional → `:26-29`. Sin scope si se omite. |
| AIDashboardServices/DashboardWidgetsService.ts | REAL | cross-tenant menor: `getSystemStatus` consulta `AIAgentLogs` **sin `companyId`** (`:261-271`) y se incluye en `getAllWidgets` (`:394`) → filtra salud/latencia por modelo agregada de todas las empresas a cada tenant. `getTopCompanies` (`:292`) devuelve todas las empresas (admin, no en getAllWidgets). Resto de widgets bien acotados. |
| AIDashboardServices/MetricsAggregatorService.ts | REAL | `companyId` **interpolado crudo** en SQL: `AND "companyId" = ${companyId}` → `:13` (no parametrizado; riesgo bajo por ser number tipado, pero inconsistente con el resto que usa replacements). |
| AICoingateServices/CoingateService.ts | REAL | Webhook **sin verificación de firma/HMAC**: `processWebhook` confía en el payload crudo → `CoingateService.ts:133-151`. Riesgo de spoof de estado de pago. Token vía env (OK). URLs base sandbox/prod OK. |
| AIChatbotServices/TrainChatbotService.ts | PARCIAL | "Pipeline RAG" **simulado**: chunks/tokens son heurísticos fabricados `Math.ceil(len/500)` y `len/4`; file/url/ticket_history sólo setean `chunksCount=1, tokensCount=0` y loguean, **sin embeddings ni ingesta real** → `:55-104`. Marca `trained` igual. Máquina de estados + DB reales. Scope por companyId OK. |
| AIGraphRAGServices/GraphRAGService.ts | PARCIAL | Scores/edges **hardcodeados**: `score:0.8` (`:217`), `weight:0.5` (`:205`). `buildGraphFromDocument` cuenta `totalEdges` pero **nunca los persiste** (`:116-120`). Extracción de entidades vía LLM es real; grafo es cosmético. Scope companyId OK. |
| AIGraphRAGServices/TicketAutoIndexService.ts | REAL | Inserta AIChunks **sin vector de embedding** ("simplified - single chunk" `:111`) → no recuperable por búsqueda vectorial. Query de Messages sólo por `ticketId` sin company `:29-42` (caller acota). Resumen LLM + inserts reales. |
| monitoring/RateLimitMonitor.ts | MUERTO | Lógica real (Redis KEYS/TTL) pero **0 importadores** en todo el repo. `REDIS_PORT` default `'5000'` (custom, no secreto). |
| UGCProviders/CloudinaryProvider.ts | MUERTO | Integración real (upload/transform Cloudinary, 347 L) pero **0 referencias** en el repo (ni "CloudinaryProvider" ni "Cloudinary"). Feature sin cablear. |
| UGCProviders/fal/FalTTSProvider.ts | STUB | `export default {}` + `// PR #2 placeholder` → `:1-2`. 0 importadores. (El TTS real se sirve vía FalClient + adapters/F5TTS). |
| UGCProviders/fal/FalLipsyncProvider.ts | STUB | `export default {}` + `// PR #2 placeholder` → `:1-2`. 0 importadores. (Lipsync real vía adapters/LatentSync·SyncLipsync). |
| ScheduleServices/ShowService.ts | REAL | Chequeo tenant presente (`schedule?.companyId !== companyId` `:18`) pero **antes** del null-check (`:22`) → orden invertido; import muerto `channel` de diagnostics_channel `:6`. Mensaje de error copy-paste ("excluir"). Funcional. |

### REAL sin señales (resumen por carpeta)
- **CampaignService**: CreateService, UpdateService (endurecido por estado persistido, scope companyId), ListService, FindService, CleanupCampaignJobsService — todos acotados/correctos.
- **AIChatbotServices**: CreateService, UpdateService, ListService, ShowService, DeleteService, AddDataSourceService — todos con `where:{id,companyId}` correcto.
- **ScheduleServices**: CreateService, DeleteService, ListService, UpdateService, resolveScheduleTicketId — scope companyId correcto.
- **ScheduledMessagesService**: CreateService, ShowService, DeleteService, ListService — scope companyId correcto (sólo UpdateService rompe).
- **TicketNoteService**: ShowTicketNoteService (scope vía include Ticket.companyId — patrón correcto).
- **UGCSocialProviders** (4): Facebook/Instagram/TikTok/YouTube — integraciones axios reales (Graph/TikTok/YouTube API); credenciales por parámetro (accessToken), no env. URLs base de API legítimas.
- **UGCProviders** (~35 REAL): Cloudinary(muerto), ComfyUI, Creatomate, FFmpeg(spawn), Flux/Wan(→ComfyUI), Kling, Runway; `fal/*` (FalClient, FalImageProvider, FalVideoProvider, submitWithAdapter, 17 adapters, catalog/types/errors/config/registry); `higgsfield/*` (Client, Provider, catalog/models/mapper/config/types/errors). Módulos de datos/config y clientes HTTP reales. URLs base de proveedores (fal.ai, runway, kling, higgsfield, googleapis) son endpoints legítimos, no hardcodes sospechosos.
- **AICoingateServices**: createOrder/getOrder/getSupportedCurrencies/isConfigured reales (token env); único gap es firma de webhook.

## Veredicto (3 líneas)
1. El bloque es mayoritariamente REAL y bien cableado; el fraude/mock es nulo (0 MOCK, sin datos fabricados por Math.random), y sólo 2 STUB (placeholders fal) + 2 MUERTOS (RateLimitMonitor, CloudinaryProvider — lógica real sin importadores).
2. El riesgo dominante es **cross-tenant sistémico en TicketNoteService** (4 de 7 servicios sin scope, incl. `findAll()` global) y en 2 acciones de Campaign (Cancel/Restart por `findByPk` sin validar company) + Update de ScheduledMessages.
3. Las capacidades "IA" pesadas están a medias: TrainChatbot y GraphRAG fabrican métricas/scores y no ejecutan embeddings reales (PARCIAL), y el webhook de Coingate no valida firma.

## Top ≤10 más problemáticos
1. `TicketNoteService/FindAllTicketNotesService.ts:4` — `findAll()` global, fuga total de notas internas cross-empresa (P0).
2. `TicketNoteService/DeleteTicketNoteService.ts:5,13` — delete cross-tenant por id (P0).
3. `TicketNoteService/UpdateTicketNoteService.ts:14,20` — update cross-tenant por id (P0).
4. `CampaignService/CancelService.ts:21` — cancel + cleanup de campaña ajena por id (P0/P1).
5. `CampaignService/RestartService.ts:20` — restart/reencola campaña ajena por id (P1).
6. `ScheduledMessagesService/UpdateService.ts:42` — `ShowService(id)` sin companyId → update cross-tenant (P1).
7. `TicketNoteService/ListTicketNotesService.ts:33` — list cross-tenant (P1).
8. `AICoingateServices/CoingateService.ts:133` — webhook de pago sin verificación de firma/HMAC (P1).
9. `AIChatbotServices/TrainChatbotService.ts:55-104` — RAG simulado; chunks/tokens fabricados, sin embeddings (PARCIAL, expectativa incumplida).
10. `AIDashboardServices/DashboardWidgetsService.ts:261-271,394` — widget getSystemStatus filtra salud agregada cross-empresa a cada tenant (P2) + `MetricsAggregatorService.ts:13` companyId sin parametrizar.
