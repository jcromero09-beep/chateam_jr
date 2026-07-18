import { useState, useEffect, useCallback } from 'react'
// [Fase2·G] Se conservan solo los indicadores de progreso de MUI Joy: no existe
// equivalente en el design system (shadcn/Radix no trae spinner/progress propio).
import { CircularProgress, LinearProgress } from '@mui/joy'
import {
  Plus,
  User,
  Sparkle,
  InstagramLogo,
  YoutubeLogo,
  ArrowClockwise,
  Circle,
  TrendUp,
  Brain,
  UsersThree,
  MapPin,
  Cake,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = 'instagram' | 'tiktok' | 'youtube' | 'twitter' | 'multi'
type Gender = 'female' | 'male' | 'non_binary'
type AgeRange = '18-24' | '25-34' | '35-44' | '45+'
type Niche = 'lifestyle' | 'fitness' | 'tech' | 'beauty' | 'food' | 'travel' | 'gaming' | 'business' | 'fashion' | 'education'

interface AgentIdentity {
  id: number
  name: string
  handle: string
  platform: Platform
  niche: Niche
  gender: Gender
  age: number
  city: string
  bio: string
  avatarUrl?: string
  isOnline: boolean
  followers: number
  engagementRate: number
  interactionsToday: number
  interactionsTotal: number
  personalityTraits: string[]
  interests: string[]
  catchphrases: string[]
  activityScore: number
  createdAt: string
}

type GenerationStep =
  | 'Analizando nicho...'
  | 'Generando personalidad...'
  | 'Creando historia de vida...'
  | 'Diseñando perfil visual...'
  | 'Configurando comportamientos...'
  | 'Finalizando identidad...'

const GENERATION_STEPS: GenerationStep[] = [
  'Analizando nicho...',
  'Generando personalidad...',
  'Creando historia de vida...',
  'Diseñando perfil visual...',
  'Configurando comportamientos...',
  'Finalizando identidad...',
]

const NICHE_LABELS: Record<Niche, string> = {
  lifestyle: 'Lifestyle',
  fitness: 'Fitness',
  tech: 'Tecnología',
  beauty: 'Belleza',
  food: 'Gastronomía',
  travel: 'Viajes',
  gaming: 'Gaming',
  business: 'Negocios',
  fashion: 'Moda',
  education: 'Educación',
}

const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  twitter: 'Twitter/X',
  multi: 'Multi-plataforma',
}

// ─── Helper Components ────────────────────────────────────────────────────────

/** Los logos de marca conservan su color oficial (mismo criterio que Connections.tsx);
 *  el resto de plataformas cae al token neutral del design system. */
function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  const base = cn('size-4 shrink-0', className)
  switch (platform) {
    case 'instagram':
      return <InstagramLogo className={cn(base, 'text-[#e4405f]')} weight="fill" aria-hidden />
    case 'youtube':
      return <YoutubeLogo className={cn(base, 'text-[#ff0000]')} weight="fill" aria-hidden />
    default:
      return <User className={cn(base, 'text-muted-foreground')} weight="fill" aria-hidden />
  }
}

function IdentityAvatar({
  identity,
  className,
  imgSize,
}: {
  identity: AgentIdentity
  className?: string
  imgSize: number
}) {
  if (identity.avatarUrl) {
    return (
      <img
        src={identity.avatarUrl}
        alt=""
        width={imgSize}
        height={imgSize}
        className={cn('shrink-0 rounded-full object-cover', className)}
      />
    )
  }
  return <Avatar name={identity.name} className={className} />
}

function OnlineDot({ online, className }: { online: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block shrink-0 rounded-full',
        online ? 'bg-success' : 'bg-muted-foreground/50',
        className,
      )}
      aria-hidden
    />
  )
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

function IdentitySkeletonRow() {
  return (
    <div className="flex animate-pulse items-center gap-3 rounded-md p-3">
      <div className="size-9 shrink-0 rounded-full bg-muted" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-3/5 rounded bg-muted" />
        <div className="h-2.5 w-2/5 rounded bg-muted" />
      </div>
    </div>
  )
}

// ─── Sidebar Item ─────────────────────────────────────────────────────────────

