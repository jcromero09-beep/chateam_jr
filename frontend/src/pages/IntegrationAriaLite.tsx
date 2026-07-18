import { useState } from 'react'
import {
  CloudArrowUp,
  FloppyDisk,
  ArrowsClockwise,
  CheckCircle,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

// Toggle accesible (role="switch") con tokens del design system.
// No hay componente Switch en @/components/ui; se define local (patrón IntegrationSGR).
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

const mappingColumns = ['Campo JR Chateam', 'Campo Aria Lite', 'Tipo', 'Estado']

const fieldMappings = [
  { source: 'contact.name', target: 'customer.fullName', type: 'String' },
  { source: 'contact.email', target: 'customer.email', type: 'Email' },
  { source: 'contact.phone', target: 'customer.phoneNumber', type: 'Phone' },
  { source: 'contact.company', target: 'customer.companyName', type: 'String' },
]

const historyColumns = ['Fecha y Hora', 'Tipo', 'Registros', 'Estado', 'Duración']

const syncHistory = [
  { datetime: '2025-10-13 10:40:12', type: 'Clientes', records: 87, duration: '12s' },
  { datetime: '2025-10-13 10:30:45', type: 'Leads', records: 56, duration: '8s' },
  { datetime: '2025-10-13 10:20:23', type: 'Oportunidades', records: 44, duration: '15s' },
]

const syncedModules = [
  { label: 'Clientes', records: '1,245 registros' },
  { label: 'Leads', records: '876 registros' },
  { label: 'Oportunidades', records: '1,113 registros' },
]

export default function IntegrationAriaLite() {
  const [config, setConfig] = useState({
    enabled: true,
    apiUrl: 'https://api.aria-lite.com/v1.8',
    apiKey: '••••••••••••••••',
    tenantId: 'TENANT_123',
    syncInterval: 10,
    syncCustomers: true,
    syncLeads: true,
    syncOpportunities: true,
    bidirectionalSync: true,
  })

  const stats = {
    lastSync: '2025-10-13 10:40:12',
    nextSync: '2025-10-13 10:50:00',
    totalRecords: 3234,
    syncedToday: 187,
    pending: 67,
    uptime: 100,
  }

  const handleSave = () => {
    console.log('Guardando configuración Aria Lite...', config)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <CloudArrowUp className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Integración Aria Lite CRM
              </h1>
              <p className="text-sm text-muted-foreground">
                Sincronización bidireccional con Aria Lite CRM v1.8
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

        {/* Estado General */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-foreground">Estado de Conexión</h2>
              <Badge variant="success">
                <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                Activo - 100% Uptime
              </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-muted-foreground">Última Sincronización</dt>
                <dd className="text-sm font-semibold text-foreground">{stats.lastSync}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Total Registros</dt>
                <dd className="text-sm font-semibold tabular-nums text-foreground">
                  {stats.totalRecords.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Sincronizados Hoy</dt>
                <dd className="text-sm font-semibold tabular-nums text-success-text">
                  {stats.syncedToday}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Pendientes</dt>
                <dd className="text-sm font-semibold tabular-nums text-warning-text">
                  {stats.pending}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
            <h2 className="mb-4 text-base font-semibold text-foreground">Módulos Sincronizados</h2>
            <ul className="flex flex-col gap-2">
              {syncedModules.map((mod) => (
                <li key={mod.label} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-foreground">{mod.label}</span>
                  <Badge variant="success">{mod.records}</Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Configuración */}
        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">Configuración General</TabsTrigger>
            <TabsTrigger value="sync">Sincronización</TabsTrigger>
            <TabsTrigger value="mapping">Mapeo de Campos</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
          </TabsList>

          {/* Configuración General */}
          <TabsContent value="general">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-6 text-lg font-semibold text-foreground">
                Configuración de Conexión
              </h2>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <ToggleRow
                    id="aria-enabled"
                    label="Habilitar Integración"
                    checked={config.enabled}
                    onChange={(v) => setConfig({ ...config, enabled: v })}
                  />
                </div>

                <Field
                  id="aria-api-url"
                  label="URL de API"
                  value={config.apiUrl}
                  onChange={(v) => setConfig({ ...config, apiUrl: v })}
                />
                <Field
                  id="aria-api-key"
                  label="API Key"
                  type="password"
                  value={config.apiKey}
                  onChange={(v) => setConfig({ ...config, apiKey: v })}
                />
                <Field
                  id="aria-tenant-id"
                  label="Tenant ID"
                  value={config.tenantId}
                  onChange={(v) => setConfig({ ...config, tenantId: v })}
                />
                <Field
                  id="aria-sync-interval"
                  label="Intervalo de Sincronización (minutos)"
                  type="number"
                  value={config.syncInterval}
                  onChange={(v) => setConfig({ ...config, syncInterval: parseInt(v) })}
                />
              </div>
            </div>
          </TabsContent>

          {/* Sincronización */}
          <TabsContent value="sync">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-6 text-lg font-semibold text-foreground">
                Módulos de Sincronización
              </h2>

              <div className="flex flex-col gap-4">
                <ToggleRow
                  id="aria-sync-customers"
                  label="Sincronizar Clientes"
                  checked={config.syncCustomers}
                  onChange={(v) => setConfig({ ...config, syncCustomers: v })}
                />
                <ToggleRow
                  id="aria-sync-leads"
                  label="Sincronizar Leads"
                  checked={config.syncLeads}
                  onChange={(v) => setConfig({ ...config, syncLeads: v })}
                />
                <ToggleRow
                  id="aria-sync-opportunities"
                  label="Sincronizar Oportunidades"
                  checked={config.syncOpportunities}
                  onChange={(v) => setConfig({ ...config, syncOpportunities: v })}
                />
                <ToggleRow
                  id="aria-bidirectional"
                  label="Sincronización Bidireccional"
                  hint="Los cambios fluyen en ambas direcciones"
                  checked={config.bidirectionalSync}
                  onChange={(v) => setConfig({ ...config, bidirectionalSync: v })}
                />
              </div>
            </div>
          </TabsContent>

          {/* Mapeo de Campos */}
          <TabsContent value="mapping">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
              <div className="p-6 pb-4">
                <h2 className="text-lg font-semibold text-foreground">Mapeo de Campos</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Configura cómo se mapean los campos entre JR Chateam y Aria Lite
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-y border-border bg-muted/40 text-left">
                      {mappingColumns.map((c, i) => (
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
                    {fieldMappings.map((mapping) => (
                      <tr key={mapping.source} className="transition-colors hover:bg-accent/40">
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                          {mapping.source}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-foreground">
                          {mapping.target}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{mapping.type}</td>
                        <td className="px-4 py-3">
                          <Badge variant="success" dot>
                            Activo
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* Historial */}
          <TabsContent value="history">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
              <div className="p-6 pb-4">
                <h2 className="text-lg font-semibold text-foreground">
                  Historial de Sincronización
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-y border-border bg-muted/40 text-left">
                      {historyColumns.map((c, i) => (
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
                    {syncHistory.map((entry) => (
                      <tr key={entry.datetime} className="transition-colors hover:bg-accent/40">
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                          {entry.datetime}
                        </td>
                        <td className="px-4 py-3 text-foreground">{entry.type}</td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {entry.records}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="success" dot>
                            success
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                          {entry.duration}
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
