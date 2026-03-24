import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Table,
  Sheet,
  Chip,
  IconButton,
  Modal,
  ModalDialog,
  Input,
  FormControl,
  FormLabel,
  Select,
  Option,
  Textarea,
  Grid,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  CircularProgress,
  Alert,
  Divider,
} from '@mui/joy'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Send as SendIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon,
  Description as DescriptionIcon,
  Refresh as RefreshIcon,
  Sync as SyncIcon,
  CloudUpload as CloudUploadIcon,
  TouchApp as TouchAppIcon,
  Link as LinkIcon,
  Phone as PhoneIcon,
  ContentCopy as ContentCopyIcon,
} from '@mui/icons-material'
import api from '../services/api'

// Interfaces
interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE'
  text: string
  url?: string
  phoneNumber?: string
}

interface Template {
  id: number
  name: string
  metaTemplateId?: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  language: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED'
  rejectedReason?: string
  headerType: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  headerContent?: string
  bodyContent: string
  footerContent?: string
  buttons?: TemplateButton[]
  variablesCount: number
  variableExamples?: string[]
  usageCount: number
  lastUsedAt?: string
  isActive: boolean
  companyId: number
  whatsappId?: number
  createdAt: string
  updatedAt: string
}

interface WhatsAppConnection {
  id: number
  name: string
  number: string
  status: string
  channel: string
}

interface FormData {
  name: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  language: string
  headerType: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  headerContent: string
  bodyContent: string
  footerContent: string
  variableExamples: string[]
  whatsappId?: number
  buttons?: TemplateButton[]
}

interface MetaErrorInfo {
  show: boolean
  title: string
  message: string
  userTitle?: string
  userMessage?: string
  code?: number
  subcode?: number
}

const initialFormData: FormData = {
  name: '',
  category: 'UTILITY',
  language: 'es',
  headerType: 'NONE',
  headerContent: '',
  bodyContent: '',
  footerContent: '',
  variableExamples: [],
  buttons: [],
}

