import { useState, useEffect, useCallback } from 'react'
import {
  Container,
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  Sheet,
  Table,
  Input,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Textarea,
  IconButton,
  Tooltip,
  CircularProgress,
  Select,
  Option,
  Tabs,
  TabList,
  Tab,
  TabPanel,
} from '@mui/joy'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Code as CodeIcon,
  Visibility as PreviewIcon,
  ContentCopy as CopyIcon,
  Description as TemplateIcon,
} from '@mui/icons-material'
import * as emailService from '../services/emailCampaignService'

interface EmailTemplate {
  id: number
  name: string
  subject: string
  htmlContent: string
  category: string
  status: string
  createdAt: string
}

interface TemplateForm {
  name: string
  subject: string
  htmlContent: string
  category: string
}

const EMPTY_FORM: TemplateForm = {
  name: '',
  subject: '',
  htmlContent: '',
  category: 'general',
}

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'promotional', label: 'Promocional' },
  { value: 'transactional', label: 'Transaccional' },
  { value: 'welcome', label: 'Bienvenida' },
  { value: 'notification', label: 'Notificacion' },
]

export default function EmailMarketingPlantillas() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [searchParam, setSearchParam] = useState('')
  const [pageNumber, setPageNumber] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [count, setCount] = useState(0)

  // Modal state
  const [openModal, setOpenModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [openDeleteModal, setOpenDeleteModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof TemplateForm, string>>>({})

  // Editor tab (0 = code, 1 = preview)
  const [editorTab, setEditorTab] = useState(0)

  // ---- Data fetching ----

  const fetchTemplates = useCallback(
    async (page: number = 1, append: boolean = false) => {
      setLoading(true)
      try {
        const data = await emailService.listEmailTemplates({
          searchParam,
          pageNumber: page,
        })
        const list: EmailTemplate[] = data.records ?? data ?? []
        const total: number = data.count ?? list.length
        const more: boolean = data.hasMore ?? false

        setTemplates((prev) => (append ? [...prev, ...list] : list))
        setCount(total)
        setHasMore(more)
      } catch (error) {
        console.error('Error fetching templates:', error)
      } finally {
        setLoading(false)
      }
    },
    [searchParam]
  )

  useEffect(() => {
    setPageNumber(1)
    fetchTemplates(1, false)
  }, [searchParam])

  const refreshList = () => {
    setPageNumber(1)
    fetchTemplates(1, false)
  }

  const handleLoadMore = () => {
    const next = pageNumber + 1
    setPageNumber(next)
    fetchTemplates(next, true)
  }

  // ---- Form handling ----

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof TemplateForm, string>> = {}
    if (!form.name.trim()) errors.name = 'El nombre es requerido'
    if (!form.subject.trim()) errors.subject = 'El asunto es requerido'
    if (!form.htmlContent.trim()) errors.htmlContent = 'El contenido HTML es requerido'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleFormChange = (field: keyof TemplateForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  const handleOpenCreate = () => {
    setEditingTemplate(null)
    setForm(EMPTY_FORM)
    setFormErrors({})
    setEditorTab(0)
    setOpenModal(true)
  }

  const handleOpenEdit = (template: EmailTemplate) => {
    setEditingTemplate(template)
    setForm({
      name: template.name,
      subject: template.subject,
      htmlContent: template.htmlContent || '',
      category: template.category || 'general',
    })
    setFormErrors({})
    setEditorTab(0)
    setOpenModal(true)
  }

  const handleSubmit = async () => {
    if (!validateForm()) return
    setFormSubmitting(true)
    try {
      if (editingTemplate) {
        await emailService.updateEmailTemplate(editingTemplate.id, {
          name: form.name.trim(),
          subject: form.subject.trim(),
          htmlContent: form.htmlContent,
          category: form.category,
        })
      } else {
        await emailService.createEmailTemplate({
          name: form.name.trim(),
          subject: form.subject.trim(),
          htmlContent: form.htmlContent,
          category: form.category,
        })
      }
      setOpenModal(false)
      setForm(EMPTY_FORM)
      refreshList()
    } catch (error) {
      console.error('Error saving template:', error)
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleCloseModal = () => {
    setOpenModal(false)
    setForm(EMPTY_FORM)
    setFormErrors({})
    setEditingTemplate(null)
  }

  // ---- Delete ----

  const handleDeleteConfirm = async () => {
    if (!selectedTemplate) return
    setDeleteLoading(true)
    try {
      await emailService.deleteEmailTemplate(selectedTemplate.id)
      setOpenDeleteModal(false)
      setSelectedTemplate(null)
      refreshList()
    } catch (error) {
      console.error('Error deleting template:', error)
    } finally {
      setDeleteLoading(false)
    }
  }

  // ---- Copy HTML ----

  const handleCopyHtml = (template: EmailTemplate) => {
    navigator.clipboard.writeText(template.htmlContent || '')
  }

  // ---- Render ----

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack spacing={3}>
        {/* Header */}
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          sx={{ gap: 1 }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <TemplateIcon sx={{ fontSize: 36, color: 'primary.500' }} />
            <Box>
              <Typography level="h2">Plantillas de Email</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                {count > 0 ? `${count} plantillas guardadas` : 'Crea y edita plantillas HTML para tus campanas'}
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Actualizar">
              <IconButton variant="outlined" color="neutral" onClick={refreshList} disabled={loading}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Button startDecorator={<AddIcon />} color="primary" onClick={handleOpenCreate}>
              Nueva Plantilla
            </Button>
          </Stack>
        </Stack>

        {/* Stats */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={4}>
            <Card variant="outlined">
              <CardContent>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                  Total Plantillas
                </Typography>
                <Typography level="h3">{count}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={4}>
            <Card variant="outlined">
              <CardContent>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                  Categorias
                </Typography>
                <Typography level="h3">
                  {new Set(templates.map((t) => t.category)).size}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={4}>
            <Card variant="outlined">
              <CardContent>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                  Ultima creada
                </Typography>
                <Typography level="body-sm">
                  {templates[0]
                    ? new Date(templates[0].createdAt).toLocaleDateString('es-ES')
                    : '--'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Search */}
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center">
              <Input
                placeholder="Buscar plantillas... (Enter para buscar)"
                value={searchParam}
                onChange={(e) => setSearchParam(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && refreshList()}
                startDecorator={<SearchIcon />}
                sx={{ flexGrow: 1 }}
              />
              <Button
                variant="outlined"
                color="neutral"
                startDecorator={<SearchIcon />}
                onClick={refreshList}
                disabled={loading}
              >
                Buscar
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {/* Table */}
        <Card variant="outlined">
          <CardContent sx={{ p: 0 }}>
            {loading && templates.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress size="md" />
              </Box>
            ) : (
              <Sheet sx={{ overflow: 'auto', borderRadius: 'var(--joy-radius-md)' }}>
                <Table
                  stickyHeader
                  hoverRow
                  sx={{
                    '& thead th': { fontWeight: 700, fontSize: '0.8rem' },
                    '& tbody td': { verticalAlign: 'middle' },
                    '--TableCell-paddingX': '16px',
                    '--TableCell-paddingY': '12px',
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ minWidth: 220 }}>Nombre</th>
                      <th style={{ minWidth: 200 }}>Asunto</th>
                      <th style={{ minWidth: 120 }}>Categoria</th>
                      <th style={{ minWidth: 140 }}>Fecha</th>
                      <th style={{ minWidth: 140, textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '3rem' }}>
                          <Stack spacing={1} alignItems="center">
                            <TemplateIcon sx={{ fontSize: 48, color: 'neutral.300' }} />
                            <Typography level="body-md" sx={{ color: 'text.tertiary' }}>
                              No hay plantillas creadas
                            </Typography>
                            <Button size="sm" startDecorator={<AddIcon />} onClick={handleOpenCreate}>
                              Crear primera plantilla
                            </Button>
                          </Stack>
                        </td>
                      </tr>
                    ) : (
                      templates.map((template) => (
                        <tr key={template.id}>
                          <td>
                            <Typography level="body-sm" fontWeight="md">
                              {template.name}
                            </Typography>
                          </td>
                          <td>
                            <Typography
                              level="body-sm"
                              sx={{
                                color: 'text.secondary',
                                maxWidth: 220,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {template.subject || '-'}
                            </Typography>
                          </td>
                          <td>
                            <Chip size="sm" variant="soft" color="neutral">
                              {CATEGORIES.find((c) => c.value === template.category)?.label ??
                                template.category}
                            </Chip>
                          </td>
                          <td>
                            <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                              {new Date(template.createdAt).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                              })}
                            </Typography>
                          </td>
                          <td>
                            <Stack direction="row" spacing={0.5} justifyContent="center">
                              <Tooltip title="Editar plantilla" size="sm">
                                <IconButton
                                  size="sm"
                                  variant="plain"
                                  color="primary"
                                  onClick={() => handleOpenEdit(template)}
                                >
                                  <EditIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Copiar HTML" size="sm">
                                <IconButton
                                  size="sm"
                                  variant="plain"
                                  color="neutral"
                                  onClick={() => handleCopyHtml(template)}
                                >
                                  <CopyIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Eliminar" size="sm">
                                <IconButton
                                  size="sm"
                                  variant="plain"
                                  color="danger"
                                  onClick={() => {
                                    setSelectedTemplate(template)
                                    setOpenDeleteModal(true)
                                  }}
                                >
                                  <DeleteIcon />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </Sheet>
            )}

            {hasMore && (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                <Button variant="outlined" color="neutral" size="sm" onClick={handleLoadMore} loading={loading}>
                  Cargar mas
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>
      </Stack>

      {/* ---- Create/Edit Template Modal ---- */}
      <Modal open={openModal} onClose={handleCloseModal}>
        <ModalDialog
          sx={{
            width: { xs: '95vw', md: '80vw' },
            maxWidth: 1000,
            maxHeight: '92vh',
            overflow: 'auto',
          }}
        >
          <ModalClose />
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
            <CodeIcon sx={{ color: 'primary.500' }} />
            <Typography level="h4">
              {editingTemplate ? 'Editar Plantilla' : 'Nueva Plantilla de Email'}
            </Typography>
          </Stack>

          <Stack spacing={2}>
            {/* Row: Name + Subject + Category */}
            <Grid container spacing={2}>
              <Grid xs={12} md={5}>
                <FormControl required error={!!formErrors.name}>
                  <FormLabel>Nombre</FormLabel>
                  <Input
                    placeholder="Ej: Newsletter Mensual"
                    value={form.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                  />
                  {formErrors.name && (
                    <Typography level="body-xs" color="danger">{formErrors.name}</Typography>
                  )}
                </FormControl>
              </Grid>
              <Grid xs={12} md={4}>
                <FormControl required error={!!formErrors.subject}>
                  <FormLabel>Asunto</FormLabel>
                  <Input
                    placeholder="Asunto del email"
                    value={form.subject}
                    onChange={(e) => handleFormChange('subject', e.target.value)}
                  />
                  {formErrors.subject && (
                    <Typography level="body-xs" color="danger">{formErrors.subject}</Typography>
                  )}
                </FormControl>
              </Grid>
              <Grid xs={12} md={3}>
                <FormControl>
                  <FormLabel>Categoria</FormLabel>
                  <Select
                    value={form.category}
                    onChange={(_, val) => handleFormChange('category', val ?? 'general')}
                  >
                    {CATEGORIES.map((cat) => (
                      <Option key={cat.value} value={cat.value}>{cat.label}</Option>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            {/* Editor with tabs: Code / Preview */}
            <FormControl required error={!!formErrors.htmlContent}>
              <Tabs value={editorTab} onChange={(_, val) => setEditorTab(val as number)}>
                <TabList>
                  <Tab>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <CodeIcon sx={{ fontSize: 16 }} />
                      <span>Codigo HTML</span>
                    </Stack>
                  </Tab>
                  <Tab>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <PreviewIcon sx={{ fontSize: 16 }} />
                      <span>Vista Previa</span>
                    </Stack>
                  </Tab>
                </TabList>

                <TabPanel value={0} sx={{ p: 0, pt: 1 }}>
                  <Textarea
                    placeholder="Escribe o pega aqui el HTML de tu plantilla de email..."
                    minRows={14}
                    maxRows={22}
                    value={form.htmlContent}
                    onChange={(e) => handleFormChange('htmlContent', e.target.value)}
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      lineHeight: 1.5,
                    }}
                  />
                </TabPanel>

                <TabPanel value={1} sx={{ p: 0, pt: 1 }}>
                  <Box
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 'md',
                      minHeight: 300,
                      maxHeight: 450,
                      overflow: 'auto',
                      bgcolor: 'white',
                    }}
                  >
                    {form.htmlContent ? (
                      <Box
                        sx={{ p: 2 }}
                        dangerouslySetInnerHTML={{ __html: form.htmlContent }}
                      />
                    ) : (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: 300,
                          color: 'text.tertiary',
                        }}
                      >
                        <Typography level="body-sm">
                          Escribe HTML en la pestana de codigo para ver la vista previa aqui
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </TabPanel>
              </Tabs>
              {formErrors.htmlContent && (
                <Typography level="body-xs" color="danger">{formErrors.htmlContent}</Typography>
              )}
            </FormControl>

            {/* Buttons */}
            <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 1 }}>
              <Button variant="outlined" color="neutral" onClick={handleCloseModal} disabled={formSubmitting}>
                Cancelar
              </Button>
              <Button
                color="primary"
                startDecorator={formSubmitting ? <CircularProgress size="sm" /> : editingTemplate ? <EditIcon /> : <AddIcon />}
                onClick={handleSubmit}
                disabled={formSubmitting}
              >
                {formSubmitting
                  ? 'Guardando...'
                  : editingTemplate
                  ? 'Guardar Cambios'
                  : 'Crear Plantilla'}
              </Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* ---- Delete Modal ---- */}
      <Modal
        open={openDeleteModal}
        onClose={() => {
          setOpenDeleteModal(false)
          setSelectedTemplate(null)
        }}
      >
        <ModalDialog variant="outlined" role="alertdialog" sx={{ maxWidth: 420 }}>
          <ModalClose />
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <DeleteIcon sx={{ color: 'danger.500' }} />
              <Typography level="h4">Eliminar plantilla</Typography>
            </Stack>
            <Typography level="body-md">
              Eliminar la plantilla{' '}
              <Typography fontWeight="bold">"{selectedTemplate?.name}"</Typography>?
              Esta accion no se puede deshacer.
            </Typography>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="outlined"
                color="neutral"
                onClick={() => {
                  setOpenDeleteModal(false)
                  setSelectedTemplate(null)
                }}
                disabled={deleteLoading}
              >
                Cancelar
              </Button>
              <Button
                color="danger"
                startDecorator={deleteLoading ? <CircularProgress size="sm" /> : <DeleteIcon />}
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Eliminando...' : 'Eliminar'}
              </Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>
    </Container>
  )
}
