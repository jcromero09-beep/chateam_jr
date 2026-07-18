import { useState, useEffect, useCallback } from 'react'
// [Fase2·G] Migrado a Tailwind v4 + shadcn/Radix. Se conserva CircularProgress de
// MUI Joy a propósito: no hay equivalente en el design system todavía.
import { CircularProgress } from '@mui/joy'
import {
  UsersThree,
  Plus,
  ArrowClockwise,
  Star,
  CurrencyDollar,
  Megaphone,
  PencilSimple,
  InstagramLogo,
  TiktokLogo,
  YoutubeLogo,
  FacebookLogo,
  MagnifyingGlass,
  User,
  CheckCircle,
  Hourglass,
  Prohibit,
  SealCheck,
  Money,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// ─── Types ────────────────────────────────────────────────────────────────────

type CreatorStatus = 'pending' | 'verified' | 'active' | 'suspended'
type CreatorNiche = 'belleza' | 'fitness' | 'tech' | 'lifestyle' | 'food' | 'travel'
type Platform = 'instagram' | 'tiktok' | 'youtube' | 'facebook'
type PaymentMethod = 'stripe' | 'paypal' | 'bank_transfer'

interface Creator {
  id: number
  name: string
  email: string
  phone?: string
  niche: CreatorNiche
  platforms: Platform[]
  followers: number
  engagementRate: number
  completedCampaigns: number
  rating: number
  baseRate: number
  status: CreatorStatus
  paymentMethod: PaymentMethod
  paypalEmail?: string
  stripeAccountId?: string
  createdAt: string
}

interface Campaign {
  id: number
  name: string
}

interface Assignment {
  id: number
  campaignName: string
  status: string
  agreedRate: number
  deadline: string
}

interface CreatorStats {
  totalActive: number
  assignedCampaigns: number
  paymentsThisMonth: number
  avgRating: number
}

interface NewCreatorForm {
  name: string
  email: string
  phone: string
  niche: CreatorNiche | ''
  platforms: Platform[]
  baseRate: string
  paymentMethod: PaymentMethod | ''
  paypalEmail: string
}

interface AssignForm {
  campaignId: string
  brief: string
  deadline: string
  agreedRate: string
}

interface PayForm {
  amount: string
  description: string
  assignmentId: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NICHE_CONFIG: Record<CreatorNiche, { label: string; variant: BadgeProps['variant'] }> = {
  belleza:   { label: 'Belleza',   variant: 'destructive' },
  fitness:   { label: 'Fitness',   variant: 'success' },
  tech:      { label: 'Tech',      variant: 'primary' },
  lifestyle: { label: 'Lifestyle', variant: 'warning' },
  food:      { label: 'Food',      variant: 'warning' },
  travel:    { label: 'Travel',    variant: 'neutral' },
}

// Los colores de marca de cada red se mantienen como hex (mismo criterio que
// Connections.tsx). TikTok usa `text-foreground`: su negro corporativo es
// invisible en modo oscuro.
const PLATFORM_CONFIG: Record<Platform, { label: string; className: string; icon: React.ReactNode }> = {
  instagram: { label: 'Instagram', className: 'text-[#e4405f]',  icon: <InstagramLogo className="size-3.5" weight="fill" aria-hidden /> },
  tiktok:    { label: 'TikTok',    className: 'text-foreground', icon: <TiktokLogo className="size-3.5" weight="fill" aria-hidden /> },
  youtube:   { label: 'YouTube',   className: 'text-[#ff0000]',  icon: <YoutubeLogo className="size-3.5" weight="fill" aria-hidden /> },
  facebook:  { label: 'Facebook',  className: 'text-[#1877f2]',  icon: <FacebookLogo className="size-3.5" weight="fill" aria-hidden /> },
}

const STATUS_CONFIG: Record<CreatorStatus, {
  label: string
  variant: BadgeProps['variant']
  dotClass: string
  icon: React.ReactNode
}> = {
  pending:   { label: 'Pendiente',  variant: 'warning',     dotClass: 'bg-warning',     icon: <Hourglass className="size-3.5" aria-hidden /> },
  verified:  { label: 'Verificado', variant: 'primary',     dotClass: 'bg-primary',     icon: <SealCheck className="size-3.5" weight="fill" aria-hidden /> },
  active:    { label: 'Activo',     variant: 'success',     dotClass: 'bg-success',     icon: <CheckCircle className="size-3.5" weight="fill" aria-hidden /> },
  suspended: { label: 'Suspendido', variant: 'destructive', dotClass: 'bg-destructive', icon: <Prohibit className="size-3.5" aria-hidden /> },
}

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  stripe: 'Stripe',
  paypal: 'PayPal',
  bank_transfer: 'Transferencia bancaria',
}

// Clases compartidas para los <textarea> (el design system solo expone <Input>).
const textareaClass =
  'w-full rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function Stars({ rating }: { rating: number }) {
  const full = Math.floor(rating)
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          weight="fill"
          className={cn('size-3.5', i < full ? 'text-warning-text' : 'text-muted-foreground/35')}
          aria-hidden
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{rating.toFixed(1)}</span>
    </div>
  )
}

