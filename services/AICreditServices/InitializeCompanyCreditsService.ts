import AICreditBalance from "../../models/AICreditBalance";
import AICreditType from "../../models/AICreditType";
import logger from "../../utils/logger";

/**
 * Inicializa los balances de créditos para una company nueva.
 * Crea un balance con 0 créditos para cada tipo de crédito activo.
 * Se debe llamar cuando se crea una nueva company o cuando se
 * activa el módulo de IA para una company existente.
 */

interface Request {
  companyId: number;
  initialCredits?: Record<string, number>; // key -> cantidad
}

interface Response {
  companyId: number;
  balancesCreated: number;
  balances: AICreditBalance[];
}

const InitializeCompanyCreditsService = async ({
  companyId,
  initialCredits = {}
}: Request): Promise<Response> => {
  // Obtener todos los tipos de crédito activos
  const creditTypes = await AICreditType.findAll({
    where: { isActive: true }
  });

  const createdBalances: AICreditBalance[] = [];

  for (const creditType of creditTypes) {
    // Buscar si ya existe balance
    const existing = await AICreditBalance.findOne({
      where: {
        companyId,
        creditTypeId: creditType.id
      }
    });

    if (!existing) {
      const initialAmount = initialCredits[creditType.key] || 0;

      const balance = await AICreditBalance.create({
        companyId,
        creditTypeId: creditType.id,
        totalCredits: initialAmount,
        usedCredits: 0
      } as any);

      createdBalances.push(balance);
    }
  }

  if (createdBalances.length > 0) {
    logger.info(
      `[AICreditService] Balances inicializados: company=${companyId}, ` +
      `creados=${createdBalances.length}/${creditTypes.length}`
    );
  }

  return {
    companyId,
    balancesCreated: createdBalances.length,
    balances: createdBalances
  };
};

export default InitializeCompanyCreditsService;
