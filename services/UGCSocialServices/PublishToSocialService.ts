/**
 * Service: PublishToSocialService
 * Publicador multi-plataforma unificado para contenido UGC.
 * Soporta: Instagram (Reels/Posts), TikTok, Facebook, YouTube (Videos/Shorts).
 * Actualiza platformPostId, publishedAt, status y deduce credito 'social_post'.
 */

import UGCSocialPost, { SocialPostPlatform } from "../../models/UGCSocialPost";
import UGCSocialAccount from "../../models/UGCSocialAccount";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

// Providers opcionales para cada plataforma
let InstagramProvider: {
  publishReel: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
  publishPost: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
} | null = null;

let TikTokProvider: {
  initDirectPost: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
  publishPost: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
} | null = null;

let FacebookProvider: {
  publishPost: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
  publishVideo: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
} | null = null;

let YouTubeProvider: {
  uploadVideo: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
  uploadShort: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
} | null = null;

try {
  InstagramProvider = require("../UGCProviders/InstagramProvider").default;
} catch {
  logger.warn("[PublishToSocialService] InstagramProvider no disponible");
}

try {
  TikTokProvider = require("../UGCProviders/TikTokProvider").default;
} catch {
  logger.warn("[PublishToSocialService] TikTokProvider no disponible");
}

try {
  FacebookProvider = require("../UGCProviders/FacebookProvider").default;
} catch {
  logger.warn("[PublishToSocialService] FacebookProvider no disponible");
}

try {
  YouTubeProvider = require("../UGCProviders/YouTubeProvider").default;
} catch {
  logger.warn("[PublishToSocialService] YouTubeProvider no disponible");
}

interface PublishToSocialRequest {
  companyId: number;
  socialPostId: number;
}

interface PublishToSocialResponse {
  socialPostId: number;
  platform: SocialPostPlatform;
  platformPostId: string;
  publishedAt: Date;
  status: string;
}

/**
 * Publica en Instagram (Reel o Post segun postType)
 */
const publishToInstagram = async (
  post: UGCSocialPost,
  account: UGCSocialAccount
): Promise<string> => {
  if (!InstagramProvider) {
    throw new AppError("ERR_UGC_INSTAGRAM_PROVIDER_NOT_AVAILABLE", 503);
  }

  const config = {
    accessToken: account.accessToken,
    accountId: account.platformAccountId,
    mediaUrl: post.mediaUrl,
    caption: post.caption,
    thumbnailUrl: post.thumbnailUrl
  };

  let result: Record<string, unknown>;
  if (post.postType === "reel" || post.postType === "short") {
    result = await InstagramProvider.publishReel(config);
  } else {
    result = await InstagramProvider.publishPost(config);
  }

  return result.postId as string;
};

/**
 * Publica en TikTok
 */
const publishToTikTok = async (
  post: UGCSocialPost,
  account: UGCSocialAccount
): Promise<string> => {
  if (!TikTokProvider) {
    throw new AppError("ERR_UGC_TIKTOK_PROVIDER_NOT_AVAILABLE", 503);
  }

  const initResult = await TikTokProvider.initDirectPost({
    accessToken: account.accessToken,
    mediaUrl: post.mediaUrl,
    caption: post.caption
  });

  const publishResult = await TikTokProvider.publishPost({
    accessToken: account.accessToken,
    publishId: initResult.publishId,
    mediaUrl: post.mediaUrl
  });

  return publishResult.postId as string;
};

/**
 * Publica en Facebook (Video o Post)
 */
const publishToFacebook = async (
  post: UGCSocialPost,
  account: UGCSocialAccount
): Promise<string> => {
  if (!FacebookProvider) {
    throw new AppError("ERR_UGC_FACEBOOK_PROVIDER_NOT_AVAILABLE", 503);
  }

  const config = {
    accessToken: account.accessToken,
    pageId: account.platformAccountId,
    mediaUrl: post.mediaUrl,
    caption: post.caption,
    thumbnailUrl: post.thumbnailUrl
  };

  let result: Record<string, unknown>;
  if (["reel", "short"].includes(post.postType)) {
    result = await FacebookProvider.publishVideo(config);
  } else {
    result = await FacebookProvider.publishPost(config);
  }

  return result.postId as string;
};

/**
 * Publica en YouTube (Video o Short)
 */
