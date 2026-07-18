/**
 * Job: UGCVideoPipeline
 * Runs all stages for a UGC video job until completion.
 */

import { Job } from "bull";
import UGCVideoPipelineService from "../services/UGCVideoServices/UGCVideoPipelineService";
import logger from "../utils/logger";

interface UGCVideoPipelineJobData {
  companyId: number;
  campaignId: number;
  videoJobId: number;
}

const handle = async (job: Job<UGCVideoPipelineJobData>): Promise<void> => {
  const { companyId, campaignId, videoJobId } = job.data;

  logger.info(
    `[UGCVideoPipeline] Ejecutando pipeline campaign=${campaignId}, ` +
    `videoJob=${videoJobId}, company=${companyId}`
  );

  for (let step = 0; step < 8; step++) {
    const result = await UGCVideoPipelineService({ companyId, campaignId, videoJobId });
    if (result.status === "completed" || result.stage === "completed") {
      return;
    }
  }

  throw new Error(`UGC video pipeline did not complete after max steps: videoJob=${videoJobId}`);
};

export default handle;
