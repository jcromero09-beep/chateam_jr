import { useNavigate } from 'react-router-dom'
import { Box, Typography, Button, Sheet, Alert } from '@mui/joy'
import { Lock as LockIcon, Home as HomeIcon, ArrowBack as BackIcon } from '@mui/icons-material'

interface AccessDeniedProps {
  message?: string
  showBackButton?: boolean
}

export default function AccessDenied({
  message = 'No tienes permisos para acceder a este módulo',
  showBackButton = true,
}: AccessDeniedProps) {
  const navigate = useNavigate()

  const handleGoHome = () => {
    navigate('/')
  }

  const handleGoBack = () => {
    navigate(-1)
  }

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
        p: 3,
      }}
    >
      <Sheet
        variant="outlined"
        sx={{
          maxWidth: 600,
          width: '100%',
          p: 4,
          borderRadius: 'lg',
          textAlign: 'center',
        }}
      >
        {/* Icon */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            mb: 3,
          }}
        >
          <Box
            sx={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              bgcolor: 'danger.softBg',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LockIcon sx={{ fontSize: 64, color: 'danger.solidBg' }} />
          </Box>
        </Box>

        {/* Title */}
        <Typography level="h2" sx={{ mb: 2, color: 'danger.solidColor' }}>
          Acceso Denegado
        </Typography>

        {/* Message */}
        <Alert color="danger" variant="soft" sx={{ mb: 3 }}>
          <Typography level="body-md">{message}</Typography>
        </Alert>

        {/* Additional Info */}
        <Typography level="body-sm" sx={{ mb: 4, color: 'text.secondary' }}>
          Si crees que deberías tener acceso a este módulo, contacta con tu administrador para
          solicitar los permisos necesarios.
        </Typography>

        {/* Actions */}
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            justifyContent: 'center',
            flexDirection: { xs: 'column', sm: 'row' },
          }}
        >
          {showBackButton && (
            <Button variant="outlined" color="neutral" startDecorator={<BackIcon />} onClick={handleGoBack}>
              Volver Atrás
            </Button>
          )}
          <Button variant="solid" color="primary" startDecorator={<HomeIcon />} onClick={handleGoHome}>
            Ir al Dashboard
          </Button>
        </Box>

        {/* Contact Info */}
        <Box
          sx={{
            mt: 4,
            pt: 3,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
            ¿Necesitas ayuda? Contacta con soporte:
          </Typography>
          <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
            soporte@jrchateam.com
          </Typography>
        </Box>
      </Sheet>
    </Box>
  )
}
