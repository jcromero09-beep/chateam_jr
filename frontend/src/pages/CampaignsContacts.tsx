import { AddressBook, UploadSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { StatTile } from '@/components/ui/stat-tile'

export default function CampaignsContacts() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <AddressBook className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Contactos de Campañas
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestión de listas de contactos para campañas
              </p>
            </div>
          </div>
          <Button>
            <UploadSimple className="size-4" weight="bold" aria-hidden />
            Importar Contactos
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total Contactos" value="12,543" />
          <StatTile label="Activos" value="10,234" tone="success" />
          <StatTile label="Listas" value="24" />
          <StatTile label="Importados Hoy" value="456" />
        </div>
      </div>
    </div>
  )
}
