# Sesión 2026-04-06 — Refactorización del Orquestador IA

## Problemas Iniciales

1. **El agente no leía el RAG** — clasificaba "hola tienes gps?" como greeting y respondía genéricamente
2. **Doble respuesta** — error FK con `integrationId=999` + catch enviaba segundo mensaje
3. **Mensajes duplicados** — eco de Baileys creaba mensaje duplicado en BD
4. **Re-envío 3 min después** — ProcessPendingMessages recogía mensajes sin `messageStatus`
5. **LLM no entendía historial** — RAG usaba `generateText` (prompt plano) en vez de chat multi-turn
6. **Nombre incorrecto** — respondía como "Mateo" (nombre del asesor virtual en la KB)
7. **"¿Te fue útil?" repetitivo** — se agregaba en casi todos los mensajes por confianza baja
8. **QuickReplies no encontrados** — threshold 0.75 muy alto + embeddings no generados
9. **SemanticCache roto** — columna `embedding` no existe (era `queryEmbedding`)
10. **ModelRouter** — buscaba `type: 'chat'` pero BD tiene `type: 'text'`
11. **ContactMemory** — columnas camelCase vs snake_case en queries SQL
12. **DOCX no se procesaba** — guardaba bytes binarios en vez de extraer texto
13. **Queries cortas** — "Una moto" daba confianza 0.01 → escalación innecesaria

---

## Soluciones Implementadas

### Commit 1: `e97f383` — Refactorización principal (22 archivos)

#### 1. RouterAgent mejorado
**Archivo:** `services/AIAgentServices/RouterAgentService.ts`

- `quickClassify()` ahora detecta contenido sustantivo (preguntas, productos, precios)
- Si el mensaje empieza con saludo PERO contiene pregunta → NO clasifica como greeting → pasa al LLM

#### 2. Eliminar magic number 999
**Archivos:** Whatsapp.ts, Ticket.ts, wbotMessageListener.ts, metaMessageListener.ts, facebookMessageListener.ts, WhatsAppController.ts, CreateWhatsAppService.ts, UpdateWhatsAppService.ts, FindOrCreateTicketService.ts

- Nuevo campo `Whatsapps.useAIOrchestrator` (boolean) — reemplaza `promptId=999`
- Nuevo campo `Tickets.aiStatus` (inactive/active/handoff) — reemplaza `integrationId=999` + `useIntegration`
- Migración BD ejecutada: datos migrados automáticamente
- Frontend: Switch "Orquestador IA" en modales de conexión

#### 3. Fix doble respuesta
**Archivo:** `services/WbotServices/wbotMessageListener.ts`

- Flag `responseSent` evita enviar fallback si ya se envió respuesta IA
- `aiStatus='active'` se marca ANTES de procesar (previene race conditions)
- Catch solo envía "dificultades técnicas" si `!responseSent`

#### 4. Fix mensajes duplicados (eco Baileys)
**Archivo:** `services/AIAgentServices/SupervisorActionsService.ts`

- Mensajes del bot se crean con `wid: 'pending_ai_TIMESTAMP'`
- El eco de Baileys encuentra el mensaje por `wid LIKE 'pending_%'` → actualiza wid real
- `messageStatus: 'sent'` + `ack: 2` → ProcessPendingMessages NO lo re-envía

#### 5. RAG en formato chat multi-turn
**Archivo:** `services/AIAgentServices/RAGAgentService.ts`

- Cambió de `generateText()` (prompt plano) a `chatCompletion()` (mensajes con roles)
- El historial se pasa como mensajes `user`/`assistant` separados
- System prompt separado del contexto RAG
- El LLM entiende la conversación como conversación real

#### 6. Nombre del contacto
**Archivos:** `wbotMessageListener.ts`, `PromptContextBuilder.ts`

- `contactInfo: { name, number, email }` se pasa al SupervisorService
- PromptContextBuilder inyecta sección "👤 CLIENTE ACTUAL" con nombre del contacto
- El LLM usa el nombre real del cliente

