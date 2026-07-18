import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Job: AgentIdentityGen
 * Procesa la generacion completa de una identidad de agente UGC en background.
 *
 * Pipeline de 3 pasos:
 * 1. Generar personalidad con OpenAI GPT-4o (GenerateIdentityService)
 * 2. Generar fotos de perfil con DALL-E 3 (GenerateProfilePhotoService)
 * 3. Generar contenido semilla — 10 posts ficticios (GenerateSeedContentService)
 *
 * Si falla: la identidad queda en status 'draft' para reintento manual.
 * Emite notificacion Socket.IO al completar o fallar.
 */

import { Job } from "bull";
import GenerateIdentityService from "../services/AgentIdentityServices/GenerateIdentityService";
import GenerateProfilePhotoService from "../services/AgentIdentityServices/GenerateProfilePhotoService";
import GenerateSeedContentService from "../services/AgentIdentityServices/GenerateSeedContentService";
import logger from "../utils/logger";

interface AgentIdentityGenJobData {
  companyId: number;
  userId: number;
  niche: string;
  gender: string;
  ageRange: string;
  country?: string;
  platformFocus?: string[];
  style?: string;
  identityId?: number;
}

const handle = async (job: Job<AgentIdentityGenJobData>): Promise<{ identityId: number; status: string }> => {
  const { companyId, userId, niche, gender, ageRange, country, platformFocus, style } = job.data;

  logger.info(
    `[AgentIdentityGen] Iniciando generacion de identidad: ` +
    `company=${companyId}, nicho=${niche}, genero=${gender}, edad=${ageRange}`
  );

  try {
    // Step 1: Generar personalidad con GPT-4o
    logger.info(`[AgentIdentityGen] Step 1/3: Generando personalidad...`);
    const identity = await GenerateIdentityService({
      companyId,
      userId,
      niche,
      gender,
      ageRange,
      country,
      platformFocus,
      style
    });

    logger.info(
      `[AgentIdentityGen] Step 1/3 completado: identity=${identity.id}, nombre=${identity.name}`
    );

    // Step 2: Generar fotos de perfil con DALL-E 3
    logger.info(`[AgentIdentityGen] Step 2/3: Generando fotos de perfil...`);
    try {
      await GenerateProfilePhotoService({
        agentIdentityId: identity.id,
        companyId,
        userId
      });
      logger.info(`[AgentIdentityGen] Step 2/3 completado: fotos generadas`);
    } catch (photoError: unknown) {
      const photoMsg = photoError instanceof Error ? photoError.message : String(photoError);
      logger.warn(
        `[AgentIdentityGen] Step 2/3 fallo parcial (no critico): ${photoMsg}`
      );
      // No relanzar — la identidad puede existir sin foto
    }

    // Step 3: Generar contenido semilla (10 posts ficticios)
    logger.info(`[AgentIdentityGen] Step 3/3: Generando contenido semilla...`);
    try {
      await GenerateSeedContentService({
        agentIdentityId: identity.id,
        companyId,
        userId
      });
      logger.info(`[AgentIdentityGen] Step 3/3 completado: contenido semilla generado`);
    } catch (seedError: unknown) {
      const seedMsg = seedError instanceof Error ? seedError.message : String(seedError);
      logger.warn(
        `[AgentIdentityGen] Step 3/3 fallo parcial (no critico): ${seedMsg}`
      );
      // No relanzar — la identidad puede existir sin contenido semilla
    }

    // Asegurar status 'active' (GenerateIdentityService ya lo hace, pero por seguridad)
    if (identity.status !== "active") {
      await identity.update({ status: "active" });
    }

    // Notificar via Socket.IO (usando notificationQueue si esta disponible)
    try {
      const { notificationQueue } = require("../queues");
      if (notificationQueue) {
        await notificationQueue.add("Notification", {
          type: "agent-identity:generated",
          companyId,
          data: {
            identityId: identity.id,
            name: identity.name,
            niche: identity.niche,
            status: "active"
          }
        });
      }
    } catch (notifError: unknown) {
      const notifMsg = notifError instanceof Error ? notifError.message : String(notifError);
      logger.warn(`[AgentIdentityGen] No se pudo enviar notificacion: ${notifMsg}`);
    }

    logger.info(
      `[AgentIdentityGen] Identidad ${identity.id} (${identity.name}) generada exitosamente para company=${companyId}`
    );

    return { identityId: identity.id, status: "active" };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AgentIdentityGen] Error generando identidad: ${errorMessage}`);

    // Notificar fallo via Socket.IO
    try {
      const { notificationQueue } = require("../queues");
      if (notificationQueue) {
        await notificationQueue.add("Notification", {
          type: "agent-identity:failed",
          companyId,
          data: {
            niche,
            errorMessage
          }
        });
      }
    } catch (notifError: unknown) {
      // Silenciar — no es critico
    }

    // Re-throw para que Bull registre el fallo y aplique retry
    throw error;
  }
};

export default handle;
