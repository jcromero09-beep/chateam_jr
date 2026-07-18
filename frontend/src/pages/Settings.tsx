import { useState, useEffect } from 'react'
import {
  Gear,
  FloppyDisk,
  WhatsappLogo,
  Timer,
  ChatCircleDots,
  ShieldCheck,
  UsersThree,
  CreditCard,
  Megaphone,
  Palette,
  ArrowCounterClockwise,
  Bell,
  Plus,
  Trash,
  Phone,
  Cloud,
} from '@phosphor-icons/react'
import { toast } from 'react-toastify'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import api from '../services/api'
import authService from '../services/authService'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import { useThemeColors } from '../context/ThemeContext'

/* ── Primitivas locales de presentación (design system: tokens + Tailwind) ──
   Van a nivel de módulo (no dentro de Settings) para no remontar en cada render
   y no perder el foco de los inputs. */

const textareaClass =
  'w-full min-h-[80px] resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors [font-family:inherit] placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-55'

/** Separador (equivale al Divider de Joy). */
function Divider({ className }: { className?: string }) {
  return <hr className={cn('m-0 h-px w-full border-0 bg-border', className)} />
}

/** Panel informativo (equivale a bgcolor: background.level1). */
function InfoPanel({
  title,
  className,
  children,
}: {
  title?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('rounded-lg border border-border bg-muted/40 p-4', className)}>
      {title && <p className="mb-1.5 text-sm font-semibold text-foreground">{title}</p>}
      {children}
    </div>
  )
}

/** Switch accesible (role=switch). No existe wrapper en @/components/ui. */
function SettingSwitch({
  checked,
  onCheckedChange,
  disabled,
  label,
  id,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  label: string
  id?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-0 p-0 outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-55',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'pointer-events-none block size-5 rounded-full bg-card shadow-sm ring-1 ring-inset ring-black/10 transition-transform dark:ring-white/15',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
        aria-hidden
      />
    </button>
  )
}

/** Fila título + descripción + switch (patrón repetido ~20 veces). */
function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  title: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <SettingSwitch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        label={title}
      />
    </div>
  )
}

/** Campo de formulario (equivale a FormControl + FormLabel + FormHelperText). */
function Field({
  label,
  htmlFor,
  helper,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  helper?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </div>
  )
}

/** Lista de teléfonos destino + alta (usado en las 2 alertas de WhatsApp). */
function PhoneAlertField({
  id,
  helper,
  phones,
  draft,
  onDraftChange,
  onAdd,
  onRemove,
}: {
  id: string
  helper: string
  phones: string[]
  draft: string
  onDraftChange: (value: string) => void
  onAdd: () => void
  onRemove: (idx: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Números de teléfono destino</Label>
      <p className="text-xs text-muted-foreground">{helper}</p>

      {phones.length > 0 && (
        <ul className="m-0 list-none space-y-1 p-0">
          {phones.map((phone: string, idx: number) => (
            <li
              key={idx}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
            >
              <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex-1 text-sm text-foreground">{phone.trim()}</span>
              <button
                type="button"
                aria-label={`Eliminar el número ${phone.trim()}`}
                title="Eliminar"
                onClick={() => onRemove(idx)}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-text"
              >
                <Trash className="size-[18px]" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-start gap-2">
        {/* El wrapper de <Input/> es un div interno: el flex-1 va aquí, no en la clase del input. */}
        <div className="flex-1">
          <Input
            id={id}
            type="tel"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value.replace(/[^0-9+]/g, ''))}
            placeholder="521234567890"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) {
                e.preventDefault()
                onAdd()
              }
            }}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!draft.trim()}
          onClick={onAdd}
          className="h-11"
        >
          <Plus className="size-4" weight="bold" aria-hidden />
          Agregar
        </Button>
      </div>
    </div>
  )
}
type MetaConversionPolicyKey =
  | 'purchase'
  | 'complete_registration'
  | 'start_trial'
  | 'login'
  | 'website_lead'
  | 'campaign_message_lead'
  | 'kanban_legacy_lead'
  | 'kanban_custom_conversion'
  | 'appointment_booked'

type MetaAdAccount = {
  id: string // viene como act_123456789
  name?: string
  account_status?: number
  currency?: string
  business?: { id?: string; name?: string }
}

type MetaConversionPolicy = {
  eventKey: MetaConversionPolicyKey
  enabled: boolean
  conversionName: string
  source?: 'company_override' | 'default' | 'default_fallback'
  reason?: string
  settingId?: number
}

type MetaPolicyCompanyOption = {
  id: number
  name: string
}

const META_CONVERSION_POLICY_COMPANY_IDS = [1, 8]
const BUSINESS_META_CONVERSION_POLICY_KEYS: MetaConversionPolicyKey[] = [
  'purchase',
  'campaign_message_lead',
  'kanban_custom_conversion',
  'appointment_booked'
]

const META_CONVERSION_POLICY_COPY: Record<MetaConversionPolicyKey, {
  title: string
  description: string
  defaultEnabled: boolean
  defaultName: string
  risk?: string
  codeLabel?: string
}> = {
  purchase: {
    title: 'Purchase / Venta',
    defaultEnabled: true,
    defaultName: 'Venta',
    description: 'Envía la conversión cuando se registra una compra o pago confirmado.'
  },
  complete_registration: {
    title: 'Registro de cliente',
    defaultEnabled: true,
    defaultName: 'Registro de cliente',
    description: 'Envía la conversión cuando una empresa o cliente queda registrado en Chateam.'
  },
  start_trial: {
    title: 'Inicio de prueba',
    defaultEnabled: true,
    defaultName: 'Inicio de prueba',
    description: 'Envía la conversión cuando inicia la prueba o se completa el flujo inicial configurado.'
  },
  login: {
    title: 'Login',
    defaultEnabled: true,
    defaultName: 'Login',
    description: 'Envía la conversión cada vez que un usuario inicia sesión.'
  },
  website_lead: {
    title: 'Lead website/system',
    defaultEnabled: false,
    defaultName: 'Lead',
    description: 'Permite enviar Leads genéricos generados por flujos internos o website.',
    risk: 'Actívalo solo si esa empresa realmente usa ese Lead, para evitar ruido en Meta.'
  },
  campaign_message_lead: {
    title: 'Lead por mensaje de campaña',
    defaultEnabled: false,
    defaultName: 'Lead de campaña',
    description: 'Envía Lead cuando entra un mensaje desde anuncio/campaña Click-to-WhatsApp.',
    risk: 'Si ya optimizas por otra conversión del mismo flujo, revisa que no duplique medición.'
  },
  kanban_legacy_lead: {
    title: 'Lead Funnel legacy',
    defaultEnabled: false,
    defaultName: 'Lead Funnel legacy',
    description: 'Envía el Lead antiguo cuando un ticket cae en una etapa del Funnel de ventas.',
    risk: 'Normalmente debe quedar apagado si usas conversiones de Funnel personalizadas.',
    codeLabel: 'funnel_legacy_lead'
  },
  kanban_custom_conversion: {
    title: 'Conversiones de Funnel personalizadas',
    defaultEnabled: true,
    defaultName: 'Conversión de Funnel personalizada',
    description: 'Permite enviar la conversión configurada en cada etapa del Funnel de ventas con su propio evento/regla.',
    codeLabel: 'funnel_custom_conversion'
  },
  appointment_booked: {
    title: 'Cita agendada (Schedule)',
    defaultEnabled: true,
    defaultName: 'Cita agendada',
    description: 'Envía el evento Schedule a Meta cuando se reserva una cita desde una conversación. Si el servicio tiene precio, lo incluye como valor.',
    codeLabel: 'appointment_booked'
  }
}

const VISIBLE_META_CONVERSION_POLICY_KEYS = (
  Object.keys(META_CONVERSION_POLICY_COPY) as MetaConversionPolicyKey[]
).filter(eventKey => eventKey !== 'website_lead')

const getVisibleMetaConversionPolicyKeys = (companyId: number): MetaConversionPolicyKey[] => {
  if (META_CONVERSION_POLICY_COMPANY_IDS.includes(companyId)) {
    return VISIBLE_META_CONVERSION_POLICY_KEYS
  }

  return BUSINESS_META_CONVERSION_POLICY_KEYS
}