const publishToYouTube = async (
  post: UGCSocialPost,
  account: UGCSocialAccount
): Promise<string> => {
  if (!YouTubeProvider) {
    throw new AppError("ERR_UGC_YOUTUBE_PROVIDER_NOT_AVAILABLE", 503);
  }

  const config = {
    accessToken: account.accessToken,
    channelId: account.platformAccountId,
    mediaUrl: post.mediaUrl,
    title: (post.caption || "").substring(0, 100),
    description: post.caption,
    thumbnailUrl: post.thumbnailUrl
  };

  let result: Record<string, unknown>;
  if (post.postType === "short") {
    result = await YouTubeProvider.uploadShort(config);
  } else {
    result = await YouTubeProvider.uploadVideo(config);
  }

  return result.videoId as string;
};

/**
 * Servicio principal: publica en la plataforma correspondiente
 */
const PublishToSocialService = async (
  params: PublishToSocialRequest
): Promise<PublishToSocialResponse> => {
  const { companyId, socialPostId } = params;

  const post = await UGCSocialPost.findOne({
    where: { id: socialPostId, companyId },
    include: [
      {
        model: UGCSocialAccount,
        as: "socialAccount",
        required: true
      }
    ]
  });

  if (!post) {
    throw new AppError("ERR_UGC_SOCIAL_POST_NOT_FOUND", 404);
  }

  if (post.status === "published") {
    throw new AppError("ERR_UGC_SOCIAL_POST_ALREADY_PUBLISHED", 400);
  }

  const account = post.socialAccount;

  if (!account || !account.isActive()) {
    throw new AppError("ERR_UGC_SOCIAL_ACCOUNT_NOT_ACTIVE", 400);
  }

  if (account.isTokenExpired()) {
    throw new AppError("ERR_UGC_SOCIAL_ACCOUNT_TOKEN_EXPIRED", 401);
  }

  // Marcar como publishing
  await post.update({ status: "publishing" });

  try {
    let platformPostId: string;

    // Despachar al publisher correcto segun plataforma
    const publisherMap: Record<SocialPostPlatform, () => Promise<string>> = {
      instagram: () => publishToInstagram(post, account),
      tiktok: () => publishToTikTok(post, account),
      facebook: () => publishToFacebook(post, account),
      youtube: () => publishToYouTube(post, account)
    };

    const publisher = publisherMap[post.platform];
    if (!publisher) {
      throw new AppError(
        `ERR_UGC_UNSUPPORTED_PLATFORM: ${post.platform}`,
        400
      );
    }

    platformPostId = await publisher();

    // Publicacion exitosa
    const publishedAt = new Date();
    await post.update({
      status: "published",
      platformPostId,
      publishedAt
    });

    // Deducir credito
    try {
      await DeductCreditsService({
        companyId,
        creditTypeKey: "social_post",
        amount: 1,
        description: `Publicacion UGC en ${post.platform}: postId=${post.id}`,
        source: "social_post",
        sourceId: String(post.id)
      });
    } catch (creditErr: unknown) {
      const errMsg = creditErr instanceof Error ? creditErr.message : String(creditErr);
      logger.warn(`[PublishToSocialService] Error deduciendo credito: ${errMsg}`);
    }

    logger.info(
      `[PublishToSocialService] Publicado exitosamente: postId=${post.id}, ` +
      `platform=${post.platform}, platformPostId=${platformPostId}, ` +
      `company=${companyId}`
    );

    return {
      socialPostId: post.id,
      platform: post.platform,
      platformPostId,
      publishedAt,
      status: "published"
    };
  } catch (error: unknown) {
    if (error instanceof AppError) {
      // Si es un error conocido, marcar como failed y re-lanzar
      await post.update({
        status: "failed",
        metadata: {
          ...post.metadata,
          failureReason: error.message,
          failedAt: new Date().toISOString()
        }
      });
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    await post.update({
      status: "failed",
      metadata: {
        ...post.metadata,
        failureReason: errorMessage,
        failedAt: new Date().toISOString()
      }
    });

    logger.error(
      `[PublishToSocialService] Error publicando: postId=${post.id}, ` +
      `platform=${post.platform}, error=${errorMessage}`
    );

    throw new AppError("ERR_UGC_SOCIAL_PUBLISH_FAILED", 500);
  }
};

export default PublishToSocialService;
