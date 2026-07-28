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
import { verifyMediaCookie, MEDIA_COOKIE } from "./helpers/mediaAuthCookie";
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
import traceIdMiddleware from "./middleware/traceIdMiddleware";

// ⚠️ CARGAR VARIABLES DE ENTORNO ANTES DE IMPORTAR RUTAS (auth.ts las requiere)
dotenvConfig();

// console.log("📦 Importing routes...");
import routes from "./routes/index";

import { assertMetaSignatureConfig } from "./services/CoexistenceServices/MetaSignatureValidator";
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

// Postura de seguridad de los webhooks de Meta: avisa fuerte si quedó en 'warn'
// o si falta FACEBOOK_APP_SECRET con 'enforce' activo.
assertMetaSignatureConfig();

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Compression
app.use(compression());

// CORS configuration
app.use(
  (req: Request, res: Response, next: NextFunction) => {
    const isPublicWebChat = req.path.startsWith("/webchat/public/");

    return cors({
      credentials: !isPublicWebChat,
      origin: (origin, callback) => {
        if (isPublicWebChat) {
          return callback(null, origin || true);
        }

        return callback(null, process.env.FRONTEND_URL);
      }
    })(req, res, next);
  }
);

// Body parsing middleware
app.use(cookieParser());

// Stripe necesita el body crudo exacto para validar stripe-signature.
// Montar este parser ANTES del JSON global evita que JSON.stringify/parse cambie
// espacios, saltos de linea o formato y rompa constructEvent().
app.use(
  "/subscription/stripewebhook",
  bodyParser.raw({ type: "application/json", limit: "5mb" })
);

// Relay interno entre nodos (RemoteWbot, /internal/wbot-call): transmite la media
// serializada como base64 DENTRO del JSON. Un video de 38MB → ~51MB en base64, lo que
// superaba el límite global de 50mb y devolvía PayloadTooLargeError → "Internal server
// error" → el frontend veía status 400 al enviar videos grandes. Estas rutas son
// localhost-only (montadas con routes.use(internalRoutes), comentario "Solo accesible
// desde localhost"), por lo que un límite alto NO expone endpoints públicos.
// Se monta ANTES del JSON global; body-parser es idempotente (no re-parsea /internal).
app.use(
  "/internal",
  bodyParser.json({ limit: '300mb' })
);

// Capturar raw body para validación HMAC de:
//   - Stripe webhook (stripe.webhooks.constructEvent requiere Buffer)
//   - Meta Cloud API webhook (X-Hub-Signature-256 HMAC-SHA256, FASE 2)
//   - Callback de páginas FB/IG (/webhook y /webhook/facebook)
//
// OJO: si un endpoint valida X-Hub-Signature-256 pero su ruta NO está aquí,
// rawBody llega undefined → el validador devuelve 'no_raw_body' → en modo
// 'enforce' rechaza el 100% del tráfico. Cualquier webhook nuevo que valide
// firma tiene que añadirse a esta lista.
const RAW_BODY_PATHS = [
  '/stripewebhook',
  '/api/fal/webhook',
  '/webhook/meta',
  '/webhook/metaws',
  '/webhooks/meta',
  '/webhooks/metaws',
  '/webhook/facebook',
  '/webhooks/facebook'
];

const needsRawBody = (originalUrl: string): boolean => {
  // Descartar querystring antes de comparar: /webhook?hub.mode=... debe
  // resolver a '/webhook'.
  const path = (originalUrl || "").split("?")[0].replace(/\/+$/, "") || "/";
  // Callback raíz del objeto page/instagram de Meta (POST /webhook).
  if (path === "/webhook" || path === "/webhooks") return true;
  return RAW_BODY_PATHS.some(p => path.includes(p));
};

app.use(bodyParser.json({
  limit: '50mb',
  verify: (req: any, _res, buf) => {
    if (needsRawBody(req.originalUrl)) {
      req.rawBody = buf;
    }
  }
}));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Static files
// Si la URL incluye ?download (opcionalmente ?download=nombre.ext), se fuerza la
// descarga del archivo añadiendo la cabecera Content-Disposition: attachment.
// Necesario porque el atributo HTML `download` es ignorado en enlaces
// cross-origin (frontend y backend están en dominios distintos).
app.use(
  "/public",
  // [P0-E · W1-SEC-02] Scope de tenant para la media. La `<img>` de la SPA
  // (mismo origen) manda la cookie `media_auth` firmada (la setea isAuth). Sin
  // cookie válida, o media de `company{N}` que no es la del cliente (salvo
  // super) → 404. Meta recibe la media por bytes (no por link a /public) y el
  // widget de webchat no referencia /public, así que este control no los afecta.
  (req: Request, res: Response, next: NextFunction) => {
    const claims = verifyMediaCookie((req as any).cookies?.[MEDIA_COOKIE]);
    if (!claims) {
      return res.status(404).end();
    }
    const m = req.path.match(/^\/company(\d+)\//);
    if (m && !claims.isSuper && Number(m[1]) !== claims.companyId) {
      return res.status(404).end();
    }
    return next();
  },
  (req: Request, _res: Response, next: NextFunction) => {
    if (req.query.download !== undefined) {
      const rawName = req.path.split("/").pop() || "descarga";
      const suggested =
        typeof req.query.download === "string" && req.query.download.trim()
          ? req.query.download.trim()
          : rawName;
      // Sanear el nombre para evitar inyección de cabeceras
      const safeName = suggested.replace(/["\r\n\\]/g, "").slice(0, 200);
      _res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeName}"`
      );
    }
    next();
  },
  express.static(uploadConfig.directory)
);

// FASE 1 Coexistencia — traceId por petición HTTP (X-Trace-Id)
// Se monta DESPUÉS de body parser para asegurar headers ya parseados,
// ANTES de rutas para que todo el stack vea el traceId.
app.use(traceIdMiddleware);

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