function SidebarIdentityItem({
  identity,
  selected,
  onClick,
}: {
  identity: AgentIdentity
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected || undefined}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 rounded-md border-0 p-3 text-left [font-family:inherit] outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        selected ? 'bg-primary/12' : 'bg-transparent hover:bg-accent',
      )}
    >
      <span className="relative shrink-0">
        <IdentityAvatar identity={identity} imgSize={36} className="size-9 text-xs" />
        <OnlineDot
          online={identity.isOnline}
          className="absolute -bottom-0.5 -right-0.5 size-2.5 ring-2 ring-card"
        />
      </span>

      <span className="min-w-0 flex-1">
        <span className="mb-0.5 flex items-center gap-1">
          <span className="flex-1 truncate text-xs font-semibold text-foreground">
            {identity.name}
          </span>
          <PlatformIcon platform={identity.platform} />
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          @{identity.handle}
        </span>
        <span className="block text-[10px] text-muted-foreground">
          {formatNumber(identity.interactionsToday)} interacciones hoy
        </span>
      </span>
    </button>
  )
}

// ─── Main Profile Panel ───────────────────────────────────────────────────────

function IdentityProfilePanel({ identity }: { identity: AgentIdentity }) {
  const statCards = [
    { label: 'Seguidores', value: formatNumber(identity.followers), icon: <UsersThree className="size-5" aria-hidden /> },
    { label: 'Engagement', value: `${identity.engagementRate}%`, icon: <TrendUp className="size-5" aria-hidden /> },
    { label: 'Hoy', value: formatNumber(identity.interactionsToday), icon: <Sparkle className="size-5" aria-hidden /> },
  ]

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header card */}
      <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
        <div className="flex items-start gap-5">
          <IdentityAvatar identity={identity} imgSize={96} className="size-24 text-2xl" />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                {identity.name}
              </h2>
              <Badge variant="primary">
                <PlatformIcon platform={identity.platform} className="size-3.5" />
                {PLATFORM_LABELS[identity.platform]}
              </Badge>
              <Badge variant="success">{NICHE_LABELS[identity.niche]}</Badge>
            </div>

            <p className="mb-2 text-sm text-muted-foreground">@{identity.handle}</p>

            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3.5" aria-hidden />
                {identity.city}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Cake className="size-3.5" aria-hidden />
                {identity.age} años
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <OnlineDot online={identity.isOnline} className="size-2" />
                {identity.isOnline ? 'En línea' : 'Desconectada'}
              </span>
            </div>
          </div>
        </div>

        <div className="my-4 h-px bg-border" />

        <p className="text-sm leading-relaxed text-muted-foreground">{identity.bio}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {identity.personalityTraits.map(trait => (
            <Badge key={trait} variant="outline">{trait}</Badge>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {statCards.map(stat => (
          <div
            key={stat.label}
            className="rounded-xl border border-border bg-muted/40 p-4 text-center"
          >
            <span className="mb-1 flex justify-center text-primary">{stat.icon}</span>
            <p className="text-2xl font-bold leading-none tabular-nums text-foreground">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Personality column */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="mb-3 flex items-center gap-2">
            <Brain className="size-[18px] text-primary" aria-hidden />
            <h3 className="text-sm font-semibold text-foreground">Personalidad</h3>
          </div>

          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Intereses</p>
          <div className="mb-3 flex flex-wrap gap-1">
            {identity.interests.map(i => (
              <Badge key={i} variant="primary">{i}</Badge>
            ))}
          </div>

          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Frases típicas</p>
          <div className="flex flex-col gap-1">
            {identity.catchphrases.map(phrase => (
              <p key={phrase} className="text-xs italic text-muted-foreground">
                "{phrase}"
              </p>
            ))}
          </div>
        </div>

        {/* Activity column */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="mb-3 flex items-center gap-2">
            <TrendUp className="size-[18px] text-success-text" aria-hidden />
            <h3 className="text-sm font-semibold text-foreground">Actividad</h3>
          </div>

          <p className="mb-1 text-xs font-medium text-muted-foreground">Nivel de actividad</p>
          <div className="mb-3">
            <LinearProgress
              determinate
              value={identity.activityScore}
              color={identity.activityScore >= 70 ? 'success' : identity.activityScore >= 40 ? 'warning' : 'danger'}
              sx={{ mb: 0.5 }}
            />
            <p className="text-xs tabular-nums text-muted-foreground">{identity.activityScore}%</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Total interacciones', value: formatNumber(identity.interactionsTotal) },
              { label: 'Hoy', value: formatNumber(identity.interactionsToday) },
              { label: 'Engagement', value: `${identity.engagementRate}%` },
              { label: 'Seguidores', value: formatNumber(identity.followers) },
            ].map(item => (
              <div key={item.label} className="rounded-md bg-muted/50 p-2 text-center">
                <p className="text-xs font-semibold tabular-nums text-foreground">{item.value}</p>
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Generate Modal ───────────────────────────────────────────────────────────

interface GenerateModalProps {
  open: boolean
  onClose: () => void
  onGenerated: (identity: AgentIdentity) => void
}

function GenerateModal({ open, onClose, onGenerated }: GenerateModalProps) {
  const [niche, setNiche] = useState<Niche>('lifestyle')
  const [gender, setGender] = useState<Gender>('female')
  const [ageRange, setAgeRange] = useState<AgeRange>('25-34')
  const [platformFocus, setPlatformFocus] = useState<Platform>('instagram')
  const [isGenerating, setIsGenerating] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)
    setCurrentStep(0)

    // Step animation
    const stepInterval = setInterval(() => {
      setCurrentStep(prev => {
        if (prev < GENERATION_STEPS.length - 1) return prev + 1
        clearInterval(stepInterval)
        return prev
      })
    }, 900)

    try {
      const { data } = await api.post('/ugc/identities/generate', {
        niche,
        gender,
        ageRange,
        platformFocus,
      })
      clearInterval(stepInterval)
      setCurrentStep(GENERATION_STEPS.length - 1)
      await new Promise(r => setTimeout(r, 500))
      onGenerated(data.data ?? data)
      onClose()
    } catch (err: unknown) {
      clearInterval(stepInterval)
      devError('[AgentIdentityDashboard] generate error:', err)
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Error al generar la identidad. Intenta nuevamente.')
    } finally {
      setIsGenerating(false)
      setCurrentStep(0)
    }
  }

  const handleClose = () => {
    if (!isGenerating) onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose() }}>
      <DialogContent
        className="max-w-[480px]"
        hideClose={isGenerating}
        onInteractOutside={(e) => { if (isGenerating) e.preventDefault() }}
        onEscapeKeyDown={(e) => { if (isGenerating) e.preventDefault() }}
      >
        <DialogHeader>
          <DialogTitle>Generar Identidad IA</DialogTitle>
          <DialogDescription>
            La IA creará una identidad única con personalidad, historia y comportamientos realistas.
          </DialogDescription>
        </DialogHeader>

        {isGenerating ? (
          <div className="py-4 text-center">
            <CircularProgress size="lg" sx={{ mb: 2 }} />
            <p className="mb-3 text-base font-semibold text-foreground">Generando identidad...</p>
            <div className="mx-auto flex max-w-xs flex-col gap-1.5">
              {GENERATION_STEPS.map((step, index) => (
                <div
                  key={step}
                  className={cn(
                    'flex items-center gap-2 transition-opacity duration-300',
                    index <= currentStep ? 'opacity-100' : 'opacity-30',
                  )}
                >
                  <Circle
                    className={cn(
                      'size-2 shrink-0',
                      index < currentStep
                        ? 'text-success-text'
                        : index === currentStep
                          ? 'text-primary'
                          : 'text-muted-foreground',
                    )}
                    weight="fill"
                    aria-hidden
                  />
                  <span
                    className={cn(
                      'text-sm',
                      index === currentStep ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {error && (
              <div
                role="alert"
                className="rounded-md bg-destructive/12 p-3 text-sm text-destructive-text"
              >
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="gen-niche">Nicho</Label>
              <Select value={niche} onValueChange={(v) => v && setNiche(v as Niche)}>
                <SelectTrigger id="gen-niche" className="h-11">
                  <SelectValue placeholder="Selecciona un nicho" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(NICHE_LABELS) as [Niche, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gen-gender">Género</Label>
              <Select value={gender} onValueChange={(v) => v && setGender(v as Gender)}>
                <SelectTrigger id="gen-gender" className="h-11">
                  <SelectValue placeholder="Selecciona un género" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Femenino</SelectItem>
                  <SelectItem value="male">Masculino</SelectItem>
                  <SelectItem value="non_binary">No binario</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gen-age">Rango de edad</Label>
              <Select value={ageRange} onValueChange={(v) => v && setAgeRange(v as AgeRange)}>
                <SelectTrigger id="gen-age" className="h-11">
                  <SelectValue placeholder="Selecciona un rango" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="18-24">18-24 años</SelectItem>
                  <SelectItem value="25-34">25-34 años</SelectItem>
                  <SelectItem value="35-44">35-44 años</SelectItem>
                  <SelectItem value="45+">45+ años</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gen-platform">Plataforma principal</Label>
              <Select value={platformFocus} onValueChange={(v) => v && setPlatformFocus(v as Platform)}>
                <SelectTrigger id="gen-platform" className="h-11">
                  <SelectValue placeholder="Selecciona una plataforma" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(PLATFORM_LABELS) as [Platform, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-1 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleClose}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleGenerate}>
                <Sparkle className="size-4" weight="fill" aria-hidden />
                Generar Identidad
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AgentIdentityDashboard() {
  const [identities, setIdentities] = useState<AgentIdentity[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  const selectedIdentity = identities.find(i => i.id === selectedId) ?? null

  const fetchIdentities = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/ugc/identities')
      const list: AgentIdentity[] = data.data ?? data ?? []
      setIdentities(list)
      if (list.length > 0 && selectedId === null) {
        setSelectedId(list[0].id)
      }
    } catch (err: unknown) {
      devError('[AgentIdentityDashboard] fetch error:', err)
      setError('No se pudieron cargar las identidades. Verifica tu conexión.')
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    fetchIdentities()
  }, [])

  const handleGenerated = (identity: AgentIdentity) => {
    setIdentities(prev => [identity, ...prev])
    setSelectedId(identity.id)
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="flex w-[280px] shrink-0 flex-col overflow-hidden border-r border-border bg-card">
        {/* Sidebar header */}
        <div className="flex items-center justify-between gap-2 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Identidades IA</h2>
            <p className="text-xs text-muted-foreground">
              {identities.length} identidad{identities.length !== 1 ? 'es' : ''}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualizar identidades"
            className="text-muted-foreground"
            onClick={fetchIdentities}
          >
            <ArrowClockwise className="size-[18px]" aria-hidden />
          </Button>
        </div>

        {/* Sidebar list */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <IdentitySkeletonRow key={i} />)
          ) : error ? (
            <div className="p-4 text-center">
              <p className="text-sm text-destructive-text">{error}</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={fetchIdentities}>
                Reintentar
              </Button>
            </div>
          ) : identities.length === 0 ? (
            <div className="p-4 text-center">
              <User className="mx-auto mb-2 size-10 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">Sin identidades creadas</p>
            </div>
          ) : (
            identities.map(identity => (
              <SidebarIdentityItem
                key={identity.id}
                identity={identity}
                selected={identity.id === selectedId}
                onClick={() => setSelectedId(identity.id)}
              />
            ))
          )}
        </div>

        {/* Sidebar footer — Create button */}
        <div className="border-t border-border p-4">
          <Button className="w-full" onClick={() => setShowModal(true)}>
            <Plus className="size-4" weight="bold" aria-hidden />
            Nueva Identidad
          </Button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Main header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Identidades de Agente
            </h1>
            <p className="text-sm text-muted-foreground">
              Gestiona y monitorea tus identidades IA para UGC Pipeline
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowModal(true)}>
            <Sparkle className="size-4" weight="fill" aria-hidden />
            Generar con IA
          </Button>
        </div>

        {/* Main content area */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <CircularProgress size="lg" />
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
              <h2 className="text-xl font-semibold text-destructive-text">Error al cargar</h2>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button onClick={fetchIdentities}>
                <ArrowClockwise className="size-4" aria-hidden />
                Reintentar
              </Button>
            </div>
          ) : identities.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
              <Sparkle className="size-16 text-muted-foreground" aria-hidden />
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Crea tu primera identidad de agente
              </h2>
              <p className="max-w-[420px] text-sm text-muted-foreground">
                Las identidades IA son perfiles realistas que interactuan en redes sociales para ampliar tu alcance orgánico de forma auténtica.
              </p>
              <Button size="lg" onClick={() => setShowModal(true)}>
                <Plus className="size-5" weight="bold" aria-hidden />
                Crear Primera Identidad
              </Button>
            </div>
          ) : selectedIdentity ? (
            <IdentityProfilePanel identity={selectedIdentity} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">
                Selecciona una identidad del panel lateral
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Generate Modal ── */}
      <GenerateModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onGenerated={handleGenerated}
      />
    </div>
  )
}
