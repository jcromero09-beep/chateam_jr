/**
 * WhatsAppMetaDashboardController
 * Controlador para el dashboard de WhatsApp Business API (canal Meta)
 */

import { Request, Response } from "express";
import GetWhatsAppMetaDashboardService from "../services/DashboardServices/GetWhatsAppMetaDashboardService";
import AppError from "../errors/AppError";

export const getDashboard = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;

    const dashboard = await GetWhatsAppMetaDashboardService({ companyId });

    return res.status(200).json(dashboard);
  } catch (error: any) {
    console.error("[WhatsAppMetaDashboard] Error:", error.message);
    throw new AppError(
      error.message || "ERR_WHATSAPP_META_DASHBOARD",
      error.statusCode || 500
    );
  }
};
