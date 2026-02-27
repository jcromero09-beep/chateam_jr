import { useState, useEffect } from 'react'
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  Grid,
  Chip,
  CircularProgress,
  Divider,
  Alert,
} from '@mui/joy'
import {
  Token as TokenIcon,
  ShoppingCart as CartIcon,
  Check as CheckIcon,
  AccountBalanceWallet as WalletIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import api from '../services/api'

interface AISubplan {
  id: number
  name: string
  description: string
  tokens: number
  priceUsd: number
  stripePriceId?: string
}

interface TokenInfo {
  tokenBalance: number
  activeSubplan: AISubplan | null
  activeSubplanId: number | null
}

interface SubplanModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  currentTokenInfo?: TokenInfo | null
}

export default function SubplanModal({ open, onClose, onSuccess, currentTokenInfo }: SubplanModalProps) {
  const [subplans, setSubplans] = useState<AISubplan[]>([])
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState<number | null>(null)

  useEffect(() => {
    if (open) {
      fetchSubplans()
    }
  }, [open])

  const fetchSubplans = async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/ai/subplan-purchase/available')
      setSubplans(data)
    } catch (error) {
      console.error('Error fetching subplans:', error)
      toast.error('Error al cargar paquetes de tokens disponibles')
    } finally {
      setLoading(false)
    }
  }

  const handlePurchase = async (subplan: AISubplan) => {
    try {
      setPurchasing(subplan.id)

      const { data } = await api.post('/ai/subplan-purchase/checkout', {
        subplanId: subplan.id
      })

      if (data.sessionUrl) {
        // Redirigir a Stripe Checkout
        window.location.href = data.sessionUrl
      } else {
        toast.error('Error al iniciar proceso de pago')
      }
    } catch (error: any) {
      console.error('Error creating checkout:', error)
      toast.error(error.response?.data?.error || 'Error al procesar compra')
    } finally {
      setPurchasing(null)
    }
  }

  const formatNumber = (num: number) => num.toLocaleString('es-ES')
  const formatCurrency = (num: number) => `$${Number(num).toFixed(2)}`

  const currentBalance = currentTokenInfo?.tokenBalance || 0

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          minWidth: { xs: '95vw', md: 700 },
          maxWidth: '95vw',
          maxHeight: '90vh',
          overflow: 'auto'
        }}
      >
        <ModalClose />

        <Typography level="h3" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <TokenIcon />
          Comprar Tokens de IA
        </Typography>

        {/* Balance actual */}
        <Box sx={{ mb: 3, p: 2, bgcolor: 'background.level1', borderRadius: 'sm' }}>
          <Grid container spacing={2} alignItems="center">
            <Grid xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <WalletIcon sx={{ color: 'success.500' }} />
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Balance Actual
                  </Typography>
                  <Typography level="h3" sx={{ color: 'success.600' }}>
                    {formatNumber(currentBalance)} tokens
                  </Typography>
                </Box>
              </Box>
            </Grid>
            <Grid xs={12} sm={6}>
              {currentTokenInfo?.activeSubplan && (
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Plan Activo
                  </Typography>
                  <Chip size="sm" color="primary" variant="soft">
                    {currentTokenInfo.activeSubplan.name}
                  </Chip>
                </Box>
              )}
            </Grid>
          </Grid>
        </Box>

        <Alert color="primary" sx={{ mb: 2 }}>
          <Typography level="body-sm">
            Los tokens se <strong>suman</strong> a tu balance actual. Si tienes {formatNumber(currentBalance)} tokens
            y compras un paquete, los nuevos tokens se agregan a tu saldo.
          </Typography>
        </Alert>

        <Divider sx={{ my: 2 }} />

        <Typography level="title-md" sx={{ mb: 2 }}>
          Selecciona un paquete de tokens
        </Typography>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : subplans.length === 0 ? (
          <Typography level="body-md" sx={{ textAlign: 'center', py: 4, color: 'text.tertiary' }}>
            No hay paquetes de tokens disponibles en este momento
          </Typography>
        ) : (
          <Grid container spacing={2}>
            {subplans.map((subplan) => {
              const isActive = currentTokenInfo?.activeSubplanId === subplan.id
              const isPurchasing = purchasing === subplan.id
              const newBalance = currentBalance + Number(subplan.tokens)

              return (
                <Grid xs={12} md={6} key={subplan.id}>
                  <Card
                    variant={isActive ? 'solid' : 'outlined'}
                    color={isActive ? 'primary' : 'neutral'}
                    sx={{
                      height: '100%',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        borderColor: 'primary.500',
                        boxShadow: 'md'
                      }
                    }}
                  >
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography level="title-lg">{subplan.name}</Typography>
                        <Chip size="sm" variant="soft" color="neutral">
                          ID: {subplan.id}
                        </Chip>
                      </Box>

                      {subplan.description && (
                        <Typography level="body-sm" sx={{ color: isActive ? 'inherit' : 'text.tertiary', mb: 2 }}>
                          {subplan.description}
                        </Typography>
                      )}

                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
                        <Typography level="h2" sx={{ color: isActive ? 'inherit' : 'success.600' }}>
                          {formatNumber(Number(subplan.tokens))}
                        </Typography>
                        <Typography level="body-sm">tokens</Typography>
                      </Box>

                      <Typography level="h4" sx={{ mb: 2 }}>
                        {formatCurrency(subplan.priceUsd)} USD
                      </Typography>

                      <Divider sx={{ my: 1 }} />

                      <Typography level="body-xs" sx={{ mb: 2, color: isActive ? 'inherit' : 'text.tertiary' }}>
                        Nuevo balance: <strong>{formatNumber(newBalance)}</strong> tokens
                      </Typography>

                      <Button
                        fullWidth
                        variant={isActive ? 'soft' : 'solid'}
                        color={isActive ? 'success' : 'primary'}
                        startDecorator={isActive ? <CheckIcon /> : <CartIcon />}
                        onClick={() => handlePurchase(subplan)}
                        loading={isPurchasing}
                        disabled={isPurchasing}
                      >
                        {isActive ? 'Recargar' : 'Comprar'}
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              )
            })}
          </Grid>
        )}
      </ModalDialog>
    </Modal>
  )
}
