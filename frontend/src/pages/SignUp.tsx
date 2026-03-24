import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Box,
  Sheet,
  Typography,
  FormControl,
  FormLabel,
  Input,
  Button,
  Stack,
  Divider,
  Select,
  Option,
  CircularProgress,
} from '@mui/joy'
import {
  ArrowBack as BackIcon,
  WhatsApp as WhatsAppIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import api from '../services/api'

interface Plan {
  id: number
  name: string
  amount: string
  recurrence: string
  trial: boolean
  trialDays: number
  isPublic: boolean
}

export default function SignUp() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    companyName: '',
    phone: '',
    planId: '',
  })
  const [loading, setLoading] = useState(false)
  const [plans, setPlans] = useState<Plan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchPublicPlans()
  }, [])

  const fetchPublicPlans = async () => {
    try {
      setLoadingPlans(true)
      const response = await api.get('/plans/list', { params: { listPublic: 'false' } })
      const publicPlans = Array.isArray(response.data) ? response.data : (response.data?.plans || [])
      setPlans(publicPlans)
      if (publicPlans.length > 0) {
        setFormData(prev => ({ ...prev, planId: String(publicPlans[0].id) }))
      }
    } catch {
      toast.error('Error al cargar los planes disponibles')
    } finally {
      setLoadingPlans(false)
    }
  }

  const formatPlanPrice = (plan: Plan) => {
    const amount = parseFloat(plan.amount)
    if (amount === 0 || plan.trial) {
      return plan.trial ? `Gratis (${plan.trialDays} días trial)` : 'Gratis'
    }
    const recurrenceLabel =
      plan.recurrence === 'MENSUAL' ? '/mes' :
      plan.recurrence === 'ANUAL' ? '/año' :
      `/${plan.recurrence.toLowerCase()}`
    return `$${amount.toFixed(2)}${recurrenceLabel}`
  }

  const whatsappNumber = import.meta.env.VITE_WHATSAPP_CONTACT || '5491234567890'

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (formData.password !== formData.confirmPassword) {
      toast.error('Las contraseñas no coinciden')
      return
    }

    if (formData.password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }

    setLoading(true)

    try {
      await api.post('/api/auth/signup', {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        companyName: formData.companyName,
        phone: formData.phone,
        planId: parseInt(formData.planId),
      })

      toast.success('¡Registro exitoso! Por favor inicia sesión')
      navigate('/login')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string; error?: string } } }
      const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Error al registrarse'
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleWhatsAppContact = () => {
    const message = encodeURIComponent('Hola, necesito ayuda con mi registro en Chateam')
    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank')
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#1e293b',
        background: 'linear-gradient(135deg, #1e293b 0%, #152030 50%, #1a2535 100%)',
        py: { xs: 1.5, sm: 2 },
      }}
    >
      <Sheet
        sx={{
          maxWidth: 540,
          width: '100%',
          mx: 2,
          p: { xs: 2.5, sm: 3 },
          borderRadius: 'xl',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          bgcolor: 'background.surface',
        }}
      >
        <Stack spacing={1.5}>
          {/* Logo + Branding */}
          <Stack spacing={0.75} alignItems="center">
            <Box
              component="img"
              src="/logo.png"
              alt="ChatEAM"
              sx={{ width: 48, height: 48 }}
            />
            <Box
              component="img"
              src="/chateam-logo.png"
              alt="Chateam"
              sx={{ height: 18 }}
            />
            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
              Registro de nueva cuenta
            </Typography>
          </Stack>

          <form onSubmit={handleSubmit}>
            <Stack spacing={1.25}>
              {/* Fila 1: Nombre + Email */}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <FormControl required sx={{ flex: 1 }}>
                  <FormLabel sx={{ fontSize: '0.8rem' }}>Nombre Completo</FormLabel>
                  <Input
                    type="text"
                    placeholder="Juan Pérez"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    disabled={loading}
                    size="md"
                  />
                </FormControl>
                <FormControl required sx={{ flex: 1 }}>
                  <FormLabel sx={{ fontSize: '0.8rem' }}>Correo Electrónico</FormLabel>
                  <Input
                    type="email"
                    placeholder="tu@email.com"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    disabled={loading}
                    size="md"
                  />
                </FormControl>
              </Stack>

              {/* Fila 2: Empresa + Teléfono */}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <FormControl required sx={{ flex: 1 }}>
                  <FormLabel sx={{ fontSize: '0.8rem' }}>Nombre de Empresa</FormLabel>
                  <Input
                    type="text"
                    placeholder="Mi Empresa S.A."
                    value={formData.companyName}
                    onChange={(e) => handleChange('companyName', e.target.value)}
                    disabled={loading}
                    size="md"
                  />
                </FormControl>
                <FormControl required sx={{ flex: 1 }}>
                  <FormLabel sx={{ fontSize: '0.8rem' }}>Teléfono / WhatsApp</FormLabel>
                  <Input
                    type="tel"
                    placeholder="+54 9 11 1234-5678"
                    value={formData.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    disabled={loading}
                    size="md"
                  />
                </FormControl>
              </Stack>

              {/* Plan */}
              <FormControl required>
                <FormLabel sx={{ fontSize: '0.8rem' }}>Plan</FormLabel>
                {loadingPlans ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                    <CircularProgress size="sm" />
                    <Typography level="body-xs">Cargando planes...</Typography>
                  </Box>
                ) : plans.length === 0 ? (
                  <Typography level="body-xs" color="warning">
                    No hay planes disponibles. Contacta al administrador.
                  </Typography>
                ) : (
                  <Select
                    value={formData.planId}
                    onChange={(_, value) => handleChange('planId', value as string)}
                    disabled={loading}
                    size="md"
                  >
                    {plans.map((plan) => (
                      <Option key={plan.id} value={String(plan.id)}>
                        {plan.name} — {formatPlanPrice(plan)}
                      </Option>
                    ))}
                  </Select>
                )}
              </FormControl>

              {/* Fila 3: Contraseña + Confirmar */}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <FormControl required sx={{ flex: 1 }}>
                  <FormLabel sx={{ fontSize: '0.8rem' }}>Contraseña</FormLabel>
                  <Input
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    disabled={loading}
                    size="md"
                  />
                </FormControl>
                <FormControl required sx={{ flex: 1 }}>
                  <FormLabel sx={{ fontSize: '0.8rem' }}>Confirmar Contraseña</FormLabel>
                  <Input
                    type="password"
                    placeholder="Repite tu contraseña"
                    value={formData.confirmPassword}
                    onChange={(e) => handleChange('confirmPassword', e.target.value)}
                    disabled={loading}
                    size="md"
                  />
                </FormControl>
              </Stack>

              <Button
                type="submit"
                fullWidth
                loading={loading}
                size="md"
                sx={{
                  mt: 0.5,
                  bgcolor: '#1e293b',
                  '&:hover': { bgcolor: '#152030' },
                  fontWeight: 600,
                  fontSize: '0.9rem',
                }}
              >
                Crear Cuenta
              </Button>

              <Divider sx={{ my: 0 }}>o</Divider>

              {/* WhatsApp + Volver en fila */}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <Button
                  variant="soft"
                  color="success"
                  fullWidth
                  size="sm"
                  startDecorator={<WhatsAppIcon sx={{ fontSize: 18 }} />}
                  onClick={handleWhatsAppContact}
                >
                  WhatsApp
                </Button>
                <Button
                  variant="outlined"
                  color="neutral"
                  fullWidth
                  size="sm"
                  startDecorator={<BackIcon sx={{ fontSize: 18 }} />}
                  component={Link}
                  to="/login"
                >
                  Volver al Login
                </Button>
              </Stack>
            </Stack>
          </form>

          <Typography level="body-xs" sx={{ textAlign: 'center', color: 'text.tertiary', mt: -0.5 }}>
            Al registrarte aceptas nuestros{' '}
            <Typography
              component="span"
              level="body-xs"
              sx={{ color: 'primary.500', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
            >
              Términos y Condiciones
            </Typography>
            {' '}y{' '}
            <Typography
              component="span"
              level="body-xs"
              sx={{ color: 'primary.500', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
            >
              Política de Privacidad
            </Typography>
            {' '}— Copyright {new Date().getFullYear()} CodigoPlus
          </Typography>
        </Stack>
      </Sheet>
    </Box>
  )
}
