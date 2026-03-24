/**
 * Job: AgentMemoryExtract
 * Extrae memorias de una respuesta del agente para mantener coherencia.
 * Ligero, alta concurrencia — usa GPT-4o-mini.
 *
 * Flujo:
 * 1. Recibe responseContent y context
 * 2. Llama AgentMemoryExtractorService
 * 3. Registra resultado
 */

import { Job } from "bull";
import AgentMemoryExtractorService from "../services/AgentEngagementServices/AgentMemoryExtractorService";
import logger from "../utils/logger";

interface AgentMemoryExtractJobData {
  companyId: number;
  agentIdentityId: number;
  responseContent: string;
  context?: string;
}

const handle = async (
  job: Job<AgentMemoryExtractJobData>
): Promise<{ memoriesExtracted: number }> => {
  const { companyId, agentIdentityId, responseContent, context } = job.data;

  logger.info(
    `[AgentMemoryExtract] Extrayendo memorias: agent=${agentIdentityId}, ` +
    `company=${companyId}`
  );

  try {
    const result = await AgentMemoryExtractorService({
      companyId,
      agentIdentityId,
      responseContent,
      context
    });

    logger.info(
      `[AgentMemoryExtract] Memorias extraidas: ${result.memoriesExtracted}, ` +
      `agent=${agentIdentityId}, company=${companyId}`
    );

    return { memoriesExtracted: result.memoriesExtracted };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `[AgentMemoryExtract] Error extrayendo memorias: ${errorMessage}`
    );
    // No re-throw — la extraccion de memorias no es critica
    return { memoriesExtracted: 0 };
  }
};

export default handle;