export default function WhatsAppTemplates() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [connections, setConnections] = useState<WhatsAppConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openModal, setOpenModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [tabValue, setTabValue] = useState(0)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [submitting, setSubmitting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [selectedWhatsappId, setSelectedWhatsappId] = useState<number | null>(null)
  const [metaError, setMetaError] = useState<MetaErrorInfo>({
    show: false,
    title: '',
    message: '',
  })

  // Cargar templates y conexiones
  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [templatesRes, connectionsRes] = await Promise.all([
        api.get('/whatsapp-templates'),
        api.get('/whatsapp-meta/dashboard')
      ])

      setTemplates(templatesRes.data.templates || [])
      setConnections(connectionsRes.data.connections || [])

      // Seleccionar primera conexión por defecto
      if (connectionsRes.data.connections?.length > 0 && !selectedWhatsappId) {
        setSelectedWhatsappId(connectionsRes.data.connections[0].id)
      }
    } catch (err: any) {
      console.error('Error loading templates:', err)
      setError(err.response?.data?.message || 'Error al cargar las plantillas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Contar variables en el contenido
  const countVariables = (content: string): number => {
    const matches = content.match(/\{\{\d+\}\}/g)
    return matches ? matches.length : 0
  }

  // Actualizar ejemplos de variables cuando cambia el contenido
  useEffect(() => {
    const totalVars = countVariables(formData.headerContent) + countVariables(formData.bodyContent)
    if (totalVars !== formData.variableExamples.length) {
      setFormData(prev => ({
        ...prev,
        variableExamples: Array(totalVars).fill('')
      }))
    }
  }, [formData.headerContent, formData.bodyContent])

  const handleAdd = () => {
    setEditingTemplate(null)
    setFormData(initialFormData)
    setOpenModal(true)
  }

  const handleEdit = (template: Template) => {
    setEditingTemplate(template)
    setFormData({
      name: template.name,
      category: template.category,
      language: template.language,
      headerType: template.headerType,
      headerContent: template.headerContent || '',
      bodyContent: template.bodyContent,
      footerContent: template.footerContent || '',
      variableExamples: template.variableExamples || [],
      whatsappId: template.whatsappId,
      buttons: template.buttons || [],
    })
    setOpenModal(true)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar esta plantilla?')) return

    try {
      await api.delete(`/whatsapp-templates/${id}`)
      setTemplates(prev => prev.filter(t => t.id !== id))
    } catch (err: any) {
      setMetaError({
        show: true,
        title: 'Error al eliminar',
        message: err.response?.data?.message || 'No se pudo eliminar la plantilla',
      })
    }
  }

  const handleSubmit = async () => {
    if (!formData.name || !formData.bodyContent) {
      setMetaError({
        show: true,
        title: 'Campos requeridos',
        message: 'El nombre y contenido del mensaje son obligatorios',
      })
      return
    }

    // Validar nombre (solo minúsculas, números y guiones bajos)
    if (!/^[a-z0-9_]+$/.test(formData.name)) {
      setMetaError({
        show: true,
        title: 'Nombre inválido',
        message: 'El nombre solo puede contener letras minúsculas, números y guiones bajos (_)',
      })
      return
    }

    setSubmitting(true)
    try {
      if (editingTemplate) {
        // Actualizar
        const response = await api.put(`/whatsapp-templates/${editingTemplate.id}`, formData)
        setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? response.data : t))
      } else {
        // Crear
        const response = await api.post('/whatsapp-templates', {
          ...formData,
          whatsappId: selectedWhatsappId
        })
        setTemplates(prev => [response.data.template, ...prev])
      }
      setOpenModal(false)
      setFormData(initialFormData)
    } catch (err: any) {
      setMetaError({
        show: true,
        title: 'Error al guardar',
        message: err.response?.data?.message || 'No se pudo guardar la plantilla',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitToMeta = async (templateId: number) => {
    if (!selectedWhatsappId) {
      setMetaError({
        show: true,
        title: 'Conexión requerida',
        message: 'Selecciona una conexión de WhatsApp primero',
      })
      return
    }

    try {
      setSubmitting(true)
      await api.post(`/whatsapp-templates/${templateId}/submit`, {
        whatsappId: selectedWhatsappId
      })
      setMetaError({
        show: true,
        title: '¡Éxito!',
        message: 'Plantilla enviada a Meta para aprobación. El proceso puede tomar entre 1 minuto y 24 horas.',
      })
      loadData()
    } catch (err: any) {
      const errorData = err.response?.data
      const metaErrorData = errorData?.metaError

      setMetaError({
        show: true,
        title: metaErrorData?.userTitle || 'Error de Meta',
        message: errorData?.message || 'Error al enviar a Meta',
        userTitle: metaErrorData?.userTitle,
        userMessage: metaErrorData?.userMessage,
        code: metaErrorData?.code,
        subcode: metaErrorData?.subcode,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSyncFromMeta = async () => {
    if (!selectedWhatsappId) {
      setMetaError({
        show: true,
        title: 'Conexión requerida',
        message: 'Selecciona una conexión de WhatsApp primero',
      })
      return
    }

    try {
      setSyncing(true)
      const response = await api.post('/whatsapp-templates/sync', {
        whatsappId: selectedWhatsappId
      })
      setMetaError({
        show: true,
        title: '¡Éxito!',
        message: `Sincronización completada: ${response.data.created} nuevas, ${response.data.updated} actualizadas`,
      })
      loadData()
    } catch (err: any) {
      const errorData = err.response?.data
      const metaErrorData = errorData?.metaError

      setMetaError({
        show: true,
        title: metaErrorData?.userTitle || 'Error de sincronización',
        message: errorData?.message || 'Error al sincronizar con Meta',
        userTitle: metaErrorData?.userTitle,
        userMessage: metaErrorData?.userMessage,
        code: metaErrorData?.code,
        subcode: metaErrorData?.subcode,
      })
    } finally {
      setSyncing(false)
    }
  }

  const getStatusColor = (status: Template['status']) => {
    switch (status) {
      case 'APPROVED': return 'success'
      case 'PENDING': return 'warning'
      case 'REJECTED': return 'danger'
      case 'PAUSED': return 'neutral'
      case 'DISABLED': return 'neutral'
      default: return 'neutral'
    }
  }

  const getStatusText = (status: Template['status']) => {
    switch (status) {
      case 'APPROVED': return 'Aprobada'
      case 'PENDING': return 'Pendiente'
      case 'REJECTED': return 'Rechazada'
      case 'PAUSED': return 'Pausada'
      case 'DISABLED': return 'Deshabilitada'
      default: return status
    }
  }

  const getCategoryColor = (category: Template['category']) => {
    switch (category) {
      case 'MARKETING': return 'primary'
      case 'UTILITY': return 'success'
      case 'AUTHENTICATION': return 'warning'
      default: return 'neutral'
    }
  }

  const getCategoryText = (category: Template['category']) => {
    switch (category) {
      case 'MARKETING': return 'Marketing'
      case 'UTILITY': return 'Utilidad'
      case 'AUTHENTICATION': return 'Autenticación'
      default: return category
    }
  }

  const filterByCategory = (category?: Template['category']) => {
    if (!category) return templates
    return templates.filter((t) => t.category === category)
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const renderTemplatesList = (templatesList: Template[]) => (
    <Sheet sx={{ overflow: 'auto' }}>
      {templatesList.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <DescriptionIcon sx={{ fontSize: 48, color: 'text.tertiary', mb: 2 }} />
          <Typography level="body-md" sx={{ color: 'text.tertiary' }}>
            No hay plantillas en esta categoría
          </Typography>
        </Box>
      ) : (
        <Table>
          <thead>
            <tr>
              <th style={{ width: 200 }}>Nombre</th>
              <th style={{ width: 100 }}>Estado</th>
              <th style={{ width: 100 }}>Categoría</th>
              <th style={{ width: 80 }}>Idioma</th>
              <th style={{ width: 80 }}>Variables</th>
              <th style={{ width: 80 }}>Uso</th>
              <th style={{ width: 140 }}>Último Uso</th>
              <th style={{ width: 140, textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {templatesList.map((template) => (
              <tr key={template.id}>
                <td>
                  <Box>
                    <Typography level="body-sm" fontWeight="lg">
                      {template.name}
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                      {template.bodyContent.substring(0, 50)}...
                    </Typography>
                    {template.rejectedReason && (
                      <Typography level="body-xs" sx={{ color: 'danger.500', mt: 0.5 }}>
                        Razón: {template.rejectedReason}
                      </Typography>
                    )}
                  </Box>
                </td>
                <td>
                  <Chip
                    size="sm"
                    color={getStatusColor(template.status)}
                    startDecorator={
                      template.status === 'APPROVED' ? <CheckCircleIcon /> :
                      template.status === 'PENDING' ? <ScheduleIcon /> :
                      <ErrorIcon />
                    }
                  >
                    {getStatusText(template.status)}
                  </Chip>
                </td>
                <td>
                  <Chip size="sm" color={getCategoryColor(template.category)}>
                    {getCategoryText(template.category)}
                  </Chip>
                </td>
                <td>
                  <Chip size="sm" variant="outlined">
                    {template.language.toUpperCase()}
                  </Chip>
                </td>
                <td>
                  <Typography level="body-sm">{template.variablesCount}</Typography>
                </td>
                <td>
                  <Typography level="body-sm" fontWeight="lg">
                    {template.usageCount.toLocaleString()}
                  </Typography>
                </td>
                <td>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                    {formatDate(template.lastUsedAt)}
                  </Typography>
                </td>
                <td>
                  <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                    <IconButton
                      size="sm"
                      variant="plain"
                      onClick={() => handleEdit(template)}
                      title="Editar"
                      disabled={template.status === 'APPROVED'}
                    >
                      <EditIcon />
                    </IconButton>
                    {template.status === 'PENDING' && !template.metaTemplateId && (
                      <IconButton
                        size="sm"
                        variant="plain"
                        color="primary"
                        onClick={() => handleSubmitToMeta(template.id)}
                        title="Enviar a Meta"
                        disabled={submitting}
                      >
                        <CloudUploadIcon />
                      </IconButton>
                    )}
                    {template.status === 'APPROVED' && (
                      <IconButton
                        size="sm"
                        variant="plain"
                        color="success"
                        title="Usar plantilla"
                      >
                        <SendIcon />
                      </IconButton>
                    )}
                    <IconButton
                      size="sm"
                      variant="plain"
                      color="danger"
                      onClick={() => handleDelete(template.id)}
                      title="Eliminar"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Sheet>
  )

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress size="lg" />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <DescriptionIcon sx={{ fontSize: 32 }} />
            Plantillas de WhatsApp
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Gestiona las plantillas aprobadas por Meta para envío fuera de la ventana de 24 horas
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {connections.length > 0 && (
            <Select
              size="sm"
              value={selectedWhatsappId}
              onChange={(_, val) => setSelectedWhatsappId(val as number)}
              sx={{ minWidth: 200 }}
            >
              {connections.map(conn => (
                <Option key={conn.id} value={conn.id}>
                  {conn.name} ({conn.number})
                </Option>
              ))}
            </Select>
          )}
          <Button
            size="sm"
            variant="outlined"
            startDecorator={syncing ? <CircularProgress size="sm" /> : <SyncIcon />}
            onClick={handleSyncFromMeta}
            disabled={syncing || !selectedWhatsappId}
          >
            Sincronizar
          </Button>
          <IconButton
            variant="outlined"
            color="neutral"
            onClick={loadData}
            title="Actualizar"
          >
            <RefreshIcon />
          </IconButton>
          <Button startDecorator={<AddIcon />} onClick={handleAdd}>
            Nueva Plantilla
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert color="danger" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Total Plantillas
              </Typography>
              <Typography level="h3">{templates.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Aprobadas
              </Typography>
              <Typography level="h3" sx={{ color: 'success.500' }}>
                {templates.filter((t) => t.status === 'APPROVED').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Pendientes
              </Typography>
              <Typography level="h3" sx={{ color: 'warning.500' }}>
                {templates.filter((t) => t.status === 'PENDING').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Uso Total
              </Typography>
              <Typography level="h3" sx={{ color: 'primary.500' }}>
                {templates.reduce((acc, t) => acc + t.usageCount, 0).toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs por categoría */}
      <Card>
        <CardContent>
          <Tabs value={tabValue} onChange={(_e, val) => setTabValue(val as number)}>
            <TabList>
              <Tab>Todas ({templates.length})</Tab>
              <Tab>Marketing ({templates.filter((t) => t.category === 'MARKETING').length})</Tab>
              <Tab>Utilidad ({templates.filter((t) => t.category === 'UTILITY').length})</Tab>
              <Tab>Autenticación ({templates.filter((t) => t.category === 'AUTHENTICATION').length})</Tab>
            </TabList>

            <TabPanel value={0}>{renderTemplatesList(templates)}</TabPanel>
            <TabPanel value={1}>{renderTemplatesList(filterByCategory('MARKETING'))}</TabPanel>
            <TabPanel value={2}>{renderTemplatesList(filterByCategory('UTILITY'))}</TabPanel>
            <TabPanel value={3}>{renderTemplatesList(filterByCategory('AUTHENTICATION'))}</TabPanel>
          </Tabs>
        </CardContent>
      </Card>

      {/* Modal Crear/Editar */}
      <Modal open={openModal} onClose={() => setOpenModal(false)}>
        <ModalDialog sx={{ minWidth: 650, maxHeight: '90vh', overflow: 'auto' }}>
          <Typography level="h4" sx={{ mb: 2 }}>
            {editingTemplate ? 'Editar Plantilla' : 'Nueva Plantilla'}
          </Typography>

          <FormControl sx={{ mb: 2 }}>
            <FormLabel>Nombre del Template *</FormLabel>
            <Input
              placeholder="nombre_template (solo minúsculas, números y _)"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
              disabled={!!editingTemplate}
            />
            <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
              Solo letras minúsculas, números y guiones bajos. No se puede cambiar después.
            </Typography>
          </FormControl>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid xs={6}>
              <FormControl>
                <FormLabel>Categoría *</FormLabel>
                <Select
                  value={formData.category}
                  onChange={(_, val) => setFormData(prev => ({ ...prev, category: val as any }))}
                >
                  <Option value="UTILITY">Utilidad</Option>
                  <Option value="MARKETING">Marketing</Option>
                  <Option value="AUTHENTICATION">Autenticación</Option>
                </Select>
              </FormControl>
            </Grid>
            <Grid xs={6}>
              <FormControl>
                <FormLabel>Idioma *</FormLabel>
                <Select
                  value={formData.language}
                  onChange={(_, val) => setFormData(prev => ({ ...prev, language: val as string }))}
                >
                  <Option value="es">Español (es)</Option>
                  <Option value="es_MX">Español México (es_MX)</Option>
                  <Option value="es_AR">Español Argentina (es_AR)</Option>
                  <Option value="en">Inglés (en)</Option>
                  <Option value="en_US">Inglés US (en_US)</Option>
                  <Option value="pt_BR">Portugués Brasil (pt_BR)</Option>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          <FormControl sx={{ mb: 2 }}>
            <FormLabel>Encabezado (Opcional)</FormLabel>
            <Select
              value={formData.headerType}
              onChange={(_, val) => setFormData(prev => ({ ...prev, headerType: val as any }))}
            >
              <Option value="NONE">Sin encabezado</Option>
              <Option value="TEXT">Texto</Option>
              <Option value="IMAGE">Imagen</Option>
              <Option value="VIDEO">Video</Option>
              <Option value="DOCUMENT">Documento</Option>
            </Select>
          </FormControl>

          {formData.headerType !== 'NONE' && (
            <FormControl sx={{ mb: 2 }}>
              <FormLabel>
                {formData.headerType === 'TEXT' ? 'Texto del encabezado' : 'URL del archivo'}
              </FormLabel>
              <Input
                placeholder={formData.headerType === 'TEXT' ? 'Título del mensaje' : 'https://example.com/imagen.jpg'}
                value={formData.headerContent}
                onChange={(e) => setFormData(prev => ({ ...prev, headerContent: e.target.value }))}
              />
            </FormControl>
          )}

          <FormControl sx={{ mb: 2 }}>
            <FormLabel>Contenido del Mensaje *</FormLabel>
            <Textarea
              minRows={4}
              placeholder="Tu mensaje aquí. Usa {{1}}, {{2}} para variables dinámicas."
              value={formData.bodyContent}
              onChange={(e) => setFormData(prev => ({ ...prev, bodyContent: e.target.value }))}
            />
            <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
              Usa {'{{1}}'}, {'{{2}}'}, etc. para variables. Máximo 1024 caracteres.
            </Typography>
          </FormControl>

          <FormControl sx={{ mb: 2 }}>
            <FormLabel>Pie de página (Opcional)</FormLabel>
            <Input
              placeholder="Texto pequeño al final del mensaje"
              value={formData.footerContent}
              onChange={(e) => setFormData(prev => ({ ...prev, footerContent: e.target.value.slice(0, 60) }))}
            />
            <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
              Máximo 60 caracteres. {formData.footerContent.length}/60
            </Typography>
          </FormControl>

          {/* Ejemplos de variables */}
          {formData.variableExamples.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography level="title-sm" sx={{ mb: 1 }}>
                Ejemplos de Variables (requeridos por Meta)
              </Typography>
              <Grid container spacing={1}>
                {formData.variableExamples.map((example, idx) => (
                  <Grid xs={6} key={idx}>
                    <FormControl size="sm">
                      <FormLabel>{`{{${idx + 1}}}`}</FormLabel>
                      <Input
                        size="sm"
                        placeholder={`Ejemplo para variable ${idx + 1}`}
                        value={example}
                        onChange={(e) => {
                          const newExamples = [...formData.variableExamples]
                          newExamples[idx] = e.target.value
                          setFormData(prev => ({ ...prev, variableExamples: newExamples }))
                        }}
                      />
                    </FormControl>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* Botones interactivos */}
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <TouchAppIcon sx={{ fontSize: 20 }} />
              <Typography level="title-sm">
                Botones Interactivos (Opcional)
              </Typography>
              <Chip size="sm" variant="outlined">
                {formData.buttons?.length || 0}/10
              </Chip>
            </Box>
            <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 1 }}>
              Agrega hasta 10 botones para que el usuario interactúe (Aceptar, Rechazar, etc.)
            </Typography>

            {/* Lista de botones agregados */}
            {formData.buttons && formData.buttons.length > 0 && (
              <Sheet variant="outlined" sx={{ p: 1.5, mb: 1, borderRadius: 'sm' }}>
                {formData.buttons?.map((btn, idx) => (
                  <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Chip
                      size="sm"
                      color={btn.type === 'QUICK_REPLY' ? 'primary' : btn.type === 'URL' ? 'success' : 'warning'}
                      startDecorator={
                        btn.type === 'QUICK_REPLY' ? <TouchAppIcon /> :
                        btn.type === 'URL' ? <LinkIcon /> :
                        btn.type === 'PHONE_NUMBER' ? <PhoneIcon /> :
                        <ContentCopyIcon />
                      }
                    >
                      {btn.type === 'QUICK_REPLY' ? 'Respuesta rápida' :
                       btn.type === 'URL' ? 'Enlace' :
                       btn.type === 'PHONE_NUMBER' ? 'Teléfono' : 'Copiar código'}
                    </Chip>
                    <Typography level="body-sm" sx={{ flex: 1 }}>
                      {btn.text}
                    </Typography>
                    {btn.type === 'URL' && btn.url && (
                      <Typography level="body-xs" sx={{ color: 'text.tertiary', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {btn.url}
                      </Typography>
                    )}
                    {btn.type === 'PHONE_NUMBER' && btn.phoneNumber && (
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {btn.phoneNumber}
                      </Typography>
                    )}
                    <IconButton
                      size="sm"
                      variant="plain"
                      color="danger"
                      onClick={() => {
                        const newButtons = [...(formData.buttons || [])]
                        newButtons.splice(idx, 1)
                        setFormData(prev => ({ ...prev, buttons: newButtons }))
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Sheet>
            )}

            {/* Agregar nuevo botón */}
            {(!formData.buttons || formData.buttons.length < 10) && (
              <Button
                size="sm"
                variant="outlined"
                startDecorator={<AddIcon />}
                onClick={() => {
                  const newButton: TemplateButton = {
                    type: 'QUICK_REPLY',
                    text: ''
                  }
                  setFormData(prev => ({
                    ...prev,
                    buttons: [...(prev.buttons || []), newButton]
                  }))
                }}
              >
                Agregar Botón
              </Button>
            )}

            {/* Formulario para editar el último botón */}
            {formData.buttons && formData.buttons.length > 0 && (
              <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'background.level1', borderRadius: 'sm' }}>
                <Grid container spacing={1}>
                  <Grid xs={4}>
                    <FormControl size="sm">
                      <FormLabel>Tipo</FormLabel>
                      <Select
                        size="sm"
                        value={formData.buttons[formData.buttons.length - 1].type}
                        onChange={(_, val) => {
                          const newButtons = [...formData.buttons!]
                          newButtons[newButtons.length - 1] = {
                            ...newButtons[newButtons.length - 1],
                            type: val as any,
                            url: val === 'URL' ? '' : undefined,
                            phoneNumber: val === 'PHONE_NUMBER' ? '' : undefined
                          }
                          setFormData(prev => ({ ...prev, buttons: newButtons }))
                        }}
                      >
                        <Option value="QUICK_REPLY">💬 Respuesta rápida</Option>
                        <Option value="URL">🔗 Enlace (URL)</Option>
                        <Option value="PHONE_NUMBER">📞 Teléfono</Option>
                        <Option value="COPY_CODE">📋 Copiar código</Option>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid xs={formData.buttons[formData.buttons.length - 1].type === 'QUICK_REPLY' ? 8 : 4}>
                    <FormControl size="sm">
                      <FormLabel>Texto del botón</FormLabel>
                      <Input
                        size="sm"
                        placeholder="Ej: Aceptar, Rechazar, Ver más..."
                        value={formData.buttons[formData.buttons.length - 1].text}
                        onChange={(e) => {
                          const newButtons = [...formData.buttons!]
                          newButtons[newButtons.length - 1] = {
                            ...newButtons[newButtons.length - 1],
                            text: e.target.value.slice(0, 25)
                          }
                          setFormData(prev => ({ ...prev, buttons: newButtons }))
                        }}
                      />
                    </FormControl>
                  </Grid>
                  {formData.buttons[formData.buttons.length - 1].type === 'URL' && (
                    <Grid xs={4}>
                      <FormControl size="sm">
                        <FormLabel>URL</FormLabel>
                        <Input
                          size="sm"
                          placeholder="https://..."
                          value={formData.buttons[formData.buttons.length - 1].url || ''}
                          onChange={(e) => {
                            const newButtons = [...formData.buttons!]
                            newButtons[newButtons.length - 1] = {
                              ...newButtons[newButtons.length - 1],
                              url: e.target.value
                            }
                            setFormData(prev => ({ ...prev, buttons: newButtons }))
                          }}
                        />
                      </FormControl>
                    </Grid>
                  )}
                  {formData.buttons[formData.buttons.length - 1].type === 'PHONE_NUMBER' && (
                    <Grid xs={4}>
                      <FormControl size="sm">
                        <FormLabel>Teléfono</FormLabel>
                        <Input
                          size="sm"
                          placeholder="+1234567890"
                          value={formData.buttons[formData.buttons.length - 1].phoneNumber || ''}
                          onChange={(e) => {
                            const newButtons = [...formData.buttons!]
                            newButtons[newButtons.length - 1] = {
                              ...newButtons[newButtons.length - 1],
                              phoneNumber: e.target.value
                            }
                            setFormData(prev => ({ ...prev, buttons: newButtons }))
                          }}
                        />
                      </FormControl>
                    </Grid>
                  )}
                </Grid>
              </Box>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 3 }}>
            <Button variant="outlined" color="neutral" onClick={() => setOpenModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              loading={submitting}
            >
              {editingTemplate ? 'Actualizar' : 'Crear Plantilla'}
            </Button>
          </Box>
        </ModalDialog>
      </Modal>

      {/* Modal de Error/Éxito de Meta */}
      <Modal open={metaError.show} onClose={() => setMetaError(prev => ({ ...prev, show: false }))}>
        <ModalDialog
          color={metaError.title === '¡Éxito!' ? 'success' : 'danger'}
          variant="soft"
          sx={{ maxWidth: 500 }}
        >
          <Typography
            level="h4"
            startDecorator={metaError.title === '¡Éxito!' ? <CheckCircleIcon /> : <ErrorIcon />}
            sx={{ mb: 2 }}
          >
            {metaError.title}
          </Typography>

          {metaError.userMessage && (
            <Alert color="warning" sx={{ mb: 2 }}>
              <Typography level="body-sm" fontWeight="lg">
                {metaError.userMessage}
              </Typography>
            </Alert>
          )}

          <Typography level="body-md" sx={{ mb: 2 }}>
            {metaError.message}
          </Typography>

          {metaError.code && (
            <Box sx={{
              bgcolor: 'background.level1',
              p: 1.5,
              borderRadius: 'sm',
              mb: 2
            }}>
              <Typography level="body-xs" sx={{ fontFamily: 'monospace' }}>
                Código: {metaError.code}
                {metaError.subcode && ` (${metaError.subcode})`}
              </Typography>
            </Box>
          )}

          {metaError.title !== '¡Éxito!' && metaError.code === 100 && metaError.subcode === 2388299 && (
            <Alert color="neutral" size="sm" sx={{ mb: 2 }}>
              <Typography level="body-xs">
                <strong>Tip:</strong> Las variables {'{{1}}'}, {'{{2}}'}, etc. no pueden estar al inicio ni al final del texto.
                Agrega texto antes y después de las variables.
              </Typography>
            </Alert>
          )}

          <Button
            variant="solid"
            color={metaError.title === '¡Éxito!' ? 'success' : 'neutral'}
            onClick={() => setMetaError(prev => ({ ...prev, show: false }))}
            sx={{ mt: 1 }}
          >
            Entendido
          </Button>
        </ModalDialog>
      </Modal>
    </Box>
  )
}
