import { FileText, PencilSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

export default function Terms() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <FileText className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Términos y Condiciones
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestión de términos y políticas
              </p>
            </div>
          </div>
          <Button size="sm">
            <PencilSimple className="size-4" weight="bold" aria-hidden />
            Editar
          </Button>
        </div>

        {/* Terms card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              Términos del Servicio
            </h2>
            <p className="text-sm text-muted-foreground">
              Última actualización: 10 de Enero, 2025
            </p>
            <div className="mt-2 min-h-[400px] rounded-md bg-muted p-4">
              <p className="text-sm text-foreground">
                Aquí se mostrarían los términos y condiciones completos del servicio...
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
