import * as Yup from "yup";
import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import { head } from "lodash";
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
  } catch (err: any) {
    throw new AppError(err.message);
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
      const contactTags = await ContactTag.findAll({ where: { tagId } });
      const contactIds = contactTags.map((contactTag) => contactTag.contactId);

      const contacts = await Contact.findAll({ where: { id: contactIds } });

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
    } catch (error) {
      // Error creating contact list from tag
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
};

export const update = async (req: Request, res: Response): Promise<Response> => {
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
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  const emailCampaign = await EmailCampaign.findOne({
    where: { id, companyId }
  });

  if (!emailCampaign) {
    throw new AppError("Email Campaign not found", 404);
  }

  if (emailCampaign.acelleCampaignUid) {
    try {
      await deleteAcelleCampaign(emailCampaign.acelleCampaignUid, companyId);
    } catch (error) {
      console.error("Error eliminando campana de Acelle Mail:", error);
    }
  }

  await emailCampaign.destroy();

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-emailCampaign`, {
      action: "delete",
      emailCampaignId: id
    });

  return res.status(200).json({ message: "Email Campaign deleted" });
};

export const mediaUpload = async (req: Request, res: Response): Promise<Response> => {
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
};

export const deleteMedia = async (req: Request, res: Response): Promise<Response> => {
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
};

export const cancel = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  const emailCampaign = await EmailCampaign.findOne({
    where: { id, companyId }
  });

  if (!emailCampaign) {
    throw new AppError("Email Campaign not found", 404);
  }

  if (emailCampaign.status === "EN_ANDAMENTO" && emailCampaign.acelleCampaignUid) {
    try {
      await pauseAcelleCampaign(emailCampaign.acelleCampaignUid, companyId);
    } catch (error) {
      console.error("Error pausando campana en Acelle Mail:", error);
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
};

export const restart = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  const emailCampaign = await EmailCampaign.findOne({
    where: { id, companyId }
  });

  if (!emailCampaign) {
    throw new AppError("Email Campaign not found", 404);
  }

  // Si ya tiene acelleCampaignUid, solo ejecutar /run
  if (emailCampaign.acelleCampaignUid) {
    try {
      await runAcelleCampaign(emailCampaign.acelleCampaignUid, companyId);

      await emailCampaign.update({ status: "EN_ANDAMENTO" });

      const io = getIO();
      io.of(String(companyId))
        .emit(`company-${companyId}-emailCampaign`, {
          action: "update",
          emailCampaign
        });

      return res.status(200).json(emailCampaign);
    } catch (error) {
      console.error("Error ejecutando campana existente:", error);
      throw error;
    }
  }

  // Si NO tiene acelleCampaignUid, crear nueva campana en Acelle
  await emailCampaign.update({ status: "EN_ANDAMENTO" });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-emailCampaign`, {
      action: "update",
      emailCampaign
    });

  await sendEmailCampaign(emailCampaign);

  return res.status(200).json(emailCampaign);
};

// ========== Acelle Mail API Helpers ==========

