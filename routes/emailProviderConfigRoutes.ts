/**
 * Routes: Email Provider Config (Email Marketing System)
 * Define todas las rutas para la gestion de configuraciones de proveedores de email.
 *
 * Endpoints:
 * GET    /email-provider-configs           - Lista configuraciones
 * POST   /email-provider-configs           - Crea configuracion
 * PUT    /email-provider-configs/:id       - Actualiza configuracion
 * DELETE /email-provider-configs/:id       - Desactiva configuracion (soft delete)
 * POST   /email-provider-configs/:id/test  - Prueba conexion del proveedor
 */

import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as EmailProviderConfigController from "../controllers/EmailProviderConfigController";

const emailProviderConfigRoutes = Router();

// Listar configuraciones de proveedores de email
emailProviderConfigRoutes.get(
  "/email-provider-configs",
  isAuth,
  EmailProviderConfigController.index
);

// Crear nueva configuracion de proveedor
emailProviderConfigRoutes.post(
  "/email-provider-configs",
  isAuth,
  EmailProviderConfigController.store
);

// Actualizar configuracion existente
emailProviderConfigRoutes.put(
  "/email-provider-configs/:id",
  isAuth,
  EmailProviderConfigController.update
);

// Desactivar configuracion (soft delete — BD SAGRADA)
emailProviderConfigRoutes.delete(
  "/email-provider-configs/:id",
  isAuth,
  EmailProviderConfigController.remove
);

// Probar conexion del proveedor
emailProviderConfigRoutes.post(
  "/email-provider-configs/:id/test",
  isAuth,
  EmailProviderConfigController.testConnection
);

export default emailProviderConfigRoutes;
