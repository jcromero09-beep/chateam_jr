import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import AppError from "../../errors/AppError";

interface AffiliateStats {
  program: AIAffiliateProgram;
  referrals: Array<{
    referredCompanyId: number;
    commissionAmount: number;
    status: string;
    createdAt: Date;
  }>;
  summary: {
    totalReferrals: number;
    activeReferrals: number;
    totalEarnings: number;
    pendingEarnings: number;
    withdrawnEarnings: number;
  };
}

const GetStatsService = async (companyId: number): Promise<AffiliateStats> => {
  const program = await AIAffiliateProgram.findOne({ where: { companyId } });
  if (!program) {
    throw new AppError("ERR_AFFILIATE_NOT_FOUND", 404);
  }

  const referrals = await sequelize.query<Record<string, any>>(`
    SELECT "referredCompanyId", "commissionAmount", status, "createdAt"
    FROM "AIAffiliateReferrals"
    WHERE "affiliateId" = :affiliateId
    ORDER BY "createdAt" DESC
    LIMIT 50
  `, {
    replacements: { affiliateId: program.id },
    type: QueryTypes.SELECT
  });

  return {
    program,
    referrals: referrals as any[],
    summary: {
      totalReferrals: program.referralsCount,
      activeReferrals: program.activeReferrals,
      totalEarnings: Number(program.totalEarnings),
      pendingEarnings: Number(program.pendingEarnings),
      withdrawnEarnings: Number(program.withdrawnEarnings)
    }
  };
};

export default GetStatsService;
