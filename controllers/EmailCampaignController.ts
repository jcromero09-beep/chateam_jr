import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import * as Yup from "yup";
import { ValidationError } from "yup";
import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import lodash from "lodash";
const { head } = lodash;
import { Op } from "sequelize";
import fs from "fs";
import path from "path";
import axios from "axios";

import EmailCampaign from "../models/EmailMarketing/EmailCampaign";
import EmailTemplate from "../models/EmailMarketing/EmailTemplate";
import ContactTag from "../models/ContactTag";
import Contact from "../models/Contact";
import ContactList from "../models/ContactList";
import ContactListItem from "../models/ContactListItem";
import Setting from "../models/Setting";

import AppError from "../errors/AppError";
import logger from "../utils/logger";
import EmailTemplateService from "../services/EmailMarketing/EmailTemplateService";
import { EmailMarketingFactory } from "../services/EmailMarketing/providers/EmailMarketingFactory";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  companyId: string | number;
};

type StoreData = {
  name: string;
  subject: string;
  htmlContent: string;
  status: string;
  sendAt: string;
  companyId: number;
  contactListId: number;
  tagListId: number | string;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { searchParam = "", pageNumber = "1" } = req.query as IndexQuery;
    const { companyId } = req.user;

    const limit = 20;
    const offset = limit * (+pageNumber - 1);

    const where: any = { companyId };

    if (searchParam) {
      where.name = { [Op.iLike]: `%${searchParam}%` };
    }

    const { count, rows: records } = await EmailCampaign.findAndCountAll({
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: ContactList,
          as: "contactList",
          attributes: ["id", "name"]
        }
      ]
    });

    const hasMore = count > offset + records.length;

    return res.json({ records, count, hasMore });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailCampaign] Error en index: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const data = req.body as StoreData;

  const schema = Yup.object().shape({
    name: Yup.string().required(),
    subject: Yup.string().required()
  });

  try {
    await schema.validate(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error de validación";
    throw new AppError(msg);
  }

  // Convertir "Nenhuma" a null
  if (data.tagListId === "Nenhuma" || data.tagListId === null || data.tagListId === "") {
    data.tagListId = null as any;
  }

  // Si se selecciono una tag, crear lista de contactos
  if (typeof data.tagListId === 'number') {
    const tagId = data.tagListId;
    const currentDate = new Date();
    const formattedDate = currentDate.toISOString();

    try {
      const contactTags = await ContactTag.findAll({ where: { tagId, companyId } as any });
      const contactIds = contactTags.map((contactTag) => contactTag.contactId);

      const contacts = await Contact.findAll({ where: { id: contactIds, companyId } });

      const randomName = `${data.name} | TAG: ${tagId} - ${formattedDate}`;
      const contactList = await ContactList.create({ name: randomName, companyId: companyId });

      const { id: contactListId } = contactList;

      const contactListItems = contacts.map((contact) => ({
        name: contact.name,
        number: contact.number,
        email: contact.email,
        contactListId,
        companyId: companyId
      }));

      await ContactListItem.bulkCreate(contactListItems);

      data.contactListId = contactListId;
    } catch (error: unknown) {
      // Error creating contact list from tag
      const msg = error instanceof Error ? error.message : "Error desconocido";
      logger.error(`[EmailCampaign] Error creando lista de contactos desde tag: ${msg}`);
    }
  }

  const emailCampaign = await EmailCampaign.create({
    ...data,
    sendAt: data.sendAt ? new Date(data.sendAt) : null,
    companyId,
    status: "INACTIVA"
  } as any);

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-emailCampaign`, {
      action: "create",
      emailCampaign
    });

  return res.status(200).json(emailCampaign);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user;

    const emailCampaign = await EmailCampaign.findOne({
      where: { id, companyId },
      include: [
        {
          model: ContactList,
          as: "contactList",
          attributes: ["id", "name"]
        }
      ]
    });

    if (!emailCampaign) {
      throw new AppError("Email Campaign not found", 404);
    }

    return res.status(200).json(emailCampaign);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailCampaign] Error en show: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user;
    const data = req.body as StoreData;

    const emailCampaign = await EmailCampaign.findOne({
      where: { id, companyId }
    });

    if (!emailCampaign) {
      throw new AppError("Email Campaign not found", 404);
    }

    await emailCampaign.update(data as any);

    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-emailCampaign`, {
        action: "update",
        emailCampaign
      });

    return res.status(200).json(emailCampaign);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailCampaign] Error en update: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user;

    const emailCampaign = await EmailCampaign.findOne({
      where: { id, companyId }
    });

    if (!emailCampaign) {
      throw new AppError("Email Campaign not found", 404);
    }

    // BD SAGRADA: soft delete en vez de destroy
    await emailCampaign.update({ status: "ELIMINADA" });

    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-emailCampaign`, {
        action: "delete",
        emailCampaignId: id
      });

    return res.status(200).json({ message: "Email Campaign deleted" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailCampaign] Error en remove: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }
};

export const mediaUpload = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user;
    const files = req.files as Express.Multer.File[];
    const file = head(files);

    const emailCampaign = await EmailCampaign.findOne({
      where: { id, companyId }
    });

    if (!emailCampaign) {
      throw new AppError("Email Campaign not found", 404);
    }

    await emailCampaign.update({
      mediaPath: file.filename,
      mediaName: file.originalname
    });

    return res.send({ mensagem: "Archivo adjuntado" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailCampaign] Error en mediaUpload: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }
};

export const deleteMedia = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user;

    const emailCampaign = await EmailCampaign.findOne({
      where: { id, companyId }
    });

    if (!emailCampaign) {
      throw new AppError("Email Campaign not found", 404);
    }

    const filePath = path.resolve("public", emailCampaign.mediaPath);
    const fileExists = fs.existsSync(filePath);

    if (fileExists) {
      fs.unlinkSync(filePath);
    }

    await emailCampaign.update({
      mediaPath: null,
      mediaName: null
    });

    return res.send({ message: "Archivo eliminado" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailCampaign] Error en deleteMedia: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }
};

export const cancel = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user;

    const emailCampaign = await EmailCampaign.findOne({
      where: { id, companyId }
    });

    if (!emailCampaign) {
      throw new AppError("Email Campaign not found", 404);
    }

    // Si esta en provider remoto, cancelar alla tambien (best-effort)
    if (emailCampaign.providerCampaignId && emailCampaign.provider) {
      try {
        const provider = await EmailMarketingFactory.getProvider(Number(companyId));
        if (provider.getProviderName() === emailCampaign.provider) {
          const r = await provider.cancelCampaign(emailCampaign.providerCampaignId);
          if (!r.success) {
            logger.warn(
              `[EmailCampaign] cancel remoto fallo: ${r.error}`
            );
          }
        }
      } catch (err) {
        logger.warn(
          `[EmailCampaign] cancel remoto exception: ${(err as Error).message}`
        );
      }
    }

    await emailCampaign.update({ status: "CANCELADA" });

    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-emailCampaign`, {
        action: "update",
        emailCampaign
      });

    return res.status(200).json(emailCampaign);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailCampaign] Error en cancel: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }
};

