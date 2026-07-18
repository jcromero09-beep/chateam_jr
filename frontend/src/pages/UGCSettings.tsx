import { useState, useEffect } from 'react'
import {
  SlidersHorizontal,
  Cloud,
  ShieldCheck,
  MagicWand,
  LinkSimple,
  VideoCamera,
  CheckCircle,
  XCircle,
  Eye,
  EyeSlash,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProviderConfig {
  key: string
  label: string
  description: string
  field: string
}

interface UGCSettingsData {
  // Providers
  falApiKey: string
  falImageModel: string
  falTextVideoModel: string
  falImageVideoModel: string
  falPremiumVideoModel: string
  falWebhookUrl: string
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
  falApiKey: '',
  falImageModel: 'fal-ai/flux/schnell',
  falTextVideoModel: 'fal-ai/wan-25-preview/text-to-video',
  falImageVideoModel: 'fal-ai/wan-25-preview/image-to-video',
  falPremiumVideoModel: 'fal-ai/seedance/v2/image-to-video',
  falWebhookUrl: '',
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
  { key: 'fal',         label: 'Fal.ai',       description: 'Proveedor base para imagen y video UGC dinamico desde base de datos', field: 'falApiKey' },
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

// ─── Switch (toggle accesible con tokens del design system) ────────────────────

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
  tone?: 'primary' | 'warning'
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
        checked ? (tone === 'warning' ? 'bg-warning' : 'bg-primary') : 'bg-input',
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

// ─── Provider Card ─────────────────────────────────────────────────────────────

interface ProviderCardProps {
  provider: ProviderConfig
  value: string
  onChange: (val: string) => void
  onSave: (providerKey: string) => void
  onTest: (providerKey: string) => void
  testLoading: string | null
  saveLoading: string | null
  configuredOverride?: boolean
}

// Colores de marca por proveedor (identidad, no tokens de superficie)
const PROVIDER_COLORS: Record<string, string> = {
  heygen:     '#1565C0',
  fal:        '#0F766E',
  kling:      '#2E7D32',
  runway:     '#6A1B9A',
  creatomate: '#B45309',
}

function ProviderCard({ provider, value, onChange, onSave, onTest, testLoading, saveLoading, configuredOverride }: ProviderCardProps) {
  const [showKey, setShowKey] = useState(false)
  const isConfigured = configuredOverride || !!value.trim()
  const color = PROVIDER_COLORS[provider.key] ?? '#6B7280'

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="mb-0.5 flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
              aria-hidden
            />
            <span className="text-sm font-semibold text-foreground">{provider.label}</span>
          </div>
          <p className="text-xs text-muted-foreground">{provider.description}</p>
        </div>
        <Badge variant={isConfigured ? 'success' : 'neutral'}>
          {isConfigured
            ? <CheckCircle className="size-3" weight="fill" aria-hidden />
            : <XCircle className="size-3" weight="fill" aria-hidden />}
          {isConfigured ? 'Configurado' : 'No configurado'}
        </Badge>
      </div>

      <Input
        type={showKey ? 'text' : 'password'}
        placeholder={`API Key de ${provider.label}...`}
        value={value}
        onChange={e => onChange(e.target.value)}
        rightSlot={
          <button
            type="button"
            onClick={() => setShowKey(s => !s)}
            aria-label={showKey ? 'Ocultar API Key' : 'Mostrar API Key'}
            aria-pressed={showKey}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showKey ? <EyeSlash className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
          </button>
        }
      />

      {isConfigured && !showKey && (
        <p className="font-mono text-[10px] text-muted-foreground">{maskKey(value)}</p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => onTest(provider.key)}
          loading={testLoading === provider.key}
          disabled={!isConfigured || saveLoading === provider.key}
        >
          Probar Conexion
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={() => onSave(provider.key)}
          loading={saveLoading === provider.key}
          disabled={!isConfigured && provider.key !== 'fal'}
        >
          Guardar
        </Button>
      </div>
    </div>
  )
}

// ─── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
        {icon}
      </span>
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UGCSettings() {
  const [settings, setSettings] = useState<UGCSettingsData>(DEFAULT_SETTINGS)
  const [testLoading, setTestLoading] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState<string | null>(null)
  const [falConfigured, setFalConfigured] = useState(false)

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

    api.get('/ugc/settings')
      .then(({ data }) => {
        const fal = data.data?.fal
        if (!fal) return
        setSettings(prev => ({
          ...prev,
          falApiKey: '',
          falImageModel: fal.settings?.imageModel || prev.falImageModel,
          falTextVideoModel: fal.settings?.textVideoModel || prev.falTextVideoModel,
          falImageVideoModel: fal.settings?.imageVideoModel || prev.falImageVideoModel,
          falPremiumVideoModel: fal.settings?.premiumVideoModel || prev.falPremiumVideoModel,
          falWebhookUrl: fal.settings?.webhookUrl || prev.falWebhookUrl,
        }))
        setFalConfigured(Boolean(fal.configured))
        if (fal.configured) {
          toast.success(`Fal.ai cargado desde base de datos (${fal.apiKeyMasked})`)
        }
      })
      .catch(() => {
        toast.error('No se pudo cargar la configuracion UGC desde backend')
      })
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

  const handleSaveProvider = async (providerKey: string) => {
    setSaveLoading(providerKey)
    const field = getProviderField(providerKey)
    const value = getProviderValue(field)

    if (providerKey === 'fal') {
      try {
        await api.put('/ugc/settings', {
          fal: {
            apiKey: value,
            isActive: true,
            settings: {
              imageModel: settings.falImageModel,
              textVideoModel: settings.falTextVideoModel,
              imageVideoModel: settings.falImageVideoModel,
              premiumVideoModel: settings.falPremiumVideoModel,
              webhookUrl: settings.falWebhookUrl,
            },
          },
        })
        setFalConfigured(true)
        toast.success('Fal.ai guardado en base de datos')
      } catch (err: any) {
        toast.error(err?.response?.data?.message || 'No se pudo guardar Fal.ai')
      } finally {
        setSaveLoading(null)
      }
      return
    }

    setTimeout(() => {
      saveToLocalStorage({ [field]: value })
      toast.success(`${VIDEO_PROVIDERS.find(p => p.key === providerKey)?.label} guardado correctamente`)
      setSaveLoading(null)
    }, 600)
  }

  const handleTestProvider = async (providerKey: string) => {
    setTestLoading(providerKey)
    if (providerKey === 'fal') {
      try {
        const { data } = await api.post('/ugc/settings/test-fal')
        toast.success(data.message || 'Fal.ai listo para el pipeline')
      } catch (err: any) {
        toast.error(err?.response?.data?.message || 'Fal.ai no esta configurado')
      } finally {
        setTestLoading(null)
      }
      return
    }

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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1000px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* ── Header ── */}
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <SlidersHorizontal className="size-6" weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Configuracion UGC</h1>
            <p className="text-sm text-muted-foreground">
              Providers, integraciones y limites del pipeline de contenido
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          La configuracion se guarda localmente como placeholder. En proximas versiones se sincronizara con el backend via{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">/ugc/settings</code>.
        </div>

        {/* Fal.ai base */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <SectionHeader
            icon={<Cloud className="size-5" weight="fill" aria-hidden />}
            title="Fal.ai Base del Pipeline"
            subtitle="Modelo y webhook usados por los jobs UGC sin depender del archivo .env"
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fal-image-model">Modelo imagen</Label>
              <Input id="fal-image-model" value={settings.falImageModel} onChange={e => updateField('falImageModel', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fal-text-video">Texto a video</Label>
              <Input id="fal-text-video" value={settings.falTextVideoModel} onChange={e => updateField('falTextVideoModel', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fal-image-video">Imagen a video</Label>
              <Input id="fal-image-video" value={settings.falImageVideoModel} onChange={e => updateField('falImageVideoModel', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fal-premium">Render premium</Label>
              <Input id="fal-premium" value={settings.falPremiumVideoModel} onChange={e => updateField('falPremiumVideoModel', e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="fal-webhook">Webhook publico</Label>
              <Input id="fal-webhook" value={settings.falWebhookUrl} onChange={e => updateField('falWebhookUrl', e.target.value)} placeholder="https://tu-dominio.com/api/fal/webhook" />
            </div>
          </div>
        </section>

        {/* ═══ SECCION 1: Providers de Video ═══ */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <SectionHeader
            icon={<VideoCamera className="size-5" weight="fill" aria-hidden />}
            title="Providers de Video"
            subtitle="Configura las API keys de los proveedores de generacion de video"
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                configuredOverride={provider.key === 'fal' ? falConfigured : undefined}
              />
            ))}
          </div>
        </section>

        {/* ═══ SECCION 2: Redes Sociales ═══ */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <SectionHeader
            icon={<LinkSimple className="size-5" weight="bold" aria-hidden />}
            title="Redes Sociales"
            subtitle="Gestiona las cuentas sociales conectadas al pipeline"
          />

          <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Cuentas Sociales Conectadas</p>
              <p className="text-xs text-muted-foreground">
                Administra las cuentas de Instagram, TikTok, Facebook y YouTube
              </p>
            </div>
            <a href="/ugc/social-accounts">
              <Button size="sm" variant="outline">Gestionar Cuentas</Button>
            </a>
          </div>
        </section>

        {/* ═══ SECCION 3: Cloudinary ═══ */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <Cloud className="size-5" weight="fill" aria-hidden />
              </span>
              <div>
                <h2 className="text-base font-semibold text-foreground">Cloudinary</h2>
                <p className="text-xs text-muted-foreground">Almacenamiento y transformacion de assets multimedia</p>
              </div>
            </div>
            <Badge variant={cloudinaryConfigured ? 'success' : 'neutral'}>
              {cloudinaryConfigured
                ? <CheckCircle className="size-3" weight="fill" aria-hidden />
                : <XCircle className="size-3" weight="fill" aria-hidden />}
              {cloudinaryConfigured ? 'Configurado' : 'No configurado'}
            </Badge>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cloudinary-cloud">Cloud Name</Label>
              <Input
                id="cloudinary-cloud"
                placeholder="my-cloud-name"
                value={settings.cloudinaryCloudName}
                onChange={e => updateField('cloudinaryCloudName', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cloudinary-key">API Key</Label>
              <Input
                id="cloudinary-key"
                placeholder="123456789012345"
                value={settings.cloudinaryApiKey}
                onChange={e => updateField('cloudinaryApiKey', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cloudinary-secret">API Secret</Label>
              <PasswordInput
                id="cloudinary-secret"
                placeholder="API Secret de Cloudinary..."
                value={settings.cloudinaryApiSecret}
                onChange={e => updateField('cloudinaryApiSecret', e.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={handleTestCloudinary}
                loading={testLoading === 'cloudinary'}
                disabled={!cloudinaryConfigured || saveLoading === 'cloudinary'}
              >
                Probar Conexion
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={handleSaveCloudinary}
                loading={saveLoading === 'cloudinary'}
                disabled={!settings.cloudinaryCloudName}
              >
                Guardar
              </Button>
            </div>
          </div>
        </section>

        {/* ═══ SECCION 4: Optimizacion Autonoma ═══ */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <SectionHeader
            icon={<MagicWand className="size-5" weight="fill" aria-hidden />}
            title="Optimizacion Autonoma"
            subtitle="El sistema analiza resultados y ajusta estrategias automaticamente"
          />

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Feedback loop automatico</p>
                <p className="text-xs text-muted-foreground">
                  El pipeline analiza metricas de rendimiento y propone mejoras periodicamente
                </p>
              </div>
              <Toggle
                ariaLabel="Feedback loop automatico"
                checked={settings.feedbackLoopEnabled}
                onCheckedChange={v => updateField('feedbackLoopEnabled', v)}
              />
            </div>

            <div className="border-t border-border" />

            <div className={cn('space-y-1.5', !settings.feedbackLoopEnabled && 'opacity-55')}>
              <Label htmlFor="opt-interval">Intervalo de optimizacion</Label>
              <Select
                value={settings.optimizationInterval}
                onValueChange={v => updateField('optimizationInterval', v as UGCSettingsData['optimizationInterval'])}
                disabled={!settings.feedbackLoopEnabled}
              >
                <SelectTrigger id="opt-interval" className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2h">Cada 2 horas</SelectItem>
                  <SelectItem value="4h">Cada 4 horas</SelectItem>
                  <SelectItem value="6h">Cada 6 horas</SelectItem>
                  <SelectItem value="12h">Cada 12 horas</SelectItem>
                  <SelectItem value="24h">Cada 24 horas</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Con que frecuencia el sistema analiza y propone cambios</p>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Auto-aplicar recomendaciones de alto impacto</p>
                <p className="text-xs text-muted-foreground">
                  Aplica automaticamente cambios con impacto estimado mayor al 20% sin aprobacion manual
                </p>
              </div>
              <Toggle
                ariaLabel="Auto-aplicar recomendaciones de alto impacto"
                tone="warning"
                checked={settings.autoApplyHighImpact}
                onCheckedChange={v => updateField('autoApplyHighImpact', v)}
                disabled={!settings.feedbackLoopEnabled}
              />
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={handleSaveAutonomia}>Guardar Configuracion</Button>
            </div>
          </div>
        </section>

        {/* ═══ SECCION 5: Limites Anti-Ban ═══ */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <SectionHeader
            icon={<ShieldCheck className="size-5" weight="fill" aria-hidden />}
            title="Limites Anti-Ban"
            subtitle="Configura los umbrales de actividad para evitar penalizaciones en redes sociales"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="daily-limit">Limite diario de acciones por dispositivo</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="daily-limit"
                  type="number"
                  min={1}
                  max={500}
                  value={settings.dailyActionsLimit}
                  onChange={e => updateField('dailyActionsLimit', e.target.value)}
                />
                <span className="whitespace-nowrap text-xs text-muted-foreground">acciones/dia</span>
              </div>
              <p className="text-xs text-muted-foreground">Recomendado: 80-120 para cuentas nuevas</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cooldown">Cooldown despues de X acciones</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="cooldown"
                  type="number"
                  min={1}
                  max={120}
                  value={settings.cooldownAfterActions}
                  onChange={e => updateField('cooldownAfterActions', e.target.value)}
                />
                <span className="whitespace-nowrap text-xs text-muted-foreground">minutos</span>
              </div>
              <p className="text-xs text-muted-foreground">Pausa automatica para simular comportamiento humano</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ig-comments">Limite de comentarios/hora en Instagram</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="ig-comments"
                  type="number"
                  min={1}
                  max={100}
                  value={settings.instagramCommentsPerHour}
                  onChange={e => updateField('instagramCommentsPerHour', e.target.value)}
                />
                <span className="whitespace-nowrap text-xs text-muted-foreground">comentarios/h</span>
              </div>
              <p className="text-xs text-muted-foreground">Instagram penaliza sobre los 60 comentarios/hora</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tiktok-actions">Limite de acciones/hora en TikTok</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="tiktok-actions"
                  type="number"
                  min={1}
                  max={200}
                  value={settings.tiktokActionsPerHour}
                  onChange={e => updateField('tiktokActionsPerHour', e.target.value)}
                />
                <span className="whitespace-nowrap text-xs text-muted-foreground">acciones/h</span>
              </div>
              <p className="text-xs text-muted-foreground">TikTok es mas restrictivo — se recomienda maximo 50</p>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button size="sm" onClick={handleSaveAntiBan}>Guardar Limites</Button>
          </div>
        </section>
      </div>
    </div>
  )
}
