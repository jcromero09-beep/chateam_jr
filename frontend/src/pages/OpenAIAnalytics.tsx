import { useState, useEffect, useCallback } from 'react'
import CircularProgress from '@mui/joy/CircularProgress'
import LinearProgress from '@mui/joy/LinearProgress'
import {
  ChartLineUp,
  TrendUp,
  TrendDown,
  CurrencyDollar,
  Gauge,
  DownloadSimple,
  ArrowClockwise,
  X,
  Cpu,
} from '@phosphor-icons/react'
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import api from '../services/api'

interface AnalyticsData {
  summary: {
    totalTokensMonth: number
    totalTokensAll: number
    totalCostMonth: number
    totalCostAll: number
    totalRequests: number
    avgCostPerRequest: number
    avgTokensPerRequest: number
    mostUsedModel: string
    costTrend: number // percentage change
  }
  byModel: Array<{
    model: string
    tokens: number
    cost: number
    requests: number
    percentage: number
    color: string
  }>
  byMonth: Array<{
    month: string
    tokens: number
    cost: number
    requests: number
  }>
  byModule: Array<{
    module: string
    tokens: number
    cost: number
    requests: number
    percentage: number
  }>
}

// Paleta categórica para data-viz (fallback cuando la API no envía `color`).
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658']

// Estilos de tooltip/ejes de recharts atados a los tokens del design system.
const chartTooltipStyle = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--popover-foreground)',
  fontSize: 12,
}
const AXIS_COLOR = 'var(--muted-foreground)'
const GRID_COLOR = 'var(--border)'

const modelColumns = ['Modelo', 'Tokens', 'Costo USD', 'Requests', '% del Total', 'Eficiencia']
const moduleColumns = ['Modulo', 'Tokens', 'Costo USD', 'Requests', '% del Total']

