/**
 * TikTokTokenRefreshService — CronJob de renovacion de tokens TikTok
 *
 * Los access_token de TikTok expiran en 24 horas.
 * Este servicio busca conexiones cuyo token expira en <4 horas y los renueva.
 * TikTok puede rotar el refresh_token — siempre se guarda el nuevo.
 *
 * Frecuencia recomendada: cada 1-2 horas via CronJob
 */
import { Op } from "sequelize";
import Whatsapp from "../../models/Whatsapp";
import CompaniesSettings from "../../models/CompaniesSettings";
import { TikTokAPIClient } from "./TikTokAPIClient";
import { TikTokBusinessAPIClient } from "./TikTokBusinessAPIClient";
import logger from "../../utils/logger";
import * as Sentry from "@sentry/node";

interface RefreshResult {
  tokensRefreshed: number;
  errors: number;
}

const TikTokTokenRefreshService = async (): Promise<RefreshResult> => {
  const result: RefreshResult = {
    tokensRefreshed: 0,
    errors: 0
  };

  try {
    // Buscar conexiones TikTok cuyo token expira en menos de 4 horas
    const fourHoursFromNow = new Date(Date.now() + 4 * 60 * 60 * 1000);

    const connections = await Whatsapp.findAll({
      where: {
        channel: "tiktok",
        status: "CONNECTED",
        tiktokRefreshToken: { [Op.ne]: null },
        tiktokTokenExpiresAt: { [Op.lt]: fourHoursFromNow }
      },
      attributes: [
        "id",
        "companyId",
        "name",
        "tiktokRefreshToken",
        "tiktokTokenExpiresAt",
        "tiktokBusinessConnected",
        "tiktokBusinessRefreshToken",
        "tiktokBusinessTokenExpiresAt"
      ]
    });

    if (connections.length === 0) {
      logger.info(
        "[TikTokTokenRefresh] No hay conexiones TikTok con tokens proximos a expirar"
      );
      return result;
    }

    logger.info(
      `[TikTokTokenRefresh] ${connections.length} conexiones requieren renovacion de token`
    );

    // Renovar token por cada conexion
    for (const conn of connections) {
      try {
        // Leer credenciales de CompaniesSettings con fallback a .env
        const settings = await CompaniesSettings.findOne({ where: { companyId: conn.companyId } });
        const clientKey = settings?.tiktokClientKey || process.env.TIKTOK_CLIENT_KEY;
        const clientSecret = settings?.tiktokClientSecret || process.env.TIKTOK_CLIENT_SECRET;

        if (!clientKey || !clientSecret) {
          logger.warn(
            `[TikTokTokenRefresh] Sin credenciales para company ${conn.companyId}, saltando`
          );
          continue;
        }

        logger.info(
          `[TikTokTokenRefresh] Renovando token para "${conn.name}" (ID: ${conn.id})`
        );

        const tokenData = await TikTokAPIClient.refreshAccessToken(
          conn.tiktokRefreshToken,
          clientKey,
          clientSecret
        );

        await conn.update({
          tiktokAccessToken: tokenData.access_token,
          tiktokRefreshToken: tokenData.refresh_token,
          tiktokTokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
        });

        result.tokensRefreshed++;

        // Renovar Business API token si esta conectado y proximo a expirar
        if (conn.tiktokBusinessConnected && conn.tiktokBusinessRefreshToken) {
          const businessExpires = conn.tiktokBusinessTokenExpiresAt
            ? new Date(conn.tiktokBusinessTokenExpiresAt).getTime()
            : 0;

          if (businessExpires < fourHoursFromNow.getTime()) {
            try {
              const bizAppId = settings?.tiktokBusinessAppId;
              const bizSecret = settings?.tiktokBusinessSecret;

              if (bizAppId && bizSecret) {
                const bizTokenData = await TikTokBusinessAPIClient.refreshAccessToken(
                  conn.tiktokBusinessRefreshToken,
                  bizAppId,
                  bizSecret
                );

                await conn.update({
                  tiktokBusinessAccessToken: bizTokenData.access_token,
                  tiktokBusinessTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                } as any);

                logger.info(`[TikTokTokenRefresh] Business token renovado para conexion ${conn.id}`);
              }
            } catch (bizErr: any) {
              logger.warn(`[TikTokTokenRefresh] Error renovando Business token: ${bizErr.message}`);
            }
          }
        }

        logger.info(
          `[TikTokTokenRefresh] Token renovado exitosamente para "${conn.name}" (ID: ${conn.id})`
        );
      } catch (connError: any) {
        result.errors++;

        logger.error(
          `[TikTokTokenRefresh] Error renovando token para "${conn.name}" (ID: ${conn.id}): ${connError.message}`
        );

        // Marcar conexion como desconectada si falla la renovacion
        await conn.update({ status: "DISCONNECTED" });

        logger.warn(
          `[TikTokTokenRefresh] Conexion ${conn.id} marcada como DISCONNECTED por fallo de renovacion`
        );

        Sentry.captureException(connError, {
          tags: {
            service: "TikTokTokenRefresh",
            whatsappId: String(conn.id),
            companyId: String(conn.companyId)
          }
        });
      }
    }

    logger.info(
      `[TikTokTokenRefresh] Completado: ${result.tokensRefreshed} renovados, ${result.errors} errores`
    );
  } catch (err: any) {
    logger.error(`[TikTokTokenRefresh] Error general: ${err.message}`);
    Sentry.captureException(err);
  }

  return result;
};

export default TikTokTokenRefreshService;
