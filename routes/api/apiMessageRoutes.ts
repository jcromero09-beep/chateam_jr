import express from "express";

import * as MessageController from "../../controllers/api/MessageController";
import isAuth from "../../middleware/isAuth";

const apiMessageRoutes = express.Router();

// SEGURIDAD: antes usaba isAuthCompany (token GLOBAL compartido) + companyId del body →
// fuga cross-tenant. Ahora isAuth ata la petición a la identidad del usuario (req.user.companyId).
apiMessageRoutes.get("/messagesRange", isAuth, MessageController.show);

export default apiMessageRoutes;console.log("📄 API-MESSAGE-ROUTES.TS LOADED\!");
