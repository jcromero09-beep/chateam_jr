# Capacidades de IA por Proveedor - Documentacion

## Resumen de la Implementacion

Se implemento un sistema de control de capacidades de IA que permite habilitar/deshabilitar acciones especificas para cada proveedor configurado en el sistema, asi como configurar precios en creditos para cada capacidad.

## Capacidades Disponibles

| Capacidad | Campo en BD | Descripcion | Default |
|-----------|-------------|-------------|---------|
| **Generacion de Texto** | `textGenerationEnabled` | Chat, completions, respuestas de IA | `true` |
| **Traduccion** | `translationEnabled` | Traducir texto entre idiomas | `false` |
| **Generar Imagenes** | `imageGenerationEnabled` | DALL-E, Stable Diffusion | `false` |
| **Leer Imagenes (Vision)** | `imageAnalysisEnabled` | Analisis de imagenes, OCR, chat con imagenes | `false` |
| **Escuchar Audio (STT)** | `speechToTextEnabled` | Transcribir audio a texto (Whisper) | `false` |

## Precios por Capacidad (Creditos)

Cada capacidad tiene un precio configurable en creditos:

| Capacidad | Campo en BD | Unidad | Default |
|-----------|-------------|--------|---------|
| **Generacion de Texto** | `textGenerationPricing` | creditos/palabra | `2` |
| **Traduccion** | `translationPricing` | creditos/palabra | `3` |
| **Generar Imagenes** | `imageGenerationPricing` | JSON por tamaño | `{"1024x1024": 30, "512x512": 20, "256x256": 10}` |
| **Vision AI** | `imageAnalysisPricing` | creditos/imagen | `15` |
| **Speech-to-Text** | `speechToTextPricing` | creditos/segundo | `10` |

---

## Archivos Modificados

### Backend

| Archivo | Cambios |
|---------|---------|
| `models/AIProviderConfig.ts` | Agregados 5 campos booleanos de capacidades + 5 campos de precios |
| `controllers/AIConfigController.ts` | Actualizado `createProvider` y `updateProvider` para manejar capacidades y precios |

### Frontend

| Archivo | Cambios |
|---------|---------|
| `frontend/src/pages/OpenAISettings.tsx` | Interfaces actualizadas, seccion de capacidades, seccion de precios condicional, columna en tabla |

### Base de Datos

| Archivo | Descripcion |
|---------|-------------|
| `database/ai-capabilities-migration.sql` | Script para agregar columnas de capacidades, precios e indices |

---

## Arquitectura de la Solucion

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│  OpenAISettings.tsx                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Modal de Proveedor                                      ││
│  │ ┌─────────────────────────────────────────────────────┐ ││
│  │ │ Seccion: Capacidades de IA                          │ ││
│  │ │ [x] Generacion de Texto                             │ ││
│  │ │ [ ] Traduccion                                      │ ││
│  │ │ [ ] Generar Imagenes                                │ ││
│  │ │ [ ] Leer Imagenes (Vision)                          │ ││
│  │ │ [ ] Escuchar Audio (STT)                            │ ││
│  │ └─────────────────────────────────────────────────────┘ ││
│  │ ┌─────────────────────────────────────────────────────┐ ││
│  │ │ Seccion: Precios (solo capacidades habilitadas)     │ ││
│  │ │ Texto: [2] creditos/palabra                         │ ││
│  │ │ Imagenes: 1024x1024 [30] 512x512 [20] 256x256 [10] │ ││
│  │ └─────────────────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  Tabla de Proveedores                                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Estado │ Proveedor │ Capacidades        │ Acciones      ││
│  │ OK     │ OpenAI    │ Texto Img Vision   │ Probar Editar ││
│  │ OK     │ Anthropic │ Texto Trad         │ Probar Editar ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ POST/PUT /ai/providers
┌─────────────────────────────────────────────────────────────┐
│                        BACKEND                              │
│  AIConfigController.ts                                      │
│  - createProvider(): Recibe capacidades del body           │
│  - updateProvider(): Actualiza capacidades                 │
│  - listProviders(): Retorna capacidades en respuesta       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     BASE DE DATOS                           │
│  Tabla: AIProviderConfigs                                   │
│  Columnas de capacidades:                                   │
│  - textGenerationEnabled BOOLEAN DEFAULT true              │
│  - translationEnabled BOOLEAN DEFAULT false                │
│  - imageGenerationEnabled BOOLEAN DEFAULT false            │
│  - imageAnalysisEnabled BOOLEAN DEFAULT false              │
│  - speechToTextEnabled BOOLEAN DEFAULT false               │
│                                                             │
│  Columnas de precios:                                       │
│  - textGenerationPricing DECIMAL DEFAULT 2                 │
│  - translationPricing DECIMAL DEFAULT 3                    │
│  - imageGenerationPricing JSONB DEFAULT {...}              │
│  - imageAnalysisPricing DECIMAL DEFAULT 15                 │
│  - speechToTextPricing DECIMAL DEFAULT 10                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Flujo de Datos

