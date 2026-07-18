import { useState, useEffect } from 'react'
import { CircularProgress } from '@mui/joy'
import {
  Plus,
  PencilSimple,
  Trash,
  MagnifyingGlass,
  Clock,
  CurrencyDollar,
  SquaresFour,
  TrendUp,
  Eye,
  EyeSlash,
  ArrowClockwise,
  X,
  Warning,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { toast } from 'react-toastify'
import appointmentService, { AppointmentServiceType, CreateServiceData } from '../services/appointmentService'

interface Service extends AppointmentServiceType {
  bookingsCount?: number
  revenue?: number
}

const inputCls =
  'h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

const columns = ['Color', 'Nombre', 'Duracion', 'Buffer', 'Precio', 'Max. Asistentes', 'Estado', 'Acciones']

export default function AppointmentsServices() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [openModal, setOpenModal] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [formData, setFormData] = useState<Partial<CreateServiceData>>({
    name: '',
    description: '',
    duration: 30,
    bufferTime: 0,
    price: 0,
    currency: 'USD',
    color: '#3b82f6',
    isActive: true,
    maxAttendees: 1,
    requiresConfirmation: false,
  })

  // Fetch services on mount
  useEffect(() => {
    fetchServices()
  }, [])

  const fetchServices = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await appointmentService.getServices(false)
      setServices(data.map(s => ({ ...s, bookingsCount: 0, revenue: 0 })))
    } catch (err: any) {
      console.error('Error fetching services:', err)
      setError(err.response?.data?.error || 'Error al cargar los servicios')
      toast.error('Error al cargar los servicios')
    } finally {
      setLoading(false)
    }
  }

  const filteredServices = services.filter((service) => {
    const matchesSearch =
      service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (service.description || '').toLowerCase().includes(searchQuery.toLowerCase())
    const matchesActive = showInactive || service.isActive
    return matchesSearch && matchesActive
  })

  const handleOpenModal = (service?: Service) => {
    if (service) {
      setEditingService(service)
      setFormData({
        name: service.name,
        description: service.description || '',
        duration: service.duration,
        bufferTime: service.bufferTime || 0,
        price: service.price || 0,
        currency: service.currency || 'USD',
        color: service.color || '#3b82f6',
        isActive: service.isActive,
        maxAttendees: service.maxAttendees || 1,
        requiresConfirmation: service.requiresConfirmation || false,
      })
    } else {
      setEditingService(null)
      setFormData({
        name: '',
        description: '',
        duration: 30,
        bufferTime: 0,
        price: 0,
        currency: 'USD',
        color: '#3b82f6',
        isActive: true,
        maxAttendees: 1,
        requiresConfirmation: false,
      })
    }
    setOpenModal(true)
  }

  const handleCloseModal = () => {
    setOpenModal(false)
    setEditingService(null)
  }

  const handleSave = async () => {
    if (!formData.name || !formData.duration) {
      toast.error('Nombre y duracion son requeridos')
      return
    }

    try {
      setSaving(true)

      if (editingService) {
        // Update existing service
        const updated = await appointmentService.updateService(editingService.id, formData)
        setServices(services.map((s) => (s.id === editingService.id ? { ...updated, bookingsCount: s.bookingsCount, revenue: s.revenue } : s)))
        toast.success('Servicio actualizado exitosamente')
      } else {
        // Create new service
        const created = await appointmentService.createService(formData as CreateServiceData)
        setServices([...services, { ...created, bookingsCount: 0, revenue: 0 }])
        toast.success('Servicio creado exitosamente')
      }
      handleCloseModal()
    } catch (err: any) {
      console.error('Error saving service:', err)
      toast.error(err.response?.data?.error || 'Error al guardar el servicio')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estas seguro de que quieres eliminar este servicio?')) {
      return
    }

    try {
      await appointmentService.deleteService(id)
      setServices(services.filter((s) => s.id !== id))
      toast.success('Servicio eliminado exitosamente')
    } catch (err: any) {
      console.error('Error deleting service:', err)
      toast.error(err.response?.data?.error || 'Error al eliminar el servicio')
    }
  }

  const handleToggleActive = async (service: Service) => {
    try {
      const updated = await appointmentService.updateService(service.id, { isActive: !service.isActive })
      setServices(services.map((s) => (s.id === service.id ? { ...updated, bookingsCount: s.bookingsCount, revenue: s.revenue } : s)))
      toast.success(updated.isActive ? 'Servicio activado' : 'Servicio desactivado')
    } catch (err: any) {
      console.error('Error toggling service:', err)
      toast.error('Error al cambiar el estado del servicio')
    }
  }

  const totalRevenue = services.reduce((sum, s) => sum + (s.revenue || 0), 0)
  const totalBookings = services.reduce((sum, s) => sum + (s.bookingsCount || 0), 0)
  const activeServices = services.filter((s) => s.isActive).length

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <CircularProgress size="lg" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <SquaresFour className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Gestion de Servicios
              </h1>
              <p className="text-sm text-muted-foreground">
                Administra los servicios disponibles para agendamiento
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchServices}>
              <ArrowClockwise className="size-4" aria-hidden />
              Actualizar
            </Button>
            <Button size="sm" onClick={() => handleOpenModal()}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nuevo Servicio
            </Button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text"
          >
            <Warning className="size-5 shrink-0" weight="fill" aria-hidden />
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <SquaresFour className="size-6" aria-hidden />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Total Servicios</p>
              <p className="text-2xl font-semibold tabular-nums text-foreground">{services.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-success/14 text-success-text">
              <Eye className="size-6" aria-hidden />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Servicios Activos</p>
              <p className="text-2xl font-semibold tabular-nums text-foreground">{activeServices}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-warning/16 text-warning-text">
              <TrendUp className="size-6" aria-hidden />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Total Reservas</p>
              <p className="text-2xl font-semibold tabular-nums text-foreground">{totalBookings}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <CurrencyDollar className="size-6" aria-hidden />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Ingresos Totales</p>
              <p className="text-2xl font-semibold tabular-nums text-foreground">${totalRevenue.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
          <div className="relative min-w-[280px] flex-1">
            <MagnifyingGlass
              className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              placeholder="Buscar servicios..."
              aria-label="Buscar servicios"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={showInactive} onCheckedChange={setShowInactive} id="show-inactive" />
            Mostrar inactivos
          </label>
        </div>

        {/* Services Table */}
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
                {filteredServices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      {services.length === 0
                        ? 'No hay servicios creados. Crea tu primer servicio.'
                        : 'No se encontraron servicios con los filtros aplicados.'}
                    </td>
                  </tr>
                ) : (
                  filteredServices.map((service) => (
                    <tr key={service.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <span
                          className="block size-8 rounded-full ring-1 ring-inset ring-black/10"
                          style={{ backgroundColor: service.color || '#3b82f6' }}
                          aria-hidden
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-foreground">{service.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {service.description || 'Sin descripcion'}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="size-4" aria-hidden />
                          <span>{service.duration} min</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {service.bufferTime || 0} min
                      </td>
                      <td className="px-4 py-3 font-medium tabular-nums text-foreground">
                        ${service.price || 0} {service.currency || 'USD'}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {service.maxAttendees || 1}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={service.isActive ? 'success' : 'neutral'}>
                          {service.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            aria-label={service.isActive ? 'Desactivar servicio' : 'Activar servicio'}
                            title={service.isActive ? 'Desactivar servicio' : 'Activar servicio'}
                            onClick={() => handleToggleActive(service)}
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            {service.isActive ? (
                              <EyeSlash className="size-[18px]" aria-hidden />
                            ) : (
                              <Eye className="size-[18px]" aria-hidden />
                            )}
                          </button>
                          <button
                            type="button"
                            aria-label="Editar"
                            title="Editar"
                            onClick={() => handleOpenModal(service)}
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            <PencilSimple className="size-[18px]" aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label="Eliminar"
                            title="Eliminar"
                            onClick={() => handleDelete(service.id)}
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

      {/* Create/Edit Modal */}
      {openModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={handleCloseModal}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {editingService ? 'Editar Servicio' : 'Nuevo Servicio'}
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                title="Cerrar"
                onClick={handleCloseModal}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <X className="size-[18px]" aria-hidden />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="svc-name">Nombre del Servicio</Label>
                <input
                  id="svc-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Consulta General"
                  className={inputCls}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="svc-description">Descripcion</Label>
                <textarea
                  id="svc-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe el servicio..."
                  rows={3}
                  className="w-full rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="svc-duration">Duracion (min)</Label>
                  <input
                    id="svc-duration"
                    type="number"
                    min={15}
                    step={15}
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 0 })}
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="svc-buffer">Buffer (min)</Label>
                  <input
                    id="svc-buffer"
                    type="number"
                    min={0}
                    step={5}
                    value={formData.bufferTime}
                    onChange={(e) => setFormData({ ...formData, bufferTime: parseInt(e.target.value) || 0 })}
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="svc-attendees">Max. Asistentes</Label>
                  <input
                    id="svc-attendees"
                    type="number"
                    min={1}
                    value={formData.maxAttendees}
                    onChange={(e) => setFormData({ ...formData, maxAttendees: parseInt(e.target.value) || 1 })}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="svc-price">Precio</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      $
                    </span>
                    <input
                      id="svc-price"
                      type="number"
                      min={0}
                      step={10}
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                      className={`${inputCls} pl-7`}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="svc-currency">Moneda</Label>
                  <Select
                    value={formData.currency}
                    onValueChange={(value) => setFormData({ ...formData, currency: value })}
                  >
                    <SelectTrigger id="svc-currency" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="MXN">MXN</SelectItem>
                      <SelectItem value="COP">COP</SelectItem>
                      <SelectItem value="ARS">ARS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="svc-color">Color</Label>
                <input
                  id="svc-color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="h-11 w-full cursor-pointer rounded-md border border-input bg-card p-1"
                />
              </div>

              <div className="flex flex-wrap gap-6">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    id="svc-active"
                    checked={!!formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  />
                  Servicio activo
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    id="svc-confirm"
                    checked={!!formData.requiresConfirmation}
                    onCheckedChange={(checked) => setFormData({ ...formData, requiresConfirmation: checked })}
                  />
                  Requiere confirmacion
                </label>
              </div>

              <div className="border-t border-border" />

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={handleCloseModal} disabled={saving}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!formData.name || !formData.duration || saving}
                  loading={saving}
                >
                  {editingService ? 'Guardar Cambios' : 'Crear Servicio'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