// Aviso de error reutilizable dentro de los modales.
function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-md bg-destructive/12 px-3 py-2.5 text-sm text-destructive-text"
    >
      {children}
    </div>
  )
}

const EMPTY_NEW_CREATOR: NewCreatorForm = {
  name: '',
  email: '',
  phone: '',
  niche: '',
  platforms: [],
  baseRate: '',
  paymentMethod: '',
  paypalEmail: '',
}

const EMPTY_ASSIGN_FORM: AssignForm = {
  campaignId: '',
  brief: '',
  deadline: '',
  agreedRate: '',
}

const EMPTY_PAY_FORM: PayForm = {
  amount: '',
  description: '',
  assignmentId: '',
}

// ─── Stats Strip ──────────────────────────────────────────────────────────────

function StatsStrip({ stats, loading }: { stats: CreatorStats | null; loading: boolean }) {
  const items = [
    { label: 'Creadores Activos',  value: stats ? String(stats.totalActive) : '—',                tone: 'primary'  as const },
    { label: 'Campanas Asignadas', value: stats ? String(stats.assignedCampaigns) : '—',          tone: 'success'  as const },
    { label: 'Pagos Este Mes',     value: stats ? `$${stats.paymentsThisMonth.toFixed(0)}` : '—', tone: 'warning'  as const },
    { label: 'Rating Promedio',    value: stats ? `${stats.avgRating.toFixed(1)} ★` : '—',        tone: 'neutral'  as const },
  ]
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map(item =>
        loading ? (
          <div
            key={item.label}
            className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]"
          >
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <div className="mt-1.5 flex h-9 items-center">
              <CircularProgress size="sm" />
            </div>
          </div>
        ) : (
          <StatTile key={item.label} label={item.label} value={item.value} tone={item.tone} />
        ),
      )}
    </div>
  )
}

// ─── Creator Card ─────────────────────────────────────────────────────────────

interface CreatorCardProps {
  creator: Creator
  onAssign: (creator: Creator) => void
  onPay: (creator: Creator) => void
  onEdit: (creator: Creator) => void
}

