import { useState, useEffect } from 'react'
// [Fase2·G] Conservados como MUI Joy a propósito: no hay equivalente en el DS.
import { CircularProgress, LinearProgress } from '@mui/joy'
import {
  Envelope,
  CreditCard,
  PaperPlaneTilt,
  FileText,
  ArrowClockwise,
  ShoppingCart,
} from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'react-toastify'
import api from '../services/api'
import CheckoutPage from '../components/CheckoutPage'

interface EmailBalance {
  emailCreditsUsed: number
  emailCreditsTotal: number
  remainingCredits: number
  maxEmailSendsPerDay: number
  maxTemplates: number
  dueDate: string | null
  emailCreditsResetAt: string | null
  planName: string | null
  isActive: boolean
}

interface Invoice {
  id: number
  detail: string
  value: number
  dueDate: string
  status: 'paid' | 'open' | 'proceso'
  users: number
  connections: number
  queues: number
  planId?: number
  recurrence?: string
}

// Tarjeta de métrica con icono + subtítulo (StatTile no admite decorador ni caption).
function MetricCard({
  icon,
  label,
  value,
  caption,
  valueClassName,
}: {
  icon: React.ReactNode
  label: string
  value: string
  caption: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p
        className={`mt-1.5 text-3xl font-semibold tracking-tight tabular-nums ${
          valueClassName ?? 'text-foreground'
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>
    </div>
  )
}

// Tarjeta de plan (estado sin plan activo).
function PlanCard({
  name,
  price,
  features,
}: {
  name: string
  price: string
  features: string[]
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <h3 className="text-base font-semibold text-foreground">{name}</h3>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-primary">
        {price}
        <span className="ml-0.5 text-xs font-normal text-muted-foreground">/mes</span>
      </p>
      <ul className="mt-4 space-y-1.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-1.5 text-sm text-foreground">
            <span className="text-success-text" aria-hidden>
              ✓
            </span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function EmailCreditsDashboard() {
  const [loading, setLoading] = useState(true)
  const [balance, setBalance] = useState<EmailBalance | null>(null)
  const [error, setError] = useState('')
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [invoice, setInvoice] = useState<Invoice | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const balanceRes = await api.get('/email-plans/balance')
      setBalance(balanceRes.data.data)
    } catch (err: any) {
      console.error('Error fetching email data:', err)
      // Si no tiene plan, está bien - usamos datos por defecto
      setBalance({
        emailCreditsUsed: 0,
        emailCreditsTotal: 0,
        remainingCredits: 0,
        maxEmailSendsPerDay: 0,
        maxTemplates: 0,
        dueDate: null,
        emailCreditsResetAt: null,
        planName: null,
        isActive: false
      })
    } finally {
      setLoading(false)
    }
  }

  const handleBuyPlan = async () => {
    try {
      // Crear una factura temporal para el checkout
      const { data } = await api.post('/invoices', {
        detail: 'Plan de Email',
        value: 0,
        users: 0,
        connections: 0,
        queues: 0
      })

      setInvoice(data)
      setCheckoutOpen(true)
    } catch (err: any) {
      toast.error('Error al iniciar la compra')
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  const handleCheckoutSuccess = () => {
    setCheckoutOpen(false)
    fetchData()
    toast.success('¡Plan de email adquirido exitosamente!')
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <CircularProgress />
      </div>
    )
  }

  if (!balance?.isActive) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <Envelope className="size-6" weight="fill" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Planes de Email
                </h1>
                <p className="text-sm text-muted-foreground">
                  Adquiere un plan para enviar campañas de email
                </p>
              </div>
            </div>
          </div>

          {/* No Active Plan Card */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <Envelope className="size-20 text-muted-foreground" aria-hidden />
              <h2 className="text-xl font-semibold text-foreground">
                No tienes un plan de email activo
              </h2>
              <p className="max-w-[500px] text-sm text-muted-foreground">
                Adquiere un plan de email para comenzar a enviar campañas,
                gestionar plantillas y más.
              </p>
              <Button size="lg" onClick={handleBuyPlan}>
                <ShoppingCart className="size-5" aria-hidden />
                Adquirir Plan de Email
              </Button>
            </div>
          </div>

          {/* Plans Info */}
          <div className="grid gap-4 md:grid-cols-3">
            <PlanCard
              name="Email Básico"
              price="$9.99"
              features={['100 créditos/mes', '50 envíos/día', '5 plantillas']}
            />
            <PlanCard
              name="Email Profesional"
              price="$29.99"
              features={['500 créditos/mes', '200 envíos/día', '20 plantillas']}
            />
            <PlanCard
              name="Email Enterprise"
              price="$99.99"
              features={['2000 créditos/mes', '1000 envíos/día', '100 plantillas']}
            />
          </div>

          {/* Checkout Modal */}
          <Dialog open={checkoutOpen} onOpenChange={(open) => !open && setCheckoutOpen(false)}>
            <DialogContent
              className="w-[calc(100%-2rem)] max-w-[900px] max-h-[95dvh]"
              aria-describedby={undefined}
            >
              <DialogTitle className="sr-only">Adquirir plan de email</DialogTitle>
              {invoice && (
                <CheckoutPage
                  invoice={invoice}
                  onClose={() => setCheckoutOpen(false)}
                  onSuccess={handleCheckoutSuccess}
                />
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    )
  }

  // Mostrar dashboard con plan activo
  const percentage = balance.emailCreditsTotal > 0
    ? Math.round((balance.emailCreditsUsed / balance.emailCreditsTotal) * 100)
    : 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Envelope className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Mis Créditos de Email
              </h1>
              <p className="text-sm text-muted-foreground">
                Plan: {balance.planName || 'Sin plan'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <ArrowClockwise className="size-4" aria-hidden />
              Actualizar
            </Button>
            <Button size="sm" onClick={handleBuyPlan}>
              <ShoppingCart className="size-4" aria-hidden />
              Cambiar Plan
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={<CreditCard className="size-5 text-primary" aria-hidden />}
            label="Créditos Totales"
            value={String(balance.emailCreditsTotal)}
            caption="por ciclo"
          />
          <MetricCard
            icon={<PaperPlaneTilt className="size-5 text-success-text" aria-hidden />}
            label="Créditos Usados"
            value={String(balance.emailCreditsUsed)}
            caption="este ciclo"
            valueClassName="text-success-text"
          />
          <MetricCard
            icon={<Envelope className="size-5 text-warning-text" aria-hidden />}
            label="Créditos Restantes"
            value={String(balance.remainingCredits)}
            caption="disponibles"
            valueClassName="text-warning-text"
          />
          <MetricCard
            icon={<FileText className="size-5 text-primary" aria-hidden />}
            label="Próximo Reset"
            value={formatDate(balance.dueDate)}
            caption="fecha de facturación"
            valueClassName="text-foreground text-xl"
          />
        </div>

        {/* Usage Progress */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <h2 className="mb-4 text-base font-semibold text-foreground">
            Uso del Ciclo Actual
          </h2>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm text-foreground">
              <strong className="font-semibold tabular-nums">{balance.emailCreditsUsed}</strong>
              {' / '}
              <span className="tabular-nums">{balance.emailCreditsTotal}</span> créditos usados
            </p>
            <Badge variant={percentage > 80 ? 'warning' : 'success'}>{percentage}%</Badge>
          </div>
          <LinearProgress
            determinate
            value={percentage}
            color={percentage > 80 ? 'warning' : 'success'}
            sx={{ height: 10, borderRadius: 5 }}
          />
        </div>

        {/* Limits */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <h2 className="mb-4 text-base font-semibold text-foreground">
            Límites del Plan
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Envíos por día</p>
              <p className="text-xl font-semibold tracking-tight tabular-nums text-foreground">
                {balance.maxEmailSendsPerDay}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Plantillas disponibles</p>
              <p className="text-xl font-semibold tracking-tight tabular-nums text-foreground">
                {balance.maxTemplates}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Próximo ciclo</p>
              <p className="text-xl font-semibold tracking-tight text-foreground">
                {formatDate(balance.dueDate)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
