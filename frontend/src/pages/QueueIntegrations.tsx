import { PlugsConnected, Plus } from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Button } from '@/components/ui/button'

export default function QueueIntegrations() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <PlugsConnected className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Integraciones de Cola
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestión de integraciones con colas
              </p>
            </div>
          </div>
          <Button size="sm">
            <Plus className="size-4" weight="bold" aria-hidden />
            Nueva Integración
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Integraciones" value="8" />
          <StatTile label="Activas" value="6" tone="success" />
          <StatTile label="Eventos Hoy" value="3.2k" />
          <StatTile label="Tasa de Éxito" value="99.1%" />
        </div>
      </div>
    </div>
  )
}
