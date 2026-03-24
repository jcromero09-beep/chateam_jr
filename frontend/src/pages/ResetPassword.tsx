/**
 * ResetPassword Page — Chateam Pro
 * Formulario para establecer nueva contrasena usando el token del email
 */

import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  Box, Sheet, Typography, FormControl, FormLabel, Input, Button,
  Stack, Divider, Alert
} from '@mui/joy'
import {
  Lock as LockIcon,
  CheckCircle as SuccessIcon,
  ErrorOutline as ErrorIcon,
  Login as LoginIcon
} from '@mui/icons-material'
import { toast } from 'sonner'
import api from '../services/api'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  // Si no hay token en la URL, mostrar error
  if (!token) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1e293b 0%, #152030 40%, #1a2535 100%)',
        }}
      >
        <Sheet sx={{
          maxWidth: 420, width: '100%', mx: 2, p: 4,
          borderRadius: 'xl', bgcolor: 'background.surface',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          border: '1px solid', borderColor: 'divider',
        }}>
          <Stack spacing={3} alignItems="center">
            <ErrorIcon sx={{ fontSize: 56, color: 'danger.500' }} />
            <Typography level="title-lg" sx={{ textAlign: 'center' }}>
              Enlace invalido
            </Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary', textAlign: 'center' }}>
              Este enlace no contiene un token valido. Solicita un nuevo enlace de recuperacion.
            </Typography>
            <Button fullWidth component={Link} to="/forgot-password">
              Solicitar nuevo enlace
            </Button>
            <Button variant="plain" color="neutral" fullWidth component={Link} to="/login">
              Volver al login
            </Button>
          </Stack>
        </Sheet>
      </Box>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contrasenas no coinciden')
      return
    }

    setLoading(true)
    try {
      const response = await api.post('/api/auth/reset-password', { token, password })
      if (response.data.success) {
        setSuccess(true)
        toast.success('Contrasena actualizada exitosamente')
      } else {
        setError(response.data.message || 'Error al restablecer la contrasena')
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      setError(error.response?.data?.message || 'Token invalido o expirado. Solicita un nuevo enlace.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1e293b 0%, #152030 40%, #1a2535 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Burbujas decorativas */}
      <Box sx={{
        position: 'absolute', top: '-10%', right: '-5%',
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <Sheet
        sx={{
          maxWidth: 420,
          width: '100%',
          mx: 2,
          p: { xs: 3, sm: 4 },
          borderRadius: 'xl',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3), 0 0 40px rgba(59,130,246,0.08)',
          bgcolor: 'background.surface',
          position: 'relative',
          zIndex: 1,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack spacing={3}>
          {/* Logo */}
          <Stack spacing={2} alignItems="center" sx={{ pt: 1 }}>
            <Box
              component="img"
              src="/logo.png"
              alt="Chateam"
              sx={{ width: 64, height: 64, filter: 'drop-shadow(0 4px 12px rgba(59,130,246,0.3))' }}
            />
            <Box
              component="img"
              src="/chateam-logo.png"
              alt="Chateam Pro"
              sx={{ height: 32, objectFit: 'contain' }}
            />
            <Typography level="body-sm" sx={{ color: 'text.tertiary', textAlign: 'center' }}>
              {success ? 'Contrasena actualizada' : 'Establece tu nueva contrasena'}
            </Typography>
          </Stack>

          <Divider />

          {success ? (
            /* ═══ ESTADO: EXITO ═══ */
            <Stack spacing={2.5} alignItems="center" sx={{ py: 2 }}>
              <SuccessIcon sx={{ fontSize: 56, color: 'success.500' }} />
              <Typography level="title-lg" sx={{ textAlign: 'center', fontWeight: 700 }}>
                Contrasena actualizada
              </Typography>
              <Alert color="success" variant="soft" sx={{ width: '100%' }}>
                Tu contrasena se ha restablecido correctamente. Ya puedes iniciar sesion con tu nueva contrasena.
              </Alert>
              <Button
                fullWidth
                size="lg"
                startDecorator={<LoginIcon />}
                onClick={() => navigate('/login')}
                sx={{ fontWeight: 700, py: 1.5 }}
              >
                IR A INICIAR SESION
              </Button>
            </Stack>
          ) : (
            /* ═══ ESTADO: FORMULARIO ═══ */
            <form onSubmit={handleSubmit}>
              <Stack spacing={2.5}>
                {error && (
                  <Alert color="danger" variant="soft" startDecorator={<ErrorIcon />}>
                    {error}
                  </Alert>
                )}

                <FormControl required>
                  <FormLabel>Nueva Contrasena</FormLabel>
                  <Input
                    type="password"
                    placeholder="Minimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    startDecorator={<LockIcon sx={{ color: 'neutral.400' }} />}
                    sx={{ '--Input-focusedThickness': '2px' }}
                    autoFocus
                  />
                </FormControl>

                <FormControl required>
                  <FormLabel>Confirmar Contrasena</FormLabel>
                  <Input
                    type="password"
                    placeholder="Repite tu contrasena"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    startDecorator={<LockIcon sx={{ color: 'neutral.400' }} />}
                    sx={{ '--Input-focusedThickness': '2px' }}
                  />
                </FormControl>

                <Button
                  type="submit"
                  fullWidth
                  loading={loading}
                  size="lg"
                  sx={{ fontWeight: 700, py: 1.5 }}
                >
                  RESTABLECER CONTRASENA
                </Button>

                <Button
                  variant="plain"
                  color="neutral"
                  fullWidth
                  component={Link}
                  to="/login"
                >
                  Volver al inicio de sesion
                </Button>
              </Stack>
            </form>
          )}

          <Typography level="body-xs" sx={{ textAlign: 'center', color: 'text.tertiary' }}>
            &copy; {new Date().getFullYear()} CodigoPlus — Todos los derechos reservados
          </Typography>
        </Stack>
      </Sheet>
    </Box>
  )
}
