/**
 * TikTokBusinessAPIClient — Cliente para TikTok Business API v1.3
 *
 * Endpoints para responder comentarios, listar comentarios sin límite
 * de Research API, y gestión de tokens OAuth Business.
 *
 * Base URL: https://business-api.tiktok.com/open_api/v1.3
 * Auth: Header "Access-Token" (NO Bearer)
 */
import axios, { AxiosInstance, AxiosError } from "axios";
import logger from "../../utils/logger";

const BUSINESS_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

export interface TikTokBusinessTokenResponse {
  access_token: string;
  advertiser_id: string;
  scope: string[];
  token_type: string;
  // Business API tokens have longer TTL
}

export interface TikTokBusinessComment {
  comment_id: string;
  video_id: string;
  text: string;
  create_time: number;
  likes: number;
  replies: number;
  user_id: string;
  username: string;
  profile_image: string;
  parent_comment_id: string | null;
  status: string;
}

export interface TikTokBusinessCommentListResponse {
  comments: TikTokBusinessComment[];
  cursor: number;
  has_more: boolean;
  total: number;
}

export interface TikTokBusinessReplyResponse {
  comment_id: string;
}

export class TikTokBusinessAPIClient {
  private client: AxiosInstance;
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
    this.client = axios.create({
      baseURL: BUSINESS_API_BASE,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        "Access-Token": accessToken,
      },
    });
  }

  // ============================================================
  // STATIC — OAuth Token Exchange
  // ============================================================

  static async exchangeCodeForToken(
    code: string,
    appId: string,
    secret: string
  ): Promise<TikTokBusinessTokenResponse> {
    try {
      const response = await axios.post(`${BUSINESS_API_BASE}/oauth2/access_token/`, {
        app_id: appId,
        secret: secret,
        auth_code: code,
      });

      if (response.data?.code !== 0) {
        throw new Error(
          `TikTok Business OAuth error: ${response.data?.message || "Unknown error"}`
        );
      }

      return response.data.data;
    } catch (error: any) {
      logger.error(`[TikTokBusiness] Token exchange failed: ${error.message}`);
      throw error;
    }
  }

  static async refreshAccessToken(
    refreshToken: string,
    appId: string,
    secret: string
  ): Promise<TikTokBusinessTokenResponse> {
    try {
      const response = await axios.post(`${BUSINESS_API_BASE}/oauth2/refresh_token/`, {
        app_id: appId,
        secret: secret,
        refresh_token: refreshToken,
      });

      if (response.data?.code !== 0) {
        throw new Error(
          `TikTok Business refresh error: ${response.data?.message || "Unknown error"}`
        );
      }

      return response.data.data;
    } catch (error: any) {
      logger.error(`[TikTokBusiness] Token refresh failed: ${error.message}`);
      throw error;
    }
  }

  static buildBusinessAuthUrl(
    appId: string,
    redirectUri: string,
    state: string
  ): string {
    const params = new URLSearchParams({
      app_id: appId,
      redirect_uri: redirectUri,
      state: state,
    });
    return `https://business-api.tiktok.com/portal/auth?${params.toString()}`;
  }

  // ============================================================
  // INSTANCE — Comment Operations
  // ============================================================

  async listComments(
    videoId: string,
    cursor?: number,
    maxCount: number = 50
  ): Promise<TikTokBusinessCommentListResponse> {
    try {
      const params: Record<string, any> = {
        video_id: videoId,
        max_count: maxCount,
      };
      if (cursor) params.cursor = cursor;

      const response = await this.client.get("/comment/list/", { params });

      if (response.data?.code !== 0) {
        throw new Error(
          `List comments error: ${response.data?.message || "Unknown"}`
        );
      }

      const data = response.data.data || {};
      return {
        comments: data.comments || [],
        cursor: data.cursor || 0,
        has_more: data.has_more || false,
        total: data.total || 0,
      };
    } catch (error: any) {
      logger.error(`[TikTokBusiness] listComments failed: ${error.message}`);
      throw error;
    }
  }

  async getCommentReplies(
    commentId: string,
    cursor?: number,
    maxCount: number = 50
  ): Promise<TikTokBusinessCommentListResponse> {
    try {
      const params: Record<string, any> = {
        comment_id: commentId,
        max_count: maxCount,
      };
      if (cursor) params.cursor = cursor;

      const response = await this.client.get("/comment/reply/list/", { params });

      if (response.data?.code !== 0) {
        throw new Error(
          `Get replies error: ${response.data?.message || "Unknown"}`
        );
      }

      const data = response.data.data || {};
      return {
        comments: data.comments || [],
        cursor: data.cursor || 0,
        has_more: data.has_more || false,
        total: data.total || 0,
      };
    } catch (error: any) {
      logger.error(`[TikTokBusiness] getCommentReplies failed: ${error.message}`);
      throw error;
    }
  }

  async replyToComment(
    commentId: string,
    text: string
  ): Promise<TikTokBusinessReplyResponse> {
    try {
      logger.info(`[TikTokBusiness] Replying to comment ${commentId}: "${text.substring(0, 50)}..."`);

      const response = await this.client.post("/comment/reply/", {
        comment_id: commentId,
        text: text,
      });

      if (response.data?.code !== 0) {
        throw new Error(
          `Reply error: ${response.data?.message || "Unknown"}`
        );
      }

      logger.info(`[TikTokBusiness] Reply sent successfully to comment ${commentId}`);
      return response.data.data;
    } catch (error: any) {
      logger.error(`[TikTokBusiness] replyToComment failed: ${error.message}`);
      throw error;
    }
  }

  async hideComment(commentId: string): Promise<void> {
    try {
      const response = await this.client.post("/comment/hide/", {
        comment_id: commentId,
        hidden: true,
      });

      if (response.data?.code !== 0) {
        throw new Error(`Hide comment error: ${response.data?.message || "Unknown"}`);
      }
    } catch (error: any) {
      logger.error(`[TikTokBusiness] hideComment failed: ${error.message}`);
      throw error;
    }
  }

  async unhideComment(commentId: string): Promise<void> {
    try {
      const response = await this.client.post("/comment/hide/", {
        comment_id: commentId,
        hidden: false,
      });

      if (response.data?.code !== 0) {
        throw new Error(`Unhide comment error: ${response.data?.message || "Unknown"}`);
      }
    } catch (error: any) {
      logger.error(`[TikTokBusiness] unhideComment failed: ${error.message}`);
      throw error;
    }
  }
}

export default TikTokBusinessAPIClient;
