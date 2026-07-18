import { useState, type ReactNode } from 'react'
// [Fase2·G] Conservado como MUI a propósito: no hay equivalente de barra de progreso
// determinada en el design system (Tailwind + shadcn/Radix) todavía.
import { LinearProgress } from '@mui/joy'
import {
  ChartLineUp,
  DownloadSimple,
  TrendUp,
  TrendDown,
  CalendarBlank,
  Clock,
  CurrencyDollar,
  Star,
  CheckCircle,
  ArrowClockwise,
} from '@phosphor-icons/react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface AgentReport {
  id: number
  name: string
  avatar: string
  totalAppointments: number
  completed: number
  cancelled: number
  noShow: number
  revenue: number
  avgRating: number
  avgDuration: number
  completionRate: number
}

interface ServiceReport {
  name: string
  appointments: number
  revenue: number
  avgDuration: number
  cancellationRate: number
  popularityTrend: number
}

interface TimeSlotAnalysis {
  timeSlot: string
  appointments: number
  avgOccupancy: number
  peakDay: string
}

interface MonthlyData {
  month: string
  appointments: number
  revenue: number
  completionRate: number
  avgRating: number
}

const mockAgentReports: AgentReport[] = [
  {
    id: 1,
    name: 'Dr. Ana García',
    avatar: 'https://i.pravatar.cc/150?img=1',
    totalAppointments: 89,
    completed: 82,
    cancelled: 4,
    noShow: 3,
    revenue: 13450,
    avgRating: 4.8,
    avgDuration: 32,
    completionRate: 92.1,
  },
  {
    id: 2,
    name: 'Dr. Luis Rodríguez',
    avatar: 'https://i.pravatar.cc/150?img=2',
    totalAppointments: 76,
    completed: 68,
    cancelled: 5,
    noShow: 3,
    revenue: 11800,
    avgRating: 4.7,
    avgDuration: 38,
    completionRate: 89.5,
  },
  {
    id: 3,
    name: 'Dra. Carmen Silva',
    avatar: 'https://i.pravatar.cc/150?img=3',
    totalAppointments: 92,
    completed: 85,
    cancelled: 4,
    noShow: 3,
    revenue: 15230,
    avgRating: 4.9,
    avgDuration: 41,
    completionRate: 92.4,
  },
  {
    id: 4,
    name: 'Dr. Miguel Herrera',
    avatar: 'https://i.pravatar.cc/150?img=4',
    totalAppointments: 85,
    completed: 75,
    cancelled: 7,
    noShow: 3,
    revenue: 9300,
    avgRating: 4.6,
    avgDuration: 28,
    completionRate: 88.2,
  },
]

const mockServiceReports: ServiceReport[] = [
  {
    name: 'Consulta General',
    appointments: 145,
    revenue: 21750,
    avgDuration: 30,
    cancellationRate: 4.1,
    popularityTrend: 12.5,
  },
  {
    name: 'Revisión de Seguimiento',
    appointments: 98,
    revenue: 19600,
    avgDuration: 45,
    cancellationRate: 3.2,
    popularityTrend: 8.3,
  },
  {
    name: 'Consulta Especializada',
    appointments: 56,
    revenue: 19600,
    avgDuration: 60,
    cancellationRate: 5.4,
    popularityTrend: -2.1,
  },
  {
    name: 'Evaluación Inicial',
    appointments: 28,
    revenue: 5040,
    avgDuration: 30,
    cancellationRate: 3.6,
    popularityTrend: 15.7,
  },
  {
    name: 'Consulta Express',
    appointments: 15,
    revenue: 1500,
    avgDuration: 20,
    cancellationRate: 13.3,
    popularityTrend: -5.2,
  },
]

const mockTimeSlots: TimeSlotAnalysis[] = [
  { timeSlot: '09:00 - 10:00', appointments: 48, avgOccupancy: 85.7, peakDay: 'Martes' },
  { timeSlot: '10:00 - 11:00', appointments: 52, avgOccupancy: 92.9, peakDay: 'Jueves' },
  { timeSlot: '11:00 - 12:00', appointments: 45, avgOccupancy: 80.4, peakDay: 'Lunes' },
  { timeSlot: '12:00 - 13:00', appointments: 38, avgOccupancy: 67.9, peakDay: 'Viernes' },
  { timeSlot: '14:00 - 15:00', appointments: 58, avgOccupancy: 96.7, peakDay: 'Jueves' },
  { timeSlot: '15:00 - 16:00', appointments: 62, avgOccupancy: 98.4, peakDay: 'Miércoles' },
  { timeSlot: '16:00 - 17:00', appointments: 55, avgOccupancy: 91.7, peakDay: 'Lunes' },
  { timeSlot: '17:00 - 18:00', appointments: 42, avgOccupancy: 70.0, peakDay: 'Viernes' },
]

