import api from './api'

export interface PaymentConfigResponse {
  success: boolean
  data: {
    stripePublicKey: string | null
    paypalClientId: string | null
    isStripeConfigured: boolean
    isPaypalConfigured: boolean
  }
}

// Obtener configuración de pagos desde el backend
export const getPaymentConfig = async (): Promise<PaymentConfigResponse> => {
  const response = await api.get('/payment-config')
  return response.data
}

export default {
  getPaymentConfig
}
