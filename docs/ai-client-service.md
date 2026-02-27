# AIClientService - Servicio Centralizado de IA

## Resumen

Se ha implementado un sistema centralizado para la gestión de proveedores de IA que permite:

1. **Selección automática** del proveedor correcto según la capacidad requerida
2. **Configuración global** por el SuperAdmin (companyId=1)
3. **Multi-proveedor** preparado para OpenAI, Anthropic, Google
4. **Tracking automático** de tokens y uso

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                     AIClientService                          │
│  (src/services/AIClientService.ts)                          │
├─────────────────────────────────────────────────────────────┤
│  Métodos de alto nivel:                                     │
│  • chatCompletion()    → Genera texto                       │
│  • generateImage()     → Genera imagen (DALL-E)             │
│  • transcribeAudio()   → Speech to Text (Whisper)           │
│  • synthesizeSpeech()  → Text to Speech                     │
│  • createEmbedding()   → Embeddings                         │
│  • analyzeImage()      → Vision AI                          │
├─────────────────────────────────────────────────────────────┤
│  Utilidades:                                                │
│  • getClientForCapability() → Cliente raw por capacidad     │
│  • getOpenAIClient()        → Cliente OpenAI directo        │
│  • isCapabilityAvailable()  → Verifica disponibilidad       │
└─────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────┐
│               AIProviderService                             │
│  getDefaultProviderForCapability('text') → AIProviderConfig │
│  getProvidersForCapability('images')     → AIProviderConfig[]│
│  isCapabilityAvailable('stt')            → boolean          │
└─────────────────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────────────────┐
│               AIProviderConfig (tabla BD)                   │
│  • apiKey, provider, baseUrl, settings                      │
│  • isDefaultForText, isDefaultForImages, isDefaultForSTT... │
│  • textGenerationEnabled, imageGenerationEnabled...         │
└─────────────────────────────────────────────────────────────┘
```

---

## Archivos del Sistema

### Archivos Creados

| Archivo | Descripción |
|---------|-------------|
| `src/services/AIClientService.ts` | Servicio centralizado de IA |
| `src/services/AIProviderService.ts` | Servicio de selección de proveedores |
| `database/ai-default-provider-migration.sql` | Migración SQL para campos isDefaultFor* |
| `src/debug/testAIProviderService.ts` | Script de pruebas |
| `docs/ai-client-service.md` | Esta documentación |

### Archivos Modificados

| Archivo | Modificación |
|---------|--------------|
| `models/AIProviderConfig.ts` | Agregados campos isDefaultFor* y hook AfterSave |
| `frontend/src/pages/OpenAISettings.tsx` | UI para checkboxes de proveedor por defecto |

---

## Plan de Migración de Servicios

Los siguientes archivos deben ser modificados para usar el nuevo AIClientService:

| Archivo | Tipo | Cambio Principal |
|---------|------|------------------|
| `src/services/AIClientService.ts` | **CREAR** | Servicio centralizado |
| `services/IntegrationsServices/OpenAiService.ts` | Modificar | Usar `chatCompletion()` |
| `workers/stageClassifier.worker.ts` | Modificar | Usar `chatCompletion()` |
| `services/AIImageGenerationService/GenerateImagesWithOpenAIService.ts` | Modificar | Usar `generateImage()` |
| `services/AppointmentServices/AISchedulingService.ts` | Modificar | Usar `chatCompletion()` |
| `services/IntegrationsServices/procesarArchivoYEmbeddings.ts` | Modificar | Usar `createEmbedding()` |
| `services/IntegrationsServices/OpenAiMetaService.ts` | Modificar | Usar `chatCompletion()` |
| `services/IntegrationsServices/OpenaiServicesF&G.ts` | Modificar | Usar `chatCompletion()` |

---

## Uso del AIClientService

### Chat Completion (Generación de Texto)

```typescript
import { chatCompletion } from '../src/services/AIClientService';

const response = await chatCompletion({
  messages: [
    { role: 'system', content: 'Eres un asistente útil' },
    { role: 'user', content: '¿Qué hora es?' }
  ],
  companyId: ticket.companyId,
  module: 'chat', // 'chat' | 'followup' | 'classification' | 'transfer'
  maxTokens: 1000,
  temperature: 0.7
});

console.log(response.content); // Respuesta del modelo
console.log(response.model);   // 'gpt-4o-mini'
console.log(response.usage);   // { prompt_tokens, completion_tokens, total_tokens }
```

### Generación de Imágenes

```typescript
import { generateImage } from '../src/services/AIClientService';

