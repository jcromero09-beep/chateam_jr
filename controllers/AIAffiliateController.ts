import { Request, Response } from "express";
import ListService from "../services/AIAffiliateServices/ListService";
import CreateService from "../services/AIAffiliateServices/CreateService";
import GetStatsService from "../services/AIAffiliateServices/GetStatsService";
import AIAffiliateProgram from "../models/AIAffiliateProgram";

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const programs = await ListService(companyId);
  return res.json({ success: true, data: programs });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { name, commissionRate, description } = req.body;
  const program = await CreateService({ companyId, name, commissionRate, description });
  return res.status(201).json({ success: true, data: program });
};

export const stats = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const data = await GetStatsService(companyId);
  return res.json({ success: true, data });
};

export const activate = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const program = await AIAffiliateProgram.findOne({
    where: { id: Number(id), companyId }
  });

  if (!program) {
    return res.status(404).json({ success: false, message: "Programa no encontrado" });
  }

  await program.update({ status: "active" });
  return res.json({ success: true, data: program });
};

export const deactivate = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const program = await AIAffiliateProgram.findOne({
    where: { id: Number(id), companyId }
  });

  if (!program) {
    return res.status(404).json({ success: false, message: "Programa no encontrado" });
  }

  await program.update({ status: "inactive" });
  return res.json({ success: true, data: program });
};