function CreatorCard({ creator, onAssign, onPay, onEdit }: CreatorCardProps) {
  const nicheConfig  = NICHE_CONFIG[creator.niche]
  const statusConfig = STATUS_CONFIG[creator.status]

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
      {/* Header: avatar + nombre + status */}
      <div className="flex items-start gap-3">
        <span className="relative shrink-0">
          <Avatar name={creator.name} size="lg" />
          <span
            className={cn(
              'absolute bottom-0 right-0 size-3 rounded-full border-2 border-card',
              statusConfig.dotClass,
            )}
            aria-hidden
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{creator.name}</p>
          <p className="truncate text-xs text-muted-foreground">{creator.email}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge variant={nicheConfig.variant}>{nicheConfig.label}</Badge>
            <Badge variant={statusConfig.variant}>
              {statusConfig.icon}
              {statusConfig.label}
            </Badge>
          </div>
        </div>
      </div>

      {/* Plataformas */}
      <div className="flex flex-wrap gap-1.5">
        {creator.platforms.map(p => {
          const cfg = PLATFORM_CONFIG[p]
          return (
            <Badge key={p} variant="outline" className={cn('gap-1.5', cfg.className)}>
              {cfg.icon}
              {cfg.label}
            </Badge>
          )
        })}
      </div>

      <div className="border-t border-border" />

      {/* Stats 2x2 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Seguidores</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {formatNumber(creator.followers)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Engagement</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {creator.engagementRate.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Campanas Completadas</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {creator.completedCampaigns}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Rating</p>
          <Stars rating={creator.rating} />
        </div>
      </div>

      {/* Tarifa */}
      <div className="flex items-center gap-1.5">
        <CurrencyDollar className="size-4 shrink-0 text-success-text" weight="bold" aria-hidden />
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">${creator.baseRate}</span> / video
        </p>
      </div>

      <div className="border-t border-border" />

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="flex-1" onClick={() => onAssign(creator)}>
          <Megaphone className="size-4" weight="fill" aria-hidden />
          Asignar Campana
        </Button>
        <Button size="sm" variant="outline" onClick={() => onPay(creator)}>
          <Money className="size-4" weight="fill" aria-hidden />
          Ver Pagos
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          aria-label={`Editar ${creator.name}`}
          onClick={() => onEdit(creator)}
        >
          <PencilSimple className="size-[18px]" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

// ─── Modal Agregar Creador ────────────────────────────────────────────────────

interface AddCreatorModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

function AddCreatorModal({ open, onClose, onSuccess }: AddCreatorModalProps) {
  const [form, setForm]       = useState<NewCreatorForm>(EMPTY_NEW_CREATOR)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const togglePlatform = (p: Platform) => {
    setForm(prev => ({
      ...prev,
      platforms: prev.platforms.includes(p)
        ? prev.platforms.filter(x => x !== p)
        : [...prev.platforms, p],
    }))
  }

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.niche || !form.baseRate || !form.paymentMethod) {
      setError('Completa los campos obligatorios.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.post('/ugc/creators', {
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        niche: form.niche,
        platforms: form.platforms,
        baseRate: Number(form.baseRate),
        paymentMethod: form.paymentMethod,
        paypalEmail: form.paymentMethod === 'paypal' ? form.paypalEmail : undefined,
      })
      setForm(EMPTY_NEW_CREATOR)
      onSuccess()
      onClose()
    } catch (err: unknown) {
      devError('[AddCreatorModal] error:', err)
      setError('No se pudo crear el creador. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Agregar Creador</DialogTitle>
        </DialogHeader>
        <div className="border-t border-border" />

        <div className="space-y-3">
          {error && <ErrorNote>{error}</ErrorNote>}

          <div className="space-y-1.5">
            <Label htmlFor="creator-name">Nombre *</Label>
            <Input
              id="creator-name"
              placeholder="Nombre del creador"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              leftIcon={<User aria-hidden />}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="creator-email">Email *</Label>
            <Input
              id="creator-email"
              type="email"
              placeholder="correo@ejemplo.com"
              value={form.email}
              onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="creator-phone">Telefono (opcional)</Label>
            <Input
              id="creator-phone"
              placeholder="Telefono"
              value={form.phone}
              onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="creator-niche">Nicho *</Label>
            <Select
              value={form.niche}
              onValueChange={v => v && setForm(prev => ({ ...prev, niche: v as CreatorNiche }))}
            >
              <SelectTrigger id="creator-niche" className="h-11">
                <SelectValue placeholder="Selecciona un nicho" />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(NICHE_CONFIG) as [CreatorNiche, typeof NICHE_CONFIG[CreatorNiche]][]).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Plataformas</p>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(PLATFORM_CONFIG) as [Platform, typeof PLATFORM_CONFIG[Platform]][]).map(([key, cfg]) => {
                const selected = form.platforms.includes(key)
                return (
                  <button
                    key={key}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => togglePlatform(key)}
                    className={cn(
                      'inline-flex min-h-6 cursor-pointer appearance-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium leading-none transition-colors',
                      '[font-family:inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                      selected
                        ? 'border-transparent bg-primary text-primary-foreground'
                        : 'border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <span className={cn(selected ? 'text-primary-foreground' : cfg.className)}>
                      {cfg.icon}
                    </span>
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="creator-rate">Tarifa base por video ($) *</Label>
            <Input
              id="creator-rate"
              type="number"
              placeholder="0"
              value={form.baseRate}
              onChange={e => setForm(prev => ({ ...prev, baseRate: e.target.value }))}
              leftIcon={<CurrencyDollar aria-hidden />}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="creator-payment">Metodo de pago *</Label>
            <Select
              value={form.paymentMethod}
              onValueChange={v => v && setForm(prev => ({ ...prev, paymentMethod: v as PaymentMethod }))}
            >
              <SelectTrigger id="creator-payment" className="h-11">
                <SelectValue placeholder="Selecciona un metodo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stripe">Stripe</SelectItem>
                <SelectItem value="paypal">PayPal</SelectItem>
                <SelectItem value="bank_transfer">Transferencia bancaria</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.paymentMethod === 'paypal' && (
            <div className="space-y-1.5">
              <Label htmlFor="creator-paypal">PayPal email</Label>
              <Input
                id="creator-paypal"
                type="email"
                placeholder="paypal@ejemplo.com"
                value={form.paypalEmail}
                onChange={e => setForm(prev => ({ ...prev, paypalEmail: e.target.value }))}
              />
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button className="flex-[2]" onClick={handleSubmit} loading={saving}>
              Agregar Creador
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Modal Asignar Campana ────────────────────────────────────────────────────

interface AssignModalProps {
  open: boolean
  creator: Creator | null
  onClose: () => void
  onSuccess: () => void
}

function AssignModal({ open, creator, onClose, onSuccess }: AssignModalProps) {
  const [form, setForm]           = useState<AssignForm>(EMPTY_ASSIGN_FORM)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm(EMPTY_ASSIGN_FORM)
    setError(null)
    setLoadingCampaigns(true)
    api.get('/ugc/campaigns')
      .then(res => setCampaigns(res.data?.data ?? res.data ?? []))
      .catch(err => devError('[AssignModal] campaigns:', err))
      .finally(() => setLoadingCampaigns(false))
  }, [open])

  const handleSubmit = async () => {
    if (!creator || !form.campaignId || !form.deadline || !form.agreedRate) {
      setError('Completa los campos obligatorios.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.post(`/ugc/creators/${creator.id}/assign/${form.campaignId}`, {
        brief: form.brief,
        deadline: form.deadline,
        agreedRate: Number(form.agreedRate),
      })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      devError('[AssignModal] error:', err)
      setError('No se pudo asignar. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>
            Asignar a Campana
            {creator && (
              <span className="font-normal text-muted-foreground"> — {creator.name}</span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="border-t border-border" />

        <div className="space-y-3">
          {error && <ErrorNote>{error}</ErrorNote>}

          {loadingCampaigns ? (
            <div className="flex justify-center py-4">
              <CircularProgress size="sm" />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="assign-campaign">Campana activa *</Label>
              <Select
                value={form.campaignId}
                onValueChange={v => v && setForm(prev => ({ ...prev, campaignId: String(v) }))}
              >
                <SelectTrigger id="assign-campaign" className="h-11">
                  <SelectValue placeholder="Selecciona una campana" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="assign-brief">Brief / instrucciones</Label>
            <textarea
              id="assign-brief"
              rows={3}
              placeholder="Brief / instrucciones"
              value={form.brief}
              onChange={e => setForm(prev => ({ ...prev, brief: e.target.value }))}
              className={textareaClass}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assign-deadline">Deadline *</Label>
            <Input
              id="assign-deadline"
              type="date"
              value={form.deadline}
              onChange={e => setForm(prev => ({ ...prev, deadline: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assign-rate">Tarifa acordada ($) *</Label>
            <Input
              id="assign-rate"
              type="number"
              placeholder="0"
              value={form.agreedRate}
              onChange={e => setForm(prev => ({ ...prev, agreedRate: e.target.value }))}
              leftIcon={<CurrencyDollar aria-hidden />}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button className="flex-[2]" onClick={handleSubmit} loading={saving}>
              Asignar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Modal Procesar Pago ──────────────────────────────────────────────────────

interface PayModalProps {
  open: boolean
  creator: Creator | null
  onClose: () => void
  onSuccess: () => void
}

function PayModal({ open, creator, onClose, onSuccess }: PayModalProps) {
  const [form, setForm]               = useState<PayForm>(EMPTY_PAY_FORM)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)

  const PLATFORM_FEE = 0.1

  useEffect(() => {
    if (!open || !creator) return
    setForm(EMPTY_PAY_FORM)
    setError(null)
    api.get(`/ugc/creators/${creator.id}/assignments`)
      .then(res => setAssignments(res.data?.data ?? res.data ?? []))
      .catch(err => devError('[PayModal] assignments:', err))
  }, [open, creator])

  const grossAmount = Number(form.amount) || 0
  const feeAmount   = grossAmount * PLATFORM_FEE
  const netAmount   = grossAmount - feeAmount

  const handleSubmit = async () => {
    if (!creator || !form.amount || !form.description) {
      setError('Completa los campos obligatorios.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.post(`/ugc/creators/${creator.id}/pay`, {
        amount: grossAmount,
        description: form.description,
        assignmentId: form.assignmentId ? Number(form.assignmentId) : undefined,
      })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      devError('[PayModal] error:', err)
      setError('No se pudo procesar el pago. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Procesar Pago</DialogTitle>
        </DialogHeader>
        <div className="border-t border-border" />

        <div className="space-y-3">
          {error && <ErrorNote>{error}</ErrorNote>}

          {creator && (
            <div className="space-y-1 rounded-md bg-muted px-3 py-2.5">
              <div className="flex justify-between gap-3">
                <span className="text-xs text-muted-foreground">Creador</span>
                <span className="text-xs font-medium text-foreground">{creator.name}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-xs text-muted-foreground">Metodo</span>
                <span className="text-xs font-medium text-foreground">
                  {PAYMENT_METHOD_LABEL[creator.paymentMethod]}
                </span>
              </div>
              {creator.paymentMethod === 'paypal' && creator.paypalEmail && (
                <div className="flex justify-between gap-3">
                  <span className="text-xs text-muted-foreground">PayPal</span>
                  <span className="truncate text-xs font-medium text-foreground">{creator.paypalEmail}</span>
                </div>
              )}
              {creator.paymentMethod === 'stripe' && creator.stripeAccountId && (
                <div className="flex justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Stripe Account</span>
                  <span className="truncate text-xs font-medium text-foreground">{creator.stripeAccountId}</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Monto ($) *</Label>
            <Input
              id="pay-amount"
              type="number"
              placeholder="0"
              value={form.amount}
              onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))}
              leftIcon={<CurrencyDollar aria-hidden />}
            />
          </div>

          {grossAmount > 0 && (
            <div className="space-y-1 rounded-md bg-success/14 px-3 py-2.5">
              <div className="flex justify-between gap-3">
                <span className="text-xs text-muted-foreground">Fee plataforma (10%)</span>
                <span className="text-xs font-medium tabular-nums text-destructive-text">
                  -${feeAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-xs font-semibold text-foreground">Monto neto</span>
                <span className="text-xs font-semibold tabular-nums text-success-text">
                  ${netAmount.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pay-description">Descripcion *</Label>
            <Input
              id="pay-description"
              placeholder="Descripcion del pago"
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>

          {assignments.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="pay-assignment">Asignacion relacionada (opcional)</Label>
              <Select
                value={form.assignmentId}
                onValueChange={v => setForm(prev => ({ ...prev, assignmentId: v ? String(v) : '' }))}
              >
                <SelectTrigger id="pay-assignment" className="h-11">
                  <SelectValue placeholder="Selecciona una asignacion" />
                </SelectTrigger>
                <SelectContent>
                  {assignments.map(a => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.campaignName} — ${a.agreedRate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button className="flex-[2]" onClick={handleSubmit} loading={saving}>
              Procesar Pago
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UGCCreatorNetwork() {
  const [creators, setCreators]         = useState<Creator[]>([])
  const [stats, setStats]               = useState<CreatorStats | null>(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<CreatorStatus | 'all'>('all')
  const [nicheFilter, setNicheFilter]   = useState<CreatorNiche | 'all'>('all')

  const [addOpen, setAddOpen]           = useState(false)
  const [assignCreator, setAssignCreator] = useState<Creator | null>(null)
  const [payCreator, setPayCreator]     = useState<Creator | null>(null)
  const [editCreator, setEditCreator]   = useState<Creator | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/ugc/creators')
      const list: Creator[] = data.data ?? data ?? []
      setCreators(list)

      const active   = list.filter(c => c.status === 'active').length
      const assigned = list.reduce((acc, c) => acc + c.completedCampaigns, 0)
      const avgRating = list.length > 0 ? list.reduce((acc, c) => acc + c.rating, 0) / list.length : 0

      setStats({
        totalActive: active,
        assignedCampaigns: assigned,
        paymentsThisMonth: 0,
        avgRating,
      })
    } catch (err: unknown) {
      devError('[UGCCreatorNetwork] fetch error:', err)
      setError('No se pudo cargar la red de creadores. Verifica tu conexion.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredCreators = creators.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (nicheFilter  !== 'all' && c.niche  !== nicheFilter)  return false
    if (search) {
      const q = search.toLowerCase()
      if (!c.name.toLowerCase().includes(q) && !c.email.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <UsersThree className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Red de Creadores
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestiona tu red de creadores de contenido UGC
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={fetchData}
              disabled={loading}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Agregar Creador
            </Button>
          </div>
        </div>

        {/* ── Stats strip ── */}
        <StatsStrip stats={stats} loading={loading} />

        {/* ── Error state ── */}
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-destructive/12 px-4 py-3"
          >
            <p className="text-sm text-destructive-text">{error}</p>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
              onClick={fetchData}
            >
              Reintentar
            </Button>
          </div>
        )}

        {/* ── Filtros ── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* <Input> renderiza su propio wrapper relativo: el ancho se controla desde fuera. */}
          <div className="w-full min-w-[220px] sm:w-auto sm:max-w-xs sm:flex-1">
            <Input
              className="h-10"
              placeholder="Buscar por nombre o email..."
              aria-label="Buscar creadores"
              value={search}
              onChange={e => setSearch(e.target.value)}
              leftIcon={<MagnifyingGlass aria-hidden />}
            />
          </div>
          <div className="min-w-[150px]">
            <Select
              value={statusFilter}
              onValueChange={v => v && setStatusFilter(v as CreatorStatus | 'all')}
            >
              <SelectTrigger className="h-10" aria-label="Filtrar por estado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="verified">Verificado</SelectItem>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="suspended">Suspendido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[140px]">
            <Select
              value={nicheFilter}
              onValueChange={v => v && setNicheFilter(v as CreatorNiche | 'all')}
            >
              <SelectTrigger className="h-10" aria-label="Filtrar por nicho">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los nichos</SelectItem>
                {(Object.entries(NICHE_CONFIG) as [CreatorNiche, typeof NICHE_CONFIG[CreatorNiche]][]).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="ml-auto self-center text-xs text-muted-foreground">
            {filteredCreators.length} creador{filteredCreators.length !== 1 ? 'es' : ''}
          </p>
        </div>

        <div className="border-t border-border" />

        {/* ── Content ── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <CircularProgress size="lg" />
          </div>
        ) : filteredCreators.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20">
            <UsersThree className="size-16 text-muted-foreground/50" aria-hidden />
            <h2 className="text-center text-xl font-semibold text-foreground">Sin creadores</h2>
            <p className="max-w-[380px] text-center text-sm text-muted-foreground">
              {creators.length === 0
                ? 'No hay creadores registrados. Agrega tu primer creador de contenido.'
                : 'No hay creadores que coincidan con los filtros seleccionados.'}
            </p>
            {creators.length === 0 && (
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="size-4" weight="bold" aria-hidden />
                Agregar Primer Creador
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredCreators.map(creator => (
              <CreatorCard
                key={creator.id}
                creator={creator}
                onAssign={c => setAssignCreator(c)}
                onPay={c => setPayCreator(c)}
                onEdit={c => setEditCreator(c)}
              />
            ))}
          </div>
        )}

        {/* ── Edit placeholder info ── */}
        {editCreator && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Editando: <strong className="font-semibold text-foreground">{editCreator.name}</strong>
              {' '}— Funcionalidad de edicion disponible en la proxima version.
            </p>
            <Button size="sm" variant="ghost" onClick={() => setEditCreator(null)}>
              Cerrar
            </Button>
          </div>
        )}
      </div>

      {/* ── Modales ── */}
      <AddCreatorModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={fetchData}
      />
      <AssignModal
        open={assignCreator !== null}
        creator={assignCreator}
        onClose={() => setAssignCreator(null)}
        onSuccess={fetchData}
      />
      <PayModal
        open={payCreator !== null}
        creator={payCreator}
        onClose={() => setPayCreator(null)}
        onSuccess={fetchData}
      />
    </div>
  )
}
