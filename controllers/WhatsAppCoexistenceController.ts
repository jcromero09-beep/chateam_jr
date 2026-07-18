/**
 * WhatsAppCoexistenceController
 * Controlador para coexistencia Meta WhatsApp + migración Baileys → Meta
 *
 * Endpoints:
 * GET  /whatsapp/coexistence/status     → Estado de conexiones + alertas liveness
 * GET  /whatsapp/coexistence/app-status → Estado rápido de la App Meta
 * POST /whatsapp/coexistence/setup      → Setup automático App Meta
 * POST /webhook/meta/embedded-signup    → Callback del Embedded Signup
 * GET  /whatsapp/migration/eligibility/:id → Verificar elegibilidad migración
 * POST /whatsapp/migration/start/:id    → Desconectar Baileys (fase 1)
 * POST /whatsapp/migration/complete     → Reasignar tickets (fase 2)
 * GET  /whatsapp/migration/status/:id   → Estado de migración
 */
import { Request, Response } from "express";
import Whatsapp from "../models/Whatsapp";
import CoexistenceLivenessService from "../services/MetaServices/CoexistenceLivenessService";
import { runMetaAppSetup, getMetaAppStatus } from "../services/MetaServices/MetaAppSetupService";
import { processEmbeddedSignupCallback } from "../services/MetaServices/metaEmbeddedSignupService";
import CompaniesSettings from "../models/CompaniesSettings";
import {
  connectViaManualToken,
  requestVerificationCode,
  verifyPhoneCode,
  registerForCloudAPI,
} from "../services/MetaServices/metaManualConnectService";
import { lookupPhoneNumbers } from "../services/MetaServices/metaPhoneLookupService";
import MigrationEligibilityService from "../services/MetaServices/MigrationEligibilityService";
import {
  startMigration,
  completeMigration,
  getMigrationStatus,
} from "../services/MetaServices/BaileysToMetaMigrationService";
import logger from "../utils/logger";

// ─────────────────────────────────────────────
// Helper: extrae message y statusCode de errores
// ─────────────────────────────────────────────
const extractError = (error: unknown): { msg: string; statusCode: number } => {
  if (error && typeof error === "object" && "message" in error) {
    const e = error as { message: string; statusCode?: number };
    const msg = e.message;
    const statusCode =
      e.statusCode ||
      (msg.includes("NOT_FOUND") ? 404 : msg.includes("ERR_") ? 400 : 500);
    return { msg, statusCode };
  }
  return { msg: String(error), statusCode: 500 };
};

// ─────────────────────────────────────────────
// COEXISTENCIA
// ─────────────────────────────────────────────

/**
 * GET /whatsapp/coexistence/status
 * Estado completo de conexiones Meta + alertas liveness
 */
export const getCoexistenceStatus = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;

    // 1. Conexiones Meta de esta empresa
    const connections = await Whatsapp.findAll({
      where: { companyId, provider: "meta", channel: "meta" },
      attributes: [
        "id", "name", "status", "number", "displayPhoneNumber",
        "phoneNumberId", "facebookUserId", "coexistenceEnabled",
        "coexistenceStatus", "coexistenceOnboardedAt", "lastAppOpenedAt",
        "receiveChannel", "sendChannel", "linkedWhatsappId",
      ],
    });

    // 1b. Resolver nombres de conexiones Baileys vinculadas
    const linkedIds = connections
      .map((c) => c.linkedWhatsappId)
      .filter(Boolean);
    const linkedMap: Record<number, string> = {};
    if (linkedIds.length > 0) {
      const linkedConnections = await Whatsapp.findAll({
        where: { id: linkedIds },
        attributes: ["id", "name"],
      });
      linkedConnections.forEach((lc) => {
        linkedMap[lc.id] = lc.name;
      });
    }

    // 2. Liveness check (alertas)
    const livenessResult = await CoexistenceLivenessService();
    const companyAlerts = livenessResult.details.filter(
      (d) => d.companyId === companyId
    );

    // 3. Company Meta app config check
    const companySettings = await CompaniesSettings.findOne({ where: { companyId } });
    const envCheck = {
      FACEBOOK_APP_ID: !!companySettings?.facebookAppId,
      FACEBOOK_APP_SECRET: !!companySettings?.facebookAppSecret,
      FB_GRAPH_VERSION: process.env.FB_GRAPH_VERSION || "v24.0",
    };

    // 4. Summary
    const summary = {
      totalMetaConnections: connections.length,
      coexistenceActive: connections.filter(
        (c) => c.coexistenceEnabled && c.coexistenceStatus === "active"
      ).length,
      coexistencePending: connections.filter(
        (c) => c.coexistenceStatus === "pending_sync" || c.coexistenceStatus === "syncing"
      ).length,
      alertsCount: companyAlerts.length,
    };

    return res.json({
      success: true,
      data: {
        connections: connections.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          number: c.number,
          displayPhoneNumber: c.displayPhoneNumber,
          phoneNumberId: c.phoneNumberId,
          wabaId: c.facebookUserId,
          coexistence: {
            enabled: c.coexistenceEnabled || false,
            status: c.coexistenceStatus,
            onboardedAt: c.coexistenceOnboardedAt,
            lastAppOpenedAt: c.lastAppOpenedAt,
            receiveChannel: c.receiveChannel || "both",
            sendChannel: c.sendChannel || "meta",
            linkedWhatsappId: c.linkedWhatsappId || null,
            linkedWhatsappName: c.linkedWhatsappId ? (linkedMap[c.linkedWhatsappId] || null) : null,
          },
        })),
        envCheck,
        alerts: companyAlerts.map((a) => ({
          whatsappId: a.whatsappId,
          name: a.name,
          level: a.level,
          daysSinceOpen: a.daysSinceOpen,
          message:
            a.level === "warning"
              ? `Recuerda abrir la Business App. Llevas ${a.daysSinceOpen} días sin abrirla.`
              : a.level === "critical"
              ? `¡URGENTE! Queda ${14 - a.daysSinceOpen} día(s) antes de que se desactive.`
              : a.level === "disabled"
              ? `Coexistencia DESACTIVADA. ${a.daysSinceOpen} días sin abrir.`
              : "",
        })),
        summary,
      },
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[Coexistence:status] Error: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: "Error obteniendo estado de coexistencia",
      errors: [msg],
    });
  }
};

