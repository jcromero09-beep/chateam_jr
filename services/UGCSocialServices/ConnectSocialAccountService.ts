/**
 * Service: ConnectSocialAccountService
 * Registra una cuenta social en el sistema UGC.
 * Encripta tokens con crypto AES-256-CBC.
 * Placeholder — OAuth real se implementa en fase posterior.
 */

import crypto from "crypto";
import UGCSocialAccount, { SocialAccountPlatform } from "../../models/UGCSocialAccount";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface ConnectSocialAccountRequest {
  companyId: number;
  platform: SocialAccountPlatform;
  platformAccountId: string;
  username: string;
  displayName?: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
}

// Funciones de encriptacion AES-256-CBC
// [W1-SEC] Clave fuerte: env dedicado → si falta, deriva del ENCRYPTION_KEY (ya
// presente). El literal débil queda solo como último recurso (era público en el repo).
const ENCRYPTION_KEY =
  process.env.INTEGRATION_ENCRYPTION_KEY ||
  process.env.ENCRYPTION_KEY ||
  "default-key-change-in-production";

const encryptToken = (text: string): string => {
  const algorithm = "aes-256-cbc";
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
};

const ConnectSocialAccountService = async (
  params: ConnectSocialAccountRequest
): Promise<UGCSocialAccount> => {
  const {
    companyId,
    platform,
    platformAccountId,
    username,
    displayName,
    accessToken,
    refreshToken,
    tokenExpiresAt
  } = params;

  if (!platform || !platformAccountId || !username || !accessToken) {
    throw new AppError("ERR_UGC_SOCIAL_MISSING_FIELDS", 400);
  }

  const validPlatforms: SocialAccountPlatform[] = ["instagram", "tiktok", "facebook", "youtube"];
  if (!validPlatforms.includes(platform)) {
    throw new AppError("ERR_UGC_SOCIAL_INVALID_PLATFORM", 400);
  }

  // Verificar si ya existe una cuenta con el mismo platformAccountId para esta company
  const existing = await UGCSocialAccount.findOne({
    where: { companyId, platformAccountId, platform }
  });

  if (existing) {
    // Si existe pero esta revocada, reactivar
    if (existing.status === "revoked" || existing.status === "expired") {
      await existing.update({
        accessToken: encryptToken(accessToken),
        refreshToken: refreshToken ? encryptToken(refreshToken) : undefined,
        tokenExpiresAt: tokenExpiresAt || undefined,
        username,
        displayName: displayName || existing.displayName,
        status: "active"
      });
      await existing.reload();

      logger.info(
        `[ConnectSocialAccountService] Cuenta social reactivada: id=${existing.id}, ` +
        `platform=${platform}, username=${username}, company=${companyId}`
      );

      return existing;
    }

    throw new AppError("ERR_UGC_SOCIAL_ACCOUNT_ALREADY_EXISTS", 409);
  }

  // Encriptar tokens
  const encryptedAccessToken = encryptToken(accessToken);
  const encryptedRefreshToken = refreshToken ? encryptToken(refreshToken) : undefined;

  const account = await UGCSocialAccount.create({
    companyId,
    platform,
    platformAccountId,
    username,
    displayName: displayName || username,
    accessToken: encryptedAccessToken,
    refreshToken: encryptedRefreshToken,
    tokenExpiresAt: tokenExpiresAt || undefined,
    scopes: [],
    followerCount: 0,
    followingCount: 0,
    postCount: 0,
    engagementRate: 0,
    status: "active",
    metadata: {}
  } as Partial<UGCSocialAccount> as UGCSocialAccount);

  logger.info(
    `[ConnectSocialAccountService] Cuenta social conectada: id=${account.id}, ` +
    `platform=${platform}, username=${username}, company=${companyId}`
  );

  return account;
};

export default ConnectSocialAccountService;
