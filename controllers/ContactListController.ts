import * as Yup from "yup";
import { Request, Response } from "express";
import lodash from "lodash";
const { head } = lodash;
import { getIO } from "../libs/socket";
import logger from "../utils/logger";

import ListService from "../services/ContactListService/ListService";
import CreateService from "../services/ContactListService/CreateService";
import ShowService from "../services/ContactListService/ShowService";
import UpdateService from "../services/ContactListService/UpdateService";
import DeleteService from "../services/ContactListService/DeleteService";
import FindService from "../services/ContactListService/FindService";

import ContactList from "../models/ContactList";
import { ImportContacts } from "../services/ContactListService/ImportContacts";
import { ImportEmailContacts } from "../services/ContactListService/ImportEmailContacts";
import { EmailMarketingFactory } from "../services/EmailMarketing/providers/EmailMarketingFactory";

import AppError from "../errors/AppError";

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

// ============================================================================
// Helpers de provider
// ============================================================================

/**
 * Sincroniza la lista local con el provider activo (Listmonk/Acelle).
 * Retorna { provider, providerListId } para guardar en BD.
 * Lanza AppError si no hay provider activo y la lista es de email.
 */
async function syncListWithProvider(
  data: StoreData,
  companyId: number
): Promise<{ provider: string; providerListId: string }> {
  const provider = await EmailMarketingFactory.getProvider(companyId);
  const result = await provider.createList({
    name: data.name,
    fromEmail: data.fromEmail,
    fromName: data.fromName,
    contactCompany: data.contactCompany,
    contactState: data.contactState,
    contactAddress1: data.contactAddress1,
    contactAddress2: data.contactAddress2,
    contactCity: data.contactCity,
    contactZip: data.contactZip,
    contactPhone: data.contactPhone,
    contactCountryId: data.contactCountryId,
    contactEmail: data.contactEmail,
    contactUrl: data.contactUrl,
    subscribeConfirmation: data.subscribeConfirmation,
    sendWelcomeEmail: data.sendWelcomeEmail,
    unsubscribeNotification: data.unsubscribeNotification
  });

  if (!result.success || !result.data) {
    throw new AppError(
      `Error al crear lista en ${provider.getProviderName()}: ${result.error || "respuesta invalida"}`,
      400
    );
  }

  return {
    provider: provider.getProviderName(),
    providerListId: result.data.providerListId
  };
}

/**
 * Eliminar lista del provider externo. No bloquea si falla (best-effort).
 */
async function removeListFromProvider(
  list: ContactList,
  companyId: number
): Promise<void> {
  // Identificar provider efectivo + providerListId efectivo
  const providerName = list.provider || (list.acelleListUid ? "acelle" : null);
  const providerListId = list.providerListId || list.acelleListUid;

  if (!providerName || !providerListId) return; // nada que sincronizar

  try {
    const provider = await EmailMarketingFactory.getProvider(companyId);
    if (provider.getProviderName() !== providerName) {
      logger.warn(
        `[ContactListController] Lista ${list.id} fue creada con provider '${providerName}' pero el activo es '${provider.getProviderName()}'. Skip remote delete.`
      );
      return;
    }
    const result = await provider.deleteList(providerListId);
    if (!result.success) {
      logger.warn(
        `[ContactListController] Error al eliminar lista en ${providerName}: ${result.error}`
      );
    }
  } catch (err) {
    logger.warn(
      `[ContactListController] removeListFromProvider fallo: ${(err as Error).message}`
    );
  }
}

// ============================================================================
// Endpoints
// ============================================================================

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

  // Si es lista de email, validar provider activo ANTES de crear local
  let providerSync: { provider: string; providerListId: string } | null = null;
  if (data.isEmailList) {
    providerSync = await syncListWithProvider(data, Number(companyId));
  }

  const record = await CreateService({
    ...data,
    companyId
  } as any);

  // Persistir campos extra de email (incluyendo provider sync)
  const updates: Record<string, unknown> = {};
  if (data.isEmailList) updates.isEmailList = true;
  if (providerSync) {
    updates.provider = providerSync.provider;
    updates.providerListId = providerSync.providerListId;
    // Mantener acelleListUid en sincronia para compatibilidad si es Acelle
    if (providerSync.provider === "acelle") {
      updates.acelleListUid = providerSync.providerListId;
    }
  }
  // Otros campos opcionales del form
  for (const key of [
    "fromEmail", "fromName", "contactCompany", "contactState",
    "contactAddress1", "contactAddress2", "contactCity", "contactZip",
    "contactPhone", "contactCountryId", "contactEmail", "contactUrl",
    "subscribeConfirmation", "sendWelcomeEmail", "unsubscribeNotification"
  ] as const) {
    if (data[key] !== undefined) {
      updates[key] = data[key];
    }
  }
  if (Object.keys(updates).length > 0) {
    await record.update(updates);
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

  const record = await ShowService(id, req.user.companyId);

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

  // Si pasa de NO email a SI email, sincronizar con provider
  const existing = await ContactList.findByPk(id);
  if (!existing) throw new AppError("Lista no encontrada", 404);

  let providerSync: { provider: string; providerListId: string } | null = null;
  const becomingEmailList =
    data.isEmailList && !existing.providerListId && !existing.acelleListUid;

  if (becomingEmailList) {
    providerSync = await syncListWithProvider(data, Number(companyId));
  }

  const record = await UpdateService({
    ...data,
    id
  } as any);

  // Persistir campos opcionales + sync info
  const updates: Record<string, unknown> = {};
  if (data.isEmailList !== undefined) updates.isEmailList = data.isEmailList;
  if (providerSync) {
    updates.provider = providerSync.provider;
    updates.providerListId = providerSync.providerListId;
    if (providerSync.provider === "acelle") {
      updates.acelleListUid = providerSync.providerListId;
    }
  }
  for (const key of [
    "fromEmail", "fromName", "contactCompany", "contactState",
    "contactAddress1", "contactAddress2", "contactCity", "contactZip",
    "contactPhone", "contactCountryId", "contactEmail", "contactUrl",
    "subscribeConfirmation", "sendWelcomeEmail", "unsubscribeNotification"
  ] as const) {
    if (data[key] !== undefined) {
      updates[key] = data[key];
    }
  }
  if (Object.keys(updates).length > 0) {
    await record.update(updates);
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

  // [W1-SEC-12] Acota al tenant ANTES de la limpieza en el proveedor: con findByPk
  // un id ajeno disparaba removeListFromProvider sobre la lista de otra empresa.
  const contactList = await ContactList.findOne({ where: { id, companyId } });

  if (contactList?.isEmailList) {
    await removeListFromProvider(contactList, Number(companyId));
  }

  await DeleteService(id, companyId);

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

  const contactList = await ContactList.findByPk(id);

  if (!contactList) {
    throw new AppError("Lista de contactos no encontrada", 404);
  }

  // Si es lista de email, importar con sync a provider
  if (contactList.isEmailList) {
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
