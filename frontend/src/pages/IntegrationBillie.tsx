import { useState } from 'react'
import {
  Buildings,
  FloppyDisk,
  ArrowsClockwise,
  CheckCircle,
  Gear,
  ChartLine,
} from '@phosphor-icons/react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface SyncRecord {
  id: number
  timestamp: string
  type: string
  records: number
  status: 'success' | 'error' | 'warning'
  duration: number
}

// Toggle accesible (role="switch") con tokens del design system.
// No hay componente Switch en @/components/ui; se define local (mismo patrón que IntegrationSmartTrack).
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
  hint,
  min,
  max,
}: {
  id: string
  label: string
  value: string | number
  onChange: (value: string) => void
  type?: string
  hint?: string
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
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

// Fila de toggle etiquetada (label + descripción opcional a la izquierda, switch a la derecha).
function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <Toggle id={id} label={label} checked={checked} onChange={onChange} />
    </div>
  )
}

// Dato de estado (etiqueta pequeña + valor destacado).
function StatusItem({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'success' | 'warning'
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-sm font-semibold',
          tone === 'success'
            ? 'text-success-text'
            : tone === 'warning'
              ? 'text-warning-text'
              : 'text-foreground',
        )}
      >
        {value}
      </p>
    </div>
  )
}

const historyColumns = ['Fecha y Hora', 'Tipo', 'Registros', 'Estado', 'Duración']

const statusVariant: Record<SyncRecord['status'], BadgeProps['variant']> = {
  success: 'success',
  error: 'destructive',
  warning: 'warning',
}

