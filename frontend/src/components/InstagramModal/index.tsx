import { useState, useEffect } from 'react'
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Stack,
  Button,
  Divider,
  Alert,
} from '@mui/joy'
import { Instagram as InstagramIcon } from '@mui/icons-material'

interface InstagramModalProps {
  open: boolean
  onClose: () => void
}

// Constantes para el flujo OAuth
const IG_AUTH_FLAG = 'ig_auth_started'
const IG_STATE_KEY = 'ig_oauth_state'

function randomState(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export default function InstagramModal({ open, onClose }: InstagramModalProps) {
  const [instagramAppId, setInstagramAppId] = useState<string>('')

  useEffect(() => {
    // Usar variable de entorno
    setInstagramAppId(import.meta.env.VITE_INSTAGRAM_APP_ID || '')
  }, [])

  const handleInstagramConnect = () => {
    if (!instagramAppId) {
      return
    }

    const redirectUri = `${window.location.origin}/connections`

    const scopes = [
      'instagram_business_basic',
      'instagram_business_manage_messages',
      'instagram_business_manage_comments',
      'instagram_business_content_publish',
    ].join(',')

    const state = randomState()
    sessionStorage.setItem(IG_AUTH_FLAG, '1')
    sessionStorage.setItem(IG_STATE_KEY, state)

    const loginUrl =
      `https://www.instagram.com/oauth/authorize` +
      `?client_id=${instagramAppId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${scopes}` +
      `&state=${state}`

    window.location.assign(loginUrl)
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: 450, maxHeight: '90vh', overflow: 'auto' }}>
        <ModalClose />
        <Typography level="h4">Conectar Instagram</Typography>

        <Stack spacing={2} sx={{ mt: 2 }}>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Conecta tu cuenta de Instagram Business para recibir mensajes directos en el sistema.
          </Typography>

          <Divider />

          {!instagramAppId ? (
            <Alert color="warning">
              Instagram App ID no configurado. Contacta al administrador.
            </Alert>
          ) : (
            <>
              <Alert color="neutral">
                Al hacer clic en "Conectar con Instagram", seras redirigido a Instagram para autorizar el acceso.
              </Alert>

              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                Requisitos:
                <br />- Cuenta de Instagram Business o Creator
                <br />- Pagina de Facebook vinculada (para mensajeria)
                <br />
                <br />
                Permisos requeridos:
                <br />- Acceso basico a Instagram Business
                <br />- Gestionar mensajes
                <br />- Gestionar comentarios
              </Typography>

              <Button
                variant="solid"
                size="lg"
                startDecorator={<InstagramIcon />}
                onClick={handleInstagramConnect}
                sx={{
                  background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
                  '&:hover': {
                    background: 'linear-gradient(45deg, #e08323 0%, #d6582c 25%, #cc1733 50%, #bc1356 75%, #ac0878 100%)',
                  },
                }}
              >
                Conectar con Instagram
              </Button>
            </>
          )}

          <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 2 }}>
            <Button variant="outlined" color="neutral" onClick={onClose}>
              Cancelar
            </Button>
          </Stack>
        </Stack>
      </ModalDialog>
    </Modal>
  )
}
