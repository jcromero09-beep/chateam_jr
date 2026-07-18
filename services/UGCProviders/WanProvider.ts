/**
 * WanProvider — video generation through ComfyUI.
 */

import ComfyUIProvider from "./ComfyUIProvider";

interface WanVideoRequest {
  prompt: string;
  negativePrompt?: string;
  duration?: number;
  aspectRatio?: string;
  width?: number;
  height?: number;
  seed?: number;
  companyId?: number;
}

interface WanVideoResponse {
  taskId: string;
  status: "completed";
  videoUrl: string;
  fileName: string;
  mimeType: string;
}

function dimensionsForAspectRatio(aspectRatio = "9:16"): { width: number; height: number } {
  if (aspectRatio === "16:9") return { width: 1280, height: 720 };
  if (aspectRatio === "1:1") return { width: 1024, height: 1024 };
  return { width: 720, height: 1280 };
}

async function generateVideo(params: WanVideoRequest): Promise<WanVideoResponse> {
  const workflowPath = process.env.COMFYUI_WAN_WORKFLOW_PATH;
  if (!workflowPath) {
    throw new Error("COMFYUI_WAN_WORKFLOW_PATH is required for WanProvider");
  }

  const dimensions = dimensionsForAspectRatio(params.aspectRatio);
  const result = await ComfyUIProvider.runWorkflow({
    workflowPath,
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    width: params.width || dimensions.width,
    height: params.height || dimensions.height,
    duration: params.duration || 5,
    seed: params.seed
  });

  const output = result.outputs.find(item => item.type === "video") || result.outputs[0];

  return {
    taskId: result.promptId,
    status: "completed",
    videoUrl: output.url,
    fileName: output.fileName,
    mimeType: output.mimeType
  };
}

export { generateVideo };
export type { WanVideoRequest, WanVideoResponse };
export default { generateVideo };
