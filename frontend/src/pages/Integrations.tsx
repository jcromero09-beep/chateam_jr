import { useState, useEffect } from 'react'
import {
  Container,
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  Switch,
  LinearProgress,
  Alert as _Alert,
  Divider,
} from '@mui/joy'
import {
  Extension as IntegrationIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  WhatsApp as WhatsAppIcon,
  Telegram as TelegramIcon,
  Email as EmailIcon,
  Payment as StripeIcon,
  Campaign as MetaIcon,
} from '@mui/icons-material'
import api from '../services/api'

interface Integration {
  id: string
  name: string
  description: string
  status: 'active' | 'inactive' | 'error'
  category: 'communication' | 'payment' | 'marketing' | 'other'
  icon: React.ReactNode
  isConfigured: boolean
  lastSync?: string
}

// Mapa de iconos por id para reconstruir el nodo React desde la API
const ICON_MAP: Record<string, React.ReactNode> = {
  whatsapp: <WhatsAppIcon sx={{ color: '#25D366' }} />,
  telegram: <TelegramIcon sx={{ color: '#0088cc' }} />,
  stripe: <StripeIcon sx={{ color: '#635BFF' }} />,
  email: <EmailIcon sx={{ color: '#EA4335' }} />,
  meta: <MetaIcon sx={{ color: '#1877F2' }} />,
}

export default function Integrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchIntegrations()
  }, [])

  const fetchIntegrations = async () => {
    setLoading(true)
    try {
      const response = await api.get('/integrations')
      const rawData: any[] = response.data?.data ?? response.data ?? []
      const mapped: Integration[] = rawData.map((item: any) => ({
        ...item,
        icon: ICON_MAP[item.id] ?? <IntegrationIcon />,
      }))
      setIntegrations(mapped)
    } catch {
      // Sin datos disponibles — se mostrará estado vacío
      setIntegrations([])
    } finally {
      setLoading(false)
    }
  }

  const stats = {
    total: integrations.length,
    active: integrations.filter((i) => i.status === 'active').length,
    inactive: integrations.filter((i) => i.status === 'inactive').length,
    errors: integrations.filter((i) => i.status === 'error').length,
  }

  const toggleIntegration = async (id: string) => {
    setIntegrations(
      integrations.map((i) =>
        i.id === id
          ? { ...i, status: i.status === 'active' ? 'inactive' : 'active' }
          : i
      )
    )
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <IntegrationIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Integraciones</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Gestión de integraciones y APIs externas
              </Typography>
            </Box>
          </Stack>
          <Button startDecorator={<RefreshIcon />} onClick={fetchIntegrations}>
            Actualizar
          </Button>
        </Stack>

        {loading && <LinearProgress />}

        {/* KPI cards — siempre visibles */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                  Total
                </Typography>
                <Typography level="h2">{stats.total}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                  Activas
                </Typography>
                <Typography level="h2" sx={{ color: 'success.main' }}>
                  {stats.active}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                  Inactivas
                </Typography>
                <Typography level="h2" sx={{ color: 'neutral.main' }}>
                  {stats.inactive}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                  Errores
                </Typography>
                <Typography level="h2" sx={{ color: 'danger.main' }}>
                  {stats.errors}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Estado vacío */}
        {!loading && integrations.length === 0 && (
          <Card>
            <CardContent>
              <Stack spacing={2} alignItems="center" sx={{ py: 6 }}>
                <IntegrationIcon sx={{ fontSize: 56, color: 'text.tertiary' }} />
                <Typography level="title-lg" sx={{ color: 'text.secondary' }}>
                  No hay integraciones configuradas
                </Typography>
                <Typography level="body-sm" sx={{ color: 'text.tertiary', textAlign: 'center', maxWidth: 480 }}>
                  Configura tus primeras integraciones para conectar canales de comunicación.
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Lista de integraciones */}
        {integrations.length > 0 && (
          <Grid container spacing={2}>
            {integrations.map((integration) => (
              <Grid key={integration.id} xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Stack spacing={2}>
                      <Stack direction="row" justifyContent="space-between" alignItems="start">
                        <Stack direction="row" spacing={2} alignItems="center">
                          <Box sx={{ fontSize: 40 }}>{integration.icon}</Box>
                          <Box>
                            <Typography level="title-lg">{integration.name}</Typography>
                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                              {integration.description}
                            </Typography>
                          </Box>
                        </Stack>
                        <Switch
                          checked={integration.status === 'active'}
                          onChange={() => toggleIntegration(integration.id)}
                        />
                      </Stack>
                      <Divider />
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          size="sm"
                          color={
                            integration.status === 'active'
                              ? 'success'
                              : integration.status === 'error'
                              ? 'danger'
                              : 'neutral'
                          }
                          startDecorator={
                            integration.status === 'active' ? <CheckIcon /> : <WarningIcon />
                          }
                        >
                          {integration.status === 'active'
                            ? 'Activa'
                            : integration.status === 'error'
                            ? 'Error'
                            : 'Inactiva'}
                        </Chip>
                        <Chip size="sm" variant="soft">
                          {integration.category}
                        </Chip>
                        {integration.lastSync && (
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            Sync: {new Date(integration.lastSync).toLocaleTimeString('es-ES')}
                          </Typography>
                        )}
                      </Stack>
                      <Button
                        variant="outlined"
                        startDecorator={<SettingsIcon />}
                        fullWidth
                      >
                        Configurar
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Stack>
    </Container>
  )
}
