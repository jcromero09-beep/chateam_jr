import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import { Request, Response } from "express";
import { Op } from "sequelize";
import axios from "axios";
import * as cheerio from "cheerio";
import sequelize from "../database";
import GraphRAGService from "../services/AIGraphRAGServices/GraphRAGService";
import TicketAutoIndexService from "../services/AIGraphRAGServices/TicketAutoIndexService";
import AIDocument from "../models/AIDocument";
import AIChunk from "../models/AIChunk";
import AppError from "../errors/AppError";
import KnowledgeBaseService from "../services/RAGServices/KnowledgeBaseService";

// ============================================================================
// HELPERS - Extracción de contenido desde URLs y PDFs
// ============================================================================

/**
 * Extrae contenido textual desde una URL usando cheerio
 */
async function extractContentFromUrl(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ChatEAM-Bot/1.0)"
      },
      maxContentLength: 5 * 1024 * 1024 // 5MB max
    });

    const $ = cheerio.load(response.data);

    // Remover scripts y estilos
    $("script, style, nav, header, footer, iframe, noscript").remove();

    // Extraer texto de elementos relevantes
    const textParts: string[] = [];

    // Títulos
    $("h1, h2, h3, h4, h5, h6").each((_, el) => {
      const text = $(el).text().trim();
      if (text) textParts.push(`## ${text}`);
    });

    // Párrafos
    $("p").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 20) textParts.push(text);
    });

    // Listas
    $("li").each((_, el) => {
      const text = $(el).text().trim();
      if (text) textParts.push(`- ${text}`);
    });

    // Tablas
    $("table").each((_, table) => {
      const rows: string[] = [];
      $(table).find("tr").each((_, tr) => {
        const cells: string[] = [];
        $(tr).find("td, th").each((_, cell) => {
          cells.push($(cell).text().trim());
        });
        if (cells.length > 0) rows.push(cells.join(" | "));
      });
      if (rows.length > 0) textParts.push(rows.join("\n"));
    });

    // Articles y sections
    $("article, section, main").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 50) textParts.push(text);
    });

    const finalContent = textParts.join("\n\n");

    // Limpiar whitespace excesivo
    return finalContent.replace(/\n{3,}/g, "\n\n").trim();
  } catch (error: any) {
    throw new Error(`Error extrayendo contenido de URL: ${error.message}`);
  }
}

/**
 * Extrae contenido textual desde un archivo PDF
 */
async function extractContentFromPdf(filePath: string): Promise<string> {
  try {
    console.log(`[KB] Extrayendo PDF desde: ${filePath}`);
    const pdfModule = require("../services/AIMultimodalServices/AIPDFProcessorService");
    console.log(`[KB] PDF module keys:`, Object.keys(pdfModule));
    console.log(`[KB] PDF module default:`, pdfModule.default);

    const extractText = pdfModule.extractText || pdfModule.default?.extractText;
    if (!extractText) {
      throw new Error("No se encontró la función extractText");
    }

    const pdfBuffer = await require("fs/promises").readFile(filePath);
    console.log(`[KB] PDF buffer size: ${pdfBuffer.length} bytes`);

    const result = await extractText(pdfBuffer);
    console.log(`[KB] PDF extraído: ${result.text.length} caracteres, ${result.pageCount} páginas`);
    return result.text;
  } catch (error: any) {
    console.error(`[KB] Error extrayendo PDF:`, error);
    throw new Error(`Error extrayendo contenido de PDF: ${error.message}`);
  }
}

// GET /ai/rag/documents — Lista paginada de documentos RAG
export const listDocuments = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { page = 1, limit = 20, source, status, search } = req.query;

  const where: Record<string, unknown> = { companyId };
  if (source) where.sourceType = source;
  if (status) where.status = status;
  if (search) where.title = { [Op.iLike]: `%${search}%` };

  const offset = (Number(page) - 1) * Number(limit);
  const { rows, count } = await AIDocument.findAndCountAll({
    where,
    limit: Number(limit),
    offset,
    order: [["createdAt", "DESC"]]
  });

  return res.json({
    success: true,
    data: { records: rows, count, hasMore: offset + rows.length < count }
  });
};

