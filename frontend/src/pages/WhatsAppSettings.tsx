import { useState, useEffect } from 'react'
import { Gear, FloppyDisk, Key, Bell } from '@phosphor-icons/react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import api from '../services/api'
import logger from '../utils/logger'
import { toast } from 'react-toastify'

const textareaClass =
  'w-full rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

// Toggle accesible (role=switch) con tokens del design system. No hay primitivo
// Switch en @/components/ui, así que se define localmente siguiendo el patrón de Checkbox.
function Toggle({
  checked,
  onCheckedChange,
  id,
  ariaLabel,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  id?: string
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 transform rounded-full bg-card shadow-sm transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

export default function WhatsAppSettings() {
  // [Ola 3] Evita doble envío y permite indicar el progreso en el botón.
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState({
    // Meta API Credentials
    appId: '',
    appSecret: '',
    businessAccountId: '',
    accessToken: '',

    // Webhook Settings
    webhookUrl: '',
    verifyToken: '',

    // Auto-reply
    autoReplyEnabled: true,
    autoReplyMessage: '¡Hola! Gracias por contactarnos. Un agente te atenderá pronto.',
    autoReplyDelay: 30,

    // Business Hours
    businessHoursEnabled: true,
    businessHoursMessage: 'Horario de atención: Lunes a Viernes 9:00 AM - 6:00 PM',
    mondayStart: '09:00',
    mondayEnd: '18:00',

    // Rate Limiting
    rateLimitEnabled: true,
    maxMessagesPerMinute: 60,
    maxMessagesPerHour: 1000,

    // Advanced
    enableReadReceipts: true,
    enableTypingIndicator: true,
    logWebhookPayloads: true,
    retryFailedMessages: true,
    maxRetries: 3,
  })

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data } = await api.get('/whatsapp/settings')
        const fetched = data?.data ?? data ?? {}
        setSettings((prev) => ({ ...prev, ...fetched }))
      } catch (err) {
        // Se mantienen los defaults, pero hay que avisar: si no, el usuario cree que
        // está viendo su configuración real y en realidad son valores por defecto.
        logger.error('[WhatsAppSettings] no se pudo cargar la configuración', err)
        toast.error('No se pudo cargar la configuración. Se muestran los valores por defecto.')
      }
    }
    fetchSettings()
  }, [])

  // [Ola 3] Antes: catch vacío y ni un aviso de éxito. El usuario pulsaba "Guardar",
  // no pasaba nada visible, y no había forma de saber si se había guardado o no.
  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/whatsapp/settings', settings)
      toast.success('Configuración guardada')
    } catch (err) {
      logger.error('[WhatsAppSettings] no se pudo guardar la configuración', err)
      toast.error('No se pudo guardar la configuración. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
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
                Configuración WhatsApp API
              </h1>
              <p className="text-sm text-muted-foreground">
                Credenciales y configuración de WhatsApp Business Cloud API
              </p>
            </div>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <FloppyDisk className="size-4" aria-hidden />
            {saving ? 'Guardando…' : 'Guardar Cambios'}
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="credentials" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="credentials">Credenciales Meta</TabsTrigger>
            <TabsTrigger value="auto-reply">Respuestas Automáticas</TabsTrigger>
            <TabsTrigger value="hours">Horarios de Atención</TabsTrigger>
            <TabsTrigger value="limits">Límites y Seguridad</TabsTrigger>
          </TabsList>

          {/* Credenciales Meta */}
          <TabsContent value="credentials">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-foreground">
                <Key className="size-5" aria-hidden />
                Credenciales de Meta Business API
              </h2>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="appId">App ID</Label>
                  <Input
                    id="appId"
                    value={settings.appId}
                    onChange={(e) => setSettings({ ...settings, appId: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="appSecret">App Secret</Label>
                  <Input
                    id="appSecret"
                    type="password"
                    value={settings.appSecret}
                    onChange={(e) => setSettings({ ...settings, appSecret: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="businessAccountId">Business Account ID (WABA ID)</Label>
                  <Input
                    id="businessAccountId"
                    value={settings.businessAccountId}
                    onChange={(e) => setSettings({ ...settings, businessAccountId: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="accessToken">Access Token (Permanente)</Label>
                  <textarea
                    id="accessToken"
                    rows={2}
                    className={textareaClass}
                    value={settings.accessToken}
                    onChange={(e) => setSettings({ ...settings, accessToken: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Obtén tu access token desde Meta Business Suite {'>'} Configuración del Sistema
                  </p>
                </div>
              </div>

              <div className="my-6 border-t border-border" />

              <h3 className="mb-4 text-base font-semibold text-foreground">Configuración de Webhook</h3>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="webhookUrl">URL del Webhook</Label>
                  <Input
                    id="webhookUrl"
                    value={settings.webhookUrl}
                    onChange={(e) => setSettings({ ...settings, webhookUrl: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="verifyToken">Verify Token</Label>
                  <Input
                    id="verifyToken"
                    value={settings.verifyToken}
                    onChange={(e) => setSettings({ ...settings, verifyToken: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Respuestas Automáticas */}
          <TabsContent value="auto-reply">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-foreground">
                <Bell className="size-5" aria-hidden />
                Respuestas Automáticas
              </h2>

              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Habilitar Respuesta Automática</p>
                  <p className="text-xs text-muted-foreground">
                    Envía un mensaje automático cuando un usuario escribe por primera vez
                  </p>
                </div>
                <Toggle
                  ariaLabel="Habilitar Respuesta Automática"
                  checked={settings.autoReplyEnabled}
                  onCheckedChange={(v) => setSettings({ ...settings, autoReplyEnabled: v })}
                />
              </div>

              {settings.autoReplyEnabled && (
                <>
                  <div className="mb-4 space-y-1.5">
                    <Label htmlFor="autoReplyMessage">Mensaje de Respuesta Automática</Label>
                    <textarea
                      id="autoReplyMessage"
                      rows={3}
                      className={textareaClass}
                      value={settings.autoReplyMessage}
                      onChange={(e) => setSettings({ ...settings, autoReplyMessage: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="autoReplyDelay">Tiempo de Espera (segundos)</Label>
                    <Input
                      id="autoReplyDelay"
                      type="number"
                      min={0}
                      max={300}
                      value={settings.autoReplyDelay}
                      onChange={(e) => setSettings({ ...settings, autoReplyDelay: parseInt(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Espera antes de enviar la respuesta automática (0-300 segundos)
                    </p>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {/* Horarios de Atención */}
          <TabsContent value="hours">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-6 text-lg font-semibold text-foreground">Horarios de Atención</h2>

              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Habilitar Mensaje Fuera de Horario</p>
                  <p className="text-xs text-muted-foreground">
                    Envía un mensaje automático fuera del horario de atención
                  </p>
                </div>
                <Toggle
                  ariaLabel="Habilitar Mensaje Fuera de Horario"
                  checked={settings.businessHoursEnabled}
                  onCheckedChange={(v) => setSettings({ ...settings, businessHoursEnabled: v })}
                />
              </div>

              {settings.businessHoursEnabled && (
                <>
                  <div className="mb-6 space-y-1.5">
                    <Label htmlFor="businessHoursMessage">Mensaje Fuera de Horario</Label>
                    <textarea
                      id="businessHoursMessage"
                      rows={2}
                      className={textareaClass}
                      value={settings.businessHoursMessage}
                      onChange={(e) => setSettings({ ...settings, businessHoursMessage: e.target.value })}
                    />
                  </div>

                  <h3 className="mb-4 text-sm font-semibold text-foreground">Horario Lunes a Viernes</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="mondayStart">Hora de Inicio</Label>
                      <Input
                        id="mondayStart"
                        type="time"
                        value={settings.mondayStart}
                        onChange={(e) => setSettings({ ...settings, mondayStart: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="mondayEnd">Hora de Fin</Label>
                      <Input
                        id="mondayEnd"
                        type="time"
                        value={settings.mondayEnd}
                        onChange={(e) => setSettings({ ...settings, mondayEnd: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {/* Límites y Seguridad */}
          <TabsContent value="limits">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-6 text-lg font-semibold text-foreground">
                Límites y Configuración Avanzada
              </h2>

              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Habilitar Limitación de Tasa</p>
                  <p className="text-xs text-muted-foreground">
                    Limita el número de mensajes por minuto y hora
                  </p>
                </div>
                <Toggle
                  ariaLabel="Habilitar Limitación de Tasa"
                  checked={settings.rateLimitEnabled}
                  onCheckedChange={(v) => setSettings({ ...settings, rateLimitEnabled: v })}
                />
              </div>

              {settings.rateLimitEnabled && (
                <div className="mb-6 grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="maxMessagesPerMinute">Mensajes por Minuto</Label>
                    <Input
                      id="maxMessagesPerMinute"
                      type="number"
                      value={settings.maxMessagesPerMinute}
                      onChange={(e) => setSettings({ ...settings, maxMessagesPerMinute: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="maxMessagesPerHour">Mensajes por Hora</Label>
                    <Input
                      id="maxMessagesPerHour"
                      type="number"
                      value={settings.maxMessagesPerHour}
                      onChange={(e) => setSettings({ ...settings, maxMessagesPerHour: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
              )}

              <div className="my-6 border-t border-border" />

              <h3 className="mb-4 text-base font-semibold text-foreground">Opciones Avanzadas</h3>

              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="enableReadReceipts">Confirmaciones de Lectura</Label>
                  <Toggle
                    id="enableReadReceipts"
                    ariaLabel="Confirmaciones de Lectura"
                    checked={settings.enableReadReceipts}
                    onCheckedChange={(v) => setSettings({ ...settings, enableReadReceipts: v })}
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="enableTypingIndicator">Indicador de Escritura</Label>
                  <Toggle
                    id="enableTypingIndicator"
                    ariaLabel="Indicador de Escritura"
                    checked={settings.enableTypingIndicator}
                    onCheckedChange={(v) => setSettings({ ...settings, enableTypingIndicator: v })}
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="logWebhookPayloads">Registrar Payloads de Webhook</Label>
                  <Toggle
                    id="logWebhookPayloads"
                    ariaLabel="Registrar Payloads de Webhook"
                    checked={settings.logWebhookPayloads}
                    onCheckedChange={(v) => setSettings({ ...settings, logWebhookPayloads: v })}
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="retryFailedMessages">Reintentar Mensajes Fallidos</Label>
                  <Toggle
                    id="retryFailedMessages"
                    ariaLabel="Reintentar Mensajes Fallidos"
                    checked={settings.retryFailedMessages}
                    onCheckedChange={(v) => setSettings({ ...settings, retryFailedMessages: v })}
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
