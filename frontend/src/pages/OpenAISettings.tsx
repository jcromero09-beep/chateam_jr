import { useState, useEffect, useCallback, useContext } from 'react'
import { AuthContext } from '../context/Auth/AuthContext'
// [Fase2·G] Conservado como MUI a propósito: no hay equivalente en el design system.
import { CircularProgress } from '@mui/joy'
import {
  Gear,
  FloppyDisk,
  ArrowClockwise,
  Key,
  Plus,
  PencilSimple,
  Trash,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  EyeSlash,
  X,
  // Iconos para capacidades de IA
  TextT,
  Translate,
  Image as ImageIcon,
  Microphone,
  WarningCircle,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatTile } from '@/components/ui/stat-tile'
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
  DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import api from '../services/api'
import { i18n } from "../translate/i18n" // P3.47: i18n support

interface AIProvider {
  id: number
  companyId: number | null  // null = proveedor global (superadmin)
  provider: string
  displayName: string
  apiKey: string
  isActive: boolean
  isDefault: boolean
  connectionStatus: 'pending' | 'connected' | 'error'
  lastConnectionTest: string | null
  settings: {
    baseUrl?: string
    defaultModel?: string
    defaultTemperature?: number
    defaultMaxTokens?: number
    organization?: string
  }
  availableModels: string[]
  createdAt: string
  updatedAt: string
  // Capacidades de IA
  textGenerationEnabled: boolean
  translationEnabled: boolean
  imageGenerationEnabled: boolean
  imageAnalysisEnabled: boolean
  speechToTextEnabled: boolean
  textToSpeechEnabled: boolean
  // Proveedor por defecto para cada capacidad
  isDefaultForText: boolean
  isDefaultForTranslation: boolean
  isDefaultForImages: boolean
  isDefaultForImageAnalysis: boolean
  isDefaultForSTT: boolean
  isDefaultForTTS: boolean
  // Precios por capacidad
  textGenerationPricing: number
  translationPricing: number
  imageGenerationPricing: { [key: string]: number }
  imageAnalysisPricing: number
  speechToTextPricing: number
}

interface FormData {
  provider: string
  displayName: string
  apiKey: string
  isGlobal: boolean  // true = proveedor global (superadmin)
  isActive: boolean
  isDefault: boolean
  settings: {
    baseUrl: string
    defaultModel: string
    defaultTemperature: number
    defaultMaxTokens: number
    organization: string
  }
  // Capacidades de IA
  textGenerationEnabled: boolean
  translationEnabled: boolean
  imageGenerationEnabled: boolean
  imageAnalysisEnabled: boolean
  speechToTextEnabled: boolean
  textToSpeechEnabled: boolean
  // Proveedor por defecto para cada capacidad
  isDefaultForText: boolean
  isDefaultForTranslation: boolean
  isDefaultForImages: boolean
  isDefaultForImageAnalysis: boolean
  isDefaultForSTT: boolean
  isDefaultForTTS: boolean
  // Precios por capacidad
  textGenerationPricing: number
  translationPricing: number
  imageGenerationPricing: { [key: string]: number }
  imageAnalysisPricing: number
  speechToTextPricing: number
}

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI', keyPrefix: 'sk-', baseUrl: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic (Claude)', keyPrefix: 'sk-ant-', baseUrl: 'https://api.anthropic.com/v1' },
  { value: 'google', label: 'Google (Gemini)', keyPrefix: 'AIza', baseUrl: 'https://generativelanguage.googleapis.com/v1' },
  { value: 'azure', label: 'Azure OpenAI', keyPrefix: '', baseUrl: '' },
  { value: 'cohere', label: 'Cohere', keyPrefix: '', baseUrl: 'https://api.cohere.ai/v1' },
  { value: 'mistral', label: 'Mistral AI', keyPrefix: '', baseUrl: 'https://api.mistral.ai/v1' },
  { value: 'deepseek', label: 'DeepSeek', keyPrefix: 'sk-', baseUrl: 'https://api.deepseek.com/v1' },
]

// Helper function to mask API keys for display
const maskApiKey = (key: string | undefined): string => {
  if (!key || key.length < 8) return '****';
  return `${key.substring(0, 4)}****${key.substring(key.length - 4)}`;
};

const initialFormData: FormData = {
  provider: 'openai',
  displayName: '',
  apiKey: '',
  isGlobal: false,  // Por defecto no es global
  isActive: true,
  isDefault: false,
  settings: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    defaultTemperature: 0.7,
    defaultMaxTokens: 2000,
    organization: '',
  },
  // Capacidades de IA por defecto
  textGenerationEnabled: true,
  translationEnabled: false,
  imageGenerationEnabled: false,
  imageAnalysisEnabled: false,
  speechToTextEnabled: false,
  textToSpeechEnabled: false,
  // Proveedor por defecto para cada capacidad
  isDefaultForText: false,
  isDefaultForTranslation: false,
  isDefaultForImages: false,
  isDefaultForImageAnalysis: false,
  isDefaultForSTT: false,
  isDefaultForTTS: false,
  // Precios por defecto
  textGenerationPricing: 2,
  translationPricing: 3,
  imageGenerationPricing: { "1024x1024": 30, "512x512": 20, "256x256": 10 },
  imageAnalysisPricing: 15,
  speechToTextPricing: 10,
}

