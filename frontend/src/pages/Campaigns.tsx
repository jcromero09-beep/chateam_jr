import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Stack,
  Card,
  CardContent,
  Button,
  Table,
  Sheet,
  Chip,
  IconButton,
  Input,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Select,
  Option,
  Alert,
  LinearProgress,
  Divider,
  Tooltip,
  Grid,
  Textarea,
  CircularProgress,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/joy'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Campaign as CampaignIcon,
  Cancel as CancelIcon,
  Replay as ReplayIcon,
  Schedule as ScheduleIcon,
  CheckCircle as CheckCircleIcon,
  PlayArrow as PlayArrowIcon,
  Block as BlockIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Message as MessageIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
} from '@mui/icons-material'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'react-toastify'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import socketService from '../services/socket'

// ============================================================
// TIPOS
// ============================================================

type CampaignStatus =
  | 'INATIVA'
  | 'PROGRAMADA'
  | 'EM_ANDAMENTO'
  | 'CANCELADA'
  | 'FINALIZADA'

interface Campaign {
  id: number
  name: string
  status: CampaignStatus
  scheduledAt?: string | null
  completedAt?: string | null
  contactListId?: number | null
  whatsappId?: number | null
  useTemplate?: boolean
  whastsAppTemplateId?: number | null
  templateParams?: Record<string, string>
  queueId?: number | null
  userId?: number | null
  statusTicket?: string | null
  contactList?: { id: number; name: string }
  whatsapp?: { id: number; name: string; channel: string; phoneNumberId?: string }
  whastsAppTemplate?: {
    id: number
    name: string
    status: string
    category: string
    language: string
    bodyContent?: string
    headerType?: string
    footerContent?: string
    variablesCount?: number
  }
  totalRecipients?: number
  successCount?: number
  errorCount?: number
  pendingCount?: number
  metaCost?: number | null
  createdAt: string
}

interface WhatsAppConnection {
  id: number
  name: string
  channel: string
  phoneNumberId?: string
  status?: string
}

interface WhatsAppTemplate {
  id: number
  name: string
  status: string
  category: string
  language: string
  bodyContent?: string
  variablesCount?: number
  whatsappId?: number | null
}

interface ContactList {
  id: number
  name: string
  contactsCount?: number
}

interface Queue {
  id: number
  name: string
}

interface AppUser {
  id: number
  name: string
  email: string
}

interface Tag {
  id: number
  name: string
  color?: string
}

// ============================================================
// HELPERS
// ============================================================

function statusColor(
  status: CampaignStatus
): 'neutral' | 'primary' | 'warning' | 'success' | 'danger' {
  switch (status) {
    case 'INATIVA':
      return 'neutral'
    case 'PROGRAMADA':
      return 'primary'
    case 'EM_ANDAMENTO':
      return 'warning'
    case 'FINALIZADA':
      return 'success'
    case 'CANCELADA':
      return 'danger'
  }
}

function statusLabel(status: CampaignStatus): string {
  switch (status) {
    case 'INATIVA':
      return 'Borrador'
    case 'PROGRAMADA':
      return 'Programada'
    case 'EM_ANDAMENTO':
      return 'En ejecución'
    case 'FINALIZADA':
      return 'Finalizada'
    case 'CANCELADA':
      return 'Cancelada'
  }
}

function channelColor(
  channel: string
): 'success' | 'primary' | 'neutral' {
  if (channel === 'meta' || channel === 'cloud_api') return 'success'
  if (channel === 'baileys') return 'primary'
  return 'neutral'
}

function channelLabel(channel: string): string {
  if (channel === 'meta' || channel === 'cloud_api') return 'Meta API'
  if (channel === 'baileys') return 'Baileys'
  return channel
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  try {
    return format(new Date(dateStr), 'dd MMM yyyy HH:mm', { locale: es })
  } catch {
    return dateStr
  }
}

function extractApiError(err: unknown): string {
  if (
    err &&
    typeof err === 'object' &&
    'response' in err &&
    err.response &&
    typeof err.response === 'object' &&
    'data' in err.response
  ) {
    const data = (err.response as { data?: { error?: string; message?: string } }).data
    return data?.error ?? data?.message ?? 'Error desconocido'
  }
  return 'Error de conexión'
}

// ============================================================
// MODAL: FORMULARIO CREACIÓN / EDICIÓN
// ============================================================

interface CampaignFormModalProps {
  open: boolean
  onClose: () => void
  editing: Campaign | null
  whatsappConnections: WhatsAppConnection[]
  contactLists: ContactList[]
  templates: WhatsAppTemplate[]
  queues: Queue[]
  users: AppUser[]
  tags: Tag[]
  onSaved: () => void
}

