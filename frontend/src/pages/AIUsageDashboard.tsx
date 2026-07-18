import { useState, useEffect } from 'react'
// [conservado como MUI] No hay equivalente Radix para estos indicadores de progreso.
import { CircularProgress, LinearProgress } from '@mui/joy'
import {
  Lightning, CreditCard, CurrencyDollar, Pulse, ChartLineUp
} from '@phosphor-icons/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }

interface UsageByAgent {
  source: string
  tokens: number
  credits: number
  cost: number
}

interface UsageData {
  period: string
  dateRange: { start: string; end: string }
  tokensConsumed: number
  creditsUsed: number
  costThisMonth: number
  creditsRemaining: number
  usageByAgent: UsageByAgent[]
  transactionCount: number
}

type KpiTone = 'primary' | 'warning' | 'destructive' | 'success'

const kpiToneClasses: Record<KpiTone, string> = {
  primary: 'bg-primary/10 text-primary',
  warning: 'bg-warning/16 text-warning-text',
  destructive: 'bg-destructive/12 text-destructive-text',
  success: 'bg-success/14 text-success-text',
}

const KPICard = ({
  title, value, icon, tone, subtitle
}: {
  title: string
  value: string | number
  icon: React.ReactNode
  tone: KpiTone
  subtitle?: string
}) => (
  <div className="h-full rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="mb-0.5 text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
          {value}
        </p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <span
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-lg',
          kpiToneClasses[tone],
        )}
        aria-hidden
      >
        {icon}
      </span>
    </div>
  </div>
)

export default function AIUsageDashboard() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<string>('monthly')

  const fetchDashboard = async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await api.get(`/ai-costs/company/summary?period=${period}`)

      if (res.data.success) {
        setData(res.data.data)
      } else {
        setError('Error al cargar datos')
      }
    } catch (err: any) {
      devLog('Error fetching AI usage:', err)
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
      <div
        role="alert"
        className="m-6 rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text"
      >
        {error}
      </div>
    )
  }

  const { tokensConsumed, creditsUsed, costThisMonth, creditsRemaining, usageByAgent, transactionCount } = data || {}

  // Calcular porcentaje de uso
  const totalCredits = (creditsUsed || 0) + (creditsRemaining || 0)
  const usagePercent = totalCredits > 0 ? ((creditsUsed || 0) / totalCredits) * 100 : 0

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
                Mi Consumo de IA
              </h1>
              <p className="text-sm text-muted-foreground">
                Resumen de uso de tokens, créditos y costos
              </p>
            </div>
          </div>
          <Select value={period} onValueChange={(v) => v && setPeriod(v)}>
            <SelectTrigger className="w-[170px]" aria-label="Período">
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
            title="Tokens Consumidos"
            value={(tokensConsumed || 0).toLocaleString()}
            icon={<Lightning className="size-6" weight="fill" aria-hidden />}
            tone="primary"
            subtitle={`${transactionCount || 0} transacciones`}
          />
          <KPICard
            title="Créditos Usados"
            value={creditsUsed?.toLocaleString() || 0}
            icon={<CreditCard className="size-6" weight="fill" aria-hidden />}
            tone="warning"
          />
          <KPICard
            title="Costo Este Mes"
            value={`$${(costThisMonth || 0).toFixed(2)}`}
            icon={<CurrencyDollar className="size-6" weight="fill" aria-hidden />}
            tone="destructive"
          />
          <KPICard
            title="Créditos Restantes"
            value={creditsRemaining?.toLocaleString() || 0}
            icon={<Pulse className="size-6" weight="fill" aria-hidden />}
            tone="success"
            subtitle={`${usagePercent.toFixed(1)}% usado`}
          />
        </div>

        {/* Uso de Créditos */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Uso de Créditos</h2>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Progreso</span>
            <span className="text-sm tabular-nums text-foreground">{usagePercent.toFixed(1)}%</span>
          </div>
          {/* [conservado como MUI] LinearProgress sin equivalente Radix */}
          <LinearProgress
            value={usagePercent}
            color={usagePercent > 80 ? 'danger' : usagePercent > 50 ? 'warning' : 'success'}
            sx={{ height: 8, borderRadius: 4 }}
          />
        </div>

        {/* Uso por Agente */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">Uso por Agente</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Agente/Fuente
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Tokens
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Créditos
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Costo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(usageByAgent || []).map((agent) => (
                  <tr key={agent.source} className="transition-colors hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <Badge variant="neutral">{agent.source}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {agent.tokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {agent.credits.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-destructive-text">
                      ${agent.cost.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {(!usageByAgent || usageByAgent.length === 0) && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                      No hay datos de uso para este período
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