/**
 * GET /whatsapp/coexistence/app-status
 * Estado rápido de la App Meta (suscripciones, webhook)
 */
export const getAppStatus = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const appStatus = await getMetaAppStatus(companyId);

    return res.json({
      success: true,
      data: appStatus,
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[Coexistence:app-status] Error: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: "Error obteniendo estado de la App Meta",
      errors: [msg],
    });
  }
};

/**
 * POST /whatsapp/coexistence/setup
 * Setup automático de la App Meta (webhooks, suscripciones, config_id)
 */
export const setupCoexistence = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;

    const setupResult = await runMetaAppSetup(companyId);

    return res.json({
      success: true,
      message: setupResult.success
        ? "Setup completado exitosamente"
        : "Setup completado con advertencias",
      data: setupResult,
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[Coexistence:setup] Error: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: "Error ejecutando setup de coexistencia",
      errors: [msg],
    });
  }
};

// ─────────────────────────────────────────────
// EMBEDDED SIGNUP
// ─────────────────────────────────────────────

/**
 * POST /webhook/meta/embedded-signup
 * Callback del Facebook JS SDK Embedded Signup
 */
export const embeddedSignup = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { code, connectionName, redirectUri, _isAccessToken } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: "Se requiere el authorization code de Facebook",
      });
    }

    const result = await processEmbeddedSignupCallback({
      code,
      companyId,
      connectionName,
      redirectUri: typeof redirectUri === "string" ? redirectUri.trim() : undefined,
      isAccessToken: _isAccessToken === true,
    });

    return res.json({
      success: true,
      whatsapp: { id: result.whatsapp.id, name: result.whatsapp.name },
      metaNumber: {
        displayPhoneNumber: result.displayPhoneNumber,
        wabaId: result.wabaId,
        tokenExpiresAt: result.tokenExpiresAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[EmbeddedSignup:controller] Error: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      error: msg,
    });
  }
};

// ─────────────────────────────────────────────
// MIGRACIÓN BAILEYS → META
// ─────────────────────────────────────────────

/**
 * GET /whatsapp/migration/eligibility/:id
 * Verificar elegibilidad de migración
 */
export const checkEligibility = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const whatsappId = Number(req.params.id);

    if (!whatsappId || isNaN(whatsappId)) {
      return res.status(400).json({
        success: false,
        message: "ID de conexión inválido",
      });
    }

    const result = await MigrationEligibilityService(whatsappId, companyId);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[Migration:eligibility] Error: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: "Error verificando elegibilidad",
      errors: [msg],
    });
  }
};

/**
 * POST /whatsapp/migration/start/:id
 * Fase 1: Desconectar Baileys
 */
export const startMigrationHandler = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const whatsappId = Number(req.params.id);

    if (!whatsappId || isNaN(whatsappId)) {
      return res.status(400).json({
        success: false,
        message: "ID de conexión inválido",
      });
    }

    const result = await startMigration(whatsappId, companyId);

    return res.json({
      success: result.success,
      message: result.message,
      data: result,
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[Migration:start] Error: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: "Error iniciando migración",
      errors: [msg],
    });
  }
};

