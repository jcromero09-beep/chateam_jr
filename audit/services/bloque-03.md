# Bloque 03 — Auditoría de Servicios (`services/`)

Alcance: 87 servicios `.ts` — 29 sueltos en `services/` (maxdepth 1) + 11 carpetas
(FlowBuilderService, CampaignMessageServices, UGCCampaignServices, RAGServices,
InvoicesService, DialogChatBotsServices, AIImageCreditService, BaileysServices,
AIObservabilityServices, AICostOptimizationServices, OmnichannelServices).
Modo: SOLO LECTURA. Clases: REAL / PARCIAL / MOCK / STUB / MUERTO / NO-VERIFICABLE.

## Conteo por clase

| Clase | N.º | Servicios |
|---|---|---|
| REAL | 78 | (mayoría) |
| PARCIAL | 3 | AuditService, AttributionService, CreateInvoiceService |
| MOCK | 0 | — |
| STUB | 0 | — |
| MUERTO | 6 | CircuitBreakerService, S3Service, CheckCreditsService, DebitCreditsService, ListDialogChatBotsServices, UpdateDialogChatBotsServices |
| NO-VERIFICABLE | 0 | — |
| **Total** | **87** | |

Cross-tenant (modelo con `companyId` consultado sin filtrarlo): **13 servicios**.

## Tabla por servicio

### FlowBuilderService (12)
| Servicio | Clase | Riesgos (ruta:línea) |
|---|---|---|
| CreateFlowBuilderService | REAL | - (findOne+create filtran company_id) |
| DeleteFlowBuilderService | REAL | **cross-tenant IDOR**: findOne `where{id}` + destroy sin company_id `FlowBuilderService/DeleteFlowBuilderService.ts:6-14` |
| DispatchWebHookService | REAL | **cross-tenant**: Webhook tiene company_id; filtra solo user_id+hash_id `FlowBuilderService/DispatchWebHookService.ts:24-39`. Bug: retorna objeto pre-update `:41` |
| DuplicateFlowBuilderService | REAL | **cross-tenant read**: findOne `where{id}` sin company_id `FlowBuilderService/DuplicateFlowBuilderService.ts:13-17` |
| FlowsGetDataService | REAL | - |
| FlowUpdateDataService | REAL | - |
| GetFlowBuilderService | REAL | Menor: catch sin return → undefined `:33-35` |
| ListFlowBuilderService | REAL | - |
| UpdateFlowBuilderService | REAL | - |
| UploadAllFlowBuilderService | REAL | - |
| UploadAudioFlowBuilderService | REAL | - |
| UploadImgFlowBuilderService | REAL | - |

### CampaignMessageServices (9)
| Servicio | Clase | Riesgos (ruta:línea) |
|---|---|---|
| CampaignMessageFlowLogger | REAL | debug default "true" hardcode `:5` |
| CountCampaignMessagesByStatusService | REAL | heurística monto `"[1-9]"` `:25` |
| CreateCampaignMessageService | REAL | **cross-tenant (write)**: `Ticket.update(where{id})` sin companyId `CampaignMessageServices/CreateCampaignMessageService.ts:101` |
| CtwaClidResolver | REAL | hardcode prefijo `"Afi"` `:52,57` |
| FindByTicketIdService | REAL | **cross-tenant IDOR**: `findAll(where{ticketId})` sin companyId `CampaignMessageServices/FindByTicketIdService.ts:15` |
| ImportSalesFromExcelService | REAL | hardcode país `"593"`/AD_SOURCE_TYPES (dominio); queries con companyId |
| ListCampaignMessagesService | REAL | regexp monto `"[1-9]"` `:79,85` |
| ShowCampaignMessageService | REAL | - (id+companyId) |
| UpdateCampaignMessageService | REAL | **cross-tenant IDOR**: `findByPk(id)` sin companyId `CampaignMessageServices/UpdateCampaignMessageService.ts:17` |

