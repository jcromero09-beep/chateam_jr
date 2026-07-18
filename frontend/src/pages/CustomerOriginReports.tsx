import { useState, useEffect } from 'react'
import { CircularProgress } from '@mui/joy'
import {
  ChartBar,
  ArrowClockwise,
  TrendUp,
  ChartPie,
  Table as TableIcon,
} from '@phosphor-icons/react'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'
import { Button } from '@/components/ui/button'
import api from '../services/api'
import { toast } from 'react-toastify'

interface OriginStats {
  originId: number | null
  originName: string
  originColor: string
  ticketCount: number
  percentage: number
}

interface TrendData {
  date: string
  total: number
  byOrigin: { [key: string]: number }
}

interface ReportData {
  summary: {
    totalTickets: number
    ticketsWithOrigin: number
    ticketsWithoutOrigin: number
  }
  byOrigin: OriginStats[]
  trends: TrendData[]
}

export default function CustomerOriginReports({ embedded = false }: { embedded?: boolean }) {
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<ReportData | null>(null)
  const [startDate, setStartDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 30)
    return date.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })

  useEffect(() => {
    fetchReport()
  }, [])

  const fetchReport = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/customer-origins/report', {
        params: { startDate, endDate }
      })
      setReport(data.report)
    } catch (error) {
      console.error('Error fetching report:', error)
      toast.error('Error al cargar el reporte')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    fetchReport()
  }

  // Preparar datos para el gráfico de tendencias
  const getTrendsChartData = () => {
    if (!report?.trends) return []
    return report.trends.map(t => ({
      date: new Date(t.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      total: t.total,
      ...t.byOrigin
    }))
  }

  // Obtener lista única de orígenes para el gráfico de tendencias
  const getUniqueOrigins = () => {
    if (!report?.byOrigin) return []
    return report.byOrigin.map(o => ({
      name: o.originName,
      color: o.originColor
    }))
  }

  const dateInputClass =
    'h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

  if (loading) {
    const spinner = (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <CircularProgress size="lg" />
        <p className="text-sm text-muted-foreground">Cargando reporte...</p>
      </div>
    )
    return embedded ? spinner : (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] p-5 sm:p-6 lg:p-8">{spinner}</div>
      </div>
    )
  }

  const totalTickets = report?.summary.totalTickets || 0
  const withOrigin = report?.summary.ticketsWithOrigin || 0
  const withoutOrigin = report?.summary.ticketsWithoutOrigin || 0

  const body = (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        {embedded ? (
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Análisis por Origen
          </h2>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ChartBar className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Reporte de Origen de Clientes
              </h1>
              <p className="text-sm text-muted-foreground">
                Analiza de dónde provienen tus clientes
              </p>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="Fecha de inicio"
            className={dateInputClass}
          />
          <span className="text-sm text-muted-foreground">a</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label="Fecha de fin"
            className={dateInputClass}
          />
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <ArrowClockwise className="size-4" aria-hidden />
            Actualizar
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="flex items-center gap-2">
            <TrendUp className="size-5 text-brand-teal" aria-hidden />
            <p className="text-sm text-muted-foreground">Total Tickets</p>
          </div>
          <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
            {totalTickets}
          </p>
          <p className="text-xs text-muted-foreground">En el período seleccionado</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="flex items-center gap-2">
            <ChartPie className="size-5 text-success-text" aria-hidden />
            <p className="text-sm text-muted-foreground">Con Origen</p>
          </div>
          <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-success-text">
            {withOrigin}
          </p>
          <p className="text-xs text-muted-foreground">
            {totalTickets ? Math.round((withOrigin / totalTickets) * 100) : 0}% del total
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="flex items-center gap-2">
            <TableIcon className="size-5 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">Sin Origen</p>
          </div>
          <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-muted-foreground">
            {withoutOrigin}
          </p>
          <p className="text-xs text-muted-foreground">
            {totalTickets ? Math.round((withoutOrigin / totalTickets) * 100) : 0}% del total
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        {/* Pie Chart */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] md:col-span-5">
          <h3 className="mb-4 text-base font-semibold text-foreground">
            Distribución por Origen
          </h3>
          {report?.byOrigin && report.byOrigin.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={report.byOrigin}
                  dataKey="ticketCount"
                  nameKey="originName"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {report.byOrigin.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.originColor} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={((value: number) => [`${value} tickets`, 'Cantidad']) as any}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center">
              <p className="text-sm text-muted-foreground">No hay datos para mostrar</p>
            </div>
          )}
        </div>

        {/* Bar Chart */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] md:col-span-7">
          <h3 className="mb-4 text-base font-semibold text-foreground">
            Tickets por Origen
          </h3>
          {report?.byOrigin && report.byOrigin.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={report.byOrigin} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="originName" type="category" width={120} />
                <Tooltip
                  formatter={((value: number, name: string) => [
                    `${value} tickets (${report.byOrigin.find(o => o.originName === name)?.percentage || 0}%)`,
                    'Cantidad'
                  ]) as any}
                />
                <Bar dataKey="ticketCount" name="Tickets">
                  {report.byOrigin.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.originColor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center">
              <p className="text-sm text-muted-foreground">No hay datos para mostrar</p>
            </div>
          )}
        </div>
      </div>

      {/* Trends Chart */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
        <h3 className="mb-4 text-base font-semibold text-foreground">
          Tendencia por Día
        </h3>
        {report?.trends && report.trends.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={getTrendsChartData()}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="total"
                name="Total"
                stroke="#6366f1"
                fill="#6366f1"
                fillOpacity={0.3}
                strokeWidth={2}
              />
              {getUniqueOrigins().map((origin) => (
                <Area
                  key={origin.name}
                  type="monotone"
                  dataKey={origin.name}
                  name={origin.name}
                  stroke={origin.color}
                  fill={origin.color}
                  fillOpacity={0.2}
                  strokeWidth={1}
                  stackId="1"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[350px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No hay datos de tendencia</p>
          </div>
        )}
      </div>

      {/* Detail Table */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
        <h3 className="mb-4 text-base font-semibold text-foreground">
          Detalle por Origen
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="w-16 whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Color
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Origen
                </th>
                <th className="w-32 whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tickets
                </th>
                <th className="w-32 whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Porcentaje
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report?.byOrigin && report.byOrigin.length > 0 ? (
                report.byOrigin.map((origin, index) => (
                  <tr key={index} className="transition-colors hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <span
                        className="block size-6 rounded-full ring-1 ring-inset ring-black/10"
                        style={{ backgroundColor: origin.originColor }}
                        aria-hidden
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold text-white"
                        style={{ backgroundColor: origin.originColor }}
                      >
                        {origin.originName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-foreground">
                      {origin.ticketCount}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {origin.percentage}%
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No hay datos para mostrar
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )

  return embedded ? body : (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] p-5 sm:p-6 lg:p-8">{body}</div>
    </div>
  )
}