/**
 * POST /whatsapp/migration/complete
 * Fase 2: Reasignar tickets
 */
export const completeMigrationHandler = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { oldWhatsappId, newWhatsappId } = req.body;

    if (!oldWhatsappId || !newWhatsappId) {
      return res.status(400).json({
        success: false,
        message: "Se requieren oldWhatsappId y newWhatsappId",
      });
    }

    const result = await completeMigration(
      Number(oldWhatsappId),
      Number(newWhatsappId),
      companyId
    );

    return res.json({
      success: result.success,
      message: result.message,
      data: result,
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[Migration:complete] Error: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: "Error completando migración",
      errors: [msg],
    });
  }
};

/**
 * GET /whatsapp/migration/status/:id
 * Estado actual de la migración
 */
export const getMigrationStatusHandler = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const whatsappId = Number(req.params.id);

    if (!whatsappId || isNaN(whatsappId)) {
      return res.status(400).json({
        success: false,
        message: "ID de conexión inválido",
      });
    }

    const result = await getMigrationStatus(whatsappId, companyId);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[Migration:status] Error: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      message: "Error obteniendo estado de migración",
      errors: [msg],
    });
  }
};

/**
 * POST /whatsapp/meta/lookup-phones
 * Dado un token (+ WABA ID opcional), retorna la lista de Phone Numbers disponibles.
 * Permite al usuario seleccionar el número a conectar sin buscar el ID manualmente.
 */
export const lookupPhones = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { accessToken, wabaId } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: "Se requiere accessToken",
      });
    }

    const result = await lookupPhoneNumbers(accessToken, wabaId);

    return res.json({
      success: true,
      data: {
        phoneNumbers: result.phoneNumbers,
        wabaIds: result.wabaIds,
        total: result.phoneNumbers.length,
      },
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[LookupPhones] Error: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      error: msg,
    });
  }
};

/**
 * POST /whatsapp/meta/request-code
 * Solicita código OTP vía SMS/VOZ al número para verificarlo en Cloud API
 */
export const requestCode = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { accessToken, phoneNumberId, method, language } = req.body;
    if (!accessToken || !phoneNumberId) {
      return res.status(400).json({ success: false, error: "Se requieren accessToken y phoneNumberId" });
    }
    const result = await requestVerificationCode(phoneNumberId, accessToken, method || "SMS", language || "es");
    return res.json({ success: result.success, error: result.error });
  } catch (error: unknown) {
    const { msg } = extractError(error);
    return res.status(500).json({ success: false, error: msg });
  }
};

/**
 * POST /whatsapp/meta/verify-code
 * Verifica el código OTP recibido por SMS
 */
export const verifyCode = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { accessToken, phoneNumberId, code } = req.body;
    if (!accessToken || !phoneNumberId || !code) {
      return res.status(400).json({ success: false, error: "Se requieren accessToken, phoneNumberId y code" });
    }
    const result = await verifyPhoneCode(phoneNumberId, accessToken, String(code));
    return res.json({ success: result.success, error: result.error });
  } catch (error: unknown) {
    const { msg } = extractError(error);
    return res.status(500).json({ success: false, error: msg });
  }
};

/**
 * POST /whatsapp/meta/register-cloud
 * Registra el número verificado para Cloud API (requiere BSP/TP — puede fallar para SMBs)
 */
export const registerCloud = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { accessToken, phoneNumberId, pin } = req.body;
    if (!accessToken || !phoneNumberId) {
      return res.status(400).json({ success: false, error: "Se requieren accessToken y phoneNumberId" });
    }
    const result = await registerForCloudAPI(phoneNumberId, accessToken, pin || "000000");
    return res.json({ success: result.success, alreadyCloud: result.alreadyCloud, error: result.error });
  } catch (error: unknown) {
    const { msg } = extractError(error);
    return res.status(500).json({ success: false, error: msg });
  }
};

/**
 * POST /whatsapp/meta/connect-manual
 * Conecta WhatsApp via Permanent System User Token (no requiere BSP/TP)
 * El usuario obtiene el token desde Meta Business Manager > System Users
 */
