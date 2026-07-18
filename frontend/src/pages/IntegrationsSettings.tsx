import { useState } from 'react'
import {
  Gear,
  FloppyDisk,
  ShieldCheck,
  Bell,
  ArrowCounterClockwise,
  CheckCircle,
  XCircle,
  Lock,
  Key,
  Warning,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

// [Fase2·G] Interruptor accesible (role=switch) — el design system no expone un Switch.
function Toggle({
  checked,
  onCheckedChange,
  label,
  size = 'md',
  id,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  size?: 'sm' | 'md'
  id?: string
  disabled?: boolean
}) {
  const sm = size === 'sm'
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
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-0 p-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-55',
        sm ? 'h-6 w-11' : 'h-6 w-11',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block rounded-full bg-card shadow-sm transition-transform',
          sm ? 'size-4' : 'size-5',
          checked ? (sm ? 'translate-x-[22px]' : 'translate-x-[22px]') : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

// Encabezado de sección + separador (reemplaza Typography level="title-md" + Divider).
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-12">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {children}
      </h3>
      <div className="mt-2 border-t border-border" />
    </div>
  )
}

// Fila etiqueta (+ descripción) con interruptor a la derecha.
function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 rounded-lg border border-border bg-background/40 px-3.5 py-3',
        disabled && 'opacity-55',
      )}
    >
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <Toggle
        id={id}
        label={label}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  )
}

// Texto de ayuda bajo un campo (reemplaza Typography level="body-xs").
function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

const textareaClass =
  'w-full rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-55'

