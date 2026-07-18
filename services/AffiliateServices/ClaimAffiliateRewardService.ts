/**
 * ClaimAffiliateRewardService — Cobro manual de recompensa de afiliado.
 *
 * - Solo la company afiliadora puede cobrar (ownership check).
 * - Solo si la company referida ya está fuera del plan demo (planId !== 1).
 * - Idempotente: si rewardStatus ya es "claimed" devuelve éxito sin sumar.
 * - Transaccional: lock pesimista sobre el referral y la company afiliadora
 *   para evitar doble cobro por requests concurrentes.
 *
 * BD SAGRADA: nunca elimina datos.
 */

import { Transaction } from "sequelize";
import sequelize from "../../database";
import AIAffiliateReferral from "../../models/AIAffiliateReferral";
import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import Company from "../../models/Company";
import AiTokenTransaction from "../../models/AiTokenTransaction";
import AffiliateTransaction from "../../models/AffiliateTransaction";
import AffiliateWallet from "../../models/AffiliateWallet";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

const DEMO_PLAN_ID = 1;

interface ClaimParams {
  referralId: number;
  /** Company que está cobrando (debe coincidir con referral.affiliateCompanyId) */
  callerCompanyId: number;
  /** Usuario que dispara el cobro */
  callerUserId?: number;
}

interface ClaimResult {
  alreadyClaimed: boolean;
  referralId: number;
  rewardType: "tokens" | "days" | null;
  rewardTokens: number;
  rewardDays: number;
  newBalance?: number;
  newDueDate?: string | null;
  rewardClaimedAt: Date;
}

const computeNewDueDate = (currentDueDate: string | null | undefined, days: number): string => {
  const now = new Date();
  let base: Date;

  if (!currentDueDate) {
    base = new Date(now);
  } else {
    const current = new Date(currentDueDate);
    base = current.getTime() > now.getTime() ? current : new Date(now);
  }

  base.setDate(base.getDate() + days);
  return base.toISOString().split("T")[0];
};

