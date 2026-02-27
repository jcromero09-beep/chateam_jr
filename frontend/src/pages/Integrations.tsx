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

export default function Integrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchIntegrations()
  }, [])

  const fetchIntegrations = async () => {
    setLoading(true)
    try {
      const mockIntegrations: Integration[] = [
        {
          id: 'whatsapp',
          name: 'WhatsApp Business API',
          description: 'API oficial de Meta para mensajería empresarial',
          status: 'active',
          category: 'communication',
          icon: <WhatsAppIcon sx={{ color: '#25D366' }} />,
          isConfigured: true,
          lastSync: '2025-01-13T10:30:00Z',
        },
        {
          id: 'telegram',
          name: 'Telegram Bot API',
          description: 'Bot de Telegram para atención al cliente',
          status: 'active',
          category: 'communication',
          icon: <TelegramIcon sx={{ color: '#0088cc' }} />,
          isConfigured: true,
          lastSync: '2025-01-13T09:15:00Z',
        },
        {
          id: 'stripe',
          name: 'Stripe Payments',
          description: 'Procesamiento de pagos y facturación',
          status: 'active',
          category: 'payment',
          icon: <StripeIcon sx={{ color: '#635BFF' }} />,
          isConfigured: true,
          lastSync: '2025-01-13T08:45:00Z',
        },
        {
          id: 'email',
          name: 'Email Marketing',
          description: 'SendGrid/SES para campañas de email',
          status: 'active',
          category: 'marketing',
          icon: <EmailIcon sx={{ color: '#EA4335' }} />,
          isConfigured: true,
          lastSync: '2025-01-13T07:30:00Z',
        },
        {
          id: 'meta',
          name: 'Meta Marketing API',
          description: 'Campañas publicitarias en Facebook/Instagram',
          status: 'inactive',
          category: 'marketing',
          icon: <MetaIcon sx={{ color: '#1877F2' }} />,
          isConfigured: false,
        },
      ]
      setIntegrations(mockIntegrations)
    } catch (error) {
      console.error('Error fetching integrations:', error)
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
      </Stack>
    </Container>
  )
}
