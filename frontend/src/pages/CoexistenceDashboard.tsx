/**
 * CoexistenceDashboard — Panel de Monitoreo de Coexistencia WhatsApp
 *
 * Fase 4.3 + 4.5 del Plan de Coexistencia:
 * - Estado de conexiones Meta con coexistencia
 * - Alertas de liveness (13 días Business App)
 * - Estado de suscripción de webhooks
 * - Setup automático de la App
 * - Métricas de tokens y expiración
 */
import { useState, useEffect, useCallback, type ReactNode } from 'react'
// [Fase2·G] Progress se conserva en MUI Joy a propósito (no hay equivalente en el DS).
import { CircularProgress, LinearProgress } from '@mui/joy'
import {
  ArrowsClockwise,
  ArrowClockwise,
  CheckCircle,
  WarningCircle,
  Warning,
  Gear,
  CloudCheck,
  DeviceMobile,
  Timer,
  ShieldCheck,
  TrendUp,
  Link as LinkIcon,
  LinkBreak,
  Broadcast,
  Play,
  Info,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import api from '../services/api'
import EmbeddedSignupModal from '../components/EmbeddedSignupModal'
import CoexistenceConfigModal from '../components/CoexistenceConfigModal'

// Tipos
interface CoexistenceConnection {
  id: number
  name: string
  status: string
  number: string | null
  displayPhoneNumber: string | null
  phoneNumberId: string | null
  wabaId: string | null
  coexistence: {
    enabled: boolean
    status: string | null
    onboardedAt: string | null
    lastAppOpenedAt: string | null
    receiveChannel: string | null
    sendChannel: string | null
    linkedWhatsappId: number | null
    linkedWhatsappName: string | null
  }
}

interface LivenessAlert {
  whatsappId: number
  name: string
  level: 'warning' | 'critical' | 'disabled'
  daysSinceOpen: number
  message: string
}

interface CoexistenceStatusData {
  connections: CoexistenceConnection[]
  envCheck: {
    FACEBOOK_APP_ID: boolean
    FACEBOOK_APP_SECRET: boolean
    FB_GRAPH_VERSION: string
  }
  alerts: LivenessAlert[]
  summary: {
    totalMetaConnections: number
    coexistenceActive: number
    coexistencePending: number
    alertsCount: number
  }
}

interface SetupResult {
  success: boolean
  webhookSubscription: {
    configured: boolean
    callbackUrl: string
    fields: string[]
    error?: string
  }
  existingWabas: Array<{
    whatsappId: number
    name: string
    wabaId: string | null
    phoneNumberId: string | null
    subscribed: boolean
    subscriptionError?: string
  }>
  configId: {
    detected: boolean
    value: string | null
    instructions: string
  }
  envStatus: {
    FACEBOOK_APP_ID: boolean
    FACEBOOK_APP_SECRET: boolean
    FB_GRAPH_VERSION: string
    VERIFY_TOKEN: boolean
    META_WEBHOOK_URL: string
  }
}

interface AppStatusData {
  appConfigured: boolean
  subscriptions: Array<{
    object: string
    active: boolean
    callback_url?: string
    fields?: string[]
  }>
  webhookUrl: string
}

const columns = [
  'ID',
  'Nombre',
  'Numero',
  'Estado',
  'Coexistencia',
  'Recibir',
  'Enviar',
  'Business App',
  '',
]

/** KPI tile con icono — mismas superficies/tokens que `StatTile` del DS. */
function KpiTile({
  label,
  value,
  icon,
  tone = 'neutral',
}: {
  label: string
  value: number
  icon: ReactNode
  tone?: 'primary' | 'success' | 'warning' | 'destructive' | 'neutral'
}) {
  const iconTone: Record<string, string> = {
    primary: 'bg-primary/12 text-primary',
    success: 'bg-success/14 text-success-text',
    warning: 'bg-warning/16 text-warning-text',
    destructive: 'bg-destructive/12 text-destructive-text',
    neutral: 'bg-muted text-muted-foreground',
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
          {value}
        </p>
      </div>
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-full ${iconTone[tone]}`}
        aria-hidden
      >
        {icon}
      </span>
    </div>
  )
}

export default function CoexistenceDashboard() {
  const [loading, setLoading] = useState(true)
  const [statusData, setStatusData] = useState<CoexistenceStatusData | null>(null)
  const [appStatus, setAppStatus] = useState<AppStatusData | null>(null)
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null)
  const [setupLoading, setSetupLoading] = useState(false)
  const [embeddedSignupOpen, setEmbeddedSignupOpen] = useState(false)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [selectedConnection, setSelectedConnection] = useState<CoexistenceConnection | null>(null)

  const openConfigModal = (conn: CoexistenceConnection) => {
    setSelectedConnection(conn)
    setConfigModalOpen(true)
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statusRes, appRes] = await Promise.all([
        api.get('/whatsapp/coexistence/status'),
        api.get('/whatsapp/coexistence/app-status'),
      ])
      setStatusData(statusRes.data.data)
      setAppStatus(appRes.data.data)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      toast.error(error.response?.data?.error || 'Error cargando datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSetup = async () => {
    setSetupLoading(true)
    try {
      const { data } = await api.post('/whatsapp/coexistence/setup')
      setSetupResult(data.data)
      if (data.success) {
        toast.success('Setup de Meta completado exitosamente')
        fetchData()
      } else {
        toast.error('Setup parcial — revisa los detalles')
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      toast.error(error.response?.data?.error || 'Error en setup')
    } finally {
      setSetupLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <CircularProgress size="lg" />
          <p className="text-sm text-muted-foreground">Cargando panel de coexistencia...</p>
        </div>
      </div>
    )
  }

  const summary = statusData?.summary
  const alerts = statusData?.alerts || []
  const connections = statusData?.connections || []

  const statusBadge = (status: string): { label: string; variant: BadgeProps['variant'] } => {
    if (status === 'CONNECTED') return { label: 'Conectado', variant: 'success' }
    if (status === 'DISCONNECTED') return { label: 'Desconectado', variant: 'destructive' }
    return { label: status, variant: 'warning' }
  }

  const coexBadge = (
    status: string | null,
  ): { label: string; variant: BadgeProps['variant'] } => {
    if (status === 'active') return { label: 'Activa', variant: 'success' }
    if (status === 'disabled') return { label: 'Desactivada', variant: 'destructive' }
    if (status === 'syncing') return { label: 'Sincronizando', variant: 'primary' }
    return { label: 'Pendiente', variant: 'warning' }
  }

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <ArrowsClockwise className="size-6" weight="fill" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Coexistencia WhatsApp
                </h1>
                <p className="text-sm text-muted-foreground">
                  Business App + Cloud API — Monitoreo y Configuracion
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip title="Actualizar datos">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Actualizar datos"
                  className="text-muted-foreground"
                  onClick={fetchData}
                >
                  <ArrowClockwise className="size-5" aria-hidden />
                </Button>
              </Tooltip>
              <Button size="sm" onClick={() => setEmbeddedSignupOpen(true)}>
                <Play className="size-4" weight="fill" aria-hidden />
                Nueva Conexion
              </Button>
            </div>
          </div>

          {/* Alertas de Liveness */}
          {alerts.length > 0 && (
            <div className="space-y-2">
              {alerts.map((alert) => {
                const isDisabled = alert.level === 'disabled'
                const isCritical = alert.level === 'critical'
                const tone = isDisabled
                  ? 'border-destructive/30 bg-destructive/12 text-destructive-text'
                  : isCritical
                    ? 'border-warning/30 bg-warning/16 text-warning-text'
                    : 'border-border bg-muted text-muted-foreground'
                return (
                  <div
                    key={alert.whatsappId}
                    role="status"
                    className={`flex items-start gap-3 rounded-lg border p-3 ${tone}`}
                  >
                    <span className="mt-0.5 shrink-0" aria-hidden>
                      {isDisabled ? (
                        <WarningCircle className="size-5" weight="fill" />
                      ) : (
                        <Warning className="size-5" weight="fill" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {alert.name} —{' '}
                        {isDisabled ? 'DESACTIVADA' : isCritical ? 'CRITICO' : 'ADVERTENCIA'}
                      </p>
                      <p className="text-xs">
                        {alert.message} ({alert.daysSinceOpen} dias sin abrir la Business App)
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiTile
              label="Conexiones Meta"
              value={summary?.totalMetaConnections || 0}
              tone="primary"
              icon={<LinkIcon className="size-5" weight="bold" />}
            />
            <KpiTile
              label="Coex Activas"
              value={summary?.coexistenceActive || 0}
              tone="success"
              icon={<CheckCircle className="size-5" weight="fill" />}
            />
            <KpiTile
              label="Pendientes"
              value={summary?.coexistencePending || 0}
              tone="warning"
              icon={<Timer className="size-5" weight="fill" />}
            />
            <KpiTile
              label="Alertas"
              value={summary?.alertsCount || 0}
              tone={alerts.length > 0 ? 'destructive' : 'neutral'}
              icon={
                alerts.length > 0 ? (
                  <Warning className="size-5" weight="fill" />
                ) : (
                  <ShieldCheck className="size-5" weight="fill" />
                )
              }
            />
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left: Tabla de Conexiones */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] lg:col-span-2">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <DeviceMobile className="size-5 text-muted-foreground" aria-hidden />
                  Conexiones con Coexistencia
                </h2>
                <Badge variant="outline">{connections.length} registros</Badge>
              </div>

              {connections.length === 0 ? (
                <div className="py-12 text-center">
                  <LinkBreak className="mx-auto mb-2 size-12 text-muted-foreground" aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    No hay conexiones Meta configuradas
                  </p>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Usa "Nueva Conexion" para configurar Embedded Signup
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setEmbeddedSignupOpen(true)}>
                    <CloudCheck className="size-4" aria-hidden />
                    Conectar WhatsApp Business
                  </Button>
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-left">
                          {columns.map((c, i) => (
                            <th
                              key={i}
                              className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {connections.map((conn) => {
                          const daysSinceOpen = conn.coexistence.lastAppOpenedAt
                            ? Math.floor(
                                (Date.now() -
                                  new Date(conn.coexistence.lastAppOpenedAt).getTime()) /
                                  (1000 * 60 * 60 * 24)
                              )
                            : null
                          const st = statusBadge(conn.status)
                          const coex = coexBadge(conn.coexistence.status)

                          return (
                            <tr key={conn.id} className="transition-colors hover:bg-accent/40">
                              <td className="px-3 py-3">
                                <span className="text-xs font-semibold tabular-nums text-foreground">
                                  #{conn.id}
                                </span>
                              </td>
                              <td className="px-3 py-3">
                                <span className="block text-sm font-medium text-foreground">
                                  {conn.name}
                                </span>
                                {conn.wabaId && (
                                  <span className="block text-xs text-muted-foreground">
                                    WABA: {conn.wabaId}
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-3 tabular-nums text-muted-foreground">
                                {conn.displayPhoneNumber || conn.number || '—'}
                              </td>
                              <td className="px-3 py-3">
                                <Badge variant={st.variant} dot>
                                  {st.label}
                                </Badge>
                              </td>
                              <td className="px-3 py-3">
                                {conn.coexistence.enabled ? (
                                  <Badge variant={coex.variant}>{coex.label}</Badge>
                                ) : (
                                  <Badge variant="neutral">No</Badge>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <Badge
                                  variant={
                                    conn.coexistence.receiveChannel === 'both'
                                      ? 'primary'
                                      : conn.coexistence.receiveChannel === 'meta'
                                        ? 'success'
                                        : 'warning'
                                  }
                                >
                                  {conn.coexistence.receiveChannel === 'both'
                                    ? 'Ambos'
                                    : conn.coexistence.receiveChannel === 'meta'
                                      ? 'Meta'
                                      : 'Baileys'}
                                </Badge>
                              </td>
                              <td className="px-3 py-3">
                                <Badge
                                  variant={
                                    conn.coexistence.sendChannel === 'meta' ? 'success' : 'warning'
                                  }
                                >
                                  {conn.coexistence.sendChannel === 'meta' ? 'Meta API' : 'Baileys'}
                                </Badge>
                              </td>
                              <td className="px-3 py-3">
                                {daysSinceOpen !== null ? (
                                  <div className="flex flex-col gap-1">
                                    <span
                                      className={`text-xs font-semibold ${
                                        daysSinceOpen >= 13
                                          ? 'text-destructive-text'
                                          : daysSinceOpen >= 11
                                            ? 'text-warning-text'
                                            : 'text-success-text'
                                      }`}
                                    >
                                      {daysSinceOpen === 0 ? 'Hoy' : `Hace ${daysSinceOpen}d`}
                                    </span>
                                    {daysSinceOpen >= 11 && (
                                      <LinearProgress
                                        determinate
                                        value={Math.min((daysSinceOpen / 14) * 100, 100)}
                                        color={daysSinceOpen >= 13 ? 'danger' : 'warning'}
                                        sx={{ height: 4, borderRadius: 2 }}
                                      />
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Sin datos</span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center justify-end">
                                  <Tooltip title="Configurar coexistencia">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-8"
                                      aria-label={`Configurar coexistencia de ${conn.name}`}
                                      onClick={() => openConfigModal(conn)}
                                    >
                                      <Gear className="size-[18px]" aria-hidden />
                                    </Button>
                                  </Tooltip>
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
            </div>

            {/* Right: Panel de Configuración */}
            <div className="space-y-4">
              {/* Estado de la App */}
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
                <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
                  <Gear className="size-5 text-muted-foreground" aria-hidden />
                  Configuracion de la App
                </h2>

                <div className="space-y-3">
                  {/* Webhook Status */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm text-foreground">
                      <Broadcast className="size-[18px] text-muted-foreground" aria-hidden />
                      Webhooks WBA
                    </span>
                    <Badge variant={appStatus?.appConfigured ? 'success' : 'destructive'}>
                      {appStatus?.appConfigured ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>

                  {/* Env Variables */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm text-foreground">
                      <ShieldCheck className="size-[18px] text-muted-foreground" aria-hidden />
                      App ID
                    </span>
                    <Badge variant={statusData?.envCheck.FACEBOOK_APP_ID ? 'success' : 'destructive'}>
                      {statusData?.envCheck.FACEBOOK_APP_ID ? 'OK' : 'Falta'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm text-foreground">
                      <ShieldCheck className="size-[18px] text-muted-foreground" aria-hidden />
                      App Secret
                    </span>
                    <Badge
                      variant={statusData?.envCheck.FACEBOOK_APP_SECRET ? 'success' : 'destructive'}
                    >
                      {statusData?.envCheck.FACEBOOK_APP_SECRET ? 'OK' : 'Falta'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm text-foreground">
                      <TrendUp className="size-[18px] text-muted-foreground" aria-hidden />
                      Graph API
                    </span>
                    <Badge variant="outline">{statusData?.envCheck.FB_GRAPH_VERSION || 'N/A'}</Badge>
                  </div>

                  {/* Webhook URL */}
                  {appStatus?.webhookUrl && (
                    <div className="pt-1">
                      <p className="mb-1 text-xs text-muted-foreground">Webhook URL:</p>
                      <p className="break-all rounded-sm bg-muted px-2 py-1 font-mono text-xs text-foreground">
                        {appStatus.webhookUrl}
                      </p>
                    </div>
                  )}

                  <div className="border-t border-border" />

                  {/* Setup Button */}
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={handleSetup}
                    loading={setupLoading}
                  >
                    {!setupLoading && <Gear className="size-4" aria-hidden />}
                    {appStatus?.appConfigured
                      ? 'Re-configurar App'
                      : 'Configurar App Automaticamente'}
                  </Button>
                </div>
              </div>

              {/* Setup Result */}
              {setupResult && (
                <div
                  className={`rounded-xl border bg-card p-5 shadow-sm shadow-black/[0.02] ${
                    setupResult.success ? 'border-success/40' : 'border-warning/40'
                  }`}
                >
                  <h3
                    className={`mb-3 flex items-center gap-2 text-sm font-semibold ${
                      setupResult.success ? 'text-success-text' : 'text-warning-text'
                    }`}
                  >
                    {setupResult.success ? (
                      <CheckCircle className="size-[18px]" weight="fill" aria-hidden />
                    ) : (
                      <Warning className="size-[18px]" weight="fill" aria-hidden />
                    )}
                    Resultado del Setup
                  </h3>

                  <div className="space-y-3">
                    {/* Webhook */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-foreground">Webhook suscripcion</span>
                      <Badge
                        variant={
                          setupResult.webhookSubscription.configured ? 'success' : 'destructive'
                        }
                      >
                        {setupResult.webhookSubscription.configured ? 'OK' : 'Error'}
                      </Badge>
                    </div>

                    {setupResult.webhookSubscription.error && (
                      <p
                        role="alert"
                        className="rounded-lg border border-destructive/30 bg-destructive/12 p-2 text-xs text-destructive-text"
                      >
                        {setupResult.webhookSubscription.error}
                      </p>
                    )}

                    {/* Campos suscritos */}
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">Campos webhook:</p>
                      <div className="flex flex-wrap gap-1">
                        {setupResult.webhookSubscription.fields.map((field) => (
                          <Badge key={field} variant="outline">
                            {field}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* WABAs */}
                    {setupResult.existingWabas.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">WABAs verificados:</p>
                        {setupResult.existingWabas.map((waba) => (
                          <div
                            key={waba.whatsappId}
                            className="flex items-center justify-between gap-2 py-1"
                          >
                            <span className="truncate text-xs text-foreground">{waba.name}</span>
                            <Badge variant={waba.subscribed ? 'success' : 'destructive'}>
                              {waba.subscribed ? 'Suscrito' : 'No suscrito'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="border-t border-border" />

                    {/* Config ID */}
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          Config ID (Embedded Signup)
                        </span>
                        <Badge variant={setupResult.configId.detected ? 'success' : 'neutral'}>
                          {setupResult.configId.detected ? 'Detectado' : 'No configurado'}
                        </Badge>
                      </div>
                      {setupResult.configId.value && (
                        <p className="break-all rounded-sm bg-muted px-2 py-1 font-mono text-xs text-foreground">
                          {setupResult.configId.value}
                        </p>
                      )}
                      <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                        {setupResult.configId.instructions}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Info Card */}
              <div className="rounded-xl border border-border bg-accent/60 p-5">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Info className="size-[18px] text-muted-foreground" weight="fill" aria-hidden />
                  Sobre la Coexistencia
                </h3>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>
                    La coexistencia permite usar la WhatsApp Business App y la Cloud API
                    simultaneamente en el mismo numero de telefono.
                  </p>
                  <p>
                    <strong className="font-semibold text-foreground">Requisito:</strong> Abrir la
                    Business App al menos cada 14 dias para mantener la coexistencia activa.
                  </p>
                  <p>
                    <strong className="font-semibold text-foreground">Tokens:</strong> Se renuevan
                    automaticamente cada 50 dias (antes de la expiracion de 60 dias).
                  </p>
                  <p>
                    <strong className="font-semibold text-foreground">Historial:</strong> Se
                    sincroniza automaticamente via webhooks cuando se activa la coexistencia.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Embedded Signup Modal */}
        <EmbeddedSignupModal
          open={embeddedSignupOpen}
          onClose={() => setEmbeddedSignupOpen(false)}
          onSuccess={fetchData}
        />

        {/* Coexistence Config Modal */}
        <CoexistenceConfigModal
          open={configModalOpen}
          onClose={() => setConfigModalOpen(false)}
          connection={selectedConnection}
          onSaved={fetchData}
        />
      </div>
    </TooltipProvider>
  )
}
