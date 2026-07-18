/**
 * RegisterReferralService — Crea un AIAffiliateReferral cuando una company se registra
 * con un slug de afiliado válido (?ref=<slug>).
 *
 * - Idempotente: si ya existe un referral para esa referredCompanyId no crea otro.
 * - Incrementa AffiliateLink.conversions.
 * - Status inicial = "registered" (la company nueva queda en plan demo).
 *
 * BD SAGRADA: nunca elimina datos.
 */

import AIAffiliateReferral from "../../models/AIAffiliateReferral";
import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import AffiliateLink from "../../models/AffiliateLink";
import logger from "../../utils/logger";

interface Params {
  referredCompanyId: number;
  referralSlug: string;
}

export const registerReferral = async ({
  referredCompanyId,
  referralSlug
}: Params): Promise<AIAffiliateReferral | null> => {
  if (!referralSlug || !referredCompanyId) return null;

  // Idempotencia: si ya hay referral para esta company referida, no duplicar
  const existing = await AIAffiliateReferral.findOne({
    where: { referredCompanyId }
  });
  if (existing) {
    logger.info(
      `[RegisterReferral] Ya existe referral para referredCompanyId=${referredCompanyId}, no se duplica`
    );
    return existing;
  }

  const link = await AffiliateLink.findOne({
    where: { slug: referralSlug, status: "active" }
  });
  if (!link) {
    logger.warn(`[RegisterReferral] Slug "${referralSlug}" no encontrado o inactivo`);
    return null;
  }

  const program = await AIAffiliateProgram.findByPk(link.affiliateId);
  if (!program || program.status === "inactive") {
    logger.warn(
      `[RegisterReferral] Programa ${link.affiliateId} no encontrado o inactivo`
    );
    return null;
  }

  const referral = await AIAffiliateReferral.create({
    affiliateId: program.id,
    affiliateCompanyId: link.companyId,
    linkId: link.id,
    referredCompanyId,
    referralSlug,
    rewardType: program.rewardType,
    rewardTokens: 0,
    rewardDays: 0,
    status: "registered",
    sourceType: "signup",
    level: 1,
    commissionAmount: 0
  } as any);

  await link.increment("conversions", { by: 1 });

  logger.info(
    `[RegisterReferral] Referral creado id=${referral.id}, programa=${program.id}, ` +
      `afiliador=${link.companyId}, referida=${referredCompanyId}, slug=${referralSlug}`
  );

  return referral;
};

export default registerReferral;
