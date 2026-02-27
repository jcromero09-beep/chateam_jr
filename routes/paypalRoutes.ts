import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as PaypalController from "../controllers/PaypalController";

const paypalRoutes = Router();

/**
 * Rutas de PayPal para gestión de pagos
 */

// POST /paypal/create-order - Crear orden de pago en PayPal
// Requiere autenticación
// Body: { invoiceId, planId, months }
paypalRoutes.post("/paypal/create-order", isAuth, PaypalController.createOrder);

// POST /paypal/capture-order - Capturar pago después de aprobación
// Requiere autenticación
// Body: { orderID, invoiceId }
paypalRoutes.post("/paypal/capture-order", isAuth, PaypalController.captureOrder);

// POST /paypal/webhook - Procesa eventos de PayPal (webhooks)
// NO requiere autenticación (viene directamente de PayPal)
paypalRoutes.post("/paypal/webhook", PaypalController.webhook);

export default paypalRoutes;
