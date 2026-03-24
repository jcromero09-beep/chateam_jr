import { useState, useEffect, useCallback } from 'react'
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
  CircularProgress,
  Modal,
  ModalDialog,
  ModalClose,
  Divider,
  Sheet,
} from '@mui/joy'
import {
  Email as EmailIcon,
  ShoppingCart as CartIcon,
  TrendingUp as TrendingUpIcon,
  Campaign as CampaignIcon,
  Inventory as InventoryIcon,
  CheckCircle as CheckCircleIcon,
  Refresh as RefreshIcon,
  LocalOffer as OfferIcon,
} from '@mui/icons-material'
import { toast } from 'sonner'
import api from '../services/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmailPack {
  id: string
  name: string
  emailCount: number
  price: number
  pricePerEmail: number
  popular?: boolean
}

interface EmailStats {
  emailsSentThisMonth: number
  creditsAvailable: number
  activeCampaigns: number
}

// ---------------------------------------------------------------------------
// Pack data
// ---------------------------------------------------------------------------

const EMAIL_PACKS: EmailPack[] = [
  {
    id: 'pack_1000',
    name: 'Pack 1,000 Emails',
    emailCount: 1000,
    price: 1.99,
    pricePerEmail: 0.00199,
  },
  {
    id: 'pack_5000',
    name: 'Pack 5,000 Emails',
    emailCount: 5000,
    price: 7.99,
    pricePerEmail: 0.001598,
  },
  {
    id: 'pack_25000',
    name: 'Pack 25,000 Emails',
    emailCount: 25000,
    price: 29.99,
    pricePerEmail: 0.0011996,
    popular: true,
  },
  {
    id: 'pack_100000',
    name: 'Pack 100,000 Emails',
    emailCount: 100000,
    price: 89.99,
    pricePerEmail: 0.0008999,
  },
  {
    id: 'pack_500000',
    name: 'Pack 500,000 Emails',
    emailCount: 500000,
    price: 349.99,
    pricePerEmail: 0.0006999,
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  return new Intl.NumberFormat('es-ES').format(n)
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(n)
}

function formatPricePerEmail(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(n)
}

// ---------------------------------------------------------------------------
// Stat Card sub-component
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  iconBg: string
  iconColor: string
}

