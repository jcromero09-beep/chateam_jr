import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import logger from "../../utils/logger";

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface DatasetOptions {
  limit?: number;
  minMessages?: number;
  onlyResolved?: boolean;
}

interface KBOptions {
  documentIds?: number[];
  limit?: number;
}

interface DatasetResult {
  data: string;
  samples: number;
  estimatedTokens: number;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  samples: number;
  estimatedTokens: number;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface TrainingSample {
  messages: ChatMessage[];
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

/**
 * Rough token count estimation (1 token ~ 4 chars for English/Spanish mix)
 */
const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4);
};

// -------------------------------------------------------
// Service Functions
// -------------------------------------------------------

/**
 * Prepare a fine-tuning dataset from resolved support tickets.
 * Each ticket becomes a training sample with the conversation formatted
 * as a chat completion (system + user + assistant messages).
 */
const prepareFromTickets = async (
  companyId: number,
  options: DatasetOptions = {}
): Promise<DatasetResult> => {
  const {
    limit = 500,
    minMessages = 4,
    onlyResolved = true
  } = options;

  try {
    // 1. Find eligible tickets
    const statusFilter = onlyResolved
      ? `AND t.status = 'closed'`
      : `AND t.status IN ('closed', 'open')`;

    const tickets = await sequelize.query<Record<string, unknown>>(`
      SELECT t.id, t.status,
        COUNT(m.id) as "messageCount"
      FROM "Tickets" t
      INNER JOIN "Messages" m ON m."ticketId" = t.id
        AND m.body IS NOT NULL
        AND m.body != ''
        AND m."isDeleted" = false
      WHERE t."companyId" = :companyId
        ${statusFilter}
      GROUP BY t.id
      HAVING COUNT(m.id) >= :minMessages
      ORDER BY t."updatedAt" DESC
      LIMIT :limit
    `, {
      replacements: { companyId, minMessages, limit },
      type: QueryTypes.SELECT
    });

    if (tickets.length === 0) {
      logger.info(`[FineTuning:Dataset] No eligible tickets found for company ${companyId}`);
      return { data: "", samples: 0, estimatedTokens: 0 };
    }

    const ticketIds = tickets.map((t) => t.id as number);

    // 2. Fetch all messages for these tickets in one query
    const messages = await sequelize.query<Record<string, unknown>>(`
      SELECT m."ticketId", m.body, m."fromMe", m."createdAt",
        c.name as "contactName"
      FROM "Messages" m
      LEFT JOIN "Contacts" c ON c.id = m."contactId"
      WHERE m."ticketId" IN (:ticketIds)
        AND m.body IS NOT NULL
        AND m.body != ''
        AND m."isDeleted" = false
      ORDER BY m."ticketId" ASC, m."createdAt" ASC
    `, {
      replacements: { ticketIds },
      type: QueryTypes.SELECT
    });

    // 3. Group messages by ticket
    const ticketMessages = new Map<number, Array<Record<string, unknown>>>();
    for (const msg of messages) {
      const tid = msg.ticketId as number;
      if (!ticketMessages.has(tid)) {
        ticketMessages.set(tid, []);
      }
      ticketMessages.get(tid)!.push(msg);
    }

    // 4. Convert each ticket conversation to a training sample
    const samples: TrainingSample[] = [];

    for (const [, msgs] of ticketMessages) {
      const chatMessages: ChatMessage[] = [
        {
          role: "system",
          content: "Eres un agente de soporte al cliente profesional y amable. Responde de forma clara, concisa y util."
        }
      ];

      for (const msg of msgs) {
        const fromMe = msg.fromMe as boolean;
        const body = (msg.body as string).trim();

        if (!body) continue;

        // Cap individual message length to avoid excessively long samples
        const truncatedBody = body.length > 2000 ? body.substring(0, 2000) + "..." : body;

        chatMessages.push({
          role: fromMe ? "assistant" : "user",
          content: truncatedBody
        });
      }

      // Only include if we have at least system + user + assistant
      const hasUser = chatMessages.some((m) => m.role === "user");
      const hasAssistant = chatMessages.some((m) => m.role === "assistant");

      if (hasUser && hasAssistant) {
        samples.push({ messages: chatMessages });
      }
    }

    // 5. Convert to JSONL
    const jsonlLines = samples.map((s) => JSON.stringify(s));
    const jsonlData = jsonlLines.join("\n");

    const result: DatasetResult = {
      data: jsonlData,
      samples: samples.length,
      estimatedTokens: estimateTokens(jsonlData)
    };

    logger.info(
      `[FineTuning:Dataset] Prepared ${result.samples} samples from tickets for company ${companyId} (~${result.estimatedTokens} tokens)`
    );

    return result;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[FineTuning:Dataset] Error preparing ticket dataset: ${errMsg}`);
    throw error;
  }
};

/**
 * Prepare a fine-tuning dataset from Knowledge Base chunks (AIChunks).
 * Each chunk is formatted as a Q&A pair where the question is generated
 * from the chunk topic/keywords and the answer is the chunk content.
 */
const prepareFromKB = async (
  companyId: number,
  options: KBOptions = {}
): Promise<DatasetResult> => {
  const { documentIds, limit = 500 } = options;

  try {
    let whereClause = `WHERE c."companyId" = :companyId AND c.content IS NOT NULL AND c.content != ''`;
    const replacements: Record<string, unknown> = { companyId, limit };

    if (documentIds && documentIds.length > 0) {
      whereClause += ` AND c."documentId" IN (:documentIds)`;
      replacements.documentIds = documentIds;
    }

    const chunks = await sequelize.query<Record<string, unknown>>(`
      SELECT c.id, c.content, c.topic, c.keywords, c."tokenCount",
        d.title as "documentTitle"
      FROM "AIChunks" c
      LEFT JOIN "AIDocuments" d ON d.id = c."documentId"
      ${whereClause}
      ORDER BY c.id ASC
      LIMIT :limit
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    if (chunks.length === 0) {
      logger.info(`[FineTuning:Dataset] No KB chunks found for company ${companyId}`);
      return { data: "", samples: 0, estimatedTokens: 0 };
    }

    // Convert each chunk to a Q&A training sample
    const samples: TrainingSample[] = [];

    for (const chunk of chunks) {
      const content = (chunk.content as string).trim();
      if (!content || content.length < 50) continue;

      const topic = (chunk.topic as string) || "";
      const keywords = (chunk.keywords as string[]) || [];
      const docTitle = (chunk.documentTitle as string) || "";

      // Build a natural question from available metadata
      let question: string;
      if (topic) {
        question = `Que informacion tienes sobre ${topic}?`;
      } else if (keywords.length > 0) {
        question = `Explicame sobre ${keywords.slice(0, 3).join(", ")}.`;
      } else if (docTitle) {
        question = `Que dice el documento "${docTitle}" sobre este tema?`;
      } else {
        question = "Puedes darme informacion sobre este tema?";
      }

      const sample: TrainingSample = {
        messages: [
          {
            role: "system",
            content: "Eres un asistente experto que responde preguntas usando la base de conocimiento de la empresa. Responde de forma precisa y detallada."
          },
          {
            role: "user",
            content: question
          },
          {
            role: "assistant",
            content: content.length > 3000 ? content.substring(0, 3000) + "..." : content
          }
        ]
      };

      samples.push(sample);
    }

    const jsonlLines = samples.map((s) => JSON.stringify(s));
    const jsonlData = jsonlLines.join("\n");

    const result: DatasetResult = {
      data: jsonlData,
      samples: samples.length,
      estimatedTokens: estimateTokens(jsonlData)
    };

    logger.info(
      `[FineTuning:Dataset] Prepared ${result.samples} samples from KB for company ${companyId} (~${result.estimatedTokens} tokens)`
    );

    return result;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[FineTuning:Dataset] Error preparing KB dataset: ${errMsg}`);
    throw error;
  }
};

/**
 * Validate a JSONL dataset for fine-tuning compatibility.
 * Checks:
 * - Each line is valid JSON
 * - Each object has a "messages" array
 * - Each message has "role" and "content" fields
 * - Minimum 10 samples required
 */
const validateDataset = (jsonlData: string): ValidationResult => {
  const errors: string[] = [];
  let totalTokens = 0;

  if (!jsonlData || jsonlData.trim().length === 0) {
    return {
      valid: false,
      errors: ["El dataset esta vacio"],
      samples: 0,
      estimatedTokens: 0
    };
  }

  const lines = jsonlData.trim().split("\n");

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i].trim();

    if (!line) {
      errors.push(`Linea ${lineNum}: linea vacia`);
      continue;
    }

    // Parse JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch {
      errors.push(`Linea ${lineNum}: JSON invalido`);
      continue;
    }

    // Check messages array
    if (!parsed.messages || !Array.isArray(parsed.messages)) {
      errors.push(`Linea ${lineNum}: falta el campo "messages" o no es un array`);
      continue;
    }

    const msgs = parsed.messages as Array<Record<string, unknown>>;

    if (msgs.length < 2) {
      errors.push(`Linea ${lineNum}: se requieren al menos 2 mensajes (user + assistant)`);
      continue;
    }

    // Validate each message
    for (let j = 0; j < msgs.length; j++) {
      const msg = msgs[j];
      if (!msg.role || typeof msg.role !== "string") {
        errors.push(`Linea ${lineNum}, mensaje ${j + 1}: falta "role" o no es string`);
      } else if (!["system", "user", "assistant"].includes(msg.role)) {
        errors.push(`Linea ${lineNum}, mensaje ${j + 1}: role invalido "${msg.role}"`);
      }

      if (!msg.content || typeof msg.content !== "string") {
        errors.push(`Linea ${lineNum}, mensaje ${j + 1}: falta "content" o no es string`);
      }
    }

    // Check for at least one assistant message
    const hasAssistant = msgs.some((m) => m.role === "assistant");
    if (!hasAssistant) {
      errors.push(`Linea ${lineNum}: se requiere al menos un mensaje con role "assistant"`);
    }

    totalTokens += estimateTokens(line);
  }

  // Minimum samples check
  const validSamples = lines.filter((l) => l.trim().length > 0).length;
  if (validSamples < 10) {
    errors.push(`Se requieren al menos 10 muestras, solo se encontraron ${validSamples}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    samples: validSamples,
    estimatedTokens: totalTokens
  };
};

export default {
  prepareFromTickets,
  prepareFromKB,
  validateDataset
};
