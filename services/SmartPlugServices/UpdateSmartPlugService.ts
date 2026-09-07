/**
 * Service: UpdateSmartPlugService
 * Actualiza los datos de registro de una toma.
 *
 * Cambiar host o credencial invalida la sesion cacheada del driver: seguir
 * usando el handle viejo hablaria con el equipo anterior.
 */

import SmartPlug from "../../models/SmartPlug";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { probeDevice, invalidateSession } from "./TapoDriver";
import { HOST_PATTERN, errorText } from "./smartPlugUtils";
import ShowSmartPlugService from "./ShowSmartPlugService";

interface UpdateSmartPlugRequest {
  companyId: number;
  plugId: number;
  name?: string;
  host?: string;
  tapoEmail?: string;
  tapoPassword?: string;
  model?: string;
  active?: boolean;
  metadata?: Record<string, unknown>;
}

const UpdateSmartPlugService = async (
  params: UpdateSmartPlugRequest
): Promise<SmartPlug> => {
  const { companyId, plugId, name, host, tapoEmail, tapoPassword, model, active, metadata } =
    params;

  const plug = await ShowSmartPlugService(plugId, companyId);

  if (host !== undefined && !HOST_PATTERN.test(host)) {
    throw new AppError("ERR_SMART_PLUG_INVALID_HOST", 400);
  }
  if (tapoEmail !== undefined && !tapoEmail.includes("@")) {
    throw new AppError("ERR_SMART_PLUG_INVALID_EMAIL", 400);
  }
  if (name !== undefined && !name.trim()) {
    throw new AppError("ERR_SMART_PLUG_MISSING_NAME", 400);
  }

  // Colision de host dentro de la misma company (la unique de BD lo atajaria,
  // pero devolveria un 500 en vez de un 409 con sentido).
  if (host !== undefined && host !== plug.host) {
    const clash = await SmartPlug.findOne({ where: { companyId, host } });
    if (clash) {
      throw new AppError("ERR_SMART_PLUG_ALREADY_EXISTS", 409);
    }
  }

  const connectionChanged =
    (host !== undefined && host !== plug.host) ||
    (tapoEmail !== undefined && tapoEmail !== plug.tapoEmail) ||
    tapoPassword !== undefined;

  const changes: Record<string, unknown> = {};
  if (name !== undefined) changes.name = name.trim();
  if (host !== undefined) changes.host = host;
  if (tapoEmail !== undefined) changes.tapoEmail = tapoEmail;
  if (tapoPassword !== undefined) changes.tapoPassword = tapoPassword;
  if (model !== undefined) changes.model = model;
  if (active !== undefined) changes.active = active;
  if (metadata !== undefined) changes.metadata = metadata;

  // Si cambio como se llega a la toma, se verifica con los datos NUEVOS antes
  // de guardarlos. Guardar primero dejaria la fila apuntando a un destino que
  // nunca se comprobo.
  if (connectionChanged) {
    invalidateSession(plug.id);

    const nextHost = host ?? plug.host;
    const nextEmail = tapoEmail ?? plug.tapoEmail;
    const nextPassword = tapoPassword ?? plug.tapoPassword;

    try {
      const info = await probeDevice(nextHost, nextEmail, nextPassword);
      changes.status = "online";
      changes.relayOn = info.relayOn;
      changes.macAddress = info.macAddress;
      changes.vendorDeviceId = info.vendorDeviceId;
      changes.lastSeenAt = new Date();
      changes.lastError = null;
      if (model === undefined && info.model) changes.model = info.model;
    } catch (err: unknown) {
      logger.warn(
        `[UpdateSmartPlugService] Nuevos datos de conexion no verificables para ` +
        `id=${plug.id}: ${errorText(err)}`
      );
      if (err instanceof AppError) throw err;
      throw new AppError("ERR_SMART_PLUG_UNREACHABLE", 422);
    }
  }

  await plug.update(changes);
  invalidateSession(plug.id);

  logger.info(
    `[UpdateSmartPlugService] Toma actualizada: id=${plug.id}, ` +
    `campos=[${Object.keys(changes).join(", ")}], company=${companyId}`
  );

  return plug;
};

export default UpdateSmartPlugService;
