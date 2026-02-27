import { useState, useEffect } from 'react'
import {
  Typography,
  Stack,
  Container,
  Card,
  CardContent,
  Button,
  Select,
  Option,
  Box,
  Grid,
  Table,
  Sheet,
  Chip,
  IconButton,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Divider,
  LinearProgress,
} from '@mui/joy'
import {
  Assessment as ReportIcon,
  Download as DownloadIcon,
  FilterList as FilterIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  BarChart as BarChartIcon,
  PieChart as PieChartIcon,
  Email as EmailIcon,
  Schedule as ScheduleIcon,
  CheckCircle as CompletedIcon,
  Error as ErrorIcon,
  HourglassEmpty as ProcessingIcon,
} from '@mui/icons-material'
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success'
      case 'processing':
        return 'warning'
      case 'scheduled':
        return 'primary'
      case 'failed':
        return 'danger'
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
        return <CompletedIcon />
      case 'processing':
        return <ProcessingIcon />
      case 'scheduled':
        return <ScheduleIcon />
      case 'failed':
        return <ErrorIcon />
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

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <ReportIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Reportes</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Generación, programación y descarga de reportes
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <IconButton variant="outlined" color="neutral" onClick={fetchReports}>
              <RefreshIcon />
            </IconButton>
            <Button startDecorator={<AddIcon />} color="primary" onClick={openGenerateModal}>
              Generar Reporte
            </Button>
          </Stack>
        </Stack>

        {/* Stats */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Total Reportes
                </Typography>
                <Typography level="h2">{stats.total}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Completados
                </Typography>
                <Typography level="h2" sx={{ color: 'success.main' }}>
                  {stats.completed}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Procesando
                </Typography>
                <Typography level="h2" sx={{ color: 'warning.main' }}>
                  {stats.processing}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Programados
                </Typography>
                <Typography level="h2" sx={{ color: 'primary.main' }}>
                  {stats.scheduled}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Fallidos
                </Typography>
                <Typography level="h2" sx={{ color: 'danger.main' }}>
                  {stats.failed}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Quick Stats Visualization */}
        <Grid container spacing={2}>
          <Grid xs={12} md={6}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                  <BarChartIcon sx={{ color: 'primary.main' }} />
                  <Typography level="title-md">Reportes por Tipo</Typography>
                </Stack>
                <Stack spacing={1.5}>
                  {[
                    {
                      type: 'tickets',
                      count: reports.filter((r) => r.type === 'tickets').length,
                    },
                    {
                      type: 'campaigns',
                      count: reports.filter((r) => r.type === 'campaigns').length,
                    },
                    {
                      type: 'performance',
                      count: reports.filter((r) => r.type === 'performance').length,
                    },
                    {
                      type: 'contacts',
                      count: reports.filter((r) => r.type === 'contacts').length,
                    },
                  ].map((item) => (
                    <Box key={item.type}>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Typography level="body-sm">{getTypeLabel(item.type)}</Typography>
                        <Typography level="body-sm" fontWeight="bold">
                          {item.count}
                        </Typography>
                      </Stack>
                      <LinearProgress
                        determinate
                        value={(item.count / stats.total) * 100}
                        sx={{ height: 8 }}
                      />
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} md={6}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                  <PieChartIcon sx={{ color: 'success.main' }} />
                  <Typography level="title-md">Formatos de Exportación</Typography>
                </Stack>
                <Stack spacing={1.5}>
                  {[
                    { format: 'excel', count: reports.filter((r) => r.format === 'excel').length },
                    { format: 'pdf', count: reports.filter((r) => r.format === 'pdf').length },
                    { format: 'csv', count: reports.filter((r) => r.format === 'csv').length },
                  ].map((item) => (
                    <Box key={item.format}>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Typography level="body-sm">
                          {getFormatIcon(item.format)} {item.format.toUpperCase()}
                        </Typography>
                        <Typography level="body-sm" fontWeight="bold">
                          {item.count}
                        </Typography>
                      </Stack>
                      <LinearProgress
                        determinate
                        value={(item.count / stats.total) * 100}
                        color={
                          item.format === 'excel'
                            ? 'success'
                            : item.format === 'pdf'
                              ? 'primary'
                              : 'neutral'
                        }
                        sx={{ height: 8 }}
                      />
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Filters */}
        <Card>
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Select
                value={period}
                onChange={(_, value) => setPeriod(value as string)}
                sx={{ minWidth: 180 }}
                startDecorator={<FilterIcon />}
              >
                <Option value="7days">Últimos 7 días</Option>
                <Option value="30days">Últimos 30 días</Option>
                <Option value="90days">Últimos 90 días</Option>
                <Option value="year">Este año</Option>
                <Option value="all">Todos</Option>
              </Select>
              <Select
                value={reportType}
                onChange={(_, value) => setReportType(value as string)}
                sx={{ minWidth: 180 }}
              >
                <Option value="all">Todos los tipos</Option>
                <Option value="tickets">Tickets</Option>
                <Option value="campaigns">Campañas</Option>
                <Option value="performance">Rendimiento</Option>
                <Option value="contacts">Contactos</Option>
                <Option value="users">Usuarios</Option>
                <Option value="queues">Colas</Option>
              </Select>
            </Stack>
          </CardContent>
        </Card>

        {/* Reports Table */}
        <Card>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Formato</th>
                  <th style={{ width: 300 }}>Nombre del Reporte</th>
                  <th style={{ width: 120 }}>Tipo</th>
                  <th style={{ width: 150 }}>Período</th>
                  <th style={{ width: 120 }}>Estado</th>
                  <th style={{ width: 100 }}>Tamaño</th>
                  <th style={{ width: 180 }}>Fecha Creación</th>
                  <th style={{ width: 200 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>Cargando reportes...</Typography>
                    </td>
                  </tr>
                ) : filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>No se encontraron reportes</Typography>
                    </td>
                  </tr>
                ) : (
                  filteredReports.map((report) => (
                    <tr key={report.id}>
                      <td>
                        <Typography fontSize={24}>{getFormatIcon(report.format)}</Typography>
                      </td>
                      <td>
                        <Typography level="body-sm" fontWeight="bold">
                          {report.name}
                        </Typography>
                        {report.description && (
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {report.description}
                          </Typography>
                        )}
                      </td>
                      <td>
                        <Chip size="sm" variant="soft">
                          {getTypeLabel(report.type)}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-xs">
                          {report.startDate && report.endDate
                            ? `${new Date(report.startDate).toLocaleDateString('es-ES')} - ${new Date(report.endDate).toLocaleDateString('es-ES')}`
                            : '-'}
                        </Typography>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={getStatusColor(report.status)}
                          startDecorator={getStatusIcon(report.status)}
                        >
                          {getStatusLabel(report.status)}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-sm">{report.fileSize || '-'}</Typography>
                      </td>
                      <td>
                        <Typography level="body-xs">
                          {new Date(report.createdAt).toLocaleString('es-ES')}
                        </Typography>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          {report.status === 'completed' && (
                            <>
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="success"
                                onClick={() => handleDownload(report)}
                                title="Descargar"
                              >
                                <DownloadIcon />
                              </IconButton>
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="primary"
                                onClick={() => handleEmailReport(report)}
                                title="Enviar por Email"
                              >
                                <EmailIcon />
                              </IconButton>
                            </>
                          )}
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={() => handleDelete(report.id)}
                            title="Eliminar"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Stack>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Sheet>
        </Card>

        {/* Modal Generate Report */}
        <Modal open={openModal} onClose={() => setOpenModal(false)}>
          <ModalDialog sx={{ minWidth: 600 }}>
            <ModalClose />
            <Typography level="h4" sx={{ mb: 2 }}>
              Generar Nuevo Reporte
            </Typography>
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>Nombre del Reporte</FormLabel>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Reporte de Tickets - Enero 2025"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Descripción (Opcional)</FormLabel>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Breve descripción del reporte..."
                  minRows={2}
                />
              </FormControl>
              <Grid container spacing={2}>
                <Grid xs={6}>
                  <FormControl>
                    <FormLabel>Tipo de Reporte</FormLabel>
                    <Select
                      value={formData.type}
                      onChange={(_, value) => setFormData({ ...formData, type: value as string })}
                    >
                      <Option value="tickets">Tickets</Option>
                      <Option value="campaigns">Campañas</Option>
                      <Option value="performance">Rendimiento</Option>
                      <Option value="contacts">Contactos</Option>
                      <Option value="users">Usuarios</Option>
                      <Option value="queues">Colas</Option>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid xs={6}>
                  <FormControl>
                    <FormLabel>Formato de Exportación</FormLabel>
                    <Select
                      value={formData.format}
                      onChange={(_, value) =>
                        setFormData({ ...formData, format: value as string })
                      }
                    >
                      <Option value="excel">Excel (.xlsx)</Option>
                      <Option value="pdf">PDF (.pdf)</Option>
                      <Option value="csv">CSV (.csv)</Option>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
              <Divider />
              <Typography level="title-sm">Período del Reporte</Typography>
              <Grid container spacing={2}>
                <Grid xs={6}>
                  <FormControl>
                    <FormLabel>Fecha Inicio</FormLabel>
                    <Input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    />
                  </FormControl>
                </Grid>
                <Grid xs={6}>
                  <FormControl>
                    <FormLabel>Fecha Fin</FormLabel>
                    <Input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    />
                  </FormControl>
                </Grid>
              </Grid>
              <Divider />
              <FormControl>
                <Stack direction="row" spacing={2} alignItems="center">
                  <FormLabel>Programar Generación</FormLabel>
                  <input
                    type="checkbox"
                    checked={formData.scheduled}
                    onChange={(e) => setFormData({ ...formData, scheduled: e.target.checked })}
                  />
                </Stack>
              </FormControl>
              {formData.scheduled && (
                <FormControl>
                  <FormLabel>Fecha y Hora de Generación</FormLabel>
                  <Input
                    type="datetime-local"
                    value={formData.scheduledFor}
                    onChange={(e) => setFormData({ ...formData, scheduledFor: e.target.value })}
                  />
                </FormControl>
              )}
              <Box
                sx={{
                  p: 2,
                  bgcolor: 'background.level1',
                  borderRadius: 'sm',
                }}
              >
                <Typography level="body-sm">
                  <strong>ℹ️ Información:</strong>
                  <br />
                  El reporte se generará en segundo plano. Recibirás una notificación cuando esté
                  listo para descargar. Los reportes grandes pueden tardar varios minutos en
                  procesarse.
                </Typography>
              </Box>
              <Button color="primary" onClick={handleGenerate} fullWidth>
                {formData.scheduled ? 'Programar Reporte' : 'Generar Reporte'}
              </Button>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
