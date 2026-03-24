import express from "express";
import isAuth from "../middleware/isAuth";
import * as AIEmailTemplateController from "../controllers/AIEmailTemplateController";

const routes = express.Router();

// Rutas de consulta
routes.get("/ai/email-templates", isAuth, AIEmailTemplateController.list);

// Crear template custom
routes.post("/ai/email-templates", isAuth, AIEmailTemplateController.store);

// Renderizar template con variables
routes.post("/ai/email-templates/render", isAuth, AIEmailTemplateController.render);

export default routes;
