import axios from "axios";
import CompaniesSettings from "../../models/CompaniesSettings";
import logger from "../../utils/logger";

const FB_GRAPH_VERSION = process.env.FB_GRAPH_VERSION || "v23.0";
const FB_GRAPH_URL = `https://graph.facebook.com/${FB_GRAPH_VERSION}`;

// Token expira en ~60 días, renovamos cuando quedan menos de 7 días
const TOKEN_REFRESH_THRESHOLD_DAYS = 7;
const LONG_LIVED_TOKEN_DURATION_DAYS = 60;

interface TokenInfo {
  accessToken: string;
  expiresAt: number; // Unix timestamp
  isLongLived: boolean;
}

interface TokenDebugResponse {
  data: {
    app_id: string;
    type: string;
    application: string;
    data_access_expires_at: number;
    expires_at: number;
    is_valid: boolean;
    scopes: string[];
    user_id: string;
  };
}

/**
 * TokenManager - Gestiona tokens de Facebook para Marketing API
 *
 * Responsabilidades:
 * - Intercambiar short-lived token por long-lived token
 * - Verificar expiración de tokens
 * - Renovar tokens antes de que expiren
 * - Almacenar tokens de forma segura
 */
export class TokenManager {
  /**
   * Obtiene información del token actual (debug)
   */
  static async debugToken(accessToken: string): Promise<TokenDebugResponse["data"] | null> {
    try {
      logger.info(`[TokenManager] 🔍 Debugging token: ${accessToken.substring(0, 20)}...${accessToken.slice(-10)}`);
      logger.info(`[TokenManager] 📡 Calling: ${FB_GRAPH_URL}/debug_token`);

      const response = await axios.get<TokenDebugResponse>(`${FB_GRAPH_URL}/debug_token`, {
        params: {
          input_token: accessToken,
          access_token: accessToken
        }
      });

      logger.info(`[TokenManager] ✅ Token debug response: ${JSON.stringify(response.data.data, null, 2)}`);
      return response.data.data;
    } catch (error: any) {
      logger.error(`[TokenManager] ❌ Error debugging token: ${error.message}`);
      logger.error(`[TokenManager] ❌ Response data: ${JSON.stringify(error.response?.data || "No response data")}`);
      return null;
    }
  }

