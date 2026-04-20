/**
 * CoexistenceDashboard — Panel de Monitoreo de Coexistencia WhatsApp
 *
 * Fase 4.3 + 4.5 del Plan de Coexistencia:
 * - Estado de conexiones Meta con coexistencia
 * - Alertas de liveness (13 días Business App)
 * - Estado de suscripción de webhooks
 * - Setup automático de la App
 * - Métricas de tokens y expiración
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Stack,
  Card,
  CardContent,
  Button,
  Chip,
  Alert,
  CircularProgress,
  Divider,
  Sheet,
  Table,
  LinearProgress,
  IconButton,
  Tooltip,
  AspectRatio,
} from '@mui/joy'
import {
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  CloudDone as CloudDoneIcon,
  Sync as SyncIcon,
  PhoneAndroid as PhoneIcon,
  Timer as TimerIcon,
  Shield as ShieldIcon,
  TrendingUp as TrendingUpIcon,
  Link as LinkIcon,
  LinkOff as LinkOffIcon,
  Webhook as WebhookIcon,
  PlayArrow as PlayIcon,
  Info as InfoIcon,
} from '@mui/icons-material'
import { toast } from 'sonner'
import api from '../services/api'
import EmbeddedSignupModal from '../components/EmbeddedSignupModal'
import CoexistenceConfigModal from '../components/CoexistenceConfigModal'

// Tipos
interface CoexistenceConnection {
  id: number
  name: string
  status: string
  number: string | null
  displayPhoneNumber: string | null
  phoneNumberId: string | null
  wabaId: string | null
  coexistence: {
    enabled: boolean
    status: string | null
    onboardedAt: string | null
    lastAppOpenedAt: string | null
    receiveChannel: string | null
    sendChannel: string | null
    linkedWhatsappId: number | null
    linkedWhatsappName: string | null
  }
}

interface LivenessAlert {
  whatsappId: number
  name: string
  level: 'warning' | 'critical' | 'disabled'
  daysSinceOpen: number
  message: string
}

interface CoexistenceStatusData {
  connections: CoexistenceConnection[]
  envCheck: {
    FACEBOOK_APP_ID: boolean
    FACEBOOK_APP_SECRET: boolean
    FB_GRAPH_VERSION: string
  }
  alerts: LivenessAlert[]
  summary: {
    totalMetaConnections: number
    coexistenceActive: number
    coexistencePending: number
    alertsCount: number
  }
}

interface SetupResult {
  success: boolean
  webhookSubscription: {
    configured: boolean
    callbackUrl: string
    fields: string[]
    error?: string
  }
  existingWabas: Array<{
    whatsappId: number
    name: string
    wabaId: string | null
    phoneNumberId: string | null
    subscribed: boolean
    subscriptionError?: string
  }>
  configId: {
    detected: boolean
    value: string | null
    instructions: string
  }
  envStatus: {
    FACEBOOK_APP_ID: boolean
    FACEBOOK_APP_SECRET: boolean
    FB_GRAPH_VERSION: string
    VERIFY_TOKEN: boolean
    META_WEBHOOK_URL: string
  }
}

interface AppStatusData {
  appConfigured: boolean
  subscriptions: Array<{
    object: string
    active: boolean
    callback_url?: string
    fields?: string[]
  }>
  webhookUrl: string
}

export default function CoexistenceDashboard() {
  const [loading, setLoading] = useState(true)
  const [statusData, setStatusData] = useState<CoexistenceStatusData | null>(null)
  const [appStatus, setAppStatus] = useState<AppStatusData | null>(null)
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null)
  const [setupLoading, setSetupLoading] = useState(false)
  const [embeddedSignupOpen, setEmbeddedSignupOpen] = useState(false)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [selectedConnection, setSelectedConnection] = useState<CoexistenceConnection | null>(null)

  const openConfigModal = (conn: CoexistenceConnection) => {
    setSelectedConnection(conn)
    setConfigModalOpen(true)
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statusRes, appRes] = await Promise.all([
        api.get('/whatsapp/coexistence/status'),
        api.get('/whatsapp/coexistence/app-status'),
      ])
      setStatusData(statusRes.data.data)
      setAppStatus(appRes.data.data)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      toast.error(error.response?.data?.error || 'Error cargando datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSetup = async () => {
    setSetupLoading(true)
    try {
      const { data } = await api.post('/whatsapp/coexistence/setup')
      setSetupResult(data.data)
      if (data.success) {
        toast.success('Setup de Meta completado exitosamente')
        fetchData()
      } else {
        toast.error('Setup parcial — revisa los detalles')
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      toast.error(error.response?.data?.error || 'Error en setup')
    } finally {
      setSetupLoading(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Stack spacing={2} alignItems="center">
          <CircularProgress size="lg" />
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Cargando panel de coexistencia...
          </Typography>
        </Stack>
      </Box>
    )
  }

  const summary = statusData?.summary
  const alerts = statusData?.alerts || []
  const connections = statusData?.connections || []

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #1877f2, #42b72a)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SyncIcon sx={{ color: 'white', fontSize: 28 }} />
          </Box>
          <Box>
            <Typography level="h3">Coexistencia WhatsApp</Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              Business App + Cloud API — Monitoreo y Configuracion
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={1}>
          <Tooltip title="Actualizar datos">
            <IconButton variant="outlined" color="neutral" onClick={fetchData}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="solid"
            color="primary"
            startDecorator={<PlayIcon />}
            onClick={() => setEmbeddedSignupOpen(true)}
          >
            Nueva Conexion
          </Button>
        </Stack>
      </Stack>

      {/* Alertas de Liveness */}
      {alerts.length > 0 && (
        <Stack spacing={1} sx={{ mb: 3 }}>
          {alerts.map((alert) => (
            <Alert
              key={alert.whatsappId}
              variant="soft"
              color={alert.level === 'disabled' ? 'danger' : alert.level === 'critical' ? 'warning' : 'neutral'}
              startDecorator={
                alert.level === 'disabled' ? <ErrorIcon /> : <WarningIcon />
              }
            >
              <Box>
                <Typography level="body-sm" fontWeight={600}>
                  {alert.name} — {alert.level === 'disabled' ? 'DESACTIVADA' : alert.level === 'critical' ? 'CRITICO' : 'ADVERTENCIA'}
                </Typography>
                <Typography level="body-xs">
                  {alert.message} ({alert.daysSinceOpen} dias sin abrir la Business App)
                </Typography>
              </Box>
            </Alert>
          ))}
        </Stack>
      )}

      {/* KPI Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <Card variant="soft" color="primary">
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', textTransform: 'uppercase', fontWeight: 700 }}>
                  Conexiones Meta
                </Typography>
                <Typography level="h2" sx={{ mt: 0.5 }}>
                  {summary?.totalMetaConnections || 0}
                </Typography>
              </Box>
              <AspectRatio ratio="1" sx={{ width: 44, borderRadius: '50%', bgcolor: 'primary.softBg' }}>
                <Box><LinkIcon sx={{ color: 'primary.500' }} /></Box>
              </AspectRatio>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="soft" color="success">
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', textTransform: 'uppercase', fontWeight: 700 }}>
                  Coex Activas
                </Typography>
                <Typography level="h2" sx={{ mt: 0.5 }}>
                  {summary?.coexistenceActive || 0}
                </Typography>
              </Box>
              <AspectRatio ratio="1" sx={{ width: 44, borderRadius: '50%', bgcolor: 'success.softBg' }}>
                <Box><CheckIcon sx={{ color: 'success.500' }} /></Box>
              </AspectRatio>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="soft" color="warning">
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', textTransform: 'uppercase', fontWeight: 700 }}>
                  Pendientes
                </Typography>
                <Typography level="h2" sx={{ mt: 0.5 }}>
                  {summary?.coexistencePending || 0}
                </Typography>
              </Box>
              <AspectRatio ratio="1" sx={{ width: 44, borderRadius: '50%', bgcolor: 'warning.softBg' }}>
                <Box><TimerIcon sx={{ color: 'warning.500' }} /></Box>
              </AspectRatio>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="soft" color={alerts.length > 0 ? 'danger' : 'neutral'}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', textTransform: 'uppercase', fontWeight: 700 }}>
                  Alertas
                </Typography>
                <Typography level="h2" sx={{ mt: 0.5 }}>
                  {summary?.alertsCount || 0}
                </Typography>
              </Box>
              <AspectRatio ratio="1" sx={{ width: 44, borderRadius: '50%', bgcolor: alerts.length > 0 ? 'danger.softBg' : 'neutral.softBg' }}>
                <Box>{alerts.length > 0 ? <WarningIcon sx={{ color: 'danger.500' }} /> : <ShieldIcon sx={{ color: 'neutral.500' }} />}</Box>
              </AspectRatio>
            </Stack>
          </CardContent>
        </Card>
      </Box>

      {/* Main Content Grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>
        {/* Left: Tabla de Conexiones */}
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography level="title-md" startDecorator={<PhoneIcon />}>
                Conexiones con Coexistencia
              </Typography>
              <Chip size="sm" variant="outlined" color="neutral">
                {connections.length} registros
              </Chip>
            </Stack>

            {connections.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <LinkOffIcon sx={{ fontSize: 48, color: 'text.tertiary', mb: 1 }} />
                <Typography level="body-md" sx={{ color: 'text.tertiary' }}>
                  No hay conexiones Meta configuradas
                </Typography>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 2 }}>
                  Usa "Nueva Conexion" para configurar Embedded Signup
                </Typography>
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={() => setEmbeddedSignupOpen(true)}
                  startDecorator={<CloudDoneIcon />}
                >
                  Conectar WhatsApp Business
                </Button>
              </Box>
            ) : (
              <Sheet variant="outlined" sx={{ borderRadius: 'sm', overflow: 'auto' }}>
                <Table size="sm" stickyHeader stripe="even">
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>ID</th>
                      <th>Nombre</th>
                      <th>Numero</th>
                      <th style={{ width: 100 }}>Estado</th>
                      <th style={{ width: 110 }}>Coexistencia</th>
                      <th style={{ width: 100 }}>Recibir</th>
                      <th style={{ width: 100 }}>Enviar</th>
                      <th style={{ width: 120 }}>Business App</th>
                      <th style={{ width: 60 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {connections.map((conn) => {
                      const daysSinceOpen = conn.coexistence.lastAppOpenedAt
                        ? Math.floor(
                            (Date.now() - new Date(conn.coexistence.lastAppOpenedAt).getTime()) /
                              (1000 * 60 * 60 * 24)
                          )
                        : null

                      return (
                        <tr key={conn.id}>
                          <td>
                            <Typography level="body-xs" fontWeight={600}>
                              #{conn.id}
                            </Typography>
                          </td>
                          <td>
                            <Stack>
                              <Typography level="body-sm" fontWeight={500}>
                                {conn.name}
                              </Typography>
                              {conn.wabaId && (
                                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                  WABA: {conn.wabaId}
                                </Typography>
                              )}
                            </Stack>
                          </td>
                          <td>
                            <Typography level="body-sm">
                              {conn.displayPhoneNumber || conn.number || '—'}
                            </Typography>
                          </td>
                          <td>
                            <Chip
                              size="sm"
                              variant="soft"
                              color={conn.status === 'CONNECTED' ? 'success' : conn.status === 'DISCONNECTED' ? 'danger' : 'warning'}
                            >
                              {conn.status === 'CONNECTED' ? 'Conectado' : conn.status === 'DISCONNECTED' ? 'Desconectado' : conn.status}
                            </Chip>
                          </td>
                          <td>
                            {conn.coexistence.enabled ? (
                              <Chip
                                size="sm"
                                variant="soft"
                                color={
                                  conn.coexistence.status === 'active'
                                    ? 'success'
                                    : conn.coexistence.status === 'disabled'
                                    ? 'danger'
                                    : conn.coexistence.status === 'syncing'
                                    ? 'primary'
                                    : 'warning'
                                }
                              >
                                {conn.coexistence.status === 'active'
                                  ? 'Activa'
                                  : conn.coexistence.status === 'disabled'
                                  ? 'Desactivada'
                                  : conn.coexistence.status === 'syncing'
                                  ? 'Sincronizando'
                                  : 'Pendiente'}
                              </Chip>
                            ) : (
                              <Chip size="sm" variant="plain" color="neutral">
                                No
                              </Chip>
                            )}
                          </td>
                          <td>
                            <Chip
                              size="sm"
                              variant="soft"
                              color={
                                conn.coexistence.receiveChannel === 'both' ? 'primary' :
                                conn.coexistence.receiveChannel === 'meta' ? 'success' : 'warning'
                              }
                            >
                              {conn.coexistence.receiveChannel === 'both' ? 'Ambos' :
                               conn.coexistence.receiveChannel === 'meta' ? 'Meta' : 'Baileys'}
                            </Chip>
                          </td>
                          <td>
                            <Chip
                              size="sm"
                              variant="soft"
                              color={conn.coexistence.sendChannel === 'meta' ? 'success' : 'warning'}
                            >
                              {conn.coexistence.sendChannel === 'meta' ? 'Meta API' : 'Baileys'}
                            </Chip>
                          </td>
                          <td>
                            {daysSinceOpen !== null ? (
                              <Stack>
                                <Typography
                                  level="body-xs"
                                  fontWeight={600}
                                  sx={{
                                    color:
                                      daysSinceOpen >= 13
                                        ? 'danger.600'
                                        : daysSinceOpen >= 11
                                        ? 'warning.600'
                                        : 'success.600',
                                  }}
                                >
                                  {daysSinceOpen === 0 ? 'Hoy' : `Hace ${daysSinceOpen}d`}
                                </Typography>
                                {daysSinceOpen >= 11 && (
                                  <LinearProgress
                                    determinate
                                    value={Math.min((daysSinceOpen / 14) * 100, 100)}
                                    color={daysSinceOpen >= 13 ? 'danger' : 'warning'}
                                    sx={{ height: 4, borderRadius: 2 }}
                                  />
                                )}
                              </Stack>
                            ) : (
                              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                Sin datos
                              </Typography>
                            )}
                          </td>
                          <td>
                            <Tooltip title="Configurar coexistencia">
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="neutral"
                                onClick={() => openConfigModal(conn)}
                              >
                                <SettingsIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            </Tooltip>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </Table>
              </Sheet>
            )}
          </CardContent>
        </Card>

        {/* Right: Panel de Configuración */}
        <Stack spacing={2}>
          {/* Estado de la App */}
          <Card>
            <CardContent>
              <Typography level="title-md" startDecorator={<SettingsIcon />} sx={{ mb: 2 }}>
                Configuracion de la App
              </Typography>

              <Stack spacing={1.5}>
                {/* Webhook Status */}
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <WebhookIcon sx={{ fontSize: 18, color: 'text.tertiary' }} />
                    <Typography level="body-sm">Webhooks WBA</Typography>
                  </Stack>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={appStatus?.appConfigured ? 'success' : 'danger'}
                  >
                    {appStatus?.appConfigured ? 'Activo' : 'Inactivo'}
                  </Chip>
                </Stack>

                {/* Env Variables */}
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <ShieldIcon sx={{ fontSize: 18, color: 'text.tertiary' }} />
                    <Typography level="body-sm">App ID</Typography>
                  </Stack>
                  <Chip size="sm" variant="soft" color={statusData?.envCheck.FACEBOOK_APP_ID ? 'success' : 'danger'}>
                    {statusData?.envCheck.FACEBOOK_APP_ID ? 'OK' : 'Falta'}
                  </Chip>
                </Stack>

                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <ShieldIcon sx={{ fontSize: 18, color: 'text.tertiary' }} />
                    <Typography level="body-sm">App Secret</Typography>
                  </Stack>
                  <Chip size="sm" variant="soft" color={statusData?.envCheck.FACEBOOK_APP_SECRET ? 'success' : 'danger'}>
                    {statusData?.envCheck.FACEBOOK_APP_SECRET ? 'OK' : 'Falta'}
                  </Chip>
                </Stack>

                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TrendingUpIcon sx={{ fontSize: 18, color: 'text.tertiary' }} />
                    <Typography level="body-sm">Graph API</Typography>
                  </Stack>
                  <Chip size="sm" variant="outlined" color="neutral">
                    {statusData?.envCheck.FB_GRAPH_VERSION || 'N/A'}
                  </Chip>
                </Stack>

                {/* Webhook URL */}
                {appStatus?.webhookUrl && (
                  <Box sx={{ mt: 1 }}>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                      Webhook URL:
                    </Typography>
                    <Typography
                      level="body-xs"
                      sx={{
                        fontFamily: 'monospace',
                        bgcolor: 'background.level1',
                        p: 0.5,
                        borderRadius: 'xs',
                        wordBreak: 'break-all',
                      }}
                    >
                      {appStatus.webhookUrl}
                    </Typography>
                  </Box>
                )}

                <Divider />

                {/* Setup Button */}
                <Button
                  variant="solid"
                  color="primary"
                  fullWidth
                  onClick={handleSetup}
                  loading={setupLoading}
                  startDecorator={<SettingsIcon />}
                  sx={{ mt: 1 }}
                >
                  {appStatus?.appConfigured ? 'Re-configurar App' : 'Configurar App Automaticamente'}
                </Button>
              </Stack>
            </CardContent>
          </Card>

          {/* Setup Result */}
          {setupResult && (
            <Card variant="outlined" color={setupResult.success ? 'success' : 'warning'}>
              <CardContent>
                <Typography
                  level="title-sm"
                  startDecorator={setupResult.success ? <CheckIcon /> : <WarningIcon />}
                  sx={{ mb: 1 }}
                >
                  Resultado del Setup
                </Typography>

                <Stack spacing={1}>
                  {/* Webhook */}
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography level="body-xs">Webhook suscripcion</Typography>
                    <Chip size="sm" variant="soft" color={setupResult.webhookSubscription.configured ? 'success' : 'danger'}>
                      {setupResult.webhookSubscription.configured ? 'OK' : 'Error'}
                    </Chip>
                  </Stack>

                  {setupResult.webhookSubscription.error && (
                    <Alert variant="soft" color="danger" size="sm">
                      <Typography level="body-xs">{setupResult.webhookSubscription.error}</Typography>
                    </Alert>
                  )}

                  {/* Campos suscritos */}
                  <Box>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                      Campos webhook:
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {setupResult.webhookSubscription.fields.map((field) => (
                        <Chip key={field} size="sm" variant="outlined" color="neutral">
                          {field}
                        </Chip>
                      ))}
                    </Box>
                  </Box>

                  {/* WABAs */}
                  {setupResult.existingWabas.length > 0 && (
                    <Box>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                        WABAs verificados:
                      </Typography>
                      {setupResult.existingWabas.map((waba) => (
                        <Stack
                          key={waba.whatsappId}
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                          sx={{ py: 0.5 }}
                        >
                          <Typography level="body-xs">{waba.name}</Typography>
                          <Chip size="sm" variant="soft" color={waba.subscribed ? 'success' : 'danger'}>
                            {waba.subscribed ? 'Suscrito' : 'No suscrito'}
                          </Chip>
                        </Stack>
                      ))}
                    </Box>
                  )}

                  <Divider />

                  {/* Config ID */}
                  <Box>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                      <Typography level="body-xs" fontWeight={600}>Config ID (Embedded Signup)</Typography>
                      <Chip size="sm" variant="soft" color={setupResult.configId.detected ? 'success' : 'neutral'}>
                        {setupResult.configId.detected ? 'Detectado' : 'No configurado'}
                      </Chip>
                    </Stack>
                    {setupResult.configId.value && (
                      <Typography
                        level="body-xs"
                        sx={{ fontFamily: 'monospace', bgcolor: 'background.level1', p: 0.5, borderRadius: 'xs' }}
                      >
                        {setupResult.configId.value}
                      </Typography>
                    )}
                    <Typography
                      level="body-xs"
                      sx={{ color: 'text.tertiary', mt: 0.5, whiteSpace: 'pre-line' }}
                    >
                      {setupResult.configId.instructions}
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* Info Card */}
          <Card variant="soft" color="primary">
            <CardContent>
              <Typography level="title-sm" startDecorator={<InfoIcon />} sx={{ mb: 1 }}>
                Sobre la Coexistencia
              </Typography>
              <Stack spacing={1}>
                <Typography level="body-xs">
                  La coexistencia permite usar la WhatsApp Business App y la Cloud API
                  simultaneamente en el mismo numero de telefono.
                </Typography>
                <Typography level="body-xs">
                  <strong>Requisito:</strong> Abrir la Business App al menos cada 14 dias
                  para mantener la coexistencia activa.
                </Typography>
                <Typography level="body-xs">
                  <strong>Tokens:</strong> Se renuevan automaticamente cada 50 dias
                  (antes de la expiracion de 60 dias).
                </Typography>
                <Typography level="body-xs">
                  <strong>Historial:</strong> Se sincroniza automaticamente via webhooks
                  cuando se activa la coexistencia.
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Box>

      {/* Embedded Signup Modal */}
      <EmbeddedSignupModal
        open={embeddedSignupOpen}
        onClose={() => setEmbeddedSignupOpen(false)}
        onSuccess={fetchData}
      />

      {/* Coexistence Config Modal */}
      <CoexistenceConfigModal
        open={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        connection={selectedConnection}
        onSaved={fetchData}
      />
    </Box>
  )
}
