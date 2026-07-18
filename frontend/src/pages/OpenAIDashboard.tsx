import { useState, useEffect, useCallback } from 'react'
// [Fase2·G] Conservados como MUI Joy a propósito: CircularProgress / LinearProgress
// (no hay equivalente en el design system Tailwind/Radix todavía).
import { LinearProgress, CircularProgress } from '@mui/joy'
import {
  Brain,
  TrendUp,
  Gauge,
  CurrencyDollar,
  ArrowClockwise,
  Wallet,
  ShoppingCart,
} from '@phosphor-icons/react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import SubplanModal from '../components/SubplanModal'

interface Stats {
  totalTokensMonth: number
  totalTokensAll: number
  totalCostMonth: number
  totalCostAll: number
  activeModels: number
  avgCostPerRequest: number
  popularModel: string
}

interface ModelUsage {
  name: string
  value: number
  tokens: number
  cost: number
  color: string
}

interface TokenTrend {
  month: string
  tokens: number
  cost: number
}

interface RecentActivity {
  id: number
  month: string
  model: string
  tokens_month: number
  cost_usd_month: number
  updated_at: string
}

interface DashboardData {
  stats: Stats
  modelUsage: ModelUsage[]
  tokenTrends: TokenTrend[]
  recentActivity: RecentActivity[]
}

// Interface para consumo de tokens por subplan
interface SubplanConsumption {
  id: number
  name: string
  tokens: number
  tokensConsumed: number
}

type BalanceTone = 'neutral' | 'danger' | 'warning' | 'success'

// [a11y] Texto semántico con los tokens *-text; los tokens --success/--warning/
// --destructive son de superficie y no alcanzan 4.5:1 como color de texto.
const TONE_TEXT: Record<BalanceTone, string> = {
  neutral: 'text-foreground',
  danger: 'text-destructive-text',
  warning: 'text-warning-text',
  success: 'text-success-text',
}

// Estilo compartido de los tooltips de recharts (tokens, no colores fijos).
const CHART_TOOLTIP_STYLE = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--popover-foreground)',
  fontSize: 12,
} as const

const CHART_AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 12 } as const

