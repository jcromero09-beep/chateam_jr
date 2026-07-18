# UGC ComfyUI Setup

This project does not run Wan or Flux inside Node.js. The backend only
orchestrates generation. The actual AI engine is:

```txt
ChatEAM backend -> ComfyUI HTTP API -> Wan/Flux workflows -> generated assets
```

## What must be installed

Install these outside the Node backend:

```txt
ComfyUI
Wan video model and dependencies
Flux image model and dependencies
GPU runtime/drivers if using local GPU
```

The backend talks to ComfyUI using:

```txt
POST /prompt
GET /history/:promptId
GET /view
```

## Required env vars

Copy the UGC example values into `.env`:

```bash
cat .env.ugc.example
```

Required:

```env
COMFYUI_BASE_URL=http://localhost:8188
COMFYUI_WAN_WORKFLOW_PATH=workflows/ugc-wan-video-api.json
COMFYUI_FLUX_WORKFLOW_PATH=workflows/ugc-flux-image-api.json
UGC_VIDEO_PROVIDER=wan
UGC_IMAGE_PROVIDER=flux
```

## Workflow export

In ComfyUI:

1. Build and test the Wan video workflow.
2. Put `{{PROMPT}}` in the positive prompt node.
3. Put `{{NEGATIVE_PROMPT}}` in the negative prompt node.
4. Use `{{WIDTH}}`, `{{HEIGHT}}`, `{{DURATION}}`, and `{{SEED}}` where the workflow supports them.
5. Export using **Save (API Format)**.
6. Save it as `workflows/ugc-wan-video-api.json`.
7. Repeat for Flux and save it as `workflows/ugc-flux-image-api.json`.

## Validation

Check server and config only:

```bash
npm run ugc:check
```

Run image workflow:

```bash
npm run ugc:check -- --image
```

Run video workflow:

```bash
npm run ugc:check -- --video
```

Run both:

```bash
npm run ugc:check -- --image --video
```

## End-to-end flow

Start the backend and worker:

```bash
npm run start:backend
npm run start:worker
```

Then create a UGC campaign with:

```txt
videosCount = 3
imagesCount = 2
videoProvider = wan
```

When launched, the backend enqueues:

```txt
3 jobs in UGCVideoPipelineQueue
2 jobs in UGCImageGenerationQueue
```

Each job receives a different creative angle and prompt, then stores the
generated output as `UGCVideoAsset`.
