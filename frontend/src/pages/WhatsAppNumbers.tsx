import { useState, useEffect } from 'react'
import {
  Phone,
  Plus,
  PencilSimple,
  Trash,
  QrCode,
  CheckCircle,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
// [migración] LinearProgress se conserva de MUI Joy (sin equivalente en el DS).
import { LinearProgress } from '@mui/joy'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import api from '../services/api'

interface PhoneNumber {
  id: number
  phoneNumber: string
  displayName: string
  wabaId: string
  phoneNumberId: string
  status: 'active' | 'pending' | 'inactive' | 'error'
  verifiedName: string
  quality: number
  tier: string
  messagingLimit: string
  createdAt: string
}

const columns = [
  'Número',
  'Nombre Verificado',
  'Estado',
  'WABA ID',
  'Calidad',
  'Límite Diario',
  'Fecha Creación',
  '',
]

// Botón de acción de fila (mismo look que RowAction del prototipo, con onClick)
function ActionBtn({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}

export default function WhatsAppNumbers() {
  const [numbers, setNumbers] = useState<PhoneNumber[]>([])
  const [loading, setLoading] = useState(false)
  const [openModal, setOpenModal] = useState(false)
  const [editingNumber, setEditingNumber] = useState<PhoneNumber | null>(null)

  const fetchNumbers = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/whatsapp/numbers')
      setNumbers(data?.data ?? data ?? [])
    } catch {
      setNumbers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNumbers()
  }, [])

  const handleAdd = () => {
    setEditingNumber(null)
    setOpenModal(true)
  }

  const handleEdit = (number: PhoneNumber) => {
    setEditingNumber(number)
    setOpenModal(true)
  }

  const handleDelete = (_id: number) => {
    // TODO: llamar api.delete(`/whatsapp/numbers/${_id}`) y recargar lista
  }

  const getStatusVariant = (status: PhoneNumber['status']): BadgeProps['variant'] => {
    switch (status) {
      case 'active':
        return 'success'
      case 'pending':
        return 'warning'
      case 'inactive':
        return 'neutral'
      case 'error':
        return 'destructive'
      default:
        return 'neutral'
    }
  }

  const avgQuality =
    numbers.length === 0
      ? 0
      : Math.round(numbers.reduce((acc, n) => acc + n.quality, 0) / numbers.length)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Phone className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Gestión de Números WhatsApp
              </h1>
              <p className="text-sm text-muted-foreground">
                Administra tus números de teléfono de WhatsApp Business API
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleAdd}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Agregar Número
            </Button>
          </div>
        </div>

        {loading && <LinearProgress sx={{ mb: 0 }} />}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total de Números" value={String(numbers.length)} />
          <StatTile
            label="Números Activos"
            value={String(numbers.filter((n) => n.status === 'active').length)}
            tone="success"
          />
          <StatTile
            label="Con Errores"
            value={String(numbers.filter((n) => n.status === 'error').length)}
            tone="destructive"
          />
          <StatTile label="Calidad Promedio" value={`${avgQuality}%`} tone="primary" />
        </div>

        {/* Numbers Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
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
                {numbers.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      No hay números de WhatsApp configurados. Agrega tu primer número para comenzar.
                    </td>
                  </tr>
                ) : (
                  numbers.map((number) => (
                    <tr key={number.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div>
                          <span className="block font-medium text-foreground">
                            {number.phoneNumber}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {number.displayName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground">{number.verifiedName}</td>
                      <td className="px-4 py-3">
                        <Badge variant={getStatusVariant(number.status)}>
                          {number.status === 'active' ? (
                            <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                          ) : (
                            <WarningCircle className="size-3.5" weight="fill" aria-hidden />
                          )}
                          {number.status.charAt(0).toUpperCase() + number.status.slice(1)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-muted-foreground">
                          {number.wabaId}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={number.quality >= 80 ? 'success' : 'warning'}>
                          {number.quality}%
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-foreground">{number.messagingLimit}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {number.createdAt}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <ActionBtn label="Editar" onClick={() => handleEdit(number)}>
                            <PencilSimple className="size-[18px]" aria-hidden />
                          </ActionBtn>
                          <ActionBtn label="Ver código QR">
                            <QrCode className="size-[18px]" aria-hidden />
                          </ActionBtn>
                          <ActionBtn
                            label="Eliminar"
                            onClick={() => handleDelete(number.id)}
                            className="hover:bg-destructive/10 hover:text-destructive-text"
                          >
                            <Trash className="size-[18px]" aria-hidden />
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Crear/Editar */}
      {openModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {editingNumber ? 'Editar Número' : 'Agregar Número'}
              </h2>
              <ActionBtn label="Cerrar" onClick={() => setOpenModal(false)}>
                <X className="size-[18px]" aria-hidden />
              </ActionBtn>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="wa-phone">Número de Teléfono</Label>
                <input
                  id="wa-phone"
                  placeholder="+1 555-0000"
                  defaultValue={editingNumber?.phoneNumber}
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wa-display">Nombre para Mostrar</Label>
                <input
                  id="wa-display"
                  placeholder="Ej: Soporte Principal"
                  defaultValue={editingNumber?.displayName}
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wa-waba">WABA ID</Label>
                <input
                  id="wa-waba"
                  placeholder="WABA_XXXXXXXX"
                  defaultValue={editingNumber?.wabaId}
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wa-phoneid">Phone Number ID</Label>
                <input
                  id="wa-phoneid"
                  placeholder="PHONE_XXXXXXXX"
                  defaultValue={editingNumber?.phoneNumberId}
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wa-verified">Nombre Verificado (Meta)</Label>
                <input
                  id="wa-verified"
                  placeholder="Tu Empresa S.A."
                  defaultValue={editingNumber?.verifiedName}
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setOpenModal(false)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={() => setOpenModal(false)}>
                  {editingNumber ? 'Actualizar' : 'Crear'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