export default function Settings() {
  const { user, loading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()
  const { setColors } = useThemeColors()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newAlertPhone, setNewAlertPhone] = useState('')
  const [newExpirationAlertPhone, setNewExpirationAlertPhone] = useState('')
  const [metaConversionPolicies, setMetaConversionPolicies] = useState<MetaConversionPolicy[]>([])
  const [loadingMetaPolicies, setLoadingMetaPolicies] = useState(false)
  const [savingMetaPolicy, setSavingMetaPolicy] = useState<string | null>(null)
  const [metaPolicyCompanies, setMetaPolicyCompanies] = useState<MetaPolicyCompanyOption[]>([])
  const [selectedMetaPolicyCompanyId, setSelectedMetaPolicyCompanyId] = useState<number | ''>('')
  const [whatsappConnections, setWhatsappConnections] = useState<Array<{
    id: number;
    name: string;
    status: string;
    number: string;
    channel: string;
    Company?: { id: number; name: string };
  }>>([])
  const [activeTab, setActiveTab] = useState(0)
  const selectedMetaPolicyCompanyNumber = Number(selectedMetaPolicyCompanyId || user?.companyId || 0)
  const visibleMetaConversionPolicyKeys = getVisibleMetaConversionPolicyKeys(selectedMetaPolicyCompanyNumber)

  const [settings, setSettings] = useState({
    // Configuraciones de Tickets
    hoursCloseTicketsAuto: '24',
    DirectTicketsToWallets: false,
    closeTicketOnTransfer: false,
    requireQueueOnAccept: 'disabled', // 'enabled' | 'disabled' — exige cola al aceptar ticket pendiente

    // Configuraciones de Chatbot
    chatBotType: 'text',

    // Configuraciones de WhatsApp
    // acceptCallWhatsapp: 'enabled' = se aceptan llamadas | 'disabled' = se rechazan
    // y se envía el mensaje configurado en cada conexión (Whatsapps.callRejectMessage).
    acceptCallWhatsapp: 'enabled',
    acceptAudioMessageContact: 'enabled',
    CheckMsgIsGroup: 'enabled',

    // Configuraciones de Mensajes
    sendGreetingMessageOneQueues: 'enabled',
    sendSignMessage: 'enabled',
    sendFarewellWaitingTicket: 'enabled',
    sendGreetingAccepted: 'enabled',
    sendMsgTransfTicket: 'enabled',
    sendQueuePosition: 'enabled',

    // Mensajes personalizados
    greetingAcceptedMessage: '¡Hola! Tu ticket ha sido aceptado y te atenderemos pronto.',
    transferMessage: 'Tu ticket ha sido transferido a otro departamento.',
    sendQueuePositionMessage: 'Estás en la posición {{position}} de la cola.',

    // Configuraciones de Usuario
    userRandom: 'enabled',
    userRating: 'enabled',

    // Configuraciones de Horarios
    scheduleType: '1',

    // LGPD / Privacidad
    enableLGPD: 'disabled',
    lgpdConsent: 'disabled',
    lgpdDeleteMessage: 'enabled',
    lgpdHideNumber: 'disabled',
    lgpdMessage: 'Sus datos serán tratados de acuerdo con nuestra política de privacidad.',
    lgpdLink: 'https://example.com/privacy',

    // Tags
    requiredTag: 'disabled',

    // Notificaciones
    showNotificationPending: false,

    // Payment Configuration (SuperAdmin only)
    paypalClientId: '',
    paypalSecretKey: '',
    stripePublicKey: '',
    stripeSecretKey: '',

    // Facebook/Instagram App Credentials (para OAuth login)
    facebookAppId: '',
    facebookAppSecret: '',
    metaEmbeddedSignupConfigId: '',
    instagramAppId: '',
    instagramAppSecret: '',

    // Facebook Ads Account Configuration
    facebookAdAccountId: '',
    facebookBusinessId: '',
    facebookSystemUserToken: '',

    // Google Calendar OAuth Credentials
    googleClientId: '',
    googleClientSecret: '',

    // TikTok Credentials
    tiktokClientKey: '',
    tiktokClientSecret: '',
    tiktokBusinessAppId: '',
    tiktokBusinessSecret: '',

    // Theme Colors
    themePrimaryLight: '#5BC2D2',
    themePrimaryDark: '#6FD4E4',
    themeSecondaryLight: '#4caf50',
    themeSecondaryDark: '#4caf50',

    // Alertas WhatsApp nuevas empresas
    newCompanyAlertEnabled: 'disabled',
    newCompanyAlertPhone: '',
    newCompanyAlertWhatsappId: '',
    expirationAlertEnabled: 'disabled',
    expirationAlertPhone: '',
    expirationAlertWhatsappId: '',

    // WhatsApp Cloud API / Coexistencia Meta (solo superadmin)
    cloudAPIEnabled: false,
  })

  // [Fase2·A1.1] Cuentas publicitarias reales del token, para no teclear el ID a mano.
  const [adAccounts, setAdAccounts] = useState<MetaAdAccount[]>([])
  const [adAccountsError, setAdAccountsError] = useState<string | null>(null)
  const [loadingAdAccounts, setLoadingAdAccounts] = useState(false)

  useEffect(() => {
    // Solo cargar settings si el auth ya terminó de cargar y tenemos un usuario
    if (!authLoading && user?.companyId) {
      fetchSettings()
      fetchAdAccounts()
    }
  }, [authLoading, user])

  // Un 400 aquí NO es un fallo: es "aún no hay token de Meta con ads_read".
  // En ese caso se mantiene el campo manual en vez de dejar al usuario sin salida.
  const fetchAdAccounts = async () => {
    try {
      setLoadingAdAccounts(true)
      setAdAccountsError(null)
      const res = await api.get<{ success: boolean; accounts: MetaAdAccount[] }>(
        '/meta-marketing/ad-accounts'
      )
      setAdAccounts(res.data?.accounts || [])
    } catch (err: any) {
      const code = err?.response?.data?.message || ''
      setAdAccountsError(
        code === 'ERR_NO_FACEBOOK_TOKEN'
          ? 'Conecta Meta (o pega un System User Token) para elegir la cuenta de una lista.'
          : 'No se pudieron listar tus cuentas publicitarias; escribe el ID a mano.'
      )
      setAdAccounts([])
    } finally {
      setLoadingAdAccounts(false)
    }
  }

  const fetchSettings = async () => {
    try {
      setLoading(true)

      // Debug: verificar qué tiene el usuario
      console.log('Settings: User object:', user)
      console.log('Settings: CompanyId:', user?.companyId)

      if (!user?.companyId) {
        console.error('Settings: No companyId found in user object')

        // Intentar refrescar los datos del usuario
        try {
          console.log('Settings: Attempting to refresh user data...')
          const userData = await authService.getCurrentUser()
          console.log('Settings: Refreshed user data:', userData)

          if (userData?.companyId) {
            // Aquí necesitaríamos actualizar el estado del usuario
            // Por ahora, mostrar mensaje de recarga
            toast.error('Sesión expirada. Recarga la página para continuar.')
            return
          } else {
            toast.error('Usuario no tiene compañía asignada. Contacta al administrador.')
            return
          }
        } catch (refreshError) {
          console.error('Settings: Error refreshing user data:', refreshError)
          toast.error('Error de autenticación. Inicia sesión nuevamente.')
          return
        }
      }

      const response = await api.get(`/companySettings/${user.companyId}`)

      if (response.data) {
        // Mapear los datos del backend al estado local
        setSettings(prev => ({
          ...prev,
          ...response.data
        }))
      }

      // Settings de la tabla key/value (no viven en CompaniesSettings).
      // Si el setting no existe en BD, el endpoint puede devolver 404 — lo
      // tratamos como 'disabled' (comportamiento legacy / default OFF).
      try {
        const reqQueueRes = await api.get('/settings/requireQueueOnAccept')
        if (reqQueueRes?.data?.value) {
          setSettings(prev => ({ ...prev, requireQueueOnAccept: reqQueueRes.data.value }))
        }
      } catch (e: any) {
        if (e?.response?.status !== 404) {
          console.warn('No se pudo cargar requireQueueOnAccept:', e?.message)
        }
      }

      // Solo para superadmin: cargar también los payment keys desde company
      if (isSuperAdmin) {
        try {
          const companyResponse = await api.get(`/companies/${user.companyId}`)
          if (companyResponse.data) {
            setSettings(prev => ({
              ...prev,
              paypalClientId: companyResponse.data.paypalClientId || '',
              paypalSecretKey: companyResponse.data.paypalSecretKey || '',
              stripePublicKey: companyResponse.data.stripePublicKey || '',
              stripeSecretKey: companyResponse.data.stripeSecretKey || '',
            }))
          }
        } catch (companyError) {
          console.error('Error fetching company payment keys:', companyError)
        }

        // Cargar conexiones WhatsApp disponibles para alertas
        try {
          const whatsappResponse = await api.get('/whatsapp/all?session=0')
          setWhatsappConnections(whatsappResponse.data || [])
        } catch (whatsappError) {
          console.error('Error fetching whatsapp connections:', whatsappError)
        }

      }

      await loadMetaPolicyCompanyContext()
    } catch (error) {
      console.error('Error fetching settings:', error)
      toast.error('Error al cargar configuración')
    } finally {
      setLoading(false)
    }
  }

  const loadMetaPolicyCompanyContext = async () => {
    if (!user?.companyId) return

    let targetCompanyId = Number(selectedMetaPolicyCompanyId || user.companyId)

    try {
      const response = await api.get('/companies/list')
      const companies = Array.isArray(response.data) ? response.data : []
      const normalizedCompanies = companies
        .map((company: any) => ({
          id: Number(company.id),
          name: company.name || `Empresa ${company.id}`
        }))
        .filter((company: MetaPolicyCompanyOption) => Boolean(company.id))

      setMetaPolicyCompanies(normalizedCompanies)

      if (!normalizedCompanies.some((company: MetaPolicyCompanyOption) => company.id === targetCompanyId)) {
        targetCompanyId = normalizedCompanies[0]?.id || Number(user.companyId)
      }
    } catch (error) {
      console.error('Error fetching companies for Meta policies:', error)
      setMetaPolicyCompanies([{ id: Number(user.companyId), name: user?.company?.name || 'Mi empresa' }])
    }

    setSelectedMetaPolicyCompanyId(targetCompanyId)
    await fetchMetaConversionPolicies(targetCompanyId)
  }

  const fetchMetaConversionPolicies = async (companyId?: number | string) => {
    const targetCompanyId = Number(companyId || selectedMetaPolicyCompanyId || user?.companyId)
    if (!targetCompanyId) return
    try {
      setLoadingMetaPolicies(true)
      const response = await api.get(`/facebook-conversions/policies?companyId=${targetCompanyId}`)
      setMetaConversionPolicies(response.data?.policies || [])
    } catch (error: any) {
      console.error('Error fetching Meta conversion policies:', error)
      const apiMsg = error?.response?.data?.error || error?.response?.data?.message
      toast.error(apiMsg || 'No se pudieron cargar los permisos de conversiones Meta')
    } finally {
      setLoadingMetaPolicies(false)
    }
  }

  const updateMetaConversionPolicy = async (
    policy: MetaConversionPolicy,
    enabled: boolean
  ) => {
    const targetCompanyId = Number(selectedMetaPolicyCompanyId || user?.companyId)
    if (!targetCompanyId) return

    const previousPolicies = metaConversionPolicies
    setSavingMetaPolicy(policy.eventKey)
    setMetaConversionPolicies(prev =>
      prev.map(item =>
        item.eventKey === policy.eventKey
          ? { ...item, enabled, source: 'company_override' }
          : item
      )
    )

    try {
      const response = await api.put('/facebook-conversions/policies', {
        companyId: targetCompanyId,
        eventKey: policy.eventKey,
        enabled,
        conversionName:
          policy.conversionName ||
          META_CONVERSION_POLICY_COPY[policy.eventKey].defaultName
      })

      const saved = response.data?.setting
      if (saved) {
        setMetaConversionPolicies(prev =>
          prev.map(item =>
            item.eventKey === policy.eventKey
              ? {
                ...item,
                enabled: saved.enabled,
                conversionName: saved.conversionName || item.conversionName,
                source: 'company_override',
                settingId: saved.id
              }
              : item
          )
        )
      }

      toast.success(enabled ? 'Conversión activada' : 'Conversión desactivada')
    } catch (error: any) {
      setMetaConversionPolicies(previousPolicies)
      const apiMsg = error?.response?.data?.error || error?.response?.data?.message
      toast.error(apiMsg || 'No se pudo guardar el permiso de conversión')
    } finally {
      setSavingMetaPolicy(null)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)

      // Separar payment keys de otros settings
      const paymentKeys = {
        paypalClientId: settings.paypalClientId,
        paypalSecretKey: settings.paypalSecretKey,
        stripePublicKey: settings.stripePublicKey,
        stripeSecretKey: settings.stripeSecretKey,
      }

      // Skip empty secret fields to avoid overwriting stored values
      const secretFields = ['googleClientSecret', 'facebookAppSecret', 'instagramAppSecret', 'facebookSystemUserToken', 'tiktokClientSecret', 'tiktokBusinessSecret']
      // Columnas protegidas en el backend (UpdateCompanySettingService.PROTECTED_COLUMNS).
      // Se cuelan en settings por el spread de response.data en fetchSettings.
      const protectedColumns = ['id', 'companyId', 'createdAt', 'updatedAt']
      // Payment keys se persisten en /companies/:id, no en /companySettings.
      const paymentKeyFields = ['paypalClientId', 'paypalSecretKey', 'stripePublicKey', 'stripeSecretKey']
      // Settings key/value viven en la tabla Settings y se guardan por su propio endpoint.
      const keyValueSettingFields = ['requireQueueOnAccept']
      const otherSettings = Object.entries(settings).filter(
        ([key, val]) =>
          !protectedColumns.includes(key) &&
          !paymentKeyFields.includes(key) &&
          !keyValueSettingFields.includes(key) &&
          !(secretFields.includes(key) && val === '') &&
          val !== null &&
          val !== undefined
      )

      // Guardar cada configuración (excluyendo payment keys)
      for (const [column, data] of otherSettings) {
        await api.put('/companySettings/', {
          column,
          data: String(data)
        })
      }

      // Solo para superadmin: guardar payment keys en company
      if (isSuperAdmin) {
        await api.put(`/companies/${user?.companyId}`, paymentKeys)
      }

      // Aplicar colores del tema inmediatamente
      setColors({
        primaryLight: settings.themePrimaryLight,
        primaryDark: settings.themePrimaryDark,
        secondaryLight: settings.themeSecondaryLight,
        secondaryDark: settings.themeSecondaryDark,
      })

      toast.success('Configuración guardada exitosamente')
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error('Error al guardar configuración')
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  // Settings que viven en la tabla "Settings" (key/value), no en "CompaniesSettings".
  // Se persisten inmediatamente con su propio endpoint para no entrar en el bulk save.
  const updateKeyValueSetting = async (key: string, value: string) => {
    // Optimistic UI
    const previousValue = (settings as any)[key]
    setSettings(prev => ({ ...prev, [key]: value }))
    try {
      await api.put(`/settings/${key}`, { value })
      toast.success('Preferencia guardada')
    } catch (error: any) {
      // Rollback
      setSettings(prev => ({ ...prev, [key]: previousValue }))
      const apiMsg = error?.response?.data?.error || error?.response?.data?.message
      toast.error(apiMsg || 'No se pudo guardar la preferencia')
    }
  }
  if (authLoading || loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] p-5 sm:p-6 lg:p-8">
          <p className="text-sm text-muted-foreground">Cargando configuración...</p>
        </div>
      </div>
    )
  }

  if (!user?.companyId) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] p-5 sm:p-6 lg:p-8">
          <p className="text-sm font-medium text-destructive-text">
            Error: No se encontró información de la compañía. Por favor, inicia sesión nuevamente.
          </p>
        </div>
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
                Configuración Avanzada
              </h1>
              <p className="text-sm text-muted-foreground">
                Configuración completa del sistema
              </p>
            </div>
          </div>
          <Button onClick={handleSave} loading={saving}>
            <FloppyDisk className="size-4" weight="bold" aria-hidden />
            Guardar Cambios
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <Tabs
            value={String(activeTab)}
            onValueChange={(value) => setActiveTab(Number(value))}
          >
            <TabsList className="flex w-full flex-wrap">
              <TabsTrigger value="0">
                <Timer className="size-4" aria-hidden />
                Tickets
              </TabsTrigger>
              <TabsTrigger value="1">
                <WhatsappLogo className="size-4" aria-hidden />
                WhatsApp
              </TabsTrigger>
              <TabsTrigger value="2">
                <ChatCircleDots className="size-4" aria-hidden />
                Mensajes
              </TabsTrigger>
              <TabsTrigger value="3">
                <ShieldCheck className="size-4" aria-hidden />
                LGPD/Privacidad
              </TabsTrigger>
              <TabsTrigger value="4">
                <UsersThree className="size-4" aria-hidden />
                Usuarios
              </TabsTrigger>
              <TabsTrigger value="5">
                <Gear className="size-4" aria-hidden />
                General
              </TabsTrigger>
              <TabsTrigger value="6">
                <Palette className="size-4" aria-hidden />
                Tema
              </TabsTrigger>
              <TabsTrigger value="7">
                <Megaphone className="size-4" aria-hidden />
                Facebook Ads
              </TabsTrigger>
              {/* Pestaña TikTok ocultada a pedido. El TabsContent value="8" queda
                  inactivo (sin tab que lo active). Reactivar restaurando este trigger
                  e importando `MusicNote` de @phosphor-icons/react.
              <TabsTrigger value="8">
                <MusicNote className="size-4" aria-hidden />
                TikTok
              </TabsTrigger>
              */}
              {isSuperAdmin && (
                <TabsTrigger value="9">
                  <CreditCard className="size-4" aria-hidden />
                  Pagos
                </TabsTrigger>
              )}
            </TabsList>

            {/* TAB 1: Configuración de Tickets */}
            <TabsContent value="0" className="mt-4 space-y-6">
              <h2 className="text-lg font-semibold text-foreground">
                Configuración de Tickets
              </h2>
              <Divider />

              <Field
                label="Horas para Cerrar Tickets Automáticamente"
                htmlFor="hoursCloseTicketsAuto"
                helper="Tiempo en horas después del cual los tickets resueltos se cerrarán automáticamente"
              >
                <Input
                  id="hoursCloseTicketsAuto"
                  type="number"
                  value={settings.hoursCloseTicketsAuto}
                  onChange={(e) => updateSetting('hoursCloseTicketsAuto', e.target.value)}
                />
              </Field>

              <ToggleRow
                title="Tickets Directos a Billeteras"
                description="Los tickets se asignan directamente a las billeteras de usuarios"
                checked={settings.DirectTicketsToWallets}
                onCheckedChange={(checked) => updateSetting('DirectTicketsToWallets', checked)}
              />

              <ToggleRow
                title="Cerrar Ticket al Transferir"
                description="Cierra automáticamente el ticket cuando se transfiere a otro usuario"
                checked={settings.closeTicketOnTransfer}
                onCheckedChange={(checked) => updateSetting('closeTicketOnTransfer', checked)}
              />

              <ToggleRow
                title="Exigir Cola al Aceptar Ticket"
                description="Si está activado, no se permite aceptar un ticket pendiente sin asignarle una cola. Si está desactivado, se puede aceptar sin cola (solo se guarda un warning en logs)."
                checked={settings.requireQueueOnAccept === 'enabled'}
                onCheckedChange={(checked) =>
                  updateKeyValueSetting('requireQueueOnAccept', checked ? 'enabled' : 'disabled')
                }
              />

              <Field
                label="Tipo de Chatbot"
                htmlFor="chatBotType"
                helper="Tipo de interfaz para el chatbot automatizado"
              >
                <Select
                  value={settings.chatBotType}
                  onValueChange={(value) => updateSetting('chatBotType', value)}
                >
                  <SelectTrigger id="chatBotType" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="button">Botones</SelectItem>
                    <SelectItem value="list">Lista</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label="Tipo de Programación"
                htmlFor="scheduleType"
                helper="Define cómo se manejan los horarios de atención"
              >
                <Select
                  value={settings.scheduleType}
                  onValueChange={(value) => updateSetting('scheduleType', value)}
                >
                  <SelectTrigger id="scheduleType" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Por Empresa</SelectItem>
                    <SelectItem value="2">Por Conexión</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </TabsContent>

            {/* TAB 2: WhatsApp */}
            <TabsContent value="1" className="mt-4 space-y-6">
              <h2 className="text-lg font-semibold text-foreground">
                Configuración de WhatsApp
              </h2>
              <Divider />

              <ToggleRow
                title="Aceptar Llamadas de WhatsApp"
                description="Si se desactiva, las llamadas entrantes se rechazan y se envía el mensaje configurado en cada conexión. Si la conexión no tiene mensaje, no se envía nada."
                checked={settings.acceptCallWhatsapp === 'enabled'}
                onCheckedChange={(checked) =>
                  updateSetting('acceptCallWhatsapp', checked ? 'enabled' : 'disabled')
                }
              />

              <ToggleRow
                title="Aceptar Mensajes de Audio (política global)"
                description="Política por defecto para todas las conexiones. Cada conexión puede sobreescribirla en su pestaña Permisos."
                checked={settings.acceptAudioMessageContact === 'enabled'}
                onCheckedChange={(checked) =>
                  updateSetting('acceptAudioMessageContact', checked ? 'enabled' : 'disabled')
                }
              />

              <ToggleRow
                title="Verificar Mensajes de Grupos"
                description="Verificar si los mensajes provienen de grupos de WhatsApp"
                checked={settings.CheckMsgIsGroup === 'enabled'}
                onCheckedChange={(checked) =>
                  updateSetting('CheckMsgIsGroup', checked ? 'enabled' : 'disabled')
                }
              />
            </TabsContent>

            {/* TAB 3: Mensajes */}
            <TabsContent value="2" className="mt-4 space-y-6">
              <h2 className="text-lg font-semibold text-foreground">
                Configuración de Mensajes
              </h2>
              <Divider />

              <ToggleRow
                title="Enviar Mensaje de Bienvenida por Cola"
                description="Mensaje automático cuando el cliente elige una cola"
                checked={settings.sendGreetingMessageOneQueues === 'enabled'}
                onCheckedChange={(checked) =>
                  updateSetting('sendGreetingMessageOneQueues', checked ? 'enabled' : 'disabled')
                }
              />

              <ToggleRow
                title="Enviar Mensaje de Firma"
                description="Agregar firma automática a los mensajes enviados"
                checked={settings.sendSignMessage === 'enabled'}
                onCheckedChange={(checked) =>
                  updateSetting('sendSignMessage', checked ? 'enabled' : 'disabled')
                }
              />

              <ToggleRow
                title="Enviar Despedida en Ticket en Espera"
                description="Mensaje cuando el ticket pasa a estado de espera"
                checked={settings.sendFarewellWaitingTicket === 'enabled'}
                onCheckedChange={(checked) =>
                  updateSetting('sendFarewellWaitingTicket', checked ? 'enabled' : 'disabled')
                }
              />

              <ToggleRow
                title="Enviar Saludo al Aceptar Ticket"
                description="Mensaje automático cuando un agente acepta un ticket"
                checked={settings.sendGreetingAccepted === 'enabled'}
                onCheckedChange={(checked) =>
                  updateSetting('sendGreetingAccepted', checked ? 'enabled' : 'disabled')
                }
              />

              <Field label="Mensaje al Aceptar Ticket" htmlFor="greetingAcceptedMessage">
                <textarea
                  id="greetingAcceptedMessage"
                  rows={2}
                  className={textareaClass}
                  value={settings.greetingAcceptedMessage}
                  onChange={(e) => updateSetting('greetingAcceptedMessage', e.target.value)}
                  disabled={settings.sendGreetingAccepted === 'disabled'}
                />
              </Field>

              <ToggleRow
                title="Enviar Mensaje al Transferir Ticket"
                description="Notificar al cliente cuando su ticket es transferido"
                checked={settings.sendMsgTransfTicket === 'enabled'}
                onCheckedChange={(checked) =>
                  updateSetting('sendMsgTransfTicket', checked ? 'enabled' : 'disabled')
                }
              />

              <Field label="Mensaje de Transferencia" htmlFor="transferMessage">
                <textarea
                  id="transferMessage"
                  rows={2}
                  className={textareaClass}
                  value={settings.transferMessage}
                  onChange={(e) => updateSetting('transferMessage', e.target.value)}
                  disabled={settings.sendMsgTransfTicket === 'disabled'}
                />
              </Field>

              <ToggleRow
                title="Enviar Posición en Cola"
                description="Informar al cliente su posición en la cola de espera"
                checked={settings.sendQueuePosition === 'enabled'}
                onCheckedChange={(checked) =>
                  updateSetting('sendQueuePosition', checked ? 'enabled' : 'disabled')
                }
              />

              <Field
                label="Mensaje de Posición en Cola"
                htmlFor="sendQueuePositionMessage"
                helper={<>Variables disponibles: {'{{position}}'} para la posición en cola</>}
              >
                <textarea
                  id="sendQueuePositionMessage"
                  rows={2}
                  className={textareaClass}
                  value={settings.sendQueuePositionMessage}
                  onChange={(e) => updateSetting('sendQueuePositionMessage', e.target.value)}
                  disabled={settings.sendQueuePosition === 'disabled'}
                />
              </Field>
            </TabsContent>

            {/* TAB 4: LGPD/Privacidad */}
            <TabsContent value="3" className="mt-4 space-y-6">
              <h2 className="text-lg font-semibold text-foreground">
                LGPD y Privacidad de Datos
              </h2>
              <Divider />

              <ToggleRow
                title="Habilitar LGPD"
                description="Activar funciones de protección de datos personales"
                checked={settings.enableLGPD === 'enabled'}
                onCheckedChange={(checked) =>
                  updateSetting('enableLGPD', checked ? 'enabled' : 'disabled')
                }
              />

              <ToggleRow
                title="Solicitar Consentimiento"
                description="Pedir autorización explícita antes de procesar datos"
                checked={settings.lgpdConsent === 'enabled'}
                onCheckedChange={(checked) =>
                  updateSetting('lgpdConsent', checked ? 'enabled' : 'disabled')
                }
                disabled={settings.enableLGPD === 'disabled'}
              />

              <ToggleRow
                title="Eliminar Mensajes LGPD"
                description="Permitir eliminación de mensajes por solicitud del usuario"
                checked={settings.lgpdDeleteMessage === 'enabled'}
                onCheckedChange={(checked) =>
                  updateSetting('lgpdDeleteMessage', checked ? 'enabled' : 'disabled')
                }
                disabled={settings.enableLGPD === 'disabled'}
              />

              <ToggleRow
                title="Ocultar Números de Teléfono"
                description="Enmascarar parcialmente los números de teléfono"
                checked={settings.lgpdHideNumber === 'enabled'}
                onCheckedChange={(checked) =>
                  updateSetting('lgpdHideNumber', checked ? 'enabled' : 'disabled')
                }
                disabled={settings.enableLGPD === 'disabled'}
              />

              <Field
                label="Mensaje LGPD"
                htmlFor="lgpdMessage"
                helper="Mensaje informativo sobre el tratamiento de datos personales"
              >
                <textarea
                  id="lgpdMessage"
                  rows={3}
                  className={textareaClass}
                  value={settings.lgpdMessage}
                  onChange={(e) => updateSetting('lgpdMessage', e.target.value)}
                  disabled={settings.enableLGPD === 'disabled'}
                />
              </Field>

              <Field
                label="Link de Política de Privacidad"
                htmlFor="lgpdLink"
                helper="URL completa de su política de privacidad"
              >
                <Input
                  id="lgpdLink"
                  type="url"
                  value={settings.lgpdLink}
                  onChange={(e) => updateSetting('lgpdLink', e.target.value)}
                  disabled={settings.enableLGPD === 'disabled'}
                />
              </Field>
            </TabsContent>

            {/* TAB 5: Usuarios */}
            <TabsContent value="4" className="mt-4 space-y-6">
              <h2 className="text-lg font-semibold text-foreground">
                Configuración de Usuarios
              </h2>
              <Divider />

              <ToggleRow
                title="Asignación Aleatoria de Usuarios"
                description="Distribuir tickets aleatoriamente entre usuarios disponibles"
                checked={settings.userRandom === 'enabled'}
                onCheckedChange={(checked) =>
                  updateSetting('userRandom', checked ? 'enabled' : 'disabled')
                }
              />

              <ToggleRow
                title="Encuesta NPS al cerrar ticket (política global)"
                description="Activa la solicitud de calificación al cerrar tickets. El texto que se envía y la activación específica por conexión se configuran dentro de cada conexión (pestañas Mensajes y Permisos)."
                checked={settings.userRating === 'enabled'}
                onCheckedChange={(checked) =>
                  updateSetting('userRating', checked ? 'enabled' : 'disabled')
                }
              />

              <ToggleRow
                title="Mostrar Notificaciones Pendientes"
                description="Notificar a los usuarios sobre tickets pendientes"
                checked={settings.showNotificationPending}
                onCheckedChange={(checked) => updateSetting('showNotificationPending', checked)}
              />
            </TabsContent>

            {/* TAB 6: General */}
            <TabsContent value="5" className="mt-4 space-y-6">
              <h2 className="text-lg font-semibold text-foreground">Configuracion General</h2>
              <Divider />

              <ToggleRow
                title="Etiqueta Requerida"
                description="Obligar a asignar etiquetas a los tickets"
                checked={settings.requiredTag === 'enabled'}
                onCheckedChange={(checked) =>
                  updateSetting('requiredTag', checked ? 'enabled' : 'disabled')
                }
              />

              <Divider />

              {/* Google Calendar Integration */}
              <div>
                <h3 className="text-base font-semibold text-foreground">Google Calendar</h3>
                <p className="mb-4 mt-1 text-xs text-muted-foreground">
                  Credenciales OAuth para sincronizar citas con Google Calendar.
                  Cada empresa configura sus propias credenciales.
                </p>
                <div className="space-y-4">
                  <Field
                    label="Google Client ID"
                    htmlFor="googleClientId"
                    helper="Client ID de tu proyecto en Google Cloud Console"
                  >
                    <Input
                      id="googleClientId"
                      type="text"
                      value={settings.googleClientId}
                      onChange={(e) => updateSetting('googleClientId', e.target.value)}
                      placeholder="xxxxx.apps.googleusercontent.com"
                    />
                  </Field>

                  <Field
                    label="Google Client Secret"
                    htmlFor="googleClientSecret"
                    helper="Client Secret de tu proyecto en Google Cloud Console"
                  >
                    <Input
                      id="googleClientSecret"
                      type="password"
                      value={settings.googleClientSecret}
                      onChange={(e) => updateSetting('googleClientSecret', e.target.value)}
                      placeholder="GOCSPX-xxxxx"
                    />
                  </Field>
                </div>
              </div>

              <InfoPanel title="Como obtener las credenciales de Google:">
                <ol className="m-0 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                  <li>Ve a <strong className="font-semibold text-foreground">console.cloud.google.com</strong></li>
                  <li>Crea un proyecto nuevo o selecciona uno existente</li>
                  <li>En <strong className="font-semibold text-foreground">APIs &amp; Services - Library</strong>, habilita <strong className="font-semibold text-foreground">Google Calendar API</strong></li>
                  <li>En <strong className="font-semibold text-foreground">APIs &amp; Services - Credentials</strong>, crea un <strong className="font-semibold text-foreground">OAuth client ID</strong> (tipo Web application)</li>
                  <li>Configura el <strong className="font-semibold text-foreground">Authorized redirect URI</strong> con la URL de tu servidor + <code className="rounded bg-muted px-1 py-0.5 font-mono">/api/appointments/calendar/google/callback</code></li>
                  <li>Copia el <strong className="font-semibold text-foreground">Client ID</strong> y <strong className="font-semibold text-foreground">Client Secret</strong> y pegalos aqui</li>
                </ol>
              </InfoPanel>

              {/* Alertas WhatsApp - Nuevas Empresas (Solo SuperAdmin) */}
              {isSuperAdmin && (
                <>
                  <Divider />
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                      <Bell className="size-5 text-muted-foreground" aria-hidden />
                      Alertas WhatsApp — Nuevas Empresas
                    </h3>
                    <p className="mb-4 mt-1 text-xs text-muted-foreground">
                      Enviar notificación por WhatsApp cada vez que se registre una nueva empresa.
                    </p>

                    <div className="space-y-4">
                      {/* Switch habilitar/deshabilitar */}
                      <ToggleRow
                        title="Activar alertas"
                        description="Enviar mensaje WhatsApp con datos de la empresa creada"
                        checked={settings.newCompanyAlertEnabled === 'enabled'}
                        onCheckedChange={(checked) =>
                          updateSetting('newCompanyAlertEnabled', checked ? 'enabled' : 'disabled')
                        }
                      />

                      {/* Campos solo visibles si la alerta está habilitada */}
                      {settings.newCompanyAlertEnabled === 'enabled' && (
                        <>
                          {/* Select de conexión WhatsApp */}
                          <Field
                            label="Conexión WhatsApp para enviar alertas"
                            htmlFor="newCompanyAlertWhatsappId"
                            helper="Solo se muestran conexiones con estado CONNECTED"
                          >
                            <Select
                              value={settings.newCompanyAlertWhatsappId ? String(settings.newCompanyAlertWhatsappId) : ''}
                              onValueChange={(value) => updateSetting('newCompanyAlertWhatsappId', value || '')}
                            >
                              <SelectTrigger id="newCompanyAlertWhatsappId" className="h-11">
                                <SelectValue placeholder="Selecciona una conexión..." />
                              </SelectTrigger>
                              <SelectContent>
                                {whatsappConnections
                                  .filter((w) => w.status === 'CONNECTED')
                                  .map((w) => (
                                    <SelectItem key={w.id} value={String(w.id)}>
                                      {w.name} {w.number ? `(${w.number})` : ''} — {w.channel || 'whatsapp'}
                                      {w.Company ? ` [${w.Company.name}]` : ''}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </Field>

                          {/* Lista dinámica de números destino */}
                          <PhoneAlertField
                            id="newCompanyAlertPhone"
                            helper="Agrega los números que recibirán la alerta (con código de país, ej: 521234567890)"
                            phones={
                              settings.newCompanyAlertPhone
                                ? settings.newCompanyAlertPhone.split(',').filter(Boolean)
                                : []
                            }
                            draft={newAlertPhone}
                            onDraftChange={setNewAlertPhone}
                            onAdd={() => {
                              const current = settings.newCompanyAlertPhone
                                ? settings.newCompanyAlertPhone.split(',').filter(Boolean)
                                : []
                              if (!current.includes(newAlertPhone.trim())) {
                                updateSetting('newCompanyAlertPhone', [...current, newAlertPhone.trim()].join(','))
                              }
                              setNewAlertPhone('')
                            }}
                            onRemove={(idx) => {
                              const phones = settings.newCompanyAlertPhone
                                .split(',')
                                .filter(Boolean)
                                .filter((_: string, i: number) => i !== idx)
                              updateSetting('newCompanyAlertPhone', phones.join(','))
                            }}
                          />
                        </>
                      )}
                    </div>
                  </div>

                  <Divider />

                  {/* Alertas WhatsApp — Expiración de empresas */}
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                      <Bell className="size-5 text-warning-text" aria-hidden />
                      Alertas WhatsApp — Expiración de empresas
                    </h3>
                    <p className="mb-4 mt-1 text-xs text-muted-foreground">
                      Enviar dos avisos por WhatsApp por cada empresa: uno 4 días antes del vencimiento y otro cuando ya expiró.
                    </p>

                    <div className="space-y-4">
                      {/* Switch habilitar/deshabilitar */}
                      <ToggleRow
                        title="Activar alertas"
                        description="Envío automático: aviso a 4 días + aviso al expirar"
                        checked={settings.expirationAlertEnabled === 'enabled'}
                        onCheckedChange={(checked) =>
                          updateSetting('expirationAlertEnabled', checked ? 'enabled' : 'disabled')
                        }
                      />

                      {/* Campos solo visibles si la alerta está habilitada */}
                      {settings.expirationAlertEnabled === 'enabled' && (
                        <>
                          {/* Select de conexión WhatsApp */}
                          <Field
                            label="Conexión WhatsApp para enviar alertas"
                            htmlFor="expirationAlertWhatsappId"
                            helper="Solo se muestran conexiones con estado CONNECTED"
                          >
                            <Select
                              value={settings.expirationAlertWhatsappId ? String(settings.expirationAlertWhatsappId) : ''}
                              onValueChange={(value) => updateSetting('expirationAlertWhatsappId', value || '')}
                            >
                              <SelectTrigger id="expirationAlertWhatsappId" className="h-11">
                                <SelectValue placeholder="Selecciona una conexión..." />
                              </SelectTrigger>
                              <SelectContent>
                                {whatsappConnections
                                  .filter((w) => w.status === 'CONNECTED')
                                  .map((w) => (
                                    <SelectItem key={w.id} value={String(w.id)}>
                                      {w.name} {w.number ? `(${w.number})` : ''} — {w.channel || 'whatsapp'}
                                      {w.Company ? ` [${w.Company.name}]` : ''}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </Field>

                          {/* Lista dinámica de números destino */}
                          <PhoneAlertField
                            id="expirationAlertPhone"
                            helper="Agrega los números que recibirán los avisos (con código de país, ej: 521234567890)"
                            phones={
                              settings.expirationAlertPhone
                                ? settings.expirationAlertPhone.split(',').filter(Boolean)
                                : []
                            }
                            draft={newExpirationAlertPhone}
                            onDraftChange={setNewExpirationAlertPhone}
                            onAdd={() => {
                              const current = settings.expirationAlertPhone
                                ? settings.expirationAlertPhone.split(',').filter(Boolean)
                                : []
                              if (!current.includes(newExpirationAlertPhone.trim())) {
                                updateSetting('expirationAlertPhone', [...current, newExpirationAlertPhone.trim()].join(','))
                              }
                              setNewExpirationAlertPhone('')
                            }}
                            onRemove={(idx) => {
                              const phones = settings.expirationAlertPhone
                                .split(',')
                                .filter(Boolean)
                                .filter((_: string, i: number) => i !== idx)
                              updateSetting('expirationAlertPhone', phones.join(','))
                            }}
                          />
                        </>
                      )}
                    </div>
                  </div>

                  <Divider />

                  {/* WhatsApp Cloud API / Coexistencia Meta */}
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                      <Cloud className="size-5 text-[#1877f2]" weight="fill" aria-hidden />
                      WhatsApp Cloud API (Coexistencia Meta)
                    </h3>
                    <p className="mb-4 mt-1 text-xs text-muted-foreground">
                      Habilita la conexion de numeros WhatsApp via Meta Cloud API.
                      Permite coexistencia: el mismo numero funciona en la API Cloud y en la WhatsApp Business App simultaneamente.
                    </p>

                    <div className="space-y-4">
                      <ToggleRow
                        title="Activar Cloud API"
                        description="Permite crear conexiones Meta via Embedded Signup en el panel de Coexistencia"
                        checked={settings.cloudAPIEnabled === true || settings.cloudAPIEnabled === 'true' as any}
                        onCheckedChange={(checked) => updateSetting('cloudAPIEnabled', checked)}
                      />

                      {(settings.cloudAPIEnabled === true || settings.cloudAPIEnabled === 'true' as any) && (
                        <InfoPanel title="Requisitos para Cloud API:">
                          <ol className="m-0 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                            <li>Configura <strong className="font-semibold text-foreground">Facebook App ID</strong> y <strong className="font-semibold text-foreground">App Secret</strong> en la pestana Facebook Ads</li>
                            <li>Tu App de Meta debe tener el producto <strong className="font-semibold text-foreground">WhatsApp</strong> agregado</li>
                            <li>Ejecuta el <strong className="font-semibold text-foreground">Setup automatico</strong> desde el Dashboard de Coexistencia</li>
                            <li>Conecta tu numero via <strong className="font-semibold text-foreground">Embedded Signup</strong> en Canales → Coexistencia Meta</li>
                          </ol>
                        </InfoPanel>
                      )}
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            {/* TAB 7: Personalizacion del Tema */}
            <TabsContent value="6" className="mt-4 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Personalizacion del Tema</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Configura los colores de la plataforma para tu empresa. Los cambios se aplican al guardar.
                </p>
              </div>
              <Divider />

              {/* Colores Primarios */}
              <div>
                <h3 className="mb-3 text-base font-semibold text-foreground">Colores Primarios</h3>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Color Primario - Modo Claro"
                    htmlFor="themePrimaryLight"
                    helper={settings.themePrimaryLight}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-10 shrink-0 rounded-lg border-2 border-border"
                        style={{ backgroundColor: settings.themePrimaryLight }}
                        aria-hidden
                      />
                      <input
                        id="themePrimaryLight"
                        type="color"
                        value={settings.themePrimaryLight}
                        onChange={(e) => updateSetting('themePrimaryLight', e.target.value)}
                        className="h-10 w-full flex-1 cursor-pointer rounded-md border border-input bg-card p-1"
                      />
                    </div>
                  </Field>

                  <Field
                    label="Color Primario - Modo Oscuro"
                    htmlFor="themePrimaryDark"
                    helper={settings.themePrimaryDark}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-10 shrink-0 rounded-lg border-2 border-border"
                        style={{ backgroundColor: settings.themePrimaryDark }}
                        aria-hidden
                      />
                      <input
                        id="themePrimaryDark"
                        type="color"
                        value={settings.themePrimaryDark}
                        onChange={(e) => updateSetting('themePrimaryDark', e.target.value)}
                        className="h-10 w-full flex-1 cursor-pointer rounded-md border border-input bg-card p-1"
                      />
                    </div>
                  </Field>
                </div>
              </div>

              {/* Colores Secundarios */}
              <div>
                <h3 className="mb-3 text-base font-semibold text-foreground">Colores Secundarios</h3>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Acento - Modo Claro"
                    htmlFor="themeSecondaryLight"
                    helper={settings.themeSecondaryLight}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-10 shrink-0 rounded-lg border-2 border-border"
                        style={{ backgroundColor: settings.themeSecondaryLight }}
                        aria-hidden
                      />
                      <input
                        id="themeSecondaryLight"
                        type="color"
                        value={settings.themeSecondaryLight}
                        onChange={(e) => updateSetting('themeSecondaryLight', e.target.value)}
                        className="h-10 w-full flex-1 cursor-pointer rounded-md border border-input bg-card p-1"
                      />
                    </div>
                  </Field>

                  <Field
                    label="Acento - Modo Oscuro"
                    htmlFor="themeSecondaryDark"
                    helper={settings.themeSecondaryDark}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-10 shrink-0 rounded-lg border-2 border-border"
                        style={{ backgroundColor: settings.themeSecondaryDark }}
                        aria-hidden
                      />
                      <input
                        id="themeSecondaryDark"
                        type="color"
                        value={settings.themeSecondaryDark}
                        onChange={(e) => updateSetting('themeSecondaryDark', e.target.value)}
                        className="h-10 w-full flex-1 cursor-pointer rounded-md border border-input bg-card p-1"
                      />
                    </div>
                  </Field>
                </div>
              </div>

              <Divider />

              {/* Restaurar predeterminados */}
              <Button
                variant="outline"
                className="self-start"
                onClick={() => {
                  updateSetting('themePrimaryLight', '#5BC2D2')
                  updateSetting('themePrimaryDark', '#6FD4E4')
                  updateSetting('themeSecondaryLight', '#4caf50')
                  updateSetting('themeSecondaryDark', '#4caf50')
                }}
              >
                <ArrowCounterClockwise className="size-4" aria-hidden />
                Restaurar Colores Predeterminados
              </Button>

              <Divider />

              {/* Vista Previa */}
              <h3 className="text-base font-semibold text-foreground">Vista Previa</h3>
              {/* Los colores inline de esta sección son DATOS del usuario (los colores que
                  está eligiendo), no tokens del design system: por eso van en style. */}
              <div className="space-y-5 rounded-xl border border-border bg-card p-5">
                {/* Botones */}
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Botones</p>
                  <div className="flex flex-wrap gap-2">
                    <Button style={{ backgroundColor: settings.themePrimaryLight, color: '#fff' }}>
                      Boton Primario
                    </Button>
                    <Button
                      variant="outline"
                      style={{
                        borderColor: settings.themePrimaryLight,
                        color: settings.themePrimaryLight,
                      }}
                    >
                      Boton Outlined
                    </Button>
                    <Button
                      variant="ghost"
                      style={{
                        backgroundColor: settings.themePrimaryLight + '20',
                        color: settings.themePrimaryLight,
                      }}
                    >
                      Boton Soft
                    </Button>
                  </div>
                </div>

                {/* Chips */}
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Chips</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge style={{ backgroundColor: settings.themePrimaryLight, color: '#fff' }}>
                      Primario
                    </Badge>
                    <Badge style={{ backgroundColor: settings.themeSecondaryLight, color: '#fff' }}>
                      Secundario
                    </Badge>
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: settings.themePrimaryLight,
                        color: settings.themePrimaryLight,
                      }}
                    >
                      Outlined
                    </Badge>
                    <Badge
                      style={{
                        backgroundColor: settings.themePrimaryLight + '20',
                        color: settings.themePrimaryLight,
                      }}
                    >
                      Soft
                    </Badge>
                  </div>
                </div>

                {/* Avatar + Sidebar selected */}
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Elementos</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                      style={{ backgroundColor: settings.themePrimaryLight, color: '#fff' }}
                      aria-hidden
                    >
                      JR
                    </span>
                    <span
                      className="rounded-md px-4 py-2 text-sm font-semibold"
                      style={{ backgroundColor: settings.themePrimaryLight, color: '#fff' }}
                    >
                      Sidebar Seleccionado
                    </span>
                    <span
                      className="rounded-[18px] px-4 py-2 text-sm"
                      style={{ backgroundColor: settings.themePrimaryLight, color: '#fff' }}
                    >
                      Burbuja de mensaje
                    </span>
                  </div>
                </div>

                {/* Area resaltada */}
                <div
                  className="rounded-lg p-4"
                  style={{
                    backgroundColor: settings.themePrimaryLight + '12',
                    border: `1px solid ${settings.themePrimaryLight}40`,
                  }}
                >
                  <p className="text-sm" style={{ color: settings.themePrimaryLight }}>
                    Area resaltada con el color primario seleccionado
                  </p>
                </div>

                {/* Dark mode preview — simula el chrome oscuro, por eso el literal. */}
                <div className="rounded-lg p-4" style={{ backgroundColor: '#18191A' }}>
                  <p
                    className="mb-2 text-xs uppercase tracking-wide"
                    style={{ color: '#8A8D91' }}
                  >
                    Modo Oscuro
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                      style={{ backgroundColor: settings.themePrimaryDark, color: '#fff' }}
                      aria-hidden
                    >
                      JR
                    </span>
                    <span
                      className="rounded-[18px] px-4 py-2 text-sm"
                      style={{ backgroundColor: settings.themePrimaryDark, color: '#fff' }}
                    >
                      Burbuja modo oscuro
                    </span>
                    <Badge style={{ backgroundColor: settings.themePrimaryDark, color: '#fff' }}>
                      Chip Dark
                    </Badge>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB 8: Facebook Ads Account Configuration */}
            <TabsContent value="7" className="mt-4 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Configuracion de Facebook/Instagram
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Configura las credenciales de tu aplicacion de Facebook para habilitar el login OAuth
                  en conexiones de Facebook e Instagram.
                </p>
              </div>
              <Divider />

              {/* Seccion: Credenciales de la App (OAuth) */}
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Credenciales de la App de Facebook
                </h3>
                <p className="mb-4 mt-1 text-xs text-muted-foreground">
                  Estas credenciales son necesarias para el login OAuth de Facebook e Instagram.
                  Obtenlas desde developers.facebook.com en tu aplicacion.
                </p>
                <div className="space-y-4">
                  <Field
                    label="Facebook App ID"
                    htmlFor="facebookAppId"
                    helper="ID de tu aplicacion de Facebook (developers.facebook.com)"
                  >
                    <Input
                      id="facebookAppId"
                      type="text"
                      value={settings.facebookAppId}
                      onChange={(e) => updateSetting('facebookAppId', e.target.value)}
                      placeholder="123456789012345"
                    />
                  </Field>

                  <Field
                    label="Facebook App Secret"
                    htmlFor="facebookAppSecret"
                    helper="Clave secreta de tu aplicacion de Facebook"
                  >
                    <Input
                      id="facebookAppSecret"
                      type="password"
                      value={settings.facebookAppSecret}
                      onChange={(e) => updateSetting('facebookAppSecret', e.target.value)}
                      placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    />
                  </Field>

                  <Field
                    label="Embedded Signup Configuration ID"
                    htmlFor="metaEmbeddedSignupConfigId"
                    helper="ID de configuracion de Embedded Signup de esta empresa. Debe pertenecer a la misma App ID."
                  >
                    <Input
                      id="metaEmbeddedSignupConfigId"
                      type="text"
                      value={settings.metaEmbeddedSignupConfigId}
                      onChange={(e) => updateSetting('metaEmbeddedSignupConfigId', e.target.value)}
                      placeholder="1203192945295067"
                    />
                  </Field>
                </div>
              </div>

              <Divider />

              {/* Seccion: Credenciales de Instagram (opcional) */}
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Credenciales de Instagram (Opcional)
                </h3>
                <p className="mb-4 mt-1 text-xs text-muted-foreground">
                  Si tienes una app separada para Instagram, configura sus credenciales aqui.
                  Si usas la misma app de Facebook, puedes dejar estos campos vacios.
                </p>
                <div className="space-y-4">
                  <Field
                    label="Instagram App ID"
                    htmlFor="instagramAppId"
                    helper="ID de tu aplicacion de Instagram (si es diferente a Facebook)"
                  >
                    <Input
                      id="instagramAppId"
                      type="text"
                      value={settings.instagramAppId}
                      onChange={(e) => updateSetting('instagramAppId', e.target.value)}
                      placeholder="123456789012345"
                    />
                  </Field>

                  <Field
                    label="Instagram App Secret"
                    htmlFor="instagramAppSecret"
                    helper="Clave secreta de tu aplicacion de Instagram"
                  >
                    <Input
                      id="instagramAppSecret"
                      type="password"
                      value={settings.instagramAppSecret}
                      onChange={(e) => updateSetting('instagramAppSecret', e.target.value)}
                      placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    />
                  </Field>
                </div>
              </div>

              <Divider />

              {/* Seccion: Cuenta Publicitaria */}
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Cuenta Publicitaria (Opcional)
                </h3>
                <p className="mb-4 mt-1 text-xs text-muted-foreground">
                  Configura tu cuenta publicitaria para ver campanas y metricas.
                  Nota: Tambien puedes configurar esto desde Conexiones - Facebook - Credenciales.
                </p>
                <div className="space-y-4">
                  {adAccounts.length > 0 ? (
                    <Field
                      label="Cuenta publicitaria"
                      htmlFor="facebookAdAccountId"
                      helper="Cuentas a las que tiene acceso tu token de Meta."
                    >
                      <Select
                        value={settings.facebookAdAccountId}
                        onValueChange={(v) => updateSetting('facebookAdAccountId', v)}
                      >
                        <SelectTrigger id="facebookAdAccountId">
                          <SelectValue placeholder="Selecciona una cuenta" />
                        </SelectTrigger>
                        <SelectContent>
                          {adAccounts.map((acc) => {
                            // Se guarda sin el prefijo act_ (formato historico del campo).
                            const rawId = String(acc.id || '').replace(/^act_/, '')
                            return (
                              <SelectItem key={acc.id} value={rawId}>
                                {acc.name || rawId}
                                {acc.currency ? ` · ${acc.currency}` : ''}
                                {acc.business?.name ? ` · ${acc.business.name}` : ''}
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    </Field>
                  ) : (
                    <Field
                      label="Ad Account ID"
                      htmlFor="facebookAdAccountId"
                      helper={
                        loadingAdAccounts
                          ? 'Buscando tus cuentas publicitarias...'
                          : adAccountsError || 'ID de la cuenta publicitaria (sin el prefijo act_)'
                      }
                    >
                      <Input
                        id="facebookAdAccountId"
                        type="text"
                        value={settings.facebookAdAccountId}
                        onChange={(e) => updateSetting('facebookAdAccountId', e.target.value)}
                        placeholder="123456789"
                      />
                    </Field>
                  )}

                  <Field
                    label="Business Manager ID"
                    htmlFor="facebookBusinessId"
                    helper="ID del Business Manager (opcional)"
                  >
                    <Input
                      id="facebookBusinessId"
                      type="text"
                      value={settings.facebookBusinessId}
                      onChange={(e) => updateSetting('facebookBusinessId', e.target.value)}
                      placeholder="123456789"
                    />
                  </Field>

                  <Field
                    label="Access Token"
                    htmlFor="facebookSystemUserToken"
                    helper="Token con permisos: ads_read, ads_management, read_insights"
                  >
                    <Input
                      id="facebookSystemUserToken"
                      type="password"
                      value={settings.facebookSystemUserToken}
                      onChange={(e) => updateSetting('facebookSystemUserToken', e.target.value)}
                      placeholder="EAAxxxxxxx..."
                    />
                  </Field>
                </div>
              </div>

              {visibleMetaConversionPolicyKeys.length > 0 && (
                <>
                  <Divider />

                  {/* Seccion: Politicas de conversiones Meta */}
                  <div>
                    <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">
                          Permisos de conversiones Meta
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Controla que eventos de Conversions API puede enviar esta empresa.
                          Si un permiso esta apagado, el backend bloquea ese envio aunque el flujo lo dispare.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={loadingMetaPolicies}
                        disabled={!selectedMetaPolicyCompanyNumber}
                        onClick={() => fetchMetaConversionPolicies()}
                      >
                        <ArrowCounterClockwise className="size-4" aria-hidden />
                        Actualizar
                      </Button>
                    </div>

                    <InfoPanel className="mb-4">
                      {isSuperAdmin ? (
                        <Field
                          label="Empresa a configurar"
                          htmlFor="metaPolicyCompany"
                          helper="Estos permisos solo se muestran para empresas autorizadas: #1 y #8."
                        >
                          <Select
                            value={selectedMetaPolicyCompanyId ? String(selectedMetaPolicyCompanyId) : ''}
                            onValueChange={(value) => {
                              const nextCompanyId = Number(value)
                              if (!nextCompanyId) return
                              setSelectedMetaPolicyCompanyId(nextCompanyId)
                              fetchMetaConversionPolicies(nextCompanyId)
                            }}
                          >
                            <SelectTrigger id="metaPolicyCompany" className="h-11">
                              <SelectValue placeholder="Selecciona una empresa" />
                            </SelectTrigger>
                            <SelectContent>
                              {metaPolicyCompanies.map((company) => (
                                <SelectItem key={company.id} value={String(company.id)}>
                                  {company.name} #{company.id}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      ) : (
                        <div>
                          <p className="text-sm font-semibold text-foreground">Empresa configurada</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Estos permisos aplican solo a tu empresa. Un admin de otra empresa no puede cambiarlos.
                          </p>
                        </div>
                      )}
                    </InfoPanel>

                    {loadingMetaPolicies ? (
                      <InfoPanel>
                        <p className="text-sm text-muted-foreground">Cargando permisos de conversiones...</p>
                      </InfoPanel>
                    ) : metaConversionPolicies.length === 0 ? (
                      <InfoPanel>
                        <p className="text-sm text-muted-foreground">
                          No se pudieron cargar permisos para esta empresa. Usa Actualizar para intentar de nuevo.
                        </p>
                      </InfoPanel>
                    ) : (
                      <div className="space-y-3">
                        {visibleMetaConversionPolicyKeys.map((eventKey) => {
                          const copy = META_CONVERSION_POLICY_COPY[eventKey]
                          const policy = metaConversionPolicies.find(item => item.eventKey === eventKey) || {
                            eventKey,
                            enabled: copy.defaultEnabled,
                            conversionName: copy.defaultName,
                            source: 'default' as const
                          }
                          const isSaving = savingMetaPolicy === eventKey
                          const isCustom = policy.source === 'company_override'

                          return (
                            <div
                              key={eventKey}
                              className={cn(
                                'rounded-lg border border-border p-4',
                                policy.enabled ? 'bg-card' : 'bg-muted/40',
                              )}
                            >
                              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                                <div className="min-w-0 flex-1 space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold text-foreground">{copy.title}</p>
                                    <Badge variant={policy.enabled ? 'success' : 'neutral'}>
                                      {policy.enabled ? 'Activo' : 'Apagado'}
                                    </Badge>
                                    <Badge variant={isCustom ? 'primary' : 'outline'}>
                                      {isCustom ? 'Personalizado' : 'Default'}
                                    </Badge>
                                    <Badge variant="neutral">
                                      {copy.codeLabel ?? eventKey}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground">{copy.description}</p>
                                  {copy.risk && (
                                    <p className="text-xs text-warning-text">{copy.risk}</p>
                                  )}
                                  <p className="text-xs text-muted-foreground">
                                    Nombre enviado en custom_data: {policy.conversionName || copy.title}
                                  </p>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    {policy.enabled ? 'Enviar' : 'No enviar'}
                                  </span>
                                  <SettingSwitch
                                    label={`Enviar conversión ${copy.title}`}
                                    checked={Boolean(policy.enabled)}
                                    disabled={Boolean(savingMetaPolicy && !isSaving)}
                                    onCheckedChange={(checked) => updateMetaConversionPolicy(policy, checked)}
                                  />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

              <InfoPanel title="Como obtener las credenciales:">
                <ol className="m-0 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                  <li>Ve a <strong className="font-semibold text-foreground">developers.facebook.com</strong></li>
                  <li>Selecciona tu aplicacion o crea una nueva</li>
                  <li>En Configuracion - Basica, copia el <strong className="font-semibold text-foreground">App ID</strong> y <strong className="font-semibold text-foreground">App Secret</strong></li>
                  <li>Asegurate de configurar los productos: Facebook Login, Instagram Basic Display</li>
                </ol>
              </InfoPanel>
            </TabsContent>

            {/* TAB 9: TikTok Credentials Configuration */}
            <TabsContent value="8" className="mt-4 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Configuracion de TikTok</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Configura las credenciales de TikTok para conectar cuentas y responder comentarios.
                  Cada empresa puede tener sus propias credenciales.
                </p>
              </div>
              <Divider />

              {/* Seccion: Credenciales Login Kit */}
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Credenciales Login Kit (OAuth)
                </h3>
                <p className="mb-4 mt-1 text-xs text-muted-foreground">
                  Necesarias para conectar cuentas de TikTok via OAuth.
                  Obtenlas desde developers.tiktok.com en tu aplicacion Login Kit.
                </p>
                <div className="space-y-4">
                  <Field
                    label="TikTok Client Key"
                    htmlFor="tiktokClientKey"
                    helper="App ID de tu aplicacion TikTok Login Kit"
                  >
                    <Input
                      id="tiktokClientKey"
                      type="text"
                      value={settings.tiktokClientKey}
                      onChange={(e) => updateSetting('tiktokClientKey', e.target.value)}
                      placeholder="awXXXXXXXXXXXXXX"
                    />
                  </Field>

                  <Field
                    label="TikTok Client Secret"
                    htmlFor="tiktokClientSecret"
                    helper="Secret de tu aplicacion TikTok Login Kit"
                  >
                    <Input
                      id="tiktokClientSecret"
                      type="password"
                      value={settings.tiktokClientSecret}
                      onChange={(e) => updateSetting('tiktokClientSecret', e.target.value)}
                      placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    />
                  </Field>
                </div>
              </div>

              <Divider />

              {/* Seccion: Credenciales Business API */}
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Credenciales Business API (para responder comentarios)
                </h3>
                <p className="mb-4 mt-1 text-xs text-muted-foreground">
                  Necesarias para responder comentarios via API. Sin esto, solo se pueden leer comentarios.
                  Obtenlas desde business-api.tiktok.com creando una app de tipo Business.
                </p>
                <div className="space-y-4">
                  <Field
                    label="TikTok Business App ID"
                    htmlFor="tiktokBusinessAppId"
                    helper="App ID de tu aplicacion TikTok Business API"
                  >
                    <Input
                      id="tiktokBusinessAppId"
                      type="text"
                      value={settings.tiktokBusinessAppId}
                      onChange={(e) => updateSetting('tiktokBusinessAppId', e.target.value)}
                      placeholder="123456789"
                    />
                  </Field>

                  <Field
                    label="TikTok Business Secret"
                    htmlFor="tiktokBusinessSecret"
                    helper="Secret de tu aplicacion TikTok Business API"
                  >
                    <Input
                      id="tiktokBusinessSecret"
                      type="password"
                      value={settings.tiktokBusinessSecret}
                      onChange={(e) => updateSetting('tiktokBusinessSecret', e.target.value)}
                      placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    />
                  </Field>
                </div>
              </div>

              <InfoPanel title="Como obtener las credenciales:">
                <ol className="m-0 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                  <li>Ve a <strong className="font-semibold text-foreground">developers.tiktok.com</strong> y crea una app Login Kit</li>
                  <li>Copia el <strong className="font-semibold text-foreground">Client Key</strong> y <strong className="font-semibold text-foreground">Client Secret</strong></li>
                  <li>Para responder comentarios, ve a <strong className="font-semibold text-foreground">business-api.tiktok.com</strong></li>
                  <li>Crea una app Business y copia el <strong className="font-semibold text-foreground">App ID</strong> y <strong className="font-semibold text-foreground">Secret</strong></li>
                </ol>
              </InfoPanel>
            </TabsContent>

            {/* TAB 10: Payment Configuration (SuperAdmin Only) */}
            {isSuperAdmin && (
              <TabsContent value="9" className="mt-4 space-y-6">
                <h2 className="text-lg font-semibold text-foreground">Configuración de Pagos</h2>
                <Divider />

                <p className="text-sm font-semibold text-warning-text">
                  ⚠️ Esta sección es visible solo para SuperAdministradores
                </p>

                {/* PayPal Configuration */}
                <div>
                  <h3 className="mb-3 text-base font-semibold text-foreground">PayPal</h3>
                  <div className="space-y-4">
                    <Field
                      label="Client ID de PayPal"
                      htmlFor="paypalClientId"
                      helper="Client ID público de tu cuenta de PayPal"
                    >
                      <Input
                        id="paypalClientId"
                        type="text"
                        value={settings.paypalClientId}
                        onChange={(e) => updateSetting('paypalClientId', e.target.value)}
                        placeholder="Ingresa el Client ID de PayPal"
                      />
                    </Field>

                    <Field
                      label="Secret Key de PayPal"
                      htmlFor="paypalSecretKey"
                      helper="Clave secreta de tu cuenta de PayPal (se mantiene oculta)"
                    >
                      <Input
                        id="paypalSecretKey"
                        type="password"
                        value={settings.paypalSecretKey}
                        onChange={(e) => updateSetting('paypalSecretKey', e.target.value)}
                        placeholder="Ingresa el Secret Key de PayPal"
                      />
                    </Field>
                  </div>
                </div>

                <Divider />

                {/* Stripe Configuration */}
                <div>
                  <h3 className="mb-3 text-base font-semibold text-foreground">Stripe</h3>
                  <div className="space-y-4">
                    <Field
                      label="Publishable Key de Stripe"
                      htmlFor="stripePublicKey"
                      helper="Clave pública de tu cuenta de Stripe"
                    >
                      <Input
                        id="stripePublicKey"
                        type="text"
                        value={settings.stripePublicKey}
                        onChange={(e) => updateSetting('stripePublicKey', e.target.value)}
                        placeholder="Ingresa el Publishable Key de Stripe"
                      />
                    </Field>

                    <Field
                      label="Secret Key de Stripe"
                      htmlFor="stripeSecretKey"
                      helper="Clave secreta de tu cuenta de Stripe (se mantiene oculta)"
                    >
                      <Input
                        id="stripeSecretKey"
                        type="password"
                        value={settings.stripeSecretKey}
                        onChange={(e) => updateSetting('stripeSecretKey', e.target.value)}
                        placeholder="Ingresa el Secret Key de Stripe"
                      />
                    </Field>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  Las claves de API se utilizan para procesar pagos a través de PayPal y Stripe.
                  Asegúrate de mantener las claves secretas seguras.
                </p>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </div>
  )
}