#### 7. Confianza RAG corregida
**Archivo:** `services/AIAgentServices/RAGAgentService.ts`

- Antes: usaba `r.score` que no existía → `undefined >= 0.3` → filtraba todo → confianza 0.1
- Ahora: usa `vectorScore` (similitud coseno real) del HybridSearchService
- Umbral de escalación bajado de 0.4 a 0.15

#### 8. QuickReplies semánticos con imágenes
**Archivos:** `QuickReplySemanticService.ts`, `SupervisorService.ts`, `wbotMessageListener.ts`

- Threshold bajado de 0.75 a 0.45
- Embeddings generados para los 10 QuickMessages habilitados
- Query SQL incluye `mediaPath` y `mediaName`
- Solo se envía 1 imagen (la más relevante) después del texto
- System prompt instruye al LLM a no repetir info de la imagen

#### 9-11. Fixes de servicios
- **SemanticCacheService:** `embedding` → `"queryEmbedding"` en todas las queries SQL
- **ModelRouterService:** `type: 'chat'` → `type: 'text'`
- **ContactMemoryService:** camelCase → snake_case en queries SQL

#### 12. ShowTicketService
**Archivos:** `ShowTicketService.ts`, `ShowTicketFromUUIDService.ts`

- Agregado `aiStatus` a los attributes del ticket
- Agregado `useAIOrchestrator` a los attributes del include de Whatsapp

---

### Commit 2: `1937f1b` — Sistema de correcciones + aprendizaje (8 archivos)

#### Panel de Correcciones (problema → solución)
**Archivos nuevos:** `AISupportCorrection.ts`, `CorrectionSearchService.ts`, `AISupportCorrectionController.ts`, `aiCorrectionRoutes.ts`

- Tabla `AISupportCorrections`: problema, solución, categoría, embedding, por empresa
- Búsqueda semántica con threshold 0.60 (prioridad máxima sobre RAG)
- CRUD: `GET/POST/PUT/DELETE /ai/corrections`
- PromptContextBuilder inyecta correcciones como "🔧 CORRECCIONES VERIFICADAS (PRIORIDAD MÁXIMA)"

#### Panel de Memorias Aprendidas
- `GET /ai/memories` — Ver memorias extraídas por la IA
- `PUT /ai/memories/:id` — Corregir contenido o marcar verificada
- `DELETE /ai/memories/:id` — Eliminar memoria incorrecta

#### Jobs de aprendizaje activados
**Archivo:** `backendQueues.ts`

Los 3 jobs existían pero no tenían handlers en `server-distributed.ts`:
- `ExtractMemoryJob` — Extrae memorias al cerrar ticket (preferences, facts, objections, interests, decisions)
- `FeedbackInferenceJob` — Evalúa satisfacción del cliente (5 min delay)
- `HumanCorrectionExtractorJob` — Detecta correcciones de agentes humanos (ventana 2 min)

---

### Sin commit aún: QueryEnrichmentAgent + búsqueda multi-query

#### QueryEnrichmentAgent (NUEVO)
**Archivo:** `services/AIAgentServices/QueryEnrichmentAgent.ts`

- REEMPLAZA al RouterAgent para clasificación LLM (conserva `quickClassify` por patrones)
- En UNA sola llamada LLM genera: intención, query enriquecida, query HyDE, alternativas, keywords
- Usa el proveedor de texto configurado con fallback a gpt-4.1

#### Búsqueda multi-query en RAGAgent
**Archivo:** `services/AIAgentServices/RAGAgentService.ts`

- Ejecuta 4 búsquedas en paralelo: enrichedQuery (w=0.4) + HyDE (w=0.3) + alternativa (w=0.2) + keywords BM25 (w=0.1)
- Fusiona resultados con deduplicación por chunkId
- Bonus x1.3 para chunks que matchean en múltiples queries
- Confianza basada en fusedScore normalizado

