/**
 * WithdrawalService — Módulo Afiliados Independiente
 * request() (valida balance), list(), approve(), reject()
 * Lógica financiera con transacciones. BD SAGRADA.
 */

import { Op } from "sequelize";
import sequelize from "../../database";
import AffiliateWallet from "../../models/AffiliateWallet";
import AffiliateWithdrawal from "../../models/AffiliateWithdrawal";
import AffiliateTransaction from "../../models/AffiliateTransaction";
import AIAffiliateProgram from "../../models/AIAffiliateProgram";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface RequestParams {
  companyId: number;
  amount: number;
  paymentMethod: string;
  paymentDetails?: Record<string, unknown>;
}

/**
 * Solicitar retiro — valida balance disponible y mínimo de retiro
 */
export const requestWithdrawal = async ({
  companyId,
  amount,
  paymentMethod,
  paymentDetails
}: RequestParams): Promise<AffiliateWithdrawal> => {
  // Buscar programa y wallet
  const program = await AIAffiliateProgram.findOne({
    where: { companyId, status: "active" },
    include: [{ model: AffiliateWallet, as: "wallet" }]
  });

  if (!program) {
    throw new AppError("ERR_AFFILIATE_PROGRAM_NOT_FOUND", 404);
  }

  if (!program.wallet) {
    throw new AppError("ERR_AFFILIATE_WALLET_NOT_FOUND", 404);
  }

  const wallet = program.wallet;

  // Validaciones
  if (amount <= 0) {
    throw new AppError("ERR_INVALID_WITHDRAWAL_AMOUNT", 400);
  }

  if (amount > Number(wallet.availableBalance)) {
    throw new AppError("ERR_INSUFFICIENT_BALANCE", 400);
  }

  if (amount < Number(program.minimumWithdrawal)) {
    throw new AppError("ERR_BELOW_MINIMUM_WITHDRAWAL", 400);
  }

  // Verificar que no tenga retiro pendiente
  const pendingWithdrawal = await AffiliateWithdrawal.findOne({
    where: {
      companyId,
      affiliateId: program.id,
      status: { [Op.in]: ["requested", "approved", "processing"] }
    }
  });

  if (pendingWithdrawal) {
    throw new AppError("ERR_WITHDRAWAL_ALREADY_PENDING", 400);
  }

  // Crear retiro en transacción
  const t = await sequelize.transaction();

  try {
    const fee = 0; // Sin comisión por ahora
    const netAmount = amount - fee;

    const withdrawal = await AffiliateWithdrawal.create({
      walletId: wallet.id,
      companyId,
      affiliateId: program.id,
      amount,
      fee,
      netAmount,
      paymentMethod,
      paymentDetails: paymentDetails || {},
      status: "requested",
      requestedAt: new Date()
    }, { transaction: t });

    // Descontar del balance disponible y mover a pendiente
    const balanceBefore = Number(wallet.availableBalance);
    await wallet.update({
      availableBalance: Number(wallet.availableBalance) - amount,
      pendingBalance: Number(wallet.pendingBalance) + amount
    }, { transaction: t });

    // Registrar transacción
    await AffiliateTransaction.create({
      walletId: wallet.id,
      companyId,
      type: "withdrawal",
      amount: -amount,
      balanceBefore,
      balanceAfter: balanceBefore - amount,
      description: `Solicitud de retiro #${withdrawal.id}`,
      referenceType: "withdrawal",
      referenceId: withdrawal.id,
      metadata: { paymentMethod }
    }, { transaction: t });

    await t.commit();

    logger.info(`[WithdrawalService] Retiro solicitado — id: ${withdrawal.id}, amount: ${amount}, company: ${companyId}`);
    return withdrawal;
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

interface ListParams {
  companyId: number;
  page?: number;
  limit?: number;
  status?: string;
}

/**
 * Listar retiros de la company
 */
export const listWithdrawals = async ({
  companyId,
  page = 1,
  limit = 20,
  status
}: ListParams): Promise<{ rows: AffiliateWithdrawal[]; count: number; hasMore: boolean }> => {
  const where: Record<string, unknown> = { companyId };

  if (status) {
    where.status = status;
  }

  const offset = (page - 1) * limit;

  const { rows, count } = await AffiliateWithdrawal.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset
  });

  return { rows, count, hasMore: offset + rows.length < count };
};