async function sendEmailCampaign(emailCampaign: EmailCampaign) {
  try {
    const companyId = emailCampaign.companyId;
    const emailApiUrl = await Setting.findOne({ where: { key: "emailApiUrl", companyId } });
    const emailApiKey = await Setting.findOne({ where: { key: "emailApiKey", companyId } });

    if (!emailApiUrl || !emailApiUrl.value || !emailApiKey || !emailApiKey.value) {
      throw new AppError("API de email no configurada", 400);
    }

    const apiUrl = emailApiUrl.value;
    const apiToken = emailApiKey.value;

    const contactList = await ContactList.findByPk(emailCampaign.contactListId);

    if (!contactList) {
      throw new AppError("Lista de contactos no encontrada", 404);
    }

    if (!contactList.isEmailList || !contactList.acelleListUid) {
      throw new AppError("La lista seleccionada no esta configurada para envio de emails masivos", 400);
    }

    const params = new URLSearchParams();
    params.append("api_token", apiToken);
    params.append("mail_list_uid", contactList.acelleListUid);
    params.append("name", emailCampaign.name);
    params.append("subject", emailCampaign.subject);
    params.append("from_email", contactList.fromEmail || "noreply@ariasofts.com");
    params.append("from_name", contactList.fromName || "Sistema de Email");
    params.append("reply_to", contactList.fromEmail || "noreply@ariasofts.com");
    params.append("track_open", "true");
    params.append("track_click", "true");
    params.append("sign_dkim", "false");
    params.append("skip_failed_messages", "false");
    params.append("html", emailCampaign.htmlContent);

    const requestUrl = `${apiUrl}/campaigns?${params.toString()}`;

    const createCampaignResponse = await axios.post(
      requestUrl,
      {},
      {
        headers: {
          "Accept": "application/json"
        }
      }
    );

    const campaignUid =
      createCampaignResponse.data.campaign?.uid ||
      createCampaignResponse.data.campaign_uid ||
      createCampaignResponse.data.attributes?.uid;

    if (!campaignUid) {
      throw new AppError(
        `No se pudo obtener el UID de la campana: ${JSON.stringify(createCampaignResponse.data)}`,
        400
      );
    }

    await emailCampaign.update({
      acelleCampaignUid: campaignUid,
      status: "PROGRAMADA"
    });

  } catch (error: any) {
    console.error("Error enviando campana de email:", error.response?.data || error.message);
    await emailCampaign.update({ status: "CANCELADA" });
    throw new AppError(
      `Error al enviar campana: ${JSON.stringify(error.response?.data || error.message)}`,
      500
    );
  }
}

async function runAcelleCampaign(campaignUid: string, companyId: number): Promise<void> {
  const emailApiUrl = await Setting.findOne({ where: { key: "emailApiUrl", companyId } });
  const emailApiKey = await Setting.findOne({ where: { key: "emailApiKey", companyId } });

  if (!emailApiUrl?.value || !emailApiKey?.value) {
    throw new AppError("API de email no configurada", 400);
  }

  const apiUrl = emailApiUrl.value;
  const apiToken = emailApiKey.value;

  const params = new URLSearchParams();
  params.append("api_token", apiToken);

  const runUrl = `${apiUrl}/campaigns/${campaignUid}/run?${params.toString()}`;

  await axios.post(
    runUrl,
    {},
    {
      headers: {
        "Accept": "application/json"
      }
    }
  );
}

async function pauseAcelleCampaign(campaignUid: string, companyId: number): Promise<void> {
  const emailApiUrl = await Setting.findOne({ where: { key: "emailApiUrl", companyId } });
  const emailApiKey = await Setting.findOne({ where: { key: "emailApiKey", companyId } });

  if (!emailApiUrl?.value || !emailApiKey?.value) {
    throw new AppError("API de email no configurada", 400);
  }

  const apiUrl = emailApiUrl.value;
  const apiToken = emailApiKey.value;

  const params = new URLSearchParams();
  params.append("api_token", apiToken);

  const pauseUrl = `${apiUrl}/campaigns/${campaignUid}/pause?${params.toString()}`;

  await axios.post(
    pauseUrl,
    {},
    {
      headers: {
        "Accept": "application/json"
      }
    }
  );
}

async function deleteAcelleCampaign(campaignUid: string, companyId: number): Promise<void> {
  const emailApiUrl = await Setting.findOne({ where: { key: "emailApiUrl", companyId } });
  const emailApiKey = await Setting.findOne({ where: { key: "emailApiKey", companyId } });

  if (!emailApiUrl?.value || !emailApiKey?.value) {
    throw new AppError("API de email no configurada", 400);
  }

  const apiUrl = emailApiUrl.value;
  const apiToken = emailApiKey.value;

  const deleteUrl = `${apiUrl}/campaigns/${campaignUid}?api_token=${apiToken}`;

  await axios.delete(deleteUrl, {
    headers: {
      "Accept": "application/json"
    }
  });
}

