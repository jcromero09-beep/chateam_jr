// console.log("📦 Loading app.ts...");
import "./bootstrap";
// console.log("📦 [1/15] bootstrap loaded");
import "reflect-metadata";
// console.log("📦 [2/15] reflect-metadata loaded");
import "express-async-errors";
// console.log("📦 [3/15] express-async-errors loaded");
import express, { Request, Response, NextFunction } from "express";
// console.log("📦 [4/15] express loaded");
import cors from "cors";
// console.log("📦 [5/15] cors loaded");
import cookieParser from "cookie-parser";
// console.log("📦 [6/15] cookieParser loaded");
import helmet from "helmet";
// console.log("📦 [7/15] helmet loaded");
import compression from "compression";
// console.log("📦 [8/15] compression loaded");
import * as Sentry from "@sentry/node";
// console.log("📦 [9/15] Sentry loaded");
import { config as dotenvConfig } from "dotenv";
// console.log("📦 [10/15] dotenv loaded");
import bodyParser from 'body-parser';
// console.log("📦 [11/15] bodyParser loaded");

// console.log("📦 Importing database...");
import "./database";
// console.log("📦 Database imported");
import uploadConfig from "./config/upload";
// console.log("📦 [12/15] uploadConfig loaded");
import AppError from "./errors/AppError";
// console.log("📦 [13/15] AppError loaded");
import logger from "./utils/logger";
// console.log("📦 [14/15] logger loaded");
import { httpLogger, logStartup } from "./config/logger";
// console.log("📦 [15/15] config/logger loaded");

// ⚠️ CARGAR VARIABLES DE ENTORNO ANTES DE IMPORTAR RUTAS (auth.ts las requiere)
dotenvConfig();

// console.log("📦 Importing routes...");
import routes from "./routes/index";
// console.log("📦 Routes imported!");

// Inicializar Sentry
Sentry.init({ dsn: process.env.SENTRY_DSN });

// console.log("📦 Creating express app...");
const app = express();
// console.log("📦 Express app created");

// Log startup information
logStartup("JR Chateam Backend v6.0.0 starting...", {
  environment: process.env.NODE_ENV || "development",
  version: "6.0.0",
  nodeVersion: process.version,
  port: process.env.PORT || "3000",
  startupTime: new Date().toISOString()
});

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Compression
app.use(compression());

// CORS configuration
app.use(
  cors({
    credentials: true,
    origin: process.env.FRONTEND_URL
  })
);

// Body parsing middleware
app.use(cookieParser());

// Capturar raw body para validación HMAC de webhook Stripe
// stripe.webhooks.constructEvent() requiere el body sin parsear (Buffer)
app.use(bodyParser.json({
  limit: '50mb',
  verify: (req: any, _res, buf) => {
    if (req.originalUrl && req.originalUrl.includes('/stripewebhook')) {
      req.rawBody = buf;
    }
  }
}));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use(
  "/public",
  express.static(uploadConfig.directory)
);

// HTTP logging (only in production)
if (process.env.NODE_ENV === 'production') {
  app.use(httpLogger);
}

// Routes
app.use(routes);

// Global error handler
app.use(async (err: any, req: Request, res: Response, _: NextFunction) => {
  // Manejo específico: constraint UNIQUE en Sequelize → 409
  if (err?.name === "SequelizeUniqueConstraintError") {
    const fields = err.fields ? Object.keys(err.fields).join(", ") : "campo único";
    logger.warn(`UniqueConstraint violation on ${fields}`);
    return res.status(409).json({
      error: `ERR_DUPLICATE_${fields.toUpperCase()}`,
      message: `El valor ya existe: ${fields}`,
      fields: err.fields || {}
    });
  }

  // Errores de validación Sequelize → 400
  if (err?.name === "SequelizeValidationError") {
    logger.warn(err);
    return res.status(400).json({
      error: "ERR_VALIDATION",
      message: err.message,
      errors: err.errors?.map((e: any) => ({ field: e.path, message: e.message }))
    });
  }

  if (err instanceof AppError || err?.name === "AppError") {
    logger.warn(err);
    // Incluir detalles de Meta si existen
    const response: any = {
      error: err.message,
      message: err.message
    };
    if ((err as any).metaError) {
      response.metaError = (err as any).metaError;
    }
    // Blindaje: statusCode debe ser un entero válido (100-599)
    const raw = (err as any).statusCode;
    const status =
      Number.isInteger(raw) && raw >= 100 && raw <= 599 ? raw : 500;
    return res.status(status).json(response);
  }

  logger.error(err);
  return res.status(500).json({ error: "Internal server error" });
});

// console.log("📦📦📦 APP.TS FULLY LOADED! 📦📦📦");
export default app;