export default function OpenAIDashboard() {
  const { user } = useAuth()
  const [timeRange, setTimeRange] = useState('30d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subplans, setSubplans] = useState<SubplanConsumption[]>([])

  // State para balance de tokens y modal de compra
  const [tokenInfo, setTokenInfo] = useState<{
    tokenBalance: number
    activeSubplan: any
    activeSubplanId: number | null
  } | null>(null)
  const [subplanModalOpen, setSubplanModalOpen] = useState(false)

  // Balance UNIFICADO (AICreditBalance — sistema nuevo).
  const [unifiedSummary, setUnifiedSummary] = useState<{
    totalCredits: number
    totalUsed: number
    totalRemaining: number
    byKey: Record<string, { totalCredits: number; usedCredits: number; remaining: number; name: string }>
  } | null>(null)

  // Verificar si el usuario es superadmin
  const isSuperAdmin = user?.profile === 'super' || user?.super === true

  const [data, setData] = useState<DashboardData>({
    stats: {
      totalTokensMonth: 0,
      totalTokensAll: 0,
      totalCostMonth: 0,
      totalCostAll: 0,
      activeModels: 0,
      avgCostPerRequest: 0,
      popularModel: 'N/A',
    },
    modelUsage: [],
    tokenTrends: [],
    recentActivity: [],
  })

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Cargar info de tokens desde Company (LEGACY — Company.aiTokenBalance)
      try {
        const companyRes = await api.get('/companies/find')
        const company = companyRes.data
        setTokenInfo({
          tokenBalance: Number(company.aiTokenBalance || 0),
          activeSubplan: company.activeAISubplan || null,
          activeSubplanId: company.activeAISubplanId || null
        })
      } catch (tokenErr) {
        console.error('Error fetching company info:', tokenErr)
        // No bloquear si falla la carga de company info
      }

      // Cargar resumen UNIFICADO (AICreditBalance — sistema actual de cobro IA).
      try {
        const summaryRes = await api.get('/ai/credits/summary')
        setUnifiedSummary(summaryRes.data)
      } catch (sumErr) {
        console.error('Error fetching unified credits summary:', sumErr)
      }

      // Solo cargar subplans si el usuario es superadmin
      if (isSuperAdmin) {
        const [statsRes, subplansRes] = await Promise.all([
          api.get('/openai/dashboard-stats', { params: { timeRange } }),
          api.get('/ai/subplans')
        ])
        setData(statsRes.data)
        setSubplans(subplansRes.data)
      } else {
        // Para usuarios no superadmin, solo cargar stats del dashboard
        const statsRes = await api.get('/openai/dashboard-stats', { params: { timeRange } })
        setData(statsRes.data)
        setSubplans([]) // No hay subplans para usuarios no superadmin
      }
    } catch (err: any) {
      console.error('Error fetching dashboard stats:', err)
      setError(err.response?.data?.error || 'Error al cargar los datos')
    } finally {
      setLoading(false)
    }
  }, [timeRange, isSuperAdmin])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('es-ES').format(num)
  }

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(num)
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateStr
    }
  }

  // Calcular color semáforo basado en porcentaje de tokens restantes
  const getTokenBalanceColor = (): BalanceTone => {
    if (!tokenInfo?.activeSubplan) return 'neutral'
    const totalTokens = Number(tokenInfo.activeSubplan.tokens || 0)
    const currentBalance = Number(tokenInfo.tokenBalance || 0)
    if (totalTokens === 0) return 'neutral'
    const percentage = (currentBalance / totalTokens) * 100
    if (percentage < 5) return 'danger' // Rojo: menos del 5%
    if (percentage < 30) return 'warning' // Amarillo: menos del 30%
    return 'success' // Verde: más del 30%
  }

  // Calcular porcentaje de tokens restantes
  const getTokenPercentage = () => {
    if (!tokenInfo?.activeSubplan) return 0
    const totalTokens = Number(tokenInfo.activeSubplan.tokens || 0)
    const currentBalance = Number(tokenInfo.tokenBalance || 0)
    if (totalTokens === 0) return 0
    return (currentBalance / totalTokens) * 100
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <CircularProgress size="lg" />
      </div>
    )
  }

  const balanceTone = getTokenBalanceColor()

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Brain className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Dashboard OpenAI
              </h1>
              <p className="text-sm text-muted-foreground">
                Metricas de uso, tokens y costos de modelos de IA
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[190px]" aria-label="Rango de tiempo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Ultimas 24 horas</SelectItem>
                <SelectItem value="7d">Ultimos 7 dias</SelectItem>
                <SelectItem value="30d">Ultimos 30 dias</SelectItem>
                <SelectItem value="90d">Ultimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <ArrowClockwise className="size-4" aria-hidden />
              Actualizar
            </Button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-medium text-destructive-text"
          >
            {error}
          </div>
        )}

        {/* KPIs Principales */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Tokens (Este mes)</p>
                <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  {formatNumber(data.stats.totalTokensMonth)}
                </p>
              </div>
              <Brain className="size-10 shrink-0 text-primary/30" weight="fill" aria-hidden />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Total Tokens (Historico)</p>
                <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  {formatNumber(data.stats.totalTokensAll)}
                </p>
              </div>
              <TrendUp className="size-10 shrink-0 text-success-text/30" weight="fill" aria-hidden />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Costo (Este mes)</p>
                <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  {formatCurrency(data.stats.totalCostMonth)}
                </p>
              </div>
              <CurrencyDollar className="size-10 shrink-0 text-warning-text/30" weight="fill" aria-hidden />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Costo Total (Historico)</p>
                <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  {formatCurrency(data.stats.totalCostAll)}
                </p>
              </div>
              <Gauge className="size-10 shrink-0 text-brand-cyan/40" weight="fill" aria-hidden />
            </div>
          </div>
        </div>

        {/* Metricas Adicionales */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Modelos Activos</p>
            <p className="mt-1 text-xl font-semibold tracking-tight text-foreground">
              {data.stats.activeModels} modelos
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Configurados y en uso</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Costo Promedio / Request</p>
            <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums text-foreground">
              {formatCurrency(data.stats.avgCostPerRequest)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Estimado por solicitud</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Modelo Mas Usado</p>
            <p className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground">
              {data.stats.popularModel}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Mayor cantidad de tokens</p>
          </div>
        </div>

        {/* Card de Balance de Tokens IA */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-1 items-center gap-4">
              <Wallet className={`size-10 shrink-0 ${TONE_TEXT[balanceTone]}`} weight="fill" aria-hidden />
              <div className="flex-1">
                <h2 className="text-base font-semibold text-foreground">Balance de Tokens IA</h2>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className={`text-2xl font-semibold tracking-tight tabular-nums ${TONE_TEXT[balanceTone]}`}>
                    {formatNumber(tokenInfo?.tokenBalance || 0)}
                  </span>
                  <span className="text-sm text-muted-foreground">tokens disponibles</span>
                </div>
                {tokenInfo?.activeSubplan && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <div>
                      <Badge variant="primary">
                        Plan activo: {tokenInfo.activeSubplan.name} ({formatNumber(tokenInfo.activeSubplan.tokens)} tokens)
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <LinearProgress
                        determinate
                        value={getTokenPercentage()}
                        color={balanceTone}
                        sx={{ flex: 1, height: 8 }}
                      />
                      <span className={`min-w-[45px] text-xs tabular-nums ${TONE_TEXT[balanceTone]}`}>
                        {getTokenPercentage().toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}
                {!tokenInfo?.activeSubplan && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    No tienes un plan activo. Compra tokens para comenzar.
                  </p>
                )}
              </div>
            </div>
            <Button size="lg" onClick={() => setSubplanModalOpen(true)}>
              <ShoppingCart className="size-5" aria-hidden />
              {tokenInfo?.activeSubplan ? 'Comprar Más Tokens' : 'Comprar Tokens'}
            </Button>
          </div>
        </div>

        {/* Card de Créditos UNIFICADOS (sistema actual de cobro IA) */}
        {unifiedSummary && (
          <div className="rounded-xl border border-success/40 bg-success/[0.06] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1">
                <h2 className="text-base font-semibold text-foreground">
                  Créditos IA disponibles (sistema unificado)
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Balance real cobrado por todas las acciones IA: chat, classification,
                  agent_execution, flow_execution, image, video, audio, vision, etc.
                </p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tracking-tight tabular-nums text-success-text">
                    {formatNumber(unifiedSummary.totalRemaining)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    de {formatNumber(unifiedSummary.totalCredits)} créditos
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Usados: {formatNumber(unifiedSummary.totalUsed)} créditos
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(unifiedSummary.byKey)
                    .filter(([, v]) => v.totalCredits > 0)
                    .slice(0, 6)
                    .map(([key, v]) => (
                      <Badge key={key} variant="primary">
                        {v.name}: {formatNumber(v.remaining)} / {formatNumber(v.totalCredits)}
                      </Badge>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Consumo de Tokens por Subplan */}
        {subplans.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">
                Consumo de Tokens por Subplan
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Subplan
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Tokens Totales
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Usados
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Restantes
                    </th>
                    <th className="w-[200px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Progreso
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {subplans.map((subplan) => {
                    const remaining = Number(subplan.tokens) - Number(subplan.tokensConsumed || 0)
                    const usedPercent = Number(subplan.tokens) > 0
                      ? (Number(subplan.tokensConsumed || 0) / Number(subplan.tokens)) * 100
                      : 0
                    return (
                      <tr key={subplan.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3 font-medium text-foreground">{subplan.name}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {formatNumber(Number(subplan.tokens))}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {formatNumber(Number(subplan.tokensConsumed || 0))}
                        </td>
                        <td
                          className={`px-4 py-3 text-right tabular-nums font-medium ${
                            remaining > 0 ? 'text-success-text' : 'text-destructive-text'
                          }`}
                        >
                          {formatNumber(remaining)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <LinearProgress
                              determinate
                              value={Math.min(usedPercent, 100)}
                              color={usedPercent > 90 ? 'danger' : usedPercent > 70 ? 'warning' : 'success'}
                              sx={{ flex: 1 }}
                            />
                            <span className="min-w-[40px] text-xs tabular-nums text-muted-foreground">
                              {usedPercent.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Graficos */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Tendencia de Tokens por Mes */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] lg:col-span-2">
            <h2 className="mb-4 text-base font-semibold text-foreground">Uso de Tokens por Mes</h2>
            {data.tokenTrends.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.tokenTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={CHART_AXIS_TICK} stroke="var(--border)" />
                  <YAxis tick={CHART_AXIS_TICK} stroke="var(--border)" />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={((value: number) => formatNumber(value)) as any}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="tokens"
                    stroke="var(--success)"
                    fill="var(--success)"
                    name="Tokens"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center">
                <p className="text-sm text-muted-foreground">Sin datos de tendencia disponibles</p>
              </div>
            )}
          </div>

          {/* Distribucion por Modelo */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <h2 className="mb-4 text-base font-semibold text-foreground">Distribucion por Modelo</h2>
            {data.modelUsage.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.modelUsage as any}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(props: any) => `${(props.name || '').split('-')[0]} ${props.value}%`}
                    outerRadius={80}
                    fill="var(--primary)"
                    dataKey="value"
                  >
                    {data.modelUsage.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={((value: number, name: string) => [`${value}%`, name]) as any}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center">
                <p className="text-sm text-muted-foreground">Sin datos de modelos disponibles</p>
              </div>
            )}
          </div>

          {/* Tendencia de Costos */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] lg:col-span-3">
            <h2 className="mb-4 text-base font-semibold text-foreground">Costos por Mes</h2>
            {data.tokenTrends.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.tokenTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={CHART_AXIS_TICK} stroke="var(--border)" />
                  <YAxis tick={CHART_AXIS_TICK} stroke="var(--border)" />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={((value: number) => formatCurrency(value)) as any}
                  />
                  <Legend />
                  <Bar dataKey="cost" fill="var(--warning)" name="Costo (USD)" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center">
                <p className="text-sm text-muted-foreground">Sin datos de costos disponibles</p>
              </div>
            )}
          </div>
        </div>

        {/* Detalle por Modelo */}
        {data.modelUsage.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">Detalle por Modelo</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Modelo
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Tokens
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Costo USD
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      % del Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.modelUsage.map((model) => (
                    <tr key={model.name} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="size-3 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                            style={{ backgroundColor: model.color }}
                            aria-hidden
                          />
                          <span className="font-medium text-foreground">{model.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatNumber(model.tokens)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatCurrency(model.cost)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <LinearProgress determinate value={model.value} sx={{ width: 60 }} />
                          <span className="tabular-nums text-muted-foreground">{model.value}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Actividad Reciente */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold text-foreground">Actividad Reciente</h2>
          </div>
          {data.recentActivity.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="w-[100px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Mes
                    </th>
                    <th className="w-[180px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Modelo
                    </th>
                    <th className="w-[120px] whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Tokens
                    </th>
                    <th className="w-[120px] whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Costo USD
                    </th>
                    <th className="w-[180px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Ultima actualizacion
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.recentActivity.map((activity) => (
                    <tr key={activity.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <Badge variant="neutral">{activity.month}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{activity.model}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatNumber(activity.tokens_month)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatCurrency(activity.cost_usd_month)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {formatDate(activity.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No hay actividad registrada aun. Los tokens se registraran cuando la IA responda mensajes.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de compra de subplans */}
      <SubplanModal
        open={subplanModalOpen}
        onClose={() => {
          setSubplanModalOpen(false)
          fetchData() // Refrescar datos al cerrar
        }}
        currentTokenInfo={tokenInfo}
      />
    </div>
  )
}
