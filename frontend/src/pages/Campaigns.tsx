import {
  useState,
  useEffect,
  useCallback,
  forwardRef,
  type ReactNode,
  type ButtonHTMLAttributes,
} from 'react'
// [Migración Tailwind] Se conservan a propósito los indicadores de progreso de MUI Joy
// (no existe equivalente en el design system). El resto de la pantalla usa tokens + shadcn/Radix.
import { CircularProgress, LinearProgress } from '@mui/joy'
import {
  Megaphone,
  Plus,
  PencilSimple,
  Trash,
  Eye,
  MagnifyingGlass,
  ArrowClockwise,
  XCircle,
  ArrowCounterClockwise,
  Clock,
  CaretDown,
  CaretUp,
  ChatCircleDots,
  Warning,
  Info,
} from '@phosphor-icons/react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'react-toastify'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
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

/** Valor centinela para los <SelectItem> "sin selección": Radix no admite value="". */
const NONE = '__none__'

function statusVariant(status: CampaignStatus): BadgeProps['variant'] {
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
      return 'destructive'
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

function channelVariant(channel: string): BadgeProps['variant'] {
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
// UI LOCAL
// ============================================================

/** Aviso inline (sustituye <Alert> de Joy). Texto con tokens *-text por contraste. */
function Callout({
  tone = 'destructive',
  children,
  className,
}: {
  tone?: 'destructive' | 'warning'
  children: ReactNode
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm',
        tone === 'destructive'
          ? 'border-destructive/30 bg-destructive/10 text-destructive-text'
          : 'border-warning/30 bg-warning/12 text-warning-text',
        className,
      )}
    >
      <Warning className="mt-px size-4 shrink-0" weight="fill" aria-hidden />
      <span>{children}</span>
    </div>
  )
}

/** Botón de acción de fila (icon button accesible, 32px ≥ objetivo mínimo WCAG 2.5.8).
 *  forwardRef: se usa como hijo de <Tooltip> (TooltipTrigger asChild) y Radix necesita la ref. */
