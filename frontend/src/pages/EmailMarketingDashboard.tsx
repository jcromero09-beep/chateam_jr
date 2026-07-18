import { useState, useEffect, useCallback, useMemo } from "react"
// [Re-skin Tailwind v4] Sólo se conservan de MUI Joy los indicadores de progreso
// (CircularProgress / LinearProgress) que no tienen equivalente en el design system.
import { CircularProgress, LinearProgress } from "@mui/joy"
import {
  ArrowClockwise,
  EnvelopeSimple,
  TrendUp,
  WarningCircle,
  Eye,
  PaperPlaneTilt,
  CloudArrowUp,
  Megaphone,
  Prohibit,
} from "@phosphor-icons/react"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
  PieChart,
  Pie,
  Cell
} from "recharts"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import api from "../services/api"

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Period = "today" | "week" | "month" | "year" | "all"
type Granularity = "hour" | "day" | "week" | "month"

interface KpiSummary {
  campaigns: {
    total: number
    drafts: number
    scheduled: number
    running: number
    finished: number
    cancelled: number
  }
  recipients: {
    total: number
    pending: number
    queued: number
    sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    failed: number
    unsubscribed: number
    spamComplaints: number
  }
  rates: {
    deliveryRate: number
    openRate: number
    clickRate: number
    bounceRate: number
    failureRate: number
  }
  domains: Record<string, { sent: number; failed: number; opened: number }>
}

interface TrendPoint {
  bucket: string
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  failed: number
}

interface CampaignRow {
  id: number
  name: string
  subject: string
  status: string
  provider: string | null
  dispatchMode: string
  sendAt: string | null
  completedAt: string | null
  createdAt: string
  totalRecipients: number
  totalSent: number
  totalDelivered: number
  totalOpened: number
  totalClicked: number
  totalBounced: number
  totalFailed: number
  contactListName: string | null
}

interface FailureRow {
  email: string
  campaignId: number
  campaignName: string
  status: string
  errorMessage: string | null
  bounceReason: string | null
  bouncedAt: string | null
  sentAt: string | null
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

// Paleta para data-viz (recharts requiere valores literales; no son tokens de superficie).
const COLORS = {
  primary: "#3b82f6",
  success: "#52b788",
  warning: "#f3a43b",
  danger: "#ef4444",
  neutral: "#94a3b8",
  bg: "#f8f9fa",
  dark: "#1e293b"
}

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoy",
  week: "Última semana",
  month: "Último mes",
  year: "Último año",
  all: "Todo"
}

const STATUS_LABELS: Record<string, string> = {
  INACTIVA: "Borrador",
  BORRADOR: "Borrador",
  PROGRAMADA: "Programada",
  EN_ANDAMENTO: "En proceso",
  EN_PROCESO: "En proceso",
  FINALIZADA: "Finalizada",
  ENVIADA: "Enviada",
  CANCELADA: "Cancelada"
}

