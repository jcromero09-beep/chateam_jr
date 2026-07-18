# Fal.ai Adapters

Cada adapter encapsula los matices de un `model_id` específico de fal.ai
(Seedance, Kling 3.0, Veo 3.1, Nano Banana 2, etc.) detrás de un contrato
uniforme. El job de Bull y el controller de model-selection consumen el
**registry**, no los adapters directamente.

## Contrato (`FalAdapter`)

```ts
interface FalAdapter<TDefault, TRuntime, TOutput> {
  readonly key: string                // 'kling-v2.6-pro-i2v'
  readonly modelId: string            // 'fal-ai/kling-video/v2.6/pro/image-to-video'
  readonly type: 'image-to-video' | 'motion-control' | 'image-edit'

  readonly defaultSchema: ZodTypeAny  // valida lo que se persiste en campaña
  readonly runtimeSchema: ZodTypeAny  // valida defaults + assets justo antes de submit

  mapInput(params: TRuntime): Record<string, unknown>  // → snake_case fal.ai
  mapOutput(raw: unknown): TOutput
  estimateCostUsd(params: TRuntime): number

  readonly requiresCampaignAssets?: FalCampaignAssetRequirement[]
}
```

### Por qué dos schemas

- **defaultSchema** valida lo que el usuario configura desde la galería y
  que se persiste en `UGCCampaign.{video,image}ModelDefaults`. NO incluye
  assets de runtime (prompt, image_url, video_url).
- **runtimeSchema** valida `defaults + runtime` justo antes de
  `fal.queue.submit`. Aquí sí se exigen prompt y URLs.

Esto previene que el usuario "guarde" una campaña sin prompt (que vendrá
del pipeline) pero también que el job dispare con inputs incompletos.

## Cómo añadir un modelo nuevo (5 pasos)

### 1. Crear `FooBar.ts` en este directorio

```ts
import { z } from "zod";
import type { FalAdapter } from "./types";

const defaultSchema = z.object({
  duration: z.enum(["5", "10"]).default("5"),
  // ...
});

const runtimeSchema = defaultSchema.extend({
  prompt: z.string().min(1).max(800),
  image_url: z.string().url()
});

export type FooBarDefaults = z.infer<typeof defaultSchema>;
export type FooBarRuntime = z.infer<typeof runtimeSchema>;

export interface FooBarOutput {
  video: { url: string };
}

export const FooBar: FalAdapter<FooBarDefaults, FooBarRuntime, FooBarOutput> = {
  key: "foo-bar-v1",
  modelId: process.env.FAL_MODEL_FOOBAR ?? "fal-ai/foo/bar",
  type: "image-to-video",
  defaultSchema,
  runtimeSchema,
  mapInput(params) {
    return {
      prompt: params.prompt,
      image_url: params.image_url,
      duration: params.duration
    };
  },
  mapOutput(raw) {
    const r = raw as { video?: { url?: string } };
    if (!r?.video?.url) throw new Error("FooBar output missing video.url");
    return { video: r.video as FooBarOutput["video"] };
  },
  estimateCostUsd(params) {
    return Number(params.duration) * 0.05;
  },
  requiresCampaignAssets: ["characterImage"]
};
```

### 2. Registrar en `registry.ts`

```ts
import { FooBar } from "./FooBar";

export const FAL_ADAPTERS = Object.freeze({
  // ...existentes
  [FooBar.key]: FooBar as FalAdapter<unknown, unknown, unknown>
});
```

### 3. Añadir al catálogo en `../catalog.ts`

```ts
{
  key: "foo-bar-v1",
  displayName: "Foo Bar v1",
  vendor: "Acme Labs",
  modelId: "fal-ai/foo/bar",
  envOverride: "FAL_MODEL_FOOBAR",
  type: "image-to-video",
  description: "...",
  previewVideoUrl: "https://storage.googleapis.com/falserverless/.../preview.mp4",
  previewImageUrl: "https://storage.googleapis.com/falserverless/.../poster.jpg",
  pricing: { unit: "second", estimateUsd: 0.05, displayLabel: "$0.05 / s" },
  configurableFields: [...],
  defaults: { duration: "5" },
  recommended: false,
  tags: ["new"],
  playgroundUrl: "https://fal.ai/models/fal-ai/foo/bar",
  requiresCampaignAssets: ["characterImage"]
}
```

### 4. Bumpear `FAL_CATALOG_VERSION` en `../catalog.ts`

