/**
 * Job: EmailAutomation
 * Worker que procesa automatizaciones de email marketing.
 *
 * Recibe { automationId, contactId, companyId } desde BullMQ.
 * Ejecuta AutomationEngineService.executeAutomation() para enviar
 * el email correspondiente al contacto.
 */

import { Job } from "bull";
import logger from "../utils/logger";

interface EmailAutomationJobData {
  automationId: number;
  contactId: number;
  companyId: number;
}

const handle = async (job: Job<EmailAutomationJobData>): Promise<{ automationId: number; contactId: number; success: boolean }> => {
  const { automationId, contactId, companyId } = job.data;

  logger.info(
    `[EmailAutomation] Procesando automatizacion: ` +
    `automationId=${automationId}, contactId=${contactId}, company=${companyId}`
  );

  try {
    // Lazy load del servicio para evitar dependencias circulares
    const { executeAutomation } = require("../services/EmailMarketing/AutomationEngineService");

    const success = await executeAutomation(automationId, contactId);

    if (success) {
      logger.info(
        `[EmailAutomation] Automatizacion ejecutada exitosamente: ` +
        `automationId=${automationId}, contactId=${contactId}`
      );
    } else {
      logger.warn(
        `[EmailAutomation] Automatizacion no pudo enviarse: ` +
        `automationId=${automationId}, contactId=${contactId}`
      );
    }

    return { automationId, contactId, success };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(
      `[EmailAutomation] Error procesando automatizacion: ` +
      `automationId=${automationId}, contactId=${contactId}, error=${msg}`
    );
    throw error;
  }
};

export default handle;
