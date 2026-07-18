/**
 * FluxProvider — image generation through ComfyUI.
 */

import ComfyUIProvider from "./ComfyUIProvider";

interface FluxImageRequest {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
  seed?: number;
  companyId?: number;
}

interface FluxImageResponse {
  taskId: string;
  status: "completed";
  imageUrl: string;
  fileName: string;
  mimeType: string;
}

function dimensionsForAspectRatio(aspectRatio = "1:1"): { width: number; height: number } {
  if (aspectRatio === "9:16") return { width: 1024, height: 1792 };
  if (aspectRatio === "16:9") return { width: 1792, height: 1024 };
  return { width: 1024, height: 1024 };
}

async function generateImage(params: FluxImageRequest): Promise<FluxImageResponse> {
  const workflowPath = process.env.COMFYUI_FLUX_WORKFLOW_PATH;
  if (!workflowPath) {
    throw new Error("COMFYUI_FLUX_WORKFLOW_PATH is required for FluxProvider");
  }

  const dimensions = dimensionsForAspectRatio(params.aspectRatio);
  const result = await ComfyUIProvider.runWorkflow({
    workflowPath,
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    width: params.width || dimensions.width,
    height: params.height || dimensions.height,
    seed: params.seed
  });

  const output = result.outputs.find(item => item.type === "image") || result.outputs[0];

  return {
    taskId: result.promptId,
    status: "completed",
    imageUrl: output.url,
    fileName: output.fileName,
    mimeType: output.mimeType
  };
}

export { generateImage };
export type { FluxImageRequest, FluxImageResponse };
export default { generateImage };
