/**
 * SocialCommentsSettings — Configuración de modos de respuesta FB/IG
 * Diseño escalable: tabla compacta + drawer lateral de edición
 * Fuente de conexiones: GET /social-comments/connections (solo facebook/instagram)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
// [migración G] CircularProgress se conserva como MUI (no hay equivalente en el DS).
import { CircularProgress } from '@mui/joy'
import {
  Gear,
  ArrowClockwise,
  FloppyDisk,
  Sparkle,
  Robot,
  Hand,
  ChatCircleDots,
  Warning,
  CheckCircle,
  FacebookLogo,
  InstagramLogo,
  MagnifyingGlass,
  FunnelSimple,
  PencilSimple,
  LinkBreak,
  X,
  type Icon,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import api from '../services/api'
import {
  getSettingsFull,
  saveSetting,
  connectPage,
  selectConnectPage,
  listConnections,
  type CommentResponseSetting,
  type CommentMode,
  type PageConnectionStatus,
  type PageOption,
  type EligibleConnection,
} from '../services/socialCommentService'

// ─── Dev helpers ───────────────────────────────────────────────────────────

const isDev = import.meta.env.DEV
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// ─── Facebook JS SDK ───────────────────────────────────────────────────────

const COMMENT_OAUTH_SCOPES =
  'pages_show_list,pages_read_engagement,pages_manage_engagement,pages_read_user_content,instagram_basic,instagram_manage_comments'

interface FBAuthResponse {
  accessToken?: string
}

interface FBLoginResponse {
  status?: string
  authResponse?: FBAuthResponse
}

interface FacebookSDK {
  init: (options: {
    appId: string
    autoLogAppEvents?: boolean
    xfbml?: boolean
    version: string
  }) => void
  login: (
    callback: (response: FBLoginResponse) => void,
    options: { scope: string; auth_type?: string; return_scopes?: boolean }
  ) => void
}

const getFB = (): FacebookSDK | undefined =>
  (window as unknown as { FB?: FacebookSDK }).FB

function loadFBSDK(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existingFB = getFB()
    if (existingFB) {
      try {
        existingFB.init({ appId, autoLogAppEvents: true, xfbml: false, version: 'v24.0' })
      } catch { /* ya inicializado */ }
      resolve()
      return
    }

    ;(window as unknown as { fbAsyncInit: () => void }).fbAsyncInit = () => {
      getFB()?.init({ appId, autoLogAppEvents: true, xfbml: false, version: 'v24.0' })
      resolve()
    }

    document.getElementById('facebook-jssdk')?.remove()

    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.onerror = () => {
      document.getElementById('facebook-jssdk')?.remove()
      reject(new Error(
        'No se pudo cargar el SDK de Facebook. Verifica que connect.facebook.net no esté bloqueado.'
      ))
    }
    document.head.appendChild(script)

    setTimeout(() => {
      if (!getFB()) {
        document.getElementById('facebook-jssdk')?.remove()
        reject(new Error('Timeout cargando FB SDK (15s). Revisa tu conexión a internet.'))
      }
    }, 15000)
  })
}

function fbLoginForComments(): Promise<string> {
  return new Promise((resolve, reject) => {
    const fb = getFB()
    if (!fb) {
      reject(new Error('El SDK de Facebook no está disponible'))
      return
    }
    fb.login(
      (response) => {
        if (response.status === 'connected' && response.authResponse?.accessToken) {
          resolve(response.authResponse.accessToken)
        } else {
          reject(new Error('Proceso cancelado o permisos no otorgados en Facebook.'))
        }
      },
      { scope: COMMENT_OAUTH_SCOPES, auth_type: 'rerequest', return_scopes: true }
    )
  })
}