export const restart = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user;

    const emailCampaign = await EmailCampaign.findOne({
      where: { id, companyId }
    });

    if (!emailCampaign) {
      throw new AppError("Email Campaign not found", 404);
    }

    // Reiniciar campana — cambiar status a BORRADOR para reenvio
    await emailCampaign.update({ status: "BORRADOR" });

    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-emailCampaign`, {
        action: "update",
        emailCampaign
      });

    return res.status(200).json(emailCampaign);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailCampaign] Error en restart: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }
};

/**
 * Endpoint todo-en-uno para crear y lanzar campanas de email masivo
 * POST /email-campaigns/create-and-launch
 * Usa el nuevo sistema de providers (Carbonio/SendGrid/Mailgun/SES)
 */
export const createAndLaunch = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const schema = Yup.object().shape({
    name: Yup.string().required("El nombre de la campana es requerido"),
    subject: Yup.string().required("El asunto del email es requerido"),
    from_email: Yup.string().email("Email invalido"),
    from_name: Yup.string(),
    reply_to: Yup.string().email("Email de respuesta invalido"),
    contactListId: Yup.number().required("El ID de la lista de contactos es requerido"),
    htmlContent: Yup.string().required("El contenido HTML es requerido"),
    templateId: Yup.number().nullable(),
    sendAt: Yup.string().nullable(),
    launchNow: Yup.boolean().default(false),
    sendIntervalSeconds: Yup.number().min(0).max(3600).default(0),
    trackOpens: Yup.boolean().default(true),
    trackClicks: Yup.boolean().default(true)
  });

  let validatedData: {
    name: string;
    subject: string;
    from_email?: string;
    from_name?: string;
    reply_to?: string;
    contactListId: number;
    htmlContent: string;
    templateId?: number;
    sendAt?: string | null;
    launchNow?: boolean;
    sendIntervalSeconds?: number;
    trackOpens?: boolean;
    trackClicks?: boolean;
  };

  try {
    validatedData = await schema.validate(req.body, { abortEarly: false }) as typeof validatedData;
  } catch (err: unknown) {
    if (err instanceof ValidationError) {
      const errors: Record<string, string[]> = {};
      if (err.inner && err.inner.length > 0) {
        err.inner.forEach((error: { path?: string; message: string }) => {
          if (error.path) {
            errors[error.path] = [error.message];
          }
        });
      }
      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors
      });
    }
    const msg = err instanceof Error ? err.message : "Error de validación";
    return res.status(422).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }

  try {
    // 1. Verificar la lista de contactos
    const contactList = await ContactList.findOne({
      where: { id: validatedData.contactListId, companyId }
    });

    if (!contactList) {
      return res.status(404).json({
        success: false,
        message: "Lista de contactos no encontrada"
      });
    }

    // 2. Resolver provider activo de Email Marketing
    const provider = await EmailMarketingFactory.getProvider(Number(companyId));
    const providerName = provider.getProviderName();

    // 3. Decidir dispatchMode
    const sendIntervalSeconds = Number(validatedData.sendIntervalSeconds || 0);
    const dispatchMode: "provider_native" | "individual_queue" =
      sendIntervalSeconds > 0 ? "individual_queue" : "provider_native";

    // 4. Resolver providerListId efectivo (para provider_native)
    const providerListId = contactList.providerListId || contactList.acelleListUid || null;
    if (dispatchMode === "provider_native" && !providerListId) {
      return res.status(400).json({
        success: false,
        message:
          "La lista no esta sincronizada con el provider activo. Edite la lista o use sendIntervalSeconds > 0 para enviar individual."
      });
    }

    // 5. Resolver providerTemplateId si se paso templateId
    let providerTemplateId: string | null = null;
    if (validatedData.templateId) {
      const tpl = await EmailTemplate.findOne({
        where: { id: validatedData.templateId, companyId }
      });
      if (tpl?.providerTemplateId) {
        providerTemplateId = tpl.providerTemplateId;
      }
    }

    // 6. Crear la campana en provider remoto (solo provider_native)
    let providerCampaignId: string | null = null;
    let initialStatus: string;

    if (dispatchMode === "provider_native" && providerListId) {
      const remoteResult = await provider.createCampaign({
        name: validatedData.name,
        subject: validatedData.subject,
        htmlContent: validatedData.htmlContent,
        fromEmail: validatedData.from_email || "",
        fromName: validatedData.from_name || "",
        replyTo: validatedData.reply_to,
        providerListIds: [providerListId],
        providerTemplateId,
        sendAt: validatedData.sendAt ? new Date(validatedData.sendAt) : null,
        trackOpens: validatedData.trackOpens !== false,
        trackClicks: validatedData.trackClicks !== false
      });

      if (!remoteResult.success || !remoteResult.data) {
        return res.status(400).json({
          success: false,
          message: `Error al crear campana en ${providerName}: ${remoteResult.error || "respuesta invalida"}`
        });
      }
      providerCampaignId = remoteResult.data.providerCampaignId;
      initialStatus = "INACTIVA";

      // Si launchNow → start. Si sendAt → schedule.
      if (validatedData.launchNow) {
        const startR = await provider.startCampaign(providerCampaignId);
        if (!startR.success) {
          return res.status(400).json({
            success: false,
            message: `Error al lanzar campana: ${startR.error}`
          });
        }
        initialStatus = "EN_ANDAMENTO";
      } else if (validatedData.sendAt) {
        const schedR = await provider.scheduleCampaign(
          providerCampaignId,
          new Date(validatedData.sendAt)
        );
        if (!schedR.success) {
          return res.status(400).json({
            success: false,
            message: `Error al programar campana: ${schedR.error}`
          });
        }
        initialStatus = "PROGRAMADA";
      }
    } else {
      // dispatchMode === individual_queue: NO crear campana remota, queue local
      initialStatus = validatedData.launchNow ? "EN_ANDAMENTO" : "INACTIVA";
    }

    // 7. Crear la campana en BD local
    const emailCampaign = await EmailCampaign.create({
      name: validatedData.name,
      subject: validatedData.subject,
      htmlContent: validatedData.htmlContent,
      templateId: validatedData.templateId || null,
      status: initialStatus,
      sendAt: validatedData.sendAt ? new Date(validatedData.sendAt) : null,
      contactListId: contactList.id,
      companyId,
      provider: providerName,
      providerCampaignId,
      sendIntervalSeconds,
      dispatchMode,
      settings: {
        launchNow: validatedData.launchNow || false,
        trackOpens: validatedData.trackOpens !== false,
        trackClicks: validatedData.trackClicks !== false,
        fromEmail: validatedData.from_email,
        fromName: validatedData.from_name,
        replyTo: validatedData.reply_to
      }
    } as Partial<EmailCampaign>);

    // 8. Si individual_queue + launchNow → encolar
    if (dispatchMode === "individual_queue" && validatedData.launchNow) {
      const { emailCampaignQueue } = require("../queues");
      // Fix: encolar SIN nombre de job. EmailCampaignQueue usa el procesador POR DEFECTO
      // (queues.ts ~1421, rama else → runJobHandle(jobs/EmailCampaign)). Un job con nombre
      // ("ProcessEmailCampaign") no tenía handler registrado → Bull lanzaba "Missing process
      // handler for job type ProcessEmailCampaign", el job fallaba y la campaña quedaba
      // EN_ANDAMENTO sin enviar NUNCA. Solo CampaignQueue (WhatsApp) usa jobs con nombre.
      await emailCampaignQueue.add({
        campaignId: emailCampaign.id,
        companyId: Number(companyId)
      }, {
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86400, count: 500 }
      });
    }

    const subscribersCount = await ContactListItem.count({
      where: { contactListId: contactList.id }
    });

    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-emailCampaign`, {
        action: "create",
        emailCampaign
      });

    return res.status(200).json({
      success: true,
      message: validatedData.launchNow
        ? "Campana creada y lanzada"
        : validatedData.sendAt
        ? "Campana creada y programada"
        : "Campana creada como borrador",
      data: {
        id: emailCampaign.id,
        name: emailCampaign.name,
        subject: emailCampaign.subject,
        status: emailCampaign.status,
        provider: providerName,
        providerCampaignId,
        dispatchMode,
        contactListId: contactList.id,
        contactListName: contactList.name,
        subscribersCount,
        sendAt: validatedData.sendAt || null,
        createdAt: emailCampaign.createdAt
      }
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailCampaign] Error en create-and-launch: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }
};