// Botón de acción de fila (mismo look que RowAction del prototipo, con onClick)
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

// Interruptor accesible (role=switch) — el design system no expone un Switch.
function Toggle({
  checked,
  onCheckedChange,
  label,
  size = 'md',
  id,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  size?: 'sm' | 'md'
  id?: string
}) {
  const sm = size === 'sm'
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-0 p-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        sm ? 'h-6 w-11' : 'h-6 w-11',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block rounded-full bg-card shadow-sm transition-transform',
          sm ? 'size-4' : 'size-5',
          checked
            ? sm
              ? 'translate-x-[22px]'
              : 'translate-x-[22px]'
            : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

// Aviso inline (reemplazo del Alert de Joy) con tokens del design system.
function Notice({
  tone,
  children,
  onDismiss,
}: {
  tone: 'destructive' | 'success' | 'warning'
  children: React.ReactNode
  onDismiss?: () => void
}) {
  const tones = {
    destructive: 'border-destructive/30 bg-destructive/10 text-destructive-text',
    success: 'border-success/30 bg-success/12 text-success-text',
    warning: 'border-warning/30 bg-warning/14 text-warning-text',
  } as const
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm',
        tones[tone],
      )}
    >
      <span className="flex items-start gap-2">
        <WarningCircle className="mt-0.5 size-[18px] shrink-0" aria-hidden />
        <span>{children}</span>
      </span>
      {onDismiss && (
        <button
          type="button"
          aria-label="Cerrar aviso"
          onClick={onDismiss}
          className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-current transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}

// Fila "capacidad" del modal: switch principal + switch de predeterminado.
function CapabilityRow({
  title,
  description,
  enabled,
  onEnabledChange,
  isDefault,
  onDefaultChange,
  defaultLabel,
}: {
  title: string
  description: string
  enabled: boolean
  onEnabledChange: (checked: boolean) => void
  isDefault: boolean
  onDefaultChange: (checked: boolean) => void
  defaultLabel: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Toggle checked={enabled} onCheckedChange={onEnabledChange} label={title} />
      </div>
      {enabled && (
        <div className="mt-2 flex items-center gap-2 pl-2">
          <Toggle
            size="sm"
            checked={isDefault}
            onCheckedChange={onDefaultChange}
            label={defaultLabel}
          />
          <span className="text-xs text-primary">{defaultLabel}</span>
        </div>
      )}
    </div>
  )
}

export default function OpenAISettings() {
  // Cabeceras de la tabla (se resuelven en cada render, como el resto de labels i18n).
  const columns = [
    i18n.t("aiModules.openaiSettings.table.status"),
    i18n.t("aiModules.openaiSettings.table.provider"),
    i18n.t("aiModules.openaiSettings.table.name"),
    i18n.t("aiModules.openaiSettings.table.apiKey"),
    i18n.t("aiModules.openaiSettings.table.active"),
    i18n.t("aiModules.openaiSettings.table.default"),
    i18n.t("aiModules.openaiSettings.table.defaultModel"),
    i18n.t("aiModules.openaiSettings.table.capabilities"),
    i18n.t("aiModules.openaiSettings.table.actions"),
  ]

  // P3.44: Helper para logging solo en desarrollo
  const isDev = import.meta.env.DEV;
  const devLog = (...args: any[]) => {
    if (isDev) console.log(...args);
  };
  const devError = (...args: any[]) => {
    if (isDev) console.error(...args);
  };

  // Obtener contexto de autenticación para detectar superadmin
  const authContext = useContext(AuthContext);
  const isSuperAdmin = authContext?.user?.super === true;

  const [providers, setProviders] = useState<AIProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [openModal, setOpenModal] = useState(false)
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [showApiKey, setShowApiKey] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      devLog('[OpenAISettings] Fetching providers...')
      const response = await api.get('/ai/providers')
      devLog('[OpenAISettings] Providers loaded:', response.data)
      setProviders(response.data)
    } catch (err: any) {
      devError('[OpenAISettings] Error fetching providers:', err)
      setError(err.response?.data?.error || 'Error al cargar proveedores')
    } finally {
      setLoading(false)
    }
  }, []) // 👈 Vacío - devLog y devError no deben ser dependencias

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  const handleCreate = () => {
    setEditingProvider(null)
    setFormData(initialFormData)
    setShowApiKey(false)
    setOpenModal(true)
  }

  const handleEdit = (provider: AIProvider) => {
    devLog('[OpenAISettings] Editing provider:', provider.id)
    setEditingProvider(provider)
    setFormData({
      provider: provider.provider,
      displayName: provider.displayName || (provider as any).name || '',  // Fallback to 'name' if displayName is missing
      apiKey: '', // Never show real API key
      isGlobal: provider.companyId === null,  // Es global si companyId es null
      isActive: provider.isActive,
      isDefault: provider.isDefault,
      settings: {
        baseUrl: provider.settings?.baseUrl || '',
        defaultModel: provider.settings?.defaultModel || '',
        defaultTemperature: provider.settings?.defaultTemperature || 0.7,
        defaultMaxTokens: provider.settings?.defaultMaxTokens || 2000,
        organization: provider.settings?.organization || '',
      },
      // Capacidades de IA
      textGenerationEnabled: provider.textGenerationEnabled ?? true,
      translationEnabled: provider.translationEnabled ?? false,
      imageGenerationEnabled: provider.imageGenerationEnabled ?? false,
      imageAnalysisEnabled: provider.imageAnalysisEnabled ?? false,
      speechToTextEnabled: provider.speechToTextEnabled ?? false,
      textToSpeechEnabled: provider.textToSpeechEnabled ?? false,
      // Proveedor por defecto para cada capacidad
      isDefaultForText: provider.isDefaultForText ?? false,
      isDefaultForTranslation: provider.isDefaultForTranslation ?? false,
      isDefaultForImages: provider.isDefaultForImages ?? false,
      isDefaultForImageAnalysis: provider.isDefaultForImageAnalysis ?? false,
      isDefaultForSTT: provider.isDefaultForSTT ?? false,
      isDefaultForTTS: provider.isDefaultForTTS ?? false,
      // Precios por capacidad
      textGenerationPricing: provider.textGenerationPricing ?? 2,
      translationPricing: provider.translationPricing ?? 3,
      imageGenerationPricing: provider.imageGenerationPricing ?? { "1024x1024": 30, "512x512": 20, "256x256": 10 },
      imageAnalysisPricing: provider.imageAnalysisPricing ?? 15,
      speechToTextPricing: provider.speechToTextPricing ?? 10,
    })
    setShowApiKey(false)
    setOpenModal(true)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      // P1.13: Validar display name (required)
      if (!formData.displayName || formData.displayName.trim().length === 0) {
        setError('El nombre para mostrar es requerido')
        setSaving(false)
        return
      }

      if (formData.displayName.length > 100) {
        setError('El nombre para mostrar no puede exceder 100 caracteres')
        setSaving(false)
        return
      }

      // P1.14: Validar base URL (formato válido)
      if (formData.settings.baseUrl && formData.settings.baseUrl.trim().length > 0) {
        try {
          const url = new URL(formData.settings.baseUrl)

          // Opcionalmente, validar que sea HTTPS (comentado para permitir localhost HTTP)
          // if (url.protocol !== 'https:') {
          //   setError('La Base URL debe usar HTTPS para seguridad')
          //   setSaving(false)
          //   return
          // }

          if (!url.protocol.startsWith('http')) {
            setError('La Base URL debe ser una URL HTTP o HTTPS válida')
            setSaving(false)
            return
          }
        } catch (err) {
          setError('La Base URL no es una URL válida')
          setSaving(false)
          return
        }
      }

      // P1.12: Validar precios (min, max, decimales)
      const pricingFields = [
        { value: formData.textGenerationPricing, name: 'Generación de Texto' },
        { value: formData.translationPricing, name: 'Traducción' },
        { value: formData.imageAnalysisPricing, name: 'Análisis de Imagen' },
        { value: formData.speechToTextPricing, name: 'Speech to Text' }
      ]

      for (const field of pricingFields) {
        if (field.value !== undefined && field.value !== null) {
          const priceNum = Number(field.value)

          if (isNaN(priceNum)) {
            setError(`${field.name}: El precio debe ser un número válido`)
            setSaving(false)
            return
          }

          if (priceNum < 0) {
            setError(`${field.name}: El precio no puede ser negativo`)
            setSaving(false)
            return
          }

          if (priceNum > 1000000) {
            setError(`${field.name}: El precio no puede exceder 1,000,000`)
            setSaving(false)
            return
          }

          // Validar máximo 4 decimales
          if (!Number.isInteger(priceNum * 10000)) {
            setError(`${field.name}: El precio solo puede tener hasta 4 decimales`)
            setSaving(false)
            return
          }
        }
      }

      // Validar image generation pricing (es un objeto)
      if (formData.imageGenerationPricing) {
        for (const [size, price] of Object.entries(formData.imageGenerationPricing)) {
          const priceNum = Number(price)

          if (isNaN(priceNum)) {
            setError(`Generación de Imagen (${size}): El precio debe ser un número válido`)
            setSaving(false)
            return
          }

          if (priceNum < 0) {
            setError(`Generación de Imagen (${size}): El precio no puede ser negativo`)
            setSaving(false)
            return
          }

          if (priceNum > 1000000) {
            setError(`Generación de Imagen (${size}): El precio no puede exceder 1,000,000`)
            setSaving(false)
            return
          }

          if (!Number.isInteger(priceNum * 10000)) {
            setError(`Generación de Imagen (${size}): El precio solo puede tener hasta 4 decimales`)
            setSaving(false)
            return
          }
        }
      }

      // Map displayName to name for backend compatibility
      const payload = {
        ...formData,
        name: formData.displayName, // Backend expects 'name', frontend uses 'displayName'
        // Only include apiKey if it was changed (not empty)
        ...(formData.apiKey ? { apiKey: formData.apiKey } : {}),
        // Enviar companyId: null para proveedores globales
        ...(formData.isGlobal && isSuperAdmin ? { companyId: null } : {}),
      }

      if (editingProvider) {
        devLog('[OpenAISettings] Updating provider:', editingProvider.id)
        await api.put(`/ai/providers/${editingProvider.id}`, payload)
        setSuccess(i18n.t("aiModules.openaiSettings.toasts.updateSuccess"))
      } else {
        devLog('[OpenAISettings] Creating new provider')
        await api.post('/ai/providers', payload)
        setSuccess(i18n.t("aiModules.openaiSettings.toasts.createSuccess"))
      }

      setOpenModal(false)
      fetchProviders()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      devError('[OpenAISettings] Error saving provider:', err)
      setError(err.response?.data?.error || i18n.t("aiModules.openaiSettings.toasts.errorSaving"))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      devLog('[OpenAISettings] Deleting provider:', id)
      await api.delete(`/ai/providers/${id}`)
      setSuccess(i18n.t("aiModules.openaiSettings.toasts.deleteSuccess"))
      setDeleteConfirm(null)
      fetchProviders()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      devError('[OpenAISettings] Error deleting provider:', err)
      setError(err.response?.data?.error || i18n.t("aiModules.openaiSettings.toasts.errorDeleting"))
    }
  }

  const handleTestConnection = async (id: number) => {
    try {
      setTesting(id)
      devLog('[OpenAISettings] Testing connection for provider:', id)
      const response = await api.post(`/ai/providers/${id}/test`)
      devLog('[OpenAISettings] Test result:', response.data)

      if (response.data.success) {
        setSuccess(i18n.t("aiModules.openaiSettings.toasts.testSuccess", { model: response.data.model || 'API' }))
      } else {
        setError(i18n.t("aiModules.openaiSettings.toasts.testError", { error: response.data.error }))
      }
      fetchProviders()
      setTimeout(() => { setSuccess(null); setError(null) }, 5000)
    } catch (err: any) {
      devError('[OpenAISettings] Error testing connection:', err)
      setError(err.response?.data?.error || i18n.t("aiModules.openaiSettings.toasts.errorTesting"))
    } finally {
      setTesting(null)
    }
  }

  const handleProviderChange = (provider: string) => {
    const providerConfig = PROVIDER_OPTIONS.find(p => p.value === provider)
    setFormData({
      ...formData,
      provider,
      displayName: formData.displayName || providerConfig?.label || provider,
      settings: {
        ...formData.settings,
        baseUrl: providerConfig?.baseUrl || '',
      },
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="size-3.5" weight="fill" aria-hidden />
      case 'error':
        return <XCircle className="size-3.5" weight="fill" aria-hidden />
      default:
        return <Clock className="size-3.5" weight="fill" aria-hidden />
    }
  }

  const getStatusVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'connected':
        return 'success'
      case 'error':
        return 'destructive'
      default:
        return 'warning'
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <CircularProgress size="lg" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Gear className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {i18n.t("aiModules.openaiSettings.title")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {i18n.t("aiModules.openaiSettings.description")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchProviders}>
              <ArrowClockwise className="size-4" aria-hidden />
              {i18n.t("aiModules.openaiSettings.buttons.reload")}
            </Button>
            <Button size="sm" onClick={handleCreate}>
              <Plus className="size-4" weight="bold" aria-hidden />
              {i18n.t("aiModules.openaiSettings.buttons.addProvider")}
            </Button>
          </div>
        </div>

        {error && (
          <Notice tone="destructive" onDismiss={() => setError(null)}>
            {error}
          </Notice>
        )}

        {success && (
          <Notice tone="success" onDismiss={() => setSuccess(null)}>
            {success}
          </Notice>
        )}

        {/* Resumen de Proveedores */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label={i18n.t("aiModules.openaiSettings.stats.configured")}
            value={String(providers.length)}
          />
          <StatTile
            label={i18n.t("aiModules.openaiSettings.stats.active")}
            value={String(providers.filter(p => p.isActive).length)}
          />
          <StatTile
            label={i18n.t("aiModules.openaiSettings.stats.connected")}
            value={String(providers.filter(p => p.connectionStatus === 'connected').length)}
            tone="success"
          />
          <StatTile
            label={i18n.t("aiModules.openaiSettings.stats.errors")}
            value={String(providers.filter(p => p.connectionStatus === 'error').length)}
            tone="destructive"
          />
        </div>

        {/* Lista de Proveedores */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Key className="size-5 text-muted-foreground" aria-hidden />
            {i18n.t("aiModules.openaiSettings.table.title")}
          </h2>

          <Notice tone="warning">
            {i18n.t("aiModules.openaiSettings.security.warning")}
          </Notice>

          {providers.length === 0 ? (
            <div className="py-10 text-center">
              <p className="mb-4 text-sm text-muted-foreground">
                {i18n.t("aiModules.openaiSettings.table.empty")}
              </p>
              <Button size="sm" onClick={handleCreate}>
                <Plus className="size-4" weight="bold" aria-hidden />
                {i18n.t("aiModules.openaiSettings.buttons.createFirst")}
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      {columns.map((c, i) => (
                        <th
                          key={i}
                          className={cn(
                            'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                            i === columns.length - 1 && 'text-center',
                          )}
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {providers.map((provider) => (
                      <tr key={provider.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3">
                          <Badge variant={getStatusVariant(provider.connectionStatus)}>
                            {getStatusIcon(provider.connectionStatus)}
                            {provider.connectionStatus === 'connected' ? 'OK' :
                             provider.connectionStatus === 'error' ? i18n.t("aiModules.openaiSettings.status.error") : i18n.t("aiModules.openaiSettings.status.pending")}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {PROVIDER_OPTIONS.find(p => p.value === provider.provider)?.label || provider.provider}
                        </td>
                        <td className="px-4 py-3 text-foreground">{provider.displayName}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {maskApiKey(provider.apiKey)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={provider.isActive ? 'success' : 'neutral'}>
                            {provider.isActive ? i18n.t("aiModules.openaiSettings.common.yes") : i18n.t("aiModules.openaiSettings.common.no")}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={provider.isDefault ? 'primary' : 'neutral'}>
                            {provider.isDefault ? i18n.t("aiModules.openaiSettings.common.yes") : i18n.t("aiModules.openaiSettings.common.no")}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {provider.settings?.defaultModel || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {provider.textGenerationEnabled && (
                              <Badge variant="primary">
                                <TextT className="size-3" aria-hidden />
                                {i18n.t("aiModules.openaiSettings.capabilities.text")}
                              </Badge>
                            )}
                            {provider.translationEnabled && (
                              <Badge variant="success">
                                <Translate className="size-3" aria-hidden />
                                {i18n.t("aiModules.openaiSettings.capabilities.translation")}
                              </Badge>
                            )}
                            {provider.imageGenerationEnabled && (
                              <Badge variant="warning">
                                <ImageIcon className="size-3" aria-hidden />
                                {i18n.t("aiModules.openaiSettings.capabilities.image")}
                              </Badge>
                            )}
                            {provider.imageAnalysisEnabled && (
                              <Badge variant="neutral">
                                <Eye className="size-3" aria-hidden />
                                {i18n.t("aiModules.openaiSettings.capabilities.vision")}
                              </Badge>
                            )}
                            {provider.speechToTextEnabled && (
                              <Badge variant="destructive">
                                <Microphone className="size-3" aria-hidden />
                                {i18n.t("aiModules.openaiSettings.capabilities.stt")}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              loading={testing === provider.id}
                              onClick={() => handleTestConnection(provider.id)}
                            >
                              {i18n.t("aiModules.openaiSettings.common.test")}
                            </Button>
                            <ActionBtn label="Editar" onClick={() => handleEdit(provider)}>
                              <PencilSimple className="size-[18px]" aria-hidden />
                            </ActionBtn>
                            <ActionBtn
                              label="Eliminar"
                              onClick={() => setDeleteConfirm(provider.id)}
                              className="hover:bg-destructive/10 hover:text-destructive-text"
                            >
                              <Trash className="size-[18px]" aria-hidden />
                            </ActionBtn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Crear/Editar */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="max-w-3xl">
          <DialogTitle>
            {editingProvider ? i18n.t("aiModules.openaiSettings.modal.titleEdit") : i18n.t("aiModules.openaiSettings.modal.titleCreate")}
          </DialogTitle>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ai-provider">
                  {i18n.t("aiModules.openaiSettings.modal.providerLabel")}
                </Label>
                <Select
                  value={formData.provider}
                  onValueChange={(val) => handleProviderChange(val)}
                  disabled={!!editingProvider}
                >
                  <SelectTrigger id="ai-provider" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-display-name">
                  {i18n.t("aiModules.openaiSettings.modal.displayNameLabel")}
                </Label>
                <Input
                  id="ai-display-name"
                  required
                  placeholder={i18n.t("aiModules.openaiSettings.modal.displayNamePlaceholder")}
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-api-key">
                {i18n.t("aiModules.openaiSettings.modal.apiKeyLabel")}
                {editingProvider && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    (Dejar vacío para mantener actual: {editingProvider.apiKey})
                  </span>
                )}
              </Label>
              <Input
                id="ai-api-key"
                type={showApiKey ? 'text' : 'password'}
                placeholder={
                  editingProvider
                    ? `Actual: ${editingProvider.apiKey} (dejar vacío para mantener)`
                    : PROVIDER_OPTIONS.find(p => p.value === formData.provider)?.keyPrefix + '...' || i18n.t("aiModules.openaiSettings.modal.apiKeyPlaceholder")
                }
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    aria-label={showApiKey ? 'Ocultar API key' : 'Mostrar API key'}
                    aria-pressed={showApiKey}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showApiKey ? (
                      <EyeSlash className="size-[18px]" aria-hidden />
                    ) : (
                      <Eye className="size-[18px]" aria-hidden />
                    )}
                  </button>
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-base-url">
                {i18n.t("aiModules.openaiSettings.modal.baseUrlLabel")}
              </Label>
              <Input
                id="ai-base-url"
                placeholder={i18n.t("aiModules.openaiSettings.modal.baseUrlPlaceholder")}
                value={formData.settings.baseUrl}
                onChange={(e) => setFormData({
                  ...formData,
                  settings: { ...formData.settings, baseUrl: e.target.value }
                })}
              />
            </div>

            <div className="border-t border-border" />
            <h3 className="text-sm font-semibold text-foreground">
              {i18n.t("aiModules.openaiSettings.modal.settingsTitle")}
            </h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ai-default-model">
                  {i18n.t("aiModules.openaiSettings.modal.defaultModelLabel")}
                </Label>
                <Input
                  id="ai-default-model"
                  placeholder={i18n.t("aiModules.openaiSettings.modal.defaultModelPlaceholder")}
                  value={formData.settings.defaultModel}
                  onChange={(e) => setFormData({
                    ...formData,
                    settings: { ...formData.settings, defaultModel: e.target.value }
                  })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-max-tokens">
                  {i18n.t("aiModules.openaiSettings.modal.maxTokensLabel")}
                </Label>
                <Input
                  id="ai-max-tokens"
                  type="number"
                  value={formData.settings.defaultMaxTokens}
                  onChange={(e) => setFormData({
                    ...formData,
                    settings: { ...formData.settings, defaultMaxTokens: parseInt(e.target.value) || 2000 }
                  })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-temperature">
                {i18n.t("aiModules.openaiSettings.modal.temperatureLabel")}: {formData.settings.defaultTemperature}
              </Label>
              <input
                id="ai-temperature"
                type="range"
                className="h-6 w-full cursor-pointer accent-primary"
                value={formData.settings.defaultTemperature}
                onChange={(e) => setFormData({
                  ...formData,
                  settings: { ...formData.settings, defaultTemperature: parseFloat(e.target.value) }
                })}
                min={0}
                max={2}
                step={0.1}
              />
              <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
                <span>0</span>
                <span>1</span>
                <span>2</span>
              </div>
            </div>

            {formData.provider === 'openai' && (
              <div className="space-y-1.5">
                <Label htmlFor="ai-organization">
                  {i18n.t("aiModules.openaiSettings.modal.organizationLabel")}
                </Label>
                <Input
                  id="ai-organization"
                  placeholder={i18n.t("aiModules.openaiSettings.modal.organizationPlaceholder")}
                  value={formData.settings.organization}
                  onChange={(e) => setFormData({
                    ...formData,
                    settings: { ...formData.settings, organization: e.target.value }
                  })}
                />
              </div>
            )}

            <div className="border-t border-border" />

            {/* Solo superadmin puede crear proveedores globales */}
            {isSuperAdmin && (
              <div className="rounded-lg bg-muted p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Proveedor Global</p>
                    <p className="text-xs text-muted-foreground">
                      Disponible para todas las empresas
                    </p>
                  </div>
                  <Toggle
                    label="Proveedor Global"
                    checked={formData.isGlobal}
                    onCheckedChange={(checked) => setFormData({ ...formData, isGlobal: checked })}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="ai-active">
                  {i18n.t("aiModules.openaiSettings.modal.activeLabel")}
                </Label>
                <Toggle
                  id="ai-active"
                  label={i18n.t("aiModules.openaiSettings.modal.activeLabel")}
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="ai-default">
                  {i18n.t("aiModules.openaiSettings.modal.defaultLabel")}
                </Label>
                <Toggle
                  id="ai-default"
                  label={i18n.t("aiModules.openaiSettings.modal.defaultLabel")}
                  checked={formData.isDefault}
                  onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
                />
              </div>
            </div>

            <div className="border-t border-border" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {i18n.t("aiModules.openaiSettings.modal.capabilitiesTitle")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {i18n.t("aiModules.openaiSettings.modal.capabilitiesDescription")}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {/* Generacion de Texto */}
              <CapabilityRow
                title={i18n.t("aiModules.openaiSettings.modal.textGenerationLabel")}
                description={i18n.t("aiModules.openaiSettings.modal.textGenerationDescription")}
                enabled={formData.textGenerationEnabled}
                onEnabledChange={(checked) => setFormData({
                  ...formData,
                  textGenerationEnabled: checked,
                  isDefaultForText: checked ? formData.isDefaultForText : false
                })}
                isDefault={formData.isDefaultForText}
                onDefaultChange={(checked) => setFormData({ ...formData, isDefaultForText: checked })}
                defaultLabel="Usar como predeterminado para texto"
              />

              {/* Traduccion */}
              <CapabilityRow
                title={i18n.t("aiModules.openaiSettings.modal.translationLabel")}
                description={i18n.t("aiModules.openaiSettings.modal.translationDescription")}
                enabled={formData.translationEnabled}
                onEnabledChange={(checked) => setFormData({
                  ...formData,
                  translationEnabled: checked,
                  isDefaultForTranslation: checked ? formData.isDefaultForTranslation : false
                })}
                isDefault={formData.isDefaultForTranslation}
                onDefaultChange={(checked) => setFormData({ ...formData, isDefaultForTranslation: checked })}
                defaultLabel="Usar como predeterminado para traduccion"
              />

              {/* Generacion de Imagenes */}
              <CapabilityRow
                title={i18n.t("aiModules.openaiSettings.modal.imageGenerationLabel")}
                description={i18n.t("aiModules.openaiSettings.modal.imageGenerationDescription")}
                enabled={formData.imageGenerationEnabled}
                onEnabledChange={(checked) => setFormData({
                  ...formData,
                  imageGenerationEnabled: checked,
                  isDefaultForImages: checked ? formData.isDefaultForImages : false
                })}
                isDefault={formData.isDefaultForImages}
                onDefaultChange={(checked) => setFormData({ ...formData, isDefaultForImages: checked })}
                defaultLabel="Usar como predeterminado para imagenes"
              />

              {/* Analisis de Imagenes (Vision) */}
              <CapabilityRow
                title={i18n.t("aiModules.openaiSettings.modal.imageAnalysisLabel")}
                description={i18n.t("aiModules.openaiSettings.modal.imageAnalysisDescription")}
                enabled={formData.imageAnalysisEnabled}
                onEnabledChange={(checked) => setFormData({
                  ...formData,
                  imageAnalysisEnabled: checked,
                  isDefaultForImageAnalysis: checked ? formData.isDefaultForImageAnalysis : false
                })}
                isDefault={formData.isDefaultForImageAnalysis}
                onDefaultChange={(checked) => setFormData({ ...formData, isDefaultForImageAnalysis: checked })}
                defaultLabel="Usar como predeterminado para Vision AI"
              />

              {/* Speech to Text */}
              <CapabilityRow
                title={i18n.t("aiModules.openaiSettings.modal.speechToTextLabel")}
                description={i18n.t("aiModules.openaiSettings.modal.speechToTextDescription")}
                enabled={formData.speechToTextEnabled}
                onEnabledChange={(checked) => setFormData({
                  ...formData,
                  speechToTextEnabled: checked,
                  isDefaultForSTT: checked ? formData.isDefaultForSTT : false
                })}
                isDefault={formData.isDefaultForSTT}
                onDefaultChange={(checked) => setFormData({ ...formData, isDefaultForSTT: checked })}
                defaultLabel="Usar como predeterminado para STT"
              />

              {/* Text to Speech */}
              <CapabilityRow
                title="Text to Speech (TTS)"
                description="Convertir texto a voz"
                enabled={formData.textToSpeechEnabled}
                onEnabledChange={(checked) => setFormData({
                  ...formData,
                  textToSpeechEnabled: checked,
                  isDefaultForTTS: checked ? formData.isDefaultForTTS : false
                })}
                isDefault={formData.isDefaultForTTS}
                onDefaultChange={(checked) => setFormData({ ...formData, isDefaultForTTS: checked })}
                defaultLabel="Usar como predeterminado para TTS"
              />
            </div>

            {/* Seccion de Precios - Solo se muestra si hay al menos una capacidad habilitada */}
            {(formData.textGenerationEnabled || formData.translationEnabled || formData.imageGenerationEnabled || formData.imageAnalysisEnabled || formData.speechToTextEnabled) && (
              <>
                <div className="border-t border-border" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {i18n.t("aiModules.openaiSettings.modal.pricingTitle")}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {i18n.t("aiModules.openaiSettings.modal.pricingDescription")}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* Precio Texto - solo si textGenerationEnabled */}
                  {formData.textGenerationEnabled && (
                    <div className="space-y-1.5">
                      <Label htmlFor="ai-pricing-text">
                        {i18n.t("aiModules.openaiSettings.modal.pricingTextLabel")}
                      </Label>
                      <Input
                        id="ai-pricing-text"
                        type="number"
                        min={0}
                        step={0.01}
                        value={formData.textGenerationPricing}
                        onChange={(e) => setFormData({ ...formData, textGenerationPricing: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  )}

                  {/* Precio Traduccion - solo si translationEnabled */}
                  {formData.translationEnabled && (
                    <div className="space-y-1.5">
                      <Label htmlFor="ai-pricing-translation">
                        {i18n.t("aiModules.openaiSettings.modal.pricingTranslationLabel")}
                      </Label>
                      <Input
                        id="ai-pricing-translation"
                        type="number"
                        min={0}
                        step={0.01}
                        value={formData.translationPricing}
                        onChange={(e) => setFormData({ ...formData, translationPricing: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  )}

                  {/* Precios Imagenes - solo si imageGenerationEnabled */}
                  {formData.imageGenerationEnabled && (
                    <div className="space-y-3 md:col-span-2">
                      <p className="text-sm font-medium text-foreground">
                        {i18n.t("aiModules.openaiSettings.modal.pricingImageGenerationLabel")}
                      </p>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="ai-pricing-1024">1024x1024</Label>
                          <Input
                            id="ai-pricing-1024"
                            type="number"
                            min={0}
                            value={formData.imageGenerationPricing['1024x1024'] || 30}
                            onChange={(e) => setFormData({
                              ...formData,
                              imageGenerationPricing: { ...formData.imageGenerationPricing, '1024x1024': parseInt(e.target.value) || 0 }
                            })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="ai-pricing-512">512x512</Label>
                          <Input
                            id="ai-pricing-512"
                            type="number"
                            min={0}
                            value={formData.imageGenerationPricing['512x512'] || 20}
                            onChange={(e) => setFormData({
                              ...formData,
                              imageGenerationPricing: { ...formData.imageGenerationPricing, '512x512': parseInt(e.target.value) || 0 }
                            })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="ai-pricing-256">256x256</Label>
                          <Input
                            id="ai-pricing-256"
                            type="number"
                            min={0}
                            value={formData.imageGenerationPricing['256x256'] || 10}
                            onChange={(e) => setFormData({
                              ...formData,
                              imageGenerationPricing: { ...formData.imageGenerationPricing, '256x256': parseInt(e.target.value) || 0 }
                            })}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Precio Vision - solo si imageAnalysisEnabled */}
                  {formData.imageAnalysisEnabled && (
                    <div className="space-y-1.5">
                      <Label htmlFor="ai-pricing-vision">
                        {i18n.t("aiModules.openaiSettings.modal.pricingImageAnalysisLabel")}
                      </Label>
                      <Input
                        id="ai-pricing-vision"
                        type="number"
                        min={0}
                        step={0.01}
                        value={formData.imageAnalysisPricing}
                        onChange={(e) => setFormData({ ...formData, imageAnalysisPricing: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  )}

                  {/* Precio STT - solo si speechToTextEnabled */}
                  {formData.speechToTextEnabled && (
                    <div className="space-y-1.5">
                      <Label htmlFor="ai-pricing-stt">
                        {i18n.t("aiModules.openaiSettings.modal.pricingSpeechToTextLabel")}
                      </Label>
                      <Input
                        id="ai-pricing-stt"
                        type="number"
                        min={0}
                        step={0.01}
                        value={formData.speechToTextPricing}
                        onChange={(e) => setFormData({ ...formData, speechToTextPricing: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="mt-2 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpenModal(false)}>
                {i18n.t("aiModules.openaiSettings.buttons.cancel")}
              </Button>
              <Button size="sm" onClick={handleSave} loading={saving}>
                <FloppyDisk className="size-4" aria-hidden />
                {editingProvider ? i18n.t("aiModules.openaiSettings.buttons.save") : i18n.t("aiModules.openaiSettings.buttons.create")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Eliminacion */}
      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>{i18n.t("aiModules.openaiSettings.delete.title")}</DialogTitle>
          <DialogDescription>
            {i18n.t("aiModules.openaiSettings.delete.message")}
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>
              {i18n.t("aiModules.openaiSettings.buttons.cancel")}
            </Button>
            <Button
              size="sm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              {i18n.t("aiModules.openaiSettings.buttons.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
