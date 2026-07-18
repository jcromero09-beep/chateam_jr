import express from "express";
import isAuth from "../middleware/isAuth";
import * as AIEntityController from "../controllers/AIEntityController";

const routes = express.Router();

// Rutas públicas de consulta (requieren auth pero no admin)
routes.get("/ai/entities/list", isAuth, AIEntityController.findList);
routes.get("/ai/entities/capability", isAuth, AIEntityController.findByCapability);
routes.get("/ai/entities", isAuth, AIEntityController.index);
routes.get("/ai/entities/:id", isAuth, AIEntityController.show);

// Rutas de administración (requieren perfil admin)
routes.post("/ai/entities", isAuth, AIEntityController.store);
routes.put("/ai/entities/:id", isAuth, AIEntityController.update);
routes.delete("/ai/entities/:id", isAuth, AIEntityController.remove);

export default routes;
