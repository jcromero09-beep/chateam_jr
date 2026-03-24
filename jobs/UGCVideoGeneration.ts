/**
 * Job: UGCVideoGeneration
 * Placeholder para la generacion de videos UGC con IA.
 *
 * Este job sera implementado en Phase 1 del Video Pipeline.
 * Procesara:
 * - Renderizado de video con avatar del agente + script generado
 * - Integracion con HeyGen / Sora / D-ID para video generation
 * - Post-procesamiento: subtitulos, musica, transiciones
 * - Upload a storage y notificacion al frontend
 *
 * Cola: UGCVideoGenerationQueue (concurrency: 2, attempts: 2)
 */

import { Job } from "bull";
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
}

const handle = async (job: Job<UGCVideoGenerationJobData>): Promise<void> => {
  const { companyId, campaignId, videoJobId } = job.data;

  logger.info(
    `[UGCVideoGeneration] Procesando job para campaign=${campaignId}, ` +
    `videoJob=${videoJobId}, company=${companyId}`
  );

  // TODO Phase 1 — Video Pipeline
  // 1. Cargar script y datos del agente (foto de perfil, estilo)
  // 2. Llamar a HeyGen/Sora API para generar video con avatar
  // 3. Polling hasta que el video este listo
  // 4. Descargar y almacenar video en storage
  // 5. Generar thumbnail
  // 6. Actualizar UGCVideoJob con URL y metadata
  // 7. Notificar al frontend via Socket.IO

  throw new Error(
    `UGC Video Generation no implementado aun. ` +
    `Campaign=${campaignId}, VideoJob=${videoJobId}`
  );
};

export default handle;