export const claimAffiliateReward = async ({
  referralId,
  callerCompanyId,
  callerUserId
}: ClaimParams): Promise<ClaimResult> => {
  if (!referralId) {
    throw new AppError("ERR_AFFILIATE_REFERRAL_REQUIRED", 400);
  }

  // ── Pre-check fuera de transacción ─────────────────────────────────────
  const preReferral = await AIAffiliateReferral.findByPk(referralId);
  if (!preReferral) {
    throw new AppError("ERR_AFFILIATE_REFERRAL_NOT_FOUND", 404);
  }
  if (Number(preReferral.affiliateCompanyId) !== Number(callerCompanyId)) {
    throw new AppError("ERR_AFFILIATE_NOT_OWNER", 403);
  }

  return await sequelize.transaction(async (t: Transaction) => {
    // ── Lock pesimista sobre el referral ─────────────────────────────────
    const referral = await AIAffiliateReferral.findByPk(referralId, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!referral) {
      throw new AppError("ERR_AFFILIATE_REFERRAL_NOT_FOUND", 404);
    }

    if (Number(referral.affiliateCompanyId) !== Number(callerCompanyId)) {
      throw new AppError("ERR_AFFILIATE_NOT_OWNER", 403);
    }

    // Idempotencia: si ya fue cobrado, devolver éxito sin re-entregar
    if (referral.rewardStatus === "claimed" || referral.rewardClaimedAt) {
      return {
        alreadyClaimed: true,
        referralId: referral.id,
        rewardType: referral.rewardType || null,
        rewardTokens: Number(referral.rewardTokens || 0),
        rewardDays: Number(referral.rewardDays || 0),
        rewardClaimedAt: referral.rewardClaimedAt || new Date()
      };
    }

    // ── Validar que la company referida ya no está en demo ───────────────
    const referredCompany = await Company.findByPk(referral.referredCompanyId, {
      transaction: t
    });
    if (!referredCompany) {
      throw new AppError("ERR_AFFILIATE_REFERRED_COMPANY_NOT_FOUND", 404);
    }
    if (!referredCompany.planId || Number(referredCompany.planId) === DEMO_PLAN_ID) {
      throw new AppError("ERR_AFFILIATE_REFERRED_STILL_DEMO", 400);
    }

    // ── Cargar el programa para conocer la recompensa ────────────────────
    const program = await AIAffiliateProgram.findByPk(referral.affiliateId, {
      transaction: t
    });
    if (!program) {
      throw new AppError("ERR_AFFILIATE_PROGRAM_NOT_FOUND", 404);
    }

    const rewardType: "tokens" | "days" = program.rewardType === "days" ? "days" : "tokens";
    const rewardTokens = Number(program.rewardTokens || 0);
    const rewardDays = Number(program.rewardDays || 0);

    // ── Lock company afiliadora (donde van los tokens / días) ────────────
    const affiliateCompany = await Company.findByPk(callerCompanyId, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!affiliateCompany) {
      throw new AppError("ERR_AFFILIATE_COMPANY_NOT_FOUND", 404);
    }

    let entregadoTokens = 0;
    let entregadoDays = 0;
    let newBalance: number | undefined;
    let newDueDate: string | null | undefined;

    if (rewardType === "tokens" && rewardTokens > 0) {
      const currentBalance = Number(affiliateCompany.aiTokenBalance || 0);
      newBalance = currentBalance + rewardTokens;
      await affiliateCompany.update({ aiTokenBalance: newBalance }, { transaction: t });

      // Audit trail en AiTokenTransactions
      try {
        await AiTokenTransaction.create(
          {
            companyId: callerCompanyId,
            type: "bonus",
            tokens: rewardTokens,
            module: "affiliate_reward",
            referenceId: `affiliate_referral_${referral.id}`,
            balanceAfter: newBalance,
            description: `Recompensa de afiliado por referido #${referral.id}`,
            userId: callerUserId || null,
            meta: {
              programId: program.id,
              referralId: referral.id,
              referredCompanyId: referral.referredCompanyId,
              slug: referral.referralSlug
            }
          } as any,
          { transaction: t }
        );
      } catch (txErr: any) {
        logger.error(
          `[ClaimAffiliateReward] Error creando AiTokenTransaction: ${txErr.message}`
        );
        // No abortar el cobro si el ledger paralelo falla
      }

      entregadoTokens = rewardTokens;
    }

    if (rewardType === "days" && rewardDays > 0) {
      newDueDate = computeNewDueDate(affiliateCompany.dueDate, rewardDays);
      await affiliateCompany.update({ dueDate: newDueDate }, { transaction: t });
      entregadoDays = rewardDays;
    }

    // ── AffiliateTransaction (historial visible en Wallet) ────────────────
    try {
      // Si existe wallet, asociar; si no, crearla
      let wallet = await AffiliateWallet.findOne({
        where: { affiliateId: program.id, companyId: callerCompanyId },
        transaction: t
      });
      if (!wallet) {
        wallet = await AffiliateWallet.create(
          {
            affiliateId: program.id,
            companyId: callerCompanyId,
            availableBalance: 0,
            pendingBalance: 0,
            totalEarned: 0,
            totalWithdrawn: 0,
            currency: "USD",
            status: "active"
          } as any,
          { transaction: t }
        );
      }

      const balanceBefore = Number((wallet as any).availableBalance || 0);
      await AffiliateTransaction.create(
        {
          companyId: callerCompanyId,
          walletId: (wallet as any).id,
          type: "bonus",
          amount: 0,
          balanceBefore,
          balanceAfter: balanceBefore,
          description:
            rewardType === "tokens"
              ? `Recompensa de afiliado: ${entregadoTokens.toLocaleString()} tokens`
              : `Recompensa de afiliado: ${entregadoDays} días extra`,
          referenceType: "affiliate_referral",
          referenceId: referral.id,
          metadata: {
            rewardType,
            rewardTokens: entregadoTokens,
            rewardDays: entregadoDays,
            programId: program.id,
            referredCompanyId: referral.referredCompanyId,
            slug: referral.referralSlug
          }
        } as any,
        { transaction: t }
      );
    } catch (atErr: any) {
      logger.warn(
        `[ClaimAffiliateReward] No se pudo registrar AffiliateTransaction: ${atErr.message}`
      );
      // Continuar — el AiTokenTransaction ya cubre el audit principal
    }

    // ── Marcar referral como claimed ──────────────────────────────────────
    const claimedAt = new Date();
    await referral.update(
      {
        status: "paid",
        rewardStatus: "claimed",
        rewardType,
        rewardTokens: entregadoTokens,
        rewardDays: entregadoDays,
        rewardClaimedAt: claimedAt,
        rewardClaimedBy: callerUserId || null,
        rewardProcessedAt: claimedAt,
        paidAt: claimedAt
      },
      { transaction: t }
    );

    logger.info(
      `[ClaimAffiliateReward] Cobrado referral=${referral.id} por company=${callerCompanyId} ` +
        `(${rewardType === "tokens" ? `${entregadoTokens} tokens` : `${entregadoDays} días`})`
    );

    return {
      alreadyClaimed: false,
      referralId: referral.id,
      rewardType,
      rewardTokens: entregadoTokens,
      rewardDays: entregadoDays,
      newBalance,
      newDueDate: newDueDate || null,
      rewardClaimedAt: claimedAt
    };
  });
};

export default claimAffiliateReward;
