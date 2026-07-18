import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
// [Fase2·G] Conservado como MUI: LinearProgress no tiene equivalente en el design system.
import LinearProgress from '@mui/joy/LinearProgress'
import {
  ShoppingCart as CartIcon,
  Check as CheckIcon,
  ArrowLeft as BackIcon,
  Confetti as SuccessIcon,
  X as CloseIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
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

const steps = [
  { label: 'Seleccionar Método', tone: 'primary' as const },
  { label: 'Realizar Pago', tone: 'primary' as const },
  { label: 'Confirmación', tone: 'success' as const },
]

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
      <div className="mx-auto max-w-3xl px-5 py-8">
        <div className="space-y-6">
          <LinearProgress />
          <p className="text-center text-sm text-muted-foreground">
            Cargando información del pago...
          </p>
        </div>
      </div>
    )
  }

  if (error && !plan) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-8">
        <div className="space-y-6">
          <div className="rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text">
            {error}
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <BackIcon className="size-4" aria-hidden />
            Volver
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-5 py-8 sm:px-6">
        {/* Header: volver */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={handleGoBack}
          >
            <BackIcon className="size-4" aria-hidden />
            Volver
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <CartIcon className="size-6" weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Checkout</h1>
            <p className="text-sm text-muted-foreground">Completa tu pago de forma segura</p>
          </div>
        </div>

        {/* Stepper */}
        <ol className="flex w-full items-center">
          {steps.map((s, i) => {
            const active = step >= i
            const isDone = step > i
            const solid = active
            const solidClasses =
              s.tone === 'success'
                ? 'border-success bg-success text-primary-foreground'
                : 'border-primary bg-primary text-primary-foreground'
            return (
              <li key={s.label} className="flex flex-1 items-center gap-3 last:flex-none">
                <div className="flex items-center gap-2.5">
                  <span
                    className={
                      'flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors ' +
                      (solid
                        ? solidClasses
                        : 'border-border bg-card text-muted-foreground')
                    }
                    aria-hidden
                  >
                    {isDone || (s.tone === 'success' && step >= i) ? (
                      <CheckIcon className="size-4" weight="bold" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span
                    className={
                      'text-sm font-medium ' +
                      (active ? 'text-foreground' : 'text-muted-foreground')
                    }
                  >
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <span
                    className={
                      'mx-2 hidden h-px flex-1 sm:block ' +
                      (step > i ? 'bg-primary' : 'bg-border')
                    }
                    aria-hidden
                  />
                )}
              </li>
            )
          })}
        </ol>

        {/* Error Alert */}
        {error && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text">
            <span>{error}</span>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => setError(null)}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-destructive-text transition-colors hover:bg-destructive/12"
            >
              <CloseIcon className="size-4" aria-hidden />
            </button>
          </div>
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
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
            <h2 className="mb-6 text-lg font-semibold text-foreground">Pagar con PayPal</h2>
            <PayPalButton
              invoiceId={invoiceId}
              planId={planId}
              months={paypalMonths}
              amount={plan.amount}
              onSuccess={handlePaypalSuccess}
              onError={handlePaypalError}
              onCancel={handlePaypalCancel}
            />
          </div>
        )}

        {step === 2 && (
          <div className="rounded-xl border border-success/30 bg-success/10 p-6">
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <SuccessIcon className="size-16 text-success-text" weight="fill" aria-hidden />
              <h2 className="text-xl font-semibold text-foreground">¡Pago Completado!</h2>
              <p className="text-sm text-muted-foreground">
                Tu pago ha sido procesado exitosamente. Tu suscripción está activa.
              </p>
              <Button onClick={handleFinish}>Ir a Facturación</Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Éxito */}
      <Dialog open={showSuccessModal} onOpenChange={(open) => !open && setShowSuccessModal(false)}>
        <DialogContent className="max-w-md">
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <SuccessIcon className="size-20 text-success-text" weight="fill" aria-hidden />
            <DialogHeader className="items-center">
              <DialogTitle>¡Pago Exitoso!</DialogTitle>
              <DialogDescription className="text-center">
                Tu pago con PayPal ha sido procesado correctamente.
              </DialogDescription>
            </DialogHeader>
            <div className="my-2 h-px w-full bg-border" aria-hidden />
            <DialogFooter className="w-full sm:justify-center">
              <Button variant="outline" onClick={() => navigate('/billing')}>
                Ver Facturación
              </Button>
              <Button onClick={() => navigate('/')}>Ir al Dashboard</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
