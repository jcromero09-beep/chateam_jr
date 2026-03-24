/**
 * Service: DeviceCommandService
 * Envia un comando al dispositivo (placeholder para ADB/WebSocket bridge).
 * Registra el comando en metadata del dispositivo.
 */

import { v4 as uuidv4 } from "uuid";
import AgentDevice from "../../models/AgentDevice";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

// Comandos soportados por el bridge
export type DeviceCommand = "open_app" | "type_text" | "tap" | "scroll" | "screenshot";

interface DeviceCommandRequest {
  companyId: number;
  deviceId: number;
  command: DeviceCommand;
  params: Record<string, unknown>;
}

interface DeviceCommandResponse {
  sent: boolean;
  commandId: string;
  deviceId: number;
  command: DeviceCommand;
}

const DeviceCommandService = async (
  request: DeviceCommandRequest
): Promise<DeviceCommandResponse> => {
  const { companyId, deviceId, command, params } = request;

  if (!command) {
    throw new AppError("ERR_AGENT_DEVICE_MISSING_COMMAND", 400);
  }

  const validCommands: DeviceCommand[] = ["open_app", "type_text", "tap", "scroll", "screenshot"];
  if (!validCommands.includes(command)) {
    throw new AppError("ERR_AGENT_DEVICE_INVALID_COMMAND", 400);
  }

  const device = await AgentDevice.findOne({
    where: { id: deviceId, companyId }
  });

  if (!device) {
    throw new AppError("ERR_AGENT_DEVICE_NOT_FOUND", 404);
  }

  if (device.isBanned()) {
    throw new AppError("ERR_AGENT_DEVICE_BANNED", 403);
  }

  if (device.status === "offline") {
    throw new AppError("ERR_AGENT_DEVICE_OFFLINE", 400);
  }

  // Generar ID unico para el comando
  const commandId = uuidv4();

  // Registrar comando en metadata del dispositivo
  const currentMetadata = device.metadata || {};
  const commandHistory = (currentMetadata.commandHistory as Record<string, unknown>[]) || [];
  commandHistory.push({
    commandId,
    command,
    params,
    sentAt: new Date().toISOString(),
    status: "sent"
  });

  // Mantener solo los ultimos 50 comandos en metadata
  const trimmedHistory = commandHistory.slice(-50);

  await device.update({
    metadata: {
      ...currentMetadata,
      commandHistory: trimmedHistory,
      lastCommand: {
        commandId,
        command,
        sentAt: new Date().toISOString()
      }
    }
  });

  logger.info(
    `[DeviceCommandService] Comando enviado: device=${deviceId}, ` +
    `command=${command}, commandId=${commandId}, company=${companyId}`
  );

  // Placeholder: En produccion esto enviaria via WebSocket/ADB bridge
  return {
    sent: true,
    commandId,
    deviceId,
    command
  };
};

export default DeviceCommandService;
