import { Op } from "sequelize";
import AICreditBalance from "../../models/AICreditBalance";
import AICreditTransaction from "../../models/AICreditTransaction";
import Company from "../../models/Company";
import logger from "../../utils/logger";
import ProvisionCreditsService from "./ProvisionCreditsService";

/**
 * ResetCycleCreditsService — Reseteo Automatico de Creditos
 *
 * Ejecutado por CronJob diario (1 AM).
 * Busca AICreditBalances donde resetAt <= NOW() y resetea
 * los creditos llamando a ProvisionCreditsService con mode='renew'.
 *
 * Agrupado por companyId para ejecutar una vez por empresa.
 */

interface ResetResult {
  companiesProcessed: number;
  companiesWithErrors: number;
  details: Array<{
    companyId: number;
    planId: number;
    status: "success" | "error";
    error?: string;
  }>;
}

const ResetCycleCreditsService = async (): Promise<ResetResult> => {
  const now = new Date();

  // 1. Buscar balances cuyo resetAt ya paso
  const expiredBalances = await AICreditBalance.findAll({
    where: {
      resetAt: {
        [Op.lte]: now
      }
    },
    attributes: ["companyId"],
    group: ["companyId"]
  });

  if (expiredBalances.length === 0) {
    logger.info("[ResetCycleCredits] No hay balances para resetear hoy.");
    return {
      companiesProcessed: 0,
      companiesWithErrors: 0,
      details: []
    };
  }

  const companyIds = expiredBalances.map(b => b.companyId);
  logger.info(
    `[ResetCycleCredits] ${companyIds.length} companies con creditos por resetear: [${companyIds.join(", ")}]`
  );

  const details: ResetResult["details"] = [];
  let companiesWithErrors = 0;

  // 2. Para cada empresa, obtener su plan y provisionar creditos renovados
  for (const companyId of companyIds) {
    try {
      const company = await Company.findByPk(companyId);

      if (!company || !company.planId) {
        logger.warn(
          `[ResetCycleCredits] Company ${companyId} no tiene plan asignado. Saltando.`
        );
        continue;
      }

      // Verificar que la company siga activa y no este vencida
      if (company.dueDate) {
        const dueDate = new Date(company.dueDate);
        if (dueDate < now) {
          logger.warn(
            `[ResetCycleCredits] Company ${companyId} tiene dueDate vencido (${company.dueDate}). ` +
            `No se renuevan creditos.`
          );
          continue;
        }
      }

      await ProvisionCreditsService({
        companyId,
        planId: company.planId,
        mode: "renew"
      });

      details.push({
        companyId,
        planId: company.planId,
        status: "success"
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      companiesWithErrors++;
      details.push({
        companyId,
        planId: 0,
        status: "error",
        error: message
      });
      logger.error(
        `[ResetCycleCredits] Error procesando company ${companyId}: ${message}`
      );
    }
  }

  logger.info(
    `[ResetCycleCredits] Completado: ${details.filter(d => d.status === "success").length} exitosos, ` +
    `${companiesWithErrors} errores de ${companyIds.length} companies`
  );

  return {
    companiesProcessed: details.filter(d => d.status === "success").length,
    companiesWithErrors,
    details
  };
};

export default ResetCycleCreditsService;
