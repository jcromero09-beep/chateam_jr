import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Sheet,
  Card,
  Chip,
  Button,
  Divider,
  Input,
  Select,
  Option,
  Stack,
  Switch,
  FormControl,
  FormLabel,
  FormHelperText,
  IconButton,
} from '@mui/joy'
import {
  TuneOutlined as TuneIcon,
  CheckCircle,
  Cancel,
  Visibility,
  VisibilityOff,
  Link as LinkIcon,
  Cloud as CloudIcon,
  Security as SecurityIcon,
  AutoFixHigh as AutoFixIcon,
} from '@mui/icons-material'
import { toast } from 'sonner'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProviderConfig {
  key: string
  label: string
  description: string
  field: string
}

interface UGCSettingsData {
  // Providers
  heygenApiKey: string
  klingApiKey: string
  runwayApiKey: string
  creatomateApiKey: string
  // Cloudinary
  cloudinaryCloudName: string
  cloudinaryApiKey: string
  cloudinaryApiSecret: string
  // Autonomia
  feedbackLoopEnabled: boolean
  optimizationInterval: '2h' | '4h' | '6h' | '12h' | '24h'
  autoApplyHighImpact: boolean
  // Anti-ban
  dailyActionsLimit: string
  cooldownAfterActions: string
  instagramCommentsPerHour: string
  tiktokActionsPerHour: string
}

const SETTINGS_KEY = 'ugc_settings_v1'

const DEFAULT_SETTINGS: UGCSettingsData = {
  heygenApiKey: '',
  klingApiKey: '',
  runwayApiKey: '',
  creatomateApiKey: '',
  cloudinaryCloudName: '',
  cloudinaryApiKey: '',
  cloudinaryApiSecret: '',
  feedbackLoopEnabled: false,
  optimizationInterval: '6h',
  autoApplyHighImpact: false,
  dailyActionsLimit: '100',
  cooldownAfterActions: '15',
  instagramCommentsPerHour: '30',
  tiktokActionsPerHour: '50',
}

const VIDEO_PROVIDERS: ProviderConfig[] = [
  { key: 'heygen',      label: 'HeyGen',       description: 'Avatares IA — Videos con presentadores virtuales realistas',    field: 'heygenApiKey' },
  { key: 'kling',       label: 'Kling AI',      description: 'Video generativo — Convierte texto e imagenes en videos',       field: 'klingApiKey' },
  { key: 'runway',      label: 'Runway ML',     description: 'Cinematic AI — Generacion de video cinematografico de alta calidad', field: 'runwayApiKey' },
  { key: 'creatomate',  label: 'Creatomate',    description: 'Renderizado y composicion automatica de videos',                field: 'creatomateApiKey' },
]

// ─── Helper: maskApiKey ───────────────────────────────────────────────────────

function maskKey(key: string): string {
  if (!key || key.length < 8) return ''
  return key.slice(0, 4) + '•'.repeat(Math.min(key.length - 8, 20)) + key.slice(-4)
}

// ─── Provider Card ─────────────────────────────────────────────────────────────

interface ProviderCardProps {
  provider: ProviderConfig
  value: string
  onChange: (val: string) => void
  onSave: (providerKey: string) => void
  onTest: (providerKey: string) => void
  testLoading: string | null
  saveLoading: string | null
}

