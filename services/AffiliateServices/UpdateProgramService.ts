/**
 * UpdateProgramService — Módulo Afiliados Independiente.
 *
 * Acepta:
 *  - name, description, status
 *  - rewardType ("tokens" | "days")
 *  - rewardTokens, rewardDays
 *  - commissionRate (legado)
 *  - minimumWithdrawal, paymentMethod, paymentDetails (legado)
 *
 * BD SAGRADA: nunca elimina, solo actualiza.
 */

import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import AppError from "../../errors/AppError";

interface UpdateData {
  name?: string;
  description?: string;
  status?: "active" | "inactive";
  rewardType?: "tokens" | "days";
  rewardTokens?: number;
  rewardDays?: number;
  // Legados
  commissionRate?: number;
  minimumWithdrawal?: number;
  paymentMethod?: string;
  paymentDetails?: Record<string, unknown>;
}

const UpdateProgramService = async (
  programId: number,
  ownerCompanyId: number | null,
  data: UpdateData
): Promise<AIAffiliateProgram> => {
  const where: Record<string, unknown> = { id: programId };
  // Si se pasa ownerCompanyId, se filtra por dueño (modo company).
  // Si es null/undefined, se permite editar como superadmin.
  if (ownerCompanyId) {
    where.companyId = ownerCompanyId;
  }

  const program = await AIAffiliateProgram.findOne({ where });

  if (!program) {
    throw new AppError("ERR_AFFILIATE_PROGRAM_NOT_FOUND", 404);
  }

  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) updateData.status = data.status;

  if (data.rewardType !== undefined) {
    if (data.rewardType !== "tokens" && data.rewardType !== "days") {
      throw new AppError("ERR_AFFILIATE_REWARD_TYPE_INVALID", 400);
    }
    updateData.rewardType = data.rewardType;
  }

  if (data.rewardTokens !== undefined) {
    updateData.rewardTokens = Number(data.rewardTokens);
  }

  if (data.rewardDays !== undefined) {
    updateData.rewardDays = Number(data.rewardDays);
  }

  // Legados
  if (data.commissionRate !== undefined) updateData.commissionRate = data.commissionRate;
  if (data.minimumWithdrawal !== undefined) updateData.minimumWithdrawal = data.minimumWithdrawal;
  if (data.paymentMethod !== undefined) updateData.paymentMethod = data.paymentMethod;
  if (data.paymentDetails !== undefined) updateData.paymentDetails = data.paymentDetails;

  await program.update(updateData);
  await program.reload();

  return program;
};

export default UpdateProgramService;
