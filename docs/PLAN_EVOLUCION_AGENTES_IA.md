# Plan de Evolución: Agentes IA y RAG Avanzado para ChatEAM JR

**Versión:** 1.1
**Fecha:** 28 de febrero de 2026
**Autor:** Arquitectura & Estrategia — ChatEAM JR
**Estado:** Propuesta Estratégica

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Análisis del Mercado y Competencia](#2-análisis-del-mercado-y-competencia)
3. [Estado Actual del Sistema IA en ChatEAM](#3-estado-actual-del-sistema-ia-en-chateam)
4. [Frameworks y Arquitecturas Modernas](#4-frameworks-y-arquitecturas-modernas)
5. [Arquitectura Propuesta: Sistema Multi-Agente](#5-arquitectura-propuesta-sistema-multi-agente)
6. [RAG Avanzado: De Búsqueda Básica a Context Engine](#6-rag-avanzado-de-búsqueda-básica-a-context-engine)
7. [Modelo de Costos y Pricing](#7-modelo-de-costos-y-pricing)
8. [Mejoras Importadas de MagicAI](#8-mejoras-importadas-de-magicai)
9. [Migraciones de Base de Datos](#9-migraciones-de-base-de-datos)
10. [Roadmap de Implementación](#10-roadmap-de-implementación)
11. [Métricas de Éxito y KPIs](#11-métricas-de-éxito-y-kpis)
12. [Riesgos y Mitigaciones](#12-riesgos-y-mitigaciones)
13. [Fuentes y Referencias](#13-fuentes-y-referencias)

---

## 1. Resumen Ejecutivo

### Visión

Transformar ChatEAM JR de una plataforma CRM con IA básica (chatbot reactivo con OpenAI) a una **plataforma de Agentes IA Autónomos** capaz de resolver el 80%+ de las interacciones de soporte sin intervención humana, con RAG avanzado, sistema multi-agente y pricing competitivo.

### Oportunidad de Mercado

| Métrica | Valor |
|---------|-------|
| Mercado AI Customer Service (2026) | **$19.1B** (CAGR 25.8%) |
| Mercado AI Agents (2030) | **$52.62B** (CAGR 46.3%) |
| Mercado RAG (2034) | **$67.42B** (CAGR 49.1%) |
| Mercado Agentic AI (2034) | **$199B** (CAGR ~44%) |

### Ventaja Competitiva de ChatEAM

- **Stack existente sólido**: Node.js + TypeScript + PostgreSQL 15 + Redis 7
- **Multi-proveedor ya construido**: Soporte para OpenAI, Anthropic, Google, Mistral, DeepSeek
- **Sistema de créditos integrado**: Billing con Stripe listo
- **Costo 95-99% menor** que competidores enterprise (Intercom, Zendesk)
- **Omnicanal nativo**: WhatsApp (Baileys + Cloud API), web chat, integración email
- **Mercado Latam desatendido**: Competidores enterprise enfocados en mercados anglosajones

### Decisiones Arquitectónicas Clave

| Decisión | Elección | Razón |
|----------|----------|-------|
| **Framework de Agentes** | Mastra (TypeScript nativo) | Alineado con stack actual, graph-based |
| **Vector Database** | pgvector (PostgreSQL) | Ya en stack, costo $0 incremental |
| **Búsqueda** | Hybrid Search (BM25 + Vector + Reranking) | Precisión superior al vector-only |
| **Observabilidad** | Langfuse (self-hosted) | Open-source, control total |
| **LLM Principal** | GPT-4.1-mini + Claude Sonnet (routing) | Balance óptimo costo/calidad |
| **Guardrails** | NeMo Guardrails | Seguridad enterprise-grade |
| **Arquitectura** | 6 Agentes Especializados + Supervisor | Escalable, mantenible, testeable |

---

## 2. Análisis del Mercado y Competencia

### 2.1 Panorama Global

**Tendencias dominantes 2025-2026:**

1. **De Chatbots a Agentes Autónomos**: Los chatbots rule-based quedan obsoletos. Cisco estima que para 2028, el 68% de las interacciones serán manejadas end-to-end por agentic AI
2. **RAG como Context Engine**: Evolución de retrieval básico a motor de contexto empresarial con GraphRAG y búsqueda híbrida
3. **Multi-Agent en Producción**: Equipos orquestados de agentes especializados reemplazan al agente único "todo-propósito"
4. **MCP (Model Context Protocol)**: Estándar emergente para conexión de agentes con herramientas externas
5. **Caída de Costos API**: Precios cayeron 60-80% entre 2025-2026, habilitando pricing por resolución viable

**Predicciones Gartner:**
- **2026:** 40% de aplicaciones enterprise incorporarán AI agents
- **2029:** Agentic AI resolverá autónomamente el 80% de problemas comunes de customer service

### 2.2 Competidores Tier 1 (Enterprise)

| Plataforma | Pricing | Costo/Interacción | LLM | Fortaleza |
|-----------|---------|-------------------|-----|-----------|
| **Intercom Fin** | Per-resolution | $0.99/resolución | Claude (Anthropic) | 51% tasa resolución, $100M+ revenue AI |
| **Zendesk AI** | Per-resolution + seat | $1.50-$2.00/AR | GPT-4o / GPT-5 | 170K clientes, 30% market share |
| **Freshdesk Freddy** | Per-session | $0.10/sesión | Multi-modelo | Model-agnostic, auto-recharge |
| **Ada CX** | Custom (ventas) | No público | Multi-LLM | 83% automatización, enterprise |
| **Kustomer** | Per-conversation + seat | $0.60/conv | No público | CRM-first, timeline 360° |
| **Salesforce Agentforce** | Credits / Per-conv | $0.10-$2.00 | Propios + Einstein | Ecosistema CRM más grande |

### 2.3 Competidores Tier 2 (Mid-Market / SMB)

| Plataforma | Pricing | Costo/Interacción | LLM | Target |
|-----------|---------|-------------------|-----|--------|
| **Tidio Lyro** | Per-conversation | $0.50/conv | Claude | SMB, 67% automatización |
| **Botpress** | Usage-based | Variable (LLM cost) | Motor propio LLMz | Developers, open-source |
| **Voiceflow** | Credits + seat | Variable | GPT-4 + Claude | Developers, visual builder |
| **Relevance AI** | Credits-based | Variable | Multi-LLM | Sales & GTM teams |

### 2.4 Frameworks (Build-Your-Own)

| Framework | Pricing | Tipo | Funding | Ideal Para |
|-----------|---------|------|---------|------------|
| **LangChain/LangGraph** | Open-source + LangSmith $39/user | Grafos cíclicos | $125M Series B ($1.25B val.) | Workflows complejos, enterprise |
| **CrewAI** | Open-source + hosted $25-99/mes | Multi-agente role-based | $18M Series A | Equipos de agentes custom |
| **Mastra** | Open-source | TypeScript AI framework | Early-stage | **Stack TypeScript nativo** |
| **AutoGen (Microsoft)** | Open-source | Event-driven multi-agent | Microsoft-backed | Ecosistema Azure |
| **Vercel AI SDK** | Open-source | Streaming + UI | Vercel-backed | Frontend integrado |

### 2.5 Mapa de Integraciones por Canal

| Plataforma | WhatsApp | Instagram | Web Chat | Email | Voz | SMS |
|-----------|----------|-----------|----------|-------|-----|-----|
| **Intercom** | Limitado | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Zendesk** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Ada CX** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Tidio** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Botpress** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **ChatEAM (actual)** | ✅✅ | ⚠️ | ✅ | ⚠️ | ❌ | ❌ |
| **ChatEAM (futuro)** | ✅✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> **ChatEAM tiene la integración WhatsApp más profunda** del mercado (Baileys + Cloud API dual), una ventaja competitiva significativa para Latam.

---

## 3. Estado Actual del Sistema IA en ChatEAM

### 3.1 Matriz de Madurez

| Componente | Estado | Nivel |
|-----------|--------|-------|
| **Integración OpenAI** | ✅ Producción | 🟢 Maduro |
| **Multi-proveedor** (OpenAI, Anthropic, Google, Azure, Cohere, Mistral, DeepSeek) | 🔨 Arquitectura lista | 🟡 Parcial |
| **Sistema de Prompts** | ✅ Producción | 🟢 Maduro |
| **Templates de Prompts** | ✅ Implementado | 🟢 Maduro |
| **RAG/Embeddings** | ⚠️ JSON files, búsqueda lineal | 🟡 Limitado |
| **Sistema de Créditos + Stripe** | ✅ Producción | 🟢 Maduro |
| **Generación de Imágenes** (DALL-E 3) | ✅ Producción | 🟢 Maduro |
| **Generación de Videos** (Sora 2) | ✅ Producción | 🟢 Maduro |
| **Speech-to-Text** (Whisper) | ✅ Producción | 🟢 Maduro |
| **Text-to-Speech** | ✅ Implementado | 🟢 Listo |
| **Vision/Image Analysis** | ✅ Disponible | 🟢 Listo |
| **Clasificación de Queue** | ✅ Producción | 🟢 Maduro |
| **Memoria de Conversación** | ✅ Producción | 🟢 Maduro |
| **Observabilidad IA** | ⚠️ Token tracking básico | 🟡 Parcial |
| **Fallback de Proveedores** | ❌ No implementado | 🔴 Crítico |
| **Cache Semántico** | ❌ No implementado | 🔴 Importante |
| **Agentes Autónomos** | ❌ No existe | 🔴 Oportunidad |

### 3.2 Modelos OpenAI Actualmente Utilizados

| Modelo | Propósito | Precio Input/1M | Precio Output/1M |
|--------|-----------|-----------------|------------------|
| gpt-4o | IA principal (más capacidad) | $2.50 | $10.00 |
| gpt-4o-mini | Clasificación, análisis rápido | $0.15 | $0.60 |
| gpt-3.5-turbo | Legacy, fallback económico | $0.50 | $1.50 |
| text-embedding-3-small | RAG, búsqueda semántica | $0.02 | — |
| dall-e-3 | Generación de imágenes | $0.08/img | — |
| sora-2 | Generación de videos | 40-120 créditos | — |
| whisper-1 | Transcripción de audio | $0.006/min | — |

### 3.3 Arquitectura RAG Actual

```
📁 Archivo (PDF/TXT/XLSX)
    ↓
📦 Chunking (400 palabras/chunk)
    ↓
🧬 Embeddings (text-embedding-3-small, 1536 dims)
    ↓
💾 Almacenamiento en JSON (/public/company{id}/ia/Embeddings/)
    ↓
🔍 ImprovedChunkSearch (5 pasos):
    1. Keyword Matching
    2. Semantic Search (cosine similarity)
    3. Re-ranking Híbrido (70% semántica + 30% keywords)
    4. Diversidad (evita redundancia >80%)
    5. Formateo para Prompt
    ↓
🤖 LLM genera respuesta con contexto
```

**Limitaciones críticas:**
- ❌ Embeddings en archivos JSON → Búsqueda lineal O(n)
- ❌ RAG solo funciona si hay archivo adjunto al prompt
- ❌ Sin Knowledge Base global por empresa
- ❌ Sin cache de respuestas similares
- ❌ Context window limitado (se trunca en conversaciones largas)
- ❌ Sin fallback si API falla

### 3.4 Pipeline de Conversación IA Actual

```
1. Mensaje entra → WhatsApp/Chat
   ↓
2. OpenAiService procesa:
   ├── Obtiene prompt de la queue
   ├── Historial de conversación (últimos N mensajes)
   ├── Si tiene archivo: Búsqueda RAG
   ├── Genera contexto mejorado
   └── Llamada a OpenAI via AIClientService
   ↓
3. Procesa respuesta:
   ├── Analiza emociones/stage del cliente
   ├── Enqueue StageClassifier job
   ├── Tracking de tokens
   └── Guarda response en DB
   ↓
4. Envía respuesta a WhatsApp/Chat
```

### 3.5 Servicios IA Existentes (Reutilizables)

| Servicio | Archivo | Función |
|----------|---------|---------|
| `AIClientService` | `/services/AIClientService.ts` | Interface unificada multi-proveedor |
| `OpenAiService` | `/services/IntegrationsServices/OpenAiService.ts` | Pipeline principal de chat IA |
| `ImprovedChunkSearch` | `/services/IntegrationsServices/ImprovedContextRetrieval.ts` | Búsqueda híbrida RAG |
| `ConversationAnalyzer` | `/services/IntegrationsServices/ConversationMemoryService.ts` | Análisis de historial |
| `procesarArchivoYEmbeddings` | `/services/IntegrationsServices/procesarArchivoYEmbeddings.ts` | Procesamiento de archivos |
| `AIProviderService` | `/services/AIProviderService.ts` | Selección de proveedor |
| `PromptServices` | `/services/PromptServices/` | CRUD de prompts |

---

## 4. Frameworks y Arquitecturas Modernas

### 4.1 Comparativa de Frameworks de Agentes IA

| Framework | Lenguaje | Tipo | Producción-Ready | Ideal Para |
|-----------|----------|------|-------------------|------------|
| **Mastra** | TypeScript | Workflows + Agents + RAG | ⭐⭐⭐ | Stack TS nativo, startups |
| **LangGraph** | Python/JS | Grafos cíclicos, estado persistente | ⭐⭐⭐⭐⭐ | Workflows complejos, enterprise |
| **CrewAI** | Python | Multi-agent role-based | ⭐⭐⭐⭐ | Equipos de agentes, no-code |
| **Vercel AI SDK** | TypeScript | Streaming, UI integration | ⭐⭐⭐⭐ | Frontend, UX de chat |
| **OpenAI Assistants** | API REST | File search, code interpreter | ⭐⭐⭐⭐ | Soluciones rápidas, lock-in |
| **AutoGen** | Python/.NET | Event-driven, distributed | ⭐⭐⭐ | Ecosistema Microsoft |
| **LlamaIndex** | Python | Data connectors, RAG | ⭐⭐⭐⭐ | RAG puro, data-heavy |
| **Haystack** | Python | RAG pipelines | ⭐⭐⭐⭐ | RAG enterprise |

### 4.2 Recomendación: Stack Tecnológico para ChatEAM

**Decisión: Mastra + Vercel AI SDK + pgvector**

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| **Agentes** | Mastra | TypeScript nativo, graph-based workflows, tools, RAG integrado |
| **Streaming UI** | Vercel AI SDK | Streaming nativo, React hooks, excelente UX |
| **Vector DB** | pgvector | Ya tenemos PostgreSQL 15, costo $0 |
| **Embeddings** | text-embedding-3-small | $0.02/1M tokens, calidad suficiente |
| **LLM Principal** | GPT-4.1-mini | $0.40 input / $1.60 output — balance ideal |
| **LLM Económico** | GPT-4.1-nano | $0.10 input / $0.40 output — routing y clasificación |
| **LLM Premium** | Claude Sonnet 4.5 | $3.00 input / $15.00 output — casos complejos |
| **Observabilidad** | Langfuse (self-hosted) | Open-source, A/B testing, cost tracking |
| **Guardrails** | NeMo Guardrails | Seguridad, PII, jailbreak prevention |
| **Cache** | Redis (ya en stack) + semantic cache | Reduce 30%+ llamadas LLM |

### 4.3 Arquitecturas RAG — Evolución

| Generación | Nombre | Precisión | Complejidad | ChatEAM Actual |
|-----------|--------|-----------|-------------|----------------|
| **Gen 1** | Naive RAG | 60-70% | Baja | ⬅️ Estamos aquí |
| **Gen 2** | Advanced RAG | 75-85% | Media | Objetivo Fase 1 |
| **Gen 3** | Modular RAG | 85-92% | Alta | Objetivo Fase 2 |
| **Gen 4** | Agentic RAG | 90-95% | Alta | Objetivo Fase 3 |
| **Gen 5** | Graph RAG | 95-99% | Muy Alta | Objetivo Fase 4 |

### 4.4 Búsqueda Híbrida Propuesta

```
                    Query del Usuario
                          │
                    ┌─────┴─────┐
                    │           │
              Vector Search   BM25 Search
              (Semántica)     (Keywords)
                    │           │
                    └─────┬─────┘
                          │
                    Reciprocal Rank
                      Fusion (RRF)
                          │
                    Cross-Encoder
                     Re-ranking
                          │
                    Top-K Chunks
                    (3-5 chunks)
                          │
                    Context → LLM
```

**Mejora esperada vs actual:** +20-30% en relevancia de respuestas

### 4.5 Modelos de Embedding — Comparativa

| Modelo | Precio/1M tokens | Dimensiones | Calidad Español | Recomendación |
|--------|-----------------|-------------|-----------------|---------------|
| text-embedding-3-small | $0.02 | 1536 | ⭐⭐⭐⭐ | **Producción (default)** |
| text-embedding-3-large | $0.13 | 3072 | ⭐⭐⭐⭐⭐ | Alta precisión |
| Cohere embed-v3 | $0.10 | 1024 | ⭐⭐⭐⭐ | Alternativa |
| Voyage-4 | $0.06 | Variable | ⭐⭐⭐⭐⭐ | Máxima calidad |
| BGE-large (self-hosted) | $0 (GPU) | 1024 | ⭐⭐⭐ | Futuro escala masiva |

### 4.6 Vector Databases — Comparativa

| DB | Costo Mensual* | En Stack | Rendimiento | Escalabilidad | Recomendación |
|----|---------------|----------|-------------|---------------|---------------|
| **pgvector** | $0 (extensión PG) | ✅ Ya tenemos PG15 | ⭐⭐⭐⭐ | ⭐⭐⭐ | **Fase 1-2** |
| Qdrant | $14-$100 | ❌ Nuevo servicio | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Fase 3+ (>1M vectors) |
| Pinecone | $50-$200 | ❌ SaaS | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | No recomendado (vendor lock-in) |
| Weaviate | $25-$150 | ❌ SaaS/self-host | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Alternativa viable |
| ChromaDB | $0 (self-host) | ❌ Nuevo servicio | ⭐⭐⭐ | ⭐⭐ | Solo desarrollo |

*Para 10K-100K vectores típicos de una PYME

---

## 5. Arquitectura Propuesta: Sistema Multi-Agente

### 5.1 Visión General

```
                        ┌─────────────────────┐
                        │    SUPERVISOR        │
                        │  (Orchestrator)      │
                        │  Claude Haiku/Nano   │
                        └─────────┬───────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
              ┌─────┴────┐ ┌─────┴────┐ ┌─────┴────┐
              │ ROUTER   │ │ MONITOR  │ │ MEMORY   │
              │ Agent    │ │ Agent    │ │ Agent    │
              │ (Nano)   │ │ (Nano)   │ │ (Mini)   │
              └─────┬────┘ └──────────┘ └──────────┘
                    │
      ┌─────────────┼─────────────┬──────────────┐
      │             │             │              │
┌─────┴────┐ ┌─────┴────┐ ┌─────┴────┐ ┌───────┴──────┐
│ RAG      │ │ VENTAS   │ │ SOPORTE  │ │ ESCALACIÓN   │
│ Agent    │ │ Agent    │ │ Agent    │ │ Agent        │
│ (Mini)   │ │ (Mini)   │ │ (Mini)   │ │ (Mini/Full)  │
└──────────┘ └──────────┘ └──────────┘ └──────────────┘
```

### 5.2 Descripción de Agentes

#### 🧭 Agente Router (GPT-4.1-nano)
- **Función:** Clasifica intención del mensaje en <100ms
- **Input:** Mensaje del usuario + contexto mínimo
- **Output:** `{ intent, confidence, targetAgent, priority }`
- **Intenciones:** `FAQ | soporte_tecnico | ventas | queja | saludo | despedida | spam | escalacion_humana`
- **Costo:** ~$0.0001 por clasificación
- **Fallback:** Si confidence < 0.7, escala a Agente Soporte (generalista)

#### 📚 Agente RAG (GPT-4.1-mini)
- **Función:** Busca en Knowledge Base y responde preguntas factuales
- **Capacidades:**
  - Búsqueda híbrida (vector + BM25 + reranking)
  - Multi-document retrieval
  - Citación de fuentes
  - Detección de "no sé" cuando el contexto es insuficiente
- **Knowledge Sources:** Documentos empresa, FAQs, manuales, historial de tickets

#### 💼 Agente de Ventas (GPT-4.1-mini)
- **Función:** Gestiona pipeline de ventas, califica leads, agenda demos
- **Capacidades:**
  - Calificación de leads (BANT)
  - Recomendación de productos/servicios
  - Negociación básica (dentro de parámetros)
  - Creación de oportunidades en CRM
  - Agendamiento de citas
- **Integración:** Pipeline de CRM ChatEAM, calendario

#### 🔧 Agente de Soporte (GPT-4.1-mini)
- **Función:** Resuelve tickets de soporte técnico y problemas comunes
- **Capacidades:**
  - Diagnóstico guiado paso a paso
  - Ejecución de acciones (cambiar configuración, resetear password)
  - Creación y actualización de tickets
  - Seguimiento de casos abiertos
- **Herramientas:** API interna, base de conocimiento, historial de tickets

#### 🚨 Agente de Escalación (GPT-4.1 / Claude Sonnet)
- **Función:** Maneja casos complejos y decide cuándo transferir a humano
- **Triggers de escalación:**
  - Sentimiento negativo persistente (>3 mensajes)
  - Confidence del agente < 0.5
  - Solicitud explícita del usuario
  - Problema no resuelto en >5 intercambios
  - Tema sensible (facturación, legal, cancelación)
- **Acción:** Prepara resumen para agente humano + transfiere con contexto completo

#### 🎯 Agente Supervisor (Claude Haiku / GPT-4.1-nano)
- **Función:** Orquesta los agentes, monitorea calidad, gestiona estado
- **Capacidades:**
  - Routing dinámico entre agentes
  - Monitoreo de SLA (tiempo de respuesta)
  - Detección de loops (agente repitiendo respuestas)
  - Agregación de métricas en tiempo real
  - Fallback management
  - State management de la conversación

### 5.3 Flujo de Conversación Propuesto

```
1. 📱 Mensaje del usuario (WhatsApp/Web/Email)
   ↓
2. 🧭 Router Agent clasifica intención (~50ms, $0.0001)
   ├── FAQ/Info → 📚 RAG Agent
   ├── Compra/Precio → 💼 Ventas Agent
   ├── Problema/Error → 🔧 Soporte Agent
   ├── Queja/Urgente → 🚨 Escalación Agent
   └── Saludo/Spam → Respuesta directa (sin agente complejo)
   ↓
3. 🤖 Agente especializado procesa:
   ├── Consulta Knowledge Base (RAG híbrido) si necesario
   ├── Ejecuta herramientas (API, CRM, calendario)
   ├── Genera respuesta con contexto completo
   └── Evalúa confidence de la respuesta
   ↓
4. 🎯 Supervisor valida:
   ├── ¿Respuesta coherente con historial? ✅/❌
   ├── ¿Confidence > threshold? ✅/❌
   ├── ¿Necesita escalación? ✅/❌
   └── ¿Guardrails OK (PII, jailbreak)? ✅/❌
   ↓
5. 📤 Respuesta enviada al usuario
   ↓
6. 📊 Métricas registradas (Langfuse):
   ├── Tokens consumidos
   ├── Latencia
   ├── Agente utilizado
   ├── Resolución exitosa?
   └── Costo total de la interacción
```

### 5.4 Herramientas (Tools) por Agente

| Agente | Tools Disponibles |
|--------|-------------------|
| **Router** | `classify_intent`, `detect_language`, `detect_sentiment` |
| **RAG** | `search_knowledge_base`, `search_tickets`, `cite_sources` |
| **Ventas** | `get_products`, `create_opportunity`, `schedule_meeting`, `qualify_lead`, `send_quote` |
| **Soporte** | `search_kb`, `create_ticket`, `update_ticket`, `execute_action`, `check_status` |
| **Escalación** | `transfer_to_human`, `create_summary`, `set_priority`, `notify_supervisor` |
| **Supervisor** | `route_to_agent`, `check_sla`, `aggregate_metrics`, `manage_state` |

---

## 6. RAG Avanzado: De Búsqueda Básica a Context Engine

### 6.1 Migración de JSON a pgvector

**Estado actual:**
```
Embeddings en archivos JSON → Búsqueda lineal O(n) → Lento, no escalable
```

**Estado propuesto:**
```sql
-- Extensión pgvector en PostgreSQL 15
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabla de documentos
CREATE TABLE ai_documents (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    title VARCHAR(500),
    source_type VARCHAR(50), -- 'pdf', 'txt', 'xlsx', 'web', 'ticket'
    source_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de chunks con embeddings vectoriales
CREATE TABLE ai_chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES ai_documents(id),
    company_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    chunk_index INTEGER,
    token_count INTEGER,
    embedding vector(1536), -- text-embedding-3-small
    metadata JSONB DEFAULT '{}', -- topic, keywords, section
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsqueda eficiente
CREATE INDEX idx_chunks_company ON ai_chunks(company_id);
CREATE INDEX idx_chunks_embedding ON ai_chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_chunks_content_fts ON ai_chunks
    USING gin(to_tsvector('spanish', content)); -- Full-text search en español

-- Tabla de cache semántico
CREATE TABLE ai_semantic_cache (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL,
    query_embedding vector(1536),
    query_text TEXT,
    response TEXT,
    model_used VARCHAR(100),
    tokens_saved INTEGER,
    hit_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX idx_cache_embedding ON ai_semantic_cache
    USING ivfflat (query_embedding vector_cosine_ops) WITH (lists = 50);
```

### 6.2 Pipeline RAG Avanzado

```
                     Query del Usuario
                           │
                     ┌─────┴─────┐
                     │ SEMANTIC   │
                     │ CACHE      │ ← Hit? → Respuesta inmediata (<50ms)
                     └─────┬─────┘
                           │ Miss
                     ┌─────┴─────┐
                     │ QUERY     │
                     │ EXPANSION │ ← Expande query con sinónimos/contexto
                     └─────┬─────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴────┐ ┌────┴─────┐ ┌────┴─────┐
        │ VECTOR   │ │ BM25     │ │ METADATA │
        │ SEARCH   │ │ (FTS)    │ │ FILTER   │
        │ pgvector │ │ tsvector │ │ JSONB    │
        └─────┬────┘ └────┬─────┘ └────┬─────┘
              │            │            │
              └────────────┼────────────┘
                           │
                     ┌─────┴─────┐
                     │ RECIPROCAL│
                     │ RANK      │ ← Fusión de resultados
                     │ FUSION    │
                     └─────┬─────┘
                           │
                     ┌─────┴─────┐
                     │ CROSS-    │
                     │ ENCODER   │ ← Re-ranking de precisión
                     │ RERANKING │
                     └─────┬─────┘
                           │
                     ┌─────┴─────┐
                     │ CONTEXT   │
                     │ ASSEMBLY  │ ← Top 3-5 chunks + metadata
                     └─────┬─────┘
                           │
                     ┌─────┴─────┐
                     │ LLM       │
                     │ RESPONSE  │ ← Genera respuesta con citaciones
                     └─────┬─────┘
                           │
                     ┌─────┴─────┐
                     │ CACHE     │
                     │ STORE     │ ← Guarda en semantic cache
                     └───────────┘
```

### 6.3 Estrategias de Chunking

| Estrategia | Tamaño | Uso | Mejora vs Actual |
|-----------|--------|-----|------------------|
| **Fixed (actual)** | 400 palabras | Documentos genéricos | Baseline |
| **Semantic** | Variable | Documentos largos | +15% relevancia |
| **Parent-Child** | 200 (child) + 1000 (parent) | FAQs, manuales | +25% contexto |
| **Sentence Window** | ±2 oraciones | Conversaciones | +20% coherencia |
| **Late Chunking** | Post-embedding | Documentos técnicos | +10% precisión |

**Recomendación:** Parent-Child chunking para Knowledge Bases + Sentence Window para tickets.

### 6.4 Knowledge Base Global por Empresa

```
📂 Knowledge Base (por empresa)
├── 📄 Documentos
│   ├── Manuales de producto
│   ├── FAQs
│   ├── Políticas
│   └── Procedimientos
├── 🎫 Tickets Resueltos
│   ├── Auto-indexados al cerrar
│   └── Soluciones verificadas
├── 💬 Conversaciones Exitosas
│   ├── Resoluciones IA exitosas
│   └── Patrones de respuesta humana
├── 🌐 Contenido Web
│   ├── Sitio web scrapeado
│   └── Blog posts
└── 📊 Datos Estructurados
    ├── Catálogo de productos
    ├── Precios
    └── Horarios/ubicaciones
```

---

## 7. Modelo de Costos y Pricing

### 7.1 Costos de APIs por Modelo (Febrero 2026)

#### LLMs Principales

| Modelo | Input/1M tokens | Output/1M tokens | Uso Recomendado |
|--------|-----------------|-------------------|-----------------|
| **GPT-4.1-nano** | $0.10 | $0.40 | Routing, clasificación |
| **GPT-4.1-mini** | $0.40 | $1.60 | Agentes principales |
| **GPT-4.1** | $2.00 | $8.00 | Razonamiento complejo |
| **GPT-4o-mini** | $0.15 | $0.60 | Chatbots económicos |
| **Claude Haiku 4.5** | $1.00 | $5.00 | Supervisor rápido |
| **Claude Sonnet 4.5** | $3.00 | $15.00 | Casos premium |
| **Gemini 2.0 Flash** | $0.10 | $0.40 | Fallback ultra-económico |
| **Mistral Small 3.2** | $0.06 | $0.18 | Fallback más barato |
| **DeepSeek-V3** | $0.14 | $0.28 | Alternativa económica |

#### Embeddings

| Modelo | Precio/1M tokens | Dimensiones |
|--------|-----------------|-------------|
| text-embedding-3-small | $0.02 | 1536 |
| text-embedding-3-large | $0.13 | 3072 |
| Voyage-4 | $0.06 | Variable |

### 7.2 Costo por Interacción con Model Routing

**Asumiendo:** ~500 tokens input + ~300 tokens output por mensaje IA

| Tipo de Query | Modelo | Costo/Interacción | % del Tráfico |
|--------------|--------|-------------------|---------------|
| **Routing** (clasificación) | GPT-4.1-nano | ~$0.00005 | 100% |
| **Simple** (FAQ, saludo) | GPT-4.1-nano | ~$0.00025 | 50% |
| **Medio** (soporte, RAG) | GPT-4.1-mini | ~$0.00068 | 35% |
| **Complejo** (análisis, ventas) | GPT-4.1 / Claude | ~$0.0034 | 10% |
| **Escalación** (resumen + transfer) | Claude Sonnet | ~$0.0075 | 5% |
| **Promedio ponderado** | — | **~$0.00065** | — |

**Costo por RAG completo (embedding + retrieval + LLM):** ~$0.00068 con GPT-4.1-mini

### 7.3 Escenarios de Costo Mensual

| Escenario | Mensajes/mes | Costo con Routing | Sin Routing (GPT-4o) |
|-----------|-------------|-------------------|---------------------|
| **Pequeña empresa** | 500 | **$0.33** | $3.13 |
| **Mediana empresa** | 5,000 | **$3.25** | $31.25 |
| **Gran empresa** | 50,000 | **$32.50** | $312.50 |
| **Enterprise** | 200,000 | **$130.00** | $1,250.00 |

### 7.4 Planes de Pricing Sugeridos

#### Estrategia: Planes Escalonados con Model Routing Inteligente

| Plan | Mensajes IA/mes | Modelo Routing | Precio USD/mes | Costo Real | Margen |
|------|-----------------|---------------|----------------|------------|--------|
| **Starter** | 500 | 100% GPT-4.1-nano | **$9** | ~$0.33 | 96% |
| **Pro** | 2,000 | 90% nano + 10% mini | **$19** | ~$0.84 | 96% |
| **Business** | 5,000 | 80% nano + 20% mini | **$39** | ~$2.24 | 94% |
| **Enterprise** | 20,000 | 70% nano + 25% mini + 5% full | **$79** | ~$14.40 | 82% |
| **Enterprise+** | 50,000 | 70% nano + 25% mini + 5% Claude | **$149** | ~$45.00 | 70% |
| **Custom** | Ilimitado | Negociable | **Cotización** | Variable | 60%+ |

#### Add-ons Premium

| Add-on | Precio/mes | Incluye |
|--------|-----------|---------|
| **Knowledge Base Avanzada** | +$10 | Upload ilimitado, auto-indexing |
| **Agente de Ventas** | +$15 | Pipeline CRM, lead scoring |
| **Analytics IA** | +$10 | Dashboard, insights, reportes |
| **Voice AI** | +$20 | Llamadas con IA, transcripción |
| **Modelo Premium** | +$25 | Claude Sonnet para todas las queries |

### 7.5 Comparativa con Competidores

| Métrica | Intercom Fin | Zendesk AI | Tidio Lyro | **ChatEAM (propuesto)** |
|---------|-------------|-----------|-----------|------------------------|
| Costo/resolución | $0.99 | $1.50-$2.00 | $0.50 | **$0.0007-$0.008** |
| Plan 500 msg/mes | ~$500 | ~$400 | $39+ | **$9** |
| Plan 5,000 msg/mes | ~$5,000 | ~$3,000 | $149+ | **$39** |
| Plan 50,000 msg/mes | ~$50,000 | ~$25,000 | N/A | **$149** |
| **Ahorro para cliente** | — | — | — | **95-99%** |

> **ChatEAM puede ofrecer precios 95-99% más bajos** que los competidores enterprise manteniendo márgenes del 70-96%.

### 7.6 Estrategias de Optimización de Costos

| Estrategia | Ahorro Estimado | Implementación |
|-----------|----------------|----------------|
| **Cache Semántico** | 15-30% | Redis + pgvector similarity |
| **Model Routing** | 60-80% vs modelo único premium | Clasificador nano |
| **Batch Processing** | 50% (Batch API) | Reportes nocturnos |
| **Prompt Optimization** | 20-40% | System prompts cortos |
| **Fallback Chains** | Previene costos por outages | Cache → Nano → Mini → Full |
| **Prompt Caching API** | 50-90% en prompts repetidos | OpenAI/Anthropic native |

**Ahorro total combinado estimado: 70-85% vs uso naive**

### 7.7 Proyección de Ingresos (100 Clientes)

| Segmento | Clientes | Plan | Ingreso/mes | Costo Real/mes | Margen/mes |
|----------|----------|------|-------------|----------------|------------|
| Starter | 50 | $9/mes | $450 | $16.50 | $433.50 |
| Pro | 30 | $19/mes | $570 | $25.20 | $544.80 |
| Business | 15 | $39/mes | $585 | $33.60 | $551.40 |
| Enterprise | 5 | $79/mes | $395 | $72.00 | $323.00 |
| **TOTAL** | **100** | | **$2,000/mes** | **$147.30/mes** | **$1,852.70/mes (93%)** |

---

## 8. Mejoras Importadas de MagicAI

> **Fuente:** Análisis exhaustivo de `/home/deploy/magicai-analysis` — plataforma SaaS de IA v10.20 (Codecanyon #45408109) con Laravel + MariaDB. Se extrajeron las mejoras más valiosas y adaptables al stack de ChatEAM (Node.js + TypeScript + PostgreSQL).

### 8.1 Catálogo Expandido de 196 Modelos IA

MagicAI soporta **196 modelos/entidades de IA** organizados por proveedor. ChatEAM actualmente soporta ~12 modelos. La tabla `entities` de MagicAI es el patrón a seguir:

#### Modelos Nuevos a Integrar (Prioridad Alta)

| Proveedor | Modelo | Capacidad | Prioridad para ChatEAM |
|-----------|--------|-----------|----------------------|
| **OpenAI** | GPT-5.2 Pro, GPT-5.1 | Texto avanzado, razonamiento | 🔴 Crítica |
| **OpenAI** | o1-mini, o1-preview, o3 | Razonamiento profundo | 🟡 Media |
| **OpenAI** | GPT-4o-realtime-preview | **Audio bidireccional en tiempo real** | 🔴 Crítica (WhatsApp) |
| **OpenAI** | GPT-IMAGE-1.5 | Generación de imágenes nativa GPT | 🟡 Media |
| **Anthropic** | Claude Opus 4.5, 4.1, 4 | Máxima capacidad | 🟡 Media |
| **Google** | Gemini 3 Pro, 2.5 Pro/Flash | Ultra-económico, multimodal | 🔴 Crítica (fallback) |
| **Google** | Imagen 4 | Generación de imágenes Google | 🟢 Baja |
| **xAI** | Grok 2, 3, 4 series | Alternativa conversacional | 🟢 Baja |
| **DeepSeek** | DeepSeek R1, Chat | Ultra-barato ($0.14/1M) | 🟡 Media (fallback) |
| **Open Router** | 30+ modelos terceros | Gateway multi-proveedor | 🟡 Media |
| **Perplexity** | Búsqueda en tiempo real | IA con datos actualizados | 🟡 Media |
| **Serper** | Datos web en tiempo real | Enriquecimiento de contexto | 🟡 Media |

#### Modelos de Video a Integrar

| Proveedor | Modelo | Capacidad | Prioridad |
|-----------|--------|-----------|-----------|
| **Kling** | Kling 2.5 Turbo | Text-to-video, image-to-video | 🟡 Media |
| **Luma** | Dream Machine | Video generativo | 🟢 Baja |
| **Heygen** | Avatares con presentador | Videos con avatar parlante | 🟡 Media |
| **Synthesia** | Video con avatar enterprise | Video profesional con avatar | 🟡 Media |
| **Google** | VEO 3.1 | Video generativo Google | 🟢 Baja |

#### Modelos de Voz/Audio a Integrar

| Proveedor | Modelo | Capacidad | Prioridad |
|-----------|--------|-----------|-----------|
| **ElevenLabs** | TTS, Voice Chatbots, Music Pro | Voz ultra-natural, voice cloning | 🔴 Crítica |
| **Google Cloud** | TTS | Síntesis multiidioma | 🟡 Media |
| **Azure** | Speech Services | STT/TTS enterprise | 🟡 Media |
| **Speechify** | TTS | Voz natural | 🟢 Baja |

**Migración propuesta:** Crear tabla `ai_entities` similar a MagicAI para registro dinámico de modelos:

```typescript
// Modelo Sequelize: AIEntity
interface AIEntity {
  id: number;
  key: string;              // "gpt-4.1-mini", "claude-sonnet-4.5"
  title: string;            // Nombre display
  engine: AIProviderType;   // 'openai' | 'anthropic' | 'google' | 'xai' | 'deepseek' | 'openrouter'
  type: AIEntityType;       // 'text' | 'image' | 'video' | 'audio' | 'embedding' | 'realtime'
  inputPrice: number;       // USD por 1M tokens input
  outputPrice: number;      // USD por 1M tokens output
  maxTokens: number;        // Context window
  capabilities: string[];   // ['vision', 'function_calling', 'streaming', 'json_mode']
  status: 'active' | 'deprecated' | 'beta';
  isSelected: boolean;      // Modelo por defecto para su tipo
  companyId?: number;       // null = global, number = empresa específica
  metadata: Record<string, any>; // Config adicional
}
```

### 8.2 Sistema de Créditos Granular Multi-Tipo

MagicAI implementa un sistema de créditos con **12 tipos diferentes** de tokens, mucho más granular que el sistema actual de ChatEAM. Esto permite facturación precisa por tipo de uso:

#### Tipos de Créditos de MagicAI (a importar)

| Tipo de Token | Unidad | Aplicación en ChatEAM |
|--------------|--------|----------------------|
| `word` | 1 token = 1 palabra generada | Respuestas de chat IA |
| `image` | 1 token = 1 imagen | DALL-E, Stable Diffusion |
| `text_to_video` | 1 token = 1 video | Sora, Kling |
| `image_to_video` | 1 token = 1 video | Conversión imagen→video |
| `text_to_speech` | 1 token = N caracteres | ElevenLabs, Google TTS |
| `speech_to_text` | 1 token = N minutos | Whisper, transcripción audios WhatsApp |
| `plagiarism` | 1 token = 1 verificación | Detección de plagio en contenido |
| `character` | 1 token = N caracteres | Síntesis de voz por carácter |
| `minute` | 1 token = 1 minuto | Video/audio por duración |
| `presentation` | 1 token = 1 presentación | Generación de presentaciones |
| `second` | 1 token = 1 segundo | Video corto |
| `video_to_video` | 1 token = 1 transformación | Edición IA de video |

#### Mejora al Sistema de Créditos Actual

**Actual (ChatEAM):** `CompanyTokenUsage` con tracking mensual básico por modelo.

**Propuesto (inspirado en MagicAI):**

```typescript
// Evolución: entity_credits como JSON flexible en Company
interface EntityCredits {
  [entityKey: string]: {
    total: number;
    used: number;
    remaining: number;
    resetDate?: Date;      // Para planes con reset mensual
    type: CreditType;
  };
}

type CreditType =
  | 'message'          // Mensajes de chat IA
  | 'image'            // Generación de imágenes
  | 'video'            // Generación de videos
  | 'audio_minute'     // Minutos de transcripción/TTS
  | 'embedding_token'  // Tokens de embedding
  | 'rag_query'        // Consultas RAG
  | 'agent_execution'  // Ejecuciones de agentes
  | 'kb_document';     // Documentos en Knowledge Base
```

### 8.3 Sistema de Equipos y Seats

MagicAI tiene un sistema maduro de equipos que ChatEAM necesita para empresas medianas/grandes:

#### Modelo de Teams de MagicAI

```
Company (Empresa)
├── Team (Equipo)
│   ├── team_manager (Administrador)
│   ├── entity_credits: JSON (créditos compartidos)
│   └── allow_seats: number (máximo de miembros)
│       ├── TeamMember 1
│       │   ├── role: 'admin' | 'member' | 'viewer'
│       │   ├── allow_unlimited_credits: boolean
│       │   ├── remaining_words: number (créditos individuales)
│       │   └── remaining_images: number
│       ├── TeamMember 2
│       └── TeamMember N
```

#### Adaptación para ChatEAM

```typescript
// Nuevo modelo: AITeam
interface AITeam {
  id: number;
  companyId: number;
  name: string;
  managerId: number;           // userId del admin del equipo
  maxSeats: number;            // Límite de miembros
  sharedCredits: EntityCredits; // Créditos compartidos del equipo
  aiModelsAllowed: string[];   // Modelos permitidos para el equipo
  features: string[];          // Features habilitadas
  createdAt: Date;
}

// Nuevo modelo: AITeamMember
interface AITeamMember {
  id: number;
  teamId: number;
  userId: number;
  role: 'admin' | 'agent' | 'viewer';
  individualCredits?: EntityCredits; // Créditos propios (override)
  unlimitedCredits: boolean;
  usedCredits: EntityCredits;        // Tracking de uso individual
}
```

### 8.4 Chatbot Builder con RAG Entrenado

MagicAI tiene un sistema de chatbots entrenables con RAG integrado que es directamente aplicable a ChatEAM:

#### Arquitectura del Chatbot Builder

```
📦 Chatbot (definición)
├── title, role, first_message
├── model: string (seleccionable)
├── instructions: string (system prompt custom)
├── chatbot_interests: string[] (temas permitidos)
├── color, width, height (personalización UI)
├── status: 'not-trained' | 'trained'
│
├── 📄 ChatbotData (fuentes de entrenamiento)
│   ├── type: 'text' | 'file' | 'url' | 'qa'
│   ├── content: string
│   ├── status: 'pending' | 'processed' | 'error'
│   │
│   └── 🧬 ChatbotDataVector (embeddings)
│       ├── content: string (chunk)
│       └── embedding: vector (1536 dims)
│
├── 💬 ChatbotHistory (conversaciones)
│   ├── role: 'user' | 'assistant'
│   └── response: string
│
└── 🌐 Domain (dominios personalizados)
    ├── domain: string (custom domain)
    ├── app_key: string (API key)
    └── uuid: string (identificador único)
```

#### Mejora para ChatEAM: Chatbot Builder por Queue

Cada Queue (cola de atención) en ChatEAM puede tener su propio chatbot entrenado:

```typescript
// Evolución del Prompt actual → ChatbotConfig
interface ChatbotConfig {
  id: number;
  companyId: number;
  queueId?: number;            // Vinculado a cola específica
  name: string;
  role: string;                // "Eres un asistente de ventas..."
  firstMessage: string;        // Mensaje de bienvenida
  model: string;               // Modelo IA a usar
  instructions: string;        // System prompt detallado
  interests: string[];         // Temas permitidos
  temperature: number;
  maxTokens: number;
  status: 'draft' | 'training' | 'trained' | 'active';
  // UI Customization (para widget embebible)
  widgetColor: string;
  widgetPosition: 'bottom-right' | 'bottom-left';
  avatarUrl?: string;
  // RAG sources
  dataSources: ChatbotDataSource[];
}

interface ChatbotDataSource {
  id: number;
  chatbotId: number;
  type: 'text' | 'file' | 'url' | 'qa_pairs' | 'ticket_history';
  content?: string;
  fileUrl?: string;
  sourceUrl?: string;
  status: 'pending' | 'processing' | 'processed' | 'error';
  chunksCount: number;
  tokensCount: number;
  lastProcessedAt?: Date;
}
```

### 8.5 OpenAI Realtime API para Audio Bidireccional

**Hallazgo crítico de MagicAI:** Integración con `gpt-4o-realtime-preview` para chat de voz en tiempo real. Esto es **transformador para WhatsApp**:

#### Flujo de Audio Realtime

```
1. 🎤 Usuario envía nota de voz (WhatsApp)
   ↓
2. 📡 Audio stream → OpenAI Realtime API
   ├── Transcripción simultánea (STT)
   ├── Procesamiento por LLM
   └── Generación de respuesta de voz (TTS)
   ↓
3. 🔊 Respuesta de audio → WhatsApp
   (Latencia total: ~1-2 segundos)
```

#### Componentes a Migrar de MagicAI

| Componente MagicAI | Adaptación ChatEAM | Prioridad |
|--------------------|--------------------|-----------|
| `openaiRealtime.js` | `RealtimeAudioService.ts` | 🔴 Alta |
| Audio buffer management | Manejo de streams WebSocket | 🔴 Alta |
| Balance check per-query | Integrar con sistema de créditos | 🟡 Media |
| Voice visualization (barras) | No necesario (backend only) | ❌ N/A |

```typescript
// Nuevo servicio: RealtimeAudioService
interface RealtimeAudioConfig {
  model: 'gpt-4o-realtime-preview-2024-12-17';
  voice: 'alloy' | 'echo' | 'shimmer' | 'ash' | 'coral' | 'sage';
  inputAudioFormat: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  outputAudioFormat: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  turnDetection: 'server_vad' | 'manual';
  temperature: number;
  maxResponseTokens: number;
}
```

### 8.6 Generación Multimodal de Contenido

MagicAI tiene **16 generadores de contenido** que pueden expandir las capacidades de ChatEAM como plataforma de marketing/contenido para clientes:

#### Generadores Aplicables a CRM Omnicanal

| Generador | Aplicación en ChatEAM | Impacto |
|-----------|----------------------|---------|
| **AI Writer** (templates) | Generar respuestas de email, SMS, campañas | 🔴 Alto |
| **AI Article Wizard** | Contenido de blog para clientes (multi-paso) | 🟡 Medio |
| **AI Image** (DALL-E, Flux, Stable Diffusion) | Imágenes para campañas de marketing | 🟡 Medio |
| **AI Voiceover** (ElevenLabs, Google TTS) | Mensajes de voz personalizados en WhatsApp | 🔴 Alto |
| **AI Video** (Sora, Kling, Heygen) | Videos promocionales con avatar | 🟡 Medio |
| **AI PDF** (procesamiento) | Extraer info de PDFs de clientes | 🔴 Alto |
| **AI Vision** (análisis de imágenes) | Procesar fotos enviadas por WhatsApp | 🔴 Alto |
| **AI Code** | No aplicable directamente | ❌ |
| **AI Rewriter** | Mejorar respuestas de agentes humanos | 🟡 Medio |
| **AI Plagiarism Check** | Verificar contenido de campañas | 🟢 Bajo |
| **AI YouTube Transcript** | Extraer info de videos para KB | 🟡 Medio |
| **AI RSS** | Auto-alimentar KB desde blogs/noticias | 🟡 Medio |
| **AI Music Pro** | Jingles para campañas IVR | 🟢 Bajo |

#### Wizard Multi-Paso (Patrón de MagicAI)

El `article_wizard` de MagicAI usa un flujo multi-paso que es ideal para campañas de marketing:

```
Paso 1: Keywords → IA sugiere temas
Paso 2: Selección de tema → IA genera outline
Paso 3: Outline → IA genera contenido completo
Paso 4: Contenido → IA genera imágenes asociadas
Paso 5: Review → Publicación en canales
```

**Adaptación para ChatEAM — Campaign Wizard:**

```
Paso 1: Objetivo + audiencia → IA sugiere mensajes
Paso 2: Selección de mensaje → IA genera variantes A/B
Paso 3: Variantes → IA genera imagen/video complementario
Paso 4: Preview → Envío a WhatsApp/Email/SMS
Paso 5: Analytics → IA analiza resultados y recomienda optimizaciones
```

### 8.7 Sistema de Extensiones/Plugins

MagicAI tiene una tabla `extensions` que permite instalar funcionalidades modulares. Este patrón es valioso para ChatEAM:

```typescript
// Nuevo modelo: Extension
interface Extension {
  id: number;
  slug: string;           // 'ai-voiceover', 'ai-video', 'campaign-wizard'
  name: string;
  description: string;
  version: string;
  installed: boolean;
  isCore: boolean;        // true = no se puede desinstalar
  requiredPlan: string;   // Plan mínimo requerido
  config: Record<string, any>; // Configuración específica
  companyId?: number;     // null = global, number = por empresa
}
```

**Extensiones propuestas para ChatEAM:**

| Extensión | Slug | Plan Mínimo | Descripción |
|-----------|------|-------------|-------------|
| AI Agents Core | `ai-agents-core` | Starter | Agentes básicos (Router + RAG + Soporte) |
| AI Sales Agent | `ai-sales-agent` | Pro | Agente de ventas + pipeline CRM |
| AI Voice | `ai-voice` | Business | Audio bidireccional, TTS, STT |
| AI Video Messages | `ai-video-msg` | Business | Videos personalizados con avatar |
| AI Campaign Wizard | `ai-campaign-wizard` | Pro | Wizard multi-paso para campañas |
| AI Knowledge Base Pro | `ai-kb-pro` | Pro | KB avanzada con Graph RAG |
| AI Analytics | `ai-analytics` | Business | Dashboard 18 widgets + insights |
| AI Chatbot Builder | `ai-chatbot-builder` | Pro | Constructor visual de chatbots |
| AI PDF Processor | `ai-pdf-processor` | Starter | Procesamiento de PDFs con IA |
| AI Vision | `ai-vision` | Pro | Análisis de imágenes recibidas |
| AI Multi-Language | `ai-multilang` | Starter | 23+ idiomas auto-detectados |
| AI Affiliate | `ai-affiliate` | Enterprise | Sistema de afiliados |

### 8.8 Dashboard Administrativo con 18 Widgets

MagicAI tiene un dashboard con 18 widgets configurables. Los más relevantes para ChatEAM:

| Widget MagicAI | Adaptación ChatEAM | Prioridad |
|---------------|-------------------|-----------|
| Usage Overview | **Uso de IA por empresa** (mensajes, tokens, costo) | 🔴 Alta |
| Finance | **Ingresos por plan de IA** (MRR, churn) | 🔴 Alta |
| API Cost Distribution | **Distribución de costos por proveedor** (OpenAI vs Claude vs Gemini) | 🔴 Alta |
| Cost Management | **Alertas de consumo** (empresa cerca del límite) | 🟡 Media |
| Popular AI Tools | **Agentes más usados** (RAG, Ventas, Soporte, Escalación) | 🟡 Media |
| Generated Content | **Resoluciones IA vs humanas** (ratio) | 🔴 Alta |
| Revenue Source | **Distribución por plan** (Starter, Pro, Business, Enterprise) | 🟡 Media |
| System Status | **Estado de proveedores IA** (uptime OpenAI, Claude, etc.) | 🔴 Alta |
| New Customers | **Nuevas empresas con IA activa** | 🟡 Media |
| Recent Transactions | **Últimas transacciones de créditos** | 🟡 Media |
| Top Countries | **Uso por país/región** | 🟢 Baja |
| User Traffic | **Mensajes IA por hora/día** (heatmap) | 🟡 Media |

### 8.9 Dominios Personalizados para Chatbots (White-Label)

MagicAI permite alojar chatbots en dominios personalizados del cliente. Esto es un **diferenciador premium**:

```typescript
// Nuevo modelo: ChatbotDomain
interface ChatbotDomain {
  id: number;
  uuid: string;              // ID público
  domain: string;            // "chat.clienteempresa.com"
  appKey: string;            // API key para autenticación
  chatbotId: number;         // Chatbot vinculado
  companyId: number;
  sslEnabled: boolean;
  customCss?: string;        // Estilos personalizados
  customJs?: string;         // Scripts personalizados
  allowedOrigins: string[];  // CORS
  status: 'pending_dns' | 'active' | 'suspended';
}
```

**Widget embebible:**
```html
<!-- Código para que el cliente pegue en su sitio web -->
<script
  src="https://appro.chateam.ws/chatbot/widget.js"
  data-app-key="ck_live_xxxx"
  data-chatbot-id="uuid-xxx"
  data-color="#007bff"
  data-position="bottom-right">
</script>
```

### 8.10 Pasarelas de Pago Adicionales

MagicAI soporta 3 pasarelas vs solo Stripe en ChatEAM:

| Pasarela | MagicAI | ChatEAM Actual | Acción |
|----------|---------|----------------|--------|
| **Stripe** | ✅ | ✅ | Ya implementado |
| **Yokassa** | ✅ | ❌ | Agregar para mercado ruso/CIS |
| **Coingate** | ✅ | ❌ | Agregar pagos en criptomonedas |
| **MercadoPago** | ❌ | ❌ | **Prioridad para Latam** |
| **PayPal** | ❌ | ❌ | Considerar para mercado global |

### 8.11 Sistema de Plantillas de Email Dinámicas

MagicAI tiene un sistema de email templates con variables dinámicas que ChatEAM necesita:

```typescript
// Nuevo modelo: EmailTemplate
interface EmailTemplate {
  id: number;
  companyId?: number;        // null = sistema, number = empresa
  type: 'system' | 'custom' | 'ai_generated';
  slug: string;              // 'welcome', 'subscription_success', 'credit_low'
  subject: string;
  body: string;              // HTML con variables: {user_name}, {plan_name}, etc.
  variables: string[];       // Variables disponibles
  isActive: boolean;
}

// Variables dinámicas soportadas
const EMAIL_VARIABLES = {
  '{user_name}': 'Nombre del usuario',
  '{company_name}': 'Nombre de la empresa',
  '{plan_name}': 'Nombre del plan',
  '{credits_remaining}': 'Créditos restantes',
  '{site_name}': 'Nombre del sitio',
  '{login_url}': 'URL de login',
  '{dashboard_url}': 'URL del dashboard',
  '{support_url}': 'URL de soporte',
  '{unsubscribe_url}': 'URL para cancelar suscripción',
};
```

**Templates esenciales a crear:**
1. `subscription_success` — Suscripción exitosa a plan IA
2. `credit_low` — Créditos de IA por agotarse (alerta)
3. `credit_depleted` — Créditos agotados
4. `agent_trained` — Chatbot/agente entrenado exitosamente
5. `monthly_report` — Reporte mensual de uso IA
6. `new_feature` — Nueva funcionalidad de IA disponible

### 8.12 Multi-Idioma Avanzado (23+ Idiomas)

MagicAI soporta 23+ idiomas nativos. Para ChatEAM enfocado en Latam:

**Idiomas prioritarios:**

| Idioma | Prioridad | Mercado |
|--------|-----------|---------|
| 🇪🇸 Español | 🔴 Crítica | Latam + España |
| 🇧🇷 Portugués | 🔴 Crítica | Brasil |
| 🇺🇸 Inglés | 🔴 Crítica | Global |
| 🇫🇷 Francés | 🟡 Media | Canadá, África francófona |
| 🇩🇪 Alemán | 🟢 Baja | Europa central |
| 🇮🇹 Italiano | 🟢 Baja | Italia |
| 🇨🇳 Chino | 🟢 Baja | Comunidad china en Latam |

**Implementación:** Auto-detección del idioma del mensaje entrante + respuesta en el mismo idioma por el Agente Router.

### 8.13 Programa de Afiliados

MagicAI incluye un sistema de afiliados integrado que puede impulsar la adquisición de clientes:

```typescript
// Nuevo modelo: AffiliateProgram
interface AffiliateProgram {
  id: number;
  companyId: number;         // Empresa afiliada
  referralCode: string;      // Código único "CHATEAM-XXX"
  commissionRate: number;    // 15-30% de la suscripción
  minimumWithdrawal: number; // Mínimo para retirar ($50)
  totalEarnings: number;
  pendingEarnings: number;
  withdrawnEarnings: number;
  referralsCount: number;
  activeReferrals: number;
  status: 'active' | 'suspended' | 'pending_approval';
}
```

### 8.14 Resumen de Importaciones de MagicAI

| # | Mejora | Impacto en ChatEAM | Esfuerzo | Fase |
|---|--------|-------------------|----------|------|
| 1 | **196 modelos IA** (catálogo expandido) | Flexibilidad multi-proveedor | 5 días | Fase 1 |
| 2 | **Créditos granulares** (12 tipos) | Facturación precisa por uso | 4 días | Fase 1 |
| 3 | **Equipos y Seats** | Enterprise, multi-usuario | 5 días | Fase 2 |
| 4 | **Chatbot Builder** con RAG entrenado | Self-service para clientes | 8 días | Fase 2 |
| 5 | **OpenAI Realtime Audio** | Audio bidireccional WhatsApp | 5 días | Fase 3 |
| 6 | **Generadores multimodales** (Writer, Vision, PDF) | Suite completa de IA | 10 días | Fase 3-4 |
| 7 | **Sistema de extensiones** | Modularidad, planes escalables | 3 días | Fase 2 |
| 8 | **Dashboard 18 widgets** | Observabilidad de negocio | 8 días | Fase 3 |
| 9 | **Dominios personalizados** (white-label chatbot) | Diferenciador premium | 4 días | Fase 4 |
| 10 | **Pasarelas de pago** (MercadoPago, Coingate) | Cobertura Latam + crypto | 5 días | Fase 3 |
| 11 | **Email templates** dinámicos | Comunicación automatizada | 3 días | Fase 2 |
| 12 | **Multi-idioma** (23+ idiomas) | Mercado global | 3 días | Fase 2 |
| 13 | **Programa de afiliados** | Adquisición orgánica | 5 días | Fase 4 |
| 14 | **Campaign Wizard** (multi-paso) | Marketing automatizado con IA | 8 días | Fase 4 |

---

## 9. Migraciones de Base de Datos

### 9.1 Migraciones Fase 1: RAG Avanzado + Catálogo de Modelos

```sql
-- ============================================================
-- MIGRACIÓN 001: Extensión pgvector
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- Para búsqueda fuzzy

-- ============================================================
-- MIGRACIÓN 002: Catálogo de Entidades/Modelos IA (inspirado en MagicAI entities)
-- ============================================================
CREATE TABLE ai_entities (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,      -- "gpt-4.1-mini"
    title VARCHAR(255) NOT NULL,            -- "GPT-4.1 Mini"
    engine VARCHAR(50) NOT NULL,            -- 'openai','anthropic','google','xai','deepseek','openrouter'
    type VARCHAR(30) NOT NULL,              -- 'text','image','video','audio','embedding','realtime'
    input_price DECIMAL(10,6) DEFAULT 0,    -- USD por 1M tokens input
    output_price DECIMAL(10,6) DEFAULT 0,   -- USD por 1M tokens output
    max_tokens INTEGER DEFAULT 4096,
    capabilities JSONB DEFAULT '[]',        -- ['vision','function_calling','streaming']
    status VARCHAR(20) DEFAULT 'active',    -- 'active','deprecated','beta'
    is_selected BOOLEAN DEFAULT false,      -- Modelo por defecto para su tipo
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entities_engine_type ON ai_entities(engine, type);
CREATE INDEX idx_entities_status ON ai_entities(status);

-- ============================================================
-- MIGRACIÓN 003: Documentos de Knowledge Base
-- ============================================================
CREATE TABLE ai_documents (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL,
    title VARCHAR(500) NOT NULL,
    source_type VARCHAR(50) NOT NULL,       -- 'pdf','txt','xlsx','url','ticket','qa_pairs'
    source_url TEXT,
    file_path TEXT,
    file_size_bytes BIGINT DEFAULT 0,
    chunks_count INTEGER DEFAULT 0,
    tokens_count INTEGER DEFAULT 0,
    status VARCHAR(30) DEFAULT 'pending',   -- 'pending','processing','processed','error'
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_company ON ai_documents(company_id);
CREATE INDEX idx_documents_status ON ai_documents(status);

-- ============================================================
-- MIGRACIÓN 004: Chunks con embeddings vectoriales
-- ============================================================
CREATE TABLE ai_chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES ai_documents(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    token_count INTEGER DEFAULT 0,
    embedding vector(1536),                 -- text-embedding-3-small
    topic VARCHAR(255),
    keywords TEXT[],
    parent_chunk_id INTEGER REFERENCES ai_chunks(id), -- Para parent-child chunking
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chunks_company ON ai_chunks(company_id);
CREATE INDEX idx_chunks_document ON ai_chunks(document_id);
CREATE INDEX idx_chunks_embedding ON ai_chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_chunks_content_fts ON ai_chunks
    USING gin(to_tsvector('spanish', content));
CREATE INDEX idx_chunks_keywords ON ai_chunks USING gin(keywords);

-- ============================================================
-- MIGRACIÓN 005: Cache semántico
-- ============================================================
CREATE TABLE ai_semantic_cache (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL,
    query_embedding vector(1536),
    query_text TEXT NOT NULL,
    response TEXT NOT NULL,
    model_used VARCHAR(100),
    agent_used VARCHAR(50),
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    cost_usd DECIMAL(10,6) DEFAULT 0,
    hit_count INTEGER DEFAULT 1,
    last_hit_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX idx_cache_company ON ai_semantic_cache(company_id);
CREATE INDEX idx_cache_embedding ON ai_semantic_cache
    USING ivfflat (query_embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX idx_cache_expires ON ai_semantic_cache(expires_at);

-- ============================================================
-- MIGRACIÓN 006: Créditos granulares por tipo (inspirado en MagicAI tokens)
-- ============================================================
CREATE TABLE ai_credit_types (
    id SERIAL PRIMARY KEY,
    key VARCHAR(50) NOT NULL UNIQUE,        -- 'message','image','video','audio_minute','rag_query'
    name VARCHAR(100) NOT NULL,
    description TEXT,
    unit VARCHAR(30) NOT NULL,              -- 'unit','token','minute','character','second'
    default_cost DECIMAL(10,6) DEFAULT 0,   -- Costo por unidad en USD
    is_active BOOLEAN DEFAULT true
);

-- Insertar tipos de créditos base
INSERT INTO ai_credit_types (key, name, unit, default_cost) VALUES
    ('message', 'Mensaje IA', 'unit', 0.001),
    ('image', 'Imagen Generada', 'unit', 0.04),
    ('video', 'Video Generado', 'unit', 0.50),
    ('audio_minute', 'Minuto de Audio', 'minute', 0.006),
    ('tts_character', 'Carácter TTS', 'character', 0.000015),
    ('rag_query', 'Consulta RAG', 'unit', 0.0007),
    ('embedding_token', 'Token de Embedding', 'token', 0.00000002),
    ('agent_execution', 'Ejecución de Agente', 'unit', 0.002),
    ('kb_document', 'Documento en KB', 'unit', 0.01),
    ('vision_analysis', 'Análisis de Imagen', 'unit', 0.005),
    ('pdf_processing', 'Procesamiento de PDF', 'unit', 0.02);

-- Tabla de balances de créditos por empresa y tipo
CREATE TABLE ai_credit_balances (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL,
    credit_type_id INTEGER NOT NULL REFERENCES ai_credit_types(id),
    total_credits DECIMAL(15,4) DEFAULT 0,
    used_credits DECIMAL(15,4) DEFAULT 0,
    remaining_credits DECIMAL(15,4) GENERATED ALWAYS AS (total_credits - used_credits) STORED,
    reset_at TIMESTAMPTZ,                   -- Para planes con reset mensual
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, credit_type_id)
);

CREATE INDEX idx_balances_company ON ai_credit_balances(company_id);
```

### 9.2 Migraciones Fase 2: Agentes + Teams + Chatbot Builder

```sql
-- ============================================================
-- MIGRACIÓN 007: Configuración de Agentes IA
-- ============================================================
CREATE TABLE ai_agent_configs (
    id SERIAL PRIMARY KEY,
    company_id INTEGER,                     -- null = global, number = empresa
    agent_type VARCHAR(50) NOT NULL,        -- 'router','rag','sales','support','escalation','supervisor'
    name VARCHAR(255) NOT NULL,
    description TEXT,
    model_key VARCHAR(100) NOT NULL,        -- Referencia a ai_entities.key
    system_prompt TEXT NOT NULL,
    temperature DECIMAL(3,2) DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 1024,
    tools JSONB DEFAULT '[]',               -- Herramientas habilitadas
    guardrails JSONB DEFAULT '{}',          -- Configuración de guardrails
    confidence_threshold DECIMAL(3,2) DEFAULT 0.7,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_configs_company ON ai_agent_configs(company_id);
CREATE INDEX idx_agent_configs_type ON ai_agent_configs(agent_type);

-- ============================================================
-- MIGRACIÓN 008: Logs de ejecución de Agentes
-- ============================================================
CREATE TABLE ai_agent_logs (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL,
    ticket_id INTEGER,
    contact_id INTEGER,
    agent_type VARCHAR(50) NOT NULL,
    model_used VARCHAR(100),
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_usd DECIMAL(10,6) DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    confidence DECIMAL(3,2),
    was_escalated BOOLEAN DEFAULT false,
    escalation_reason VARCHAR(255),
    cache_hit BOOLEAN DEFAULT false,
    tools_used JSONB DEFAULT '[]',
    input_summary TEXT,
    output_summary TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_logs_company_date ON ai_agent_logs(company_id, created_at);
CREATE INDEX idx_agent_logs_type ON ai_agent_logs(agent_type);
CREATE INDEX idx_agent_logs_ticket ON ai_agent_logs(ticket_id);

-- ============================================================
-- MIGRACIÓN 009: Equipos IA (inspirado en MagicAI teams)
-- ============================================================
CREATE TABLE ai_teams (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    manager_id INTEGER NOT NULL,            -- userId administrador
    max_seats INTEGER DEFAULT 5,
    ai_models_allowed JSONB DEFAULT '[]',   -- Modelos permitidos
    features JSONB DEFAULT '[]',            -- Features habilitadas
    shared_credits JSONB DEFAULT '{}',      -- entity_credits compartidos
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai_team_members (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES ai_teams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    role VARCHAR(20) DEFAULT 'agent',       -- 'admin','agent','viewer'
    unlimited_credits BOOLEAN DEFAULT false,
    individual_credits JSONB DEFAULT '{}',
    used_credits JSONB DEFAULT '{}',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- ============================================================
-- MIGRACIÓN 010: Chatbot Builder (inspirado en MagicAI chatbot)
-- ============================================================
CREATE TABLE ai_chatbot_configs (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL,
    queue_id INTEGER,                       -- Vinculado a cola específica
    name VARCHAR(255) NOT NULL,
    role TEXT,                              -- Rol del chatbot
    first_message TEXT,                     -- Mensaje de bienvenida
    model_key VARCHAR(100) DEFAULT 'gpt-4.1-mini',
    instructions TEXT,                      -- System prompt custom
    interests TEXT[],                       -- Temas permitidos
    temperature DECIMAL(3,2) DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 1024,
    -- UI Widget Customization
    widget_color VARCHAR(7) DEFAULT '#007bff',
    widget_position VARCHAR(20) DEFAULT 'bottom-right',
    avatar_url TEXT,
    widget_title VARCHAR(100),
    -- Status
    status VARCHAR(20) DEFAULT 'draft',     -- 'draft','training','trained','active'
    trained_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai_chatbot_data_sources (
    id SERIAL PRIMARY KEY,
    chatbot_id INTEGER NOT NULL REFERENCES ai_chatbot_configs(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL,
    type VARCHAR(30) NOT NULL,              -- 'text','file','url','qa_pairs','ticket_history'
    content TEXT,
    file_url TEXT,
    source_url TEXT,
    status VARCHAR(20) DEFAULT 'pending',   -- 'pending','processing','processed','error'
    chunks_count INTEGER DEFAULT 0,
    tokens_count INTEGER DEFAULT 0,
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MIGRACIÓN 011: Extensiones/Plugins (inspirado en MagicAI extensions)
-- ============================================================
CREATE TABLE ai_extensions (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(20) DEFAULT '1.0.0',
    is_core BOOLEAN DEFAULT false,          -- No se puede desinstalar
    required_plan VARCHAR(50),              -- Plan mínimo requerido
    config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extensiones por empresa
CREATE TABLE ai_company_extensions (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL,
    extension_id INTEGER NOT NULL REFERENCES ai_extensions(id),
    installed BOOLEAN DEFAULT false,
    config_override JSONB DEFAULT '{}',     -- Config específica de la empresa
    installed_at TIMESTAMPTZ,
    UNIQUE(company_id, extension_id)
);

-- Insertar extensiones base
INSERT INTO ai_extensions (slug, name, description, is_core, required_plan) VALUES
    ('ai-agents-core', 'AI Agents Core', 'Agentes básicos: Router + RAG + Soporte', true, 'starter'),
    ('ai-sales-agent', 'AI Sales Agent', 'Agente de ventas + pipeline CRM', false, 'pro'),
    ('ai-voice', 'AI Voice', 'Audio bidireccional, TTS, STT', false, 'business'),
    ('ai-video-msg', 'AI Video Messages', 'Videos personalizados con avatar', false, 'business'),
    ('ai-campaign-wizard', 'AI Campaign Wizard', 'Wizard multi-paso para campañas', false, 'pro'),
    ('ai-kb-pro', 'AI Knowledge Base Pro', 'KB avanzada con Graph RAG', false, 'pro'),
    ('ai-analytics', 'AI Analytics', 'Dashboard con widgets + insights', false, 'business'),
    ('ai-chatbot-builder', 'AI Chatbot Builder', 'Constructor visual de chatbots', false, 'pro'),
    ('ai-pdf-processor', 'AI PDF Processor', 'Procesamiento de PDFs con IA', false, 'starter'),
    ('ai-vision', 'AI Vision', 'Análisis de imágenes recibidas', false, 'pro'),
    ('ai-multilang', 'AI Multi-Language', '23+ idiomas auto-detectados', false, 'starter'),
    ('ai-affiliate', 'AI Affiliate Program', 'Sistema de afiliados', false, 'enterprise');

-- ============================================================
-- MIGRACIÓN 012: Email Templates Dinámicos (inspirado en MagicAI)
-- ============================================================
CREATE TABLE ai_email_templates (
    id SERIAL PRIMARY KEY,
    company_id INTEGER,                     -- null = sistema
    type VARCHAR(20) DEFAULT 'system',      -- 'system','custom','ai_generated'
    slug VARCHAR(100) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,                      -- HTML con variables {user_name}, etc.
    variables TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO ai_email_templates (type, slug, subject, body, variables) VALUES
    ('system', 'ai_subscription_success', 'Tu plan de IA {plan_name} está activo', '<h1>¡Bienvenido, {user_name}!</h1><p>Tu plan <strong>{plan_name}</strong> está activo con {credits_total} créditos de IA.</p>', '{user_name,plan_name,credits_total}'),
    ('system', 'ai_credits_low', 'Alerta: Tus créditos de IA están por agotarse', '<h1>Hola {user_name}</h1><p>Te quedan solo <strong>{credits_remaining}</strong> créditos de IA. <a href="{upgrade_url}">Actualiza tu plan</a> para seguir usando la IA.</p>', '{user_name,credits_remaining,upgrade_url}'),
    ('system', 'ai_credits_depleted', 'Tus créditos de IA se agotaron', '<h1>{user_name}</h1><p>Tus créditos se han agotado. <a href="{upgrade_url}">Recarga aquí</a>.</p>', '{user_name,upgrade_url}'),
    ('system', 'ai_agent_trained', 'Tu agente IA está listo', '<h1>¡Excelente, {user_name}!</h1><p>El agente <strong>{agent_name}</strong> ha sido entrenado con {documents_count} documentos y está listo para atender.</p>', '{user_name,agent_name,documents_count}'),
    ('system', 'ai_monthly_report', 'Reporte mensual de IA - {month}', '<h1>Reporte de {month}</h1><p>Mensajes IA: {messages_count}</p><p>Resoluciones: {resolutions_count}</p><p>Ahorro estimado: ${savings_usd}</p>', '{user_name,month,messages_count,resolutions_count,savings_usd}');
```

### 9.3 Migraciones Fase 3: Observabilidad + Dominios + Afiliados

```sql
-- ============================================================
-- MIGRACIÓN 013: Dominios personalizados para chatbots (white-label)
-- ============================================================
CREATE TABLE ai_chatbot_domains (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL UNIQUE DEFAULT gen_random_uuid()::varchar,
    chatbot_id INTEGER NOT NULL REFERENCES ai_chatbot_configs(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL,
    domain VARCHAR(255) NOT NULL UNIQUE,
    app_key VARCHAR(64) NOT NULL UNIQUE,
    ssl_enabled BOOLEAN DEFAULT false,
    custom_css TEXT,
    custom_js TEXT,
    allowed_origins JSONB DEFAULT '["*"]',
    status VARCHAR(20) DEFAULT 'pending_dns', -- 'pending_dns','active','suspended'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MIGRACIÓN 014: Programa de afiliados
-- ============================================================
CREATE TABLE ai_affiliate_programs (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL UNIQUE,
    referral_code VARCHAR(50) NOT NULL UNIQUE,
    commission_rate DECIMAL(5,2) DEFAULT 20.00, -- 20%
    minimum_withdrawal DECIMAL(10,2) DEFAULT 50.00,
    total_earnings DECIMAL(10,2) DEFAULT 0,
    pending_earnings DECIMAL(10,2) DEFAULT 0,
    withdrawn_earnings DECIMAL(10,2) DEFAULT 0,
    referrals_count INTEGER DEFAULT 0,
    active_referrals INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending_approval',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai_affiliate_referrals (
    id SERIAL PRIMARY KEY,
    affiliate_id INTEGER NOT NULL REFERENCES ai_affiliate_programs(id),
    referred_company_id INTEGER NOT NULL,
    subscription_id INTEGER,
    commission_amount DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',   -- 'pending','paid','cancelled'
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MIGRACIÓN 015: Métricas agregadas para dashboard (inspirado en MagicAI usage)
-- ============================================================
CREATE TABLE ai_usage_metrics (
    id SERIAL PRIMARY KEY,
    company_id INTEGER,                     -- null = global
    date DATE NOT NULL,
    period VARCHAR(10) DEFAULT 'daily',     -- 'daily','weekly','monthly'
    -- Métricas de uso
    total_messages INTEGER DEFAULT 0,
    ai_messages INTEGER DEFAULT 0,
    human_messages INTEGER DEFAULT 0,
    ai_resolutions INTEGER DEFAULT 0,
    escalations INTEGER DEFAULT 0,
    -- Métricas de agentes
    router_calls INTEGER DEFAULT 0,
    rag_calls INTEGER DEFAULT 0,
    sales_calls INTEGER DEFAULT 0,
    support_calls INTEGER DEFAULT 0,
    escalation_calls INTEGER DEFAULT 0,
    -- Métricas de costo
    total_tokens_input BIGINT DEFAULT 0,
    total_tokens_output BIGINT DEFAULT 0,
    total_cost_usd DECIMAL(10,4) DEFAULT 0,
    -- Métricas de rendimiento
    avg_latency_ms INTEGER DEFAULT 0,
    cache_hit_rate DECIMAL(5,2) DEFAULT 0,
    avg_confidence DECIMAL(3,2) DEFAULT 0,
    -- Métricas de negocio
    new_companies INTEGER DEFAULT 0,
    active_companies INTEGER DEFAULT 0,
    mrr_usd DECIMAL(10,2) DEFAULT 0,
    --
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, date, period)
);

CREATE INDEX idx_usage_company_date ON ai_usage_metrics(company_id, date);
CREATE INDEX idx_usage_period ON ai_usage_metrics(period, date);

-- ============================================================
-- MIGRACIÓN 016: Planes de IA expandidos (inspirado en MagicAI plans)
-- ============================================================
ALTER TABLE "AiTokenPlans" ADD COLUMN IF NOT EXISTS
    plan_ai_tools JSONB DEFAULT '[]';       -- Herramientas permitidas por plan
ALTER TABLE "AiTokenPlans" ADD COLUMN IF NOT EXISTS
    plan_features JSONB DEFAULT '[]';       -- Features incluidas
ALTER TABLE "AiTokenPlans" ADD COLUMN IF NOT EXISTS
    ai_models JSONB DEFAULT '[]';           -- Modelos disponibles
ALTER TABLE "AiTokenPlans" ADD COLUMN IF NOT EXISTS
    multi_model_support BOOLEAN DEFAULT false;
ALTER TABLE "AiTokenPlans" ADD COLUMN IF NOT EXISTS
    trial_days INTEGER DEFAULT 0;
ALTER TABLE "AiTokenPlans" ADD COLUMN IF NOT EXISTS
    reset_credits_on_renewal BOOLEAN DEFAULT true;
ALTER TABLE "AiTokenPlans" ADD COLUMN IF NOT EXISTS
    is_team_plan BOOLEAN DEFAULT false;
ALTER TABLE "AiTokenPlans" ADD COLUMN IF NOT EXISTS
    max_seats INTEGER DEFAULT 1;
ALTER TABLE "AiTokenPlans" ADD COLUMN IF NOT EXISTS
    max_kb_documents INTEGER DEFAULT 10;
ALTER TABLE "AiTokenPlans" ADD COLUMN IF NOT EXISTS
    max_chatbots INTEGER DEFAULT 1;
ALTER TABLE "AiTokenPlans" ADD COLUMN IF NOT EXISTS
    extensions_included JSONB DEFAULT '[]'; -- Extensiones incluidas en el plan
```

### 9.4 Resumen de Migraciones

| # | Migración | Tabla(s) | Inspiración | Fase |
|---|-----------|----------|-------------|------|
| 001 | pgvector + pg_trgm | Extensiones | ChatEAM propio | 1 |
| 002 | Catálogo de modelos IA | `ai_entities` | MagicAI `entities` | 1 |
| 003 | Documentos de KB | `ai_documents` | ChatEAM propio | 1 |
| 004 | Chunks con embeddings | `ai_chunks` | MagicAI `chatbot_data_vectors` | 1 |
| 005 | Cache semántico | `ai_semantic_cache` | Investigación RAG | 1 |
| 006 | Créditos granulares | `ai_credit_types`, `ai_credit_balances` | MagicAI `tokens` | 1 |
| 007 | Config de agentes | `ai_agent_configs` | ChatEAM propio | 2 |
| 008 | Logs de agentes | `ai_agent_logs` | ChatEAM propio | 2 |
| 009 | Equipos IA | `ai_teams`, `ai_team_members` | MagicAI `teams` | 2 |
| 010 | Chatbot Builder | `ai_chatbot_configs`, `ai_chatbot_data_sources` | MagicAI `chatbot` | 2 |
| 011 | Extensiones | `ai_extensions`, `ai_company_extensions` | MagicAI `extensions` | 2 |
| 012 | Email Templates | `ai_email_templates` | MagicAI `email_templates` | 2 |
| 013 | Dominios white-label | `ai_chatbot_domains` | MagicAI `domains` | 3 |
| 014 | Afiliados | `ai_affiliate_programs`, `ai_affiliate_referrals` | MagicAI affiliates | 3 |
| 015 | Métricas dashboard | `ai_usage_metrics` | MagicAI `usage` | 3 |
| 016 | Planes expandidos | ALTER `AiTokenPlans` | MagicAI `plans` | 3 |

**Total: 16 migraciones, 20+ tablas nuevas, 8 columnas alteradas**

---

## 10. Roadmap de Implementación

### Fase 1: Fundación RAG Avanzado + Catálogo de Modelos (Semanas 1-6)

**Objetivo:** Migrar de JSON a pgvector, implementar búsqueda híbrida, catálogo de modelos expandido, créditos granulares

| Tarea | Prioridad | Esfuerzo | Dependencia | Origen |
|-------|-----------|----------|-------------|--------|
| Instalar extensión pgvector + pg_trgm en PostgreSQL 15 | 🔴 Alta | 1 día | Ninguna | Plan original |
| Ejecutar migraciones 001-006 (entities, documents, chunks, cache, créditos) | 🔴 Alta | 3 días | pgvector | Plan + MagicAI |
| Poblar tabla `ai_entities` con 50+ modelos de IA | 🔴 Alta | 2 días | Migración 002 | **MagicAI** |
| Migrar embeddings existentes de JSON a pgvector | 🔴 Alta | 3 días | Migración 004 | Plan original |
| Implementar búsqueda vectorial con pgvector | 🔴 Alta | 3 días | Migración datos | Plan original |
| Implementar BM25 con tsvector (español + portugués) | 🟡 Media | 2 días | Migraciones | Plan original |
| Implementar Reciprocal Rank Fusion | 🟡 Media | 2 días | Vector + BM25 | Plan original |
| Implementar cache semántico con Redis + pgvector | 🟡 Media | 3 días | Búsqueda vectorial | Plan original |
| Crear Knowledge Base global por empresa (CRUD) | 🔴 Alta | 4 días | Migraciones | Plan original |
| Migrar sistema de créditos a modelo granular multi-tipo | 🔴 Alta | 4 días | Migración 006 | **MagicAI** |
| Implementar AIEntityService (catálogo dinámico de modelos) | 🟡 Media | 3 días | Migración 002 | **MagicAI** |
| Tests unitarios y de integración | 🔴 Alta | 3 días | Todo lo anterior | — |

**Entregable:** RAG con pgvector (+30% relevancia) + catálogo de 50+ modelos + créditos granulares

### Fase 2: Sistema Multi-Agente + Chatbot Builder + Teams (Semanas 7-12)

**Objetivo:** Router + 3 agentes + Chatbot Builder + Teams + Extensiones

| Tarea | Prioridad | Esfuerzo | Dependencia | Origen |
|-------|-----------|----------|-------------|--------|
| Ejecutar migraciones 007-012 (agentes, teams, chatbot, extensiones, emails) | 🔴 Alta | 2 días | Fase 1 | Plan + MagicAI |
| Instalar y configurar Mastra (o implementación custom) | 🔴 Alta | 3 días | Ninguna | Plan original |
| Implementar Agente Router (clasificación de intención) | 🔴 Alta | 3 días | Framework | Plan original |
| Implementar Agente RAG (búsqueda + respuesta) | 🔴 Alta | 4 días | Fase 1 + Framework | Plan original |
| Implementar Agente Soporte (diagnóstico + acciones) | 🔴 Alta | 5 días | Framework | Plan original |
| Implementar Model Routing (nano/mini/full) | 🟡 Media | 3 días | Router Agent | Plan original |
| Integrar agentes con pipeline de WhatsApp | 🔴 Alta | 3 días | Agentes | Plan original |
| Implementar Supervisor básico | 🟡 Media | 3 días | Router + Agentes | Plan original |
| Implementar fallback entre proveedores | 🟡 Media | 2 días | AIClientService | Plan original |
| **Implementar Chatbot Builder por Queue** | 🔴 Alta | 8 días | Migraciones | **MagicAI** |
| **Implementar sistema de Teams y Seats** | 🟡 Media | 5 días | Migraciones | **MagicAI** |
| **Implementar sistema de Extensiones** | 🟡 Media | 3 días | Migraciones | **MagicAI** |
| **Crear Email Templates dinámicos** | 🟡 Media | 3 días | Migración 012 | **MagicAI** |
| **Auto-detección de idioma + multi-idioma** | 🟡 Media | 3 días | Router Agent | **MagicAI** |
| Tests E2E del flujo completo | 🔴 Alta | 4 días | Todo lo anterior | — |

**Entregable:** 3 agentes en WhatsApp + Chatbot Builder + Teams + Extensiones + Multi-idioma

### Fase 3: Agentes Avanzados + Audio Realtime + Observabilidad (Semanas 13-18)

**Objetivo:** Agentes de Ventas y Escalación + Audio bidireccional + Dashboard 18 widgets + Dominios

| Tarea | Prioridad | Esfuerzo | Dependencia | Origen |
|-------|-----------|----------|-------------|--------|
| Ejecutar migraciones 013-016 (dominios, afiliados, métricas, planes) | 🔴 Alta | 2 días | Fase 2 | Plan + MagicAI |
| Implementar Agente de Ventas (CRM pipeline) | 🔴 Alta | 5 días | Fase 2 | Plan original |
| Implementar Agente de Escalación (human handoff) | 🔴 Alta | 4 días | Fase 2 | Plan original |
| **Implementar OpenAI Realtime Audio Service** | 🔴 Alta | 5 días | Agentes | **MagicAI** |
| **Integrar audio bidireccional con WhatsApp (notas de voz)** | 🔴 Alta | 4 días | Realtime Audio | **MagicAI** |
| Configurar Langfuse (self-hosted) para observabilidad | 🟡 Media | 3 días | Docker | Plan original |
| Implementar tracking completo (latencia, tokens, costos) | 🟡 Media | 3 días | Langfuse | Plan original |
| **Dashboard de métricas IA con 18 widgets** | 🔴 Alta | 8 días | Langfuse + Migración 015 | **MagicAI** |
| Implementar NeMo Guardrails (PII, jailbreak) | 🟡 Media | 3 días | Agentes | Plan original |
| **Integrar ElevenLabs TTS para mensajes de voz** | 🟡 Media | 3 días | Realtime Audio | **MagicAI** |
| **Implementar dominios personalizados (white-label chatbot)** | 🟡 Media | 4 días | Chatbot Builder | **MagicAI** |
| **Integrar MercadoPago como pasarela de pago** | 🟡 Media | 5 días | Sistema de planes | **MagicAI** |
| Implementar planes de pricing expandidos en Stripe | 🔴 Alta | 3 días | Migración 016 | Plan + MagicAI |
| A/B testing de prompts | 🟢 Baja | 2 días | Langfuse | Plan original |
| Tests de carga y performance | 🟡 Media | 3 días | Todo | — |

**Entregable:** 5 agentes + audio bidireccional + dashboard + white-label + MercadoPago

### Fase 4: Suite Multimodal + Escala (Semanas 19-24)

**Objetivo:** Graph RAG, Campaign Wizard, generadores multimodales, afiliados, optimización

| Tarea | Prioridad | Esfuerzo | Dependencia | Origen |
|-------|-----------|----------|-------------|--------|
| Implementar Graph RAG (knowledge graphs) | 🟡 Media | 5 días | Fase 1 | Plan original |
| Auto-indexación de tickets resueltos en KB | 🟡 Media | 3 días | KB global | Plan original |
| **Implementar Campaign Wizard multi-paso** | 🔴 Alta | 8 días | Agentes + Writer | **MagicAI** |
| **Implementar AI Writer** (generación de contenido para campañas) | 🟡 Media | 5 días | Modelos | **MagicAI** |
| **Implementar AI Vision** (análisis de imágenes recibidas por WhatsApp) | 🟡 Media | 4 días | Modelos | **MagicAI** |
| **Implementar AI PDF Processor** (extracción de info de PDFs) | 🟡 Media | 4 días | RAG | **MagicAI** |
| **Implementar YouTube Transcript** (extraer transcripciones para KB) | 🟢 Baja | 3 días | KB | **MagicAI** |
| **Implementar AI RSS** (auto-alimentar KB desde feeds) | 🟢 Baja | 3 días | KB | **MagicAI** |
| **Integrar video generativo** (Heygen/Synthesia para avatares) | 🟢 Baja | 5 días | Créditos | **MagicAI** |
| **Implementar programa de afiliados** | 🟡 Media | 5 días | Migración 014 | **MagicAI** |
| **Integrar pagos con criptomonedas** (Coingate) | 🟢 Baja | 3 días | Stripe | **MagicAI** |
| Fine-tuning de modelos con datos de empresa | 🟢 Baja | 5 días | Datos suficientes | Plan original |
| UI de configuración de agentes (no-code) | 🟡 Media | 5 días | Agentes estables | Plan original |
| Optimización de costos (fine-tuning, prompt caching) | 🟡 Media | 3 días | Métricas | Plan original |
| Documentación completa de API de agentes | 🔴 Alta | 3 días | Todo | — |

**Entregable:** Plataforma completa de AI Agents con suite multimodal, Campaign Wizard, afiliados — lista para GA

### Timeline Visual Actualizado

```
Semana:  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 21 22 23 24
         ├────────────────────┤
         │      FASE 1        │ RAG + pgvector + Modelos + Créditos
         │                    ├────────────────────────┤
         │                    │      FASE 2            │ Multi-Agente + Chatbot Builder + Teams
         │                    │                        ├────────────────────────┤
         │                    │                        │      FASE 3            │ Audio + Dashboard + White-Label
         │                    │                        │                        ├────────────────────────┤
         │                    │                        │                        │      FASE 4            │ Suite Multimodal + Escala
```

### Comparativa: Plan Original vs Plan Enriquecido con MagicAI

| Aspecto | Plan Original (v1.0) | Plan Enriquecido (v1.1) |
|---------|---------------------|------------------------|
| **Duración** | 16 semanas | 24 semanas |
| **Modelos IA** | ~12 modelos | **50+ modelos** (catálogo dinámico) |
| **Créditos** | Token tracking básico | **12 tipos granulares** |
| **RAG** | pgvector + búsqueda híbrida | pgvector + híbrida + **Graph RAG** |
| **Agentes** | 6 agentes | 6 agentes + **Chatbot Builder** |
| **Audio** | Whisper (STT) | Whisper + **Realtime bidireccional** + **ElevenLabs TTS** |
| **Dashboard** | Métricas básicas | **18 widgets** tipo MagicAI |
| **Pagos** | Solo Stripe | Stripe + **MercadoPago** + **Coingate** |
| **White-label** | No | **Dominios personalizados para chatbots** |
| **Marketing** | Campañas básicas | **Campaign Wizard multi-paso con IA** |
| **Contenido** | No | **AI Writer + AI Vision + AI PDF** |
| **Equipos** | No | **Teams con seats y créditos compartidos** |
| **Extensiones** | No | **12 extensiones modulares** |
| **Idiomas** | Español + Inglés | **23+ idiomas** con auto-detección |
| **Afiliados** | No | **Programa de afiliados integrado** |
| **Migraciones** | 6 tablas | **16 migraciones, 20+ tablas** |

---

## 11. Métricas de Éxito y KPIs

### 11.1 KPIs de Rendimiento IA

| Métrica | Baseline (actual) | Objetivo Fase 1 | Objetivo Fase 4 |
|---------|-------------------|-----------------|-----------------|
| **Tasa de resolución autónoma** | ~20% (estimado) | 45% | **80%+** |
| **Relevancia RAG** | ~65% | 80% | **92%+** |
| **Latencia promedio respuesta** | 2-4s | 1-2s | **<1s** |
| **Costo por interacción** | ~$0.005 | $0.002 | **$0.0007** |
| **CSAT (satisfacción cliente)** | No medido | 75% | **88%+** |
| **Tasa de escalación a humano** | ~80% | 55% | **<20%** |
| **Uptime del servicio IA** | ~95% | 99% | **99.9%** |

### 11.2 KPIs de Negocio

| Métrica | Objetivo 3 meses | Objetivo 6 meses | Objetivo 12 meses |
|---------|------------------|-------------------|---------------------|
| **Clientes con IA activa** | 20 | 50 | 150 |
| **MRR de IA** | $200/mes | $800/mes | $3,500/mes |
| **Margen bruto IA** | 90%+ | 85%+ | 80%+ |
| **Churn de planes IA** | <5% | <3% | <2% |
| **NPS de funcionalidad IA** | 30+ | 50+ | 70+ |
| **Chatbots creados (Builder)** | 30 | 100 | 500 |
| **Extensiones instaladas (prom/empresa)** | 2 | 4 | 6 |
| **Afiliados activos** | 0 | 10 | 50 |
| **Revenue por afiliados** | $0 | $200/mes | $1,200/mes |

### 11.3 KPIs Técnicos

| Métrica | Target |
|---------|--------|
| **Cache hit rate** | >25% |
| **Token efficiency** (tokens útiles / tokens totales) | >70% |
| **Latencia P95** | <3s |
| **Error rate LLM** | <0.5% |
| **Fallback activation rate** | <2% |
| **Guardrail trigger rate** | <1% |

---

## 12. Riesgos y Mitigaciones

### 12.1 Riesgos Técnicos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| **Alucinaciones del LLM** | Alta | Alto | Guardrails + confidence thresholds + citaciones obligatorias |
| **Latencia alta en RAG** | Media | Alto | Cache semántico + pgvector indexado + modelo routing |
| **Costos API impredecibles** | Media | Medio | Rate limiting por empresa + caps + model routing |
| **Outage de proveedor LLM** | Baja | Alto | Fallback chains multi-proveedor (OpenAI → Claude → Gemini) |
| **Datos sensibles en prompts** | Media | Alto | NeMo Guardrails + PII detection + sanitización |
| **pgvector performance en escala** | Baja | Medio | Migrar a Qdrant si >1M vectors |

### 12.2 Riesgos de Negocio

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| **Baja adopción por clientes** | Media | Alto | Free tier + onboarding guiado + KB pre-poblada |
| **Competidores bajan precios** | Alta | Medio | Nuestro costo base es 95% menor, margen de maniobra |
| **Cambios de pricing de APIs** | Media | Medio | Multi-proveedor + contratos de volumen |
| **Regulaciones de IA (EU AI Act)** | Media | Medio | Logging completo + human-in-the-loop + transparencia |

### 12.3 Riesgos Operacionales

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| **Deuda técnica acumulada** | Media | Medio | Code reviews + tests automatizados + refactoring planificado |
| **Complejidad de mantenimiento** | Alta | Medio | Documentación exhaustiva + monitoreo proactivo |
| **Capacitación del equipo** | Media | Medio | Workshops internos + documentación + pair programming |

---

## 13. Fuentes y Referencias

### Mercado y Competencia
- [Markets and Markets: AI for Customer Service $47.82B (2030)](https://www.marketsandmarkets.com/PressReleases/ai-for-customer-service.asp)
- [Markets and Markets: AI Agents Market $52.62B (2030)](https://www.marketsandmarkets.com/Market-Reports/ai-agents-market-15761548.html)
- [Precedence Research: Agentic AI $199B (2034)](https://www.precedenceresearch.com/agentic-ai-market)
- [Precedence Research: RAG Market $67.42B (2034)](https://www.precedenceresearch.com/retrieval-augmented-generation-market)
- [Gartner: 80% AI Resolution by 2029](https://www.gartner.com/en/newsroom/press-releases/2025-03-05-gartner-predicts-agentic-ai-will-autonomously-resolve-80-percent-of-common-customer-service-issues-without-human-intervention-by-20290)

### Pricing de Competidores
- [Intercom Fin AI: $0.99/resolution](https://www.oreateai.com/blog/intercoms-fin-ai-understanding-the-perresolution-pricing-for-2025/)
- [Zendesk AI: $1.50-$2.00/AR](https://www.getmonetizely.com/articles/how-much-does-zendesks-ai-agent-cost)
- [Freshdesk Freddy: $0.10/session](https://www.eesel.ai/blog/freshdesk-freddy-ai-pricing-per-agent-2025)
- [Tidio Lyro: $0.50/conversation](https://www.tidio.com/pricing/)
- [Botpress Pricing](https://botpress.com/pricing)
- [Kustomer: $0.60/conversation](https://www.kustomer.com/pricing/)

### APIs y Costos
- [OpenAI API Pricing (2026)](https://openai.com/api/pricing/)
- [Claude API Pricing - Anthropic](https://platform.claude.com/docs/en/about-claude/pricing)
- [Google Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Mistral AI Pricing](https://mistral.ai/pricing)
- [Groq Pricing](https://groq.com/pricing)
- [DeepSeek API Pricing](https://api-docs.deepseek.com/quick_start/pricing)

### Frameworks
- [LangChain $125M Series B ($1.25B)](https://blog.langchain.com/series-b/)
- [CrewAI $18M Series A](https://crewai.com/)
- [Mastra - TypeScript AI Framework](https://mastra.ai/)
- [Vercel AI SDK](https://sdk.vercel.ai/)
- [Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/)

### Monetización y Estrategia
- [Chargebee: 2026 Playbook for Pricing AI Agents](https://www.chargebee.com/blog/pricing-ai-agents-playbook/)
- [Bessemer: AI Pricing Playbook](https://www.bvp.com/atlas/the-ai-pricing-and-monetization-playbook)
- [McKinsey: AI SaaS Business Models](https://www.mckinsey.com/industries/technology-media-and-telecommunications/our-insights/upgrading-software-business-models-to-thrive-in-the-ai-era)

### Observabilidad y Seguridad
- [Langfuse - Open Source LLM Observability](https://langfuse.com/)
- [NeMo Guardrails - NVIDIA](https://github.com/NVIDIA/NeMo-Guardrails)
- [RAGAS - RAG Evaluation Framework](https://docs.ragas.io/)

### Análisis de Referencia
- MagicAI v10.20 (Codecanyon #45408109) — Análisis interno `/home/deploy/magicai-analysis/`
  - 196 modelos de IA integrados (catálogo de entidades)
  - Sistema de créditos granular con 12 tipos de tokens
  - Chatbot Builder con RAG (embeddings en BD)
  - OpenAI Realtime API para audio bidireccional
  - Sistema de equipos (Teams) con seats y créditos compartidos
  - Dashboard con 18 widgets configurables
  - Dominios personalizados para chatbots (white-label)
  - Sistema de extensiones instalables
  - Programa de afiliados integrado
  - Email templates dinámicos con variables
  - 23+ idiomas nativos
  - Pasarelas: Stripe + Yokassa + Coingate (crypto)

---

## Apéndice A: Glosario

| Término | Definición |
|---------|-----------|
| **Agentic AI** | IA que puede actuar autónomamente, tomar decisiones y ejecutar acciones |
| **RAG** | Retrieval-Augmented Generation — combina búsqueda de información con generación de texto |
| **Graph RAG** | RAG que usa knowledge graphs para relaciones semánticas entre entidades |
| **BM25** | Algoritmo clásico de ranking de documentos basado en frecuencia de términos |
| **pgvector** | Extensión de PostgreSQL para almacenar y buscar vectores de embeddings |
| **Embeddings** | Representación numérica de texto en un espacio vectorial de alta dimensión |
| **Model Routing** | Técnica de enviar queries a diferentes modelos según su complejidad |
| **Semantic Cache** | Cache que busca por similitud semántica, no por coincidencia exacta |
| **Cross-Encoder Reranking** | Re-ordenamiento de resultados usando un modelo que evalúa pares query-documento |
| **Human-in-the-Loop** | Patrón donde un humano supervisa o interviene en las decisiones de IA |
| **MCP** | Model Context Protocol — estándar para conectar agentes IA con herramientas externas |
| **Guardrails** | Barreras de seguridad que previenen respuestas inapropiadas o peligrosas |
| **Fine-tuning** | Entrenamiento adicional de un modelo en datos específicos del dominio |
| **Token** | Unidad de texto procesada por un LLM (~0.75 palabras en español) |

---

## Apéndice B: Arquitectura Técnica Detallada

### Estructura de Archivos Propuesta (v1.1 — Enriquecida con MagicAI)

```
/home/deploy/chateam_jr/
├── services/
│   ├── AIAgents/                        # Sistema Multi-Agente
│   │   ├── AgentSupervisor.ts           # Orquestador principal
│   │   ├── RouterAgent.ts               # Clasificador de intención
│   │   ├── RAGAgent.ts                  # Búsqueda + respuesta
│   │   ├── SalesAgent.ts               # Pipeline de ventas
│   │   ├── SupportAgent.ts             # Soporte técnico
│   │   ├── EscalationAgent.ts          # Escalación a humano
│   │   ├── tools/                       # Herramientas de agentes
│   │   │   ├── SearchKnowledgeBase.ts
│   │   │   ├── CreateTicket.ts
│   │   │   ├── ScheduleMeeting.ts
│   │   │   ├── QualifyLead.ts
│   │   │   └── TransferToHuman.ts
│   │   └── types.ts                     # Interfaces y tipos
│   ├── RAGServices/                     # RAG Avanzado
│   │   ├── VectorSearchService.ts       # pgvector queries
│   │   ├── BM25SearchService.ts         # Full-text search
│   │   ├── HybridSearchService.ts       # Fusion de resultados
│   │   ├── RerankingService.ts          # Cross-encoder reranking
│   │   ├── ChunkingService.ts           # Estrategias de chunking
│   │   ├── EmbeddingService.ts          # Generación de embeddings
│   │   ├── SemanticCacheService.ts      # Cache semántico
│   │   └── KnowledgeBaseService.ts      # CRUD de KB
│   ├── AIObservability/                 # Observabilidad
│   │   ├── LangfuseService.ts           # Integración Langfuse
│   │   ├── CostTracker.ts              # Tracking de costos
│   │   ├── MetricsAggregator.ts        # Agregación de métricas
│   │   └── DashboardWidgets.ts         # 18 widgets (MagicAI)
│   ├── AIGuardrails/                    # Seguridad
│   │   ├── PIIDetector.ts               # Detección de datos sensibles
│   │   ├── JailbreakDetector.ts         # Prevención de jailbreak
│   │   └── ContentFilter.ts            # Filtro de contenido
│   ├── AIEntities/                      # Catálogo de Modelos (MagicAI)
│   │   ├── AIEntityService.ts           # CRUD de modelos/entidades IA
│   │   ├── AIEntityRegistry.ts          # Registro dinámico de modelos
│   │   └── AIModelRouter.ts            # Routing inteligente de modelos
│   ├── AICreditServices/               # Créditos Granulares (MagicAI)
│   │   ├── CreditBalanceService.ts      # Balance por tipo de crédito
│   │   ├── CreditDebitService.ts        # Débito/crédito transaccional
│   │   └── CreditAlertService.ts       # Alertas de créditos bajos
│   ├── AIChatbotBuilder/               # Chatbot Builder (MagicAI)
│   │   ├── ChatbotConfigService.ts      # CRUD de chatbots
│   │   ├── ChatbotTrainingService.ts    # Entrenamiento con RAG
│   │   ├── ChatbotWidgetService.ts      # Widget embebible
│   │   └── ChatbotDomainService.ts     # Dominios personalizados
│   ├── AIRealtimeAudio/                # Audio Bidireccional (MagicAI)
│   │   ├── RealtimeAudioService.ts      # OpenAI Realtime API
│   │   ├── ElevenLabsTTSService.ts      # Síntesis de voz ElevenLabs
│   │   └── WhatsAppAudioBridge.ts      # Puente audio ↔ WhatsApp
│   ├── AIContentGenerators/            # Generadores Multimodales (MagicAI)
│   │   ├── AIWriterService.ts           # Generación de texto/campañas
│   │   ├── AIVisionService.ts           # Análisis de imágenes
│   │   ├── AIPDFProcessorService.ts     # Procesamiento de PDFs
│   │   ├── AIYouTubeTranscript.ts       # Transcripciones de YouTube
│   │   └── AIRSSFeedService.ts         # Auto-alimentar KB desde RSS
│   ├── AICampaignWizard/               # Campaign Wizard (MagicAI)
│   │   ├── CampaignWizardService.ts     # Flujo multi-paso
│   │   ├── CampaignABTestService.ts     # Variantes A/B con IA
│   │   └── CampaignAnalyticsService.ts # Análisis de resultados
│   ├── AITeamServices/                  # Equipos (MagicAI)
│   │   ├── TeamService.ts              # CRUD de equipos
│   │   ├── TeamMemberService.ts         # Gestión de miembros
│   │   └── TeamCreditService.ts        # Créditos compartidos
│   ├── AIExtensions/                    # Sistema de Extensiones (MagicAI)
│   │   ├── ExtensionManager.ts          # Instalación/desinstalación
│   │   └── ExtensionRegistry.ts        # Registro de extensiones
│   ├── AIEmailTemplates/               # Email Templates (MagicAI)
│   │   ├── EmailTemplateService.ts      # CRUD de templates
│   │   └── EmailVariableResolver.ts    # Resolución de variables
│   └── AIAffiliateServices/            # Programa de Afiliados (MagicAI)
│       ├── AffiliateService.ts          # Gestión de afiliados
│       └── CommissionService.ts        # Cálculo de comisiones
├── models/
│   ├── AIEntity.ts                      # Catálogo de modelos IA (MagicAI)
│   ├── AIDocument.ts                    # Documentos de KB
│   ├── AIChunk.ts                       # Chunks con embeddings
│   ├── AISemanticCache.ts              # Cache semántico
│   ├── AICreditType.ts                 # Tipos de créditos (MagicAI)
│   ├── AICreditBalance.ts             # Balances por tipo (MagicAI)
│   ├── AIAgentConfig.ts                # Configuración de agentes
│   ├── AIAgentLog.ts                   # Logs de ejecución
│   ├── AITeam.ts                       # Equipos (MagicAI)
│   ├── AITeamMember.ts                # Miembros de equipo (MagicAI)
│   ├── AIChatbotConfig.ts             # Chatbot Builder (MagicAI)
│   ├── AIChatbotDataSource.ts         # Fuentes de datos chatbot (MagicAI)
│   ├── AIChatbotDomain.ts             # Dominios personalizados (MagicAI)
│   ├── AIExtension.ts                  # Extensiones (MagicAI)
│   ├── AICompanyExtension.ts          # Extensiones por empresa (MagicAI)
│   ├── AIEmailTemplate.ts             # Email templates (MagicAI)
│   ├── AIAffiliateProgram.ts          # Programa de afiliados (MagicAI)
│   ├── AIAffiliateReferral.ts         # Referidos (MagicAI)
│   └── AIUsageMetric.ts               # Métricas de dashboard (MagicAI)
├── database/
│   └── migrations/
│       ├── 20260301000001-add-pgvector-extension.ts
│       ├── 20260301000002-create-ai-entities.ts            # MagicAI
│       ├── 20260301000003-create-ai-documents.ts
│       ├── 20260301000004-create-ai-chunks.ts
│       ├── 20260301000005-create-ai-semantic-cache.ts
│       ├── 20260301000006-create-ai-credit-types.ts        # MagicAI
│       ├── 20260301000007-create-ai-agent-configs.ts
│       ├── 20260301000008-create-ai-agent-logs.ts
│       ├── 20260301000009-create-ai-teams.ts               # MagicAI
│       ├── 20260301000010-create-ai-chatbot-configs.ts     # MagicAI
│       ├── 20260301000011-create-ai-extensions.ts          # MagicAI
│       ├── 20260301000012-create-ai-email-templates.ts     # MagicAI
│       ├── 20260301000013-create-ai-chatbot-domains.ts     # MagicAI
│       ├── 20260301000014-create-ai-affiliate-programs.ts  # MagicAI
│       ├── 20260301000015-create-ai-usage-metrics.ts       # MagicAI
│       └── 20260301000016-alter-ai-token-plans.ts          # MagicAI
└── routes/
    ├── aiAgentRoutes.ts                 # API de agentes
    ├── aiKnowledgeBaseRoutes.ts         # API de Knowledge Base
    ├── aiEntityRoutes.ts                # API de modelos/entidades (MagicAI)
    ├── aiCreditRoutes.ts                # API de créditos (MagicAI)
    ├── aiChatbotRoutes.ts               # API de Chatbot Builder (MagicAI)
    ├── aiTeamRoutes.ts                  # API de equipos (MagicAI)
    ├── aiExtensionRoutes.ts             # API de extensiones (MagicAI)
    ├── aiDashboardRoutes.ts             # API de dashboard/widgets (MagicAI)
    ├── aiCampaignWizardRoutes.ts        # API de Campaign Wizard (MagicAI)
    └── aiAffiliateRoutes.ts             # API de afiliados (MagicAI)
```

---

*Documento generado el 28 de febrero de 2026 — ChatEAM JR v1.1.0*
*Versión 1.1: Enriquecido con mejoras importadas de MagicAI v10.20*
*Próxima revisión: Tras aprobación de Fase 1*