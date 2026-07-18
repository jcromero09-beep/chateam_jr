import * as React from 'react'
import { useState } from 'react'
import {
  Broadcast,
  Plus,
  PencilSimple,
  Trash,
  Play,
  CheckCircle,
  WarningCircle,
  Copy,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface Webhook {
  id: number
  name: string
  endpoint: string
  integration: 'Billie' | 'Aria Lite' | 'SmartTrack' | 'SGR' | 'Custom'
  events: string[]
  status: 'active' | 'inactive' | 'error'
  lastTrigger: string
  triggerCount: number
  enabled: boolean
}

interface WebhookLog {
  id: number
  webhookName: string
  endpoint: string
  event: string
  status: 'success' | 'failed'
  timestamp: string
  responseTime: number
  statusCode: number
}

// Botón de acción de fila (mismo look que RowAction, con onClick y ref para Tooltip asChild).
const ActionBtn = React.forwardRef<
  HTMLButtonElement,
  {
    label: string
    onClick: () => void
    className?: string
    children: React.ReactNode
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ label, onClick, className, children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={label}
    onClick={onClick}
    className={cn(
      'flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
      className,
    )}
    {...props}
  >
    {children}
  </button>
))
ActionBtn.displayName = 'ActionBtn'

// Toggle accesible (role="switch"). No hay componente Switch en @/components/ui.
function Toggle({
  checked,
  onChange,
  id,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  id?: string
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
        aria-hidden
      />
    </button>
  )
}

// KPI con caption (StatTile no soporta la línea inferior).
function KpiTile({
  label,
  value,
  caption,
  captionTone = 'muted',
}: {
  label: string
  value: string
  caption: string
  captionTone?: 'muted' | 'success'
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      <p
        className={cn(
          'mt-1 text-xs',
          captionTone === 'success' ? 'text-success-text' : 'text-muted-foreground',
        )}
      >
        {caption}
      </p>
    </div>
  )
}

const webhookColumns = [
  'Nombre',
  'Endpoint URL',
  'Integración',
  'Eventos',
  'Estado',
  'Último Trigger',
  'Total Triggers',
  '',
]

const logColumns = [
  'Timestamp',
  'Webhook',
  'Evento',
  'Estado',
  'Status Code',
  'Tiempo Respuesta',
]

