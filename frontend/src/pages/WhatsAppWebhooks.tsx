import { useState, useEffect } from 'react'
import { LinearProgress } from '@mui/joy'
import {
  WebhooksLogo,
  CheckCircle,
  XCircle,
  ArrowClockwise,
  Copy,
  Eye,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { RowAction } from '@/components/ui/row-action'
import api from '../services/api'

interface WebhookEvent {
  id: number
  event: string
  status: 'success' | 'failed' | 'pending'
  timestamp: string
  responseCode: number
  responseTime: number
  payload: string
  retries: number
}

const columns = [
  'Timestamp',
  'Evento',
  'Estado',
  'Código HTTP',
  'Tiempo Respuesta',
  'Reintentos',
  'Acciones',
]

const subscribedEvents = ['messages', 'message_status', 'message_reactions', 'contacts']

const incomingPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA_ID',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15550123456',
              phone_number_id: 'PHONE_NUMBER_ID',
            },
            contacts: [{ profile: { name: 'Usuario' }, wa_id: '15559876543' }],
            messages: [
              {
                from: '15559876543',
                id: 'wamid.xxxxx',
                timestamp: '1697200000',
                type: 'text',
                text: { body: 'Hola' },
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
}

const statusPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          value: {
            statuses: [
              {
                id: 'wamid.xxxxx',
                status: 'delivered',
                timestamp: '1697200100',
                recipient_id: '15559876543',
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
}

export default function WhatsAppWebhooks() {
  const [webhookUrl, setWebhookUrl] = useState('')
  const [verifyToken, setVerifyToken] = useState('')
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [stats, setStats] = useState({
    totalEvents: 0,
    successRate: 0,
    avgResponseTime: 0,
    failedLast24h: 0,
  })
  const [loading, setLoading] = useState(false)

  const fetchConfig = async () => {
    try {
      const { data } = await api.get('/whatsapp/webhooks/config')
      const config = data?.data ?? data ?? {}
      setWebhookUrl(config.webhookUrl ?? '')
      setVerifyToken(config.verifyToken ?? '')
      if (config.stats) setStats(config.stats)
    } catch {
      // mantener vacío en error
    }
  }

  const fetchEvents = async () => {
    try {
      const { data } = await api.get('/whatsapp/webhooks/events')
      setEvents(data?.data ?? data ?? [])
    } catch {
      setEvents([])
    }
  }

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true)
      await Promise.all([fetchConfig(), fetchEvents()])
      setLoading(false)
    }
    loadAll()
  }, [])

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const getStatusVariant = (status: WebhookEvent['status']): BadgeProps['variant'] => {
    switch (status) {
      case 'success':
        return 'success'
      case 'failed':
        return 'destructive'
      case 'pending':
        return 'warning'
      default:
        return 'neutral'
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <WebhooksLogo className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Webhooks WhatsApp
              </h1>
              <p className="text-sm text-muted-foreground">
                Configuración y monitoreo de webhooks para eventos de WhatsApp Business API
              </p>
            </div>
          </div>
        </div>

        {loading && <LinearProgress />}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Eventos Totales" value={stats.totalEvents.toLocaleString()} />
          <StatTile label="Tasa de Éxito" value={`${stats.successRate}%`} tone="success" />
          <StatTile
            label="Tiempo Respuesta Promedio"
            value={`${stats.avgResponseTime}ms`}
            tone="primary"
          />
          <StatTile
            label="Fallidos (24h)"
            value={String(stats.failedLast24h)}
            tone="destructive"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="config">
          <TabsList>
            <TabsTrigger value="config">Configuración</TabsTrigger>
            <TabsTrigger value="events">Eventos Recientes</TabsTrigger>
            <TabsTrigger value="docs">Documentación</TabsTrigger>
          </TabsList>

          {/* Tab: Configuración */}
          <TabsContent value="config">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Configuración del Webhook */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
                <h2 className="mb-4 text-lg font-semibold text-foreground">
                  Configuración del Webhook
                </h2>

                <div className="mb-5 space-y-1.5">
                  <Label htmlFor="webhook-url">URL del Webhook</Label>
                  <div className="flex items-center gap-2">
                    <input
                      id="webhook-url"
                      value={webhookUrl}
                      readOnly
                      className="h-11 w-full flex-1 rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Copiar URL del webhook"
                      onClick={() => handleCopy(webhookUrl)}
                    >
                      <Copy className="size-5" aria-hidden />
                    </Button>
                  </div>
                </div>

                <div className="mb-5 space-y-1.5">
                  <Label htmlFor="verify-token">Verify Token</Label>
                  <div className="flex items-center gap-2">
                    <input
                      id="verify-token"
                      value={verifyToken}
                      readOnly
                      className="h-11 w-full flex-1 rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Copiar verify token"
                      onClick={() => handleCopy(verifyToken)}
                    >
                      <Copy className="size-5" aria-hidden />
                    </Button>
                  </div>
                </div>

                <div className="mb-5">
                  <p className="mb-2 text-sm font-medium text-foreground">Eventos Suscritos</p>
                  <div className="flex flex-wrap gap-2">
                    {subscribedEvents.map((ev) => (
                      <Badge key={ev} variant="primary">
                        {ev}
                      </Badge>
                    ))}
                  </div>
                </div>

                <Button className="w-full">
                  <ArrowClockwise className="size-4" aria-hidden />
                  Probar Webhook
                </Button>
              </div>

              {/* Estado del Webhook */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
                <h2 className="mb-4 text-lg font-semibold text-foreground">
                  Estado del Webhook
                </h2>

                <div className="mb-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Estado</span>
                    <Badge variant="success">
                      <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                      Activo
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Último Evento</span>
                    <span className="text-sm text-foreground">Hace 2 minutos</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Verificación Meta</span>
                    <Badge variant="success">Verificado</Badge>
                  </div>
                </div>

                <p className="mb-2 mt-6 text-sm font-medium text-foreground">
                  Configuración en Meta Dashboard
                </p>
                <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
                  <li>Ve a Meta Developer Console</li>
                  <li>Selecciona tu App</li>
                  <li>Ve a WhatsApp {'>'} Configuration</li>
                  <li>Configura la URL del webhook</li>
                  <li>Ingresa el verify token</li>
                  <li>Suscríbete a los eventos necesarios</li>
                </ol>
              </div>
            </div>
          </TabsContent>

          {/* Tab: Eventos Recientes */}
          <TabsContent value="events">
            <div className="rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
              <div className="border-b border-border px-6 py-4">
                <h2 className="text-base font-semibold text-foreground">Eventos Recientes</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      {columns.map((c, i) => (
                        <th
                          key={i}
                          className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground${
                            c === 'Acciones' ? ' text-center' : ''
                          }`}
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {events.length === 0 && !loading ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-10 text-center text-muted-foreground"
                        >
                          No hay eventos de webhook registrados.
                        </td>
                      </tr>
                    ) : (
                      events.map((event) => (
                        <tr key={event.id} className="transition-colors hover:bg-accent/40">
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {event.timestamp}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{event.event}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={getStatusVariant(event.status)}>
                              {event.status === 'success' ? (
                                <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                              ) : (
                                <XCircle className="size-3.5" weight="fill" aria-hidden />
                              )}
                              {event.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-semibold tabular-nums text-foreground">
                            {event.responseCode}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-muted-foreground">
                            {event.responseTime}ms
                          </td>
                          <td className="px-4 py-3 tabular-nums text-muted-foreground">
                            {event.retries}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-0.5">
                              <RowAction label="Ver payload">
                                <Eye className="size-[18px]" aria-hidden />
                              </RowAction>
                              <RowAction label="Reintentar">
                                <ArrowClockwise className="size-[18px]" aria-hidden />
                              </RowAction>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* Tab: Documentación */}
          <TabsContent value="docs">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                Documentación de Webhooks
              </h2>

              <h3 className="mb-2 mt-2 text-base font-semibold text-foreground">
                Ejemplo de Payload - Mensaje Entrante
              </h3>
              <div className="mb-4 overflow-auto rounded-md border border-border bg-muted/50 p-4 font-mono text-sm text-foreground">
                <pre className="m-0">{JSON.stringify(incomingPayload, null, 2)}</pre>
              </div>

              <h3 className="mb-2 text-base font-semibold text-foreground">
                Ejemplo de Payload - Estado de Mensaje
              </h3>
              <div className="overflow-auto rounded-md border border-border bg-muted/50 p-4 font-mono text-sm text-foreground">
                <pre className="m-0">{JSON.stringify(statusPayload, null, 2)}</pre>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