### Crear Proveedor

1. Usuario abre modal "Agregar Proveedor"
2. Completa datos basicos (nombre, API key, etc.)
3. Habilita/deshabilita capacidades con switches
4. Click en "Crear Proveedor"
5. Frontend envia POST `/ai/providers` con capacidades
6. Backend recibe y guarda en BD
7. Frontend actualiza tabla con nuevas capacidades

### Editar Proveedor

1. Usuario hace click en "Editar" en la tabla
2. Modal se abre con datos actuales (incluidas capacidades)
3. Usuario modifica capacidades
4. Click en "Guardar Cambios"
5. Frontend envia PUT `/ai/providers/:id`
6. Backend actualiza solo campos modificados
7. Frontend actualiza tabla

---

## Uso en Otros Servicios

Para verificar si un proveedor tiene una capacidad habilitada:

```typescript
// Ejemplo: Buscar proveedor con generacion de imagenes
const provider = await AIProviderConfig.findOne({
  where: {
    companyId,
    isActive: true,
    imageGenerationEnabled: true
  }
});

if (!provider) {
  throw new Error('No hay proveedores con generacion de imagenes habilitada');
}

// Usar el proveedor para generar imagen
const response = await generateImage(provider, prompt);
```

### Filtrar por Capacidad

```typescript
// Obtener todos los proveedores con Vision AI
const visionProviders = await AIProviderConfig.findAll({
  where: {
    companyId,
    isActive: true,
    imageAnalysisEnabled: true
  }
});

// Obtener proveedores con multiples capacidades
const multiCapabilityProviders = await AIProviderConfig.findAll({
  where: {
    companyId,
    isActive: true,
    textGenerationEnabled: true,
    imageGenerationEnabled: true
  }
});
```

### Calcular y Cobrar Creditos

```typescript
// Ejemplo: Calcular costo de generacion de texto
const provider = await AIProviderConfig.findOne({
  where: { companyId, isActive: true, textGenerationEnabled: true }
});

const wordCount = countWords(responseText);
const creditsToCharge = wordCount * provider.textGenerationPricing;

// Debitar creditos al usuario
await debitCredits(companyId, creditsToCharge, 'text_generation', referenceId);
```

```typescript
// Ejemplo: Calcular costo de imagen por tamaño
const provider = await AIProviderConfig.findOne({
  where: { companyId, isActive: true, imageGenerationEnabled: true }
});

const imageSize = '1024x1024';
const numberOfImages = 2;
const creditsToCharge = numberOfImages * provider.imageGenerationPricing[imageSize];

await debitCredits(companyId, creditsToCharge, 'image_generation', generationId);
```

```typescript
// Ejemplo: Calcular costo de transcripcion de audio
const provider = await AIProviderConfig.findOne({
  where: { companyId, isActive: true, speechToTextEnabled: true }
});

const audioDurationSeconds = 45;
const creditsToCharge = audioDurationSeconds * provider.speechToTextPricing;

await debitCredits(companyId, creditsToCharge, 'speech_to_text', audioId);
```

