import AICreditBalance from "../../models/AICreditBalance";
import AICreditTransaction from "../../models/AICreditTransaction";
import PlanCreditAllocation from "../../models/PlanCreditAllocation";
import AICreditType from "../../models/AICreditType";
import Company from "../../models/Company";
import logger from "../../utils/logger";

/**
 * ProvisionCreditsService — Servicio Unificador
 *
 * Conecta Plans (Gen1) con AICreditBalances (Gen3) via PlanCreditAllocations.
 * Se invoca cuando:
 * 1. Se activa una nueva company (mode='initialize')
 * 2. Se renueva un plan por pago Stripe (mode='renew')
 * 3. Se cambia de plan upgrade/downgrade (mode='upgrade')
 *
 * LOGICA:
 * - Lee PlanCreditAllocations del plan
 * - Crea o actualiza AICreditBalances por company+tipo
 * - En 'renew': resetea usedCredits=0, actualiza totalCredits
 * - En 'upgrade': actualiza totalCredits sin tocar usedCredits
 * - En 'initialize': crea con totalCredits del plan, usedCredits=0
 */

type ProvisionMode = "initialize" | "renew" | "upgrade";

interface ProvisionRequest {
  companyId: number;
  planId: number;
  mode: ProvisionMode;
}

interface ProvisionResponse {
  companyId: number;
  planId: number;
  mode: ProvisionMode;
  balancesCreated: number;
  balancesUpdated: number;
  totalCreditTypes: number;
}

const ProvisionCreditsService = async ({
  companyId,
  planId,
  mode
}: ProvisionRequest): Promise<ProvisionResponse> => {
  // 1. Obtener allocations del plan con sus tipos de credito
  const allocations = await PlanCreditAllocation.findAll({
    where: { planId },
    include: [{ model: AICreditType, as: "creditType" }]
  });

  if (allocations.length === 0) {
    logger.warn(
      `[ProvisionCredits] Plan ${planId} no tiene allocations configuradas. ` +
      `Company ${companyId} no recibira creditos.`
    );
    return {
      companyId,
      planId,
      mode,
      balancesCreated: 0,
      balancesUpdated: 0,
      totalCreditTypes: 0
    };
  }

  // Calcular resetAt: proximo ciclo basado en dueDate de la company
  let resetAt: Date | null = null;
  try {
    const company = await Company.findByPk(companyId);
    if (company && company.dueDate) {
      resetAt = new Date(company.dueDate);
    }
  } catch {
    // Si no se puede obtener dueDate, dejar resetAt null
  }

  let balancesCreated = 0;
  let balancesUpdated = 0;

  // 2. Para cada allocation, crear o actualizar balance
  for (const alloc of allocations) {
    const existingBalance = await AICreditBalance.findOne({
      where: {
        companyId,
        creditTypeId: alloc.creditTypeId
      }
    });

    if (!existingBalance) {
      // Crear nuevo balance
      await AICreditBalance.create({
        companyId,
        creditTypeId: alloc.creditTypeId,
        totalCredits: alloc.creditsPerCycle,
        usedCredits: 0,
        resetAt
      } as any);
      balancesCreated++;

      // Registrar transacción de auditoría
      try {
        await AICreditTransaction.create({
          companyId,
          creditTypeId: alloc.creditTypeId,
          amount: alloc.creditsPerCycle,
          direction: "credit",
          balanceBefore: 0,
          balanceAfter: 0,
          source: "provision",
          sourceId: `plan_${planId}_${mode}`,
          description: `Provision de creditos: modo ${mode}, plan ${planId}`
        } as any);
      } catch (e) {
        logger.warn(`[ProvisionCredits] Error registrando transaccion de auditoria: ${e}`);
      }
    } else {
      // Actualizar balance existente segun el modo
      const updateData: Record<string, unknown> = {};

      switch (mode) {
        case "renew":
          // Renovacion: resetear uso, aplicar creditos del plan actual
          updateData.totalCredits = alloc.creditsPerCycle;
          updateData.usedCredits = 0;
          updateData.resetAt = resetAt;
          break;

        case "upgrade":
          // Upgrade: aumentar creditos sin tocar uso actual
          updateData.totalCredits = alloc.creditsPerCycle;
          // No tocar usedCredits — mantener el consumo actual
          break;

        case "initialize":
          // Solo si no tenia creditos asignados
          if (Number(existingBalance.totalCredits) === 0) {
            updateData.totalCredits = alloc.creditsPerCycle;
            updateData.usedCredits = 0;
            updateData.resetAt = resetAt;
          }
          break;
      }

      if (Object.keys(updateData).length > 0) {
        const previousUsed = Number(existingBalance.usedCredits);
        await existingBalance.update(updateData);
        balancesUpdated++;

        // Registrar transacción de auditoría
        try {
          await AICreditTransaction.create({
            companyId,
            creditTypeId: alloc.creditTypeId,
            amount: alloc.creditsPerCycle,
            direction: "credit",
            balanceBefore: previousUsed,
            balanceAfter: mode === "renew" ? 0 : previousUsed,
            source: "provision",
            sourceId: `plan_${planId}_${mode}`,
            description: `Provision de creditos: modo ${mode}, plan ${planId}, tipo ${alloc.creditTypeId}`
          } as any);
        } catch (e) {
          logger.warn(`[ProvisionCredits] Error registrando transaccion de auditoria: ${e}`);
        }
      }
    }
  }

  logger.info(
    `[ProvisionCredits] Completado: company=${companyId}, plan=${planId}, ` +
    `mode=${mode}, creados=${balancesCreated}, actualizados=${balancesUpdated}, ` +
    `tipos=${allocations.length}`
  );

  return {
    companyId,
    planId,
    mode,
    balancesCreated,
    balancesUpdated,
    totalCreditTypes: allocations.length
  };
};

export default ProvisionCreditsService;
