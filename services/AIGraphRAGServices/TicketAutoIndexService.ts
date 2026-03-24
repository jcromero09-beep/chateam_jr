import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import logger from "../../utils/logger";

/**
 * Auto-indexes resolved tickets into the Knowledge Base
 * so future queries can benefit from past resolutions
 */

interface IndexResult {
  ticketId: number;
  documentId: number;
  chunksCreated: number;
}

/**
 * Index a resolved ticket into KB
 */
const indexResolvedTicket = async (
  ticketId: number,
  companyId: number
): Promise<IndexResult | null> => {
  try {
    // 1. Get ticket with messages
    const messages = await sequelize.query<Record<string, any>>(`
      SELECT m.body, m."fromMe", m."createdAt",
        c.name as "contactName"
      FROM "Messages" m
      LEFT JOIN "Contacts" c ON c.id = m."contactId"
      WHERE m."ticketId" = :ticketId
        AND m.body IS NOT NULL
        AND m.body != ''
      ORDER BY m."createdAt" ASC
      LIMIT 50
    `, {
      replacements: { ticketId },
      type: QueryTypes.SELECT
    });

    if (messages.length < 2) {
      logger.info(`[TicketAutoIndex] Ticket ${ticketId} has insufficient messages, skipping`);
      return null;
    }

    // 2. Build conversation summary
    const conversation = messages.map((m: any) => {
      const sender = m.fromMe ? 'Agente' : (m.contactName || 'Cliente');
      return `${sender}: ${m.body}`;
    }).join('\n');

    // 3. Generate summary with LLM
    let summary: string;
    try {
      const AIClientService = require("../AIClientService").default;
      const response = await AIClientService.generateText({
        prompt: `Resume esta conversación de soporte en un formato Q&A útil para futuras consultas.
Incluye: problema reportado, pasos de resolución, y solución final.
Máximo 500 palabras.

Conversación:
${conversation.substring(0, 3000)}

Resumen Q&A:`,
        modelKey: 'gpt-4.1-mini',
        maxTokens: 600,
        temperature: 0.3
      });
      summary = response.text;
    } catch (error: any) {
      // Fallback: use raw conversation
      summary = `Ticket #${ticketId} resuelto.\n\n${conversation.substring(0, 1000)}`;
    }

    // 4. Create document in AIDocuments
    const [docResult] = await sequelize.query(`
      INSERT INTO "AIDocuments" (
        "companyId", title, "sourceType", "sourceUrl", status,
        "totalChunks", "totalTokens", metadata, "createdAt", "updatedAt"
      ) VALUES (
        :companyId,
        :title,
        'ticket',
        :sourceUrl,
        'processed',
        1,
        :tokenCount,
        :metadata,
        NOW(), NOW()
      ) RETURNING id
    `, {
      replacements: {
        companyId,
        title: `Ticket #${ticketId} - Resolución`,
        sourceUrl: `/tickets/${ticketId}`,
        tokenCount: Math.ceil(summary.length / 4),
        metadata: JSON.stringify({
          ticketId,
          autoIndexed: true,
          messageCount: messages.length,
          indexedAt: new Date().toISOString()
        })
      }
    });

    const documentId = Array.isArray(docResult) ? (docResult[0] as any)?.id : (docResult as any)?.id;

    // 5. Create chunk (simplified - single chunk for ticket summary)
    await sequelize.query(`
      INSERT INTO "AIChunks" (
        "documentId", "companyId", content, "chunkIndex",
        "tokenCount", metadata, "createdAt", "updatedAt"
      ) VALUES (
        :documentId, :companyId, :content, 0,
        :tokenCount, :metadata, NOW(), NOW()
      )
    `, {
      replacements: {
        documentId,
        companyId,
        content: summary,
        tokenCount: Math.ceil(summary.length / 4),
        metadata: JSON.stringify({ ticketId, type: 'resolution_summary' })
      },
      type: QueryTypes.INSERT
    });

    logger.info(`[TicketAutoIndex] Indexed ticket ${ticketId} → doc ${documentId}, empresa=${companyId}`);

    return { ticketId, documentId, chunksCreated: 1 };
  } catch (error: any) {
    logger.error(`[TicketAutoIndex] Error indexing ticket ${ticketId}: ${error.message}`);
    return null;
  }
};

/**
 * Batch index all unindexed resolved tickets for a company
 */
const batchIndexResolved = async (
  companyId: number,
  limit: number = 50
): Promise<{ indexed: number; skipped: number }> => {
  try {
    // Find resolved tickets not yet indexed
    const tickets = await sequelize.query<Record<string, any>>(`
      SELECT t.id
      FROM "Tickets" t
      WHERE t."companyId" = :companyId
        AND t.status = 'closed'
        AND NOT EXISTS (
          SELECT 1 FROM "AIDocuments" d
          WHERE d."companyId" = :companyId
            AND d."sourceType" = 'ticket'
            AND d.metadata->>'ticketId' = t.id::text
        )
      ORDER BY t."updatedAt" DESC
      LIMIT :limit
    `, {
      replacements: { companyId, limit },
      type: QueryTypes.SELECT
    });

    let indexed = 0;
    let skipped = 0;

    for (const ticket of tickets) {
      const result = await indexResolvedTicket(ticket.id, companyId);
      if (result) indexed++;
      else skipped++;
    }

    logger.info(`[TicketAutoIndex] Batch: indexed=${indexed}, skipped=${skipped}, empresa=${companyId}`);
    return { indexed, skipped };
  } catch (error: any) {
    logger.error(`[TicketAutoIndex] Batch error: ${error.message}`);
    return { indexed: 0, skipped: 0 };
  }
};

export default {
  indexResolvedTicket,
  batchIndexResolved
};
