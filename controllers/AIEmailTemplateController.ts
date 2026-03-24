import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import ListService from "../services/AIEmailTemplateServices/ListService";
import CreateService from "../services/AIEmailTemplateServices/CreateService";
import RenderService from "../services/AIEmailTemplateServices/RenderService";

import AppError from "../errors/AppError";

// GET /ai/email-templates — Lista templates (sistema + company)
export const list = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { type, searchParam } = req.query as any;

  const templates = await ListService({
    companyId,
    type,
    searchParam
  });

  return res.json(templates);
};

// POST /ai/email-templates — Crear template custom
export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { slug, subject, body, variables, type } = req.body;

  const template = await CreateService({
    companyId,
    type,
    slug,
    subject,
    body,
    variables
  });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ai-email-template`, {
      action: "create",
      template
    });

  return res.status(201).json(template);
};

// POST /ai/email-templates/render — Renderizar template con variables
export const render = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { slug, variables } = req.body;

  if (!slug) {
    throw new AppError("ERR_AI_EMAIL_TEMPLATE_SLUG_REQUIRED", 400);
  }

  const result = await RenderService({
    companyId,
    slug,
    variables: variables || {}
  });

  return res.status(200).json({
    success: true,
    data: result
  });
};
