import { Request, Response } from "express";
import ListByMonthService from "../services/CompanyTokenUsageService/ListByMonthService";
import HistoryService from "../services/CompanyTokenUsageService/HistoryService";
import DashboardStatsService from "../services/CompanyTokenUsageService/DashboardStatsService";

export const indexByMonth = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user as { companyId: number };
  const { month, searchParam = "", pageNumber = "1" } = req.query as any;

  if (!month) {
    return res.status(400).json({ error: "El parámetro 'month' es obligatorio (formato YYYY-MM)" });
  }

  const result = await ListByMonthService({
    companyId,
    month,
    searchParam,
    pageNumber
  });

  return res.json(result);
};

export const indexHistory = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user as { companyId: number };
  const { searchParam = "", pageNumber = "1" } = req.query as any;

  const result = await HistoryService({
    companyId,
    searchParam,
    pageNumber
  });

  return res.json(result);
};

export const dashboardStats = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user as { companyId: number };
  const { timeRange = "30d" } = req.query as any;

  const result = await DashboardStatsService({
    companyId,
    timeRange
  });

  return res.json(result);
};
