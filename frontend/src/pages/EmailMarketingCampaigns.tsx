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
  Select,
  Option,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Textarea,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/joy'
import {
  Add as AddIcon,
  Send as SendIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Campaign as CampaignIcon,
  Email as EmailIcon,
} from '@mui/icons-material'
import * as emailService from '../services/emailCampaignService'

// TODO: Socket.IO listener for real-time updates

type CampaignStatus =
  | 'INACTIVA'
  | 'PROGRAMADA'
  | 'EN_ANDAMENTO'
  | 'CANCELADA'
  | 'FINALIZADA'

interface ContactList {
  id: number
  name: string
  isEmailList: boolean
}

interface EmailCampaign {
  id: number
  name: string
  subject: string
  status: CampaignStatus
  contactListId?: number
  contactList?: ContactList
  htmlContent?: string
  sendAt?: string
  createdAt: string
  updatedAt?: string
}

interface NewCampaignForm {
  name: string
  subject: string
  htmlContent: string
  contactListId: string
  sendAt: string
}

const STATUS_LABEL: Record<CampaignStatus, string> = {
  INACTIVA: 'Inactiva',
  PROGRAMADA: 'Programada',
  EN_ANDAMENTO: 'En Progreso',
  CANCELADA: 'Cancelada',
  FINALIZADA: 'Finalizada',
}

const STATUS_COLOR: Record<
  CampaignStatus,
  'neutral' | 'warning' | 'primary' | 'danger' | 'success'
> = {
  INACTIVA: 'neutral',
  PROGRAMADA: 'warning',
  EN_ANDAMENTO: 'primary',
  CANCELADA: 'danger',
  FINALIZADA: 'success',
}

const EMPTY_FORM: NewCampaignForm = {
  name: '',
  subject: '',
  htmlContent: '',
  contactListId: '',
  sendAt: '',
}

