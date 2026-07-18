import { useState, useEffect } from 'react'
import { LinearProgress } from '@mui/joy'
import {
  PuzzlePiece,
  CheckCircle,
  Warning,
  Gear,
  ArrowClockwise,
  WhatsappLogo,
  TelegramLogo,
  EnvelopeSimple,
  CreditCard,
  Megaphone,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import api from '../services/api'

interface Integration {
  id: string
  name: string
  description: string
  status: 'active' | 'inactive' | 'error'
  category: 'communication' | 'payment' | 'marketing' | 'other'
  icon: React.ReactNode
  isConfigured: boolean
  lastSync?: string
}

// Mapa de iconos por id para reconstruir el nodo React desde la API
const ICON_MAP: Record<string, React.ReactNode> = {
  whatsapp: <WhatsappLogo className="size-6" weight="fill" style={{ color: '#25D366' }} aria-hidden />,
  telegram: <TelegramLogo className="size-6" weight="fill" style={{ color: '#0088cc' }} aria-hidden />,
  stripe: <CreditCard className="size-6" weight="fill" style={{ color: '#635BFF' }} aria-hidden />,
  email: <EnvelopeSimple className="size-6" weight="fill" style={{ color: '#EA4335' }} aria-hidden />,
  meta: <Megaphone className="size-6" weight="fill" style={{ color: '#1877F2' }} aria-hidden />,
}

// Toggle accesible (reemplaza el Switch de MUI). Solo presentación.
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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

export default function Integrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchIntegrations()
  }, [])

  const fetchIntegrations = async () => {
    setLoading(true)
    try {
      const response = await api.get('/integrations')
      const rawData: any[] = response.data?.data ?? response.data ?? []
      const mapped: Integration[] = rawData.map((item: any) => ({
        ...item,
        icon: ICON_MAP[item.id] ?? <PuzzlePiece className="size-6" weight="fill" aria-hidden />,
      }))
      setIntegrations(mapped)
    } catch {
      // Sin datos disponibles — se mostrará estado vacío
      setIntegrations([])
    } finally {
      setLoading(false)
    }
  }

  const stats = {
    total: integrations.length,
    active: integrations.filter((i) => i.status === 'active').length,
    inactive: integrations.filter((i) => i.status === 'inactive').length,
    errors: integrations.filter((i) => i.status === 'error').length,
  }

  const toggleIntegration = async (id: string) => {
    setIntegrations(
      integrations.map((i) =>
        i.id === id
          ? { ...i, status: i.status === 'active' ? 'inactive' : 'active' }
          : i
      )
    )
  }

  const getStatusBadge = (
    status: Integration['status']
  ): { label: string; variant: BadgeProps['variant']; active: boolean } => {
    switch (status) {
      case 'active':
        return { label: 'Activa', variant: 'success', active: true }
      case 'error':
        return { label: 'Error', variant: 'destructive', active: false }
      default:
        return { label: 'Inactiva', variant: 'neutral', active: false }
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <PuzzlePiece className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Integraciones
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestión de integraciones y APIs externas
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchIntegrations}>
            <ArrowClockwise className="size-4" aria-hidden />
            Actualizar
          </Button>
        </div>

        {loading && <LinearProgress />}

        {/* KPI cards — siempre visibles */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total" value={String(stats.total)} />
          <StatTile label="Activas" value={String(stats.active)} tone="success" />
          <StatTile label="Inactivas" value={String(stats.inactive)} />
          <StatTile label="Errores" value={String(stats.errors)} tone="destructive" />
        </div>

        {/* Estado vacío */}
        {!loading && integrations.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <PuzzlePiece className="size-14 text-muted-foreground" aria-hidden />
              <p className="text-lg font-semibold text-foreground">
                No hay integraciones configuradas
              </p>
              <p className="max-w-[480px] text-sm text-muted-foreground">
                Configura tus primeras integraciones para conectar canales de comunicación.
              </p>
            </div>
          </div>
        )}

        {/* Lista de integraciones */}
        {integrations.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {integrations.map((integration) => {
              const status = getStatusBadge(integration.status)
              return (
                <div
                  key={integration.id}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted">
                          {integration.icon}
                        </span>
                        <div>
                          <p className="text-base font-semibold text-foreground">
                            {integration.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {integration.description}
                          </p>
                        </div>
                      </div>
                      <Toggle
                        checked={integration.status === 'active'}
                        onChange={() => toggleIntegration(integration.id)}
                        label={`Activar ${integration.name}`}
                      />
                    </div>

                    <div className="border-t border-border" />

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={status.variant} dot>
                        <span className="inline-flex items-center gap-1">
                          {status.active ? (
                            <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                          ) : (
                            <Warning className="size-3.5" weight="fill" aria-hidden />
                          )}
                          {status.label}
                        </span>
                      </Badge>
                      <Badge variant="outline">{integration.category}</Badge>
                      {integration.lastSync && (
                        <span className="text-xs text-muted-foreground">
                          Sync: {new Date(integration.lastSync).toLocaleTimeString('es-ES')}
                        </span>
                      )}
                    </div>

                    <Button variant="outline" size="sm" className="w-full">
                      <Gear className="size-4" aria-hidden />
                      Configurar
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
