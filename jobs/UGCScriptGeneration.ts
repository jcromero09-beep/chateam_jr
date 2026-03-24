/**
 * Job: UGCScriptGeneration
 * Placeholder para la generacion de scripts UGC con IA.
 *
 * Este job sera implementado en Phase 1 del Video Pipeline.
 * Procesara:
 * - Generacion de guiones para videos UGC basados en product briefs
 * - Adaptacion del script a la personalidad del agente
 * - Estructura: hook + problema + solucion + CTA
 *
 * Cola: UGCScriptGenerationQueue (concurrency: 5, attempts: 3)
 */

import { Job } from "bull";
import logger from "../utils/logger";

interface UGCScriptGenerationJobData {
  companyId: number;
  campaignId: number;
  videoJobId: number;
  agentIdentityId: number;
  productBrief: string;
  platform?: string;
  duration?: number;
}

const handle = async (job: Job<UGCScriptGenerationJobData>): Promise<void> => {
  const { companyId, campaignId, videoJobId } = job.data;

  logger.info(
    `[UGCScriptGeneration] Procesando job para campaign=${campaignId}, ` +
    `videoJob=${videoJobId}, company=${companyId}`
  );

  // TODO Phase 1 — Video Pipeline
  // 1. Cargar identidad del agente (personalidad, estilo de comunicacion)
  // 2. Generar guion con GPT-4o adaptado a la personalidad
  // 3. Estructurar: hook (3s) + problema (5s) + solucion (10s) + CTA (5s)
  // 4. Guardar script en UGCVideoJob
  // 5. Encolar generacion de video (UGCVideoGenerationQueue)

  throw new Error(
    `UGC Script Generation no implementado aun. ` +
    `Campaign=${campaignId}, VideoJob=${videoJobId}`
  );
};

export default handle;
