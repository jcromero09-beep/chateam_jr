# UGC Pipeline Builder (fal.ai)

PR #2 — Modos de pipeline y orquestación multi-slot. Versión catálogo:
`2026-05-14`. 15 adapters disponibles, 3 modos de pipeline.

## Los 3 modos

Cada campaña UGC selecciona UN `pipelineMode` que dicta qué slots se
ejecutan y en qué orden. El usuario no puede mezclar slots de modos
distintos — el validador del backend rechaza con 422.

### Modo 1 · `image-then-video` (default — retrocompat con PR #1)

```
Brief (texto) → [Imagen] → [Video I2V o Motion Control] → Video UGC
                  paso 1         paso 2
```

- **Imagen** (requerido): `text-to-image` → genera la base del personaje.
- **Video** (requerido): `image-to-video` o `video-to-video` (motion-control).
- **Voz**: opcional. Si está, se agrega como pista paralela sin lipsync.
- **Lipsync**: ❌ no aplica (sin lipsync no tiene sentido — usar modo 3).

Cuándo usarlo: la mayoría de UGC. Mejor consistencia del personaje a través
del tiempo. Costo medio.

### Modo 2 · `text-to-video-direct`

```
Brief (texto) → [Video T2V] → Video UGC
                 paso único
```

- **Imagen**: ❌ no aplica (se salta).
- **Video** (requerido): `text-to-video` exclusivamente.
- **Voz**: opcional (overlay).
- **Lipsync**: ❌ no aplica.

Cuándo usarlo: variaciones rápidas, A/B testing, contenido genérico sin
necesidad de mantener un personaje recurrente. Más barato y rápido.

### Modo 3 · `lipsync-talking-head`

```
Brief → [Imagen] → [Video I2V] → [Voz TTS] → [Lipsync] → Video UGC
         paso 1      paso 2       paso 3      paso 4
```

- **Imagen** (requerido): `text-to-image`.
- **Video** (requerido): `image-to-video` SOLO — motion-control NO encaja.
- **Voz** (requerido): `text-to-speech`.
- **Lipsync** (requerido): `lipsync`.

Cuándo usarlo: testimonios profesionales, anuncios de personas hablando
a cámara con script preciso. Costo más alto y mayor tiempo de render.

## Matriz pipelineMode × Slot × Categoría

| pipelineMode | imageSlot | videoSlot | voiceSlot | lipsyncSlot |
|---|---|---|---|---|
| `image-then-video` | **R** text-to-image | **R** image-to-video \| video-to-video | O text-to-speech | ❌ |
| `text-to-video-direct` | ❌ | **R** text-to-video | O text-to-speech | ❌ |
| `lipsync-talking-head` | **R** text-to-image | **R** image-to-video | **R** text-to-speech | **R** lipsync |

**R** = requerido · **O** = opcional · **❌** = prohibido (422)

### Constraints adicionales

- `lipsyncSlot` sin `voiceSlot` → 422 (lipsync necesita audio para sincronizar).
- `motion-control` adapters requieren `videoModelMotionReferenceUrl` en la campaña.
- En modo `lipsync-talking-head`, `motion-control` está excluido (no produce lip movement aprovechable).

## Catálogo completo (15 adapters)

### Text-to-Image (1)
| Key | Vendor | Modelo |
|---|---|---|
| `nano-banana-2` | Google | `fal-ai/nano-banana-2` |

### Image-to-Image (1)
| Key | Vendor | Modelo |
|---|---|---|
| `nano-banana-2-edit` | Google | `fal-ai/nano-banana-2/edit` |

### Text-to-Video (3)
| Key | Vendor | Modelo |
|---|---|---|
| `veo3.1-t2v` | Google DeepMind | `fal-ai/veo3.1` |
| `kling-v3-pro-t2v` | Kuaishou | `fal-ai/kling-video/v3/pro/text-to-video` |
| `kling-v2.6-pro-t2v` | Kuaishou | `fal-ai/kling-video/v2.6/pro/text-to-video` |

