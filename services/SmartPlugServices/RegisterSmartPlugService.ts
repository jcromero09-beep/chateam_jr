/**
 * Service: RegisterSmartPlugService
 * Registra una toma Tapo ya pareada a la WiFi del cliente.
 *
 * El pareo WiFi NO pasa por aca: lo hace el usuario final con la app Tapo.
 * Este servicio toma la direccion resultante en la LAN y verifica que la toma
 * responda con esas credenciales antes de darla por buena.
 */

import SmartPlug from "../../models/SmartPlug";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { probeDevice } from "./TapoDriver";
import { HOST_PATTERN, errorText } from "./smartPlugUtils";

interface RegisterSmartPlugRequest {
  companyId: number;
  name: string;
  host: string;
  tapoEmail: string;
  tapoPassword: string;
  model?: string;
  metadata?: Record<string, unknown>;
}

const RegisterSmartPlugService = async (
  params: RegisterSmartPlugRequest
): Promise<SmartPlug> => {
  const { companyId, name, host, tapoEmail, tapoPassword, model, metadata } = params;

  if (!name || !name.trim()) {
    throw new AppError("ERR_SMART_PLUG_MISSING_NAME", 400);
  }
  if (!host || !HOST_PATTERN.test(host)) {
    throw new AppError("ERR_SMART_PLUG_INVALID_HOST", 400);
  }
  if (!tapoEmail || !tapoEmail.includes("@")) {
    throw new AppError("ERR_SMART_PLUG_INVALID_EMAIL", 400);
  }
  if (!tapoPassword) {
    throw new AppError("ERR_SMART_PLUG_MISSING_PASSWORD", 400);
  }

  const existing = await SmartPlug.findOne({ where: { companyId, host } });
  if (existing) {
    throw new AppError("ERR_SMART_PLUG_ALREADY_EXISTS", 409);
  }

  // Verificacion previa: si la credencial o la IP estan mal, es mejor fallar
  // ahora que dejar una fila que nunca va a funcionar.
  let info;
  try {
    info = await probeDevice(host, tapoEmail, tapoPassword);
  } catch (err: unknown) {
    logger.warn(
      `[RegisterSmartPlugService] La toma ${host} no respondio (company=${companyId}): ` +
      `${errorText(err)}`
    );
    // ERR_SMART_PLUG_DRIVER_UNAVAILABLE (503) sube tal cual: no es culpa del
    // usuario ni de la toma, es que falta la dependencia en el servidor.
    if (err instanceof AppError) throw err;
    throw new AppError("ERR_SMART_PLUG_UNREACHABLE", 422);
  }

  const plug = await SmartPlug.create({
    companyId,
    name: name.trim(),
    vendor: "tapo",
    model: model || info.model,
    host,
    macAddress: info.macAddress,
    vendorDeviceId: info.vendorDeviceId,
    tapoEmail,
    tapoPassword,
    status: "online",
    relayOn: info.relayOn,
    lastSeenAt: new Date(),
    lastError: null,
    metadata: metadata || {},
    active: true
  } as Partial<SmartPlug> as SmartPlug);

  logger.info(
    `[RegisterSmartPlugService] Toma registrada: id=${plug.id}, host=${host}, ` +
    `model=${plug.model || "desconocido"}, company=${companyId}`
  );

  return plug;
};

export default RegisterSmartPlugService;
