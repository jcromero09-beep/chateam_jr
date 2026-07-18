import crypto from "crypto";
import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import AppError from "../../errors/AppError";

interface Request {
  companyId: number;
  name?: string;
  description?: string;
  rewardType?: "tokens" | "days";
  rewardTokens?: number;
  rewardDays?: number;
  status?: "active" | "inactive";
  /** @deprecated — campo legado, se conserva por compatibilidad */
  commissionRate?: number;
}

/**
 * Crea un programa de afiliados.
 *
 * Cambios 2026-04-29:
 * - Quitada la restricción "1 programa por company". El superadmin puede crear N programas.
 * - El programa define una recompensa por afiliado: tokens IA o días extra de suscripción.
 */
const CreateService = async ({
  companyId,
  name,
  description,
  rewardType,
  rewardTokens,
  rewardDays,
  status,
  commissionRate
}: Request): Promise<AIAffiliateProgram> => {
  const finalRewardType: "tokens" | "days" = rewardType === "days" ? "days" : "tokens";

  if (finalRewardType === "tokens") {
    if (rewardTokens === undefined || rewardTokens === null) {
      throw new AppError("ERR_AFFILIATE_REWARD_TOKENS_REQUIRED", 400);
    }
    if (Number(rewardTokens) <= 0) {
      throw new AppError("ERR_AFFILIATE_REWARD_TOKENS_INVALID", 400);
    }
  }

  if (finalRewardType === "days") {
    if (rewardDays === undefined || rewardDays === null) {
      throw new AppError("ERR_AFFILIATE_REWARD_DAYS_REQUIRED", 400);
    }
    if (Number(rewardDays) <= 0) {
      throw new AppError("ERR_AFFILIATE_REWARD_DAYS_INVALID", 400);
    }
  }

  const referralCode = `REF-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;

  const program = await AIAffiliateProgram.create({
    companyId,
    name: name || "Programa de Afiliados",
    description: description || null,
    referralCode,
    commissionRate: commissionRate !== undefined ? commissionRate : 0,
    rewardType: finalRewardType,
    rewardTokens: finalRewardType === "tokens" ? Number(rewardTokens) : 0,
    rewardDays: finalRewardType === "days" ? Number(rewardDays) : 0,
    status: status || "active"
  } as any);

  return program;
};

export default CreateService;
