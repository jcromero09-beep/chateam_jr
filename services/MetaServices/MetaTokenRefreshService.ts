/**
 * MetaTokenRefreshService — CronJob de renovación de tokens Meta
 *
 * Los tokens de larga duración de Meta expiran en 60 días.
 * Este servicio revisa tokens que expiran en <7 días y los renueva.
 *
 * Estrategia: como no tenemos una columna tokenExpiresAt dedicada,
 * usamos coexistenceOnboardedAt + 53 días como proxy (60 - 7 = 53).
 * Para tokens renovados, usamos updatedAt del registro.
 */
import { Op } from "sequelize";
import Whatsapp from "../../models/Whatsapp";
import { refreshLongLivedToken } from "./metaEmbeddedSignupService";
import TokenManager from "../MetaMarketingService/TokenManager"; // [Fase2·A3.2] debug_token → expiry real
import logger from "../../utils/logger";

interface RefreshResult {
  tokensChecked: number;
  tokensRefreshed: number;
  tokensErrored: number;
  details: Array<{
    whatsappId: number;
    companyId: number;
    success: boolean;
    error?: string;
  }>;
}

const MetaTokenRefreshService = async (): Promise<RefreshResult> => {
  const result: RefreshResult = {
    tokensChecked: 0,
    tokensRefreshed: 0,
    tokensErrored: 0,
    details: [],
  };

  try {
    // Buscar conexiones Meta con coexistencia activa que tienen token
    const metaConnections = await Whatsapp.findAll({
      where: {
        provider: "meta",
        channel: "meta",
        tokenMeta: { [Op.ne]: null },
        status: "CONNECTED",
      },
      attributes: ["id", "companyId", "name", "tokenMeta", "coexistenceEnabled", "updatedAt", "tokenMetaExpiresAt"],
    });

    result.tokensChecked = metaConnections.length;

    if (metaConnections.length === 0) {
      logger.info("[MetaTokenRefresh] No hay conexiones Meta activas para verificar");
      return result;
    }

    // [Fase2·A3.2] Expiración REAL vía debug_token de Meta (persistida en
    // tokenMetaExpiresAt) + alerta a 7 días. Fail-safe: si debug_token falla,
    // cae al proxy histórico (updatedAt > 50 días).
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const SEVEN_DAYS_MS = 7 * DAY_MS;
    const fiftyDaysAgo = new Date(now - 50 * DAY_MS);

    for (const conn of metaConnections) {
      let realExpiresAt: Date | null = null;
      try {
        const info = await TokenManager.debugToken(conn.tokenMeta); // getter descifra tokenMeta
        if (info && info.expires_at && info.expires_at > 0) {
          realExpiresAt = new Date(info.expires_at * 1000);
          await conn.update({ tokenMetaExpiresAt: realExpiresAt });
        }
      } catch (e: any) {
        logger.warn(`[MetaTokenRefresh] debug_token falló para ${conn.name} (#${conn.id}): ${e.message}`);
      }

      let shouldRenew: boolean;
      if (realExpiresAt) {
        const daysLeft = Math.floor((realExpiresAt.getTime() - now) / DAY_MS);
        shouldRenew = realExpiresAt.getTime() - now <= SEVEN_DAYS_MS;
        if (shouldRenew) {
          // ALERTA (7 días): visible para monitoreo (warn) — ver spec, integrar Telegram/notif.
          logger.warn(
            `[MetaTokenRefresh] ⚠️ ALERTA_EXPIRACION token ${conn.name} (#${conn.id}, company ${conn.companyId}) expira en ${daysLeft} día(s) — ${realExpiresAt.toISOString()}`
          );
        }
      } else {
        // Fallback proxy: sin expiry real, renovar si no se actualizó en 50+ días.
        shouldRenew = new Date(conn.updatedAt) <= fiftyDaysAgo;
      }

      if (!shouldRenew) continue;

      logger.info(
        `[MetaTokenRefresh] Renovando token para ${conn.name} (ID: ${conn.id}, Company: ${conn.companyId})`
      );

      const refreshResult = await refreshLongLivedToken(conn.id);

      result.details.push({
        whatsappId: conn.id,
        companyId: conn.companyId,
        success: refreshResult.success,
        error: refreshResult.error,
      });

      if (refreshResult.success) {
        result.tokensRefreshed++;
      } else {
        result.tokensErrored++;
      }
    }

    logger.info(
      `[MetaTokenRefresh] Completado: ${result.tokensChecked} revisados, ` +
      `${result.tokensRefreshed} renovados, ${result.tokensErrored} errores`
    );
  } catch (err: any) {
    logger.error(`[MetaTokenRefresh] Error general: ${err.message}`);
  }

  return result;
};

export default MetaTokenRefreshService;