const result = await generateImage({
  prompt: 'Un gato jugando con una bola de estambre',
  size: '1024x1024',
  model: 'dall-e-3',
  quality: 'hd'
});

console.log(result.images[0].url);           // URL de la imagen
console.log(result.images[0].revisedPrompt); // Prompt mejorado por DALL-E
```

### Speech to Text (Transcripción)

```typescript
import { transcribeAudio } from '../src/services/AIClientService';

const audioBuffer = fs.readFileSync('audio.ogg');
const result = await transcribeAudio({
  audioBuffer,
  language: 'es',
  companyId: 1
});

console.log(result.text); // Texto transcrito
```

### Embeddings

```typescript
import { createEmbedding } from '../src/services/AIClientService';

const result = await createEmbedding({
  text: 'Este es el texto a vectorizar',
  companyId: 1
});

console.log(result.embedding);    // Float array de 1536 dimensiones
console.log(result.totalTokens);  // Tokens consumidos
```

### Text to Speech

```typescript
import { synthesizeSpeech } from '../src/services/AIClientService';

const result = await synthesizeSpeech({
  text: 'Hola, soy una voz generada por IA',
  voice: 'alloy', // 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
  model: 'tts-1'
});

fs.writeFileSync('output.mp3', result.audioBuffer);
```

### Vision AI (Análisis de Imágenes)

```typescript
import { analyzeImage } from '../src/services/AIClientService';

const result = await analyzeImage(
  'https://example.com/image.jpg',
  '¿Qué hay en esta imagen?',
  { companyId: 1, maxTokens: 500 }
);

console.log(result.content); // Descripción de la imagen
```

---

## Capacidades y Proveedores

| Capacidad | Campo BD | OpenAI | Anthropic | Google |
|-----------|----------|--------|-----------|--------|
| text | isDefaultForText | ✅ GPT-4o | ✅ Claude | ✅ Gemini |
| translation | isDefaultForTranslation | ✅ | ✅ | ✅ |
| images | isDefaultForImages | ✅ DALL-E | ❌ | ❌ |
| imageAnalysis | isDefaultForImageAnalysis | ✅ GPT-4V | ❌ | ✅ Gemini Vision |
| stt | isDefaultForSTT | ✅ Whisper | ❌ | ❌ |
| tts | isDefaultForTTS | ✅ TTS-1 | ❌ | ❌ |

---

## Configuración del Admin

El SuperAdmin configura los proveedores desde:
- **Ruta**: `/ai/providers` o Settings de OpenAI
- **Tabla**: `AIProviderConfigs`
- **Company**: Siempre companyId = 1 (SuperAdmin)

Para cada proveedor se puede:
1. Habilitar/deshabilitar capacidades individuales
2. Marcar como "predeterminado" para cada capacidad
3. Configurar API Key, Base URL, modelo por defecto

---

## Migración SQL

Ejecutar antes de usar el sistema:

```sql
-- Archivo: database/ai-default-provider-migration.sql

ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "isDefaultForText" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "isDefaultForTranslation" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "isDefaultForImages" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "isDefaultForImageAnalysis" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "isDefaultForSTT" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "isDefaultForTTS" BOOLEAN NOT NULL DEFAULT false;
```

---

## Testing

Ejecutar el script de debug:

```bash
npx ts-node src/debug/testAIProviderService.ts
```

Resultados esperados:
- ✅ Conexión a BD exitosa
- ✅ Tabla AIProviderConfigs existe
- ✅ 6 campos isDefaultFor* encontrados
- ✅ Performance < 10ms por llamada

---

## Beneficios

1. **Un solo punto de entrada** para todas las operaciones de IA
2. **Selección automática** del proveedor según capacidad
3. **Fallback entre modelos** en caso de rate limit
4. **Cache de clientes** para mejor rendimiento
5. **Tracking automático** de tokens y costos
6. **Multi-proveedor** preparado para futuras expansiones
7. **Configuración centralizada** desde el panel admin

---

## Próximos Pasos

1. [ ] Migrar `OpenAiService.ts` a usar `chatCompletion()`
2. [ ] Migrar `stageClassifier.worker.ts` a usar `chatCompletion()`
3. [ ] Migrar `GenerateImagesWithOpenAIService.ts` a usar `generateImage()`
4. [ ] Migrar `AISchedulingService.ts` a usar `chatCompletion()`
5. [ ] Migrar `procesarArchivoYEmbeddings.ts` a usar `createEmbedding()`
6. [ ] Migrar `OpenAiMetaService.ts` a usar `chatCompletion()`
7. [ ] Migrar `OpenaiServicesF&G.ts` a usar `chatCompletion()`
8. [ ] Implementar soporte completo para Anthropic y Google
