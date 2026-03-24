/**
 * UpdateProgramService — Módulo Afiliados Independiente
 * Update parcial (name, description, commissionRate, minimumWithdrawal, paymentMethod, paymentDetails).
 * BD SAGRADA: nunca elimina, solo actualiza.
 */

import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import AppError from "../../errors/AppError";

interface UpdateData {
  name?: string;
  description?: string;
  commissionRate?: number;
  minimumWithdrawal?: number;
  paymentMethod?: string;
  paymentDetails?: Record<string, unknown>;
}

const UpdateProgramService = async (
  programId: number,
  companyId: number,
  data: UpdateData
): Promise<AIAffiliateProgram> => {
  const program = await AIAffiliateProgram.findOne({
    where: { id: programId, companyId }
  });

  if (!program) {
    throw new AppError("ERR_AFFILIATE_PROGRAM_NOT_FOUND", 404);
  }

  // Solo actualizar campos permitidos
  const allowedFields: (keyof UpdateData)[] = [
    "name", "description", "commissionRate", "minimumWithdrawal",
    "paymentMethod", "paymentDetails"
  ];

  const updateData: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updateData[field] = data[field];
    }
  }

  await program.update(updateData);
  await program.reload();

  return program;
};

export default UpdateProgramService;
