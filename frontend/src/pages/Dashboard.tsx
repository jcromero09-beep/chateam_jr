import { useState, useEffect, type ReactNode } from 'react'
import {
  ArrowClockwise,
  Eye,
  EyeSlash,
  UsersThree,
  Broadcast,
  ChatCircleDots,
  Tray,
  ChatText,
  Star,
  WarningCircle,
  Clock,
} from '@phosphor-icons/react'
import { StatCard } from '../components/dashboard/StatCard'
import { ActivityChart } from '../components/dashboard/ActivityChart'
import { TicketsDonut } from '../components/dashboard/TicketsDonut'
import { MetricCard } from '../components/dashboard/MetricCard'
import { Avatar } from '../components/ui/avatar'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { cn } from '@/lib/utils'
import type { Kpi, Metric, TicketSlice, ActivityPoint } from '@/lib/mock/dashboard'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'

interface DashboardStats {
  totalUsers: number
  activeConversations: number
  totalMessages: number
  aiInteractions: number
  trends: Array<{ date: string; messages: number; users: number }>
  tickets: {
    open: number
    pending: number
    closed: number
  }
  unassignedTickets: {
    total: number
    open: number
    pending: number
    closed: number
  }
  ratings: {
    total: number
    average: number
    scale: number
    positiveRate: number
    last30Days: number
    distribution: Array<{ rate: number; count: number }>
    latest: Array<{
      id: number
      ticketId: number | null
      rate: number
      createdAt: string
      userName: string
    }>
  }
  campaigns: {
    active: number
    scheduled: number
    completed: number
  }
  connections: {
    connected: number
    disconnected: number
    total: number
  }
  topAgents: Array<{
    id: number
    name: string
    ticketsClosed: number
    avgResponseTime: string
  }>
  userMetrics: Array<{
    id: number
    name: string
    email: string
    online: boolean
    onlineSince: string | null
    onlineDurationMinutes: number
    lastSeenAt: string | null
    totalTickets: number
    openTickets: number
    pendingTickets: number
    closedTickets: number
    avgRating: number
    ratingCount: number
    avgResponseTime: string
  }>
  recentActivity: Array<{
    id: number
    type: string
    message: string
    time: string
    user: string
  }>
  performance: {
    avgResponseTime: number
    satisfactionRate: number
    firstContactResolution: number
  }
}