### InvoicesService (6)
| Servicio | Clase | Riesgos (ruta:línea) |
|---|---|---|
| CreateInvoiceService | PARCIAL | bug: `ShowInvoceService(invoice.id)` sin companyId (firma exige 2 args) → undefined `InvoicesService/CreateInvoiceService.ts:28`; console.log `:29` |
| DeleteInvoiceService | REAL | **cross-tenant IDOR**: `findOne(where{id})`+destroy sin companyId `InvoicesService/DeleteInvoiceService.ts:5` |
| FindAllInvoiceService | REAL | - (filtra companyId) |
| ListInvoicesServices | REAL | **cross-tenant**: `findAndCountAll` SIN companyId → lista facturas de TODAS las empresas `InvoicesService/ListInvoicesServices.ts:33` |
| ShowInvoiceService | REAL | - (id+companyId) |
| UpdateInvoiceService | REAL | **cross-tenant IDOR**: `findByPk(id)` sin companyId `InvoicesService/UpdateInvoiceService.ts:12` |

### DialogChatBotsServices (5)
| Servicio | Clase | Riesgos (ruta:línea) |
|---|---|---|
| CreateDialogChatBotsServices | REAL | - (modelo sin companyId, keyed contactId) |
| DeleteDialogChatBotsServices | REAL | - |
| ListDialogChatBotsServices | MUERTO | 0 refs externas; bug SQL: `order[["name","ASC"]]` col inexistente `:11` |
| ShowDialogChatBotsServices | REAL | - |
| UpdateDialogChatBotsServices | MUERTO | 0 refs externas; bug: attr `"awaitingt"` typo/col inexistente `:24,36` |

### UGCCampaignServices (8)
| Servicio | Clase | Riesgos (ruta:línea) |
|---|---|---|
| CreateUGCCampaignService | REAL | - (defaults por env UGC_*_PROVIDER) |
| LaunchUGCCampaignService | REAL | - |
| ListUGCCampaignsService | REAL | SQL literal `searchParam` en ILIKE sobre JSONB, escapa comilla `:49` (companyId sí filtrado) |
| PauseUGCCampaignService | REAL | - |
| ShowUGCCampaignService | REAL | - |
| UpdateModelSelectionService | REAL | - |
| PipelineSelectionSchemas | REAL | - (helper Zod interno UGC) |
| ValidatePipelineSelection | REAL | - (validador puro) |

### RAGServices (7)
| Servicio | Clase | Riesgos (ruta:línea) |
|---|---|---|
| BM25SearchService | REAL | hardcode idioma 'spanish' `:30` (companyId filtrado `:138`) |
| ChunkingService | REAL | - (lógica pura de texto) |
| EmbeddingService | REAL | hardcode modelo `text-embedding-3-small` `:26`; jitter Math.random `:90` (no es dato) |
| HybridSearchService | REAL | hardcodes pesos RRF 0.6/0.4 `:31-32` (companyId propagado) |
| KnowledgeBaseService | REAL | **cross-tenant (mitigado por controller)**: `DELETE AIChunks WHERE documentId` sin companyId `RAGServices/KnowledgeBaseService.ts:354`; findByPk sin companyId `:161,345` |
| SemanticCacheService | REAL | bug correctness: `cleanup()` ejecuta DELETE dos veces `:238-255`; threshold 0.95 `:34` |
| VectorSearchService | REAL | - (companyId filtrado `:112`) |

### InvoicesService — ver arriba. AIImageCreditService (4)
| Servicio | Clase | Riesgos (ruta:línea) |
|---|---|---|
| CalculateImageCostService | REAL | hardcode tasa 1 crédito=$0.01 `:65` |
| CheckCreditsService | MUERTO | 0 refs externas; verificación reimplementada inline en GenerateImagesWithOpenAIService |
| DebitCreditsService | MUERTO | 0 refs externas; débito reimplementado inline; hardcode 0.01 `:109` |
| GetUserCreditsBalanceService | REAL | hardcode 0.01 `:140` (companyId filtrado) |

### BaileysServices (3)
| Servicio | Clase | Riesgos (ruta:línea) |
|---|---|---|
| CreateOrUpdateBaileysService | REAL | - (modelo sin companyId, keyed whatsappId); setTimeout 1000ms `:63` |
| DeleteBaileysService | REAL | - |
| ShowBaileysService | REAL | - |

