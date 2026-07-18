/**
 * MetaConnectModal — Doble modo de conexión Meta WhatsApp Business
 *
 * MODO A — Embedded Signup (Facebook Login):
 *   1. Carga el FB SDK con el appId de la empresa
 *   2. FB.login() con scopes whatsapp_business_management + messaging
 *   3. Backend exchangea el code OAuth → long-lived token → WABA + número
 *   4. Crea la conexión automáticamente
 *
 * MODO B — Token de Sistema Manual (conservado intacto):
 *   1. Token   — Pega el Permanent System User Token (+ WABA ID opcional)
 *   2. Select  — Backend descubre los números, usuario elige uno
 *   3. Verify  — Si el número es ON_PREMISE/NOT_VERIFIED, envía SMS y usuario ingresa código
 *   4. Connect — Crea la conexión en ChatEAM con coexistencia activa
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Modal, ModalDialog, ModalClose, Typography, Stack, Button, Divider, Box,
  Alert, CircularProgress, Chip, Input, FormControl, FormLabel, FormHelperText,
  Textarea, Link, List, ListItem, ListItemDecorator, Radio, RadioGroup, Sheet, Card, CardContent,
} from '@mui/joy'
import {
  CheckCircle as SuccessIcon, Error as ErrorIcon, Key as KeyIcon,
  PhoneAndroid as PhoneIcon, OpenInNew as OpenInNewIcon, Business as BusinessIcon,
  Search as SearchIcon, ArrowForward as ArrowForwardIcon, ArrowBack as ArrowBackIcon,
  Sms as SmsIcon, VerifiedUser as VerifiedIcon, Facebook as FacebookIcon,
  Terminal as TerminalIcon, Star as StarIcon,
} from '@mui/icons-material'
import { toast } from 'sonner'
import api from '../../services/api'

// ── Tipos ────────────────────────────────────────────────────────────────────

interface MetaConnectModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

/** Modo activo del modal */
type Mode = 'choice' | 'embedded' | 'manual'

/** Pasos del flujo Manual */
type ManualStep = 'token' | 'searching' | 'select' | 'requesting_code' | 'verify' | 'connecting' | 'success' | 'error'

/** Pasos del flujo Embedded */
type EmbeddedStep = 'idle' | 'loading_sdk' | 'waiting_fb' | 'exchanging' | 'success' | 'error'

interface PhoneNumberOption {
  id: string
  displayPhoneNumber: string
  verifiedName: string
  qualityRating: string
  wabaId: string
  platformType?: string
  codeVerificationStatus?: string
}

interface ConnectResult {
  whatsappId: number
  name: string
  displayPhoneNumber: string
  verifiedName: string
  wabaId: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    FB: any
    fbAsyncInit: () => void
  }
}

