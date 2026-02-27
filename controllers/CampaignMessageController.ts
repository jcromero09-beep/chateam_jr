import { Request, Response } from "express";
import { head } from "lodash";
import ListCampaignMessagesService from "../services/CampaignMessageServices/ListCampaignMessagesService";
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
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { searchParam, pageNumber, channel } = req.query as IndexQuery;

  const { campaignMessages, count, hasMore } = await ListCampaignMessagesService({
    companyId,
    searchParam,
    pageNumber,
    channel
  });

  return res.json({ campaignMessages, count, hasMore });
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;

  const campaignMessage = await ShowCampaignMessageService({
    id: Number(id)
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
