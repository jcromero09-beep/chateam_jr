import Company from "../../models/Company";
import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import AIAffiliateReferral from "../../models/AIAffiliateReferral";

interface CalculateCommissionInput {
  companyId: number;
  invoiceAmount: number;
  invoiceId?: number;
}

/**
 * Calcula y registra la comision de afiliado cuando una empresa referida paga.
 *
 * Flujo:
 * 1. Busca si la empresa tiene referredByCode (fue referida)
 * 2. Busca el programa de afiliados activo con ese codigo
 * 3. Calcula la comision segun commissionRate del programa
 * 4. Crea o actualiza el AIAffiliateReferral
 * 5. Actualiza pendingEarnings y totalEarnings del programa
 */
const CalculateCommissionService = async ({
  companyId,
  invoiceAmount,
  invoiceId
}: CalculateCommissionInput): Promise<void> => {
  // 1. Buscar la empresa y su codigo de referido
  const company = await Company.findByPk(companyId, {
    attributes: ["id", "referredByCode"]
  });

  if (!company || !company.referredByCode) {
    return; // No es una empresa referida
  }

  // 2. Buscar el programa de afiliados activo
  const affiliateProgram = await AIAffiliateProgram.findOne({
    where: {
      referralCode: company.referredByCode,
      status: "active"
    }
  });

  if (!affiliateProgram) {
    return; // Programa no encontrado o no activo
  }

  // 3. Calcular comision
  const commissionRate = Number(affiliateProgram.commissionRate) || 20;
  const commission = Number((invoiceAmount * (commissionRate / 100)).toFixed(2));

  if (commission <= 0) {
    return; // No hay comision que calcular
  }

  // 4. Buscar referral existente o crear uno nuevo
  let referral = await AIAffiliateReferral.findOne({
    where: {
      affiliateId: affiliateProgram.id,
      referredCompanyId: companyId
    }
  });

  if (referral) {
    // Actualizar comision acumulada
    const newAmount = Number(referral.commissionAmount) + commission;
    await referral.update({
      commissionAmount: newAmount,
      subscriptionId: invoiceId || referral.subscriptionId,
      status: "pending"
    });
  } else {
    // Crear nuevo referral
    referral = await AIAffiliateReferral.create({
      affiliateId: affiliateProgram.id,
      referredCompanyId: companyId,
      subscriptionId: invoiceId || null,
      commissionAmount: commission,
      status: "pending"
    });
  }

  // 5. Actualizar earnings del programa de afiliados
  await affiliateProgram.increment({
    pendingEarnings: commission,
    totalEarnings: commission
  });

  console.log(
    `[Affiliate] Comision $${commission} calculada para programa ${affiliateProgram.referralCode} ` +
    `(company=${companyId}, invoice=${invoiceId}, rate=${commissionRate}%)`
  );
};

export default CalculateCommissionService;