/**
 * Aprobar retiro (admin) — mueve de pendiente a completado
 */
export const approveWithdrawal = async (
  withdrawalId: number,
  companyId: number,
  processedBy: number
): Promise<AffiliateWithdrawal> => {
  const withdrawal = await AffiliateWithdrawal.findOne({
    where: { id: withdrawalId, companyId, status: "requested" }
  });

  if (!withdrawal) {
    throw new AppError("ERR_WITHDRAWAL_NOT_FOUND", 404);
  }

  const t = await sequelize.transaction();

  try {
    await withdrawal.update({
      status: "completed",
      processedAt: new Date(),
      processedBy
    }, { transaction: t });

    // Actualizar wallet: mover de pendiente a retirado
    const wallet = await AffiliateWallet.findByPk(withdrawal.walletId, { transaction: t });
    if (wallet) {
      await wallet.update({
        pendingBalance: Math.max(0, Number(wallet.pendingBalance) - Number(withdrawal.amount)),
        totalWithdrawn: Number(wallet.totalWithdrawn) + Number(withdrawal.netAmount)
      }, { transaction: t });
    }

    // Actualizar programa
    const program = await AIAffiliateProgram.findByPk(withdrawal.affiliateId, { transaction: t });
    if (program) {
      await program.update({
        withdrawnEarnings: Number(program.withdrawnEarnings) + Number(withdrawal.netAmount),
        pendingEarnings: Math.max(0, Number(program.pendingEarnings) - Number(withdrawal.amount))
      }, { transaction: t });
    }

    await t.commit();

    logger.info(`[WithdrawalService] Retiro aprobado — id: ${withdrawalId}, by: ${processedBy}`);
    return withdrawal;
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

/**
 * Rechazar retiro (admin) — devuelve fondos al balance disponible
 */
export const rejectWithdrawal = async (
  withdrawalId: number,
  companyId: number,
  processedBy: number,
  rejectionReason: string
): Promise<AffiliateWithdrawal> => {
  const withdrawal = await AffiliateWithdrawal.findOne({
    where: { id: withdrawalId, companyId, status: "requested" }
  });

  if (!withdrawal) {
    throw new AppError("ERR_WITHDRAWAL_NOT_FOUND", 404);
  }

  const t = await sequelize.transaction();

  try {
    await withdrawal.update({
      status: "rejected",
      processedAt: new Date(),
      processedBy,
      rejectionReason
    }, { transaction: t });

    // Devolver fondos al balance disponible
    const wallet = await AffiliateWallet.findByPk(withdrawal.walletId, { transaction: t });
    if (wallet) {
      const balanceBefore = Number(wallet.availableBalance);
      await wallet.update({
        availableBalance: Number(wallet.availableBalance) + Number(withdrawal.amount),
        pendingBalance: Math.max(0, Number(wallet.pendingBalance) - Number(withdrawal.amount))
      }, { transaction: t });

      // Registrar transacción de devolución
      await AffiliateTransaction.create({
        walletId: wallet.id,
        companyId,
        type: "adjustment",
        amount: Number(withdrawal.amount),
        balanceBefore,
        balanceAfter: balanceBefore + Number(withdrawal.amount),
        description: `Retiro #${withdrawalId} rechazado: ${rejectionReason}`,
        referenceType: "withdrawal",
        referenceId: withdrawalId,
        metadata: { rejectionReason }
      }, { transaction: t });
    }

    await t.commit();

    logger.info(`[WithdrawalService] Retiro rechazado — id: ${withdrawalId}, reason: ${rejectionReason}`);
    return withdrawal;
  } catch (error) {
    await t.rollback();
    throw error;
  }
};
