/**
 * CoexistenceLivenessService — CronJob de alerta de liveness
 *
 * Meta requiere que la WhatsApp Business App se abra al menos cada 14 días
 * para mantener la coexistencia activa. Si no se abre, Meta desactiva
 * la coexistencia y los webhooks dejan de llegar.
 *
 * Este servicio verifica lastAppOpenedAt y:
 * - 11 días sin abrir → alerta WARNING (quedan 3 días)
 * - 13 días sin abrir → alerta CRITICAL (queda 1 día)
 * - 14+ días sin abrir → marca como disabled
 *
 * Emite alertas por socket al frontend para mostrar notificaciones.
 */
import { Op } from "sequelize";
import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";

interface LivenessResult {
  connectionsChecked: number;
  warnings: number;
  criticals: number;
  disabled: number;
  details: Array<{
    whatsappId: number;
    companyId: number;
    name: string;
    daysSinceOpen: number;
    level: "ok" | "warning" | "critical" | "disabled";
  }>;
}

const CoexistenceLivenessService = async (): Promise<LivenessResult> => {
  const result: LivenessResult = {
    connectionsChecked: 0,
    warnings: 0,
    criticals: 0,
    disabled: 0,
    details: [],
  };

  try {
    // Buscar conexiones con coexistencia activa
    const connections = await Whatsapp.findAll({
      where: {
        coexistenceEnabled: true,
        coexistenceStatus: { [Op.in]: ["active", "syncing", "pending_sync"] },
        provider: "meta",
        channel: "meta",
      },
      attributes: [
        "id", "companyId", "name", "lastAppOpenedAt",
        "coexistenceStatus", "coexistenceEnabled",
      ],
    });

    result.connectionsChecked = connections.length;

    if (connections.length === 0) {
      return result;
    }

    const now = new Date();
    let io: ReturnType<typeof getIO> | null = null;

    try {
      io = getIO();
    } catch (error: any) {
      logger.warn(`[Liveness] Socket.IO no disponible en este proceso; se omiten alertas realtime: ${error.message}`);
    }

    for (const conn of connections) {
      const lastOpened = conn.lastAppOpenedAt ? new Date(conn.lastAppOpenedAt) : null;

      if (!lastOpened) {
        // Si nunca se registró apertura, usar fecha de onboarding o ahora
        continue;
      }

      const diffMs = now.getTime() - lastOpened.getTime();
      const daysSinceOpen = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      let level: "ok" | "warning" | "critical" | "disabled" = "ok";

      if (daysSinceOpen >= 14) {
        level = "disabled";
        result.disabled++;

        // Marcar como disabled en BD
        await conn.update({ coexistenceStatus: "disabled" });

        logger.error(
          `[Liveness] ❌ DESACTIVADA: ${conn.name} (ID: ${conn.id}) — ${daysSinceOpen} días sin abrir Business App`
        );

        // Emitir alerta crítica al frontend
        io?.of(String(conn.companyId)).emit(`company-${conn.companyId}-coexistence-alert`, {
          level: "disabled",
          whatsappId: conn.id,
          whatsappName: conn.name,
          daysSinceOpen,
          message: `¡Coexistencia DESACTIVADA! La Business App no se abrió en ${daysSinceOpen} días. Ábrela y reactiva desde Meta Business Manager.`,
        });

      } else if (daysSinceOpen >= 13) {
        level = "critical";
        result.criticals++;

        logger.warn(
          `[Liveness] 🔴 CRÍTICO: ${conn.name} (ID: ${conn.id}) — ${daysSinceOpen} días sin abrir Business App (quedan ${14 - daysSinceOpen} día(s))`
        );

        io?.of(String(conn.companyId)).emit(`company-${conn.companyId}-coexistence-alert`, {
          level: "critical",
          whatsappId: conn.id,
          whatsappName: conn.name,
          daysSinceOpen,
          message: `¡URGENTE! Abre la WhatsApp Business App HOY. Queda ${14 - daysSinceOpen} día antes de que se desactive la coexistencia.`,
        });

      } else if (daysSinceOpen >= 11) {
        level = "warning";
        result.warnings++;

        logger.warn(
          `[Liveness] ⚠️ AVISO: ${conn.name} (ID: ${conn.id}) — ${daysSinceOpen} días sin abrir Business App (quedan ${14 - daysSinceOpen} días)`
        );

        io?.of(String(conn.companyId)).emit(`company-${conn.companyId}-coexistence-alert`, {
          level: "warning",
          whatsappId: conn.id,
          whatsappName: conn.name,
          daysSinceOpen,
          message: `Recuerda abrir la WhatsApp Business App. Llevas ${daysSinceOpen} días sin abrirla (límite: 14 días).`,
        });
      }

      result.details.push({
        whatsappId: conn.id,
        companyId: conn.companyId,
        name: conn.name,
        daysSinceOpen,
        level,
      });
    }

    if (result.warnings > 0 || result.criticals > 0 || result.disabled > 0) {
      logger.info(
        `[Liveness] Resumen: ${result.connectionsChecked} revisadas, ` +
        `${result.warnings} warnings, ${result.criticals} críticos, ${result.disabled} desactivadas`
      );
    }
  } catch (err: any) {
    logger.error(`[Liveness] Error general: ${err.message}`);
  }

  return result;
};

export default CoexistenceLivenessService;
