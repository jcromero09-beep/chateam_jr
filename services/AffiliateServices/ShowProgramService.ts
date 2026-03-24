/**
 * ShowProgramService — Módulo Afiliados Independiente
 * Detalle de un programa con includes: tier, wallet, links, referrals (limit 20).
 */

import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import AffiliateTier from "../../models/AffiliateTier";
import AffiliateWallet from "../../models/AffiliateWallet";
import AffiliateLink from "../../models/AffiliateLink";
import AIAffiliateReferral from "../../models/AIAffiliateReferral";
import AppError from "../../errors/AppError";

const ShowProgramService = async (
  programId: number,
  companyId: number
): Promise<AIAffiliateProgram> => {
  const program = await AIAffiliateProgram.findOne({
    where: { id: programId, companyId },
    include: [
      { model: AffiliateTier, as: "tier", required: false },
      { model: AffiliateWallet, as: "wallet", required: false },
      {
        model: AffiliateLink,
        as: "links",
        required: false,
        where: { status: "active" },
        separate: true
      },
      {
        model: AIAffiliateReferral,
        as: "referrals",
        required: false,
        separate: true,
        limit: 20,
        order: [["createdAt", "DESC"]]
      }
    ]
  });

  if (!program) {
    throw new AppError("ERR_AFFILIATE_PROGRAM_NOT_FOUND", 404);
  }

  return program;
};

export default ShowProgramService;
