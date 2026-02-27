import { Request, Response } from "express";
import GetFinancialSummaryService from "../services/FinancialService/GetFinancialSummaryService";
import GetPaymentsByPeriodService from "../services/FinancialService/GetPaymentsByPeriodService";
import AppError from "../errors/AppError";

// Middleware para verificar que es superadmin
const checkSuperAdmin = (req: Request) => {
  const { companyId, profile } = req.user;

  // Verificar que sea superadmin (companyId === 1 o profile === 'superadmin')
  if (companyId !== 1 && profile !== 'superadmin') {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
};

// GET /financial/summary?month=12&year=2024&recurrence=MENSUAL&paymentMethod=stripe
export const summary = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Verificar permisos
    checkSuperAdmin(req);

    const { month, year, recurrence, paymentMethod } = req.query;

    const summaryData = await GetFinancialSummaryService({
      month: month as string,
      year: year as string,
      recurrence: recurrence as string,
      paymentMethod: paymentMethod as string
    });

    return res.status(200).json(summaryData);
  } catch (error: any) {
    console.error("Error in financial summary:", error);
    throw new AppError(error.message || "ERR_FETCHING_FINANCIAL_SUMMARY", error.statusCode || 500);
  }
};

// GET /financial/payments?startDate=2024-01-01&endDate=2024-12-31&status=paid&recurrence=MENSUAL&paymentMethod=stripe&page=1&limit=20
export const payments = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Verificar permisos
    checkSuperAdmin(req);

    const { startDate, endDate, status, recurrence, paymentMethod, page, limit } = req.query;

    const paymentsData = await GetPaymentsByPeriodService({
      startDate: startDate as string,
      endDate: endDate as string,
      status: status as string,
      recurrence: recurrence as string,
      paymentMethod: paymentMethod as string,
      page: page as string,
      limit: limit as string
    });

    return res.status(200).json(paymentsData);
  } catch (error: any) {
    console.error("Error in financial payments:", error);
    throw new AppError(error.message || "ERR_FETCHING_FINANCIAL_PAYMENTS", error.statusCode || 500);
  }
};

// GET /financial/export?format=csv&startDate=2024-01-01&endDate=2024-12-31&status=paid
export const exportReport = async (req: Request, res: Response): Promise<void> => {
  try {
    // Verificar permisos
    checkSuperAdmin(req);

    const { format, startDate, endDate, status, recurrence, paymentMethod } = req.query;

    // Obtener todos los pagos sin límite para exportación
    const { payments } = await GetPaymentsByPeriodService({
      startDate: startDate as string,
      endDate: endDate as string,
      status: status as string,
      recurrence: recurrence as string,
      paymentMethod: paymentMethod as string,
      page: "1",
      limit: "10000" // Límite alto para obtener todos los registros
    });

    if (format === 'csv') {
      // Generar CSV
      const headers = [
        'ID',
        'Company ID',
        'Due Date',
        'Detail',
        'Status',
        'Value',
        'Recurrence',
        'Payment Method',
        'Stripe ID',
        'Created At'
      ];

      const csvRows = [headers.join(',')];

      payments.forEach(payment => {
        const row = [
          payment.id,
          payment.companyId,
          payment.dueDate,
          `"${payment.detail?.replace(/"/g, '""') || ''}"`, // Escapar comillas dobles
          payment.status,
          payment.value,
          payment.recurrence || '',
          payment.paymentMethod || '',
          payment.stripe_id || '',
          payment.createdAt
        ];

        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');

      // Configurar headers para descarga de archivo
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="financial-report-${new Date().toISOString().split('T')[0]}.csv"`);

      res.send(csvContent);
    } else {
      // Por defecto, retornar JSON
      res.status(200).json({
        payments,
        count: payments.length,
        exportDate: new Date().toISOString()
      });
    }
  } catch (error: any) {
    console.error("Error in financial export:", error);
    throw new AppError(error.message || "ERR_EXPORTING_FINANCIAL_REPORT", error.statusCode || 500);
  }
};
