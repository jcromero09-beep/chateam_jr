import * as Yup from "yup";
import AICreditBalance from "../../models/AICreditBalance";
import AICreditType from "../../models/AICreditType";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface Request {
  companyId: number;
  creditTypeKey: string;
  amount: number;
  reason?: string; // Motivo de la adición (compra, bonificación, etc.)
}

interface Response {
  balance: AICreditBalance;
  previousTotal: number;
  newTotal: number;
  added: number;
}

const AddCreditsService = async ({
  companyId,
  creditTypeKey,
  amount,
  reason = "manual"
}: Request): Promise<Response> => {
  const schema = Yup.object().shape({
    companyId: Yup.number().required().positive(),
    creditTypeKey: Yup.string().required(),
    amount: Yup.number().required().positive("La cantidad debe ser positiva")
  });

  try {
    await schema.validate({ companyId, creditTypeKey, amount }, { abortEarly: false });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  // Buscar el tipo de crédito por key
  const creditType = await AICreditType.findOne({
    where: { key: creditTypeKey, isActive: true }
  });

  if (!creditType) {
    throw new AppError("ERR_AI_CREDIT_TYPE_NOT_FOUND", 404);
  }

  // Buscar o crear balance
  let [balance, created] = await AICreditBalance.findOrCreate({
    where: {
      companyId,
      creditTypeId: creditType.id
    },
    defaults: {
      companyId,
      creditTypeId: creditType.id,
      totalCredits: 0,
      usedCredits: 0
    } as any
  });

  const previousTotal = balance.totalCredits;

  // Sumar créditos
  await balance.update({
    totalCredits: balance.totalCredits + amount
  });

  await balance.reload();

  logger.info(
    `[AICreditService] Créditos agregados: company=${companyId}, ` +
    `tipo=${creditTypeKey}, cantidad=${amount}, razón=${reason}, ` +
    `anterior=${previousTotal}, nuevo=${balance.totalCredits}`
  );

  return {
    balance,
    previousTotal,
    newTotal: balance.totalCredits,
    added: amount
  };
};

export default AddCreditsService;
