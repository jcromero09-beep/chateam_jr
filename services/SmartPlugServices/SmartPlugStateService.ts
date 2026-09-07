/**
 * Service: SmartPlugStateService
 * Consulta el estado REAL de la toma contra el dispositivo y persiste lo leido.
 *
 * Es la unica via para saber si una toma esta encendida: la columna `relayOn`
 * es un cache del ultimo dato conocido, no la verdad. Alguien pudo apretar el
 * boton fisico o usar la app Tapo sin que el backend se entere.
 */

import SmartPlug, { SmartPlugEnergy } from "../../models/SmartPlug";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { getDeviceInfo, getEnergyUsage, TapoPlugInfo } from "./TapoDriver";
import ShowSmartPlugService from "./ShowSmartPlugService";
import { errorText } from "./smartPlugUtils";

interface SmartPlugStateRequest {
  companyId: number;
  plugId: number;
  includeEnergy?: boolean;
}

export interface SmartPlugStateResponse {
  plug: SmartPlug;
  info: TapoPlugInfo;
  energy: SmartPlugEnergy | null;
}

/** Marca la toma como inalcanzable y deja el motivo asentado en la fila. */
export const markUnreachable = async (plug: SmartPlug, err: unknown): Promise<void> => {
  await plug.update({
    status: "offline",
    lastError: errorText(err).substring(0, 1000)
  });
};

const SmartPlugStateService = async (
  params: SmartPlugStateRequest
): Promise<SmartPlugStateResponse> => {
  const { companyId, plugId, includeEnergy = true } = params;

  const plug = await ShowSmartPlugService(plugId, companyId);

  const target = {
    plugId: plug.id,
    host: plug.host,
    email: plug.tapoEmail,
    password: plug.tapoPassword
  };

  let info: TapoPlugInfo;
  try {
    info = await getDeviceInfo(target);
  } catch (err: unknown) {
    await markUnreachable(plug, err);
    logger.warn(
      `[SmartPlugStateService] Toma inalcanzable: id=${plug.id}, host=${plug.host}, ` +
      `company=${companyId}`
    );
    if (err instanceof AppError) throw err;
    throw new AppError("ERR_SMART_PLUG_UNREACHABLE", 422);
  }

  // El consumo es opcional y no debe tumbar la lectura de estado: los P100/P105
  // simplemente no miden.
  const energy = includeEnergy ? await getEnergyUsage(target) : null;

  await plug.update({
    status: "online",
    relayOn: info.relayOn,
    // Se refrescan los datos de identidad: la toma pudo actualizar firmware o
    // haber sido renombrada desde la app Tapo.
    model: plug.model || info.model,
    macAddress: info.macAddress || plug.macAddress,
    vendorDeviceId: info.vendorDeviceId || plug.vendorDeviceId,
    lastSeenAt: new Date(),
    lastError: null,
    ...(energy ? { lastEnergy: energy } : {})
  });

  return { plug, info, energy };
};

export default SmartPlugStateService;