// ========== Email Templates CRUD ==========

export const indexTemplates = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { searchParam = "", pageNumber = "1", type, status } = req.query as IndexQuery & { type?: string; status?: string };
    const { companyId } = req.user;

    const result = await EmailTemplateService.list({
      companyId: Number(companyId),
      searchParam,
      pageNumber,
      type: (type as "campaign" | "tx") || undefined,
      status
    });

    return res.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailCampaign] Error en indexTemplates: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }
};

export const storeTemplate = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { name, subject, htmlContent, textContent, previewText, category, type, status, tags } = req.body;

  const schema = Yup.object().shape({
    name: Yup.string().required(),
    subject: Yup.string().required(),
    htmlContent: Yup.string().required()
  });

  try {
    await schema.validate({ name, subject, htmlContent });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error de validación";
    throw new AppError(msg);
  }

  const template = await EmailTemplateService.create(
    Number(companyId),
    Number(userId),
    {
      name,
      subject,
      htmlContent,
      textContent,
      previewText,
      type: type === "tx" ? "tx" : "campaign",
      category: category || "general",
      status: status || "draft",
      tags: Array.isArray(tags) ? tags : []
    }
  );

  return res.status(200).json(template);
};

export const showTemplate = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user;

    const template = await EmailTemplate.findOne({
      where: { id, companyId }
    });

    if (!template) {
      throw new AppError("Template not found", 404);
    }

    return res.status(200).json(template);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailCampaign] Error en showTemplate: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }
};