---

## Buenas Practicas Aplicadas

1. **Compatibilidad hacia atras**: Valores por defecto que no rompen proveedores existentes
2. **Nullish coalescing (`??`)**: Para manejar valores undefined en frontend
3. **Indices parciales**: Solo indexan filas donde el campo es `true`
4. **Comentarios en BD**: Documentacion directa en las columnas
5. **Separacion de responsabilidades**: Controller maneja logica, modelo define estructura
6. **UI responsive**: Switches en grid de 2 columnas

---

## Instalacion

### 1. Ejecutar Migracion de BD

```bash
# En pgAdmin, ejecutar el script:
database/ai-capabilities-migration.sql
```

### 2. Reiniciar Backend

```bash
npm run dev
# o
yarn dev
```

### 3. Verificar Frontend

Abrir la pagina de Configuracion de IA y verificar que:
- El modal muestra la seccion "Capacidades de IA"
- Al habilitar una capacidad, aparece su campo de precio correspondiente
- La tabla muestra la columna "Capacidades" con chips de colores
- Al crear/editar un proveedor, las capacidades y precios se guardan correctamente

---

## Proximos Pasos Sugeridos

1. **Validacion en servicios**: Verificar capacidad antes de ejecutar accion
2. **Text-to-Speech (TTS)**: Agregar campo `textToSpeechEnabled` para sintesis de voz
3. **Dashboard de capacidades**: Vista resumida de que puede hacer cada proveedor
4. **Logs de uso por capacidad**: Tracking de que capacidades se usan mas
5. **Historial de consumo**: Registro de creditos consumidos por accion

---

## API Reference

### GET /ai/providers

Retorna lista de proveedores con capacidades y precios:

```json
[
  {
    "id": 1,
    "provider": "openai",
    "name": "OpenAI Principal",
    "isActive": true,
    "textGenerationEnabled": true,
    "translationEnabled": false,
    "imageGenerationEnabled": true,
    "imageAnalysisEnabled": true,
    "speechToTextEnabled": false,
    "textGenerationPricing": 2,
    "translationPricing": 3,
    "imageGenerationPricing": {"1024x1024": 30, "512x512": 20, "256x256": 10},
    "imageAnalysisPricing": 15,
    "speechToTextPricing": 10
  }
]
```

### POST /ai/providers

Crear proveedor con capacidades y precios:

```json
{
  "provider": "openai",
  "name": "Mi OpenAI",
  "apiKey": "sk-...",
  "textGenerationEnabled": true,
  "translationEnabled": true,
  "imageGenerationEnabled": true,
  "imageAnalysisEnabled": false,
  "speechToTextEnabled": false,
  "textGenerationPricing": 2.5,
  "translationPricing": 4,
  "imageGenerationPricing": {"1024x1024": 35, "512x512": 25, "256x256": 15}
}
```

### PUT /ai/providers/:id

Actualizar capacidades y precios:

```json
{
  "imageGenerationEnabled": true,
  "imageAnalysisEnabled": true,
  "imageGenerationPricing": {"1024x1024": 40, "512x512": 30, "256x256": 20},
  "imageAnalysisPricing": 20
}
```

---

## Fecha de Implementacion

- **Fase 1 (Capacidades)**: 2026-01-09
- **Fase 2 (Precios)**: 2026-01-12
- **Fase 3 (Subplanes)**: 2026-01-12

---

# FASE 3: Sistema de Subplanes de IA

## Resumen

Se implemento un sistema de "Subplanes de IA" que permite crear paquetes de tokens que los usuarios finales pueden comprar. Cada subplan:
- Esta vinculado a UN proveedor de IA especifico (AIProviderConfig)
- Tiene una cantidad fija de tokens
- Tiene un precio en USD
- Los tokens son generales (se usan para cualquier capacidad del proveedor)

