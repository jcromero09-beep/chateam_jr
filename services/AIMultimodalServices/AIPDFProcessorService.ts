import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import logger from "../../utils/logger";
import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import CalculateCreditCostService from "../AICreditServices/CalculateCreditCostService";

export interface PDFProcessingResult {
  text: string;
  pageCount: number;
  wordCount: number;
  summary?: string;
  entities?: Array<{ name: string; type: string }>;
  documentId?: number;
  chunksCreated?: number;
  latencyMs: number;
}

/**
 * Extract text from PDF buffer
 */
const extractText = async (
  pdfBuffer: Buffer,
  options: { maxPages?: number } = {}
): Promise<{ text: string; pageCount: number }> => {
  try {
    const pdfModule = require('pdf-parse');
    const pdfParse = pdfModule.default || pdfModule;

    console.log('[AIPDFProcessor] pdfParse type:', typeof pdfParse, 'Buffer:', pdfBuffer?.length, 'bytes');

    const data = await pdfParse(pdfBuffer, {
      max: options.maxPages || 100
    });

    console.log('[AIPDFProcessor] Pages:', data.numpages, 'Text length:', data.text?.length);

    return {
      text: data.text || '',
      pageCount: data.numpages || 0
    };
  } catch (error: any) {
    console.error('[AIPDFProcessor] extractText FULL error:', error);
    logger.error(`[AIPDFProcessor] Text extraction error: ${error.message}`);
    return { text: '', pageCount: 0 };
  }
};

/**
 * Process PDF and optionally ingest into Knowledge Base
 */
const processPDF = async (
  pdfBuffer: Buffer,
  companyId: number,
  options: {
    title?: string;
    ingestToKB?: boolean;
    generateSummary?: boolean;
    extractEntities?: boolean;
  } = {}
): Promise<PDFProcessingResult> => {
  const startTime = Date.now();
  const { title, ingestToKB = false, generateSummary = true, extractEntities = false } = options;

  // 1. Extract text
  const { text, pageCount } = await extractText(pdfBuffer);

  if (!text || text.trim().length < 10) {
    logger.warn(`[AIPDFProcessor] PDF has no extractable text, empresa=${companyId}`);
    return {
      text: '',
      pageCount,
      wordCount: 0,
      latencyMs: Date.now() - startTime
    };
  }

  const wordCount = text.split(/\s+/).length;
  let summary: string | undefined;
  let entities: Array<{ name: string; type: string }> | undefined;

  // 2. Generate summary if requested
  if (generateSummary && text.length > 100) {
    try {
      const AIClientService = require("../AIClientService").default;
      const response = await AIClientService.generateText({
        prompt: `Resume el siguiente texto extraido de un PDF en maximo 300 palabras.
Incluye los puntos clave y datos importantes.

Texto:
${text.substring(0, 6000)}

Resumen:`,
        modelKey: 'gpt-5.5',
        maxTokens: 400,
        temperature: 0.3
      });
      summary = response.text;
    } catch (error: any) {
      logger.warn(`[AIPDFProcessor] Summary generation failed: ${error.message}`);
    }
  }

  // 3. Extract entities if requested
  if (extractEntities) {
    try {
      const GraphRAGService = require("../AIGraphRAGServices/GraphRAGService").default;
      entities = await GraphRAGService.extractEntities(text.substring(0, 3000), companyId);
    } catch (error: any) {
      logger.warn(`[AIPDFProcessor] Entity extraction failed: ${error.message}`);
    }
  }

  // 4. Ingest into Knowledge Base if requested
  let documentId: number | undefined;
  let chunksCreated: number | undefined;

  if (ingestToKB) {
    try {
      const ChunkingService = require("../RAGServices/ChunkingService").default;
      const chunks = ChunkingService.chunkText(text, { chunkSize: 500, overlap: 50 });

      // Create document
      const [docResult] = await sequelize.query(`
        INSERT INTO "AIDocuments" (
          "companyId", title, "sourceType", status,
          "totalChunks", "totalTokens", metadata, "createdAt", "updatedAt"
        ) VALUES (
          :companyId, :title, 'pdf', 'processed',
          :totalChunks, :totalTokens, :metadata, NOW(), NOW()
        ) RETURNING id
      `, {
        replacements: {
          companyId,
          title: title || `PDF - ${pageCount} paginas`,
          totalChunks: chunks.length,
          totalTokens: Math.ceil(text.length / 4),
          metadata: JSON.stringify({ pageCount, wordCount, processedAt: new Date().toISOString() })
        }
      });

      documentId = Array.isArray(docResult) ? (docResult[0] as any)?.id : undefined;

      // Create chunks
      for (let i = 0; i < chunks.length; i++) {
        await sequelize.query(`
          INSERT INTO "AIChunks" (
            "documentId", "companyId", content, "chunkIndex",
            "tokenCount", metadata, "createdAt", "updatedAt"
          ) VALUES (
            :documentId, :companyId, :content, :chunkIndex,
            :tokenCount, '{}', NOW(), NOW()
          )
        `, {
          replacements: {
            documentId,
            companyId,
            content: chunks[i],
            chunkIndex: i,
            tokenCount: Math.ceil(chunks[i].length / 4)
          },
          type: QueryTypes.INSERT
        });
      }

      chunksCreated = chunks.length;
      logger.info(`[AIPDFProcessor] PDF ingested: doc=${documentId}, chunks=${chunksCreated}`);
    } catch (error: any) {
      logger.error(`[AIPDFProcessor] KB ingestion failed: ${error.message}`);
    }
  }

  logger.info(`[AIPDFProcessor] Processed: ${pageCount} pages, ${wordCount} words, empresa=${companyId}`);

  // Deducir créditos por procesamiento de PDF
  try {
    const cost = await CalculateCreditCostService({
      companyId,
      action: 'pdf_processing',
      metadata: { charCount: wordCount * 5 } // Aproximación: 1 palabra ≈ 5 caracteres
    });

    await DeductCreditsService({
      companyId,
      creditTypeKey: cost.creditTypeKey,
      amount: cost.amount,
      description: `PDF: procesamiento de documento (${pageCount} páginas)`,
      source: 'pdf_processing',
      tokensUsed: wordCount
    });

    logger.info(`[AIPDFProcessor] Deducidos ${cost.amount} créditos por procesamiento de PDF`);
  } catch (creditError: any) {
    logger.warn(`[AIPDFProcessor] Error deduciendo créditos: ${creditError.message}`);
  }

  return {
    text: text.substring(0, 10000), // Limit response size
    pageCount,
    wordCount,
    summary,
    entities,
    documentId,
    chunksCreated,
    latencyMs: Date.now() - startTime
  };
};

export default { extractText, processPDF };
