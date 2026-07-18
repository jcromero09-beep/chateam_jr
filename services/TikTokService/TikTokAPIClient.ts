import axios, { AxiosInstance } from "axios";
import logger from "../../utils/logger";

const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

// ============================================================
// INTERFACES — Tipos de respuesta TikTok API v2
// ============================================================

export interface TikTokVideo {
  id: string;
  title: string;
  cover_image_url: string;
  create_time: number;
  share_url: string;
}

export interface TikTokComment {
  id: string;
  video_id: string;
  text: string;
  create_time: number;
  like_count: number;
  reply_count: number;
  parent_comment_id: string | null;
}

export interface TikTokTokenResponse {
  access_token: string;
  refresh_token: string;
  open_id: string;
  expires_in: number;         // 86400 (24h)
  refresh_expires_in: number; // 31536000 (365 días)
  token_type: string;
  scope: string;
}

export interface TikTokUserInfo {
  open_id: string;
  display_name: string;
  avatar_url: string;
}

export interface TikTokVideoListResponse {
  videos: TikTokVideo[];
  cursor: string;
  has_more: boolean;
}

export interface TikTokCommentListResponse {
  comments: TikTokComment[];
  cursor: string;
  has_more: boolean;
}

// ============================================================
// CLASE — TikTok API Client (wrapper axios)
// ============================================================

export class TikTokAPIClient {
  private client: AxiosInstance;
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
    this.client = axios.create({
      baseURL: TIKTOK_API_BASE,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  // ============================================================
  // MÉTODOS ESTÁTICOS — OAuth2 (no requieren instancia)
  // ============================================================

  /**
   * Intercambia authorization code por access_token + refresh_token
   * Endpoint: POST /v2/oauth/token/
   */
  static async exchangeCodeForToken(
    code: string,
    clientKey: string,
    clientSecret: string,
    redirectUri: string
  ): Promise<TikTokTokenResponse> {
    try {
      const { data } = await axios.post(
        `${TIKTOK_API_BASE}/oauth/token/`,
        new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 15000,
        }
      );

      if (data.error && data.error.code !== "ok") {
        throw new Error(`TikTok OAuth error: ${data.error.message || data.error.code}`);
      }

      logger.info(`[TikTokAPI] Token obtenido para open_id: ${data.open_id}`);
      return data;
    } catch (error: any) {
      logger.error(`[TikTokAPI] Error exchangeCodeForToken: ${error.message}`);
      throw error;
    }
  }

  /**
   * Renueva el access_token usando el refresh_token
   * Endpoint: POST /v2/oauth/token/
   * NOTA: TikTok puede rotar el refresh_token — siempre guardar el nuevo
   */
  static async refreshAccessToken(
    refreshToken: string,
    clientKey: string,
    clientSecret: string
  ): Promise<TikTokTokenResponse> {
    try {
      const { data } = await axios.post(
        `${TIKTOK_API_BASE}/oauth/token/`,
        new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 15000,
        }
      );

      if (data.error && data.error.code !== "ok") {
        throw new Error(`TikTok refresh error: ${data.error.message || data.error.code}`);
      }

      logger.info(`[TikTokAPI] Token renovado para open_id: ${data.open_id}`);
      return data;
    } catch (error: any) {
      logger.error(`[TikTokAPI] Error refreshAccessToken: ${error.message}`);
      throw error;
    }
  }

  /**
   * Construye la URL de autorización OAuth2 para iniciar el flujo
   */
  static buildAuthorizationUrl(
    clientKey: string,
    redirectUri: string,
    state: string
  ): string {
    const scopes = "user.info.basic,video.list";
    const params = new URLSearchParams({
      client_key: clientKey,
      scope: scopes,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
  }

  // ============================================================
  // MÉTODOS DE INSTANCIA — Requieren access_token válido
  // ============================================================

  /**
   * Obtiene información del usuario autenticado
   * Endpoint: GET /v2/user/info/
   */
  async getUserInfo(): Promise<TikTokUserInfo> {
    try {
      const { data } = await this.client.get(
        "/user/info/?fields=open_id,display_name,avatar_url"
      );

      if (data.error && data.error.code !== "ok") {
        throw new Error(`TikTok getUserInfo error: ${data.error.message}`);
      }

      return data.data.user;
    } catch (error: any) {
      logger.error(`[TikTokAPI] Error getUserInfo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Lista los videos del usuario autenticado
   * Endpoint: POST /v2/video/list/
   * Rate limit: 600 req/min
   */
  async listVideos(
    cursor?: string,
    maxCount: number = 20
  ): Promise<TikTokVideoListResponse> {
    try {
      const body: Record<string, unknown> = { max_count: maxCount };
      if (cursor) body.cursor = cursor;

      const { data } = await this.client.post(
        "/video/list/?fields=id,title,cover_image_url,create_time,share_url",
        body
      );

      if (data.error && data.error.code !== "ok") {
        throw new Error(`TikTok listVideos error: ${data.error.message}`);
      }

      return data.data;
    } catch (error: any) {
      logger.error(`[TikTokAPI] Error listVideos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Lee los comentarios de un video específico
   * Endpoint: POST /v2/research/video/comment/list/
   * Rate limit: 1000 req/día (Research API)
   */
  async getVideoComments(
    videoId: string,
    cursor?: string,
    maxCount: number = 100
  ): Promise<TikTokCommentListResponse> {
    try {
      const body: Record<string, unknown> = {
        video_id: videoId,
        max_count: maxCount,
      };
      if (cursor) body.cursor = cursor;

      const { data } = await this.client.post(
        "/research/video/comment/list/?fields=id,video_id,text,like_count,reply_count,parent_comment_id,create_time",
        body
      );

      if (data.error && data.error.code !== "ok") {
        throw new Error(`TikTok getVideoComments error: ${data.error.message}`);
      }

      return data.data;
    } catch (error: any) {
      logger.error(`[TikTokAPI] Error getVideoComments para video ${videoId}: ${error.message}`);
      throw error;
    }
  }
}

export default TikTokAPIClient;
