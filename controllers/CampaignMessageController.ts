import { Request, Response } from "express";
import lodash from "lodash";
const { head } = lodash;
import ListCampaignMessagesService from "../services/CampaignMessageServices/ListCampaignMessagesService";
import CountCampaignMessagesByStatusService from "../services/CampaignMessageServices/CountCampaignMessagesByStatusService";
import ShowCampaignMessageService from "../services/CampaignMessageServices/ShowCampaignMessageService";
import UpdateCampaignMessageService from "../services/CampaignMessageServices/UpdateCampaignMessageService";
import FindByTicketIdService from "../services/CampaignMessageServices/FindByTicketIdService";
import CreateCampaignMessageService from "../services/CampaignMessageServices/CreateCampaignMessageService";
import ImportSalesFromExcelService from "../services/CampaignMessageServices/ImportSalesFromExcelService";
import CampaignMessage from "../models/CampaignMessage";

type IndexQuery = {
  searchParam?: string;
  pageNumber?: string;
  channel?: string;
  conversionStatus?: string;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { searchParam, pageNumber, channel, conversionStatus } = req.query as IndexQuery;

  const { campaignMessages, count, hasMore } = await ListCampaignMessagesService({
    companyId,
    searchParam,
    pageNumber,
    channel,
    conversionStatus: conversionStatus as any
  });

  return res.json({ campaignMessages, count, hasMore });
};

// Conteos TOTALES por estado (all/sent/pending/pending_no_value) para los botones de filtro.
export const counts = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { channel } = req.query as { channel?: string };
  const result = await CountCampaignMessagesByStatusService({ companyId, channel });
  return res.json(result);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;

  const campaignMessage = await ShowCampaignMessageService({
    id: Number(id),
    companyId: req.user.companyId
  });

  return res.json(campaignMessage);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { conversionNote } = req.body;

  const campaignMessage = await UpdateCampaignMessageService({
    id: Number(id),
    conversionNote
  });

  return res.json(campaignMessage);
};

export const listByTicket = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;

  const campaignMessages = await FindByTicketIdService({
    ticketId: Number(ticketId)
  });

  return res.json(campaignMessages);
};

export const create = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    ticketId,
    contactId,
    whatsappId,
    sourceId,
    sourceType,
    headline,
    body,
    channel,
    campaignId,
    campaignName
  } = req.body;

  // Validar campos requeridos
  if (!ticketId || !contactId || !sourceId) {
    return res.status(400).json({
      error: "Campos requeridos: ticketId, contactId, sourceId"
    });
  }

  // Validar que no exista ya un CampaignMessage para este ticket
  const existing = await CampaignMessage.findOne({
    where: { ticketId, companyId }
  });

  if (existing) {
    return res.status(400).json({
      error: "Este ticket ya tiene una campaña asignada"
    });
  }

  const campaignMessage = await CreateCampaignMessageService({
    data: {
      companyId,
      ticketId,
      contactId,
      whatsappId,
      sourceId,
      sourceType: sourceType || "MANUAL_ASSIGNMENT",
      headline,
      body,
      channel: channel || "facebook",
      rawData: { campaignId, campaignName, manuallyAssigned: true }
    }
  });

  return res.status(201).json(campaignMessage);
};

export const importSales = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const files = req.files as Express.Multer.File[];
  const file = head(files);
  const { whatsappId } = req.body;

  if (!file) {
    return res.status(400).json({ error: "No se proporcionó un archivo" });
  }

  try {
    const result = await ImportSalesFromExcelService({
      companyId,
      file,
      whatsappId: whatsappId ? Number(whatsappId) : undefined
    });

    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({
      error: `Error al importar ventas: ${error.message}`
    });
  }
};
