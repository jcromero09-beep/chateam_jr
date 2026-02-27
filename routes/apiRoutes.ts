import express from "express";
import multer from "multer";
import uploadConfig from "../config/upload";

import * as ApiController from "../controllers/ApiController";
import tokenAuth from "../middleware/tokenAuth";

import isAuth from "../middleware/isAuth";
const upload = multer(uploadConfig);

const ApiRoutes = express.Router();

// Envío de mensajes
ApiRoutes.post("/send", tokenAuth, upload.array("medias"), ApiController.index);
// ApiRoutes.post("/send/linkPdf", tokenAuth, ApiController.indexLink);
ApiRoutes.post("/send/linkImage", tokenAuth, ApiController.indexImage);
ApiRoutes.post("/checkNumber", tokenAuth, ApiController.checkNumber);

// Envío de plantillas META por ID del sistema
ApiRoutes.post("/send-template", tokenAuth, ApiController.sendTemplate);

// Verificación masiva de números con SSE (streaming - sin límite)
ApiRoutes.post("/checkNumbers", tokenAuth, ApiController.checkNumbers);

// Estadísticas de API (requiere autenticación de usuario, no token de API)
ApiRoutes.get("/stats", isAuth, ApiController.getApiStats);
ApiRoutes.get("/dashboard-stats", isAuth, ApiController.getDashboardStats);

// ApiRoutes.post("/send/linkVideo", tokenAuth, ApiController.indexVideo);
// ApiRoutes.post("/send/toManyText", tokenAuth, ApiController.indexToMany);
// ApiRoutes.post("/send/toManyLinkPdf", tokenAuth, ApiController.indexToManyLinkPdf);
// ApiRoutes.post("/send/toManyImage", tokenAuth, ApiController.indexToManyImage);

// retornar os whatsapp e seus status
// ApiRoutes.get("/getWhatsappsId", tokenAuth, ApiController.indexWhatsappsId);

export default ApiRoutes;
console.log("📄 API-ROUTES.TS LOADED\!");
