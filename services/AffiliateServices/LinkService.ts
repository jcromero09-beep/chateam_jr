/**
 * LinkService — Módulo Afiliados Independiente.
 *
 * Cambios 2026-04-29:
 * - El usuario sólo elige el programa al crear un link.
 * - El slug se genera automáticamente: <company>-<programa>-<rand6>.
 * - targetUrl/source/medium se completan internamente (no se piden al usuario).
 * - trackClick reporta el slug como referencia para signup (?ref=slug).
 */

import crypto from "crypto";
import AffiliateLink from "../../models/AffiliateLink";
import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import Company from "../../models/Company";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface CreateLinkParams {
  companyId: number;
  programId: number;
  // Estos son opcionales (legado).
  targetUrl?: string;
  source?: string;
  medium?: string;
}

const slugify = (input: string): string =>
  input
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "x";

/**
 * Crear link de afiliado con slug único: <company>-<programa>-<rand6>
 */
export const createLink = async ({
  companyId,
  programId,
  targetUrl,
  source,
  medium
}: CreateLinkParams): Promise<AffiliateLink> => {
  const program = await AIAffiliateProgram.findByPk(programId);
  if (!program || program.status === "inactive") {
    throw new AppError("ERR_AFFILIATE_PROGRAM_NOT_FOUND", 404);
  }

  const company = await Company.findByPk(companyId);
  if (!company) {
    throw new AppError("ERR_COMPANY_NOT_FOUND", 404);
  }

  const companySlug = slugify(company.name || `c${companyId}`);
  const programSlug = slugify(program.name || `p${programId}`);

  let slug = "";
  let attempts = 0;
  // Hasta 10 intentos para evitar colisiones
  do {
    const rand = crypto.randomBytes(3).toString("hex"); // 6 chars
    slug = `${companySlug}-${programSlug}-${rand}`.slice(0, 50);
    const existing = await AffiliateLink.findOne({ where: { slug } });
    if (!existing) break;
    attempts++;
  } while (attempts < 10);

  if (attempts >= 10) {
    throw new AppError("ERR_SLUG_GENERATION_FAILED", 500);
  }

  const link = await AffiliateLink.create({
    affiliateId: programId,
    companyId, // company afiliadora
    slug,
    targetUrl: targetUrl || `/signup?ref=${slug}`,
    source: source || "affiliate",
    medium: medium || "referral",
    clicks: 0,
    conversions: 0,
    status: "active"
  });

  logger.info(
    `[LinkService] Link creado — slug=${slug}, programId=${programId}, companyId=${companyId}`
  );
  return link;
};

interface ListLinksParams {
  companyId: number;
  programId?: number;
  page?: number;
  limit?: number;
  /** Si es true, no filtra por companyId (modo superadmin global) */
  global?: boolean;
}

export const listLinks = async ({
  companyId,
  programId,
  page = 1,
  limit = 20,
  global = false
}: ListLinksParams): Promise<{ rows: AffiliateLink[]; count: number; hasMore: boolean }> => {
  const where: Record<string, unknown> = {};

  if (!global) {
    where.companyId = companyId;
  }
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
        attributes: ["id", "name", "referralCode", "rewardType", "rewardTokens", "rewardDays"],
        required: false
      }
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset
  });

  return { rows, count, hasMore: offset + rows.length < count };
};

export const getLinkStats = async (
  linkId: number,
  companyId: number,
  isSuper = false
): Promise<AffiliateLink> => {
  const where: Record<string, unknown> = { id: linkId };
  if (!isSuper) {
    where.companyId = companyId;
  }

  const link = await AffiliateLink.findOne({
    where,
    include: [
      {
        model: AIAffiliateProgram,
        as: "affiliate",
        attributes: ["id", "name", "referralCode", "rewardType", "rewardTokens", "rewardDays"]
      }
    ]
  });

  if (!link) {
    throw new AppError("ERR_AFFILIATE_LINK_NOT_FOUND", 404);
  }

  return link;
};

/**
 * Track click en un link. Devuelve el slug para que el frontend componga
 * la URL de signup (?ref=<slug>).
 */
export const trackClick = async (
  slug: string
): Promise<{ slug: string; targetUrl: string } | null> => {
  const link = await AffiliateLink.findOne({
    where: { slug, status: "active" }
  });

  if (!link) {
    return null;
  }

  await link.increment("clicks", { by: 1 });

  return { slug: link.slug, targetUrl: link.targetUrl };
};

/** Resuelve un AffiliateLink activo por slug, sin incrementar nada. */
export const resolveBySlug = async (slug: string): Promise<AffiliateLink | null> => {
  if (!slug) return null;
  return AffiliateLink.findOne({ where: { slug, status: "active" } });
};
