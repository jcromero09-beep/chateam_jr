import express from "express";
import isAuth from "../middleware/isAuth.js";

import * as SubscriptionController from "../controllers/SubscriptionController.js";

const subscriptionRoutes = express.Router();

// Rutas de Stripe
subscriptionRoutes.post("/subscription", isAuth, SubscriptionController.createSubscription);
subscriptionRoutes.post("/subscription/paypal", isAuth, SubscriptionController.createPaypalPlanPayment);
subscriptionRoutes.post("/subscription/paypal/capture", isAuth, SubscriptionController.capturePaypalPlanPayment);
subscriptionRoutes.post("/subscription/stripewebhook/:type?", SubscriptionController.stripewebhook);
subscriptionRoutes.post("/subscription/cancel", isAuth, SubscriptionController.cancelsubscription);
subscriptionRoutes.post("/subscription/refund", isAuth, SubscriptionController.refundPayment);


// Rutas de Gerencianet/PIX (mantenidas por si acaso)https://server.chateam.ws/apple-webhook
subscriptionRoutes.post("/subscription/create/webhook", SubscriptionController.createWebhook);
subscriptionRoutes.post("/subscription/webhook/:type?", SubscriptionController.webhook);
subscriptionRoutes.post("/subscription/webhook/pix/:type?", SubscriptionController.webhook);

export default subscriptionRoutes;
