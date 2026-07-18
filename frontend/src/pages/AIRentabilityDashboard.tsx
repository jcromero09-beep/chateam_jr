import { useState, useEffect } from 'react'
import { CircularProgress } from '@mui/joy'
import {
  CurrencyDollar,
  TrendUp,
  TrendDown,
  ChartPie,
  ChartBar,
  ChartLineUp,
} from '@phosphor-icons/react'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }

interface CostSummary {
  period: string
  dateRange: { start: string; end: string }
  totalTokensBilled: number
  totalTokensCost: number
  totalCreditsUsed: number
  totalRevenue: number
  margin: number
  marginPercent: number
  transactionCount: number
}

interface TrendDay {
  date: string
  tokensBilled: number
  tokensCost: number
  creditsUsed: number
  revenue: number
  margin: number
}

interface DashboardData {
  summary: CostSummary
  trends: TrendDay[]
}

type KPITone = 'primary' | 'success' | 'destructive'

const toneStyles: Record<KPITone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/14 text-success-text',
  destructive: 'bg-destructive/12 text-destructive-text',
}

const KPICard = ({
  title, value, icon, tone, subtitle, trend
}: {
  title: string
  value: string | number
  icon: React.ReactNode
  tone: KPITone
  subtitle?: string
  trend?: 'up' | 'down' | 'neutral'
}) => (
  <div className="h-full rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
          {value}
        </p>
        {subtitle && (
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg',
          toneStyles[tone],
        )}
        aria-hidden
      >
        {icon}
      </span>
    </div>
    {trend && (
      <div className="mt-2 flex items-center gap-1">
        {trend === 'up' ? (
          <TrendUp className="size-4 text-success-text" aria-hidden />
        ) : trend === 'down' ? (
          <TrendDown className="size-4 text-destructive-text" aria-hidden />
        ) : null}
        <span
          className={cn(
            'text-xs',
            trend === 'up'
              ? 'text-success-text'
              : trend === 'down'
                ? 'text-destructive-text'
                : 'text-muted-foreground',
          )}
        >
          {subtitle}
        </span>
      </div>
    )}
  </div>
)

export default function AIRentabilityDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<string>('monthly')

  const fetchDashboard = async () => {
    try {
      setLoading(true)
      setError(null)

      const [summaryRes, trendsRes] = await Promise.all([
        api.get(`/ai-costs/summary?period=${period}`),
        api.get(`/ai-costs/trends?days=30`)
      ])

      if (summaryRes.data.success && trendsRes.data.success) {
        setData({
          summary: summaryRes.data.data,
          trends: trendsRes.data.data
        })
      } else {
        setError('Error al cargar datos')
      }
    } catch (err: any) {
      devLog('Error fetching AI costs:', err)
      setError(err.response?.data?.message || 'Error al cargar dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboard()
  }, [period])

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <CircularProgress />
      </div>
    )
  }

  if (error) {
    return (
      <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text">
        {error}
      </div>
    )
  }

  const { summary, trends } = data || { summary: {} as CostSummary, trends: [] }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ChartLineUp className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Rentabilidad IA
              </h1>
              <p className="text-sm text-muted-foreground">
                Costos, ingresos y margen del consumo de IA
              </p>
            </div>
          </div>
          <Select value={period} onValueChange={(v) => v && setPeriod(v)}>
            <SelectTrigger className="w-[180px]" aria-label="Periodo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Hoy</SelectItem>
              <SelectItem value="weekly">Última semana</SelectItem>
              <SelectItem value="monthly">Último mes</SelectItem>
              <SelectItem value="yearly">Último año</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            title="Tokens Facturados"
            value={summary.totalTokensBilled?.toLocaleString() || 0}
            icon={<ChartBar className="size-6" aria-hidden />}
            tone="primary"
            subtitle={`${summary.transactionCount || 0} transacciones`}
          />
          <KPICard
            title="Costo IA (USD)"
            value={`$${(summary.totalTokensCost || 0).toFixed(2)}`}
            icon={<CurrencyDollar className="size-6" aria-hidden />}
            tone="destructive"
          />
          <KPICard
            title="Ingresos (USD)"
            value={`$${(summary.totalRevenue || 0).toFixed(2)}`}
            icon={<TrendUp className="size-6" aria-hidden />}
            tone="success"
            subtitle="1 crédito = $0.01"
          />
          <KPICard
            title="Margen"
            value={`$${(summary.margin || 0).toFixed(2)}`}
            icon={<ChartPie className="size-6" aria-hidden />}
            tone={(summary.margin || 0) >= 0 ? 'success' : 'destructive'}
            subtitle={`${(summary.marginPercent || 0).toFixed(1)}%`}
            trend={(summary.margin || 0) >= 0 ? 'up' : 'down'}
          />
        </div>

        {/* Tendencias Diarias */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold text-foreground">Tendencias Diarias</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fecha</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tokens</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Costo</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ingresos</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(trends as TrendDay[]).slice(-10).map((day) => (
                  <tr key={day.date} className="transition-colors hover:bg-accent/40">
                    <td className="whitespace-nowrap px-4 py-3 text-foreground">{day.date}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{day.tokensBilled.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-destructive-text">${day.tokensCost.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-success-text">${day.revenue.toFixed(2)}</td>
                    <td className={cn('px-4 py-3 text-right tabular-nums', (day.margin || 0) >= 0 ? 'text-success-text' : 'text-destructive-text')}>
                      ${(day.margin || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
