import express from "express";
import isAuth from "../middleware/isAuth";
import * as AIMercadoPagoController from "../controllers/AIMercadoPagoController";

const routes = express.Router();

// Payment preferences (requires auth)
routes.post("/ai/mercadopago/preferences", isAuth, AIMercadoPagoController.createPreference);
routes.get("/ai/mercadopago/payments/:paymentId", isAuth, AIMercadoPagoController.getPayment);
routes.get("/ai/mercadopago/status", isAuth, AIMercadoPagoController.checkStatus);

// Webhook (no auth - called by MercadoPago)
routes.post("/ai/mercadopago/webhook", AIMercadoPagoController.webhook);

export default routes;