const STATUS_COLORS: Record<string, BadgeProps["variant"]> = {
  FINALIZADA: "success",
  ENVIADA: "success",
  EN_ANDAMENTO: "primary",
  EN_PROCESO: "primary",
  PROGRAMADA: "warning",
  INACTIVA: "neutral",
  BORRADOR: "neutral",
  CANCELADA: "destructive"
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleString("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })
}

function formatBucket(bucket: string, granularity: Granularity): string {
  const d = new Date(bucket)
  if (granularity === "hour") {
    return d.toLocaleString("es-ES", { hour: "2-digit", minute: "2-digit" })
  }
  if (granularity === "day") {
    return d.toLocaleDateString("es-ES", { month: "short", day: "2-digit" })
  }
  if (granularity === "week") {
    return `Sem ${Math.ceil(d.getDate() / 7)} ${d.toLocaleDateString("es-ES", { month: "short" })}`
  }
  return d.toLocaleDateString("es-ES", { year: "numeric", month: "short" })
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function EmailMarketingDashboard() {
  const [period, setPeriod] = useState<Period>("month")
  const [granularity, setGranularity] = useState<Granularity>("day")

  const [kpis, setKpis] = useState<KpiSummary | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [campaignsCount, setCampaignsCount] = useState(0)
  const [failures, setFailures] = useState<FailureRow[]>([])

  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [campaignTab, setCampaignTab] = useState<"all" | "FINALIZADA" | "PROGRAMADA" | "EN_ANDAMENTO" | "CANCELADA">("all")

  // -------------------------------------------------------------------------
  // Carga
  // -------------------------------------------------------------------------

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const status = campaignTab === "all" ? undefined : campaignTab
      const [r1, r2, r3, r4] = await Promise.all([
        api.get(`/email-marketing/dashboard/kpis?period=${period}`),
        api.get(`/email-marketing/dashboard/trend?period=${period}&granularity=${granularity}`),
        api.get(`/email-marketing/dashboard/campaigns?period=${period}&pageSize=20${status ? `&status=${status}` : ""}`),
        api.get(`/email-marketing/dashboard/failures?period=${period}&limit=20`)
      ])
      setKpis(r1.data?.data || null)
      setTrend(r2.data?.data || [])
      setCampaigns(r3.data?.records || [])
      setCampaignsCount(r3.data?.count || 0)
      setFailures(r4.data?.data || [])
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string }
      toast.error(ax.response?.data?.message || ax.message || "Error cargando dashboard")
    } finally {
      setLoading(false)
    }
  }, [period, granularity, campaignTab])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const { data } = await api.post(`/email-marketing/dashboard/sync`)
      toast.success(`Sync completo: ${data.updated} campañas actualizadas, ${data.recipientsCreated || 0} recipients creados`)
      await fetchAll()
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string }
      toast.error(ax.response?.data?.message || ax.message || "Error en sync")
    } finally {
      setSyncing(false)
    }
  }

  // -------------------------------------------------------------------------
  // Datos derivados
  // -------------------------------------------------------------------------

  const pieDomainData = useMemo(() => {
    if (!kpis) return []
    return Object.entries(kpis.domains)
      .map(([name, v]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: v.sent
      }))
      .filter(d => d.value > 0)
  }, [kpis])

  const trendChartData = useMemo(() => {
    return trend.map(t => ({
      ...t,
      label: formatBucket(t.bucket, granularity)
    }))
  }, [trend, granularity])

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <EnvelopeSimple className="size-6" weight="fill" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Dashboard Email Marketing
                </h1>
                <p className="text-sm text-muted-foreground">
                  Métricas en vivo de campañas, entregas y aperturas
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger className="w-40" aria-label="Periodo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PERIOD_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
                <SelectTrigger className="w-36" aria-label="Granularidad">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hour">Por hora</SelectItem>
                  <SelectItem value="day">Por día</SelectItem>
                  <SelectItem value="week">Por semana</SelectItem>
                  <SelectItem value="month">Por mes</SelectItem>
                </SelectContent>
              </Select>

              <Tooltip title="Sincronizar con provider">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={syncing}
                  loading={syncing}
                >
                  {!syncing && <CloudArrowUp className="size-4" aria-hidden />}
                  {syncing ? "Sincronizando..." : "Sincronizar"}
                </Button>
              </Tooltip>

              <Tooltip title="Recargar">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Recargar"
                  className="text-muted-foreground"
                  onClick={fetchAll}
                  disabled={loading}
                >
                  <ArrowClockwise className="size-5" aria-hidden />
                </Button>
              </Tooltip>
            </div>
          </div>

          {loading && !kpis ? (
            <div className="flex justify-center py-16">
              <CircularProgress />
            </div>
          ) : !kpis ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-text">
              No hay datos disponibles
            </div>
          ) : (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  title="Campañas"
                  value={kpis.campaigns.total}
                  subtitle={`${kpis.campaigns.finished} finalizadas, ${kpis.campaigns.scheduled} programadas`}
                  icon={<Megaphone className="size-5" aria-hidden />}
                  color={COLORS.primary}
                />
                <KpiCard
                  title="Emails enviados"
                  value={kpis.recipients.delivered + kpis.recipients.opened + kpis.recipients.clicked + kpis.recipients.bounced}
                  subtitle={`Tasa entrega ${kpis.rates.deliveryRate}%`}
                  icon={<PaperPlaneTilt className="size-5" aria-hidden />}
                  color={COLORS.success}
                />
                <KpiCard
                  title="Aperturas"
                  value={kpis.recipients.opened + kpis.recipients.clicked}
                  subtitle={`Tasa apertura ${kpis.rates.openRate}%`}
                  icon={<Eye className="size-5" aria-hidden />}
                  color={COLORS.warning}
                />
                <KpiCard
                  title="Fallidos"
                  value={kpis.recipients.failed + kpis.recipients.bounced}
                  subtitle={`Tasa rebote ${kpis.rates.bounceRate}%`}
                  icon={<WarningCircle className="size-5" aria-hidden />}
                  color={COLORS.danger}
                />
              </div>

              {/* Tendencia + Domain breakdown */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] lg:col-span-2">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-foreground">
                      Tendencia de envíos
                    </h2>
                    <Badge variant="neutral">
                      <TrendUp className="size-4" aria-hidden />
                      {PERIOD_LABELS[period]} · {granularity}
                    </Badge>
                  </div>
                  {trendChartData.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      Sin datos en este periodo
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={trendChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gradSent" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gradOpened" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={COLORS.success} stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={COLORS.danger} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={COLORS.danger} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                        <ChartTooltip />
                        <Legend />
                        <Area type="monotone" dataKey="sent" name="Enviados" stroke={COLORS.primary} fillOpacity={1} fill="url(#gradSent)" />
                        <Area type="monotone" dataKey="opened" name="Abiertos" stroke={COLORS.success} fillOpacity={1} fill="url(#gradOpened)" />
                        <Area type="monotone" dataKey="failed" name="Fallidos" stroke={COLORS.danger} fillOpacity={1} fill="url(#gradFailed)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
                  <h2 className="mb-3 text-base font-semibold text-foreground">
                    Por dominio
                  </h2>
                  {pieDomainData.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      Sin envíos
                    </div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={pieDomainData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                            {pieDomainData.map((_, i) => (
                              <Cell key={i} fill={[COLORS.primary, COLORS.success, COLORS.warning, COLORS.danger, COLORS.neutral][i % 5]} />
                            ))}
                          </Pie>
                          <ChartTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="mt-2 space-y-2">
                        {Object.entries(kpis.domains).filter(([, v]) => v.sent > 0).map(([name, v]) => (
                          <div key={name} className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium capitalize text-foreground">
                                {name}
                              </span>
                              {v.failed > 0 && (
                                <Badge variant="destructive">{v.failed} fail</Badge>
                              )}
                            </div>
                            <span className="text-xs font-semibold text-foreground">
                              {v.sent} envíos
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Conversion Funnel */}
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
                <h2 className="mb-4 text-base font-semibold text-foreground">
                  Embudo de conversión
                </h2>
                <div className="space-y-4">
                  <FunnelRow
                    label="Enviados"
                    value={kpis.recipients.delivered + kpis.recipients.opened + kpis.recipients.clicked + kpis.recipients.bounced}
                    total={kpis.recipients.total}
                    color={COLORS.primary}
                  />
                  <FunnelRow
                    label="Entregados"
                    value={kpis.recipients.delivered + kpis.recipients.opened + kpis.recipients.clicked}
                    total={kpis.recipients.total}
                    color={COLORS.success}
                  />
                  <FunnelRow
                    label="Abiertos"
                    value={kpis.recipients.opened + kpis.recipients.clicked}
                    total={kpis.recipients.total}
                    color={COLORS.warning}
                  />
                  <FunnelRow
                    label="Click"
                    value={kpis.recipients.clicked}
                    total={kpis.recipients.total}
                    color="#a855f7"
                  />
                  <FunnelRow
                    label="Rebotados"
                    value={kpis.recipients.bounced}
                    total={kpis.recipients.total}
                    color={COLORS.danger}
                  />
                </div>
              </div>

              {/* Tabs: Campañas + Fallos */}
              <Tabs value={campaignTab} onValueChange={(v) => setCampaignTab(v as typeof campaignTab)}>
                <TabsList className="flex-wrap">
                  <TabsTrigger value="all">Todas las campañas ({campaignsCount})</TabsTrigger>
                  <TabsTrigger value="FINALIZADA">Finalizadas</TabsTrigger>
                  <TabsTrigger value="PROGRAMADA">Programadas</TabsTrigger>
                  <TabsTrigger value="EN_ANDAMENTO">En proceso</TabsTrigger>
                  <TabsTrigger value="CANCELADA">Canceladas</TabsTrigger>
                </TabsList>

                <TabsContent value={campaignTab}>
                  <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[960px] text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/40 text-left">
                            <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campaña</th>
                            <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</th>
                            <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Provider</th>
                            <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Enviados</th>
                            <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entregados</th>
                            <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aperturas</th>
                            <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clicks</th>
                            <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fallidos</th>
                            <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fecha</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {campaigns.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                                Sin campañas en este periodo
                              </td>
                            </tr>
                          ) : (
                            campaigns.map(c => (
                              <tr key={c.id} className="transition-colors hover:bg-accent/40">
                                <td className="px-4 py-3">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-sm font-semibold text-foreground">
                                      {c.name}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {c.subject?.slice(0, 50)}
                                    </span>
                                    {c.contactListName && (
                                      <span className="text-xs text-muted-foreground">
                                        📋 {c.contactListName}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant={STATUS_COLORS[c.status] || "neutral"}>
                                    {STATUS_LABELS[c.status] || c.status}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  {c.provider ? (
                                    <Badge variant="primary">{c.provider}</Badge>
                                  ) : (
                                    <Badge variant="neutral">—</Badge>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.totalSent}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.totalDelivered}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-success-text">{c.totalOpened}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-primary">{c.totalClicked}</td>
                                <td className={cn(
                                  "px-4 py-3 text-right tabular-nums",
                                  c.totalFailed + c.totalBounced > 0 ? "text-destructive-text" : "text-muted-foreground"
                                )}>
                                  {c.totalFailed + c.totalBounced}
                                </td>
                                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                                  {formatDate(c.completedAt || c.sendAt || c.createdAt)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Tabla fallos detallados */}
              {failures.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
                  <div className="mb-3 flex items-center gap-2">
                    <Prohibit className="size-5 text-destructive-text" aria-hidden />
                    <h2 className="text-base font-semibold text-foreground">
                      Recipients fallidos ({failures.length})
                    </h2>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[820px] text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/40 text-left">
                            <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</th>
                            <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campaña</th>
                            <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</th>
                            <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Razón</th>
                            <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fecha</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {failures.map((f, i) => (
                            <tr key={i} className="transition-colors hover:bg-accent/40">
                              <td className="px-4 py-3">
                                <span className="text-sm font-medium text-foreground">{f.email}</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs text-foreground">{f.campaignName}</span>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="destructive">{f.status}</Badge>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs text-muted-foreground">
                                  {f.bounceReason || f.errorMessage || "—"}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-xs text-foreground">
                                {formatDate(f.bouncedAt || f.sentAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

// ===========================================================================
// Subcomponentes
// ===========================================================================

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  color
}: {
  title: string
  value: number
  subtitle: string
  icon: React.ReactNode
  color: string
}) {
  return (
    <div
      className="h-full rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">
            {value.toLocaleString("es-ES")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${color}15`, color }}
        >
          {icon}
        </span>
      </div>
    </div>
  )
}

function FunnelRow({
  label,
  value,
  total,
  color
}: {
  label: string
  value: number
  total: number
  color: string
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm text-muted-foreground">
          <strong className="text-foreground">{value.toLocaleString("es-ES")}</strong> · {pct}%
        </span>
      </div>
      <LinearProgress
        determinate
        value={pct}
        sx={{
          "--LinearProgress-progressThickness": "8px",
          "--LinearProgress-thickness": "8px",
          "--LinearProgress-progressColor": color
        }}
      />
    </div>
  )
}