export const updateTemplate = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user;
    const data = req.body;

    const template = await EmailTemplateService.update(Number(companyId), Number(id), data);

    return res.status(200).json(template);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailCampaign] Error en updateTemplate: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }
};

export const removeTemplate = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user;

    await EmailTemplateService.remove(Number(companyId), Number(id));

    return res.status(200).json({ message: "Template archived" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailCampaign] Error en removeTemplate: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }
};

/**
 * Duplicar plantilla — POST /email-templates/:id/duplicate
 */
export const duplicateTemplate = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId, id: userId } = req.user;
    const copy = await EmailTemplateService.duplicate(
      Number(companyId),
      Number(userId),
      Number(id)
    );
    return res.status(201).json(copy);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailCampaign] Error en duplicateTemplate: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }
};

/**
 * Test send de plantilla — POST /email-templates/:id/test-send
 * Body: { to: string, fromEmail?: string, fromName?: string }
 */
export const sendTemplateTest = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { companyId } = req.user;
    const { to, fromEmail, fromName } = req.body as { to: string; fromEmail?: string; fromName?: string };

    if (!to) throw new AppError("Destinatario (to) es requerido", 400);

    const tpl = await EmailTemplateService.show(Number(companyId), Number(id));
    const provider = await EmailMarketingFactory.getProvider(Number(companyId));

    const result = await provider.sendTest({
      to,
      subject: tpl.subject,
      htmlContent: tpl.htmlContent,
      textContent: tpl.textContent || "",
      fromEmail: fromEmail || "",
      fromName: fromName || ""
    });

    if (!result.success) {
      throw new AppError(`Error enviando prueba: ${result.error || "desconocido"}`, 400);
    }

    return res.status(200).json({ success: true, providerId: result.data?.providerId });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailCampaign] Error en sendTemplateTest: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }
};