export default function IntegrationsWebhooks() {
  const [openModal, setOpenModal] = useState(false)
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null)
  const [filterIntegration, setFilterIntegration] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const [formData, setFormData] = useState({
    name: '',
    endpoint: '',
    integration: 'Custom',
    events: [] as string[],
    enabled: true,
    secret: '',
    retryAttempts: 3,
    timeout: 30,
  })

  const webhooks: Webhook[] = [
    {
      id: 1,
      name: 'Billie Sync Webhook',
      endpoint: 'https://api.jrchateam.com/webhooks/billie/sync',
      integration: 'Billie',
      events: ['contact.created', 'contact.updated', 'invoice.created'],
      status: 'active',
      lastTrigger: '2025-10-13 10:45:23',
      triggerCount: 1245,
      enabled: true,
    },
    {
      id: 2,
      name: 'Aria Lite CRM Events',
      endpoint: 'https://api.jrchateam.com/webhooks/aria/events',
      integration: 'Aria Lite',
      events: ['lead.created', 'opportunity.updated', 'customer.created'],
      status: 'active',
      lastTrigger: '2025-10-13 10:40:12',
      triggerCount: 876,
      enabled: true,
    },
    {
      id: 3,
      name: 'SmartTrack Shipment Updates',
      endpoint: 'https://api.jrchateam.com/webhooks/smarttrack/shipments',
      integration: 'SmartTrack',
      events: ['shipment.created', 'shipment.updated', 'shipment.delivered'],
      status: 'active',
      lastTrigger: '2025-10-13 10:35:45',
      triggerCount: 2341,
      enabled: true,
    },
    {
      id: 4,
      name: 'SGR Claims Notification',
      endpoint: 'https://api.jrchateam.com/webhooks/sgr/claims',
      integration: 'SGR',
      events: ['claim.created', 'claim.updated', 'claim.closed'],
      status: 'active',
      lastTrigger: '2025-10-13 10:35:18',
      triggerCount: 567,
      enabled: true,
    },
    {
      id: 5,
      name: 'Custom Payment Webhook',
      endpoint: 'https://external.api.com/payment/notify',
      integration: 'Custom',
      events: ['payment.completed', 'payment.failed'],
      status: 'error',
      lastTrigger: '2025-10-13 09:15:22',
      triggerCount: 23,
      enabled: false,
    },
  ]

  const recentLogs: WebhookLog[] = [
    {
      id: 1,
      webhookName: 'Billie Sync Webhook',
      endpoint: 'https://api.jrchateam.com/webhooks/billie/sync',
      event: 'contact.updated',
      status: 'success',
      timestamp: '2025-10-13 10:45:23',
      responseTime: 145,
      statusCode: 200,
    },
    {
      id: 2,
      webhookName: 'Aria Lite CRM Events',
      endpoint: 'https://api.jrchateam.com/webhooks/aria/events',
      event: 'lead.created',
      status: 'success',
      timestamp: '2025-10-13 10:40:12',
      responseTime: 98,
      statusCode: 200,
    },
    {
      id: 3,
      webhookName: 'SmartTrack Shipment Updates',
      endpoint: 'https://api.jrchateam.com/webhooks/smarttrack/shipments',
      event: 'shipment.updated',
      status: 'success',
      timestamp: '2025-10-13 10:35:45',
      responseTime: 203,
      statusCode: 200,
    },
    {
      id: 4,
      webhookName: 'SGR Claims Notification',
      endpoint: 'https://api.jrchateam.com/webhooks/sgr/claims',
      event: 'claim.created',
      status: 'success',
      timestamp: '2025-10-13 10:35:18',
      responseTime: 167,
      statusCode: 200,
    },
    {
      id: 5,
      webhookName: 'Custom Payment Webhook',
      endpoint: 'https://external.api.com/payment/notify',
      event: 'payment.completed',
      status: 'failed',
      timestamp: '2025-10-13 09:15:22',
      responseTime: 0,
      statusCode: 500,
    },
  ]

  const availableEvents = [
    'contact.created',
    'contact.updated',
    'contact.deleted',
    'ticket.created',
    'ticket.updated',
    'ticket.closed',
    'message.sent',
    'message.received',
    'integration.sync.completed',
    'integration.sync.failed',
  ]

  const handleOpenModal = (webhook?: Webhook) => {
    if (webhook) {
      setEditingWebhook(webhook)
      setFormData({
        name: webhook.name,
        endpoint: webhook.endpoint,
        integration: webhook.integration,
        events: webhook.events,
        enabled: webhook.enabled,
        secret: '••••••••••••••••',
        retryAttempts: 3,
        timeout: 30,
      })
    } else {
      setEditingWebhook(null)
      setFormData({
        name: '',
        endpoint: '',
        integration: 'Custom',
        events: [],
        enabled: true,
        secret: '',
        retryAttempts: 3,
        timeout: 30,
      })
    }
    setOpenModal(true)
  }

  const handleCloseModal = () => {
    setOpenModal(false)
    setEditingWebhook(null)
  }

  const handleSave = () => {
    // TODO: este handler nunca persistió el webhook (solo cerraba el modal).
    // formData incluye `secret`, por eso se eliminó el log. Falta el POST/PUT real.
    handleCloseModal()
  }

  const handleTestWebhook = (webhook: Webhook) => {
    console.log('Probando webhook...', webhook)
  }

  const handleDeleteWebhook = (id: number) => {
    console.log('Eliminando webhook...', id)
  }

  const handleCopyEndpoint = (endpoint: string) => {
    navigator.clipboard.writeText(endpoint)
    console.log('Endpoint copiado:', endpoint)
  }

  const getStatusVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'active':
        return 'success'
      case 'inactive':
        return 'neutral'
      case 'error':
        return 'destructive'
      default:
        return 'neutral'
    }
  }

  const filteredWebhooks = webhooks.filter(webhook => {
    if (filterIntegration !== 'all' && webhook.integration !== filterIntegration) return false
    if (filterStatus !== 'all' && webhook.status !== filterStatus) return false
    return true
  })

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <Broadcast className="size-6" weight="fill" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Gestión de Webhooks
                </h1>
                <p className="text-sm text-muted-foreground">
                  Configuración y monitoreo de webhooks para todas las integraciones
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => handleOpenModal()}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nuevo Webhook
            </Button>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              label="Total Webhooks"
              value={String(webhooks.length)}
              caption={`${webhooks.filter(w => w.enabled).length} activos`}
              captionTone="success"
            />
            <KpiTile
              label="Triggers Hoy"
              value="5,052"
              caption="+8.3% vs ayer"
              captionTone="success"
            />
            <KpiTile
              label="Tasa de Éxito"
              value="99.2%"
              caption="Últimas 24 horas"
              captionTone="success"
            />
            <KpiTile
              label="Tiempo Respuesta Prom."
              value="152ms"
              caption="Últimas 24 horas"
            />
          </div>

          {/* Filtros */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="filter-integration">Filtrar por Integración</Label>
                <Select value={filterIntegration} onValueChange={setFilterIntegration}>
                  <SelectTrigger id="filter-integration" aria-label="Filtrar por Integración">
                    <SelectValue placeholder="Todas las integraciones" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las integraciones</SelectItem>
                    <SelectItem value="Billie">Billie</SelectItem>
                    <SelectItem value="Aria Lite">Aria Lite</SelectItem>
                    <SelectItem value="SmartTrack">SmartTrack</SelectItem>
                    <SelectItem value="SGR">SGR</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filter-status">Filtrar por Estado</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger id="filter-status" aria-label="Filtrar por Estado">
                    <SelectValue placeholder="Todos los estados" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="inactive">Inactivo</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Lista de Webhooks */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Webhooks Configurados</h2>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      {webhookColumns.map((c, i) => (
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
                    {filteredWebhooks.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                          No se encontraron webhooks con los filtros seleccionados
                        </td>
                      </tr>
                    ) : (
                      filteredWebhooks.map((webhook) => (
                        <tr key={webhook.id} className="transition-colors hover:bg-accent/40">
                          <td className="px-4 py-3 font-medium text-foreground">{webhook.name}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
                                {webhook.endpoint}
                              </span>
                              <Tooltip title="Copiar URL">
                                <ActionBtn
                                  label="Copiar URL"
                                  onClick={() => handleCopyEndpoint(webhook.endpoint)}
                                >
                                  <Copy className="size-[18px]" aria-hidden />
                                </ActionBtn>
                              </Tooltip>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{webhook.integration}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {webhook.events.slice(0, 2).map((event, idx) => (
                                <Badge key={idx} variant="neutral">
                                  {event}
                                </Badge>
                              ))}
                              {webhook.events.length > 2 && (
                                <Badge variant="neutral">+{webhook.events.length - 2}</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={getStatusVariant(webhook.status)}>
                              {webhook.status === 'active' && (
                                <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                              )}
                              {webhook.status === 'error' && (
                                <WarningCircle className="size-3.5" weight="fill" aria-hidden />
                              )}
                              {webhook.status}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {webhook.lastTrigger}
                          </td>
                          <td className="px-4 py-3 font-medium tabular-nums text-foreground">
                            {webhook.triggerCount.toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-0.5">
                              <Tooltip title="Probar Webhook">
                                <ActionBtn
                                  label="Probar Webhook"
                                  onClick={() => handleTestWebhook(webhook)}
                                  className="hover:bg-primary/10 hover:text-primary"
                                >
                                  <Play className="size-[18px]" aria-hidden />
                                </ActionBtn>
                              </Tooltip>
                              <Tooltip title="Editar">
                                <ActionBtn label="Editar" onClick={() => handleOpenModal(webhook)}>
                                  <PencilSimple className="size-[18px]" aria-hidden />
                                </ActionBtn>
                              </Tooltip>
                              <Tooltip title="Eliminar">
                                <ActionBtn
                                  label="Eliminar"
                                  onClick={() => handleDeleteWebhook(webhook.id)}
                                  className="hover:bg-destructive/10 hover:text-destructive-text"
                                >
                                  <Trash className="size-[18px]" aria-hidden />
                                </ActionBtn>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Log de Eventos Recientes */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              Log de Eventos Recientes (Últimos 50)
            </h2>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      {logColumns.map((c, i) => (
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
                    {recentLogs.map((log) => (
                      <tr key={log.id} className="transition-colors hover:bg-accent/40">
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {log.timestamp}
                        </td>
                        <td className="px-4 py-3 text-foreground">{log.webhookName}</td>
                        <td className="px-4 py-3">
                          <Badge variant="neutral">{log.event}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={log.status === 'success' ? 'success' : 'destructive'}>
                            {log.status === 'success' ? (
                              <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                            ) : (
                              <WarningCircle className="size-3.5" weight="fill" aria-hidden />
                            )}
                            {log.status}
                          </Badge>
                        </td>
                        <td
                          className={cn(
                            'px-4 py-3 font-medium tabular-nums',
                            log.statusCode === 200 ? 'text-success-text' : 'text-destructive-text',
                          )}
                        >
                          {log.statusCode}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {log.responseTime > 0 ? `${log.responseTime}ms` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Crear/Editar Webhook */}
        <Dialog open={openModal} onOpenChange={(open) => !open && handleCloseModal()}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingWebhook ? 'Editar Webhook' : 'Crear Nuevo Webhook'}
              </DialogTitle>
            </DialogHeader>

            <div className="border-t border-border" />

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="wh-name">Nombre del Webhook</Label>
                <input
                  id="wh-name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Billie Sync Webhook"
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wh-endpoint">URL del Endpoint</Label>
                <input
                  id="wh-endpoint"
                  required
                  value={formData.endpoint}
                  onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                  placeholder="https://api.example.com/webhook"
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wh-integration">Integración</Label>
                <Select
                  value={formData.integration}
                  onValueChange={(value) => setFormData({ ...formData, integration: value })}
                >
                  <SelectTrigger id="wh-integration" className="h-11" aria-label="Integración">
                    <SelectValue placeholder="Selecciona una integración" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Billie">Billie</SelectItem>
                    <SelectItem value="Aria Lite">Aria Lite</SelectItem>
                    <SelectItem value="SmartTrack">SmartTrack</SelectItem>
                    <SelectItem value="SGR">SGR</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <span className="text-sm font-medium leading-none text-foreground">Eventos</span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Eventos">
                  {availableEvents.map((event) => {
                    const selected = formData.events.includes(event)
                    return (
                      <button
                        key={event}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          const newEvents = formData.events.includes(event)
                            ? formData.events.filter(e => e !== event)
                            : [...formData.events, event]
                          setFormData({ ...formData, events: newEvents })
                        }}
                        className={cn(
                          'inline-flex h-7 cursor-pointer items-center rounded-full border px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                          selected
                            ? 'border-transparent bg-primary text-primary-foreground hover:bg-primary-hover'
                            : 'border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                        )}
                      >
                        {event}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wh-secret">Secret Key (opcional)</Label>
                <input
                  id="wh-secret"
                  type="password"
                  value={formData.secret}
                  onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                  placeholder="••••••••••••••••"
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="wh-retries">Intentos de Reintento</Label>
                  <input
                    id="wh-retries"
                    type="number"
                    min={0}
                    max={10}
                    value={formData.retryAttempts}
                    onChange={(e) => setFormData({ ...formData, retryAttempts: parseInt(e.target.value) })}
                    className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm tabular-nums text-foreground shadow-sm outline-none transition-colors hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wh-timeout">Timeout (segundos)</Label>
                  <input
                    id="wh-timeout"
                    type="number"
                    min={5}
                    max={120}
                    value={formData.timeout}
                    onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) })}
                    className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm tabular-nums text-foreground shadow-sm outline-none transition-colors hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="wh-enabled">Habilitar Webhook</Label>
                <Toggle
                  id="wh-enabled"
                  label="Habilitar Webhook"
                  checked={formData.enabled}
                  onChange={(checked) => setFormData({ ...formData, enabled: checked })}
                />
              </div>
            </div>

            <div className="border-t border-border" />

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={handleCloseModal}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave}>
                {editingWebhook ? 'Actualizar' : 'Crear'} Webhook
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
