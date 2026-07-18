import express from "express";
import multer from "multer";
import uploadConfig from "../config/upload";
import isAuth from "../middleware/isAuth";

import * as CampaignMessageController from "../controllers/CampaignMessageController";

const campaignMessageRoutes = express.Router();
const upload = multer(uploadConfig);

// Importar ventas desde archivo Excel
campaignMessageRoutes.post(
  "/campaign-messages/import-sales",
  isAuth,
  upload.array("file"),
  CampaignMessageController.importSales
);

// Crear mensaje de campaña manualmente (asignación manual)
campaignMessageRoutes.post(
  "/campaign-messages",
  isAuth,
  CampaignMessageController.create
);

// Listar todos los mensajes de campaña (paginado)
campaignMessageRoutes.get(
  "/campaign-messages",
  isAuth,
  CampaignMessageController.index
);

// Conteos TOTALES por estado (all/sent/pending/pending_no_value) para los filtros.
// IMPORTANTE: declarar ANTES de "/campaign-messages/:id" para que "counts" no se tome como id.
campaignMessageRoutes.get(
  "/campaign-messages/counts",
  isAuth,
  CampaignMessageController.counts
);

// Obtener mensajes de campaña por ticketId
campaignMessageRoutes.get(
  "/campaign-messages/ticket/:ticketId",
  isAuth,
  CampaignMessageController.listByTicket
);

// Obtener un mensaje de campaña por ID
campaignMessageRoutes.get(
  "/campaign-messages/:id",
  isAuth,
  CampaignMessageController.show
);

// Actualizar conversionNote de un mensaje de campaña
campaignMessageRoutes.put(
  "/campaign-messages/:id",
  isAuth,
  CampaignMessageController.update
);

export default campaignMessageRoutes;
