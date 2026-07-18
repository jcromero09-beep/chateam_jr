/**
 * ProcessAffiliateActivationService
 *
 * En el modelo NUEVO la recompensa NO se entrega automáticamente.
 * Cuando una company referida pasa a un plan distinto a demo (planId !== 1),
 * se marca el referral como "claimable" y se actualiza su `status` a "active",
 * pero la recompensa la cobra la company afiliadora manualmente con el
 * endpoint POST /affiliates/referrals/:id/claim-reward.
 *
 * Esta función es idempotente: si ya está claimable o claimed no hace nada.
 *
 * BD SAGRADA: nunca elimina datos.
 */

import AIAffiliateReferral from "../../models/AIAffiliateReferral";
import Company from "../../models/Company";
import logger from "../../utils/logger";

const DEMO_PLAN_ID = 1;

interface Result {
  marked: boolean;
  reason?: string;
  referralId?: number;
  rewardStatus?: string;
}

export const markAffiliateReferralClaimable = async (
  referredCompanyId: number
): Promise<Result> => {
  if (!referredCompanyId) {
    return { marked: false, reason: "no_referred_company_id" };
  }

  const referral = await AIAffiliateReferral.findOne({
    where: { referredCompanyId }
  });

  if (!referral) {
    return { marked: false, reason: "no_referral" };
  }

  // Si ya está claimable o claimed, no hacer nada (idempotencia)
  if (referral.rewardStatus === "claimable" || referral.rewardStatus === "claimed") {
    return {
      marked: false,
      reason: `already_${referral.rewardStatus}`,
      referralId: referral.id,
      rewardStatus: referral.rewardStatus
    };
  }

  const referredCompany = await Company.findByPk(referredCompanyId);
  if (!referredCompany) {
    return { marked: false, reason: "referred_company_not_found", referralId: referral.id };
  }

  // Sólo se marca si la company referida ya NO está en plan demo
  if (!referredCompany.planId || Number(referredCompany.planId) === DEMO_PLAN_ID) {
    return {
      marked: false,
      reason: "still_in_demo",
      referralId: referral.id,
      rewardStatus: referral.rewardStatus
    };
  }

  await referral.update({
    status: "active",
    activatedAt: referral.activatedAt || new Date(),
    rewardStatus: "claimable"
  });

  logger.info(
    `[markAffiliateReferralClaimable] Referral=${referral.id} marcado como claimable`
  );

  return {
    marked: true,
    referralId: referral.id,
    rewardStatus: "claimable"
  };
};

/**
 * @deprecated Mantener por compatibilidad histórica. Ya NO entrega recompensa.
 * Usar `markAffiliateReferralClaimable` para marcar y `ClaimAffiliateRewardService`
 * para el cobro manual.
 */
export const processAffiliateActivation = async (
  referredCompanyId: number
): Promise<Result> => markAffiliateReferralClaimable(referredCompanyId);

export default markAffiliateReferralClaimable;
