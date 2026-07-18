import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import WanProvider from "../services/UGCProviders/WanProvider";
import FluxProvider from "../services/UGCProviders/FluxProvider";

const args = new Set(process.argv.slice(2));
const shouldRunImage = args.has("--image");
const shouldRunVideo = args.has("--video");

const comfyUrl = (process.env.COMFYUI_BASE_URL || "http://localhost:8188").replace(/\/$/, "");
const wanWorkflowPath = process.env.COMFYUI_WAN_WORKFLOW_PATH || "";
const fluxWorkflowPath = process.env.COMFYUI_FLUX_WORKFLOW_PATH || "";

function resolveMaybeRelative(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function checkWorkflow(label: string, filePath: string): void {
  if (!filePath) {
    throw new Error(`${label} workflow env var is missing`);
  }

  const resolved = resolveMaybeRelative(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`${label} workflow file not found: ${resolved}`);
  }

  JSON.parse(fs.readFileSync(resolved, "utf8"));
  console.log(`OK ${label} workflow: ${resolved}`);
}

async function checkComfyUI(): Promise<void> {
  const response = await axios.get(`${comfyUrl}/system_stats`, { timeout: 5000 });
  const devices = response.data?.devices || [];
  console.log(`OK ComfyUI reachable: ${comfyUrl}`);

  if (devices.length) {
    for (const device of devices) {
      console.log(`OK device: ${device.name || "unknown"} vram=${device.vram_total || "unknown"}`);
    }
  }
}

async function runImageSmoke(): Promise<void> {
  const result = await FluxProvider.generateImage({
    prompt:
      "realistic UGC product photo, smartphone content, natural light, clean background, social media ad image",
    negativePrompt: "blurry, low quality, watermark, distorted text",
    aspectRatio: "1:1"
  });

  console.log(`OK Flux image output: ${result.imageUrl}`);
}

async function runVideoSmoke(): Promise<void> {
  const result = await WanProvider.generateVideo({
    prompt:
      "realistic vertical UGC video, person demonstrating a product on camera, natural light, handheld smartphone style",
    negativePrompt: "blurry, low quality, watermark, distorted hands, uncanny",
    aspectRatio: "9:16",
    duration: 5
  });

  console.log(`OK Wan video output: ${result.videoUrl}`);
}

async function main(): Promise<void> {
  console.log("Checking UGC ComfyUI setup...");

  await checkComfyUI();
  checkWorkflow("Wan", wanWorkflowPath);
  checkWorkflow("Flux", fluxWorkflowPath);

  if (shouldRunImage) {
    await runImageSmoke();
  }

  if (shouldRunVideo) {
    await runVideoSmoke();
  }

  if (!shouldRunImage && !shouldRunVideo) {
    console.log("OK config check complete. Add --image and/or --video to run generation smoke tests.");
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`UGC ComfyUI validation failed: ${message}`);
  process.exit(1);
});
