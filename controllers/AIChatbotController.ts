import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import ListService from "../services/AIChatbotServices/ListService";
import ShowService from "../services/AIChatbotServices/ShowService";
import CreateService from "../services/AIChatbotServices/CreateService";
import UpdateService from "../services/AIChatbotServices/UpdateService";
import DeleteService from "../services/AIChatbotServices/DeleteService";
import AddDataSourceService from "../services/AIChatbotServices/AddDataSourceService";
import TrainChatbotService from "../services/AIChatbotServices/TrainChatbotService";
import AIChatbotConfig from "../models/AIChatbotConfig";
import AIChatbotDataSource from "../models/AIChatbotDataSource";

import AppError from "../errors/AppError";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  status: string;
};

// GET /ai/chatbots — Lista paginada con filtros
export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber, status } = req.query as IndexQuery;
  const { companyId } = req.user;

  const { records, count, hasMore } = await ListService({
    searchParam,
    pageNumber,
    companyId,
    status
  });

  return res.json({ records, count, hasMore });
};

// GET /ai/chatbots/:id — Detalle de un chatbot con dataSources
export const show = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  const chatbot = await ShowService(id, companyId);

  return res.status(200).json(chatbot);
};

// POST /ai/chatbots — Crear chatbot (solo admin)
export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const chatbot = await CreateService({ ...req.body, companyId });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ai-chatbot`, {
      action: "create",
      chatbot
    });

  return res.status(201).json(chatbot);
};

// PUT /ai/chatbots/:id — Actualizar chatbot (solo admin)
export const update = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const chatbot = await UpdateService({ id, companyId, ...req.body });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ai-chatbot`, {
      action: "update",
      chatbot
    });

  return res.status(200).json(chatbot);
};

// DELETE /ai/chatbots/:id — Eliminar chatbot (solo admin)
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  await DeleteService(id, companyId);

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ai-chatbot`, {
      action: "delete",
      chatbotId: +id
    });

  return res.status(200).json({ message: "Chatbot IA eliminado exitosamente" });
};

// POST /ai/chatbots/:id/datasources — Agregar data source a chatbot (solo admin)
export const addDataSource = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const dataSource = await AddDataSourceService({
    chatbotId: +id,
    companyId,
    ...req.body
  });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ai-chatbot`, {
      action: "addDataSource",
      chatbotId: +id,
      dataSource
    });

  return res.status(201).json(dataSource);
};

// POST /ai/chatbots/:id/train — Entrenar chatbot (solo admin)
export const train = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const chatbot = await TrainChatbotService(id, companyId);

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ai-chatbot`, {
      action: "train",
      chatbot
    });

  return res.status(200).json(chatbot);
};

// GET /ai/chatbots/stats — Estadisticas de chatbots
export const stats = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const [total, active, dataSources] = await Promise.all([
    AIChatbotConfig.count({ where: { companyId } }),
    AIChatbotConfig.count({ where: { companyId, status: "active" } }),
    AIChatbotDataSource.count({ where: { companyId } })
  ]);

  return res.json({
    success: true,
    data: {
      total,
      active,
      inactive: total - active,
      dataSources
    }
  });
};