function ProviderCard({ provider, value, onChange, onSave, onTest, testLoading, saveLoading }: ProviderCardProps) {
  const [showKey, setShowKey] = useState(false)
  const isConfigured = !!value.trim()

  const PROVIDER_COLORS: Record<string, string> = {
    heygen:     '#1565C0',
    kling:      '#2E7D32',
    runway:     '#6A1B9A',
    creatomate: '#B45309',
  }

  const color = PROVIDER_COLORS[provider.key] ?? '#6B7280'

  return (
    <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: color,
                flexShrink: 0,
              }}
            />
            <Typography level="title-sm" fontWeight="lg">{provider.label}</Typography>
          </Box>
          <Typography level="body-xs" color="neutral">{provider.description}</Typography>
        </Box>
        <Chip
          size="sm"
          variant="soft"
          color={isConfigured ? 'success' : 'neutral'}
          startDecorator={isConfigured ? <CheckCircle sx={{ fontSize: 12 }} /> : <Cancel sx={{ fontSize: 12 }} />}
        >
          {isConfigured ? 'Configurado' : 'No configurado'}
        </Chip>
      </Box>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Input
          type={showKey ? 'text' : 'password'}
          placeholder={`API Key de ${provider.label}...`}
          value={value}
          onChange={e => onChange(e.target.value)}
          endDecorator={
            <IconButton size="sm" variant="plain" color="neutral" onClick={() => setShowKey(s => !s)}>
              {showKey ? <VisibilityOff sx={{ fontSize: 16 }} /> : <Visibility sx={{ fontSize: 16 }} />}
            </IconButton>
          }
          sx={{ flex: 1 }}
        />
      </Box>

      {isConfigured && !showKey && (
        <Typography level="body-xs" color="neutral" sx={{ fontFamily: 'monospace', fontSize: 10 }}>
          {maskKey(value)}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          size="sm"
          variant="outlined"
          color="neutral"
          onClick={() => onTest(provider.key)}
          loading={testLoading === provider.key}
          disabled={!isConfigured || saveLoading === provider.key}
          sx={{ flex: 1 }}
        >
          Probar Conexion
        </Button>
        <Button
          size="sm"
          color="primary"
          onClick={() => onSave(provider.key)}
          loading={saveLoading === provider.key}
          disabled={!value.trim()}
          sx={{ flex: 1 }}
        >
          Guardar
        </Button>
      </Box>
    </Card>
  )
}

