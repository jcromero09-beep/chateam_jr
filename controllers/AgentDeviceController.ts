/**
 * Controller: AgentDeviceController
 * Maneja las peticiones HTTP para el sistema de dispositivos del farm UGC.
 *
 * Endpoints:
 * - POST   /ugc/devices/register              - Registra nuevo dispositivo
 * - GET    /ugc/devices                        - Lista dispositivos
 * - GET    /ugc/devices/:id                    - Detalle de dispositivo
 * - POST   /ugc/devices/:id/assign/:identityId - Asigna identidad a dispositivo
 * - POST   /ugc/devices/:id/heartbeat         - Actualiza heartbeat
 * - POST   /ugc/devices/:id/command            - Envia comando al dispositivo
 * - DELETE /ugc/devices/:id                    - Soft delete (offline + unassign)
 */

import { Request, Response } from "express";
import DeviceRegistrationService from "../services/AgentDeviceServices/DeviceRegistrationService";
import DeviceAssignmentService from "../services/AgentDeviceServices/DeviceAssignmentService";
import DeviceHeartbeatService from "../services/AgentDeviceServices/DeviceHeartbeatService";
import ListAgentDevicesService from "../services/AgentDeviceServices/ListAgentDevicesService";
import DeviceCommandService from "../services/AgentDeviceServices/DeviceCommandService";
import AgentDevice, { AgentDeviceStatus } from "../models/AgentDevice";
import AgentIdentity from "../models/AgentIdentity";
import AgentProfilePhoto from "../models/AgentProfilePhoto";
import AppError from "../errors/AppError";
import logger from "../utils/logger";

/**
 * POST /ugc/devices/register
 * Registra un nuevo dispositivo Android en el farm
 */
export const register = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    deviceId,
    name,
    model,
    androidVersion,
    ip,
    proxyConfig,
    fingerprint,
    simNumber
  } = req.body;

  try {
    const device = await DeviceRegistrationService({
      companyId,
      deviceId,
      name,
      model,
      androidVersion,
      ip,
      proxyConfig,
      fingerprint,
      simNumber
    });

    return res.status(201).json({
      success: true,
      message: "Dispositivo registrado exitosamente",
      data: device
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AgentDeviceController.register] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al registrar dispositivo"
    });
  }
};

/**
 * GET /ugc/devices
 * Lista dispositivos con paginacion y filtros
 */
export const list = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { page = "1", limit = "20", status, searchParam } = req.query;

  try {
    const result = await ListAgentDevicesService({
      companyId,
      page: Number(page),
      limit: Number(limit),
      status: status as AgentDeviceStatus | undefined,
      searchParam: searchParam as string | undefined
    });

    return res.status(200).json({
      success: true,
      data: result.devices,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit)
      }
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AgentDeviceController.list] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al listar dispositivos"
    });
  }
};

/**
 * GET /ugc/devices/:id
 * Obtiene detalle de un dispositivo
 */
export const show = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const device = await AgentDevice.findOne({
      where: { id: Number(id), companyId },
      include: [
        {
          model: AgentIdentity,
          as: "assignedIdentity",
          required: false,
          include: [
            {
              model: AgentProfilePhoto,
              as: "profilePhotos",
              required: false
            }
          ]
        }
      ]
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: "ERR_AGENT_DEVICE_NOT_FOUND"
      });
    }

    return res.status(200).json({
      success: true,
      data: device
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AgentDeviceController.show] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al obtener dispositivo"
    });
  }
};

/**
 * POST /ugc/devices/:id/assign/:identityId
 * Asigna una identidad de agente a un dispositivo
 */
export const assignIdentity = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id, identityId } = req.params;

  try {
    const result = await DeviceAssignmentService({
      companyId,
      deviceId: Number(id),
      identityId: Number(identityId)
    });

    return res.status(200).json({
      success: true,
      message: "Identidad asignada exitosamente al dispositivo",
      data: {
        device: result.device,
        previousDeviceId: result.previousDeviceId
      }
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AgentDeviceController.assignIdentity] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al asignar identidad"
    });
  }
};

/**
 * POST /ugc/devices/:id/heartbeat
 * Actualiza heartbeat del dispositivo
 */
export const heartbeat = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const { ip, dailyActionCount } = req.body;

  try {
    const result = await DeviceHeartbeatService({
      companyId,
      deviceId: Number(id),
      ip,
      dailyActionCount
    });

    return res.status(200).json({
      success: true,
      data: {
        device: result.device,
        statusChanged: result.statusChanged,
        previousStatus: result.previousStatus
      }
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AgentDeviceController.heartbeat] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al actualizar heartbeat"
    });
  }
};

/**
 * POST /ugc/devices/:id/command
 * Envia comando al dispositivo
 */
export const sendCommand = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const { command, params } = req.body;

  try {
    const result = await DeviceCommandService({
      companyId,
      deviceId: Number(id),
      command,
      params: params || {}
    });

    return res.status(200).json({
      success: true,
      message: "Comando enviado exitosamente",
      data: result
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AgentDeviceController.sendCommand] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al enviar comando"
    });
  }
};

/**
 * DELETE /ugc/devices/:id
 * Soft delete: marca como offline y desasigna identidad
 */
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const device = await AgentDevice.findOne({
      where: { id: Number(id), companyId }
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: "ERR_AGENT_DEVICE_NOT_FOUND"
      });
    }

    await device.update({
      status: "offline",
      assignedIdentityId: null
    });

    return res.status(200).json({
      success: true,
      message: "Dispositivo desactivado exitosamente",
      data: { id: device.id, status: device.status }
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AgentDeviceController.remove] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al desactivar dispositivo"
    });
  }
};
