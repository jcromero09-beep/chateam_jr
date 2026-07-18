/**
 * Service: DeviceRegistrationService
 * Registra un nuevo dispositivo Android en el device farm.
 * Valida unicidad de deviceId por company y crea con status 'offline'.
 */

import AgentDevice, { DeviceProxyConfig, DeviceFingerprint } from "../../models/AgentDevice";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface DeviceRegistrationRequest {
  companyId: number;
  deviceId: string;
  name?: string;
  model?: string;
  androidVersion?: string;
  ip?: string;
  proxyConfig?: DeviceProxyConfig;
  fingerprint?: DeviceFingerprint;
  simNumber?: string;
}

const DeviceRegistrationService = async (
  params: DeviceRegistrationRequest
): Promise<AgentDevice> => {
  const {
    companyId,
    deviceId,
    name,
    model,
    androidVersion,
    ip,
    proxyConfig,
    fingerprint,
    simNumber
  } = params;

  if (!deviceId) {
    throw new AppError("ERR_AGENT_DEVICE_MISSING_DEVICE_ID", 400);
  }

  // Validar que el deviceId no exista ya para esta company
  const existingDevice = await AgentDevice.findOne({
    where: { deviceId, companyId }
  });

  if (existingDevice) {
    throw new AppError("ERR_AGENT_DEVICE_ALREADY_EXISTS", 409);
  }

  const device = await AgentDevice.create({
    companyId,
    deviceId,
    name: name || `Device-${deviceId.substring(0, 8)}`,
    model,
    androidVersion,
    ip,
    proxyConfig: proxyConfig || {},
    fingerprint: fingerprint || {},
    simNumber,
    status: "offline",
    dailyActionCount: 0,
    dailyActionLimit: 100,
    metadata: {}
  } as Partial<AgentDevice> as AgentDevice);

  logger.info(
    `[DeviceRegistrationService] Dispositivo registrado: id=${device.id}, ` +
    `deviceId=${deviceId}, company=${companyId}`
  );

  return device;
};

export default DeviceRegistrationService;
