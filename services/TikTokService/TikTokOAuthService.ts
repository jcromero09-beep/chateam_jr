/**
 * TikTokOAuthService — Flujo OAuth2 completo para conectar cuentas TikTok
 *
 * Intercambia el authorization code por tokens, obtiene info del usuario,
 * crea el registro en Whatsapp y asocia las colas seleccionadas.
 */
import { Op } from "sequelize";
import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";
import { TikTokAPIClient } from "./TikTokAPIClient";
import AssociateWhatsappQueue from "../WhatsappService/AssociateWhatsappQueue";
import logger from "../../utils/logger";
import * as Sentry from "@sentry/node";
import CompaniesSettings from "../../models/CompaniesSettings";
import UGCSocialAccount from "../../models/UGCSocialAccount";

interface TikTokOAuthRequest {
  code: string;
  name: string;
  companyId: number;
  queueIds?: number[];
}

const TikTokOAuthService = async ({
  code,
  name,
  companyId,
  queueIds = []
}: TikTokOAuthRequest): Promise<Whatsapp> => {
  try {
    logger.info(
      `[TikTokOAuth] Iniciando flujo OAuth para company ${companyId}, nombre: ${name}`
    );

    // 1. Leer credenciales de BD (CompaniesSettings) con fallback a .env
    const companySettings = await CompaniesSettings.findOne({ where: { companyId } });

    const clientKey = companySettings?.tiktokClientKey || process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = companySettings?.tiktokClientSecret || process.env.TIKTOK_CLIENT_SECRET;
    const redirectUri = process.env.TIKTOK_REDIRECT_URI;

    if (!clientKey || !clientSecret || !redirectUri) {
      throw new Error(
        "Faltan credenciales TikTok. Configuralas en Settings > TikTok o en variables de entorno."
      );
    }

    // 2. Intercambiar code por tokens
    logger.info(`[TikTokOAuth] Intercambiando authorization code por tokens...`);
    const tokenData = await TikTokAPIClient.exchangeCodeForToken(
      code,
      clientKey,
      clientSecret,
      redirectUri
    );

    logger.info(
      `[TikTokOAuth] Tokens obtenidos - open_id: ${tokenData.open_id}, expires_in: ${tokenData.expires_in}s`
    );

    // 3. Obtener info del usuario con el access_token
    const client = new TikTokAPIClient(tokenData.access_token);
    const userInfo = await client.getUserInfo();

    logger.info(
      `[TikTokOAuth] Usuario TikTok: ${userInfo.display_name} (${userInfo.open_id})`
    );

    // 4. Crear registro en tabla Whatsapp
    const whatsapp = await Whatsapp.create({
      channel: "tiktok",
      status: "CONNECTED",
      name: name || userInfo.display_name,
      companyId,
      tiktokAccessToken: tokenData.access_token,
      tiktokRefreshToken: tokenData.refresh_token,
      tiktokOpenId: tokenData.open_id,
      tiktokTokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      tiktokPollingEnabled: true,
      isDefault: false
    } as any);

    logger.info(
      `[TikTokOAuth] Conexion TikTok creada - ID: ${whatsapp.id}, company: ${companyId}`
    );

    // 4b. Crear/actualizar UGCSocialAccount para la conexión
    try {
      await UGCSocialAccount.findOrCreate({
        where: { companyId, platform: "tiktok", platformAccountId: tokenData.open_id },
        defaults: {
          username: userInfo.display_name,
          displayName: userInfo.display_name,
          profileImageUrl: userInfo.avatar_url || "",
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
          scopes: ["user.info.basic", "video.list"],
          status: "active",
        },
      });
      logger.info(`[TikTokOAuth] UGCSocialAccount creada/encontrada para ${tokenData.open_id}`);
    } catch (ugcErr: any) {
      logger.warn(`[TikTokOAuth] No se pudo crear UGCSocialAccount: ${ugcErr.message}`);
    }

    // 5. Asociar colas si se proporcionaron
    if (queueIds.length > 0) {
      await AssociateWhatsappQueue(whatsapp, queueIds);
      logger.info(
        `[TikTokOAuth] Colas asociadas: [${queueIds.join(", ")}] a conexion ${whatsapp.id}`
      );
    }

    // 6. Emitir evento socket para el frontend
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-tiktok`, {
      action: "update",
      tiktok: whatsapp
    });

    logger.info(
      `[TikTokOAuth] Flujo OAuth completado exitosamente para company ${companyId}`
    );

    return whatsapp;
  } catch (error: any) {
    logger.error(
      `[TikTokOAuth] Error en flujo OAuth para company ${companyId}: ${error.message}`
    );
    Sentry.captureException(error);
    throw error;
  }
};

export default TikTokOAuthService;
