import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Controller: AISupportCorrections
 * CRUD de correcciones/soluciones manuales por empresa
 * Panel admin: problema → solución con embeddings semánticos
 */

import { Request, Response } from "express";
import AISupportCorrection from "../models/AISupportCorrection";
import CorrectionSearchService from "../services/AIAgentServices/CorrectionSearchService";
import logger from "../utils/logger";

// ── LIST ──────────────────────────────────────────────────────
export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { category, isActive, source } = req.query;

  const where: any = { companyId };
  if (category) where.category = category;
  if (isActive !== undefined) where.isActive = isActive === "true";
  // Sprint 1: permitir filtrar por source (admin | human_correction_loop | api | import)
  if (source) where.source = source;

  const corrections = await AISupportCorrection.findAll({
    where,
    order: [["priority", "ASC"], ["createdAt", "DESC"]],
    attributes: [
      "id", "problem", "solution", "category", "isActive", "usageCount", "lastUsedAt",
      // Sprint 1: nuevos campos
      "source", "correctionType", "scopeJson", "verifiedBy", "verifiedAt",
      "sourceAgentLogId", "sourceTicketId", "priority",
      "createdAt"
    ]
  });

  return res.json({ success: true, data: corrections });
};

// ── CREATE ────────────────────────────────────────────────────
export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const {
    problem, solution, category,
    // Sprint 1: campos opcionales para correcciones programáticas
    source, correctionType, scopeJson, sourceAgentLogId, sourceTicketId, priority
  } = req.body;

  if (!problem || !solution) {
    return res.status(400).json({ success: false, message: "Problem y solution son requeridos" });
  }

  const correction = await AISupportCorrection.create({
    companyId,
    problem,
    solution,
    category: category || "general",
    createdBy: userId,
    // Sprint 1: si vienen, se persisten; si no, defaults del modelo
    ...(source !== undefined && { source }),
    ...(correctionType !== undefined && { correctionType }),
    ...(scopeJson !== undefined && { scopeJson }),
    ...(sourceAgentLogId !== undefined && { sourceAgentLogId }),
    ...(sourceTicketId !== undefined && { sourceTicketId }),
    ...(priority !== undefined && { priority })
  } as any);

  // Generar embedding en background
  CorrectionSearchService.syncEmbedding(correction.id, companyId).catch(err => {
    logger.error(`[CorrectionController] Error generando embedding: ${err.message}`);
  });

  return res.status(201).json({ success: true, data: correction });
};

// ── UPDATE ────────────────────────────────────────────────────
export const update = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const {
    problem, solution, category, isActive,
    // Sprint 1: campos opcionales adicionales
    source, correctionType, scopeJson, priority
  } = req.body;

  const correction = await AISupportCorrection.findOne({
    where: { id, companyId }
  });

  if (!correction) {
    return res.status(404).json({ success: false, message: "Corrección no encontrada" });
  }

  await correction.update({
    ...(problem !== undefined && { problem }),
    ...(solution !== undefined && { solution }),
    ...(category !== undefined && { category }),
    ...(isActive !== undefined && { isActive }),
    ...(source !== undefined && { source }),
    ...(correctionType !== undefined && { correctionType }),
    ...(scopeJson !== undefined && { scopeJson }),
    ...(priority !== undefined && { priority })
  } as any);

  // Re-generar embedding si cambió el contenido
  if (problem !== undefined || solution !== undefined) {
    CorrectionSearchService.syncEmbedding(correction.id, companyId).catch(err => {
      logger.error(`[CorrectionController] Error regenerando embedding: ${err.message}`);
    });
  }

  return res.json({ success: true, data: correction });
};

// ── DELETE (soft: isActive=false) ─────────────────────────────
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const correction = await AISupportCorrection.findOne({
    where: { id, companyId }
  });

  if (!correction) {
    return res.status(404).json({ success: false, message: "Corrección no encontrada" });
  }

  // Soft delete: desactivar en vez de borrar
  await correction.update({ isActive: false });

  return res.json({ success: true, message: "Corrección desactivada" });
};

// ── MEMORIAS DEL CONTACTO (ver/editar lo aprendido) ───────────
export const listMemories = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { contactId } = req.query;

  const { QueryTypes } = require("sequelize");
  const sequelize = require("../database").default;

  const where = contactId
    ? `WHERE cm.company_id = :companyId AND cm.contact_id = :contactId`
    : `WHERE cm.company_id = :companyId`;

  const memories = await sequelize.query(`
    SELECT cm.id, cm.contact_id AS "contactId", cm.memory_type AS "memoryType",
      cm.content, cm.confidence, cm.verified, cm.source_ticket_id AS "sourceTicketId",
      cm.created_at AS "createdAt", cm.last_confirmed_at AS "lastConfirmedAt",
      c.name AS "contactName", c.number AS "contactNumber"
    FROM contact_memory cm
    LEFT JOIN "Contacts" c ON c.id = cm.contact_id
    ${where}
    ORDER BY cm.created_at DESC
    LIMIT 100
  `, {
    replacements: { companyId, ...(contactId && { contactId: Number(contactId) }) },
    type: QueryTypes.SELECT
  });

  return res.json({ success: true, data: memories });
};

// ── UPDATE MEMORY ─────────────────────────────────────────────
export const updateMemory = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const { content, verified } = req.body;

  const { QueryTypes } = require("sequelize");
  const sequelize = require("../database").default;

  const [updated] = await sequelize.query(`
    UPDATE contact_memory
    SET content = COALESCE(:content, content),
        verified = COALESCE(:verified, verified),
        updated_at = NOW()
    WHERE id = :id AND company_id = :companyId
    RETURNING id
  `, {
    replacements: { id, companyId, content: content || null, verified: verified !== undefined ? verified : null },
    type: QueryTypes.SELECT
  });

  if (!updated) {
    return res.status(404).json({ success: false, message: "Memoria no encontrada" });
  }

  return res.json({ success: true, message: "Memoria actualizada" });
};

// ── DELETE MEMORY ─────────────────────────────────────────────
export const deleteMemory = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const { QueryTypes } = require("sequelize");
  const sequelize = require("../database").default;

  await sequelize.query(
    `DELETE FROM contact_memory WHERE id = :id AND company_id = :companyId`,
    { replacements: { id, companyId }, type: QueryTypes.DELETE }
  );

  return res.json({ success: true, message: "Memoria eliminada" });
};
