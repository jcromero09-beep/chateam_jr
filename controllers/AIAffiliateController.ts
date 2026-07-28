import { Request, Response } from "express";
import ListService from "../services/AIAffiliateServices/ListService";
import CreateService from "../services/AIAffiliateServices/CreateService";
import GetStatsService from "../services/AIAffiliateServices/GetStatsService";
import AIAffiliateProgram from "../models/AIAffiliateProgram";
import { ok, fail } from "../helpers/apiResponse";

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const programs = await ListService(companyId);
  return ok(res, programs);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { name, commissionRate, description } = req.body;
  const program = await CreateService({ companyId, name, commissionRate, description });
  return ok(res, program, undefined, 201);
};

export const stats = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const data = await GetStatsService(companyId);
  return ok(res, data);
};

export const activate = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const program = await AIAffiliateProgram.findOne({
    where: { id: Number(id), companyId }
  });

  if (!program) {
    return fail(res, "Programa no encontrado", 404);
  }

  await program.update({ status: "active" });
  return ok(res, program);
};

export const deactivate = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const program = await AIAffiliateProgram.findOne({
    where: { id: Number(id), companyId }
  });

  if (!program) {
    return fail(res, "Programa no encontrado", 404);
  }

  await program.update({ status: "inactive" });
  return ok(res, program);
};
