import { useState, useEffect, useContext } from 'react'
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Box,
  Button,
  Stack,
  Card,
  CardContent,
  Chip,
  Divider,
  CircularProgress,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Alert,
  IconButton,
} from '@mui/joy'
import {
  CreditCard as StripeIcon,
  AccountBalance as PayPalIcon,
  Receipt as ComprobanteIcon,
  Check as CheckIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  CloudUpload as UploadIcon,
  AttachFile as AttachIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import api from '../services/api'
import { AuthContext } from '../context/Auth/AuthContext'

interface Invoice {
  id: number
  detail: string
  users: number
  connections: number
  queues: number
  value: number
  dueDate: string
  status: 'paid' | 'open' | 'proceso'
  subscriptionId?: string
  linkInvoice?: string
  planId?: number
  recurrence?: string
}

interface Plan {
  planId: number
  title: string
  price: number
  users: number
  connections: number
  queues: number
  stripePriceId?: string
  description?: string[]
  recurrence?: string
  allowRecurringPayments?: boolean
}

interface SubscriptionModalProps {
  open: boolean
  onClose: () => void
  invoice: Invoice | null
}

type PaymentMethod = 'stripe' | 'paypal' | 'comprobante' | null
type Step = 'select-plan' | 'select-method' | 'payment-form'

export default function SubscriptionModal({ open, onClose, invoice }: SubscriptionModalProps) {
  const [step, setStep] = useState<Step>('select-plan')
  const [plans, setPlans] = useState<Plan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [currentPlanIndex, setCurrentPlanIndex] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null)
  const [loading, setLoading] = useState(false)
  const [loadingPlans, setLoadingPlans] = useState(false)

  // Comprobante fields
  const [comprobanteDescripcion, setComprobanteDescripcion] = useState('')
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null)
  const [uploadingComprobante, setUploadingComprobante] = useState(false)

  const authContext = useContext(AuthContext)
  const user = authContext?.user

  // Fetch plans when modal opens
  useEffect(() => {
    if (open) {
      fetchPlans()
      setStep('select-plan')
      setSelectedPlan(null)
      setPaymentMethod(null)
      setComprobanteDescripcion('')
      setComprobanteFile(null)
    }
  }, [open])

  const fetchPlans = async () => {
    try {
      setLoadingPlans(true)
      const { data } = await api.get('/plans/all')

      // Handle both array and object response formats
      const plansArray = Array.isArray(data) ? data : (data.plans || [])

      // Filter out Demo plan (id = 1) and format plans
      const formattedPlans = plansArray
        .filter((plan: any) => plan.id !== 1)
        .map((plan: any) => ({
          planId: plan.id,
          title: plan.name,
          price: Number(plan.amount),
          users: plan.users,
          connections: plan.connections,
          queues: plan.queues,
          stripePriceId: plan.stripePriceId,
          recurrence: plan.recurrence,
          allowRecurringPayments: plan.allowRecurringPayments ?? false,
          description: [
            `${plan.users} Usuarios`,
            `${plan.connections} Conexiones`,
            `${plan.queues} Colas`,
            plan.recurrence || 'Mensual',
          ],
        }))

      setPlans(formattedPlans)

      // If invoice has a planId, pre-select it
      if (invoice?.planId) {
        const invoicePlan = formattedPlans.find((p: Plan) => p.planId === invoice.planId)
        if (invoicePlan) {
          setSelectedPlan(invoicePlan)
          const planIndex = formattedPlans.findIndex((p: Plan) => p.planId === invoice.planId)
          setCurrentPlanIndex(planIndex >= 0 ? planIndex : 0)
        }
      }
    } catch (err) {
      console.error('Error fetching plans:', err)
      toast.error('Error al cargar los planes')
    } finally {
      setLoadingPlans(false)
    }
  }

  const handlePlanChange = (direction: 'next' | 'prev') => {
    if (direction === 'next') {
      setCurrentPlanIndex((prev) => (prev + 1) % plans.length)
    } else {
      setCurrentPlanIndex((prev) => (prev - 1 + plans.length) % plans.length)
    }
  }

  const handleSelectPlan = () => {
    const plan = plans[currentPlanIndex]
    setSelectedPlan(plan)
    setStep('select-method')
  }

  const handleSelectPaymentMethod = (method: PaymentMethod) => {
    setPaymentMethod(method)
    if (method === 'comprobante') {
      setStep('payment-form')
    }
  }

  const handleStripePayment = async () => {
    if (!selectedPlan || !invoice) return

    setLoading(true)
    try {
      const { data } = await api.post('/subscription', {
        firstName: user?.name || '',
        price: selectedPlan.price.toString(),
        users: selectedPlan.users.toString(),
        connections: selectedPlan.connections.toString(),
        address2: '',
        city: '',
        state: '',
        zipcode: '',
        country: '',
        plan: JSON.stringify(selectedPlan),
        invoiceId: invoice.id,
      })

      if (data.stripeURL) {
        window.location.href = data.stripeURL
      } else {
        toast.error('Error al generar la URL de pago')
      }
    } catch (err: any) {
      console.error('Error creating Stripe session:', err)
      toast.error(err.response?.data?.message || 'Error al procesar el pago')
    } finally {
      setLoading(false)
    }
  }

  const handlePayPalPayment = async () => {
    if (!selectedPlan || !invoice) return

    setLoading(true)
    try {
      // PayPal integration - you can extend this based on your PayPal setup
      const { data } = await api.post('/subscription/paypal', {
        planId: selectedPlan.planId,
        invoiceId: invoice.id,
        amount: selectedPlan.price,
      })

      if (data.approvalUrl) {
        window.location.href = data.approvalUrl
      } else {
        toast.error('Error al generar la URL de PayPal')
      }
    } catch (err: any) {
      console.error('Error creating PayPal payment:', err)
      toast.error('PayPal no está configurado actualmente. Por favor use otro método de pago.')
    } finally {
      setLoading(false)
    }
  }

  const handleComprobanteUpload = async () => {
    if (!selectedPlan || !invoice || !comprobanteFile) {
      toast.error('Por favor seleccione un archivo de comprobante')
      return
    }

    setUploadingComprobante(true)
    try {
      const formData = new FormData()
      formData.append('file', comprobanteFile)
      formData.append('invoiceId', invoice.id.toString())
      formData.append('planId', selectedPlan.planId.toString())
      formData.append('descripcion', comprobanteDescripcion || 'Comprobante de pago')
      formData.append('totalPrice', selectedPlan.price.toString())
      formData.append('duration', selectedPlan.recurrence || 'MENSUAL')
      formData.append('planName', selectedPlan.title)

      await api.post('/recepts', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      // Update invoice status to 'proceso' (awaiting confirmation)
      await api.put(`/invoices/${invoice.id}`, {
        status: 'proceso',
        planId: selectedPlan.planId,
        value: selectedPlan.price,
      })

      toast.success('Comprobante enviado correctamente. Esperando confirmación del administrador.')
      onClose()
    } catch (err: any) {
      console.error('Error uploading comprobante:', err)
      toast.error(err.response?.data?.message || 'Error al subir el comprobante')
    } finally {
      setUploadingComprobante(false)
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('El archivo no puede superar los 5MB')
        return
      }
      // Check file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf']
      if (!allowedTypes.includes(file.type)) {
        toast.error('Solo se permiten archivos JPG, PNG, GIF o PDF')
        return
      }
      setComprobanteFile(file)
    }
  }

  const currentPlan = plans[currentPlanIndex]
  const isSelected = selectedPlan?.planId === currentPlan?.planId

  const renderPlanSelector = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Typography level="h4" sx={{ mb: 3 }}>
        Selecciona tu Plan
      </Typography>

      {loadingPlans ? (
        <CircularProgress />
      ) : plans.length === 0 ? (
        <Typography>No hay planes disponibles</Typography>
      ) : (
        <>
          <Card
            variant={isSelected ? 'soft' : 'outlined'}
            color={isSelected ? 'primary' : 'neutral'}
            sx={{
              minWidth: 350,
              maxWidth: 400,
              transition: 'all 0.3s ease',
              boxShadow: isSelected ? 'lg' : 'sm',
              borderWidth: isSelected ? 2 : 1,
            }}
          >
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography level="h3">{currentPlan?.title}</Typography>
                {isSelected && (
                  <Chip color="primary" startDecorator={<CheckIcon />}>
                    Seleccionado
                  </Chip>
                )}
              </Stack>

              <Box sx={{ textAlign: 'center', mb: 3 }}>
                <Typography level="h1" sx={{ fontSize: '3rem', fontWeight: 'bold', color: 'primary.main' }}>
                  ${currentPlan?.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Typography>
                <Typography level="body-md" sx={{ color: 'text.tertiary' }}>
                  /{currentPlan?.recurrence?.toLowerCase() === 'anual' ? 'año' : 'mes'}
                </Typography>
              </Box>

              <Stack spacing={1.5} sx={{ mb: 3 }}>
                {currentPlan?.description?.map((feature, index) => (
                  <Stack key={index} direction="row" spacing={1} alignItems="center">
                    <CheckIcon sx={{ fontSize: 18, color: 'success.main' }} />
                    <Typography level="body-md">{feature}</Typography>
                  </Stack>
                ))}
              </Stack>

              <Button
                fullWidth
                variant={isSelected ? 'solid' : 'outlined'}
                color="primary"
                size="lg"
                onClick={handleSelectPlan}
                startDecorator={isSelected ? <CheckIcon /> : null}
              >
                {isSelected ? 'Continuar con este Plan' : 'Seleccionar Plan'}
              </Button>
            </CardContent>
          </Card>

          {plans.length > 1 && (
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 3 }}>
              <IconButton variant="outlined" color="neutral" onClick={() => handlePlanChange('prev')}>
                <ArrowBackIcon />
              </IconButton>
              <Typography level="body-sm">
                {currentPlanIndex + 1} / {plans.length}
              </Typography>
              <IconButton variant="outlined" color="neutral" onClick={() => handlePlanChange('next')}>
                <ArrowForwardIcon />
              </IconButton>
            </Stack>
          )}
        </>
      )}
    </Box>
  )

  const renderPaymentMethodSelector = () => (
    <Box>
      <Button
        variant="plain"
        startDecorator={<ArrowBackIcon />}
        onClick={() => setStep('select-plan')}
        sx={{ mb: 2 }}
      >
        Volver a planes
      </Button>

      <Typography level="h4" sx={{ mb: 2 }}>
        Selecciona el Método de Pago
      </Typography>

      {selectedPlan && (
        <Alert color="primary" sx={{ mb: 3 }}>
          Plan seleccionado: <strong>{selectedPlan.title}</strong> - ${selectedPlan.price.toFixed(2)}/{selectedPlan.recurrence?.toLowerCase() === 'anual' ? 'año' : 'mes'}
        </Alert>
      )}

      <Stack spacing={2}>
        {/* Stripe */}
        <Card
          variant={paymentMethod === 'stripe' ? 'soft' : 'outlined'}
          color={paymentMethod === 'stripe' ? 'primary' : 'neutral'}
          sx={{ cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}
          onClick={() => handleSelectPaymentMethod('stripe')}
        >
          <CardContent>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" alignItems="center" spacing={2}>
                <StripeIcon sx={{ fontSize: 40, color: '#6772e5' }} />
                <Box>
                  <Typography level="title-lg">Tarjeta de Crédito/Débito</Typography>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    {selectedPlan?.allowRecurringPayments ? 'Suscripción automática' : 'Pago único con tarjeta'}
                  </Typography>
                </Box>
              </Stack>
              <Button
                variant="solid"
                color="primary"
                loading={loading && paymentMethod === 'stripe'}
                onClick={(e) => {
                  e.stopPropagation()
                  handleSelectPaymentMethod('stripe')
                  handleStripePayment()
                }}
              >
                Pagar con Tarjeta
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {/* PayPal */}
        <Card
          variant={paymentMethod === 'paypal' ? 'soft' : 'outlined'}
          color={paymentMethod === 'paypal' ? 'warning' : 'neutral'}
          sx={{ cursor: 'pointer', '&:hover': { borderColor: 'warning.main' } }}
          onClick={() => handleSelectPaymentMethod('paypal')}
        >
          <CardContent>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" alignItems="center" spacing={2}>
                <PayPalIcon sx={{ fontSize: 40, color: '#003087' }} />
                <Box>
                  <Typography level="title-lg">PayPal</Typography>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    {selectedPlan?.allowRecurringPayments ? 'Suscripción automática con PayPal' : 'Pago único con PayPal'}
                  </Typography>
                </Box>
              </Stack>
              <Button
                variant="solid"
                color="warning"
                loading={loading && paymentMethod === 'paypal'}
                onClick={(e) => {
                  e.stopPropagation()
                  handleSelectPaymentMethod('paypal')
                  handlePayPalPayment()
                }}
              >
                Pagar con PayPal
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {/* Comprobante/Outline */}
        <Card
          variant={paymentMethod === 'comprobante' ? 'soft' : 'outlined'}
          color={paymentMethod === 'comprobante' ? 'success' : 'neutral'}
          sx={{ cursor: 'pointer', '&:hover': { borderColor: 'success.main' } }}
          onClick={() => handleSelectPaymentMethod('comprobante')}
        >
          <CardContent>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" alignItems="center" spacing={2}>
                <ComprobanteIcon sx={{ fontSize: 40, color: '#2e7d32' }} />
                <Box>
                  <Typography level="title-lg">Transferencia Bancaria</Typography>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Sube tu comprobante de transferencia
                  </Typography>
                </Box>
              </Stack>
              <Button
                variant="solid"
                color="success"
                onClick={(e) => {
                  e.stopPropagation()
                  handleSelectPaymentMethod('comprobante')
                }}
              >
                Subir Comprobante
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  )

  const renderComprobanteForm = () => (
    <Box>
      <Button
        variant="plain"
        startDecorator={<ArrowBackIcon />}
        onClick={() => setStep('select-method')}
        sx={{ mb: 2 }}
      >
        Volver a métodos de pago
      </Button>

      <Typography level="h4" sx={{ mb: 2 }}>
        Subir Comprobante de Pago
      </Typography>

      {selectedPlan && (
        <Alert color="primary" sx={{ mb: 3 }}>
          Plan: <strong>{selectedPlan.title}</strong> - Total a pagar: <strong>${selectedPlan.price.toFixed(2)}</strong>
        </Alert>
      )}

      <Alert color="neutral" sx={{ mb: 3 }}>
        <Typography level="body-sm">
          Realiza la transferencia a la cuenta indicada y sube el comprobante.
          Un administrador verificará el pago y activará tu plan.
        </Typography>
      </Alert>

      <Stack spacing={3}>
        <FormControl>
          <FormLabel>Descripción (opcional)</FormLabel>
          <Textarea
            placeholder="Número de referencia, banco, etc."
            value={comprobanteDescripcion}
            onChange={(e) => setComprobanteDescripcion(e.target.value)}
            minRows={2}
          />
        </FormControl>

        <FormControl required>
          <FormLabel>Comprobante de Pago</FormLabel>
          <Box
            sx={{
              border: '2px dashed',
              borderColor: comprobanteFile ? 'success.main' : 'neutral.outlinedBorder',
              borderRadius: 'md',
              p: 3,
              textAlign: 'center',
              bgcolor: comprobanteFile ? 'success.softBg' : 'background.surface',
              cursor: 'pointer',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: 'primary.softBg',
              },
            }}
            onClick={() => document.getElementById('comprobante-file')?.click()}
          >
            <input
              type="file"
              id="comprobante-file"
              accept="image/*,.pdf"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            {comprobanteFile ? (
              <Stack alignItems="center" spacing={1}>
                <AttachIcon sx={{ fontSize: 40, color: 'success.main' }} />
                <Typography level="body-md" fontWeight="bold">
                  {comprobanteFile.name}
                </Typography>
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Click para cambiar archivo
                </Typography>
              </Stack>
            ) : (
              <Stack alignItems="center" spacing={1}>
                <UploadIcon sx={{ fontSize: 40, color: 'neutral.main' }} />
                <Typography level="body-md">
                  Click para seleccionar archivo
                </Typography>
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  JPG, PNG, GIF o PDF (máx. 5MB)
                </Typography>
              </Stack>
            )}
          </Box>
        </FormControl>

        <Button
          fullWidth
          variant="solid"
          color="success"
          size="lg"
          loading={uploadingComprobante}
          disabled={!comprobanteFile}
          onClick={handleComprobanteUpload}
          startDecorator={<UploadIcon />}
        >
          Enviar Comprobante
        </Button>
      </Stack>
    </Box>
  )

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          maxWidth: 500,
          width: '95%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <ModalClose />
        <Typography level="h3" sx={{ mb: 2 }}>
          Pagar Factura
        </Typography>
        <Divider sx={{ mb: 3 }} />

        {step === 'select-plan' && renderPlanSelector()}
        {step === 'select-method' && renderPaymentMethodSelector()}
        {step === 'payment-form' && paymentMethod === 'comprobante' && renderComprobanteForm()}
      </ModalDialog>
    </Modal>
  )
}
