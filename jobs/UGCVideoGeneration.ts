/**
 * Job: UGCVideoGeneration (LEGACY WRAPPER)
 *
 * Mantiene retrocompatibilidad con el flujo del PR #1 que solo invocaba
 * un adapter de video. A partir del PR #2, la generación real vive en
 * UGCPipelineRun.ts, que orquesta los 4 slots según UGCCampaign.pipelineMode.
 *
 * Este wrapper:
 *   - Si la campaña tiene pipelineMode='image-then-video' (default) y solo
 *     videoModelKey configurado, sigue funcionando como antes — UGCPipelineRun
 *     ejecuta paso 1 (imagen) → paso 2 (video).
 *   - Si pipelineMode incluye voz/lipsync, también ejecuta esos pasos.
 *   - Mantiene la firma original del Bull job para no romper queue consumers.
 *
 * Nota: la imagen del personaje se puede pre-cargar vía
 * job.data.characterImageUrl (compatible con submit antiguos del PR #1
 * que generaban la imagen antes del job de video).
 */

import { Job } from "bull";
import handlePipelineRun, {
  type UGCPipelineRunJobData
} from "./UGCPipelineRun";
import logger from "../utils/logger";

interface UGCVideoGenerationJobData {
  companyId: number;
  campaignId: number;
  videoJobId: number;
  agentIdentityId: number;
  scriptData: {
    hook: string;
    body: string;
    cta: string;
    fullScript: string;
  };
  platform?: string;
  videoStyle?: string;
  characterImageUrl?: string;
  audioReferenceUrl?: string;
}

const handle = async (job: Job<UGCVideoGenerationJobData>): Promise<void> => {
  logger.info(
    `[UGCVideoGeneration] (legacy wrapper) delegando a UGCPipelineRun ` +
      `campaign=${job.data.campaignId} videoJob=${job.data.videoJobId}`
  );

  // El Bull job de UGCPipelineRun acepta el mismo shape (con campos extra
  // opcionales). El cast es seguro porque los campos nuevos son optional.
  await handlePipelineRun(job as unknown as Job<UGCPipelineRunJobData>);
};

export default handle;
