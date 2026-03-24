# Sistema Kanban + IA — Seguimiento Automatico

> **Proyecto:** ChatEAM JR v6.0.0
> **Fecha:** 2026-03-01 (actualizado)
> **Tipo:** Informe tecnico de arquitectura
> **Alcance:** Pipeline Kanban, Clasificacion IA multi-proveedor, Seguimiento automatizado, Modelo Prompt, AIClientService, Coexistencia Meta
> **Version doc:** 2.0

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Estructura del Kanban — Modelo Tag (8 etapas)](#2-estructura-del-kanban--modelo-tag-8-etapas)
3. [Motor Automatico — handleProcessLanes()](#3-motor-automatico--handleprocesslanes)
4. [Clasificacion IA — stageClassifier.worker.ts](#4-clasificacion-ia--stageclassifierworkerts)
5. [El Cerebro IA — handleOpenAi() + AIClientService](#5-el-cerebro-ia--handleopenai--aiclientservice)
6. [Modelo Prompt — Configuracion Central (ampliado)](#6-modelo-prompt--configuracion-central-ampliado)
7. [PromptCacheService — Cache Redis](#7-promptcacheservice--cache-redis)
8. [Flujo Completo End-to-End](#8-flujo-completo-end-to-end)
9. [Relacion IA vs Kanban — Comparativa](#9-relacion-ia-vs-kanban--comparativa)
10. [AIClientService — Servicio Centralizado Multi-Proveedor](#10-aiclientservice--servicio-centralizado-multi-proveedor)
11. [AICapabilitiesValidator — Validacion de Capacidades](#11-aicapabilitiesvalidator--validacion-de-capacidades)
12. [clasificarEtapaCliente.ts — Tags por Defecto y Estados](#12-clasificaretapaclientets--tags-por-defecto-y-estados)
13. [Archivos Clave del Sistema (actualizado)](#13-archivos-clave-del-sistema-actualizado)
14. [CronJobs del Sistema (11 total)](#14-cronjobs-del-sistema-11-total)
15. [Problemas Conocidos y Riesgos (actualizado)](#15-problemas-conocidos-y-riesgos-actualizado)
16. [Recomendaciones de Mejora (actualizado)](#16-recomendaciones-de-mejora-actualizado)

---

## 1. Resumen Ejecutivo

El sistema de seguimiento automatico de ChatEAM JR combina **dos mecanismos complementarios** para mover tickets a traves de un pipeline comercial:

| Mecanismo | Base de Decision | Trigger |
|-----------|-----------------|---------|
| **Kanban Temporal** (handleProcessLanes) | Tiempo de inactividad (HORAS) | Cron cada 1 minuto |
| **Clasificacion IA** (StageClassifierQueue) | Contenido de la conversacion | Despues de cada respuesta IA |

Ambos sistemas pueden mover tickets entre **8 etapas** del Kanban (6 originales + 2 nuevas: `dormant` y `retargeting`), creando un pipeline de ventas/atencion **inteligente y automatizado** de doble via.

### Cambios desde v1.1.0 → v6.0.0

| Aspecto | Antes (v1.1.0) | Ahora (v6.0.0) |
|---------|---------------|----------------|
| Etapas Kanban | 6 | **8** (+dormant, +retargeting) |
| Motor IA | OpenAI directo | **AIClientService** multi-proveedor (OpenAI, Anthropic, Google) |
| Validacion | Sin validacion | **AICapabilitiesValidator** (5 capacidades) |
| timeLane unidad | Minutos | **HORAS** (setHours) |
| Proveedores IA | 1 (OpenAI) | **3** (OpenAI, Anthropic, Google) |
| CronJobs | 9 | **11** (+MetaTokenRefresh, +CoexistenceLiveness) |
| Modelo Prompt | 10 campos | **20+ campos** (+aiProviderId, +baseUrl, +capabilities JSONB) |
| Cache Redis | 3 prefijos genéricos | **3 prefijos especificos** (ia:queue:promptai, ia:prompt:queues, ia:prompt:byapikey) |

---

## 2. Estructura del Kanban — Modelo Tag (8 etapas)

### Archivo: `models/Tag.ts`

El Kanban se construye sobre el modelo **Tag**. Cuando un Tag tiene `kanban = 1`, se convierte en una **columna/etapa** del pipeline visual.

### Campos Kanban del Modelo Tag

| Campo | Tipo | Funcion | Ejemplo |
|-------|------|---------|---------|
| `id` | integer | PK del tag | `5` |
| `name` | string | Nombre visible de la etapa | `"Interesado"` |
| `key` | string | Clave interna para clasificacion IA | `"interest"` |
| `color` | string | Color en UI | `"#FFD700"` |
| `kanban` | number | `1` = columna Kanban activa | `1` |
| `timeLane` | integer | **HORAS** de inactividad antes de auto-mover | `2` |
| `nextLaneId` | integer | FK → Tag destino al cumplir timeLane | `7` |
| `greetingMessageLane` | text | Mensaje enviado al contacto al entrar a la etapa | `"Hola, queríamos..."` |
| `rollbackLaneId` | integer | FK → Tag al que retroceder si hay actividad | `3` |
| `enableFollowup` | boolean | Activar seguimiento IA en esta etapa (default: false) | `true` |
| `followupType` | string | Tipo de seguimiento automatico (default: "multiple") | `"multiple"` |
| `companyId` | integer | Multi-tenancy | `1` |

> **⚠️ CORRECCIÓN v6.0.0:** El campo `timeLane` se interpreta en **HORAS** (no minutos). El código usa `setHours()` para calcular el limite temporal.

### Relacion Ticket ↔ Tag (Kanban)

```
Ticket ──M:N──→ TicketTag ──M:N──→ Tag (kanban=1)
```

- **Modelo:** `TicketTag` (tabla intermedia)
- **Archivo:** `backend/src/models/TicketTag.ts`
- Un ticket puede estar en **una etapa Kanban** a la vez
- Mover de etapa = destruir TicketTag actual + crear nuevo TicketTag

### Las 8 Etapas por Defecto (v6.0.0)

Creadas automaticamente por `clasificarEtapaCliente.ts → asegurarTagsPorDefecto()`:

| # | Nombre | Key | Color | Tipo |
|---|--------|-----|-------|------|
| 1 | Atraccion | `attraction` | `#1471E3` | Original |
| 2 | Interes | `interest` | `#FFD700` | Original |
| 3 | Consideracion / Conversion | `consideration` | `#F57C00` | Original |
| 4 | Venta / Lead Caliente | `hot-lead` | `#E53935` | Original |
| 5 | Postventa / Fidelizacion | `post-sale` | `#43A047` | Original |
| 6 | Congelado / Dormido | `dormant` | `#757575` | **NUEVO v6.0** |
| 7 | Referido / Promotor | `referrer` | `#8E24AA` | Original |
| 8 | Reactivacion | `retargeting` | `#26C6DA` | **NUEVO v6.0** |

### Ejemplo de Pipeline Kanban

```
[Atraccion] → [Interes] → [Consideracion] → [Hot Lead] → [Post-venta]
   Tag #1        Tag #2       Tag #3           Tag #4       Tag #5
  timeLane:1h   timeLane:2h  timeLane:4h      timeLane:8h  timeLane:0
  nextLane:#2   nextLane:#3  nextLane:#4      nextLane:#5  nextLane:null

                    ┌─── [Dormant] (followupCount >= 3) ──→ [Retargeting]
                    │       Tag #6                              Tag #8
                    │    (sin timeLane)                     (campana reactivacion)
                    │
            followupCount >= 3
```

---

## 3. Motor Automatico — handleProcessLanes()

### Archivo: `backendCronJobs.ts` (linea ~77-148)

### Configuracion Cron

```typescript
// Ejecuta cada 1 minuto
schedule.scheduleJob("*/1 * * * *", handleProcessLanes);
```

### Algoritmo Detallado (v6.0.0 — usa HORAS)

```
handleProcessLanes()
│
├── 1. Obtener todas las empresas activas
│
├── 2. Para CADA empresa:
│   │
│   ├── 3. Buscar Tags con kanban=1 AND timeLane > 0
│   │       (solo etapas con movimiento automatico)
│   │
│   ├── 4. Para CADA Tag/etapa:
│   │   │
│   │   ├── 5. Buscar TicketTags de esta etapa
│   │   │       → Include: Ticket (con updatedAt)
│   │   │
│   │   ├── 6. Para CADA ticket en la etapa:
│   │   │   │
│   │   │   ├── 7. Calcular limite temporal (HORAS):
│   │   │   │       const dataLimite = new Date();
│   │   │   │       dataLimite.setHours(dataLimite.getHours() - Number(tag.timeLane));
│   │   │   │       const dataUltimaInteracao = new Date(ticket.updatedAt);
│   │   │   │
│   │   │   ├── 8. ¿dataUltimaInteracao < dataLimite?
│   │   │   │   │
│   │   │   │   ├── NO → Continuar (ticket aun activo)
│   │   │   │   │
│   │   │   │   └── SI → Mover ticket:
│   │   │   │       │
│   │   │   │       ├── a. TicketTag.destroy({ ticketId, tagId: actual })
│   │   │   │       ├── b. TicketTag.create({ ticketId, tagId: nextLaneId })
│   │   │   │       ├── c. Si greetingMessageLane existe:
│   │   │   │       │       → formatBody(greetingMessage, ticket)
│   │   │   │       │       → SendMessage(whatsapp, { number, body })
│   │   │   │       ├── d. ticket.update({ updatedAt: new Date() })
│   │   │   │       └── e. Socket.IO emit → actualizar UI en tiempo real
```

> **⚠️ CORRECCIÓN v6.0.0:** El código usa `setHours()` — `timeLane` se interpreta en **HORAS**, no minutos como se documentaba en v1.1.0.

### Ejemplo Practico

```
Escenario:
  - Tag "Interes" (id: 2, timeLane: 2, nextLaneId: 3)
  - Ticket #455, ultima interaccion: hace 2h 15min

Ejecucion:
  1. handleProcessLanes() se ejecuta
  2. Encuentra Tag #2 con timeLane=2 (HORAS)
  3. dataLimite = now - 2 horas
  4. dataUltimaInteracao = hace 2h 15min
  5. 2h15m ago < dataLimite (2h ago) = TRUE
  6. Destruye TicketTag(455, 2)
  7. Crea TicketTag(455, 3) → "Consideracion"
  8. Envia greetingMessageLane formateado con formatBody()
  9. Emite Socket.IO → UI se actualiza
```

---

## 4. Clasificacion IA — stageClassifier.worker.ts

### Archivo: `workers/stageClassifier.worker.ts` (389 LOC)

Este worker contiene **DOS colas Bull** independientes que trabajan en conjunto:

### Cola 1: StageClassifierQueue — Clasificacion de Etapa

```
Nombre: StageClassifierQueue
Trigger: Encolado desde handleOpenAi() despues de cada respuesta IA
Concurrencia: Configurable
Motor IA: AIClientService.chatCompletion() (v6.0.0 — multi-proveedor)
```

#### Proceso de Clasificacion (v6.0.0)

```
StageClassifierQueue.process(async (job) => {
  │
  ├── 1. Recibe: { ticketId, contactId, companyId, conversationHistory }
  │
  ├── 1b. Validar capacidad IA: ✨ NUEVO
  │       → isCapabilityAllowed(promptId, AICapability.TEXT_GENERATION)
  │       → Si no tiene capacidad → skip silencioso
  │       → Si es legacy (sin promptId) → continua sin validacion
  │
  ├── 2. Asegurar tags por defecto: ✨ NUEVO
  │       → asegurarTagsPorDefecto(companyId)
  │       → Crea los 8 tags si no existen
  │
  ├── 3. Construye prompt de clasificacion para IA:
  │       "Analiza la siguiente conversacion y clasifica
  │        la etapa del cliente en el embudo de ventas..."
  │
  ├── 4. Llama AIClientService.chatCompletion(): ✨ CAMBIO
  │       → chatCompletion({
  │           messages: [{ role: "user", content: promptText }],
  │           maxTokens: 20,
  │           temperature: 0.7,
  │           companyId,
  │           module: 'classification'
  │         })
  │       → Soporta OpenAI, Anthropic, Google automaticamente
  │
  ├── 5. IA responde con clasificacion (8 etapas posibles):
  │       → attraction    (atraccion inicial)
  │       → interest      (interes demostrado)
  │       → consideration (evaluando opciones)
  │       → hot-lead      (listo para comprar)
  │       → post-sale     (post-venta)
  │       → dormant       (congelado/dormido)      ✨ NUEVO
  │       → referrer      (referidor/promotor)
  │       → retargeting   (reactivacion)           ✨ NUEVO
  │
  ├── 6. Busca Tag Kanban correspondiente a la etapa
  │       Tag.findOne({ where: { key: clasificacion, kanban: 1, companyId } })
  │
  ├── 7. Si encuentra Tag diferente al actual:
  │       → Destruye TicketTag actual
  │       → Crea TicketTag con nuevo Tag
  │       → Emite Socket.IO
  │
  └── 8. Si la etapa tiene enableFollowup=true:
          → FollowupQueue.add({ ticketId, contactId, ... })
})
```

#### Etapas de Clasificacion IA (8 etapas — v6.0.0)

| Etapa | Key | Descripcion | Accion tipica |
|-------|-----|-------------|---------------|
| Atraccion | `attraction` | Primer contacto, explorando / rechazo | Informar, educar |
| Interes | `interest` | Demuestra interes activo | Enviar catalogo, precios |
| Consideracion | `consideration` | Evaluando opciones | Seguimiento cercano |
| Hot Lead | `hot-lead` | Listo para decidir | Oferta, cierre |
| Post-venta | `post-sale` | Ya compro | Soporte, satisfaccion |
| **Dormant** | `dormant` | Sin respuesta tras 3 followups | Esperar / campana futura |
| Referido | `referrer` | Recomienda a otros | Programa referidos |
| **Retargeting** | `retargeting` | Reactivacion de dormant | Campana reactivacion |

### Cola 2: FollowupQueue — Seguimiento Automatico

```
Nombre: FollowupQueue
Trigger: Activado por StageClassifierQueue cuando la etapa tiene enableFollowup=true
Concurrencia: Configurable
```

#### Proceso de Seguimiento (v6.0.0)

```
FollowupQueue.process(async (job) => {
  │
  ├── 1. Recibe: { ticketId, contactId, companyId, followupCount }
  │
  ├── 2. Verificar horario laboral (schedule-aware): ✨ MEJORADO
  │       → Lee whatsapp.schedules (2 franjas por dia)
  │       → Si fuera de horario → Re-encolar con delay hasta horario
  │
  ├── 3. Consultar followupCount actual del ticket
  │
  ├── 4. Evaluar conteo de seguimientos:
  │       │
  │       ├── followupCount = 0 → Primer seguimiento
  │       ├── followupCount = 1 → Segundo seguimiento
  │       ├── followupCount = 2 → Transicion a "dormant" ✨ CAMBIO
  │       └── followupCount >= 3 → FIN (no mas acciones)
  │
  ├── 5. Si followupCount < 2:
  │       │
  │       ├── a. Generar mensaje personalizado con AIClientService ✨ CAMBIO
  │       │       → chatCompletion() con contexto conversacion
  │       │       → Multi-proveedor (OpenAI/Anthropic/Google)
  │       │
  │       ├── b. Enviar mensaje via WhatsApp (SendMessage)
  │       │
  │       ├── c. Incrementar followupCount++
  │       │
  │       ├── d. Guardar mensaje en BD (Messages)
  │       │
  │       └── e. Re-encolar en StageClassifierQueue
  │               → La IA re-clasifica despues del followup
  │               → Puede mover a otra etapa
  │               → Puede generar otro ciclo de followup
  │
  ├── 6. Si followupCount = 2:
  │       → Transicionar a etapa "dormant" (Tag key=dormant)  ✨ NUEVO
  │       → No enviar mas mensajes
  │       → Ticket queda en etapa dormant
  │
  └── 7. Si followupCount >= 3:
          → No hacer nada (ya esta dormant)
})
```

#### Ciclo de Followup

```
Mensaje IA → StageClassifier → Etapa con followup
                                      │
                                      ▼
                               FollowupQueue
                               followupCount: 0
                                      │
                        ┌─────────────┤
                        ▼             │
                  Followup #1         │
                  (msg IA generado)   │
                        │             │
                        ▼             │
                  Re-clasificar ──────┘
                        │
                        ▼
                  Followup #2
                  (msg IA generado)
                        │
                        ▼
                  Re-clasificar
                        │
                        ▼
                  Followup #3
                  (msg IA generado)
                        │
                        ▼
                  Re-clasificar
                        │
                        ▼
                  followupCount >= 3
                        │
                        ▼
                  DORMANT (fin)
```

---

## 5. El Cerebro IA — handleOpenAi() + AIClientService

### Archivo: `services/IntegrationsServices/OpenAiService.ts`
### Tamano: **1015 lineas** (actualizado)
### Motor: **AIClientService** (multi-proveedor) ✨ v6.0.0

Esta es la funcion **central** de toda la inteligencia artificial del sistema. Se invoca cada vez que un mensaje entrante debe ser procesado por IA. En v6.0.0 utiliza `AIClientService` como capa de abstraccion que soporta OpenAI, Anthropic y Google.

### Pipeline de 7 Pasos (actualizado v6.0.0)

```
┌─────────────────────────────────────────────────────────┐
│  PASO 1: CARGAR PROMPT + VALIDAR CAPACIDADES ✨ AMPLIADO │
│                                                          │
│  → Buscar Prompt asociado al Whatsapp (whatsapp.promptId)│
│  → Verificar que el Prompt existe y esta activo           │
│  → Cargar capabilities JSONB y configuracion              │
│  → AICapabilitiesValidator.isCapabilityAllowed()          │
│  → Verificar aiProviderId (nuevo FK → AIProviderConfig)   │
│  → Usar PromptCacheService (Redis, TTL 5min)             │
│                                                          │
│  Resultado: system prompt + config (model, temperature,  │
│             maxTokens, maxMessages, voice, capabilities)  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  PASO 2: CARGAR CONTEXTO RAG (Retrieval Augmented Gen)   │
│                                                          │
│  → Buscar embeddings relevantes al mensaje del usuario    │
│  → Consultar base de conocimiento vectorial               │
│  → Seleccionar fragmentos con mayor similitud             │
│  → Agregar al contexto del system prompt                  │
│                                                          │
│  Resultado: contexto enriquecido con conocimiento         │
│             especifico del negocio                        │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  PASO 3: MEMORIA DE CONVERSACION (Redis)                 │
│                                                          │
│  → Cargar ultimos N mensajes del ticket desde Redis       │
│  → N = prompt.maxMessages (configurable, default: 10)     │
│  → Formato: array de {role: user/assistant, content}      │
│  → Mantener coherencia contextual entre mensajes          │
│                                                          │
│  Resultado: historial de conversacion para contexto       │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  PASO 4: LLAMAR A AICLIENTSERVICE (MULTI-PROVEEDOR) ✨    │
│                                                          │
│  → chatCompletion({                                       │
│      messages: [system, ...memoria, userMessage],        │
│      maxTokens: prompt.maxTokens,                        │
│      temperature: prompt.temperature,                     │
│      companyId,                                           │
│      module: 'chat'                                       │
│    })                                                     │
│  → AIClientService selecciona proveedor automaticamente   │
│    (OpenAI | Anthropic | Google) segun AIProviderConfig    │
│  → Fallback automatico si un proveedor falla              │
│  → Tracking de tokens via trackChatCompletion()           │
│                                                          │
│  Resultado: texto de respuesta del asistente              │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  PASO 5: AUTO-CLASIFICAR QUEUE (Departamento)            │
│                                                          │
│  → La IA sugiere a que Queue/departamento pertenece       │
│  → Usa la relacion PromptQueue (M:N) para saber que      │
│    queues estan disponibles para este prompt               │
│  → Si confianza > 0.7 → asignar ticket a esa Queue       │
│  → Si confianza < 0.7 → no mover (evitar falsos +)       │
│                                                          │
│  Resultado: ticket asignado a departamento correcto       │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  PASO 6: ENVIAR RESPUESTA                                │
│                                                          │
│  → Enviar mensaje al contacto via WhatsApp (SendMessage)  │
│  → Guardar mensaje en BD (tabla Messages)                 │
│  → Guardar en memoria Redis (para proximo mensaje)        │
│  → Emitir evento Socket.IO → UI se actualiza             │
│                                                          │
│  Resultado: cliente recibe respuesta, UI actualizada      │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  PASO 7: ENCOLAR CLASIFICACION KANBAN (ASINCRONO)        │
│                                                          │
│  → StageClassifierQueue.add({                             │
│      ticketId,                                            │
│      contactId,                                           │
│      companyId,                                           │
│      conversationHistory                                  │
│    })                                                     │
│  → Se procesa en background (no bloquea respuesta)        │
│  → Puede mover ticket entre 8 etapas del Kanban          │
│  → Puede activar ciclo de followups                       │
│  → Puede transicionar a dormant/retargeting              │
│                                                          │
│  Resultado: clasificacion Kanban encolada                 │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Modelo Prompt — Configuracion Central (ampliado)

### Archivo: `models/Prompt.ts` (139 LOC)

### Campos del Modelo (v6.0.0 — ampliado)

| Campo | Tipo | Funcion | Ejemplo | Estado |
|-------|------|---------|---------|--------|
| `id` | integer | PK, AutoIncrement | `1` | Original |
| `name` | string | Nombre descriptivo (required) | `"Asistente Ventas"` | Original |
| `prompt` | string | System prompt completo (required) | `"Eres un asistente..."` | Original |
| `fileNameIA` | string/null | Archivo adjunto (getter/setter con proxy URL) | `"doc.pdf"` | Original |
| `apiKey` | string/null | API Key (legacy — ahora usar aiProviderId) | `"sk-..."` | **Deprecado** |
| `aiProviderId` | number/null | FK → AIProviderConfig (multi-proveedor) | `3` | **✨ NUEVO** |
| `baseUrl` | string(500)/null | URL base del proveedor (copiada de AIProviderConfig) | `"https://api.openai.com"` | **✨ NUEVO** |
| `capabilities` | JSONB/null | Capacidades habilitadas para este prompt | `{textGeneration...}` | **✨ NUEVO** |
| `maxTokens` | integer | Limite tokens por respuesta (default: 100) | `500` | Original |
| `temperature` | decimal(3,2) | Creatividad 0.00 - 1.00 (default: 1) | `0.70` | Original |
| `maxMessages` | integer | Mensajes en memoria Redis (default: 10) | `20` | Original |
| `voice` | string | Voz/tono del asistente (default: "text") | `"text"` | Original |
| `voiceKey` | string/null | Clave de voz para TTS | `"alloy"` | Original |
| `voiceRegion` | string/null | Region de voz para TTS | `"us"` | Original |
| `promptTokens` | integer | Contador acumulado prompt tokens (default: 0) | `15000` | Original |
| `completionTokens` | integer | Contador acumulado completion tokens (default: 0) | `8000` | Original |
| `totalTokens` | integer | Total tokens consumidos (default: 0) | `23000` | Original |
| `queueId` | number/null | FK → Queue (cola por defecto) | `2` | Original |
| `companyId` | integer | Multi-tenancy (FK → Company) | `1` | Original |

### Estructura del campo `capabilities` (JSONB) ✨ NUEVO

```typescript
capabilities: {
  textGenerationEnabled: boolean,    // Generacion de texto (chat)
  translationEnabled: boolean,       // Traduccion automatica
  imageGenerationEnabled: boolean,   // Generacion de imagenes (DALL-E)
  imageAnalysisEnabled: boolean,     // Vision/analisis de imagenes
  speechToTextEnabled: boolean       // Transcripcion de audio (Whisper)
}
```

### Relaciones del Modelo Prompt (v6.0.0)

```
Prompt
├── hasMany → Whatsapp (via whatsapp.promptId)
│             → Define que IA usa cada conexion WhatsApp
│
├── belongsToMany → Queue (via PromptQueue)
│                   → Define a que departamentos puede derivar la IA
│                   → Tabla pivote: PromptQueue { promptId, queueId }
│
├── belongsTo → Company (via companyId)
│               → Multi-tenancy
│
└── belongsTo → AIProviderConfig (via aiProviderId) ✨ NUEVO
                → Define que proveedor IA usar (OpenAI/Anthropic/Google)
```

### Relacion Prompt → Whatsapp

```typescript
Whatsapp.belongsTo(Prompt, { foreignKey: 'promptId' });
Prompt.hasMany(Whatsapp, { foreignKey: 'promptId' });
```

### Relacion Prompt ↔ Queue (M:N)

```typescript
Prompt.belongsToMany(Queue, { through: 'PromptQueue' });
Queue.belongsToMany(Prompt, { through: 'PromptQueue' });
```

### Relacion Prompt → AIProviderConfig (v6.0.0) ✨ NUEVO

```typescript
Prompt.belongsTo(AIProviderConfig, { foreignKey: 'aiProviderId' });
// AIProviderConfig define: provider, apiKey, baseUrl, modelos disponibles
// Reemplaza el uso directo de apiKey en el Prompt
```

**Ejemplo:** Prompt "Asistente General" puede derivar a:
- Queue "Ventas" (id: 1)
- Queue "Soporte" (id: 2)
- Queue "Facturacion" (id: 3)

Cuando la IA detecta que el cliente pregunta por facturacion (confianza > 0.7), asigna automaticamente el ticket a la Queue "Facturacion".

---

## 7. PromptCacheService — Cache Redis

### Archivo: `services/IntegrationsServices/PromptCacheService.ts` (302 LOC)

### Configuracion (v6.0.0 — prefijos actualizados)

| Parametro | Valor | Formato Clave | Descripcion |
|-----------|-------|---------------|-------------|
| TTL | 300 segundos (5 min) | — | Tiempo de vida del cache |
| Prefijo 1 | `ia:queue:promptai` | `ia:queue:promptai:{companyId}:{queueId}` | Cache del prompt por cola |
| Prefijo 2 | `ia:prompt:queues` | `ia:prompt:queues:{companyId}:{promptId}` | Cache de queues asociadas |
| Prefijo 3 | `ia:prompt:byapikey` | `ia:prompt:byapikey:{companyId}:{apiKeyFirst20}` | Cache de promptId por API key |

> **⚠️ CORRECCIÓN v6.0.0:** Los prefijos cambiaron de `prompt:` a `ia:queue:promptai`, `ia:prompt:queues`, `ia:prompt:byapikey` con namespacing `ia:` para evitar colisiones.

### Funciones Exportadas (v6.0.0)

```typescript
// Lecturas con auto-cache
getCachedQueuePromptAI(queueId, companyId) → string | null
getCachedPromptQueues(promptId, companyId) → CachedQueue[]
getCachedPromptIdByApiKey(apiKey, companyId) → number | null

// Invalidaciones
invalidateQueueCache(queueId, companyId)       // Invalida 1 queue
invalidatePromptCache(promptId, companyId)      // Invalida 1 prompt
invalidateAllIACacheForCompany(companyId)       // Invalida TODO de la empresa

// Pre-carga
preloadPromptQueuesCache(promptId, companyId)   // Pre-carga queues en Redis
```

### Flujo de Cache

```
handleOpenAi() necesita Prompt
       │
       ▼
  getCachedQueuePromptAI(queueId, companyId)
       │
       ├── HIT  → Retorna prompt desde Redis (rapido)
       │
       └── MISS → Consulta BD (Sequelize)
                → Guarda en Redis: ia:queue:promptai:{companyId}:{queueId}
                → TTL = 300 segundos
                → Retorna prompt
```

### Beneficio

Sin cache, cada mensaje entrante generaria:
- 1 query para Prompt
- 1 query para PromptQueue (queues asociadas)
- 1 query para buscar por API key

Con cache (TTL 5min), estos queries se reducen a **0** para mensajes consecutivos del mismo prompt. La invalidacion selectiva permite actualizar prompts sin reiniciar.

---

## 8. Flujo Completo End-to-End

### Diagrama de Flujo Maestro

```
CLIENTE ENVIA MENSAJE POR WHATSAPP
       │
       ▼
  ┌─────────────────────────────────────┐
  │  wbotMessageListener.ts             │
  │  (Baileys recibe mensaje)           │
  │  → Busca/Crea Contacto             │
  │  → Busca/Crea Ticket               │
  │  → Guarda Message en BD            │
  └──────────────────┬──────────────────┘
                     │
                     ▼
  ┌─────────────────────────────────────┐
  │  ¿Ticket tiene Prompt IA activo?    │
  │  (whatsapp.promptId != null)        │
  ├──── NO → Ticket va a cola humana    │
  │          (agente humano atiende)    │
  └──── SI ─┬───────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────┐
  │  handleOpenAi() — OpenAiService.ts  │
  │  Motor: AIClientService (v6.0.0)   │
  │                                     │
  │  1. Carga Prompt + valida caps     │
  │  2. Carga RAG embeddings            │
  │  3. Carga memoria conversacion      │
  │  4. chatCompletion() multi-provider │
  │  5. Auto-clasifica Queue (>0.7)     │
  │  6. Envia respuesta WhatsApp        │
  │  7. Encola StageClassifierQueue     │
  └──────────────────┬──────────────────┘
                     │
                     ▼ (ASINCRONO)
  ┌─────────────────────────────────────┐
  │  StageClassifierQueue               │
  │  (stageClassifier.worker.ts)        │
  │                                     │
  │  → Envia historial a AIClientService │
  │  → Clasifica etapa (8 posibles):   │
  │    attraction | interest |          │
  │    consideration | hot-lead |       │
  │    post-sale | dormant |            │
  │    referrer | retargeting           │
  │  → Mueve ticket en Kanban           │
  │    (actualiza TicketTag)            │
  └──────────────────┬──────────────────┘
                     │
                     ▼
  ┌─────────────────────────────────────┐
  │  ¿Etapa tiene enableFollowup=true? │
  ├──── NO → FIN del ciclo             │
  └──── SI ─┬───────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────┐
  │  FollowupQueue                      │
  │  (stageClassifier.worker.ts)        │
  │                                     │
  │  → Verifica horario laboral         │
  │  → Genera mensaje IA personalizado  │
  │  → Envia por WhatsApp               │
  │  → followupCount++                  │
  │                                     │
  │  Si count < 3:                      │
  │    → Re-encola StageClassifier      │
  │    → Nuevo ciclo clasificacion      │
  │                                     │
  │  Si count >= 3:                     │
  │    → Marca como DORMANT             │
  │    → Fin de seguimientos            │
  └─────────────────────────────────────┘


  ═══════════════════════════════════════════
  PARALELO E INDEPENDIENTE:
  ═══════════════════════════════════════════

  ┌─────────────────────────────────────┐
  │  CRON: handleProcessLanes()         │
  │  Frecuencia: cada 1 minuto          │
  │                                     │
  │  Para cada ticket en etapa Kanban:  │
  │  → Si (ahora - updatedAt) > timeLane│
  │    → Mover a nextLaneId             │
  │    → Enviar greetingMessageLane     │
  │    → Emitir Socket.IO              │
  │                                     │
  │  NOTA: Basado en TIEMPO, no en IA   │
  │  Funciona aunque la IA este off     │
  └─────────────────────────────────────┘
```

### Interaccion Entre Ambos Sistemas

```
Caso 1: Solo Kanban temporal (sin IA)
  Ticket en "Interesado" → 60 min sin actividad → Auto-mover a "Seguimiento"

Caso 2: Solo IA (sin timeLane)
  Mensaje → IA clasifica "hot-lead" → Mover a "Hot Lead" inmediatamente

Caso 3: Ambos activos (COMPLEMENTARIO)
  Mensaje → IA clasifica "interest" → Mover a "Interesado"
  → 60 min sin respuesta → handleProcessLanes mueve a "Seguimiento"
  → FollowupQueue envia mensaje IA → Cliente responde
  → IA re-clasifica "hot-lead" → Mover a "Hot Lead"
```

---

## 9. Relacion IA vs Kanban — Comparativa

| Aspecto | Kanban Temporal | Clasificacion IA |
|---------|----------------|-----------------|
| **Archivo** | backendCronJobs.ts | stageClassifier.worker.ts |
| **Trigger** | Cron cada 1 minuto | Cada respuesta IA |
| **Base de decision** | Tiempo de inactividad (HORAS) | Contenido de conversacion |
| **Velocidad** | Minimo 1 min delay | Asincrono tras cada msg |
| **Inteligencia** | Regla fija (timeLane en horas) | AIClientService multi-proveedor |
| **Configuracion** | Tag.timeLane + nextLaneId | StageClassifier prompt + capabilities |
| **Followup** | greetingMessageLane (fijo, formatBody) | IA genera mensaje unico |
| **Etapas** | Segun nextLaneId (manual) | 8 etapas automaticas |
| **Dependencia** | Solo BD + Redis | AIClientService (OpenAI/Anthropic/Google) |
| **Costo** | $0 (solo infra) | $/token proveedor IA |
| **Disponibilidad** | 100% (solo cron) | Fallback entre proveedores |

### Cuando se Activa Cada Uno

```
Escenario A: Cliente activo, respondiendo rapido
  → Solo IA clasifica (handleProcessLanes no interviene porque updatedAt se renueva)

Escenario B: Cliente deja de responder
  → IA hizo su ultima clasificacion
  → Pasan los minutos...
  → handleProcessLanes detecta inactividad → mueve ticket

Escenario C: IA deshabilitada
  → Solo handleProcessLanes funciona
  → Movimiento puramente temporal

Escenario D: Proveedor IA caido
  → AIClientService intenta fallback a otro proveedor
  → Si todos fallan → handleProcessLanes sigue funcionando como fallback

Escenario E: Ticket marcado dormant (v6.0.0)
  → followupCount >= 2 → transiciona a etapa "dormant"
  → handleProcessLanes NO mueve tickets dormant (sin nextLaneId)
  → clasificarEtapaCliente puede reactivar a "retargeting"
```

---

## 10. AIClientService — Servicio Centralizado Multi-Proveedor

### Archivo: `services/AIClientService.ts`

> **✨ NUEVO en v6.0.0** — Reemplaza llamadas directas a OpenAI por una capa de abstraccion multi-proveedor.

### Proveedores Soportados

| Proveedor | Modelos | Capacidades |
|-----------|---------|-------------|
| **OpenAI** | GPT-4, GPT-3.5-turbo, DALL-E, Whisper | text, images, stt, tts, embeddings, imageAnalysis |
| **Anthropic** | Claude 3 (Opus, Sonnet, Haiku) | text |
| **Google** | Gemini Pro | text |

### Funciones Exportadas

```typescript
// Generacion de texto (principal)
chatCompletion(options: ChatCompletionOptions) → Promise<string>

// Generacion de imagenes
generateImage(options: ImageGenerationOptions) → Promise<string>

// Transcripcion de audio (Speech-to-Text)
transcribeAudio(options: TranscriptionOptions) → Promise<string>

// Generacion de embeddings
createEmbedding(options: EmbeddingOptions) → Promise<number[]>

// Text-to-Speech
synthesizeSpeech(options: TTSOptions) → Promise<Buffer>

// Analisis de imagenes (Vision)
analyzeImage(imageUrl, prompt, options) → Promise<string>

// Utilidades
getClientForCapability(capability) → OpenAI client
getOpenAIClient() → OpenAI client (legacy)
isCapabilityAvailable(capability) → boolean
```

### Arquitectura

```
handleOpenAi() / StageClassifier / FollowupQueue
        │
        ▼
  AIClientService.chatCompletion({
    messages, maxTokens, temperature,
    companyId, module: 'chat' | 'classification'
  })
        │
        ├── Buscar AIProviderConfig activo por companyId
        ├── Cache de clientes (TTL: 30 min)
        ├── Seleccionar proveedor (OpenAI/Anthropic/Google)
        ├── Ejecutar request con fallback automatico
        ├── trackChatCompletion() → consumo de creditos
        └── Retornar respuesta
```

---

## 11. AICapabilitiesValidator — Validacion de Capacidades

### Archivo: `helpers/AICapabilitiesValidator.ts`

> **✨ NUEVO en v6.0.0** — Valida que un Prompt tenga habilitada la capacidad requerida antes de ejecutar operaciones IA.

### Enum AICapability

```typescript
export enum AICapability {
  TEXT_GENERATION = 'textGenerationEnabled',
  TRANSLATION    = 'translationEnabled',
  IMAGE_GENERATION = 'imageGenerationEnabled',
  IMAGE_ANALYSIS  = 'imageAnalysisEnabled',
  SPEECH_TO_TEXT  = 'speechToTextEnabled'
}
```

### Funciones

```typescript
// Con query a BD (busca Prompt por ID)
validateAICapability(promptId, capability) → ValidationResult
isCapabilityAllowed(promptId, capability) → boolean

// Sin query (ya tienes el Prompt cargado)
validateAICapabilityFromPrompt(prompt, capability) → ValidationResult
isCapabilityAllowedFromPrompt(prompt, capability) → boolean

// Multiple validacion
validateMultipleCapabilities(promptId, capabilities[]) → Record<AICapability, ValidationResult>
```

### Flujo de Validacion

```
stageClassifier.worker.ts
  │
  ├── isCapabilityAllowed(promptId, AICapability.TEXT_GENERATION)
  │     │
  │     ├── Buscar Prompt por ID (1 query, sin JOINs)
  │     ├── Verificar prompt.aiProviderId existe
  │     ├── Verificar prompt.capabilities JSON
  │     ├── Leer capabilities[capability] === true
  │     └── Retornar { allowed: true/false, reason?, isLegacy? }
  │
  ├── SI allowed → continuar con clasificacion
  └── SI !allowed → skip silencioso (log warning)
```

> **Optimizacion:** Lee directamente desde `prompt.capabilities` (JSONB) — sin JOINs ni queries adicionales.

---

## 12. clasificarEtapaCliente.ts — Tags por Defecto y Estados

### Archivo: `services/IntegrationsServices/clasificarEtapaCliente.ts`

> **✨ NUEVO en v6.0.0** — Gestiona los 8 tags por defecto del Kanban y las transiciones dormant/retargeting.

### Funcion Principal: `asegurarTagsPorDefecto(companyId)`

Crea automaticamente los 8 tags Kanban si no existen para la empresa:

```typescript
const tagsPorDefecto = [
  { name: "Atraccion",                  key: "attraction",    color: "#1471E3" },
  { name: "Interes",                    key: "interest",      color: "#FFD700" },
  { name: "Consideracion / Conversion", key: "consideration", color: "#F57C00" },
  { name: "Venta / Lead Caliente",      key: "hot-lead",      color: "#E53935" },
  { name: "Postventa / Fidelizacion",   key: "post-sale",     color: "#43A047" },
  { name: "Congelado / Dormido",        key: "dormant",       color: "#757575" },  // NUEVO
  { name: "Referido / Promotor",        key: "referrer",      color: "#8E24AA" },
  { name: "Reactivacion",              key: "retargeting",   color: "#26C6DA" },  // NUEVO
];
```

### Funciones Exportadas

```typescript
// Crear tags si no existen
asegurarTagsPorDefecto(companyId: number)

// Encolar clasificacion IA
agregarAColaDeClasificacion(ticketId, contactId, companyId, history)

// Marcar inactivos como dormant (CronJob, 48h sin actividad)
marcarTicketsDormant()

// Transicionar dormant → retargeting (cuando hay campana)
actualizarRetargetingSiEsDormant(ticketId)

// Helper
obtenerApiKeyPorTicketId(ticketId) → string | null
```

### Ciclo de Vida: dormant → retargeting

```
Ticket activo en cualquier etapa
        │
        ├── followupCount >= 2 → StageClassifier marca "dormant"
        │
        ▼
  [DORMANT] — Congelado, sin seguimientos
        │
        ├── Opcion A: marcarTicketsDormant() (CronJob, 48h inactividad)
        ├── Opcion B: followupCount alcanza 2 en StageClassifier
        │
        ▼
  actualizarRetargetingSiEsDormant()
        │
        ▼
  [RETARGETING] — Campana de reactivacion
        │
        ├── Cliente responde → IA re-clasifica a etapa apropiada
        └── Sin respuesta → Permanece en retargeting
```

---

## 13. Archivos Clave del Sistema (actualizado)

### Backend Core

| Archivo | Tamano | Funcion | Estado v6.0 |
|---------|--------|---------|-------------|
| `services/IntegrationsServices/OpenAiService.ts` | **1015 LOC** | Cerebro IA: handleOpenAi() | Actualizado |
| `services/AIClientService.ts` | — | Motor IA multi-proveedor centralizado | **✨ NUEVO** |
| `workers/stageClassifier.worker.ts` | **389 LOC** | StageClassifierQueue + FollowupQueue | Actualizado |
| `backendCronJobs.ts` | — | handleProcessLanes() + 10 cron jobs mas | Actualizado |
| `services/IntegrationsServices/PromptCacheService.ts` | **302 LOC** | Cache Redis para Prompts (prefijos `ia:`) | Actualizado |
| `services/IntegrationsServices/clasificarEtapaCliente.ts` | — | Tags por defecto + dormant/retargeting | **✨ NUEVO** |
| `helpers/AICapabilitiesValidator.ts` | — | Validacion capacidades IA (sin JOINs) | **✨ NUEVO** |

### Modelos

| Modelo | Archivo | Relacion con Pipeline | Estado v6.0 |
|--------|---------|----------------------|-------------|
| `Tag` | models/Tag.ts | Columnas Kanban (kanban=1), campo `key` | Actualizado |
| `TicketTag` | models/TicketTag.ts | Posicion del ticket en Kanban | Original |
| `Ticket` | models/Ticket.ts | Entidad principal | Original |
| `Prompt` | models/Prompt.ts (139 LOC) | Config IA + capabilities JSONB | **Ampliado** |
| `PromptQueue` | models/PromptQueue.ts | Queues disponibles para IA | Original |
| `TicketTraking` | models/TicketTraking.ts | Auditoria de tiempos | Original |
| `Queue` | models/Queue.ts | Departamentos/colas | Original |
| `AIProviderConfig` | models/AIProviderConfig.ts | Configuracion proveedor IA | **✨ NUEVO** |

### Modelo TicketTraking (Auditoria)

```typescript
interface TicketTraking {
  startedAt: Date;      // Inicio de atencion
  queuedAt: Date;       // Asignado a cola
  chatbotAt: Date;      // Procesado por chatbot
  closedAt: Date;       // Cerrado
  finishedAt: Date;     // Finalizado
  ratingAt: Date;       // Calificado
  userId: number;       // Agente asignado
  companyId: number;    // Multi-tenancy
}
```

---

## 14. CronJobs del Sistema (11 total)

### Archivo: `backendCronJobs.ts`

| # | Nombre | Horario | Descripcion | Estado |
|---|--------|---------|-------------|--------|
| 1 | `handleCloseTicketsAutomatic()` | `*/1 * * * *` | Cierra tickets por inactividad | Original |
| 2 | `handleProcessLanes()` | `*/1 * * * *` | **Kanban** — mueve tickets entre etapas (HORAS) | Original |
| 3 | `handleRandomUser()` | `*/2 * * * *` | Distribuye tickets aleatoriamente | Original |
| 4 | `handleVerifyQueue()` | `*/1 * * * *` | Asigna cola por defecto | Original |
| 5 | `handleInvoiceCreate()` | `0 0 * * *` | Genera facturas, desactiva WhatsApp expirado | Original |
| 6 | `handleAppointmentReminders()` | `*/1 * * * *` | Envia recordatorios de citas | Original |
| 7 | `handleCampaignAlertEvaluator()` | `*/30 * * * *` | Metricas campanas Meta Ads | Original |
| 8 | `handleContactTemperatureRecalculator()` | `0 */2 * * *` | Recalcula temperatura de contactos | Original |
| 9 | `handleResetAICredits()` | `0 1 * * *` | Reset ciclo creditos IA (1AM) | Original |
| 10 | `handleMetaTokenRefresh()` | `0 3 * * *` | Renueva tokens Meta que expiran en <7d (3AM) | **✨ NUEVO** |
| 11 | `handleCoexistenceLiveness()` | `0 */6 * * *` | Verifica Business App abierta (cada 6h) | **✨ NUEVO** |

---

## 15. Problemas Conocidos y Riesgos (actualizado)

### Criticos

| # | Problema | Impacto | Archivo | Estado v6.0 |
|---|---------|---------|---------|-------------|
| 1 | `DISABLE_RATE_LIMIT=true` en produccion | Anti-ban WhatsApp DESACTIVADO | .env | ⚠️ PERSISTE |
| 2 | handleOpenAi() **1015 LOC** sin modularizar | Mantenibilidad baja | OpenAiService.ts | ⚠️ PERSISTE (crecio de 900→1015) |
| 3 | Sin circuit breaker para IA | Si todos los proveedores caen, requests se acumulan | AIClientService.ts | ⚠️ PARCIAL (hay fallback entre proveedores) |
| 4 | followupCount no tiene reset manual | Ticket dormant no se reactiva automaticamente | stageClassifier.worker.ts | ⚠️ PARCIAL (existe retargeting, pero manual) |
| 5 | StageClassifier sin fallback si IA falla | Clasificacion se pierde silenciosamente | stageClassifier.worker.ts | ✅ MITIGADO (fallback multi-proveedor) |

### Moderados

| # | Problema | Impacto | Archivo | Estado v6.0 |
|---|---------|---------|---------|-------------|
| 6 | PromptCacheService TTL 5min fijo | No configurable por empresa | PromptCacheService.ts | ⚠️ PERSISTE |
| 7 | handleProcessLanes sin paginacion | Carga TODOS los tickets activos en memoria | backendCronJobs.ts | ⚠️ PERSISTE |
| 8 | greetingMessageLane es texto con formatBody | Personalizable con variables basicas | Tag model | ✅ MEJORADO (formatBody) |
| 9 | Sin metricas de clasificacion IA | No se mide precision del clasificador | stageClassifier.worker.ts | ⚠️ PERSISTE |
| 10 | Memoria Redis sin limite de tamano | Conversaciones largas consumen mucha RAM | OpenAiService.ts | ⚠️ PERSISTE |

### Menores

| # | Problema | Impacto | Archivo | Estado v6.0 |
|---|---------|---------|---------|-------------|
| 11 | timeLane solo en horas | No soporta minutos ni dias | Tag model | ⚠️ PERSISTE (ahora HORAS, no minutos) |
| 12 | Sin historial de movimientos Kanban | No hay audit trail de cambios de etapa | — | ⚠️ PERSISTE |
| 13 | enableFollowup boolean simple | No permite configurar horarios por etapa | Tag model | ✅ MITIGADO (whatsapp.schedules) |

### Nuevos Riesgos (v6.0.0)

| # | Problema | Impacto | Archivo |
|---|---------|---------|---------|
| 14 | Campo `apiKey` en Prompt deprecado pero aun funcional | Confusion legacy vs aiProviderId | Prompt.ts |
| 15 | AIProviderConfig sin UI de gestion | Solo configurable via BD/seeds | — |
| 16 | 8 tags se crean automaticamente al clasificar | Puede crear duplicados si tags manuales usan mismo key | clasificarEtapaCliente.ts |

---

## 16. Recomendaciones de Mejora (actualizado)

### Prioridad Alta

1. **Modularizar handleOpenAi()** (1015 LOC): Separar en funciones independientes (loadPrompt, loadRAG, loadMemory, callAI, classifyQueue, sendResponse, enqueueClassification)

2. **Habilitar Rate Limiting**: Cambiar `DISABLE_RATE_LIMIT=false` en produccion para proteccion anti-ban WhatsApp

3. **Reset automatico de followupCount**: Cuando el cliente responde, resetear followupCount a 0 y transicionar de dormant/retargeting a etapa apropiada

4. **Metricas de clasificacion**: Registrar precision del clasificador IA para ajustar prompts por proveedor

5. **Paginacion en handleProcessLanes**: Procesar tickets en batches (ej: 100 a la vez) para evitar carga masiva en memoria

### Prioridad Media

6. **UI para AIProviderConfig**: Panel admin para gestionar proveedores IA (OpenAI, Anthropic, Google) sin tocar BD

7. **Historial de movimientos Kanban**: Tabla `KanbanMovementLog` con (ticketId, fromTagId, toTagId, movedBy: 'cron'|'ia'|'manual', timestamp)

8. **TTL configurable por empresa**: Permitir que cada empresa ajuste el TTL del cache de prompts

9. **Dashboard de pipeline**: Visualizar metricas de conversion entre etapas (funnel con 8 etapas)

10. **Deprecar campo apiKey de Prompt**: Migrar todas las empresas a aiProviderId y eliminar soporte legacy

### Prioridad Baja

11. **timeLane con unidades**: Soportar minutos, horas, dias (selector de unidad en UI)

12. **A/B testing de prompts**: Probar diferentes prompts de clasificacion por proveedor y medir efectividad

13. **Circuit Breaker completo**: Implementar patron circuit breaker con estados open/half-open/closed para AIClientService

---

> **Documento generado:** 2026-02-27 | **Actualizado:** 2026-03-01
> **Fuente:** Analisis directo del codigo fuente de ChatEAM JR v6.0.0
> **Archivos analizados:** 20+ archivos core del pipeline Kanban + IA + AIClientService
> **Cambios principales v6.0.0:** AIClientService multi-proveedor, 8 etapas Kanban, AICapabilitiesValidator, timeLane en HORAS, 11 CronJobs
