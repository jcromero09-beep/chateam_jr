import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import ListService from "../services/AIChatbotDomainServices/ListService";
import CreateService from "../services/AIChatbotDomainServices/CreateService";
import UpdateService from "../services/AIChatbotDomainServices/UpdateService";
import DeleteService from "../services/AIChatbotDomainServices/DeleteService";
import AppError from "../errors/AppError";

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const domains = await ListService({ companyId });
  return res.json(domains);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, profile } = req.user;
  if (profile !== "admin") throw new AppError("ERR_NO_PERMISSION", 403);

  const domain = await CreateService({ ...req.body, companyId });

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-ai-domain`, {
    action: "created", domain
  });

  return res.status(201).json(domain);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId, profile } = req.user;
  if (profile !== "admin") throw new AppError("ERR_NO_PERMISSION", 403);

  const domain = await UpdateService({ id: parseInt(id), companyId, ...req.body });

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-ai-domain`, {
    action: "updated", domain
  });

  return res.status(200).json(domain);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId, profile } = req.user;
  if (profile !== "admin") throw new AppError("ERR_NO_PERMISSION", 403);

  await DeleteService(parseInt(id), companyId);

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-ai-domain`, {
    action: "deleted", domainId: parseInt(id)
  });

  return res.status(200).json({ message: "Dominio eliminado" });
};
