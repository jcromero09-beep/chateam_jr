import AICreditBalance from "../../models/AICreditBalance";
import AICreditType from "../../models/AICreditType";
import AppError from "../../errors/AppError";

interface Request {
  companyId: number;
  creditTypeKey: string;
}

interface BalanceResponse {
  balance: AICreditBalance;
  creditType: AICreditType;
  remainingCredits: number;
}

const GetBalanceService = async ({
  companyId,
  creditTypeKey
}: Request): Promise<BalanceResponse> => {
  // Buscar el tipo de crédito por key
  const creditType = await AICreditType.findOne({
    where: { key: creditTypeKey, isActive: true }
  });

  if (!creditType) {
    throw new AppError("ERR_AI_CREDIT_TYPE_NOT_FOUND", 404);
  }

  // Buscar o crear balance para esta company
  let balance = await AICreditBalance.findOne({
    where: {
      companyId,
      creditTypeId: creditType.id
    }
  });

  // Si no existe balance, crear con créditos iniciales = 0
  if (!balance) {
    balance = await AICreditBalance.create({
      companyId,
      creditTypeId: creditType.id,
      totalCredits: 0,
      usedCredits: 0
    } as any);
  }

  const remainingCredits = balance.totalCredits - balance.usedCredits;

  return {
    balance,
    creditType,
    remainingCredits
  };
};

export default GetBalanceService;
