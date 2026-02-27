import * as Yup from "yup";
import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import axios from "axios";

import ListService from "../services/ContactListItemService/ListService";
import CreateService from "../services/ContactListItemService/CreateService";
import ShowService from "../services/ContactListItemService/ShowService";
import UpdateService from "../services/ContactListItemService/UpdateService";
import DeleteService from "../services/ContactListItemService/DeleteService";
import FindService from "../services/ContactListItemService/FindService";

import ContactListItem from "../models/ContactListItem";
import ContactList from "../models/ContactList";
import Setting from "../models/Setting";

import AppError from "../errors/AppError";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  companyId: string | number;
  contactListId: string | number;
};

type StoreData = {
  name: string;
  number: string;
  contactListId: number;
  companyId?: string;
  email?: string;
};

type FindParams = {
  companyId: number;
  contactListId: number;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber, contactListId } = req.query as IndexQuery;
  const { companyId } = req.user;

  const { contacts, count, hasMore } = await ListService({
    searchParam,
    pageNumber,
    companyId,
    contactListId
  });

  return res.json({ contacts, count, hasMore });
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

  // Verificar si la lista es de email
  const contactList = await ContactList.findByPk(data.contactListId);

  if (!contactList) {
    throw new AppError("Lista de contactos no encontrada", 404);
  }

  // Si es lista de email, crear primero en Acelle Mail
  if (contactList.isEmailList && contactList.acelleListUid) {
    if (!data.email) {
      throw new AppError("Email es requerido para listas de email", 400);
    }

    try {
      await createAcelleSubscriber(contactList.acelleListUid, data, companyId);
    } catch (error: any) {
      console.error("Error creando suscriptor en Acelle Mail:", error.response?.data || error.message);
      throw new AppError(
        `Error al crear suscriptor en Acelle Mail: ${JSON.stringify(error.response?.data || error.message)}`,
        400
      );
    }
  }

  const record = await CreateService({
    ...data,
    companyId
  });

  // Si es lista de email, marcar como valido
  if (contactList.isEmailList && contactList.acelleListUid) {
    record.isWhatsappValid = true;
    await record.save();
  }

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ContactListItem`, {
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

  // Verificar si la lista es de email
  const contactList = await ContactList.findByPk(data.contactListId);

  if (!contactList) {
    throw new AppError("Lista de contactos no encontrada", 404);
  }

  // Si es lista de email, actualizar en Acelle Mail
  if (contactList.isEmailList && contactList.acelleListUid) {
    if (!data.email) {
      throw new AppError("Email es requerido para listas de email", 400);
    }

    try {
      await updateAcelleSubscriber(contactList.acelleListUid, data, companyId);
    } catch (error: any) {
      console.error("Error actualizando suscriptor en Acelle Mail:", error.response?.data || error.message);
    }
  }

  const record = await UpdateService({
    ...data,
    id
  });

  // Si es lista de email, marcar como valido
  if (contactList.isEmailList && contactList.acelleListUid) {
    record.isWhatsappValid = true;
    await record.save();
  }

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ContactListItem`, {
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

  // Obtener el contacto antes de eliminarlo para verificar si es lista de email
  const contact = await ContactListItem.findByPk(id, {
    include: [{ model: ContactList, as: "contactList" }]
  });

  if (contact && contact.contactList?.isEmailList && contact.contactList?.acelleListUid) {
    try {
      await deleteAcelleSubscriber(contact.contactList.acelleListUid, contact.email, companyId);
    } catch (error: any) {
      console.error("Error eliminando suscriptor de Acelle Mail:", error.response?.data || error.message);
    }
  }

  await DeleteService(id);

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-ContactListItem`, {
      action: "delete",
      id
    });

  return res.status(200).json({ message: "Contact deleted" });
};

export const findList = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const params = req.query as unknown as FindParams;
  const records: ContactListItem[] = await FindService(params);

  return res.status(200).json(records);
};

// ========== Acelle Mail API Helpers ==========

async function createAcelleSubscriber(listUid: string, data: StoreData, companyId: number): Promise<void> {
  const emailApiUrl = await Setting.findOne({ where: { key: "emailApiUrl", companyId } });
  const emailApiKey = await Setting.findOne({ where: { key: "emailApiKey", companyId } });

  if (!emailApiUrl?.value || !emailApiKey?.value) {
    throw new AppError("API de email no configurada", 400);
  }

  const apiUrl = emailApiUrl.value;
  const apiToken = emailApiKey.value;

  const params = new URLSearchParams();
  params.append("api_token", apiToken);
  params.append("list_uid", listUid);
  params.append("EMAIL", data.email || "");
  params.append("status", "subscribed");

  const nameParts = data.name.trim().split(" ");
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  if (firstName) {
    params.append("FIRST_NAME", firstName);
  }
  if (lastName) {
    params.append("LAST_NAME", lastName);
  }

  await axios.post(
    `${apiUrl}/subscribers?${params.toString()}`,
    {},
    {
      headers: {
        "Accept": "application/json"
      }
    }
  );
}

async function updateAcelleSubscriber(listUid: string, data: StoreData, companyId: number): Promise<void> {
  const emailApiUrl = await Setting.findOne({ where: { key: "emailApiUrl", companyId } });
  const emailApiKey = await Setting.findOne({ where: { key: "emailApiKey", companyId } });

  if (!emailApiUrl?.value || !emailApiKey?.value) {
    throw new AppError("API de email no configurada", 400);
  }

  const apiUrl = emailApiUrl.value;
  const apiToken = emailApiKey.value;

  const params = new URLSearchParams();
  params.append("api_token", apiToken);
  params.append("list_uid", listUid);
  params.append("EMAIL", data.email || "");

  const nameParts = data.name.trim().split(" ");
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  if (firstName) {
    params.append("FIRST_NAME", firstName);
  }
  if (lastName) {
    params.append("LAST_NAME", lastName);
  }

  await axios.patch(
    `${apiUrl}/subscribers?${params.toString()}`,
    {},
    {
      headers: {
        "Accept": "application/json"
      }
    }
  );
}

async function deleteAcelleSubscriber(listUid: string, email: string, companyId: number): Promise<void> {
  const emailApiUrl = await Setting.findOne({ where: { key: "emailApiUrl", companyId } });
  const emailApiKey = await Setting.findOne({ where: { key: "emailApiKey", companyId } });

  if (!emailApiUrl?.value || !emailApiKey?.value) {
    throw new AppError("API de email no configurada", 400);
  }

  const apiUrl = emailApiUrl.value;
  const apiToken = emailApiKey.value;

  await axios.delete(
    `${apiUrl}/subscribers?api_token=${apiToken}&list_uid=${listUid}&EMAIL=${encodeURIComponent(email)}`
  );
}