// ============================================================================
// Nuevos Endpoints — Email Marketing v2 (Providers + Credits)
// ============================================================================

/**
 * Enviar campana via nuevo sistema (BullMQ + providers)
 */
export const send = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const campaign = await EmailCampaign.findOne({
      where: { id, companyId }
    });

    if (!campaign) {
      throw new AppError("Email Campaign not found", 404);
    }

    if (campaign.status === "FINALIZADA" || campaign.status === "CANCELADA") {
      throw new AppError(`Campana no puede enviarse (status: ${campaign.status})`, 400);
    }

    // C4 fix (anti doble-envío): si la campaña YA está en curso, no re-despachar.
    // Antes solo se bloqueaban FINALIZADA/CANCELADA, así que llamar "enviar" sobre una
    // campaña EN_ANDAMENTO re-encolaba los recipients (status pending/queued) y duplicaba
    // los correos. Para reintentar una campaña atascada hay que resetear su estado primero.
    if (campaign.status === "EN_ANDAMENTO") {
      throw new AppError("La campaña ya está en envío (EN_ANDAMENTO); no se puede volver a enviar para evitar duplicados.", 409);
    }

    const provider = await EmailMarketingFactory.getProvider(Number(companyId));

    // Modo provider_native: pedir al provider que arranque la campana
    if (campaign.dispatchMode === "provider_native" && campaign.providerCampaignId) {
      if (provider.getProviderName() !== campaign.provider) {
        throw new AppError(
          `Provider activo (${provider.getProviderName()}) no coincide con el de la campana (${campaign.provider})`,
          400
        );
      }
      const r = await provider.startCampaign(campaign.providerCampaignId);
      if (!r.success) {
        throw new AppError(`Error al iniciar campana en ${campaign.provider}: ${r.error}`, 400);
      }
      await campaign.update({ status: "EN_ANDAMENTO" });
    } else {
      // Modo individual_queue: encolar BullMQ
      await campaign.update({ status: "EN_ANDAMENTO" });
      const { emailCampaignQueue } = require("../queues");
      // Fix: encolar SIN nombre de job (mismo motivo que en createAndLaunch): el procesador
      // por defecto de EmailCampaignQueue ejecuta jobs/EmailCampaign; con nombre no se procesaba.
      await emailCampaignQueue.add({
        campaignId: Number(id),
        companyId: Number(companyId)
      }, {
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 86400, count: 500 }
      });
    }

    return res.status(200).json({
      success: true,
      message: "Campana en envio",
      data: { campaignId: Number(id), status: "EN_ANDAMENTO", dispatchMode: campaign.dispatchMode }
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailCampaign] Error en send: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }
};