export default function EmailMarketingCampaigns() {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [contactLists, setContactLists] = useState<ContactList[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [searchParam, setSearchParam] = useState('')
  const [pageNumber, setPageNumber] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [count, setCount] = useState(0)

  const [openCreateModal, setOpenCreateModal] = useState(false)
  const [openDeleteModal, setOpenDeleteModal] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<EmailCampaign | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)

  const [form, setForm] = useState<NewCampaignForm>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof NewCampaignForm, string>>>({})

  // ---- Data fetching ----

  const fetchCampaigns = useCallback(
    async (page: number = 1, append: boolean = false) => {
      setLoading(true)
      try {
        const data = await emailService.listEmailCampaigns({
          searchParam,
          pageNumber: page,
        })

        const list: EmailCampaign[] = data.campaigns ?? data.records ?? data ?? []
        const total: number = data.count ?? list.length
        const more: boolean = data.hasMore ?? false

        setCampaigns((prev) => (append ? [...prev, ...list] : list))
        setCount(total)
        setHasMore(more)
      } catch (error) {
        console.error('Error fetching email campaigns:', error)
      } finally {
        setLoading(false)
      }
    },
    [searchParam]
  )

  const fetchContactLists = async () => {
    try {
      const data = await emailService.listContactListsAll()
      const all: ContactList[] = Array.isArray(data) ? data : data.contactLists ?? []
      setContactLists(all.filter((list) => list.isEmailList === true))
    } catch (error) {
      console.error('Error fetching contact lists:', error)
    }
  }

  useEffect(() => {
    setPageNumber(1)
    fetchCampaigns(1, false)
  }, [searchParam])

  useEffect(() => {
    fetchContactLists()
  }, [])

  // ---- Refresh helper ----

  const refreshList = () => {
    setPageNumber(1)
    fetchCampaigns(1, false)
  }

  // ---- Load more ----

  const handleLoadMore = () => {
    const next = pageNumber + 1
    setPageNumber(next)
    fetchCampaigns(next, true)
  }

  // ---- Search on Enter ----

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setPageNumber(1)
      fetchCampaigns(1, false)
    }
  }

  // ---- Actions ----

  const handlePlay = async (campaign: EmailCampaign) => {
    setActionLoading(campaign.id)
    try {
      await emailService.restartCampaign(campaign.id)
      refreshList()
    } catch (error) {
      console.error('Error restarting campaign:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const handlePause = async (campaign: EmailCampaign) => {
    setActionLoading(campaign.id)
    try {
      await emailService.cancelCampaign(campaign.id)
      refreshList()
    } catch (error) {
      console.error('Error cancelling campaign:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!selectedCampaign) return
    setActionLoading(selectedCampaign.id)
    try {
      await emailService.deleteEmailCampaign(selectedCampaign.id)
      setOpenDeleteModal(false)
      setSelectedCampaign(null)
      refreshList()
    } catch (error) {
      console.error('Error deleting campaign:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const openDelete = (campaign: EmailCampaign) => {
    setSelectedCampaign(campaign)
    setOpenDeleteModal(true)
  }

  // ---- Create form ----

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof NewCampaignForm, string>> = {}
    if (!form.name.trim()) errors.name = 'El nombre es requerido'
    if (!form.subject.trim()) errors.subject = 'El asunto es requerido'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleFormChange = (field: keyof NewCampaignForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  const handleCreateSubmit = async () => {
    if (!validateForm()) return
    setFormSubmitting(true)
    try {
      await emailService.createEmailCampaign({
        name: form.name.trim(),
        subject: form.subject.trim(),
        htmlContent: form.htmlContent || undefined,
        contactListId: form.contactListId ? Number(form.contactListId) : undefined,
        sendAt: form.sendAt || undefined,
      })
      setOpenCreateModal(false)
      setForm(EMPTY_FORM)
      setFormErrors({})
      refreshList()
    } catch (error) {
      console.error('Error creating campaign:', error)
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleCloseCreateModal = () => {
    setOpenCreateModal(false)
    setForm(EMPTY_FORM)
    setFormErrors({})
  }

  // ---- Derived stats ----

  const totalByStatus = (status: CampaignStatus) =>
    campaigns.filter((c) => c.status === status).length

  // ---- Render ----

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack spacing={3}>

        {/* ---- Header ---- */}
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          sx={{ gap: 1 }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <EmailIcon sx={{ fontSize: 36, color: 'primary.500' }} />
            <Box>
              <Typography level="h2">Campanas de Email</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                {count > 0 ? `${count} campanas en total` : 'Gestion de campanas con Acelle Mail'}
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Actualizar lista">
              <IconButton
                variant="outlined"
                color="neutral"
                onClick={refreshList}
                disabled={loading}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Button
              startDecorator={<AddIcon />}
              color="primary"
              onClick={() => setOpenCreateModal(true)}
            >
              Nueva Campana
            </Button>
          </Stack>
        </Stack>

        {/* ---- Stats Cards ---- */}
        <Grid container spacing={2}>
          {[
            { label: 'Total', value: campaigns.length, color: '#6B7280', icon: <CampaignIcon sx={{ fontSize: 28 }} /> },
            { label: 'Inactivas', value: totalByStatus('INACTIVA'), color: '#9CA3AF' },
            { label: 'Programadas', value: totalByStatus('PROGRAMADA'), color: '#F59E0B' },
            { label: 'En Progreso', value: totalByStatus('EN_ANDAMENTO'), color: '#3B82F6' },
            { label: 'Finalizadas', value: totalByStatus('FINALIZADA'), color: '#10B981' },
          ].map((stat) => (
            <Grid key={stat.label} xs={12} sm={6} md={2.4}>
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                        {stat.label}
                      </Typography>
                      <Typography level="h3">{stat.value}</Typography>
                    </Box>
                    {stat.icon ?? (
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: stat.color,
                        }}
                      />
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* ---- Search bar ---- */}
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center">
              <Input
                placeholder="Buscar por nombre de campana... (Enter para buscar)"
                value={searchParam}
                onChange={(e) => setSearchParam(e.target.value)}
                onKeyDown={handleSearchKeyDown}
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

        {/* ---- Table ---- */}
        <Card variant="outlined">
          <CardContent sx={{ p: 0 }}>
            {loading && campaigns.length === 0 ? (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  py: 6,
                }}
              >
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
                      <th style={{ minWidth: 180 }}>Lista de Contactos</th>
                      <th style={{ minWidth: 130 }}>Estado</th>
                      <th style={{ minWidth: 140 }}>Fecha Creacion</th>
                      <th style={{ minWidth: 140, textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                          <Stack spacing={1} alignItems="center">
                            <CampaignIcon sx={{ fontSize: 48, color: 'neutral.300' }} />
                            <Typography level="body-md" sx={{ color: 'text.tertiary' }}>
                              {searchParam
                                ? 'No se encontraron campanas con ese criterio'
                                : 'No hay campanas creadas todavia'}
                            </Typography>
                            {!searchParam && (
                              <Button
                                size="sm"
                                startDecorator={<AddIcon />}
                                onClick={() => setOpenCreateModal(true)}
                              >
                                Crear primera campana
                              </Button>
                            )}
                          </Stack>
                        </td>
                      </tr>
                    ) : (
                      campaigns.map((campaign) => {
                        const isActioning = actionLoading === campaign.id
                        const canPlay =
                          campaign.status === 'INACTIVA' ||
                          campaign.status === 'PROGRAMADA' ||
                          campaign.status === 'CANCELADA'
                        const canPause = campaign.status === 'EN_ANDAMENTO'

                        return (
                          <tr key={campaign.id}>
                            {/* Nombre */}
                            <td>
                              <Typography level="body-sm" fontWeight="md">
                                {campaign.name}
                              </Typography>
                            </td>

                            {/* Asunto */}
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
                                {campaign.subject || '-'}
                              </Typography>
                            </td>

                            {/* Lista de Contactos */}
                            <td>
                              {campaign.contactList ? (
                                <Chip size="sm" variant="soft" color="neutral">
                                  {campaign.contactList.name}
                                </Chip>
                              ) : (
                                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                  Sin lista
                                </Typography>
                              )}
                            </td>

                            {/* Estado */}
                            <td>
                              <Chip
                                size="sm"
                                variant="soft"
                                color={STATUS_COLOR[campaign.status] ?? 'neutral'}
                              >
                                {STATUS_LABEL[campaign.status] ?? campaign.status}
                              </Chip>
                            </td>

                            {/* Fecha Creacion */}
                            <td>
                              <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                                {campaign.createdAt
                                  ? new Date(campaign.createdAt).toLocaleDateString('es-ES', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                    })
                                  : '-'}
                              </Typography>
                            </td>

                            {/* Acciones */}
                            <td>
                              <Stack
                                direction="row"
                                spacing={0.5}
                                justifyContent="center"
                                alignItems="center"
                              >
                                {isActioning ? (
                                  <CircularProgress size="sm" />
                                ) : (
                                  <>
                                    {canPlay && (
                                      <Tooltip title="Iniciar campana" size="sm">
                                        <IconButton
                                          size="sm"
                                          variant="plain"
                                          color="success"
                                          onClick={() => handlePlay(campaign)}
                                        >
                                          <PlayArrowIcon />
                                        </IconButton>
                                      </Tooltip>
                                    )}

                                    {canPause && (
                                      <Tooltip title="Pausar campana" size="sm">
                                        <IconButton
                                          size="sm"
                                          variant="plain"
                                          color="warning"
                                          onClick={() => handlePause(campaign)}
                                        >
                                          <PauseIcon />
                                        </IconButton>
                                      </Tooltip>
                                    )}

                                    <Tooltip title="Editar campana" size="sm">
                                      <IconButton
                                        size="sm"
                                        variant="plain"
                                        color="neutral"
                                        disabled
                                      >
                                        <EditIcon />
                                      </IconButton>
                                    </Tooltip>

                                    <Tooltip title="Eliminar campana" size="sm">
                                      <IconButton
                                        size="sm"
                                        variant="plain"
                                        color="danger"
                                        onClick={() => openDelete(campaign)}
                                      >
                                        <DeleteIcon />
                                      </IconButton>
                                    </Tooltip>
                                  </>
                                )}
                              </Stack>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </Table>
              </Sheet>
            )}

            {/* Load More */}
            {hasMore && (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                <Button
                  variant="outlined"
                  color="neutral"
                  size="sm"
                  onClick={handleLoadMore}
                  loading={loading}
                >
                  Cargar mas
                </Button>
              </Box>
            )}

            {/* Loading overlay while paginating */}
            {loading && campaigns.length > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size="sm" />
              </Box>
            )}
          </CardContent>
        </Card>
      </Stack>

      {/* ---- Create Campaign Modal ---- */}
      <Modal open={openCreateModal} onClose={handleCloseCreateModal}>
        <ModalDialog
          sx={{
            width: { xs: '95vw', sm: 560 },
            maxHeight: '90vh',
            overflow: 'auto',
          }}
        >
          <ModalClose />
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
            <SendIcon sx={{ color: 'primary.500' }} />
            <Typography level="h4">Nueva Campana de Email</Typography>
          </Stack>

          <Stack spacing={2}>
            {/* Nombre */}
            <FormControl required error={!!formErrors.name}>
              <FormLabel>Nombre de la campana</FormLabel>
              <Input
                placeholder="Ej: Newsletter Febrero 2026"
                value={form.name}
                onChange={(e) => handleFormChange('name', e.target.value)}
              />
              {formErrors.name && (
                <Typography level="body-xs" color="danger">
                  {formErrors.name}
                </Typography>
              )}
            </FormControl>

            {/* Asunto */}
            <FormControl required error={!!formErrors.subject}>
              <FormLabel>Asunto del email</FormLabel>
              <Input
                placeholder="Asunto que veran los destinatarios"
                value={form.subject}
                onChange={(e) => handleFormChange('subject', e.target.value)}
              />
              {formErrors.subject && (
                <Typography level="body-xs" color="danger">
                  {formErrors.subject}
                </Typography>
              )}
            </FormControl>

            {/* Lista de Contactos */}
            <FormControl>
              <FormLabel>Lista de contactos (email)</FormLabel>
              <Select
                placeholder="Seleccionar lista..."
                value={form.contactListId || null}
                onChange={(_, value) => handleFormChange('contactListId', value ?? '')}
              >
                {contactLists.length === 0 ? (
                  <Option value="" disabled>
                    No hay listas de email disponibles
                  </Option>
                ) : (
                  contactLists.map((list) => (
                    <Option key={list.id} value={String(list.id)}>
                      {list.name}
                    </Option>
                  ))
                )}
              </Select>
            </FormControl>

            {/* Contenido HTML */}
            <FormControl>
              <FormLabel>Contenido HTML</FormLabel>
              <Textarea
                placeholder="Pega aqui el contenido HTML de tu email..."
                minRows={5}
                maxRows={10}
                value={form.htmlContent}
                onChange={(e) => handleFormChange('htmlContent', e.target.value)}
                sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
              />
            </FormControl>

            {/* Fecha de envio */}
            <FormControl>
              <FormLabel>Fecha y hora de envio (opcional)</FormLabel>
              <Input
                type="datetime-local"
                value={form.sendAt}
                onChange={(e) => handleFormChange('sendAt', e.target.value)}
              />
            </FormControl>

            {/* Buttons */}
            <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 1 }}>
              <Button
                variant="outlined"
                color="neutral"
                onClick={handleCloseCreateModal}
                disabled={formSubmitting}
              >
                Cancelar
              </Button>
              <Button
                color="primary"
                startDecorator={formSubmitting ? <CircularProgress size="sm" /> : <SendIcon />}
                onClick={handleCreateSubmit}
                disabled={formSubmitting}
              >
                {formSubmitting ? 'Creando...' : 'Crear Campana'}
              </Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* ---- Delete Confirmation Modal ---- */}
      <Modal
        open={openDeleteModal}
        onClose={() => {
          setOpenDeleteModal(false)
          setSelectedCampaign(null)
        }}
      >
        <ModalDialog variant="outlined" role="alertdialog" sx={{ maxWidth: 420 }}>
          <ModalClose />
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <DeleteIcon sx={{ color: 'danger.500' }} />
              <Typography level="h4">Eliminar campana</Typography>
            </Stack>

            <Typography level="body-md">
              Estas a punto de eliminar la campana{' '}
              <Typography fontWeight="bold">"{selectedCampaign?.name}"</Typography>. Esta accion no
              se puede deshacer.
            </Typography>

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="outlined"
                color="neutral"
                onClick={() => {
                  setOpenDeleteModal(false)
                  setSelectedCampaign(null)
                }}
                disabled={actionLoading !== null}
              >
                Cancelar
              </Button>
              <Button
                color="danger"
                startDecorator={
                  actionLoading !== null ? <CircularProgress size="sm" /> : <DeleteIcon />
                }
                onClick={handleDeleteConfirm}
                disabled={actionLoading !== null}
              >
                {actionLoading !== null ? 'Eliminando...' : 'Eliminar'}
              </Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>
    </Container>
  )
}
