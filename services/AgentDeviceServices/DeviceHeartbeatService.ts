/**
 * Service: DeviceHeartbeatService
 * Actualiza heartbeat del dispositivo, gestiona IP, cooldown y limites diarios.
 * Si cooldownUntil ha pasado, resetea a 'online'.
 * Si dailyActionCount >= dailyActionLimit, pone en 'cooldown' 15min.
 */

import AgentDevice from "../../models/AgentDevice";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface DeviceHeartbeatRequest {
  companyId: number;
  deviceId: number;
  ip?: string;
  dailyActionCount?: number;
}

interface DeviceHeartbeatResponse {
  device: AgentDevice;
  statusChanged: boolean;
  previousStatus: string;
}

const DeviceHeartbeatService = async (
  params: DeviceHeartbeatRequest
): Promise<DeviceHeartbeatResponse> => {
  const { companyId, deviceId, ip, dailyActionCount } = params;

  const device = await AgentDevice.findOne({
    where: { id: deviceId, companyId }
  });

  if (!device) {
    throw new AppError("ERR_AGENT_DEVICE_NOT_FOUND", 404);
  }

  const previousStatus = device.status;
  const updateData: Record<string, unknown> = {
    lastHeartbeat: new Date()
  };

  // Actualizar IP si cambio
  if (ip && ip !== device.ip) {
    updateData.ip = ip;
  }

  // Actualizar dailyActionCount si se envio
  if (dailyActionCount !== undefined) {
    updateData.dailyActionCount = dailyActionCount;
  }

  // Si cooldownUntil ya paso, resetear a 'online'
  if (
    device.status === "cooldown" &&
    device.cooldownUntil &&
    new Date() >= new Date(device.cooldownUntil)
  ) {
    updateData.status = "online";
    updateData.cooldownUntil = null;
    logger.info(
      `[DeviceHeartbeatService] Cooldown expirado, dispositivo ${deviceId} vuelve a 'online'`
    );
  }

  // Si el dispositivo estaba offline y reporta heartbeat, ponerlo online
  if (device.status === "offline") {
    updateData.status = "online";
  }

  // Verificar limite de acciones diarias
  const currentActionCount = (dailyActionCount !== undefined)
    ? dailyActionCount
    : device.dailyActionCount;

  if (currentActionCount >= device.dailyActionLimit && device.status !== "banned") {
    const cooldownEnd = new Date();
    cooldownEnd.setMinutes(cooldownEnd.getMinutes() + 15);
    updateData.status = "cooldown";
    updateData.cooldownUntil = cooldownEnd;
    logger.warn(
      `[DeviceHeartbeatService] Dispositivo ${deviceId} en cooldown 15min: ` +
      `acciones=${currentActionCount}/${device.dailyActionLimit}`
    );
  }

  await device.update(updateData);
  await device.reload();

  const statusChanged = previousStatus !== device.status;

  if (statusChanged) {
    logger.info(
      `[DeviceHeartbeatService] Status cambiado: device=${deviceId}, ` +
      `${previousStatus} -> ${device.status}`
    );
  }

  return { device, statusChanged, previousStatus };
};

export default DeviceHeartbeatService;
