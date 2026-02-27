import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Container,
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Button,
  LinearProgress,
  Alert,
  Stepper,
  Step,
  StepIndicator,
  Modal,
  ModalDialog,
  ModalClose,
  Divider,
} from '@mui/joy'
import {
  ShoppingCart as CartIcon,
  Check as CheckIcon,
  ArrowBack as BackIcon,
  CelebrationOutlined as SuccessIcon,
  Close as CloseIcon,
} from '@mui/icons-material'
import IconButton from '@mui/joy/IconButton'
import PaymentMethodSelector from '../components/PaymentMethodSelector'
import PayPalButton from '../components/PayPalButton'
import api from '../services/api'

interface Plan {
  id: number
  name: string
  amount: number
  recurrence: string
}

interface Invoice {
  id: number
  value: number
  status: string
  companyId: number
}

export default function Checkout() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const invoiceId = Number(searchParams.get('invoiceId')) || 0
  const planId = Number(searchParams.get('planId')) || 0

  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Estado del checkout
  const [step, setStep] = useState(0) // 0: selección, 1: pago, 2: éxito
  const [selectedMethod, setSelectedMethod] = useState<'stripe' | 'paypal' | 'outline' | null>(null)
  const [paypalMonths, setPaypalMonths] = useState(1)
  const [isRecurring, setIsRecurring] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)

  useEffect(() => {
    if (invoiceId && planId) {
      fetchData()
    } else {
      setError('Parámetros de checkout inválidos')
      setLoading(false)
    }
  }, [invoiceId, planId])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Obtener datos del plan e invoice
      const [planRes, invoiceRes] = await Promise.all([
        api.get(`/plans/${planId}`),
        api.get(`/invoices/${invoiceId}`),
      ])

      setPlan(planRes.data)
      setInvoice(invoiceRes.data)
    } catch (err) {
      console.error('Error fetching checkout data:', err)
      setError('Error al cargar los datos del checkout')
    } finally {
      setLoading(false)
    }
  }

  const handleStripePayment = async (recurring: boolean) => {
    setIsRecurring(recurring)
    setSelectedMethod('stripe')
    setIsProcessing(true)

    try {
      // Llamar al endpoint de Stripe para crear sesión de checkout
      const response = await api.post('/subscription/create', {
        invoiceId,
        planId,
        recurring,
      })

      if (response.data.url) {
        // Redirigir a Stripe Checkout
        window.location.href = response.data.url
      } else {
        throw new Error('No se recibió URL de pago')
      }
    } catch (err) {
      console.error('Error creating Stripe session:', err)
      setError('Error al iniciar el pago con tarjeta')
      setIsProcessing(false)
    }
  }

  const handlePaypalPayment = (months: number) => {
    setPaypalMonths(months)
    setSelectedMethod('paypal')
    setStep(1) // Ir al paso de pago con PayPal
  }

  const handleOutlinePayment = () => {
    setSelectedMethod('outline')
    // Redirigir a la página de subida de comprobante
    navigate(`/receipts/upload?invoiceId=${invoiceId}`)
  }

  const handlePaypalSuccess = (data: { captureID: string; invoiceId: number; companyId: number }) => {
    console.log('PayPal payment success:', data)
    setStep(2)
    setShowSuccessModal(true)
  }

  const handlePaypalError = (err: Error) => {
    console.error('PayPal error:', err)
    setError('Error en el pago con PayPal: ' + err.message)
    setStep(0)
  }

  const handlePaypalCancel = () => {
    setStep(0)
    setSelectedMethod(null)
  }

  const handleGoBack = () => {
    if (step === 1) {
      setStep(0)
      setSelectedMethod(null)
    } else {
      navigate(-1)
    }
  }

  const handleFinish = () => {
    setShowSuccessModal(false)
    navigate('/billing')
  }

  if (loading) {
    return (
      <Container maxWidth="md">
        <Stack spacing={3} sx={{ py: 4 }}>
          <LinearProgress />
          <Typography level="body-md" textAlign="center">
            Cargando información del pago...
          </Typography>
        </Stack>
      </Container>
    )
  }

  if (error && !plan) {
    return (
      <Container maxWidth="md">
        <Stack spacing={3} sx={{ py: 4 }}>
          <Alert color="danger">{error}</Alert>
          <Button onClick={() => navigate(-1)} startDecorator={<BackIcon />}>
            Volver
          </Button>
        </Stack>
      </Container>
    )
  }

  return (
    <Container maxWidth="md">
      <Stack spacing={3} sx={{ py: 4 }}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            variant="plain"
            color="neutral"
            onClick={handleGoBack}
            startDecorator={<BackIcon />}
          >
            Volver
          </Button>
        </Stack>

        <Stack direction="row" spacing={2} alignItems="center">
          <CartIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography level="h2">Checkout</Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              Completa tu pago de forma segura
            </Typography>
          </Box>
        </Stack>

        {/* Stepper */}
        <Stepper sx={{ width: '100%' }}>
          <Step
            indicator={
              <StepIndicator variant={step >= 0 ? 'solid' : 'outlined'} color="primary">
                {step > 0 ? <CheckIcon /> : '1'}
              </StepIndicator>
            }
          >
            Seleccionar Método
          </Step>
          <Step
            indicator={
              <StepIndicator variant={step >= 1 ? 'solid' : 'outlined'} color="primary">
                {step > 1 ? <CheckIcon /> : '2'}
              </StepIndicator>
            }
          >
            Realizar Pago
          </Step>
          <Step
            indicator={
              <StepIndicator variant={step >= 2 ? 'solid' : 'outlined'} color="success">
                {step >= 2 ? <CheckIcon /> : '3'}
              </StepIndicator>
            }
          >
            Confirmación
          </Step>
        </Stepper>

        {/* Error Alert */}
        {error && (
          <Alert
            color="danger"
            endDecorator={
              <IconButton variant="soft" color="danger" onClick={() => setError(null)}>
                <CloseIcon />
              </IconButton>
            }
          >
            {error}
          </Alert>
        )}

        {/* Contenido según el paso */}
        {step === 0 && plan && invoice && (
          <PaymentMethodSelector
            invoiceId={invoiceId}
            planId={planId}
            planName={plan.name}
            planPrice={plan.amount}
            onStripePayment={handleStripePayment}
            onPaypalPayment={handlePaypalPayment}
            onOutlinePayment={handleOutlinePayment}
            isLoading={isProcessing}
          />
        )}

        {step === 1 && selectedMethod === 'paypal' && plan && (
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 3 }}>
                Pagar con PayPal
              </Typography>
              <PayPalButton
                invoiceId={invoiceId}
                planId={planId}
                months={paypalMonths}
                amount={plan.amount}
                onSuccess={handlePaypalSuccess}
                onError={handlePaypalError}
                onCancel={handlePaypalCancel}
              />
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card variant="soft" color="success">
            <CardContent>
              <Stack spacing={3} alignItems="center" sx={{ py: 4 }}>
                <SuccessIcon sx={{ fontSize: 64, color: 'success.main' }} />
                <Typography level="h3" textAlign="center">
                  ¡Pago Completado!
                </Typography>
                <Typography level="body-md" textAlign="center" sx={{ color: 'text.tertiary' }}>
                  Tu pago ha sido procesado exitosamente. Tu suscripción está activa.
                </Typography>
                <Button color="success" onClick={handleFinish}>
                  Ir a Facturación
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Modal de Éxito */}
        <Modal open={showSuccessModal} onClose={() => setShowSuccessModal(false)}>
          <ModalDialog>
            <ModalClose />
            <Stack spacing={3} alignItems="center" sx={{ py: 2 }}>
              <SuccessIcon sx={{ fontSize: 80, color: 'success.main' }} />
              <Typography level="h3" textAlign="center">
                ¡Pago Exitoso!
              </Typography>
              <Typography level="body-md" textAlign="center">
                Tu pago con PayPal ha sido procesado correctamente.
              </Typography>
              <Divider sx={{ width: '100%' }} />
              <Stack direction="row" spacing={2}>
                <Button variant="outlined" onClick={() => navigate('/billing')}>
                  Ver Facturación
                </Button>
                <Button color="success" onClick={() => navigate('/')}>
                  Ir al Dashboard
                </Button>
              </Stack>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