### AIObservabilityServices (2) · AICostOptimizationServices (1) · OmnichannelServices (1)
| Servicio | Clase | Riesgos (ruta:línea) |
|---|---|---|
| PerformanceService | REAL | - (raw SQL parametrizada por companyId) |
| TracingService | REAL | **cross-tenant**: `completeTrace` findOne solo traceId `AIObservabilityServices/TracingService.ts:105`; `completeSpan` solo spanId `:173` (mitigado: UUID) |
| CostOptimizerService | REAL | hardcode lista modelos premium `:134` (companyId filtrado) |
| OmnichannelDispatcher | REAL | - (valida ticket.companyId===input.companyId `:231`) |

### Sueltos — IA / copy / scoring
| Servicio | Clase | Riesgos (ruta:línea) |
|---|---|---|
| AIClientService | REAL | hardcodes modelos fijos `gpt-5.5`/whisper-1/tts-1/dall-e-3/claude-3-sonnet/gemini-pro; apiKey en crudo `:209` |
| AIProviderService | REAL | providers GLOBAL companyId=null por diseño `:49-56` |
| AdCopyGeneratorService | REAL | hardcode `companyId=1` `AdCopyGeneratorService.ts:156,164`; modelo `gpt-5.5` `:324` |
| CreativeScoringService | REAL | hardcode `companyId=1` `CreativeScoringService.ts:107,115`; modelo `gpt-5.5` `:275` |

### Sueltos — analítica / stats
| Servicio | Clase | Riesgos (ruta:línea) |
|---|---|---|
| AnomalyDetectionService | REAL | hardcodes baseline reglas `:353-354,369,393-395` (sin query directa) |
| AttributionService | PARCIAL | confianza fabricada 0.9/0.7/0.8/0.6/0.95 `AttributionService.ts:186,203,227,259,275,464`; STUB `findHistoricalTouchpoints`→[] `:303-305`; STUB fetchFacebook/Google→null `:531-540` |
| AudienceSegmentationService | REAL | - (delega filtro companyId a ContactTemperatureService) |
| StatisticsService | REAL | PRNG LCG `:219-220` = muestreo Thompson reproducible (NO dato fabricado); sin BD |
| StatsRecommendationService | REAL | - (raw SQL con bind companyId) |
| KanbanMetricsService | REAL | **cross-tenant**: subquery correlada `getAvgTimeInStage` sin companyId `KanbanMetricsService.ts:179-182`; companyId interpolado sin bind `:401,403` |
| ContactTemperatureService | REAL | - (queries filtran companyId) |
| CampaignFatigueService | REAL | - (raw SQL con bind companyId `:93`) |
| MonthlyReportService | REAL | hardcode path `/usr/bin/google-chrome` `:16`, `--no-sandbox` `:111` |

