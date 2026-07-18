import { useState, useEffect, type ReactNode } from 'react'
// [Fase2·G] Se conserva LinearProgress de MUI Joy: no hay equivalente en @/components/ui.
import { LinearProgress } from '@mui/joy'
import {
  Buildings,
  PencilSimple,
  FloppyDisk,
  UploadSimple,
  Users,
  MapPin,
  EnvelopeSimple,
  Phone,
  Translate,
  Clock,
  Bell,
  CreditCard,
  CheckCircle,
  Warning,
  Info,
} from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import api from '../services/api'

/**
 * Interface for Company data structure
 */
interface Company {
  id: number
  name: string
  legalName: string
  taxId: string
  industry: string
  size: string
  website?: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  country: string
  postalCode: string
  timezone: string
  language: string
  currency: string
  logo?: string
  settings: {
    workingHours: {
      enabled: boolean
      start: string
      end: string
      days: string[]
    }
    notifications: {
      email: boolean
      sms: boolean
      push: boolean
    }
    security: {
      twoFactor: boolean
      sessionTimeout: number
      passwordExpiry: number
    }
    integrations: {
      whatsapp: boolean
      telegram: boolean
      email: boolean
      stripe: boolean
    }
  }
  stats: {
    users: number
    activeUsers: number
    tickets: number
    campaigns: number
  }
  createdAt: string
  updatedAt: string
}

// Toggle accesible (role="switch") con tokens del design system.
// No hay componente Switch en @/components/ui; se define local (mismo patrón que
// IntegrationSmartTrack / AppointmentsReminders).
function Toggle({
  checked,
  onChange,
  id,
  label,
  disabled,
}: {
  checked: boolean
  onChange?: (checked: boolean) => void
  id?: string
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-55',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-card shadow-sm transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
        aria-hidden
      />
    </button>
  )
}

// Fila de toggle etiquetada (label + descripción a la izquierda, switch a la derecha).
function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string
  label: string
  description?: string
  checked: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <Toggle
        id={id}
        label={label}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  )
}

// Tarjeta de estadística con icono decorativo y badge de contexto.
function StatCard({
  label,
  value,
  badge,
  badgeVariant = 'neutral',
  icon,
}: {
  label: string
  value: string
  badge: string
  badgeVariant?: 'neutral' | 'primary' | 'success' | 'warning'
  icon: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
            {value}
          </p>
          <Badge variant={badgeVariant} className="mt-2">
            {badge}
          </Badge>
        </div>
        <span className="shrink-0 text-muted-foreground/40" aria-hidden>
          {icon}
        </span>
      </div>
    </div>
  )
}

// Estado de una integración (tarjeta con badge activa/inactiva).
function IntegrationCard({
  title,
  description,
  active,
}: {
  title: string
  description: string
  active: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <Badge variant={active ? 'success' : 'neutral'}>
          {active && <CheckCircle className="size-3.5" weight="fill" aria-hidden />}
          {active ? 'Activa' : 'Inactiva'}
        </Badge>
      </div>
    </div>
  )
}

const SECTION_CARD =
  'rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]'

/**
 * Company Configuration Module
 * Complete company settings and team management
 *
 * Features:
 * - Company profile editing
 * - Logo upload
 * - Contact information
 * - Location settings
 * - Timezone and language
 * - Working hours configuration
 * - Notification preferences
 * - Security settings
 * - Integration status
 * - Team statistics
 */
