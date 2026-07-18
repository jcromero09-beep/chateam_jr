/**
 * MetaOfficialMcpCard — Card de conexión al MCP oficial de Meta Ads.
 *
 * Estados:
 *  A) Cargando — verifica el estado contra el backend.
 *  B) No conectado — botón "Conectar MCP oficial de Meta".
 *  C) Conectado — muestra última validación, scopes, tools detectadas, botón "Desconectar".
 *  D) Error — muestra reason, botón "Reintentar conexión".
 *
 * Comportamiento del botón "Conectar":
 *  1. POST /meta-marketing/agent/mcp/connect → recibe authorizationUrl
 *  2. window.location.href = authorizationUrl  (redirect en la misma pestaña)
 *  3. Meta autoriza → redirige al backend → backend hace token exchange + tools/list
 *  4. Backend redirige a /campaigns/audit?mcp_oauth=success|error&reason=...
 *
 * NO copia URLs manualmente, NO usa popup (más simple para V1, sin riesgo de bloqueador de popups).
 */
import { useEffect, useState } from 'react'
import {
  Card,
  CardContent,
  Stack,
  Typography,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Box,
  Tooltip,
} from '@mui/joy'
import {
  Link as LinkIcon,
  LinkOff as LinkOffIcon,
  CheckCircle as CheckCircleIcon,
  WarningAmber as WarningIcon,
  Refresh as RefreshIcon,
  CloudOff as CloudOffIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import {
  getMetaMcpStatus,
  startMetaMcpConnection,
  disconnectMetaMcp,
  listMetaMcpTools,
  MetaMcpConnectionStatus,
  MetaMcpToolDescriptor,
} from '../services/metaAdsAgentService'

interface Props {
  /**
   * Si está presente y es 'success' o 'error', dispara una alerta inicial
   * y refresca el estado. Pasarlo desde CampaignsAudit al leer querystring.
   */
  oauthCallbackResult?: 'success' | 'error' | null
  oauthCallbackReason?: string | null
  /** Callback opcional para que el parent borre los query params después de mostrarlos. */
  onCallbackHandled?: () => void
}

export default function MetaOfficialMcpCard({
  oauthCallbackResult,
  oauthCallbackReason,
  onCallbackHandled,
}: Props) {
  const [status, setStatus] = useState<MetaMcpConnectionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [tools, setTools] = useState<MetaMcpToolDescriptor[] | null>(null)
  const [toolsLoading, setToolsLoading] = useState(false)

  // Refresca el status; ejecuta al montar y al cambiar el callback result
  const refresh = async () => {
    setLoading(true)
    try {
      const s = await getMetaMcpStatus()
      setStatus(s)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Error consultando estado MCP'
      toast.error(msg)
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  // Mostrar alertas del callback (una sola vez) y refrescar
  useEffect(() => {
    if (!oauthCallbackResult) return
    if (oauthCallbackResult === 'success') {
      toast.success('MCP oficial de Meta conectado')
    } else if (oauthCallbackResult === 'error') {
      toast.error(`No se pudo conectar el MCP oficial: ${oauthCallbackReason || 'error desconocido'}`)
    }
    refresh()
    if (onCallbackHandled) onCallbackHandled()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthCallbackResult, oauthCallbackReason])

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const resp = await startMetaMcpConnection()
      if (!resp?.authorizationUrl) {
        toast.error('No se recibió authorizationUrl del backend')
        setConnecting(false)
        return
      }
      // Redirect en la misma pestaña — al volver del callback, /campaigns/audit
      // recibirá ?mcp_oauth=success|error y la card se refresca sola.
      window.location.href = resp.authorizationUrl
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Error iniciando OAuth'
      toast.error(msg)
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!window.confirm('¿Desconectar el MCP oficial de Meta? Se borrarán los tokens MCP de tu empresa (no afecta Graph API ni WhatsApp).')) {
      return
    }
    setDisconnecting(true)
    try {
      const s = await disconnectMetaMcp()
      setStatus(s)
      setTools(null)
      toast.info('MCP oficial desconectado')
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Error desconectando'
      toast.error(msg)
    } finally {
      setDisconnecting(false)
    }
  }

  const handleListTools = async () => {
    setToolsLoading(true)
    try {
      const t = await listMetaMcpTools()
      setTools(t)
      toast.success(`${t.length} tools detectadas en mcp.facebook.com/ads`)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'tools/list falló'
      toast.error(msg)
    } finally {
      setToolsLoading(false)
    }
  }

  const renderHeader = () => (
    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
      <CloudOffIcon sx={{ color: 'primary.500' }} />
      <Typography level="title-md">MCP oficial de Meta Ads</Typography>
      <Chip size="sm" variant="soft" color="neutral">
        provider: meta_official_mcp
      </Chip>
    </Stack>
  )

  // ── Estados ────────────────────────────────────────────────────────────

  if (loading && !status) {
    return (
      <Card variant="outlined" sx={{ borderColor: 'primary.300' }}>
        <CardContent>
          <Stack spacing={1.5}>
            {renderHeader()}
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size="sm" />
              <Typography level="body-sm">Verificando conexión MCP oficial…</Typography>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    )
  }

  const connected = !!status?.connected
  const isError = status?.status === 'error' || (!!status?.lastError && !connected)

  // C) Conectado
  if (connected) {
    return (
      <Card variant="outlined" sx={{ borderColor: 'success.400', bgcolor: 'success.50' }}>
        <CardContent>
          <Stack spacing={1.5}>
            {renderHeader()}
            <Alert color="success" startDecorator={<CheckCircleIcon />}>
              MCP oficial de Meta conectado
            </Alert>
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <Box>
                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                  Última validación tools/list
                </Typography>
                <Typography level="body-sm" fontWeight="lg">
                  {status?.lastToolsListAt ? new Date(status.lastToolsListAt).toLocaleString() : '—'}
                </Typography>
              </Box>
              <Box>
                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                  Conectado desde
                </Typography>
                <Typography level="body-sm" fontWeight="lg">
                  {status?.lastConnectedAt ? new Date(status.lastConnectedAt).toLocaleString() : '—'}
                </Typography>
              </Box>
              <Box>
                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                  Token expira
                </Typography>
                <Typography level="body-sm" fontWeight="lg">
                  {status?.expiresAt ? new Date(status.expiresAt).toLocaleString() : 'sin expiración'}
                </Typography>
              </Box>
              <Box>
                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                  Tools detectadas
                </Typography>
                <Typography level="body-sm" fontWeight="lg">
                  {tools !== null ? tools.length : '—'}
                </Typography>
              </Box>
            </Stack>

            {status?.scopes && status.scopes.length > 0 && (
              <Stack direction="row" spacing={0.5} flexWrap="wrap">
                {status.scopes.map((s) => (
                  <Chip key={s} size="sm" variant="soft" color="success">
                    {s}
                  </Chip>
                ))}
              </Stack>
            )}

            {tools && tools.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography level="body-xs" sx={{ color: 'text.secondary', mb: 0.5 }}>
                  Tools del MCP oficial:
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                  {tools.map((t) => (
                    <Tooltip key={t.name} title={t.description || ''}>
                      <Chip size="sm" variant="outlined">
                        {t.name}
                      </Chip>
                    </Tooltip>
                  ))}
                </Stack>
              </Box>
            )}

            <Stack direction="row" spacing={1}>
              <Button
                size="sm"
                variant="outlined"
                color="neutral"
                startDecorator={<RefreshIcon />}
                loading={toolsLoading}
                onClick={handleListTools}
              >
                {tools ? 'Recargar tools' : 'Listar tools'}
              </Button>
              <Button
                size="sm"
                variant="outlined"
                color="danger"
                startDecorator={<LinkOffIcon />}
                loading={disconnecting}
                onClick={handleDisconnect}
              >
                Desconectar
              </Button>
              <Button
                size="sm"
                variant="plain"
                color="neutral"
                onClick={refresh}
                loading={loading}
              >
                Refrescar estado
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    )
  }

  // D) Error o B) No conectado
  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: isError ? 'danger.400' : 'primary.300',
        bgcolor: isError ? 'danger.50' : 'primary.50',
      }}
    >
      <CardContent>
        <Stack spacing={1.5}>
          {renderHeader()}

          {isError ? (
            <Alert color="danger" startDecorator={<WarningIcon />}>
              <Stack>
                <Typography level="body-sm" fontWeight="lg">
                  No se pudo conectar el MCP oficial de Meta
                </Typography>
                {(oauthCallbackReason || status?.lastError || status?.reason) && (
                  <Typography level="body-xs">
                    {oauthCallbackReason || status?.lastError || status?.reason}
                  </Typography>
                )}
              </Stack>
            </Alert>
          ) : (
            <Alert color="primary">
              MCP oficial de Meta no conectado
              {status?.reason ? ` · ${status.reason}` : ''}
            </Alert>
          )}

          <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
            El MCP oficial te permite que el agente IA opere directamente contra <code>mcp.facebook.com/ads</code>{' '}
            usando OAuth dedicado. Es una integración independiente del adaptador interno Graph API.
          </Typography>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button
              size="sm"
              startDecorator={<LinkIcon />}
              loading={connecting}
              onClick={handleConnect}
            >
              {isError ? 'Reintentar conexión' : 'Conectar MCP oficial de Meta'}
            </Button>
            <Button
              size="sm"
              variant="plain"
              color="neutral"
              startDecorator={<RefreshIcon />}
              onClick={refresh}
              loading={loading}
            >
              Refrescar estado
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}
