import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Sheet,
  Card,
  Chip,
  Avatar,
  Button,
  LinearProgress,
  IconButton,
  Modal,
  ModalDialog,
  ModalClose,
  Select,
  Option,
  FormControl,
  FormLabel,
  CircularProgress,
  Divider,
} from '@mui/joy'
import {
  Add,
  Person,
  AutoAwesome,
  Instagram,
  Videocam,
  Refresh,
  Circle,
  TrendingUp,
  Psychology,
  Group,
  LocationOn,
  Cake,
} from '@mui/icons-material'
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

const PLATFORM_COLORS: Record<Platform, string> = {
  instagram: '#E1306C',
  tiktok: '#010101',
  youtube: '#FF0000',
  twitter: '#1DA1F2',
  multi: '#6B48FF',
}

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

function PlatformIcon({ platform }: { platform: Platform }) {
  const color = PLATFORM_COLORS[platform]
  switch (platform) {
    case 'instagram': return <Instagram sx={{ color, fontSize: 16 }} />
    case 'youtube':   return <Videocam sx={{ color, fontSize: 16 }} />
    default:          return <Person sx={{ color, fontSize: 16 }} />
  }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

function IdentitySkeletonRow() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 'sm' }}>
      <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: 'neutral.100' }} />
      <Box sx={{ flex: 1 }}>
        <Box sx={{ width: '60%', height: 12, borderRadius: 4, bgcolor: 'neutral.100', mb: 0.5 }} />
        <Box sx={{ width: '40%', height: 10, borderRadius: 4, bgcolor: 'neutral.100' }} />
      </Box>
    </Box>
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
    <Box
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.5,
        borderRadius: 'sm',
        cursor: 'pointer',
        bgcolor: selected ? 'primary.softBg' : 'transparent',
        '&:hover': { bgcolor: selected ? 'primary.softBg' : 'neutral.softBg' },
        transition: 'background-color 0.15s',
      }}
    >
      <Box sx={{ position: 'relative', flexShrink: 0 }}>
        <Avatar
          src={identity.avatarUrl}
          sx={{ width: 36, height: 36, fontSize: 14 }}
        >
          {identity.name.charAt(0)}
        </Avatar>
        <Circle
          sx={{
            position: 'absolute',
            bottom: -1,
            right: -1,
            fontSize: 10,
            color: identity.isOnline ? 'success.500' : 'neutral.400',
          }}
        />
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
          <Typography level="body-xs" fontWeight="lg" noWrap sx={{ flex: 1 }}>
            {identity.name}
          </Typography>
          <PlatformIcon platform={identity.platform} />
        </Box>
        <Typography level="body-xs" color="neutral" noWrap>
          @{identity.handle}
        </Typography>
        <Typography level="body-xs" color="neutral" sx={{ fontSize: 10 }}>
          {formatNumber(identity.interactionsToday)} interacciones hoy
        </Typography>
      </Box>
    </Box>
  )
}

// ─── Main Profile Panel ───────────────────────────────────────────────────────