const ActionBtn = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string }
>(({ label, className, children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={label}
    className={cn(
      'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    {children}
  </button>
))
ActionBtn.displayName = 'ActionBtn'

/** Fila etiqueta/valor del detalle. */
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="min-w-[140px] shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  )
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar campaña' : 'Nueva campaña Meta'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {formError && <Callout tone="destructive">{formError}</Callout>}

          {/* === A. OBLIGATORIOS === */}
          <p className="text-sm font-bold text-muted-foreground">Configuración principal</p>

          {/* Nombre */}
          <div className="space-y-1.5">
            <Label htmlFor="campaign-name">Nombre de la campaña</Label>
            <Input
              id="campaign-name"
              required
              placeholder="Ej: Promo Verano 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Conexión Meta */}
          <div className="space-y-1.5">
            <Label htmlFor="campaign-connection">Conexión Meta (Cloud API)</Label>
            {metaConnections.length === 0 ? (
              <Callout tone="warning">
                No hay conexiones Meta configuradas. Configura una conexión Cloud API primero.
              </Callout>
            ) : (
              <Select
                value={whatsappId != null ? String(whatsappId) : ''}
                onValueChange={(v) => setWhatsappId(Number(v))}
              >
                <SelectTrigger id="campaign-connection" className="h-11">
                  <SelectValue placeholder="Selecciona una conexión Meta" />
                </SelectTrigger>
                <SelectContent>
                  {metaConnections.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {`${c.name} · ${c.channel}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Template */}
          <div className="space-y-1.5">
            <Label htmlFor="campaign-template">Template Meta (APPROVED)</Label>
            <Select
              value={templateId != null ? String(templateId) : ''}
              onValueChange={(v) => {
                setTemplateId(Number(v))
                setTemplateParams({})
              }}
            >
              <SelectTrigger id="campaign-template" className="h-11">
                <SelectValue placeholder="Selecciona un template aprobado" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {`${t.name} · ${t.category} · ${t.language}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preview del template */}
          {selectedTemplate?.bodyContent && (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <p className="mb-1 text-xs font-bold text-foreground">Vista previa del cuerpo</p>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {selectedTemplate.bodyContent}
              </p>
              {variablesCount > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {variablesCount} variable{variablesCount > 1 ? 's' : ''} detectada
                  {variablesCount > 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}

          {/* Parámetros del template */}
          {variablesCount > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">Valores de variables</p>
              {Array.from({ length: variablesCount }, (_, i) => {
                const key = String(i + 1)
                return (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`campaign-var-${key}`}>{`Variable {{${key}}}`}</Label>
                    <Input
                      id={`campaign-var-${key}`}
                      placeholder={`Valor para {{${key}}}`}
                      value={templateParams[key] ?? ''}
                      onChange={(e) => handleParamChange(key, e.target.value)}
                    />
                  </div>
                )
              })}
            </div>
          )}

          {/* Fecha programada */}
          <div className="space-y-1.5">
            <Label htmlFor="campaign-scheduled">Fecha y hora de envío</Label>
            <Input
              id="campaign-scheduled"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>

          <div className="border-t border-border" />

          {/* === B. DESTINATARIOS === */}
          <p className="text-sm font-bold text-muted-foreground">Destinatarios</p>

          <div className="space-y-1.5">
            <Label htmlFor="campaign-list">Lista de contactos</Label>
            <Select
              value={contactListId != null ? String(contactListId) : NONE}
              onValueChange={(v) => setContactListId(v === NONE ? null : Number(v))}
            >
              <SelectTrigger id="campaign-list" className="h-11">
                <SelectValue placeholder="Selecciona una lista" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sin lista</SelectItem>
                {contactLists.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.contactsCount !== undefined
                      ? `${l.name} · ${l.contactsCount} contactos`
                      : l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border-t border-border" />

          {/* === C. OPCIONALES === */}
          <Button
            variant="ghost"
            size="sm"
            className="self-start px-0 hover:bg-transparent"
            aria-expanded={showOptional}
            onClick={() => setShowOptional((v) => !v)}
          >
            {showOptional ? (
              <CaretUp className="size-4" aria-hidden />
            ) : (
              <CaretDown className="size-4" aria-hidden />
            )}
            Opciones avanzadas
          </Button>

          {showOptional && (
            <div className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="campaign-queue">Cola de atención</Label>
                <Select
                  value={queueId != null ? String(queueId) : NONE}
                  onValueChange={(v) => setQueueId(v === NONE ? null : Number(v))}
                >
                  <SelectTrigger id="campaign-queue" className="h-11">
                    <SelectValue placeholder="Sin cola" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sin cola</SelectItem>
                    {queues.map((q) => (
                      <SelectItem key={q.id} value={String(q.id)}>
                        {q.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="campaign-user">Agente asignado</Label>
                <Select
                  value={userId != null ? String(userId) : NONE}
                  onValueChange={(v) => setUserId(v === NONE ? null : Number(v))}
                >
                  <SelectTrigger id="campaign-user" className="h-11">
                    <SelectValue placeholder="Sin agente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sin agente</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="campaign-tag">Tag Kanban</Label>
                <Select
                  value={tagId != null ? String(tagId) : NONE}
                  onValueChange={(v) => setTagId(v === NONE ? null : Number(v))}
                >
                  <SelectTrigger id="campaign-tag" className="h-11">
                    <SelectValue placeholder="Sin tag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sin tag</SelectItem>
                    {tags.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="campaign-status-ticket">Estado del ticket al responder</Label>
                <Select
                  value={statusTicket ?? NONE}
                  onValueChange={(v) => setStatusTicket(v === NONE ? null : v)}
                >
                  <SelectTrigger id="campaign-status-ticket" className="h-11">
                    <SelectValue placeholder="Sin cambio de estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sin cambio</SelectItem>
                    <SelectItem value="open">Abierto</SelectItem>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="closed">Cerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          {editing ? (
            <Button size="sm" onClick={() => submit(editing.status)} loading={submitting}>
              Guardar cambios
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => submit('INATIVA')}
                loading={submitting}
              >
                Guardar borrador
              </Button>
              <Button size="sm" onClick={() => submit('PROGRAMADA')} loading={submitting}>
                <Clock className="size-4" aria-hidden />
                Programar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Detalle de campaña</DialogTitle>
        </DialogHeader>

        <div>
          {loading && (
            <div className="flex justify-center py-8">
              <CircularProgress />
            </div>
          )}

          {error && <Callout tone="destructive">{error}</Callout>}

          {campaign && !loading && (
            <div className="flex flex-col gap-6">
              {/* Configuración */}
              <div>
                <p className="mb-3 text-sm font-bold text-foreground">Configuración</p>
                <div className="flex flex-col gap-2">
                  <DetailRow label="Nombre:">
                    <span className="font-semibold">{campaign.name}</span>
                  </DetailRow>
                  <DetailRow label="Estado:">
                    <Badge variant={statusVariant(campaign.status)}>
                      {statusLabel(campaign.status)}
                    </Badge>
                  </DetailRow>
                  <DetailRow label="Conexión Meta:">{campaign.whatsapp?.name ?? '—'}</DetailRow>
                  <DetailRow label="Lista de contactos:">
                    {campaign.contactList?.name ?? '—'}
                  </DetailRow>
                  <DetailRow label="Programada para:">{formatDate(campaign.scheduledAt)}</DetailRow>
                  {campaign.completedAt && (
                    <DetailRow label="Completada en:">{formatDate(campaign.completedAt)}</DetailRow>
                  )}
                </div>
              </div>

              {/* Template */}
              {campaign.whastsAppTemplate && (
                <div>
                  <p className="mb-2 text-sm font-bold text-foreground">Template aplicado</p>
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant="success">{campaign.whastsAppTemplate.status}</Badge>
                      <Badge variant="outline">{campaign.whastsAppTemplate.category}</Badge>
                      <Badge variant="outline">{campaign.whastsAppTemplate.language}</Badge>
                    </div>
                    <p className="mb-1 text-xs font-bold text-foreground">
                      {campaign.whastsAppTemplate.name}
                    </p>
                    {campaign.whastsAppTemplate.bodyContent && (
                      <p className="whitespace-pre-wrap text-sm text-foreground">
                        {campaign.whastsAppTemplate.bodyContent}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Parámetros */}
              {campaign.templateParams && Object.keys(campaign.templateParams).length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-bold text-foreground">Parámetros del template</p>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-left">
                          <th className="w-[120px] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Variable
                          </th>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Valor
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {Object.entries(campaign.templateParams).map(([k, v]) => (
                          <tr key={k}>
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                              {`{{${k}}}`}
                            </td>
                            <td className="px-3 py-2 text-foreground">{v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="border-t border-border" />

              {/* Métricas */}
              <div>
                <p className="mb-3 text-sm font-bold text-foreground">Métricas de envío</p>

                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border bg-muted/40 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-2xl font-semibold tabular-nums text-foreground">{total}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-success/10 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Enviados</p>
                    <p className="text-2xl font-semibold tabular-nums text-success-text">
                      {success}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-destructive/10 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Fallidos</p>
                    <p className="text-2xl font-semibold tabular-nums text-destructive-text">
                      {failed}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-warning/12 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Pendientes</p>
                    <p className="text-2xl font-semibold tabular-nums text-warning-text">
                      {pending}
                    </p>
                  </div>
                </div>

                {/* Tasa de éxito */}
                <div className="mb-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm text-foreground">Tasa de éxito</span>
                    <span className="text-sm font-bold tabular-nums text-foreground">
                      {successRate}%
                    </span>
                  </div>
                  <LinearProgress
                    determinate
                    value={total > 0 ? (success / total) * 100 : 0}
                    color="success"
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                </div>

                {/* Costo Meta */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Costo Meta:</span>
                  {campaign.metaCost !== null && campaign.metaCost !== undefined ? (
                    <span className="text-sm font-semibold text-foreground">
                      ${campaign.metaCost.toFixed(4)} USD
                    </span>
                  ) : (
                    <Tooltip title="La integración con Meta Billing aún no está configurada">
                      <span className="flex cursor-help items-center gap-1 text-sm text-muted-foreground">
                        No disponible
                        <Info className="size-3.5" aria-hidden />
                      </span>
                    </Tooltip>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[420px]" role="alertdialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Warning
              className={cn(
                'size-5 shrink-0',
                confirmColor === 'danger'
                  ? 'text-destructive-text'
                  : confirmColor === 'warning'
                    ? 'text-warning-text'
                    : 'text-muted-foreground',
              )}
              weight="fill"
              aria-hidden
            />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="border-t border-border" />

        <p className="text-sm text-foreground">{description}</p>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            className={
              confirmColor === 'danger'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : confirmColor === 'warning'
                  ? 'bg-warning text-primary-foreground hover:bg-warning/90'
                  : undefined
            }
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

const columns = ['Nombre', 'Conexión Meta', 'Template', 'Lista', 'Programada', 'Estado', 'Acciones']

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
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* ========== HEADER ========== */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <Megaphone className="size-6" weight="fill" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Campañas WhatsApp
                </h1>
                <p className="text-sm text-muted-foreground">
                  Campañas masivas vía Meta Cloud API con templates aprobados
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip title="Recargar datos">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Recargar datos"
                  className="text-muted-foreground"
                  onClick={loadData}
                  disabled={loading}
                >
                  <ArrowClockwise className="size-5" aria-hidden />
                </Button>
              </Tooltip>
              <Button
                size="sm"
                onClick={() => {
                  setEditingCampaign(null)
                  setFormOpen(true)
                }}
              >
                <Plus className="size-4" weight="bold" aria-hidden />
                Nueva campaña
              </Button>
            </div>
          </div>

          {/* ========== STATS ========== */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Total" value={String(stats.total)} />
            <StatTile label="Programadas" value={String(stats.programada)} tone="primary" />
            <StatTile label="En ejecución" value={String(stats.enAndamento)} tone="warning" />
            <StatTile label="Finalizadas" value={String(stats.finalizada)} tone="success" />
            <StatTile label="Canceladas" value={String(stats.cancelada)} tone="destructive" />
          </div>

          {/* ========== FILTROS ========== */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <MagnifyingGlass
                  className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  placeholder="Buscar por nombre..."
                  aria-label="Buscar campañas por nombre"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 sm:w-[200px]" aria-label="Filtrar por estado">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="INATIVA">Borrador</SelectItem>
                  <SelectItem value="PROGRAMADA">Programadas</SelectItem>
                  <SelectItem value="EM_ANDAMENTO">En ejecución</SelectItem>
                  <SelectItem value="FINALIZADA">Finalizadas</SelectItem>
                  <SelectItem value="CANCELADA">Canceladas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ========== ESTADO: LOADING ========== */}
          {loading && <LinearProgress sx={{ borderRadius: 4 }} />}

          {/* ========== ESTADO: ERROR ========== */}
          {!loading && loadError && <Callout tone="destructive">{loadError}</Callout>}

          {/* ========== ESTADO: VACÍO ========== */}
          {!loading && !loadError && filtered.length === 0 && (
            <div className="flex flex-col items-center rounded-xl border border-border bg-muted/40 px-6 py-14 text-center">
              <ChatCircleDots className="mb-3 size-12 text-muted-foreground" aria-hidden />
              <p className="text-base font-medium text-muted-foreground">
                {campaigns.length === 0
                  ? 'No hay campañas todavía'
                  : 'No hay campañas que coincidan con el filtro'}
              </p>
              {campaigns.length === 0 && (
                <Button
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setEditingCampaign(null)
                    setFormOpen(true)
                  }}
                >
                  <Plus className="size-4" weight="bold" aria-hidden />
                  Crear primera campaña
                </Button>
              )}
            </div>
          )}

          {/* ========== TABLA ========== */}
          {!loading && !loadError && filtered.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      {columns.map((c, i) => (
                        <th
                          key={c}
                          className={cn(
                            'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                            i === columns.length - 1 && 'text-right',
                          )}
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((c) => {
                      const isLegacy = c.useTemplate === false
                      return (
                        <tr key={c.id} className="transition-colors hover:bg-accent/40">
                          {/* Nombre */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">{c.name}</span>
                              {isLegacy && <Badge variant="outline">Legacy</Badge>}
                            </div>
                          </td>

                          {/* Conexión */}
                          <td className="px-4 py-3">
                            {c.whatsapp ? (
                              <div className="flex flex-col items-start gap-1">
                                <span className="text-foreground">{c.whatsapp.name}</span>
                                <Badge variant={channelVariant(c.whatsapp.channel)}>
                                  {channelLabel(c.whatsapp.channel)}
                                </Badge>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>

                          {/* Template */}
                          <td className="px-4 py-3">
                            {c.whastsAppTemplate ? (
                              <div className="flex flex-col items-start gap-1">
                                <span className="text-foreground">{c.whastsAppTemplate.name}</span>
                                <Badge variant="success">{c.whastsAppTemplate.status}</Badge>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>

                          {/* Lista */}
                          <td className="px-4 py-3 text-muted-foreground">
                            {c.contactList?.name ?? '—'}
                          </td>

                          {/* Programada */}
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {formatDate(c.scheduledAt)}
                          </td>

                          {/* Estado */}
                          <td className="px-4 py-3">
                            <Badge variant={statusVariant(c.status)} dot>
                              {statusLabel(c.status)}
                            </Badge>
                          </td>

                          {/* Acciones */}
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-0.5">
                              {/* Revisar — siempre visible */}
                              <Tooltip title="Revisar campaña">
                                <ActionBtn label="Revisar campaña" onClick={() => setReviewId(c.id)}>
                                  <Eye className="size-[18px]" aria-hidden />
                                </ActionBtn>
                              </Tooltip>

                              {/* Editar — INATIVA, PROGRAMADA, y no legacy */}
                              {(c.status === 'INATIVA' || c.status === 'PROGRAMADA') && (
                                <Tooltip
                                  title={
                                    isLegacy ? 'Campaña legacy no editable en este flujo' : 'Editar'
                                  }
                                >
                                  <span className="inline-flex">
                                    <ActionBtn
                                      label="Editar campaña"
                                      disabled={isLegacy}
                                      className="hover:bg-primary/10 hover:text-primary"
                                      onClick={() => {
                                        setEditingCampaign(c)
                                        setFormOpen(true)
                                      }}
                                    >
                                      <PencilSimple className="size-[18px]" aria-hidden />
                                    </ActionBtn>
                                  </span>
                                </Tooltip>
                              )}

                              {/* Cancelar — PROGRAMADA, EM_ANDAMENTO */}
                              {(c.status === 'PROGRAMADA' || c.status === 'EM_ANDAMENTO') && (
                                <Tooltip title="Cancelar campaña">
                                  <ActionBtn
                                    label="Cancelar campaña"
                                    className="hover:bg-warning/10 hover:text-warning-text"
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
                                    <XCircle className="size-[18px]" aria-hidden />
                                  </ActionBtn>
                                </Tooltip>
                              )}

                              {/* Reiniciar — CANCELADA, FINALIZADA */}
                              {(c.status === 'CANCELADA' || c.status === 'FINALIZADA') && (
                                <Tooltip title="Reiniciar campaña">
                                  <ActionBtn
                                    label="Reiniciar campaña"
                                    className="hover:bg-success/10 hover:text-success-text"
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
                                    <ArrowCounterClockwise className="size-[18px]" aria-hidden />
                                  </ActionBtn>
                                </Tooltip>
                              )}

                              {/* Eliminar — INATIVA, PROGRAMADA, CANCELADA, FINALIZADA */}
                              {c.status !== 'EM_ANDAMENTO' && (
                                <Tooltip title="Eliminar campaña">
                                  <ActionBtn
                                    label="Eliminar campaña"
                                    className="hover:bg-destructive/10 hover:text-destructive-text"
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
                                    <Trash className="size-[18px]" aria-hidden />
                                  </ActionBtn>
                                </Tooltip>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

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
      </div>
    </TooltipProvider>
  )
}
