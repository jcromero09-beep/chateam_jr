import { useState, useEffect } from 'react'
import {
  Megaphone,
  Plus,
  PencilSimple,
  Trash,
  MagnifyingGlass,
  ArrowClockwise,
  Eye,
  Paperclip,
  X,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RowAction } from '@/components/ui/row-action'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import api from '../services/api'

interface Announcement {
  id: number
  title: string
  text: string
  priority: number
  status: boolean
  mediaPath?: string
  mediaName?: string
  companyId: number
  createdAt: string
}

const columns = ['Estado', 'Título', 'Contenido', 'Prioridad', 'Archivos', 'Fecha Creación', '']

// Toggle accesible (role=switch) con tokens del design system.
function Switch({
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
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 transform rounded-full bg-card shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
        aria-hidden
      />
    </button>
  )
}

export default function Announcements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [openModal, setOpenModal] = useState(false)
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    text: '',
    priority: 1,
    status: true,
  })

  useEffect(() => {
    fetchAnnouncements()
  }, [])

  const fetchAnnouncements = async () => {
    try {
      setLoading(true)
      const response = await api.get('/announcements')
      console.log('Announcements API response:', response.data)

      // Backend returns { announcements, count, hasMore } or similar
      const announcementsData = Array.isArray(response.data)
        ? response.data
        : (response.data.announcements || response.data.records || [])

      setAnnouncements(announcementsData)
    } catch (error) {
      console.error('Error fetching announcements:', error)
      // Set empty array on error instead of mock data
      setAnnouncements([])
      /*
      // Mock data removed - use real API data only
      setAnnouncements([
        {
          id: 1,
          title: 'Nueva Funcionalidad: Chat en Tiempo Real',
          text: 'Ahora puedes ver todos los chats activos en tiempo real desde el panel de control.',
          priority: 1,
          status: true,
          companyId: 1,
          createdAt: '2025-01-10T00:00:00',
        },
        {
          id: 2,
          title: 'Mantenimiento Programado',
          text: 'El sistema estará en mantenimiento el próximo sábado de 2:00 AM a 6:00 AM.',
          priority: 2,
          status: true,
          companyId: 1,
          createdAt: '2025-01-09T00:00:00',
        },
        {
          id: 3,
          title: 'Actualización de Seguridad',
          text: 'Hemos implementado nuevas medidas de seguridad para proteger tus datos.',
          priority: 1,
          status: true,
          companyId: 1,
          createdAt: '2025-01-08T00:00:00',
        },
        {
          id: 4,
          title: 'Nuevo Módulo: Campañas de Marketing',
          text: 'Ya está disponible el módulo de campañas para enviar mensajes masivos.',
          priority: 3,
          status: false,
          companyId: 1,
          createdAt: '2025-01-07T00:00:00',
        },
        {
          id: 5,
          title: 'Integración con WhatsApp Business API',
          text: 'Ahora puedes conectar múltiples números de WhatsApp Business.',
          priority: 1,
          status: true,
          companyId: 1,
          createdAt: '2025-01-06T00:00:00',
        },
      ])
      */
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      await api.post('/announcements', formData)
      fetchAnnouncements()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error creating announcement:', error)
    }
  }

  const handleUpdate = async () => {
    if (!selectedAnnouncement) return
    try {
      await api.put(`/announcements/${selectedAnnouncement.id}`, formData)
      fetchAnnouncements()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error updating announcement:', error)
    }
  }

  const handleDelete = async (announcementId: number) => {
    if (confirm('¿Estás seguro de eliminar este anuncio?')) {
      try {
        await api.delete(`/announcements/${announcementId}`)
        fetchAnnouncements()
      } catch (error) {
        console.error('Error deleting announcement:', error)
      }
    }
  }

  const handleToggleStatus = async (announcement: Announcement) => {
    try {
      await api.put(`/announcements/${announcement.id}`, {
        ...announcement,
        status: !announcement.status,
      })
      fetchAnnouncements()
    } catch (error) {
      console.error('Error toggling announcement status:', error)
    }
  }

  const openEditModal = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement)
    setFormData({
      title: announcement.title,
      text: announcement.text,
      priority: announcement.priority,
      status: announcement.status,
    })
    setOpenModal(true)
  }

  const openCreateModal = () => {
    setSelectedAnnouncement(null)
    resetForm()
    setOpenModal(true)
  }

  const resetForm = () => {
    setFormData({
      title: '',
      text: '',
      priority: 1,
      status: true,
    })
  }

  const closeModal = () => {
    setOpenModal(false)
    resetForm()
    setSelectedAnnouncement(null)
  }

  const getPriorityVariant = (priority: number): BadgeProps['variant'] => {
    switch (priority) {
      case 1:
        return 'destructive'
      case 2:
        return 'warning'
      case 3:
        return 'primary'
      default:
        return 'neutral'
    }
  }

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 1:
        return 'Alta'
      case 2:
        return 'Media'
      case 3:
        return 'Baja'
      default:
        return 'Normal'
    }
  }

  const filteredAnnouncements = announcements.filter((announcement) => {
    const matchesSearch =
      announcement.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      announcement.text.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && announcement.status) ||
      (statusFilter === 'inactive' && !announcement.status)

    return matchesSearch && matchesStatus
  })

  const stats = {
    total: announcements.length,
    active: announcements.filter((a) => a.status).length,
    inactive: announcements.filter((a) => !a.status).length,
    highPriority: announcements.filter((a) => a.priority === 1 && a.status).length,
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Megaphone className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Anuncios
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestión de anuncios del sistema
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={fetchAnnouncements}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={openCreateModal}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nuevo anuncio
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total anuncios" value={String(stats.total)} />
          <StatTile label="Activos" value={String(stats.active)} tone="success" />
          <StatTile label="Inactivos" value={String(stats.inactive)} />
          <StatTile
            label="Prioridad alta"
            value={String(stats.highPriority)}
            tone="destructive"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <MagnifyingGlass
              className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              placeholder="Buscar anuncios"
              aria-label="Buscar anuncios"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 sm:w-48" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="inactive">Inactivos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Announcements Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
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
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      Cargando anuncios...
                    </td>
                  </tr>
                ) : filteredAnnouncements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      No se encontraron anuncios
                    </td>
                  </tr>
                ) : (
                  filteredAnnouncements.map((announcement) => (
                    <tr
                      key={announcement.id}
                      className="transition-colors hover:bg-accent/40"
                    >
                      <td className="px-4 py-3">
                        <Switch
                          checked={announcement.status}
                          onChange={() => handleToggleStatus(announcement)}
                          label={
                            announcement.status
                              ? 'Desactivar anuncio'
                              : 'Activar anuncio'
                          }
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {announcement.title}
                      </td>
                      <td className="px-4 py-3">
                        <span className="block max-w-[400px] truncate text-muted-foreground">
                          {announcement.text}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={getPriorityVariant(announcement.priority)}>
                          {getPriorityLabel(announcement.priority)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {announcement.mediaPath ? (
                          <RowAction
                            label="Ver archivo adjunto"
                            className="text-primary hover:bg-primary/10 hover:text-primary"
                          >
                            <Paperclip className="size-[18px]" aria-hidden />
                          </RowAction>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {new Date(announcement.createdAt).toLocaleDateString('es-ES')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <RowAction label="Ver detalles">
                            <Eye className="size-[18px]" aria-hidden />
                          </RowAction>
                          <button
                            type="button"
                            aria-label="Editar"
                            title="Editar"
                            onClick={() => openEditModal(announcement)}
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            <PencilSimple className="size-[18px]" aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label="Eliminar"
                            title="Eliminar"
                            onClick={() => handleDelete(announcement.id)}
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
            className="w-full max-w-xl rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {selectedAnnouncement ? 'Editar anuncio' : 'Nuevo anuncio'}
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
                <Label htmlFor="announcement-title">Título</Label>
                <input
                  id="announcement-title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Título del anuncio"
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="announcement-text">Contenido</Label>
                <textarea
                  id="announcement-text"
                  value={formData.text}
                  onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                  placeholder="Escribe el contenido del anuncio..."
                  rows={4}
                  className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="announcement-priority">Prioridad</Label>
                <Select
                  value={String(formData.priority)}
                  onValueChange={(value) =>
                    setFormData({ ...formData, priority: Number(value) })
                  }
                >
                  <SelectTrigger id="announcement-priority" aria-label="Prioridad">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Alta</SelectItem>
                    <SelectItem value="2">Media</SelectItem>
                    <SelectItem value="3">Baja</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Estado</Label>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={formData.status}
                    onChange={() =>
                      setFormData({ ...formData, status: !formData.status })
                    }
                    label={formData.status ? 'Marcar como inactivo' : 'Marcar como activo'}
                  />
                  <span className="text-sm text-muted-foreground">
                    {formData.status
                      ? 'Activo (visible para usuarios)'
                      : 'Inactivo (oculto)'}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Vista previa:</strong>
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formData.title || 'Título del anuncio'}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {formData.text || 'Contenido del anuncio...'}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={closeModal}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={selectedAnnouncement ? handleUpdate : handleCreate}
                >
                  {selectedAnnouncement ? 'Actualizar' : 'Crear'} anuncio
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
