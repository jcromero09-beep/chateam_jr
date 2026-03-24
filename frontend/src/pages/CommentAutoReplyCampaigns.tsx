/**
 * CommentAutoReplyCampaigns — Gestión de campañas de auto-respuesta de comentarios
 * Ruta: /comment-autoreply/campaigns
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Stack,
  Card,
  CardContent,
  Button,
  Chip,
  Alert,
  CircularProgress,
  Sheet,
  Table,
  Input,
  Select,
  Option,
  IconButton,
  Modal,
  ModalDialog,
  ModalClose,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Textarea,
  Switch,
  Divider,
  FormControl,
  FormLabel,
} from '@mui/joy'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Visibility as VisibilityIcon,
  Facebook as FacebookIcon,
  Instagram as InstagramIcon,
  SmartToy as SmartToyIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

const devLog = (...args: unknown[]) => { if (import.meta.env.DEV) console.log(...args) }
const devError = (...args: unknown[]) => { if (import.meta.env.DEV) console.error(...args) }

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = 'facebook' | 'instagram'
type CampaignType = 'post' | 'page'
type ReplyMode = 'keyword' | 'ai' | 'generic'
type CampaignStatus = 'active' | 'paused' | 'draft'
type MatchingType = 'exact' | 'contains'
type OffensiveAction = 'hide' | 'delete' | 'block'

interface KeywordRule {
  keywords: string
  publicReply: string
  privateReply: string
}

interface Campaign {
  id: number
  name: string
  platform: Platform
  campaignType: CampaignType
  replyMode: ReplyMode
  status: CampaignStatus
  pageId: string
  postId?: string
  totalReplies: number
  lastReplyAt?: string
  // Reply config
  keywordRules?: KeywordRule[]
  defaultPublicReply?: string
  defaultPrivateReply?: string
  aiTrainingData?: string
  aiAgentIdentityId?: number
  // Options
  autoLikeComment?: boolean
  hideCommentAfterReply?: boolean
  sendPrivateReply?: boolean
  sendPublicReply?: boolean
  multipleReply?: boolean
  delayEnabled?: boolean
  delayMinSeconds?: number
  delayMaxSeconds?: number
  triggerMatchingType?: MatchingType
  // Moderation
  offensiveWordsEnabled?: boolean
  offensiveWords?: string
  offensiveAction?: OffensiveAction
  offensivePrivateMessage?: string
}

type CampaignFormData = Omit<Campaign, 'id' | 'totalReplies' | 'lastReplyAt'>

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusColor = (s: CampaignStatus): 'success' | 'warning' | 'neutral' => {
  if (s === 'active') return 'success'
  if (s === 'paused') return 'warning'
  return 'neutral'
}

const statusLabel: Record<CampaignStatus, string> = {
  active: 'Activa',
  paused: 'Pausada',
  draft: 'Borrador',
}

const modeColor = (m: ReplyMode): 'primary' | 'success' | 'neutral' => {
  if (m === 'keyword') return 'primary'
  if (m === 'ai') return 'success'
  return 'neutral'
}

const modeLabel: Record<ReplyMode, string> = {
  keyword: 'Keywords',
  ai: 'IA',
  generic: 'Genérico',
}

const typeLabel: Record<CampaignType, string> = {
  post: 'Post',
  page: 'Página',
}

const formatDate = (iso?: string) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

const EMPTY_FORM: CampaignFormData = {
  name: '',
  platform: 'facebook',
  campaignType: 'post',
  replyMode: 'keyword',
  status: 'draft',
  pageId: '',
  postId: '',
  keywordRules: [{ keywords: '', publicReply: '', privateReply: '' }],
  defaultPublicReply: '',
  defaultPrivateReply: '',
  aiTrainingData: '',
  aiAgentIdentityId: undefined,
  autoLikeComment: false,
  hideCommentAfterReply: false,
  sendPrivateReply: true,
  sendPublicReply: true,
  multipleReply: false,
  delayEnabled: false,
  delayMinSeconds: 5,
  delayMaxSeconds: 30,
  triggerMatchingType: 'contains',
  offensiveWordsEnabled: false,
  offensiveWords: '',
  offensiveAction: 'hide',
  offensivePrivateMessage: '',
}

// ─── Modal de Campaña ─────────────────────────────────────────────────────────

interface CampaignModalProps {
  open: boolean
  campaign: Campaign | null
  onClose: () => void
  onSaved: () => void
}

function CampaignModal({ open, campaign, onClose, onSaved }: CampaignModalProps) {
  const [tab, setTab] = useState<number>(0)
  const [form, setForm] = useState<CampaignFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTab(0)
      setSaveError(null)
      if (campaign) {
        setForm({
          name: campaign.name,
          platform: campaign.platform,
          campaignType: campaign.campaignType,
          replyMode: campaign.replyMode,
          status: campaign.status,
          pageId: campaign.pageId,
          postId: campaign.postId ?? '',
          keywordRules: campaign.keywordRules ?? [{ keywords: '', publicReply: '', privateReply: '' }],
          defaultPublicReply: campaign.defaultPublicReply ?? '',
          defaultPrivateReply: campaign.defaultPrivateReply ?? '',
          aiTrainingData: campaign.aiTrainingData ?? '',
          aiAgentIdentityId: campaign.aiAgentIdentityId,
          autoLikeComment: campaign.autoLikeComment ?? false,
          hideCommentAfterReply: campaign.hideCommentAfterReply ?? false,
          sendPrivateReply: campaign.sendPrivateReply ?? true,
          sendPublicReply: campaign.sendPublicReply ?? true,
          multipleReply: campaign.multipleReply ?? false,
          delayEnabled: campaign.delayEnabled ?? false,
          delayMinSeconds: campaign.delayMinSeconds ?? 5,
          delayMaxSeconds: campaign.delayMaxSeconds ?? 30,
          triggerMatchingType: campaign.triggerMatchingType ?? 'contains',
          offensiveWordsEnabled: campaign.offensiveWordsEnabled ?? false,
          offensiveWords: campaign.offensiveWords ?? '',
          offensiveAction: campaign.offensiveAction ?? 'hide',
          offensivePrivateMessage: campaign.offensivePrivateMessage ?? '',
        })
      } else {
        setForm(EMPTY_FORM)
      }
    }
  }, [open, campaign])

  const updateForm = <K extends keyof CampaignFormData>(key: K, value: CampaignFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const addKeywordRule = () => {
    setForm(prev => ({
      ...prev,
      keywordRules: [...(prev.keywordRules ?? []), { keywords: '', publicReply: '', privateReply: '' }],
    }))
  }

  const updateRule = (idx: number, field: keyof KeywordRule, value: string) => {
    setForm(prev => {
      const rules = [...(prev.keywordRules ?? [])]
      rules[idx] = { ...rules[idx], [field]: value }
      return { ...prev, keywordRules: rules }
    })
  }

  const removeRule = (idx: number) => {
    setForm(prev => ({
      ...prev,
      keywordRules: (prev.keywordRules ?? []).filter((_, i) => i !== idx),
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      if (campaign) {
        await api.put(`/comment-autoreply/campaigns/${campaign.id}`, form)
        devLog('[CampaignModal] updated', campaign.id)
      } else {
        await api.post('/comment-autoreply/campaigns', form)
        devLog('[CampaignModal] created')
      }
      onSaved()
      onClose()
    } catch (err: unknown) {
      devError('[CampaignModal] save error', err)
      setSaveError(err instanceof Error ? err.message : 'Error al guardar la campaña')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        layout="center"
        sx={{
          width: { xs: '95vw', md: 760 },
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          p: 0,
        }}
      >
        {/* Header */}
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography level="title-md" fontWeight={700}>
              {campaign ? 'Editar Campaña' : 'Nueva Campaña'}
            </Typography>
            <ModalClose />
          </Stack>
        </Box>

        {/* Tabs */}
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v as number)}
          sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          <TabList sx={{ px: 3, pt: 1 }}>
            <Tab>Básico</Tab>
            <Tab>Respuestas</Tab>
            <Tab>Opciones</Tab>
            <Tab>Moderación</Tab>
          </TabList>

          <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2 }}>
            {/* ── Tab 1: Básico ── */}
            <TabPanel value={0} sx={{ p: 0 }}>
              <Stack gap={2}>
                <FormControl required>
                  <FormLabel>Nombre de la Campaña</FormLabel>
                  <Input
                    placeholder="Ej. Campaña Lanzamiento Verano"
                    value={form.name}
                    onChange={e => updateForm('name', e.target.value)}
                  />
                </FormControl>
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
                  <FormControl sx={{ flex: 1 }}>
                    <FormLabel>Plataforma</FormLabel>
                    <Select
                      value={form.platform}
                      onChange={(_, v) => v && updateForm('platform', v as Platform)}
                    >
                      <Option value="facebook">Facebook</Option>
                      <Option value="instagram">Instagram</Option>
                    </Select>
                  </FormControl>
                  <FormControl sx={{ flex: 1 }}>
                    <FormLabel>Tipo de Campaña</FormLabel>
                    <Select
                      value={form.campaignType}
                      onChange={(_, v) => v && updateForm('campaignType', v as CampaignType)}
                    >
                      <Option value="post">Por Post</Option>
                      <Option value="page">Por Página Completa</Option>
                    </Select>
                  </FormControl>
                </Stack>
                <FormControl required>
                  <FormLabel>ID de Página</FormLabel>
                  <Input
                    placeholder="Ej. 123456789"
                    value={form.pageId}
                    onChange={e => updateForm('pageId', e.target.value)}
                  />
                </FormControl>
                {form.campaignType === 'post' && (
                  <FormControl>
                    <FormLabel>ID del Post</FormLabel>
                    <Input
                      placeholder="Ej. 123456789_987654321"
                      value={form.postId ?? ''}
                      onChange={e => updateForm('postId', e.target.value)}
                    />
                  </FormControl>
                )}
                <FormControl>
                  <FormLabel>Estado Inicial</FormLabel>
                  <Select
                    value={form.status}
                    onChange={(_, v) => v && updateForm('status', v as CampaignStatus)}
                  >
                    <Option value="draft">Borrador</Option>
                    <Option value="active">Activa</Option>
                    <Option value="paused">Pausada</Option>
                  </Select>
                </FormControl>
              </Stack>
            </TabPanel>

            {/* ── Tab 2: Respuestas ── */}
            <TabPanel value={1} sx={{ p: 0 }}>
              <Stack gap={2}>
                <FormControl>
                  <FormLabel>Modo de Respuesta</FormLabel>
                  <Select
                    value={form.replyMode}
                    onChange={(_, v) => v && updateForm('replyMode', v as ReplyMode)}
                  >
                    <Option value="keyword">Por Keywords</Option>
                    <Option value="ai">Inteligencia Artificial</Option>
                    <Option value="generic">Respuesta Genérica</Option>
                  </Select>
                </FormControl>

                {form.replyMode === 'keyword' && (
                  <Box>
                    <Typography level="title-sm" sx={{ mb: 1.5 }}>
                      Reglas de Keywords
                    </Typography>
                    <Stack gap={2}>
                      {(form.keywordRules ?? []).map((rule, idx) => (
                        <Sheet
                          key={idx}
                          variant="outlined"
                          sx={{ p: 2, borderRadius: 'sm', position: 'relative' }}
                        >
                          <Stack gap={1.5}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between">
                              <Typography level="body-xs" fontWeight={600} sx={{ color: '#3b82f6' }}>
                                Regla #{idx + 1}
                              </Typography>
                              {(form.keywordRules ?? []).length > 1 && (
                                <IconButton
                                  size="sm"
                                  variant="plain"
                                  color="danger"
                                  onClick={() => removeRule(idx)}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              )}
                            </Stack>
                            <FormControl>
                              <FormLabel>Keywords (separadas por coma)</FormLabel>
                              <Input
                                placeholder="precio, costo, cuánto cuesta"
                                value={rule.keywords}
                                onChange={e => updateRule(idx, 'keywords', e.target.value)}
                              />
                            </FormControl>
                            <FormControl>
                              <FormLabel>Respuesta Pública</FormLabel>
                              <Textarea
                                minRows={2}
                                placeholder="¡Hola! Te enviamos los precios por mensaje privado."
                                value={rule.publicReply}
                                onChange={e => updateRule(idx, 'publicReply', e.target.value)}
                              />
                            </FormControl>
                            <FormControl>
                              <FormLabel>Respuesta Privada (DM)</FormLabel>
                              <Textarea
                                minRows={2}
                                placeholder="Hola {nombre}, nuestros precios son..."
                                value={rule.privateReply}
                                onChange={e => updateRule(idx, 'privateReply', e.target.value)}
                              />
                            </FormControl>
                          </Stack>
                        </Sheet>
                      ))}
                      <Button
                        variant="outlined"
                        color="neutral"
                        size="sm"
                        startDecorator={<AddIcon />}
                        onClick={addKeywordRule}
                      >
                        Agregar Regla
                      </Button>
                    </Stack>
                    <Divider sx={{ my: 2 }} />
                    <Typography level="title-sm" sx={{ mb: 1.5 }}>
                      Respuesta por Defecto (sin keyword match)
                    </Typography>
                    <Stack gap={1.5}>
                      <FormControl>
                        <FormLabel>Respuesta Pública por Defecto</FormLabel>
                        <Textarea
                          minRows={2}
                          placeholder="¡Gracias por tu comentario!"
                          value={form.defaultPublicReply ?? ''}
                          onChange={e => updateForm('defaultPublicReply', e.target.value)}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>Respuesta Privada por Defecto</FormLabel>
                        <Textarea
                          minRows={2}
                          placeholder="Hola, gracias por escribirnos. ¿En qué te podemos ayudar?"
                          value={form.defaultPrivateReply ?? ''}
                          onChange={e => updateForm('defaultPrivateReply', e.target.value)}
                        />
                      </FormControl>
                    </Stack>
                  </Box>
                )}

                {form.replyMode === 'ai' && (
                  <Stack gap={2}>
                    <FormControl>
                      <FormLabel>Datos de Entrenamiento / Contexto IA</FormLabel>
                      <Textarea
                        minRows={5}
                        placeholder="Describe el contexto del negocio, productos, precios, políticas, tono de respuesta, etc."
                        value={form.aiTrainingData ?? ''}
                        onChange={e => updateForm('aiTrainingData', e.target.value)}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>ID del Agente IA (AIAgentIdentity)</FormLabel>
                      <Input
                        type="number"
                        placeholder="Ej. 12"
                        value={form.aiAgentIdentityId ?? ''}
                        onChange={e => updateForm('aiAgentIdentityId', e.target.value ? Number(e.target.value) : undefined)}
                      />
                    </FormControl>
                  </Stack>
                )}

                {form.replyMode === 'generic' && (
                  <Stack gap={1.5}>
                    <FormControl>
                      <FormLabel>Respuesta Pública Genérica</FormLabel>
                      <Textarea
                        minRows={3}
                        placeholder="¡Gracias por comentar! Te contactamos pronto."
                        value={form.defaultPublicReply ?? ''}
                        onChange={e => updateForm('defaultPublicReply', e.target.value)}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Respuesta Privada Genérica</FormLabel>
                      <Textarea
                        minRows={3}
                        placeholder="Hola {nombre}, gracias por tu comentario. ¿Cómo podemos ayudarte?"
                        value={form.defaultPrivateReply ?? ''}
                        onChange={e => updateForm('defaultPrivateReply', e.target.value)}
                      />
                    </FormControl>
                  </Stack>
                )}
              </Stack>
            </TabPanel>

            {/* ── Tab 3: Opciones ── */}
            <TabPanel value={2} sx={{ p: 0 }}>
              <Stack gap={0}>
                {(
                  [
                    { key: 'sendPublicReply', label: 'Enviar Respuesta Pública', desc: 'Responder al comentario públicamente' },
                    { key: 'sendPrivateReply', label: 'Enviar Respuesta Privada (DM)', desc: 'Enviar mensaje privado al comentarista' },
                    { key: 'autoLikeComment', label: 'Dar Like al Comentario', desc: 'Dar like automáticamente al comentario recibido' },
                    { key: 'hideCommentAfterReply', label: 'Ocultar Comentario Tras Responder', desc: 'Ocultar el comentario después de procesarlo' },
                    { key: 'multipleReply', label: 'Permitir Múltiples Respuestas', desc: 'Responder al mismo usuario más de una vez' },
                    { key: 'delayEnabled', label: 'Activar Delay de Respuesta', desc: 'Esperar un tiempo aleatorio antes de responder' },
                  ] as Array<{ key: keyof CampaignFormData; label: string; desc: string }>
                ).map(({ key, label, desc }) => (
                  <Box key={key} sx={{ py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Box>
                        <Typography level="body-sm" fontWeight={600}>{label}</Typography>
                        <Typography level="body-xs" sx={{ color: 'text.secondary' }}>{desc}</Typography>
                      </Box>
                      <Switch
                        checked={Boolean(form[key])}
                        onChange={e => updateForm(key, e.target.checked as CampaignFormData[typeof key])}
                      />
                    </Stack>
                  </Box>
                ))}

                {form.delayEnabled && (
                  <Box sx={{ pt: 2 }}>
                    <Stack direction="row" gap={2}>
                      <FormControl sx={{ flex: 1 }}>
                        <FormLabel>Delay Mínimo (segundos)</FormLabel>
                        <Input
                          type="number"
                          value={form.delayMinSeconds ?? 5}
                          onChange={e => updateForm('delayMinSeconds', Number(e.target.value))}
                          slotProps={{ input: { min: 1, max: 300 } }}
                        />
                      </FormControl>
                      <FormControl sx={{ flex: 1 }}>
                        <FormLabel>Delay Máximo (segundos)</FormLabel>
                        <Input
                          type="number"
                          value={form.delayMaxSeconds ?? 30}
                          onChange={e => updateForm('delayMaxSeconds', Number(e.target.value))}
                          slotProps={{ input: { min: 1, max: 600 } }}
                        />
                      </FormControl>
                    </Stack>
                  </Box>
                )}

                <Box sx={{ pt: 2 }}>
                  <FormControl>
                    <FormLabel>Tipo de Coincidencia de Keywords</FormLabel>
                    <Select
                      value={form.triggerMatchingType ?? 'contains'}
                      onChange={(_, v) => v && updateForm('triggerMatchingType', v as MatchingType)}
                    >
                      <Option value="contains">Contiene (parcial)</Option>
                      <Option value="exact">Exacto</Option>
                    </Select>
                  </FormControl>
                </Box>
              </Stack>
            </TabPanel>

            {/* ── Tab 4: Moderación ── */}
            <TabPanel value={3} sx={{ p: 0 }}>
              <Stack gap={2}>
                <Box sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography level="body-sm" fontWeight={600}>Activar Filtro de Palabras Ofensivas</Typography>
                      <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                        Detectar y actuar sobre comentarios con lenguaje inapropiado
                      </Typography>
                    </Box>
                    <Switch
                      checked={form.offensiveWordsEnabled ?? false}
                      onChange={e => updateForm('offensiveWordsEnabled', e.target.checked)}
                    />
                  </Stack>
                </Box>

                {form.offensiveWordsEnabled && (
                  <>
                    <FormControl>
                      <FormLabel>Palabras Ofensivas (separadas por coma)</FormLabel>
                      <Textarea
                        minRows={3}
                        placeholder="palabra1, palabra2, frase ofensiva"
                        value={form.offensiveWords ?? ''}
                        onChange={e => updateForm('offensiveWords', e.target.value)}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Acción al Detectar Ofensa</FormLabel>
                      <Select
                        value={form.offensiveAction ?? 'hide'}
                        onChange={(_, v) => v && updateForm('offensiveAction', v as OffensiveAction)}
                      >
                        <Option value="hide">Ocultar comentario</Option>
                        <Option value="delete">Eliminar comentario</Option>
                        <Option value="block">Bloquear usuario</Option>
                      </Select>
                    </FormControl>
                    <FormControl>
                      <FormLabel>Mensaje Privado al Usuario Ofensivo (opcional)</FormLabel>
                      <Textarea
                        minRows={3}
                        placeholder="Tu comentario fue removido por violar nuestras políticas de comunidad."
                        value={form.offensivePrivateMessage ?? ''}
                        onChange={e => updateForm('offensivePrivateMessage', e.target.value)}
                      />
                    </FormControl>
                  </>
                )}

                {!form.offensiveWordsEnabled && (
                  <Box
                    sx={{
                      py: 4,
                      textAlign: 'center',
                      color: 'text.secondary',
                      background: 'rgba(0,0,0,0.02)',
                      borderRadius: 'sm',
                    }}
                  >
                    <Typography level="body-sm">
                      Activa el filtro de palabras ofensivas para configurar esta sección
                    </Typography>
                  </Box>
                )}
              </Stack>
            </TabPanel>
          </Box>
        </Tabs>

        {/* Footer */}
        <Box sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          {saveError && (
            <Alert color="danger" sx={{ mb: 1.5 }}>
              {saveError}
            </Alert>
          )}
          <Stack direction="row" justifyContent="flex-end" gap={1}>
            <Button variant="outlined" color="neutral" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              loading={saving}
              sx={{ background: '#3b82f6', '&:hover': { background: '#2563eb' } }}
            >
              {campaign ? 'Guardar Cambios' : 'Crear Campaña'}
            </Button>
          </Stack>
        </Box>
      </ModalDialog>
    </Modal>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CommentAutoReplyCampaigns() {
  const navigate = useNavigate()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [platformFilter, setPlatformFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const LIMIT = 20

  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string | number> = { page, limit: LIMIT }
      if (platformFilter !== 'all') params.platform = platformFilter
      if (statusFilter !== 'all') params.status = statusFilter
      if (search.trim()) params.search = search.trim()
      const res = await api.get('/comment-autoreply/campaigns', { params })
      setCampaigns(res.data.data?.campaigns ?? res.data.campaigns ?? [])
      setTotal(res.data.data?.total ?? res.data.total ?? 0)
      devLog('[CommentAutoReplyCampaigns] fetched', res.data)
    } catch (err: unknown) {
      devError('[CommentAutoReplyCampaigns] fetch error', err)
      setError(err instanceof Error ? err.message : 'Error al cargar campañas')
      setCampaigns([])
    } finally {
      setLoading(false)
    }
  }, [page, platformFilter, statusFilter, search])

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  const handleToggleStatus = async (c: Campaign) => {
    setTogglingId(c.id)
    try {
      const endpoint = c.status === 'active'
        ? `/comment-autoreply/campaigns/${c.id}/pause`
        : `/comment-autoreply/campaigns/${c.id}/activate`
      await api.post(endpoint)
      devLog('[CommentAutoReplyCampaigns] toggled', c.id)
      fetchCampaigns()
    } catch (err: unknown) {
      devError('[CommentAutoReplyCampaigns] toggle error', err)
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async (c: Campaign) => {
    if (!window.confirm(`¿Eliminar la campaña "${c.name}"? Esta acción no se puede deshacer.`)) return
    setDeletingId(c.id)
    try {
      await api.delete(`/comment-autoreply/campaigns/${c.id}`)
      devLog('[CommentAutoReplyCampaigns] deleted', c.id)
      fetchCampaigns()
    } catch (err: unknown) {
      devError('[CommentAutoReplyCampaigns] delete error', err)
    } finally {
      setDeletingId(null)
    }
  }

  const openCreate = () => {
    setSelectedCampaign(null)
    setModalOpen(true)
  }

  const openEdit = (c: Campaign) => {
    setSelectedCampaign(c)
    setModalOpen(true)
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ sm: 'center' }}
        justifyContent="space-between"
        gap={2}
        mb={3}
      >
        <Box>
          <Typography level="h3" fontWeight={700}>
            Campañas de Auto-Respuesta
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
            {total} campañas en total
          </Typography>
        </Box>
        <Stack direction="row" gap={1}>
          <IconButton variant="outlined" color="neutral" onClick={fetchCampaigns} title="Actualizar">
            <RefreshIcon />
          </IconButton>
          <Button
            startDecorator={<AddIcon />}
            onClick={openCreate}
            sx={{ background: '#3b82f6', '&:hover': { background: '#2563eb' } }}
          >
            Nueva Campaña
          </Button>
        </Stack>
      </Stack>

      {/* Filter Bar */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent sx={{ py: 1.5 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} alignItems={{ sm: 'center' }}>
            <Select
              size="sm"
              value={platformFilter}
              onChange={(_, v) => { setPlatformFilter(v ?? 'all'); setPage(1) }}
              sx={{ minWidth: 150 }}
              placeholder="Plataforma"
            >
              <Option value="all">Todas las plataformas</Option>
              <Option value="facebook">Facebook</Option>
              <Option value="instagram">Instagram</Option>
            </Select>
            <Select
              size="sm"
              value={statusFilter}
              onChange={(_, v) => { setStatusFilter(v ?? 'all'); setPage(1) }}
              sx={{ minWidth: 150 }}
              placeholder="Estado"
            >
              <Option value="all">Todos los estados</Option>
              <Option value="active">Activas</Option>
              <Option value="paused">Pausadas</Option>
              <Option value="draft">Borrador</Option>
            </Select>
            <Input
              size="sm"
              placeholder="Buscar campañas..."
              startDecorator={<SearchIcon fontSize="small" />}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              sx={{ flex: 1 }}
            />
          </Stack>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert color="danger" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Loading */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : campaigns.length === 0 ? (
        <Card variant="outlined">
          <CardContent>
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <SmartToyIcon sx={{ fontSize: 56, color: 'text.secondary', mb: 1.5 }} />
              <Typography level="title-md" sx={{ mb: 0.5 }}>Sin campañas</Typography>
              <Typography level="body-sm" sx={{ color: 'text.secondary', mb: 3 }}>
                Crea tu primera campaña de auto-respuesta para comenzar
              </Typography>
              <Button startDecorator={<AddIcon />} onClick={openCreate}
                sx={{ background: '#3b82f6', '&:hover': { background: '#2563eb' } }}>
                Nueva Campaña
              </Button>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Card variant="outlined">
          <Sheet sx={{ overflow: 'auto' }}>
            <Table
              hoverRow
              stickyHeader
              sx={{ '--TableCell-paddingY': '10px', '--TableCell-paddingX': '14px' }}
            >
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Nombre</th>
                  <th style={{ width: 110 }}>Plataforma</th>
                  <th style={{ width: 110 }}>Tipo</th>
                  <th style={{ width: 110 }}>Modo</th>
                  <th style={{ width: 110 }}>Estado</th>
                  <th style={{ width: 100 }}>Respuestas</th>
                  <th style={{ width: 150 }}>Último Reply</th>
                  <th style={{ width: 150 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id}>
                    <td>
                      <Typography level="body-sm" fontWeight={600}>{c.name}</Typography>
                      <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                        ID: {c.pageId}
                      </Typography>
                    </td>
                    <td>
                      <Stack direction="row" alignItems="center" gap={0.5}>
                        {c.platform === 'facebook' ? (
                          <FacebookIcon sx={{ fontSize: 18, color: '#1877f2' }} />
                        ) : (
                          <InstagramIcon sx={{ fontSize: 18, color: '#e1306c' }} />
                        )}
                        <Typography level="body-xs" sx={{ textTransform: 'capitalize' }}>
                          {c.platform}
                        </Typography>
                      </Stack>
                    </td>
                    <td>
                      <Chip size="sm" variant="soft" color="neutral">
                        {typeLabel[c.campaignType]}
                      </Chip>
                    </td>
                    <td>
                      <Chip size="sm" variant="soft" color={modeColor(c.replyMode)}>
                        {modeLabel[c.replyMode]}
                      </Chip>
                    </td>
                    <td>
                      <Chip size="sm" variant="soft" color={statusColor(c.status)}>
                        {statusLabel[c.status]}
                      </Chip>
                    </td>
                    <td>
                      <Typography level="body-sm" fontWeight={600}>
                        {c.totalReplies.toLocaleString()}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                        {formatDate(c.lastReplyAt)}
                      </Typography>
                    </td>
                    <td>
                      <Stack direction="row" gap={0.5} alignItems="center">
                        <Switch
                          size="sm"
                          checked={c.status === 'active'}
                          onChange={() => handleToggleStatus(c)}
                          disabled={togglingId === c.id}
                        />
                        <IconButton
                          size="sm"
                          variant="plain"
                          color="neutral"
                          onClick={() => openEdit(c)}
                          title="Editar"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="sm"
                          variant="plain"
                          color="primary"
                          onClick={() => navigate(`/comment-autoreply/campaigns/${c.id}/logs`)}
                          title="Ver Logs"
                        >
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="sm"
                          variant="plain"
                          color="danger"
                          onClick={() => handleDelete(c)}
                          disabled={deletingId === c.id}
                          title="Eliminar"
                        >
                          {deletingId === c.id ? <CircularProgress size="sm" /> : <DeleteIcon fontSize="small" />}
                        </IconButton>
                      </Stack>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Sheet>

          {/* Pagination */}
          {totalPages > 1 && (
            <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                  Página {page} de {totalPages} — {total} campañas
                </Typography>
                <Stack direction="row" gap={0.5}>
                  <Button
                    size="sm"
                    variant="outlined"
                    color="neutral"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="outlined"
                    color="neutral"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Siguiente
                  </Button>
                </Stack>
              </Stack>
            </Box>
          )}
        </Card>
      )}

      {/* Modal */}
      <CampaignModal
        open={modalOpen}
        campaign={selectedCampaign}
        onClose={() => setModalOpen(false)}
        onSaved={fetchCampaigns}
      />
    </Box>
  )
}
