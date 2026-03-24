/**
 * WalletService — Módulo Afiliados Independiente
 * getBalance() + listTransactions() con filtro tipo, paginación.
 * BD SAGRADA: nunca elimina, solo consulta.
 */

import { Op } from "sequelize";
import AffiliateWallet from "../../models/AffiliateWallet";
import AffiliateTransaction from "../../models/AffiliateTransaction";
import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import AppError from "../../errors/AppError";

interface WalletBalance {
  wallet: AffiliateWallet;
  programName: string;
}

/**
 * Obtener balance de la wallet de un programa
 */
export const getBalance = async (
  companyId: number,
  programId?: number
): Promise<WalletBalance> => {
  const whereProgram: Record<string, unknown> = { companyId };
  if (programId) {
    whereProgram.id = programId;
  }

  const program = await AIAffiliateProgram.findOne({
    where: whereProgram,
    attributes: ["id", "name"],
    include: [
      { model: AffiliateWallet, as: "wallet", required: false }
    ]
  });

  if (!program) {
    throw new AppError("ERR_AFFILIATE_PROGRAM_NOT_FOUND", 404);
  }

  // Si no tiene wallet, crear una automáticamente
  let wallet = program.wallet;
  if (!wallet) {
    wallet = await AffiliateWallet.create({
      companyId,
      affiliateId: program.id,
      availableBalance: 0,
      pendingBalance: 0,
      totalEarned: 0,
      totalWithdrawn: 0,
      currency: "USD",
      status: "active"
    });
  }

  return { wallet, programName: program.name };
};

interface TransactionListParams {
  companyId: number;
  page?: number;
  limit?: number;
  type?: string;
}

/**
 * Listar transacciones de la wallet
 */
export const listTransactions = async ({
  companyId,
  page = 1,
  limit = 20,
  type
}: TransactionListParams): Promise<{ rows: AffiliateTransaction[]; count: number; hasMore: boolean }> => {
  const where: Record<string, unknown> = { companyId };

  if (type) {
    where.type = type;
  }

  const offset = (page - 1) * limit;

  const { rows, count } = await AffiliateTransaction.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset
  });

  return { rows, count, hasMore: offset + rows.length < count };
};
