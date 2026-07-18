import { useState, useEffect } from 'react'
import {
  Queue as QueueIcon,
  ArrowClockwise,
  Plus,
  MagnifyingGlass,
  PencilSimple,
  Trash,
  X,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import api from '../services/api'
import { toast } from 'react-toastify'

interface Queue {
  id: number
  name: string
  color: string
  greetingMessage?: string
  outOfHoursMessage?: string
  promptAI?: string
  orderQueue?: number
  isActive?: boolean
  createdAt: string
}

interface QueueApiError {
  response?: {
    data?: {
      message?: string
      error?: string
      errors?: Array<{ message?: string } | string>
    }
  }
  message?: string
}

const getQueueErrorMessage = (error: unknown, fallback: string): string => {
  const apiError = error as QueueApiError
  const responseData = apiError?.response?.data

  if (typeof responseData?.message === 'string' && responseData.message.trim()) {
    return responseData.message
  }

  if (typeof responseData?.error === 'string' && responseData.error.trim()) {
    return responseData.error
  }

  const firstNestedError = responseData?.errors?.[0]
  if (typeof firstNestedError === 'string' && firstNestedError.trim()) {
    return firstNestedError
  }

  if (
    firstNestedError &&
    typeof firstNestedError === 'object' &&
    typeof firstNestedError.message === 'string' &&
    firstNestedError.message.trim()
  ) {
    return firstNestedError.message
  }

  if (typeof apiError?.message === 'string' && apiError.message.trim()) {
    return apiError.message
  }

  return fallback
}

const columns = ['Color', 'Nombre', 'Mensaje de Saludo', 'Estado', 'Fecha Creación', '']

// Botón de acción de fila (mismo look que RowAction, con onClick)
function ActionBtn({
  label,
  onClick,
  className,
  children,
}: {
  label: string
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

export default function Queues() {
  const [queues, setQueues] = useState<Queue[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [openModal, setOpenModal] = useState(false)
  const [selectedQueue, setSelectedQueue] = useState<Queue | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    color: '#3b82f6',
    greetingMessage: '',
    outOfHoursMessage: '',
    promptAI: '',
    orderQueue: 0,
  })

  useEffect(() => {
    fetchQueues()
  }, [])

  const fetchQueues = async () => {
    try {
      setLoading(true)
      const response = await api.get('/queue')
      setQueues(response.data.queues || response.data)
    } catch (error) {
      console.error('Error fetching queues:', error)
      setQueues([])
      toast.error(getQueueErrorMessage(error, 'Error al cargar las colas'))
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      await api.post('/queue', formData)
      await fetchQueues()
      setOpenModal(false)
      resetForm()
    } catch (error: any) {
      console.error('Error creating queue:', error)
      toast.error(getQueueErrorMessage(error, 'Error al crear la cola'))
    }
  }

  const handleUpdate = async () => {
    if (!selectedQueue) return
    try {
      await api.put(`/queue/${selectedQueue.id}`, formData)
      await fetchQueues()
      setOpenModal(false)
      resetForm()
    } catch (error: any) {
      console.error('Error updating queue:', error)
      toast.error(getQueueErrorMessage(error, 'Error al actualizar la cola'))
    }
  }

  const handleDelete = async (queueId: number) => {
    if (confirm('¿Estás seguro de eliminar esta cola?')) {
      try {
        await api.delete(`/queue/${queueId}`)
        await fetchQueues()
      } catch (error: any) {
        console.error('Error deleting queue:', error)
        toast.error(getQueueErrorMessage(error, 'Error al eliminar la cola'))
      }
    }
  }

  const openEditModal = (queue: Queue) => {
    setSelectedQueue(queue)
    setFormData({
      name: queue.name,
      color: queue.color,
      greetingMessage: queue.greetingMessage || '',
      outOfHoursMessage: queue.outOfHoursMessage || '',
      promptAI: queue.promptAI || '',
      orderQueue: queue.orderQueue || 0,
    })
    setOpenModal(true)
  }

  const openCreateModal = () => {
    setSelectedQueue(null)
    resetForm()
    setOpenModal(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      color: '#3b82f6',
      greetingMessage: '',
      outOfHoursMessage: '',
      promptAI: '',
      orderQueue: 0,
    })
  }

  const closeModal = () => {
    setOpenModal(false)
    resetForm()
    setSelectedQueue(null)
  }

  const filteredQueues = queues.filter((queue) =>
    queue.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const stats = {
    total: queues.length,
    active: queues.filter((q) => q.isActive !== false).length,
    inactive: queues.filter((q) => q.isActive === false).length,
    tickets: 245,
  }

  // Clases compartidas de campos de formulario
  const fieldClass =
    'w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <QueueIcon className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Colas
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestión de colas de atención
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refrescar"
              className="text-muted-foreground"
              onClick={fetchQueues}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={openCreateModal}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nueva Cola
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total Colas" value={String(stats.total)} />
          <StatTile label="Activas" value={String(stats.active)} tone="success" />
          <StatTile label="En Espera" value="34" tone="warning" />
          <StatTile label="Atendidos Hoy" value={String(stats.tickets)} />
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <MagnifyingGlass
            className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            placeholder="Buscar colas..."
            aria-label="Buscar colas"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>

        {/* Queues Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
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
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      Cargando colas...
                    </td>
                  </tr>
                ) : filteredQueues.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No se encontraron colas
                    </td>
                  </tr>
                ) : (
                  filteredQueues.map((queue) => (
                    <tr key={queue.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <span
                          className="block size-4 rounded-full ring-1 ring-inset ring-black/10"
                          style={{ backgroundColor: queue.color }}
                          aria-hidden
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {queue.name}
                      </td>
                      <td className="max-w-[300px] truncate px-4 py-3 text-xs text-muted-foreground">
                        {queue.greetingMessage || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={queue.isActive !== false ? 'success' : 'neutral'}>
                          {queue.isActive !== false ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {new Date(queue.createdAt).toLocaleDateString('es-ES')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <ActionBtn
                            label="Editar"
                            onClick={() => openEditModal(queue)}
                            className="hover:bg-primary/10 hover:text-primary"
                          >
                            <PencilSimple className="size-[18px]" aria-hidden />
                          </ActionBtn>
                          <ActionBtn
                            label="Eliminar"
                            onClick={() => handleDelete(queue.id)}
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

      {/* Modal Create/Edit */}
      {openModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
        >
          <div
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {selectedQueue ? 'Editar Cola' : 'Nueva Cola'}
              </h2>
              <ActionBtn label="Cerrar" onClick={closeModal}>
                <X className="size-[18px]" aria-hidden />
              </ActionBtn>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="queue-name">Nombre</Label>
                <input
                  id="queue-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Soporte Técnico"
                  className={cn(fieldClass, 'h-11')}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="queue-color">Color</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="queue-color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="h-10 w-16 cursor-pointer rounded-md border border-input bg-card p-1"
                  />
                  <span
                    className="block size-5 rounded-full ring-1 ring-inset ring-black/10"
                    style={{ backgroundColor: formData.color }}
                    aria-hidden
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="queue-greeting">Mensaje de Saludo</Label>
                <textarea
                  id="queue-greeting"
                  value={formData.greetingMessage}
                  onChange={(e) =>
                    setFormData({ ...formData, greetingMessage: e.target.value })
                  }
                  placeholder="Mensaje que se muestra al iniciar conversación"
                  rows={3}
                  className={cn(fieldClass, 'resize-y py-2.5')}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="queue-outofhours">Mensaje Fuera de Horario</Label>
                <textarea
                  id="queue-outofhours"
                  value={formData.outOfHoursMessage}
                  onChange={(e) =>
                    setFormData({ ...formData, outOfHoursMessage: e.target.value })
                  }
                  placeholder="Mensaje fuera del horario de atención"
                  rows={3}
                  className={cn(fieldClass, 'resize-y py-2.5')}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="queue-description">Descripción</Label>
                <textarea
                  id="queue-description"
                  value={formData.promptAI}
                  onChange={(e) => setFormData({ ...formData, promptAI: e.target.value })}
                  placeholder="Breve descripción de esta cola"
                  rows={4}
                  className={cn(fieldClass, 'resize-y py-2.5')}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={closeModal}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={selectedQueue ? handleUpdate : handleCreate}>
                  {selectedQueue ? 'Actualizar' : 'Crear'} Cola
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