export default function IntegrationsSettings() {
  const [generalConfig, setGeneralConfig] = useState({
    globalEnabled: true,
    retryPolicy: 'exponential',
    maxRetries: 3,
    retryDelay: 5,
    timeout: 30,
    maxConnections: 10,
    rateLimitEnabled: true,
    rateLimitRequests: 100,
    rateLimitWindow: 60,
    logLevel: 'info',
    enableMetrics: true,
    enableHealthCheck: true,
    healthCheckInterval: 5,
  })

  const [securityConfig, setSecurityConfig] = useState({
    encryptionEnabled: true,
    encryptionAlgorithm: 'AES-256',
    authMethod: 'api-key',
    tokenRotationEnabled: true,
    tokenRotationDays: 90,
    ipWhitelistEnabled: false,
    allowedIPs: '',
    tlsVersion: '1.3',
    validateCertificates: true,
    auditLogsEnabled: true,
    auditRetentionDays: 365,
  })

  const [notificationConfig, setNotificationConfig] = useState({
    emailEnabled: true,
    emailRecipients: 'admin@jrchateam.com, integrations@jrchateam.com',
    notifyOnError: true,
    notifyOnWarning: false,
    notifyOnSuccess: false,
    emailOnSync: false,
    slackEnabled: false,
    slackWebhook: '',
    slackChannel: '#integrations',
    webhookEnabled: false,
    webhookUrl: '',
    notifyThreshold: 5,
    digestEnabled: true,
    digestFrequency: 'daily',
    digestTime: '08:00',
  })

  const handleSaveGeneral = () => {
    console.log('Guardando configuración general...', generalConfig)
  }

  const handleSaveSecurity = () => {
    console.log('Guardando configuración de seguridad...', securityConfig)
  }

  const handleSaveNotifications = () => {
    console.log('Guardando configuración de notificaciones...', notificationConfig)
  }

  const handleResetDefaults = () => {
    console.log('Restaurando valores por defecto...')
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
                Configuración Global de Integraciones
              </h1>
              <p className="text-sm text-muted-foreground">
                Configuración centralizada para todas las integraciones empresariales
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleResetDefaults}>
              <ArrowCounterClockwise className="size-4" aria-hidden />
              Restaurar Defaults
            </Button>
          </div>
        </div>

        {/* Estado General */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Estado del Sistema de Integraciones
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Control maestro para habilitar o deshabilitar todas las integraciones
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant={generalConfig.globalEnabled ? 'success' : 'destructive'}
                className="px-3 py-1.5 text-sm"
              >
                {generalConfig.globalEnabled ? (
                  <CheckCircle className="size-4" weight="fill" aria-hidden />
                ) : (
                  <XCircle className="size-4" weight="fill" aria-hidden />
                )}
                {generalConfig.globalEnabled ? 'Sistema Activo' : 'Sistema Deshabilitado'}
              </Badge>
              <Toggle
                label="Habilitar todas las integraciones"
                checked={generalConfig.globalEnabled}
                onCheckedChange={(checked) =>
                  setGeneralConfig({ ...generalConfig, globalEnabled: checked })
                }
              />
            </div>
          </div>
        </div>

        {/* Tabs de Configuración */}
        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="security">Seguridad</TabsTrigger>
            <TabsTrigger value="notifications">Notificaciones</TabsTrigger>
          </TabsList>

          {/* Tab General */}
          <TabsContent value="general" className="mt-4">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] sm:p-6">
              <h2 className="mb-5 text-base font-semibold text-foreground">
                Configuración General
              </h2>

              <div className="grid grid-cols-12 gap-x-4 gap-y-5">
                {/* Retry Policy */}
                <SectionTitle>Política de Reintentos</SectionTitle>

                <div className="col-span-12 space-y-1.5 md:col-span-6">
                  <Label htmlFor="retry-policy">Estrategia de Reintentos</Label>
                  <Select
                    value={generalConfig.retryPolicy}
                    onValueChange={(value) =>
                      setGeneralConfig({ ...generalConfig, retryPolicy: value })
                    }
                  >
                    <SelectTrigger id="retry-policy" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin reintentos</SelectItem>
                      <SelectItem value="linear">Lineal (intervalo fijo)</SelectItem>
                      <SelectItem value="exponential">Exponencial (backoff)</SelectItem>
                      <SelectItem value="fibonacci">Fibonacci</SelectItem>
                    </SelectContent>
                  </Select>
                  <Hint>Estrategia de reintentos ante fallos</Hint>
                </div>

                <div className="col-span-12 space-y-1.5 md:col-span-3">
                  <Label htmlFor="max-retries">Máximo de Reintentos</Label>
                  <Input
                    id="max-retries"
                    type="number"
                    min={0}
                    max={10}
                    value={generalConfig.maxRetries}
                    onChange={(e) =>
                      setGeneralConfig({ ...generalConfig, maxRetries: parseInt(e.target.value) })
                    }
                  />
                </div>

                <div className="col-span-12 space-y-1.5 md:col-span-3">
                  <Label htmlFor="retry-delay">Retraso Inicial (segundos)</Label>
                  <Input
                    id="retry-delay"
                    type="number"
                    min={1}
                    max={60}
                    value={generalConfig.retryDelay}
                    onChange={(e) =>
                      setGeneralConfig({ ...generalConfig, retryDelay: parseInt(e.target.value) })
                    }
                  />
                </div>

                {/* Timeouts y Conexiones */}
                <SectionTitle>Timeouts y Conexiones</SectionTitle>

                <div className="col-span-12 space-y-1.5 md:col-span-6">
                  <Label htmlFor="timeout">Timeout Global (segundos)</Label>
                  <Input
                    id="timeout"
                    type="number"
                    min={5}
                    max={300}
                    value={generalConfig.timeout}
                    onChange={(e) =>
                      setGeneralConfig({ ...generalConfig, timeout: parseInt(e.target.value) })
                    }
                  />
                  <Hint>Tiempo máximo de espera para todas las peticiones</Hint>
                </div>

                <div className="col-span-12 space-y-1.5 md:col-span-6">
                  <Label htmlFor="max-connections">Máximo de Conexiones Simultáneas</Label>
                  <Input
                    id="max-connections"
                    type="number"
                    min={1}
                    max={100}
                    value={generalConfig.maxConnections}
                    onChange={(e) =>
                      setGeneralConfig({
                        ...generalConfig,
                        maxConnections: parseInt(e.target.value),
                      })
                    }
                  />
                  <Hint>Número máximo de conexiones concurrentes por integración</Hint>
                </div>

                {/* Rate Limiting */}
                <SectionTitle>Rate Limiting</SectionTitle>

                <div className="col-span-12">
                  <ToggleRow
                    id="rate-limit-enabled"
                    label="Habilitar Rate Limiting"
                    description="Limita el número de peticiones por ventana de tiempo"
                    checked={generalConfig.rateLimitEnabled}
                    onCheckedChange={(checked) =>
                      setGeneralConfig({ ...generalConfig, rateLimitEnabled: checked })
                    }
                  />
                </div>

                {generalConfig.rateLimitEnabled && (
                  <>
                    <div className="col-span-12 space-y-1.5 md:col-span-6">
                      <Label htmlFor="rate-limit-requests">Máximo de Peticiones</Label>
                      <Input
                        id="rate-limit-requests"
                        type="number"
                        min={1}
                        max={10000}
                        value={generalConfig.rateLimitRequests}
                        onChange={(e) =>
                          setGeneralConfig({
                            ...generalConfig,
                            rateLimitRequests: parseInt(e.target.value),
                          })
                        }
                      />
                    </div>

                    <div className="col-span-12 space-y-1.5 md:col-span-6">
                      <Label htmlFor="rate-limit-window">Ventana de Tiempo (segundos)</Label>
                      <Input
                        id="rate-limit-window"
                        type="number"
                        min={1}
                        max={3600}
                        value={generalConfig.rateLimitWindow}
                        onChange={(e) =>
                          setGeneralConfig({
                            ...generalConfig,
                            rateLimitWindow: parseInt(e.target.value),
                          })
                        }
                      />
                    </div>
                  </>
                )}

                {/* Logging y Monitoring */}
                <SectionTitle>Logging y Monitoreo</SectionTitle>

                <div className="col-span-12 space-y-1.5 md:col-span-6">
                  <Label htmlFor="log-level">Nivel de Log</Label>
                  <Select
                    value={generalConfig.logLevel}
                    onValueChange={(value) =>
                      setGeneralConfig({ ...generalConfig, logLevel: value })
                    }
                  >
                    <SelectTrigger id="log-level" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="warn">Warning</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="debug">Debug</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-12 space-y-1.5 md:col-span-6">
                  <Label htmlFor="health-check-interval">Intervalo Health Check (minutos)</Label>
                  <Input
                    id="health-check-interval"
                    type="number"
                    min={1}
                    max={60}
                    value={generalConfig.healthCheckInterval}
                    disabled={!generalConfig.enableHealthCheck}
                    onChange={(e) =>
                      setGeneralConfig({
                        ...generalConfig,
                        healthCheckInterval: parseInt(e.target.value),
                      })
                    }
                  />
                </div>

                <div className="col-span-12">
                  <ToggleRow
                    id="enable-metrics"
                    label="Habilitar Métricas de Performance"
                    checked={generalConfig.enableMetrics}
                    onCheckedChange={(checked) =>
                      setGeneralConfig({ ...generalConfig, enableMetrics: checked })
                    }
                  />
                </div>

                <div className="col-span-12">
                  <ToggleRow
                    id="enable-health-check"
                    label="Habilitar Health Check Automático"
                    checked={generalConfig.enableHealthCheck}
                    onCheckedChange={(checked) =>
                      setGeneralConfig({ ...generalConfig, enableHealthCheck: checked })
                    }
                  />
                </div>

                <div className="col-span-12 flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={handleResetDefaults}>
                    Restablecer
                  </Button>
                  <Button size="sm" onClick={handleSaveGeneral}>
                    <FloppyDisk className="size-4" aria-hidden />
                    Guardar Configuración
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Tab Seguridad */}
          <TabsContent value="security" className="mt-4">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] sm:p-6">
              <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-foreground">
                <ShieldCheck className="size-5 text-muted-foreground" aria-hidden />
                Configuración de Seguridad
              </h2>

              <div
                role="alert"
                className="mb-6 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/14 px-4 py-3 text-warning-text"
              >
                <Warning className="mt-0.5 size-[18px] shrink-0" aria-hidden />
                <div>
                  <p className="text-sm font-semibold">Advertencia de Seguridad</p>
                  <p className="mt-0.5 text-xs">
                    Los cambios en la configuración de seguridad pueden afectar todas las
                    integraciones activas. Asegúrese de probar en un ambiente de desarrollo antes
                    de aplicar en producción.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-x-4 gap-y-5">
                {/* Encriptación */}
                <SectionTitle>Encriptación</SectionTitle>

                <div className="col-span-12">
                  <ToggleRow
                    id="encryption-enabled"
                    label="Habilitar Encriptación de Datos"
                    description="Encripta datos sensibles en tránsito y almacenamiento"
                    checked={securityConfig.encryptionEnabled}
                    onCheckedChange={(checked) =>
                      setSecurityConfig({ ...securityConfig, encryptionEnabled: checked })
                    }
                  />
                </div>

                <div className="col-span-12 space-y-1.5 md:col-span-6">
                  <Label htmlFor="encryption-algorithm">Algoritmo de Encriptación</Label>
                  <Select
                    value={securityConfig.encryptionAlgorithm}
                    onValueChange={(value) =>
                      setSecurityConfig({ ...securityConfig, encryptionAlgorithm: value })
                    }
                    disabled={!securityConfig.encryptionEnabled}
                  >
                    <SelectTrigger id="encryption-algorithm" className="h-11">
                      <span className="flex min-w-0 items-center gap-2">
                        <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <SelectValue />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AES-128">AES-128</SelectItem>
                      <SelectItem value="AES-256">AES-256 (Recomendado)</SelectItem>
                      <SelectItem value="RSA-2048">RSA-2048</SelectItem>
                      <SelectItem value="RSA-4096">RSA-4096</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-12 space-y-1.5 md:col-span-6">
                  <Label htmlFor="tls-version">Versión TLS</Label>
                  <Select
                    value={securityConfig.tlsVersion}
                    onValueChange={(value) =>
                      setSecurityConfig({ ...securityConfig, tlsVersion: value })
                    }
                  >
                    <SelectTrigger id="tls-version" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1.2">TLS 1.2</SelectItem>
                      <SelectItem value="1.3">TLS 1.3 (Recomendado)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Autenticación */}
                <SectionTitle>Autenticación</SectionTitle>

                <div className="col-span-12 space-y-1.5 md:col-span-6">
                  <Label htmlFor="auth-method">Método de Autenticación</Label>
                  <Select
                    value={securityConfig.authMethod}
                    onValueChange={(value) =>
                      setSecurityConfig({ ...securityConfig, authMethod: value })
                    }
                  >
                    <SelectTrigger id="auth-method" className="h-11">
                      <span className="flex min-w-0 items-center gap-2">
                        <Key className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <SelectValue />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="api-key">API Key</SelectItem>
                      <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                      <SelectItem value="jwt">JWT Token</SelectItem>
                      <SelectItem value="basic">Basic Auth</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-12 space-y-1.5 md:col-span-6">
                  <Label htmlFor="token-rotation-days">Rotación de Tokens (días)</Label>
                  <Input
                    id="token-rotation-days"
                    type="number"
                    min={30}
                    max={365}
                    value={securityConfig.tokenRotationDays}
                    disabled={!securityConfig.tokenRotationEnabled}
                    onChange={(e) =>
                      setSecurityConfig({
                        ...securityConfig,
                        tokenRotationDays: parseInt(e.target.value),
                      })
                    }
                  />
                </div>

                <div className="col-span-12">
                  <ToggleRow
                    id="token-rotation-enabled"
                    label="Habilitar Rotación Automática de Tokens"
                    description="Los tokens se renovarán automáticamente según el intervalo configurado"
                    checked={securityConfig.tokenRotationEnabled}
                    onCheckedChange={(checked) =>
                      setSecurityConfig({ ...securityConfig, tokenRotationEnabled: checked })
                    }
                  />
                </div>

                {/* IP Whitelist */}
                <SectionTitle>Control de Acceso</SectionTitle>

                <div className="col-span-12">
                  <ToggleRow
                    id="ip-whitelist-enabled"
                    label="Habilitar IP Whitelist"
                    description="Solo permite conexiones desde IPs autorizadas"
                    checked={securityConfig.ipWhitelistEnabled}
                    onCheckedChange={(checked) =>
                      setSecurityConfig({ ...securityConfig, ipWhitelistEnabled: checked })
                    }
                  />
                </div>

                {securityConfig.ipWhitelistEnabled && (
                  <div className="col-span-12 space-y-1.5">
                    <Label htmlFor="allowed-ips">IPs Permitidas (una por línea)</Label>
                    <textarea
                      id="allowed-ips"
                      rows={4}
                      value={securityConfig.allowedIPs}
                      onChange={(e) =>
                        setSecurityConfig({ ...securityConfig, allowedIPs: e.target.value })
                      }
                      placeholder={'192.168.1.1\n10.0.0.0/8\n172.16.0.0/12'}
                      className={textareaClass}
                    />
                    <Hint>Soporta IPs individuales y rangos CIDR</Hint>
                  </div>
                )}

                <div className="col-span-12">
                  <ToggleRow
                    id="validate-certificates"
                    label="Validar Certificados SSL"
                    checked={securityConfig.validateCertificates}
                    onCheckedChange={(checked) =>
                      setSecurityConfig({ ...securityConfig, validateCertificates: checked })
                    }
                  />
                </div>

                {/* Audit Logs */}
                <SectionTitle>Auditoría</SectionTitle>

                <div className="col-span-12">
                  <ToggleRow
                    id="audit-logs-enabled"
                    label="Habilitar Logs de Auditoría"
                    description="Registra todas las operaciones sensibles para compliance"
                    checked={securityConfig.auditLogsEnabled}
                    onCheckedChange={(checked) =>
                      setSecurityConfig({ ...securityConfig, auditLogsEnabled: checked })
                    }
                  />
                </div>

                <div className="col-span-12 space-y-1.5 md:col-span-6">
                  <Label htmlFor="audit-retention-days">
                    Retención de Logs de Auditoría (días)
                  </Label>
                  <Input
                    id="audit-retention-days"
                    type="number"
                    min={90}
                    max={3650}
                    value={securityConfig.auditRetentionDays}
                    disabled={!securityConfig.auditLogsEnabled}
                    onChange={(e) =>
                      setSecurityConfig({
                        ...securityConfig,
                        auditRetentionDays: parseInt(e.target.value),
                      })
                    }
                  />
                </div>

                <div className="col-span-12 flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={handleResetDefaults}>
                    Restablecer
                  </Button>
                  <Button size="sm" onClick={handleSaveSecurity}>
                    <FloppyDisk className="size-4" aria-hidden />
                    Guardar Configuración
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Tab Notificaciones */}
          <TabsContent value="notifications" className="mt-4">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] sm:p-6">
              <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-foreground">
                <Bell className="size-5 text-muted-foreground" aria-hidden />
                Configuración de Notificaciones
              </h2>

              <div className="grid grid-cols-12 gap-x-4 gap-y-5">
                {/* Email */}
                <SectionTitle>Notificaciones por Email</SectionTitle>

                <div className="col-span-12">
                  <ToggleRow
                    id="email-enabled"
                    label="Habilitar Notificaciones por Email"
                    description="Envía alertas por correo electrónico"
                    checked={notificationConfig.emailEnabled}
                    onCheckedChange={(checked) =>
                      setNotificationConfig({ ...notificationConfig, emailEnabled: checked })
                    }
                  />
                </div>

                <div className="col-span-12 space-y-1.5">
                  <Label htmlFor="email-recipients">Destinatarios (separados por coma)</Label>
                  <textarea
                    id="email-recipients"
                    rows={2}
                    value={notificationConfig.emailRecipients}
                    disabled={!notificationConfig.emailEnabled}
                    onChange={(e) =>
                      setNotificationConfig({
                        ...notificationConfig,
                        emailRecipients: e.target.value,
                      })
                    }
                    className={textareaClass}
                  />
                </div>

                <div className="col-span-12 md:col-span-4">
                  <ToggleRow
                    id="notify-on-error"
                    label="Notificar Errores"
                    checked={notificationConfig.notifyOnError}
                    disabled={!notificationConfig.emailEnabled}
                    onCheckedChange={(checked) =>
                      setNotificationConfig({ ...notificationConfig, notifyOnError: checked })
                    }
                  />
                </div>

                <div className="col-span-12 md:col-span-4">
                  <ToggleRow
                    id="notify-on-warning"
                    label="Notificar Warnings"
                    checked={notificationConfig.notifyOnWarning}
                    disabled={!notificationConfig.emailEnabled}
                    onCheckedChange={(checked) =>
                      setNotificationConfig({ ...notificationConfig, notifyOnWarning: checked })
                    }
                  />
                </div>

                <div className="col-span-12 md:col-span-4">
                  <ToggleRow
                    id="email-on-sync"
                    label="Notificar Sync"
                    checked={notificationConfig.emailOnSync}
                    disabled={!notificationConfig.emailEnabled}
                    onCheckedChange={(checked) =>
                      setNotificationConfig({ ...notificationConfig, emailOnSync: checked })
                    }
                  />
                </div>

                {/* Slack */}
                <SectionTitle>Notificaciones por Slack</SectionTitle>

                <div className="col-span-12">
                  <ToggleRow
                    id="slack-enabled"
                    label="Habilitar Notificaciones por Slack"
                    description="Envía alertas a un canal de Slack"
                    checked={notificationConfig.slackEnabled}
                    onCheckedChange={(checked) =>
                      setNotificationConfig({ ...notificationConfig, slackEnabled: checked })
                    }
                  />
                </div>

                <div className="col-span-12 space-y-1.5">
                  <Label htmlFor="slack-webhook">Slack Webhook URL</Label>
                  <Input
                    id="slack-webhook"
                    value={notificationConfig.slackWebhook}
                    placeholder="https://hooks.slack.com/services/..."
                    disabled={!notificationConfig.slackEnabled}
                    onChange={(e) =>
                      setNotificationConfig({
                        ...notificationConfig,
                        slackWebhook: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="col-span-12 space-y-1.5">
                  <Label htmlFor="slack-channel">Canal de Slack</Label>
                  <Input
                    id="slack-channel"
                    value={notificationConfig.slackChannel}
                    placeholder="#integrations"
                    disabled={!notificationConfig.slackEnabled}
                    onChange={(e) =>
                      setNotificationConfig({
                        ...notificationConfig,
                        slackChannel: e.target.value,
                      })
                    }
                  />
                </div>

                {/* Webhook */}
                <SectionTitle>Notificaciones por Webhook</SectionTitle>

                <div className="col-span-12">
                  <ToggleRow
                    id="webhook-enabled"
                    label="Habilitar Webhook de Alertas"
                    description="Envía alertas a un endpoint HTTP personalizado"
                    checked={notificationConfig.webhookEnabled}
                    onCheckedChange={(checked) =>
                      setNotificationConfig({ ...notificationConfig, webhookEnabled: checked })
                    }
                  />
                </div>

                <div className="col-span-12 space-y-1.5">
                  <Label htmlFor="webhook-url">Webhook URL</Label>
                  <Input
                    id="webhook-url"
                    value={notificationConfig.webhookUrl}
                    placeholder="https://api.example.com/alerts"
                    disabled={!notificationConfig.webhookEnabled}
                    onChange={(e) =>
                      setNotificationConfig({ ...notificationConfig, webhookUrl: e.target.value })
                    }
                  />
                </div>

                {/* Configuración Avanzada */}
                <SectionTitle>Configuración Avanzada</SectionTitle>

                <div className="col-span-12 space-y-1.5 md:col-span-6">
                  <Label htmlFor="notify-threshold">
                    Umbral de Notificación (errores consecutivos)
                  </Label>
                  <Input
                    id="notify-threshold"
                    type="number"
                    min={1}
                    max={100}
                    value={notificationConfig.notifyThreshold}
                    onChange={(e) =>
                      setNotificationConfig({
                        ...notificationConfig,
                        notifyThreshold: parseInt(e.target.value),
                      })
                    }
                  />
                  <Hint>Número de errores antes de enviar notificación</Hint>
                </div>

                <div className="col-span-12">
                  <ToggleRow
                    id="digest-enabled"
                    label="Habilitar Resumen Diario"
                    description="Envía un resumen consolidado de todas las integraciones"
                    checked={notificationConfig.digestEnabled}
                    onCheckedChange={(checked) =>
                      setNotificationConfig({ ...notificationConfig, digestEnabled: checked })
                    }
                  />
                </div>

                {notificationConfig.digestEnabled && (
                  <>
                    <div className="col-span-12 space-y-1.5 md:col-span-6">
                      <Label htmlFor="digest-frequency">Frecuencia del Resumen</Label>
                      <Select
                        value={notificationConfig.digestFrequency}
                        onValueChange={(value) =>
                          setNotificationConfig({ ...notificationConfig, digestFrequency: value })
                        }
                      >
                        <SelectTrigger id="digest-frequency" className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Diario</SelectItem>
                          <SelectItem value="weekly">Semanal</SelectItem>
                          <SelectItem value="monthly">Mensual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="col-span-12 space-y-1.5 md:col-span-6">
                      <Label htmlFor="digest-time">Hora de Envío</Label>
                      <Input
                        id="digest-time"
                        type="time"
                        value={notificationConfig.digestTime}
                        onChange={(e) =>
                          setNotificationConfig({
                            ...notificationConfig,
                            digestTime: e.target.value,
                          })
                        }
                      />
                    </div>
                  </>
                )}

                <div className="col-span-12 flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={handleResetDefaults}>
                    Restablecer
                  </Button>
                  <Button size="sm" onClick={handleSaveNotifications}>
                    <FloppyDisk className="size-4" aria-hidden />
                    Guardar Configuración
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
