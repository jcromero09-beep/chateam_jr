import express from "express";
import isAuth from "../middleware/isAuth";
import multer from "multer";
import * as AISubplanPurchaseController from "../controllers/AISubplanPurchaseController";
import uploadConfig from "../config/upload";

const routes = express.Router();

const upload = multer(uploadConfig);

/**
 * Rutas para compra de subplans de tokens IA
 * Todas requieren autenticación
 */

// Obtener información de tokens de la empresa (balance y subplan activo)
routes.get("/token-info", isAuth, AISubplanPurchaseController.getCompanyTokenInfo);

// Listar subplans disponibles para compra (públicos y activos)
routes.get("/available", isAuth, AISubplanPurchaseController.listAvailableSubplans);

// Crear sesión de checkout de Stripe para comprar subplan
routes.post("/checkout", isAuth, AISubplanPurchaseController.createSubplanCheckout);

// Crear orden de PayPal para comprar subplan
routes.post("/paypal", isAuth, AISubplanPurchaseController.createSubplanPaypalOrder);

// Capturar orden de PayPal y acreditar tokens
routes.post("/paypal/capture", isAuth, AISubplanPurchaseController.captureSubplanPaypalOrder);

// Procesar pago por comprobante (upload de archivo)
routes.post("/comprobante", isAuth, upload.single('file'), AISubplanPurchaseController.processSubplanComprobante);

export default routes;