function IdentityProfilePanel({ identity }: { identity: AgentIdentity }) {
  const statCards = [
    { label: 'Seguidores', value: formatNumber(identity.followers), icon: <Group sx={{ fontSize: 20 }} /> },
    { label: 'Engagement', value: `${identity.engagementRate}%`, icon: <TrendingUp sx={{ fontSize: 20 }} /> },
    { label: 'Hoy', value: formatNumber(identity.interactionsToday), icon: <AutoAwesome sx={{ fontSize: 20 }} /> },
  ]

  return (
    <Box sx={{ p: 3, height: '100%', overflowY: 'auto' }}>
      {/* Header card */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2.5 }}>
          <Avatar
            src={identity.avatarUrl}
            sx={{ width: 100, height: 100, fontSize: 36, flexShrink: 0 }}
          >
            {identity.name.charAt(0)}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
              <Typography level="h4">{identity.name}</Typography>
              <Chip
                size="sm"
                variant="soft"
                color="primary"
                startDecorator={<PlatformIcon platform={identity.platform} />}
              >
                {PLATFORM_LABELS[identity.platform]}
              </Chip>
              <Chip size="sm" variant="soft" color="success">
                {NICHE_LABELS[identity.niche]}
              </Chip>
            </Box>

            <Typography level="body-sm" color="neutral" sx={{ mb: 0.75 }}>
              @{identity.handle}
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <LocationOn sx={{ fontSize: 14, color: 'text.tertiary' }} />
                <Typography level="body-xs" color="neutral">{identity.city}</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Cake sx={{ fontSize: 14, color: 'text.tertiary' }} />
                <Typography level="body-xs" color="neutral">{identity.age} años</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Circle sx={{ fontSize: 10, color: identity.isOnline ? 'success.500' : 'neutral.400' }} />
                <Typography level="body-xs" color="neutral">
                  {identity.isOnline ? 'En línea' : 'Desconectada'}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Typography level="body-sm" color="neutral" sx={{ lineHeight: 1.6 }}>
          {identity.bio}
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
          {identity.personalityTraits.map(trait => (
            <Chip key={trait} size="sm" variant="outlined" color="neutral">
              {trait}
            </Chip>
          ))}
        </Box>
      </Card>

      {/* Stat cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, mb: 3 }}>
        {statCards.map(stat => (
          <Card key={stat.label} variant="soft" sx={{ textAlign: 'center', p: 2 }}>
            <Box sx={{ color: 'primary.500', mb: 0.5 }}>{stat.icon}</Box>
            <Typography level="h3" sx={{ fontWeight: 700, lineHeight: 1 }}>{stat.value}</Typography>
            <Typography level="body-xs" color="neutral">{stat.label}</Typography>
          </Card>
        ))}
      </Box>

      {/* Two-column grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        {/* Personality column */}
        <Card variant="outlined">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Psychology sx={{ fontSize: 18, color: 'primary.500' }} />
            <Typography level="title-sm">Personalidad</Typography>
          </Box>

          <Typography level="body-xs" color="neutral" fontWeight="md" sx={{ mb: 0.75 }}>
            Intereses
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
            {identity.interests.map(i => (
              <Chip key={i} size="sm" variant="soft" color="primary">{i}</Chip>
            ))}
          </Box>

          <Typography level="body-xs" color="neutral" fontWeight="md" sx={{ mb: 0.75 }}>
            Frases típicas
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {identity.catchphrases.map(phrase => (
              <Typography key={phrase} level="body-xs" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                "{phrase}"
              </Typography>
            ))}
          </Box>
        </Card>

        {/* Activity column */}
        <Card variant="outlined">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <TrendingUp sx={{ fontSize: 18, color: 'success.500' }} />
            <Typography level="title-sm">Actividad</Typography>
          </Box>

          <Typography level="body-xs" color="neutral" fontWeight="md" sx={{ mb: 0.5 }}>
            Nivel de actividad
          </Typography>
          <Box sx={{ mb: 1.5 }}>
            <LinearProgress
              determinate
              value={identity.activityScore}
              color={identity.activityScore >= 70 ? 'success' : identity.activityScore >= 40 ? 'warning' : 'danger'}
              sx={{ mb: 0.5 }}
            />
            <Typography level="body-xs" color="neutral">{identity.activityScore}%</Typography>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            {[
              { label: 'Total interacciones', value: formatNumber(identity.interactionsTotal) },
              { label: 'Hoy', value: formatNumber(identity.interactionsToday) },
              { label: 'Engagement', value: `${identity.engagementRate}%` },
              { label: 'Seguidores', value: formatNumber(identity.followers) },
            ].map(item => (
              <Box key={item.label} sx={{ textAlign: 'center', p: 1, bgcolor: 'background.level1', borderRadius: 'sm' }}>
                <Typography level="body-xs" fontWeight="lg">{item.value}</Typography>
                <Typography level="body-xs" color="neutral" sx={{ fontSize: 10 }}>{item.label}</Typography>
              </Box>
            ))}
          </Box>
        </Card>
      </Box>
    </Box>
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
    <Modal open={open} onClose={handleClose}>
      <ModalDialog sx={{ width: 480, maxWidth: '95vw' }}>
        {!isGenerating && <ModalClose />}
        <Typography level="h4" sx={{ mb: 0.5 }}>
          Generar Identidad IA
        </Typography>
        <Typography level="body-sm" color="neutral" sx={{ mb: 2.5 }}>
          La IA creará una identidad única con personalidad, historia y comportamientos realistas.
        </Typography>

        {isGenerating ? (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <CircularProgress size="lg" sx={{ mb: 2 }} />
            <Typography level="title-md" sx={{ mb: 1 }}>
              Generando identidad...
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {GENERATION_STEPS.map((step, index) => (
                <Box
                  key={step}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    opacity: index <= currentStep ? 1 : 0.3,
                    transition: 'opacity 0.4s',
                  }}
                >
                  <Circle
                    sx={{
                      fontSize: 8,
                      color: index < currentStep ? 'success.500' : index === currentStep ? 'primary.500' : 'neutral.400',
                    }}
                  />
                  <Typography level="body-sm" color={index === currentStep ? 'primary' : 'neutral'}>
                    {step}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {error && (
              <Sheet
                variant="soft"
                color="danger"
                sx={{ p: 1.5, borderRadius: 'sm' }}
              >
                <Typography level="body-sm" color="danger">{error}</Typography>
              </Sheet>
            )}

            <FormControl>
              <FormLabel>Nicho</FormLabel>
              <Select
                value={niche}
                onChange={(_, v) => v && setNiche(v)}
              >
                {(Object.entries(NICHE_LABELS) as [Niche, string][]).map(([k, v]) => (
                  <Option key={k} value={k}>{v}</Option>
                ))}
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel>Género</FormLabel>
              <Select
                value={gender}
                onChange={(_, v) => v && setGender(v)}
              >
                <Option value="female">Femenino</Option>
                <Option value="male">Masculino</Option>
                <Option value="non_binary">No binario</Option>
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel>Rango de edad</FormLabel>
              <Select
                value={ageRange}
                onChange={(_, v) => v && setAgeRange(v)}
              >
                <Option value="18-24">18-24 años</Option>
                <Option value="25-34">25-34 años</Option>
                <Option value="35-44">35-44 años</Option>
                <Option value="45+">45+ años</Option>
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel>Plataforma principal</FormLabel>
              <Select
                value={platformFocus}
                onChange={(_, v) => v && setPlatformFocus(v)}
              >
                {(Object.entries(PLATFORM_LABELS) as [Platform, string][]).map(([k, v]) => (
                  <Option key={k} value={k}>{v}</Option>
                ))}
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
              <Button variant="outlined" color="neutral" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                startDecorator={<AutoAwesome />}
                onClick={handleGenerate}
              >
                Generar Identidad
              </Button>
            </Box>
          </Box>
        )}
      </ModalDialog>
    </Modal>
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
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ── Sidebar ── */}
      <Sheet
        variant="outlined"
        sx={{
          width: 280,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid',
          borderColor: 'divider',
          borderRadius: 0,
          overflow: 'hidden',
        }}
      >
        {/* Sidebar header */}
        <Box
          sx={{
            p: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box>
            <Typography level="title-md">Identidades IA</Typography>
            <Typography level="body-xs" color="neutral">
              {identities.length} identidad{identities.length !== 1 ? 'es' : ''}
            </Typography>
          </Box>
          <IconButton size="sm" variant="plain" color="neutral" onClick={fetchIdentities}>
            <Refresh sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        {/* Sidebar list */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }}>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <IdentitySkeletonRow key={i} />)
          ) : error ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography level="body-sm" color="danger">{error}</Typography>
              <Button size="sm" variant="plain" onClick={fetchIdentities} sx={{ mt: 1 }}>
                Reintentar
              </Button>
            </Box>
          ) : identities.length === 0 ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Person sx={{ fontSize: 40, color: 'text.tertiary', mb: 1 }} />
              <Typography level="body-sm" color="neutral">
                Sin identidades creadas
              </Typography>
            </Box>
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
        </Box>

        {/* Sidebar footer — Create button */}
        <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button
            fullWidth
            startDecorator={<Add />}
            onClick={() => setShowModal(true)}
          >
            Nueva Identidad
          </Button>
        </Box>
      </Sheet>

      {/* ── Main content ── */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Main header */}
        <Box
          sx={{
            px: 3,
            py: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box>
            <Typography level="h3">Identidades de Agente</Typography>
            <Typography level="body-sm" color="neutral">
              Gestiona y monitorea tus identidades IA para UGC Pipeline
            </Typography>
          </Box>
          <Button
            variant="outlined"
            color="neutral"
            startDecorator={<AutoAwesome />}
            size="sm"
            onClick={() => setShowModal(true)}
          >
            Generar con IA
          </Button>
        </Box>

        {/* Main content area */}
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          {loading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <CircularProgress size="lg" />
            </Box>
          ) : error ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
              <Typography level="h4" color="danger">Error al cargar</Typography>
              <Typography level="body-md" color="neutral">{error}</Typography>
              <Button onClick={fetchIdentities} startDecorator={<Refresh />}>
                Reintentar
              </Button>
            </Box>
          ) : identities.length === 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, p: 4 }}>
              <AutoAwesome sx={{ fontSize: 64, color: 'text.tertiary' }} />
              <Typography level="h3" textAlign="center">
                Crea tu primera identidad de agente
              </Typography>
              <Typography level="body-md" color="neutral" textAlign="center" sx={{ maxWidth: 420 }}>
                Las identidades IA son perfiles realistas que interactuan en redes sociales para ampliar tu alcance orgánico de forma auténtica.
              </Typography>
              <Button
                size="lg"
                startDecorator={<Add />}
                onClick={() => setShowModal(true)}
              >
                Crear Primera Identidad
              </Button>
            </Box>
          ) : selectedIdentity ? (
            <IdentityProfilePanel identity={selectedIdentity} />
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography level="body-md" color="neutral">
                Selecciona una identidad del panel lateral
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* ── Generate Modal ── */}
      <GenerateModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onGenerated={handleGenerated}
      />
    </Box>
  )
}