// GET /ai/rag/stats — Estadisticas globales de RAG
export const getStats = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const [totalDocuments, chunkStats] = await Promise.all([
    AIDocument.count({ where: { companyId } }),
    AIChunk.findAll({
      where: { companyId },
      attributes: [
        [sequelize.fn("COUNT", sequelize.col("id")), "totalChunks"],
        [sequelize.fn("SUM", sequelize.col("tokenCount")), "totalTokens"]
      ],
      raw: true
    })
  ]);

  const stats = chunkStats[0] as unknown as Record<string, unknown> | undefined;
  return res.json({
    success: true,
    data: {
      totalDocuments,
      totalChunks: Number(stats?.totalChunks || 0),
      totalTokens: Number(stats?.totalTokens || 0)
    }
  });
};

// POST /ai/graph-rag/search
export const search = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { query, topK, includeGraph } = req.body;
  if (!query) throw new AppError("ERR_QUERY_REQUIRED", 400);
  const result = await GraphRAGService.graphSearch(query, companyId, { topK, includeGraph });
  return res.json({ success: true, data: result });
};

// POST /ai/graph-rag/build/:documentId
export const buildGraph = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, profile } = req.user;
  if (profile !== "admin") throw new AppError("ERR_NO_PERMISSION", 403);
  const { documentId } = req.params;
  const result = await GraphRAGService.buildGraphFromDocument(parseInt(documentId), companyId);
  return res.json({ success: true, data: result });
};

// POST /ai/graph-rag/extract-entities
export const extractEntities = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { text } = req.body;
  if (!text) throw new AppError("ERR_TEXT_REQUIRED", 400);
  const entities = await GraphRAGService.extractEntities(text, companyId);
  return res.json({ success: true, data: entities });
};

// POST /ai/tickets/auto-index/:ticketId
export const indexTicket = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { ticketId } = req.params;
  const result = await TicketAutoIndexService.indexResolvedTicket(parseInt(ticketId), companyId);
  return res.json({ success: true, data: result });
};

// POST /ai/tickets/batch-index
export const batchIndex = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, profile } = req.user;
  if (profile !== "admin") throw new AppError("ERR_NO_PERMISSION", 403);
  const { limit } = req.body;
  const result = await TicketAutoIndexService.batchIndexResolved(companyId, limit || 50);
  return res.json({ success: true, data: result });
};

