import { useState, useEffect } from 'react'
// [Fase2·G] Conservado como MUI a propósito: no hay equivalente de progreso en el design system.
import { LinearProgress } from '@mui/joy'
import {
  PresentationChart,
  ArrowClockwise,
  Plus,
  DownloadSimple,
  FunnelSimple,
  Trash,
  ChartBar,
  ChartPie,
  EnvelopeSimple,
  Clock,
  CheckCircle,
  WarningCircle,
  Hourglass,
  Info,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import api from '../services/api'

interface Report {
  id: number
  name: string
  description?: string
  type: string // tickets, campaigns, performance, contacts, users, queues
  format: string // pdf, excel, csv
  status: string // completed, processing, failed, scheduled
  startDate?: string
  endDate?: string
  filters?: any
  fileUrl?: string
  fileSize?: string
  userId?: number
  companyId: number
  scheduledFor?: string
  createdAt: string
  completedAt?: string
}

const columns = [
  'Formato',
  'Nombre del reporte',
  'Tipo',
  'Período',
  'Estado',
  'Tamaño',
  'Fecha creación',
  '',
]

const inputClass =
  'h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

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

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('30days')
  const [reportType, setReportType] = useState('all')
  const [openModal, setOpenModal] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'tickets',
    format: 'excel',
    startDate: '',
    endDate: '',
    scheduled: false,
    scheduledFor: '',
  })

  useEffect(() => {
    fetchReports()
  }, [])

  const fetchReports = async () => {
    try {
      setLoading(true)
      const response = await api.get('/reports')
      setReports(response.data.reports || response.data)
    } catch (error) {
      console.error('Error fetching reports:', error)
      // Fallback data
      setReports([
        {
          id: 1,
          name: 'Reporte de Tickets - Enero 2025',
          description: 'Análisis completo de tickets del mes de enero',
          type: 'tickets',
          format: 'excel',
          status: 'completed',
          startDate: '2025-01-01',
          endDate: '2025-01-31',
          fileUrl: '/reports/tickets-january-2025.xlsx',
          fileSize: '2.4 MB',
          userId: 1,
          companyId: 1,
          createdAt: '2025-01-10T10:30:00',
          completedAt: '2025-01-10T10:35:00',
        },
        {
          id: 2,
          name: 'Análisis de Campañas Q1 2025',
          description: 'Performance de campañas primer trimestre',
          type: 'campaigns',
          format: 'pdf',
          status: 'completed',
          startDate: '2025-01-01',
          endDate: '2025-03-31',
          fileUrl: '/reports/campaigns-q1-2025.pdf',
          fileSize: '5.1 MB',
          userId: 1,
          companyId: 1,
          createdAt: '2025-01-09T15:20:00',
          completedAt: '2025-01-09T15:28:00',
        },
        {
          id: 3,
          name: 'Rendimiento de Agentes - Enero',
          description: 'Métricas de desempeño de agentes',
          type: 'performance',
          format: 'excel',
          status: 'processing',
          startDate: '2025-01-01',
          endDate: '2025-01-31',
          userId: 1,
          companyId: 1,
          createdAt: '2025-01-08T09:15:00',
        },
        {
          id: 4,
          name: 'Reporte de Contactos Nuevos',
          description: 'Contactos agregados en el último mes',
          type: 'contacts',
          format: 'csv',
          status: 'completed',
          startDate: '2024-12-01',
          endDate: '2024-12-31',
          fileUrl: '/reports/new-contacts-december.csv',
          fileSize: '1.8 MB',
          userId: 1,
          companyId: 1,
          createdAt: '2025-01-07T11:45:00',
          completedAt: '2025-01-07T11:48:00',
        },
        {
          id: 5,
          name: 'Análisis de Colas de Atención',
          description: 'Estadísticas de todas las colas',
          type: 'queues',
          format: 'pdf',
          status: 'completed',
          startDate: '2025-01-01',
          endDate: '2025-01-12',
          fileUrl: '/reports/queues-analysis.pdf',
          fileSize: '3.2 MB',
          userId: 1,
          companyId: 1,
          createdAt: '2025-01-06T14:20:00',
          completedAt: '2025-01-06T14:25:00',
        },
        {
          id: 6,
          name: 'Reporte Semanal Automático',
          description: 'Reporte programado para cada lunes',
          type: 'tickets',
          format: 'excel',
          status: 'scheduled',
          userId: 1,
          companyId: 1,
          scheduledFor: '2025-01-13T08:00:00',
          createdAt: '2025-01-05T16:00:00',
        },
        {
          id: 7,
          name: 'Usuarios Activos - Diciembre',
          description: 'Actividad de usuarios en diciembre',
          type: 'users',
          format: 'excel',
          status: 'failed',
          startDate: '2024-12-01',
          endDate: '2024-12-31',
          userId: 1,
          companyId: 1,
          createdAt: '2025-01-04T10:10:00',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    try {
      await api.post('/reports', formData)
      fetchReports()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error generating report:', error)
    }
  }

  const handleDownload = async (report: Report) => {
    if (!report.fileUrl) return
    try {
      // In production, this would trigger a file download
      window.open(report.fileUrl, '_blank')
      console.log('Downloading report:', report.name)
    } catch (error) {
      console.error('Error downloading report:', error)
    }
  }

  const handleDelete = async (reportId: number) => {
    if (confirm('¿Estás seguro de eliminar este reporte?')) {
      try {
        await api.delete(`/reports/${reportId}`)
        fetchReports()
      } catch (error) {
        console.error('Error deleting report:', error)
      }
    }
  }

  const handleEmailReport = async (report: Report) => {
    try {
      await api.post(`/reports/${report.id}/email`)
      alert('Reporte enviado por email exitosamente')
    } catch (error) {
      console.error('Error emailing report:', error)
    }
  }

  const openGenerateModal = () => {
    resetForm()
    setOpenModal(true)
  }

  const resetForm = () => {
    const today = new Date()
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    setFormData({
      name: '',
      description: '',
      type: 'tickets',
      format: 'excel',
      startDate: firstDayOfMonth.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0],
      scheduled: false,
      scheduledFor: '',
    })
  }

  const filteredReports = reports.filter((report) => {
    if (reportType !== 'all' && report.type !== reportType) return false
    // Period filter could be implemented based on createdAt
    return true
  })

  const stats = {
    total: reports.length,
    completed: reports.filter((r) => r.status === 'completed').length,
    processing: reports.filter((r) => r.status === 'processing').length,
    scheduled: reports.filter((r) => r.status === 'scheduled').length,
    failed: reports.filter((r) => r.status === 'failed').length,
  }

  const getStatusVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'completed':
        return 'success'
      case 'processing':
        return 'warning'
      case 'scheduled':
        return 'primary'
      case 'failed':
        return 'destructive'
      default:
        return 'neutral'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completado'
      case 'processing':
        return 'Procesando'
      case 'scheduled':
        return 'Programado'
      case 'failed':
        return 'Fallido'
      default:
        return status
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="size-3.5" weight="fill" aria-hidden />
      case 'processing':
        return <Hourglass className="size-3.5" weight="fill" aria-hidden />
      case 'scheduled':
        return <Clock className="size-3.5" weight="fill" aria-hidden />
      case 'failed':
        return <WarningCircle className="size-3.5" weight="fill" aria-hidden />
      default:
        return null
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'tickets':
        return 'Tickets'
      case 'campaigns':
        return 'Campañas'
      case 'performance':
        return 'Rendimiento'
      case 'contacts':
        return 'Contactos'
      case 'users':
        return 'Usuarios'
      case 'queues':
        return 'Colas'
      default:
        return type
    }
  }

  const getFormatIcon = (format: string) => {
    switch (format) {
      case 'pdf':
        return '📄'
      case 'excel':
        return '📊'
      case 'csv':
        return '📋'
      default:
        return '📁'
    }
  }

  // Evita NaN cuando aún no hay reportes cargados.
  const pct = (count: number) => (stats.total ? (count / stats.total) * 100 : 0)

  const byType = [
    { type: 'tickets', count: reports.filter((r) => r.type === 'tickets').length },
    { type: 'campaigns', count: reports.filter((r) => r.type === 'campaigns').length },
    { type: 'performance', count: reports.filter((r) => r.type === 'performance').length },
    { type: 'contacts', count: reports.filter((r) => r.type === 'contacts').length },
  ]

  const byFormat = [
    { format: 'excel', count: reports.filter((r) => r.format === 'excel').length },
    { format: 'pdf', count: reports.filter((r) => r.format === 'pdf').length },
    { format: 'csv', count: reports.filter((r) => r.format === 'csv').length },
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <PresentationChart className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Reportes
              </h1>
              <p className="text-sm text-muted-foreground">
                Generación, programación y descarga de reportes
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={fetchReports}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={openGenerateModal}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Generar reporte
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatTile label="Total reportes" value={String(stats.total)} />
          <StatTile label="Completados" value={String(stats.completed)} tone="success" />
          <StatTile label="Procesando" value={String(stats.processing)} tone="warning" />
          <StatTile label="Programados" value={String(stats.scheduled)} tone="primary" />
          <StatTile label="Fallidos" value={String(stats.failed)} tone="destructive" />
        </div>

        {/* Quick Stats Visualization */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="mb-4 flex items-center gap-2">
              <ChartBar className="size-5 text-primary" weight="fill" aria-hidden />
              <h2 className="text-base font-semibold text-foreground">Reportes por tipo</h2>
            </div>
            <div className="space-y-3">
              {byType.map((item) => (
                <div key={item.type}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {getTypeLabel(item.type)}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {item.count}
                    </span>
                  </div>
                  <LinearProgress
                    determinate
                    value={pct(item.count)}
                    sx={{ height: 8 }}
                    aria-label={`${getTypeLabel(item.type)}: ${item.count} de ${stats.total}`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="mb-4 flex items-center gap-2">
              <ChartPie className="size-5 text-success-text" weight="fill" aria-hidden />
              <h2 className="text-base font-semibold text-foreground">
                Formatos de exportación
              </h2>
            </div>
            <div className="space-y-3">
              {byFormat.map((item) => (
                <div key={item.format}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      <span aria-hidden>{getFormatIcon(item.format)}</span>{' '}
                      {item.format.toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {item.count}
                    </span>
                  </div>
                  <LinearProgress
                    determinate
                    value={pct(item.count)}
                    color={
                      item.format === 'excel'
                        ? 'success'
                        : item.format === 'pdf'
                          ? 'primary'
                          : 'neutral'
                    }
                    sx={{ height: 8 }}
                    aria-label={`${item.format.toUpperCase()}: ${item.count} de ${stats.total}`}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger
              id="reports-period"
              aria-label="Filtrar por período"
              className="h-10 sm:w-[200px]"
            >
              <span className="flex items-center gap-2 truncate">
                <FunnelSimple className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Últimos 7 días</SelectItem>
              <SelectItem value="30days">Últimos 30 días</SelectItem>
              <SelectItem value="90days">Últimos 90 días</SelectItem>
              <SelectItem value="year">Este año</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>

          <Select value={reportType} onValueChange={setReportType}>
            <SelectTrigger
              id="reports-type"
              aria-label="Filtrar por tipo de reporte"
              className="h-10 sm:w-[200px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="tickets">Tickets</SelectItem>
              <SelectItem value="campaigns">Campañas</SelectItem>
              <SelectItem value="performance">Rendimiento</SelectItem>
              <SelectItem value="contacts">Contactos</SelectItem>
              <SelectItem value="users">Usuarios</SelectItem>
              <SelectItem value="queues">Colas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Reports Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
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
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      Cargando reportes...
                    </td>
                  </tr>
                ) : filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      No se encontraron reportes
                    </td>
                  </tr>
                ) : (
                  filteredReports.map((report) => (
                    <tr key={report.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <span className="text-2xl leading-none" aria-hidden>
                          {getFormatIcon(report.format)}
                        </span>
                        <span className="sr-only">{report.format.toUpperCase()}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block font-medium text-foreground">{report.name}</span>
                        {report.description && (
                          <span className="block text-xs text-muted-foreground">
                            {report.description}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge>{getTypeLabel(report.type)}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {report.startDate && report.endDate
                          ? `${new Date(report.startDate).toLocaleDateString('es-ES')} - ${new Date(report.endDate).toLocaleDateString('es-ES')}`
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={getStatusVariant(report.status)}>
                          {getStatusIcon(report.status)}
                          {getStatusLabel(report.status)}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                        {report.fileSize || '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {new Date(report.createdAt).toLocaleString('es-ES')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          {report.status === 'completed' && (
                            <>
                              <ActionBtn
                                label="Descargar"
                                onClick={() => handleDownload(report)}
                                className="text-success-text hover:bg-success/10 hover:text-success-text"
                              >
                                <DownloadSimple className="size-[18px]" aria-hidden />
                              </ActionBtn>
                              <ActionBtn
                                label="Enviar por email"
                                onClick={() => handleEmailReport(report)}
                                className="text-primary hover:bg-primary/10 hover:text-primary"
                              >
                                <EnvelopeSimple className="size-[18px]" aria-hidden />
                              </ActionBtn>
                            </>
                          )}
                          <ActionBtn
                            label="Eliminar"
                            onClick={() => handleDelete(report.id)}
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

      {/* Modal Generate Report */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="max-w-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Generar nuevo reporte</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="report-name">Nombre del reporte</Label>
              <input
                id="report-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Reporte de Tickets - Enero 2025"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="report-description">Descripción (opcional)</Label>
              <textarea
                id="report-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Breve descripción del reporte..."
                rows={2}
                className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors [font-family:inherit] placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="report-type-field">Tipo de reporte</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger
                    id="report-type-field"
                    aria-label="Tipo de reporte"
                    className="h-11"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tickets">Tickets</SelectItem>
                    <SelectItem value="campaigns">Campañas</SelectItem>
                    <SelectItem value="performance">Rendimiento</SelectItem>
                    <SelectItem value="contacts">Contactos</SelectItem>
                    <SelectItem value="users">Usuarios</SelectItem>
                    <SelectItem value="queues">Colas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="report-format-field">Formato de exportación</Label>
                <Select
                  value={formData.format}
                  onValueChange={(value) => setFormData({ ...formData, format: value })}
                >
                  <SelectTrigger
                    id="report-format-field"
                    aria-label="Formato de exportación"
                    className="h-11"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                    <SelectItem value="pdf">PDF (.pdf)</SelectItem>
                    <SelectItem value="csv">CSV (.csv)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t border-border" />

            <h3 className="text-sm font-semibold text-foreground">Período del reporte</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="report-start-date">Fecha inicio</Label>
                <input
                  id="report-start-date"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-end-date">Fecha fin</Label>
                <input
                  id="report-end-date"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="border-t border-border" />

            <div className="flex items-center gap-3">
              <Checkbox
                id="report-scheduled"
                checked={formData.scheduled}
                onCheckedChange={(checked) => setFormData({ ...formData, scheduled: checked })}
              />
              <Label htmlFor="report-scheduled" className="cursor-pointer">
                Programar generación
              </Label>
            </div>

            {formData.scheduled && (
              <div className="space-y-1.5">
                <Label htmlFor="report-scheduled-for">Fecha y hora de generación</Label>
                <input
                  id="report-scheduled-for"
                  type="datetime-local"
                  value={formData.scheduledFor}
                  onChange={(e) => setFormData({ ...formData, scheduledFor: e.target.value })}
                  className={inputClass}
                />
              </div>
            )}

            <div className="flex gap-3 rounded-lg bg-muted p-4">
              <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">
                <strong className="font-semibold text-foreground">Información:</strong> el reporte
                se generará en segundo plano. Recibirás una notificación cuando esté listo para
                descargar. Los reportes grandes pueden tardar varios minutos en procesarse.
              </p>
            </div>

            <Button className="w-full" onClick={handleGenerate}>
              {formData.scheduled ? 'Programar reporte' : 'Generar reporte'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
