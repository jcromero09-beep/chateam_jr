import { Request, Response } from "express";
import { Op, fn, col, literal } from "sequelize";
import AICreditTransaction from "../models/AICreditTransaction";
import AICreditType from "../models/AICreditType";
import User from "../models/User";
import AppError from "../errors/AppError";

/**
 * AICreditTransactionController — Endpoints de auditoria de creditos IA
 *
 * Provee acceso al historial de transacciones (debitos y creditos),
 * analiticas de consumo y exportacion CSV.
 */

// GET /ai/credits/transactions — Historial paginado con filtros
export const list = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    page = "1",
    limit = "20",
    source,
    creditType,
    direction,
    dateFrom,
    dateTo
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const where: Record<string, unknown> = { companyId };

  if (source) {
    where.source = source;
  }

  if (direction && (direction === "debit" || direction === "credit")) {
    where.direction = direction;
  }

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) {
      (where.createdAt as Record<string, unknown>)[Op.gte as unknown as string] = new Date(dateFrom);
    }
    if (dateTo) {
      (where.createdAt as Record<string, unknown>)[Op.lte as unknown as string] = new Date(dateTo);
    }
  }

  // Filtro por creditType (por key)
  const creditTypeInclude: any = {
    model: AICreditType,
    as: "creditType",
    attributes: ["id", "key", "name", "category"]
  };

  if (creditType) {
    creditTypeInclude.where = { key: creditType };
  }

  const { rows: transactions, count: total } = await AICreditTransaction.findAndCountAll({
    where,
    include: [
      creditTypeInclude,
      {
        model: User,
        as: "user",
        attributes: ["id", "name", "email"],
        required: false
      }
    ],
    order: [["createdAt", "DESC"]],
    limit: limitNum,
    offset
  });

  return res.json({
    success: true,
    data: transactions,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum)
    }
  });
};

// GET /ai/credits/analytics — KPIs y graficos de consumo
export const analytics = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { days = "30" } = req.query as Record<string, string>;

  const daysNum = Math.min(90, Math.max(1, parseInt(days, 10)));
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - daysNum);

  // 1. Total consumido por tipo de credito
  const byType = await AICreditTransaction.findAll({
    where: {
      companyId,
      direction: "debit",
      createdAt: { [Op.gte]: dateFrom }
    },
    attributes: [
      "creditTypeId",
      [fn("SUM", col("amount")), "totalAmount"],
      [fn("COUNT", col("AICreditTransaction.id")), "transactionCount"]
    ],
    include: [{
      model: AICreditType,
      as: "creditType",
      attributes: ["key", "name", "category"]
    }],
    group: ["creditTypeId", "creditType.id"],
    raw: false
  });

  // 2. Consumo por fuente (source)
  const bySource = await AICreditTransaction.findAll({
    where: {
      companyId,
      direction: "debit",
      createdAt: { [Op.gte]: dateFrom }
    },
    attributes: [
      "source",
      [fn("SUM", col("amount")), "totalAmount"],
      [fn("COUNT", col("id")), "transactionCount"]
    ],
    group: ["source"],
    order: [[literal("\"totalAmount\""), "DESC"]],
    raw: true
  });

  // 3. Consumo diario (ultimos N dias)
  const daily = await AICreditTransaction.findAll({
    where: {
      companyId,
      direction: "debit",
      createdAt: { [Op.gte]: dateFrom }
    },
    attributes: [
      [fn("DATE", col("createdAt")), "date"],
      [fn("SUM", col("amount")), "totalAmount"],
      [fn("COUNT", col("AICreditTransaction.id")), "transactionCount"]
    ],
    group: [fn("DATE", col("createdAt"))],
    order: [[fn("DATE", col("createdAt")), "ASC"]],
    raw: true
  });

  // 4. Totales globales del periodo
  const totals = await AICreditTransaction.findOne({
    where: {
      companyId,
      direction: "debit",
      createdAt: { [Op.gte]: dateFrom }
    },
    attributes: [
      [fn("SUM", col("amount")), "totalDebited"],
      [fn("COUNT", col("id")), "totalTransactions"]
    ],
    raw: true
  }) as any;

  const totalCredited = await AICreditTransaction.findOne({
    where: {
      companyId,
      direction: "credit",
      createdAt: { [Op.gte]: dateFrom }
    },
    attributes: [
      [fn("SUM", col("amount")), "totalCredited"]
    ],
    raw: true
  }) as any;

  return res.json({
    success: true,
    data: {
      period: {
        days: daysNum,
        from: dateFrom.toISOString(),
        to: new Date().toISOString()
      },
      totals: {
        debited: Number(totals?.totalDebited || 0),
        credited: Number(totalCredited?.totalCredited || 0),
        transactions: Number(totals?.totalTransactions || 0)
      },
      byType,
      bySource,
      daily
    }
  });
};

// GET /ai/credits/transactions/export — Exportar CSV
export const exportCSV = async (req: Request, res: Response): Promise<void> => {
  const { companyId } = req.user;
  const { dateFrom, dateTo } = req.query as Record<string, string>;

  const where: Record<string, unknown> = { companyId };

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) {
      (where.createdAt as Record<string, unknown>)[Op.gte as unknown as string] = new Date(dateFrom);
    }
    if (dateTo) {
      (where.createdAt as Record<string, unknown>)[Op.lte as unknown as string] = new Date(dateTo);
    }
  }

  const transactions = await AICreditTransaction.findAll({
    where,
    include: [
      {
        model: AICreditType,
        as: "creditType",
        attributes: ["key", "name"]
      },
      {
        model: User,
        as: "user",
        attributes: ["name", "email"],
        required: false
      }
    ],
    order: [["createdAt", "DESC"]],
    limit: 10000 // Limite de seguridad
  });

  // Generar CSV
  const headers = "Fecha,Tipo,Direccion,Cantidad,Balance Antes,Balance Despues,Fuente,ID Fuente,Descripcion,Usuario\n";
  const rows = transactions.map((t: any) => {
    const date = new Date(t.createdAt).toISOString();
    const type = t.creditType?.name || t.creditTypeId;
    const userName = t.user?.name || "Sistema";
    const desc = (t.description || "").replace(/"/g, '""');
    return `"${date}","${type}","${t.direction}",${t.amount},${t.balanceBefore},${t.balanceAfter},"${t.source}","${t.sourceId || ""}","${desc}","${userName}"`;
  }).join("\n");

  const csv = headers + rows;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="creditos-ia-${companyId}-${new Date().toISOString().split("T")[0]}.csv"`);
  res.send(csv);
};
