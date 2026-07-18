import { useState } from 'react'
import {
  ClipboardText,
  FloppyDisk,
  ArrowsClockwise,
  CheckCircle,
  Gear,
  ChartBar,
  Warning,
  XCircle,
  ClockCounterClockwise,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

// Toggle accesible (role="switch") con tokens del design system.
// No hay componente Switch en @/components/ui; se define local (patrón IntegrationSmartTrack).
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
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-card shadow-sm transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
        aria-hidden
      />
    </button>
  )
}

// Campo de texto con etiqueta, estilizado como el resto del design system.
function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  min,
  max,
}: {
  id: string
  label: string
  value: string | number
  onChange: (value: string) => void
  type?: string
  min?: number
  max?: number
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        type={type}
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      />
    </div>
  )
}

// Fila de toggle etiquetada (label + descripción a la izquierda, switch a la derecha).
function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Toggle id={id} label={label} checked={checked} onChange={onChange} />
    </div>
  )
}

// KPI con ícono y nota al pie (StatTile no soporta ícono/nota; mismo shell visual).
function KpiCard({
  icon: IconCmp,
  iconClassName,
  label,
  value,
  hint,
  hintClassName,
}: {
  icon: Icon
  iconClassName?: string
  label: string
  value: string
  hint: string
  hintClassName?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <div className="flex items-center gap-2">
        <IconCmp className={cn('size-5', iconClassName)} weight="fill" aria-hidden />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      <p className={cn('mt-1 text-xs text-muted-foreground', hintClassName)}>{hint}</p>
    </div>
  )
}

// Barra de distribución (reemplaza las Box con bgcolor de MUI).
function DistributionBar({
  label,
  value,
  total,
  barClassName,
}: {
  label: string
  value: number
  total: number
  barClassName: string
}) {
  const pct = (value / total) * 100
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm text-foreground">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {value} ({pct.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm bg-muted">
        <div className={cn('h-full', barClassName)} style={{ width: `${pct}%` }} aria-hidden />
      </div>
    </div>
  )
}

const columns = [
  'Número de Reclamo',
  'Cliente',
  'Estado',
  'Prioridad',
  'Monto',
  'Fecha Creación',
  'Última Actualización',
]

interface Claim {
  id: number
  claimNumber: string
  customerName: string
  status: 'pending' | 'in_progress' | 'closed' | 'rejected'
  createdAt: string
  updatedAt: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  amount: number
}

interface ClaimStat {
  total: number
  pending: number
  inProgress: number
  closed: number
  rejected: number
}

