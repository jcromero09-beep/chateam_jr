/**
 * ShowProgramService — Detalle de un programa.
 *
 * - companyId === null → modo super (acceso a cualquier programa).
 * - companyId !== null → restringe a programas de esa company.
 */

import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import AIAffiliateReferral from "../../models/AIAffiliateReferral";
import AffiliateLink from "../../models/AffiliateLink";
import Company from "../../models/Company";
import AppError from "../../errors/AppError";

const ShowProgramService = async (
  programId: number,
  companyId: number | null
): Promise<AIAffiliateProgram> => {
  const where: Record<string, unknown> = { id: programId };
  if (companyId) where.companyId = companyId;

  const program = await AIAffiliateProgram.findOne({
    where,
    include: [
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
      },
      {
        model: Company,
        as: "company",
        attributes: ["id", "name", "email"],
        required: false
      }
    ]
  });

  if (!program) {
    throw new AppError("ERR_AFFILIATE_PROGRAM_NOT_FOUND", 404);
  }

  return program;
};

export default ShowProgramService;
