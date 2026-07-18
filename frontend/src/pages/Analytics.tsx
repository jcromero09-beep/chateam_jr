import { useState, useEffect } from 'react'
import { LinearProgress } from '@mui/joy'
import {
  ChartBar,
  TrendUp,
  TrendDown,
  Minus,
} from '@phosphor-icons/react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import api from '../services/api'

interface TrendPoint {
  date: string
  tickets: number
  messages: number
  contacts: number
}

interface ChannelPoint {
  name: string
  value: number
  color: string
}

interface AgentPoint {
  name: string
  tickets: number
  avgTime: string
  satisfaction: number
}

interface StatCard {
  title: string
  value: string
  change: string
  trend: 'up' | 'down' | 'neutral'
  color: string
}

// Mapea el color heredado de MUI Joy (primary/neutral/danger/success/warning)
// a la variante del Badge del design system.
const colorToVariant = (color: string): BadgeProps['variant'] => {
  switch (color) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'danger':
      return 'destructive'
    case 'primary':
      return 'primary'
    default:
      return 'neutral'
  }
}

export default function Analytics() {
  const [period, setPeriod] = useState('7days')
  const [loading, setLoading] = useState(true)
  const [trendData, setTrendData] = useState<TrendPoint[]>([])
  const [channelData, setChannelData] = useState<ChannelPoint[]>([])
  const [agentData, setAgentData] = useState<AgentPoint[]>([])
  const [stats, setStats] = useState<StatCard[]>([])

  useEffect(() => {
    fetchAnalytics()
  }, [period])

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const response = await api.get('/analytics', { params: { period } })
      const data = response.data?.data ?? response.data ?? {}
      setTrendData(data.trendData ?? [])
      setChannelData(data.channelData ?? [])
      setAgentData(data.agentData ?? [])
      setStats(data.stats ?? [])
    } catch {
      // Sin datos disponibles — se mostrará estado vacío
      setTrendData([])
      setChannelData([])
      setAgentData([])
      setStats([])
    } finally {
      setLoading(false)
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendUp className="size-5" aria-hidden />
      case 'down':
        return <TrendDown className="size-5" aria-hidden />
      default:
        return <Minus className="size-5" aria-hidden />
    }
  }

  const isEmpty = !loading && stats.length === 0 && trendData.length === 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ChartBar className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Analytics
              </h1>
              <p className="text-sm text-muted-foreground">
                Análisis y reportes del sistema
              </p>
            </div>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[170px]" aria-label="Período">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24hours">Últimas 24h</SelectItem>
              <SelectItem value="7days">Últimos 7 días</SelectItem>
              <SelectItem value="30days">Últimos 30 días</SelectItem>
              <SelectItem value="90days">Últimos 90 días</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Loading */}
        {loading && <LinearProgress />}

        {/* Estado vacío */}
        {isEmpty && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
            <div className="flex flex-col items-center gap-2 py-12">
              <ChartBar className="size-14 text-muted-foreground" aria-hidden />
              <h2 className="text-lg font-semibold text-foreground">
                No hay datos de analytics disponibles
              </h2>
              <p className="max-w-[480px] text-center text-sm text-muted-foreground">
                Los datos se generarán automáticamente a medida que uses la plataforma.
              </p>
            </div>
          </div>
        )}

        {/* KPI Cards */}
        {stats.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            {stats.map((stat, index) => (
              <div
                key={index}
                className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]"
              >
                <p className="mb-1 text-sm text-muted-foreground">{stat.title}</p>
                <p className="mb-1 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  {stat.value}
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant={colorToVariant(stat.color)}>
                    {getTrendIcon(stat.trend)}
                    {stat.change}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    vs período anterior
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Charts — solo si hay datos */}
        {(trendData.length > 0 || channelData.length > 0 || agentData.length > 0) && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
            {/* Line Chart - Tendencia */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02] md:col-span-8">
              <h3 className="mb-6 text-lg font-semibold text-foreground">
                Tendencia de Actividad
              </h3>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) =>
                        new Date(value).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })
                      }
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(value) => new Date(value).toLocaleDateString('es-ES')}
                      formatter={((value: number, name: string) => [
                        value,
                        name === 'tickets'
                          ? 'Tickets'
                          : name === 'messages'
                          ? 'Mensajes'
                          : 'Contactos Nuevos',
                      ]) as any}
                    />
                    <Line type="monotone" dataKey="tickets" stroke="#3b82f6" strokeWidth={2} name="tickets" />
                    <Line type="monotone" dataKey="messages" stroke="#10b981" strokeWidth={2} name="messages" />
                    <Line type="monotone" dataKey="contacts" stroke="#f59e0b" strokeWidth={2} name="contacts" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[300px] items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    Sin datos de tendencia para este período
                  </p>
                </div>
              )}
            </div>

            {/* Pie Chart - Distribución por Canal */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02] md:col-span-4">
              <h3 className="mb-6 text-lg font-semibold text-foreground">
                Distribución por Canal
              </h3>
              {channelData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={channelData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }: any) => `${name} ${((percent as number) * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {channelData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[300px] items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    Sin datos por canal
                  </p>
                </div>
              )}
            </div>

            {/* Bar Chart - Rendimiento por Agente */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02] md:col-span-12">
              <h3 className="mb-6 text-lg font-semibold text-foreground">
                Rendimiento por Agente
              </h3>
              {agentData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={agentData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="tickets" fill="#3b82f6" name="Tickets Atendidos" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[300px] items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    Sin datos de agentes
                  </p>
                </div>
              )}
            </div>

            {/* Tabla de Agentes */}
            {agentData.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02] md:col-span-12">
                <h3 className="mb-4 text-lg font-semibold text-foreground">
                  Detalle de Agentes
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left">
                        <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Agente
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Tickets Atendidos
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Tiempo Promedio
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Satisfacción
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {agentData.map((agent, index) => (
                        <tr key={index} className="transition-colors hover:bg-accent/40">
                          <td className="px-4 py-3 font-semibold text-foreground">
                            {agent.name}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-muted-foreground">
                            {agent.tickets}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {agent.avgTime}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-foreground">
                                {agent.satisfaction}
                              </span>
                              <span className="text-xs text-muted-foreground">/ 5.0</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={agent.satisfaction >= 4.7 ? 'success' : 'primary'}>
                              {agent.satisfaction >= 4.7 ? 'Excelente' : 'Bueno'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
