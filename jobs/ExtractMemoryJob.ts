/**
 * Job: ExtractMemoryJob
 * Extrae memorias de una conversación al cerrar un ticket.
 *
 * Flujo:
 * 1. Se encola cuando un ticket cambia a estado "closed"
 * 2. Analiza la conversación completa del ticket
 * 3. Llama al LLM para extraer max 5 memorias:
 *    preferences, facts, objections, interests, decisions
 * 4. Guarda en contact_memory con embedding vectorial
 *
 * Es no-crítico — si falla, no afecta el cierre del ticket.
 */

import { Job } from "bull";
import ContactMemoryService from "../services/AIAgentServices/ContactMemoryService";
import logger from "../utils/logger";

interface ExtractMemoryJobData {
  ticketId: number;
  companyId: number;
  closedAt: Date;
}

const handle = async (
  job: Job<ExtractMemoryJobData>
): Promise<{ ticketId: number; memoriesExtracted: number }> => {
  const { ticketId, companyId } = job.data;

  logger.info(`[ExtractMemory] Extrayendo memorias: ticket=${ticketId}, company=${companyId}`);

  try {
    const memoriesExtracted = await ContactMemoryService.extractFromTicket(
      ticketId,
      companyId
    );

    logger.info(
      `[ExtractMemory] Completado: ticket=${ticketId}, memorias=${memoriesExtracted}`
    );

    return { ticketId, memoriesExtracted };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[ExtractMemory] Error: ${msg}`);
    // No lanzar — job no-crítico
    return { ticketId, memoriesExtracted: 0 };
  }
};

export default handle;
