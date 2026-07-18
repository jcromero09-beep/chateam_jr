/**
 * KanbanDashboard — Pipeline Kanban con métricas IA
 *
 * Endpoints consumidos:
 *   GET /tag/kanban/metrics?from=&to=
 *   GET /tag/kanban/funnel?from=&to=
 *
 * Secciones:
 *   1. Header con filtro de fechas y botón refresh
 *   2. 4 KPI Cards
 *   3. Funnel Chart (barras horizontales por etapa)
 *   4. Tabla de últimos 20 movimientos (KanbanMovementLog)
 */

import { useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { CircularProgress } from '@mui/joy'
import {
  ArrowClockwise,
  Kanban as KanbanIcon,
  TrendUp as TrendUpIcon,
  Clock as ClockIcon,
  Robot as RobotIcon,
  Ticket as TicketIcon,
  ArrowsDownUp as MoveIcon,
  Tray as InboxIcon,
  ArrowRight,
} from '@phosphor-icons/react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import api from '../services/api'

// ---------------------------------------------------------------------------
// Tipos estrictos
// ---------------------------------------------------------------------------

interface KanbanMetrics {
  totalTickets: number
  conversionRate: number
  avgPipelineHours: number
  aiAccuracy: number
}

interface KanbanFunnelStage {
  stageId: number
  stageName: string
  color: string
  count: number
}

interface KanbanMovement {
  id: number
  ticketId: number
  ticketTitle: string
  fromStage: string | null
  toStage: string
  moveType: 'system' | 'user' | 'ai'
  reason: string | null
  aiConfidence: number | null
  movedAt: string
}

interface MetricsResponse {
  metrics: KanbanMetrics
}

interface FunnelResponse {
  funnel: KanbanFunnelStage[]
  movements: KanbanMovement[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function moveTypeLabel(type: 'system' | 'user' | 'ai'): string {
  const map: Record<string, string> = {
    system: 'Sistema',
    user: 'Usuario',
    ai: 'IA',
  }
  return map[type] ?? type
}

function moveTypeBadge(
  type: 'system' | 'user' | 'ai'
): NonNullable<BadgeProps['variant']> {
  const map: Record<string, NonNullable<BadgeProps['variant']>> = {
    system: 'neutral',
    user: 'primary',
    ai: 'success',
  }
  return map[type] ?? 'neutral'
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function monthAgoISO(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().split('T')[0]
}

// ---------------------------------------------------------------------------
// KPI Card (presentacional, tokens del design system)
// ---------------------------------------------------------------------------

type KpiTone = 'primary' | 'success' | 'warning' | 'neutral'

const kpiIconTone: Record<KpiTone, string> = {
  primary: 'bg-primary/12 text-primary',
  success: 'bg-success/14 text-success-text',
  warning: 'bg-warning/16 text-warning-text',
  neutral: 'bg-muted text-muted-foreground',
}

function KpiCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string
  value: ReactNode
  hint: string
  icon: ReactNode
  tone: KpiTone
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
            {value}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-full',
            kpiIconTone[tone]
          )}
        >
          {icon}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function KanbanDashboard() {
  const [from, setFrom] = useState<string>(monthAgoISO())
  const [to, setTo] = useState<string>(todayISO())
  const [loadingMetrics, setLoadingMetrics] = useState(true)
  const [loadingFunnel, setLoadingFunnel] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<KanbanMetrics | null>(null)
  const [funnel, setFunnel] = useState<KanbanFunnelStage[]>([])
  const [movements, setMovements] = useState<KanbanMovement[]>([])

  const fetchAll = useCallback(async () => {
    setLoadingMetrics(true)
    setLoadingFunnel(true)
    setError(null)

    try {
      const params = { from, to }

      const [metricsRes, funnelRes] = await Promise.all([
        api.get<MetricsResponse>('/tag/kanban/metrics', { params }),
        api.get<FunnelResponse>('/tag/kanban/funnel', { params }),
      ])

      setMetrics(metricsRes.data.metrics)
      setFunnel(funnelRes.data.funnel ?? [])
      setMovements(funnelRes.data.movements ?? [])
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      const msg = e.response?.data?.error ?? e.message ?? 'Error cargando datos del pipeline'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoadingMetrics(false)
      setLoadingFunnel(false)
    }
  }, [from, to])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const isLoading = loadingMetrics || loadingFunnel
  const aiAccuracy = metrics?.aiAccuracy ?? 0

  // ─── Loading global (primera carga) ───────────────────────────────────────
  if (isLoading && metrics === null && funnel.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <CircularProgress size="lg" />
        <p className="text-sm text-muted-foreground">Cargando pipeline kanban...</p>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal">
                <KanbanIcon className="size-7" weight="fill" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Pipeline Kanban — Dashboard IA
                </h1>
                <p className="text-sm text-muted-foreground">
                  Metricas de conversion, tiempos y precision de automatizacion IA
                </p>
              </div>
            </div>

            {/* Filtros de fecha + Refresh */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  Desde:
                </span>
                <input
                  type="date"
                  aria-label="Fecha desde"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-9 cursor-pointer rounded-lg border border-input bg-card px-2.5 text-sm text-foreground outline-none transition-colors hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  Hasta:
                </span>
                <input
                  type="date"
                  aria-label="Fecha hasta"
                  value={to}
                  min={from}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-9 cursor-pointer rounded-lg border border-input bg-card px-2.5 text-sm text-foreground outline-none transition-colors hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>
              <Tooltip title="Actualizar datos">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Actualizar datos"
                  className="text-muted-foreground"
                  onClick={fetchAll}
                  loading={isLoading}
                >
                  {!isLoading && <ArrowClockwise className="size-5" aria-hidden />}
                </Button>
              </Tooltip>
            </div>
          </div>

          {/* ── Error Alert ──────────────────────────────────────────────────── */}
          {error && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text">
              <span>{error}</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive-text hover:bg-destructive/15 hover:text-destructive-text"
                onClick={fetchAll}
              >
                Reintentar
              </Button>
            </div>
          )}

          {/* ── Fila 1: KPI Cards ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard
              label="Total Tickets"
              value={loadingMetrics ? '—' : (metrics?.totalTickets ?? 0)}
              hint="en el pipeline"
              tone="primary"
              icon={<TicketIcon className="size-6" weight="fill" aria-hidden />}
            />
            <KpiCard
              label="Conversion Global"
              value={loadingMetrics ? '—' : `${(metrics?.conversionRate ?? 0).toFixed(1)}%`}
              hint="tickets cerrados / total"
              tone="success"
              icon={<TrendUpIcon className="size-6" weight="fill" aria-hidden />}
            />
            <KpiCard
              label="Tiempo Promedio"
              value={loadingMetrics ? '—' : `${(metrics?.avgPipelineHours ?? 0).toFixed(1)}h`}
              hint="horas en pipeline"
              tone="warning"
              icon={<ClockIcon className="size-6" weight="fill" aria-hidden />}
            />
            <KpiCard
              label="Precision IA"
              value={loadingMetrics ? '—' : `${aiAccuracy.toFixed(1)}%`}
              hint="sin overrides de usuario"
              tone={aiAccuracy >= 70 ? 'success' : 'neutral'}
              icon={<RobotIcon className="size-6" weight="fill" aria-hidden />}
            />
          </div>

          {/* ── Fila 2: Funnel Chart ─────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <TrendUpIcon className="size-5 text-muted-foreground" aria-hidden />
                  Funnel por Etapa
                </h2>
                <p className="text-xs text-muted-foreground">
                  Cantidad de tickets activos en cada etapa del pipeline
                </p>
              </div>
              {loadingFunnel && <CircularProgress size="sm" />}
            </div>

            <div className="my-4 border-t border-border" />

            {!loadingFunnel && funnel.length === 0 ? (
              <div className="py-12 text-center">
                <InboxIcon
                  className="mx-auto mb-2 size-12 text-muted-foreground"
                  aria-hidden
                />
                <p className="text-sm text-foreground">
                  Sin datos de etapas en el rango seleccionado
                </p>
                <p className="text-xs text-muted-foreground">
                  Ajusta el filtro de fechas o verifica que existan tickets en el kanban
                </p>
              </div>
            ) : (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={funnel}
                    layout="vertical"
                    margin={{ top: 4, right: 32, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 12 }}
                      allowDecimals={false}
                      label={{
                        value: 'Tickets',
                        position: 'insideBottomRight',
                        offset: -8,
                        fontSize: 11,
                      }}
                    />
                    <YAxis
                      type="category"
                      dataKey="stageName"
                      width={130}
                      tick={{ fontSize: 12 }}
                    />
                    <RechartsTooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        return (
                          <div className="rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-sm">
                            <p className="text-xs font-bold">{label}</p>
                            <p className="text-xs text-muted-foreground">
                              {payload[0].value} tickets
                            </p>
                          </div>
                        )
                      }}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={32}>
                      {funnel.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color || 'var(--brand-teal)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* ── Fila 3: Tabla de movimientos recientes ───────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <MoveIcon className="size-5 text-muted-foreground" aria-hidden />
                  Movimientos Recientes
                </h2>
                <p className="text-xs text-muted-foreground">
                  Ultimos 20 cambios de etapa registrados en el pipeline
                </p>
              </div>
              <Badge variant="outline">{movements.length} registros</Badge>
            </div>

            <div className="my-4 border-t border-border" />

            {!loadingFunnel && movements.length === 0 ? (
              <div className="py-12 text-center">
                <MoveIcon
                  className="mx-auto mb-2 size-12 text-muted-foreground"
                  aria-hidden
                />
                <p className="text-sm text-foreground">
                  Sin movimientos en el rango seleccionado
                </p>
                <p className="text-xs text-muted-foreground">
                  Los movimientos se registran cuando un ticket cambia de etapa en el kanban
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left">
                        <th className="w-[70px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Ticket
                        </th>
                        <th className="min-w-[160px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          De → A
                        </th>
                        <th className="w-[90px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Tipo
                        </th>
                        <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Razon
                        </th>
                        <th className="w-[110px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Confianza IA
                        </th>
                        <th className="w-[130px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Fecha
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {movements.map((mov) => (
                        <tr key={mov.id} className="transition-colors hover:bg-accent/40">
                          {/* Ticket */}
                          <td className="px-4 py-3 align-top">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-bold text-foreground">
                                #{mov.ticketId}
                              </span>
                              {mov.ticketTitle && (
                                <span className="max-w-[80px] truncate text-xs text-muted-foreground">
                                  {mov.ticketTitle}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* De → A */}
                          <td className="px-4 py-3 align-top">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {mov.fromStage ? (
                                <Badge variant="neutral">{mov.fromStage}</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">Inicio</span>
                              )}
                              <ArrowRight
                                className="size-3.5 text-muted-foreground"
                                aria-hidden
                              />
                              <Badge variant="primary">{mov.toStage}</Badge>
                            </div>
                          </td>

                          {/* Tipo */}
                          <td className="px-4 py-3 align-top">
                            <Badge variant={moveTypeBadge(mov.moveType)}>
                              {moveTypeLabel(mov.moveType)}
                            </Badge>
                          </td>

                          {/* Razon */}
                          <td className="px-4 py-3 align-top">
                            <span
                              className={cn(
                                'block max-w-[180px] truncate text-xs',
                                mov.reason ? 'text-foreground' : 'text-muted-foreground'
                              )}
                            >
                              {mov.reason ?? '—'}
                            </span>
                          </td>

                          {/* Confianza IA */}
                          <td className="px-4 py-3 align-top">
                            {mov.aiConfidence !== null ? (
                              <span className="flex items-center gap-1">
                                <RobotIcon
                                  className="size-3.5 text-success-text"
                                  aria-hidden
                                />
                                <span
                                  className={cn(
                                    'text-xs font-semibold tabular-nums',
                                    mov.aiConfidence >= 80
                                      ? 'text-success-text'
                                      : mov.aiConfidence >= 50
                                        ? 'text-warning-text'
                                        : 'text-destructive-text'
                                  )}
                                >
                                  {mov.aiConfidence.toFixed(0)}%
                                </span>
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>

                          {/* Fecha */}
                          <td className="whitespace-nowrap px-4 py-3 align-top">
                            <span className="text-xs text-muted-foreground">
                              {formatDate(mov.movedAt)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