// POST /ai/rag/documents — Crear nuevo documento
export const createDocument = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { title, sourceType, content, sourceUrl } = req.body;

  if (!title || !title.trim()) throw new AppError("ERR_TITLE_REQUIRED", 400);
  if (!sourceType) throw new AppError("ERR_SOURCE_TYPE_REQUIRED", 400);

  // Si es archivo subido via multer
  const file = (req as any).file;
  let fileContent = content || "";
  let filePath: string | undefined;

  if (file) {
    filePath = file.path;
    const ext = file.originalname.toLowerCase();

    // Para archivos de texto, leer contenido directamente
    if (['.txt', '.csv', '.md'].some(e => ext.endsWith(e))) {
      const fs = await import("fs/promises");
      fileContent = await fs.readFile(file.path, "utf-8");
    }
    // Para DOCX, extraer texto con mammoth
    else if (ext.endsWith('.docx') || ext.endsWith('.doc')) {
      try {
        console.log(`[KB] Procesando DOCX: ${file.originalname}`);
        const mammoth = require("mammoth");
        const result = await mammoth.extractRawText({ path: file.path });
        fileContent = result.value;

        if (!fileContent || fileContent.trim().length < 10) {
          throw new Error("No se pudo extraer texto del DOCX");
        }
        console.log(`[KB] DOCX extraído: ${fileContent.length} caracteres`);
      } catch (docxError: any) {
        console.error(`[KB] Error extrayendo DOCX:`, docxError);
        throw new AppError(`Error extrayendo DOCX: ${docxError.message}`, 400);
      }
    }
    // Para PDFs, extraer texto usando el servicio
    else if (ext.endsWith('.pdf')) {
      try {
        console.log(`[KB] Procesando PDF: ${file.originalname}`);
        const pdfModule = require("../services/AIMultimodalServices/AIPDFProcessorService");
        const extractText = pdfModule.extractText || pdfModule.default?.extractText;
        if (!extractText) {
          throw new Error("No se encontró la función extractText");
        }
        const pdfBuffer = await require("fs/promises").readFile(file.path);
        const result = await extractText(pdfBuffer);
        fileContent = result.text;

        if (!fileContent || fileContent.trim().length < 10) {
          throw new Error("No se pudo extraer texto del PDF");
        }
        console.log(`[KB] PDF extraído: ${fileContent.length} caracteres`);
      } catch (pdfError: any) {
        console.error(`[KB] Error extrayendo PDF:`, pdfError);
        throw new AppError(`Error extrayendo PDF: ${pdfError.message}`, 400);
      }
    }
  }

  // Para URLs, extraer contenido desde la web
  if (sourceType === 'url' && sourceUrl) {
    try {
      const urlContent = await extractContentFromUrl(sourceUrl);

      if (!urlContent || urlContent.trim().length < 20) {
        throw new Error("No se pudo extraer contenido significativo de la URL");
      }

      fileContent = urlContent;
    } catch (urlError: any) {
      throw new AppError(`Error extrayendo URL: ${urlError.message}`, 400);
    }
  }

  const document = await KnowledgeBaseService.createDocument(companyId, {
    title: title.trim(),
    sourceType,
    content: fileContent || undefined,
    filePath,
    sourceUrl
  });

  // Procesar en background (fire and forget)
  KnowledgeBaseService.processDocument(document.id).catch(err => {
    console.error(`[RAG] Error procesando documento ${document.id}:`, err.message);
  });

  return res.status(201).json({
    success: true,
    data: document,
    message: "Documento creado. Procesamiento iniciado."
  });
};

// DELETE /ai/rag/documents/:id — Eliminar documento
export const deleteDocument = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  await KnowledgeBaseService.deleteDocument(parseInt(id), companyId);
  return res.json({ success: true, message: "Documento eliminado correctamente." });
};

// GET /ai/rag/documents/:id — Detalle de documento con chunks
export const getDocumentDetail = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const document = await AIDocument.findOne({
    where: { id: parseInt(id), companyId }
  });

  if (!document) throw new AppError("ERR_DOCUMENT_NOT_FOUND", 404);

  // Obtener chunks sin embeddings (muy grandes para la respuesta)
  const chunks = await AIChunk.findAll({
    where: { documentId: document.id, companyId },
    attributes: ["id", "chunkIndex", "content", "tokenCount", "topic", "keywords", "metadata", "createdAt"],
    order: [["chunkIndex", "ASC"]],
    limit: 500
  });

  return res.json({
    success: true,
    data: { document, chunks }
  });
};

// PUT /ai/rag/documents/:id/reindex — Reindexar documento
export const reindexDocument = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const document = await AIDocument.findOne({
    where: { id: parseInt(id), companyId }
  });
  if (!document) throw new AppError("ERR_DOCUMENT_NOT_FOUND", 404);

  // Reindexar en background
  KnowledgeBaseService.reindexDocument(document.id).catch(err => {
    console.error(`[RAG] Error reindexando documento ${document.id}:`, err.message);
  });

  return res.json({
    success: true,
    message: "Reindexación iniciada. El documento se actualizará en unos momentos."
  });
};

// POST /ai/rag/search — Buscar en Knowledge Base
export const searchKB = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { query, topK } = req.body;
  if (!query) throw new AppError("ERR_QUERY_REQUIRED", 400);
  const results = await KnowledgeBaseService.search(query, companyId, { topK: topK || 5 });
  return res.json({ success: true, data: results });
};
