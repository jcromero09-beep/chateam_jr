import { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Input,
  FormControl,
  FormLabel,
  Switch,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Select,
  Option,
  Textarea,
  Divider,
  Alert,
  Chip,
} from '@mui/joy'
import {
  Settings as SettingsIcon,
  Save as SaveIcon,
  Security as SecurityIcon,
  Notifications as NotificationsIcon,
  RestartAlt as ResetIcon,
  CheckCircle as CheckCircleIcon,
  Lock as LockIcon,
  VpnKey as KeyIcon,
} from '@mui/icons-material'

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
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <SettingsIcon sx={{ fontSize: 32 }} />
            Configuración Global de Integraciones
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Configuración centralizada para todas las integraciones empresariales
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startDecorator={<ResetIcon />} onClick={handleResetDefaults}>
            Restaurar Defaults
          </Button>
        </Box>
      </Box>

      {/* Estado General */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography level="title-lg" sx={{ mb: 0.5 }}>
                Estado del Sistema de Integraciones
              </Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Control maestro para habilitar o deshabilitar todas las integraciones
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Chip
                color={generalConfig.globalEnabled ? 'success' : 'danger'}
                size="lg"
                startDecorator={<CheckCircleIcon />}
              >
                {generalConfig.globalEnabled ? 'Sistema Activo' : 'Sistema Deshabilitado'}
              </Chip>
              <Switch
                checked={generalConfig.globalEnabled}
                onChange={(e) => setGeneralConfig({ ...generalConfig, globalEnabled: e.target.checked })}
                size="lg"
              />
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Tabs de Configuración */}
      <Tabs defaultValue={0}>
        <TabList>
          <Tab>General</Tab>
          <Tab>Seguridad</Tab>
          <Tab>Notificaciones</Tab>
        </TabList>

        {/* Tab General */}
        <TabPanel value={0}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 3 }}>
                Configuración General
              </Typography>

              <Grid container spacing={3}>
                {/* Retry Policy */}
                <Grid xs={12}>
                  <Typography level="title-md" sx={{ mb: 2 }}>
                    Política de Reintentos
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Estrategia de Reintentos</FormLabel>
                    <Select
                      value={generalConfig.retryPolicy}
                      onChange={(_, value) => setGeneralConfig({ ...generalConfig, retryPolicy: value as string })}
                    >
                      <Option value="none">Sin reintentos</Option>
                      <Option value="linear">Lineal (intervalo fijo)</Option>
                      <Option value="exponential">Exponencial (backoff)</Option>
                      <Option value="fibonacci">Fibonacci</Option>
                    </Select>
                    <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                      Estrategia de reintentos ante fallos
                    </Typography>
                  </FormControl>
                </Grid>

                <Grid xs={12} md={3}>
                  <FormControl>
                    <FormLabel>Máximo de Reintentos</FormLabel>
                    <Input
                      type="number"
                      value={generalConfig.maxRetries}
                      onChange={(e) => setGeneralConfig({ ...generalConfig, maxRetries: parseInt(e.target.value) })}
                      slotProps={{ input: { min: 0, max: 10 } }}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12} md={3}>
                  <FormControl>
                    <FormLabel>Retraso Inicial (segundos)</FormLabel>
                    <Input
                      type="number"
                      value={generalConfig.retryDelay}
                      onChange={(e) => setGeneralConfig({ ...generalConfig, retryDelay: parseInt(e.target.value) })}
                      slotProps={{ input: { min: 1, max: 60 } }}
                    />
                  </FormControl>
                </Grid>

                {/* Timeouts y Conexiones */}
                <Grid xs={12}>
                  <Typography level="title-md" sx={{ mb: 2, mt: 2 }}>
                    Timeouts y Conexiones
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Timeout Global (segundos)</FormLabel>
                    <Input
                      type="number"
                      value={generalConfig.timeout}
                      onChange={(e) => setGeneralConfig({ ...generalConfig, timeout: parseInt(e.target.value) })}
                      slotProps={{ input: { min: 5, max: 300 } }}
                    />
                    <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                      Tiempo máximo de espera para todas las peticiones
                    </Typography>
                  </FormControl>
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Máximo de Conexiones Simultáneas</FormLabel>
                    <Input
                      type="number"
                      value={generalConfig.maxConnections}
                      onChange={(e) => setGeneralConfig({ ...generalConfig, maxConnections: parseInt(e.target.value) })}
                      slotProps={{ input: { min: 1, max: 100 } }}
                    />
                    <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                      Número máximo de conexiones concurrentes por integración
                    </Typography>
                  </FormControl>
                </Grid>

                {/* Rate Limiting */}
                <Grid xs={12}>
                  <Typography level="title-md" sx={{ mb: 2, mt: 2 }}>
                    Rate Limiting
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <FormLabel>Habilitar Rate Limiting</FormLabel>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          Limita el número de peticiones por ventana de tiempo
                        </Typography>
                      </Box>
                      <Switch
                        checked={generalConfig.rateLimitEnabled}
                        onChange={(e) => setGeneralConfig({ ...generalConfig, rateLimitEnabled: e.target.checked })}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                {generalConfig.rateLimitEnabled && (
                  <>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Máximo de Peticiones</FormLabel>
                        <Input
                          type="number"
                          value={generalConfig.rateLimitRequests}
                          onChange={(e) => setGeneralConfig({ ...generalConfig, rateLimitRequests: parseInt(e.target.value) })}
                          slotProps={{ input: { min: 1, max: 10000 } }}
                        />
                      </FormControl>
                    </Grid>

                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Ventana de Tiempo (segundos)</FormLabel>
                        <Input
                          type="number"
                          value={generalConfig.rateLimitWindow}
                          onChange={(e) => setGeneralConfig({ ...generalConfig, rateLimitWindow: parseInt(e.target.value) })}
                          slotProps={{ input: { min: 1, max: 3600 } }}
                        />
                      </FormControl>
                    </Grid>
                  </>
                )}

                {/* Logging y Monitoring */}
                <Grid xs={12}>
                  <Typography level="title-md" sx={{ mb: 2, mt: 2 }}>
                    Logging y Monitoreo
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Nivel de Log</FormLabel>
                    <Select
                      value={generalConfig.logLevel}
                      onChange={(_, value) => setGeneralConfig({ ...generalConfig, logLevel: value as string })}
                    >
                      <Option value="error">Error</Option>
                      <Option value="warn">Warning</Option>
                      <Option value="info">Info</Option>
                      <Option value="debug">Debug</Option>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Intervalo Health Check (minutos)</FormLabel>
                    <Input
                      type="number"
                      value={generalConfig.healthCheckInterval}
                      onChange={(e) => setGeneralConfig({ ...generalConfig, healthCheckInterval: parseInt(e.target.value) })}
                      slotProps={{ input: { min: 1, max: 60 } }}
                      disabled={!generalConfig.enableHealthCheck}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <FormLabel>Habilitar Métricas de Performance</FormLabel>
                      <Switch
                        checked={generalConfig.enableMetrics}
                        onChange={(e) => setGeneralConfig({ ...generalConfig, enableMetrics: e.target.checked })}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <FormLabel>Habilitar Health Check Automático</FormLabel>
                      <Switch
                        checked={generalConfig.enableHealthCheck}
                        onChange={(e) => setGeneralConfig({ ...generalConfig, enableHealthCheck: e.target.checked })}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                <Grid xs={12}>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
                    <Button variant="outlined" onClick={handleResetDefaults}>
                      Restablecer
                    </Button>
                    <Button startDecorator={<SaveIcon />} onClick={handleSaveGeneral}>
                      Guardar Configuración
                    </Button>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </TabPanel>

        {/* Tab Seguridad */}
        <TabPanel value={1}>
          <Card>
            <CardContent>
              <Typography level="title-lg" startDecorator={<SecurityIcon />} sx={{ mb: 3 }}>
                Configuración de Seguridad
              </Typography>

              <Alert color="warning" sx={{ mb: 3 }}>
                <Typography level="body-sm" fontWeight="lg">
                  Advertencia de Seguridad
                </Typography>
                <Typography level="body-xs">
                  Los cambios en la configuración de seguridad pueden afectar todas las integraciones activas.
                  Asegúrese de probar en un ambiente de desarrollo antes de aplicar en producción.
                </Typography>
              </Alert>

              <Grid container spacing={3}>
                {/* Encriptación */}
                <Grid xs={12}>
                  <Typography level="title-md" sx={{ mb: 2 }}>
                    Encriptación
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <FormLabel>Habilitar Encriptación de Datos</FormLabel>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          Encripta datos sensibles en tránsito y almacenamiento
                        </Typography>
                      </Box>
                      <Switch
                        checked={securityConfig.encryptionEnabled}
                        onChange={(e) => setSecurityConfig({ ...securityConfig, encryptionEnabled: e.target.checked })}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Algoritmo de Encriptación</FormLabel>
                    <Select
                      value={securityConfig.encryptionAlgorithm}
                      onChange={(_, value) => setSecurityConfig({ ...securityConfig, encryptionAlgorithm: value as string })}
                      disabled={!securityConfig.encryptionEnabled}
                      startDecorator={<LockIcon />}
                    >
                      <Option value="AES-128">AES-128</Option>
                      <Option value="AES-256">AES-256 (Recomendado)</Option>
                      <Option value="RSA-2048">RSA-2048</Option>
                      <Option value="RSA-4096">RSA-4096</Option>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Versión TLS</FormLabel>
                    <Select
                      value={securityConfig.tlsVersion}
                      onChange={(_, value) => setSecurityConfig({ ...securityConfig, tlsVersion: value as string })}
                    >
                      <Option value="1.2">TLS 1.2</Option>
                      <Option value="1.3">TLS 1.3 (Recomendado)</Option>
                    </Select>
                  </FormControl>
                </Grid>

                {/* Autenticación */}
                <Grid xs={12}>
                  <Typography level="title-md" sx={{ mb: 2, mt: 2 }}>
                    Autenticación
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Método de Autenticación</FormLabel>
                    <Select
                      value={securityConfig.authMethod}
                      onChange={(_, value) => setSecurityConfig({ ...securityConfig, authMethod: value as string })}
                      startDecorator={<KeyIcon />}
                    >
                      <Option value="api-key">API Key</Option>
                      <Option value="oauth2">OAuth 2.0</Option>
                      <Option value="jwt">JWT Token</Option>
                      <Option value="basic">Basic Auth</Option>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Rotación de Tokens (días)</FormLabel>
                    <Input
                      type="number"
                      value={securityConfig.tokenRotationDays}
                      onChange={(e) => setSecurityConfig({ ...securityConfig, tokenRotationDays: parseInt(e.target.value) })}
                      slotProps={{ input: { min: 30, max: 365 } }}
                      disabled={!securityConfig.tokenRotationEnabled}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <FormLabel>Habilitar Rotación Automática de Tokens</FormLabel>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          Los tokens se renovarán automáticamente según el intervalo configurado
                        </Typography>
                      </Box>
                      <Switch
                        checked={securityConfig.tokenRotationEnabled}
                        onChange={(e) => setSecurityConfig({ ...securityConfig, tokenRotationEnabled: e.target.checked })}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                {/* IP Whitelist */}
                <Grid xs={12}>
                  <Typography level="title-md" sx={{ mb: 2, mt: 2 }}>
                    Control de Acceso
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <FormLabel>Habilitar IP Whitelist</FormLabel>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          Solo permite conexiones desde IPs autorizadas
                        </Typography>
                      </Box>
                      <Switch
                        checked={securityConfig.ipWhitelistEnabled}
                        onChange={(e) => setSecurityConfig({ ...securityConfig, ipWhitelistEnabled: e.target.checked })}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                {securityConfig.ipWhitelistEnabled && (
                  <Grid xs={12}>
                    <FormControl>
                      <FormLabel>IPs Permitidas (una por línea)</FormLabel>
                      <Textarea
                        value={securityConfig.allowedIPs}
                        onChange={(e) => setSecurityConfig({ ...securityConfig, allowedIPs: e.target.value })}
                        placeholder="192.168.1.1&#10;10.0.0.0/8&#10;172.16.0.0/12"
                        minRows={4}
                      />
                      <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                        Soporta IPs individuales y rangos CIDR
                      </Typography>
                    </FormControl>
                  </Grid>
                )}

                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <FormLabel>Validar Certificados SSL</FormLabel>
                      <Switch
                        checked={securityConfig.validateCertificates}
                        onChange={(e) => setSecurityConfig({ ...securityConfig, validateCertificates: e.target.checked })}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                {/* Audit Logs */}
                <Grid xs={12}>
                  <Typography level="title-md" sx={{ mb: 2, mt: 2 }}>
                    Auditoría
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <FormLabel>Habilitar Logs de Auditoría</FormLabel>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          Registra todas las operaciones sensibles para compliance
                        </Typography>
                      </Box>
                      <Switch
                        checked={securityConfig.auditLogsEnabled}
                        onChange={(e) => setSecurityConfig({ ...securityConfig, auditLogsEnabled: e.target.checked })}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Retención de Logs de Auditoría (días)</FormLabel>
                    <Input
                      type="number"
                      value={securityConfig.auditRetentionDays}
                      onChange={(e) => setSecurityConfig({ ...securityConfig, auditRetentionDays: parseInt(e.target.value) })}
                      slotProps={{ input: { min: 90, max: 3650 } }}
                      disabled={!securityConfig.auditLogsEnabled}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12}>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
                    <Button variant="outlined" onClick={handleResetDefaults}>
                      Restablecer
                    </Button>
                    <Button startDecorator={<SaveIcon />} onClick={handleSaveSecurity}>
                      Guardar Configuración
                    </Button>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </TabPanel>

        {/* Tab Notificaciones */}
        <TabPanel value={2}>
          <Card>
            <CardContent>
              <Typography level="title-lg" startDecorator={<NotificationsIcon />} sx={{ mb: 3 }}>
                Configuración de Notificaciones
              </Typography>

              <Grid container spacing={3}>
                {/* Email */}
                <Grid xs={12}>
                  <Typography level="title-md" sx={{ mb: 2 }}>
                    Notificaciones por Email
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <FormLabel>Habilitar Notificaciones por Email</FormLabel>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          Envía alertas por correo electrónico
                        </Typography>
                      </Box>
                      <Switch
                        checked={notificationConfig.emailEnabled}
                        onChange={(e) => setNotificationConfig({ ...notificationConfig, emailEnabled: e.target.checked })}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <FormLabel>Destinatarios (separados por coma)</FormLabel>
                    <Textarea
                      value={notificationConfig.emailRecipients}
                      onChange={(e) => setNotificationConfig({ ...notificationConfig, emailRecipients: e.target.value })}
                      disabled={!notificationConfig.emailEnabled}
                      minRows={2}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12} md={4}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <FormLabel>Notificar Errores</FormLabel>
                      <Switch
                        checked={notificationConfig.notifyOnError}
                        onChange={(e) => setNotificationConfig({ ...notificationConfig, notifyOnError: e.target.checked })}
                        disabled={!notificationConfig.emailEnabled}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                <Grid xs={12} md={4}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <FormLabel>Notificar Warnings</FormLabel>
                      <Switch
                        checked={notificationConfig.notifyOnWarning}
                        onChange={(e) => setNotificationConfig({ ...notificationConfig, notifyOnWarning: e.target.checked })}
                        disabled={!notificationConfig.emailEnabled}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                <Grid xs={12} md={4}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <FormLabel>Notificar Sync</FormLabel>
                      <Switch
                        checked={notificationConfig.emailOnSync}
                        onChange={(e) => setNotificationConfig({ ...notificationConfig, emailOnSync: e.target.checked })}
                        disabled={!notificationConfig.emailEnabled}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                {/* Slack */}
                <Grid xs={12}>
                  <Typography level="title-md" sx={{ mb: 2, mt: 2 }}>
                    Notificaciones por Slack
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <FormLabel>Habilitar Notificaciones por Slack</FormLabel>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          Envía alertas a un canal de Slack
                        </Typography>
                      </Box>
                      <Switch
                        checked={notificationConfig.slackEnabled}
                        onChange={(e) => setNotificationConfig({ ...notificationConfig, slackEnabled: e.target.checked })}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <FormLabel>Slack Webhook URL</FormLabel>
                    <Input
                      value={notificationConfig.slackWebhook}
                      onChange={(e) => setNotificationConfig({ ...notificationConfig, slackWebhook: e.target.value })}
                      placeholder="https://hooks.slack.com/services/..."
                      disabled={!notificationConfig.slackEnabled}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <FormLabel>Canal de Slack</FormLabel>
                    <Input
                      value={notificationConfig.slackChannel}
                      onChange={(e) => setNotificationConfig({ ...notificationConfig, slackChannel: e.target.value })}
                      placeholder="#integrations"
                      disabled={!notificationConfig.slackEnabled}
                    />
                  </FormControl>
                </Grid>

                {/* Webhook */}
                <Grid xs={12}>
                  <Typography level="title-md" sx={{ mb: 2, mt: 2 }}>
                    Notificaciones por Webhook
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <FormLabel>Habilitar Webhook de Alertas</FormLabel>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          Envía alertas a un endpoint HTTP personalizado
                        </Typography>
                      </Box>
                      <Switch
                        checked={notificationConfig.webhookEnabled}
                        onChange={(e) => setNotificationConfig({ ...notificationConfig, webhookEnabled: e.target.checked })}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <FormLabel>Webhook URL</FormLabel>
                    <Input
                      value={notificationConfig.webhookUrl}
                      onChange={(e) => setNotificationConfig({ ...notificationConfig, webhookUrl: e.target.value })}
                      placeholder="https://api.example.com/alerts"
                      disabled={!notificationConfig.webhookEnabled}
                    />
                  </FormControl>
                </Grid>

                {/* Configuración Avanzada */}
                <Grid xs={12}>
                  <Typography level="title-md" sx={{ mb: 2, mt: 2 }}>
                    Configuración Avanzada
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Umbral de Notificación (errores consecutivos)</FormLabel>
                    <Input
                      type="number"
                      value={notificationConfig.notifyThreshold}
                      onChange={(e) => setNotificationConfig({ ...notificationConfig, notifyThreshold: parseInt(e.target.value) })}
                      slotProps={{ input: { min: 1, max: 100 } }}
                    />
                    <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                      Número de errores antes de enviar notificación
                    </Typography>
                  </FormControl>
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <FormLabel>Habilitar Resumen Diario</FormLabel>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          Envía un resumen consolidado de todas las integraciones
                        </Typography>
                      </Box>
                      <Switch
                        checked={notificationConfig.digestEnabled}
                        onChange={(e) => setNotificationConfig({ ...notificationConfig, digestEnabled: e.target.checked })}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                {notificationConfig.digestEnabled && (
                  <>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Frecuencia del Resumen</FormLabel>
                        <Select
                          value={notificationConfig.digestFrequency}
                          onChange={(_, value) => setNotificationConfig({ ...notificationConfig, digestFrequency: value as string })}
                        >
                          <Option value="daily">Diario</Option>
                          <Option value="weekly">Semanal</Option>
                          <Option value="monthly">Mensual</Option>
                        </Select>
                      </FormControl>
                    </Grid>

                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Hora de Envío</FormLabel>
                        <Input
                          type="time"
                          value={notificationConfig.digestTime}
                          onChange={(e) => setNotificationConfig({ ...notificationConfig, digestTime: e.target.value })}
                        />
                      </FormControl>
                    </Grid>
                  </>
                )}

                <Grid xs={12}>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
                    <Button variant="outlined" onClick={handleResetDefaults}>
                      Restablecer
                    </Button>
                    <Button startDecorator={<SaveIcon />} onClick={handleSaveNotifications}>
                      Guardar Configuración
                    </Button>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </TabPanel>
      </Tabs>
    </Box>
  )
}
