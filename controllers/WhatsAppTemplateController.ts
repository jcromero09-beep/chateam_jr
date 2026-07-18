/**
 * WhatsAppTemplateController
 * Controlador para gestión de plantillas de WhatsApp Business API
 */

import { Request, Response } from "express";
import CreateWhatsAppTemplateService from "../services/WhatsAppTemplateServices/CreateWhatsAppTemplateService";
import ListWhatsAppTemplatesService from "../services/WhatsAppTemplateServices/ListWhatsAppTemplatesService";
import GetWhatsAppTemplateService from "../services/WhatsAppTemplateServices/GetWhatsAppTemplateService";
import UpdateWhatsAppTemplateService from "../services/WhatsAppTemplateServices/UpdateWhatsAppTemplateService";
import DeleteWhatsAppTemplateService from "../services/WhatsAppTemplateServices/DeleteWhatsAppTemplateService";
import SubmitTemplateToMetaService from "../services/WhatsAppTemplateServices/SubmitTemplateToMetaService";
import SyncTemplatesFromMetaService from "../services/WhatsAppTemplateServices/SyncTemplatesFromMetaService";
import AppError from "../errors/AppError";

/**
 * Lista todas las plantillas de la compañía
 * GET /whatsapp-templates
 */
export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    category,
    status,
    language,
    whatsappId,
    searchTerm,
    isActive,
    page,
    limit
  } = req.query;

  const result = await ListWhatsAppTemplatesService({
    companyId,
    category: category as any,
    status: status as any,
    language: language as string,
    whatsappId: whatsappId ? Number(whatsappId) : undefined,
    searchTerm: searchTerm as string,
    isActive: isActive === "false" ? false : true,
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 50
  });

  return res.status(200).json(result);
};

/**
 * Obtiene una plantilla por ID
 * GET /whatsapp-templates/:templateId
 */
export const show = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { templateId } = req.params;

  const template = await GetWhatsAppTemplateService({
    templateId: Number(templateId),
    companyId
  });

  return res.status(200).json(template);
};

/**
 * Crea una nueva plantilla
 * POST /whatsapp-templates
 */
export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    name,
    category,
    language,
    headerType,
    headerContent,
    bodyContent,
    footerContent,
    buttons,
    variableExamples,
    whatsappId,
    submitToMeta
  } = req.body;

  if (!name || !bodyContent) {
    throw new AppError("ERR_TEMPLATE_NAME_AND_BODY_REQUIRED", 400);
  }

  const result = await CreateWhatsAppTemplateService({
    name,
    category: category || "UTILITY",
    language: language || "es",
    headerType,
    headerContent,
    bodyContent,
    footerContent,
    buttons,
    variableExamples,
    companyId,
    whatsappId: whatsappId ? Number(whatsappId) : undefined,
    submitToMeta: submitToMeta === true
  });

  return res.status(201).json(result);
};

/**
 * Actualiza una plantilla
 * PUT /whatsapp-templates/:templateId
 */
export const update = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { templateId } = req.params;
  const {
    name,
    category,
    language,
    headerType,
    headerContent,
    bodyContent,
    footerContent,
    buttons,
    variableExamples,
    isActive
  } = req.body;

  const template = await UpdateWhatsAppTemplateService({
    templateId: Number(templateId),
    companyId,
    name,
    category,
    language,
    headerType,
    headerContent,
    bodyContent,
    footerContent,
    buttons,
    variableExamples,
    isActive
  });

  return res.status(200).json(template);
};

/**
 * Elimina una plantilla
 * DELETE /whatsapp-templates/:templateId
 */
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { templateId } = req.params;
  const { hardDelete } = req.query;

  await DeleteWhatsAppTemplateService({
    templateId: Number(templateId),
    companyId,
    hardDelete: hardDelete === "true"
  });

  return res.status(200).json({ message: "Template deleted successfully" });
};

/**
 * Envía una plantilla a Meta para aprobación
 * POST /whatsapp-templates/:templateId/submit
 */
export const submitToMeta = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { templateId } = req.params;
  const { whatsappId } = req.body;

  if (!whatsappId) {
    throw new AppError("ERR_WHATSAPP_ID_REQUIRED", 400);
  }

  const result = await SubmitTemplateToMetaService({
    templateId: Number(templateId),
    companyId,
    whatsappId: Number(whatsappId)
  });

  return res.status(200).json(result);
};

/**
 * Sincroniza plantillas desde Meta
 * POST /whatsapp-templates/sync
 */
export const syncFromMeta = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { whatsappId } = req.body;

  if (!whatsappId) {
    throw new AppError("ERR_WHATSAPP_ID_REQUIRED", 400);
  }

  const result = await SyncTemplatesFromMetaService({
    companyId,
    whatsappId: Number(whatsappId)
  });

  return res.status(200).json(result);
};
