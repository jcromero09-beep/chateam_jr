/**
 * CommentAutoReplyCampaigns — Gestión de campañas de auto-respuesta de comentarios
 * Ruta: /comment-autoreply/campaigns
 */
import { useState, useEffect, useCallback } from 'react'
// [Fase2·G] Se conserva CircularProgress de MUI Joy: no hay equivalente en el design system.
import { CircularProgress } from '@mui/joy'
import {
  Plus,
  PencilSimple,
  Trash,
  MagnifyingGlass,
  ArrowClockwise,
  Eye,
  FacebookLogo,
  InstagramLogo,
  Robot,
} from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
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

// ─── Design system helpers ────────────────────────────────────────────────────

// Mismo look que <Input> del design system, pero para <textarea> (alto libre).
const textareaClass =
  'min-h-[84px] w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm leading-relaxed text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

// Toggle accesible (role=switch) con tokens del design system — no hay wrapper Switch en @/components/ui.
function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-55',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
        aria-hidden
      />
    </button>
  )
}

// Botón de acción de fila (mismo look que RowAction del prototipo, con onClick).
function ActionBtn({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusVariant = (s: CampaignStatus): BadgeProps['variant'] => {
  if (s === 'active') return 'success'
  if (s === 'paused') return 'warning'
  return 'neutral'
}

const statusLabel: Record<CampaignStatus, string> = {
  active: 'Activa',
  paused: 'Pausada',
  draft: 'Borrador',
}

const modeVariant = (m: ReplyMode): BadgeProps['variant'] => {
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

const columns = ['Nombre', 'Plataforma', 'Tipo', 'Modo', 'Estado', 'Respuestas', 'Último Reply', 'Acciones']

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
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-[760px] flex-col gap-0 overflow-hidden p-0">
        {/* Header */}
        <div className="border-b border-border px-5 py-4 pr-14">
          <DialogTitle className="font-bold">
            {campaign ? 'Editar Campaña' : 'Nueva Campaña'}
          </DialogTitle>
        </div>

        {/* Tabs */}
        <Tabs
          value={String(tab)}
          onValueChange={(v) => setTab(Number(v))}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="px-5 pt-3">
            <TabsList className="flex-wrap">
              <TabsTrigger value="0">Básico</TabsTrigger>
              <TabsTrigger value="1">Respuestas</TabsTrigger>
              <TabsTrigger value="2">Opciones</TabsTrigger>
              <TabsTrigger value="3">Moderación</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* ── Tab 1: Básico ── */}
            <TabsContent value="0" className="mt-0">
              <div className="flex flex-col gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="camp-name">Nombre de la Campaña</Label>
                  <Input
                    id="camp-name"
                    required
                    placeholder="Ej. Campaña Lanzamiento Verano"
                    value={form.name}
                    onChange={e => updateForm('name', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="camp-platform">Plataforma</Label>
                    <Select
                      value={form.platform}
                      onValueChange={v => v && updateForm('platform', v as Platform)}
                    >
                      <SelectTrigger id="camp-platform" className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="camp-type">Tipo de Campaña</Label>
                    <Select
                      value={form.campaignType}
                      onValueChange={v => v && updateForm('campaignType', v as CampaignType)}
                    >
                      <SelectTrigger id="camp-type" className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="post">Por Post</SelectItem>
                        <SelectItem value="page">Por Página Completa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="camp-page-id">ID de Página</Label>
                  <Input
                    id="camp-page-id"
                    required
                    placeholder="Ej. 123456789"
                    value={form.pageId}
                    onChange={e => updateForm('pageId', e.target.value)}
                  />
                </div>
                {form.campaignType === 'post' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="camp-post-id">ID del Post</Label>
                    <Input
                      id="camp-post-id"
                      placeholder="Ej. 123456789_987654321"
                      value={form.postId ?? ''}
                      onChange={e => updateForm('postId', e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="camp-status">Estado Inicial</Label>
                  <Select
                    value={form.status}
                    onValueChange={v => v && updateForm('status', v as CampaignStatus)}
                  >
                    <SelectTrigger id="camp-status" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Borrador</SelectItem>
                      <SelectItem value="active">Activa</SelectItem>
                      <SelectItem value="paused">Pausada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* ── Tab 2: Respuestas ── */}
            <TabsContent value="1" className="mt-0">
              <div className="flex flex-col gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="camp-reply-mode">Modo de Respuesta</Label>
                  <Select
                    value={form.replyMode}
                    onValueChange={v => v && updateForm('replyMode', v as ReplyMode)}
                  >
                    <SelectTrigger id="camp-reply-mode" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keyword">Por Keywords</SelectItem>
                      <SelectItem value="ai">Inteligencia Artificial</SelectItem>
                      <SelectItem value="generic">Respuesta Genérica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.replyMode === 'keyword' && (
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-foreground">
                      Reglas de Keywords
                    </h3>
                    <div className="flex flex-col gap-4">
                      {(form.keywordRules ?? []).map((rule, idx) => (
                        <div
                          key={idx}
                          className="relative rounded-lg border border-border bg-card p-4"
                        >
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-primary">
                                Regla #{idx + 1}
                              </span>
                              {(form.keywordRules ?? []).length > 1 && (
                                <ActionBtn
                                  label={`Eliminar regla ${idx + 1}`}
                                  onClick={() => removeRule(idx)}
                                  className="hover:bg-destructive/10 hover:text-destructive-text"
                                >
                                  <Trash className="size-[18px]" aria-hidden />
                                </ActionBtn>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`rule-${idx}-keywords`}>Keywords (separadas por coma)</Label>
                              <Input
                                id={`rule-${idx}-keywords`}
                                placeholder="precio, costo, cuánto cuesta"
                                value={rule.keywords}
                                onChange={e => updateRule(idx, 'keywords', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`rule-${idx}-public`}>Respuesta Pública</Label>
                              <textarea
                                id={`rule-${idx}-public`}
                                rows={2}
                                className={textareaClass}
                                placeholder="¡Hola! Te enviamos los precios por mensaje privado."
                                value={rule.publicReply}
                                onChange={e => updateRule(idx, 'publicReply', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`rule-${idx}-private`}>Respuesta Privada (DM)</Label>
                              <textarea
                                id={`rule-${idx}-private`}
                                rows={2}
                                className={textareaClass}
                                placeholder="Hola {nombre}, nuestros precios son..."
                                value={rule.privateReply}
                                onChange={e => updateRule(idx, 'privateReply', e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="self-start"
                        onClick={addKeywordRule}
                      >
                        <Plus className="size-4" weight="bold" aria-hidden />
                        Agregar Regla
                      </Button>
                    </div>

                    <div className="my-4 border-t border-border" />

                    <h3 className="mb-3 text-sm font-semibold text-foreground">
                      Respuesta por Defecto (sin keyword match)
                    </h3>
                    <div className="flex flex-col gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="camp-default-public">Respuesta Pública por Defecto</Label>
                        <textarea
                          id="camp-default-public"
                          rows={2}
                          className={textareaClass}
                          placeholder="¡Gracias por tu comentario!"
                          value={form.defaultPublicReply ?? ''}
                          onChange={e => updateForm('defaultPublicReply', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="camp-default-private">Respuesta Privada por Defecto</Label>
                        <textarea
                          id="camp-default-private"
                          rows={2}
                          className={textareaClass}
                          placeholder="Hola, gracias por escribirnos. ¿En qué te podemos ayudar?"
                          value={form.defaultPrivateReply ?? ''}
                          onChange={e => updateForm('defaultPrivateReply', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {form.replyMode === 'ai' && (
                  <div className="flex flex-col gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="camp-ai-training">Datos de Entrenamiento / Contexto IA</Label>
                      <textarea
                        id="camp-ai-training"
                        rows={5}
                        className={cn(textareaClass, 'min-h-[140px]')}
                        placeholder="Describe el contexto del negocio, productos, precios, políticas, tono de respuesta, etc."
                        value={form.aiTrainingData ?? ''}
                        onChange={e => updateForm('aiTrainingData', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="camp-ai-agent">ID del Agente IA (AIAgentIdentity)</Label>
                      <Input
                        id="camp-ai-agent"
                        type="number"
                        placeholder="Ej. 12"
                        value={form.aiAgentIdentityId ?? ''}
                        onChange={e => updateForm('aiAgentIdentityId', e.target.value ? Number(e.target.value) : undefined)}
                      />
                    </div>
                  </div>
                )}

                {form.replyMode === 'generic' && (
                  <div className="flex flex-col gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="camp-generic-public">Respuesta Pública Genérica</Label>
                      <textarea
                        id="camp-generic-public"
                        rows={3}
                        className={cn(textareaClass, 'min-h-[96px]')}
                        placeholder="¡Gracias por comentar! Te contactamos pronto."
                        value={form.defaultPublicReply ?? ''}
                        onChange={e => updateForm('defaultPublicReply', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="camp-generic-private">Respuesta Privada Genérica</Label>
                      <textarea
                        id="camp-generic-private"
                        rows={3}
                        className={cn(textareaClass, 'min-h-[96px]')}
                        placeholder="Hola {nombre}, gracias por tu comentario. ¿Cómo podemos ayudarte?"
                        value={form.defaultPrivateReply ?? ''}
                        onChange={e => updateForm('defaultPrivateReply', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Tab 3: Opciones ── */}
            <TabsContent value="2" className="mt-0">
              <div className="flex flex-col">
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
                  <div key={key} className="border-b border-border py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                      <Toggle
                        label={label}
                        checked={Boolean(form[key])}
                        onChange={v => updateForm(key, v as CampaignFormData[typeof key])}
                      />
                    </div>
                  </div>
                ))}

                {form.delayEnabled && (
                  <div className="pt-4">
                    <div className="flex gap-4">
                      <div className="flex-1 space-y-1.5">
                        <Label htmlFor="camp-delay-min">Delay Mínimo (segundos)</Label>
                        <Input
                          id="camp-delay-min"
                          type="number"
                          min={1}
                          max={300}
                          value={form.delayMinSeconds ?? 5}
                          onChange={e => updateForm('delayMinSeconds', Number(e.target.value))}
                        />
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <Label htmlFor="camp-delay-max">Delay Máximo (segundos)</Label>
                        <Input
                          id="camp-delay-max"
                          type="number"
                          min={1}
                          max={600}
                          value={form.delayMaxSeconds ?? 30}
                          onChange={e => updateForm('delayMaxSeconds', Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 pt-4">
                  <Label htmlFor="camp-matching">Tipo de Coincidencia de Keywords</Label>
                  <Select
                    value={form.triggerMatchingType ?? 'contains'}
                    onValueChange={v => v && updateForm('triggerMatchingType', v as MatchingType)}
                  >
                    <SelectTrigger id="camp-matching" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contiene (parcial)</SelectItem>
                      <SelectItem value="exact">Exacto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* ── Tab 4: Moderación ── */}
            <TabsContent value="3" className="mt-0">
              <div className="flex flex-col gap-4">
                <div className="border-b border-border py-2">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Activar Filtro de Palabras Ofensivas</p>
                      <p className="text-xs text-muted-foreground">
                        Detectar y actuar sobre comentarios con lenguaje inapropiado
                      </p>
                    </div>
                    <Toggle
                      label="Activar Filtro de Palabras Ofensivas"
                      checked={form.offensiveWordsEnabled ?? false}
                      onChange={v => updateForm('offensiveWordsEnabled', v)}
                    />
                  </div>
                </div>

                {form.offensiveWordsEnabled && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="camp-offensive-words">Palabras Ofensivas (separadas por coma)</Label>
                      <textarea
                        id="camp-offensive-words"
                        rows={3}
                        className={cn(textareaClass, 'min-h-[96px]')}
                        placeholder="palabra1, palabra2, frase ofensiva"
                        value={form.offensiveWords ?? ''}
                        onChange={e => updateForm('offensiveWords', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="camp-offensive-action">Acción al Detectar Ofensa</Label>
                      <Select
                        value={form.offensiveAction ?? 'hide'}
                        onValueChange={v => v && updateForm('offensiveAction', v as OffensiveAction)}
                      >
                        <SelectTrigger id="camp-offensive-action" className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hide">Ocultar comentario</SelectItem>
                          <SelectItem value="delete">Eliminar comentario</SelectItem>
                          <SelectItem value="block">Bloquear usuario</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="camp-offensive-msg">Mensaje Privado al Usuario Ofensivo (opcional)</Label>
                      <textarea
                        id="camp-offensive-msg"
                        rows={3}
                        className={cn(textareaClass, 'min-h-[96px]')}
                        placeholder="Tu comentario fue removido por violar nuestras políticas de comunidad."
                        value={form.offensivePrivateMessage ?? ''}
                        onChange={e => updateForm('offensivePrivateMessage', e.target.value)}
                      />
                    </div>
                  </>
                )}

                {!form.offensiveWordsEnabled && (
                  <div className="rounded-lg bg-muted/40 py-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      Activa el filtro de palabras ofensivas para configurar esta sección
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer */}
        <div className="border-t border-border px-5 py-4">
          {saveError && (
            <div
              role="alert"
              className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive-text"
            >
              {saveError}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving}>
              {campaign ? 'Guardar Cambios' : 'Crear Campaña'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Robot className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Campañas de Auto-Respuesta
              </h1>
              <p className="text-sm text-muted-foreground">
                {total} campañas en total
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={fetchCampaigns}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nueva Campaña
            </Button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="rounded-xl border border-border bg-card p-3 shadow-sm shadow-black/[0.02]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select
              value={platformFilter}
              onValueChange={v => { setPlatformFilter(v ?? 'all'); setPage(1) }}
            >
              <SelectTrigger className="sm:w-[190px]" aria-label="Filtrar por plataforma">
                <SelectValue placeholder="Plataforma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las plataformas</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={v => { setStatusFilter(v ?? 'all'); setPage(1) }}
            >
              <SelectTrigger className="sm:w-[180px]" aria-label="Filtrar por estado">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="active">Activas</SelectItem>
                <SelectItem value="paused">Pausadas</SelectItem>
                <SelectItem value="draft">Borrador</SelectItem>
              </SelectContent>
            </Select>
            {/* <Input> renderiza un wrapper relativo: el flex-1 va en el contenedor, no en el <input>. */}
            <div className="flex-1">
              <Input
                className="h-9"
                placeholder="Buscar campañas..."
                aria-label="Buscar campañas"
                leftIcon={<MagnifyingGlass aria-hidden />}
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
              />
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text"
          >
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex justify-center py-16">
            <CircularProgress />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-6 py-16 text-center shadow-sm shadow-black/[0.02]">
            <Robot className="mx-auto mb-3 size-14 text-muted-foreground" aria-hidden />
            <h2 className="mb-1 text-base font-semibold text-foreground">Sin campañas</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Crea tu primera campaña de auto-respuesta para comenzar
            </p>
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nueva Campaña
            </Button>
          </div>
        ) : (
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
                  {campaigns.map(c => (
                    <tr key={c.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">ID: {c.pageId}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {c.platform === 'facebook' ? (
                            <FacebookLogo className="size-[18px] text-[#1877f2]" weight="fill" aria-hidden />
                          ) : (
                            <InstagramLogo className="size-[18px] text-[#e4405f]" weight="fill" aria-hidden />
                          )}
                          <span className="text-xs capitalize text-muted-foreground">
                            {c.platform}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="neutral">{typeLabel[c.campaignType]}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={modeVariant(c.replyMode)}>{modeLabel[c.replyMode]}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(c.status)} dot>{statusLabel[c.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-foreground">
                        {c.totalReplies.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {formatDate(c.lastReplyAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <Toggle
                            label={c.status === 'active' ? `Pausar campaña ${c.name}` : `Activar campaña ${c.name}`}
                            checked={c.status === 'active'}
                            onChange={() => handleToggleStatus(c)}
                            disabled={togglingId === c.id}
                          />
                          <ActionBtn label="Editar" onClick={() => openEdit(c)}>
                            <PencilSimple className="size-[18px]" aria-hidden />
                          </ActionBtn>
                          <ActionBtn
                            label="Ver Logs"
                            onClick={() => navigate(`/comment-autoreply/campaigns/${c.id}/logs`)}
                            className="text-primary hover:bg-primary/10 hover:text-primary"
                          >
                            <Eye className="size-[18px]" aria-hidden />
                          </ActionBtn>
                          <ActionBtn
                            label="Eliminar"
                            onClick={() => handleDelete(c)}
                            disabled={deletingId === c.id}
                            className="hover:bg-destructive/10 hover:text-destructive-text"
                          >
                            {deletingId === c.id
                              ? <CircularProgress size="sm" />
                              : <Trash className="size-[18px]" aria-hidden />}
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t border-border px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs text-muted-foreground">
                    Página {page} de {totalPages} — {total} campañas
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(p => p - 1)}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => p + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      <CampaignModal
        open={modalOpen}
        campaign={selectedCampaign}
        onClose={() => setModalOpen(false)}
        onSaved={fetchCampaigns}
      />
    </div>
  )
}