export default function IntegrationSGR() {
  const [config, setConfig] = useState({
    enabled: true,
    apiUrl: 'https://api.sgr.gov.ar/v2.0',
    apiKey: '••••••••••••••••',
    companyCode: 'SGR_DEMO001',
    syncInterval: 20,
    autoSync: true,
    notifyNewClaims: true,
    notifyStatusChange: true,
    autoAssignTickets: false,
  })

  const [selectedStatus, setSelectedStatus] = useState<string>('all')

  const stats: ClaimStat = {
    total: 1253,
    pending: 234,
    inProgress: 189,
    closed: 798,
    rejected: 32,
  }

  const generalStats = {
    lastSync: '2025-10-13 10:35:18',
    nextSync: '2025-10-13 10:55:00',
    syncedToday: 34,
    errors: 5,
    uptime: 98.9,
    avgResponseTime: 2.3,
  }

  const recentClaims: Claim[] = [
    {
      id: 1,
      claimNumber: 'SGR-2025-00234',
      customerName: 'Juan Pérez',
      status: 'pending',
      createdAt: '2025-10-13 10:15:00',
      updatedAt: '2025-10-13 10:15:00',
      priority: 'high',
      amount: 15000,
    },
    {
      id: 2,
      claimNumber: 'SGR-2025-00233',
      customerName: 'María González',
      status: 'in_progress',
      createdAt: '2025-10-13 09:45:00',
      updatedAt: '2025-10-13 10:30:00',
      priority: 'medium',
      amount: 8500,
    },
    {
      id: 3,
      claimNumber: 'SGR-2025-00232',
      customerName: 'Carlos Rodríguez',
      status: 'closed',
      createdAt: '2025-10-13 08:20:00',
      updatedAt: '2025-10-13 10:10:00',
      priority: 'low',
      amount: 3200,
    },
    {
      id: 4,
      claimNumber: 'SGR-2025-00231',
      customerName: 'Ana Martínez',
      status: 'in_progress',
      createdAt: '2025-10-13 07:50:00',
      updatedAt: '2025-10-13 09:45:00',
      priority: 'critical',
      amount: 25000,
    },
    {
      id: 5,
      claimNumber: 'SGR-2025-00230',
      customerName: 'Luis Fernández',
      status: 'rejected',
      createdAt: '2025-10-12 16:30:00',
      updatedAt: '2025-10-13 08:15:00',
      priority: 'medium',
      amount: 5600,
    },
  ]

  const handleSave = () => {
    console.log('Guardando configuración SGR...', config)
  }

  const handleSyncNow = () => {
    console.log('Iniciando sincronización manual de reclamos...')
  }

  const getStatusColor = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'pending':
        return 'warning'
      case 'in_progress':
        return 'primary'
      case 'closed':
        return 'success'
      case 'rejected':
        return 'destructive'
      default:
        return 'neutral'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Pendiente'
      case 'in_progress':
        return 'En Proceso'
      case 'closed':
        return 'Cerrado'
      case 'rejected':
        return 'Rechazado'
      default:
        return status
    }
  }

  const getPriorityColor = (priority: string): BadgeProps['variant'] => {
    switch (priority) {
      case 'critical':
        return 'destructive'
      case 'high':
        return 'warning'
      case 'medium':
        return 'primary'
      case 'low':
        return 'neutral'
      default:
        return 'neutral'
    }
  }

  const filteredClaims = selectedStatus === 'all'
    ? recentClaims
    : recentClaims.filter(claim => claim.status === selectedStatus)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ClipboardText className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Integración SGR - Sistema de Reclamos
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestión de reclamos con Sistema General de Reclamos v2.0
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSyncNow}>
              <ArrowsClockwise className="size-4" aria-hidden />
              Sincronizar Ahora
            </Button>
            <Button size="sm" onClick={handleSave}>
              <FloppyDisk className="size-4" aria-hidden />
              Guardar Cambios
            </Button>
          </div>
        </div>

        {/* KPIs de Reclamos */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <KpiCard
            icon={ClipboardText}
            iconClassName="text-primary"
            label="Total Reclamos"
            value={stats.total.toLocaleString()}
            hint="Histórico completo"
          />
          <KpiCard
            icon={ClockCounterClockwise}
            iconClassName="text-warning-text"
            label="Pendientes"
            value={String(stats.pending)}
            hint="Requieren atención"
            hintClassName="text-warning-text"
          />
          <KpiCard
            icon={Warning}
            iconClassName="text-primary"
            label="En Proceso"
            value={String(stats.inProgress)}
            hint="En gestión activa"
            hintClassName="text-primary"
          />
          <KpiCard
            icon={CheckCircle}
            iconClassName="text-success-text"
            label="Cerrados"
            value={String(stats.closed)}
            hint={`${((stats.closed / stats.total) * 100).toFixed(1)}% del total`}
            hintClassName="text-success-text"
          />
          <KpiCard
            icon={XCircle}
            iconClassName="text-destructive-text"
            label="Rechazados"
            value={String(stats.rejected)}
            hint={`${((stats.rejected / stats.total) * 100).toFixed(1)}% del total`}
            hintClassName="text-destructive-text"
          />
        </div>

        {/* Estado General */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02] lg:col-span-2">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-foreground">Estado de Conexión</h2>
              <Badge variant="success" dot>
                Activo
              </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Última Sincronización</dt>
                <dd className="text-sm font-semibold text-foreground">{generalStats.lastSync}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Próxima Sincronización</dt>
                <dd className="text-sm font-semibold text-foreground">{generalStats.nextSync}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Sincronizados Hoy</dt>
                <dd className="text-sm font-semibold tabular-nums text-success-text">
                  {generalStats.syncedToday}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Errores 24h</dt>
                <dd className="text-sm font-semibold tabular-nums text-warning-text">
                  {generalStats.errors}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Uptime</dt>
                <dd className="text-sm font-semibold tabular-nums text-success-text">
                  {generalStats.uptime}%
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Tiempo Respuesta Prom.</dt>
                <dd className="text-sm font-semibold tabular-nums text-foreground">
                  {generalStats.avgResponseTime}s
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
            <h2 className="mb-4 text-base font-semibold text-foreground">Acciones Rápidas</h2>
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" className="w-full justify-start">
                <ArrowsClockwise className="size-4" aria-hidden />
                Sincronizar Reclamos
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start">
                <ClipboardText className="size-4" aria-hidden />
                Crear Nuevo Reclamo
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start">
                <ChartBar className="size-4" aria-hidden />
                Ver Reportes
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="config">
          <TabsList>
            <TabsTrigger value="config">Configuración</TabsTrigger>
            <TabsTrigger value="claims">Gestión de Reclamos</TabsTrigger>
            <TabsTrigger value="reports">Reportes</TabsTrigger>
          </TabsList>

          {/* Configuración */}
          <TabsContent value="config">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-foreground">
                <Gear className="size-5 text-muted-foreground" aria-hidden />
                Configuración de Conexión SGR
              </h2>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <ToggleRow
                    id="sgr-enabled"
                    label="Habilitar Integración"
                    hint="Activar o desactivar la sincronización con SGR"
                    checked={config.enabled}
                    onChange={(v) => setConfig({ ...config, enabled: v })}
                  />
                </div>

                <Field
                  id="sgr-api-url"
                  label="URL de API SGR"
                  value={config.apiUrl}
                  onChange={(v) => setConfig({ ...config, apiUrl: v })}
                />
                <Field
                  id="sgr-api-key"
                  label="API Key"
                  type="password"
                  value={config.apiKey}
                  onChange={(v) => setConfig({ ...config, apiKey: v })}
                />
                <Field
                  id="sgr-company-code"
                  label="Código de Empresa"
                  value={config.companyCode}
                  onChange={(v) => setConfig({ ...config, companyCode: v })}
                />
                <Field
                  id="sgr-sync-interval"
                  label="Intervalo de Sincronización (minutos)"
                  type="number"
                  min={5}
                  max={60}
                  value={config.syncInterval}
                  onChange={(v) => setConfig({ ...config, syncInterval: parseInt(v) })}
                />

                <div
                  role="note"
                  className="rounded-lg border border-primary/30 bg-accent px-4 py-3 text-accent-foreground md:col-span-2"
                >
                  <p className="text-sm font-semibold">Información Importante</p>
                  <p className="mt-0.5 text-xs">
                    La sincronización automática obtiene nuevos reclamos del SGR cada {config.syncInterval} minutos.
                    Los cambios de estado se notifican en tiempo real mediante webhooks.
                  </p>
                </div>

                <div className="flex flex-col gap-4 md:col-span-2">
                  <ToggleRow
                    id="sgr-auto-sync"
                    label="Sincronización Automática"
                    checked={config.autoSync}
                    onChange={(v) => setConfig({ ...config, autoSync: v })}
                  />
                  <ToggleRow
                    id="sgr-notify-new"
                    label="Notificar Nuevos Reclamos"
                    checked={config.notifyNewClaims}
                    onChange={(v) => setConfig({ ...config, notifyNewClaims: v })}
                  />
                  <ToggleRow
                    id="sgr-notify-status"
                    label="Notificar Cambios de Estado"
                    checked={config.notifyStatusChange}
                    onChange={(v) => setConfig({ ...config, notifyStatusChange: v })}
                  />
                  <ToggleRow
                    id="sgr-auto-tickets"
                    label="Crear Tickets Automáticamente"
                    hint="Crea un ticket en JR Chateam por cada nuevo reclamo"
                    checked={config.autoAssignTickets}
                    onChange={(v) => setConfig({ ...config, autoAssignTickets: v })}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Gestión de Reclamos */}
          <TabsContent value="claims">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
              <div className="flex flex-wrap items-center justify-between gap-4 p-6 pb-4">
                <h2 className="text-lg font-semibold text-foreground">Reclamos Recientes</h2>
                <div className="w-[200px]">
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger aria-label="Filtrar por estado">
                      <SelectValue placeholder="Todos los estados" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      <SelectItem value="pending">Pendientes</SelectItem>
                      <SelectItem value="in_progress">En Proceso</SelectItem>
                      <SelectItem value="closed">Cerrados</SelectItem>
                      <SelectItem value="rejected">Rechazados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-y border-border bg-muted/40 text-left">
                      {columns.map((c, i) => (
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
                    {filteredClaims.length === 0 ? (
                      <tr>
                        <td
                          colSpan={columns.length}
                          className="px-4 py-10 text-center text-muted-foreground"
                        >
                          No hay reclamos con el estado seleccionado
                        </td>
                      </tr>
                    ) : (
                      filteredClaims.map((claim) => (
                        <tr key={claim.id} className="transition-colors hover:bg-accent/40">
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                            {claim.claimNumber}
                          </td>
                          <td className="px-4 py-3 text-foreground">{claim.customerName}</td>
                          <td className="px-4 py-3">
                            <Badge variant={getStatusColor(claim.status)} dot>
                              {getStatusLabel(claim.status)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={getPriorityColor(claim.priority)} className="capitalize">
                              {claim.priority}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-foreground">
                            ${claim.amount.toLocaleString()}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {claim.createdAt}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {claim.updatedAt}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* Reportes */}
          <TabsContent value="reports">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-foreground">
                <ChartBar className="size-5 text-muted-foreground" aria-hidden />
                Reportes y Estadísticas
              </h2>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Distribución por Estado */}
                <div className="rounded-lg border border-border p-5">
                  <h3 className="mb-4 text-base font-semibold text-foreground">
                    Distribución por Estado
                  </h3>
                  <div className="flex flex-col gap-3">
                    <DistributionBar
                      label="Pendientes"
                      value={stats.pending}
                      total={stats.total}
                      barClassName="bg-warning"
                    />
                    <DistributionBar
                      label="En Proceso"
                      value={stats.inProgress}
                      total={stats.total}
                      barClassName="bg-primary"
                    />
                    <DistributionBar
                      label="Cerrados"
                      value={stats.closed}
                      total={stats.total}
                      barClassName="bg-success"
                    />
                    <DistributionBar
                      label="Rechazados"
                      value={stats.rejected}
                      total={stats.total}
                      barClassName="bg-destructive"
                    />
                  </div>
                </div>

                {/* Métricas Clave */}
                <div className="rounded-lg border border-border p-5">
                  <h3 className="mb-4 text-base font-semibold text-foreground">Métricas Clave</h3>
                  <div className="flex flex-col gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Tiempo Promedio de Resolución
                      </p>
                      <p className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">
                        4.2 días
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Tasa de Cierre</p>
                      <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums text-success-text">
                        {((stats.closed / stats.total) * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Tasa de Rechazo</p>
                      <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums text-destructive-text">
                        {((stats.rejected / stats.total) * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>

                {/* Resumen del Mes */}
                <div className="rounded-lg border border-border p-5 md:col-span-2">
                  <h3 className="mb-4 text-base font-semibold text-foreground">Resumen del Mes</h3>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="p-2 text-center">
                      <p className="text-xs text-muted-foreground">Nuevos Reclamos</p>
                      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                        87
                      </p>
                      <p className="mt-1 text-xs text-success-text">+12% vs mes anterior</p>
                    </div>
                    <div className="p-2 text-center">
                      <p className="text-xs text-muted-foreground">Cerrados</p>
                      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-success-text">
                        102
                      </p>
                      <p className="mt-1 text-xs text-success-text">+8% vs mes anterior</p>
                    </div>
                    <div className="p-2 text-center">
                      <p className="text-xs text-muted-foreground">Tiempo Prom. Respuesta</p>
                      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                        2.1h
                      </p>
                      <p className="mt-1 text-xs text-success-text">-0.3h vs mes anterior</p>
                    </div>
                    <div className="p-2 text-center">
                      <p className="text-xs text-muted-foreground">Satisfacción Cliente</p>
                      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-success-text">
                        94%
                      </p>
                      <p className="mt-1 text-xs text-success-text">+2% vs mes anterior</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