function CampaignFormModal({
  open,
  onClose,
  editing,
  whatsappConnections,
  contactLists,
  templates,
  queues,
  users,
  tags,
  onSaved,
}: CampaignFormModalProps) {
  const metaConnections = whatsappConnections.filter(
    (c) => c.channel === 'meta' || c.channel === 'cloud_api'
  )

  const [name, setName] = useState('')
  const [whatsappId, setWhatsappId] = useState<number | null>(null)
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [templateParams, setTemplateParams] = useState<Record<string, string>>({})
  const [scheduledAt, setScheduledAt] = useState('')
  const [contactListId, setContactListId] = useState<number | null>(null)
  const [queueId, setQueueId] = useState<number | null>(null)
  const [userId, setUserId] = useState<number | null>(null)
  const [tagId, setTagId] = useState<number | null>(null)
  const [statusTicket, setStatusTicket] = useState<string | null>(null)
  const [showOptional, setShowOptional] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null
  const variablesCount = selectedTemplate?.variablesCount ?? 0

  // Inicializar form al abrir
  useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setWhatsappId(editing.whatsappId ?? null)
      setTemplateId(editing.whastsAppTemplateId ?? null)
      setTemplateParams(editing.templateParams ?? {})
      setScheduledAt(
        editing.scheduledAt
          ? editing.scheduledAt.slice(0, 16) // datetime-local format
          : ''
      )
      setContactListId(editing.contactListId ?? null)
      setQueueId(editing.queueId ?? null)
      setUserId(editing.userId ?? null)
      setStatusTicket(editing.statusTicket ?? null)
    } else {
      setName('')
      setWhatsappId(null)
      setTemplateId(null)
      setTemplateParams({})
      setScheduledAt('')
      setContactListId(null)
      setQueueId(null)
      setUserId(null)
      setTagId(null)
      setStatusTicket(null)
    }
    setFormError(null)
    setShowOptional(false)
  }, [open, editing])

  const handleParamChange = (key: string, value: string) => {
    setTemplateParams((prev) => ({ ...prev, [key]: value }))
  }

  const buildPayload = (status: CampaignStatus) => ({
    name,
    whatsappId,
    contactListId,
    useTemplate: true,
    whastsAppTemplateId: templateId,
    templateParams,
    scheduledAt: scheduledAt || null,
    status,
    queueId: queueId ?? null,
    userId: userId ?? null,
    statusTicket: statusTicket ?? null,
    ...(tagId ? { tagListId: tagId } : {}),
  })

  const submit = async (status: CampaignStatus) => {
    if (!name.trim()) {
      setFormError('El nombre de la campaña es obligatorio.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      if (editing) {
        await api.put(`/campaigns/${editing.id}`, buildPayload(editing.status))
      } else {
        await api.post('/campaigns', buildPayload(status))
      }
      toast.success(editing ? 'Campaña actualizada.' : 'Campaña creada.')
      onSaved()
      onClose()
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { status?: number } }).response?.status === 403
      ) {
        setFormError(
          'No es posible editar una campaña ya en ejecución. Reinicia para crear una nueva.'
        )
      } else {
        setFormError(extractApiError(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        layout="center"
        sx={{ width: { xs: '95vw', md: 620 }, maxHeight: '90vh', overflow: 'auto' }}
      >
        <ModalClose />
        <DialogTitle>
          {editing ? 'Editar campaña' : 'Nueva campaña Meta'}
        </DialogTitle>

        <DialogContent sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {formError && (
            <Alert color="danger" startDecorator={<WarningIcon />}>
              {formError}
            </Alert>
          )}

          {/* === A. OBLIGATORIOS === */}
          <Typography level="title-sm" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            Configuración principal
          </Typography>

          {/* Nombre */}
          <FormControl required>
            <FormLabel>Nombre de la campaña</FormLabel>
            <Input
              placeholder="Ej: Promo Verano 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormControl>

          {/* Conexión Meta */}
          <FormControl required>
            <FormLabel>Conexión Meta (Cloud API)</FormLabel>
            {metaConnections.length === 0 ? (
              <Alert color="warning" startDecorator={<WarningIcon />}>
                No hay conexiones Meta configuradas. Configura una conexión Cloud API primero.
              </Alert>
            ) : (
              <Select
                placeholder="Selecciona una conexión Meta"
                value={whatsappId}
                onChange={(_, v) => setWhatsappId(v as number | null)}
              >
                {metaConnections.map((c) => (
                  <Option key={c.id} value={c.id}>
                    {c.name}{' '}
                    <Typography level="body-xs" sx={{ ml: 1, color: 'text.secondary' }}>
                      {c.channel}
                    </Typography>
                  </Option>
                ))}
              </Select>
            )}
          </FormControl>

          {/* Template */}
          <FormControl required>
            <FormLabel>Template Meta (APPROVED)</FormLabel>
            <Select
              placeholder="Selecciona un template aprobado"
              value={templateId}
              onChange={(_, v) => {
                setTemplateId(v as number | null)
                setTemplateParams({})
              }}
            >
              {templates.map((t) => (
                <Option key={t.id} value={t.id}>
                  {t.name}
                  <Typography level="body-xs" sx={{ ml: 1, color: 'text.secondary' }}>
                    {t.category} · {t.language}
                  </Typography>
                </Option>
              ))}
            </Select>
          </FormControl>

          {/* Preview del template */}
          {selectedTemplate?.bodyContent && (
            <Card variant="soft" color="neutral" sx={{ p: 1.5 }}>
              <Typography level="body-xs" sx={{ fontWeight: 700, mb: 0.5 }}>
                Vista previa del cuerpo
              </Typography>
              <Typography level="body-sm" sx={{ whiteSpace: 'pre-wrap' }}>
                {selectedTemplate.bodyContent}
              </Typography>
              {variablesCount > 0 && (
                <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.secondary' }}>
                  {variablesCount} variable{variablesCount > 1 ? 's' : ''} detectada
                  {variablesCount > 1 ? 's' : ''}
                </Typography>
              )}
            </Card>
          )}

          {/* Parámetros del template */}
          {variablesCount > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                Valores de variables
              </Typography>
              {Array.from({ length: variablesCount }, (_, i) => {
                const key = String(i + 1)
                return (
                  <FormControl key={key}>
                    <FormLabel>{`Variable {{${key}}}`}</FormLabel>
                    <Input
                      placeholder={`Valor para {{${key}}}`}
                      value={templateParams[key] ?? ''}
                      onChange={(e) => handleParamChange(key, e.target.value)}
                    />
                  </FormControl>
                )
              })}
            </Box>
          )}

          {/* Fecha programada */}
          <FormControl>
            <FormLabel>Fecha y hora de envío</FormLabel>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </FormControl>

          <Divider />

          {/* === B. DESTINATARIOS === */}
          <Typography level="title-sm" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            Destinatarios
          </Typography>

          <FormControl>
            <FormLabel>Lista de contactos</FormLabel>
            <Select
              placeholder="Selecciona una lista"
              value={contactListId}
              onChange={(_, v) => setContactListId(v as number | null)}
            >
              <Option value={null as unknown as number}>Sin lista</Option>
              {contactLists.map((l) => (
                <Option key={l.id} value={l.id}>
                  {l.name}
                  {l.contactsCount !== undefined && (
                    <Typography level="body-xs" sx={{ ml: 1, color: 'text.secondary' }}>
                      {l.contactsCount} contactos
                    </Typography>
                  )}
                </Option>
              ))}
            </Select>
          </FormControl>

          <Divider />

          {/* === C. OPCIONALES === */}
          <Button
            variant="plain"
            color="neutral"
            size="sm"
            startDecorator={showOptional ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            onClick={() => setShowOptional((v) => !v)}
            sx={{ alignSelf: 'flex-start', px: 0 }}
          >
            Opciones avanzadas
          </Button>

          {showOptional && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControl>
                <FormLabel>Cola de atención</FormLabel>
                <Select
                  placeholder="Sin cola"
                  value={queueId}
                  onChange={(_, v) => setQueueId(v as number | null)}
                >
                  <Option value={null as unknown as number}>Sin cola</Option>
                  {queues.map((q) => (
                    <Option key={q.id} value={q.id}>
                      {q.name}
                    </Option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>Agente asignado</FormLabel>
                <Select
                  placeholder="Sin agente"
                  value={userId}
                  onChange={(_, v) => setUserId(v as number | null)}
                >
                  <Option value={null as unknown as number}>Sin agente</Option>
                  {users.map((u) => (
                    <Option key={u.id} value={u.id}>
                      {u.name}
                    </Option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>Tag Kanban</FormLabel>
                <Select
                  placeholder="Sin tag"
                  value={tagId}
                  onChange={(_, v) => setTagId(v as number | null)}
                >
                  <Option value={null as unknown as number}>Sin tag</Option>
                  {tags.map((t) => (
                    <Option key={t.id} value={t.id}>
                      {t.name}
                    </Option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>Estado del ticket al responder</FormLabel>
                <Select
                  placeholder="Sin cambio de estado"
                  value={statusTicket}
                  onChange={(_, v) => setStatusTicket(v as string | null)}
                >
                  <Option value={null as unknown as string}>Sin cambio</Option>
                  <Option value="open">Abierto</Option>
                  <Option value="pending">Pendiente</Option>
                  <Option value="closed">Cerrado</Option>
                </Select>
              </FormControl>
            </Box>
          )}
        </DialogContent>

        <DialogActions>
          <Button variant="plain" color="neutral" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          {editing ? (
            <Button
              color="primary"
              onClick={() => submit(editing.status)}
              loading={submitting}
            >
              Guardar cambios
            </Button>
          ) : (
            <>
              <Button
                variant="outlined"
                color="neutral"
                onClick={() => submit('INATIVA')}
                loading={submitting}
              >
                Guardar borrador
              </Button>
              <Button
                color="primary"
                startDecorator={<ScheduleIcon />}
                onClick={() => submit('PROGRAMADA')}
                loading={submitting}
              >
                Programar
              </Button>
            </>
          )}
        </DialogActions>
      </ModalDialog>
    </Modal>
  )
}

// ============================================================
// MODAL: REVISAR CAMPAÑA
// ============================================================

interface CampaignReviewModalProps {
  open: boolean
  onClose: () => void
  campaignId: number | null
}

function CampaignReviewModal({ open, onClose, campaignId }: CampaignReviewModalProps) {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !campaignId) return
    setLoading(true)
    setError(null)
    setCampaign(null)

    api
      .get(`/campaigns/${campaignId}`)
      .then((res) => {
        setCampaign(res.data?.record ?? res.data)
      })
      .catch((err: unknown) => {
        setError(extractApiError(err))
      })
      .finally(() => setLoading(false))
  }, [open, campaignId])

  const total = campaign?.totalRecipients ?? 0
  const success = campaign?.successCount ?? 0
  const failed = campaign?.errorCount ?? 0
  const pending = campaign?.pendingCount ?? 0
  const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : '0.0'

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        layout="center"
        sx={{ width: { xs: '95vw', md: 640 }, maxHeight: '90vh', overflow: 'auto' }}
      >
        <ModalClose />
        <DialogTitle>Detalle de campaña</DialogTitle>

        <DialogContent sx={{ pt: 1 }}>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {error && (
            <Alert color="danger" startDecorator={<WarningIcon />}>
              {error}
            </Alert>
          )}

          {campaign && !loading && (
            <Stack spacing={2.5}>
              {/* Configuración */}
              <Box>
                <Typography level="title-sm" sx={{ fontWeight: 700, mb: 1.5 }}>
                  Configuración
                </Typography>
                <Stack spacing={1}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Typography level="body-sm" sx={{ color: 'text.secondary', minWidth: 140 }}>
                      Nombre:
                    </Typography>
                    <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                      {campaign.name}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Typography level="body-sm" sx={{ color: 'text.secondary', minWidth: 140 }}>
                      Estado:
                    </Typography>
                    <Chip size="sm" color={statusColor(campaign.status)}>
                      {statusLabel(campaign.status)}
                    </Chip>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Typography level="body-sm" sx={{ color: 'text.secondary', minWidth: 140 }}>
                      Conexión Meta:
                    </Typography>
                    <Typography level="body-sm">
                      {campaign.whatsapp?.name ?? '—'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Typography level="body-sm" sx={{ color: 'text.secondary', minWidth: 140 }}>
                      Lista de contactos:
                    </Typography>
                    <Typography level="body-sm">
                      {campaign.contactList?.name ?? '—'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Typography level="body-sm" sx={{ color: 'text.secondary', minWidth: 140 }}>
                      Programada para:
                    </Typography>
                    <Typography level="body-sm">{formatDate(campaign.scheduledAt)}</Typography>
                  </Box>
                  {campaign.completedAt && (
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Typography level="body-sm" sx={{ color: 'text.secondary', minWidth: 140 }}>
                        Completada en:
                      </Typography>
                      <Typography level="body-sm">{formatDate(campaign.completedAt)}</Typography>
                    </Box>
                  )}
                </Stack>
              </Box>

              {/* Template */}
              {campaign.whastsAppTemplate && (
                <Box>
                  <Typography level="title-sm" sx={{ fontWeight: 700, mb: 1 }}>
                    Template aplicado
                  </Typography>
                  <Card variant="soft" color="neutral" sx={{ p: 1.5 }}>
                    <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                      <Chip size="sm" color="success">
                        {campaign.whastsAppTemplate.status}
                      </Chip>
                      <Chip size="sm" variant="outlined">
                        {campaign.whastsAppTemplate.category}
                      </Chip>
                      <Chip size="sm" variant="outlined">
                        {campaign.whastsAppTemplate.language}
                      </Chip>
                    </Stack>
                    <Typography level="body-xs" sx={{ fontWeight: 700, mb: 0.5 }}>
                      {campaign.whastsAppTemplate.name}
                    </Typography>
                    {campaign.whastsAppTemplate.bodyContent && (
                      <Typography level="body-sm" sx={{ whiteSpace: 'pre-wrap' }}>
                        {campaign.whastsAppTemplate.bodyContent}
                      </Typography>
                    )}
                  </Card>
                </Box>
              )}

              {/* Parámetros */}
              {campaign.templateParams &&
                Object.keys(campaign.templateParams).length > 0 && (
                  <Box>
                    <Typography level="title-sm" sx={{ fontWeight: 700, mb: 1 }}>
                      Parámetros del template
                    </Typography>
                    <Sheet
                      variant="outlined"
                      sx={{ borderRadius: 'sm', overflow: 'hidden' }}
                    >
                      <Table size="sm">
                        <thead>
                          <tr>
                            <th style={{ width: 120 }}>Variable</th>
                            <th>Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(campaign.templateParams).map(([k, v]) => (
                            <tr key={k}>
                              <td>
                                <Typography level="body-xs" sx={{ fontFamily: 'monospace' }}>
                                  {`{{${k}}}`}
                                </Typography>
                              </td>
                              <td>
                                <Typography level="body-sm">{v}</Typography>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </Sheet>
                  </Box>
                )}

              <Divider />

              {/* Métricas */}
              <Box>
                <Typography level="title-sm" sx={{ fontWeight: 700, mb: 1.5 }}>
                  Métricas de envío
                </Typography>

                <Grid container spacing={1.5} sx={{ mb: 2 }}>
                  <Grid xs={6} sm={3}>
                    <Card variant="soft" sx={{ textAlign: 'center', p: 1.5 }}>
                      <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                        Total
                      </Typography>
                      <Typography level="h4">{total}</Typography>
                    </Card>
                  </Grid>
                  <Grid xs={6} sm={3}>
                    <Card variant="soft" color="success" sx={{ textAlign: 'center', p: 1.5 }}>
                      <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                        Enviados
                      </Typography>
                      <Typography level="h4" sx={{ color: 'success.600' }}>
                        {success}
                      </Typography>
                    </Card>
                  </Grid>
                  <Grid xs={6} sm={3}>
                    <Card variant="soft" color="danger" sx={{ textAlign: 'center', p: 1.5 }}>
                      <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                        Fallidos
                      </Typography>
                      <Typography level="h4" sx={{ color: 'danger.600' }}>
                        {failed}
                      </Typography>
                    </Card>
                  </Grid>
                  <Grid xs={6} sm={3}>
                    <Card variant="soft" color="warning" sx={{ textAlign: 'center', p: 1.5 }}>
                      <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                        Pendientes
                      </Typography>
                      <Typography level="h4" sx={{ color: 'warning.600' }}>
                        {pending}
                      </Typography>
                    </Card>
                  </Grid>
                </Grid>

                {/* Tasa de éxito */}
                <Box sx={{ mb: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                    <Typography level="body-sm">Tasa de éxito</Typography>
                    <Typography level="body-sm" sx={{ fontWeight: 700 }}>
                      {successRate}%
                    </Typography>
                  </Stack>
                  <LinearProgress
                    determinate
                    value={total > 0 ? (success / total) * 100 : 0}
                    color="success"
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                </Box>

                {/* Costo Meta */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                    Costo Meta:
                  </Typography>
                  {campaign.metaCost !== null && campaign.metaCost !== undefined ? (
                    <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                      ${campaign.metaCost.toFixed(4)} USD
                    </Typography>
                  ) : (
                    <Tooltip
                      title="La integración con Meta Billing aún no está configurada"
                      placement="top"
                    >
                      <Typography
                        level="body-sm"
                        sx={{ color: 'text.tertiary', cursor: 'help', display: 'flex', alignItems: 'center', gap: 0.5 }}
                      >
                        No disponible <InfoIcon sx={{ fontSize: 14 }} />
                      </Typography>
                    </Tooltip>
                  )}
                </Box>
              </Box>
            </Stack>
          )}
        </DialogContent>

        <DialogActions>
          <Button variant="plain" color="neutral" onClick={onClose}>
            Cerrar
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  )
}

// ============================================================
// MODAL: CONFIRMACIÓN DESTRUCTIVA
// ============================================================

interface ConfirmModalProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  confirmColor?: 'danger' | 'warning' | 'neutral'
  onConfirm: () => void
  onClose: () => void
}

function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  confirmColor = 'danger',
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog variant="outlined" role="alertdialog" sx={{ maxWidth: 420 }}>
        <DialogTitle>
          <WarningIcon sx={{ color: `${confirmColor}.500` }} />
          {title}
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Typography level="body-md">{description}</Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="plain" color="neutral" onClick={onClose}>
            Cancelar
          </Button>
          <Button color={confirmColor} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  )
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function Campaigns() {
  const { user } = useAuth()

  // Datos
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [whatsappConnections, setWhatsappConnections] = useState<WhatsAppConnection[]>([])
  const [contactLists, setContactLists] = useState<ContactList[]>([])
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [queues, setQueues] = useState<Queue[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [tags, setTags] = useState<Tag[]>([])

  // UI
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Modales
  const [formOpen, setFormOpen] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)
  const [reviewId, setReviewId] = useState<number | null>(null)
  const [confirmAction, setConfirmAction] = useState<{
    title: string
    description: string
    label: string
    color: 'danger' | 'warning' | 'neutral'
    action: () => Promise<void>
  } | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [campaignsRes, whatsappRes, listsRes, templatesRes, queuesRes, usersRes, tagsRes] =
        await Promise.all([
          api.get('/campaigns'),
          api.get('/whatsapp'),
          api.get('/contact-lists'),
          api.get('/whatsapp-templates?status=APPROVED'),
          api.get('/queues').catch(() => ({ data: [] })),
          api.get('/users').catch(() => ({ data: { users: [] } })),
          api.get('/tags').catch(() => ({ data: [] })),
        ])

      // Campañas
      const rawCampaigns = campaignsRes.data
      const campaignList: Campaign[] = Array.isArray(rawCampaigns)
        ? rawCampaigns
        : Array.isArray(rawCampaigns?.records)
        ? rawCampaigns.records
        : Array.isArray(rawCampaigns?.data)
        ? rawCampaigns.data
        : []
      setCampaigns(campaignList)

      // Conexiones WhatsApp
      const rawWa = whatsappRes.data
      const waList: WhatsAppConnection[] = Array.isArray(rawWa)
        ? rawWa
        : Array.isArray(rawWa?.whatsapps)
        ? rawWa.whatsapps
        : []
      setWhatsappConnections(waList)

      // Listas de contactos
      const rawLists = listsRes.data
      const listsList: ContactList[] = Array.isArray(rawLists)
        ? rawLists
        : Array.isArray(rawLists?.contactLists)
        ? rawLists.contactLists
        : Array.isArray(rawLists?.records)
        ? rawLists.records
        : []
      setContactLists(listsList)

      // Templates
      const rawTemplates = templatesRes.data
      const templateList: WhatsAppTemplate[] = Array.isArray(rawTemplates)
        ? rawTemplates
        : Array.isArray(rawTemplates?.templates)
        ? rawTemplates.templates
        : Array.isArray(rawTemplates?.records)
        ? rawTemplates.records
        : []
      setTemplates(templateList)

      // Queues
      const rawQueues = queuesRes.data
      const queueList: Queue[] = Array.isArray(rawQueues)
        ? rawQueues
        : Array.isArray(rawQueues?.queues)
        ? rawQueues.queues
        : []
      setQueues(queueList)

      // Users
      const rawUsers = usersRes.data
      const userList: AppUser[] = Array.isArray(rawUsers)
        ? rawUsers
        : Array.isArray(rawUsers?.users)
        ? rawUsers.users
        : []
      setUsers(userList)

      // Tags
      const rawTags = tagsRes.data
      const tagList: Tag[] = Array.isArray(rawTags)
        ? rawTags
        : Array.isArray(rawTags?.tags)
        ? rawTags.tags
        : []
      setTags(tagList)
    } catch (err: unknown) {
      setLoadError(extractApiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Socket.IO — refrescar en eventos de campaña
  useEffect(() => {
    if (!user?.companyId) return

    const handleCampaignEvent = (data: { action?: string; record?: Campaign }) => {
      const action = data?.action
      const record = data?.record
      if (!action || !record) return

      setCampaigns((prev) => {
        if (action === 'create') {
          return [record, ...prev]
        }
        if (action === 'update') {
          return prev.map((c) => (c.id === record.id ? { ...c, ...record } : c))
        }
        if (action === 'delete') {
          return prev.filter((c) => c.id !== record.id)
        }
        return prev
      })
    }

    const eventName = `company-${user.companyId}-campaign`
    socketService.on(eventName, handleCampaignEvent)

    return () => {
      socketService.off(eventName, handleCampaignEvent)
    }
  }, [user?.companyId])

  // Acciones
  const handleDeleteCampaign = async (id: number) => {
    await api.delete(`/campaigns/${id}`)
    setCampaigns((prev) => prev.filter((c) => c.id !== id))
    toast.success('Campaña eliminada.')
  }

  const handleCancelCampaign = async (id: number) => {
    await api.post(`/campaigns/${id}/cancel`)
    setCampaigns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'CANCELADA' as CampaignStatus } : c))
    )
    toast.success('Campaña cancelada.')
  }

  const handleRestartCampaign = async (id: number) => {
    await api.post(`/campaigns/${id}/restart`)
    toast.success('Campaña reiniciada.')
    loadData()
  }

  const triggerConfirm = (
    title: string,
    description: string,
    label: string,
    color: 'danger' | 'warning' | 'neutral',
    action: () => Promise<void>
  ) => {
    setConfirmAction({ title, description, label, color, action })
  }

  const executeConfirm = async () => {
    if (!confirmAction) return
    try {
      await confirmAction.action()
    } catch (err: unknown) {
      toast.error(extractApiError(err))
    } finally {
      setConfirmAction(null)
    }
  }

  // Filtros
  const filtered = campaigns.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchStatus = statusFilter === 'all' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  // Stats
  const stats = {
    total: campaigns.length,
    programada: campaigns.filter((c) => c.status === 'PROGRAMADA').length,
    enAndamento: campaigns.filter((c) => c.status === 'EM_ANDAMENTO').length,
    finalizada: campaigns.filter((c) => c.status === 'FINALIZADA').length,
    cancelada: campaigns.filter((c) => c.status === 'CANCELADA').length,
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {/* ========== HEADER ========== */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CampaignIcon sx={{ fontSize: 32, color: '#3b82f6' }} />
          <Box>
            <Typography level="h3" sx={{ fontWeight: 700 }}>
              Campañas WhatsApp
            </Typography>
            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
              Campañas masivas vía Meta Cloud API con templates aprobados
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Recargar datos" placement="top">
            <IconButton variant="outlined" color="neutral" onClick={loadData} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            startDecorator={<AddIcon />}
            color="primary"
            onClick={() => {
              setEditingCampaign(null)
              setFormOpen(true)
            }}
          >
            Nueva campaña
          </Button>
        </Stack>
      </Stack>

      {/* ========== STATS CARDS ========== */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total', value: stats.total, color: undefined },
          { label: 'Programadas', value: stats.programada, color: '#3b82f6' },
          { label: 'En ejecución', value: stats.enAndamento, color: '#f3a43b' },
          { label: 'Finalizadas', value: stats.finalizada, color: '#52b788' },
          { label: 'Canceladas', value: stats.cancelada, color: '#ef4444' },
        ].map((s) => (
          <Grid key={s.label} xs={6} sm={4} md={2.4}>
            <Card variant="outlined" sx={{ textAlign: 'center', py: 2 }}>
              <Typography level="body-sm" sx={{ color: 'text.secondary', mb: 0.5 }}>
                {s.label}
              </Typography>
              <Typography
                level="h3"
                sx={{ fontWeight: 700, color: s.color ?? 'text.primary' }}
              >
                {s.value}
              </Typography>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* ========== FILTROS ========== */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Input
              placeholder="Buscar por nombre..."
              startDecorator={<SearchIcon />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ flexGrow: 1 }}
            />
            <Select
              value={statusFilter}
              onChange={(_, v) => setStatusFilter(v as string)}
              sx={{ minWidth: 200 }}
            >
              <Option value="all">Todos los estados</Option>
              <Option value="INATIVA">Borrador</Option>
              <Option value="PROGRAMADA">Programadas</Option>
              <Option value="EM_ANDAMENTO">En ejecución</Option>
              <Option value="FINALIZADA">Finalizadas</Option>
              <Option value="CANCELADA">Canceladas</Option>
            </Select>
          </Stack>
        </CardContent>
      </Card>

      {/* ========== ESTADO: LOADING ========== */}
      {loading && <LinearProgress sx={{ mb: 2, borderRadius: 4 }} />}

      {/* ========== ESTADO: ERROR ========== */}
      {!loading && loadError && (
        <Alert color="danger" startDecorator={<WarningIcon />} sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}

      {/* ========== ESTADO: VACÍO ========== */}
      {!loading && !loadError && filtered.length === 0 && (
        <Card variant="soft" sx={{ textAlign: 'center', py: 6 }}>
          <MessageIcon sx={{ fontSize: 48, color: 'text.tertiary', mb: 1.5 }} />
          <Typography level="title-md" sx={{ color: 'text.secondary' }}>
            {campaigns.length === 0
              ? 'No hay campañas todavía'
              : 'No hay campañas que coincidan con el filtro'}
          </Typography>
          {campaigns.length === 0 && (
            <Button
              sx={{ mt: 2 }}
              startDecorator={<AddIcon />}
              onClick={() => {
                setEditingCampaign(null)
                setFormOpen(true)
              }}
            >
              Crear primera campaña
            </Button>
          )}
        </Card>
      )}

      {/* ========== TABLA ========== */}
      {!loading && !loadError && filtered.length > 0 && (
        <Sheet variant="outlined" sx={{ borderRadius: 'sm', overflow: 'auto' }}>
          <Table
            size="sm"
            stickyHeader
            hoverRow
            sx={{ '& thead th': { fontWeight: 700, fontSize: '0.75rem' } }}
          >
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Nombre</th>
                <th style={{ minWidth: 160 }}>Conexión Meta</th>
                <th style={{ minWidth: 180 }}>Template</th>
                <th style={{ minWidth: 140 }}>Lista</th>
                <th style={{ minWidth: 150 }}>Programada</th>
                <th style={{ minWidth: 120 }}>Estado</th>
                <th style={{ minWidth: 140, textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isLegacy = c.useTemplate === false
                return (
                  <tr key={c.id}>
                    {/* Nombre */}
                    <td>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                          {c.name}
                        </Typography>
                        {isLegacy && (
                          <Chip size="sm" color="neutral" variant="outlined">
                            Legacy
                          </Chip>
                        )}
                      </Stack>
                    </td>

                    {/* Conexión */}
                    <td>
                      {c.whatsapp ? (
                        <Stack spacing={0.5}>
                          <Typography level="body-sm">{c.whatsapp.name}</Typography>
                          <Chip
                            size="sm"
                            color={channelColor(c.whatsapp.channel)}
                            variant="soft"
                          >
                            {channelLabel(c.whatsapp.channel)}
                          </Chip>
                        </Stack>
                      ) : (
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          —
                        </Typography>
                      )}
                    </td>

                    {/* Template */}
                    <td>
                      {c.whastsAppTemplate ? (
                        <Stack spacing={0.5}>
                          <Typography level="body-sm">{c.whastsAppTemplate.name}</Typography>
                          <Chip size="sm" color="success" variant="soft">
                            {c.whastsAppTemplate.status}
                          </Chip>
                        </Stack>
                      ) : (
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          —
                        </Typography>
                      )}
                    </td>

                    {/* Lista */}
                    <td>
                      <Typography level="body-sm">
                        {c.contactList?.name ?? '—'}
                      </Typography>
                    </td>

                    {/* Programada */}
                    <td>
                      <Typography level="body-sm">{formatDate(c.scheduledAt)}</Typography>
                    </td>

                    {/* Estado */}
                    <td>
                      <Chip size="sm" color={statusColor(c.status)} variant="soft">
                        {statusLabel(c.status)}
                      </Chip>
                    </td>

                    {/* Acciones */}
                    <td>
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        {/* Revisar — siempre visible */}
                        <Tooltip title="Revisar campaña" placement="top">
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="neutral"
                            onClick={() => setReviewId(c.id)}
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>

                        {/* Editar — INATIVA, PROGRAMADA, y no legacy */}
                        {(c.status === 'INATIVA' || c.status === 'PROGRAMADA') && (
                          <Tooltip
                            title={isLegacy ? 'Campaña legacy no editable en este flujo' : 'Editar'}
                            placement="top"
                          >
                            <span>
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="primary"
                                disabled={isLegacy}
                                onClick={() => {
                                  setEditingCampaign(c)
                                  setFormOpen(true)
                                }}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}

                        {/* Cancelar — PROGRAMADA, EM_ANDAMENTO */}
                        {(c.status === 'PROGRAMADA' || c.status === 'EM_ANDAMENTO') && (
                          <Tooltip title="Cancelar campaña" placement="top">
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="warning"
                              onClick={() =>
                                triggerConfirm(
                                  'Cancelar campaña',
                                  `¿Estás seguro de cancelar "${c.name}"? Esta acción no se puede deshacer.`,
                                  'Cancelar campaña',
                                  'warning',
                                  () => handleCancelCampaign(c.id)
                                )
                              }
                            >
                              <CancelIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}

                        {/* Reiniciar — CANCELADA, FINALIZADA */}
                        {(c.status === 'CANCELADA' || c.status === 'FINALIZADA') && (
                          <Tooltip title="Reiniciar campaña" placement="top">
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="success"
                              onClick={() =>
                                triggerConfirm(
                                  'Reiniciar campaña',
                                  `¿Deseas reiniciar "${c.name}"? Se creará una nueva campaña basada en esta.`,
                                  'Reiniciar',
                                  'neutral',
                                  () => handleRestartCampaign(c.id)
                                )
                              }
                            >
                              <ReplayIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}

                        {/* Eliminar — INATIVA, PROGRAMADA, CANCELADA, FINALIZADA */}
                        {c.status !== 'EM_ANDAMENTO' && (
                          <Tooltip title="Eliminar campaña" placement="top">
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="danger"
                              onClick={() =>
                                triggerConfirm(
                                  'Eliminar campaña',
                                  `¿Estás seguro de eliminar "${c.name}" permanentemente?`,
                                  'Eliminar',
                                  'danger',
                                  () => handleDeleteCampaign(c.id)
                                )
                              }
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </Sheet>
      )}

      {/* ========== MODALES ========== */}

      <CampaignFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editingCampaign}
        whatsappConnections={whatsappConnections}
        contactLists={contactLists}
        templates={templates}
        queues={queues}
        users={users}
        tags={tags}
        onSaved={loadData}
      />

      <CampaignReviewModal
        open={reviewId !== null}
        onClose={() => setReviewId(null)}
        campaignId={reviewId}
      />

      <ConfirmModal
        open={confirmAction !== null}
        title={confirmAction?.title ?? ''}
        description={confirmAction?.description ?? ''}
        confirmLabel={confirmAction?.label ?? ''}
        confirmColor={confirmAction?.color ?? 'danger'}
        onConfirm={executeConfirm}
        onClose={() => setConfirmAction(null)}
      />
    </Box>
  )
}
