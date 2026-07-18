import { useState, useEffect } from 'react'
import {
  Chats,
  ArrowClockwise,
  Plus,
  PencilSimple,
  Trash,
  Copy,
  TreeStructure,
  X,
} from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import api from '../services/api'
import { toast } from 'react-toastify'

interface Flow {
  id: number
  name: string
  description?: string
  nodes: any
  connections: any
  createdAt: string
  updatedAt: string
}

// Botón de acción de fila (mismo look que RowAction del prototipo, con onClick)
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

export default function FlowbuilderConversation() {
  const navigate = useNavigate()
  const [flows, setFlows] = useState<Flow[]>([])
  const [loading, setLoading] = useState(true)
  const [openModal, setOpenModal] = useState(false)
  const [editingFlow, setEditingFlow] = useState<Flow | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  })

  useEffect(() => {
    fetchFlows()
  }, [])

  const fetchFlows = async () => {
    try {
      setLoading(true)
      const response = await api.get('/flowbuilder')
      console.log('✅ Flows recibidos:', response.data)
      setFlows(response.data.flows || response.data || [])
    } catch (error) {
      console.error('❌ Error fetching flows:', error)
      toast.error('Error al cargar los flujos')
      setFlows([])
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (flow?: Flow) => {
    if (flow) {
      setEditingFlow(flow)
      setFormData({
        name: flow.name,
        description: flow.description || '',
      })
    } else {
      setEditingFlow(null)
      setFormData({ name: '', description: '' })
    }
    setOpenModal(true)
  }

  const handleCloseModal = () => {
    setOpenModal(false)
    setEditingFlow(null)
    setFormData({ name: '', description: '' })
  }

  const handleSubmit = async () => {
    try {
      if (!formData.name.trim()) {
        toast.error('El nombre es obligatorio')
        return
      }

      if (editingFlow) {
        // Actualizar flujo existente
        await api.put('/flowbuilder', {
          id: editingFlow.id,
          name: formData.name,
          description: formData.description,
        })
        toast.success('Flujo actualizado correctamente')
      } else {
        // Crear nuevo flujo
        await api.post('/flowbuilder', {
          name: formData.name,
          description: formData.description,
          nodes: [],
          connections: [],
        })
        toast.success('Flujo creado correctamente')
      }

      handleCloseModal()
      fetchFlows()
    } catch (error: any) {
      console.error('Error al guardar flujo:', error)
      toast.error(error.response?.data?.message || 'Error al guardar el flujo')
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar este flujo?')) return

    try {
      await api.delete(`/flowbuilder/${id}`)
      toast.success('Flujo eliminado correctamente')
      fetchFlows()
    } catch (error: any) {
      console.error('Error al eliminar flujo:', error)
      toast.error(error.response?.data?.message || 'Error al eliminar el flujo')
    }
  }

  const handleDuplicate = async (id: number) => {
    try {
      await api.post('/flowbuilder/duplicate', { idFlow: id })
      toast.success('Flujo duplicado correctamente')
      fetchFlows()
    } catch (error: any) {
      console.error('Error al duplicar flujo:', error)
      toast.error(error.response?.data?.message || 'Error al duplicar el flujo')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Chats className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Flujos de Conversación
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestiona y crea flujos de conversaciones automatizadas
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={fetchFlows}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={() => handleOpenModal()} disabled={loading}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nuevo Flujo
            </Button>
          </div>
        </div>

        {/* Flows Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          {loading ? (
            <div className="px-4 py-10 text-center text-muted-foreground">
              Cargando flujos...
            </div>
          ) : flows.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-14 text-center">
              <span className="mb-4 flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Chats className="size-8" aria-hidden />
              </span>
              <h4 className="mb-1 text-lg font-semibold text-foreground">
                No hay flujos creados
              </h4>
              <p className="mb-5 text-sm text-muted-foreground">
                Crea tu primer flujo de conversación para automatizar respuestas
              </p>
              <Button size="sm" onClick={() => handleOpenModal()}>
                <Plus className="size-4" weight="bold" aria-hidden />
                Crear Primer Flujo
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="w-2/5 whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Nombre
                    </th>
                    <th className="w-[30%] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Descripción
                    </th>
                    <th className="w-[15%] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Fecha Creación
                    </th>
                    <th className="w-[15%] whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {flows.map((flow) => (
                    <tr key={flow.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {flow.name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {flow.description || 'Sin descripción'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatDate(flow.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <ActionBtn
                            label="Diseñar Flujo"
                            onClick={() => navigate(`/flowbuilder/editor/${flow.id}`)}
                            className="text-success-text hover:bg-success/10 hover:text-success-text"
                          >
                            <TreeStructure className="size-[18px]" aria-hidden />
                          </ActionBtn>
                          <ActionBtn
                            label="Editar Info"
                            onClick={() => handleOpenModal(flow)}
                            className="hover:bg-primary/10 hover:text-primary"
                          >
                            <PencilSimple className="size-[18px]" aria-hidden />
                          </ActionBtn>
                          <ActionBtn
                            label="Duplicar"
                            onClick={() => handleDuplicate(flow.id)}
                          >
                            <Copy className="size-[18px]" aria-hidden />
                          </ActionBtn>
                          <ActionBtn
                            label="Eliminar"
                            onClick={() => handleDelete(flow.id)}
                            className="hover:bg-destructive/10 hover:text-destructive-text"
                          >
                            <Trash className="size-[18px]" aria-hidden />
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal para Crear/Editar Flujo */}
      {openModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={handleCloseModal}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {editingFlow ? 'Editar Flujo' : 'Nuevo Flujo'}
              </h2>
              <ActionBtn label="Cerrar" onClick={handleCloseModal}>
                <X className="size-[18px]" aria-hidden />
              </ActionBtn>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="flow-name">Nombre *</Label>
                <input
                  id="flow-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Flujo de Bienvenida"
                  autoFocus
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="flow-description">Descripción</Label>
                <textarea
                  id="flow-description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Describe el propósito de este flujo..."
                  rows={3}
                  className="w-full rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={handleCloseModal}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSubmit}>
                  {editingFlow ? 'Actualizar' : 'Crear'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