/**
 * Envio de prueba de campana (a un email especifico)
 */
export const testSend = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { email, subject, htmlContent, textContent, fromName, fromEmail } = req.body;

  if (!email || !subject || !htmlContent) {
    return res.status(400).json({
      success: false,
      message: "Email, asunto y contenido HTML son obligatorios",
      errors: ["Campos obligatorios faltantes"]
    });
  }

  try {
    const provider = await EmailMarketingFactory.getProvider(Number(companyId));

    const result = await provider.sendTest({
      to: email,
      subject: `[TEST] ${subject}`,
      htmlContent,
      textContent: textContent || "",
      fromEmail: fromEmail || process.env.MAIL_USER || "noreply@chateam.ws",
      fromName: fromName || "ChatEAM Test"
    });

    return res.status(200).json({
      success: result.success,
      message: result.success
        ? `Email de prueba enviado a ${email}`
        : `Error al enviar email de prueba: ${result.error}`,
      data: result.data
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailCampaign] Error en testSend: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }
};

/**
 * Obtener estadisticas de una campana
 */
export const stats = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const campaign = await EmailCampaign.findOne({
      where: { id, companyId }
    });

    if (!campaign) {
      throw new AppError("Email Campaign not found", 404);
    }

    const EmailCampaignRecipient = require("../models/EmailMarketing/EmailCampaignRecipient").default;
    const { fn, col } = require("sequelize");

    const recipients = await EmailCampaignRecipient.findAll({
      where: { campaignId: id, companyId },
      attributes: [
        "status",
        [fn("COUNT", col("id")), "count"]
      ],
      group: ["status"],
      raw: true
    });

    const statusMap: Record<string, number> = {};
    let total = 0;
    for (const r of recipients) {
      statusMap[(r as any).status] = parseInt((r as any).count, 10);
      total += parseInt((r as any).count, 10);
    }

    const sent = statusMap["sent"] || 0;
    const opened = statusMap["opened"] || 0;
    const clicked = statusMap["clicked"] || 0;
    const bounced = statusMap["bounced"] || 0;
    const failed = statusMap["failed"] || 0;
    const pending = statusMap["pending"] || 0;

    return res.status(200).json({
      success: true,
      message: "Estadisticas obtenidas exitosamente",
      data: {
        campaignId: Number(id),
        campaignName: campaign.name,
        status: campaign.status,
        total,
        sent,
        opened,
        clicked,
        bounced,
        failed,
        pending,
        openRate: sent > 0 ? ((opened / sent) * 100).toFixed(2) : "0.00",
        clickRate: opened > 0 ? ((clicked / opened) * 100).toFixed(2) : "0.00",
        bounceRate: total > 0 ? ((bounced / total) * 100).toFixed(2) : "0.00"
      }
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno del servidor";
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    logger.error(`[EmailCampaign] Error en stats: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: msg,
      errors: [msg]
    });
  }
};
