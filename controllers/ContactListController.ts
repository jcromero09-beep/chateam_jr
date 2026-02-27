import * as Yup from "yup";
import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import axios from "axios";

import ListService from "../services/ContactListService/ListService";
import CreateService from "../services/ContactListService/CreateService";
import ShowService from "../services/ContactListService/ShowService";
import UpdateService from "../services/ContactListService/UpdateService";
import DeleteService from "../services/ContactListService/DeleteService";
import FindService from "../services/ContactListService/FindService";
import { head } from "lodash";

import ContactList from "../models/ContactList";
import Setting from "../models/Setting";

import AppError from "../errors/AppError";
import { ImportContacts } from "../services/ContactListService/ImportContacts";
import { ImportEmailContacts } from "../services/ContactListService/ImportEmailContacts";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  companyId: string | number;
};

type StoreData = {
  name: string;
  companyId: string;
  isEmailList?: boolean;
  fromEmail?: string;
  fromName?: string;
  contactCompany?: string;
  contactState?: string;
  contactAddress1?: string;
  contactAddress2?: string;
  contactCity?: string;
  contactZip?: string;
  contactPhone?: string;
  contactCountryId?: string;
  contactEmail?: string;
  contactUrl?: string;
  subscribeConfirmation?: boolean;
  sendWelcomeEmail?: boolean;
  unsubscribeNotification?: boolean;
};

type FindParams = {
  companyId: string;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber } = req.query as IndexQuery;
  const { companyId } = req.user;

  const { records, count, hasMore } = await ListService({
    searchParam,
    pageNumber,
    companyId
  });

  return res.json({ records, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
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

  const record = await CreateService({
    ...data,
    companyId
  });

  // Si es una lista para emails, crear en Acelle Mail y guardar el UID
  if (data.isEmailList) {
    try {
      const acelleListUid = await createAcelleList(data, companyId);
      await record.update({ acelleListUid });
    } catch (error: any) {
      console.error("Error creando lista en Acelle Mail:", error.response?.data || error.message);
      await record.destroy();
      throw new AppError(
        `Error al crear lista en Acelle Mail: ${JSON.stringify(error.response?.data || error.message)}`,
        400
      );
    }
  }

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ContactList`, {
      action: "create",
      record
    });

  return res.status(200).json(record);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;

  const record = await ShowService(id);

  return res.status(200).json(record);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const data = req.body as StoreData;
  const { companyId } = req.user;

  const schema = Yup.object().shape({
    name: Yup.string().required()
  });

  try {
    await schema.validate(data);
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const { id } = req.params;

  const record = await UpdateService({
    ...data,
    id
  });

  // Si es lista de email y no tiene acelleListUid, crear en Acelle
  if (data.isEmailList && !record.acelleListUid) {
    try {
      const acelleListUid = await createAcelleList(record, companyId);
      await record.update({ acelleListUid });
    } catch (error) {
      console.error("Error creando lista en Acelle Mail:", error);
    }
  }

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ContactList`, {
      action: "update",
      record
    });

  return res.status(200).json(record);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  // Si tiene acelleListUid, eliminar de Acelle primero
  const contactList = await ContactList.findByPk(id);
  if (contactList?.acelleListUid) {
    try {
      await deleteAcelleList(contactList.acelleListUid, companyId);
    } catch (error) {
      console.error("Error eliminando lista de Acelle Mail:", error);
    }
  }

  await DeleteService(id);

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ContactList`, {
      action: "delete",
      id
    });

  return res.status(200).json({ message: "Lista de contactos borrada" });
};

export const findList = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const records: ContactList[] = await FindService({ companyId: String(companyId) });

  return res.status(200).json(records);
};

export const upload = async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  const file: Express.Multer.File = head(files) as Express.Multer.File;
  const { id } = req.params;
  const { companyId } = req.user;

  // Verificar si la lista es de email
  const contactList = await ContactList.findByPk(id);

  if (!contactList) {
    throw new AppError("Lista de contactos no encontrada", 404);
  }

  // Si es lista de email, usar el servicio de email (Acelle)
  if (contactList.isEmailList && contactList.acelleListUid) {
    const response = await ImportEmailContacts(+id, companyId, file);

    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-ContactListItem-${+id}`, {
        action: "reload",
        records: response.imported
      });

    return res.status(200).json(response);
  }

  // Si no es de email, usar el servicio normal de WhatsApp
  const response = await ImportContacts(+id, companyId, file);

  const io = getIO();

  io.of(String(companyId))
    .emit(`company-${companyId}-ContactListItem-${+id}`, {
      action: "reload",
      records: response
    });

  return res.status(200).json(response);
};

// ========== Acelle Mail API Helpers ==========

async function createAcelleList(data: any, companyId: number): Promise<string> {
  const emailApiUrl = await Setting.findOne({ where: { key: "emailApiUrl", companyId } });
  const emailApiKey = await Setting.findOne({ where: { key: "emailApiKey", companyId } });

  if (!emailApiUrl?.value || !emailApiKey?.value) {
    throw new AppError("API de email no configurada", 400);
  }

  const apiUrl = emailApiUrl.value;
  const apiToken = emailApiKey.value;

  const params = new URLSearchParams();
  params.append("api_token", apiToken);
  params.append("name", data.name);
  params.append("from_email", data.fromEmail || "noreply@ariasofts.com");
  params.append("from_name", data.fromName || "Ariasofts");
  params.append("contact[company]", data.contactCompany || "Empresa");
  params.append("contact[state]", data.contactState || "Estado");
  params.append("contact[address_1]", data.contactAddress1 || "Direccion 1");
  params.append("contact[address_2]", data.contactAddress2 || "");
  params.append("contact[city]", data.contactCity || "Ciudad");
  params.append("contact[zip]", data.contactZip || "00000");
  params.append("contact[phone]", data.contactPhone || "+57 300 000 0000");
  params.append("contact[country_id]", data.contactCountryId || "47");
  params.append("contact[email]", data.contactEmail || "contact@ariasofts.com");
  params.append("contact[url]", data.contactUrl || "");
  params.append("subscribe_confirmation", data.subscribeConfirmation ? "1" : "0");
  params.append("send_welcome_email", data.sendWelcomeEmail ? "1" : "0");
  params.append("unsubscribe_notification", data.unsubscribeNotification ? "1" : "0");

  const response = await axios.post(
    `${apiUrl}/lists?${params.toString()}`,
    {},
    {
      headers: {
        "Accept": "application/json"
      }
    }
  );

  if (!response.data || !response.data.list_uid) {
    throw new AppError(
      `Respuesta invalida de Acelle Mail: ${JSON.stringify(response.data)}`,
      400
    );
  }

  return response.data.list_uid;
}

async function deleteAcelleList(listUid: string, companyId: number): Promise<void> {
  const emailApiUrl = await Setting.findOne({ where: { key: "emailApiUrl", companyId } });
  const emailApiKey = await Setting.findOne({ where: { key: "emailApiKey", companyId } });

  if (!emailApiUrl?.value || !emailApiKey?.value) {
    throw new AppError("API de email no configurada", 400);
  }

  const apiUrl = emailApiUrl.value;
  const apiToken = emailApiKey.value;

  const deleteUrl = `${apiUrl}/lists/${listUid}?api_token=${apiToken}`;

  await axios.delete(deleteUrl, {
    headers: {
      "Accept": "application/json"
    }
  });
}
