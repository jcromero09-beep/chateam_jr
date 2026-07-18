/**
 * TikTokBusinessOAuthService — Conecta Business API a una conexion TikTok existente
 *
 * NO crea nueva conexion. Actualiza la conexion TikTok existente
 * con los tokens de Business API para habilitar respuesta a comentarios.
 */
import CompaniesSettings from "../../models/CompaniesSettings";
import Whatsapp from "../../models/Whatsapp";
import { TikTokBusinessAPIClient } from "./TikTokBusinessAPIClient";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";
import * as Sentry from "@sentry/node";

interface TikTokBusinessOAuthRequest {
  code: string;
  tiktokId: number;
  companyId: number;
}

const TikTokBusinessOAuthService = async ({
  code,
  tiktokId,
  companyId,
}: TikTokBusinessOAuthRequest): Promise<Whatsapp> => {
  try {
    logger.info(
      `[TikTokBusinessOAuth] Conectando Business API para conexion ${tiktokId}, company ${companyId}`
    );

    // 1. Verificar que la conexion existe y pertenece a la company
    const whatsapp = await Whatsapp.findOne({
      where: { id: tiktokId, companyId, channel: "tiktok" },
    });

    if (!whatsapp) {
      throw new Error(`Conexion TikTok ${tiktokId} no encontrada para company ${companyId}`);
    }

    // 2. Leer credenciales Business de CompaniesSettings
    const settings = await CompaniesSettings.findOne({ where: { companyId } });

    if (!settings?.tiktokBusinessAppId || !settings?.tiktokBusinessSecret) {
      throw new Error(
        "Credenciales Business API no configuradas. Ve a Settings > TikTok."
      );
    }

    // 3. Intercambiar code por tokens Business API
    const tokenData = await TikTokBusinessAPIClient.exchangeCodeForToken(
      code,
      settings.tiktokBusinessAppId,
      settings.tiktokBusinessSecret
    );

    logger.info(
      `[TikTokBusinessOAuth] Tokens Business obtenidos para conexion ${tiktokId}`
    );

    // 4. Actualizar la conexion existente con tokens Business
    await whatsapp.update({
      tiktokBusinessAccessToken: tokenData.access_token,
      tiktokBusinessAdvertiserId: tokenData.advertiser_id || "",
      tiktokBusinessConnected: true,
    } as any);

    logger.info(
      `[TikTokBusinessOAuth] Business API conectada exitosamente para conexion ${tiktokId}`
    );

    // 5. Emitir evento socket
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-tiktok`, {
      action: "update",
      tiktok: whatsapp,
    });

    return whatsapp;
  } catch (error: any) {
    logger.error(
      `[TikTokBusinessOAuth] Error: ${error.message}`
    );
    Sentry.captureException(error);
    throw error;
  }
};

export default TikTokBusinessOAuthService;
