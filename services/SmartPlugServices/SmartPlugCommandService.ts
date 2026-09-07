/**
 * Service: SmartPlugCommandService
 * Enciende, apaga o alterna una toma y CONFIRMA el resultado leyendo el estado
 * de vuelta del dispositivo.
 *
 * Por que confirmar: `turnOn()` resuelve cuando la toma acepta el comando, no
 * cuando el rele conmuto. Devolver el estado deseado sin releerlo es como
 * mentirle al que pregunto — y este servicio lo consume el bot de WhatsApp,
 * donde una respuesta falsa se le muestra a un humano.
 */

import SmartPlug from "../../models/SmartPlug";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { getDeviceInfo, setRelay } from "./TapoDriver";
import ShowSmartPlugService from "./ShowSmartPlugService";
import { markUnreachable } from "./SmartPlugStateService";
import { errorText } from "./smartPlugUtils";

export type SmartPlugAction = "on" | "off" | "toggle";

const VALID_ACTIONS: SmartPlugAction[] = ["on", "off", "toggle"];

interface SmartPlugCommandRequest {
  companyId: number;
  plugId: number;
  action: SmartPlugAction;
}

interface SmartPlugCommandResponse {
  plug: SmartPlug;
  action: SmartPlugAction;
  previousRelayOn: boolean;
  relayOn: boolean;
  changed: boolean;
}

const SmartPlugCommandService = async (
  params: SmartPlugCommandRequest
): Promise<SmartPlugCommandResponse> => {
  const { companyId, plugId, action } = params;

  if (!action || !VALID_ACTIONS.includes(action)) {
    throw new AppError("ERR_SMART_PLUG_INVALID_ACTION", 400);
  }

  const plug = await ShowSmartPlugService(plugId, companyId);

  if (!plug.active) {
    throw new AppError("ERR_SMART_PLUG_INACTIVE", 409);
  }

  const target = {
    plugId: plug.id,
    host: plug.host,
    email: plug.tapoEmail,
    password: plug.tapoPassword
  };

  try {
    // Se lee ANTES de actuar: "toggle" lo necesita, y para on/off da el
    // `previousRelayOn` honesto y detecta la toma caida sin conmutar nada.
    const before = await getDeviceInfo(target);
    const desired = action === "toggle" ? !before.relayOn : action === "on";

    if (desired !== before.relayOn) {
      await setRelay(target, desired);
    }

    // Confirmacion contra el dispositivo.
    const after = await getDeviceInfo(target);

    await plug.update({
      status: "online",
      relayOn: after.relayOn,
      lastSeenAt: new Date(),
      lastError: null
    });

    if (after.relayOn !== desired) {
      logger.error(
        `[SmartPlugCommandService] La toma no conmuto: id=${plug.id}, host=${plug.host}, ` +
        `esperado=${desired}, real=${after.relayOn}`
      );
      throw new AppError("ERR_SMART_PLUG_COMMAND_NOT_APPLIED", 502);
    }

    logger.info(
      `[SmartPlugCommandService] ${action} aplicado: id=${plug.id}, host=${plug.host}, ` +
      `${before.relayOn} -> ${after.relayOn}, company=${companyId}`
    );

    return {
      plug,
      action,
      previousRelayOn: before.relayOn,
      relayOn: after.relayOn,
      changed: before.relayOn !== after.relayOn
    };
  } catch (err: unknown) {
    // Un comando no aplicado ya quedo logueado y la toma respondio: no es
    // inalcanzable, no hay que marcarla offline.
    if (err instanceof AppError && err.message === "ERR_SMART_PLUG_COMMAND_NOT_APPLIED") {
      throw err;
    }

    await markUnreachable(plug, err);
    logger.warn(
      `[SmartPlugCommandService] Fallo ${action} en id=${plug.id}, host=${plug.host}: ` +
      `${errorText(err)}`
    );

    if (err instanceof AppError) throw err;
    throw new AppError("ERR_SMART_PLUG_UNREACHABLE", 422);
  }
};

export default SmartPlugCommandService;