const mockMonthlyData: MonthlyData[] = [
  { month: 'Ene', appointments: 285, revenue: 38500, completionRate: 88.4, avgRating: 4.6 },
  { month: 'Feb', appointments: 298, revenue: 41200, completionRate: 89.3, avgRating: 4.6 },
  { month: 'Mar', appointments: 312, revenue: 43800, completionRate: 90.1, avgRating: 4.7 },
  { month: 'Abr', appointments: 328, revenue: 45200, completionRate: 89.6, avgRating: 4.7 },
  { month: 'May', appointments: 342, revenue: 45780, completionRate: 91.2, avgRating: 4.7 },
  { month: 'Jun', appointments: 335, revenue: 46100, completionRate: 90.4, avgRating: 4.8 },
]

const agentColumns = [
  'Agente',
  'Total',
  'Completadas',
  'Canceladas',
  'No Show',
  'Ingresos',
  'Rating',
  'Tasa Completitud',
]

const serviceColumns = [
  'Servicio',
  'Citas',
  'Ingresos',
  'Duración Promedio',
  'Tasa Cancelación',
  'Tendencia',
]

type IconTone = 'primary' | 'success' | 'warning' | 'accent'

const iconToneClass: Record<IconTone, string> = {
  primary: 'bg-primary/12 text-primary',
  success: 'bg-success/14 text-success-text',
  warning: 'bg-warning/16 text-warning-text',
  accent: 'bg-brand-cyan/15 text-[color:var(--brand-teal)] dark:text-brand-cyan',
}

/** Indicador de variación (sube/baja) con texto semántico accesible. */
function TrendDelta({ label, positive }: { label: string; positive: boolean }) {
  const Icon = positive ? TrendUp : TrendDown
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        positive ? 'text-success-text' : 'text-destructive-text',
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </span>
  )
}

function KpiCard({
  label,
  value,
  trend,
  positive,
  tone,
  icon,
}: {
  label: string
  value: string
  trend: string
  positive: boolean
  tone: IconTone
  icon: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
            {value}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-1 text-xs">
            <TrendDelta label={trend} positive={positive} />
            <span className="text-muted-foreground">vs mes anterior</span>
          </p>
        </div>
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg',
            iconToneClass[tone],
          )}
        >
          {icon}
        </span>
      </div>
    </div>
  )
}

/** Avatar del agente: foto si existe, iniciales del design system si no. */
function AgentAvatar({ src, name }: { src?: string; name: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={32}
        height={32}
        className="size-8 shrink-0 rounded-full object-cover"
      />
    )
  }
  return <Avatar name={name} size="sm" />
}

const timeRangeLabels: Record<string, string> = {
  week: 'Esta Semana',
  month: 'Este Mes',
  quarter: 'Este Trimestre',
  year: 'Este Año',
}