function loadFBSDK(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Si ya está cargado e inicializado, solo re-init con el appId correcto
    if (window.FB) {
      try {
        window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: 'v25.0' })
      } catch { /* ya inicializado */ }
      resolve()
      return
    }

    window.fbAsyncInit = () => {
      window.FB.init({
        appId,
        autoLogAppEvents: true,
        xfbml: false,
        version: 'v25.0',
      })
      resolve()
    }

    // Eliminar script fallido de intentos previos para poder reintentar
    const existing = document.getElementById('facebook-jssdk')
    if (existing) existing.remove()

    // Inyectar script — usar en_US (el más estable y con mejor caché en CDN)
    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.onerror = () => {
      // Limpiar el script fallido para permitir reintentos
      document.getElementById('facebook-jssdk')?.remove()
      reject(new Error(
        'No se pudo cargar el SDK de Facebook. ' +
        'Verifica que connect.facebook.net no esté bloqueado en tu red o navegador.'
      ))
    }
    document.head.appendChild(script)

    // Timeout de seguridad (15s)
    setTimeout(() => {
      if (!window.FB) {
        document.getElementById('facebook-jssdk')?.remove()
        reject(new Error('Timeout cargando FB SDK (15s). Revisa tu conexión a internet.'))
      }
    }, 15000)
  })
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function MetaConnectModal({ open, onClose, onSuccess }: MetaConnectModalProps) {
  // ── Estado de modo ──
  const [mode, setMode] = useState<Mode>('choice')

  // ── Estado Embedded ──
  const [embeddedStep, setEmbeddedStep] = useState<EmbeddedStep>('idle')
  const [embeddedError, setEmbeddedError] = useState<string | null>(null)
  const [embeddedConnectionName, setEmbeddedConnectionName] = useState('')
  const [facebookAppId, setFacebookAppId] = useState<string | null>(null)
  const [metaConfigId, setMetaConfigId] = useState<string | null>(null)

  // ── Estado Manual (conservado 1:1) ──
  const [manualStep, setManualStep] = useState<ManualStep>('token')
  const [manualError, setManualError] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState('')
  const [wabaId, setWabaId] = useState('')
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberOption[]>([])
  const [selectedPhoneId, setSelectedPhoneId] = useState('')
  const [connectionName, setConnectionName] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [smsMethod, setSmsMethod] = useState<'SMS' | 'VOICE'>('SMS')
  const [smsSent, setSmsSent] = useState(false)

  // ── Estado compartido ──
  const [result, setResult] = useState<ConnectResult | null>(null)

  const selectedPhone = phoneNumbers.find(p => p.id === selectedPhoneId)
  const needsVerification = selectedPhone &&
    (selectedPhone.platformType === 'ON_PREMISE' || selectedPhone.codeVerificationStatus !== 'VERIFIED')

  // ── Cargar configuracion Meta de CompaniesSettings (BD) ──
  useEffect(() => {
    if (!open || facebookAppId) return

    Promise.all([
      api.get('/companySettingOne', { params: { column: 'facebookAppId' } }),
      api.get('/companySettingOne', { params: { column: 'metaEmbeddedSignupConfigId' } }),
    ])
      .then(([appRes, configRes]) => {
        const appId = appRes.data?.facebookAppId || null
        const configId = configRes.data?.metaEmbeddedSignupConfigId || null
        if (appId && typeof appId === 'string') setFacebookAppId(appId)
        if (configId && typeof configId === 'string') setMetaConfigId(configId)
      })
      .catch(() => { /* silencioso — el botón quedará deshabilitado */ })
  }, [open, facebookAppId])

  // ── Reset completo al cerrar ──
  const handleClose = () => {
    setMode('choice')
    setEmbeddedStep('idle'); setEmbeddedError(null); setEmbeddedConnectionName('')
    setManualStep('token'); setManualError(null)
    setAccessToken(''); setWabaId(''); setConnectionName('')
    setPhoneNumbers([]); setSelectedPhoneId('')
    setSmsCode(''); setSmsSent(false)
    setResult(null)
    onClose()
  }

  // ────────────────────────────────────────────────────────────────────────────
  // FLUJO A — EMBEDDED SIGNUP
  // ────────────────────────────────────────────────────────────────────────────

  const handleEmbeddedSignup = useCallback(async () => {
    if (!facebookAppId) {
      toast.error('No hay Facebook App ID configurado para esta empresa')
      return
    }

    console.log('🔵 [EMBEDDED] ===== INICIO EMBEDDED SIGNUP (Business App Onboarding) =====')
    console.log('🔵 [EMBEDDED] build: token-fallback-no-config-id-v2')
    console.log('🔵 [EMBEDDED] facebookAppId:', facebookAppId)
    console.log('🔵 [EMBEDDED] config_id:', metaConfigId || '(sin config_id)')
    console.log('🔵 [EMBEDDED] featureType: whatsapp_business_app_onboarding')
    console.log('🔵 [EMBEDDED] sessionInfoVersion: 3')
    console.log(
      '🔵 [EMBEDDED] response_type:',
      metaConfigId ? 'code (Facebook Login for Business)' : 'token (legacy sin config_id)'
    )

    setEmbeddedStep('loading_sdk')
    setEmbeddedError(null)

    try {
      // 1. Cargar FB SDK
      console.log('🔵 [EMBEDDED] Cargando FB SDK...')
      await loadFBSDK(facebookAppId)
      console.log('✅ [EMBEDDED] FB SDK cargado. window.FB:', !!window.FB)

      // 2. Abrir diálogo de Facebook Login
      setEmbeddedStep('waiting_fb')
      const loginOptions: Record<string, any> = {
        ...(metaConfigId ? { config_id: metaConfigId } : {}),
        // Con config_id, Facebook Login for Business exige code.
        // Sin config_id, el flujo legacy es mas estable devolviendo accessToken.
        response_type: metaConfigId ? 'code' : 'token',
        override_default_response_type: true,
        extras: {
          // featureType: 'whatsapp_business_app_onboarding' → flujo de coexistencia Meta
          // Muestra QR code pairing para migrar ON_PREMISE → CLOUD_API automáticamente.
          // Docs: developers.facebook.com/docs/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
          featureType: 'whatsapp_business_app_onboarding',
          // sessionInfoVersion: '3' → requerido para el flujo de coexistencia con Business App
          sessionInfoVersion: '3',
          setup: {},
        },
        // [Fase2·A1.1] Con config_id Meta IGNORA este scope: los permisos los define la
        // configuración de Facebook Login for Business en el panel de la app. Añadir
        // ads_read/ads_management ahí es una acción manual en Meta, no de código.
        ...(!metaConfigId
          ? {
              scope:
                'whatsapp_business_management,whatsapp_business_messaging,business_management,ads_read,ads_management'
            }
          : {}),
      }

      const debugUrl = new URL('https://www.facebook.com/v25.0/dialog/oauth')
      debugUrl.searchParams.set('app_id', facebookAppId)
      debugUrl.searchParams.set('client_id', facebookAppId)
      if (metaConfigId) debugUrl.searchParams.set('config_id', metaConfigId)
      debugUrl.searchParams.set('redirect_uri', window.location.href)
      debugUrl.searchParams.set('response_type', loginOptions.response_type)
      debugUrl.searchParams.set('override_default_response_type', String(loginOptions.override_default_response_type))
      debugUrl.searchParams.set('extras', JSON.stringify(loginOptions.extras))
      if (loginOptions.scope) debugUrl.searchParams.set('scope', loginOptions.scope)

      console.log('🔵 [EMBEDDED] Llamando window.FB.login()...')
      console.log('🔵 [EMBEDDED] FB.login options:', JSON.stringify(loginOptions, null, 2))
      console.log('🔵 [EMBEDDED] URL OAuth aproximada (debug, FB.login puede usar redirect interno):', debugUrl.toString())
      console.log('🔵 [EMBEDDED] window.location.href:', window.location.href)

      const authResponse = await new Promise<any>((resolve, reject) => {
        const embeddedMessages: any[] = []
        const messageHandler = (event: MessageEvent) => {
          if (!event.origin.endsWith('facebook.com')) return

          let payload = event.data
          if (typeof payload === 'string') {
            try {
              payload = JSON.parse(payload)
            } catch {
              // Facebook tambien emite mensajes internos no JSON; no son utiles aqui.
              return
            }
          }

          const isEmbeddedSignupMessage =
            payload?.type === 'WA_EMBEDDED_SIGNUP' ||
            payload?.event === 'WA_EMBEDDED_SIGNUP' ||
            payload?.data?.event === 'WA_EMBEDDED_SIGNUP' ||
            payload?.data?.type === 'WA_EMBEDDED_SIGNUP'

          if (!isEmbeddedSignupMessage) return

          embeddedMessages.push(payload)
        }

        window.addEventListener('message', messageHandler)

        window.FB.login(
          (response: any) => {
            window.removeEventListener('message', messageHandler)

            // NUNCA loguear response/authResponse: contienen el authorization code
            // y el accessToken de Meta (credenciales de la WABA del cliente).
            if (response.status === 'connected' && response.authResponse?.code) {
              // Facebook Login for Business exige response_type='code' cuando se usa config_id.
              resolve({ ...response.authResponse, _isAccessToken: false })
            } else if (response.status === 'connected' && response.authResponse?.accessToken) {
              // Fallback legacy para dialogs que todavía retornen accessToken directo.
              resolve({ ...response.authResponse, code: response.authResponse.accessToken, _isAccessToken: true })
            } else if (response.status === 'not_authorized' || response.status === 'unknown') {
              reject(new Error('El usuario canceló el proceso o no otorgó los permisos requeridos.'))
            } else {
              reject(new Error(`Respuesta inesperada de Facebook: ${response.status}`))
            }
          },
          loginOptions
        )
      })

      // 3. Intercambiar code con backend
      setEmbeddedStep('exchanging')

      const payload = {
        code: authResponse.code,
        // Embedded Signup con FB JS SDK devuelve un code de Business Login.
        // En este endpoint no enviamos redirectUri; Meta valida ese code contra
        // el flujo del SDK/config_id, no contra un redirect OAuth clásico.
        connectionName: embeddedConnectionName.trim() || undefined,
        _isAccessToken: authResponse._isAccessToken || false,
      }
      // payload contiene el authorization code de Meta: no loguear.
      const { data } = await api.post('/webhook/meta/embedded-signup', payload)

      setResult({
        whatsappId: data.whatsapp?.id,
        // El backend retorna: { whatsapp: { id, name }, metaNumber: { displayPhoneNumber, wabaId } }
        name: data.whatsapp?.name || data.metaNumber?.displayPhoneNumber || '',
        displayPhoneNumber: data.metaNumber?.displayPhoneNumber || '',
        verifiedName: data.metaNumber?.verifiedName || '',
        wabaId: data.metaNumber?.wabaId || null,
      })
      setEmbeddedStep('success')
      toast.success('¡Conexión Meta creada exitosamente via Facebook!')
      onSuccess?.()
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Error en Embedded Signup'
      // Sin volcado de err.response.data: el backend puede reflejar el authorization code.
      console.error(`[EMBEDDED] Error en Embedded Signup (HTTP ${err.response?.status ?? '?'}): ${msg}`)
      setEmbeddedError(msg)
      setEmbeddedStep('error')
      toast.error(msg)
    }
  }, [facebookAppId, metaConfigId, embeddedConnectionName, onSuccess])

  // ────────────────────────────────────────────────────────────────────────────
  // FLUJO B — TOKEN MANUAL (conservado 1:1 del original)
  // ────────────────────────────────────────────────────────────────────────────

  const handleLookup = async () => {
    if (!accessToken.trim()) { toast.error('El Token de Sistema es requerido'); return }
    setManualStep('searching')
    setManualError(null)
    try {
      const { data } = await api.post('/whatsapp/meta/lookup-phones', {
        accessToken: accessToken.trim(),
        wabaId: wabaId.trim() || undefined,
      })
      const phones: PhoneNumberOption[] = (data.data?.phoneNumbers || [])
      if (phones.length === 0) throw new Error('No se encontraron números con este token.')
      setPhoneNumbers(phones)
      if (phones.length === 1) setSelectedPhoneId(phones[0].id)
      setManualStep('select')
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Error buscando números'
      setManualError(msg); setManualStep('error'); toast.error(msg)
    }
  }

  const handleProceedFromSelect = async () => {
    if (!selectedPhoneId) { toast.error('Selecciona un número'); return }
    if (needsVerification) {
      await handleRequestCode()
    } else {
      await handleConnect()
    }
  }

  const handleRequestCode = async () => {
    setManualStep('requesting_code')
    setManualError(null)
    setSmsCode('')
    try {
      const { data } = await api.post('/whatsapp/meta/request-code', {
        accessToken: accessToken.trim(),
        phoneNumberId: selectedPhoneId,
        method: smsMethod,
        language: 'es',
      })
      if (data.success) {
        setSmsSent(true)
        setManualStep('verify')
        toast.success(`Código ${smsMethod} enviado a ${selectedPhone?.displayPhoneNumber}`)
      } else {
        setSmsSent(false)
        setManualStep('verify')
        toast.warning(`No se pudo enviar automáticamente: ${data.error || 'error'}. Intenta desde el portal Meta.`)
      }
    } catch {
      setSmsSent(false)
      setManualStep('verify')
      toast.warning('Envío automático fallido. Ingresa el código manualmente si tienes uno.')
    }
  }

  const handleVerifyAndConnect = async () => {
    if (!smsCode.trim() || smsCode.trim().length < 6) {
      toast.error('Ingresa el código de 6 dígitos'); return
    }
    setManualStep('connecting')
    setManualError(null)
    try {
      const verifyRes = await api.post('/whatsapp/meta/verify-code', {
        accessToken: accessToken.trim(),
        phoneNumberId: selectedPhoneId,
        code: smsCode.trim(),
      })
      if (!verifyRes.data.success) throw new Error(verifyRes.data.error || 'Código inválido')

      const regRes = await api.post('/whatsapp/meta/register-cloud', {
        accessToken: accessToken.trim(),
        phoneNumberId: selectedPhoneId,
      })
      if (!regRes.data.success && regRes.data.error !== 'SMB_RESTRICTION') {
        toast.warning(`Advertencia al registrar en Cloud API: ${regRes.data.error}`)
      }

      await handleConnect()
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Error en verificación'
      setManualError(msg); setManualStep('error'); toast.error(msg)
    }
  }

  const handleConnect = async () => {
    const phone = phoneNumbers.find(p => p.id === selectedPhoneId)
    if (!phone) return
    try {
      const { data } = await api.post('/whatsapp/meta/connect-manual', {
        accessToken: accessToken.trim(),
        phoneNumberId: selectedPhoneId,
        wabaId: phone.wabaId || wabaId.trim() || undefined,
        connectionName: connectionName.trim() || undefined,
      })
      setResult({
        whatsappId: data.whatsapp?.id,
        name: data.whatsapp?.name,
        displayPhoneNumber: data.metaNumber?.displayPhoneNumber,
        verifiedName: data.metaNumber?.verifiedName,
        wabaId: data.metaNumber?.wabaId,
      })
      setManualStep('success')
      toast.success('¡Conexión Meta creada exitosamente!')
      onSuccess?.()
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Error al conectar'
      setManualError(msg); setManualStep('error'); toast.error(msg)
    }
  }

  const qualityColor = (r: string) =>
    r === 'GREEN' ? 'success' : r === 'YELLOW' ? 'warning' : r === 'RED' ? 'danger' : 'neutral'

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────

  // ¿Estamos en pantalla de éxito?
  const isSuccess = (mode === 'embedded' && embeddedStep === 'success') ||
                    (mode === 'manual' && manualStep === 'success')

  return (
    <Modal open={open} onClose={handleClose}>
      <ModalDialog sx={{ maxWidth: 620, width: '100%', overflow: 'auto', maxHeight: '94vh' }}>
        <ModalClose />
        <Typography level="h4" startDecorator={<KeyIcon sx={{ color: '#1877f2' }} />}>
          Conectar WhatsApp Business
        </Typography>
        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
          {mode === 'choice' && 'Elige cómo conectar tu cuenta de WhatsApp Business'}
          {mode === 'embedded' && 'Conexión via Facebook Login — OAuth oficial de Meta'}
          {mode === 'manual' && 'Conexión via Token de Sistema — Meta Business Manager'}
        </Typography>
        <Divider />

        {/* ════════════════════════════════════════════════════════════
            PANTALLA DE ELECCIÓN
        ════════════════════════════════════════════════════════════ */}
        {mode === 'choice' && (
          <Stack spacing={2.5}>
            <Alert variant="soft" color="primary" sx={{ fontSize: 'sm' }}>
              <Typography level="body-sm">
                Selecciona el método de conexión según el tipo de acceso que tienes a tu cuenta de WhatsApp Business.
              </Typography>
            </Alert>

            {/* Opción A — Embedded Signup */}
            <Card
              variant="outlined"
              sx={{
                cursor: facebookAppId ? 'pointer' : 'not-allowed',
                opacity: facebookAppId ? 1 : 0.6,
                transition: 'all 0.15s',
                border: '2px solid',
                borderColor: 'primary.200',
                '&:hover': facebookAppId ? { borderColor: 'primary.500', boxShadow: 'sm' } : {},
              }}
              onClick={facebookAppId ? () => setMode('embedded') : undefined}
            >
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <Box sx={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: '#1877f2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <FacebookIcon sx={{ color: 'white', fontSize: 28 }} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                      <Typography level="title-md" fontWeight={700}>
                        Conectar con Facebook
                      </Typography>
                      <Chip size="sm" color="success" variant="soft" startDecorator={<StarIcon sx={{ fontSize: 12 }} />}>
                        Recomendado
                      </Chip>
                    </Stack>
                    <Typography level="body-sm" sx={{ color: 'text.secondary', mb: 1 }}>
                      Inicia sesión con tu cuenta de Facebook y otorga permisos a ChatEAM. Meta genera el token automáticamente.
                      Ideal si eres el administrador de la cuenta de WhatsApp Business.
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Chip size="sm" color="primary" variant="soft">OAuth oficial</Chip>
                      <Chip size="sm" color="neutral" variant="soft">Sin copiar tokens</Chip>
                      <Chip size="sm" color="neutral" variant="soft">Configuración automática</Chip>
                    </Stack>
                    {!facebookAppId && (
                      <Alert variant="soft" color="warning" sx={{ mt: 1, fontSize: 'xs' }}>
                        No hay Facebook App ID configurado para esta empresa. Contacta al administrador.
                      </Alert>
                    )}
                  </Box>
                  <ArrowForwardIcon sx={{ color: 'primary.400', flexShrink: 0, mt: 1 }} />
                </Stack>
              </CardContent>
            </Card>

            {/* Opción B — Token Manual */}
            <Card
              variant="outlined"
              sx={{
                cursor: 'pointer',
                transition: 'all 0.15s',
                border: '2px solid',
                borderColor: 'neutral.200',
                '&:hover': { borderColor: 'neutral.400', boxShadow: 'sm' },
              }}
              onClick={() => setMode('manual')}
            >
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <Box sx={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <TerminalIcon sx={{ color: 'white', fontSize: 26 }} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                      <Typography level="title-md" fontWeight={700}>
                        Token de Sistema Manual
                      </Typography>
                      <Chip size="sm" color="neutral" variant="soft">Avanzado</Chip>
                    </Stack>
                    <Typography level="body-sm" sx={{ color: 'text.secondary', mb: 1 }}>
                      Pega directamente un Permanent System User Token generado desde Meta Business Manager.
                      Para cuentas BSP/TP o cuando no tienes acceso de administrador en Facebook.
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Chip size="sm" color="neutral" variant="soft">System User Token</Chip>
                      <Chip size="sm" color="neutral" variant="soft">BSP / TP</Chip>
                      <Chip size="sm" color="neutral" variant="soft">Configuración manual</Chip>
                    </Stack>
                  </Box>
                  <ArrowForwardIcon sx={{ color: 'neutral.400', flexShrink: 0, mt: 1 }} />
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        )}

        {/* ════════════════════════════════════════════════════════════
            FLUJO A — EMBEDDED SIGNUP
        ════════════════════════════════════════════════════════════ */}

        {/* A-idle: pantalla de confirmación antes de abrir FB */}
        {mode === 'embedded' && embeddedStep === 'idle' && (
          <Stack spacing={2.5}>
            <Alert variant="soft" color="primary" sx={{ fontSize: 'sm' }}>
              <Box>
                <Typography level="body-sm" fontWeight={600} mb={0.5}>
                  ¿Qué ocurrirá al hacer clic en "Conectar con Facebook"?
                </Typography>
                <List size="sm" sx={{ '--List-gap': '2px', p: 0 }}>
                  <ListItem sx={{ p: 0 }}>
                    <ListItemDecorator sx={{ minWidth: 20 }}>1.</ListItemDecorator>
                    Se abrirá una ventana emergente de Facebook para iniciar sesión
                  </ListItem>
                  <ListItem sx={{ p: 0 }}>
                    <ListItemDecorator sx={{ minWidth: 20 }}>2.</ListItemDecorator>
                    Seleccionarás el WABA (WhatsApp Business Account) que deseas conectar
                  </ListItem>
                  <ListItem sx={{ p: 0 }}>
                    <ListItemDecorator sx={{ minWidth: 20 }}>3.</ListItemDecorator>
                    ChatEAM recibirá acceso automáticamente y configurará los webhooks
                  </ListItem>
                  <ListItem sx={{ p: 0 }}>
                    <ListItemDecorator sx={{ minWidth: 20 }}>4.</ListItemDecorator>
                    La conexión quedará activa con coexistencia habilitada
                  </ListItem>
                </List>
              </Box>
            </Alert>

            <Alert variant="soft" color="warning" sx={{ fontSize: 'sm' }}>
              <Typography level="body-sm">
                ⚠️ <strong>Importante:</strong> Debes iniciar sesión con la cuenta de Facebook que es
                <strong> Administrador</strong> del WABA que quieres conectar. Si no eres administrador,
                usa el modo <em>Token de Sistema Manual</em>.
              </Typography>
            </Alert>

            <FormControl>
              <FormLabel><PhoneIcon sx={{ fontSize: 14, mr: 0.5 }} />Nombre de la conexión (opcional)</FormLabel>
              <Input
                placeholder="ej: SmartTrack WA Principal"
                value={embeddedConnectionName}
                onChange={e => setEmbeddedConnectionName(e.target.value)}
              />
              <FormHelperText>Como aparecerá en ChatEAM. Si lo dejas vacío se usa el nombre de Meta.</FormHelperText>
            </FormControl>

            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined" color="neutral" startDecorator={<ArrowBackIcon />}
                onClick={() => setMode('choice')} sx={{ flex: 1 }}
              >
                Volver
              </Button>
              <Button
                size="lg"
                onClick={handleEmbeddedSignup}
                startDecorator={<FacebookIcon />}
                sx={{
                  flex: 2,
                  background: '#1877f2',
                  '&:hover': { background: '#1565c0' },
                }}
              >
                Conectar con Facebook
              </Button>
            </Stack>
          </Stack>
        )}

        {/* A-loading_sdk / A-waiting_fb / A-exchanging */}
        {mode === 'embedded' && (embeddedStep === 'loading_sdk' || embeddedStep === 'waiting_fb' || embeddedStep === 'exchanging') && (
          <Stack spacing={2} alignItems="center" sx={{ py: 5 }}>
            <CircularProgress size="lg" color="primary" />
            <Typography level="body-md" fontWeight={600}>
              {embeddedStep === 'loading_sdk' && 'Cargando SDK de Facebook...'}
              {embeddedStep === 'waiting_fb' && 'Esperando confirmación en Facebook...'}
              {embeddedStep === 'exchanging' && 'Configurando conexión con Meta...'}
            </Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary', textAlign: 'center', maxWidth: 380 }}>
              {embeddedStep === 'loading_sdk' && 'Inicializando la librería oficial de Facebook'}
              {embeddedStep === 'waiting_fb' && 'Se abrió una ventana de Facebook. Inicia sesión, selecciona tu WABA y haz clic en "Continuar"'}
              {embeddedStep === 'exchanging' && 'Intercambiando credenciales y registrando webhooks — no cierres esta ventana'}
            </Typography>
          </Stack>
        )}

        {/* A-error */}
        {mode === 'embedded' && embeddedStep === 'error' && (
          <Stack spacing={2}>
            <Alert variant="soft" color="danger" startDecorator={<ErrorIcon />}>
              <Box>
                <Typography level="body-sm" fontWeight={600}>Error en Facebook Login</Typography>
                <Typography level="body-xs">{embeddedError}</Typography>
              </Box>
            </Alert>
            <Alert variant="soft" color="warning">
              <Box>
                <Typography level="body-sm" fontWeight={600} mb={0.5}>Causas comunes:</Typography>
                <Typography level="body-xs" component="div">
                  <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                    <li>La ventana de Facebook se cerró antes de completar el proceso</li>
                    <li>La cuenta de Facebook no tiene acceso de administrador al WABA</li>
                    <li>La app de Facebook no tiene los permisos correctos configurados</li>
                    <li>Bloqueador de ventanas emergentes activo en el navegador</li>
                    <li><strong>Red bloqueando connect.facebook.net</strong> — intenta desactivar VPN, proxy, o extensiones del navegador</li>
                  </ul>
                </Typography>
              </Box>
            </Alert>
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined" color="neutral" startDecorator={<ArrowBackIcon />}
                onClick={() => { setEmbeddedStep('idle'); setEmbeddedError(null) }}
                sx={{ flex: 1 }}
              >
                Reintentar
              </Button>
              <Button
                variant="outlined" color="neutral"
                onClick={() => { setMode('manual'); setEmbeddedStep('idle'); setEmbeddedError(null) }}
                startDecorator={<TerminalIcon />}
                sx={{ flex: 1 }}
              >
                Usar Token Manual
              </Button>
            </Stack>
          </Stack>
        )}

        {/* ════════════════════════════════════════════════════════════
            FLUJO B — TOKEN MANUAL (conservado 1:1)
        ════════════════════════════════════════════════════════════ */}

        {/* B-token */}
        {mode === 'manual' && manualStep === 'token' && (
          <Stack spacing={2.5}>
            <Alert variant="soft" color="primary" sx={{ fontSize: 'sm' }}>
              <Box>
                <Typography level="body-sm" fontWeight={600} mb={0.5}>
                  Cómo obtener el Token de Sistema Permanente
                </Typography>
                <List size="sm" sx={{ '--List-gap': '2px', p: 0 }}>
                  <ListItem sx={{ p: 0 }}>
                    <ListItemDecorator sx={{ minWidth: 20 }}>1.</ListItemDecorator>
                    Ve a{' '}
                    <Link href="https://business.facebook.com/settings/system-users" target="_blank"
                      endDecorator={<OpenInNewIcon sx={{ fontSize: 12 }} />} level="body-sm" sx={{ mx: 0.5 }}>
                      Meta Business → Usuarios del sistema
                    </Link>
                  </ListItem>
                  <ListItem sx={{ p: 0 }}>
                    <ListItemDecorator sx={{ minWidth: 20 }}>2.</ListItemDecorator>
                    Crea o usa un usuario con rol <strong>Admin</strong>
                  </ListItem>
                  <ListItem sx={{ p: 0 }}>
                    <ListItemDecorator sx={{ minWidth: 20 }}>3.</ListItemDecorator>
                    Asigna el activo WABA con permisos{' '}
                    <strong>whatsapp_business_messaging</strong> + <strong>whatsapp_business_management</strong>
                  </ListItem>
                  <ListItem sx={{ p: 0 }}>
                    <ListItemDecorator sx={{ minWidth: 20 }}>4.</ListItemDecorator>
                    Clic <strong>"Generar token"</strong> → App → tipo <strong>Permanente</strong>
                  </ListItem>
                  <ListItem sx={{ p: 0 }}>
                    <ListItemDecorator sx={{ minWidth: 20 }}>5.</ListItemDecorator>
                    Pega el token → <strong>"Buscar mis números"</strong> — el resto es automático
                  </ListItem>
                </List>
              </Box>
            </Alert>

            <FormControl required>
              <FormLabel><KeyIcon sx={{ fontSize: 14, mr: 0.5 }} />Token de Sistema (Permanente)</FormLabel>
              <Textarea minRows={2} maxRows={4} placeholder="EAAxxxxxxxxxx..."
                value={accessToken} onChange={e => setAccessToken(e.target.value)}
                sx={{ fontFamily: 'monospace', fontSize: 'xs' }} />
              <FormHelperText>Token permanente de Meta Business Manager → Usuarios del sistema</FormHelperText>
            </FormControl>

            <FormControl>
              <FormLabel><BusinessIcon sx={{ fontSize: 14, mr: 0.5 }} />WABA ID (opcional)</FormLabel>
              <Input placeholder="257579519530927" value={wabaId}
                onChange={e => setWabaId(e.target.value.replace(/\D/g, ''))}
                sx={{ fontFamily: 'monospace' }} />
              <FormHelperText>Se detecta automáticamente del token si lo dejas vacío</FormHelperText>
            </FormControl>

            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined" color="neutral" startDecorator={<ArrowBackIcon />}
                onClick={() => setMode('choice')} sx={{ flex: 1 }}
              >
                Volver
              </Button>
              <Button
                size="lg" onClick={handleLookup} disabled={!accessToken.trim()}
                startDecorator={<SearchIcon />}
                sx={{ flex: 2, background: '#1877f2', '&:hover': { background: '#1565c0' } }}
              >
                Buscar mis números
              </Button>
            </Stack>
          </Stack>
        )}

        {/* B-searching / B-requesting_code */}
        {mode === 'manual' && (manualStep === 'searching' || manualStep === 'requesting_code') && (
          <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size="lg" />
            <Typography level="body-md" fontWeight={600}>
              {manualStep === 'searching' ? 'Buscando números disponibles...' : 'Enviando código de verificación...'}
            </Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary', textAlign: 'center' }}>
              {manualStep === 'searching'
                ? 'Consultando Meta Graph API para descubrir los números de tu cuenta'
                : `Enviando SMS de verificación a ${selectedPhone?.displayPhoneNumber}`}
            </Typography>
          </Stack>
        )}

        {/* B-select */}
        {mode === 'manual' && manualStep === 'select' && (
          <Stack spacing={2.5}>
            <Alert variant="soft" color="success" sx={{ fontSize: 'sm' }}>
              <Typography level="body-sm">
                ✅ Se encontraron <strong>{phoneNumbers.length}</strong> número(s).
                Selecciona el que deseas conectar.
              </Typography>
            </Alert>

            <RadioGroup value={selectedPhoneId} onChange={e => setSelectedPhoneId(e.target.value)}>
              <Stack spacing={1}>
                {phoneNumbers.map(phone => {
                  const isOnPremise = phone.platformType === 'ON_PREMISE' || phone.codeVerificationStatus !== 'VERIFIED'
                  return (
                    <Sheet key={phone.id}
                      variant={selectedPhoneId === phone.id ? 'soft' : 'outlined'}
                      color={selectedPhoneId === phone.id ? 'primary' : 'neutral'}
                      sx={{ p: 1.5, borderRadius: 'md', cursor: 'pointer',
                        transition: 'all 0.15s', '&:hover': { borderColor: 'primary.400' } }}
                      onClick={() => setSelectedPhoneId(phone.id)}>
                      <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Radio value={phone.id} size="sm" />
                        <Box sx={{ flex: 1 }}>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <Typography level="body-sm" fontWeight={600}>
                              {phone.displayPhoneNumber}
                            </Typography>
                            {phone.verifiedName && (
                              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                · {phone.verifiedName}
                              </Typography>
                            )}
                            <Chip size="sm" color={qualityColor(phone.qualityRating) as any} variant="soft">
                              {phone.qualityRating}
                            </Chip>
                            {isOnPremise && (
                              <Chip size="sm" color="warning" variant="soft" startDecorator={<SmsIcon sx={{ fontSize: 12 }} />}>
                                Requiere verificación SMS
                              </Chip>
                            )}
                          </Stack>
                          <Typography level="body-xs" sx={{ fontFamily: 'monospace', color: 'text.tertiary', mt: 0.25 }}>
                            ID: {phone.id} · WABA: {phone.wabaId}
                          </Typography>
                        </Box>
                      </Stack>
                    </Sheet>
                  )
                })}
              </Stack>
            </RadioGroup>

            {selectedPhone && needsVerification && (
              <Alert variant="soft" color="warning" sx={{ fontSize: 'sm' }}>
                <Box>
                  <Typography level="body-sm" fontWeight={600} mb={0.5}>
                    Este número requiere verificación
                  </Typography>
                  <Typography level="body-xs">
                    El número está en modo <strong>Business App (ON_PREMISE)</strong>. Para activarlo en
                    Cloud API, enviaremos un SMS de verificación al teléfono físico.
                    Asegúrate de tener acceso al número <strong>{selectedPhone.displayPhoneNumber}</strong>.
                  </Typography>
                </Box>
              </Alert>
            )}

            <FormControl>
              <FormLabel><PhoneIcon sx={{ fontSize: 14, mr: 0.5 }} />Nombre de la conexión (opcional)</FormLabel>
              <Input placeholder="ej: SmartTrack WA" value={connectionName}
                onChange={e => setConnectionName(e.target.value)} />
              <FormHelperText>Como aparecerá en ChatEAM. Si lo dejas vacío se usa el nombre de Meta.</FormHelperText>
            </FormControl>

            <Stack direction="row" spacing={1}>
              <Button variant="outlined" color="neutral" startDecorator={<ArrowBackIcon />}
                onClick={() => setManualStep('token')} sx={{ flex: 1 }}>
                Volver
              </Button>
              <Button size="lg" onClick={handleProceedFromSelect} disabled={!selectedPhoneId}
                endDecorator={needsVerification ? <SmsIcon /> : <ArrowForwardIcon />}
                sx={{ flex: 2, background: '#1877f2', '&:hover': { background: '#1565c0' } }}>
                {needsVerification ? 'Enviar SMS de verificación' : 'Conectar número'}
              </Button>
            </Stack>
          </Stack>
        )}

        {/* B-verify */}
        {mode === 'manual' && manualStep === 'verify' && (
          <Stack spacing={2.5}>
            <Alert variant="soft" color={smsSent ? 'success' : 'warning'} sx={{ fontSize: 'sm' }}>
              <Box>
                <Typography level="body-sm" fontWeight={600} mb={0.5}>
                  {smsSent
                    ? `✅ SMS enviado a ${selectedPhone?.displayPhoneNumber}`
                    : `⚠️ SMS no enviado automáticamente`}
                </Typography>
                <Typography level="body-xs">
                  {smsSent
                    ? 'Revisa el SMS en tu teléfono e ingresa el código de 6 dígitos aquí.'
                    : 'Puede deberse a un rate limit de Meta (espera 1-24h) o que el número necesite verificarse en el portal Meta. Si tienes el código, ingrésalo de todas formas.'}
                </Typography>
              </Box>
            </Alert>

            <FormControl required>
              <FormLabel><SmsIcon sx={{ fontSize: 14, mr: 0.5 }} />Código de verificación (6 dígitos)</FormLabel>
              <Input
                placeholder="123456"
                value={smsCode}
                onChange={e => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                sx={{ fontFamily: 'monospace', fontSize: 'lg', letterSpacing: 4, textAlign: 'center' }}
                slotProps={{ input: { style: { textAlign: 'center', letterSpacing: '0.4em' } } }}
              />
              <FormHelperText>
                Código recibido por SMS en <strong>{selectedPhone?.displayPhoneNumber}</strong>
              </FormHelperText>
            </FormControl>

            <Stack direction="row" spacing={1} alignItems="center">
              <Typography level="body-xs" sx={{ color: 'text.tertiary', flex: 1 }}>
                ¿No recibiste el código?
              </Typography>
              <Button variant="outlined" color="neutral" size="sm" startDecorator={<SmsIcon />}
                onClick={() => { setSmsMethod('SMS'); handleRequestCode() }}>
                Reenviar SMS
              </Button>
              <Button variant="outlined" color="neutral" size="sm" startDecorator={<PhoneIcon />}
                onClick={() => { setSmsMethod('VOICE'); handleRequestCode() }}>
                Llamada
              </Button>
            </Stack>

            <Stack direction="row" spacing={1}>
              <Button variant="outlined" color="neutral" startDecorator={<ArrowBackIcon />}
                onClick={() => setManualStep('select')} sx={{ flex: 1 }}>
                Volver
              </Button>
              <Button size="lg" onClick={handleVerifyAndConnect}
                disabled={smsCode.trim().length < 6}
                startDecorator={<VerifiedIcon />}
                sx={{ flex: 2, background: '#1877f2', '&:hover': { background: '#1565c0' } }}>
                Verificar y conectar
              </Button>
            </Stack>
          </Stack>
        )}

        {/* B-connecting */}
        {mode === 'manual' && manualStep === 'connecting' && (
          <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size="lg" />
            <Typography level="body-md" fontWeight={600}>Conectando con Meta Cloud API...</Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary', textAlign: 'center' }}>
              Registrando el número y configurando webhooks
            </Typography>
          </Stack>
        )}

        {/* B-error */}
        {mode === 'manual' && manualStep === 'error' && (
          <Stack spacing={2}>
            <Alert variant="soft" color="danger" startDecorator={<ErrorIcon />}>
              <Box>
                <Typography level="body-sm" fontWeight={600}>Error</Typography>
                <Typography level="body-xs">{manualError}</Typography>
              </Box>
            </Alert>
            <Alert variant="soft" color="warning">
              <Box>
                <Typography level="body-sm" fontWeight={600} mb={0.5}>Causas comunes:</Typography>
                <Typography level="body-xs" component="div">
                  <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                    <li>Token expirado o sin permisos <strong>whatsapp_business_messaging</strong></li>
                    <li>Código SMS inválido o expirado (válido por 10 minutos)</li>
                    <li>El activo WABA no está asignado al usuario de sistema</li>
                    <li>Rate limit de Meta — espera 1-24h entre solicitudes de código</li>
                  </ul>
                </Typography>
              </Box>
            </Alert>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" color="neutral" fullWidth startDecorator={<ArrowBackIcon />}
                onClick={() => setManualStep('token')}>
                Volver al formulario
              </Button>
              <Button color="primary" fullWidth component="a"
                href="https://business.facebook.com/settings/system-users" target="_blank"
                endDecorator={<OpenInNewIcon fontSize="small" />}>
                Ir a Meta Business
              </Button>
            </Stack>
          </Stack>
        )}

        {/* ════════════════════════════════════════════════════════════
            PANTALLA DE ÉXITO COMPARTIDA
        ════════════════════════════════════════════════════════════ */}
        {isSuccess && result && (
          <Stack spacing={2} alignItems="center" sx={{ py: 2 }}>
            <SuccessIcon sx={{ fontSize: 64, color: 'success.500' }} />
            <Typography level="h4" sx={{ color: 'success.700' }}>¡Conexión creada!</Typography>

            <Box sx={{ width: '100%', p: 2, bgcolor: 'background.level1', borderRadius: 'md' }}>
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Nombre:</Typography>
                  <Typography level="body-sm" fontWeight={600}>{result.name}</Typography>
                </Stack>
                {result.displayPhoneNumber && (
                  <Stack direction="row" justifyContent="space-between">
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Número:</Typography>
                    <Typography level="body-sm" fontWeight={600}>{result.displayPhoneNumber}</Typography>
                  </Stack>
                )}
                {result.verifiedName && (
                  <Stack direction="row" justifyContent="space-between">
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Nombre verificado:</Typography>
                    <Typography level="body-sm">{result.verifiedName}</Typography>
                  </Stack>
                )}
                {result.wabaId && (
                  <Stack direction="row" justifyContent="space-between">
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>WABA ID:</Typography>
                    <Typography level="body-sm" sx={{ fontFamily: 'monospace', fontSize: 'xs' }}>{result.wabaId}</Typography>
                  </Stack>
                )}
                <Divider />
                <Stack direction="row" spacing={1} justifyContent="center">
                  <Chip color="success" size="sm">Coexistencia activa</Chip>
                  <Chip color="primary" size="sm">Cloud API</Chip>
                  {mode === 'embedded' && <Chip color="primary" size="sm" startDecorator={<FacebookIcon sx={{ fontSize: 12 }} />}>Embedded Signup</Chip>}
                </Stack>
              </Stack>
            </Box>

            <Typography level="body-xs" sx={{ color: 'text.tertiary', textAlign: 'center' }}>
              Tu número ahora funciona simultáneamente en la WhatsApp Business App y en la API Cloud de Meta.
            </Typography>
            <Button onClick={handleClose} color="success" fullWidth>Cerrar</Button>
          </Stack>
        )}

      </ModalDialog>
    </Modal>
  )
}