export default function Company() {
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [formData, setFormData] = useState<Partial<Company>>({})
  const [notification, setNotification] = useState<{ type: 'success' | 'danger'; message: string } | null>(null)

  const showNotification = (type: 'success' | 'danger', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 4000)
  }

  useEffect(() => {
    fetchCompanyData()
  }, [])

  const fetchCompanyData = async () => {
    setLoading(true)
    try {
      const response = await api.get('/company')
      const data = response.data?.data ?? response.data
      setCompany(data)
      setFormData(data)
    } catch (_error) {
      setCompany(null)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/company', formData)
      setCompany(formData as Company)
      setEditMode(false)
      showNotification('success', 'Cambios guardados exitosamente')
    } catch (_error) {
      showNotification('danger', 'Error al guardar los cambios')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setFormData(company || {})
    setEditMode(false)
  }

  const handleLogoUpload = () => {
    // Pendiente: implementar subida de logo
  }

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] p-5 sm:p-6 lg:p-8">
          <LinearProgress />
        </div>
      </div>
    )
  }

  if (!company) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] p-5 sm:p-6 lg:p-8">
          <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm shadow-black/[0.02]">
            <Buildings
              className="mx-auto size-16 text-muted-foreground/50"
              aria-hidden
            />
            <h2 className="mt-4 text-lg font-semibold text-foreground">
              No se pudo cargar la información de la empresa
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Verifica tu conexión e intenta nuevamente.
            </p>
            <Button size="sm" className="mt-6" onClick={fetchCompanyData}>
              Reintentar
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const activeIntegrations = Object.values(company.settings.integrations).filter(Boolean).length

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Notification */}
        {notification && (
          <div
            role="alert"
            className={cn(
              'flex items-center gap-2 rounded-lg border px-4 py-3 text-sm',
              notification.type === 'success'
                ? 'border-success/30 bg-success/10 text-success-text'
                : 'border-destructive/30 bg-destructive/10 text-destructive-text',
            )}
          >
            {notification.type === 'success' ? (
              <CheckCircle className="size-[18px] shrink-0" aria-hidden />
            ) : (
              <Warning className="size-[18px] shrink-0" aria-hidden />
            )}
            <span>{notification.message}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Buildings className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Empresa
              </h1>
              <p className="text-sm text-muted-foreground">
                Configuración de empresa y equipo
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSave} loading={saving}>
                  <FloppyDisk className="size-4" aria-hidden />
                  Guardar Cambios
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setEditMode(true)}>
                <PencilSimple className="size-4" aria-hidden />
                Editar
              </Button>
            )}
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Usuarios"
            value={String(company.stats.users)}
            badge={`${company.stats.activeUsers} activos`}
            badgeVariant="success"
            icon={<Users className="size-12" weight="fill" />}
          />
          <StatCard
            label="Tickets"
            value={String(company.stats.tickets)}
            badge="Este mes"
            badgeVariant="primary"
            icon={<CheckCircle className="size-12" weight="fill" />}
          />
          <StatCard
            label="Campañas"
            value={String(company.stats.campaigns)}
            badge="Activas"
            badgeVariant="warning"
            icon={<Bell className="size-12" weight="fill" />}
          />
          <StatCard
            label="Integraciones"
            value={String(activeIntegrations)}
            badge="Activas"
            badgeVariant="success"
            icon={<CheckCircle className="size-12" weight="fill" />}
          />
        </div>

        {/* Tabs */}
        <Tabs
          value={String(activeTab)}
          onValueChange={(value) => setActiveTab(Number(value))}
        >
          <TabsList>
            <TabsTrigger value="0">Información General</TabsTrigger>
            <TabsTrigger value="1">Configuración</TabsTrigger>
            <TabsTrigger value="2">Seguridad</TabsTrigger>
            <TabsTrigger value="3">Integraciones</TabsTrigger>
          </TabsList>

          {/* Tab 1: General Information */}
          <TabsContent value="0" className="space-y-4">
            <div className={SECTION_CARD}>
              <h2 className="text-lg font-semibold text-foreground">
                Perfil de Empresa
              </h2>

              {/* Logo */}
              <div className="mt-4 flex flex-wrap items-center gap-4">
                {company.logo ? (
                  <img
                    src={company.logo}
                    alt={`Logo de ${company.name}`}
                    width={100}
                    height={100}
                    className="size-[100px] shrink-0 rounded-full border border-border object-cover"
                  />
                ) : (
                  <span className="flex size-[100px] shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Buildings className="size-12" aria-hidden />
                  </span>
                )}
                {editMode && (
                  <Button variant="outline" size="sm" onClick={handleLogoUpload}>
                    <UploadSimple className="size-4" aria-hidden />
                    Cambiar Logo
                  </Button>
                )}
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="company-name">Nombre Comercial *</Label>
                  <Input
                    id="company-name"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={!editMode}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-legal-name">Razón Social *</Label>
                  <Input
                    id="company-legal-name"
                    value={formData.legalName || ''}
                    onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
                    disabled={!editMode}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-tax-id">NIF/CIF *</Label>
                  <Input
                    id="company-tax-id"
                    value={formData.taxId || ''}
                    onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                    disabled={!editMode}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-industry">Industria</Label>
                  <Select
                    value={formData.industry || undefined}
                    onValueChange={(value) => setFormData({ ...formData, industry: value })}
                    disabled={!editMode}
                  >
                    <SelectTrigger id="company-industry" className="h-11">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Technology">Tecnología</SelectItem>
                      <SelectItem value="Retail">Retail</SelectItem>
                      <SelectItem value="Healthcare">Salud</SelectItem>
                      <SelectItem value="Finance">Finanzas</SelectItem>
                      <SelectItem value="Education">Educación</SelectItem>
                      <SelectItem value="Other">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-size">Tamaño de Empresa</Label>
                  <Select
                    value={formData.size || undefined}
                    onValueChange={(value) => setFormData({ ...formData, size: value })}
                    disabled={!editMode}
                  >
                    <SelectTrigger id="company-size" className="h-11">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-10">1-10 empleados</SelectItem>
                      <SelectItem value="10-50">10-50 empleados</SelectItem>
                      <SelectItem value="50-200">50-200 empleados</SelectItem>
                      <SelectItem value="200+">200+ empleados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-website">Sitio Web</Label>
                  <Input
                    id="company-website"
                    value={formData.website || ''}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    disabled={!editMode}
                    placeholder="https://ejemplo.com"
                  />
                </div>
              </div>
            </div>

            <div className={SECTION_CARD}>
              <h2 className="text-lg font-semibold text-foreground">
                Información de Contacto
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="company-email">Email *</Label>
                  <Input
                    id="company-email"
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={!editMode}
                    leftIcon={<EnvelopeSimple aria-hidden />}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-phone">Teléfono *</Label>
                  <Input
                    id="company-phone"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    disabled={!editMode}
                    leftIcon={<Phone aria-hidden />}
                  />
                </div>
              </div>
            </div>

            <div className={SECTION_CARD}>
              <h2 className="text-lg font-semibold text-foreground">Ubicación</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="company-address">Dirección</Label>
                  <Input
                    id="company-address"
                    value={formData.address || ''}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    disabled={!editMode}
                    leftIcon={<MapPin aria-hidden />}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-city">Ciudad</Label>
                  <Input
                    id="company-city"
                    value={formData.city || ''}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    disabled={!editMode}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-state">Provincia/Estado</Label>
                  <Input
                    id="company-state"
                    value={formData.state || ''}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    disabled={!editMode}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-country">País</Label>
                  <Input
                    id="company-country"
                    value={formData.country || ''}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    disabled={!editMode}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-postal-code">Código Postal</Label>
                  <Input
                    id="company-postal-code"
                    value={formData.postalCode || ''}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    disabled={!editMode}
                  />
                </div>
              </div>
            </div>

            <div className={SECTION_CARD}>
              <h2 className="text-lg font-semibold text-foreground">
                Preferencias Regionales
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="company-timezone">Zona Horaria</Label>
                  <Select
                    value={formData.timezone || undefined}
                    onValueChange={(value) => setFormData({ ...formData, timezone: value })}
                    disabled={!editMode}
                  >
                    <SelectTrigger id="company-timezone" className="h-11">
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <Clock
                          className="size-[18px] shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <SelectValue placeholder="Seleccionar" />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Europe/Madrid">Europa/Madrid (GMT+1)</SelectItem>
                      <SelectItem value="America/New_York">América/Nueva York (GMT-5)</SelectItem>
                      <SelectItem value="America/Mexico_City">América/Ciudad de México (GMT-6)</SelectItem>
                      <SelectItem value="America/Sao_Paulo">América/São Paulo (GMT-3)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-language">Idioma</Label>
                  <Select
                    value={formData.language || undefined}
                    onValueChange={(value) => setFormData({ ...formData, language: value })}
                    disabled={!editMode}
                  >
                    <SelectTrigger id="company-language" className="h-11">
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <Translate
                          className="size-[18px] shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <SelectValue placeholder="Seleccionar" />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="es">Español</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="pt">Português</SelectItem>
                      <SelectItem value="fr">Français</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-currency">Moneda</Label>
                  <Select
                    value={formData.currency || undefined}
                    onValueChange={(value) => setFormData({ ...formData, currency: value })}
                    disabled={!editMode}
                  >
                    <SelectTrigger id="company-currency" className="h-11">
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <CreditCard
                          className="size-[18px] shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <SelectValue placeholder="Seleccionar" />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                      <SelectItem value="MXN">MXN ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Tab 2: Configuration */}
          <TabsContent value="1" className="space-y-4">
            <div className={SECTION_CARD}>
              <h2 className="text-lg font-semibold text-foreground">Horario Laboral</h2>

              <div
                role="note"
                className="mt-4 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground"
              >
                <Info className="size-[18px] shrink-0 text-primary" aria-hidden />
                <span>
                  Configure el horario de atención de su empresa para gestionar tickets
                  automáticamente.
                </span>
              </div>

              <div className="mt-4 space-y-4">
                <ToggleRow
                  id="working-hours-enabled"
                  label="Habilitar Horario Laboral"
                  checked={formData.settings?.workingHours?.enabled || false}
                  disabled={!editMode}
                  onChange={(checked) =>
                    setFormData({
                      ...formData,
                      settings: {
                        ...formData.settings!,
                        workingHours: {
                          ...formData.settings!.workingHours,
                          enabled: checked,
                        },
                      },
                    })
                  }
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="working-hours-start">Hora de Inicio</Label>
                    <Input
                      id="working-hours-start"
                      type="time"
                      value={formData.settings?.workingHours?.start || ''}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="working-hours-end">Hora de Fin</Label>
                    <Input
                      id="working-hours-end"
                      type="time"
                      value={formData.settings?.workingHours?.end || ''}
                      disabled={!editMode}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className={SECTION_CARD}>
              <h2 className="text-lg font-semibold text-foreground">Notificaciones</h2>
              <div className="mt-4 space-y-4">
                <ToggleRow
                  id="notifications-email"
                  label="Notificaciones por Email"
                  description="Recibir notificaciones importantes por correo electrónico"
                  checked={formData.settings?.notifications?.email || false}
                  disabled={!editMode}
                />
                <ToggleRow
                  id="notifications-sms"
                  label="Notificaciones SMS"
                  description="Recibir alertas urgentes por mensaje de texto"
                  checked={formData.settings?.notifications?.sms || false}
                  disabled={!editMode}
                />
                <ToggleRow
                  id="notifications-push"
                  label="Notificaciones Push"
                  description="Recibir notificaciones en tiempo real en el navegador"
                  checked={formData.settings?.notifications?.push || false}
                  disabled={!editMode}
                />
              </div>
            </div>
          </TabsContent>

          {/* Tab 3: Security */}
          <TabsContent value="2" className="space-y-4">
            <div
              role="note"
              className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-text"
            >
              <Warning className="size-[18px] shrink-0" aria-hidden />
              <span>
                La configuración de seguridad afecta a todos los usuarios de la empresa.
              </span>
            </div>

            <div className={SECTION_CARD}>
              <h2 className="text-lg font-semibold text-foreground">Autenticación</h2>
              <div className="mt-4 space-y-4">
                <ToggleRow
                  id="security-two-factor"
                  label="Autenticación de Dos Factores (2FA)"
                  description="Requerir verificación adicional al iniciar sesión"
                  checked={formData.settings?.security?.twoFactor || false}
                  disabled={!editMode}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="security-session-timeout">
                    Tiempo de Expiración de Sesión (minutos)
                  </Label>
                  <Input
                    id="security-session-timeout"
                    type="number"
                    min={5}
                    max={480}
                    value={formData.settings?.security?.sessionTimeout || 30}
                    disabled={!editMode}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="security-password-expiry">
                    Caducidad de Contraseña (días)
                  </Label>
                  <Input
                    id="security-password-expiry"
                    type="number"
                    min={30}
                    max={365}
                    value={formData.settings?.security?.passwordExpiry || 90}
                    disabled={!editMode}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Tab 4: Integrations */}
          <TabsContent value="3" className="space-y-4">
            <div
              role="note"
              className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success-text"
            >
              <CheckCircle className="size-[18px] shrink-0" aria-hidden />
              <span>{activeIntegrations} de 4 integraciones activas</span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <IntegrationCard
                title="WhatsApp Business"
                description="API oficial de Meta"
                active={company.settings.integrations.whatsapp}
              />
              <IntegrationCard
                title="Telegram"
                description="Bot API de Telegram"
                active={company.settings.integrations.telegram}
              />
              <IntegrationCard
                title="Email Marketing"
                description="SendGrid / Amazon SES"
                active={company.settings.integrations.email}
              />
              <IntegrationCard
                title="Stripe Payments"
                description="Procesamiento de pagos"
                active={company.settings.integrations.stripe}
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer Info */}
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">
            Empresa creada el {new Date(company.createdAt).toLocaleDateString('es-ES')} • Última
            actualización: {new Date(company.updatedAt).toLocaleDateString('es-ES')}
          </p>
        </div>
      </div>
    </div>
  )
}
