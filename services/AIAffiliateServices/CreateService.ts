import crypto from "crypto";
import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import AppError from "../../errors/AppError";

interface Request {
  companyId: number;
  name?: string;
  commissionRate?: number;
  description?: string;
}

const CreateService = async ({ companyId, name, commissionRate, description }: Request): Promise<AIAffiliateProgram> => {
  const existing = await AIAffiliateProgram.findOne({ where: { companyId } });
  if (existing) {
    throw new AppError("ERR_AFFILIATE_ALREADY_EXISTS", 409);
  }

  const referralCode = `REF-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

  const program = await AIAffiliateProgram.create({
    companyId,
    name: name || "Programa de Afiliados",
    description: description || null,
    referralCode,
    commissionRate: commissionRate || 20.00,
    status: "active"
  } as any);

  return program;
};

export default CreateService;
