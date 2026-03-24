/**
 * LinkService — Módulo Afiliados Independiente
 * create() (slug con crypto), list(), stats(), trackClick() (público).
 * BD SAGRADA: nunca elimina datos.
 */

import crypto from "crypto";
import { Op } from "sequelize";
import AffiliateLink from "../../models/AffiliateLink";
import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface CreateLinkParams {
  companyId: number;
  programId: number;
  targetUrl: string;
  source?: string;
  medium?: string;
}

/**
 * Crear link de afiliado con slug único
 */
export const createLink = async ({
  companyId,
  programId,
  targetUrl,
  source,
  medium
}: CreateLinkParams): Promise<AffiliateLink> => {
  // Verificar que el programa pertenece a la company
  const program = await AIAffiliateProgram.findOne({
    where: { id: programId, companyId }
  });

  if (!program) {
    throw new AppError("ERR_AFFILIATE_PROGRAM_NOT_FOUND", 404);
  }

  // Generar slug único
  let slug: string;
  let attempts = 0;
  do {
    slug = crypto.randomBytes(4).toString("hex");
    const existing = await AffiliateLink.findOne({ where: { slug } });
    if (!existing) break;
    attempts++;
  } while (attempts < 10);

  if (attempts >= 10) {
    throw new AppError("ERR_SLUG_GENERATION_FAILED", 500);
  }

  const link = await AffiliateLink.create({
    affiliateId: programId,
    companyId,
    slug,
    targetUrl,
    source: source || "direct",
    medium: medium || "referral",
    clicks: 0,
    conversions: 0,
    status: "active"
  });

  logger.info(`[LinkService] Link creado — slug: ${slug}, program: ${programId}`);
  return link;
};

interface ListLinksParams {
  companyId: number;
  programId?: number;
  page?: number;
  limit?: number;
}

/**
 * Listar links de la company (o de un programa específico)
 */
export const listLinks = async ({
  companyId,
  programId,
  page = 1,
  limit = 20
}: ListLinksParams): Promise<{ rows: AffiliateLink[]; count: number; hasMore: boolean }> => {
  const where: Record<string, unknown> = { companyId };

  if (programId) {
    where.affiliateId = programId;
  }

  const offset = (page - 1) * limit;

  const { rows, count } = await AffiliateLink.findAndCountAll({
    where,
    include: [
      {
        model: AIAffiliateProgram,
        as: "affiliate",
        attributes: ["id", "name", "referralCode"],
        required: false
      }
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset
  });

  return { rows, count, hasMore: offset + rows.length < count };
};

/**
 * Obtener stats de un link específico
 */
export const getLinkStats = async (
  linkId: number,
  companyId: number
): Promise<AffiliateLink> => {
  const link = await AffiliateLink.findOne({
    where: { id: linkId, companyId },
    include: [
      {
        model: AIAffiliateProgram,
        as: "affiliate",
        attributes: ["id", "name", "referralCode", "commissionRate"]
      }
    ]
  });

  if (!link) {
    throw new AppError("ERR_AFFILIATE_LINK_NOT_FOUND", 404);
  }

  return link;
};

/**
 * Track click en un link (endpoint público, sin auth)
 */
export const trackClick = async (slug: string): Promise<{ targetUrl: string } | null> => {
  const link = await AffiliateLink.findOne({
    where: { slug, status: "active" }
  });

  if (!link) {
    return null;
  }

  // Incrementar clicks (async, no bloquea)
  await link.increment("clicks", { by: 1 });

  return { targetUrl: link.targetUrl };
};
