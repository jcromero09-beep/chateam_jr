/**
 * ComfyUIProvider
 * Thin HTTP client for ComfyUI running in API/headless mode.
 * Workflows are JSON files with placeholders such as {{PROMPT}},
 * {{NEGATIVE_PROMPT}}, {{WIDTH}}, {{HEIGHT}}, {{DURATION}} and {{SEED}}.
 */

import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import logger from "../../utils/logger";

interface RunWorkflowParams {
  workflowPath: string;
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  duration?: number;
  seed?: number;
  timeoutMs?: number;
}

interface ComfyOutput {
  url: string;
  fileName: string;
  mimeType: string;
  type: "image" | "video" | "unknown";
}

interface RunWorkflowResponse {
  promptId: string;
  outputs: ComfyOutput[];
}

const COMFYUI_BASE_URL = (process.env.COMFYUI_BASE_URL || "http://localhost:8188").replace(/\/$/, "");
const DEFAULT_TIMEOUT_MS = Number(process.env.COMFYUI_TIMEOUT_MS || 20 * 60 * 1000);
const POLL_INTERVAL_MS = Number(process.env.COMFYUI_POLL_INTERVAL_MS || 3000);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadWorkflow(workflowPath: string): unknown {
  const resolvedPath = path.isAbsolute(workflowPath)
    ? workflowPath
    : path.resolve(process.cwd(), workflowPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`COMFYUI_WORKFLOW_NOT_FOUND: ${resolvedPath}`);
  }

  return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
}

function replacePlaceholders(value: unknown, replacements: Record<string, string | number>): unknown {
  if (typeof value === "string") {
    return Object.entries(replacements).reduce((current, [key, replacement]) => {
      return current.replaceAll(`{{${key}}}`, String(replacement));
    }, value);
  }

  if (Array.isArray(value)) {
    return value.map(item => replacePlaceholders(item, replacements));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replacePlaceholders(item, replacements)])
    );
  }

  return value;
}

function inferMimeType(fileName: string): { mimeType: string; type: ComfyOutput["type"] } {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".mp4")) return { mimeType: "video/mp4", type: "video" };
  if (lower.endsWith(".webm")) return { mimeType: "video/webm", type: "video" };
  if (lower.endsWith(".mov")) return { mimeType: "video/quicktime", type: "video" };
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return { mimeType: "image/jpeg", type: "image" };
  if (lower.endsWith(".png")) return { mimeType: "image/png", type: "image" };
  if (lower.endsWith(".webp")) return { mimeType: "image/webp", type: "image" };

  return { mimeType: "application/octet-stream", type: "unknown" };
}

function collectOutputs(history: Record<string, unknown>): ComfyOutput[] {
  const outputs: ComfyOutput[] = [];
  const nodes = Object.values((history.outputs || {}) as Record<string, Record<string, unknown>>);

  for (const node of nodes) {
    const files = [
      ...((node.images || []) as Record<string, string>[]),
      ...((node.gifs || []) as Record<string, string>[]),
      ...((node.videos || []) as Record<string, string>[])
    ];

    for (const file of files) {
      const fileName = file.filename;
      if (!fileName) continue;

      const subfolder = file.subfolder || "";
      const fileType = file.type || "output";
      const { mimeType, type } = inferMimeType(fileName);
      const url =
        `${COMFYUI_BASE_URL}/view?filename=${encodeURIComponent(fileName)}` +
        `&subfolder=${encodeURIComponent(subfolder)}` +
        `&type=${encodeURIComponent(fileType)}`;

      outputs.push({ url, fileName, mimeType, type });
    }
  }

  return outputs;
}

async function waitForHistory(promptId: string, timeoutMs: number): Promise<Record<string, unknown>> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const response = await axios.get(`${COMFYUI_BASE_URL}/history/${promptId}`, {
      timeout: 15_000
    });

    const history = response.data?.[promptId];
    if (history?.outputs) {
      return history;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`COMFYUI_TIMEOUT: promptId=${promptId}`);
}

async function runWorkflow(params: RunWorkflowParams): Promise<RunWorkflowResponse> {
  const seed = params.seed || Math.floor(Math.random() * 1_000_000_000);
  const workflow = replacePlaceholders(loadWorkflow(params.workflowPath), {
    PROMPT: params.prompt,
    NEGATIVE_PROMPT: params.negativePrompt || "",
    WIDTH: params.width || 1024,
    HEIGHT: params.height || 1024,
    DURATION: params.duration || 5,
    SEED: seed
  });

  logger.info(`[ComfyUIProvider] Enviando workflow=${params.workflowPath} seed=${seed}`);

  const submit = await axios.post(
    `${COMFYUI_BASE_URL}/prompt`,
    { prompt: workflow },
    { timeout: 30_000 }
  );

  const promptId = submit.data?.prompt_id;
  if (!promptId) {
    throw new Error("COMFYUI_PROMPT_ID_MISSING");
  }

  const history = await waitForHistory(promptId, params.timeoutMs || DEFAULT_TIMEOUT_MS);
  const outputs = collectOutputs(history);

  if (!outputs.length) {
    throw new Error(`COMFYUI_EMPTY_OUTPUT: promptId=${promptId}`);
  }

  return { promptId, outputs };
}

export type { ComfyOutput, RunWorkflowParams, RunWorkflowResponse };
export default { runWorkflow };