export default function AppointmentsReports() {
  const [timeRange, setTimeRange] = useState<string>('month')
  const [_reportType, _setReportType] = useState<string>('overview')

  const currentPeriod = mockMonthlyData[mockMonthlyData.length - 1]
  const previousPeriod = mockMonthlyData[mockMonthlyData.length - 2]

  const calculateGrowth = (current: number, previous: number) => {
    return (((current - previous) / previous) * 100).toFixed(1)
  }

  const totalRevenue = mockAgentReports.reduce((sum, a) => sum + a.revenue, 0)
  const totalAppointments = mockAgentReports.reduce((sum, a) => sum + a.totalAppointments, 0)
  const avgCompletionRate = mockAgentReports.reduce((sum, a) => sum + a.completionRate, 0) / mockAgentReports.length
  const avgRating = mockAgentReports.reduce((sum, a) => sum + a.avgRating, 0) / mockAgentReports.length

  const appointmentsGrowth = calculateGrowth(currentPeriod.appointments, previousPeriod.appointments)
  const revenueGrowth = calculateGrowth(currentPeriod.revenue, previousPeriod.revenue)

  const appointmentsUp = parseFloat(appointmentsGrowth) > 0
  const revenueUp = parseFloat(revenueGrowth) > 0

  const maxAppointments = Math.max(...mockMonthlyData.map((d) => d.appointments))

  const cancellationVariant = (rate: number): BadgeProps['variant'] =>
    rate < 5 ? 'success' : rate < 10 ? 'warning' : 'destructive'

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
                Reportes y Analytics
              </h1>
              <p className="text-sm text-muted-foreground">
                Análisis detallado del rendimiento de citas
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[168px]" aria-label="Rango de tiempo">
                <SelectValue placeholder="Rango">
                  {timeRangeLabels[timeRange]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Esta Semana</SelectItem>
                <SelectItem value="month">Este Mes</SelectItem>
                <SelectItem value="quarter">Este Trimestre</SelectItem>
                <SelectItem value="year">Este Año</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button variant="outline" size="sm">
              <DownloadSimple className="size-4" aria-hidden />
              Exportar PDF
            </Button>
          </div>
        </div>

        {/* KPIs Overview */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total Citas"
            value={String(totalAppointments)}
            trend={`${appointmentsUp ? '+' : ''}${appointmentsGrowth}%`}
            positive={appointmentsUp}
            tone="primary"
            icon={<CalendarBlank className="size-5" weight="fill" aria-hidden />}
          />
          <KpiCard
            label="Ingresos Totales"
            value={`$${totalRevenue.toLocaleString()}`}
            trend={`${revenueUp ? '+' : ''}${revenueGrowth}%`}
            positive={revenueUp}
            tone="success"
            icon={<CurrencyDollar className="size-5" weight="fill" aria-hidden />}
          />
          <KpiCard
            label="Tasa Completitud"
            value={`${avgCompletionRate.toFixed(1)}%`}
            trend="+2.3%"
            positive
            tone="warning"
            icon={<CheckCircle className="size-5" weight="fill" aria-hidden />}
          />
          <KpiCard
            label="Calificación"
            value={`${avgRating.toFixed(1)}/5.0`}
            trend="+0.2"
            positive
            tone="accent"
            icon={<Star className="size-5" weight="fill" aria-hidden />}
          />
        </div>

        {/* Monthly Trend */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <h2 className="text-base font-semibold text-foreground">Tendencia Mensual</h2>
          <div className="mt-4 flex flex-col gap-4">
            {mockMonthlyData.map((data) => {
              const percentage = (data.appointments / maxAppointments) * 100
              return (
                <div key={data.month} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span className="text-sm font-medium text-foreground">{data.month}</span>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="tabular-nums">
                        {data.appointments} citas • ${data.revenue.toLocaleString()}
                      </span>
                      <span className="min-w-20 tabular-nums">
                        {data.completionRate}% completitud
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Star className="size-4 text-warning-text" weight="fill" aria-hidden />
                        <span className="tabular-nums text-foreground">{data.avgRating}</span>
                      </span>
                    </div>
                  </div>
                  <LinearProgress determinate value={percentage} size="sm" />
                </div>
              )
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Agent Performance */}
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02] lg:col-span-2">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">Rendimiento por Agente</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {agentColumns.map((c, i) => (
                      <th
                        key={i}
                        className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {mockAgentReports.map((agent) => (
                    <tr key={agent.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <AgentAvatar src={agent.avatar} name={agent.name} />
                          <span className="whitespace-nowrap text-foreground">{agent.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium tabular-nums text-foreground">
                        {agent.totalAppointments}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="success">{agent.completed}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="destructive">{agent.cancelled}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="neutral">{agent.noShow}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-foreground">
                        ${agent.revenue.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1">
                          <Star className="size-4 text-warning-text" weight="fill" aria-hidden />
                          <span className="tabular-nums text-foreground">{agent.avgRating}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex min-w-[120px] items-center gap-2">
                          <LinearProgress
                            determinate
                            value={agent.completionRate}
                            size="sm"
                            sx={{ flex: 1 }}
                          />
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {agent.completionRate}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Time Slot Analysis */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <h2 className="text-base font-semibold text-foreground">Análisis por Horario</h2>
            <div className="mt-4 flex flex-col gap-3">
              {mockTimeSlots.map((slot, index) => (
                <div
                  key={index}
                  className={cn(
                    'rounded-lg p-3',
                    slot.avgOccupancy > 90 ? 'bg-success/12' : 'bg-muted/50',
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{slot.timeSlot}</span>
                    <span className="text-xs text-muted-foreground">Peak: {slot.peakDay}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <LinearProgress
                      determinate
                      value={slot.avgOccupancy}
                      size="sm"
                      sx={{ flex: 1 }}
                    />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {slot.avgOccupancy}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {slot.appointments} citas
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Service Performance */}
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold text-foreground">Rendimiento por Servicio</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  {serviceColumns.map((c, i) => (
                    <th
                      key={i}
                      className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mockServiceReports.map((service, index) => (
                  <tr key={index} className="transition-colors hover:bg-accent/40">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                      {service.name}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {service.appointments}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-foreground">
                      ${service.revenue.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-muted-foreground">
                        <Clock className="size-4" aria-hidden />
                        <span className="tabular-nums">{service.avgDuration} min</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={cancellationVariant(service.cancellationRate)}>
                        {service.cancellationRate}%
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <TrendDelta
                        label={`${service.popularityTrend > 0 ? '+' : ''}${service.popularityTrend}%`}
                        positive={service.popularityTrend > 0}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
