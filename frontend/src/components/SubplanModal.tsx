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
  Input,
  FormControl,
  FormLabel,
} from '@mui/joy'
import {
  Token as TokenIcon,
  ShoppingCart as CartIcon,
  Check as CheckIcon,
  AccountBalanceWallet as WalletIcon,
  CreditCard as StripeIcon,
  Payment as PayPalIcon,
  Receipt as ComprobanteIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import api from '../services/api'

type PaymentMethod = 'stripe' | 'paypal' | 'comprobante' | null

interface AISubplan {
  id: number
  name: string
  description: string
  tokens: number
  priceUsd: number
  stripePriceId?: string
  paypalPriceId?: string
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
  const [selectedSubplan, setSelectedSubplan] = useState<AISubplan | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null)

  // Comprobante fields
  const [comprobanteDescripcion, setComprobanteDescripcion] = useState('')
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null)
  const [uploadingComprobante, setUploadingComprobante] = useState(false)

  useEffect(() => {
    if (open) {
      fetchSubplans()
      setSelectedSubplan(null)
      setPaymentMethod(null)
      setComprobanteDescripcion('')
      setComprobanteFile(null)
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

  // Seleccionar subplan para compra
  const handleSelectSubplan = (subplan: AISubplan) => {
    setSelectedSubplan(subplan)
    setPaymentMethod(null)
  }

  // Seleccionar método de pago
  const handleSelectPaymentMethod = (method: PaymentMethod) => {
    setPaymentMethod(method)
  }

  // Procesar pago según método seleccionado
  const handlePurchase = async () => {
    if (!selectedSubplan || !paymentMethod) return

    try {
      setPurchasing(selectedSubplan.id)

      if (paymentMethod === 'stripe') {
        // Stripe checkout
        const { data } = await api.post('/ai/subplan-purchase/checkout', {
          subplanId: selectedSubplan.id
        })

        if (data.sessionUrl) {
          window.location.href = data.sessionUrl
        } else {
          toast.error('Error al iniciar proceso de pago')
        }
      } else if (paymentMethod === 'paypal') {
        // PayPal checkout
        const { data } = await api.post('/ai/subplan-purchase/paypal', {
          subplanId: selectedSubplan.id
        })

        if (data.approvalUrl) {
          window.location.href = data.approvalUrl
        } else {
          toast.error('Error al iniciar pago PayPal')
        }
      } else if (paymentMethod === 'comprobante') {
        // Comprobante - requiere archivo
        if (!comprobanteFile) {
          toast.error('Por favor seleccione un archivo de comprobante')
          setPurchasing(null)
          return
        }

        setUploadingComprobante(true)
        const formData = new FormData()
        formData.append('file', comprobanteFile)
        formData.append('subplanId', String(selectedSubplan.id))
        formData.append('descripcion', comprobanteDescripcion || 'Comprobante de pago de tokens IA')

        const { data } = await api.post('/ai/subplan-purchase/comprobante', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })

        toast.success('Comprobante subido exitosamente. Su compra será procesada en breve.')
        onSuccess?.()
        onClose()
      }
    } catch (error: any) {
      console.error('Error creating checkout:', error)
      toast.error(error.response?.data?.error || 'Error al procesar compra')
    } finally {
      setPurchasing(null)
      setUploadingComprobante(false)
    }
  }

  // Volver a la lista de subplans
  const handleBackToSubplans = () => {
    setSelectedSubplan(null)
    setPaymentMethod(null)
    setComprobanteDescripcion('')
    setComprobanteFile(null)
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
                        onClick={() => handleSelectSubplan(subplan)}
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

        {/* Sección de métodos de pago */}
        {selectedSubplan && (
          <>
            <Divider sx={{ my: 3 }} />

            <Button
              variant="outlined"
              size="sm"
              onClick={handleBackToSubplans}
              sx={{ mb: 2 }}
            >
              ← Volver a paquetes
            </Button>

            <Box sx={{ p: 2, bgcolor: 'background.level1', borderRadius: 'sm' }}>
              <Typography level="title-md" sx={{ mb: 2 }}>
                Paquete seleccionado: <strong>{selectedSubplan.name}</strong>
              </Typography>
              <Typography level="body-md" sx={{ mb: 3 }}>
                {formatNumber(Number(selectedSubplan.tokens))} tokens por {formatCurrency(selectedSubplan.priceUsd)} USD
              </Typography>

              <Typography level="title-sm" sx={{ mb: 2 }}>
                Selecciona método de pago:
              </Typography>

              <Grid container spacing={2}>
                {/* Stripe */}
                <Grid xs={12} md={4}>
                  <Card
                    variant={paymentMethod === 'stripe' ? 'solid' : 'outlined'}
                    color={paymentMethod === 'stripe' ? 'primary' : 'neutral'}
                    onClick={() => handleSelectPaymentMethod('stripe')}
                    sx={{ cursor: 'pointer', transition: 'all 0.2s', '&:hover': { borderColor: 'primary.500' } }}
                  >
                    <CardContent sx={{ textAlign: 'center', py: 3 }}>
                      <StripeIcon sx={{ fontSize: 40, mb: 1 }} />
                      <Typography level="title-sm">Stripe</Typography>
                      <Typography level="body-xs" sx={{ color: paymentMethod === 'stripe' ? 'inherit' : 'text.tertiary' }}>
                        Pago con tarjeta
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                {/* PayPal */}
                <Grid xs={12} md={4}>
                  <Card
                    variant={paymentMethod === 'paypal' ? 'solid' : 'outlined'}
                    color={paymentMethod === 'paypal' ? 'warning' : 'neutral'}
                    onClick={() => handleSelectPaymentMethod('paypal')}
                    sx={{ cursor: 'pointer', transition: 'all 0.2s', '&:hover': { borderColor: 'warning.500' } }}
                  >
                    <CardContent sx={{ textAlign: 'center', py: 3 }}>
                      <PayPalIcon sx={{ fontSize: 40, mb: 1, color: paymentMethod === 'paypal' ? 'inherit' : '#0070ba' }} />
                      <Typography level="title-sm">PayPal</Typography>
                      <Typography level="body-xs" sx={{ color: paymentMethod === 'paypal' ? 'inherit' : 'text.tertiary' }}>
                        Pago con PayPal
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Comprobante */}
                <Grid xs={12} md={4}>
                  <Card
                    variant={paymentMethod === 'comprobante' ? 'solid' : 'outlined'}
                    color={paymentMethod === 'comprobante' ? 'success' : 'neutral'}
                    onClick={() => handleSelectPaymentMethod('comprobante')}
                    sx={{ cursor: 'pointer', transition: 'all 0.2s', '&:hover': { borderColor: 'success.500' } }}
                  >
                    <CardContent sx={{ textAlign: 'center', py: 3 }}>
                      <ComprobanteIcon sx={{ fontSize: 40, mb: 1 }} />
                      <Typography level="title-sm">Comprobante</Typography>
                      <Typography level="body-xs" sx={{ color: paymentMethod === 'comprobante' ? 'inherit' : 'text.tertiary' }}>
                        Transferencia
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* Formulario de Comprobante */}
              {paymentMethod === 'comprobante' && (
                <Box sx={{ mt: 3, p: 2, bgcolor: 'background.surface', borderRadius: 'sm' }}>
                  <Typography level="title-sm" sx={{ mb: 2 }}>
                    Sube tu comprobante de transferencia
                  </Typography>

                  <Alert color="primary" sx={{ mb: 2 }}>
                    Realiza la transferencia a la cuenta indicada y sube el comprobante.
                  </Alert>

                  <FormControl sx={{ mb: 2 }}>
                    <FormLabel>Descripción (opcional)</FormLabel>
                    <Input
                      size="sm"
                      placeholder="Notas sobre el pago..."
                      value={comprobanteDescripcion}
                      onChange={(e) => setComprobanteDescripcion(e.target.value)}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Archivo de comprobante</FormLabel>
                    <Box
                      sx={{
                        border: '2px dashed',
                        borderColor: comprobanteFile ? 'success.main' : 'neutral.outlinedBorder',
                        borderRadius: 'sm',
                        p: 2,
                        textAlign: 'center',
                        bgcolor: comprobanteFile ? 'success.softBg' : 'background.surface',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        '&:hover': { borderColor: 'success.500' }
                      }}
                      onClick={() => document.getElementById('comprobante-file')?.click()}
                    >
                      <input
                        type="file"
                        id="comprobante-file"
                        accept="image/*,.pdf"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = (e.target as HTMLInputElement).files?.[0]
                          if (file) setComprobanteFile(file)
                        }}
                      />
                      {comprobanteFile ? (
                        <Box>
                          <CheckIcon sx={{ color: 'success.main', mb: 1 }} />
                          <Typography level="body-sm">{comprobanteFile.name}</Typography>
                        </Box>
                      ) : (
                        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                          Click para seleccionar archivo
                        </Typography>
                      )}
                    </Box>
                  </FormControl>

                  <Button
                    fullWidth
                    variant="solid"
                    color="success"
                    onClick={handlePurchase}
                    disabled={!comprobanteFile}
                    loading={uploadingComprobante}
                    sx={{ mt: 2 }}
                  >
                    Enviar Comprobante
                  </Button>
                </Box>
              )}

              {/* Botón de compra para Stripe/PayPal */}
              {paymentMethod && paymentMethod !== 'comprobante' && (
                <Button
                  fullWidth
                  variant="solid"
                  color={paymentMethod === 'stripe' ? 'primary' : 'warning'}
                  onClick={handlePurchase}
                  loading={purchasing === selectedSubplan.id}
                  sx={{ mt: 3 }}
                >
                  {paymentMethod === 'stripe' ? 'Pagar con Stripe' : 'Pagar con PayPal'}
                </Button>
              )}
            </Box>
          </>
        )}
      </ModalDialog>
    </Modal>
  )
}
