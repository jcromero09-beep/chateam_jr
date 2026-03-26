# Orquestador IA — Flujo Completo de Respuesta Automática

> **Documento generado:** 25-Mar-2026
> **Proyecto:** ChatEAM JR v6.0.0
> **Autor:** Análisis de codebase

---

## TABLA DE CONTENIDOS

1. [Visión General](#1-visión-general)
2. [Arquitectura Multi-Agente](#2-arquitectura-multi-agente)
3. [Flujo End-to-End](#3-flujo-end-to-end)
4. [Sistema RAG — Base de Conocimiento](#4-sistema-rag--base-de-conocimiento)
5. [Etiquetas (Tags) y Contexto](#5-etiquetas-tags-y-contexto)
6. [Historial de Tickets](#6-historial-de-tickets)
7. [Información de Empresa](#7-información-de-empresa)
8. [Búsqueda Híbrida (Vector + BM25)](#8-búsqueda-híbrida-vector--bm25)
9. [Cache Semántico](#9-cache-semántico)
10. [Sistema de Memorias de Contacto](#10-sistema-de-memorias-de-contacto)
11. [QuickReplies Semánticos](#11-quickreplies-semánticos)
12. [Deducción de Créditos IA](#12-deducción-de-créditos-ia)
13. [Rutas de Archivos Clave](#13-rutas-de-archivos-clave)

---

## 1. VISIÓN GENERAL

El orquestador de IA de ChatEAM JR es un **sistema multi-agente** que procesa mensajes entrantes de WhatsApp (Baileys y Meta Cloud API) y genera respuestas automáticas inteligentes.

### Componentes Principales

```
┌─────────────────────────────────────────────────────────────┐
│                    WHATSAPP MESSAGES                        │
│         (Baileys WebSocket / Meta Cloud API)                │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              wbotMessageListener / metaMessageListener      │
│                   (Valida + Crea Ticket)                    │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   SupervisorService                          │
│              (Orquestador Central - Nodo 1)                 │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              RouterAgentService                         │ │
│  │            (Clasificador de Intención)                 │ │
│  └─────────────────────────┬───────────────────────────────┘ │
│                            │                                │
│              ┌─────────────┼─────────────┐                  │
│              ▼             ▼             ▼                  │
│         ┌────────┐   ┌──────────┐   ┌──────────┐          │
│         │  RAG   │   │ Support/ │   │Appointment│          │
│         │ Agent  │   │  Sales   │   │  Agent    │          │
│         └───┬────┘   └────┬─────┘   └────┬─────┘          │
│             │             │               │                │
│             ▼             ▼               ▼                │
│         ┌────────────────────────────────────────┐          │
│         │       HybridSearchService              │          │
│         │   (pgvector + BM25 + RRF Fusion)      │          │
│         └────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              PromptContextBuilder                            │
│         (Constructor Unificado de Contexto)                  │
│                                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Empresa  │ │  Tags    │ │ Historial│ │QuickReplies│     │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. ARQUITECTURA MULTI-AGENTE

### 2.1 SupervisorService — Orquestador Central

**Archivo:** `services/AIAgentServices/SupervisorService.ts`

Es el **punto de entrada único** para toda interacción con IA.

```typescript
interface SupervisorRequest {
  message: string;           // Mensaje del usuario
  companyId: number;         // ID de empresa (multi-tenant)
  ticketId?: number;         // ID del ticket
  contactId?: number;        // ID del contacto
  ticketHistory?: Array<{ role: string; content: string }>;  // Historial
  contactInfo?: Record<string, unknown>;  // Info adicional
  chatbotId?: number;        // ID del chatbot (opcional)
}

interface SupervisorResponse {
  response: string;          // Respuesta generada
  confidence: number;        // Confianza 0-1
  agentUsed: string;         // Agente que respondió
  shouldEscalate: boolean;   // Si debe escalar a humano
  tokensUsed: number;        // Tokens consumidos
  cached: boolean;           // Si vino de cache
  source?: string;           // Fuente: rag, quickreply, memory, agent
}
```

**Flujo interno del Supervisor:**

```typescript
const processMessage = async (request: SupervisorRequest): Promise<SupervisorResponse> => {
  // 1. Construir contexto unificado
  const unifiedContext = await PromptContextBuilder.buildSupervisorContext(request);

  // 2. Clasificar intención con RouterAgent
  const classification = await RouterAgentService.classify(
    request.message,
    request.companyId,
    request.ticketId,
    request.contactId
  );

  // 3. Ejecutar según tipo de agente
  switch (classification.targetAgent) {
    case 'rag':
      return handleRAGAgent(request, classification, unifiedContext);
    case 'support':
    case 'sales':
      return handleAgentWithTools(request, classification, unifiedContext);
    case 'appointment':
      return handleAppointmentAgent(request, classification, unifiedContext);
    case 'escalation':
      return { shouldEscalate: true, ... };
    case 'self':
      return handleGreetingFarewell(request);
  }

  // 4. Evaluar calidad
  if (agentResponse.confidence < 0.4) {
    agentResponse.message += " ¿Necesitas más ayuda?";
  }

  // 5. Deducir créditos
  await DeductCreditsService({ creditTypeKey: 'message', amount: creditsToDeduct });

  return agentResponse;
};
```

### 2.2 RouterAgentService — Clasificador de Intención

**Archivo:** `services/AIAgentServices/RouterAgentService.ts`

Clasifica el mensaje en una de estas intenciones:

```typescript
type IntentType =
  | 'rag_query'           // Pregunta sobre información/documentación
  | 'support_request'     // Problema técnico
  | 'sales_inquiry'       // Consulta comercial
  | 'escalation'          // Solicitud explícita de humano
  | 'appointment_request' // Agendar cita
  | 'appointment_reschedule'
  | 'appointment_cancel'
  | 'greeting'            // Saludo
  | 'farewell'           // Despedida
  | 'general';            // Default
```

**Clasificación en 3 pasos:**

```typescript
const classify = async (input, companyId, ticketId?, contactId?) => {
  // PASO 1: Clasificación rápida por patrones (sin LLM)
  const quickResult = quickClassify(input);
  if (quickResult.confidence > 0.9) return quickResult;

  // PASO 2: Verificar cache semántico
  const cached = await SemanticCacheService.lookup(input, companyId, 'intent');
  if (cached) return cached;

  // PASO 3: Clasificación por LLM (GPT-4.1-mini)
  const llmResult = await AIClientService.generateText({
    systemPrompt: buildClassificationPrompt(),
    messages: [{ role: 'user', content: input }]
  });

  // Guardar en cache
  await SemanticCacheService.store(input, embedding, llmResult, companyId);

  return llmResult;
};

// Clasificación rápida por patrones
const quickClassify = (input: string): QuickClassification | null => {
  const lower = input.toLowerCase();

  // Saludos
  if (/^(hola|buenos días|buenas|hey|hi)/i.test(lower)) {
    return { intent: 'greeting', confidence: 0.95 };
  }

  // Despedidas
  if (/^(adiós|chao|hasta luego|me voy|b-bye)/i.test(lower)) {
    return { intent: 'farewell', confidence: 0.95 };
  }

  // Solicitud de humano
  if (/((hablar|quiero|necesito).*(humano|persona|asesor|agente|operador)|transferir)/i.test(lower)) {
    return { intent: 'escalation', confidence: 0.85 };
  }

  // Citas
  if (/agend|reservar|cita|turno/i.test(lower)) {
    if (/reagend|cambiar/i.test(lower)) return { intent: 'appointment_reschedule', confidence: 0.9 };
    if (/cancel/i.test(lower)) return { intent: 'appointment_cancel', confidence: 0.9 };
    return { intent: 'appointment_request', confidence: 0.85 };
  }

  return null;
};
```

**Selección de modelo por tarea:**

```typescript
// ModelRouterService
const selectModel = (agentType: string): ModelConfig => {
  switch (agentType) {
    case 'router':
      return { model: 'gpt-4.1-mini', temperature: 0.1 };  // Precisión
    case 'rag':
      return { model: 'gpt-4.1-mini', temperature: 0.3 };  // Factual
    case 'support':
    case 'sales':
      return { model: 'gpt-4.1', temperature: 0.7 };       // Creativo
    case 'appointment':
      return { model: 'gpt-4.1-mini', temperature: 0.2 };  // Estructurado
  }
};
```

---

## 3. FLUJO END-TO-END

```
┌────────────────────────────────────────────────────────────────────┐
│                     WHATSAPP / METACLOUD                           │
└─────────────────────────────┬──────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  wbotMessageListener.ts (Baileys) / metaMessageListener.ts (Meta)  │
│                                                                        │
│  1. Validar mensaje (no vacío, no de grupo, no propio)               │
│  2. Crear/Recuperar Contacto                                         │
│  3. Crear/Recuperar Ticket                                           │
│  4. Crear registro Message en BD                                     │
│  5. validateAICapability() → ¿IA habilitada?                         │
└─────────────────────────────┬──────────────────────────────────────┘
                              │
                              ▼ ¿IA habilitada?
              ┌───────────────┴───────────────┐
              │                               │
             NO                              SÍ
              │                               │
              ▼                               ▼
┌─────────────────────────┐    ┌──────────────────────────────────────┐
│  Flujo Normal           │    │  SupervisorService.processMessage()  │
│  (Sin IA)               │    │                                        │
│                         │    │  1. loadTicketContext()                │
│                         │    │     → Tags + Estado Kanban             │
│                         │    │                                        │
│                         │    │  2. RouterAgent.classify()            │
│                         │    │     → Intent + TargetAgent            │
│                         │    │                                        │
│                         │    │  3. Ejecutar agente especializado:    │
│                         │    │                                        │
│                         │    │  ┌──────────────────────────────────┐ │
│                         │    │  │ RAG Agent                        │ │
│                         │    │  │ → HybridSearchService.search()  │ │
│                         │    │  │ → context = chunks[]            │ │
│                         │    │  └──────────────────────────────────┘ │
│                         │    │                                        │
│                         │    │  ┌──────────────────────────────────┐ │
│                         │    │  │ Support/Sales Agent             │ │
│                         │    │  │ → ToolRegistry.getTools()       │ │
│                         │    │  │ → LLM con function_calling      │ │
│                         │    │  └──────────────────────────────────┘ │
│                         │    │                                        │
│                         │    │  ┌──────────────────────────────────┐ │
│                         │    │  │ Appointment Agent               │ │
│                         │    │  │ → Crear/Reagendar/Cancelar      │ │
│                         │    │  └──────────────────────────────────┘ │
│                         │    │                                        │
│                         │    │  ┌──────────────────────────────────┐ │
│                         │    │  │ Escalation                       │ │
│                         │    │  │ → Transfer to human queue        │ │
│                         │    │  └──────────────────────────────────┘ │
│                         │    │                                        │
│                         │    │  4. SemanticCache.lookup()           │
│                         │    │     → ¿Respuesta en cache?          │
│                         │    │                                        │
│                         │    │  5. Quality evaluation               │
│                         │    │     → confidence < 0.4? → sugerir   │
│                         │    │                                        │
│                         │    │  6. DeductCreditsService             │
│                         │    │     → Descontar créditos IA          │
│                         │    │                                        │
│                         │    │  7. AgentLogService.logExecution()   │
│                         │    │     → Registrar métricas             │
│                         │    └──────────────────┬───────────────────┘
              │                               │
              │                               ▼
              │              ┌──────────────────────────────────────┐
              │              │  SendWhatsAppMessage()              │
              │              │  → Respuesta al usuario             │
              │              └──────────────────────────────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────────────────┐    ┌──────────────────────────────┐
│  Continuar flujo normal        │    │  ¡LISTO!                     │
│  de tickets                    │    │  Respuesta enviada            │
└─────────────────────────────────┘    └──────────────────────────────┘
```

---

## 4. SISTEMA RAG — BASE DE CONOCIMIENTO

### 4.1 Arquitectura RAG (Retrieval-Augmented Generation)

```
┌──────────────────────────────────────────────────────────────────┐
│                     INGESTIÓN DE DOCUMENTOS                       │
│                                                                      │
│  Documento (PDF, TXT, URL, DOCX)                                   │
│         │                                                          │
│         ▼                                                          │
│  ┌─────────────────┐                                               │
│  │ KnowledgeBase   │  1. Validar archivo                           │
│  │ Service         │  2. Guardar en disco                         │
│  └────────┬────────┘  3. Actualizar estado: 'processing'          │
│           │                                                           │
│           ▼                                                           │
│  ┌─────────────────┐                                               │
│  │ ChunkingService │  • División semántica por párrafos            │
│  │ .semanticChunk  │  • Max 500 tokens por chunk                   │
│  │                 │  • Extrae keywords                            │
│  └────────┬────────┘                                               │
│           │                                                           │
│           ▼                                                           │
│  ┌─────────────────┐                                               │
│  │ EmbeddingService│  • text-embedding-3-small (1536 dims)          │
│  │ .generateBatch  │  • Batch de 50 chunks                         │
│  │                 │  • Retry con backoff                          │
│  └────────┬────────┘                                               │
│           │                                                           │
│           ▼                                                           │
│  ┌─────────────────┐                                               │
│  │ VectorStore     │  • INSERT en AIChunks                         │
│  │ .storeBatch     │  • embedding::vector(1536)                     │
│  └────────┬────────┘                                               │
│           │                                                           │
│           ▼                                                           │
│  Documento: status = 'completed'                                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                     BÚSQUEDA RAG                                   │
│                                                                      │
│  Query del usuario                                                  │
│         │                                                          │
│         ▼                                                          │
│  ┌─────────────────┐                                               │
│  │ EmbeddingService│  • Generar embedding de query (1536 dims)    │
│  │ .generate       │                                               │
│  └────────┬────────┘                                               │
│           │                                                           │
│           ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              HybridSearchService.search()                   │   │
│  │                                                             │   │
│  │  ┌─────────────────────┐   ┌─────────────────────┐       │   │
│  │  │ VectorSearchService  │   │ BM25SearchService   │       │   │
│  │  │ (pgvector coseno)   │   │ (PostgreSQL tsvector)│       │   │
│  │  │ Peso: 0.6           │   │ Peso: 0.4           │       │   │
│  │  └──────────┬──────────┘   └──────────┬──────────┘       │   │
│  │             │                        │                    │   │
│  │             └───────────┬────────────┘                    │   │
│  │                         ▼                                 │   │
│  │            ┌─────────────────────────┐                   │   │
│  │            │ Reciprocal Rank Fusion  │                   │   │
│  │            │ RRF_score = Σ(w/(k+r))  │                   │   │
│  │            │ k=60                    │                   │   │
│  │            └───────────┬─────────────┘                   │   │
│  └─────────────────────────┼───────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  Chunks mejor rankeados (top-K)                                  │
│         │                                                          │
│         ▼                                                          │
│  ┌─────────────────┐                                               │
│  │ RAGAgentService │  • Construir prompt con contexto              │
│  │ .processQuery   │  • LLM genera respuesta final                 │
│  └─────────────────┘                                               │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 ChunkingService — División de Documentos

**Archivo:** `services/RAGServices/ChunkingService.ts`

**3 estrategias de chunking:**

```typescript
enum ChunkingStrategy {
  SEMANTIC = 'semantic',     // DEFAULT - Por párrafos naturales
  FIXED = 'fixed',           // Por palabras fijas con overlap
  PARENT_CHILD = 'parent_child'  // Jerárquico para FAQs
}

// CHUNKING SEMÁNTICO (DEFAULT)
const semanticChunking = (text: string, options: ChunkOptions): Chunk[] => {
  // 1. Limpiar texto
  const cleaned = cleanText(text);

  // 2. Dividir por párrafos dobles newline
  const paragraphs = cleaned.split(/\n\s*\n/);

  // 3. Combinar párrafos hasta maxTokens
  const chunks: Chunk[] = [];
  let currentChunk = [];
  let currentTokens = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph);

    if (currentTokens + paragraphTokens > MAX_TOKENS && currentChunk.length > 0) {
      // Guardar chunk actual
      chunks.push(createChunk(currentChunk.join('\n\n'), chunks.length));
      // Empezar nuevo con overlap
      currentChunk = currentChunk.slice(-2); // 2 párrafos de overlap
      currentTokens = estimateTokens(currentChunk.join('\n\n'));
    }

    currentChunk.push(paragraph);
    currentTokens += paragraphTokens;
  }

  // Último chunk
  if (currentChunk.length > 0) {
    chunks.push(createChunk(currentChunk.join('\n\n'), chunks.length));
  }

  return chunks.filter(c => c.content.length > 10); // Filtrar ruido
};

// Extracción de keywords
const extractKeywords = (text: string): string[] => {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 3)
    .filter(w => !STOP_WORDS.includes(w));

  return [...new Set(words)]
    .sort((a, b) => countOccurrences(words, a) - countOccurrences(words, b))
    .slice(0, 10);
};
```

### 4.3 RAGAgentService — Generación de Respuestas

**Archivo:** `services/AIAgentServices/RAGAgentService.ts`

```typescript
const processQuery = async (
  query: string,
  companyId: number,
  options: RAGOptions = {}
): Promise<RAGResponse> => {
  const { topK = 5, minRelevance = 0.5, ticketContext } = options;

  // 1. Verificar cache semántico
  const cached = await SemanticCacheService.lookup(query, companyId, 'rag');
  if (cached && cached.confidence > 0.7) {
    return { ...cached, cached: true };
  }

  // 2. Búsqueda híbrida
  const searchResults = await HybridSearchService.search(query, companyId, {
    topK,
    minRelevance,
    includeSourceMetadata: true
  });

  // 3. Si no hay resultados relevantes
  if (searchResults.length === 0) {
    return {
      response: "No encontré información relevante en la base de conocimientos. ¿Deseas que te transfiera con un agente humano?",
      confidence: 0,
      source: 'rag',
      results: []
    };
  }

  // 4. Construir contexto con chunks
  const context = buildRAGContext(searchResults);

  // 5. Generar respuesta con LLM
  const systemPrompt = buildRAGPrompt(query, context, ticketContext);
  const llmResponse = await AIClientService.generateText({
    systemPrompt,
    messages: [{ role: 'user', content: query }],
    model: ModelRouterService.selectModel('rag')
  });

  // 6. Cachear si confianza alta
  if (llmResponse.confidence > 0.7) {
    await SemanticCacheService.store(query, embedding, llmResponse, companyId, {
      type: 'rag',
      sources: searchResults.map(r => r.chunkId)
    });
  }

  return {
    ...llmResponse,
    source: 'rag',
    results: searchResults
  };
};

const buildRAGPrompt = (query: string, context: string, ticketContext?: string): string => {
  const ticketSection = ticketContext ? `\n${ticketContext}\n` : '';

  return `${ticketSection}Eres un asistente experto que responde preguntas usando ÚNICAMENTE la información proporcionada.

CONTEXTO DE LA BASE DE CONOCIMIENTOS:
${context}

REGLAS ESTRICTAS:
1. Responde ÚNICAMENTE con información del contexto proporcionado
2. Si la información no está en el contexto, di "No tengo información sobre eso"
3. Cita las fuentes usando [Fuente N] cuando uses información específica
4. Responde en el mismo idioma que la pregunta del usuario
5. Sé conciso pero completo
6. No inventes ni asumas información

PREGUNTA DEL USUARIO:
${query}

RESPUESTA:`;
};
```

---

## 5. ETIQUETAS (TAGS) Y CONTEXTO

### 5.1 Modelo de Tags con Guía IA

**Archivo:** `models/Tag.ts` (líneas 150-169)

```typescript
// Tags de Seguimiento con campos de IA Guidance
export class Tag extends Model {
  @Column(DataType.STRING)
  name: string;

  @Column(DataType.STRING)
  key: string;

  @Column(DataType.INTEGER)
  kanban: number;  // 0 = tag normal, >0 = etapa Kanban

  @Column(DataType.TEXT)
  description: string;

  // PROMPT DE CONTEXTO IA PARA MENSAJES DE SEGUIMIENTO
  @Column({
    type: DataType.TEXT,
    allowNull: true,
    comment: "Prompt de contexto IA para mensaje de seguimiento 1"
  })
  aiGuidance1: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    comment: "Prompt de contexto IA para mensaje de seguimiento 2"
  })
  aiGuidance2: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    comment: "Prompt de contexto IA para mensaje de seguimiento 3"
  })
  aiGuidance3: string;
}
```

### 5.2 TicketContextService — Extracción de Contexto

**Archivo:** `services/AIAgentServices/TicketContextService.ts`

```typescript
const getTicketContext = async (ticketId: number): Promise<TicketTagContext> => {
  // Cargar todos los tags del ticket
  const ticketTags = await TicketTag.findAll({
    where: { ticketId },
    include: [{
      model: Tag,
      as: 'tag',
      attributes: ['id', 'name', 'key', 'kanban', 'description', 'aiGuidance1', 'aiGuidance2', 'aiGuidance3']
    }]
  });

  // Separar tags Kanban (etapas) vs tags normales
  const kanbanTags = ticketTags.filter(tt => tt.tag?.kanban > 0);
  const normalTicketTags = ticketTags.filter(tt => tt.tag?.kanban === 0);

  // Construir contexto Kanban (etapa del funnel)
  let kanbanStage = null;
  if (kanbanTags.length > 0) {
    const tag = kanbanTags[0].tag; // Solo 1 etapa activa
    kanbanStage = {
      key: tag?.key || '',
      name: tag?.name || '',
      description: tag?.description || '',
      guidancePrompts: [tag?.aiGuidance1, tag?.aiGuidance2, tag?.aiGuidance3].filter(Boolean)
    };
  }

  // Construir contexto de tags normales
  const normalTags = normalTicketTags.map(tt => ({
    name: tt.tag?.name || '',
    description: tt.tag?.description || '',
    guidancePrompts: [tt.tag?.aiGuidance1, tt.tag?.aiGuidance2, tt.tag?.aiGuidance3].filter(Boolean)
  }));

  return { kanbanStage, normalTags };
};

const buildContextPrompt = (context: TicketTagContext): string => {
  const lines = ['**Etapa actual del proceso:**'];

  if (context.kanbanStage) {
    lines.push(`- **Etapa Kanban:** ${context.kanbanStage.name}`);
    lines.push(`- **Descripción:** ${context.kanbanStage.description}`);
    if (context.kanbanStage.guidancePrompts.length > 0) {
      lines.push(`- **Guía IA:** ${context.kanbanStage.guidancePrompts.join(' | ')}`);
    }
  }

  if (context.normalTags.length > 0) {
    lines.push('');
    lines.push('**Tags del ticket:**');
    for (const tag of context.normalTags) {
      lines.push(`- ${tag.name}: ${tag.description}`);
      if (tag.guidancePrompts.length > 0) {
        lines.push(`  → ${tag.guidancePrompts.join(' | ')}`);
      }
    }
  }

  return lines.join('\n');
};
```

### 5.3 Cómo los Tags Influyen en la Respuesta

```
┌─────────────────────────────────────────────────────────────┐
│                    TICKET ACTUAL                            │
│                                                               │
│  Tags: [Lead, Seguimiento, Interesado]                      │
│  Kanban: Etapa 3 - "Calificación"                           │
│  aiGuidance1: "Este lead ya mostró interés en planes Pro"   │
│  aiGuidance2: "Mencionar descuento por pago anual"          │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              PromptContextBuilder                            │
│                                                               │
│  ## 🏷️ ESTADO DEL TICKET ACTUAL                            │
│                                                               │
│  **Etapa Kanban:** Calificación                              │
│  **Descripción:** Lead en proceso de calificación          │
│  **Guía IA:** Este lead ya mostró interés en planes Pro |  │
│                Mencionar descuento por pago anual            │
│                                                               │
│  **Tags del ticket:**                                        │
│  - Lead: Prospecto potencial                                │
│  - Seguimiento: Requiere seguimiento                        │
│  - Interesado: Ha mostrado interés en producto             │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    LLM PROMPT                                │
│                                                               │
│  [Contexto Empresa]                                          │
│  [Contexto Tags + Guía IA]                                   │
│  [Historial conversación]                                     │
│  [Memorias del contacto]                                     │
│                                                               │
│  → La IA sabe que es un lead interesado en Pro              │
│    y puede mencionar el descuento                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. HISTORIAL DE TICKETS

### 6.1 Carga de Historial

**Archivo:** `services/MessageServices/ListMessagesService.ts`

```typescript
const listMessages = async (ticketId: number, options: ListOptions): Promise<MessageList> => {
  const { limit = 20, page = 1 } = options;

  const { count, rows: messages } = await Message.findAndCountAll({
    where: { ticketId },
    include: [
      { model: Contact, as: 'contact', attributes: ['id', 'name'] },
      { model: Ticket, include: [{ model: Queue, as: 'queue' }] }
    ],
    order: [['createdAt', 'ASC']],  // Ascendente para historial
    limit,
    offset: (page - 1) * limit
  });

  return {
    messages: messages.reverse(), // Más recientes primero para mostrar
    count,
    hasMore: count > page * limit
  };
};
```

### 6.2 Formateo para el Supervisor

**Archivo:** `services/AIAgentServices/PromptContextBuilder.ts`

```typescript
const buildHistoryBlock = (ticketHistory: Array<{ role: string; content: string }>): string => {
  const recentHistory = ticketHistory.slice(-20); // Últimos 20 mensajes

  const formattedMessages = recentHistory.map(msg => {
    const role = msg.role === 'assistant' ? '🤖 Agente' : '👤 Cliente';
    const truncated = truncate(msg.content, 150); // Limitar longitud
    return `**${role}:** ${truncated}`;
  });

  return `## 💬 HISTORIAL RECIENTE DE ESTE CHAT

${formattedMessages.join('\n')}

*Nota: Este historial muestra el contexto de la conversación previa. Usa esta información para mantener coherencia en tus respuestas.*`;
};
```

---

## 7. INFORMACIÓN DE EMPRESA

### 7.1 Modelo de Empresa

**Archivo:** `models/Company.ts`

```typescript
export class Company extends Model {
  @Column(DataType.STRING)
  name: string;

  @Column(DataType.STRING)
  phone: string;

  @Column(DataType.STRING)
  email: string;

  @Column({ type: DataType.STRING, defaultValue: "" })
  document: string;

  @Column(DataType.STRING)
  city: string;

  @Column(DataType.JSONB)
  settings: {
    customFields?: Record<string, string>;
    iaSettings?: {
      defaultGreeting?: string;
      defaultAgentName?: string;
      timezone?: string;
    };
  };

  @Column(DataType.JSONB)
  schedules: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isOpen: boolean;
  }>;
}
```

### 7.2 Inyección en Prompts

```typescript
const buildCompanyBlock = async (companyId: number): Promise<string> => {
  const company = await Company.findByPk(companyId, {
    attributes: ['id', 'name', 'phone', 'email', 'city']
  });

  if (!company) {
    return '## 🏢 CONTEXTO DE LA EMPRESA\n*(No disponible)*';
  }

  const parts = [`**EMPRESA:** ${company.name || 'No configurada'}`];

  if (company.email) parts.push(`**Email:** ${company.email}`);
  if (company.phone) parts.push(`**Teléfono:** ${company.phone}`);
  if (company.city) parts.push(`**Ciudad:** ${company.city}`);

  return `## 🏢 CONTEXTO DE LA EMPRESA

${parts.join(' | ')}

*Usa esta información para dar respuestas personalizadas y contextuales.*`;
};
```

---

## 8. BÚSQUEDA HÍBRIDA (VECTOR + BM25)

### 8.1 Reciprocal Rank Fusion (RRF)

**Archivo:** `services/RAGServices/HybridSearchService.ts`

```typescript
const search = async (
  query: string,
  companyId: number,
  options: SearchOptions = {}
): Promise<SearchResult[]> => {
  const { topK = 5, vectorWeight = 0.6, bm25Weight = 0.4 } = options;

  // 1. Generar embedding de query
  const queryEmbedding = await EmbeddingService.generateEmbedding(query, companyId);

  // 2. Ejecutar búsquedas en PARALELO
  const [vectorResults, bm25Results] = await Promise.all([
    VectorSearchService.search(queryEmbedding, companyId, { topK: topK * 2 }),
    BM25SearchService.search(query, companyId, { topK: topK * 2 })
  ]);

  // 3. Aplicar Reciprocal Rank Fusion
  const RRF_SCORE = 60; // Constante de suavizado

  const rankedResults = fuseResults(vectorResults, bm25Results, {
    vectorWeight,
    bm25Weight,
    rrfK: RRF_SCORE
  });

  // 4. Retornar top-K fusionados
  return rankedResults.slice(0, topK);
};

const fuseResults = (
  vectorResults: Result[],
  bm25Results: Result[],
  weights: Weights
): FusedResult[] => {
  const scoreMap = new Map<string, FusedResult>();

  // Agregar resultados vectoriales
  vectorResults.forEach((result, rank) => {
    const rrfScore = weights.vectorWeight / (weights.rrfK + rank + 1);
    scoreMap.set(result.chunkId, {
      ...result,
      rrfScore,
      vectorRank: rank
    });
  });

  // Fusionar con resultados BM25
  bm25Results.forEach((result, rank) => {
    const rrfScore = weights.bm25Weight / (weights.rrfK + rank + 1);
    const existing = scoreMap.get(result.chunkId);

    if (existing) {
      // Chunk presente en ambos -> sumar scores
      existing.rrfScore += rrfScore;
      existing.bm25Rank = rank;
      existing.hasBothSources = true;
    } else {
      scoreMap.set(result.chunkId, {
        ...result,
        rrfScore,
        bm25Rank: rank,
        hasBothSources: false
      });
    }
  });

  // Ordenar por score RRF descendente
  return Array.from(scoreMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore);
};
```

### 8.2 VectorSearchService — pgvector

**Archivo:** `services/RAGServices/VectorSearchService.ts`

```typescript
const vectorSearchSQL = `
  SELECT
    c.id AS "chunkId",
    c."documentId",
    c.content,
    c.topic,
    c.keywords,
    (1 - (c.embedding <=> :embedding::vector)) AS similarity,
    d.title AS "documentTitle"
  FROM "AIChunks" c
  INNER JOIN "AIDocuments" d ON d.id = c."documentId"
  WHERE c."companyId" = :companyId
    AND d.status = 'completed'
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> :embedding::vector)) >= :minSimilarity
  ORDER BY c.embedding <=> :embedding::vector ASC
  LIMIT :topK
`;

// Operador <=> = distancia coseno de pgvector
// (1 - distancia) = similitud coseno (0-1)
```

### 8.3 BM25SearchService — Full-Text PostgreSQL

**Archivo:** `services/RAGServices/BM25SearchService.ts`

```typescript
const bm25SearchSQL = `
  SELECT
    c.id AS "chunkId",
    c."documentId",
    c.content,
    c.topic,
    ts_rank(
      to_tsvector(:language::regconfig, c.content),
      plainto_tsquery(:language::regconfig, :query)
    ) AS rank,
    ts_headline(
      :language::regconfig,
      c.content,
      plainto_tsquery(:language::regconfig, :query),
      'MaxWords=50, MinWords=20, StartSel=<b>, StopSel=</b>'
    ) AS headline,
    d.title AS "documentTitle"
  FROM "AIChunks" c
  INNER JOIN "AIDocuments" d ON d.id = c."documentId"
  WHERE c."companyId" = :companyId
    AND to_tsvector(:language::regconfig, c.content)
        @@ plainto_tsquery(:language::regconfig, :query)
  ORDER BY rank DESC
  LIMIT :topK
`;

// Idiomas soportados: spanish (default), english, portuguese, french, german, italian
```

---

## 9. CACHE SEMÁNTICO

### 9.1 SemanticCacheService

**Archivo:** `services/RAGServices/SemanticCacheService.ts`

```typescript
interface CacheEntry {
  id: number;
  queryText: string;
  queryEmbedding: number[];  // vector(1536)
  response: string;
  responseEmbedding?: number[];
  modelUsed: string;
  agentUsed: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  hitCount: number;
  confidence: number;
  expiresAt: Date;
  metadata: Record<string, any>;
}

// TTL por tipo de cache
const CACHE_TTL = {
  intent: 60 * 60,       // 1 hora para clasificaciones
  rag: 60 * 60 * 24,     // 24 horas para RAG
  general: 60 * 60 * 12  // 12 horas para general
};

// Lookup por similitud
const lookup = async (
  query: string,
  companyId: number,
  cacheType: string = 'general',
  threshold: number = 0.95
): Promise<CacheEntry | null> => {
  const embedding = await EmbeddingService.generateEmbedding(query, companyId);

  const cached = await sequelize.query(`
    SELECT *,
      (1 - (query_embedding <=> :embedding::vector)) AS similarity
    FROM "AISemanticCache"
    WHERE "companyId" = :companyId
      AND cache_type = :cacheType
      AND expires_at > NOW()
      AND (1 - (query_embedding <=> :embedding::vector)) >= :threshold
    ORDER BY query_embedding <=> :embedding::vector
    LIMIT 1
  `, { replacements: { embedding, companyId, cacheType, threshold } });

  if (cached) {
    // Incrementar hit count
    await AISemanticCache.increment('hitCount', { where: { id: cached.id } });
    return cached;
  }

  return null;
};

// Store
const store = async (
  query: string,
  embedding: number[],
  response: string,
  companyId: number,
  metadata: CacheMetadata
): Promise<void> => {
  await AISemanticCache.create({
    queryText: query,
    queryEmbedding: embedding,
    response: response,
    modelUsed: metadata.modelUsed,
    agentUsed: metadata.agentUsed,
    tokensInput: metadata.tokensInput,
    tokensOutput: metadata.tokensOutput,
    costUsd: metadata.costUsd,
    cacheType: metadata.type || 'general',
    expiresAt: new Date(Date.now() + CACHE_TTL[metadata.type] * 1000),
    metadata,
    companyId
  });
};
```

---

## 10. SISTEMA DE MEMORIAS DE CONTACTO

### 10.1 ContactMemoryService

**Archivo:** `services/AIAgentServices/ContactMemoryService.ts`

```typescript
interface ContactMemory {
  id: number;
  contactId: number;
  memoryType: 'preference' | 'fact' | 'objection' | 'interest' | 'decision';
  content: string;
  confidence: number;
  extractedBy: 'seed' | 'llm_auto';
  validUntil?: Date;
  metadata: Record<string, any>;
}

// Extracción automática de memorias
const extractMemories = async (
  message: string,
  context: ConversationContext,
  companyId: number
): Promise<ContactMemory[]> => {
  const extractionPrompt = `
Eres un sistema de extracción de memorias. Analiza el siguiente mensaje y extrae
información relevante sobre el contacto.

REGLAS:
1. Solo extrae información FICTICIA/DEMOSTRATIVA para testing
2. Tipos de memoria:
   - preference: Gustos o preferencias del cliente
   - fact: Hechos verificables sobre el cliente
   - objection: Objeciones o preocupaciones expresadas
   - interest: Intereses mencionados
   - decision: Decisiones tomadas

MENSAJE:
${message}

CONTEXTO ADICIONAL:
- Compañía: ${context.companyName}
- Industria: ${context.industry}

RESPUESTA (JSON array):
`;

  const result = await AIClientService.generateText({
    systemPrompt: extractionPrompt,
    messages: [{ role: 'user', content: message }]
  });

  return parseMemories(result.text);
};

// Construcción del bloque de memorias para el prompt
const buildSupervisorBlock = async (
  contactId: number,
  companyId: number,
  currentMessage?: string
): Promise<string> => {
  const memories = await recall(contactId, companyId, currentMessage);

  const iconMap: Record<MemoryType, string> = {
    preference: '💡',
    fact: '📋',
    objection: '⚠️',
    interest: '⭐',
    decision: '✅'
  };

  if (memories.length === 0) {
    return '## 🧠 MEMORIAS DEL CONTACTO\n*(No hay memorias disponibles)*';
  }

  const lines = [
    '## 🧠 MEMORIAS DEL CONTACTO',
    '*(Información conocida de conversaciones anteriores)*',
    ''
  ];

  memories.forEach(m => {
    const icon = iconMap[m.memoryType] || '📌';
    lines.push(`${icon} **[${m.memoryType}]** ${m.content}`);
  });

  return lines.join('\n');
};
```

---

## 11. QUICKREPLIES SEMÁNTICOS

### 11.1 QuickReplySemanticService

**Archivo:** `services/AIAgentServices/QuickReplySemanticService.ts`

```typescript
interface QuickMessage {
  id: number;
  shortcode: string;
  message: string;
  intent: string;
  intentEmbedding: number[];  // vector(1536)
}

// Búsqueda semántica de QuickReplies
const findRelevant = async (
  currentMessage: string,
  companyId: number,
  threshold: number = 0.75
): Promise<QuickMessageWithSimilarity[]> => {
  const embedding = await EmbeddingService.generateEmbedding(currentMessage, companyId);

  const results = await sequelize.query(`
    SELECT
      q.id,
      q.shortcode,
      q.message,
      q.intent,
      (1 - (q."intentEmbedding" <=> :embedding::vector)) AS similarity
    FROM "QuickMessages" q
    WHERE q."companyId" = :companyId
      AND q."intentEmbedding" IS NOT NULL
      AND (1 - (q."intentEmbedding" <=> :embedding::vector)) >= :threshold
    ORDER BY q."intentEmbedding" <=> :embedding::vector
    LIMIT 5
  `, { replacements: { embedding, companyId, threshold } });

  return results;
};

// Construcción del bloque para el prompt
const buildSupervisorBlock = async (
  currentMessage: string,
  companyId: number
): Promise<string> => {
  const relevant = await findRelevant(currentMessage, companyId);

  if (relevant.length === 0) {
    return '## ⚡ RESPUESTAS RÁPIDAS DISPONIBLES\n*(No hay respuestas rápidas relevantes)*';
  }

  const lines = [
    '## ⚡ RESPUESTAS RÁPIDAS DISPONIBLES',
    '*(Usa SOLO la(s) que matcheen con el mensaje del cliente)*',
    ''
  ];

  relevant.forEach((qr, i) => {
    const matchLabel = qr.similarity >= 0.90 ? '🔴' :
                       qr.similarity >= 0.80 ? '🟡' : '🟢';
    lines.push(
      `[${matchLabel} Opción ${i + 1}] /${qr.shortcode} — intención: "${qr.intent}"`,
      `→ ${qr.message}`,
      ''
    );
  });

  return lines.join('\n');
};
```

---

## 12. DEDUCCIÓN DE CRÉDITOS IA

### 12.1 Sistema de Créditos

**Archivo:** `services/AICreditServices/DeductCreditsService.ts`

```typescript
interface CreditDeduction {
  companyId: number;
  creditTypeKey: string;  // 'message', 'image', 'video', 'audio_minute', etc.
  amount: number;
  agentUsed: string;
  ticketId?: number;
  metadata?: Record<string, any>;
}

// Los 11 tipos de crédito IA
const CREDIT_TYPES = {
  message: { name: 'Mensaje de Texto', costPerUnit: 1 },
  image: { name: 'Imagen Generada', costPerUnit: 10 },
  video: { name: 'Video Generado', costPerUnit: 50 },
  audio_minute: { name: 'Audio (minuto)', costPerUnit: 5 },
  tts_character: { name: 'TTS (carácter)', costPerUnit: 0.01 },
  rag_query: { name: 'Consulta RAG', costPerUnit: 1 },
  embedding_token: { name: 'Token de Embedding', costPerUnit: 0.0001 },
  agent_execution: { name: 'Ejecución de Agente', costPerUnit: 1 },
  kb_document: { name: 'Documento KB', costPerUnit: 5 },
  vision_analysis: { name: 'Análisis de Imagen', costPerUnit: 5 },
  pdf_processing: { name: 'Procesamiento PDF', costPerUnit: 10 }
};

// Deducción en SupervisorService
const deductCredits = async (tokensUsed: number, companyId: number, agentUsed: string) => {
  // 1 crédito por cada 1000 tokens
  const messageCredits = Math.ceil(tokensUsed / 1000);

  await DeductCreditsService({
    companyId,
    creditTypeKey: 'message',
    amount: messageCredits,
    agentUsed
  });
};
```

---

## 13. RUTAS DE ARCHIVOS CLAVE

### Orquestación Central
| Archivo | Descripción |
|---------|-------------|
| [SupervisorService.ts](services/AIAgentServices/SupervisorService.ts) | Orquestador central multi-agente |
| [RouterAgentService.ts](services/AIAgentServices/RouterAgentService.ts) | Clasificador de intención |
| [PromptContextBuilder.ts](services/AIAgentServices/PromptContextBuilder.ts) | Constructor unificado de contexto |
| [AIAgentController.ts](controllers/AIAgentController.ts) | Controlador API |

### Sistema RAG
| Archivo | Descripción |
|---------|-------------|
| [RAGAgentService.ts](services/AIAgentServices/RAGAgentService.ts) | Agente RAG principal |
| [HybridSearchService.ts](services/RAGServices/HybridSearchService.ts) | Búsqueda híbrida (RRF) |
| [VectorSearchService.ts](services/RAGServices/VectorSearchService.ts) | Búsqueda vectorial pgvector |
| [BM25SearchService.ts](services/RAGServices/BM25SearchService.ts) | Búsqueda full-text PostgreSQL |
| [EmbeddingService.ts](services/RAGServices/EmbeddingService.ts) | Generación de embeddings |
| [ChunkingService.ts](services/RAGServices/ChunkingService.ts) | División de documentos |
| [SemanticCacheService.ts](services/RAGServices/SemanticCacheService.ts) | Cache semántico |

### Contexto y Tags
| Archivo | Descripción |
|---------|-------------|
| [TicketContextService.ts](services/AIAgentServices/TicketContextService.ts) | Extracción de tags y contexto |
| [ContactMemoryService.ts](services/AIAgentServices/ContactMemoryService.ts) | Memorias de contacto |
| [QuickReplySemanticService.ts](services/AIAgentServices/QuickReplySemanticService.ts) | QuickReplies semánticos |

### Mensajería
| Archivo | Descripción |
|---------|-------------|
| [wbotMessageListener.ts](services/WbotServices/wbotMessageListener.ts) | Listener WhatsApp Baileys |
| [metaMessageListener.ts](services/MetaServices/metaMessageListener.ts) | Listener Meta Cloud API |
| [handleOpenAi.ts](services/IntegrationsServices/OpenAi/handleOpenAi.ts) | Handler IA legado |

### Modelos de BD
| Archivo | Descripción |
|---------|-------------|
| [AIChunk.ts](models/AIChunk.ts) | Chunks con embedding::vector(1536) |
| [AIDocument.ts](models/AIDocument.ts) | Documentos de Knowledge Base |
| [AISemanticCache.ts](models/AISemanticCache.ts) | Cache semántico |
| [Tag.ts](models/Tag.ts) | Tags con aiGuidance1/2/3 |
| [TicketTag.ts](models/TicketTag.ts) | Pivote ticket-tag |
| [QuickMessage.ts](models/QuickMessage.ts) | QuickReplies con intentEmbedding |
| [Company.ts](models/Company.ts) | Información de empresa |

---

## FLUJO COMPLETO RESUMIDO

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    RECIBE MENSAJE DE WHATSAPP                          │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    VALIDACIONES                                         │
│  • No es mensaje propio (fromMe=false)                                  │
│  • No es grupo (o está permitido)                                       │
│  • No es mensaje vacío                                                 │
│  • Contact.disableBot === false                                          │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    CREAR/RECUPERAR TICKET                              │
│  • FindOrCreateTicketService                                            │
│  • CreateMessageService                                                 │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    SUPERVISOR SERVICE                                    │
│                                                                          │
│  1. CARGAR CONTEXTO UNIFICADO                                          │
│     ┌─────────────────────────────────────────────────────────────┐     │
│     │ PromptContextBuilder.buildSupervisorContext()               │     │
│     │                                                              │     │
│     │  ▸ Empresa: name, phone, email, city                       │     │
│     │  ▸ Tags: kanban stage + normal tags + aiGuidance          │     │
│     │  ▸ Historial: últimos 20 mensajes                          │     │
│     │  ▸ QuickReplies: semánticamente relevantes                 │     │
│     │  ▸ Memorias: del contacto                                   │     │
│     └─────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  2. CLASIFICAR INTENCIÓN                                               │
│     ┌─────────────────────────────────────────────────────────────┐     │
│     │ RouterAgentService.classify()                               │     │
│     │                                                              │     │
│     │  ▸ quickClassify() → patrones rápidos (sin LLM)           │     │
│     │  ▸ SemanticCache.lookup() → ¿ya clasificado?              │     │
│     │  ▸ LLM → GPT-4.1-mini → {intent, confidence, entities}    │     │
│     │  ▸ mapIntentToAgent() → 'rag' | 'support' | 'sales' | ... │     │
│     └─────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  3. EJECUTAR AGENTE ESPECIALIZADO                                       │
│     ┌─────────────────────────────────────────────────────────────┐     │
│     │ case 'rag':                                                │     │
│     │   ▸ HybridSearchService.search()                          │     │
│     │     → VectorSearch (pgvector, peso 0.6)                    │     │
│     │     → BM25Search (tsvector, peso 0.4)                      │     │
│     │     → Reciprocal Rank Fusion (k=60)                       │     │
│     │   ▸ RAGAgentService.processQuery()                        │     │
│     │   ▸ SemanticCache.store() (si confidence > 0.7)           │     │
│     │                                                              │     │
│     │ case 'support' | 'sales':                                  │     │
│     │   ▸ ToolRegistry.getTools()                                │     │
│     │   ▸ LLM con function_calling                               │     │
│     │   ▸ Máximo 3 iteraciones de herramientas                   │     │
│     │                                                              │     │
│     │ case 'appointment':                                          │     │
│     │   ▸ AppointmentAgentService                                 │     │
│     │   ▸ CRUD de citas                                           │     │
│     │                                                              │     │
│     │ case 'escalation':                                          │     │
│     │   ▸ Transfer to human queue                                 │     │
│     │   ▸ Marcar ticket para atención manual                     │     │
│     └─────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  4. EVALUAR CALIDAD                                                    │
│     ▸ Si confidence < 0.4 → agregar "¿Necesitas más ayuda?"           │
│                                                                          │
│  5. DEDUCIR CRÉDITOS                                                    │
│     ▸ 1 crédito por cada 1000 tokens                                   │
│                                                                          │
│  6. REGISTRAR MÉTRICAS                                                  │
│     ▸ AgentLogService.logExecution()                                   │
│     ▸ Latencia, tokens, confidence, agentUsed                          │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    ENVIAR RESPUESTA                                     │
│  • SendWhatsAppMessage()                                                │
│  • Crear Message en BD (fromMe=true)                                   │
└─────────────────────────────────┖───────────────────────────────────────┘
```

---

## DIAGRAMA DE DATOS POR CAPA

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CAPA 1: ENTRADA                                 │
│                                                                          │
│  WhatsApp Message                                                       │
│  ├── from: "553199999999@c.us"                                         │
│  ├── body: "Quiero saber el precio del plan Pro"                       │
│  ├── timestamp: 1742947200                                               │
│  └── ticketId: 12345                                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     CAPA 2: CONTEXTO EMPRESA                            │
│                                                                          │
│  Company                                                                │
│  ├── id: 1                                                              │
│  ├── name: "TechCorp SA"                                               │
│  ├── phone: "+5521999999999"                                           │
│  ├── email: "contacto@techcorp.com"                                    │
│  └── plan: { maxAgents: 5, features: ['openai'] }                       │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     CAPA 3: CONTEXTO TICKET                             │
│                                                                          │
│  Ticket                                                                 │
│  ├── id: 12345                                                          │
│  ├── status: "open"                                                     │
│  ├── contactId: 67890                                                  │
│  └── tags: [TicketTag] → [Tag]                                         │
│       ├── { name: "Lead", kanban: 3, aiGuidance1: "Mención discount" }  │
│       ├── { name: "Interesado", kanban: 0 }                            │
│       └── { name: "Pro", kanban: 0 }                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     CAPA 4: HISTORIAL                                   │
│                                                                          │
│  Message[] (últimos 20)                                                │
│  ├── { role: "assistant", body: "Hola, ¿en qué puedo ayudarte?" }     │
│  ├── { role: "user", body: "Tengo una consulta sobre precios" }        │
│  └── { role: "assistant", body: "Te muestro nuestros planes..." }       │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     CAPA 5: RAG / BASE DE CONOCIMIENTO                  │
│                                                                          │
│  AIChunks[]                                                             │
│  ├── { content: "Plan Pro: $99/mes, incluye...", embedding: [...] }    │
│  ├── { content: "Descuento anual: 2 meses gratis...", embedding: [...] }│
│  └── { content: "Características premium...", embedding: [...] }        │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     CAPA 6: MEMORIAS + QUICKREPLIES                     │
│                                                                          │
│  ContactMemory[]                                                        │
│  ├── { type: "preference", content: "Prefiere contacto por WhatsApp" } │
│  └── { type: "fact", content: "Empresa del sector fintech" }           │
│                                                                          │
│  QuickMessage[]                                                         │
│  └── { shortcode: "precios", message: "Nuestros planes...", intent: "consulta_precios" }
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     CONSTRUCCIÓN DEL PROMPT                             │
│                                                                          │
│  SYSTEM PROMPT:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Eres un asistente virtual de TechCorp SA...                        │ │
│  │                                                                     │ │
│  │ ## 🏢 CONTEXTO DE LA EMPRESA                                       │ │
│  │ EMPRESA: TechCorp SA | Email: contacto@techcorp.com               │ │
│  │                                                                     │ │
│  │ ## 🏷️ ESTADO DEL TICKET                                           │ │
│  │ Etapa Kanban: Calificación                                         │ │
│  │ Guía IA: Mención discount anual                                     │ │
│  │ Tags: Lead, Interesado, Pro                                        │ │
│  │                                                                     │ │
│  │ ## 💬 HISTORIAL                                                    │ │
│  │ 🤖 Agente: Hola, ¿en qué puedo ayudarte?                          │ │
│  │ 👤 Cliente: Tengo una consulta sobre precios                        │ │
│  │                                                                     │ │
│  │ ## ⚡ QUICKREPLIES                                                 │ │
│  │ 🔴 Opción 1: /precios → "Nuestros planes..."                      │ │
│  │                                                                     │ │
│  │ ## 🧠 MEMORIAS                                                     │ │
│  │ 📋 [fact] Empresa del sector fintech                               │ │
│  │                                                                     │ │
│  │ ## 📚 BASE DE CONOCIMIENTOS                                        │ │
│  │ [Fuente 1] Plan Pro: $99/mes, incluye AI ilimitada...              │ │
│  │ [Fuente 2] Descuento anual: 2 meses gratis...                      │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  USER MESSAGE: "Quiero saber el precio del plan Pro"                    │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     RESPUESTA FINAL                                     │
│                                                                          │
│  "¡Hola! El Plan Pro tiene un valor de **$99/mes** e incluye:          │
│   • AI ilimitada para tu equipo                                        │
│   • 5 agentes configurables                                            │
│   • Reportes avanzados                                                  │
│                                                                          │
│   Además, tenemos un **descuento especial**: Si pagas annually,         │
│   ¡obtienes **2 meses gratis**!                                        │
│                                                                          │
│   ¿Te gustaría conocer más detalles o proceder con el alta? 😊"       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## CONCLUSIONES

El orquestador de IA de ChatEAM JR implementa un sistema **completo y bien estructurado** con las siguientes características:

### Fortalezas
1. **Multi-agente**: Clasificación precisa de intenciones con enrutamiento a agentes especializados
2. **RAG robusto**: Búsqueda híbrida con pgvector + BM25 + Reciprocal Rank Fusion
3. **Contexto rico**: Combina empresa + tags + historial + memorias + quickreplies
4. **Cache semántico**: Optimiza costos y latencia
5. **Multi-tenant**: companyId obligatorio en todas las consultas
6. **Créditos IA**: Sistema de deducción por tokens consumidos

### Puntos Clave
- **Tags con AI Guidance**: Permiten guiar respuestas según etapa del proceso
- **Búsqueda híbrida**: Combina lo mejor de búsqueda semántica y full-text
- **Memoria persistente**: Acumula información sobre contactos para respuestas personalizadas
- **QuickReplies semánticos**: Respuestas predefinidas activadas por similitud

---

*Documento generado automáticamente mediante análisis de código fuente*
*ChatEAM JR v6.0.0 | 25-Mar-2026*