  /**
   * Verifica si el token está próximo a expirar
   */
  static async isTokenExpiringSoon(accessToken: string): Promise<boolean> {
    const tokenInfo = await this.debugToken(accessToken);

    if (!tokenInfo || !tokenInfo.is_valid) {
      return true; // Token inválido, necesita renovación
    }

    if (tokenInfo.expires_at === 0) {
      return false; // Token sin expiración (nunca expira)
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = tokenInfo.expires_at - now;
    const thresholdSeconds = TOKEN_REFRESH_THRESHOLD_DAYS * 24 * 60 * 60;

    return expiresIn < thresholdSeconds;
  }

  /**
   * Intercambia un short-lived token por un long-lived token
   */
  static async exchangeForLongLivedToken(
    shortLivedToken: string,
    appId: string,
    appSecret: string
  ): Promise<TokenInfo | null> {
    try {
      const response = await axios.get(`${FB_GRAPH_URL}/oauth/access_token`, {
        params: {
          grant_type: "fb_exchange_token",
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: shortLivedToken
        }
      });

      const { access_token, expires_in } = response.data;

      // Calcular fecha de expiración
      const expiresAt = expires_in
        ? Math.floor(Date.now() / 1000) + expires_in
        : Math.floor(Date.now() / 1000) + (LONG_LIVED_TOKEN_DURATION_DAYS * 24 * 60 * 60);

      logger.info(`[TokenManager] Token exchanged successfully. Expires in: ${String(expires_in || "never")}`);

      return {
        accessToken: access_token,
        expiresAt,
        isLongLived: true
      };
    } catch (error: unknown) {
      const err = error as { response?: { data?: unknown }; message?: string };
      logger.error(`[TokenManager] Error exchanging token: ${String(err.response?.data || err.message)}`);
      return null;
    }
  }

  /**
   * Renueva un long-lived token (solo funciona con System User tokens)
   * Nota: Los tokens de System User no se pueden renovar, hay que generar uno nuevo
   * desde Business Manager
   */
  static async refreshLongLivedToken(
    currentToken: string,
    appId: string,
    appSecret: string
  ): Promise<TokenInfo | null> {
    // Para System User tokens, intentamos el intercambio estándar
    // Si el token aún es válido, Meta devuelve un nuevo token
    return this.exchangeForLongLivedToken(currentToken, appId, appSecret);
  }

  /**
   * Obtiene y valida el token para una empresa, renovándolo si es necesario
   */
  static async getValidToken(companyId: number): Promise<string | null> {
    logger.info(`[TokenManager] 🔑 Getting valid token for companyId: ${companyId}`);

    const settings = await CompaniesSettings.findOne({
      where: { companyId }
    });

    if (!settings?.facebookSystemUserToken) {
      logger.warn(`[TokenManager] ❌ No token found for company ${companyId}`);
      return null;
    }

    const token = settings.facebookSystemUserToken;
    logger.info(`[TokenManager] ✅ Token found: ${token.substring(0, 20)}...${token.slice(-10)}`);

    // Verificar si el token está por expirar
    logger.info(`[TokenManager] 🔍 Checking if token is expiring soon...`);
    const expiringSoon = await this.isTokenExpiringSoon(token);
    logger.info(`[TokenManager] 📋 Token expiring soon: ${expiringSoon}`);

    if (expiringSoon) {
      logger.warn(`[TokenManager] ⚠️ Token for company ${companyId} is expiring soon`);

      // Si tenemos appId y appSecret, intentar renovar
      if (settings.facebookAppId && settings.facebookAppSecret) {
        logger.info(`[TokenManager] 🔄 Attempting to refresh token...`);
        const newTokenInfo = await this.refreshLongLivedToken(
          token,
          settings.facebookAppId,
          settings.facebookAppSecret
        );

        if (newTokenInfo) {
          // Guardar el nuevo token
          await CompaniesSettings.update(
            {
              facebookSystemUserToken: newTokenInfo.accessToken
            },
            { where: { companyId } }
          );

          logger.info(`[TokenManager] ✅ Token renewed for company ${companyId}`);
          return newTokenInfo.accessToken;
        } else {
          logger.error(`[TokenManager] ❌ Failed to renew token for company ${companyId}`);
        }
      } else {
        logger.warn(`[TokenManager] ⚠️ No app credentials to renew token for company ${companyId}`);
      }
    }

    logger.info(`[TokenManager] ✅ Returning valid token for company ${companyId}`);
    return token;
  }

  /**
   * Valida que el token tenga los permisos necesarios
   */
  static async validateTokenPermissions(
    accessToken: string,
    requiredPermissions: string[] = ["ads_read"]
  ): Promise<{ valid: boolean; missing: string[] }> {
    const tokenInfo = await this.debugToken(accessToken);

    if (!tokenInfo || !tokenInfo.is_valid) {
      return { valid: false, missing: requiredPermissions };
    }

    const scopes = tokenInfo.scopes || [];
    const missing = requiredPermissions.filter(p => !scopes.includes(p));

    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * Obtiene información detallada del token para debugging
   */
  static async getTokenStatus(companyId: number): Promise<{
    hasToken: boolean;
    isValid: boolean;
    expiresAt: number | null;
    expiresIn: string;
    scopes: string[];
    needsRenewal: boolean;
  }> {
    const settings = await CompaniesSettings.findOne({
      where: { companyId }
    });

    if (!settings?.facebookSystemUserToken) {
      return {
        hasToken: false,
        isValid: false,
        expiresAt: null,
        expiresIn: "N/A",
        scopes: [],
        needsRenewal: true
      };
    }

    const tokenInfo = await this.debugToken(settings.facebookSystemUserToken);

    if (!tokenInfo) {
      return {
        hasToken: true,
        isValid: false,
        expiresAt: null,
        expiresIn: "N/A",
        scopes: [],
        needsRenewal: true
      };
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = tokenInfo.expires_at === 0
      ? "Never"
      : this.formatTimeRemaining(tokenInfo.expires_at - now);

    const needsRenewal = await this.isTokenExpiringSoon(settings.facebookSystemUserToken);

    return {
      hasToken: true,
      isValid: tokenInfo.is_valid,
      expiresAt: tokenInfo.expires_at,
      expiresIn,
      scopes: tokenInfo.scopes || [],
      needsRenewal
    };
  }

  private static formatTimeRemaining(seconds: number): string {
    if (seconds <= 0) return "Expired";

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);

    if (days > 0) {
      return `${days} days, ${hours} hours`;
    }
    return `${hours} hours`;
  }
}

export default TokenManager;
