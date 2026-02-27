import { useState } from 'react'
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js'
import { Box, Typography, Alert, CircularProgress, Stack } from '@mui/joy'
import { createPaypalOrder, capturePaypalOrder } from '../services/paypalService'

export interface PayPalButtonProps {
  invoiceId: number
  planId: number
  months: number
  amount: number
  currency?: string
  onSuccess: (data: {
    captureID: string
    invoiceId: number
    companyId: number
  }) => void
  onError: (error: Error) => void
  onCancel?: () => void
}

export default function PayPalButton({
  invoiceId,
  planId,
  months,
  amount,
  currency = 'USD',
  onSuccess,
  onError,
  onCancel,
}: PayPalButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Obtener el Client ID de PayPal desde las variables de entorno
  const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID || ''

  if (!clientId) {
    return (
      <Alert color="danger">
        PayPal Client ID no configurado. Por favor configure VITE_PAYPAL_CLIENT_ID en las variables de entorno.
      </Alert>
    )
  }

  const createOrder = async (): Promise<string> => {
    setLoading(true)
    setError(null)

    try {
      const response = await createPaypalOrder({
        invoiceId,
        planId,
        months,
      })

      if (response.success && response.orderID) {
        return response.orderID
      } else {
        throw new Error('No se pudo crear la orden de PayPal')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al crear la orden'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const onApprove = async (data: { orderID: string }) => {
    setLoading(true)
    setError(null)

    try {
      const response = await capturePaypalOrder({
        orderID: data.orderID,
        invoiceId,
      })

      if (response.success) {
        onSuccess({
          captureID: response.captureID,
          invoiceId: response.invoiceId,
          companyId: response.companyId,
        })
      } else {
        throw new Error('No se pudo capturar el pago')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al procesar el pago'
      setError(errorMessage)
      onError(err instanceof Error ? err : new Error(errorMessage))
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setError('Pago cancelado por el usuario')
    if (onCancel) {
      onCancel()
    }
  }

  const handleError = (err: Record<string, unknown>) => {
    const errorMessage = 'Error en el procesamiento de PayPal'
    setError(errorMessage)
    onError(new Error(errorMessage + ': ' + JSON.stringify(err)))
  }

  return (
    <PayPalScriptProvider
      options={{
        clientId: clientId,
        currency: currency,
        intent: 'capture',
      }}
    >
      <Box sx={{ width: '100%' }}>
        {loading && (
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="center" sx={{ py: 2 }}>
            <CircularProgress size="sm" />
            <Typography>Procesando...</Typography>
          </Stack>
        )}

        {error && (
          <Alert color="danger" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ mb: 2 }}>
          <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
            Total a pagar: <strong>${(amount * months).toFixed(2)} {currency}</strong>
            {months > 1 && ` (${months} meses)`}
          </Typography>
        </Box>

        <PayPalButtons
          style={{
            layout: 'vertical',
            color: 'blue',
            shape: 'rect',
            label: 'pay',
            height: 45,
          }}
          disabled={loading}
          createOrder={createOrder}
          onApprove={onApprove}
          onCancel={handleCancel}
          onError={handleError}
        />

        <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 2, textAlign: 'center' }}>
          Al hacer clic en el botón de PayPal, serás redirigido a PayPal para completar tu pago de forma segura.
        </Typography>
      </Box>
    </PayPalScriptProvider>
  )
}
