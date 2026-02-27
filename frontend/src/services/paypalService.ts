import api from './api'

// Interfaces
export interface CreatePaypalOrderRequest {
  invoiceId: number
  planId: number
  months: number
}

export interface CreatePaypalOrderResponse {
  success: boolean
  orderID: string
  approveURL: string
  message: string
}

export interface CapturePaypalOrderRequest {
  orderID: string
  invoiceId: number
}

export interface CapturePaypalOrderResponse {
  success: boolean
  captureID: string
  status: string
  invoiceId: number
  companyId: number
  message: string
}

// Crear orden de pago en PayPal
export const createPaypalOrder = async (
  data: CreatePaypalOrderRequest
): Promise<CreatePaypalOrderResponse> => {
  const response = await api.post('/paypal/create-order', data)
  return response.data
}

// Capturar pago después de aprobación del cliente
export const capturePaypalOrder = async (
  data: CapturePaypalOrderRequest
): Promise<CapturePaypalOrderResponse> => {
  const response = await api.post('/paypal/capture-order', data)
  return response.data
}

export default {
  createPaypalOrder,
  capturePaypalOrder
}