export default function OpenAIAnalytics() {
  const [timeRange, setTimeRange] = useState('30d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [data, setData] = useState<AnalyticsData>({
    summary: {
      totalTokensMonth: 0,
      totalTokensAll: 0,
      totalCostMonth: 0,
      totalCostAll: 0,
      totalRequests: 0,
      avgCostPerRequest: 0,
      avgTokensPerRequest: 0,
      mostUsedModel: 'N/A',
      costTrend: 0,
    },
    byModel: [],
    byMonth: [],
    byModule: [],
  })

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      console.log('[OpenAIAnalytics] Fetching analytics data...')
      const response = await api.get('/ai/analytics', {
        params: { timeRange }
      })
      console.log('[OpenAIAnalytics] Analytics loaded:', response.data)
      setData(response.data)
    } catch (err: any) {
      console.error('[OpenAIAnalytics] Error fetching analytics:', err)
      setError(err.response?.data?.error || 'Error al cargar analytics')
    } finally {
      setLoading(false)
    }
  }, [timeRange])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('es-ES').format(num)
  }

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(num)
  }

  const handleExport = async () => {
    try {
      console.log('[OpenAIAnalytics] Exporting analytics...')
      const csvContent = [
        'Modelo,Tokens,Costo USD,Requests,Porcentaje',
        ...data.byModel.map(m => `${m.model},${m.tokens},${m.cost},${m.requests},${m.percentage}%`)
      ].join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[OpenAIAnalytics] Error exporting:', err)
    }
  }

  const efficiency = (model: { cost: number; requests: number }) => {
    const ratio = model.cost / model.requests
    if (model.requests > 0 && ratio < 0.01) return { label: 'Excelente', variant: 'success' as const }
    if (ratio < 0.03) return { label: 'Buena', variant: 'warning' as const }
    return { label: 'Media', variant: 'destructive' as const }
  }

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
              <ChartLineUp className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Analytics de IA
              </h1>
              <p className="text-sm text-muted-foreground">
                Analisis detallado de costos y rendimiento por modelo
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[170px]" aria-label="Rango de tiempo">
                <SelectValue placeholder="Rango de tiempo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Ultimos 7 dias</SelectItem>
                <SelectItem value="30d">Ultimos 30 dias</SelectItem>
                <SelectItem value="90d">Ultimos 90 dias</SelectItem>
                <SelectItem value="1y">Ultimo ano</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchAnalytics}>
              <ArrowClockwise className="size-4" aria-hidden />
              Actualizar
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <DownloadSimple className="size-4" aria-hidden />
              Exportar
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text"
          >
            <span>{error}</span>
            <button
              type="button"
              aria-label="Cerrar aviso"
              title="Cerrar aviso"
              onClick={() => setError(null)}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-destructive-text transition-colors hover:bg-destructive/16"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* KPIs de Costos */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Costo Total (Este Mes)</p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                  {formatCurrency(data.summary.totalCostMonth)}
                </p>
                {data.summary.costTrend !== 0 && (
                  <Badge
                    variant={data.summary.costTrend > 0 ? 'warning' : 'success'}
                    className="mt-2"
                  >
                    {data.summary.costTrend > 0 ? (
                      <TrendUp className="size-3.5" aria-hidden />
                    ) : (
                      <TrendDown className="size-3.5" aria-hidden />
                    )}
                    {data.summary.costTrend > 0 ? '+' : ''}
                    {data.summary.costTrend.toFixed(1)}%
                  </Badge>
                )}
              </div>
              <CurrencyDollar className="size-10 shrink-0 text-warning opacity-30" aria-hidden />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Costo Promedio/Request</p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                  {formatCurrency(data.summary.avgCostPerRequest)}
                </p>
              </div>
              <Gauge className="size-10 shrink-0 text-success opacity-30" aria-hidden />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Total Tokens (Este Mes)</p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                  {formatNumber(data.summary.totalTokensMonth)}
                </p>
              </div>
              <TrendUp className="size-10 shrink-0 text-primary opacity-30" aria-hidden />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Modelo Mas Usado</p>
                <p className="mt-1.5 truncate text-lg font-semibold tracking-tight text-foreground">
                  {data.summary.mostUsedModel}
                </p>
              </div>
              <Cpu className="size-10 shrink-0 text-brand-cyan opacity-30" aria-hidden />
            </div>
          </div>
        </div>

        {/* Distribucion de Costos */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] lg:col-span-2">
            <h2 className="mb-4 text-base font-semibold text-foreground">
              Tendencia de Costos por Mes
            </h2>
            {data.byMonth.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.byMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis dataKey="month" stroke={AXIS_COLOR} fontSize={12} />
                  <YAxis stroke={AXIS_COLOR} fontSize={12} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={((value: number) => formatCurrency(value)) as any}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="cost"
                    stroke="var(--success)"
                    fill="var(--success)"
                    fillOpacity={0.25}
                    name="Costo (USD)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                Sin datos de tendencia disponibles
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <h2 className="mb-4 text-base font-semibold text-foreground">
              Distribucion por Modelo
            </h2>
            {data.byModel.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={data.byModel}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(props: any) => `${(props.name || '').split('-')[0]} ${((props.percent || 0) * 100).toFixed(0)}%`}
                      outerRadius={70}
                      fill="#8884d8"
                      dataKey="cost"
                    >
                      {data.byModel.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={((value: number) => formatCurrency(value)) as any}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 space-y-2.5">
                  {data.byModel.map((model, index) => (
                    <div key={model.model}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: model.color || COLORS[index % COLORS.length] }}
                            aria-hidden
                          />
                          <span className="truncate text-sm text-foreground">{model.model}</span>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                          {formatCurrency(model.cost)}
                        </span>
                      </div>
                      <LinearProgress determinate value={model.percentage} />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                Sin datos de modelos disponibles
              </div>
            )}
          </div>
        </div>

        {/* Tendencia de Tokens */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <h2 className="mb-4 text-base font-semibold text-foreground">Uso de Tokens por Mes</h2>
          {data.byMonth.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.byMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis dataKey="month" stroke={AXIS_COLOR} fontSize={12} />
                <YAxis stroke={AXIS_COLOR} fontSize={12} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={((value: number) => formatNumber(value)) as any}
                />
                <Legend />
                <Bar dataKey="tokens" fill="var(--primary)" name="Tokens" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              Sin datos de tokens disponibles
            </div>
          )}
        </div>

        {/* Tabla de Rendimiento por Modelo */}
        {data.byModel.length > 0 && (
          <div className="rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <h2 className="border-b border-border px-5 py-4 text-base font-semibold text-foreground">
              Rendimiento por Modelo
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {modelColumns.map((c, i) => (
                      <th
                        key={c}
                        className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                          i >= 1 && i <= 4 ? 'text-right' : ''
                        }`}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.byModel.map((model, index) => {
                    const eff = efficiency(model)
                    return (
                      <tr key={model.model} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="size-3 shrink-0 rounded-full"
                              style={{ backgroundColor: model.color || COLORS[index % COLORS.length] }}
                              aria-hidden
                            />
                            <span className="font-medium text-foreground">{model.model}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {formatNumber(model.tokens)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {formatCurrency(model.cost)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {formatNumber(model.requests)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <LinearProgress
                              determinate
                              value={model.percentage}
                              sx={{ width: 60 }}
                            />
                            <span className="tabular-nums text-muted-foreground">
                              {model.percentage.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={eff.variant}>{eff.label}</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Uso por Modulo */}
        {data.byModule && data.byModule.length > 0 && (
          <div className="rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <h2 className="border-b border-border px-5 py-4 text-base font-semibold text-foreground">
              Uso por Modulo
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {moduleColumns.map((c, i) => (
                      <th
                        key={c}
                        className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                          i >= 1 ? 'text-right' : ''
                        }`}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.byModule.map((module) => (
                    <tr key={module.module} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <Badge variant="neutral">{module.module}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatNumber(module.tokens)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatCurrency(module.cost)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatNumber(module.requests)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <LinearProgress
                            determinate
                            value={module.percentage}
                            sx={{ width: 60 }}
                          />
                          <span className="tabular-nums text-muted-foreground">
                            {module.percentage.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Mensaje cuando no hay datos */}
        {data.byModel.length === 0 && data.byMonth.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay datos de analytics disponibles. Los datos se registraran automaticamente cuando la IA procese mensajes.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
