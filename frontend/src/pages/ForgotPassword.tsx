/**
 * ForgotPassword Page — Chateam Pro
 * Formulario para solicitar enlace de recuperacion de contrasena via email
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Box, Sheet, Typography, FormControl, FormLabel, Input, Button,
  Stack, Divider, Alert
} from '@mui/joy'
import {
  ArrowBack as BackIcon,
  Email as EmailIcon,
  CheckCircle as SuccessIcon,
  Send as SendIcon
} from '@mui/icons-material'
import { toast } from 'sonner'
import api from '../services/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      toast.error('Ingresa tu correo electronico')
      return
    }

    setLoading(true)
    try {
      await api.post('/api/auth/forgot-password', { email: email.trim() })
      setSent(true)
    } catch {
      // Siempre mostrar exito por seguridad (no revelar si el email existe)
      setSent(true)
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
      <Box sx={{
        position: 'absolute', bottom: '-15%', left: '-10%',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)',
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
              sx={{
                width: 64, height: 64,
                filter: 'drop-shadow(0 4px 12px rgba(59,130,246,0.3))',
              }}
            />
            <Box
              component="img"
              src="/chateam-logo.png"
              alt="Chateam Pro"
              sx={{ height: 32, objectFit: 'contain' }}
            />
            <Typography level="body-sm" sx={{ color: 'text.tertiary', textAlign: 'center' }}>
              Recuperacion de contrasena
            </Typography>
          </Stack>

          <Divider />

          {sent ? (
            /* ═══ ESTADO: EMAIL ENVIADO ═══ */
            <Stack spacing={2.5} alignItems="center" sx={{ py: 2 }}>
              <SuccessIcon sx={{ fontSize: 56, color: 'success.500' }} />
              <Typography level="title-lg" sx={{ textAlign: 'center', fontWeight: 700 }}>
                Revisa tu correo
              </Typography>
              <Alert color="success" variant="soft" sx={{ width: '100%' }}>
                Si <strong>{email}</strong> esta registrado, recibiras un enlace para restablecer tu contrasena.
                El enlace expira en 30 minutos.
              </Alert>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', textAlign: 'center' }}>
                No olvides revisar la carpeta de spam o correo no deseado.
              </Typography>

              <Stack spacing={1.5} sx={{ width: '100%', pt: 1 }}>
                <Button
                  variant="outlined"
                  color="neutral"
                  fullWidth
                  onClick={() => { setSent(false); setEmail('') }}
                >
                  Enviar a otro correo
                </Button>
                <Button
                  variant="plain"
                  color="neutral"
                  fullWidth
                  startDecorator={<BackIcon />}
                  component={Link}
                  to="/login"
                >
                  Volver al inicio de sesion
                </Button>
              </Stack>
            </Stack>
          ) : (
            /* ═══ ESTADO: FORMULARIO ═══ */
            <form onSubmit={handleSubmit}>
              <Stack spacing={2.5}>
                <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                  Ingresa el correo electronico asociado a tu cuenta y te enviaremos un enlace para restablecer tu contrasena.
                </Typography>

                <FormControl required>
                  <FormLabel>Correo Electronico</FormLabel>
                  <Input
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    startDecorator={<EmailIcon sx={{ color: 'neutral.400' }} />}
                    sx={{ '--Input-focusedThickness': '2px' }}
                    autoFocus
                  />
                </FormControl>

                <Button
                  type="submit"
                  fullWidth
                  loading={loading}
                  size="lg"
                  startDecorator={!loading ? <SendIcon /> : undefined}
                  sx={{ fontWeight: 700, py: 1.5 }}
                >
                  ENVIAR ENLACE
                </Button>

                <Button
                  variant="plain"
                  color="neutral"
                  fullWidth
                  startDecorator={<BackIcon />}
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
