import { Request, Response } from "express";
import { Op } from "sequelize";
import AppError from "../errors/AppError";
import AIAgentAssignment from "../models/AIAgentAssignment";
import AIAgentConfig from "../models/AIAgentConfig";
import Company from "../models/Company";
import Plan from "../models/Plan";

// GET /ai/agents/assignments — Lista agentes asignados a la company del usuario
export const listAssignments = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const [assignments, company] = await Promise.all([
    AIAgentAssignment.findAll({
      where: { companyId, isActive: true },
      include: [
        {
          model: AIAgentConfig,
          as: "agentConfig"
        }
      ],
      order: [["assignedAt", "DESC"]]
    }),
    Company.findByPk(companyId, {
      include: [{ model: Plan, as: "plan", attributes: ["maxAgents"] }]
    })
  ]);

  return res.json({
    success: true,
    data: assignments,
    maxAgents: (company?.plan as any)?.maxAgents ?? 3
  });
};

// GET /ai/agents/assignments/available — Lista agentes disponibles para asignar
export const listAvailable = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { department } = req.query as Record<string, string | undefined>;

  // Obtener IDs de agentes ya asignados y activos
  const activeAssignments = await AIAgentAssignment.findAll({
    where: { companyId, isActive: true },
    attributes: ["agentConfigId"]
  });

  const assignedIds = activeAssignments.map(a => a.agentConfigId);

  // Configs globales (companyId IS NULL) o de la propia company, activos y no asignados
  const whereClause: Record<string, unknown> = {
    isActive: true,
    [Op.or]: [
      { companyId: null },
      { companyId }
    ]
  };

  if (assignedIds.length > 0) {
    whereClause.id = { [Op.notIn]: assignedIds };
  }

  if (department) {
    whereClause.department = department;
  }

  const available = await AIAgentConfig.findAll({
    where: whereClause,
    order: [["department", "ASC"], ["sortOrder", "ASC"], ["agentType", "ASC"], ["name", "ASC"]]
  });

  return res.json({ success: true, data: available });
};

// POST /ai/agents/assignments — Asigna un agente a la company
export const createAssignment = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { agentConfigId, pricingModel, executionQuota, monthlyPrice, metadata } = req.body;

  if (!agentConfigId) {
    throw new AppError("ERR_AGENT_CONFIG_ID_REQUIRED", 400);
  }

  // Verificar que el agente existe y esta disponible (global o de la company)
  const agentConfig = await AIAgentConfig.findOne({
    where: {
      id: agentConfigId,
      isActive: true,
      [Op.or]: [
        { companyId: null },
        { companyId }
      ]
    }
  });

  if (!agentConfig) {
    throw new AppError("ERR_AGENT_CONFIG_NOT_FOUND", 404);
  }

  // Verificar que no este ya asignado y activo
  const existing = await AIAgentAssignment.findOne({
    where: { companyId, agentConfigId, isActive: true }
  });

  if (existing) {
    throw new AppError("ERR_AGENT_ALREADY_ASSIGNED", 409);
  }

  // Verificar limite del plan (maxAgents)
  const company = await Company.findByPk(companyId, {
    include: [{ model: Plan, as: "plan" }]
  });

  if (!company) {
    throw new AppError("ERR_COMPANY_NOT_FOUND", 404);
  }

  const maxAgents = (company.plan as any)?.maxAgents ?? 3;

  const activeCount = await AIAgentAssignment.count({
    where: { companyId, isActive: true }
  });

  if (activeCount >= maxAgents) {
    throw new AppError("ERR_MAX_AGENTS_REACHED", 402);
  }

  // Crear asignacion
  const assignment = await AIAgentAssignment.create({
    companyId,
    agentConfigId,
    isActive: true,
    assignedAt: new Date(),
    pricingModel: pricingModel || "included",
    executionQuota: executionQuota || 0,
    monthlyPrice: monthlyPrice || 0,
    metadata: metadata || {}
  } as AIAgentAssignment);

  // Recargar con relacion incluida
  await assignment.reload({
    include: [{ model: AIAgentConfig, as: "agentConfig" }]
  });

  return res.status(201).json({ success: true, data: assignment });
};

// DELETE /ai/agents/assignments/:id — Desactiva asignacion (soft delete)
export const removeAssignment = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const assignment = await AIAgentAssignment.findOne({
    where: { id: parseInt(id, 10), companyId, isActive: true }
  });

  if (!assignment) {
    throw new AppError("ERR_ASSIGNMENT_NOT_FOUND", 404);
  }

  await assignment.update({
    isActive: false,
    deactivatedAt: new Date()
  });

  return res.json({
    success: true,
    message: "Asignacion desactivada correctamente",
    data: assignment
  });
};
