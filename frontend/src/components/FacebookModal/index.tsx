import { useState, useEffect } from 'react'
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Stack,
  Button,
  Divider,
  CircularProgress,
  Alert,
} from '@mui/joy'
import { Facebook as FacebookIcon } from '@mui/icons-material'
import { toast } from 'react-toastify'
import api from '../../services/api'

interface FacebookModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

declare global {
  interface Window {
    FB: any
    fbAsyncInit: () => void
  }
}

export default function FacebookModal({ open, onClose, onSuccess }: FacebookModalProps) {
  const [loading, setLoading] = useState(false)
  const [sdkLoaded, setSdkLoaded] = useState(false)
  const [facebookAppId, setFacebookAppId] = useState<string>('')

  useEffect(() => {
    // Cargar configuracion de Facebook App ID
    const loadFacebookConfig = async () => {
      try {
        const response = await api.get('/companies/settings')
        if (response.data?.facebookAppId) {
          setFacebookAppId(response.data.facebookAppId)
        } else {
          // Usar variable de entorno como fallback
          setFacebookAppId(import.meta.env.VITE_FACEBOOK_APP_ID || '')
        }
      } catch (error) {
        console.error('Error loading Facebook config:', error)
        setFacebookAppId(import.meta.env.VITE_FACEBOOK_APP_ID || '')
      }
    }
    loadFacebookConfig()
  }, [])

  useEffect(() => {
    if (!facebookAppId) return

    // Cargar SDK de Facebook
    const loadFacebookSDK = () => {
      if (window.FB) {
        setSdkLoaded(true)
        return
      }

      window.fbAsyncInit = function () {
        window.FB.init({
          appId: facebookAppId,
          cookie: true,
          xfbml: true,
          version: 'v24.0',
        })
        setSdkLoaded(true)
      }

      // Cargar script de Facebook
      const script = document.createElement('script')
      script.src = 'https://connect.facebook.net/en_US/sdk.js'
      script.async = true
      script.defer = true
      document.body.appendChild(script)
    }

    loadFacebookSDK()
  }, [facebookAppId])

  const handleFacebookLogin = () => {
    if (!window.FB) {
      toast.error('SDK de Facebook no cargado')
      return
    }

    setLoading(true)

    window.FB.login(
      async (response: any) => {
        if (response.authResponse) {
          const { accessToken, userID } = response.authResponse

          try {
            await api.post('/facebook', {
              facebookUserId: userID,
              facebookUserToken: accessToken,
            })

            toast.success('Facebook conectado exitosamente')
            onClose()
            onSuccess?.()
          } catch (error: any) {
            console.error('Error connecting Facebook:', error)
            const message = error.response?.data?.error || 'Error al conectar Facebook'
            toast.error(message)
          }
        } else {
          toast.error('Inicio de sesion cancelado')
        }
        setLoading(false)
      },
      {
        scope: 'public_profile,pages_messaging,pages_show_list,pages_manage_metadata,pages_read_engagement,business_management',
      }
    )
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: 450, maxHeight: '90vh', overflow: 'auto' }}>
        <ModalClose />
        <Typography level="h4">Conectar Facebook Messenger</Typography>

        <Stack spacing={2} sx={{ mt: 2 }}>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Conecta tu pagina de Facebook para recibir mensajes de Messenger directamente en el sistema.
          </Typography>

          <Divider />

          {!facebookAppId ? (
            <Alert color="warning">
              Facebook App ID no configurado. Contacta al administrador.
            </Alert>
          ) : !sdkLoaded ? (
            <Stack alignItems="center" spacing={2} sx={{ py: 3 }}>
              <CircularProgress />
              <Typography level="body-sm">Cargando SDK de Facebook...</Typography>
            </Stack>
          ) : (
            <>
              <Alert color="neutral">
                Al hacer clic en "Conectar con Facebook", se abrira una ventana para autorizar el acceso a tus paginas.
              </Alert>

              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                Permisos requeridos:
                <br />- Acceso a tus paginas de Facebook
                <br />- Enviar y recibir mensajes
                <br />- Gestionar metadatos de paginas
              </Typography>

              <Button
                variant="solid"
                size="lg"
                startDecorator={<FacebookIcon />}
                onClick={handleFacebookLogin}
                loading={loading}
                sx={{
                  bgcolor: '#1877f2',
                  '&:hover': { bgcolor: '#166fe5' },
                }}
              >
                Conectar con Facebook
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
 