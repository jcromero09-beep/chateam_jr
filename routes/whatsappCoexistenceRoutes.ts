/**
 * WhatsApp Coexistence & Migration Routes
 * Rutas para coexistencia Meta + migración Baileys → Meta
 */
import express from "express";
import isAuth from "../middleware/isAuth";
import * as WhatsAppCoexistenceController from "../controllers/WhatsAppCoexistenceController";

const whatsappCoexistenceRoutes = express.Router();

// Todas las rutas requieren autenticación
whatsappCoexistenceRoutes.use(isAuth);

// ── Coexistencia ──────────────────────────────────────────
// GET /whatsapp/coexistence/status — Estado conexiones + alertas
whatsappCoexistenceRoutes.get(
  "/coexistence/status",
  WhatsAppCoexistenceController.getCoexistenceStatus
);

// GET /whatsapp/coexistence/app-status — Estado rápido App Meta
whatsappCoexistenceRoutes.get(
  "/coexistence/app-status",
  WhatsAppCoexistenceController.getAppStatus
);

// POST /whatsapp/coexistence/setup — Setup automático
whatsappCoexistenceRoutes.post(
  "/coexistence/setup",
  WhatsAppCoexistenceController.setupCoexistence
);

// ── Embedded Signup ───────────────────────────────────────
// POST /webhook/meta/embedded-signup — Callback Facebook JS SDK
// Nota: se monta como /webhook/meta/embedded-signup en index.ts
whatsappCoexistenceRoutes.post(
  "/embedded-signup",
  WhatsAppCoexistenceController.embeddedSignup
);

// ── Conexión Manual via Token de Sistema ─────────────────
// POST /whatsapp/meta/lookup-phones — Listar números disponibles con el token
whatsappCoexistenceRoutes.post(
  "/meta/lookup-phones",
  WhatsAppCoexistenceController.lookupPhones
);

// POST /whatsapp/meta/request-code — Solicitar SMS/VOZ de verificación
whatsappCoexistenceRoutes.post(
  "/meta/request-code",
  WhatsAppCoexistenceController.requestCode
);

// POST /whatsapp/meta/verify-code — Verificar código OTP recibido
whatsappCoexistenceRoutes.post(
  "/meta/verify-code",
  WhatsAppCoexistenceController.verifyCode
);

// POST /whatsapp/meta/register-cloud — Registrar número para Cloud API
whatsappCoexistenceRoutes.post(
  "/meta/register-cloud",
  WhatsAppCoexistenceController.registerCloud
);

// POST /whatsapp/meta/connect-manual — No requiere BSP/TP
whatsappCoexistenceRoutes.post(
  "/meta/connect-manual",
  WhatsAppCoexistenceController.connectManual
);

// ── Configuración de Coexistencia ─────────────────────────
// PUT /whatsapp/coexistence/:id/config — Actualizar config (receiveChannel, sendChannel, linkedWhatsappId)
whatsappCoexistenceRoutes.put(
  "/coexistence/:id/config",
  WhatsAppCoexistenceController.updateCoexistenceConfig
);

// GET /whatsapp/coexistence/baileys-connections — Listar conexiones Baileys (para dropdown)
whatsappCoexistenceRoutes.get(
  "/coexistence/baileys-connections",
  WhatsAppCoexistenceController.listBaileysConnections
);

// ── Migración ─────────────────────────────────────────────
// GET /whatsapp/migration/eligibility/:id — Elegibilidad
whatsappCoexistenceRoutes.get(
  "/migration/eligibility/:id",
  WhatsAppCoexistenceController.checkEligibility
);

// POST /whatsapp/migration/start/:id — Fase 1: Desconectar Baileys
whatsappCoexistenceRoutes.post(
  "/migration/start/:id",
  WhatsAppCoexistenceController.startMigrationHandler
);

// POST /whatsapp/migration/complete — Fase 2: Reasignar tickets
whatsappCoexistenceRoutes.post(
  "/migration/complete",
  WhatsAppCoexistenceController.completeMigrationHandler
);

// GET /whatsapp/migration/status/:id — Estado de migración
whatsappCoexistenceRoutes.get(
  "/migration/status/:id",
  WhatsAppCoexistenceController.getMigrationStatusHandler
);

export default whatsappCoexistenceRoutes;
