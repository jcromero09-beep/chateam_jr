import * as Yup from "yup";
import { ValidationError } from "yup";
import { Request, Response } from "express";
import { Op } from "sequelize";

import EmailAutomation from "../models/EmailMarketing/EmailAutomation";
import EmailTemplate from "../models/EmailMarketing/EmailTemplate";
import ContactList from "../models/ContactList";

import AppError from "../errors/AppError";
import logger from "../utils/logger";

import * as AutomationEngineService from "../services/EmailMarketing/AutomationEngineService";

// ============================================================================
// Types
// ============================================================================

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  status: string;
};

// ============================================================================
// index — Listar automatizaciones de la company
// ============================================================================

export const index = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { searchParam = "", pageNumber = "1", status = "" } = req.query as IndexQuery;
    const { companyId } = req.user;

    const limit = 20;
    const offset = limit * (+pageNumber - 1);

    const where: Record<string, unknown> = { companyId, isActive: true };

    if (searchParam) {
      where.name = { [Op.iLike]: `%${searchParam}%` };
    }

    if (status) {
      where.status = status;
    }

    const { count, rows: records } = await EmailAutomation.findAndCountAll({
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      include: [
        { model: EmailTemplate, as: "template", attributes: ["id", "name", "subject"] },
        { model: ContactList, as: "contactList", attributes: ["id", "name"] }
      ]
    });

    const hasMore = count > offset + records.length;

    return res.json({ success: true, data: { records, count, hasMore } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailAutomation] Error en index: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg, errors: [msg] });
  }
};

// ============================================================================
// store — Crear automatizacion
// ============================================================================

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const data = req.body;

  const schema = Yup.object().shape({
    name: Yup.string().required("El nombre es obligatorio"),
    triggerType: Yup.string()
      .oneOf([
        "contact_added", "contact_tag_added", "campaign_opened",
        "campaign_not_opened", "link_clicked", "date_trigger", "inactivity"
      ])
      .required("El tipo de trigger es obligatorio")
  });

  try {
    await schema.validate(data, { abortEarly: false });
  } catch (err: unknown) {
    if (err instanceof ValidationError) {
      const yupError = err.inner.map((e) => e.message);
      return res.status(400).json({ error: yupError.join(", ") });
    }
    const msg = err instanceof Error ? err.message : "Error de validación";
    return res.status(400).json({ error: msg });
  }

  try {
    const automation = await EmailAutomation.create({
      ...data,
      companyId,
      createdBy: userId,
      status: "draft",
      isActive: true
    } as Partial<EmailAutomation>);

    logger.info(
      `[EmailAutomationController] Automatizacion creada: id=${automation.id}, ` +
      `name="${automation.name}", company=${companyId}`
    );

    return res.status(200).json({ success: true, data: automation });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailAutomation] Error: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg, errors: [msg] });
  }
};

// ============================================================================
// show — Detalle de una automatizacion
// ============================================================================

export const show = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user;

    const automation = await EmailAutomation.findOne({
      where: { id, companyId, isActive: true },
      include: [
        { model: EmailTemplate, as: "template", attributes: ["id", "name", "subject", "htmlContent"] },
        { model: ContactList, as: "contactList", attributes: ["id", "name"] }
      ]
    });

    if (!automation) {
      throw new AppError("Automatizacion no encontrada", 404);
    }

    return res.status(200).json({ success: true, data: automation });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailAutomation] Error en show: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg, errors: [msg] });
  }
};

// ============================================================================
// update — Actualizar automatizacion
// ============================================================================

export const update = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user;
    const data = req.body;

    const automation = await EmailAutomation.findOne({
      where: { id, companyId, isActive: true }
    });

    if (!automation) {
      throw new AppError("Automatizacion no encontrada", 404);
    }

    // No permitir editar si esta activa (debe pausarse primero)
    if (automation.status === "active" && data.triggerType) {
      throw new AppError("Debe pausar la automatizacion antes de cambiar el trigger", 400);
    }

    await automation.update(data);

    logger.info(
      `[EmailAutomationController] Automatizacion actualizada: id=${id}, company=${companyId}`
    );

    return res.status(200).json({ success: true, data: automation });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailAutomation] Error en update: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg, errors: [msg] });
  }
};

// ============================================================================
// remove — Soft delete (isActive = false)
// ============================================================================

export const remove = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user;

    const automation = await EmailAutomation.findOne({
      where: { id, companyId, isActive: true }
    });

    if (!automation) {
      throw new AppError("Automatizacion no encontrada", 404);
    }

    // BD SAGRADA: soft delete
    await automation.update({ isActive: false, status: "paused" });

    logger.info(
      `[EmailAutomationController] Automatizacion eliminada (soft): id=${id}, company=${companyId}`
    );

    return res.status(200).json({ success: true, message: "Automatizacion eliminada" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailAutomation] Error en remove: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg, errors: [msg] });
  }
};

// ============================================================================
// activate — Cambiar status a 'active'
// ============================================================================

export const activate = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user;

    const automation = await EmailAutomation.findOne({
      where: { id, companyId, isActive: true }
    });

    if (!automation) {
      throw new AppError("Automatizacion no encontrada", 404);
    }

    if (automation.status === "active") {
      return res.status(200).json({ success: true, message: "Ya esta activa", data: automation });
    }

    // Validar que tenga contenido
    if (!automation.emailContent && !automation.emailTemplateId) {
      throw new AppError("La automatizacion necesita contenido de email o un template", 400);
    }

    if (!automation.emailSubject && !automation.emailTemplateId) {
      throw new AppError("La automatizacion necesita un asunto o un template con asunto", 400);
    }

    await automation.update({ status: "active" });

    logger.info(
      `[EmailAutomationController] Automatizacion activada: id=${id}, company=${companyId}`
    );

    return res.status(200).json({ success: true, data: automation });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailAutomation] Error en activate: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg, errors: [msg] });
  }
};

// ============================================================================
// pause — Cambiar status a 'paused'
// ============================================================================

export const pause = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user;

    const automation = await EmailAutomation.findOne({
      where: { id, companyId, isActive: true }
    });

    if (!automation) {
      throw new AppError("Automatizacion no encontrada", 404);
    }

    await automation.update({ status: "paused" });

    logger.info(
      `[EmailAutomationController] Automatizacion pausada: id=${id}, company=${companyId}`
    );

    return res.status(200).json({ success: true, data: automation });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailAutomation] Error en pause: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg, errors: [msg] });
  }
};

// ============================================================================
// stats — Estadisticas de una automatizacion
// ============================================================================

export const stats = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  try {
    const automationStats = await AutomationEngineService.getAutomationStats(
      Number(id),
      Number(companyId)
    );

    if (!automationStats) {
      throw new AppError("Automatizacion no encontrada", 404);
    }

    return res.status(200).json({ success: true, data: automationStats });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailAutomation] Error: ${msg}`);
    return res.status(statusCode).json({ success: false, message: msg, errors: [msg] });
  }
};
