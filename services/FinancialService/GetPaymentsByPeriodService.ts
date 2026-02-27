import { Op } from "sequelize";
import Invoices from "../../models/Invoices";

interface Request {
  startDate?: string;
  endDate?: string;
  status?: string;
  recurrence?: string;
  paymentMethod?: string;
  page?: string;
  limit?: string;
}

interface Response {
  payments: Invoices[];
  count: number;
  hasMore: boolean;
}

const GetPaymentsByPeriodService = async ({
  startDate,
  endDate,
  status,
  recurrence,
  paymentMethod,
  page = "1",
  limit = "20"
}: Request): Promise<Response> => {
  // Construir condiciones de filtro
  const whereConditions: any = {};

  // Filtro por rango de fechas
  if (startDate && endDate) {
    whereConditions.dueDate = {
      [Op.between]: [startDate, endDate]
    };
  } else if (startDate) {
    whereConditions.dueDate = {
      [Op.gte]: startDate
    };
  } else if (endDate) {
    whereConditions.dueDate = {
      [Op.lte]: endDate
    };
  }

  // Filtro por estado
  if (status) {
    whereConditions.status = status;
  }

  // Filtro por recurrencia
  if (recurrence) {
    whereConditions.recurrence = recurrence;
  }

  // Filtro por método de pago
  if (paymentMethod) {
    whereConditions.paymentMethod = paymentMethod;
  }

  // Paginación
  const limitNum = parseInt(limit);
  const offset = limitNum * (parseInt(page) - 1);

  // Consulta con paginación
  const { count, rows: payments } = await Invoices.findAndCountAll({
    where: whereConditions,
    limit: limitNum,
    offset,
    order: [['dueDate', 'DESC'], ['createdAt', 'DESC']]
  });

  const hasMore = count > offset + payments.length;

  return {
    payments,
    count,
    hasMore
  };
};

export default GetPaymentsByPeriodService;
