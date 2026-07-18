import { Request, Response } from "express";
import { TicketsAttendance } from "../services/ReportService/TicketsAttendance";
import { TicketsDayService } from "../services/ReportService/TicketsDayService";
import TicketsQueuesService from "../services/TicketServices/TicketsQueuesService";
import GetDashboardDataService from "../services/DashboardServices/GetDashboardDataService";

type IndexQuery = {
  initialDate: string;
  finalDate: string;
  companyId: number | any;
};

type IndexQueryPainel = {
  dateStart: string;
  dateEnd: string;
  status: string[];
  queuesIds: string[];
  showAll: string;
};
export const index = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Validar que req.user existe (viene del middleware isAuth)
    if (!req.user || !req.user.companyId) {
      return res.status(401).json({
        error: "unauthorized",
        message: "Usuario no autenticado o sin companyId"
      });
    }

    const { companyId, id: userId } = req.user;
    const { showAll } = req.query;

    // Usar el nuevo servicio que retorna datos en el formato esperado por el frontend
    const dashboardData = await GetDashboardDataService(companyId, userId, showAll === 'true');
    return res.status(200).json(dashboardData);
  } catch (error) {
    console.error('Error in dashboard controller:', error);
    return res.status(500).json({
      error: "internal_error",
      message: "Error al obtener datos del dashboard"
    });
  }
};

// [Seguridad C-1/S] `companyId` SIEMPRE del token, NUNCA del query string.
// Antes se leía de req.query y la ruta no tenía isAuth => cualquiera sin token podía pedir
// los reportes de cualquier empresa (fuga cross-tenant verificada). El query `companyId`
// se ignora deliberadamente; el tenant lo decide el JWT.
export const reportsUsers = async (req: Request, res: Response): Promise<Response> => {

  if (!req.user || !req.user.companyId) {
    return res.status(401).json({ error: "Usuario no autenticado o sin companyId" });
  }

  const { initialDate, finalDate } = req.query as IndexQuery
  const { companyId } = req.user;

  const { data } = await TicketsAttendance({ initialDate, finalDate, companyId });

  return res.json({ data });

}

export const reportsDay = async (req: Request, res: Response): Promise<Response> => {

  if (!req.user || !req.user.companyId) {
    return res.status(401).json({ error: "Usuario no autenticado o sin companyId" });
  }

  const { initialDate, finalDate } = req.query as IndexQuery
  const { companyId } = req.user;

  const { count, data } = await TicketsDayService({ initialDate, finalDate, companyId });

  return res.json({ count, data });

}

export const DashTicketsQueues = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, profile, id: userId } = req.user;
  const { dateStart, dateEnd, status, queuesIds, showAll } = req.query as IndexQueryPainel;

  const tickets = await TicketsQueuesService({
    showAll: profile === "admin" ? showAll : false,
    dateStart,
    dateEnd,
    status,
    queuesIds,
    userId,
    companyId,
    profile
  });

  return res.status(200).json(tickets);
};
