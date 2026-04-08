# Solución: Proveedores IA para Embeddings y Text Generation

## Problema Original (02-Abr-2026)
El sistema hacía peticiones a la API de OpenAI usando la API key de Anthropic (Claude), resultando en error 401.

**Logs del error:**
```
ERROR [EmbeddingService] Error generando embedding: 401 Incorrect API key provided: sk-ant-a... (API key de Anthropic)
```

**Causa raíz:**
1. `EmbeddingService` buscaba proveedor para capacidad `embedding`
2. El mapeo en `AIProviderService.ts`: `embedding → { enabled: 'textGenerationEnabled', isDefault: 'isDefaultForText' }`
3. Encuentra **Anthropic** (id=2) porque tiene `isDefaultForText=true`
4. Usa la API key de Anthropic (`sk-ant-...`)
5. Intenta llamar a `client.embeddings.create()` (API de OpenAI)
6. OpenAI rechaza → Error 401

## Solución Implementada (02-Abr-2026)

### 1. EmbeddingService.ts — FORZAR OpenAI

**Antes (problema):**
```typescript
const provider = await getDefaultProviderForCapability('embedding');
```

**Después (corregido):**
```typescript
// 🔥 FORZAR OpenAI para embeddings (Anthropic no tiene API de embeddings)
const provider = await AIProviderConfig.findOne({
  where: {
    companyId: null,  // GLOBAL
    isActive: true,
    provider: 'openai'
  }
});
```

### 2. Logs Detallados Agregados

#### EmbeddingService.ts
- `[EmbeddingService] 🔍 Buscando provider OpenAI para embeddings...`
- `[EmbeddingService] ✅ Proveedor encontrado: id=1, name="openai", apiKey=sk-...XXXX`
- `[EmbeddingService] ✅ Embedding generado: 1536 dims, X tokens, company=N`
- `[EmbeddingService] 📊 Primeras 5 dimensiones del embedding: [0.023, -0.045, ...]`

#### RAGAgentService.ts
- `[RAGAgent] 🔍 Búsqueda completada: X chunks encontrados para query="..."`
- `[RAGAgent] 📄 Chunk 1 (score=0.823): "Plan Pro: $99/mes..."`

#### SupervisorService.ts
- `[Supervisor] 📤 Enviando al LLM (iter 1): X mensajes, model=gpt-4.1-mini`
- `[Supervisor] 📝 System prompt (X chars): "Eres asistente..."`
- `[Supervisor] 📝 User message: "cuánto cuesta el plan Pro?"`

---

## Flujo Completo con Logs

```
1️⃣ [EmbeddingService] 🔍 Buscando provider OpenAI para embeddings...
   └─ → SELECT * FROM "AIProviderConfigs" WHERE provider='openai'
   └─ → Proveedor encontrado: id=1, name="openai"

2️⃣ [EmbeddingService] 📥 Query del usuario: "precio del plan Pro"
   └─ → Generando embedding con text-embedding-3-small

3️⃣ [EmbeddingService] ✅ Embedding generado: 1536 dims
   └─ → Primeros 5 valores: [0.023, -0.045, 0.012, ...]

4️⃣ [RAGAgent] 🔍 Buscando en Knowledge Base...
   └─ → SELECT * FROM "AIChunks" WHERE companyId=6 ORDER BY embedding <=> $1
   └─ → 3 chunks encontrados (threshold=0.7)

5️⃣ [RAGAgent] 📄 Contexto recuperado:
   └─ → Chunk 1 (score=0.82): "Plan Pro: $99/mes..."
   └─ → Chunk 2 (score=0.78): "Incluye analytics avanzado..."
   └─ → Chunk 3 (score=0.75): "Soporte prioritario 24/7..."

6️⃣ [Supervisor] 📦 Construyendo prompt para Claude...
   └─ → System: "Eres asistente de ventas..."
   └─ → Context: 3 chunks (850 palabras)
   └─ → User: "cuánto cuesta el plan Pro?"

7️⃣ [Supervisor] 📤 Enviando a Claude (Anthropic)...
   └─ → model: claude-3-5-sonnet
   └─ → mensajes: 2 (system + user con contexto)
```

---

## Archivos Modificados

| Archivo | Cambio |
|---------|-------|
| `services/RAGServices/EmbeddingService.ts` | Forzar provider='openai' + logs |
| `services/AIAgentServices/RAGAgentService.ts` | Logs de chunks encontrados |
| `services/AIAgentServices/SupervisorService.ts` | Logs del prompt enviado |

---

## Estado BD

```
id | name             | provider | textGenerationEnabled | isDefaultForText
1  | openai           | openai   | t                     | t
2  | Anthropic (Claude) | anthropic | t                   | t
```

---

## Verificación

```bash
pm2 logs chateam-backend --lines 100 --nostream | grep -E "(EmbeddingService|📤|📄|📊)"
```

---

## Resultado Final

| Capacidad | Proveedor | Modelo |
|-----------|-----------|---------|
| **Embeddings** | OpenAI (forzado) | `text-embedding-3-small` |
| **Text/Chat** | Anthropic (Claude) | `claude-3-5-sonnet` |

---

*Documentado: 2026-04-02*
*Actualizado: 2026-04-02 (logs + forzar OpenAI)*