#### Procesamiento DOCX
**Archivo:** `controllers/AIGraphRAGController.ts`

- Instalado `mammoth` para extraer texto de archivos .docx/.doc
- El contenido se extrae correctamente (36,080 caracteres del manual de vendedor)

#### gpt-4.1 como modelo default
- Todos los `AIAgentConfigs` actualizados a `modelKey: 'gpt-4.1'`
- Modelos sin provider (openrouter, mistral, gemini, etc.) desactivados en `AIEntities`

#### SDK Anthropic instalado
- `@anthropic-ai/sdk@0.82.0` instalado (API key de Anthropic inválida, sistema usa OpenAI como fallback)

---

## Tablas BD nuevas/modificadas

| Tabla | Cambio |
|-------|--------|
| `Whatsapps` | +`useAIOrchestrator` BOOLEAN DEFAULT false |
| `Tickets` | +`aiStatus` VARCHAR(20) DEFAULT 'inactive' |
| `AISupportCorrections` | **NUEVA** — problema, solución, embedding, por empresa |

---

## Archivos creados

| Archivo | Descripción |
|---------|-------------|
| `services/AIAgentServices/QueryEnrichmentAgent.ts` | Clasificación + enriquecimiento fusionado |
| `services/AIAgentServices/CorrectionSearchService.ts` | Búsqueda semántica de correcciones |
| `models/AISupportCorrection.ts` | Modelo Sequelize |
| `controllers/AISupportCorrectionController.ts` | CRUD correcciones + memorias |
| `routes/aiCorrectionRoutes.ts` | Endpoints REST |

## Archivos modificados (principales)

| Archivo | Cambios |
|---------|---------|
| `SupervisorService.ts` | QueryEnrichmentAgent reemplaza RouterAgent, pasa datos enriquecidos |
| `RAGAgentService.ts` | Búsqueda multi-query, chat multi-turn, confianza por fusedScore |
| `wbotMessageListener.ts` | useAIOrchestrator, aiStatus, responseSent, QuickReply media |
| `SupervisorActionsService.ts` | wid pending_ai, messageStatus sent, aiStatus handoff |
| `RouterAgentService.ts` | quickClassify mejorado (conservado para patrones rápidos) |
| `PromptContextBuilder.ts` | Sección cliente + correcciones verificadas |
| `QuickReplySemanticService.ts` | Threshold 0.45, mediaPath en resultados |
| `SemanticCacheService.ts` | queryEmbedding en queries SQL |
| `ModelRouterService.ts` | type: 'text' |
| `ContactMemoryService.ts` | snake_case en queries SQL |
| `backendQueues.ts` | 3 jobs de aprendizaje registrados |
| `ShowTicketService.ts` | +aiStatus, +useAIOrchestrator en attributes |

---

## Endpoints nuevos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/ai/corrections` | Listar correcciones de la empresa |
| POST | `/ai/corrections` | Crear corrección (genera embedding) |
| PUT | `/ai/corrections/:id` | Editar corrección (regenera embedding) |
| DELETE | `/ai/corrections/:id` | Desactivar corrección (soft delete) |
| GET | `/ai/memories` | Ver memorias aprendidas por la IA |
| PUT | `/ai/memories/:id` | Corregir memoria |
| DELETE | `/ai/memories/:id` | Eliminar memoria |

---

## Pendientes para próxima sesión

1. **Frontend** — Panel de correcciones + panel de memorias en React
2. **Frontend** — Build del frontend (Switch orquestador IA)
3. **Agentes por empresa** — AIAgentConfigs con companyId para prompts personalizados
4. **PDF parser** — `pdfParse is not a function` sigue roto para PDFs
5. **SemanticCache** — verificar que el cache funciona end-to-end
6. **Pruebas de conversación** — validar flujo completo con el QueryEnrichmentAgent