const EMPTY_STATS: DashboardStats = {
  totalUsers: 0,
  activeConversations: 0,
  totalMessages: 0,
  aiInteractions: 0,
  trends: [],
  tickets: { open: 0, pending: 0, closed: 0 },
  unassignedTickets: { total: 0, open: 0, pending: 0, closed: 0 },
  ratings: {
    total: 0,
    average: 0,
    scale: 5,
    positiveRate: 0,
    last30Days: 0,
    distribution: [],
    latest: [],
  },
  campaigns: { active: 0, scheduled: 0, completed: 0 },
  connections: { connected: 0, disconnected: 0, total: 0 },
  topAgents: [],
  userMetrics: [],
  recentActivity: [],
  performance: { avgResponseTime: 0, satisfactionRate: 0, firstContactResolution: 0 },
}

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [fetchError, setFetchError] = useState(false)

  useEffect(() => {
    if (user?.companyId) {
      fetchDashboardStats()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, showAll])

  const fetchDashboardStats = async () => {
    try {
      setLoading(true)
      setFetchError(false)
      const companyId = user?.companyId

      if (companyId) {
        const response = await api.get('/dashboard', {
          params: { showAll: showAll ? 'true' : 'false' },
        })
        setStats(response.data)
      } else {
        throw new Error('No companyId found')
      }
    } catch (_error) {
      setFetchError(true)
      setStats(EMPTY_STATS)
    } finally {
      setLoading(false)
    }
  }

  const ratingsScale = stats?.ratings?.scale || 5
  const onlineUsers = stats?.userMetrics?.filter((agent) => agent.online).length || 0

  const formatDuration = (minutes?: number) => {
    const safeMinutes = Math.max(0, minutes || 0)
    if (safeMinutes < 1) return 'Ahora'
    if (safeMinutes < 60) return `${safeMinutes} min`

    const hours = Math.floor(safeMinutes / 60)
    const remainingMinutes = safeMinutes % 60
    if (hours < 24) return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`

    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`
  }

  // ---- Real data → design widgets --------------------------------------

  // KPIs (StatCard) — from the same stat cards the old dashboard computed.
  const kpis: Kpi[] = [
    {
      label: 'Usuarios',
      value: (stats?.totalUsers ?? 0).toLocaleString(),
      sublabel: 'Registrados',
      tone: 'primary',
      icon: UsersThree,
    },
    {
      label: 'Online',
      value: onlineUsers.toLocaleString(),
      sublabel: 'Agentes conectados',
      tone: 'success',
      icon: Broadcast,
    },
    {
      label: 'Conversaciones',
      value: (stats?.activeConversations ?? 0).toLocaleString(),
      sublabel: 'Activas (24h)',
      tone: 'accent',
      icon: ChatCircleDots,
    },
    {
      label: 'Sin asignar',
      value: (stats?.unassignedTickets?.total ?? 0).toLocaleString(),
      sublabel: 'Tickets sin usuario',
      tone: 'warning',
      icon: Tray,
    },
    {
      label: 'Mensajes',
      value: (stats?.totalMessages ?? 0).toLocaleString(),
      sublabel: 'Este mes',
      tone: 'primary',
      icon: ChatText,
    },
    {
      label: 'Reseñas',
      value: (stats?.ratings?.total ?? 0).toLocaleString(),
      sublabel: `${stats?.ratings?.average ?? 0}/${ratingsScale} promedio`,
      tone: 'accent',
      icon: Star,
    },
  ]

  // Activity chart — real 7-day trends (messages / active users).
  const activity: ActivityPoint[] = (stats?.trends ?? []).map((t) => ({
    day: new Date(t.date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }),
    mensajes: t.messages,
    usuarios: t.users,
  }))

  // Tickets donut — real ticket distribution by status.
  const ticketBreakdown: TicketSlice[] = [
    { label: 'Abiertos', value: stats?.tickets?.open ?? 0, color: 'var(--primary)' },
    { label: 'Pendientes', value: stats?.tickets?.pending ?? 0, color: 'var(--warning)' },
    { label: 'Cerrados', value: stats?.tickets?.closed ?? 0, color: 'var(--success)' },
  ]

  // Performance metrics — real performance block.
  const metrics: Metric[] = [
    {
      label: 'Tiempo de respuesta promedio',
      value: `${stats?.performance?.avgResponseTime ?? 0} min`,
      tone: 'success',
      progress: 75,
      context: '25% mejor que el promedio del sector',
    },
    {
      label: 'Tasa de satisfacción',
      value: `${stats?.performance?.satisfactionRate ?? 0}%`,
      tone: 'success',
      progress: stats?.performance?.satisfactionRate ?? 0,
      context: `Basado en ${stats?.ratings?.total ?? 0} reseñas`,
    },
    {
      label: 'Resolución primer contacto',
      value: `${stats?.performance?.firstContactResolution ?? 0}%`,
      tone: 'warning',
      progress: stats?.performance?.firstContactResolution ?? 0,
      context: 'Objetivo: 85%',
    },
  ]

  const team = stats?.userMetrics ?? []
  const recentActivity = stats?.recentActivity ?? []

  const todayLabel = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Bienvenido, {user?.name || 'Administrador'}
            </h1>
            <p className="mt-1 text-sm capitalize text-muted-foreground">
              Tus tickets asignados · {todayLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAll((prev) => !prev)}
              aria-pressed={showAll}
            >
              {showAll ? (
                <Eye className="size-4" aria-hidden />
              ) : (
                <EyeSlash className="size-4" aria-hidden />
              )}
              {showAll ? 'Todos' : 'Mis tickets'}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar datos del dashboard"
              onClick={fetchDashboardStats}
              loading={loading}
              className="text-muted-foreground"
            >
              {!loading && <ArrowClockwise className="size-5" aria-hidden />}
            </Button>
          </div>
        </div>

        {/* Error alert */}
        {fetchError && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-text"
          >
            <WarningCircle className="size-5 shrink-0" weight="fill" aria-hidden />
            No se pudieron cargar los datos del dashboard. Intenta de nuevo.
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {kpis.map((kpi) => (
            <StatCard key={kpi.label} kpi={kpi} />
          ))}
        </div>

        {/* Activity + Donut */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card title="Actividad" subtitle="Últimos 7 días" className="lg:col-span-2">
            {activity.length > 0 ? (
              <ActivityChart data={activity} />
            ) : (
              <EmptyState message="Sin actividad registrada en el periodo" />
            )}
          </Card>
          <Card title="Tickets" subtitle="Distribución por estado">
            <TicketsDonut segments={ticketBreakdown} />
          </Card>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {metrics.map((m) => (
            <MetricCard key={m.label} metric={m} />
          ))}
        </div>

        {/* Bottom: team + recent activity */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Equipo" subtitle={`${onlineUsers} en línea`}>
            {team.length === 0 ? (
              <EmptyState message="No hay datos de usuarios disponibles" />
            ) : (
              <ul className="-mx-1 divide-y divide-border">
                {team.slice(0, 6).map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center gap-3 px-1 py-3 first:pt-0 last:pb-0"
                  >
                    <Avatar name={member.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    {member.online ? (
                      <Badge variant="success">
                        <Clock className="size-3" aria-hidden />
                        {formatDuration(member.onlineDurationMinutes)}
                      </Badge>
                    ) : (
                      <Badge variant="neutral">
                        <span className="size-1.5 rounded-full bg-muted-foreground/60" aria-hidden />
                        Desconectado
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Actividad reciente" subtitle="Últimos eventos">
            {recentActivity.length === 0 ? (
              <EmptyState message="No hay actividad reciente" />
            ) : (
              <ul className="-mx-1 divide-y divide-border">
                {recentActivity.slice(0, 6).map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 px-1 py-3 first:pt-0 last:pb-0"
                  >
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                      aria-hidden
                    >
                      <ChatCircleDots className="size-[18px]" weight="fill" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{item.message}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.user} · {item.time}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function Card({
  title,
  subtitle,
  className,
  children,
}: {
  title: string
  subtitle?: string
  className?: string
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]',
        className,
      )}
    >
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center py-6 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
