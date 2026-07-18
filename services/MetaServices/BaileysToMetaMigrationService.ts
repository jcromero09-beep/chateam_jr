/**
 * BaileysToMetaMigrationService — Handover graceful de Baileys a Meta Coexistencia
 *
 * Flujo de migración:
 * 1. Verificar elegibilidad (MigrationEligibilityService)
 * 2. Cerrar sesión Baileys (removeWbot + DeleteBaileysService)
 * 3. Limpiar cache Redis
 * 4. Marcar conexión como "migrating"
 * 5. (Usuario realiza Embedded Signup externamente)
 * 6. Completar migración: reasignar tickets a nueva conexión Meta
 * 7. Marcar conexión antigua como "migrated"
 *
 * REGLA BD SAGRADA: NUNCA se eliminan registros. Se marcan como "migrated".
 */
import Whatsapp from "../../models/Whatsapp";
import Ticket from "../../models/Ticket";
import { Op } from "sequelize";
import { removeWbot } from "../../libs/wbot";
import DeleteBaileysService from "../BaileysServices/DeleteBaileysService";
import cacheLayer from "../../libs/cache";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";
import MigrationEligibilityService from "./MigrationEligibilityService";

export interface MigrationStartResult {
  success: boolean;
  phase: "disconnected" | "error";
  whatsappId: number;
  message: string;
  nextStep: string;
}

export interface MigrationCompleteResult {
  success: boolean;
  oldWhatsappId: number;
  newWhatsappId: number;
  ticketsMigrated: number;
  message: string;
}

export interface MigrationStatusResult {
  whatsappId: number;
  migrationStatus: string | null;
  connectionStatus: string;
  provider: string;
  channel: string;
  coexistenceEnabled: boolean;
  coexistenceStatus: string | null;
  relatedMetaConnection: {
    id: number;
    name: string;
    status: string;
  } | null;
}

/**
 * Fase 1: Desconectar Baileys y preparar para migración
 */
export async function startMigration(
  whatsappId: number,
  companyId: number
): Promise<MigrationStartResult> {
  logger.info(`[Migration] Iniciando migración para Whatsapp #${whatsappId}, company ${companyId}`);

  // 1. Verificar elegibilidad
  const eligibility = await MigrationEligibilityService(whatsappId, companyId);

  if (!eligibility.eligible) {
    return {
      success: false,
      phase: "error",
      whatsappId,
      message: `No elegible: ${eligibility.reasons.join(". ")}`,
      nextStep: "Corregir los problemas indicados",
    };
  }

  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (!whatsapp) {
    return {
      success: false,
      phase: "error",
      whatsappId,
      message: "Conexión no encontrada",
      nextStep: "",
    };
  }

  try {
    // 2. Cerrar sesión Baileys
    logger.info(`[Migration] Paso 1: Cerrando sesión Baileys #${whatsappId}...`);
    try {
      await removeWbot(whatsappId, true); // true = logout + close WebSocket
      logger.info(`[Migration] Sesión Baileys cerrada`);
    } catch (wbotErr: any) {
      logger.warn(`[Migration] Advertencia al cerrar wbot (no crítico): ${wbotErr.message}`);
    }

    // 3. Eliminar datos de sesión Baileys
    logger.info(`[Migration] Paso 2: Eliminando datos de sesión Baileys...`);
    try {
      await DeleteBaileysService(whatsappId);
      logger.info(`[Migration] Datos Baileys eliminados`);
    } catch (delErr: any) {
      logger.warn(`[Migration] Advertencia al eliminar Baileys data (no crítico): ${delErr.message}`);
    }

    // 4. Limpiar cache Redis
    logger.info(`[Migration] Paso 3: Limpiando cache Redis...`);
    try {
      await cacheLayer.delFromPattern(`sessions:${whatsappId}:*`);
      logger.info(`[Migration] Cache Redis limpiado`);
    } catch (cacheErr: any) {
      logger.warn(`[Migration] Advertencia al limpiar cache (no crítico): ${cacheErr.message}`);
    }

    // 5. Marcar la conexión como "migrating" (BD SAGRADA: no eliminar)
    await whatsapp.update({
      status: "DISCONNECTED",
      qrcode: "",
      session: "",
      retries: 0,
      coexistenceStatus: "migrating",
    });

    // 6. Notificar por Socket
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
      action: "update",
      session: whatsapp,
    });

    io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
      action: "update",
      whatsapp: whatsapp,
    });

    logger.info(`[Migration] Baileys desconectado exitosamente para Whatsapp #${whatsappId}`);

    return {
      success: true,
      phase: "disconnected",
      whatsappId,
      message: "Conexion Baileys desconectada. Procede con el Embedded Signup para activar Meta Coexistencia en este numero.",
      nextStep: "Ejecutar Embedded Signup con el mismo numero de telefono",
    };
  } catch (err: any) {
    logger.error(`[Migration] Error en migración: ${err.message}`);
    // Intentar revertir el estado
    try {
      await whatsapp.update({ coexistenceStatus: null });
    } catch (_) {
      /* ignore */
    }
    return {
      success: false,
      phase: "error",
      whatsappId,
      message: `Error durante la migración: ${err.message}`,
      nextStep: "Revisar logs y reintentar",
    };
  }
}