## Estructura de Datos

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `id` | INTEGER | Identificador unico |
| `companyId` | INTEGER | ID de la empresa (multi-tenant) |
| `aiProviderConfigId` | INTEGER | ID del proveedor de IA asociado |
| `name` | VARCHAR(100) | Nombre del subplan |
| `description` | TEXT | Descripcion del subplan |
| `tokens` | BIGINT | Cantidad de tokens incluidos |
| `priceUsd` | DECIMAL(10,2) | Precio en USD |
| `isActive` | BOOLEAN | Si esta activo (default: true) |
| `isPublic` | BOOLEAN | Si es visible para compra (default: false) |
| `stripeProductId` | VARCHAR(255) | ID producto Stripe (opcional) |
| `stripePriceId` | VARCHAR(255) | ID precio Stripe (opcional) |

## Archivos Creados/Modificados

### Backend

| Archivo | Accion | Descripcion |
|---------|--------|-------------|
| `models/AISubplan.ts` | Crear | Modelo Sequelize |
| `controllers/AISubplanController.ts` | Crear | CRUD de subplanes |
| `routes/aiSubplanRoutes.ts` | Crear | Rutas API |
| `routes/index.ts` | Modificar | Registrar rutas |
| `database/index.ts` | Modificar | Registrar modelo |

### Frontend

| Archivo | Accion | Descripcion |
|---------|--------|-------------|
| `frontend/src/pages/AISubplans.tsx` | Crear | Pagina principal |
| `frontend/src/App.tsx` | Modificar | Agregar ruta |
| `frontend/src/utils/permissions.ts` | Modificar | Agregar modulo ai_subplans |

### Base de Datos

| Archivo | Descripcion |
|---------|-------------|
| `database/ai-subplans-migration.sql` | Script para crear tabla AISubplans |

## API Reference

### GET /ai/subplans

Lista todos los subplanes de la empresa:

```json
[
  {
    "id": 1,
    "companyId": 1,
    "aiProviderConfigId": 1,
    "name": "Plan Basico",
    "description": "Ideal para pequeños proyectos",
    "tokens": 10000,
    "priceUsd": 5.00,
    "isActive": true,
    "isPublic": true,
    "aiProviderConfig": {
      "id": 1,
      "name": "OpenAI Principal",
      "provider": "openai",
      "textGenerationPricing": 2,
      "imageGenerationPricing": {"1024x1024": 30}
    }
  }
]
```

### POST /ai/subplans

Crear nuevo subplan:

```json
{
  "aiProviderConfigId": 1,
  "name": "Plan Pro",
  "description": "Para usuarios frecuentes",
  "tokens": 50000,
  "priceUsd": 20.00,
  "isActive": true,
  "isPublic": true
}
```

### PUT /ai/subplans/:id

Actualizar subplan:

```json
{
  "name": "Plan Pro Plus",
  "tokens": 60000,
  "priceUsd": 25.00
}
```

### DELETE /ai/subplans/:id

Eliminar subplan.

### GET /ai/subplans/public

Lista solo subplanes publicos y activos (para compra por usuarios finales).

## Flujo de Uso

```
1. Admin va a /ai/subplans
2. Click "Nuevo Subplan"
3. Selecciona proveedor (ej: OpenAI Principal)
   └─ Sistema muestra capacidades y precios del proveedor
4. Ingresa nombre, descripcion
5. Define tokens y precio USD
   └─ Sistema calcula capacidad aproximada automaticamente
6. Marca como activo/publico
7. Guarda
8. Subplan aparece en lista
9. Usuarios finales pueden comprar (si es publico)
```

## Instalacion

### 1. Ejecutar Migracion de BD

```bash
# En pgAdmin, ejecutar el script:
database/ai-subplans-migration.sql
```

### 2. Reiniciar Backend

```bash
npm run dev
```

### 3. Verificar Frontend

Navegar a `/ai/subplans` y verificar que:
- La pagina carga correctamente
- Se pueden crear/editar/eliminar subplanes
- Los proveedores aparecen en el selector
- El calculo de capacidad aproximada funciona
