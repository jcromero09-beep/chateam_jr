import { Op, fn, col, literal } from "sequelize";
import Invoices from "../../models/Invoices";

interface Request {
  month?: string;
  year?: string;
  recurrence?: string;
  paymentMethod?: string;
}

interface PaymentsByRecurrence {
  MENSUAL: { count: number; total: number };
  BIMESTRAL: { count: number; total: number };
  TRIMESTRAL: { count: number; total: number };
  SEMESTRAL: { count: number; total: number };
  ANUAL: { count: number; total: number };
}

interface PaymentsByMonth {
  month: number;
  year: number;
  total: number;
  count: number;
}

interface PaymentsByMethod {
  stripe: { count: number; total: number };
  paypal: { count: number; total: number };
  outline: { count: number; total: number };
}

interface Response {
  totalPaid: number;
  totalPending: number;
  totalInvoices: number;
  paymentsByRecurrence: PaymentsByRecurrence;
  paymentsByMonth: PaymentsByMonth[];
  paymentsByMethod: PaymentsByMethod;
  recentPayments: Invoices[];
}

const GetFinancialSummaryService = async ({
  month,
  year,
  recurrence,
  paymentMethod
}: Request): Promise<Response> => {
  // Construir condiciones de filtro
  const whereConditions: any = {};

  // Filtro por mes y año
  if (month && year) {
    whereConditions[Op.and] = [
      literal(`EXTRACT(MONTH FROM "dueDate") = ${parseInt(month)}`),
      literal(`EXTRACT(YEAR FROM "dueDate") = ${parseInt(year)}`)
    ];
  } else if (year) {
    whereConditions[Op.and] = [
      literal(`EXTRACT(YEAR FROM "dueDate") = ${parseInt(year)}`)
    ];
  }

  // Filtro por recurrencia
  if (recurrence) {
    whereConditions.recurrence = recurrence;
  }

  // Filtro por método de pago
  if (paymentMethod) {
    whereConditions.paymentMethod = paymentMethod;
  }

  // 1. Calcular total pagado (status = 'paid')
  const paidResult = await Invoices.findOne({
    where: {
      ...whereConditions,
      status: 'paid'
    },
    attributes: [
      [fn('SUM', col('value')), 'total']
    ],
    raw: true
  }) as any;

  const totalPaid = parseFloat(paidResult?.total || 0);

  // 2. Calcular total pendiente (status = 'open')
  const pendingResult = await Invoices.findOne({
    where: {
      ...whereConditions,
      status: 'open'
    },
    attributes: [
      [fn('SUM', col('value')), 'total']
    ],
    raw: true
  }) as any;

  const totalPending = parseFloat(pendingResult?.total || 0);

  // 2.1 Calcular total de facturas
  const totalInvoicesResult = await Invoices.count({
    where: whereConditions
  });

  // 3. Pagos por recurrencia
  const recurrenceStats = await Invoices.findAll({
    where: {
      ...whereConditions,
      status: 'paid'
    },
    attributes: [
      'recurrence',
      [fn('COUNT', col('id')), 'count'],
      [fn('SUM', col('value')), 'total']
    ],
    group: ['recurrence'],
    raw: true
  }) as any[];

  const paymentsByRecurrence: PaymentsByRecurrence = {
    MENSUAL: { count: 0, total: 0 },
    BIMESTRAL: { count: 0, total: 0 },
    TRIMESTRAL: { count: 0, total: 0 },
    SEMESTRAL: { count: 0, total: 0 },
    ANUAL: { count: 0, total: 0 }
  };

  recurrenceStats.forEach((stat: any) => {
    if (stat.recurrence && paymentsByRecurrence[stat.recurrence as keyof PaymentsByRecurrence]) {
      paymentsByRecurrence[stat.recurrence as keyof PaymentsByRecurrence] = {
        count: parseInt(stat.count),
        total: parseFloat(stat.total)
      };
    }
  });

  // 4. Pagos por mes
  const monthlyStats = await Invoices.findAll({
    where: {
      ...whereConditions,
      status: 'paid'
    },
    attributes: [
      [literal(`EXTRACT(MONTH FROM "dueDate")`), 'month'],
      [literal(`EXTRACT(YEAR FROM "dueDate")`), 'year'],
      [fn('SUM', col('value')), 'total'],
      [fn('COUNT', col('id')), 'count']
    ],
    group: [literal(`EXTRACT(MONTH FROM "dueDate")`) as any, literal(`EXTRACT(YEAR FROM "dueDate")`) as any],
    order: [[literal(`EXTRACT(YEAR FROM "dueDate")`) as any, 'DESC'], [literal(`EXTRACT(MONTH FROM "dueDate")`) as any, 'DESC']],
    limit: 12,
    raw: true
  }) as any[];

  const paymentsByMonth: PaymentsByMonth[] = monthlyStats.map((stat: any) => ({
    month: parseInt(stat.month),
    year: parseInt(stat.year),
    total: parseFloat(stat.total),
    count: parseInt(stat.count)
  }));

  // 5. Pagos por método
  const methodStats = await Invoices.findAll({
    where: {
      ...whereConditions,
      status: 'paid'
    },
    attributes: [
      'paymentMethod',
      [fn('COUNT', col('id')), 'count'],
      [fn('SUM', col('value')), 'total']
    ],
    group: ['paymentMethod'],
    raw: true
  }) as any[];

  const paymentsByMethod: PaymentsByMethod = {
    stripe: { count: 0, total: 0 },
    paypal: { count: 0, total: 0 },
    outline: { count: 0, total: 0 }
  };

  methodStats.forEach((stat: any) => {
    if (stat.paymentMethod && paymentsByMethod[stat.paymentMethod as keyof PaymentsByMethod]) {
      paymentsByMethod[stat.paymentMethod as keyof PaymentsByMethod] = {
        count: parseInt(stat.count) || 0,
        total: parseFloat(stat.total) || 0
      };
    }
  });

  // 6. Últimos 10 pagos
  const recentPayments = await Invoices.findAll({
    where: {
      ...whereConditions,
      status: 'paid'
    },
    order: [['createdAt', 'DESC']],
    limit: 10
  });

  return {
    totalPaid,
    totalPending,
    totalInvoices: totalInvoicesResult,
    paymentsByRecurrence,
    paymentsByMonth,
    paymentsByMethod,
    recentPayments
  };
};

export default GetFinancialSummaryService;
