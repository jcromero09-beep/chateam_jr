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
  Chip,
  Modal,
  ModalDialog,
  ModalClose,
  DialogContent,
  Alert
} from '@mui/joy'
import {
  Email as EmailIcon,
  CreditCard as CreditIcon,
  Send as SendIcon,
  Description as TemplateIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  ShoppingCart as BuyIcon
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import api from '../services/api'
import CheckoutPage from '../components/CheckoutPage'

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

interface Invoice {
  id: number
  detail: string
  value: number
  dueDate: string
  status: 'paid' | 'open' | 'proceso'
  users: number
  connections: number
  queues: number
  planId?: number
  recurrence?: string
}

export default function EmailCreditsDashboard() {
  const [loading, setLoading] = useState(true)
  const [balance, setBalance] = useState<EmailBalance | null>(null)
  const [error, setError] = useState('')
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [invoice, setInvoice] = useState<Invoice | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const balanceRes = await api.get('/email-plans/balance')
      setBalance(balanceRes.data.data)
    } catch (err: any) {
      console.error('Error fetching email data:', err)
      // Si no tiene plan, está bien - usamos datos por defecto
      setBalance({
        emailCreditsUsed: 0,
        emailCreditsTotal: 0,
        remainingCredits: 0,
        maxEmailSendsPerDay: 0,
        maxTemplates: 0,
        dueDate: null,
        emailCreditsResetAt: null,
        planName: null,
        isActive: false
      })
    } finally {
      setLoading(false)
    }
  }

  const handleBuyPlan = async () => {
    try {
      // Crear una factura temporal para el checkout
      const { data } = await api.post('/invoices', {
        detail: 'Plan de Email',
        value: 0,
        users: 0,
        connections: 0,
        queues: 0
      })

      setInvoice(data)
      setCheckoutOpen(true)
    } catch (err: any) {
      toast.error('Error al iniciar la compra')
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

  const handleCheckoutSuccess = () => {
    setCheckoutOpen(false)
    fetchData()
    toast.success('¡Plan de email adquirido exitosamente!')
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!balance?.isActive) {
    return (
      <Container maxWidth="xl">
        <Stack spacing={3}>
          {/* Header */}
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={2} alignItems="center">
              <EmailIcon sx={{ fontSize: 32, color: 'primary.main' }} />
              <Box>
                <Typography level="h2">Planes de Email</Typography>
                <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                  Adquiere un plan para enviar campañas de email
                </Typography>
              </Box>
            </Stack>
          </Stack>

          {/* No Active Plan Card */}
          <Card>
            <CardContent>
              <Stack spacing={3} alignItems="center" sx={{ py: 6 }}>
                <EmailIcon sx={{ fontSize: 80, color: 'neutral' }} />
                <Typography level="h3">No tienes un plan de email activo</Typography>
                <Typography level="body-md" sx={{ color: 'neutral', textAlign: 'center', maxWidth: 500 }}>
                  Adquiere un plan de email para comenzar a enviar campañas,
                  gestionar plantillas y más.
                </Typography>
                <Button
                  size="lg"
                  color="primary"
                  startDecorator={<BuyIcon />}
                  onClick={handleBuyPlan}
                >
                  Adquirir Plan de Email
                </Button>
              </Stack>
            </CardContent>
          </Card>

          {/* Plans Info */}
          <Grid container spacing={2}>
            <Grid xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography level="h4" sx={{ mb: 2 }}>Email Básico</Typography>
                  <Typography level="h2" color="primary">$9.99<Typography level="body-xs">/mes</Typography></Typography>
                  <Stack spacing={1} sx={{ mt: 2 }}>
                    <Typography level="body-sm">✓ 100 créditos/mes</Typography>
                    <Typography level="body-sm">✓ 50 envíos/día</Typography>
                    <Typography level="body-sm">✓ 5 plantillas</Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography level="h4" sx={{ mb: 2 }}>Email Profesional</Typography>
                  <Typography level="h2" color="primary">$29.99<Typography level="body-xs">/mes</Typography></Typography>
                  <Stack spacing={1} sx={{ mt: 2 }}>
                    <Typography level="body-sm">✓ 500 créditos/mes</Typography>
                    <Typography level="body-sm">✓ 200 envíos/día</Typography>
                    <Typography level="body-sm">✓ 20 plantillas</Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography level="h4" sx={{ mb: 2 }}>Email Enterprise</Typography>
                  <Typography level="h2" color="primary">$99.99<Typography level="body-xs">/mes</Typography></Typography>
                  <Stack spacing={1} sx={{ mt: 2 }}>
                    <Typography level="body-sm">✓ 2000 créditos/mes</Typography>
                    <Typography level="body-sm">✓ 1000 envíos/día</Typography>
                    <Typography level="body-sm">✓ 100 plantillas</Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Checkout Modal */}
          <Modal open={checkoutOpen} onClose={() => setCheckoutOpen(false)}>
            <ModalDialog sx={{ minWidth: { xs: '95vw', md: 800 }, maxWidth: '95vw', maxHeight: '95vh', overflow: 'auto', p: 3 }}>
              <ModalClose />
              <DialogContent sx={{ overflow: 'visible' }}>
                {invoice && (
                  <CheckoutPage
                    invoice={invoice}
                    onClose={() => setCheckoutOpen(false)}
                    onSuccess={handleCheckoutSuccess}
                  />
                )}
              </DialogContent>
            </ModalDialog>
          </Modal>
        </Stack>
      </Container>
    )
  }

  // Mostrar dashboard con plan activo
  const percentage = balance.emailCreditsTotal > 0
    ? Math.round((balance.emailCreditsUsed / balance.emailCreditsTotal) * 100)
    : 0

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <EmailIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Mis Créditos de Email</Typography>
              <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                Plan: {balance.planName || 'Sin plan'}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startDecorator={<RefreshIcon />} onClick={fetchData}>
              Actualizar
            </Button>
            <Button color="primary" startDecorator={<BuyIcon />} onClick={handleBuyPlan}>
              Cambiar Plan
            </Button>
          </Stack>
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
                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>por ciclo</Typography>
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
                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>este ciclo</Typography>
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
                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>disponibles</Typography>
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
                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>fecha de facturación</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Usage Progress */}
        <Card>
          <CardContent>
            <Typography level="h4" sx={{ mb: 2 }}>Uso del Ciclo Actual</Typography>
            <Stack spacing={3}>
              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography level="body-md">
                    <strong>{balance.emailCreditsUsed}</strong> / {balance.emailCreditsTotal} créditos usados
                  </Typography>
                  <Chip size="sm" color={percentage > 80 ? 'warning' : 'success'}>
                    {percentage}%
                  </Chip>
                </Stack>
                <LinearProgress
                  determinate
                  value={percentage}
                  color={percentage > 80 ? 'warning' : 'success'}
                  sx={{ height: 10, borderRadius: 5 }}
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
                  <Typography level="body-xs" sx={{ color: 'text.secondary' }}>Envíos por día</Typography>
                  <Typography level="h3">{balance.maxEmailSendsPerDay}</Typography>
                </Stack>
              </Grid>
              <Grid xs={6} md={4}>
                <Stack spacing={1}>
                  <Typography level="body-xs" sx={{ color: 'text.secondary' }}>Plantillas disponibles</Typography>
                  <Typography level="h3">{balance.maxTemplates}</Typography>
                </Stack>
              </Grid>
              <Grid xs={6} md={4}>
                <Stack spacing={1}>
                  <Typography level="body-xs" sx={{ color: 'text.secondary' }}>Próximo ciclo</Typography>
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
