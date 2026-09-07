/**
 * Controller: SmartPlugController
 * Peticiones HTTP para tomacorrientes inteligentes WiFi (TP-Link Tapo).
 *
 * Endpoints:
 * - POST   /smart-plugs            - Registra una toma ya pareada a la WiFi
 * - GET    /smart-plugs            - Lista tomas de la company
 * - GET    /smart-plugs/:id        - Registro de una toma (sin tocar la red)
 * - GET    /smart-plugs/:id/state  - Estado real leido del dispositivo
 * - POST   /smart-plugs/:id/command- on | off | toggle
 * - PUT    /smart-plugs/:id        - Actualiza registro
 * - DELETE /smart-plugs/:id        - Elimina registro
 *
 * Ninguna respuesta expone `tapoPassword`: todas serializan con toSafeJSON().
 */

import { Request, Response } from "express";
import RegisterSmartPlugService from "../services/SmartPlugServices/RegisterSmartPlugService";
import ListSmartPlugsService from "../services/SmartPlugServices/ListSmartPlugsService";
import ShowSmartPlugService from "../services/SmartPlugServices/ShowSmartPlugService";
import UpdateSmartPlugService from "../services/SmartPlugServices/UpdateSmartPlugService";
import DeleteSmartPlugService from "../services/SmartPlugServices/DeleteSmartPlugService";
import SmartPlugStateService from "../services/SmartPlugServices/SmartPlugStateService";
import SmartPlugCommandService, {
  SmartPlugAction
} from "../services/SmartPlugServices/SmartPlugCommandService";
import { SmartPlugStatus } from "../models/SmartPlug";
import AppError from "../errors/AppError";
import logger from "../utils/logger";
import { errorText } from "../services/SmartPlugServices/smartPlugUtils";

/** Traduce el error a respuesta HTTP sin filtrar internals al cliente. */
const fail = (res: Response, error: unknown, context: string, fallback: string): Response => {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message
    });
  }

  logger.error(`[SmartPlugController.${context}] Error: ${errorText(error)}`);
  return res.status(500).json({ success: false, message: fallback });
};

/** :id siempre entero positivo — un NaN llegaria al WHERE como null. */
const parseId = (raw: string): number => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError("ERR_SMART_PLUG_INVALID_ID", 400);
  }
  return id;
};

/**
 * POST /smart-plugs
 * Registra una toma. La toma ya debe estar en la WiFi (pareada con la app Tapo).
 */
export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { name, host, tapoEmail, tapoPassword, model, metadata } = req.body;

  try {
    const plug = await RegisterSmartPlugService({
      companyId,
      name,
      host,
      tapoEmail,
      tapoPassword,
      model,
      metadata
    });

    return res.status(201).json({
      success: true,
      message: "Toma registrada exitosamente",
      data: plug.toSafeJSON()
    });
  } catch (error: unknown) {
    return fail(res, error, "store", "Error interno al registrar la toma");
  }
};

/**
 * GET /smart-plugs
 * Lista tomas. Lectura de BD: no despierta los dispositivos.
 */
export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { page, limit, status, active, searchParam } = req.query;

  try {
    const result = await ListSmartPlugsService({
      companyId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status: status as SmartPlugStatus | undefined,
      active: active === undefined ? undefined : active === "true",
      searchParam: searchParam as string | undefined
    });

    return res.status(200).json({
      success: true,
      data: result.plugs.map(plug => plug.toSafeJSON()),
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit
      }
    });
  } catch (error: unknown) {
    return fail(res, error, "index", "Error interno al listar tomas");
  }
};

/**
 * GET /smart-plugs/:id
 * Devuelve el registro guardado. `relayOn` aca es el ultimo valor conocido;
 * para el estado real usar /state.
 */
export const show = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  try {
    const plug = await ShowSmartPlugService(parseId(req.params.id), companyId);
    return res.status(200).json({ success: true, data: plug.toSafeJSON() });
  } catch (error: unknown) {
    return fail(res, error, "show", "Error interno al obtener la toma");
  }
};

/**
 * GET /smart-plugs/:id/state
 * Consulta el dispositivo en la LAN y persiste lo leido.
 */
export const state = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { includeEnergy } = req.query;

  try {
    const result = await SmartPlugStateService({
      companyId,
      plugId: parseId(req.params.id),
      includeEnergy: includeEnergy === undefined ? true : includeEnergy === "true"
    });

    return res.status(200).json({
      success: true,
      data: {
        plug: result.plug.toSafeJSON(),
        info: result.info,
        energy: result.energy
      }
    });
  } catch (error: unknown) {
    return fail(res, error, "state", "Error interno al consultar la toma");
  }
};

/**
 * POST /smart-plugs/:id/command
 * Body: { action: "on" | "off" | "toggle" }
 */
export const command = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { action } = req.body;

  try {
    const result = await SmartPlugCommandService({
      companyId,
      plugId: parseId(req.params.id),
      action: action as SmartPlugAction
    });

    return res.status(200).json({
      success: true,
      message: `Comando ${result.action} aplicado`,
      data: {
        plug: result.plug.toSafeJSON(),
        action: result.action,
        previousRelayOn: result.previousRelayOn,
        relayOn: result.relayOn,
        changed: result.changed
      }
    });
  } catch (error: unknown) {
    return fail(res, error, "command", "Error interno al operar la toma");
  }
};

/**
 * PUT /smart-plugs/:id
 */
export const update = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { name, host, tapoEmail, tapoPassword, model, active, metadata } = req.body;

  try {
    const plug = await UpdateSmartPlugService({
      companyId,
      plugId: parseId(req.params.id),
      name,
      host,
      tapoEmail,
      tapoPassword,
      model,
      active,
      metadata
    });

    return res.status(200).json({
      success: true,
      message: "Toma actualizada",
      data: plug.toSafeJSON()
    });
  } catch (error: unknown) {
    return fail(res, error, "update", "Error interno al actualizar la toma");
  }
};

/**
 * DELETE /smart-plugs/:id
 */
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  try {
    await DeleteSmartPlugService(parseId(req.params.id), companyId);
    return res.status(200).json({ success: true, message: "Toma eliminada" });
  } catch (error: unknown) {
    return fail(res, error, "remove", "Error interno al eliminar la toma");
  }
};
