import { useState } from 'react'
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
  Checkbox,
  Divider,
} from '@mui/joy'
import { WhatsApp as WhatsAppIcon } from '@mui/icons-material'
import { toast } from 'react-toastify'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const whatsappNumber = import.meta.env.VITE_WHATSAPP_CONTACT || '5491234567890'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return

    setLoading(true)
    try {
      const result = await login(email, password)
      if (result.success) {
        toast.success('Inicio de sesión exitoso')
        navigate('/')
      }
    } catch (error) {
      toast.error('Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  const handleWhatsAppContact = () => {
    const message = encodeURIComponent('Hola, necesito ayuda con mi acceso a Chateam')
    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank')
  }

  const handleForgotPassword = () => {
    navigate('/forgot-password')
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
      }}
    >
      <Sheet
        sx={{
          maxWidth: 420,
          width: '100%',
          mx: 2,
          p: { xs: 3, sm: 4 },
          borderRadius: 'xl',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          bgcolor: 'background.surface',
        }}
      >
        <Stack spacing={3}>
          {/* Logo + Branding */}
          <Stack spacing={1.5} alignItems="center" sx={{ pt: 1 }}>
            <Box
              component="img"
              src="/logo.png"
              alt="ChatEAM"
              sx={{ width: 72, height: 72 }}
            />
            <Box
              component="img"
              src="/chateam-logo.png"
              alt="Chateam"
              sx={{ height: 24 }}
            />
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              Plataforma de comunicación omnicanal
            </Typography>
          </Stack>

          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <FormControl required>
                <FormLabel>Correo Electrónico</FormLabel>
                <Input
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  size="lg"
                />
              </FormControl>

              <FormControl required>
                <FormLabel>Contraseña</FormLabel>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  size="lg"
                />
              </FormControl>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Checkbox
                  label="Recuérdame"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  size="sm"
                />
                <Typography
                  level="body-sm"
                  sx={{
                    color: 'primary.500',
                    cursor: 'pointer',
                    '&:hover': { textDecoration: 'underline' },
                  }}
                  onClick={handleForgotPassword}
                >
                  ¿Olvidaste tu contraseña?
                </Typography>
              </Box>

              <Button
                type="submit"
                fullWidth
                loading={loading}
                size="lg"
                sx={{
                  bgcolor: '#1e293b',
                  '&:hover': { bgcolor: '#152030' },
                  fontWeight: 600,
                  fontSize: '0.95rem',
                }}
              >
                Iniciar Sesión
              </Button>

              <Button
                variant="outlined"
                color="neutral"
                fullWidth
                component={Link}
                to="/signup"
                size="lg"
              >
                Crear Cuenta
              </Button>

              <Divider sx={{ my: 0.5 }}>o</Divider>

              <Button
                variant="soft"
                color="success"
                fullWidth
                startDecorator={<WhatsAppIcon />}
                onClick={handleWhatsAppContact}
              >
                Contáctanos por WhatsApp
              </Button>
            </Stack>
          </form>

          <Typography level="body-xs" sx={{ textAlign: 'center', color: 'text.tertiary' }}>
            Copyright {new Date().getFullYear()} - CodigoPlus
          </Typography>
        </Stack>
      </Sheet>

    </Box>
  )
}
