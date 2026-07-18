import { useState } from 'react'
import { Gear } from '@phosphor-icons/react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export default function CampaignsSettings() {
  const [autoSend, setAutoSend] = useState(true)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <Gear className="size-6" weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Configuración de Campañas
            </h1>
            <p className="text-sm text-muted-foreground">
              Ajustes generales de campañas
            </p>
          </div>
        </div>

        {/* Settings Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
          <div className="space-y-6">
            {/* Envío Automático */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Envío Automático
                </p>
                <p className="text-xs text-muted-foreground">
                  Activar envío automático de campañas
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoSend}
                aria-label="Envío Automático"
                onClick={() => setAutoSend((v) => !v)}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full outline-none transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  autoSend ? 'bg-primary' : 'bg-input',
                )}
              >
                <span
                  className={cn(
                    'inline-block size-5 rounded-full bg-card shadow-sm transition-transform',
                    autoSend ? 'translate-x-[22px]' : 'translate-x-0.5',
                  )}
                  aria-hidden
                />
              </button>
            </div>

            {/* Horario de Envío */}
            <div className="space-y-1.5">
              <Label htmlFor="campaign-schedule">Horario de Envío</Label>
              <Select defaultValue="morning">
                <SelectTrigger id="campaign-schedule" className="max-w-md">
                  <SelectValue placeholder="Selecciona un horario" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Mañana (9:00 - 12:00)</SelectItem>
                  <SelectItem value="afternoon">Tarde (14:00 - 18:00)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Límite Diario de Envíos */}
            <div className="space-y-1.5">
              <Label htmlFor="campaign-daily-limit">Límite Diario de Envíos</Label>
              <Input
                id="campaign-daily-limit"
                type="number"
                defaultValue="1000"
                className="max-w-md"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