### Sueltos — infra / billing / backup
| Servicio | Clase | Riesgos (ruta:línea) |
|---|---|---|
| AuditService | PARCIAL | datos Meta/CRM fabricados `AuditService.ts:179,213`; URLs CSV a archivos inexistentes `:392-400`; persistencia STUB (`saveAuditResult` solo console.log `:413`, `getAuditHistory`→[] `:425`, `getAuditMetrics`→0 `:433`) |
| CampaignAlertService | REAL | - (companyId-scoped) |
| CampaignApprovalService | REAL | - |
| CampaignAuditConversationService | REAL | SQL literal `rawData->>'campaignId'` escapado `:183` (mitigado); companyId filtrado |
| CampaignRecommendationService | REAL | hardcode `companyId=1` (config IA SuperAdmin, por diseño) `:105`; modelo `gpt-5.5` `:257` |
| CampaignRuleService | REAL | `getActiveRulesDue` sin companyId `:679` (job global; cada regla porta su companyId) |
| CircuitBreakerService | MUERTO | implementación real (Redis fail-open) pero 0 refs externas |
| DriveBackupService | REAL | inyección menor en query Drive `name='${company.name}'` sin escapar `:247`; companyId-scoped |
| EmailPlanService | REAL | `dailyUsage` aproximado con uso de ciclo `:172` (parcial menor) |
| FileLifecycleService | REAL | **cross-tenant IDOR**: `Media.findByPk(mediaId)` sin company_id en `confirmUpload:121`, `getDownloadUrl:229`, `deleteFile:250` |
| MediaBackupService | REAL | - (path-traversal blindado `:214`) |
| PaymentConfigService | REAL | lee config pago de Company SuperAdmin (global por diseño); devuelve secretos crudos |
| S3Service | MUERTO | wrapper real `@aws-sdk/client-s3` pero 0 refs externas |
| StripeCheckoutService | REAL | `success_url` usa `STRIPE_OK_URL` SIN fallback `:92,119` |
| StripeService | REAL | usa `STRIPE_SECRET_KEY` env `:22` (inconsistente vs StripeCheckout/PaymentConfig que leen key de Company); URLs con env fallback |
| UGCContentVariationService | REAL | - (variación determinista `index%array`, NO Math.random) |

## Veredicto (3 líneas)

1. Base sólida y mayormente REAL (78/87): CRUD, RAG (embeddings/pgvector reales), IA (llamadas a proveedores reales), billing Stripe y backups Drive/Media están cableados y funcionales; no hay MOCK ni STUB puros y solo 6 servicios MUERTOS (código real pero desconectado, incl. 2 que fueron reimplementados inline).
2. El hallazgo grave y transversal son **13 servicios con fuga cross-tenant/IDOR**: consultas por `id`/`ticketId`/`mediaId`/`documentId` sobre modelos que sí tienen `companyId` sin filtrarlo — impacto máximo en facturación (ListInvoices lista TODO), media (FileLifecycle entrega/borra archivos ajenos) y flujos (DeleteFlowBuilder borra flujos ajenos).
3. Riesgo secundario: fabricación de datos en `AuditService` (URLs CSV inexistentes + persistencia stub) y `AttributionService` (confianza inventada + fetch stubs), más inconsistencia de origen de la Stripe key y varios hardcodes de modelo `gpt-5.5` (inexistente) como fallback.

## Top-10 peores

1. **ListInvoicesServices.ts:33** — cross-tenant: `findAndCountAll` sin companyId lista facturas de TODAS las empresas (fuga financiera global).
2. **FileLifecycleService.ts:121,229,250** — IDOR: `Media.findByPk(mediaId)` sin company_id → URL presignada/confirmación/borrado de media de cualquier tenant (exfiltración + destrucción).
3. **DeleteInvoiceService.ts:5** / **UpdateInvoiceService.ts:12** — IDOR: borrar/modificar facturas de cualquier empresa por `id`.
4. **DeleteFlowBuilderService.ts:6-14** — IDOR: borrar flujos de cualquier empresa por `id` (destructivo).
5. **UpdateCampaignMessageService.ts:17** / **FindByTicketIdService.ts:15** — IDOR: leer/modificar mensajes de campaña cross-tenant.
6. **AuditService.ts:392-433** — PARCIAL/fabricación: URLs CSV a archivos que nunca se generan + persistencia solo `console.log` (dashboard de auditoría no persiste nada).
7. **AttributionService.ts:303-305,531-540** — PARCIAL: stubs (`[]`/`null`) + `attribution_confidence` fabricado hardcodeado.
8. **DispatchWebHookService.ts:24-39** / **DuplicateFlowBuilderService.ts:13-17** — cross-tenant: webhook y duplicado leen/actúan sin filtro estricto de company_id.
9. **CircuitBreakerService.ts / S3Service.ts** — MUERTOS: infraestructura real de resiliencia y de S3 nunca cableada (código útil sin uso).
10. **TracingService.ts:105,173** / **KanbanMetricsService.ts:179-182** / **KnowledgeBaseService.ts:354** — cross-tenant mitigados (UUID / controller / ticketId) pero incumplen el filtro explícito por companyId.
