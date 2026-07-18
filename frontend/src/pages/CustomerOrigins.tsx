import { useState, useEffect } from 'react'
import {
  Path,
  Plus,
  PencilSimple,
  Trash,
  MagnifyingGlass,
  ArrowClockwise,
  CheckCircle,
  XCircle,
  X,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { RowAction } from '@/components/ui/row-action'
import { cn } from '@/lib/utils'
import api from '../services/api'
import { toast } from 'react-toastify'

interface CustomerOrigin {
  id: number
  name: string
  description: string | null
  color: string
  isActive: boolean
  companyId: number
  createdAt: string
  updatedAt: string
}

const columns = ['Color', 'Nombre', 'Descripción', 'Estado', 'Fecha Creación', 'Acciones']

export default function CustomerOrigins({ embedded = false }: { embedded?: boolean }) {
  const [origins, setOrigins] = useState<CustomerOrigin[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAll, setShowAll] = useState(true) // Mostrar activos e inactivos
  const [openModal, setOpenModal] = useState(false)
  const [selectedOrigin, setSelectedOrigin] = useState<CustomerOrigin | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#6366F1',
    isActive: true,
  })

  useEffect(() => {
    fetchOrigins()
  }, [showAll])

  const fetchOrigins = async () => {
    try {
      setLoading(true)
      const response = await api.get('/customer-origins', {
        params: { showAll: showAll.toString() }
      })
      console.log('CustomerOrigins API response:', response.data)

      const originsData = response.data.records || []
      setOrigins(originsData)
    } catch (error) {
      console.error('Error fetching customer origins:', error)
      toast.error('Error al cargar orígenes de cliente')
      setOrigins([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }

    try {
      await api.post('/customer-origins', formData)
      toast.success('Origen creado correctamente')
      fetchOrigins()
      setOpenModal(false)
      resetForm()
    } catch (error: any) {
      console.error('Error creating origin:', error)
      toast.error(error.response?.data?.message || 'Error al crear origen')
    }
  }

  const handleUpdate = async () => {
    if (!selectedOrigin) return
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }

    try {
      await api.put(`/customer-origins/${selectedOrigin.id}`, formData)
      toast.success('Origen actualizado correctamente')
      fetchOrigins()
      setOpenModal(false)
      resetForm()
    } catch (error: any) {
      console.error('Error updating origin:', error)
      toast.error(error.response?.data?.message || 'Error al actualizar origen')
    }
  }

  const handleDelete = async (originId: number) => {
    if (confirm('¿Estás seguro de eliminar este origen? Esta acción no se puede deshacer.')) {
      try {
        await api.delete(`/customer-origins/${originId}`)
        toast.success('Origen eliminado correctamente')
        fetchOrigins()
      } catch (error: any) {
        console.error('Error deleting origin:', error)
        toast.error(error.response?.data?.message || 'Error al eliminar origen')
      }
    }
  }

  const handleToggleActive = async (origin: CustomerOrigin) => {
    try {
      await api.put(`/customer-origins/${origin.id}`, {
        isActive: !origin.isActive
      })
      toast.success(`Origen ${!origin.isActive ? 'activado' : 'desactivado'}`)
      fetchOrigins()
    } catch (error: any) {
      console.error('Error toggling origin status:', error)
      toast.error(error.response?.data?.message || 'Error al cambiar estado')
    }
  }

  const openEditModal = (origin: CustomerOrigin) => {
    setSelectedOrigin(origin)
    setFormData({
      name: origin.name,
      description: origin.description || '',
      color: origin.color,
      isActive: origin.isActive,
    })
    setOpenModal(true)
  }

  const openCreateModal = () => {
    setSelectedOrigin(null)
    resetForm()
    setOpenModal(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      color: '#6366F1',
      isActive: true,
    })
    setSelectedOrigin(null)
  }

  const closeModal = () => {
    setOpenModal(false)
    resetForm()
  }

  const filteredOrigins = origins.filter((origin) =>
    origin.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (origin.description && origin.description.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const stats = {
    total: origins.length,
    active: origins.filter(o => o.isActive).length,
    inactive: origins.filter(o => !o.isActive).length,
  }

  const body = (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        {embedded ? (
          <div>
            <h2 className="text-lg font-semibold text-foreground">Gestión de Orígenes</h2>
            <p className="text-sm text-muted-foreground">
              Crea y administra los orígenes de tus clientes
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Path className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Origen de Cliente
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestiona los orígenes de tus clientes para reportes y seguimiento
              </p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualizar"
            className="text-muted-foreground"
            onClick={fetchOrigins}
          >
            <ArrowClockwise className="size-5" aria-hidden />
          </Button>
          <Button size="sm" onClick={openCreateModal}>
            <Plus className="size-4" weight="bold" aria-hidden />
            Nuevo Origen
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile label="Total Orígenes" value={String(stats.total)} />
        <StatTile label="Activos" value={String(stats.active)} tone="success" />
        <StatTile label="Inactivos" value={String(stats.inactive)} />
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
        <div className="relative min-w-[220px] flex-1">
          <MagnifyingGlass
            className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            placeholder="Buscar orígenes..."
            aria-label="Buscar orígenes"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            id="show-all"
            checked={showAll}
            onCheckedChange={setShowAll}
          />
          Mostrar inactivos
        </label>
      </div>

      {/* Origins Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
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
                    Cargando orígenes...
                  </td>
                </tr>
              ) : filteredOrigins.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    <p>No se encontraron orígenes</p>
                    <p className="mt-1 text-sm">
                      Crea tu primer origen haciendo clic en "Nuevo Origen"
                    </p>
                  </td>
                </tr>
              ) : (
                filteredOrigins.map((origin) => (
                  <tr
                    key={origin.id}
                    className={cn(
                      'transition-colors hover:bg-accent/40',
                      !origin.isActive && 'opacity-60',
                    )}
                  >
                    <td className="px-4 py-3">
                      <span
                        className="block size-8 rounded-md ring-1 ring-inset ring-black/10"
                        style={{ backgroundColor: origin.color }}
                        aria-hidden
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold text-white"
                        style={{ backgroundColor: origin.color }}
                      >
                        {origin.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {origin.description || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(origin)}
                        aria-label={origin.isActive ? 'Desactivar origen' : 'Activar origen'}
                        className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                      >
                        <Badge variant={origin.isActive ? 'success' : 'neutral'}>
                          {origin.isActive ? (
                            <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                          ) : (
                            <XCircle className="size-3.5" weight="fill" aria-hidden />
                          )}
                          {origin.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {new Date(origin.createdAt).toLocaleDateString('es-ES')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-0.5">
                        <RowAction label="Editar">
                          <button
                            type="button"
                            aria-label="Editar"
                            onClick={() => openEditModal(origin)}
                            className="flex size-full items-center justify-center"
                          >
                            <PencilSimple className="size-[18px]" aria-hidden />
                          </button>
                        </RowAction>
                        <button
                          type="button"
                          aria-label="Eliminar"
                          title="Eliminar"
                          onClick={() => handleDelete(origin.id)}
                          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-text"
                        >
                          <Trash className="size-[18px]" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
            className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {selectedOrigin ? 'Editar Origen' : 'Nuevo Origen'}
              </h2>
              <RowAction label="Cerrar">
                <button
                  type="button"
                  aria-label="Cerrar"
                  onClick={closeModal}
                  className="flex size-full items-center justify-center"
                >
                  <X className="size-[18px]" aria-hidden />
                </button>
              </RowAction>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="origin-name">Nombre</Label>
                <input
                  id="origin-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Referido, Instagram, Facebook Ads"
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="origin-description">Descripción</Label>
                <textarea
                  id="origin-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción opcional del origen"
                  rows={2}
                  className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="origin-color">Color</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="origin-color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="h-10 w-16 cursor-pointer rounded-md border border-input bg-card p-1"
                  />
                  <input
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="#6366F1"
                    aria-label="Código de color"
                    className="h-10 w-32 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </div>
              </div>

              <label className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Activo</span>
                <Checkbox
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
              </label>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Vista Previa:</span>
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold text-white"
                  style={{ backgroundColor: formData.color }}
                >
                  {formData.name || 'Origen'}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={closeModal}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={selectedOrigin ? handleUpdate : handleCreate}>
                  {selectedOrigin ? 'Actualizar' : 'Crear'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  if (embedded) return body
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] p-5 sm:p-6 lg:p-8">{body}</div>
    </div>
  )
}
