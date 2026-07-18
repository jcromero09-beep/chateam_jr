import api from './api'

// Interfaces
export interface FinancialSummary {
  totalPaid: number
  totalPending: number
  paymentsByRecurrence: {
    MENSUAL: { count: number; total: number }
    BIMESTRAL: { count: number; total: number }
    TRIMESTRAL: { count: number; total: number }
    SEMESTRAL: { count: number; total: number }
    ANUAL: { count: number; total: number }
  }
  paymentsByMonth: Array<{
    month: number
    year: number
    monthName: string
    total: number
    count: number
  }>
  paymentsByMethod: {
    stripe: { count: number; total: number }
    paypal: { count: number; total: number }
    outline: { count: number; total: number }
  }
  recentPayments: PaymentRecord[]
}

export interface PaymentRecord {
  id: number
  companyId: number
  dueDate: string
  detail: string
  status: 'open' | 'paid' | 'proceso' | 'refunded'
  value: number
  recurrence: string
  paymentMethod: string | null
  stripe_id: string | null
  createdAt: string
  company?: {
    id: number
    name: string
  }
}

export interface PaymentsListResponse {
  payments: PaymentRecord[]
  count: number
  page: number
  limit: number
  totalPages: number
}

export interface GetSummaryParams {
  month?: string
  year?: string
  recurrence?: string
  paymentMethod?: string
}

export interface GetPaymentsParams {
  startDate?: string
  endDate?: string
  status?: string
  recurrence?: string
  paymentMethod?: string
  page?: number
  limit?: number
}

// Obtener resumen financiero
export const getFinancialSummary = async (
  params: GetSummaryParams = {}
): Promise<FinancialSummary> => {
  const response = await api.get('/financial/summary', { params })
  return response.data
}

// Obtener lista de pagos con filtros
export const getPaymentsList = async (
  params: GetPaymentsParams = {}
): Promise<PaymentsListResponse> => {
  const response = await api.get('/financial/payments', { params })
  return response.data
}

// Exportar reporte financiero
export const exportFinancialReport = async (
  format: 'csv' | 'json',
  params: GetPaymentsParams = {}
): Promise<Blob | PaymentsListResponse> => {
  if (format === 'csv') {
    const response = await api.get('/financial/export', {
      params: { ...params, format: 'csv' },
      responseType: 'blob'
    })
    return response.data
  }
  const response = await api.get('/financial/export', {
    params: { ...params, format: 'json' }
  })
  return response.data
}

export default {
  getFinancialSummary,
  getPaymentsList,
  exportFinancialReport
}