const getErrorMessage = (err: unknown, fallback: string): string => {
  if (typeof err === 'object' && err !== null) {
    const resp = (err as { response?: { data?: { message?: string; error?: string } } }).response
    if (resp?.data?.message) return resp.data.message
    if (resp?.data?.error) return resp.data.error
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}

// ─── Tipos internos ────────────────────────────────────────────────────────

interface AgentConfig {
  id: number
  name: string
  agentType?: string
  isActive: boolean
}

type ModeFilter = 'all' | CommentMode
type ChannelFilter = 'all' | 'facebook' | 'instagram'

// ─── Descripción de modos ─────────────────────────────────────────────────

const MODE_DESCRIPTIONS: Record<
  CommentMode,
  { label: string; shortLabel: string; desc: string; variant: BadgeProps['variant']; Icon: Icon }
> = {
  manual: {
    label: 'Manual',
    shortLabel: 'Manual',
    desc: 'El equipo humano responde desde la bandeja de comentarios. No se envía ninguna respuesta automática.',
    variant: 'neutral',
    Icon: Hand,
  },
  auto_message: {
    label: 'Mensaje automático',
    shortLabel: 'Automático',
    desc: 'Se envía un mensaje fijo predefinido como respuesta a cada nuevo comentario.',
    variant: 'warning',
    Icon: ChatCircleDots,
  },
  ai: {
    label: 'Agente de IA',
    shortLabel: 'IA',
    desc: 'Un agente de IA genera una respuesta contextual para cada comentario. Consume créditos de agente_execution.',
    variant: 'primary',
    Icon: Robot,
  },
}

/** Superficie de la tarjeta de modo cuando está seleccionada (tokens del DS). */
const MODE_SELECTED_SURFACE: Record<CommentMode, string> = {
  manual: 'border-muted-foreground/40 bg-muted',
  auto_message: 'border-warning/50 bg-warning/12',
  ai: 'border-primary/50 bg-primary/10',
}

/** [a11y] Color del ícono/acento del modo: tokens *-text, nunca superficies. */
const MODE_ACCENT_TEXT: Record<CommentMode, string> = {
  manual: 'text-foreground',
  auto_message: 'text-warning-text',
  ai: 'text-primary',
}

const MODE_FILTERS: { key: ModeFilter; label: string; Icon?: Icon }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'manual', label: 'Manual', Icon: Hand },
  { key: 'auto_message', label: 'Automático', Icon: ChatCircleDots },
  { key: 'ai', label: 'IA', Icon: Robot },
]

const MODE_FILTER_ACTIVE: Record<ModeFilter, string> = {
  all: 'border-primary bg-primary text-primary-foreground',
  manual: 'border-primary bg-primary text-primary-foreground',
  auto_message: 'border-warning/60 bg-warning/16 text-warning-text',
  ai: 'border-primary/60 bg-primary/12 text-primary',
}

// ─── Primitivas locales de presentación ───────────────────────────────────

/** Chip-filtro pulsable (equivalente al Chip clickable de Joy). */
function FilterChip({
  active,
  activeClassName = 'border-primary bg-primary text-primary-foreground',
  onClick,
  children,
}: {
  active: boolean
  activeClassName?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        // sin preflight: reseteamos appearance/fuente del <button> del navegador
        'inline-flex min-h-6 cursor-pointer appearance-none items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap [font-family:inherit] outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active
          ? activeClassName
          : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {children}
    </button>
  )
}

/** Switch accesible con tokens del DS (equivalente al Switch de Joy). */
function Toggle({
  checked,
  onCheckedChange,
  disabled,
  tone = 'primary',
  ariaLabel,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  disabled?: boolean
  tone?: 'primary' | 'success'
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer appearance-none items-center rounded-full border-0 p-0 outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-55',
        checked ? (tone === 'success' ? 'bg-success' : 'bg-primary') : 'bg-input',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 transform rounded-full bg-card shadow-sm transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
        aria-hidden
      />
    </button>
  )
}

/** Ícono de canal (colores de marca FB/IG, igual que en Connections). */
function ChannelIcon({
  channel,
  className,
}: {
  channel?: 'facebook' | 'instagram'
  className?: string
}) {
  return channel === 'instagram' ? (
    <InstagramLogo className={cn('text-[#e4405f]', className)} weight="fill" aria-hidden />
  ) : (
    <FacebookLogo className={cn('text-[#1877f2]', className)} weight="fill" aria-hidden />
  )
}

// ─── Drawer de configuración individual ──────────────────────────────────

interface ConfigDrawerProps {
  open: boolean
  connection: EligibleConnection | null
  setting: CommentResponseSetting | null
  agents: AgentConfig[]
  pageStatus: PageConnectionStatus | null
  connectingPage: boolean
  saving: boolean
  onClose: () => void
  onSave: (payload: {
    whatsappId: number
    socialPostId: null
    mode: CommentMode
    autoMessage: string | null
    aiAgentConfigId: number | null
    isActive: boolean
  }) => Promise<void>
  onConnectPage: (whatsappId: number) => void
}

