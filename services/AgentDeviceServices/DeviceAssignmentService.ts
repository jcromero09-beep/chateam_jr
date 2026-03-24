/**
 * Service: DeviceAssignmentService
 * Asigna una identidad de agente a un dispositivo del farm.
 * Valida que la identidad este activa y el dispositivo no este baneado.
 * Desasigna dispositivo anterior si la identidad ya tenia uno.
 */

import AgentDevice from "../../models/AgentDevice";
import AgentIdentity from "../../models/AgentIdentity";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface DeviceAssignmentRequest {
  companyId: number;
  deviceId: number;
  identityId: number;
}

interface DeviceAssignmentResponse {
  device: AgentDevice;
  previousDeviceId: number | null;
}

const DeviceAssignmentService = async (
  params: DeviceAssignmentRequest
): Promise<DeviceAssignmentResponse> => {
  const { companyId, deviceId, identityId } = params;

  // 1. Validar que la identidad exista y este activa
  const identity = await AgentIdentity.findOne({
    where: { id: identityId, companyId }
  });

  if (!identity) {
    throw new AppError("ERR_AGENT_IDENTITY_NOT_FOUND", 404);
  }

  if (identity.status !== "active") {
    throw new AppError("ERR_AGENT_IDENTITY_NOT_ACTIVE", 400);
  }

  // 2. Validar que el dispositivo exista y no este baneado
  const device = await AgentDevice.findOne({
    where: { id: deviceId, companyId }
  });

  if (!device) {
    throw new AppError("ERR_AGENT_DEVICE_NOT_FOUND", 404);
  }

  if (device.isBanned()) {
    throw new AppError("ERR_AGENT_DEVICE_BANNED", 403);
  }

  // 3. Desasignar dispositivo anterior si la identidad ya tenia uno
  let previousDeviceId: number | null = null;
  const previousDevice = await AgentDevice.findOne({
    where: { assignedIdentityId: identityId, companyId }
  });

  if (previousDevice && previousDevice.id !== deviceId) {
    previousDeviceId = previousDevice.id;
    await previousDevice.update({ assignedIdentityId: null });
    logger.info(
      `[DeviceAssignmentService] Desasignada identidad ${identityId} ` +
      `del dispositivo anterior ${previousDevice.id}`
    );
  }

  // 4. Asignar identidad al dispositivo
  await device.update({ assignedIdentityId: identityId });
  await device.reload();

  logger.info(
    `[DeviceAssignmentService] Identidad ${identityId} asignada a dispositivo ${deviceId}, ` +
    `company=${companyId}`
  );

  return { device, previousDeviceId };
};

export default DeviceAssignmentService;