### 5. Agregar test unitario en `tests/unit/`

```ts
import { FooBar } from "../../services/UGCProviders/fal/adapters/FooBar";

describe("FooBar adapter", () => {
  test("mapInput convierte a snake_case", () => {
    const params = FooBar.runtimeSchema.parse({
      prompt: "hello",
      image_url: "https://example.com/x.png",
      duration: "5"
    });
    const mapped = FooBar.mapInput(params as never);
    expect(mapped).toEqual({
      prompt: "hello",
      image_url: "https://example.com/x.png",
      duration: "5"
    });
  });

  test("estimateCostUsd para duración=5", () => {
    expect(FooBar.estimateCostUsd({ duration: "5" } as never)).toBe(0.25);
  });
});
```

## Reglas estrictas

1. **Nunca uses `any`**. Tipos explícitos en TDefault / TRuntime / TOutput.
2. **mapInput debe filtrar `undefined`** antes de retornar — fal.ai
   responde 400 si recibe keys con `undefined`.
3. **mapOutput lanza error explícito** si el shape esperado no aparece.
   Nunca devuelvas un output parcial silenciosamente.
4. **estimateCostUsd** acepta los parámetros validados (TRuntime). Si
   la duración es enum string, `Number(...)` para convertir.
5. **requiresCampaignAssets** declara qué assets DEBE tener la campaña.
   El validador del endpoint PATCH usa esto para bloquear selecciones
   inejecutables (motion-control sin video de referencia → 422).
6. **envOverride** en el catálogo permite cambiar el modelId sin
   redeploy. Nombrar `FAL_MODEL_<KEY_UPPER_SNAKE>`.

## Matriz de categorías (PR #2)

Las categorías son la fuente de verdad para que el wizard del Pipeline
Builder filtre los modelos en cada paso. `type` (legacy del PR #1) se
conserva como alias informativo.

| Categoría        | Adapters disponibles                                                |
|------------------|---------------------------------------------------------------------|
| `text-to-image`  | `nano-banana-2`                                                     |
| `image-to-image` | `nano-banana-2-edit`                                                |
| `text-to-video`  | `veo3.1-t2v`, `kling-v3-pro-t2v`, `kling-v2.6-pro-t2v`              |
| `image-to-video` | `seedance-v1-pro-i2v`, `kling-v3-pro-i2v`, `kling-v2.6-pro-i2v`, `veo3.1-i2v`, `veo3.1-fast-i2v` |
| `video-to-video` | `kling-v3-pro-motion-control`                                       |
| `text-to-speech` | `elevenlabs-tts-v3`, `f5-tts`                                       |
| `lipsync`        | `sync-lipsync`, `latentsync`                                        |

## Modelos actualmente soportados

| Key                              | Tipo            | Vendor          | Pricing             |
|----------------------------------|-----------------|-----------------|---------------------|
| `seedance-v1-pro-i2v`            | image-to-video  | ByteDance       | $0.05 / s           |
| `kling-v3-pro-i2v`               | image-to-video  | Kuaishou        | ~$0.07 / s          |
| `kling-v3-pro-motion-control`    | motion-control  | Kuaishou        | ~$0.10 / s          |
| `kling-v2.6-pro-i2v`             | image-to-video  | Kuaishou        | ~$0.06 / s          |
| `veo3.1-i2v`                     | image-to-video  | Google DeepMind | $0.40 / s (premium) |
| `nano-banana-2-edit`             | image-edit      | Google          | $0.04 / img (1K)    |
| `nano-banana-2`                  | text-to-image   | Google          | $0.04 / img (1K)    |
| `veo3.1-t2v`                     | text-to-video   | Google DeepMind | $0.40 / s (premium) |
| `kling-v3-pro-t2v`               | text-to-video   | Kuaishou        | ~$0.08 / s          |
| `kling-v2.6-pro-t2v`             | text-to-video   | Kuaishou        | ~$0.07 / s          |
| `veo3.1-fast-i2v`                | image-to-video  | Google DeepMind | ~$0.20 / s          |
| `elevenlabs-tts-v3`              | text-to-speech  | ElevenLabs      | ~$0.03 / 1000 chars |
| `f5-tts`                         | text-to-speech  | SWivid          | ~$0.10 / 1000 s     |
| `sync-lipsync`                   | lipsync         | Sync            | ~$0.05 / s          |
| `latentsync`                     | lipsync         | ByteDance       | ~$0.06 / s          |
