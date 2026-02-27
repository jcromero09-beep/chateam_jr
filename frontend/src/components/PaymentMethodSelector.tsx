import { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  Button,
  Chip,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
  Select,
  Option,
  Divider,
  Alert,
  CircularProgress,
} from '@mui/joy'
import {
  CreditCard as CardIcon,
  AccountBalanceWallet as WalletIcon,
  Receipt as ReceiptIcon,
  Check as CheckIcon,
  Info as InfoIcon,
} from '@mui/icons-material'

export interface PaymentMethodSelectorProps {
  invoiceId: number
  planId: number
  planName: string
  planPrice: number
  currency?: string
  onStripePayment: (isRecurring: boolean) => void
  onPaypalPayment: (months: number) => void
  onOutlinePayment: () => void
  isLoading?: boolean
}

type PaymentMethod = 'stripe' | 'paypal' | 'outline'

export default function PaymentMethodSelector({
  invoiceId: _invoiceId,
  planId: _planId,
  planName,
  planPrice,
  currency = 'USD',
  onStripePayment,
  onPaypalPayment,
  onOutlinePayment,
  isLoading = false,
}: PaymentMethodSelectorProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('stripe')
  const [isRecurring, setIsRecurring] = useState(false)
  const [months, setMonths] = useState(1)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: currency,
    }).format(value)
  }

  const calculateTotal = () => {
    if (selectedMethod === 'paypal') {
      return planPrice * months
    }
    return planPrice
  }

  const handlePayment = () => {
    switch (selectedMethod) {
      case 'stripe':
        onStripePayment(isRecurring)
        break
      case 'paypal':
        onPaypalPayment(months)
        break
      case 'outline':
        onOutlinePayment()
        break
    }
  }

  const paymentMethods = [
    {
      id: 'stripe' as PaymentMethod,
      name: 'Tarjeta de Crédito/Débito',
      description: 'Pago seguro con Visa, Mastercard, American Express',
      icon: <CardIcon sx={{ fontSize: 32 }} />,
      color: 'primary' as const,
      features: ['Pago único', 'Suscripción recurrente', 'Procesamiento instantáneo'],
    },
    {
      id: 'paypal' as PaymentMethod,
      name: 'PayPal',
      description: 'Paga con tu cuenta de PayPal',
      icon: <WalletIcon sx={{ fontSize: 32 }} />,
      color: 'success' as const,
      features: ['Pago único', 'Múltiples meses', 'Protección al comprador'],
    },
    {
      id: 'outline' as PaymentMethod,
      name: 'Comprobante de Pago',
      description: 'Sube tu comprobante de transferencia o depósito',
      icon: <ReceiptIcon sx={{ fontSize: 32 }} />,
      color: 'neutral' as const,
      features: ['Transferencia bancaria', 'Verificación manual', 'Hasta 24h de procesamiento'],
    },
  ]

  return (
    <Box>
      <Stack spacing={3}>
        {/* Resumen del Plan */}
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography level="title-lg">{planName}</Typography>
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Plan seleccionado
                </Typography>
              </Box>
              <Typography level="h3" sx={{ color: 'primary.main' }}>
                {formatCurrency(planPrice)}
                <Typography level="body-sm" component="span" sx={{ color: 'text.tertiary' }}>
                  /mes
                </Typography>
              </Typography>
            </Stack>
          </CardContent>
        </Card>

        {/* Selector de Método de Pago */}
        <Typography level="title-lg">Selecciona tu método de pago</Typography>

        <RadioGroup
          value={selectedMethod}
          onChange={(e) => setSelectedMethod(e.target.value as PaymentMethod)}
        >
          <Stack spacing={2}>
            {paymentMethods.map((method) => (
              <Card
                key={method.id}
                variant={selectedMethod === method.id ? 'soft' : 'outlined'}
                sx={{
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  borderColor: selectedMethod === method.id ? `${method.color}.main` : undefined,
                  borderWidth: selectedMethod === method.id ? 2 : 1,
                  '&:hover': {
                    borderColor: `${method.color}.main`,
                  },
                }}
                onClick={() => setSelectedMethod(method.id)}
              >
                <CardContent>
                  <Stack direction="row" spacing={2} alignItems="flex-start">
                    <Radio
                      value={method.id}
                      color={method.color}
                      sx={{ mt: 0.5 }}
                    />
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 'md',
                        bgcolor: `${method.color}.softBg`,
                        color: `${method.color}.main`,
                      }}
                    >
                      {method.icon}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography level="title-md">{method.name}</Typography>
                        {selectedMethod === method.id && (
                          <Chip size="sm" color={method.color} startDecorator={<CheckIcon />}>
                            Seleccionado
                          </Chip>
                        )}
                      </Stack>
                      <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                        {method.description}
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {method.features.map((feature, index) => (
                          <Chip key={index} size="sm" variant="outlined">
                            {feature}
                          </Chip>
                        ))}
                      </Stack>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </RadioGroup>

        {/* Opciones adicionales según método seleccionado */}
        {selectedMethod === 'stripe' && (
          <Card variant="soft" color="primary">
            <CardContent>
              <FormControl>
                <FormLabel>Tipo de pago</FormLabel>
                <RadioGroup
                  orientation="horizontal"
                  value={isRecurring ? 'recurring' : 'single'}
                  onChange={(e) => setIsRecurring(e.target.value === 'recurring')}
                >
                  <Radio value="single" label="Pago único" />
                  <Radio value="recurring" label="Suscripción mensual" />
                </RadioGroup>
              </FormControl>
              {isRecurring && (
                <Alert
                  color="primary"
                  variant="soft"
                  startDecorator={<InfoIcon />}
                  sx={{ mt: 2 }}
                >
                  Se realizará un cargo automático cada mes hasta que canceles la suscripción.
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {selectedMethod === 'paypal' && (
          <Card variant="soft" color="success">
            <CardContent>
              <FormControl>
                <FormLabel>Cantidad de meses a pagar</FormLabel>
                <Select
                  value={months}
                  onChange={(_, value) => setMonths(value as number)}
                  sx={{ maxWidth: 200 }}
                >
                  <Option value={1}>1 mes</Option>
                  <Option value={2}>2 meses</Option>
                  <Option value={3}>3 meses</Option>
                  <Option value={6}>6 meses</Option>
                  <Option value={12}>12 meses</Option>
                </Select>
              </FormControl>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 2 }}>
                <Typography level="body-md">
                  {months} mes{months > 1 ? 'es' : ''} x {formatCurrency(planPrice)}
                </Typography>
                <Typography level="h4" sx={{ color: 'success.main' }}>
                  Total: {formatCurrency(planPrice * months)}
                </Typography>
              </Stack>
              {months >= 6 && (
                <Alert
                  color="success"
                  variant="soft"
                  startDecorator={<InfoIcon />}
                  sx={{ mt: 2 }}
                >
                  Ahorra tiempo pagando por adelantado varios meses.
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {selectedMethod === 'outline' && (
          <Card variant="soft" color="neutral">
            <CardContent>
              <Alert
                color="warning"
                variant="soft"
                startDecorator={<InfoIcon />}
              >
                <Stack spacing={1}>
                  <Typography level="title-sm">Instrucciones para pago manual:</Typography>
                  <Typography level="body-sm">
                    1. Realiza la transferencia o depósito a nuestra cuenta bancaria
                  </Typography>
                  <Typography level="body-sm">
                    2. Sube el comprobante de pago en la siguiente pantalla
                  </Typography>
                  <Typography level="body-sm">
                    3. Nuestro equipo verificará el pago en un plazo máximo de 24 horas
                  </Typography>
                </Stack>
              </Alert>
            </CardContent>
          </Card>
        )}

        <Divider />

        {/* Resumen y Botón de Pago */}
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Total a pagar
                </Typography>
                <Typography level="h2">{formatCurrency(calculateTotal())}</Typography>
              </Box>
              <Button
                size="lg"
                color={
                  selectedMethod === 'stripe'
                    ? 'primary'
                    : selectedMethod === 'paypal'
                    ? 'success'
                    : 'neutral'
                }
                onClick={handlePayment}
                disabled={isLoading}
                startDecorator={
                  isLoading ? (
                    <CircularProgress size="sm" />
                  ) : selectedMethod === 'stripe' ? (
                    <CardIcon />
                  ) : selectedMethod === 'paypal' ? (
                    <WalletIcon />
                  ) : (
                    <ReceiptIcon />
                  )
                }
                sx={{ minWidth: 200 }}
              >
                {isLoading
                  ? 'Procesando...'
                  : selectedMethod === 'stripe'
                  ? isRecurring
                    ? 'Suscribirse'
                    : 'Pagar con Tarjeta'
                  : selectedMethod === 'paypal'
                  ? 'Pagar con PayPal'
                  : 'Subir Comprobante'}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  )
}
