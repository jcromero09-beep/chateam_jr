/**
 * Controller: UGCSocialController
 * Maneja las peticiones HTTP para cuentas sociales y publicaciones UGC.
 *
 * Endpoints:
 * - POST   /ugc/social/connect                - Conecta cuenta social
 * - GET    /ugc/social/accounts               - Lista cuentas sociales
 * - POST   /ugc/social/:id/sync               - Sincroniza metricas
 * - GET    /ugc/social/posts                  - Lista publicaciones
 * - DELETE /ugc/social/:id                    - Revoca cuenta (soft delete)
 */

import { Request, Response } from "express";
import ConnectSocialAccountService from "../services/UGCSocialServices/ConnectSocialAccountService";
import ListSocialAccountsService from "../services/UGCSocialServices/ListSocialAccountsService";
import SyncSocialMetricsService from "../services/UGCSocialServices/SyncSocialMetricsService";
import ListSocialPostsService from "../services/UGCSocialServices/ListSocialPostsService";
import UGCSocialAccount, { SocialAccountPlatform } from "../models/UGCSocialAccount";
import { SocialPostPlatform } from "../models/UGCSocialPost";
import AppError from "../errors/AppError";
import logger from "../utils/logger";

/**
 * POST /ugc/social/connect
 * Conecta una cuenta social al sistema UGC
 */
export const connectAccount = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    platform,
    platformAccountId,
    username,
    displayName,
    accessToken,
    refreshToken,
    tokenExpiresAt
  } = req.body;

  try {
    const account = await ConnectSocialAccountService({
      companyId,
      platform,
      platformAccountId,
      username,
      displayName,
      accessToken,
      refreshToken,
      tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt) : undefined
    });

    // No retornar tokens encriptados en la respuesta
    const safeAccount = {
      id: account.id,
      companyId: account.companyId,
      platform: account.platform,
      platformAccountId: account.platformAccountId,
      username: account.username,
      displayName: account.displayName,
      followerCount: account.followerCount,
      postCount: account.postCount,
      engagementRate: account.engagementRate,
      status: account.status,
      createdAt: account.createdAt
    };

    return res.status(201).json({
      success: true,
      message: "Cuenta social conectada exitosamente",
      data: safeAccount
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCSocialController.connectAccount] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al conectar cuenta social"
    });
  }
};

/**
 * GET /ugc/social/accounts
 * Lista cuentas sociales con metricas
 */
export const listAccounts = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { platform } = req.query;

  try {
    const result = await ListSocialAccountsService({
      companyId,
      platform: platform as SocialAccountPlatform | undefined
    });

    return res.status(200).json({
      success: true,
      data: result.accounts,
      total: result.total
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCSocialController.listAccounts] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al listar cuentas sociales"
    });
  }
};

/**
 * POST /ugc/social/:id/sync
 * Sincroniza metricas de una cuenta social
 */
export const syncMetrics = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const result = await SyncSocialMetricsService({
      companyId,
      socialAccountId: Number(id)
    });

    return res.status(200).json({
      success: true,
      message: "Metricas sincronizadas exitosamente",
      data: {
        account: result.account,
        metricsUpdated: result.metricsUpdated
      }
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCSocialController.syncMetrics] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al sincronizar metricas"
    });
  }
};

/**
 * GET /ugc/social/posts
 * Lista publicaciones sociales con metricas
 */
export const listPosts = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    page = "1",
    limit = "20",
    platform,
    socialAccountId,
    campaignId,
    status
  } = req.query;

  try {
    const result = await ListSocialPostsService({
      companyId,
      page: Number(page),
      limit: Number(limit),
      platform: platform as SocialPostPlatform | undefined,
      socialAccountId: socialAccountId ? Number(socialAccountId) : undefined,
      campaignId: campaignId ? Number(campaignId) : undefined,
      status: status as string | undefined
    });

    return res.status(200).json({
      success: true,
      data: result.posts,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit)
      }
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCSocialController.listPosts] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al listar publicaciones"
    });
  }
};

/**
 * DELETE /ugc/social/:id
 * Soft delete: revoca la cuenta social
 */
export const removeAccount = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const account = await UGCSocialAccount.findOne({
      where: { id: Number(id), companyId }
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "ERR_UGC_SOCIAL_ACCOUNT_NOT_FOUND"
      });
    }

    if (account.status === "revoked") {
      return res.status(400).json({
        success: false,
        message: "La cuenta ya esta revocada"
      });
    }

    await account.markAsRevoked();

    return res.status(200).json({
      success: true,
      message: "Cuenta social revocada exitosamente",
      data: { id: account.id, status: account.status }
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[UGCSocialController.removeAccount] Error: ${errorMessage}`);
    return res.status(500).json({
      success: false,
      message: "Error interno al revocar cuenta social"
    });
  }
};
