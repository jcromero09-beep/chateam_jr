/**
 * Routes: Smart Plugs (tomacorrientes inteligentes WiFi — TP-Link Tapo)
 *
 * Endpoints:
 * POST   /smart-plugs             - Registra una toma ya pareada a la WiFi
 * GET    /smart-plugs             - Lista tomas de la company
 * GET    /smart-plugs/:id         - Registro guardado (sin tocar la red)
 * GET    /smart-plugs/:id/state   - Estado real leido del dispositivo
 * POST   /smart-plugs/:id/command - on | off | toggle
 * PUT    /smart-plugs/:id         - Actualiza registro
 * DELETE /smart-plugs/:id         - Elimina registro
 *
 * Todas requieren isAuth: el alcance es siempre la company del token.
 */

import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as SmartPlugController from "../controllers/SmartPlugController";

const smartPlugRoutes = Router();

smartPlugRoutes.post("/smart-plugs", isAuth, SmartPlugController.store);

smartPlugRoutes.get("/smart-plugs", isAuth, SmartPlugController.index);

// Rutas con sufijo ANTES de "/:id" para que no las capture el parametro.
smartPlugRoutes.get("/smart-plugs/:id/state", isAuth, SmartPlugController.state);

smartPlugRoutes.post("/smart-plugs/:id/command", isAuth, SmartPlugController.command);

smartPlugRoutes.get("/smart-plugs/:id", isAuth, SmartPlugController.show);

smartPlugRoutes.put("/smart-plugs/:id", isAuth, SmartPlugController.update);

smartPlugRoutes.delete("/smart-plugs/:id", isAuth, SmartPlugController.remove);

export default smartPlugRoutes;