/**
 * Fase 2: Completar migración después del Embedded Signup
 * Reasigna tickets de la conexión vieja a la nueva
 */
export async function completeMigration(
  oldWhatsappId: number,
  newWhatsappId: number,
  companyId: number
): Promise<MigrationCompleteResult> {
  logger.info(
    `[Migration] Completando migración: old=#${oldWhatsappId} → new=#${newWhatsappId}, company ${companyId}`
  );

  // Validar conexión vieja
  const oldWhatsapp = await Whatsapp.findOne({
    where: { id: oldWhatsappId, companyId },
  });
  if (!oldWhatsapp) {
    return {
      success: false,
      oldWhatsappId,
      newWhatsappId,
      ticketsMigrated: 0,
      message: "Conexion original no encontrada",
    };
  }

  // Validar conexión nueva
  const newWhatsapp = await Whatsapp.findOne({
    where: { id: newWhatsappId, companyId, provider: "meta", channel: "meta" },
  });
  if (!newWhatsapp) {
    return {
      success: false,
      oldWhatsappId,
      newWhatsappId,
      ticketsMigrated: 0,
      message: "Conexion Meta destino no encontrada o no es de tipo Meta",
    };
  }

  try {
    // 1. Reasignar tickets activos (open + pending) de vieja a nueva
    const [ticketsMigrated] = await Ticket.update(
      { whatsappId: newWhatsappId },
      {
        where: {
          whatsappId: oldWhatsappId,
          companyId,
          status: { [Op.in]: ["open", "pending"] },
        },
      }
    );

    logger.info(`[Migration] ${ticketsMigrated} tickets reasignados de #${oldWhatsappId} a #${newWhatsappId}`);

    // 2. Marcar conexión vieja como "migrated" (BD SAGRADA: no eliminar)
    await oldWhatsapp.update({
      status: "MIGRATED",
      coexistenceStatus: "migrated",
      // Guardar referencia a la nueva conexión
      session: JSON.stringify({
        migratedTo: newWhatsappId,
        migratedAt: new Date().toISOString(),
        ticketsMigrated,
      }),
    });

    // 3. Actualizar coexistencia de la nueva conexión
    if (!newWhatsapp.coexistenceEnabled) {
      await newWhatsapp.update({
        coexistenceEnabled: true,
        coexistenceStatus: "active",
        coexistenceOnboardedAt: new Date(),
      });
    }

    // 4. Notificar por Socket
    const io = getIO();

    io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
      action: "update",
      whatsapp: oldWhatsapp,
    });

    io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
      action: "update",
      whatsapp: newWhatsapp,
    });

    logger.info(
      `[Migration] Migración completada: #${oldWhatsappId} → #${newWhatsappId}, ${ticketsMigrated} tickets`
    );

    return {
      success: true,
      oldWhatsappId,
      newWhatsappId,
      ticketsMigrated,
      message: `Migracion completada. ${ticketsMigrated} ticket(s) reasignados a la conexion Meta.`,
    };
  } catch (err: any) {
    logger.error(`[Migration] Error completando migración: ${err.message}`);
    return {
      success: false,
      oldWhatsappId,
      newWhatsappId,
      ticketsMigrated: 0,
      message: `Error: ${err.message}`,
    };
  }
}

/**
 * Obtener estado actual de la migración
 */
export async function getMigrationStatus(
  whatsappId: number,
  companyId: number
): Promise<MigrationStatusResult> {
  const whatsapp = await Whatsapp.findOne({
    where: { id: whatsappId, companyId },
  });

  if (!whatsapp) {
    return {
      whatsappId,
      migrationStatus: null,
      connectionStatus: "NOT_FOUND",
      provider: "",
      channel: "",
      coexistenceEnabled: false,
      coexistenceStatus: null,
      relatedMetaConnection: null,
    };
  }

  // Buscar conexión Meta relacionada (mismo número)
  let relatedMeta: { id: number; name: string; status: string } | null = null;

  if (whatsapp.number) {
    const metaConn = await Whatsapp.findOne({
      where: {
        companyId,
        number: whatsapp.number,
        provider: "meta",
        channel: "meta",
        id: { [Op.ne]: whatsappId },
      },
    });

    if (metaConn) {
      relatedMeta = {
        id: metaConn.id,
        name: metaConn.name,
        status: metaConn.status,
      };
    }
  }

  // Determinar estado de migración
  let migrationStatus: string | null = null;

  if (whatsapp.coexistenceStatus === "migrating") {
    migrationStatus = "in_progress";
  } else if (whatsapp.coexistenceStatus === "migrated") {
    migrationStatus = "completed";
  } else if (whatsapp.provider === "stable" && relatedMeta) {
    migrationStatus = "ready_to_complete";
  }

  return {
    whatsappId,
    migrationStatus,
    connectionStatus: whatsapp.status,
    provider: whatsapp.provider || "stable",
    channel: whatsapp.channel || "whatsapp",
    coexistenceEnabled: whatsapp.coexistenceEnabled || false,
    coexistenceStatus: whatsapp.coexistenceStatus,
    relatedMetaConnection: relatedMeta,
  };
}