function StatCard({ icon, label, value, iconBg, iconColor }: StatCardProps) {
  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        borderRadius: 'lg',
        boxShadow: 'sm',
        transition: 'box-shadow 0.2s',
        '&:hover': { boxShadow: 'md' },
      }}
    >
      <CardContent>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 'md',
              bgcolor: iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: iconColor,
            }}
          >
            {icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography level="h3" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {typeof value === 'number' ? formatNumber(value) : value}
            </Typography>
            <Typography level="body-sm" sx={{ color: 'text.secondary', mt: 0.25 }}>
              {label}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function EmailCreditPacks() {
  const [stats, setStats] = useState<EmailStats>({
    emailsSentThisMonth: 0,
    creditsAvailable: 0,
    activeCampaigns: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [purchasingPack, setPurchasingPack] = useState<EmailPack | null>(null)
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [processingPurchase, setProcessingPurchase] = useState(false)

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Try to fetch email-specific stats, fallback to credit balances
      const [campaignsRes, creditsRes] = await Promise.allSettled([
        api.get('/email-campaigns', { params: { pageNumber: 1 } }),
        api.get('/ai/credits/balance'),
      ])

      let emailsSent = 0
      let activeCampaigns = 0
      let credits = 0

      if (campaignsRes.status === 'fulfilled') {
        const rawCampaigns = Array.isArray(campaignsRes.value.data)
          ? campaignsRes.value.data
          : (campaignsRes.value.data?.campaigns ?? campaignsRes.value.data?.data ?? [])

        activeCampaigns = rawCampaigns.filter(
          (c: Record<string, string>) => c.status === 'EN_ANDAMENTO'
        ).length

        emailsSent = rawCampaigns.reduce((sum: number, c: Record<string, number>) => {
          return sum + (c.emailsSent ?? c.sent ?? 0)
        }, 0)
      }

      if (creditsRes.status === 'fulfilled') {
        const balances = Array.isArray(creditsRes.value.data)
          ? creditsRes.value.data
          : (creditsRes.value.data?.balances ?? creditsRes.value.data?.data ?? [])

        // Find email_send or email_campaign credit type
        const emailBalance = balances.find(
          (b: Record<string, string>) =>
            b.creditType === 'email_send' || b.type === 'email_send'
        )
        credits = emailBalance?.balance ?? emailBalance?.remaining ?? 0
      }

      setStats({
        emailsSentThisMonth: emailsSent,
        creditsAvailable: credits,
        activeCampaigns,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar estadisticas'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // -------------------------------------------------------------------------
  // Purchase flow
  // -------------------------------------------------------------------------

  const handlePurchaseClick = (pack: EmailPack) => {
    setPurchasingPack(pack)
    setConfirmModalOpen(true)
  }

  const handleConfirmPurchase = async () => {
    if (!purchasingPack) return

    setProcessingPurchase(true)
    try {
      const { data } = await api.post('/email-marketing/packs/purchase', {
        packId: purchasingPack.id,
        emailCount: purchasingPack.emailCount,
        amount: purchasingPack.price,
      })

      if (data?.success !== false) {
        toast.success(
          `Pack de ${formatNumber(purchasingPack.emailCount)} emails comprado correctamente`
        )
        setConfirmModalOpen(false)
        setPurchasingPack(null)
        await fetchStats()
      } else {
        toast.error(data?.message ?? 'Error al procesar la compra')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al procesar la compra'
      toast.error(message)
    } finally {
      setProcessingPurchase(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>

      {/* Header */}
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        sx={{ mb: 3, gap: 1.5 }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 'md',
              bgcolor: 'primary.softBg',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CartIcon sx={{ color: 'primary.plainColor', fontSize: 24 }} />
          </Box>
          <Box>
            <Typography level="h3" sx={{ fontWeight: 700 }}>
              Packs de Envio de Email
            </Typography>
            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
              Compra creditos adicionales para tus campanas de email marketing
            </Typography>
          </Box>
        </Stack>

        <Button
          variant="outlined"
          color="neutral"
          size="sm"
          startDecorator={<RefreshIcon fontSize="small" />}
          onClick={fetchStats}
          disabled={loading}
        >
          Actualizar
        </Button>
      </Stack>

      {/* Loading state */}
      {loading ? (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 320,
          }}
        >
          <Stack spacing={2} alignItems="center">
            <CircularProgress size="lg" />
            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
              Cargando datos...
            </Typography>
          </Stack>
        </Box>
      ) : error ? (
        /* Error state */
        <Card variant="outlined" sx={{ borderRadius: 'lg', textAlign: 'center', py: 6 }}>
          <CardContent>
            <EmailIcon sx={{ fontSize: 52, color: 'text.tertiary', mb: 2 }} />
            <Typography level="body-md" sx={{ color: 'text.secondary', mb: 2 }}>
              {error}
            </Typography>
            <Button
              variant="outlined"
              color="neutral"
              size="sm"
              onClick={fetchStats}
              startDecorator={<RefreshIcon fontSize="small" />}
            >
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid xs={12} sm={4}>
              <StatCard
                icon={<TrendingUpIcon fontSize="small" />}
                label="Emails Enviados Este Mes"
                value={stats.emailsSentThisMonth}
                iconBg="primary.softBg"
                iconColor="primary.plainColor"
              />
            </Grid>
            <Grid xs={12} sm={4}>
              <StatCard
                icon={<InventoryIcon fontSize="small" />}
                label="Creditos Disponibles"
                value={stats.creditsAvailable}
                iconBg="success.softBg"
                iconColor="success.plainColor"
              />
            </Grid>
            <Grid xs={12} sm={4}>
              <StatCard
                icon={<CampaignIcon fontSize="small" />}
                label="Campanas Activas"
                value={stats.activeCampaigns}
                iconBg="warning.softBg"
                iconColor="warning.plainColor"
              />
            </Grid>
          </Grid>

          {/* Current balance card */}
          <Card
            variant="soft"
            color="primary"
            sx={{ borderRadius: 'lg', mb: 3 }}
          >
            <CardContent>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                justifyContent="space-between"
              >
                <Box>
                  <Typography level="title-lg" sx={{ fontWeight: 700 }}>
                    Tu Balance Actual
                  </Typography>
                  <Typography level="body-sm">
                    Creditos de envio de email disponibles en tu cuenta
                  </Typography>
                </Box>
                <Stack direction="row" spacing={3} alignItems="center">
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography level="h2" sx={{ fontWeight: 800 }}>
                      {formatNumber(stats.creditsAvailable)}
                    </Typography>
                    <Typography level="body-xs">
                      creditos email_send
                    </Typography>
                  </Box>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          {/* Pack cards grid */}
          <Typography level="title-lg" sx={{ fontWeight: 700, mb: 2 }}>
            Selecciona un Pack
          </Typography>

          <Grid container spacing={2}>
            {EMAIL_PACKS.map((pack) => (
              <Grid xs={12} sm={6} md={4} lg key={pack.id}>
                <Card
                  variant="outlined"
                  sx={{
                    height: '100%',
                    borderRadius: 'lg',
                    boxShadow: 'sm',
                    position: 'relative',
                    overflow: 'visible',
                    transition: 'box-shadow 0.2s, transform 0.2s',
                    borderColor: pack.popular ? 'primary.outlinedBorder' : 'divider',
                    borderWidth: pack.popular ? 2 : 1,
                    '&:hover': {
                      boxShadow: 'lg',
                      transform: 'translateY(-2px)',
                    },
                  }}
                >
                  {pack.popular && (
                    <Chip
                      size="sm"
                      variant="solid"
                      color="primary"
                      startDecorator={<OfferIcon sx={{ fontSize: 14 }} />}
                      sx={{
                        position: 'absolute',
                        top: -12,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 1,
                        fontWeight: 600,
                      }}
                    >
                      Mas Popular
                    </Chip>
                  )}
                  <CardContent sx={{ textAlign: 'center' }}>
                    <Box
                      sx={{
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        bgcolor: pack.popular ? 'primary.softBg' : 'neutral.softBg',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mx: 'auto',
                        mb: 1.5,
                      }}
                    >
                      <EmailIcon
                        sx={{
                          fontSize: 28,
                          color: pack.popular ? 'primary.plainColor' : 'neutral.plainColor',
                        }}
                      />
                    </Box>

                    <Typography level="title-md" sx={{ fontWeight: 700, mb: 0.5 }}>
                      {pack.name}
                    </Typography>

                    <Typography
                      level="h2"
                      sx={{
                        fontWeight: 800,
                        color: 'primary.plainColor',
                        my: 1,
                      }}
                    >
                      {formatCurrency(pack.price)}
                    </Typography>

                    <Typography level="body-sm" sx={{ color: 'text.secondary', mb: 0.5 }}>
                      {formatNumber(pack.emailCount)} emails
                    </Typography>

                    <Chip
                      size="sm"
                      variant="soft"
                      color="neutral"
                      sx={{ mb: 2 }}
                    >
                      {formatPricePerEmail(pack.pricePerEmail)} / email
                    </Chip>

                    <Button
                      variant={pack.popular ? 'solid' : 'outlined'}
                      color="primary"
                      fullWidth
                      startDecorator={<CartIcon fontSize="small" />}
                      onClick={() => handlePurchaseClick(pack)}
                    >
                      Comprar
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Empty state when no credits at all */}
          {stats.creditsAvailable === 0 && stats.emailsSentThisMonth === 0 && (
            <Sheet
              variant="soft"
              color="neutral"
              sx={{
                borderRadius: 'lg',
                p: 3,
                mt: 3,
                textAlign: 'center',
              }}
            >
              <EmailIcon sx={{ fontSize: 48, color: 'text.tertiary', mb: 1 }} />
              <Typography level="body-md" sx={{ color: 'text.secondary' }}>
                Aun no tienes creditos de envio. Compra un pack para comenzar
                a enviar campanas de email marketing.
              </Typography>
            </Sheet>
          )}
        </>
      )}

      {/* Confirmation Modal */}
      <Modal open={confirmModalOpen} onClose={() => !processingPurchase && setConfirmModalOpen(false)}>
        <ModalDialog
          variant="outlined"
          sx={{ maxWidth: 420, borderRadius: 'lg' }}
        >
          <ModalClose disabled={processingPurchase} />
          <Typography level="h4" sx={{ fontWeight: 700, mb: 1 }}>
            Confirmar Compra
          </Typography>
          <Divider />

          {purchasingPack && (
            <Box sx={{ py: 2 }}>
              <Stack spacing={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                    Pack
                  </Typography>
                  <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                    {purchasingPack.name}
                  </Typography>
                </Stack>

                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                    Cantidad de emails
                  </Typography>
                  <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                    {formatNumber(purchasingPack.emailCount)}
                  </Typography>
                </Stack>

                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                    Precio por email
                  </Typography>
                  <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                    {formatPricePerEmail(purchasingPack.pricePerEmail)}
                  </Typography>
                </Stack>

                <Divider />

                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography level="title-md" sx={{ fontWeight: 700 }}>
                    Total
                  </Typography>
                  <Typography level="title-md" sx={{ fontWeight: 700, color: 'primary.plainColor' }}>
                    {formatCurrency(purchasingPack.price)}
                  </Typography>
                </Stack>
              </Stack>
            </Box>
          )}

          <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
            <Button
              variant="outlined"
              color="neutral"
              fullWidth
              onClick={() => setConfirmModalOpen(false)}
              disabled={processingPurchase}
            >
              Cancelar
            </Button>
            <Button
              variant="solid"
              color="primary"
              fullWidth
              startDecorator={
                processingPurchase ? (
                  <CircularProgress size="sm" />
                ) : (
                  <CheckCircleIcon fontSize="small" />
                )
              }
              onClick={handleConfirmPurchase}
              disabled={processingPurchase}
            >
              {processingPurchase ? 'Procesando...' : 'Confirmar Compra'}
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>
    </Container>
  )
}