export default function IntegrationBillie() {
  const [config, setConfig] = useState({
    enabled: true,
    apiUrl: 'https://api.billie.com/v2.5',
    apiKey: '••••••••••••••••',
    companyCode: 'DEMO001',
    syncInterval: 15,
    syncContacts: true,
    syncInvoices: true,
    syncProducts: true,
    syncOrders: true,
    bidirectionalSync: true,
    autoCreateRecords: false,
    webhookUrl: 'https://api.jrchateam.com/webhooks/billie',
    webhookSecret: '••••••••••••••••',
  })

  const stats = {
    lastSync: '2025-10-13 10:45:23',
    nextSync: '2025-10-13 11:00:00',
    totalRecords: 5482,
    syncedToday: 245,
    pending: 45,
    errors: 2,
    uptime: 99.8,
  }

  const syncHistory: SyncRecord[] = [
    { id: 1, timestamp: '2025-10-13 10:45:23', type: 'Contactos', records: 245, status: 'success', duration: 18 },
    { id: 2, timestamp: '2025-10-13 10:30:15', type: 'Facturas', records: 89, status: 'success', duration: 24 },
    { id: 3, timestamp: '2025-10-13 10:15:47', type: 'Productos', records: 156, status: 'success', duration: 12 },
    { id: 4, timestamp: '2025-10-13 10:00:12', type: 'Órdenes', records: 67, status: 'warning', duration: 32 },
    { id: 5, timestamp: '2025-10-13 09:45:33', type: 'Contactos', records: 0, status: 'error', duration: 0 },
  ]

  const handleSave = () => {
    console.log('Guardando configuración Billie...', config)
  }

  const handleSyncNow = () => {
    console.log('Iniciando sincronización manual...')
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Buildings className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Integración Billie ERP
              </h1>
              <p className="text-sm text-muted-foreground">
                Sincronización con sistema ERP Billie v2.5
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

        {/* Estado General */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02] lg:col-span-2">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-foreground">
                Estado de Conexión
              </h2>
              <Badge variant="success">
                <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                Activo
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatusItem label="Última Sincronización" value={stats.lastSync} />
              <StatusItem label="Próxima Sincronización" value={stats.nextSync} />
              <StatusItem label="Total Registros" value={stats.totalRecords.toLocaleString()} />
              <StatusItem label="Sincronizados Hoy" value={String(stats.syncedToday)} tone="success" />
              <StatusItem label="Pendientes" value={String(stats.pending)} tone="warning" />
              <StatusItem label="Uptime" value={`${stats.uptime}%`} tone="success" />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
            <h2 className="mb-4 text-base font-semibold text-foreground">
              Acciones Rápidas
            </h2>
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" className="w-full justify-start">
                <ArrowsClockwise className="size-4" aria-hidden />
                Sincronizar Contactos
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start">
                <ArrowsClockwise className="size-4" aria-hidden />
                Sincronizar Facturas
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start">
                <ChartLine className="size-4" aria-hidden />
                Ver Logs Completos
              </Button>
            </div>
          </div>
        </div>

        {/* Configuración */}
        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">Configuración General</TabsTrigger>
            <TabsTrigger value="sync">Sincronización</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-foreground">
                <Gear className="size-5 text-muted-foreground" aria-hidden />
                Configuración de Conexión
              </h2>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <ToggleRow
                    id="billie-enabled"
                    label="Habilitar Integración"
                    description="Activar o desactivar la sincronización con Billie"
                    checked={config.enabled}
                    onChange={(v) => setConfig({ ...config, enabled: v })}
                  />
                </div>

                <Field
                  id="billie-api-url"
                  label="URL de API"
                  value={config.apiUrl}
                  onChange={(v) => setConfig({ ...config, apiUrl: v })}
                />
                <Field
                  id="billie-api-key"
                  label="API Key"
                  type="password"
                  value={config.apiKey}
                  onChange={(v) => setConfig({ ...config, apiKey: v })}
                />
                <Field
                  id="billie-company-code"
                  label="Código de Empresa"
                  value={config.companyCode}
                  onChange={(v) => setConfig({ ...config, companyCode: v })}
                />
                <Field
                  id="billie-sync-interval"
                  label="Intervalo de Sincronización (minutos)"
                  type="number"
                  min={5}
                  max={60}
                  value={config.syncInterval}
                  onChange={(v) => setConfig({ ...config, syncInterval: parseInt(v) })}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="sync">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-6 text-lg font-semibold text-foreground">
                Configuración de Sincronización
              </h2>

              <div className="flex flex-col gap-4">
                <ToggleRow
                  id="billie-sync-contacts"
                  label="Sincronizar Contactos"
                  checked={config.syncContacts}
                  onChange={(v) => setConfig({ ...config, syncContacts: v })}
                />
                <ToggleRow
                  id="billie-sync-invoices"
                  label="Sincronizar Facturas"
                  checked={config.syncInvoices}
                  onChange={(v) => setConfig({ ...config, syncInvoices: v })}
                />
                <ToggleRow
                  id="billie-sync-products"
                  label="Sincronizar Productos"
                  checked={config.syncProducts}
                  onChange={(v) => setConfig({ ...config, syncProducts: v })}
                />
                <ToggleRow
                  id="billie-sync-orders"
                  label="Sincronizar Órdenes"
                  checked={config.syncOrders}
                  onChange={(v) => setConfig({ ...config, syncOrders: v })}
                />

                <div className="my-2 border-t border-border" />

                <ToggleRow
                  id="billie-bidirectional"
                  label="Sincronización Bidireccional"
                  description="Permite que los cambios fluyan en ambas direcciones"
                  checked={config.bidirectionalSync}
                  onChange={(v) => setConfig({ ...config, bidirectionalSync: v })}
                />
                <ToggleRow
                  id="billie-auto-create"
                  label="Crear Registros Automáticamente"
                  description="Crea nuevos registros si no existen en el destino"
                  checked={config.autoCreateRecords}
                  onChange={(v) => setConfig({ ...config, autoCreateRecords: v })}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="webhooks">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-6 text-lg font-semibold text-foreground">
                Configuración de Webhooks
              </h2>

              <div
                role="status"
                className="mb-6 rounded-lg border border-primary/30 bg-accent px-4 py-3 text-sm text-accent-foreground"
              >
                Los webhooks permiten recibir notificaciones en tiempo real cuando ocurren cambios en Billie
              </div>

              <div className="flex flex-col gap-4">
                <Field
                  id="billie-webhook-url"
                  label="URL del Webhook"
                  value={config.webhookUrl}
                  onChange={(v) => setConfig({ ...config, webhookUrl: v })}
                  hint="Billie enviará notificaciones a esta URL"
                />
                <Field
                  id="billie-webhook-secret"
                  label="Webhook Secret"
                  type="password"
                  value={config.webhookSecret}
                  onChange={(v) => setConfig({ ...config, webhookSecret: v })}
                  hint="Usado para verificar la autenticidad de las notificaciones"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history">
            <div className="rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
              <h2 className="border-b border-border px-6 py-4 text-lg font-semibold text-foreground">
                Historial de Sincronización
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      {historyColumns.map((c) => (
                        <th
                          key={c}
                          className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {syncHistory.map((record) => (
                      <tr key={record.id} className="transition-colors hover:bg-accent/40">
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {record.timestamp}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">{record.type}</td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {record.records}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusVariant[record.status]} dot>
                            {record.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {record.duration}s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
