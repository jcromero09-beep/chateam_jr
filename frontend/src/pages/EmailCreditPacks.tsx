import { useState, useEffect, useCallback } from 'react'
import { CircularProgress } from '@mui/joy'
import {
  Envelope,
  ShoppingCart,
  TrendUp,
  Megaphone,
  Package,
  CheckCircle,
  ArrowClockwise,
  Tag as OfferIcon,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import api from '../services/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmailPack {
  id: string
  name: string
  emailCount: number
  price: number
  pricePerEmail: number
  popular?: boolean
}

interface EmailStats {
  emailsSentThisMonth: number
  creditsAvailable: number
  activeCampaigns: number
}

// ---------------------------------------------------------------------------
// Pack data
// ---------------------------------------------------------------------------

const EMAIL_PACKS: EmailPack[] = [
  {
    id: 'pack_1000',
    name: 'Pack 1,000 Emails',
    emailCount: 1000,
    price: 1.99,
    pricePerEmail: 0.00199,
  },
  {
    id: 'pack_5000',
    name: 'Pack 5,000 Emails',
    emailCount: 5000,
    price: 7.99,
    pricePerEmail: 0.001598,
  },
  {
    id: 'pack_25000',
    name: 'Pack 25,000 Emails',
    emailCount: 25000,
    price: 29.99,
    pricePerEmail: 0.0011996,
    popular: true,
  },
  {
    id: 'pack_100000',
    name: 'Pack 100,000 Emails',
    emailCount: 100000,
    price: 89.99,
    pricePerEmail: 0.0008999,
  },
  {
    id: 'pack_500000',
    name: 'Pack 500,000 Emails',
    emailCount: 500000,
    price: 349.99,
    pricePerEmail: 0.0006999,
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  return new Intl.NumberFormat('es-ES').format(n)
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(n)
}

function formatPricePerEmail(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(n)
}

// ---------------------------------------------------------------------------
// Stat Card sub-component
// ---------------------------------------------------------------------------

type StatTone = 'primary' | 'success' | 'warning'

const statIconTone: Record<StatTone, string> = {
  primary: 'bg-primary/12 text-primary',
  success: 'bg-success/14 text-success-text',
  warning: 'bg-warning/16 text-warning-text',
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  tone: StatTone
}

function StatCard({ icon, label, value, tone }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] transition-shadow hover:shadow-md">
      <span
        className={`flex size-12 shrink-0 items-center justify-center rounded-lg ${statIconTone[tone]}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-semibold leading-tight tracking-tight tabular-nums text-foreground">
          {typeof value === 'number' ? formatNumber(value) : value}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function EmailCreditPacks() {
  const [stats, setStats] = useState<EmailStats>({
    emailsSentThisMonth: 0,
    creditsAvailable: 0,
    activeCampaigns: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [purchasingPack, setPurchasingPack] = useState<EmailPack | null>(null)
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [processingPurchase, setProcessingPurchase] = useState(false)

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Try to fetch email-specific stats, fallback to credit balances
      const [campaignsRes, creditsRes] = await Promise.allSettled([
        api.get('/email-campaigns', { params: { pageNumber: 1 } }),
        api.get('/ai/credits/balance'),
      ])

      let emailsSent = 0
      let activeCampaigns = 0
      let credits = 0

      if (campaignsRes.status === 'fulfilled') {
        const rawCampaigns = Array.isArray(campaignsRes.value.data)
          ? campaignsRes.value.data
          : (campaignsRes.value.data?.campaigns ?? campaignsRes.value.data?.data ?? [])

        activeCampaigns = rawCampaigns.filter(
          (c: Record<string, string>) => c.status === 'EN_ANDAMENTO'
        ).length

        emailsSent = rawCampaigns.reduce((sum: number, c: Record<string, number>) => {
          return sum + (c.emailsSent ?? c.sent ?? 0)
        }, 0)
      }

      if (creditsRes.status === 'fulfilled') {
        const balances = Array.isArray(creditsRes.value.data)
          ? creditsRes.value.data
          : (creditsRes.value.data?.balances ?? creditsRes.value.data?.data ?? [])

        // Find email_send or email_campaign credit type
        const emailBalance = balances.find(
          (b: Record<string, string>) =>
            b.creditType === 'email_send' || b.type === 'email_send'
        )
        credits = emailBalance?.balance ?? emailBalance?.remaining ?? 0
      }

      setStats({
        emailsSentThisMonth: emailsSent,
        creditsAvailable: credits,
        activeCampaigns,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar estadisticas'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // -------------------------------------------------------------------------
  // Purchase flow
  // -------------------------------------------------------------------------

  const handlePurchaseClick = (pack: EmailPack) => {
    setPurchasingPack(pack)
    setConfirmModalOpen(true)
  }

  const handleConfirmPurchase = async () => {
    if (!purchasingPack) return

    setProcessingPurchase(true)
    try {
      const { data } = await api.post('/email-marketing/packs/purchase', {
        packId: purchasingPack.id,
        emailCount: purchasingPack.emailCount,
        amount: purchasingPack.price,
      })

      if (data?.success !== false) {
        toast.success(
          `Pack de ${formatNumber(purchasingPack.emailCount)} emails comprado correctamente`
        )
        setConfirmModalOpen(false)
        setPurchasingPack(null)
        await fetchStats()
      } else {
        toast.error(data?.message ?? 'Error al procesar la compra')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al procesar la compra'
      toast.error(message)
    } finally {
      setProcessingPurchase(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ShoppingCart className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Packs de Envio de Email
              </h1>
              <p className="text-sm text-muted-foreground">
                Compra creditos adicionales para tus campanas de email marketing
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchStats}
            disabled={loading}
          >
            <ArrowClockwise className="size-4" aria-hidden />
            Actualizar
          </Button>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="flex min-h-80 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <CircularProgress size="lg" />
              <p className="text-sm text-muted-foreground">Cargando datos...</p>
            </div>
          </div>
        ) : error ? (
          /* Error state */
          <div className="rounded-xl border border-border bg-card px-6 py-12 text-center shadow-sm shadow-black/[0.02]">
            <Envelope className="mx-auto mb-3 size-12 text-muted-foreground" aria-hidden />
            <p className="mb-4 text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchStats}>
              <ArrowClockwise className="size-4" aria-hidden />
              Reintentar
            </Button>
          </div>
        ) : (
          <>
            {/* Stats cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                icon={<TrendUp className="size-6" aria-hidden />}
                label="Emails Enviados Este Mes"
                value={stats.emailsSentThisMonth}
                tone="primary"
              />
              <StatCard
                icon={<Package className="size-6" aria-hidden />}
                label="Creditos Disponibles"
                value={stats.creditsAvailable}
                tone="success"
              />
              <StatCard
                icon={<Megaphone className="size-6" aria-hidden />}
                label="Campanas Activas"
                value={stats.activeCampaigns}
                tone="warning"
              />
            </div>

            {/* Current balance card */}
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-accent p-6 text-accent-foreground sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-semibold">Tu Balance Actual</p>
                <p className="text-sm text-accent-foreground/80">
                  Creditos de envio de email disponibles en tu cuenta
                </p>
              </div>
              <div className="text-center">
                <p className="text-4xl font-bold tabular-nums">
                  {formatNumber(stats.creditsAvailable)}
                </p>
                <p className="text-xs text-accent-foreground/80">creditos email_send</p>
              </div>
            </div>

            {/* Pack cards grid */}
            <h2 className="text-lg font-semibold text-foreground">Selecciona un Pack</h2>

            <div className="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {EMAIL_PACKS.map((pack) => (
                <div
                  key={pack.id}
                  className={`relative flex flex-col rounded-xl bg-card p-6 text-center shadow-sm shadow-black/[0.02] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-lg ${
                    pack.popular
                      ? 'border-2 border-primary'
                      : 'border border-border'
                  }`}
                >
                  {pack.popular && (
                    <Badge
                      variant="primary"
                      className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground shadow-sm"
                    >
                      <OfferIcon className="size-3.5" aria-hidden />
                      Mas Popular
                    </Badge>
                  )}

                  <span
                    className={`mx-auto mb-3 flex size-14 items-center justify-center rounded-full ${
                      pack.popular
                        ? 'bg-primary/12 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Envelope className="size-7" aria-hidden />
                  </span>

                  <p className="text-base font-semibold text-foreground">{pack.name}</p>

                  <p className="my-2 text-3xl font-bold tracking-tight text-primary">
                    {formatCurrency(pack.price)}
                  </p>

                  <p className="text-sm text-muted-foreground">
                    {formatNumber(pack.emailCount)} emails
                  </p>

                  <div className="mb-4 mt-1 flex justify-center">
                    <Badge variant="neutral">
                      {formatPricePerEmail(pack.pricePerEmail)} / email
                    </Badge>
                  </div>

                  <Button
                    variant={pack.popular ? 'primary' : 'outline'}
                    size="sm"
                    className="mt-auto w-full"
                    onClick={() => handlePurchaseClick(pack)}
                  >
                    <ShoppingCart className="size-4" aria-hidden />
                    Comprar
                  </Button>
                </div>
              ))}
            </div>

            {/* Empty state when no credits at all */}
            {stats.creditsAvailable === 0 && stats.emailsSentThisMonth === 0 && (
              <div className="rounded-xl border border-border bg-muted/40 p-6 text-center">
                <Envelope className="mx-auto mb-2 size-12 text-muted-foreground" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  Aun no tienes creditos de envio. Compra un pack para comenzar a enviar
                  campanas de email marketing.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirmation Modal */}
      <Dialog
        open={confirmModalOpen}
        onOpenChange={(open) => {
          if (!open && !processingPurchase) setConfirmModalOpen(false)
        }}
      >
        <DialogContent className="max-w-md" hideClose={processingPurchase}>
          <DialogHeader>
            <DialogTitle>Confirmar Compra</DialogTitle>
          </DialogHeader>

          {purchasingPack && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Pack</span>
                <span className="text-sm font-semibold text-foreground">
                  {purchasingPack.name}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Cantidad de emails</span>
                <span className="text-sm font-semibold text-foreground">
                  {formatNumber(purchasingPack.emailCount)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Precio por email</span>
                <span className="text-sm font-semibold text-foreground">
                  {formatPricePerEmail(purchasingPack.pricePerEmail)}
                </span>
              </div>

              <div className="h-px bg-border" />

              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-foreground">Total</span>
                <span className="text-base font-semibold text-primary">
                  {formatCurrency(purchasingPack.price)}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setConfirmModalOpen(false)}
              disabled={processingPurchase}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="w-full sm:w-auto"
              loading={processingPurchase}
              disabled={processingPurchase}
              onClick={handleConfirmPurchase}
            >
              {!processingPurchase && <CheckCircle className="size-4" aria-hidden />}
              {processingPurchase ? 'Procesando...' : 'Confirmar Compra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
