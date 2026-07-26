import * as Yup from "yup";
import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import logger from "../utils/logger";

import ListService from "../services/ContactListItemService/ListService";
import CreateService from "../services/ContactListItemService/CreateService";
import ShowService from "../services/ContactListItemService/ShowService";
import UpdateService from "../services/ContactListItemService/UpdateService";
import DeleteService from "../services/ContactListItemService/DeleteService";
import FindService from "../services/ContactListItemService/FindService";

import ContactListItem from "../models/ContactListItem";
import ContactList from "../models/ContactList";

import AppError from "../errors/AppError";
import { EmailMarketingFactory } from "../services/EmailMarketing/providers/EmailMarketingFactory";
import { EmailMarketingProvider } from "../services/EmailMarketing/providers/EmailMarketingProvider";

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

// ============================================================================
// Helpers de provider
// ============================================================================

interface ProviderTarget {
  provider: EmailMarketingProvider;
  providerListId: string;
}

/**
 * Resuelve el provider activo + providerListId efectivo de la lista.
 * Si la lista es de email pero NO tiene provider sync, lanza error claro.
 */
async function resolveProviderForList(
  contactList: ContactList,
  companyId: number
): Promise<ProviderTarget | null> {
  if (!contactList.isEmailList) return null;

  const providerListId = contactList.providerListId || contactList.acelleListUid;
  if (!providerListId) {
    throw new AppError(
      "Esta lista de email no esta sincronizada con ningun provider. Edite la lista para resincronizar.",
      400
    );
  }

  const provider = await EmailMarketingFactory.getProvider(companyId);

  // Si la lista fue creada con un provider distinto al activo,
  // permitimos operar pero advertimos en logs
  const expected = contactList.provider || (contactList.acelleListUid ? "acelle" : null);
  if (expected && expected !== provider.getProviderName()) {
    logger.warn(
      `[ContactListItemController] Lista ${contactList.id} fue creada con '${expected}' pero provider activo es '${provider.getProviderName()}'. Operando contra el activo.`
    );
  }

  return { provider, providerListId };
}

// ============================================================================
// Endpoints
// ============================================================================

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

  const contactList = await ContactList.findOne({ where: { id: data.contactListId, companyId } });

  if (!contactList) {
    throw new AppError("Lista de contactos no encontrada", 404);
  }

  // Si es lista de email, sincronizar PRIMERO con provider
  let target: ProviderTarget | null = null;
  if (contactList.isEmailList) {
    if (!data.email) {
      throw new AppError("Email es requerido para listas de email", 400);
    }
    target = await resolveProviderForList(contactList, Number(companyId));

    if (target) {
      const result = await target.provider.createSubscriber(target.providerListId, {
        email: data.email,
        name: data.name
      });
      if (!result.success) {
        throw new AppError(
          `Error al crear suscriptor en ${target.provider.getProviderName()}: ${result.error || "error desconocido"}`,
          400
        );
      }
    }
  }

  const record = await CreateService({
    ...data,
    companyId
  } as any);

  if (target) {
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

  const contactList = await ContactList.findOne({ where: { id: data.contactListId, companyId } });

  if (!contactList) {
    throw new AppError("Lista de contactos no encontrada", 404);
  }

  // Si es lista de email, sincronizar update con provider
  let target: ProviderTarget | null = null;
  if (contactList.isEmailList) {
    if (!data.email) {
      throw new AppError("Email es requerido para listas de email", 400);
    }
    target = await resolveProviderForList(contactList, Number(companyId));

    if (target) {
      const result = await target.provider.updateSubscriber(target.providerListId, {
        email: data.email,
        name: data.name
      });
      if (!result.success) {
        // Update no es bloqueante (puede fallar si el subscriber no existe en remoto)
        logger.warn(
          `[ContactListItemController] updateSubscriber fallo: ${result.error}`
        );
      }
    }
  }

  const record = await UpdateService({
    ...data,
    id,
    companyId
  } as any);

  if (target) {
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

  // Obtener el contacto antes de eliminarlo
  // [W1-SEC-12] Acota al tenant ANTES de tocar el proveedor de email.
  const contact = await ContactListItem.findOne({
    where: { id, companyId },
    include: [{ model: ContactList, as: "contactList" }]
  });

  if (contact && contact.contactList?.isEmailList && contact.email) {
    try {
      const target = await resolveProviderForList(
        contact.contactList,
        Number(companyId)
      );
      if (target) {
        const result = await target.provider.deleteSubscriber(
          target.providerListId,
          contact.email
        );
        if (!result.success) {
          logger.warn(
            `[ContactListItemController] deleteSubscriber fallo: ${result.error}`
          );
        }
      }
    } catch (err) {
      logger.warn(
        `[ContactListItemController] No se pudo eliminar de provider: ${(err as Error).message}`
      );
    }
  }

  await DeleteService(id, companyId);

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
