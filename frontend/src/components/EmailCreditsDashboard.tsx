import { useState, useEffect } from 'react'
import {
  Typography,
  Stack,
  Container,
  Card,
  CardContent,
  Box,
  Grid,
  Button,
  CircularProgress,
  LinearProgress,
  Chip
} from '@mui/joy'
import {
  Email as EmailIcon,
  CreditCard as CreditIcon,
  Send as SendIcon,
  Description as TemplateIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon
} from '@mui/icons-material'
import api from '../services/api'

interface EmailBalance {
  emailCreditsUsed: number
  emailCreditsTotal: number
  remainingCredits: number
  maxEmailSendsPerDay: number
  maxTemplates: number
  dueDate: string | null
  emailCreditsResetAt: string | null
  planName: string | null
  isActive: boolean
}

interface EmailUsage {
  currentCycle: {
    used: number
    total: number
    percentage: number
  }
  dailyUsage: {
    sent: number
    limit: number
    remaining: number
  }
}

export default function EmailCreditsDashboard() {
  const [loading, setLoading] = useState(true)
  const [balance, setBalance] = useState<EmailBalance | null>(null)
  const [usage, setUsage] = useState<EmailUsage | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [balanceRes, usageRes] = await Promise.all([
        api.get('/email-plans/balance'),
        api.get('/email-plans/usage')
      ])

      setBalance(balanceRes.data.data)
      setUsage(usageRes.data.data)
    } catch (err: any) {
      console.error('Error fetching email data:', err)
      setError(err.response?.data?.message || 'Error al cargar los datos')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Container maxWidth="xl">
        <Card>
          <CardContent>
            <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
              <WarningIcon sx={{ fontSize: 48, color: 'warning.main' }} />
              <Typography level="h4">{error}</Typography>
              <Button onClick={fetchData} startDecorator={<RefreshIcon />}>
                Reintentar
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    )
  }

  if (!balance?.isActive) {
    return (
      <Container maxWidth="xl">
        <Card>
          <CardContent>
            <Stack spacing={3} alignItems="center" sx={{ py: 4 }}>
              <EmailIcon sx={{ fontSize: 64, color: 'text.secondary' }} />
              <Typography level="h4">No tienes un plan de email activo</Typography>
              <Typography level="body-md" sx={{ color: 'text.secondary', textAlign: 'center' }}>
                Adquiere un plan de email para comenzar a enviar campañas
              </Typography>
              <Button color="primary">
                Ver Planes de Email
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    )
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <EmailIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Créditos de Email</Typography>
              <Typography level="body-sm" sx={{ color: 'neutral' }}>
                Plan: {balance.planName || 'Sin plan'}
              </Typography>
            </Box>
          </Stack>
          <Button variant="outlined" startDecorator={<RefreshIcon />} onClick={fetchData}>
            Actualizar
          </Button>
        </Stack>

        {/* Stats Cards */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <CreditIcon color="primary" />
                  <Typography level="body-sm">Créditos Totales</Typography>
                </Stack>
                <Typography level="h2">{balance.emailCreditsTotal}</Typography>
                <Typography level="body-xs" sx={{ color: 'neutral' }}>
                  por ciclo
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <SendIcon color="success" />
                  <Typography level="body-sm">Créditos Usados</Typography>
                </Stack>
                <Typography level="h2" color="success">{balance.emailCreditsUsed}</Typography>
                <Typography level="body-xs" sx={{ color: 'neutral' }}>
                  este ciclo
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <EmailIcon color="warning" />
                  <Typography level="body-sm">Créditos Restantes</Typography>
                </Stack>
                <Typography level="h2" color="warning">{balance.remainingCredits}</Typography>
                <Typography level="body-xs" sx={{ color: 'neutral' }}>
                  disponibles
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <TemplateIcon color="info" />
                  <Typography level="body-sm">Próximo Reset</Typography>
                </Stack>
                <Typography level="h4">{formatDate(balance.dueDate)}</Typography>
                <Typography level="body-xs" sx={{ color: 'neutral' }}>
                  fecha de facturación
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Usage Progress */}
        <Card>
          <CardContent>
            <Typography level="h4" sx={{ mb: 2 }}>Uso del Ciclo Actual</Typography>

            <Stack spacing={3}>
              {/* Credits Progress */}
              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography level="body-md">
                    <strong>{usage?.currentCycle.used || 0}</strong> / {usage?.currentCycle.total || 0} créditos usados
                  </Typography>
                  <Chip size="sm" color={((usage?.currentCycle.percentage || 0) > 80) ? 'warning' : 'success'}>
                    {usage?.currentCycle.percentage || 0}%
                  </Chip>
                </Stack>
                <LinearProgress
                  determinate
                  value={usage?.currentCycle.percentage || 0}
                  color={(usage?.currentCycle.percentage || 0) > 80 ? 'warning' : 'success'}
                  sx={{ height: 10, borderRadius: 5 }}
                />
              </Box>

              {/* Daily Usage */}
              <Box>
                <Typography level="body-sm" sx={{ mb: 1, color: 'text.secondary' }}>
                  Envíos diarios: <strong>{usage?.dailyUsage.sent || 0}</strong> / {usage?.dailyUsage.limit || 0}
                </Typography>
                <LinearProgress
                  determinate
                  value={((usage?.dailyUsage.sent || 0) / (usage?.dailyUsage.limit || 1)) * 100}
                  color="primary"
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* Limits */}
        <Card>
          <CardContent>
            <Typography level="h4" sx={{ mb: 2 }}>Límites del Plan</Typography>
            <Grid container spacing={2}>
              <Grid xs={6} md={4}>
                <Stack spacing={1}>
                  <Typography level="body-xs" sx={{ color: 'neutral' }}>Envíos por día</Typography>
                  <Typography level="h3">{balance.maxEmailSendsPerDay}</Typography>
                </Stack>
              </Grid>
              <Grid xs={6} md={4}>
                <Stack spacing={1}>
                  <Typography level="body-xs" sx={{ color: 'neutral' }}>Plantillas disponibles</Typography>
                  <Typography level="h3">{balance.maxTemplates}</Typography>
                </Stack>
              </Grid>
              <Grid xs={6} md={4}>
                <Stack spacing={1}>
                  <Typography level="body-xs" sx={{ color: 'neutral' }}>Próximo ciclo</Typography>
                  <Typography level="h3">{formatDate(balance.dueDate)}</Typography>
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  )
}
