import { useState, useEffect } from 'react'
import {
  Tag as TagIcon,
  ArrowClockwise,
  Plus,
  MagnifyingGlass,
  PencilSimple,
  Trash,
  X,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RowAction } from '@/components/ui/row-action'
import api from '../services/api'

interface Tag {
  id: number
  name: string
  color: string
  uses?: number
  createdAt: string
  description?: string
}

const columns = ['Color', 'Etiqueta', 'Usos', 'Creado', '']

export default function Tags() {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [openModal, setOpenModal] = useState(false)
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    color: '#3b82f6',
    kanban: 0,
    description: '',
  })

  useEffect(() => {
    fetchTags()
  }, [])

  const fetchTags = async () => {
    try {
      setLoading(true)
      const response = await api.get('/tags')
      console.log('Tags API response:', response.data)

      // Backend returns { tags, count, hasMore }
      const tagsData = Array.isArray(response.data)
        ? response.data
        : (response.data.tags || [])

      setTags(tagsData)

      if (tagsData.length === 0) {
        console.log('No tags found in database')
      }
    } catch (error) {
      console.error('Error fetching tags:', error)
      // Show empty array on error to see real state
      setTags([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      await api.post('/tags', formData)
      fetchTags()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error creating tag:', error)
    }
  }

  const handleUpdate = async () => {
    if (!selectedTag) return
    try {
      await api.put(`/tags/${selectedTag.id}`, formData)
      fetchTags()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error updating tag:', error)
    }
  }

  const handleDelete = async (tagId: number) => {
    if (confirm('¿Estás seguro de eliminar esta etiqueta?')) {
      try {
        await api.delete(`/tags/${tagId}`)
        fetchTags()
      } catch (error) {
        console.error('Error deleting tag:', error)
      }
    }
  }

  const openEditModal = (tag: Tag) => {
    setSelectedTag(tag)
    setFormData({
      name: tag.name,
      color: tag.color,
      kanban: 0,
      description: tag.description || '',
    })
    setOpenModal(true)
  }

  const openCreateModal = () => {
    setSelectedTag(null)
    resetForm()
    setOpenModal(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      color: '#3b82f6',
      kanban: 0,
      description: '',
    })
  }

  const closeModal = () => {
    setOpenModal(false)
    resetForm()
    setSelectedTag(null)
  }

  const filteredTags = tags.filter((tag) =>
    tag.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const stats = {
    total: tags.length,
    mostUsed:
      [...tags].sort((a, b) => (b.uses || 0) - (a.uses || 0))[0]?.name || '-',
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <TagIcon className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Etiquetas
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestión de etiquetas para clasificación
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={fetchTags}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={openCreateModal}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nueva etiqueta
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatTile label="Total etiquetas" value={String(stats.total)} />
          <StatTile label="Más usada" value={stats.mostUsed} />
          <StatTile label="Activas" value={String(stats.total)} tone="success" />
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <MagnifyingGlass
            className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            placeholder="Buscar etiquetas"
            aria-label="Buscar etiquetas"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>

        {/* Tags Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
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
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      Cargando etiquetas...
                    </td>
                  </tr>
                ) : filteredTags.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      No se encontraron etiquetas
                    </td>
                  </tr>
                ) : (
                  filteredTags.map((tag) => (
                    <tr
                      key={tag.id}
                      className="transition-colors hover:bg-accent/40"
                    >
                      <td className="px-4 py-3">
                        <span
                          className="block size-6 rounded-md ring-1 ring-inset ring-black/10"
                          style={{ backgroundColor: tag.color }}
                          aria-hidden
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: tag.color }}
                            aria-hidden
                          />
                          {tag.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {tag.uses || 0}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {new Date(tag.createdAt).toLocaleDateString('es-ES')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <RowAction label="Editar">
                            <button
                              type="button"
                              aria-label="Editar"
                              onClick={() => openEditModal(tag)}
                              className="flex size-full items-center justify-center"
                            >
                              <PencilSimple className="size-[18px]" aria-hidden />
                            </button>
                          </RowAction>
                          <button
                            type="button"
                            aria-label="Eliminar"
                            title="Eliminar"
                            onClick={() => handleDelete(tag.id)}
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
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {selectedTag ? 'Editar etiqueta' : 'Nueva etiqueta'}
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
                <Label htmlFor="tag-name">Nombre</Label>
                <input
                  id="tag-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Ej: VIP"
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tag-color">Color</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="tag-color"
                    type="color"
                    value={formData.color}
                    onChange={(e) =>
                      setFormData({ ...formData, color: e.target.value })
                    }
                    className="h-10 w-16 cursor-pointer rounded-md border border-input bg-card p-1"
                  />
                  <span className="text-sm text-muted-foreground">Vista previa:</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: formData.color }}
                      aria-hidden
                    />
                    {formData.name || 'Etiqueta'}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tag-description">Descripción</Label>
                <input
                  id="tag-description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Descripción de la etiqueta (opcional)"
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={closeModal}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={selectedTag ? handleUpdate : handleCreate}
                >
                  {selectedTag ? 'Actualizar' : 'Crear'} etiqueta
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
