import { Request, Response } from "express";
import AppError from "../errors/AppError";
import AutomationRule from "../models/AutomationRule";

// [Fase E] CRUD de reglas de automatización de ticket. Ver spec/modules/automation-rules-spec.md
const ensureAdmin = (req: Request): void => {
  if (req.user.profile !== "admin" && !req.user.super) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
};

const VALID_EVENTS = ["ticket_created", "ticket_status_updated", "ticket_queue_updated"];

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const rules = await AutomationRule.findAll({
    where: { companyId },
    order: [["priority", "ASC"], ["id", "ASC"]]
  });
  return res.json(rules);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const rule = await AutomationRule.findOne({ where: { id, companyId } });
  if (!rule) throw new AppError("Regla no encontrada", 404);
  return res.json(rule);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  ensureAdmin(req);
  const { companyId } = req.user;
  const { name, event, conditions, actions, active, priority } = req.body;
  if (!name || !event) throw new AppError("name y event son requeridos", 400);
  if (!VALID_EVENTS.includes(event)) throw new AppError(`event inválido (usar: ${VALID_EVENTS.join(", ")})`, 400);
  const rule = await AutomationRule.create({
    companyId,
    name,
    event,
    conditions: Array.isArray(conditions) ? conditions : [],
    actions: Array.isArray(actions) ? actions : [],
    active: active !== false,
    priority: Number.isInteger(priority) ? priority : 0
  } as any);
  return res.status(201).json(rule);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  ensureAdmin(req);
  const { companyId } = req.user;
  const { id } = req.params;
  const rule = await AutomationRule.findOne({ where: { id, companyId } });
  if (!rule) throw new AppError("Regla no encontrada", 404);
  const { name, event, conditions, actions, active, priority } = req.body;
  if (event && !VALID_EVENTS.includes(event)) throw new AppError("event inválido", 400);
  await rule.update({
    ...(name !== undefined && { name }),
    ...(event !== undefined && { event }),
    ...(conditions !== undefined && { conditions }),
    ...(actions !== undefined && { actions }),
    ...(active !== undefined && { active }),
    ...(priority !== undefined && { priority })
  } as any);
  return res.json(rule);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  ensureAdmin(req);
  const { companyId } = req.user;
  const { id } = req.params;
  const rule = await AutomationRule.findOne({ where: { id, companyId } });
  if (!rule) throw new AppError("Regla no encontrada", 404);
  await rule.destroy();
  return res.status(200).json({ message: "Regla eliminada" });
};
