import { useState, useEffect, useCallback, useRef } from 'react'
// [Fase2·G] Conservados como MUI Joy por indicación: no hay equivalente Radix
// para los indicadores de progreso del design system (regla 3).
import { CircularProgress, LinearProgress } from '@mui/joy'
import {
  Coins,
  ArrowClockwise,
  X,
  TrendUp,
  Lightning,
  Database,
  CurrencyDollar,
  ShoppingCart,
  WarningCircle,
} from '@phosphor-icons/react'
import SubplanModal from '../components/SubplanModal'
import { toast } from 'react-toastify'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// --- Types ---
interface CostReport {
  totalCostMonth: number
  totalTokens: number
  cacheHitRate: number
  costPerInteraction: number
  costByModel: CostByModel[]
  dailyTrend: DailyTrend[]
}

interface CostByModel {
  name: string
  cost: number
  color?: string
}

interface DailyTrend {
  date: string
  cost: number
}

interface CacheStats {
  hitRate: number
  totalHits: number
  totalMisses: number
}

interface CreditBalance {
  id: number
  creditType: string
  balance: number
  totalAdded: number
  totalConsumed: number
  expiresAt: string | null
  status: 'active' | 'expired' | 'depleted'
}

interface CreditQuota {
  creditType: string
  usedCredits: number
  totalCredits: number
  resetAt: string | null
}

type Period = '7d' | '30d' | '90d'

// Colores de data-viz (recharts requiere valores literales; no son superficies del tema).
const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#14b8a6']

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  active: { label: 'Activo', variant: 'success' },
  expired: { label: 'Expirado', variant: 'destructive' },
  depleted: { label: 'Agotado', variant: 'warning' },
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    })
  } catch { return dateStr }
}

// Color Joy para LinearProgress (conservado como MUI).
const getQuotaColor = (pct: number): 'success' | 'warning' | 'danger' => {
  if (pct > 85) return 'danger'
  if (pct >= 60) return 'warning'
  return 'success'
}

// Mapea el color Joy de la cuota a variante del Badge del design system.
const quotaBadgeVariant = (color: 'success' | 'warning' | 'danger'): BadgeProps['variant'] =>
  color === 'danger' ? 'destructive' : color

