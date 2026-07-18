/**
 * Job: UGCImageGeneration
 * Generates one UGC image creative for a campaign.
 */

import { Job } from "bull";
import GenerateUGCImageService from "../services/UGCImageServices/GenerateUGCImageService";
import logger from "../utils/logger";

interface UGCImageGenerationJobData {
  companyId: number;
  campaignId: number;
  imageJobId: number;
}

const handle = async (job: Job<UGCImageGenerationJobData>): Promise<void> => {
  const { companyId, campaignId, imageJobId } = job.data;

  logger.info(
    `[UGCImageGeneration] Procesando imagen campaign=${campaignId}, ` +
    `imageJob=${imageJobId}, company=${companyId}`
  );

  await GenerateUGCImageService({ companyId, campaignId, imageJobId });
};

export default handle;
