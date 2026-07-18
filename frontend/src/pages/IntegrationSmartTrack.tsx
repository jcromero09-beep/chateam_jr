import { useState } from 'react'
import { Truck, FloppyDisk, ArrowsClockwise } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { StatTile } from '@/components/ui/stat-tile'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

// Toggle accesible (role="switch") con tokens del design system.
// No hay componente Switch en @/components/ui; se define local (patrón ActionBtn).
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
}: {
  id: string
  label: string
  value: string | number
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      />
    </div>
  )
}

// Fila de toggle etiquetada (label a la izquierda, switch a la derecha).
function ToggleRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id} className="cursor-pointer">
        {label}
      </Label>
      <Toggle id={id} label={label} checked={checked} onChange={onChange} />
    </div>
  )
}

export default function IntegrationSmartTrack() {
  const [config, setConfig] = useState({
    enabled: true,
    apiUrl: 'https://api.smarttrack.com/v3.1',
    apiKey: '••••••••••••••••',
    accountId: 'ST_789456',
    syncInterval: 20,
    trackShipments: true,
    trackDeliveries: true,
    sendNotifications: true,
  })

  const handleSave = () => {
    console.log('Guardando configuración SmartTrack...', config)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Truck className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Integración SmartTrack
              </h1>
              <p className="text-sm text-muted-foreground">
                Seguimiento de envíos y logística v3.1
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <ArrowsClockwise className="size-4" aria-hidden />
              Sincronizar Ahora
            </Button>
            <Button size="sm" onClick={handleSave}>
              <FloppyDisk className="size-4" aria-hidden />
              Guardar Cambios
            </Button>
          </div>
        </div>

        {/* Alert de estado */}
        <div
          role="status"
          className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-text"
        >
          Sincronización en progreso - Alto volumen de datos detectado. Tiempo estimado: 5 minutos
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Envíos Activos" value="456" />
          <StatTile label="Entregas Hoy" value="89" tone="success" />
          <StatTile label="En Tránsito" value="234" tone="warning" />
          <StatTile label="Pendientes" value="89" />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="config">
          <TabsList>
            <TabsTrigger value="config">Configuración</TabsTrigger>
            <TabsTrigger value="notif">Notificaciones</TabsTrigger>
            <TabsTrigger value="tracking">Tracking</TabsTrigger>
          </TabsList>

          <TabsContent value="config">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-6 text-lg font-semibold text-foreground">
                Configuración de Conexión
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <ToggleRow
                    id="st-enabled"
                    label="Habilitar Integración"
                    checked={config.enabled}
                    onChange={(v) => setConfig({ ...config, enabled: v })}
                  />
                </div>
                <Field
                  id="st-api-url"
                  label="URL de API"
                  value={config.apiUrl}
                  onChange={(v) => setConfig({ ...config, apiUrl: v })}
                />
                <Field
                  id="st-api-key"
                  label="API Key"
                  type="password"
                  value={config.apiKey}
                  onChange={(v) => setConfig({ ...config, apiKey: v })}
                />
                <Field
                  id="st-account-id"
                  label="Account ID"
                  value={config.accountId}
                  onChange={(v) => setConfig({ ...config, accountId: v })}
                />
                <Field
                  id="st-sync-interval"
                  label="Intervalo de Sync (min)"
                  type="number"
                  value={config.syncInterval}
                  onChange={(v) => setConfig({ ...config, syncInterval: parseInt(v) })}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notif">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-6 text-lg font-semibold text-foreground">
                Configuración de Notificaciones
              </h2>
              <div className="flex flex-col gap-4">
                <ToggleRow
                  id="st-notify"
                  label="Notificar Cambios de Estado"
                  checked={config.sendNotifications}
                  onChange={(v) => setConfig({ ...config, sendNotifications: v })}
                />
                <ToggleRow
                  id="st-track-shipments"
                  label="Trackear Envíos"
                  checked={config.trackShipments}
                  onChange={(v) => setConfig({ ...config, trackShipments: v })}
                />
                <ToggleRow
                  id="st-track-deliveries"
                  label="Trackear Entregas"
                  checked={config.trackDeliveries}
                  onChange={(v) => setConfig({ ...config, trackDeliveries: v })}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="tracking">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                Tracking en Tiempo Real
              </h2>
              <div
                role="status"
                className="rounded-lg border border-primary/30 bg-accent px-4 py-3 text-sm text-accent-foreground"
              >
                El sistema está monitoreando 456 envíos activos. Las actualizaciones se sincronizan cada 20 minutos.
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