export const connectManual = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { accessToken, phoneNumberId, wabaId, connectionName } = req.body;

    if (!accessToken || !phoneNumberId) {
      return res.status(400).json({
        success: false,
        error: "Se requieren: accessToken y phoneNumberId",
      });
    }

    const result = await connectViaManualToken({
      accessToken,
      phoneNumberId: String(phoneNumberId).trim(),
      wabaId: wabaId ? String(wabaId).trim() : undefined,
      connectionName,
      companyId,
    });

    return res.json({
      success: true,
      message: `Conexion "${result.whatsapp.name}" creada exitosamente`,
      whatsapp: { id: result.whatsapp.id, name: result.whatsapp.name },
      metaNumber: {
        displayPhoneNumber: result.displayPhoneNumber,
        verifiedName: result.verifiedName,
        wabaId: result.wabaId,
      },
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[ManualConnect:controller] Error: ${msg}`);
    return res.status(statusCode).json({
      success: false,
      error: msg,
    });
  }
};

// ─────────────────────────────────────────────
// CONFIGURACIÓN DE COEXISTENCIA
// ─────────────────────────────────────────────

/**
 * PUT /whatsapp/coexistence/:id/config
 * Actualizar configuración de coexistencia (receiveChannel, sendChannel, linkedWhatsappId)
 */
export const updateCoexistenceConfig = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;
    const { coexistenceEnabled, receiveChannel, sendChannel, linkedWhatsappId } = req.body;

    // Validar que la conexión existe y pertenece a la company
    const whatsapp = await Whatsapp.findOne({ where: { id: Number(id), companyId } });
    if (!whatsapp) {
      return res.status(404).json({ success: false, error: "Conexión no encontrada" });
    }

    // Validar valores permitidos
    if (receiveChannel && !["meta", "baileys", "both"].includes(receiveChannel)) {
      return res.status(400).json({ success: false, error: "receiveChannel inválido. Valores: meta | baileys | both" });
    }
    if (sendChannel && !["meta", "baileys"].includes(sendChannel)) {
      return res.status(400).json({ success: false, error: "sendChannel inválido. Valores: meta | baileys" });
    }

    // Si linkedWhatsappId, verificar que existe y es de la misma company
    if (linkedWhatsappId) {
      const linked = await Whatsapp.findOne({
        where: { id: linkedWhatsappId, companyId, channel: "whatsapp" }
      });
      if (!linked) {
        return res.status(400).json({ success: false, error: "Conexión Baileys vinculada no encontrada en esta empresa" });
      }
    }

    // Actualizar (NUNCA borrar — BD SAGRADA)
    await whatsapp.update({
      coexistenceEnabled: coexistenceEnabled !== undefined ? coexistenceEnabled : whatsapp.coexistenceEnabled,
      coexistenceStatus: coexistenceEnabled === false ? "disabled" : (coexistenceEnabled === true ? "active" : whatsapp.coexistenceStatus),
      receiveChannel: receiveChannel || whatsapp.receiveChannel || "both",
      // Meta principal en coexistencia: si no se especifica y no hay valor previo, 'meta'.
      sendChannel: sendChannel || whatsapp.sendChannel || "meta",
      linkedWhatsappId: linkedWhatsappId !== undefined ? linkedWhatsappId : whatsapp.linkedWhatsappId,
      ...(coexistenceEnabled && !whatsapp.coexistenceOnboardedAt ? { coexistenceOnboardedAt: new Date() } : {}),
    });

    logger.info(`[Coexistence:config] Conexión ${id} actualizada: receive=${receiveChannel}, send=${sendChannel}, linked=${linkedWhatsappId}`);

    return res.json({
      success: true,
      message: "Configuración de coexistencia actualizada",
      data: {
        id: whatsapp.id,
        name: whatsapp.name,
        coexistenceEnabled: whatsapp.coexistenceEnabled,
        receiveChannel: whatsapp.receiveChannel,
        sendChannel: whatsapp.sendChannel,
        linkedWhatsappId: whatsapp.linkedWhatsappId,
      },
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[Coexistence:config] Error: ${msg}`);
    return res.status(statusCode).json({ success: false, error: msg });
  }
};

/**
 * GET /whatsapp/coexistence/baileys-connections
 * Lista conexiones Baileys de la company (para dropdown en modal de config)
 */
export const listBaileysConnections = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;

    const connections = await Whatsapp.findAll({
      where: { companyId, channel: "whatsapp" },
      attributes: ["id", "name", "number", "status", "provider"],
      order: [["id", "ASC"]],
    });

    return res.json({
      success: true,
      data: connections.map((c) => ({
        id: c.id,
        name: c.name,
        number: c.number,
        status: c.status,
        provider: c.provider,
      })),
    });
  } catch (error: unknown) {
    const { msg, statusCode } = extractError(error);
    logger.error(`[Coexistence:baileys-list] Error: ${msg}`);
    return res.status(statusCode).json({ success: false, error: msg });
  }
};
