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
      attributes: ["id", "companyId", "name", "tokenMeta", "coexistenceEnabled", "updatedAt"],
    });

    result.tokensChecked = metaConnections.length;

    if (metaConnections.length === 0) {
      logger.info("[MetaTokenRefresh] No hay conexiones Meta activas para verificar");
      return result;
    }

    // Para cada conexión, intentar renovar el token proactivamente
    // Meta recomienda renovar cada 50 días (antes de los 60 de expiración)
    const fiftyDaysAgo = new Date();
    fiftyDaysAgo.setDate(fiftyDaysAgo.getDate() - 50);

    for (const conn of metaConnections) {
      // Si la conexión no se ha actualizado en 50+ días, renovar token
      const lastUpdate = new Date(conn.updatedAt);
      if (lastUpdate > fiftyDaysAgo) {
        continue; // Token aún vigente, saltar
      }

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