function ConfigDrawer({
  open,
  connection,
  setting,
  agents,
  pageStatus,
  connectingPage,
  saving,
  onClose,
  onSave,
  onConnectPage,
}: ConfigDrawerProps) {
  const [mode, setMode] = useState<CommentMode>('manual')
  const [autoMessage, setAutoMessage] = useState('')
  const [aiAgentConfigId, setAiAgentConfigId] = useState<number | null>(null)
  const [isActive, setIsActive] = useState(true)
  const [dirty, setDirty] = useState(false)

  // Sync cuando cambia la conexión o el setting
  useEffect(() => {
    if (!open) return
    setMode(setting?.mode ?? 'manual')
    setAutoMessage(setting?.autoMessage ?? '')
    setAiAgentConfigId(setting?.aiAgentConfigId ?? null)
    setIsActive(setting?.isActive ?? true)
    setDirty(false)
  }, [open, setting])

  // Cerrar con Escape (paridad con el Drawer de Joy, que ya lo traía)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const markDirty = () => setDirty(true)

  const handleSave = async () => {
    if (!connection) return
    if (mode === 'auto_message' && !autoMessage.trim()) {
      toast.error('El mensaje automático no puede estar vacío')
      return
    }
    if (mode === 'ai' && !aiAgentConfigId) {
      toast.error('Debes seleccionar un agente de IA')
      return
    }
    await onSave({
      whatsappId: connection.id,
      socialPostId: null,
      mode,
      autoMessage: mode === 'auto_message' ? autoMessage.trim() : null,
      aiAgentConfigId: mode === 'ai' ? aiAgentConfigId : null,
      isActive,
    })
    setDirty(false)
  }

  if (!open) return null

  const isConnected = connection?.status === 'CONNECTED'
  const activeAgents = agents.filter(a => a.isActive)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Configuración de respuesta a comentarios"
        className="relative flex h-full w-full max-w-[420px] flex-col overflow-hidden border-l border-border bg-card shadow-xl"
      >
        {/* Header drawer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <ChannelIcon channel={connection?.channel} className="size-[22px] shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {connection?.name ?? '—'}
              </p>
              <p className="text-xs text-muted-foreground">
                {connection?.channel === 'instagram' ? 'Instagram' : 'Facebook'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cerrar"
            className="size-8"
            onClick={onClose}
          >
            <X className="size-[18px]" aria-hidden />
          </Button>
        </div>

        {/* Cuerpo con scroll */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Estado de conexión de canal */}
          <div className="mb-4 flex items-center gap-2">
            <span
              className={cn(
                'size-2 shrink-0 rounded-full',
                isConnected ? 'bg-success' : 'bg-muted-foreground/50',
              )}
              aria-hidden
            />
            <span className="text-xs text-muted-foreground">
              Canal {isConnected ? 'conectado' : connection?.status ?? '—'}
            </span>
          </div>

          {/* Conexión de página FB/IG */}
          <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3">
            <p className="mb-2 text-xs font-semibold text-foreground">
              Página de Facebook/Instagram
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {pageStatus?.pageConnected ? (
                <Badge variant="success">
                  <CheckCircle className="size-3" weight="fill" aria-hidden />
                  Página conectada
                </Badge>
              ) : (
                <Badge variant="neutral">
                  <LinkBreak className="size-3" aria-hidden />
                  Sin página
                </Badge>
              )}
              {pageStatus?.pageConnected && pageStatus?.hasInstagram && (
                <Badge variant="primary">
                  <InstagramLogo className="size-3" weight="fill" aria-hidden />
                  IG vinculado
                </Badge>
              )}
              <Button
                size="sm"
                variant={pageStatus?.pageConnected ? 'outline' : 'primary'}
                loading={connectingPage}
                onClick={() => connection && onConnectPage(connection.id)}
              >
                <FacebookLogo className="size-4" weight="fill" aria-hidden />
                {pageStatus?.pageConnected ? 'Reconectar' : 'Conectar página'}
              </Button>
            </div>
          </div>

          <div className="mb-4 border-t border-border" />

          {/* Advertencia anti-duplicados */}
          <div
            role="status"
            className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/16 px-3 py-2 text-xs text-warning-text"
          >
            <Warning className="mt-px size-4 shrink-0" weight="fill" aria-hidden />
            <span>
              Solo un modo activo a la vez por conexión. Varios modos activos causan respuestas
              duplicadas.
            </span>
          </div>

          {/* Modo de respuesta */}
          <p id="comment-mode-label" className="mb-2 text-sm font-semibold text-foreground">
            Modo de respuesta
          </p>
          <div
            role="radiogroup"
            aria-labelledby="comment-mode-label"
            className="mb-4 flex flex-col gap-2"
          >
            {(Object.keys(MODE_DESCRIPTIONS) as CommentMode[]).map((m) => {
              const cfg = MODE_DESCRIPTIONS[m]
              const selected = mode === m
              return (
                <label
                  key={m}
                  className={cn(
                    'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors',
                    selected
                      ? MODE_SELECTED_SURFACE[m]
                      : 'border-border bg-card hover:border-muted-foreground/40',
                  )}
                >
                  <input
                    type="radio"
                    name="comment-mode"
                    value={m}
                    checked={selected}
                    onChange={() => { setMode(m); markDirty() }}
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[color:var(--primary)]"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <cfg.Icon
                        className={cn(
                          'size-4 shrink-0',
                          selected ? MODE_ACCENT_TEXT[m] : 'text-muted-foreground',
                        )}
                        weight="fill"
                        aria-hidden
                      />
                      {cfg.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{cfg.desc}</span>
                  </span>
                </label>
              )
            })}
          </div>

          {/* Textarea mensaje automático */}
          {mode === 'auto_message' && (
            <div className="mb-4 space-y-1.5">
              <Label htmlFor="auto-message">Mensaje automático</Label>
              <textarea
                id="auto-message"
                rows={3}
                placeholder="Ej: Gracias por tu comentario. Te contactaremos pronto por mensaje privado."
                value={autoMessage}
                onChange={(e) => { setAutoMessage(e.target.value); markDirty() }}
                className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors [font-family:inherit] placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <p className="text-xs text-muted-foreground">
                Se enviará como respuesta pública a cada nuevo comentario.
              </p>
            </div>
          )}

          {/* Select agente IA */}
          {mode === 'ai' && (
            <div className="mb-4 space-y-1.5">
              <Label htmlFor="ai-agent">Agente de IA</Label>
              {activeAgents.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay agentes IA activos. Crea uno en Plataforma IA → Agentes de IA.
                </p>
              ) : (
                <Select
                  value={aiAgentConfigId !== null ? String(aiAgentConfigId) : undefined}
                  onValueChange={(v) => {
                    setAiAgentConfigId(v ? Number(v) : null)
                    markDirty()
                  }}
                >
                  <SelectTrigger id="ai-agent" className="h-11">
                    <SelectValue placeholder="Selecciona un agente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAgents.map(a => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                        {a.agentType ? ` (${a.agentType})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                El agente generará respuestas contextuales usando su base de conocimiento.
              </p>
            </div>
          )}

          {/* Toggle activo */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Activar regla</p>
              <p className="text-xs text-muted-foreground">
                Si está inactivo, no se procesa ningún comentario para esta conexión.
              </p>
            </div>
            <Toggle
              checked={isActive}
              tone="success"
              ariaLabel="Activar regla"
              onCheckedChange={(v) => { setIsActive(v); markDirty() }}
            />
          </div>
        </div>

        {/* Footer fijo */}
        <div className="flex shrink-0 gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="flex-[2]"
            loading={saving}
            disabled={!dirty}
            onClick={handleSave}
          >
            <FloppyDisk className="size-4" weight="fill" aria-hidden />
            Guardar configuración
          </Button>
        </div>
      </aside>
    </div>
  )
}

// ─── Modal: elegir página cuando la cuenta administra varias ──────────────

interface PagePickerState {
  whatsappId: number
  userAccessToken: string
  pages: PageOption[]
  selectedId: string
}

interface PagePickerModalProps {
  pagePicker: PagePickerState | null
  selectingPage: boolean
  onClose: () => void
  onSelect: () => Promise<void>
  onPickChange: (pageId: string) => void
}

function PagePickerModal({
  pagePicker,
  selectingPage,
  onClose,
  onSelect,
  onPickChange,
}: PagePickerModalProps) {
  return (
    <Dialog
      open={!!pagePicker}
      onOpenChange={(next) => { if (!next && !selectingPage) onClose() }}
    >
      <DialogContent
        className="max-w-md"
        hideClose={selectingPage}
        onInteractOutside={(e) => { if (selectingPage) e.preventDefault() }}
        onEscapeKeyDown={(e) => { if (selectingPage) e.preventDefault() }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FacebookLogo className="size-5 text-[#1877f2]" weight="fill" aria-hidden />
            Selecciona la página
          </DialogTitle>
          <DialogDescription>
            Tu cuenta administra varias páginas. Elige la que deseas vincular a esta conexión.
          </DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label="Páginas disponibles" className="flex flex-col gap-2">
          {(pagePicker?.pages ?? []).map(p => {
            const selected = pagePicker?.selectedId === p.id
            return (
              <label
                key={p.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition-colors',
                  selected
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-border bg-card hover:border-muted-foreground/40',
                )}
              >
                <input
                  type="radio"
                  name="page-picker"
                  value={p.id}
                  checked={selected}
                  onChange={() => onPickChange(p.id)}
                  className="size-4 shrink-0 cursor-pointer accent-[color:var(--primary)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {p.name}
                  </span>
                  <span className="block font-mono text-xs text-muted-foreground">
                    ID: {p.id}
                  </span>
                </span>
                {p.hasInstagram && (
                  <Badge variant="primary">
                    <InstagramLogo className="size-3" weight="fill" aria-hidden />
                    IG
                  </Badge>
                )}
              </label>
            )
          })}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={selectingPage}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            className="flex-[2]"
            loading={selectingPage}
            disabled={!pagePicker?.selectedId}
            onClick={onSelect}
          >
            Conectar esta página
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────

export default function SocialCommentsSettings() {
  // Datos del servidor
  const [connections, setConnections] = useState<EligibleConnection[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [settings, setSettings] = useState<CommentResponseSetting[]>([])
  const [pageStatuses, setPageStatuses] = useState<PageConnectionStatus[]>([])
  const [agents, setAgents] = useState<AgentConfig[]>([])

  // UI states
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)

  // Filtros
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all')

  // Drawer
  const [drawerConnection, setDrawerConnection] = useState<EligibleConnection | null>(null)
  const drawerOpen = drawerConnection !== null

  // Conectar página
  const [facebookAppId, setFacebookAppId] = useState<string | null>(null)
  const [connectingPageId, setConnectingPageId] = useState<number | null>(null)
  const [pagePicker, setPagePicker] = useState<PagePickerState | null>(null)
  const [selectingPage, setSelectingPage] = useState(false)

  // Debounce búsqueda
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value)
      setCurrentPage(1)
      setConnections([])
    }, 400)
  }

  // Cargar facebookAppId
  useEffect(() => {
    api.get('/companySettingOne', { params: { column: 'facebookAppId' } })
      .then(res => {
        const appId: unknown = res.data?.facebookAppId
        if (appId && typeof appId === 'string') setFacebookAppId(appId)
      })
      .catch(() => { /* silencioso */ })
  }, [])

  // Carga inicial: conexiones + settings + agentes
  const fetchAll = useCallback(async (page = 1, append = false) => {
    if (page === 1) {
      setLoading(true)
      setError(null)
    } else {
      setLoadingMore(true)
    }
    try {
      const [connRes, settingsRes, agentsRes] = await Promise.allSettled([
        listConnections({ searchParam: debouncedSearch, pageNumber: page }),
        page === 1 ? getSettingsFull() : Promise.resolve(null),
        page === 1 ? api.get('/ai/agents') : Promise.resolve(null),
      ])

      if (connRes.status === 'fulfilled') {
        const { records, count, hasMore: more } = connRes.value
        setConnections(prev => append ? [...prev, ...records] : records)
        setTotalCount(count)
        setHasMore(more)
      }

      if (page === 1) {
        if (settingsRes.status === 'fulfilled' && settingsRes.value !== null) {
          setSettings(settingsRes.value.records)
          setPageStatuses(settingsRes.value.pageStatus)
        }
        if (agentsRes.status === 'fulfilled' && agentsRes.value !== null) {
          const raw = agentsRes.value.data
          const list: AgentConfig[] = Array.isArray(raw)
            ? raw
            : Array.isArray(raw?.data)
              ? raw.data
              : []
          setAgents(list)
        }
      }
    } catch (err) {
      devError('[SocialCommentsSettings] fetchAll:', err)
      setError('No se pudo cargar la configuración. Verifica tu conexión.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [debouncedSearch])

  useEffect(() => {
    setCurrentPage(1)
    setConnections([])
    fetchAll(1, false)
  }, [fetchAll])

  const handleLoadMore = () => {
    const next = currentPage + 1
    setCurrentPage(next)
    fetchAll(next, true)
  }

  // Guardar setting
  const handleSave = async (payload: {
    whatsappId: number
    socialPostId: null
    mode: CommentMode
    autoMessage: string | null
    aiAgentConfigId: number | null
    isActive: boolean
  }) => {
    setSavingId(payload.whatsappId)
    try {
      const updated = await saveSetting(payload)
      setSettings(prev => {
        const idx = prev.findIndex(
          s => s.whatsappId === payload.whatsappId && s.socialPostId === null
        )
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = updated
          return next
        }
        return [...prev, updated]
      })
      toast.success('Configuración guardada')
    } catch (err) {
      devError('[SocialCommentsSettings] save error:', err)
      toast.error('No se pudo guardar la configuración')
    } finally {
      setSavingId(null)
    }
  }

  // Conectar página FB/IG
  const markPageConnected = (whatsappId: number, hasInstagram: boolean) => {
    setPageStatuses(prev => {
      const next = prev.filter(p => p.whatsappId !== whatsappId)
      return [...next, { whatsappId, pageConnected: true, hasInstagram }]
    })
    // Actualizar también la conexión en la lista
    setConnections(prev =>
      prev.map(c =>
        c.id === whatsappId ? { ...c, pageConnected: true, hasInstagram } : c
      )
    )
  }

  const handleConnectPage = async (whatsappId: number) => {
    if (!facebookAppId) {
      toast.error('No hay Facebook App ID configurado. Configúralo en Configuración Avanzada → Facebook Ads.')
      return
    }
    setConnectingPageId(whatsappId)
    try {
      await loadFBSDK(facebookAppId)
      const userAccessToken = await fbLoginForComments()
      const result = await connectPage(whatsappId, userAccessToken)

      if (result.connected && result.page) {
        markPageConnected(whatsappId, !!result.hasInstagram)
        toast.success(
          `Página "${result.page.name}" conectada${result.hasInstagram ? ' (Instagram vinculado)' : ''}`
        )
      } else if (result.pages && result.pages.length > 0) {
        setPagePicker({
          whatsappId,
          userAccessToken,
          pages: result.pages,
          selectedId: result.pages[0].id,
        })
      } else {
        toast.error('No se encontraron páginas administradas en esta cuenta de Facebook')
      }
    } catch (err) {
      devError('[SocialCommentsSettings] connectPage:', err)
      toast.error(getErrorMessage(err, 'No se pudo conectar la página FB/IG'))
    } finally {
      setConnectingPageId(null)
    }
  }

  const handleSelectPage = async () => {
    if (!pagePicker?.selectedId) {
      toast.error('Selecciona una página')
      return
    }
    setSelectingPage(true)
    try {
      const result = await selectConnectPage(
        pagePicker.whatsappId,
        pagePicker.userAccessToken,
        pagePicker.selectedId
      )
      if (result.connected && result.page) {
        markPageConnected(pagePicker.whatsappId, !!result.hasInstagram)
        toast.success(
          `Página "${result.page.name}" conectada${result.hasInstagram ? ' (Instagram vinculado)' : ''}`
        )
        setPagePicker(null)
      }
    } catch (err) {
      devError('[SocialCommentsSettings] selectPage:', err)
      toast.error(getErrorMessage(err, 'No se pudo conectar la página seleccionada'))
    } finally {
      setSelectingPage(false)
    }
  }

  // ─── KPIs (calculados client-side sobre connections cargadas + settings) ───

  const connectedCount = connections.filter(c => c.pageConnected).length
  const aiCount = settings.filter(s => s.mode === 'ai' && s.isActive && s.socialPostId === null).length
  const autoCount = settings.filter(s => s.mode === 'auto_message' && s.isActive && s.socialPostId === null).length

  // ─── Filtros client-side ──────────────────────────────────────────────────

  const visibleConnections = connections.filter(conn => {
    if (channelFilter !== 'all' && conn.channel !== channelFilter) return false
    if (modeFilter !== 'all') {
      const setting = settings.find(s => s.whatsappId === conn.id && s.socialPostId === null)
      const connMode: CommentMode = setting?.mode ?? 'manual'
      if (connMode !== modeFilter) return false
    }
    return true
  })

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1100px] space-y-5 p-5 sm:p-6 lg:p-8">
          {/* Cabecera */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <Gear className="size-6" weight="fill" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Configuración de Comentarios FB/IG
                </h1>
                <p className="text-sm text-muted-foreground">
                  Define el modo de respuesta para cada conexión Facebook o Instagram
                </p>
              </div>
            </div>
            <Tooltip title="Recargar">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Recargar"
                className="text-muted-foreground"
                disabled={loading}
                onClick={() => { setCurrentPage(1); setConnections([]); fetchAll(1, false) }}
              >
                <ArrowClockwise className="size-5" aria-hidden />
              </Button>
            </Tooltip>
          </div>

          {/* KPIs */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral" className="px-2.5 py-1">
              {totalCount} conexiones
            </Badge>
            <Badge variant="success" className="px-2.5 py-1">
              <CheckCircle className="size-3.5" weight="fill" aria-hidden />
              {connectedCount} páginas conectadas
            </Badge>
            <Badge variant="primary" className="px-2.5 py-1">
              <Robot className="size-3.5" weight="fill" aria-hidden />
              {aiCount} en modo IA
            </Badge>
            <Badge variant="warning" className="px-2.5 py-1">
              <Sparkle className="size-3.5" weight="fill" aria-hidden />
              {autoCount} en modo automático
            </Badge>
          </div>

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/12 px-3.5 py-2.5 text-sm text-destructive-text"
            >
              <span className="flex items-center gap-2">
                <Warning className="size-4 shrink-0" weight="fill" aria-hidden />
                {error}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
                onClick={() => fetchAll(1, false)}
              >
                Reintentar
              </Button>
            </div>
          )}

          {/* Toolbar: búsqueda + filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-60">
              <Input
                className="h-9"
                placeholder="Buscar conexión..."
                aria-label="Buscar conexión"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                leftIcon={<MagnifyingGlass aria-hidden />}
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <FunnelSimple className="size-4 shrink-0 text-muted-foreground" aria-hidden />

              {/* Filtro canal */}
              {(['all', 'facebook', 'instagram'] as ChannelFilter[]).map(ch => (
                <FilterChip
                  key={ch}
                  active={channelFilter === ch}
                  onClick={() => setChannelFilter(ch)}
                >
                  {ch === 'facebook' && (
                    <FacebookLogo className="size-3.5" weight="fill" aria-hidden />
                  )}
                  {ch === 'instagram' && (
                    <InstagramLogo className="size-3.5" weight="fill" aria-hidden />
                  )}
                  {ch === 'all' ? 'Todos' : ch === 'facebook' ? 'Facebook' : 'Instagram'}
                </FilterChip>
              ))}

              <span className="mx-0.5 hidden h-4 w-px bg-border sm:inline-block" aria-hidden />

              {/* Filtro modo */}
              {MODE_FILTERS.map(({ key, label, Icon: ModeIcon }) => (
                <FilterChip
                  key={key}
                  active={modeFilter === key}
                  activeClassName={MODE_FILTER_ACTIVE[key]}
                  onClick={() => setModeFilter(key)}
                >
                  {ModeIcon && <ModeIcon className="size-3.5" weight="fill" aria-hidden />}
                  {label}
                </FilterChip>
              ))}
            </div>
          </div>

          {/* Estado: cargando inicial */}
          {loading ? (
            <div className="flex justify-center py-20">
              <CircularProgress size="lg" />
            </div>
          ) : connections.length === 0 && !error ? (
            /* Estado: vacío */
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/40 py-20">
              <div className="flex gap-2 opacity-50">
                <FacebookLogo className="size-12 text-[#1877f2]" weight="fill" aria-hidden />
                <InstagramLogo className="size-12 text-[#e4405f]" weight="fill" aria-hidden />
              </div>
              <p className="text-base font-semibold text-foreground">Sin conexiones FB/IG</p>
              <p className="max-w-sm text-center text-sm text-muted-foreground">
                No tienes conexiones de Facebook o Instagram. Crea una conexión de canal
                Facebook/Instagram primero desde Canales → Conexiones.
              </p>
            </div>
          ) : (
            /* Tabla compacta */
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      <th className="w-[30%] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Conexión
                      </th>
                      <th className="w-[22%] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Página
                      </th>
                      <th className="w-[18%] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Modo actual
                      </th>
                      <th className="w-[12%] whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Activo
                      </th>
                      <th className="w-[18%] whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleConnections.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                          No hay conexiones que coincidan con los filtros.
                        </td>
                      </tr>
                    ) : (
                      visibleConnections.map(conn => {
                        const setting =
                          settings.find(s => s.whatsappId === conn.id && s.socialPostId === null) ?? null
                        const pageStatus =
                          pageStatuses.find(p => p.whatsappId === conn.id) ??
                          { whatsappId: conn.id, pageConnected: conn.pageConnected, hasInstagram: conn.hasInstagram }
                        const currentMode: CommentMode = setting?.mode ?? 'manual'
                        const modeCfg = MODE_DESCRIPTIONS[currentMode]
                        const isActive = setting?.isActive ?? false
                        const isConnected = conn.status === 'CONNECTED'

                        return (
                          <tr key={conn.id} className="transition-colors hover:bg-accent/40">
                            {/* Columna: Conexión */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <ChannelIcon
                                  channel={conn.channel}
                                  className="size-[18px] shrink-0"
                                />
                                <div className="min-w-0">
                                  <p className="max-w-[200px] truncate text-sm font-medium text-foreground">
                                    {conn.name}
                                  </p>
                                  <div className="mt-0.5 flex items-center gap-1.5">
                                    <span
                                      className={cn(
                                        'size-1.5 shrink-0 rounded-full',
                                        isConnected ? 'bg-success' : 'bg-muted-foreground/50',
                                      )}
                                      aria-hidden
                                    />
                                    <span className="text-xs text-muted-foreground">
                                      {isConnected ? 'Conectado' : conn.status}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Columna: Página */}
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {pageStatus.pageConnected ? (
                                  <Badge variant="success">
                                    <CheckCircle className="size-3" weight="fill" aria-hidden />
                                    Conectada
                                  </Badge>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2.5 text-xs"
                                    loading={connectingPageId === conn.id}
                                    onClick={() => handleConnectPage(conn.id)}
                                  >
                                    <FacebookLogo className="size-3.5" weight="fill" aria-hidden />
                                    Conectar
                                  </Button>
                                )}
                                {pageStatus.hasInstagram && (
                                  <Badge variant="primary">
                                    <InstagramLogo className="size-3" weight="fill" aria-hidden />
                                    IG
                                  </Badge>
                                )}
                              </div>
                            </td>

                            {/* Columna: Modo */}
                            <td className="px-4 py-3">
                              <Badge variant={modeCfg.variant}>
                                <modeCfg.Icon className="size-3" weight="fill" aria-hidden />
                                {modeCfg.shortLabel}
                              </Badge>
                            </td>

                            {/* Columna: Activo */}
                            <td className="px-4 py-3 text-center">
                              <Toggle
                                checked={isActive}
                                tone="success"
                                ariaLabel={`Activar respuestas para ${conn.name}`}
                                onCheckedChange={async (checked) => {
                                  if (!setting) {
                                    toast.warning('Abre "Configurar" para activar esta conexión primero.')
                                    return
                                  }
                                  await handleSave({
                                    whatsappId: conn.id,
                                    socialPostId: null,
                                    mode: setting.mode,
                                    autoMessage: setting.autoMessage,
                                    aiAgentConfigId: setting.aiAgentConfigId,
                                    isActive: checked,
                                  })
                                }}
                              />
                            </td>

                            {/* Columna: Acciones */}
                            <td className="px-4 py-3 text-center">
                              <Tooltip title="Configurar modo de respuesta">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-3 text-xs"
                                  onClick={() => setDrawerConnection(conn)}
                                >
                                  <PencilSimple className="size-3.5" aria-hidden />
                                  Configurar
                                </Button>
                              </Tooltip>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Cargar más */}
              {hasMore && (
                <div className="flex justify-center border-t border-border py-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={loadingMore}
                    onClick={handleLoadMore}
                  >
                    Cargar más conexiones
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Nota pie de página */}
          {!loading && connections.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">
                <strong className="font-semibold text-foreground">Override por post:</strong> Para
                configurar un modo específico para un post individual, usa el endpoint PUT
                /social-comments/settings con el campo socialPostId. La configuración por post tiene
                precedencia sobre la configuración de la conexión.
              </p>
            </div>
          )}
        </div>

        {/* Drawer lateral de configuración */}
        <ConfigDrawer
          open={drawerOpen}
          connection={drawerConnection}
          setting={
            drawerConnection
              ? settings.find(s => s.whatsappId === drawerConnection.id && s.socialPostId === null) ?? null
              : null
          }
          agents={agents}
          pageStatus={
            drawerConnection
              ? pageStatuses.find(p => p.whatsappId === drawerConnection.id) ??
                { whatsappId: drawerConnection.id, pageConnected: drawerConnection.pageConnected, hasInstagram: drawerConnection.hasInstagram }
              : null
          }
          connectingPage={drawerConnection !== null && connectingPageId === drawerConnection.id}
          saving={drawerConnection !== null && savingId === drawerConnection.id}
          onClose={() => setDrawerConnection(null)}
          onSave={handleSave}
          onConnectPage={handleConnectPage}
        />

        {/* Modal: elegir página */}
        <PagePickerModal
          pagePicker={pagePicker}
          selectingPage={selectingPage}
          onClose={() => setPagePicker(null)}
          onSelect={handleSelectPage}
          onPickChange={(pageId) =>
            setPagePicker(prev => (prev ? { ...prev, selectedId: pageId } : prev))
          }
        />
      </div>
    </TooltipProvider>
  )
}
