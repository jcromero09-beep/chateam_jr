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
  CircularProgress
} from '@mui/joy'
import {
  ArrowBack as BackIcon,
  WhatsApp as WhatsAppIcon
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
    planId: ''
  })
  const [loading, setLoading] = useState(false)
  const [plans, setPlans] = useState<Plan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const navigate = useNavigate()

  // Cargar planes publicos al montar
  useEffect(() => {
    fetchPublicPlans()
  }, [])

  const fetchPublicPlans = async () => {
    try {
      setLoadingPlans(true)
      // Endpoint publico que devuelve solo planes con isPublic=true
      // Nota: listPublic=false significa "filtrar solo publicos" (logica invertida en backend)
      const response = await api.get('/plans/list', { params: { listPublic: 'false' } })
      const publicPlans = Array.isArray(response.data) ? response.data : (response.data?.plans || [])

      setPlans(publicPlans)

      // Seleccionar el primer plan por defecto
      if (publicPlans.length > 0) {
        setFormData(prev => ({ ...prev, planId: String(publicPlans[0].id) }))
      }
    } catch (error) {
      console.error('Error fetching public plans:', error)
      toast.error('Error al cargar los planes disponibles')
    } finally {
      setLoadingPlans(false)
    }
  }

  const formatPlanPrice = (plan: Plan) => {
    const amount = parseFloat(plan.amount)
    if (amount === 0 || plan.trial) {
      return plan.trial ? `Gratis (${plan.trialDays} dias trial)` : 'Gratis'
    }
    const recurrenceLabel = plan.recurrence === 'MENSUAL' ? '/mes' :
                           plan.recurrence === 'ANUAL' ? '/ano' :
                           `/${plan.recurrence.toLowerCase()}`
    return `$${amount.toFixed(2)}${recurrenceLabel}`
  }

  // WhatsApp contact number
  const whatsappNumber = import.meta.env.VITE_WHATSAPP_CONTACT || '5491234567890'

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validaciones
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
        planId: parseInt(formData.planId)
      })

      toast.success('¡Registro exitoso! Por favor inicia sesión')
      navigate('/login')
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Error al registrarse'
      toast.error(errorMessage)
      console.error('Signup error:', error)
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
        bgcolor: 'background.level1',
        py: 4,
      }}
    >
      <Sheet
        variant="outlined"
        sx={{
          maxWidth: 500,
          width: '100%',
          mx: 2,
          p: 4,
          borderRadius: 'md',
          boxShadow: 'md',
        }}
      >
        <Stack spacing={3}>
          <Stack spacing={1} alignItems="center">
            <Typography level="h3" component="h1" sx={{ color: 'primary.main' }}>
              Chateam!
            </Typography>
            <Typography level="h4" component="span" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
              pro
            </Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary', mt: 1 }}>
              Registro de nueva cuenta
            </Typography>
          </Stack>

          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <FormControl required>
                <FormLabel>Nombre Completo *</FormLabel>
                <Input
                  type="text"
                  placeholder="Juan Pérez"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  disabled={loading}
                />
              </FormControl>

              <FormControl required>
                <FormLabel>Correo Electrónico *</FormLabel>
                <Input
                  type="email"
                  placeholder="tu@email.com"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  disabled={loading}
                />
              </FormControl>

              <FormControl required>
                <FormLabel>Nombre de Empresa *</FormLabel>
                <Input
                  type="text"
                  placeholder="Mi Empresa S.A."
                  value={formData.companyName}
                  onChange={(e) => handleChange('companyName', e.target.value)}
                  disabled={loading}
                />
              </FormControl>

              <FormControl required>
                <FormLabel>Teléfono / WhatsApp *</FormLabel>
                <Input
                  type="tel"
                  placeholder="+54 9 11 1234-5678"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  disabled={loading}
                />
              </FormControl>

              <FormControl required>
                <FormLabel>Plan</FormLabel>
                {loadingPlans ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                    <CircularProgress size="sm" />
                    <Typography level="body-sm">Cargando planes...</Typography>
                  </Box>
                ) : plans.length === 0 ? (
                  <Typography level="body-sm" color="warning">
                    No hay planes disponibles. Contacta al administrador.
                  </Typography>
                ) : (
                  <Select
                    value={formData.planId}
                    onChange={(_, value) => handleChange('planId', value as string)}
                    disabled={loading}
                  >
                    {plans.map((plan) => (
                      <Option key={plan.id} value={String(plan.id)}>
                        {plan.name} - {formatPlanPrice(plan)}
                      </Option>
                    ))}
                  </Select>
                )}
              </FormControl>

              <FormControl required>
                <FormLabel>Contraseña *</FormLabel>
                <Input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  disabled={loading}
                />
              </FormControl>

              <FormControl required>
                <FormLabel>Confirmar Contraseña *</FormLabel>
                <Input
                  type="password"
                  placeholder="Repite tu contraseña"
                  value={formData.confirmPassword}
                  onChange={(e) => handleChange('confirmPassword', e.target.value)}
                  disabled={loading}
                />
              </FormControl>

              <Button
                type="submit"
                fullWidth
                loading={loading}
                color="primary"
                size="lg"
              >
                CREAR CUENTA
              </Button>

              <Divider sx={{ my: 1 }} />

              <Button
                variant="outlined"
                color="success"
                fullWidth
                startDecorator={<WhatsAppIcon />}
                onClick={handleWhatsAppContact}
              >
                CONTACTENOS POR WHATSAPP
              </Button>

              <Button
                variant="plain"
                color="neutral"
                fullWidth
                startDecorator={<BackIcon />}
                component={Link}
                to="/login"
              >
                Volver al inicio de sesión
              </Button>
            </Stack>
          </form>

          <Typography level="body-xs" sx={{ textAlign: 'center', color: 'text.tertiary' }}>
            Al registrarte aceptas nuestros{' '}
            <Typography sx={{ color: 'primary.main', cursor: 'pointer' }}>
              Términos y Condiciones
            </Typography>
            {' '}y{' '}
            <Typography sx={{ color: 'primary.main', cursor: 'pointer' }}>
              Política de Privacidad
            </Typography>
          </Typography>

          <Typography level="body-xs" sx={{ textAlign: 'center', color: 'text.tertiary' }}>
            Copyright 2025 - CodigoPlus
          </Typography>
        </Stack>
      </Sheet>
    </Box>
  )
}
