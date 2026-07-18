import { TreeStructure, Plus } from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Button } from '@/components/ui/button'

export default function Flowbuilder() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <TreeStructure className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Flowbuilder
              </h1>
              <p className="text-sm text-muted-foreground">
                Constructor visual de flujos automatizados
              </p>
            </div>
          </div>
          <Button size="sm">
            <Plus className="size-4" weight="bold" aria-hidden />
            Nuevo Flujo
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Flujos Activos" value="12" />
          <StatTile label="Ejecuciones Hoy" value="1,245" />
          <StatTile label="Tasa de Éxito" value="94.2%" tone="success" />
          <StatTile label="Total Flujos" value="28" />
        </div>

        {/* Canvas placeholder */}
        <div className="flex h-[500px] items-center justify-center rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="text-center">
            <TreeStructure
              className="mx-auto mb-4 size-16 text-muted-foreground"
              aria-hidden
            />
            <h2 className="mb-1 text-xl font-semibold text-foreground">
              Constructor de Flujos
            </h2>
            <p className="text-sm text-muted-foreground">
              Editor visual drag-and-drop para flujos
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