// --- Pagina Principal ---
export default function AICredits() {
  const [period, setPeriod] = useState<Period>('30d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [costReport, setCostReport] = useState<CostReport | null>(null)
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [balances, setBalances] = useState<CreditBalance[]>([])
  const [quotas, setQuotas] = useState<CreditQuota[]>([])

  // Modal de compra de subplanes
  const [subplanModalOpen, setSubplanModalOpen] = useState(false)
  const [tokenInfo, setTokenInfo] = useState<{ tokenBalance: number; activeSubplan: { name: string } | null; activeSubplanId: number | null } | null>(null)
  const paypalCaptureAttempted = useRef(false)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      devLog('[AICredits] Cargando datos para periodo:', period)

      const [reportResult, cacheResult, balancesResult, quotasResult, tokenInfoResult] = await Promise.allSettled([
        api.get<CostReport>(`/ai/costs/report?period=${period}`),
        api.get<CacheStats>('/ai/costs/cache-stats'),
        api.get<CreditBalance[]>('/ai/credits/balances'),
        api.get<CreditQuota[]>('/ai/credits/quotas'),
        api.get<{ balance: number; subplanName?: string }>('/ai/subplan-purchase/token-info'),
      ])

      // Cargar info de tokens
      if (tokenInfoResult.status === 'fulfilled') {
        setTokenInfo(tokenInfoResult.value.data as any)
      }

      if (reportResult.status === 'fulfilled') {
        const raw = reportResult.value.data
        const report = (raw as unknown as { data?: CostReport }).data ?? (raw as unknown as CostReport)
        setCostReport(report)
      } else {
        devError('[AICredits] Error al cargar reporte:', reportResult.reason)
      }

      if (cacheResult.status === 'fulfilled') {
        const raw = cacheResult.value.data
        setCacheStats((raw as unknown as { data?: CacheStats }).data ?? (raw as unknown as CacheStats))
      } else {
        devError('[AICredits] Error al cargar cache stats:', cacheResult.reason)
      }

      if (balancesResult.status === 'fulfilled') {
        const raw = balancesResult.value.data
        const rawArr: any[] = (raw as unknown as { data?: any[] }).data ?? (raw as unknown as any[]) ?? []
        // Mapear campos del modelo backend (totalCredits, usedCredits, resetAt, creditType obj)
        // a la interfaz frontend (balance, totalAdded, totalConsumed, expiresAt, creditType string)
        const mapped: CreditBalance[] = rawArr.map((b: any) => ({
          id: b.id,
          creditType: typeof b.creditType === 'object' && b.creditType?.name
            ? b.creditType.name
            : (b.creditType ?? `Tipo #${b.creditTypeId ?? b.id}`),
          balance: b.balance ?? (Number(b.totalCredits ?? 0) - Number(b.usedCredits ?? 0)),
          totalAdded: b.totalAdded ?? Number(b.totalCredits ?? 0),
          totalConsumed: b.totalConsumed ?? Number(b.usedCredits ?? 0),
          expiresAt: b.expiresAt ?? b.resetAt ?? null,
          status: b.status ?? (
            Number(b.usedCredits ?? 0) >= Number(b.totalCredits ?? 0)
              ? 'depleted'
              : 'active'
          ),
        }))
        setBalances(mapped)
      } else {
        devError('[AICredits] Error al cargar balances:', balancesResult.reason)
      }

      if (quotasResult.status === 'fulfilled') {
        const raw = quotasResult.value.data
        const rawQuotas: any[] = (raw as unknown as { data?: any[] }).data ?? (raw as unknown as any[]) ?? []
        // Mapear creditType objeto a string si viene como asociación Sequelize
        const mappedQuotas: CreditQuota[] = rawQuotas.map((q: any) => ({
          creditType: typeof q.creditType === 'object' && q.creditType?.name
            ? q.creditType.name
            : (q.creditType ?? `Tipo #${q.creditTypeId ?? q.id}`),
          usedCredits: Number(q.usedCredits ?? 0),
          totalCredits: Number(q.totalCredits ?? 0),
          resetAt: q.resetAt ?? null,
        }))
        setQuotas(mappedQuotas)
      } else {
        devError('[AICredits] Error al cargar cuotas:', quotasResult.reason)
      }

      const allFailed = [reportResult, cacheResult, balancesResult, quotasResult]
        .every((r) => r.status === 'rejected')
      if (allFailed) setError('No se pudo cargar ninguna fuente de datos. Intenta de nuevo.')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      devError('[AICredits] Error general:', err)
      setError(e.response?.data?.message || 'Error inesperado al cargar los datos')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (paypalCaptureAttempted.current) return

    const params = new URLSearchParams(window.location.search)
    const paypalSubplan = params.get('paypalSubplan')
    const orderID = params.get('token')

    const cleanPaypalParams = () => {
      const url = new URL(window.location.href)
      url.searchParams.delete('paypalSubplan')
      url.searchParams.delete('token')
      url.searchParams.delete('PayerID')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }

    if (paypalSubplan === 'cancel') {
      paypalCaptureAttempted.current = true
      toast.info('Pago PayPal cancelado')
      cleanPaypalParams()
      return
    }

    if (paypalSubplan !== 'success' || !orderID) return

    paypalCaptureAttempted.current = true

    ;(async () => {
      try {
        setLoading(true)
        const { data } = await api.post('/ai/subplan-purchase/paypal/capture', { orderID })
        toast.success(data?.message || 'Pago PayPal confirmado. Tokens acreditados.')
        await fetchData()
      } catch (err: any) {
        devError('[AICredits] Error capturando PayPal:', err)
        toast.error(err.response?.data?.error || 'No se pudo confirmar el pago PayPal')
      } finally {
        cleanPaypalParams()
        setLoading(false)
      }
    })()
  }, [fetchData])

  // Pie data con colores asignados
  const pieData = (costReport?.costByModel ?? []).map((item, idx) => ({
    ...item,
    color: item.color ?? PIE_COLORS[idx % PIE_COLORS.length],
  }))

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <CircularProgress size="lg" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Coins className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Créditos y Costos de IA
              </h1>
              <p className="text-sm text-muted-foreground">
                Monitoreo de consumo, costos y cuotas de créditos por tipo
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setSubplanModalOpen(true)}>
              <ShoppingCart className="size-4" aria-hidden />
              Comprar Tokens
            </Button>
            <Select value={period} onValueChange={(val) => setPeriod(val as Period)}>
              <SelectTrigger className="h-9 w-[120px]" aria-label="Periodo de análisis">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 días</SelectItem>
                <SelectItem value="30d">30 días</SelectItem>
                <SelectItem value="90d">90 días</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <ArrowClockwise className="size-4" aria-hidden />
              Actualizar
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-text"
          >
            <div className="flex items-center gap-2">
              <WarningCircle className="size-5 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
            <button
              type="button"
              aria-label="Cerrar alerta"
              onClick={() => setError(null)}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-destructive-text transition-colors hover:bg-destructive/15"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* Seccion 1: Stat Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CurrencyDollar className="size-[18px]" aria-hidden />
              <span className="text-sm">Costo Mensual</span>
            </div>
            <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
              ${(costReport?.totalCostMonth ?? 0).toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Lightning className="size-[18px]" aria-hidden />
              <span className="text-sm">Tokens Utilizados</span>
            </div>
            <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
              {(costReport?.totalTokens ?? 0).toLocaleString('es-ES')}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Database className="size-[18px]" aria-hidden />
              <span className="text-sm">Cache Hit Rate</span>
            </div>
            <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
              {((cacheStats?.hitRate ?? costReport?.cacheHitRate ?? 0) * 100).toFixed(1)}%
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendUp className="size-[18px]" aria-hidden />
              <span className="text-sm">Costo por Interacción</span>
            </div>
            <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
              ${(costReport?.costPerInteraction ?? 0).toFixed(4)}
            </p>
          </div>
        </div>

        {/* Seccion 2: Graficos */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* PieChart - Costo por modelo */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] lg:col-span-5">
            <h2 className="mb-4 text-base font-semibold text-foreground">Costo por Modelo</h2>
            {pieData.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                Sin datos de modelos
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    dataKey="cost"
                    nameKey="name"
                    labelLine={false}
                    label={(props: unknown) => {
                      const p = props as { name: unknown; percent: number }
                      const name = String(p.name ?? '')
                      return `${name.split('-')[0]} ${((p.percent ?? 0) * 100).toFixed(0)}%`
                    }}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: unknown) => [`$${(value as number).toFixed(4)}`, 'Costo']}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* AreaChart - Tendencia diaria */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] lg:col-span-7">
            <h2 className="mb-4 text-base font-semibold text-foreground">Tendencia de Costo Diario</h2>
            {(costReport?.dailyTrend ?? []).length === 0 ? (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                Sin datos de tendencia
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={costReport?.dailyTrend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: unknown) => [`$${(value as number).toFixed(4)}`, 'Costo']}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="cost"
                    stroke="#6366f1"
                    fill="#6366f133"
                    name="Costo (USD)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Seccion 3: Cuota por Tipo de Credito */}
        {quotas.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
              <Coins className="size-5" aria-hidden />
              Cuota por Tipo de Crédito
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {quotas.map((quota) => {
                const pct = quota.totalCredits > 0
                  ? (quota.usedCredits / quota.totalCredits) * 100
                  : 0
                const color = getQuotaColor(pct)
                return (
                  <div key={quota.creditType} className="rounded-lg border border-border p-4">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{quota.creditType}</span>
                      <Badge variant={quotaBadgeVariant(color)}>{pct.toFixed(1)}%</Badge>
                    </div>
                    <LinearProgress
                      determinate
                      value={Math.min(pct, 100)}
                      color={color}
                      sx={{ my: 1 }}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {(quota.usedCredits ?? 0).toLocaleString('es-ES')} / {(quota.totalCredits ?? 0).toLocaleString('es-ES')}
                      </span>
                      {quota.resetAt && (
                        <span className="text-xs text-muted-foreground">
                          Reset: {formatDate(quota.resetAt)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Seccion 4: Tabla de Balances */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
            <CurrencyDollar className="size-5" aria-hidden />
            Balances de Créditos
          </h2>
          {balances.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No hay balances de créditos registrados
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Tipo de Crédito
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Balance
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Total Agregado
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Total Consumido
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Expiración
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {balances.map((bal) => {
                    const statusConf = STATUS_CONFIG[bal.status] ?? { label: bal.status, variant: 'neutral' as const }
                    return (
                      <tr key={bal.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3 font-medium text-foreground">{bal.creditType}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-success-text">
                          {(bal.balance ?? 0).toLocaleString('es-ES')}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {(bal.totalAdded ?? 0).toLocaleString('es-ES')}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {(bal.totalConsumed ?? 0).toLocaleString('es-ES')}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {formatDate(bal.expiresAt)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusConf.variant}>{statusConf.label}</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal de compra de subplanes */}
      <SubplanModal
        open={subplanModalOpen}
        onClose={() => setSubplanModalOpen(false)}
        onSuccess={() => {
          setSubplanModalOpen(false)
          fetchData()
        }}
        currentTokenInfo={tokenInfo as any}
      />
    </div>
  )
}
