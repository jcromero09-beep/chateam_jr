import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircularProgress } from '@mui/joy'
import {
  WhatsappLogo,
  CheckCircle,
  XCircle,
  Warning,
  TrendUp,
  Users,
  ChatCircle,
  Clock,
  ArrowClockwise,
  Gear,
  Plus,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { StatTile } from '@/components/ui/stat-tile'
import { RowAction } from '@/components/ui/row-action'
import api from '../services/api'

// Interfaces
interface WhatsAppConnection {
  id: number
  name: string
  number: string
  status: string
  channel: string
  messagesLast24h: number
  lastSync: string
}

interface DashboardMetrics {
  totalConnections: number
  activeConnections: number
  messagesLast24h: number
  messagesSent24h: number
  messagesReceived24h: number
  activeConversations: number
  avgResponseTime: number
}

interface DashboardData {
  connections: WhatsAppConnection[]
  metrics: DashboardMetrics
}

const tableColumns = ['Número / Nombre', 'Estado', 'Mensajes 24h', 'Última Sincronización', 'Acciones']

export default function WhatsAppDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connections, setConnections] = useState<WhatsAppConnection[]>([])
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalConnections: 0,
    activeConnections: 0,
    messagesLast24h: 0,
    messagesSent24h: 0,
    messagesReceived24h: 0,
    activeConversations: 0,
    avgResponseTime: 0,
  })

  // Cargar datos del dashboard
  const loadDashboard = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get<DashboardData>('/whatsapp-meta/dashboard')
      setConnections(response.data.connections)
      setMetrics(response.data.metrics)
    } catch (err: any) {
      console.error('Error loading WhatsApp Meta dashboard:', err)
      setError(err.response?.data?.message || 'Error al cargar el dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  // Funciones auxiliares
  const getStatusVariant = (status: string): BadgeProps['variant'] => {
    switch (status.toUpperCase()) {
      case 'CONNECTED':
      case 'QRCODE':
        return 'success'
      case 'DISCONNECTED':
        return 'neutral'
      case 'ERROR':
      case 'TIMEOUT':
        return 'destructive'
      case 'PENDING':
      case 'OPENING':
        return 'warning'
      default:
        return 'neutral'
    }
  }

  const getStatusText = (status: string) => {
    switch (status.toUpperCase()) {
      case 'CONNECTED':
        return 'Conectado'
      case 'DISCONNECTED':
        return 'Desconectado'
      case 'QRCODE':
        return 'QR Code'
      case 'ERROR':
        return 'Error'
      case 'TIMEOUT':
        return 'Timeout'
      case 'PENDING':
        return 'Pendiente'
      case 'OPENING':
        return 'Iniciando'
      default:
        return status || 'Desconocido'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status.toUpperCase()) {
      case 'CONNECTED':
        return <CheckCircle className="size-3.5" weight="fill" aria-hidden />
      case 'ERROR':
      case 'TIMEOUT':
        return <XCircle className="size-3.5" weight="fill" aria-hidden />
      case 'PENDING':
      case 'OPENING':
      case 'QRCODE':
        return <Clock className="size-3.5" weight="fill" aria-hidden />
      default:
        return <Warning className="size-3.5" weight="fill" aria-hidden />
    }
  }

  const formatResponseTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`
    return `${Math.round(seconds / 3600)}h`
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const handleRefresh = () => {
    loadDashboard()
  }

  const handleAddConnection = () => {
    navigate('/connections')
  }

  const handleViewConnection = (_id: number) => {
    navigate(`/connections`)
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <CircularProgress size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-destructive/30 bg-destructive/12 p-5">
          <h2 className="text-base font-semibold text-destructive-text">
            Error al cargar el dashboard
          </h2>
          <p className="mt-1 text-sm text-destructive-text">{error}</p>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-4">
            Reintentar
          </Button>
        </div>
      </div>
    )
  }

  const availability =
    metrics.totalConnections > 0
      ? Math.round((metrics.activeConnections / metrics.totalConnections) * 100)
      : 0
  const allActive =
    metrics.totalConnections > 0 && metrics.activeConnections === metrics.totalConnections

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-wa/15 text-wa">
              <WhatsappLogo className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                WhatsApp Business API Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestión y monitoreo de conexiones WhatsApp Cloud API (canal Meta)
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualizar datos"
            className="text-muted-foreground"
            onClick={handleRefresh}
          >
            <ArrowClockwise className="size-5" aria-hidden />
          </Button>
        </div>

        {/* KPIs Principales - 3 cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {/* Conexiones Activas */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-center justify-between">
              <div>
                <p className="mb-1 text-sm text-muted-foreground">Conexiones Activas</p>
                <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  {metrics.activeConnections}/{metrics.totalConnections}
                </p>
                <div className="mt-2">
                  <Badge variant={allActive ? 'success' : 'warning'}>
                    {metrics.totalConnections > 0
                      ? `${availability}% Disponibilidad`
                      : 'Sin conexiones'}
                  </Badge>
                </div>
              </div>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-success/14 text-success-text">
                <CheckCircle className="size-6" weight="fill" aria-hidden />
              </span>
            </div>
          </div>

          {/* Mensajes (24h) */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-center justify-between">
              <div>
                <p className="mb-1 text-sm text-muted-foreground">Mensajes (24h)</p>
                <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  {metrics.messagesLast24h.toLocaleString()}
                </p>
                <div className="mt-2 flex items-center gap-1">
                  {metrics.messagesLast24h > 0 ? (
                    <>
                      <TrendUp className="size-4 text-success-text" weight="bold" aria-hidden />
                      <span className="text-xs text-muted-foreground">
                        {metrics.messagesSent24h} enviados / {metrics.messagesReceived24h} recibidos
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin actividad</span>
                  )}
                </div>
              </div>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                <ChatCircle className="size-6" weight="fill" aria-hidden />
              </span>
            </div>
          </div>

          {/* Conversaciones Activas */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-center justify-between">
              <div>
                <p className="mb-1 text-sm text-muted-foreground">Conversaciones Activas</p>
                <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  {metrics.activeConversations}
                </p>
                <div className="mt-2 flex items-center gap-1">
                  {metrics.avgResponseTime > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      Resp. promedio: {formatResponseTime(metrics.avgResponseTime)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Tickets abiertos/pendientes
                    </span>
                  )}
                </div>
              </div>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-warning/16 text-warning-text">
                <Users className="size-6" weight="fill" aria-hidden />
              </span>
            </div>
          </div>
        </div>

        {/* Métricas Secundarias */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <h2 className="mb-4 text-base font-semibold text-foreground">
            Estadísticas de Mensajes (24h)
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Enviados" value={metrics.messagesSent24h.toLocaleString()} tone="primary" />
            <StatTile
              label="Recibidos"
              value={metrics.messagesReceived24h.toLocaleString()}
              tone="success"
            />
            <StatTile
              label="Tasa de Respuesta"
              value={
                metrics.messagesReceived24h > 0
                  ? `${Math.round((metrics.messagesSent24h / metrics.messagesReceived24h) * 100)}%`
                  : '0%'
              }
              tone="warning"
            />
            <StatTile
              label="Tiempo Promedio"
              value={metrics.avgResponseTime > 0 ? formatResponseTime(metrics.avgResponseTime) : '-'}
              tone="primary"
            />
          </div>
        </div>

        {/* Tabla de Conexiones */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">
              Conexiones WhatsApp Business API
            </h2>
            <Button size="sm" onClick={handleAddConnection}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Agregar Conexión
            </Button>
          </div>

          {connections.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-border bg-card px-4 py-10 text-center shadow-sm shadow-black/[0.02]">
              <WhatsappLogo className="mb-3 size-12 text-muted-foreground" aria-hidden />
              <p className="mb-4 text-sm text-muted-foreground">
                No hay conexiones WhatsApp Cloud API configuradas
              </p>
              <Button variant="outline" size="sm" onClick={handleAddConnection}>
                <Plus className="size-4" weight="bold" aria-hidden />
                Agregar tu primera conexión
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      {tableColumns.map((c, i) => (
                        <th
                          key={i}
                          className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                            i === tableColumns.length - 1 ? 'text-center' : ''
                          }`}
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {connections.map((connection) => (
                      <tr key={connection.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-foreground">
                              {connection.number || '-'}
                            </p>
                            <p className="text-xs text-muted-foreground">{connection.name}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={getStatusVariant(connection.status)}>
                            {getStatusIcon(connection.status)}
                            {getStatusText(connection.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-medium tabular-nums text-foreground">
                          {connection.messagesLast24h.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {formatDate(connection.lastSync)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-0.5">
                            <RowAction label="Ver configuración">
                              <button
                                type="button"
                                aria-label="Ver configuración"
                                onClick={() => handleViewConnection(connection.id)}
                                className="flex size-full items-center justify-center"
                              >
                                <Gear className="size-[18px]" aria-hidden />
                              </button>
                            </RowAction>
                          </div>
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
  )
}
