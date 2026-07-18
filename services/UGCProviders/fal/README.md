# fal.ai UGC Provider

This provider lets ChatEAM generate UGC assets without a local GPU.

```txt
ChatEAM -> fal.ai queue/API -> generated image/video URL -> UGCVideoAsset
```

## Required Environment

```env
FAL_KEY=
FAL_WEBHOOK_PUBLIC_URL=https://your-domain.com/api/fal/webhook
FAL_WEBHOOK_VERIFY_SIGNATURE=true

UGC_VIDEO_PROVIDER=fal-wan
UGC_IMAGE_PROVIDER=fal-flux

FAL_IMAGE_MODEL=fal-ai/flux/schnell
FAL_IMAGE_EDIT_MODEL=fal-ai/flux-pro/kontext
FAL_VIDEO_TEXT_MODEL=fal-ai/wan-25-preview/text-to-video
FAL_VIDEO_IMAGE_MODEL=fal-ai/wan-25-preview/image-to-video
FAL_VIDEO_PREMIUM_MODEL=fal-ai/seedance/v2/image-to-video
```

## Files

```txt
FalClient.ts          Base SDK wrapper around @fal-ai/client
FalImageProvider.ts   Profile photos, thumbnails, generated UGC images
FalVideoProvider.ts   Text-to-video, image-to-video, premium renders (legacy)
submitWithAdapter.ts  Bypassa mapInput genérico; usa el adapter del registry
catalog.ts            Catálogo curado de modelos fal.ai disponibles
adapters/             Adapter pattern por modelo (Seedance, Kling, Veo, etc.)
adapters/README.md    Cómo añadir un modelo nuevo en 5 pasos
types.ts              Local typed inputs/outputs
errors.ts             Provider-specific errors
```

## Adapter Pattern (preferido para nuevas campañas)

A partir de v2026-05-13, cada campaña UGC persiste su `videoModelKey` y
`imageModelKey`. El job `jobs/UGCVideoGeneration.ts` lee la key, resuelve
el adapter del [registry](./adapters/registry.ts) e invoca
`submitWithAdapter` con los inputs ya mapeados al modelo específico.
`FalVideoProvider.ts` queda como capa de compatibilidad para usos
directos (legacy).

Endpoints expuestos:

```txt
GET   /ugc/fal-models                          Catálogo curado (6 modelos)
PATCH /ugc/campaigns/:id/model-selection       Guardar selección de modelo
```

Frontend:

```txt
/ugc/campaigns/:id/model-selector              Galería con autoplay-on-hover
```

Ver [adapters/README.md](./adapters/README.md) para detalles.

## Current Model Defaults

```txt
Image: fal-ai/flux/schnell
Image edit: fal-ai/flux-pro/kontext
Text-to-video: fal-ai/wan-25-preview/text-to-video
Image-to-video: fal-ai/wan-25-preview/image-to-video
Premium video: fal-ai/seedance/v2/image-to-video
```

Before production use, verify exact availability and pricing at:

```txt
https://fal.ai/explore
https://fal.ai/pricing
```

## Webhook Flow

Long video jobs use:

```txt
fal.queue.submit(model, { input, webhookUrl })
```

fal calls:

```txt
POST /api/fal/webhook
```

The receiver verifies ED25519 signatures with fal JWKS, then looks up the
`UGCVideoJob` by `videoProviderJobId`.

Idempotency:

```txt
If the job is already completed or failed, the webhook is acknowledged and ignored.
```

## Signature Verification

fal.ai currently documents ED25519/JWKS webhook verification, not HMAC.

Reference:

```txt
https://fal.ai/docs/documentation/model-apis/inference/webhooks
```

JWKS endpoint:

```txt
https://rest.fal.ai/.well-known/jwks.json
```

For local development only, verification can be disabled:

```env
FAL_WEBHOOK_VERIFY_SIGNATURE=false
```

## Examples

Generate an image:

```ts
await FalImageProvider.generateUGCImage({
  companyId,
    campaignId,
      videoJobId,
        prompt: "realistic UGC product photo",
          aspectRatio: "1:1"
          });
          ```

          Submit a long video:

          ```ts
          await FalVideoProvider.submitTextToVideo({
            companyId,
              campaignId,
                videoJobId,
                  prompt: "vertical UGC video, natural light",
                    aspectRatio: "9:16",
                      duration: 5
                      });
                      ```

                      ## Adding a Model

                      1. Add an env var with the model ID.
                      2. Confirm input/output shape on `https://fal.ai/explore`.
                      3. Extend the relevant provider with a small mapping method.
                      4. Keep raw fal model fields isolated inside provider code.
                      
