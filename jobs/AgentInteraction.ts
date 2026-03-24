/**
 * Job: AgentInteraction
 * Procesa una interaccion del agente en el dispositivo fisico.
 *
 * Flujo:
 * 1. Valida anti-ban (dailyActionCount < dailyActionLimit)
 * 2. Marca interaccion como 'executing'
 * 3. Simula envio al dispositivo (placeholder)
 * 4. Marca como 'completed' y actualiza dailyActionCount del device
 *
 * Si falla: marca como 'failed' con la razon.
 */

import { Job } from "bull";
import AgentInteractionModel from "../models/AgentInteraction";
import AgentDevice from "../models/AgentDevice";
import logger from "../utils/logger";

interface AgentInteractionJobData {
  companyId: number;
  interactionId: number;
  agentIdentityId: number;
  type: string;
  content: string;
  targetPostId?: string;
}

const handle = async (
  job: Job<AgentInteractionJobData>
): Promise<{ interactionId: number; status: string }> => {
  const { companyId, interactionId, agentIdentityId, type, content, targetPostId } = job.data;

  logger.info(
    `[AgentInteraction] Procesando interaccion: id=${interactionId}, ` +
    `type=${type}, agent=${agentIdentityId}, company=${companyId}`
  );

  // 1. Cargar interaccion
  const interaction = await AgentInteractionModel.findOne({
    where: { id: interactionId, companyId }
  });

  if (!interaction) {
    logger.error(`[AgentInteraction] Interaccion no encontrada: ${interactionId}`);
    throw new Error(`Interaccion ${interactionId} no encontrada`);
  }

  if (interaction.executionStatus === "completed") {
    logger.warn(`[AgentInteraction] Interaccion ${interactionId} ya completada, omitiendo`);
    return { interactionId, status: "already_completed" };
  }

  try {
    // 2. Buscar dispositivo asignado al agente
    const device = await AgentDevice.findOne({
      where: { assignedIdentityId: agentIdentityId, companyId }
    });

    // 3. Validar anti-ban
    if (device) {
      if (device.isBanned()) {
        await interaction.markAsFailed("Dispositivo baneado");
        logger.warn(
          `[AgentInteraction] Dispositivo baneado para agente ${agentIdentityId}`
        );
        return { interactionId, status: "device_banned" };
      }

      if (device.dailyActionCount >= device.dailyActionLimit) {
        await interaction.markAsFailed("Limite diario de acciones alcanzado");
        logger.warn(
          `[AgentInteraction] Limite diario alcanzado: device=${device.id}, ` +
          `acciones=${device.dailyActionCount}/${device.dailyActionLimit}`
        );
        return { interactionId, status: "daily_limit_reached" };
      }
    }

    // 4. Marcar como ejecutando
    await interaction.markAsExecuting();

    if (device) {
      await interaction.update({ agentDeviceId: device.id });
    }

    // 5. Simular envio al dispositivo (placeholder)
    // En produccion esto enviaria el comando via WebSocket/ADB bridge
    logger.info(
      `[AgentInteraction] Simulando ejecucion: type=${type}, ` +
      `content="${content.substring(0, 100)}...", ` +
      `targetPost=${targetPostId || "N/A"}`
    );

    // Simular tiempo de ejecucion (entre 2-5 segundos)
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));

    // 6. Marcar como completada
    await interaction.markAsCompleted();

    // 7. Actualizar dailyActionCount del dispositivo
    if (device) {
      await device.incrementActionCount();
    }

    logger.info(
      `[AgentInteraction] Interaccion completada: id=${interactionId}, ` +
      `type=${type}, agent=${agentIdentityId}`
    );

    return { interactionId, status: "completed" };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Marcar como fallida
    try {
      await interaction.markAsFailed(errorMessage);
    } catch (updateErr: unknown) {
      const updateMsg = updateErr instanceof Error ? updateErr.message : String(updateErr);
      logger.error(
        `[AgentInteraction] Error actualizando estado a failed: ${updateMsg}`
      );
    }

    logger.error(
      `[AgentInteraction] Error procesando interaccion ${interactionId}: ${errorMessage}`
    );
    throw error;
  }
};

export default handle;