/**
 * Endpoint todo-en-uno para crear y lanzar campanas de email masivo
 * POST /email-campaigns/create-and-launch
 */
export const createAndLaunch = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const schema = Yup.object().shape({
    name: Yup.string().required("El nombre de la campana es requerido"),
    subject: Yup.string().required("El asunto del email es requerido"),
    from_email: Yup.string().email("Email invalido").required("El email remitente es requerido"),
    from_name: Yup.string().required("El nombre del remitente es requerido"),
    reply_to: Yup.string().email("Email de respuesta invalido").required("El email de respuesta es requerido"),
    mail_list_uid: Yup.string().required("El UID de la lista es requerido"),
    html: Yup.string().required("El contenido HTML es requerido"),
    run_at: Yup.string().nullable().matches(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, "Formato debe ser Y-m-d H:i:s"),
    launch_now: Yup.boolean().default(false),
    track_open: Yup.boolean().default(false),
    track_click: Yup.boolean().default(false),
    sign_dkim: Yup.boolean().default(false)
  });

  let validatedData: any;
  try {
    validatedData = await schema.validate(req.body, { abortEarly: false });
  } catch (err: any) {
    const errors: Record<string, string[]> = {};
    if (err.inner && err.inner.length > 0) {
      err.inner.forEach((error: any) => {
        if (error.path) {
          errors[error.path] = [error.message];
        }
      });
    }
    return res.status(422).json({
      status: 0,
      message: "Validation failed",
      errors
    });
  }

  try {
    // 1. Buscar la lista por mail_list_uid
    const contactList = await ContactList.findOne({
      where: {
        acelleListUid: validatedData.mail_list_uid,
        companyId
      }
    });

    if (!contactList) {
      return res.status(404).json({
        status: 0,
        message: "Mail list not found"
      });
    }

    // 2. Crear la campana en la base de datos local
    const emailCampaign = await EmailCampaign.create({
      name: validatedData.name,
      subject: validatedData.subject,
      htmlContent: validatedData.html,
      status: validatedData.launch_now ? "EN_ANDAMENTO" : "INACTIVA",
      sendAt: validatedData.run_at ? new Date(validatedData.run_at) : null,
      contactListId: contactList.id,
      companyId
    });

    // 3. Crear campana en Acelle Mail
    const emailApiUrl = await Setting.findOne({ where: { key: "emailApiUrl", companyId } });
    const emailApiKey = await Setting.findOne({ where: { key: "emailApiKey", companyId } });

    if (!emailApiUrl?.value || !emailApiKey?.value) {
      throw new AppError("API de email no configurada", 400);
    }

    const apiUrl = emailApiUrl.value;
    const apiToken = emailApiKey.value;

    const params = new URLSearchParams();
    params.append("api_token", apiToken);
    params.append("mail_list_uid", validatedData.mail_list_uid);
    params.append("name", validatedData.name);
    params.append("subject", validatedData.subject);
    params.append("from_email", validatedData.from_email);
    params.append("from_name", validatedData.from_name);
    params.append("reply_to", validatedData.reply_to);
    params.append("track_open", validatedData.track_open ? "yes" : "no");
    params.append("track_click", validatedData.track_click ? "yes" : "no");
    params.append("sign_dkim", validatedData.sign_dkim ? "yes" : "no");
    params.append("html", validatedData.html);

    if (validatedData.run_at) {
      const fecha = new Date(validatedData.run_at + ' GMT-0500');
      const runAtUTC = fecha.toISOString().slice(0, 19).replace('T', ' ');
      params.append("run_at", runAtUTC);
    }

    const createCampaignResponse = await axios.post(
      `${apiUrl}/campaigns?${params.toString()}`,
      {},
      { headers: { "Accept": "application/json" } }
    );

    const campaignUid =
      createCampaignResponse.data.campaign?.uid ||
      createCampaignResponse.data.campaign_uid ||
      createCampaignResponse.data.attributes?.uid;

    if (!campaignUid) {
      throw new AppError("No se pudo obtener el UID de la campana de Acelle", 400);
    }

    await emailCampaign.update({
      acelleCampaignUid: campaignUid
    });

    // 4. Si launch_now = true, ejecutar la campana
    if (validatedData.launch_now) {
      const runParams = new URLSearchParams();
      runParams.append("api_token", apiToken);

      await axios.post(
        `${apiUrl}/campaigns/${campaignUid}/run?${runParams.toString()}`,
        {},
        { headers: { "Accept": "application/json" } }
      );

      await emailCampaign.update({ status: "EN_ANDAMENTO" });
    }

    // 5. Respuesta
    const responseData = {
      status: 1,
      message: validatedData.launch_now
        ? "Campaign created and launched"
        : validatedData.run_at
        ? "Campaign created and scheduled"
        : "Campaign created",
      campaign: {
        id: emailCampaign.id,
        uid: campaignUid,
        name: emailCampaign.name,
        subject: emailCampaign.subject,
        htmlContent: emailCampaign.htmlContent,
        from_email: validatedData.from_email,
        from_name: validatedData.from_name,
        reply_to: validatedData.reply_to,
        status: validatedData.launch_now
          ? "sending"
          : validatedData.run_at
          ? "queued"
          : "new",
        mail_list_uid: validatedData.mail_list_uid,
        mail_list_name: contactList.name,
        contactListId: contactList.id,
        run_at: validatedData.run_at || null,
        subscribers_count: await ContactListItem.count({
          where: { contactListId: contactList.id }
        }),
        created_at: emailCampaign.createdAt,
        updatedAt: emailCampaign.updatedAt
      }
    };

    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-emailCampaign`, {
        action: "create",
        emailCampaign
      });

    return res.status(200).json(responseData);

  } catch (error: any) {
    console.error("Error en create-and-launch:", error.response?.data || error.message);

    return res.status(500).json({
      status: 0,
      message: error.message || "Error al crear la campana",
      error: error.response?.data || error.message
    });
  }
};

// ========== Email Templates CRUD ==========

export const indexTemplates = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam = "", pageNumber = "1" } = req.query as IndexQuery;
  const { companyId } = req.user;

  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  const where: any = { companyId };

  if (searchParam) {
    where.name = { [Op.iLike]: `%${searchParam}%` };
  }

  const { count, rows: records } = await EmailTemplate.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]]
  });

  const hasMore = count > offset + records.length;

  return res.json({ records, count, hasMore });
};

export const storeTemplate = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { name, subject, htmlContent, category } = req.body;

  const schema = Yup.object().shape({
    name: Yup.string().required(),
    subject: Yup.string().required(),
    htmlContent: Yup.string().required()
  });

  try {
    await schema.validate({ name, subject, htmlContent });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const template = await EmailTemplate.create({
    name,
    subject,
    htmlContent,
    category: category || "general",
    companyId,
    createdBy: userId,
    status: "active"
  } as any);

  return res.status(200).json(template);
};

export const showTemplate = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  const template = await EmailTemplate.findOne({
    where: { id, companyId }
  });

  if (!template) {
    throw new AppError("Template not found", 404);
  }

  return res.status(200).json(template);
};

export const updateTemplate = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;
  const data = req.body;

  const template = await EmailTemplate.findOne({
    where: { id, companyId }
  });

  if (!template) {
    throw new AppError("Template not found", 404);
  }

  await template.update(data);

  return res.status(200).json(template);
};

export const removeTemplate = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  const template = await EmailTemplate.findOne({
    where: { id, companyId }
  });

  if (!template) {
    throw new AppError("Template not found", 404);
  }

  await template.destroy();

  return res.status(200).json({ message: "Template deleted" });
};
