import express from "express";
import isAuth from "../middleware/isAuth";
import * as AIExtensionController from "../controllers/AIExtensionController";

const routes = express.Router();

// Rutas de consulta
routes.get("/ai/extensions", isAuth, AIExtensionController.list);
routes.get("/ai/extensions/installed", isAuth, AIExtensionController.listInstalled);

// Gestión de extensiones (admin)
routes.post("/ai/extensions/install", isAuth, AIExtensionController.install);
routes.post("/ai/extensions/uninstall", isAuth, AIExtensionController.uninstall);

export default routes;
