import * as Yup from "yup";
import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import lodash from "lodash";
const { head } = lodash;
import fs from "fs";
import path from "path";

import ListService from "../services/CampaignService/ListService";
import CreateService from "../services/CampaignService/CreateService";
import ShowService from "../services/CampaignService/ShowService";
import UpdateService from "../services/CampaignService/UpdateService";
import DeleteService from "../services/CampaignService/DeleteService";
import FindService from "../services/CampaignService/FindService";

import Campaign from "../models/Campaign";

import ContactTag from "../models/ContactTag";
import Contact from "../models/Contact";
import ContactList from "../models/ContactList";
import ContactListItem from "../models/ContactListItem";

import AppError from "../errors/AppError";
import { CancelService } from "../services/CampaignService/CancelService";
import { RestartService } from "../services/CampaignService/RestartService";
import { add } from "../queues";
import logger from "../utils/logger";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  companyId: string | number;
};

type StoreData = {
  name: string;
  status?: string;
  confirmation?: boolean;
  scheduledAt?: string | null;
  companyId?: number;
  contactListId?: number | null;
  tagListId?: number | string | null;
  whatsappId?: number | null;
  userId?: number | string | null;
  queueId?: number | string | null;
  statusTicket?: string;
  openTicket?: string;
  message1?: string;
  message2?: string;
  message3?: string;
  message4?: string;
  message5?: string;
  confirmationMessage1?: string;
  confirmationMessage2?: string;
  confirmationMessage3?: string;
  confirmationMessage4?: string;
  confirmationMessage5?: string;
  // ========================================
  // CAMPOS PARA PLANTILLAS META
  // ========================================
  useTemplate?: boolean;
  whastsAppTemplateId?: number | null;
  templateParams?: Record<string, string>;
};

type FindParams = {
  companyId: string;
};

export const index = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { searchParam, pageNumber } = req.query as IndexQuery;
  const { companyId } = req.user;

  const { records, count, hasMore } = await ListService({
    searchParam,
    pageNumber,
    companyId
  });

  return res.json({ records, count, hasMore });
};