// ─── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
      <Box sx={{ color: 'primary.500' }}>{icon}</Box>
      <Box>
        <Typography level="title-md">{title}</Typography>
        {subtitle && <Typography level="body-xs" color="neutral">{subtitle}</Typography>}
      </Box>
    </Box>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UGCSettings() {
  const [settings, setSettings] = useState<UGCSettingsData>(DEFAULT_SETTINGS)
  const [testLoading, setTestLoading] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState<string | null>(null)

  // Cargar desde localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<UGCSettingsData>
        setSettings(prev => ({ ...prev, ...parsed }))
        devLog('[UGCSettings] Configuracion cargada desde localStorage')
      }
    } catch {
      devLog('[UGCSettings] No se pudo cargar configuracion guardada')
    }
  }, [])

  const updateField = <K extends keyof UGCSettingsData>(field: K, value: UGCSettingsData[K]) => {
    setSettings(prev => ({ ...prev, [field]: value }))
  }

  const saveToLocalStorage = (partial?: Partial<UGCSettingsData>) => {
    const toSave = partial ? { ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}'), ...partial } : settings
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(toSave))
  }

  // Obtener el valor del campo de un provider
  const getProviderValue = (fieldName: string): string => {
    return ((settings as unknown) as Record<string, string>)[fieldName] ?? ''
  }

  const setProviderValue = (fieldName: string, value: string) => {
    setSettings(prev => ({ ...prev, [fieldName]: value }))
  }

  const getProviderField = (providerKey: string): string => {
    return VIDEO_PROVIDERS.find(p => p.key === providerKey)?.field ?? ''
  }

  const handleSaveProvider = (providerKey: string) => {
    setSaveLoading(providerKey)
    const field = getProviderField(providerKey)
    const value = getProviderValue(field)
    setTimeout(() => {
      saveToLocalStorage({ [field]: value })
      toast.success(`${VIDEO_PROVIDERS.find(p => p.key === providerKey)?.label} guardado correctamente`)
      setSaveLoading(null)
    }, 600)
  }

  const handleTestProvider = (providerKey: string) => {
    setTestLoading(providerKey)
    setTimeout(() => {
      // Placeholder — cuando el endpoint exista, llamar a /ugc/settings/test/:provider
      const providerLabel = VIDEO_PROVIDERS.find(p => p.key === providerKey)?.label
      toast.info(`Conexion con ${providerLabel} — Endpoint no disponible aun. Se conectara al activar el proveedor.`)
      setTestLoading(null)
    }, 1200)
  }

  const handleSaveCloudinary = () => {
    setSaveLoading('cloudinary')
    setTimeout(() => {
      saveToLocalStorage({
        cloudinaryCloudName: settings.cloudinaryCloudName,
        cloudinaryApiKey: settings.cloudinaryApiKey,
        cloudinaryApiSecret: settings.cloudinaryApiSecret,
      })
      toast.success('Configuracion de Cloudinary guardada')
      setSaveLoading(null)
    }, 600)
  }

  const handleTestCloudinary = () => {
    setTestLoading('cloudinary')
    setTimeout(() => {
      toast.info('Conexion con Cloudinary — Endpoint no disponible aun.')
      setTestLoading(null)
    }, 1200)
  }

  const handleSaveAutonomia = () => {
    saveToLocalStorage({
      feedbackLoopEnabled: settings.feedbackLoopEnabled,
      optimizationInterval: settings.optimizationInterval,
      autoApplyHighImpact: settings.autoApplyHighImpact,
    })
    toast.success('Configuracion de autonomia guardada')
  }

  const handleSaveAntiBan = () => {
    saveToLocalStorage({
      dailyActionsLimit: settings.dailyActionsLimit,
      cooldownAfterActions: settings.cooldownAfterActions,
      instagramCommentsPerHour: settings.instagramCommentsPerHour,
      tiktokActionsPerHour: settings.tiktokActionsPerHour,
    })
    toast.success('Limites anti-ban guardados')
  }

  const cloudinaryConfigured = !!(settings.cloudinaryCloudName && settings.cloudinaryApiKey && settings.cloudinaryApiSecret)

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, mx: 'auto' }}>
      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <TuneIcon sx={{ fontSize: 28, color: 'primary.500' }} />
        <Box>
          <Typography level="h3">Configuracion UGC</Typography>
          <Typography level="body-sm" color="neutral">
            Providers, integraciones y limites del pipeline de contenido
          </Typography>
        </Box>
      </Box>

      <Sheet variant="soft" color="neutral" sx={{ p: 1.5, borderRadius: 'sm', mb: 3 }}>
        <Typography level="body-xs" color="neutral">
          La configuracion se guarda localmente como placeholder. En proximas versiones se sincronizara con el backend via <code>/ugc/settings</code>.
        </Typography>
      </Sheet>

      {/* ═══════════════════════════════════════════════════
          SECCION 1: Providers de Video
      ═══════════════════════════════════════════════════ */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <SectionHeader
          icon={<VideoIcon />}
          title="Providers de Video"
          subtitle="Configura las API keys de los proveedores de generacion de video"
        />

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
            gap: 2,
          }}
        >
          {VIDEO_PROVIDERS.map(provider => (
            <ProviderCard
              key={provider.key}
              provider={provider}
              value={getProviderValue(provider.field)}
              onChange={val => setProviderValue(provider.field, val)}
              onSave={handleSaveProvider}
              onTest={handleTestProvider}
              testLoading={testLoading}
              saveLoading={saveLoading}
            />
          ))}
        </Box>
      </Card>

      {/* ═══════════════════════════════════════════════════
          SECCION 2: Redes Sociales
      ═══════════════════════════════════════════════════ */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <SectionHeader
          icon={<LinkIcon sx={{ fontSize: 22 }} />}
          title="Redes Sociales"
          subtitle="Gestiona las cuentas sociales conectadas al pipeline"
        />

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bgcolor: 'background.level1', borderRadius: 'sm' }}>
          <Box>
            <Typography level="body-sm" fontWeight="md">Cuentas Sociales Conectadas</Typography>
            <Typography level="body-xs" color="neutral">
              Administra las cuentas de Instagram, TikTok, Facebook y YouTube
            </Typography>
          </Box>
          <Button
            size="sm"
            variant="outlined"
            color="primary"
            component="a"
            href="/ugc/social-accounts"
          >
            Gestionar Cuentas
          </Button>
        </Box>
      </Card>

      {/* ═══════════════════════════════════════════════════
          SECCION 3: Cloudinary
      ═══════════════════════════════════════════════════ */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CloudIcon sx={{ fontSize: 22, color: 'primary.500' }} />
            <Box>
              <Typography level="title-md">Cloudinary</Typography>
              <Typography level="body-xs" color="neutral">Almacenamiento y transformacion de assets multimedia</Typography>
            </Box>
          </Box>
          <Chip
            size="sm"
            variant="soft"
            color={cloudinaryConfigured ? 'success' : 'neutral'}
            startDecorator={cloudinaryConfigured ? <CheckCircle sx={{ fontSize: 12 }} /> : <Cancel sx={{ fontSize: 12 }} />}
          >
            {cloudinaryConfigured ? 'Configurado' : 'No configurado'}
          </Chip>
        </Box>

        <Stack spacing={1.5}>
          <FormControl>
            <FormLabel>Cloud Name</FormLabel>
            <Input
              placeholder="my-cloud-name"
              value={settings.cloudinaryCloudName}
              onChange={e => updateField('cloudinaryCloudName', e.target.value)}
            />
          </FormControl>
          <FormControl>
            <FormLabel>API Key</FormLabel>
            <Input
              placeholder="123456789012345"
              value={settings.cloudinaryApiKey}
              onChange={e => updateField('cloudinaryApiKey', e.target.value)}
            />
          </FormControl>
          <FormControl>
            <FormLabel>API Secret</FormLabel>
            <CloudinarySecretInput
              value={settings.cloudinaryApiSecret}
              onChange={val => updateField('cloudinaryApiSecret', val)}
            />
          </FormControl>

          <Box sx={{ display: 'flex', gap: 1, pt: 0.5 }}>
            <Button
              size="sm"
              variant="outlined"
              color="neutral"
              onClick={handleTestCloudinary}
              loading={testLoading === 'cloudinary'}
              disabled={!cloudinaryConfigured || saveLoading === 'cloudinary'}
              sx={{ flex: 1 }}
            >
              Probar Conexion
            </Button>
            <Button
              size="sm"
              color="primary"
              onClick={handleSaveCloudinary}
              loading={saveLoading === 'cloudinary'}
              disabled={!settings.cloudinaryCloudName}
              sx={{ flex: 1 }}
            >
              Guardar
            </Button>
          </Box>
        </Stack>
      </Card>

      {/* ═══════════════════════════════════════════════════
          SECCION 4: Optimizacion Autonoma
      ═══════════════════════════════════════════════════ */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <SectionHeader
          icon={<AutoFixIcon sx={{ fontSize: 22 }} />}
          title="Optimizacion Autonoma"
          subtitle="El sistema analiza resultados y ajusta estrategias automaticamente"
        />

        <Stack spacing={2}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography level="body-sm" fontWeight="md">Feedback loop automatico</Typography>
              <Typography level="body-xs" color="neutral">
                El pipeline analiza metricas de rendimiento y propone mejoras periodicamente
              </Typography>
            </Box>
            <Switch
              checked={settings.feedbackLoopEnabled}
              onChange={e => updateField('feedbackLoopEnabled', e.target.checked)}
              color="primary"
            />
          </Box>

          <Divider />

          <FormControl disabled={!settings.feedbackLoopEnabled}>
            <FormLabel>Intervalo de optimizacion</FormLabel>
            <Select
              value={settings.optimizationInterval}
              onChange={(_, v) => v && updateField('optimizationInterval', v as UGCSettingsData['optimizationInterval'])}
              disabled={!settings.feedbackLoopEnabled}
            >
              <Option value="2h">Cada 2 horas</Option>
              <Option value="4h">Cada 4 horas</Option>
              <Option value="6h">Cada 6 horas</Option>
              <Option value="12h">Cada 12 horas</Option>
              <Option value="24h">Cada 24 horas</Option>
            </Select>
            <FormHelperText>Con que frecuencia el sistema analiza y propone cambios</FormHelperText>
          </FormControl>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography level="body-sm" fontWeight="md">Auto-aplicar recomendaciones de alto impacto</Typography>
              <Typography level="body-xs" color="neutral">
                Aplica automaticamente cambios con impacto estimado mayor al 20% sin aprobacion manual
              </Typography>
            </Box>
            <Switch
              checked={settings.autoApplyHighImpact}
              onChange={e => updateField('autoApplyHighImpact', e.target.checked)}
              color="warning"
              disabled={!settings.feedbackLoopEnabled}
            />
          </Box>

          <Button size="sm" color="primary" onClick={handleSaveAutonomia} sx={{ alignSelf: 'flex-end' }}>
            Guardar Configuracion
          </Button>
        </Stack>
      </Card>

      {/* ═══════════════════════════════════════════════════
          SECCION 5: Limites Anti-Ban
      ═══════════════════════════════════════════════════ */}
      <Card variant="outlined">
        <SectionHeader
          icon={<SecurityIcon sx={{ fontSize: 22 }} />}
          title="Limites Anti-Ban"
          subtitle="Configura los umbrales de actividad para evitar penalizaciones en redes sociales"
        />

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>
          <FormControl>
            <FormLabel>Limite diario de acciones por dispositivo</FormLabel>
            <Input
              type="number"
              value={settings.dailyActionsLimit}
              onChange={e => updateField('dailyActionsLimit', e.target.value)}
              endDecorator={<Typography level="body-xs" color="neutral">acciones/dia</Typography>}
              slotProps={{ input: { min: 1, max: 500 } }}
            />
            <FormHelperText>Recomendado: 80-120 para cuentas nuevas</FormHelperText>
          </FormControl>

          <FormControl>
            <FormLabel>Cooldown despues de X acciones</FormLabel>
            <Input
              type="number"
              value={settings.cooldownAfterActions}
              onChange={e => updateField('cooldownAfterActions', e.target.value)}
              endDecorator={<Typography level="body-xs" color="neutral">minutos</Typography>}
              slotProps={{ input: { min: 1, max: 120 } }}
            />
            <FormHelperText>Pausa automatica para simular comportamiento humano</FormHelperText>
          </FormControl>

          <FormControl>
            <FormLabel>Limite de comentarios/hora en Instagram</FormLabel>
            <Input
              type="number"
              value={settings.instagramCommentsPerHour}
              onChange={e => updateField('instagramCommentsPerHour', e.target.value)}
              endDecorator={<Typography level="body-xs" color="neutral">comentarios/h</Typography>}
              slotProps={{ input: { min: 1, max: 100 } }}
            />
            <FormHelperText>Instagram penaliza sobre los 60 comentarios/hora</FormHelperText>
          </FormControl>

          <FormControl>
            <FormLabel>Limite de acciones/hora en TikTok</FormLabel>
            <Input
              type="number"
              value={settings.tiktokActionsPerHour}
              onChange={e => updateField('tiktokActionsPerHour', e.target.value)}
              endDecorator={<Typography level="body-xs" color="neutral">acciones/h</Typography>}
              slotProps={{ input: { min: 1, max: 200 } }}
            />
            <FormHelperText>TikTok es mas restrictivo — se recomienda maximo 50</FormHelperText>
          </FormControl>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button size="sm" color="primary" onClick={handleSaveAntiBan}>
            Guardar Limites
          </Button>
        </Box>
      </Card>
    </Box>
  )
}

// ─── Sub-componentes auxiliares ───────────────────────────────────────────────

function VideoIcon() {
  return (
    <Box component="span" sx={{ display: 'flex', alignItems: 'center' }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--joy-palette-primary-500)' }}>
        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
      </svg>
    </Box>
  )
}

function CloudinarySecretInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false)
  return (
    <Input
      type={show ? 'text' : 'password'}
      placeholder="API Secret de Cloudinary..."
      value={value}
      onChange={e => onChange(e.target.value)}
      endDecorator={
        <Box
          component="button"
          onClick={() => setShow(s => !s)}
          sx={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            color: 'text.secondary',
            p: 0.25,
          }}
        >
          {show ? <VisibilityOff sx={{ fontSize: 16 }} /> : <Visibility sx={{ fontSize: 16 }} />}
        </Box>
      }
    />
  )
}
