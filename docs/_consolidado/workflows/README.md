# UGC ComfyUI Workflows

Put the exported ComfyUI API workflow files here:

```txt
workflows/ugc-wan-video-api.json
workflows/ugc-flux-image-api.json
```

Important:

- Use ComfyUI's **Save (API Format)** option.
- The files must be the API prompt JSON accepted by `POST /prompt`.
- The backend replaces these placeholders anywhere in the JSON:

```txt
{{PROMPT}}
{{NEGATIVE_PROMPT}}
{{WIDTH}}
{{HEIGHT}}
{{DURATION}}
{{SEED}}
```

Minimum workflow behavior:

- Wan workflow: must produce a video file output, for example `.mp4` or `.webm`.
- Flux workflow: must produce an image file output, for example `.png`, `.jpg`, or `.webp`.

After adding both files, run:

```bash
npm run ugc:check
```

To also execute the workflows:

```bash
npm run ugc:check -- --image --video
```