export const store = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const data = req.body as StoreData;

  const schema = Yup.object().shape({
    name: Yup.string().required()
  });

  try {
    await schema.validate(data);
  } catch (err: any) {
    throw new AppError(err.message);
  }

  // Si viene tagListId como número, genera ContactList dinámicamente
  if (typeof data.tagListId === "number") {
    const tagId = data.tagListId;
    const campanhaNome = data.name;

    const createContactListFromTag = async (tagIdParam: number): Promise<number> => {
      const currentDate = new Date();
      const formattedDate = currentDate.toISOString();

      const contactTags = await ContactTag.findAll({ where: { tagId: tagIdParam } });
      const contactIds = contactTags.map(ct => ct.contactId);

      const contacts = await Contact.findAll({ where: { id: contactIds } });

      const randomName = `${campanhaNome} | TAG: ${tagIdParam} - ${formattedDate}`;
      const contactList = await ContactList.create({
        name: randomName,
        companyId
      } as any);

      const { id: contactListId } = contactList;

      const contactListItems = contacts.map(contact => ({
        name: contact.name,
        number: contact.number,
        email: contact.email,
        contactListId,
        companyId,
        isWhatsappValid: true,
        isGroup: contact.isGroup
      }));

      await ContactListItem.bulkCreate(contactListItems as any);

      return contactListId;
    };

    try {
      const contactListId = await createContactListFromTag(tagId);

      const record = await CreateService({
        ...data,
        companyId,
        contactListId
      });

      const io = getIO();
      io.of(String(companyId)).emit(`company-${companyId}-campaign`, {
        action: "create",
        record
      });

      if (record.status === "EM_ANDAMENTO") {
        logger.info(
          { campaignId: record.id, companyId },
          "[CampaignStore] EM_ANDAMENTO guardada; worker la procesará"
        );
      } else if (record.status === "PROGRAMADA") {
        logger.info(
          {
            campaignId: record.id,
            companyId,
            scheduledAt: record.scheduledAt
          },
          "[CampaignStore] PROGRAMADA guardada; worker la procesará en tiempo"
        );
      } else {
        logger.info(
          { campaignId: record.id, companyId, status: record.status },
          "[CampaignStore] Campaña guardada"
        );
      }

      return res.status(200).json(record);
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error(
        { err: err?.message, companyId },
        "[CampaignStore] Error creando campaña desde tagListId"
      );
      throw new AppError(
        err?.message || "Error creando campaña desde etiqueta",
        500
      );
    }
  }

  const record = await CreateService({
    ...data,
    companyId
  });

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-campaign`, {
    action: "create",
    record
  });

  if (record.status === "EM_ANDAMENTO") {
    logger.info(
      { campaignId: record.id, companyId },
      "[CampaignStore] EM_ANDAMENTO guardada; worker la procesará"
    );
  } else if (record.status === "PROGRAMADA") {
    logger.info(
      {
        campaignId: record.id,
        companyId,
        scheduledAt: record.scheduledAt
      },
      "[CampaignStore] PROGRAMADA guardada; worker la procesará en tiempo"
    );
  } else {
    logger.info(
      { campaignId: record.id, companyId, status: record.status },
      "[CampaignStore] Campaña guardada"
    );
  }

  return res.status(200).json(record);
};

export const show = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  const record = await ShowService(id, companyId);

  return res.status(200).json(record);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const data = req.body as StoreData;
  const { companyId } = req.user;
  const { id } = req.params;

  // Validación mínima de nombre si viene (el service refuerza mínimos)
  if (typeof data.name === "string") {
    const schema = Yup.object().shape({
      name: Yup.string().min(3)
    });
    try {
      await schema.validate({ name: data.name });
    } catch (err: any) {
      throw new AppError(err.message);
    }
  }

  const record = await UpdateService({
    id,
    data,
    companyId
  });

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-campaign`, {
    action: "update",
    record
  });

  if (record.status === "EM_ANDAMENTO") {
    logger.info(
      { campaignId: record.id, companyId },
      "[CampaignUpdate] EM_ANDAMENTO: encolando en worker"
    );
    add("CampaignQueue", { id: record.id, companyId });
  } else {
    logger.info(
      { campaignId: record.id, companyId, status: record.status },
      "[CampaignUpdate] Actualizada sin encolar"
    );
  }

  return res.status(200).json(record);
};

export const cancel = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;

  await CancelService(+id);

  return res.status(204).json({ message: "Cancelamento realizado" });
};

export const restart = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  await RestartService(+id);

  logger.info(
    { campaignId: id, companyId },
    "[CampaignRestart] Reiniciando y encolando en worker"
  );
  add("CampaignQueue", { id, companyId });

  return res.status(204).json({ message: "Reinício dos disparos" });
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  await DeleteService(id, companyId);

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-campaign`, {
    action: "delete",
    id
  });

  return res.status(200).json({ message: "Campaña eliminada" });
};

// [Seguridad C-1/S] `companyId` del token, NUNCA del query: antes leía req.query e ignoraba
// req.user, así que un usuario autenticado podía listar campañas de OTRA empresa con
// ?companyId=N, y sin el parámetro reventaba en 500 (companyId undefined).
export const findList = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const records: Campaign[] = await FindService({ companyId: String(companyId) });

  return res.status(200).json(records);
};

export const mediaUpload = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const files = req.files as Express.Multer.File[];
  const file = head(files);

  try {
    const campaign = await Campaign.findByPk(id);
    if (!campaign) {
      throw new AppError("ERR_NO_CAMPAIGN_FOUND", 404);
    }
    campaign.mediaPath = file.filename;
    campaign.mediaName = file.originalname;
    await campaign.save();
    return res.send({ mensagem: "Mensagem enviada" });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(err.message);
  }
};

export const deleteMedia = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const campaign = await Campaign.findByPk(id);
    if (!campaign) {
      throw new AppError("ERR_NO_CAMPAIGN_FOUND", 404);
    }
    const filePath = path.resolve(
      "public",
      `company${companyId}`,
      campaign.mediaPath
    );
    const fileExists = fs.existsSync(filePath);
    if (fileExists) {
      fs.unlinkSync(filePath);
    }

    campaign.mediaPath = null;
    campaign.mediaName = null;
    await campaign.save();
    return res.send({ mensagem: "Arquivo excluído" });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(err.message);
  }
};