### Image-to-Video (5)
| Key | Vendor | Modelo |
|---|---|---|
| `seedance-v1-pro-i2v` | ByteDance | `fal-ai/bytedance/seedance/v1/pro/image-to-video` |
| `kling-v3-pro-i2v` | Kuaishou | `fal-ai/kling-video/v3/pro/image-to-video` |
| `kling-v2.6-pro-i2v` | Kuaishou | `fal-ai/kling-video/v2.6/pro/image-to-video` |
| `veo3.1-i2v` | Google DeepMind | `fal-ai/veo3.1/image-to-video` |
| `veo3.1-fast-i2v` | Google DeepMind | `fal-ai/veo3.1/fast/image-to-video` |

### Video-to-Video / Motion Control (1)
| Key | Vendor | Modelo |
|---|---|---|
| `kling-v3-pro-motion-control` | Kuaishou | `fal-ai/kling-video/v3/pro/motion-control` |

### Text-to-Speech (2)
| Key | Vendor | Modelo |
|---|---|---|
| `elevenlabs-tts-v3` | ElevenLabs | `fal-ai/elevenlabs/tts/eleven-v3` |
| `f5-tts` | SWivid | `fal-ai/f5-tts` |

### Lipsync (2)
| Key | Vendor | Modelo |
|---|---|---|
| `sync-lipsync` | Sync | `fal-ai/sync-lipsync` |
| `latentsync` | ByteDance | `fal-ai/latentsync` |

## API

### Catálogo
```
GET /ugc/fal-models
```

Devuelve los 15 modelos del catálogo estático con sus campos
`category` / `inputs` / `outputs` / `available`. La UI filtra por
`category` según el paso del wizard.

### Guardar pipeline
```
PATCH /ugc/campaigns/:id/model-selection

{
  "pipelineMode": "lipsync-talking-head",
  "slots": {
    "image":   { "modelKey": "nano-banana-2",      "defaults": { "aspect_ratio": "9:16" } },
    "video":   { "modelKey": "kling-v2.6-pro-i2v", "defaults": { "duration": "5" } },
    "voice":   { "modelKey": "elevenlabs-tts-v3",  "defaults": { "voice": "Rachel" } },
    "lipsync": { "modelKey": "sync-lipsync",       "defaults": {} }
  },
  "videoModelMotionReferenceUrl": null
}
```

Respuestas:
- `200` → campaña actualizada.
- `404` → campaña no existe.
- `422` → validación falló (Zod schema o matriz categórica). El body de
  respuesta incluye `errors: [{ field, message }]`.

El endpoint también acepta el body flat del PR #1 (`videoModelKey` /
`imageModelKey` planos) para mantener retrocompat con clientes viejos.

## Job de ejecución

`jobs/UGCPipelineRun.ts` orquesta los 4 pasos en modo síncrono (vía
`fal.subscribe`). Cada paso persiste un `UGCVideoAsset` con `assetType`
específico para trazabilidad:

| Paso | assetType | mimeType |
|---|---|---|
| 1 · Imagen | `generated_image` | `image/png` |
| 2 · Video | `raw_video` | `video/mp4` |
| 3 · Voz | `voice_audio` | `audio/mpeg` |
| 4 · Lipsync | `composed_final` | `video/mp4` |

`jobs/UGCVideoGeneration.ts` queda como wrapper retrocompat que delega
a `UGCPipelineRun` — campañas pre-PR#2 siguen funcionando sin cambios.

## Frontend

Página única: `/ugc/campaigns/:id/model-selector`. Es un wizard de 3 a 6
pasos según el modo:

1. **Modo del pipeline** — `<PipelineModeSelector />` con 3 cards grandes.
2. **Imagen** — galería filtrada por `category='text-to-image'` (omitida si modo es text-to-video-direct).
3. **Video** — galería filtrada según matriz (i2v + motion-control, t2v, o solo i2v).
4. **Voz** — galería filtrada por `category='text-to-speech'`.
5. **Lipsync** — galería filtrada por `category='lipsync'` (solo en lipsync-talking-head).
6. **Resumen** — `<PipelineSummary />` con costos por slot y total estimado.

## Cómo añadir un modelo nuevo

Ver [adapters/README.md](./adapters/README.md). En 5 pasos:
1. Crear `FooBar.ts` en `adapters/`.
2. Registrarlo en `adapters/registry.ts`.
3. Añadir entry a `catalog.ts` con `category`, `inputs`, `outputs`, `available`.
4. Bumpear `FAL_CATALOG_VERSION`.
5. Test unitario en `tests/unit/`.
