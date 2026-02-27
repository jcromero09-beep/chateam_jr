import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Box, Sheet, Typography, FormControl, FormLabel, Input, Button, Stack, Modal, ModalDialog, DialogTitle, DialogContent, DialogActions, Checkbox, Divider } from '@mui/joy'
import { WhatsApp as WhatsAppIcon } from '@mui/icons-material'
import { toast } from 'react-toastify'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showForceDialog, setShowForceDialog] = useState(false)
  const [forceMessage, setForceMessage] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  // WhatsApp contact number (from environment or default)
  const whatsappNumber = import.meta.env.VITE_WHATSAPP_CONTACT || '5491234567890'

  const handleSubmit = async (e: React.FormEvent, force: boolean = false) => {
    e.preventDefault()

    // Evitar múltiples clicks
    if (loading) return

    setLoading(true)
    let needsForceDialog = false

    try {
      console.log('Attempting login with force:', force)
      const result = await login(email, password, force)
      console.log('Login result:', result)

      if (result.success) {
        toast.success('Inicio de sesión exitoso')
        navigate('/')
      } else if (result.needsForce) {
        console.log('Showing force dialog')
        // Mostrar diálogo para confirmar forzar login
        setForceMessage(result.message || 'Ya existe una sesión activa. ¿Desea cerrarla y continuar?')
        setShowForceDialog(true)
        needsForceDialog = true
        setLoading(false) // Reset loading para permitir forzar login
      } else {
        toast.error(result.error || 'Error al iniciar sesión')
      }
    } catch (error) {
      console.error('Login error:', error)
      toast.error('Error al iniciar sesión')
    } finally {
      // Solo reset loading si no se mostró el diálogo de force
      if (!needsForceDialog) {
        setLoading(false)
      }
    }
  }

  const handleForceLogin = async () => {
    setShowForceDialog(false)
    setLoading(true)

    try {
      const result = await login(email, password, true)
      if (result.success) {
        toast.success('Inicio de sesión exitoso')
        navigate('/')
      } else {
        toast.error(result.error || 'Error al iniciar sesión')
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
    toast.info('Funcionalidad de recuperación de contraseña próximamente')
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.level1',
      }}
    >
      <Sheet
        variant="outlined"
        sx={{
          maxWidth: 400,
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
              Plataforma de comunicación omnicanal
            </Typography>
          </Stack>

          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <FormControl required>
                <FormLabel>Correo Electrónico *</FormLabel>
                <Input
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </FormControl>

              <FormControl required>
                <FormLabel>Contraseña *</FormLabel>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </FormControl>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Checkbox
                  label="Recuerdame"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  size="sm"
                />
                <Typography
                  level="body-sm"
                  sx={{
                    color: 'primary.main',
                    cursor: 'pointer',
                    '&:hover': { textDecoration: 'underline' }
                  }}
                  onClick={handleForgotPassword}
                >
                  ¿Ha olvidado su contraseña?
                </Typography>
              </Box>

              <Stack direction="row" spacing={1}>
                <Button
                  variant="soft"
                  color="primary"
                  fullWidth
                  component={Link}
                  to="/signup"
                >
                  REGISTRARSE
                </Button>
                <Button
                  type="submit"
                  fullWidth
                  loading={loading}
                  color="primary"
                >
                  INGRESA
                </Button>
              </Stack>

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
            </Stack>
          </form>

          <Typography level="body-xs" sx={{ textAlign: 'center', color: 'text.tertiary' }}>
            Copyright 2025 - CodigoPlus
          </Typography>
        </Stack>
      </Sheet>

      {/* Modal de confirmación para forzar login */}
      <Modal open={showForceDialog} onClose={() => setShowForceDialog(false)}>
        <ModalDialog variant="outlined" role="alertdialog">
          <DialogTitle>Sesión Activa Detectada</DialogTitle>
          <DialogContent>
            {forceMessage}
          </DialogContent>
          <DialogActions>
            <Button variant="plain" color="neutral" onClick={() => setShowForceDialog(false)}>
              Cancelar
            </Button>
            <Button variant="solid" color="primary" onClick={handleForceLogin}>
              Cerrar sesión anterior y continuar
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>
    </Box>
  )
}
