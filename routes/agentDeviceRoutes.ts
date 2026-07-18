/**
 * Routes: Agent Device Farm (UGC Campaign System — Phase 2)
 * Define las rutas para el sistema de dispositivos del farm de agentes.
 *
 * Endpoints:
 * POST   /api/ugc/devices/register              - Registra nuevo dispositivo
 * GET    /api/ugc/devices                        - Lista dispositivos
 * GET    /api/ugc/devices/:id                    - Detalle de dispositivo
 * POST   /api/ugc/devices/:id/assign/:identityId - Asigna identidad
 * POST   /api/ugc/devices/:id/heartbeat         - Heartbeat del dispositivo
 * POST   /api/ugc/devices/:id/command            - Envia comando
 * DELETE /api/ugc/devices/:id                    - Desactiva dispositivo
 */

import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as AgentDeviceController from "../controllers/AgentDeviceController";

const agentDeviceRoutes = Router();

// --- Rutas especificas ANTES de rutas con parametros ---

// Registrar nuevo dispositivo
agentDeviceRoutes.post(
  "/ugc/devices/register",
  isAuth,
  AgentDeviceController.register
);

// --- Rutas CRUD ---

// Listar dispositivos con paginacion
agentDeviceRoutes.get(
  "/ugc/devices",
  isAuth,
  AgentDeviceController.list
);

// Detalle de un dispositivo
agentDeviceRoutes.get(
  "/ugc/devices/:id",
  isAuth,
  AgentDeviceController.show
);

// Asignar identidad a dispositivo
agentDeviceRoutes.post(
  "/ugc/devices/:id/assign/:identityId",
  isAuth,
  AgentDeviceController.assignIdentity
);

// Heartbeat del dispositivo
agentDeviceRoutes.post(
  "/ugc/devices/:id/heartbeat",
  isAuth,
  AgentDeviceController.heartbeat
);

// Enviar comando al dispositivo
agentDeviceRoutes.post(
  "/ugc/devices/:id/command",
  isAuth,
  AgentDeviceController.sendCommand
);

// Desactivar dispositivo (soft delete)
agentDeviceRoutes.delete(
  "/ugc/devices/:id",
  isAuth,
  AgentDeviceController.remove
);

export default agentDeviceRoutes;
