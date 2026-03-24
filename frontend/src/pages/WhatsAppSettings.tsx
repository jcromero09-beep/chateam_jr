import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Input,
  FormControl,
  FormLabel,
  Grid,
  Switch,
  Textarea,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Divider,
} from '@mui/joy'
import {
  Settings as SettingsIcon,
  Save as SaveIcon,
  Key as KeyIcon,
  Notifications as NotificationsIcon,
} from '@mui/icons-material'
import api from '../services/api'

export default function WhatsAppSettings() {
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
      } catch {
        // mantener defaults en error
      }
    }
    fetchSettings()
  }, [])

  const handleSave = async () => {
    try {
      await api.put('/whatsapp/settings', settings)
    } catch {
      // manejar error silenciosamente o mostrar snackbar
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <SettingsIcon sx={{ fontSize: 32 }} />
            Configuración WhatsApp API
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Credenciales y configuración de WhatsApp Business Cloud API
          </Typography>
        </Box>
        <Button startDecorator={<SaveIcon />} onClick={handleSave}>
          Guardar Cambios
        </Button>
      </Box>

      <Tabs defaultValue={0}>
        <TabList>
          <Tab>Credenciales Meta</Tab>
          <Tab>Respuestas Automáticas</Tab>
          <Tab>Horarios de Atención</Tab>
          <Tab>Límites y Seguridad</Tab>
        </TabList>

        <TabPanel value={0}>
          <Card>
            <CardContent>
              <Typography level="title-lg" startDecorator={<KeyIcon />} sx={{ mb: 3 }}>
                Credenciales de Meta Business API
              </Typography>

              <Grid container spacing={2}>
                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>App ID</FormLabel>
                    <Input
                      value={settings.appId}
                      onChange={(e) => setSettings({ ...settings, appId: e.target.value })}
                    />
                  </FormControl>
                </Grid>
                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>App Secret</FormLabel>
                    <Input
                      type="password"
                      value={settings.appSecret}
                      onChange={(e) => setSettings({ ...settings, appSecret: e.target.value })}
                    />
                  </FormControl>
                </Grid>
                <Grid xs={12}>
                  <FormControl>
                    <FormLabel>Business Account ID (WABA ID)</FormLabel>
                    <Input
                      value={settings.businessAccountId}
                      onChange={(e) => setSettings({ ...settings, businessAccountId: e.target.value })}
                    />
                  </FormControl>
                </Grid>
                <Grid xs={12}>
                  <FormControl>
                    <FormLabel>Access Token (Permanente)</FormLabel>
                    <Textarea
                      minRows={2}
                      value={settings.accessToken}
                      onChange={(e) => setSettings({ ...settings, accessToken: e.target.value })}
                    />
                    <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                      Obtén tu access token desde Meta Business Suite {'>'} Configuración del Sistema
                    </Typography>
                  </FormControl>
                </Grid>
              </Grid>

              <Divider sx={{ my: 3 }} />

              <Typography level="title-md" sx={{ mb: 2 }}>Configuración de Webhook</Typography>
              <Grid container spacing={2}>
                <Grid xs={12}>
                  <FormControl>
                    <FormLabel>URL del Webhook</FormLabel>
                    <Input
                      value={settings.webhookUrl}
                      onChange={(e) => setSettings({ ...settings, webhookUrl: e.target.value })}
                    />
                  </FormControl>
                </Grid>
                <Grid xs={12}>
                  <FormControl>
                    <FormLabel>Verify Token</FormLabel>
                    <Input
                      value={settings.verifyToken}
                      onChange={(e) => setSettings({ ...settings, verifyToken: e.target.value })}
                    />
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value={1}>
          <Card>
            <CardContent>
              <Typography level="title-lg" startDecorator={<NotificationsIcon />} sx={{ mb: 3 }}>
                Respuestas Automáticas
              </Typography>

              <FormControl sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <FormLabel>Habilitar Respuesta Automática</FormLabel>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Envía un mensaje automático cuando un usuario escribe por primera vez
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.autoReplyEnabled}
                    onChange={(e) => setSettings({ ...settings, autoReplyEnabled: e.target.checked })}
                  />
                </Box>
              </FormControl>

              {settings.autoReplyEnabled && (
                <>
                  <FormControl sx={{ mb: 2 }}>
                    <FormLabel>Mensaje de Respuesta Automática</FormLabel>
                    <Textarea
                      minRows={3}
                      value={settings.autoReplyMessage}
                      onChange={(e) => setSettings({ ...settings, autoReplyMessage: e.target.value })}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Tiempo de Espera (segundos)</FormLabel>
                    <Input
                      type="number"
                      value={settings.autoReplyDelay}
                      onChange={(e) => setSettings({ ...settings, autoReplyDelay: parseInt(e.target.value) })}
                      slotProps={{
                        input: {
                          min: 0,
                          max: 300,
                        },
                      }}
                    />
                    <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                      Espera antes de enviar la respuesta automática (0-300 segundos)
                    </Typography>
                  </FormControl>
                </>
              )}
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value={2}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 3 }}>
                Horarios de Atención
              </Typography>

              <FormControl sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <FormLabel>Habilitar Mensaje Fuera de Horario</FormLabel>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Envía un mensaje automático fuera del horario de atención
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.businessHoursEnabled}
                    onChange={(e) => setSettings({ ...settings, businessHoursEnabled: e.target.checked })}
                  />
                </Box>
              </FormControl>

              {settings.businessHoursEnabled && (
                <>
                  <FormControl sx={{ mb: 3 }}>
                    <FormLabel>Mensaje Fuera de Horario</FormLabel>
                    <Textarea
                      minRows={2}
                      value={settings.businessHoursMessage}
                      onChange={(e) => setSettings({ ...settings, businessHoursMessage: e.target.value })}
                    />
                  </FormControl>

                  <Typography level="title-sm" sx={{ mb: 2 }}>Horario Lunes a Viernes</Typography>
                  <Grid container spacing={2}>
                    <Grid xs={6}>
                      <FormControl>
                        <FormLabel>Hora de Inicio</FormLabel>
                        <Input
                          type="time"
                          value={settings.mondayStart}
                          onChange={(e) => setSettings({ ...settings, mondayStart: e.target.value })}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={6}>
                      <FormControl>
                        <FormLabel>Hora de Fin</FormLabel>
                        <Input
                          type="time"
                          value={settings.mondayEnd}
                          onChange={(e) => setSettings({ ...settings, mondayEnd: e.target.value })}
                        />
                      </FormControl>
                    </Grid>
                  </Grid>
                </>
              )}
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value={3}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 3 }}>
                Límites y Configuración Avanzada
              </Typography>

              <FormControl sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <FormLabel>Habilitar Limitación de Tasa</FormLabel>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Limita el número de mensajes por minuto y hora
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.rateLimitEnabled}
                    onChange={(e) => setSettings({ ...settings, rateLimitEnabled: e.target.checked })}
                  />
                </Box>
              </FormControl>

              {settings.rateLimitEnabled && (
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid xs={6}>
                    <FormControl>
                      <FormLabel>Mensajes por Minuto</FormLabel>
                      <Input
                        type="number"
                        value={settings.maxMessagesPerMinute}
                        onChange={(e) => setSettings({ ...settings, maxMessagesPerMinute: parseInt(e.target.value) })}
                      />
                    </FormControl>
                  </Grid>
                  <Grid xs={6}>
                    <FormControl>
                      <FormLabel>Mensajes por Hora</FormLabel>
                      <Input
                        type="number"
                        value={settings.maxMessagesPerHour}
                        onChange={(e) => setSettings({ ...settings, maxMessagesPerHour: parseInt(e.target.value) })}
                      />
                    </FormControl>
                  </Grid>
                </Grid>
              )}

              <Divider sx={{ my: 3 }} />

              <Typography level="title-md" sx={{ mb: 2 }}>Opciones Avanzadas</Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FormLabel>Confirmaciones de Lectura</FormLabel>
                    <Switch
                      checked={settings.enableReadReceipts}
                      onChange={(e) => setSettings({ ...settings, enableReadReceipts: e.target.checked })}
                    />
                  </Box>
                </FormControl>

                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FormLabel>Indicador de Escritura</FormLabel>
                    <Switch
                      checked={settings.enableTypingIndicator}
                      onChange={(e) => setSettings({ ...settings, enableTypingIndicator: e.target.checked })}
                    />
                  </Box>
                </FormControl>

                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FormLabel>Registrar Payloads de Webhook</FormLabel>
                    <Switch
                      checked={settings.logWebhookPayloads}
                      onChange={(e) => setSettings({ ...settings, logWebhookPayloads: e.target.checked })}
                    />
                  </Box>
                </FormControl>

                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FormLabel>Reintentar Mensajes Fallidos</FormLabel>
                    <Switch
                      checked={settings.retryFailedMessages}
                      onChange={(e) => setSettings({ ...settings, retryFailedMessages: e.target.checked })}
                    />
                  </Box>
                </FormControl>
              </Box>
            </CardContent>
          </Card>
        </TabPanel>
      </Tabs>
    </Box>
  )
}
