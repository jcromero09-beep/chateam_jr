import { Request, Response } from "express";
import { Op } from "sequelize";
import sequelize from "sequelize";
import { getIO } from "../libs/socket";

import ListAgentConfigService from "../services/AIAgentConfigServices/ListService";
import CreateAgentConfigService from "../services/AIAgentConfigServices/CreateService";
import UpdateAgentConfigService from "../services/AIAgentConfigServices/UpdateService";
import AgentLogService from "../services/AIAgentServices/AgentLogService";
import SupervisorService from "../services/AIAgentServices/SupervisorService";
import AIAgentConfig from "../models/AIAgentConfig";

import AppError from "../errors/AppError";

// GET /ai/agents/configs — Lista configuraciones de agentes
export const listConfigs = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { agentType, department, isActive } = req.query as any;

  const configs = await ListAgentConfigService({
    companyId,
    agentType,
    department,
    isActive: isActive !== undefined ? isActive === "true" : undefined
  });

  return res.json(configs);
};

// GET /ai/agents/departments — Resumen de departamentos con conteo
export const listDepartments = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const departments = await AIAgentConfig.findAll({
    where: {
      isActive: true,
      department: { [Op.ne]: null },
      [Op.or]: [
        { companyId: null },
        { companyId }
      ]
    },
    attributes: [
      "department",
      [sequelize.fn("COUNT", sequelize.col("id")), "agentCount"]
    ],
    group: ["department"],
    order: [["department", "ASC"]],
    raw: true
  });

  return res.json({ success: true, data: departments });
};

// POST /ai/agents/configs — Crear configuración de agente
export const createConfig = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const config = await CreateAgentConfigService({
    ...req.body,
    companyId
  });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ai-agent`, {
      action: "config_created",
      config
    });

  return res.status(201).json(config);
};

// PUT /ai/agents/configs/:id — Actualizar configuración
export const updateConfig = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const config = await UpdateAgentConfigService({
    id: parseInt(id),
    ...req.body
  });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ai-agent`, {
      action: "config_updated",
      config
    });

  return res.status(200).json(config);
};

// GET /ai/agents/metrics — Métricas de agentes
export const getMetrics = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { agentType, dateFrom, dateTo } = req.query as any;

  const metrics = await AgentLogService.getAgentMetrics(
    companyId,
    agentType,
    dateFrom ? new Date(dateFrom) : undefined,
    dateTo ? new Date(dateTo) : undefined
  );

  return res.json(metrics);
};

// POST /ai/agents/process — Procesar mensaje a través del Supervisor (API directa)
export const processMessage = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { message, ticketId, contactId, ticketHistory, contactInfo, chatbotId } = req.body;

  if (!message) {
    throw new AppError("ERR_MESSAGE_REQUIRED", 400);
  }

  const result = await SupervisorService.processMessage({
    message,
    companyId,
    ticketId,
    contactId,
    ticketHistory,
    contactInfo,
    chatbotId
  });

  return res.status(200).json({
    success: true,
    data: result
  });
};
