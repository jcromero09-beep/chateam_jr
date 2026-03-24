import { useState, useEffect } from 'react'
import {
  Typography,
  Stack,
  Container,
  Card,
  Box,
  Switch,
  Button,
  Input,
  Textarea,
  Select,
  Option,
  Divider,
  FormControl,
  FormLabel,
  FormHelperText,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Chip,
  Avatar,
  IconButton,
  List,
  ListItem,
  ListItemContent,
  ListItemDecorator,
} from '@mui/joy'
import {
  Settings as SettingsIcon,
  Save as SaveIcon,
  WhatsApp as WhatsAppIcon,
  Timer as TimerIcon,
  Message as MessageIcon,
  Shield as ShieldIcon,
  SupervisedUserCircle as UserIcon,
  Payment as PaymentIcon,
  Campaign as CampaignIcon,
  Palette as PaletteIcon,
  RestartAlt as RestartAltIcon,
  Notifications as NotificationsIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Phone as PhoneIcon,
  Cloud as CloudIcon,
  MusicNote as MusicNoteIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import api from '../services/api'
import authService from '../services/authService'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import { useThemeColors } from '../context/ThemeContext'

export default function Settings() {
  const { user, loading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()
  const { setColors } = useThemeColors()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newAlertPhone, setNewAlertPhone] = useState('')
  const [whatsappConnections, setWhatsappConnections] = useState<Array<{
    id: number;
    name: string;
    status: string;
    number: string;
    channel: string;
    Company?: { id: number; name: string };
  }>>([])
  const [activeTab, setActiveTab] = useState(0)

  const [settings, setSettings] = useState({
    // Configuraciones de Tickets
    hoursCloseTicketsAuto: '24',
    DirectTicketsToWallets: false,
    closeTicketOnTransfer: false,

    // Configuraciones de Chatbot
    chatBotType: 'text',

    // Configuraciones de WhatsApp
    acceptCallWhatsapp: 'disabled',
    AcceptCallWhatsappMessage: 'Lo sentimos, no aceptamos llamadas en este momento.',
    acceptAudioMessageContact: 'enabled',
    CheckMsgIsGroup: 'enabled',

    // Configuraciones de Mensajes
    sendGreetingMessageOneQueues: 'enabled',
    sendSignMessage: 'enabled',
    sendFarewellWaitingTicket: 'enabled',
    sendGreetingAccepted: 'enabled',
    sendMsgTransfTicket: 'enabled',
    sendQueuePosition: 'enabled',

    // Mensajes personalizados
    greetingAcceptedMessage: '¡Hola! Tu ticket ha sido aceptado y te atenderemos pronto.',
    transferMessage: 'Tu ticket ha sido transferido a otro departamento.',
    sendQueuePositionMessage: 'Estás en la posición {{position}} de la cola.',

    // Configuraciones de Usuario
    userRandom: 'enabled',
    userRating: 'enabled',

    // Configuraciones de Horarios
    scheduleType: '1',

    // LGPD / Privacidad
    enableLGPD: 'disabled',
    lgpdConsent: 'disabled',
    lgpdDeleteMessage: 'enabled',
    lgpdHideNumber: 'disabled',
    lgpdMessage: 'Sus datos serán tratados de acuerdo con nuestra política de privacidad.',
    lgpdLink: 'https://example.com/privacy',

    // Tags
    requiredTag: 'disabled',

    // Notificaciones
    showNotificationPending: false,

    // Payment Configuration (SuperAdmin only)
    paypalClientId: '',
    paypalSecretKey: '',
    stripePublicKey: '',
    stripeSecretKey: '',

    // Facebook/Instagram App Credentials (para OAuth login)
    facebookAppId: '',
    facebookAppSecret: '',
    instagramAppId: '',
    instagramAppSecret: '',

    // Facebook Ads Account Configuration
    facebookAdAccountId: '',
    facebookBusinessId: '',
    facebookSystemUserToken: '',

    // Google Calendar OAuth Credentials
    googleClientId: '',
    googleClientSecret: '',

    // TikTok Credentials
    tiktokClientKey: '',
    tiktokClientSecret: '',
    tiktokBusinessAppId: '',
    tiktokBusinessSecret: '',

    // Theme Colors
    themePrimaryLight: '#5BC2D2',
    themePrimaryDark: '#6FD4E4',
    themeSecondaryLight: '#4caf50',
    themeSecondaryDark: '#4caf50',

    // Alertas WhatsApp nuevas empresas
    newCompanyAlertEnabled: 'disabled',
    newCompanyAlertPhone: '',
    newCompanyAlertWhatsappId: '',

    // WhatsApp Cloud API / Coexistencia Meta (solo superadmin)
    cloudAPIEnabled: false,
  })

  useEffect(() => {
    // Solo cargar settings si el auth ya terminó de cargar y tenemos un usuario
    if (!authLoading && user?.companyId) {
      fetchSettings()
    }
  }, [authLoading, user])

  const fetchSettings = async () => {
    try {
      setLoading(true)

      // Debug: verificar qué tiene el usuario
      console.log('Settings: User object:', user)
      console.log('Settings: CompanyId:', user?.companyId)

      if (!user?.companyId) {
        console.error('Settings: No companyId found in user object')

        // Intentar refrescar los datos del usuario
        try {
          console.log('Settings: Attempting to refresh user data...')
          const userData = await authService.getCurrentUser()
          console.log('Settings: Refreshed user data:', userData)

          if (userData?.companyId) {
            // Aquí necesitaríamos actualizar el estado del usuario
            // Por ahora, mostrar mensaje de recarga
            toast.error('Sesión expirada. Recarga la página para continuar.')
            return
          } else {
            toast.error('Usuario no tiene compañía asignada. Contacta al administrador.')
            return
          }
        } catch (refreshError) {
          console.error('Settings: Error refreshing user data:', refreshError)
          toast.error('Error de autenticación. Inicia sesión nuevamente.')
          return
        }
      }

      const response = await api.get(`/companySettings/${user.companyId}`)

      if (response.data) {
        // Mapear los datos del backend al estado local
        setSettings(prev => ({
          ...prev,
          ...response.data
        }))
      }

      // Solo para superadmin: cargar también los payment keys desde company
      if (isSuperAdmin) {
        try {
          const companyResponse = await api.get(`/companies/${user.companyId}`)
          if (companyResponse.data) {
            setSettings(prev => ({
              ...prev,
              paypalClientId: companyResponse.data.paypalClientId || '',
              paypalSecretKey: companyResponse.data.paypalSecretKey || '',
              stripePublicKey: companyResponse.data.stripePublicKey || '',
              stripeSecretKey: companyResponse.data.stripeSecretKey || '',
            }))
          }
        } catch (companyError) {
          console.error('Error fetching company payment keys:', companyError)
        }

        // Cargar conexiones WhatsApp disponibles para alertas
        try {
          const whatsappResponse = await api.get('/whatsapp/all?session=0')
          setWhatsappConnections(whatsappResponse.data || [])
        } catch (whatsappError) {
          console.error('Error fetching whatsapp connections:', whatsappError)
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
      toast.error('Error al cargar configuración')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)

      // Separar payment keys de otros settings
      const paymentKeys = {
        paypalClientId: settings.paypalClientId,
        paypalSecretKey: settings.paypalSecretKey,
        stripePublicKey: settings.stripePublicKey,
        stripeSecretKey: settings.stripeSecretKey,
      }

      // Skip empty secret fields to avoid overwriting stored values
      const secretFields = ['googleClientSecret', 'facebookAppSecret', 'instagramAppSecret', 'facebookSystemUserToken', 'tiktokClientSecret', 'tiktokBusinessSecret']
      const otherSettings = Object.entries(settings).filter(
        ([key, val]) =>
          !['paypalClientId', 'paypalSecretKey', 'stripePublicKey', 'stripeSecretKey'].includes(key) &&
          !(secretFields.includes(key) && val === '')
      )

      // Guardar cada configuración (excluyendo payment keys)
      for (const [column, data] of otherSettings) {
        await api.put('/companySettings/', {
          column,
          data: String(data)
        })
      }

      // Solo para superadmin: guardar payment keys en company
      if (isSuperAdmin) {
        await api.put(`/companies/${user?.companyId}`, paymentKeys)
      }

      // Aplicar colores del tema inmediatamente
      setColors({
        primaryLight: settings.themePrimaryLight,
        primaryDark: settings.themePrimaryDark,
        secondaryLight: settings.themeSecondaryLight,
        secondaryDark: settings.themeSecondaryDark,
      })

      toast.success('Configuración guardada exitosamente')
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error('Error al guardar configuración')
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  if (authLoading || loading) {
    return (
      <Container maxWidth="xl">
        <Typography>Cargando configuración...</Typography>
      </Container>
    )
  }

  if (!user?.companyId) {
    return (
      <Container maxWidth="xl">
        <Typography color="danger">Error: No se encontró información de la compañía. Por favor, inicia sesión nuevamente.</Typography>
      </Container>
    )
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <SettingsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Configuración Avanzada</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Configuración completa del sistema
              </Typography>
            </Box>
          </Stack>
          <Button
            startDecorator={<SaveIcon />}
            color="primary"
            onClick={handleSave}
            loading={saving}
          >
            Guardar Cambios
          </Button>
        </Stack>

        <Card>
          <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value as number)}>
            <TabList>
              <Tab>
                <TimerIcon sx={{ mr: 1 }} />
                Tickets
              </Tab>
              <Tab>
                <WhatsAppIcon sx={{ mr: 1 }} />
                WhatsApp
              </Tab>
              <Tab>
                <MessageIcon sx={{ mr: 1 }} />
                Mensajes
              </Tab>
              <Tab>
                <ShieldIcon sx={{ mr: 1 }} />
                LGPD/Privacidad
              </Tab>
              <Tab>
                <UserIcon sx={{ mr: 1 }} />
                Usuarios
              </Tab>
              <Tab>
                <SettingsIcon sx={{ mr: 1 }} />
                General
              </Tab>
              <Tab>
                <PaletteIcon sx={{ mr: 1 }} />
                Tema
              </Tab>
              <Tab>
                <CampaignIcon sx={{ mr: 1 }} />
                Facebook Ads
              </Tab>
              <Tab>
                <MusicNoteIcon sx={{ mr: 1 }} />
                TikTok
              </Tab>
              {isSuperAdmin && (
                <Tab>
                  <PaymentIcon sx={{ mr: 1 }} />
                  Pagos
                </Tab>
              )}
            </TabList>

            {/* TAB 1: Configuración de Tickets */}
            <TabPanel value={0}>
              <Stack spacing={3}>
                <Typography level="h4">Configuración de Tickets</Typography>
                <Divider />

                <FormControl>
                  <FormLabel>Horas para Cerrar Tickets Automáticamente</FormLabel>
                  <Input
                    type="number"
                    value={settings.hoursCloseTicketsAuto}
                    onChange={(e) => updateSetting('hoursCloseTicketsAuto', e.target.value)}
                  />
                  <FormHelperText>
                    Tiempo en horas después del cual los tickets resueltos se cerrarán automáticamente
                  </FormHelperText>
                </FormControl>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Tickets Directos a Billeteras
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Los tickets se asignan directamente a las billeteras de usuarios
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.DirectTicketsToWallets}
                    onChange={(e) => updateSetting('DirectTicketsToWallets', e.target.checked)}
                  />
                </Box>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Cerrar Ticket al Transferir
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Cierra automáticamente el ticket cuando se transfiere a otro usuario
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.closeTicketOnTransfer}
                    onChange={(e) => updateSetting('closeTicketOnTransfer', e.target.checked)}
                  />
                </Box>

                <FormControl>
                  <FormLabel>Tipo de Chatbot</FormLabel>
                  <Select
                    value={settings.chatBotType}
                    onChange={(_, value) => updateSetting('chatBotType', value)}
                  >
                    <Option value="text">Texto</Option>
                    <Option value="button">Botones</Option>
                    <Option value="list">Lista</Option>
                  </Select>
                  <FormHelperText>Tipo de interfaz para el chatbot automatizado</FormHelperText>
                </FormControl>

                <FormControl>
                  <FormLabel>Tipo de Programación</FormLabel>
                  <Select
                    value={settings.scheduleType}
                    onChange={(_, value) => updateSetting('scheduleType', value)}
                  >
                    <Option value="1">Por Empresa</Option>
                    <Option value="2">Por Conexión</Option>
                  </Select>
                  <FormHelperText>Define cómo se manejan los horarios de atención</FormHelperText>
                </FormControl>
              </Stack>
            </TabPanel>

            {/* TAB 2: WhatsApp */}
            <TabPanel value={1}>
              <Stack spacing={3}>
                <Typography level="h4">Configuración de WhatsApp</Typography>
                <Divider />

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Aceptar Llamadas de WhatsApp
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Permitir que los clientes realicen llamadas por WhatsApp
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.acceptCallWhatsapp === 'enabled'}
                    onChange={(e) =>
                      updateSetting('acceptCallWhatsapp', e.target.checked ? 'enabled' : 'disabled')
                    }
                  />
                </Box>

                <FormControl>
                  <FormLabel>Mensaje al Rechazar Llamadas</FormLabel>
                  <Textarea
                    minRows={2}
                    value={settings.AcceptCallWhatsappMessage}
                    onChange={(e) => updateSetting('AcceptCallWhatsappMessage', e.target.value)}
                    disabled={settings.acceptCallWhatsapp === 'enabled'}
                  />
                  <FormHelperText>
                    Mensaje enviado cuando se rechaza una llamada de WhatsApp
                  </FormHelperText>
                </FormControl>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Aceptar Mensajes de Audio
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Permitir que los contactos envíen mensajes de voz
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.acceptAudioMessageContact === 'enabled'}
                    onChange={(e) =>
                      updateSetting(
                        'acceptAudioMessageContact',
                        e.target.checked ? 'enabled' : 'disabled'
                      )
                    }
                  />
                </Box>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Verificar Mensajes de Grupos
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Verificar si los mensajes provienen de grupos de WhatsApp
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.CheckMsgIsGroup === 'enabled'}
                    onChange={(e) =>
                      updateSetting('CheckMsgIsGroup', e.target.checked ? 'enabled' : 'disabled')
                    }
                  />
                </Box>
              </Stack>
            </TabPanel>

            {/* TAB 3: Mensajes */}
            <TabPanel value={2}>
              <Stack spacing={3}>
                <Typography level="h4">Configuración de Mensajes</Typography>
                <Divider />

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Enviar Mensaje de Bienvenida por Cola
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Mensaje automático cuando el cliente elige una cola
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.sendGreetingMessageOneQueues === 'enabled'}
                    onChange={(e) =>
                      updateSetting(
                        'sendGreetingMessageOneQueues',
                        e.target.checked ? 'enabled' : 'disabled'
                      )
                    }
                  />
                </Box>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Enviar Mensaje de Firma
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Agregar firma automática a los mensajes enviados
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.sendSignMessage === 'enabled'}
                    onChange={(e) =>
                      updateSetting('sendSignMessage', e.target.checked ? 'enabled' : 'disabled')
                    }
                  />
                </Box>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Enviar Despedida en Ticket en Espera
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Mensaje cuando el ticket pasa a estado de espera
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.sendFarewellWaitingTicket === 'enabled'}
                    onChange={(e) =>
                      updateSetting(
                        'sendFarewellWaitingTicket',
                        e.target.checked ? 'enabled' : 'disabled'
                      )
                    }
                  />
                </Box>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Enviar Saludo al Aceptar Ticket
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Mensaje automático cuando un agente acepta un ticket
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.sendGreetingAccepted === 'enabled'}
                    onChange={(e) =>
                      updateSetting(
                        'sendGreetingAccepted',
                        e.target.checked ? 'enabled' : 'disabled'
                      )
                    }
                  />
                </Box>

                <FormControl>
                  <FormLabel>Mensaje al Aceptar Ticket</FormLabel>
                  <Textarea
                    minRows={2}
                    value={settings.greetingAcceptedMessage}
                    onChange={(e) => updateSetting('greetingAcceptedMessage', e.target.value)}
                    disabled={settings.sendGreetingAccepted === 'disabled'}
                  />
                </FormControl>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Enviar Mensaje al Transferir Ticket
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Notificar al cliente cuando su ticket es transferido
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.sendMsgTransfTicket === 'enabled'}
                    onChange={(e) =>
                      updateSetting(
                        'sendMsgTransfTicket',
                        e.target.checked ? 'enabled' : 'disabled'
                      )
                    }
                  />
                </Box>

                <FormControl>
                  <FormLabel>Mensaje de Transferencia</FormLabel>
                  <Textarea
                    minRows={2}
                    value={settings.transferMessage}
                    onChange={(e) => updateSetting('transferMessage', e.target.value)}
                    disabled={settings.sendMsgTransfTicket === 'disabled'}
                  />
                </FormControl>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Enviar Posición en Cola
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Informar al cliente su posición en la cola de espera
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.sendQueuePosition === 'enabled'}
                    onChange={(e) =>
                      updateSetting('sendQueuePosition', e.target.checked ? 'enabled' : 'disabled')
                    }
                  />
                </Box>

                <FormControl>
                  <FormLabel>Mensaje de Posición en Cola</FormLabel>
                  <Textarea
                    minRows={2}
                    value={settings.sendQueuePositionMessage}
                    onChange={(e) => updateSetting('sendQueuePositionMessage', e.target.value)}
                    disabled={settings.sendQueuePosition === 'disabled'}
                  />
                  <FormHelperText>
                    Variables disponibles: {'{{position}}'} para la posición en cola
                  </FormHelperText>
                </FormControl>
              </Stack>
            </TabPanel>

            {/* TAB 4: LGPD/Privacidad */}
            <TabPanel value={3}>
              <Stack spacing={3}>
                <Typography level="h4">LGPD y Privacidad de Datos</Typography>
                <Divider />

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Habilitar LGPD
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Activar funciones de protección de datos personales
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.enableLGPD === 'enabled'}
                    onChange={(e) =>
                      updateSetting('enableLGPD', e.target.checked ? 'enabled' : 'disabled')
                    }
                  />
                </Box>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Solicitar Consentimiento
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Pedir autorización explícita antes de procesar datos
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.lgpdConsent === 'enabled'}
                    onChange={(e) =>
                      updateSetting('lgpdConsent', e.target.checked ? 'enabled' : 'disabled')
                    }
                    disabled={settings.enableLGPD === 'disabled'}
                  />
                </Box>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Eliminar Mensajes LGPD
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Permitir eliminación de mensajes por solicitud del usuario
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.lgpdDeleteMessage === 'enabled'}
                    onChange={(e) =>
                      updateSetting('lgpdDeleteMessage', e.target.checked ? 'enabled' : 'disabled')
                    }
                    disabled={settings.enableLGPD === 'disabled'}
                  />
                </Box>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Ocultar Números de Teléfono
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Enmascarar parcialmente los números de teléfono
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.lgpdHideNumber === 'enabled'}
                    onChange={(e) =>
                      updateSetting('lgpdHideNumber', e.target.checked ? 'enabled' : 'disabled')
                    }
                    disabled={settings.enableLGPD === 'disabled'}
                  />
                </Box>

                <FormControl>
                  <FormLabel>Mensaje LGPD</FormLabel>
                  <Textarea
                    minRows={3}
                    value={settings.lgpdMessage}
                    onChange={(e) => updateSetting('lgpdMessage', e.target.value)}
                    disabled={settings.enableLGPD === 'disabled'}
                  />
                  <FormHelperText>
                    Mensaje informativo sobre el tratamiento de datos personales
                  </FormHelperText>
                </FormControl>

                <FormControl>
                  <FormLabel>Link de Política de Privacidad</FormLabel>
                  <Input
                    type="url"
                    value={settings.lgpdLink}
                    onChange={(e) => updateSetting('lgpdLink', e.target.value)}
                    disabled={settings.enableLGPD === 'disabled'}
                  />
                  <FormHelperText>URL completa de su política de privacidad</FormHelperText>
                </FormControl>
              </Stack>
            </TabPanel>

            {/* TAB 5: Usuarios */}
            <TabPanel value={4}>
              <Stack spacing={3}>
                <Typography level="h4">Configuración de Usuarios</Typography>
                <Divider />

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Asignación Aleatoria de Usuarios
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Distribuir tickets aleatoriamente entre usuarios disponibles
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.userRandom === 'enabled'}
                    onChange={(e) =>
                      updateSetting('userRandom', e.target.checked ? 'enabled' : 'disabled')
                    }
                  />
                </Box>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Calificación de Usuarios
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Permitir que los clientes califiquen la atención recibida
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.userRating === 'enabled'}
                    onChange={(e) =>
                      updateSetting('userRating', e.target.checked ? 'enabled' : 'disabled')
                    }
                  />
                </Box>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Mostrar Notificaciones Pendientes
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Notificar a los usuarios sobre tickets pendientes
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.showNotificationPending}
                    onChange={(e) => updateSetting('showNotificationPending', e.target.checked)}
                  />
                </Box>
              </Stack>
            </TabPanel>

            {/* TAB 6: General */}
            <TabPanel value={5}>
              <Stack spacing={3}>
                <Typography level="h4">Configuracion General</Typography>
                <Divider />

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography level="body-sm" fontWeight="bold">
                      Etiqueta Requerida
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Obligar a asignar etiquetas a los tickets
                    </Typography>
                  </Box>
                  <Switch
                    checked={settings.requiredTag === 'enabled'}
                    onChange={(e) =>
                      updateSetting('requiredTag', e.target.checked ? 'enabled' : 'disabled')
                    }
                  />
                </Box>

                <Divider />

                {/* Google Calendar Integration */}
                <Box>
                  <Typography level="title-lg" sx={{ mb: 1 }}>
                    Google Calendar
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 2 }}>
                    Credenciales OAuth para sincronizar citas con Google Calendar.
                    Cada empresa configura sus propias credenciales.
                  </Typography>
                  <Stack spacing={2}>
                    <FormControl>
                      <FormLabel>Google Client ID</FormLabel>
                      <Input
                        type="text"
                        value={settings.googleClientId}
                        onChange={(e) => updateSetting('googleClientId', e.target.value)}
                        placeholder="xxxxx.apps.googleusercontent.com"
                      />
                      <FormHelperText>
                        Client ID de tu proyecto en Google Cloud Console
                      </FormHelperText>
                    </FormControl>

                    <FormControl>
                      <FormLabel>Google Client Secret</FormLabel>
                      <Input
                        type="password"
                        value={settings.googleClientSecret}
                        onChange={(e) => updateSetting('googleClientSecret', e.target.value)}
                        placeholder="GOCSPX-xxxxx"
                      />
                      <FormHelperText>
                        Client Secret de tu proyecto en Google Cloud Console
                      </FormHelperText>
                    </FormControl>
                  </Stack>
                </Box>

                <Box sx={{ p: 2, bgcolor: 'background.level1', borderRadius: 'sm' }}>
                  <Typography level="title-sm" sx={{ mb: 1 }}>
                    Como obtener las credenciales de Google:
                  </Typography>
                  <Typography level="body-xs" component="div" sx={{ pl: 2 }}>
                    <ol style={{ margin: 0, paddingLeft: '1rem' }}>
                      <li>Ve a <strong>console.cloud.google.com</strong></li>
                      <li>Crea un proyecto nuevo o selecciona uno existente</li>
                      <li>En <strong>APIs & Services - Library</strong>, habilita <strong>Google Calendar API</strong></li>
                      <li>En <strong>APIs & Services - Credentials</strong>, crea un <strong>OAuth client ID</strong> (tipo Web application)</li>
                      <li>Configura el <strong>Authorized redirect URI</strong> con la URL de tu servidor + <code>/api/appointments/calendar/google/callback</code></li>
                      <li>Copia el <strong>Client ID</strong> y <strong>Client Secret</strong> y pegalos aqui</li>
                    </ol>
                  </Typography>
                </Box>

                {/* Alertas WhatsApp - Nuevas Empresas (Solo SuperAdmin) */}
                {isSuperAdmin && (
                  <>
                    <Divider />
                    <Box>
                      <Typography level="title-lg" sx={{ mb: 1 }}>
                        <NotificationsIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                        Alertas WhatsApp — Nuevas Empresas
                      </Typography>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 2 }}>
                        Enviar notificación por WhatsApp cada vez que se registre una nueva empresa.
                      </Typography>

                      <Stack spacing={2}>
                        {/* Switch habilitar/deshabilitar */}
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Box>
                            <Typography level="body-sm" fontWeight="bold">
                              Activar alertas
                            </Typography>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              Enviar mensaje WhatsApp con datos de la empresa creada
                            </Typography>
                          </Box>
                          <Switch
                            checked={settings.newCompanyAlertEnabled === 'enabled'}
                            onChange={(e) =>
                              updateSetting('newCompanyAlertEnabled', e.target.checked ? 'enabled' : 'disabled')
                            }
                          />
                        </Box>

                        {/* Campos solo visibles si la alerta está habilitada */}
                        {settings.newCompanyAlertEnabled === 'enabled' && (
                          <>
                            {/* Select de conexión WhatsApp */}
                            <FormControl>
                              <FormLabel>Conexión WhatsApp para enviar alertas</FormLabel>
                              <Select
                                value={settings.newCompanyAlertWhatsappId ? String(settings.newCompanyAlertWhatsappId) : ''}
                                onChange={(_e, value) => updateSetting('newCompanyAlertWhatsappId', value || '')}
                                placeholder="Selecciona una conexión..."
                              >
                                {whatsappConnections
                                  .filter((w) => w.status === 'CONNECTED')
                                  .map((w) => (
                                    <Option key={w.id} value={String(w.id)}>
                                      {w.name} {w.number ? `(${w.number})` : ''} — {w.channel || 'whatsapp'}
                                      {w.Company ? ` [${w.Company.name}]` : ''}
                                    </Option>
                                  ))}
                              </Select>
                              <FormHelperText>
                                Solo se muestran conexiones con estado CONNECTED
                              </FormHelperText>
                            </FormControl>

                            {/* Lista dinámica de números destino */}
                            <FormControl>
                              <FormLabel>Números de teléfono destino</FormLabel>
                              <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 1 }}>
                                Agrega los números que recibirán la alerta (con código de país, ej: 521234567890)
                              </Typography>

                              {/* Números actuales */}
                              {settings.newCompanyAlertPhone && settings.newCompanyAlertPhone.split(',').filter(Boolean).length > 0 && (
                                <List size="sm" sx={{ mb: 1 }}>
                                  {settings.newCompanyAlertPhone.split(',').filter(Boolean).map((phone: string, idx: number) => (
                                    <ListItem
                                      key={idx}
                                      endAction={
                                        <IconButton
                                          size="sm"
                                          color="danger"
                                          variant="plain"
                                          onClick={() => {
                                            const phones = settings.newCompanyAlertPhone
                                              .split(',')
                                              .filter(Boolean)
                                              .filter((_: string, i: number) => i !== idx)
                                            updateSetting('newCompanyAlertPhone', phones.join(','))
                                          }}
                                        >
                                          <DeleteIcon fontSize="small" />
                                        </IconButton>
                                      }
                                    >
                                      <ListItemDecorator>
                                        <PhoneIcon fontSize="small" />
                                      </ListItemDecorator>
                                      <ListItemContent>
                                        <Typography level="body-sm">{phone.trim()}</Typography>
                                      </ListItemContent>
                                    </ListItem>
                                  ))}
                                </List>
                              )}

                              {/* Input para agregar nuevo número */}
                              <Stack direction="row" spacing={1}>
                                <Input
                                  type="tel"
                                  value={newAlertPhone}
                                  onChange={(e) => setNewAlertPhone(e.target.value.replace(/[^0-9+]/g, ''))}
                                  placeholder="521234567890"
                                  sx={{ flex: 1 }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newAlertPhone.trim()) {
                                      e.preventDefault()
                                      const current = settings.newCompanyAlertPhone
                                        ? settings.newCompanyAlertPhone.split(',').filter(Boolean)
                                        : []
                                      if (!current.includes(newAlertPhone.trim())) {
                                        updateSetting('newCompanyAlertPhone', [...current, newAlertPhone.trim()].join(','))
                                      }
                                      setNewAlertPhone('')
                                    }
                                  }}
                                />
                                <Button
                                  size="sm"
                                  variant="outlined"
                                  startDecorator={<AddIcon />}
                                  disabled={!newAlertPhone.trim()}
                                  onClick={() => {
                                    const current = settings.newCompanyAlertPhone
                                      ? settings.newCompanyAlertPhone.split(',').filter(Boolean)
                                      : []
                                    if (!current.includes(newAlertPhone.trim())) {
                                      updateSetting('newCompanyAlertPhone', [...current, newAlertPhone.trim()].join(','))
                                    }
                                    setNewAlertPhone('')
                                  }}
                                >
                                  Agregar
                                </Button>
                              </Stack>
                            </FormControl>
                          </>
                        )}
                      </Stack>
                    </Box>

                    <Divider />

                    {/* WhatsApp Cloud API / Coexistencia Meta */}
                    <Box>
                      <Typography level="title-lg" sx={{ mb: 1 }}>
                        <CloudIcon sx={{ mr: 1, verticalAlign: 'middle', color: '#1877f2' }} />
                        WhatsApp Cloud API (Coexistencia Meta)
                      </Typography>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 2 }}>
                        Habilita la conexion de numeros WhatsApp via Meta Cloud API.
                        Permite coexistencia: el mismo numero funciona en la API Cloud y en la WhatsApp Business App simultaneamente.
                      </Typography>

                      <Stack spacing={2}>
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Box>
                            <Typography level="body-sm" fontWeight="bold">
                              Activar Cloud API
                            </Typography>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              Permite crear conexiones Meta via Embedded Signup en el panel de Coexistencia
                            </Typography>
                          </Box>
                          <Switch
                            checked={settings.cloudAPIEnabled === true || settings.cloudAPIEnabled === 'true' as any}
                            onChange={(e) =>
                              updateSetting('cloudAPIEnabled', e.target.checked)
                            }
                            sx={{
                              '--Switch-trackWidth': '48px',
                              '--Switch-trackHeight': '24px',
                            }}
                          />
                        </Box>

                        {(settings.cloudAPIEnabled === true || settings.cloudAPIEnabled === 'true' as any) && (
                          <Box sx={{ p: 2, bgcolor: 'background.level1', borderRadius: 'sm' }}>
                            <Typography level="title-sm" sx={{ mb: 1 }}>
                              Requisitos para Cloud API:
                            </Typography>
                            <Typography level="body-xs" component="div" sx={{ pl: 2 }}>
                              <ol style={{ margin: 0, paddingLeft: '1rem' }}>
                                <li>Configura <strong>Facebook App ID</strong> y <strong>App Secret</strong> en la pestana Facebook Ads</li>
                                <li>Tu App de Meta debe tener el producto <strong>WhatsApp</strong> agregado</li>
                                <li>Ejecuta el <strong>Setup automatico</strong> desde el Dashboard de Coexistencia</li>
                                <li>Conecta tu numero via <strong>Embedded Signup</strong> en Canales → Coexistencia Meta</li>
                              </ol>
                            </Typography>
                          </Box>
                        )}
                      </Stack>
                    </Box>
                  </>
                )}
              </Stack>
            </TabPanel>

            {/* TAB 7: Personalizacion del Tema */}
            <TabPanel value={6}>
              <Stack spacing={3}>
                <Typography level="h4">Personalizacion del Tema</Typography>
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Configura los colores de la plataforma para tu empresa. Los cambios se aplican al guardar.
                </Typography>
                <Divider />

                {/* Colores Primarios */}
                <Box>
                  <Typography level="title-lg" sx={{ mb: 2 }}>Colores Primarios</Typography>
                  <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                    <FormControl sx={{ flex: 1, minWidth: 200 }}>
                      <FormLabel>Color Primario - Modo Claro</FormLabel>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: '8px',
                            bgcolor: settings.themePrimaryLight,
                            border: '2px solid',
                            borderColor: 'divider',
                            flexShrink: 0,
                          }}
                        />
                        <Input
                          type="color"
                          value={settings.themePrimaryLight}
                          onChange={(e) => updateSetting('themePrimaryLight', e.target.value)}
                          sx={{ flex: 1 }}
                        />
                      </Stack>
                      <FormHelperText>{settings.themePrimaryLight}</FormHelperText>
                    </FormControl>

                    <FormControl sx={{ flex: 1, minWidth: 200 }}>
                      <FormLabel>Color Primario - Modo Oscuro</FormLabel>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: '8px',
                            bgcolor: settings.themePrimaryDark,
                            border: '2px solid',
                            borderColor: 'divider',
                            flexShrink: 0,
                          }}
                        />
                        <Input
                          type="color"
                          value={settings.themePrimaryDark}
                          onChange={(e) => updateSetting('themePrimaryDark', e.target.value)}
                          sx={{ flex: 1 }}
                        />
                      </Stack>
                      <FormHelperText>{settings.themePrimaryDark}</FormHelperText>
                    </FormControl>
                  </Stack>
                </Box>

                {/* Colores Secundarios */}
                <Box>
                  <Typography level="title-lg" sx={{ mb: 2 }}>Colores Secundarios</Typography>
                  <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                    <FormControl sx={{ flex: 1, minWidth: 200 }}>
                      <FormLabel>Acento - Modo Claro</FormLabel>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: '8px',
                            bgcolor: settings.themeSecondaryLight,
                            border: '2px solid',
                            borderColor: 'divider',
                            flexShrink: 0,
                          }}
                        />
                        <Input
                          type="color"
                          value={settings.themeSecondaryLight}
                          onChange={(e) => updateSetting('themeSecondaryLight', e.target.value)}
                          sx={{ flex: 1 }}
                        />
                      </Stack>
                      <FormHelperText>{settings.themeSecondaryLight}</FormHelperText>
                    </FormControl>

                    <FormControl sx={{ flex: 1, minWidth: 200 }}>
                      <FormLabel>Acento - Modo Oscuro</FormLabel>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: '8px',
                            bgcolor: settings.themeSecondaryDark,
                            border: '2px solid',
                            borderColor: 'divider',
                            flexShrink: 0,
                          }}
                        />
                        <Input
                          type="color"
                          value={settings.themeSecondaryDark}
                          onChange={(e) => updateSetting('themeSecondaryDark', e.target.value)}
                          sx={{ flex: 1 }}
                        />
                      </Stack>
                      <FormHelperText>{settings.themeSecondaryDark}</FormHelperText>
                    </FormControl>
                  </Stack>
                </Box>

                <Divider />

                {/* Restaurar predeterminados */}
                <Button
                  variant="outlined"
                  color="neutral"
                  startDecorator={<RestartAltIcon />}
                  onClick={() => {
                    updateSetting('themePrimaryLight', '#5BC2D2')
                    updateSetting('themePrimaryDark', '#6FD4E4')
                    updateSetting('themeSecondaryLight', '#4caf50')
                    updateSetting('themeSecondaryDark', '#4caf50')
                  }}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Restaurar Colores Predeterminados
                </Button>

                <Divider />

                {/* Vista Previa */}
                <Typography level="title-lg">Vista Previa</Typography>
                <Card variant="outlined" sx={{ p: 3 }}>
                  <Stack spacing={2.5}>
                    {/* Botones */}
                    <Box>
                      <Typography level="body-xs" sx={{ mb: 1, color: 'text.tertiary', textTransform: 'uppercase', letterSpacing: 1 }}>Botones</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Button
                          sx={{
                            bgcolor: settings.themePrimaryLight,
                            color: '#fff',
                            '&:hover': { bgcolor: settings.themePrimaryLight, filter: 'brightness(0.9)', transform: 'none', boxShadow: 'none' },
                          }}
                        >
                          Boton Primario
                        </Button>
                        <Button
                          variant="outlined"
                          sx={{
                            borderColor: settings.themePrimaryLight,
                            color: settings.themePrimaryLight,
                            '&:hover': { bgcolor: settings.themePrimaryLight + '10', transform: 'none', boxShadow: 'none' },
                          }}
                        >
                          Boton Outlined
                        </Button>
                        <Button
                          variant="soft"
                          sx={{
                            bgcolor: settings.themePrimaryLight + '20',
                            color: settings.themePrimaryLight,
                            '&:hover': { bgcolor: settings.themePrimaryLight + '30', transform: 'none', boxShadow: 'none' },
                          }}
                        >
                          Boton Soft
                        </Button>
                      </Stack>
                    </Box>

                    {/* Chips */}
                    <Box>
                      <Typography level="body-xs" sx={{ mb: 1, color: 'text.tertiary', textTransform: 'uppercase', letterSpacing: 1 }}>Chips</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip sx={{ bgcolor: settings.themePrimaryLight, color: '#fff' }}>Primario</Chip>
                        <Chip sx={{ bgcolor: settings.themeSecondaryLight, color: '#fff' }}>Secundario</Chip>
                        <Chip variant="outlined" sx={{ borderColor: settings.themePrimaryLight, color: settings.themePrimaryLight }}>Outlined</Chip>
                        <Chip variant="soft" sx={{ bgcolor: settings.themePrimaryLight + '20', color: settings.themePrimaryLight }}>Soft</Chip>
                      </Stack>
                    </Box>

                    {/* Avatar + Sidebar selected */}
                    <Box>
                      <Typography level="body-xs" sx={{ mb: 1, color: 'text.tertiary', textTransform: 'uppercase', letterSpacing: 1 }}>Elementos</Typography>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Avatar sx={{ bgcolor: settings.themePrimaryLight, color: '#fff', fontWeight: 700 }}>JR</Avatar>
                        <Box sx={{
                          px: 2, py: 1,
                          borderRadius: '6px',
                          bgcolor: settings.themePrimaryLight,
                          color: '#fff',
                          fontWeight: 600,
                          fontSize: '14px',
                        }}>
                          Sidebar Seleccionado
                        </Box>
                        <Box sx={{
                          px: 2, py: 1,
                          borderRadius: '18px',
                          bgcolor: settings.themePrimaryLight,
                          color: '#fff',
                          fontSize: '14px',
                        }}>
                          Burbuja de mensaje
                        </Box>
                      </Stack>
                    </Box>

                    {/* Area resaltada */}
                    <Box sx={{
                      p: 2,
                      borderRadius: '8px',
                      bgcolor: settings.themePrimaryLight + '12',
                      border: `1px solid ${settings.themePrimaryLight}40`,
                    }}>
                      <Typography level="body-sm" sx={{ color: settings.themePrimaryLight }}>
                        Area resaltada con el color primario seleccionado
                      </Typography>
                    </Box>

                    {/* Dark mode preview */}
                    <Box sx={{
                      p: 2,
                      borderRadius: '8px',
                      bgcolor: '#18191A',
                    }}>
                      <Typography level="body-xs" sx={{ mb: 1, color: '#8A8D91', textTransform: 'uppercase', letterSpacing: 1 }}>Modo Oscuro</Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Avatar sx={{ bgcolor: settings.themePrimaryDark, color: '#fff', fontWeight: 700, width: 36, height: 36 }}>JR</Avatar>
                        <Box sx={{
                          px: 2, py: 1,
                          borderRadius: '18px',
                          bgcolor: settings.themePrimaryDark,
                          color: '#fff',
                          fontSize: '14px',
                        }}>
                          Burbuja modo oscuro
                        </Box>
                        <Chip sx={{ bgcolor: settings.themePrimaryDark, color: '#fff' }}>Chip Dark</Chip>
                      </Stack>
                    </Box>
                  </Stack>
                </Card>
              </Stack>
            </TabPanel>

            {/* TAB 8: Facebook Ads Account Configuration */}
            <TabPanel value={7}>
              <Stack spacing={3}>
                <Typography level="h4">Configuracion de Facebook/Instagram</Typography>
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Configura las credenciales de tu aplicacion de Facebook para habilitar el login OAuth
                  en conexiones de Facebook e Instagram.
                </Typography>
                <Divider />

                {/* Seccion: Credenciales de la App (OAuth) */}
                <Box>
                  <Typography level="title-lg" sx={{ mb: 2 }}>
                    Credenciales de la App de Facebook
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 2 }}>
                    Estas credenciales son necesarias para el login OAuth de Facebook e Instagram.
                    Obtenlas desde developers.facebook.com en tu aplicacion.
                  </Typography>
                  <Stack spacing={2}>
                    <FormControl>
                      <FormLabel>Facebook App ID</FormLabel>
                      <Input
                        type="text"
                        value={settings.facebookAppId}
                        onChange={(e) => updateSetting('facebookAppId', e.target.value)}
                        placeholder="123456789012345"
                      />
                      <FormHelperText>
                        ID de tu aplicacion de Facebook (developers.facebook.com)
                      </FormHelperText>
                    </FormControl>

                    <FormControl>
                      <FormLabel>Facebook App Secret</FormLabel>
                      <Input
                        type="password"
                        value={settings.facebookAppSecret}
                        onChange={(e) => updateSetting('facebookAppSecret', e.target.value)}
                        placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      />
                      <FormHelperText>
                        Clave secreta de tu aplicacion de Facebook
                      </FormHelperText>
                    </FormControl>
                  </Stack>
                </Box>

                <Divider />

                {/* Seccion: Credenciales de Instagram (opcional) */}
                <Box>
                  <Typography level="title-lg" sx={{ mb: 2 }}>
                    Credenciales de Instagram (Opcional)
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 2 }}>
                    Si tienes una app separada para Instagram, configura sus credenciales aqui.
                    Si usas la misma app de Facebook, puedes dejar estos campos vacios.
                  </Typography>
                  <Stack spacing={2}>
                    <FormControl>
                      <FormLabel>Instagram App ID</FormLabel>
                      <Input
                        type="text"
                        value={settings.instagramAppId}
                        onChange={(e) => updateSetting('instagramAppId', e.target.value)}
                        placeholder="123456789012345"
                      />
                      <FormHelperText>
                        ID de tu aplicacion de Instagram (si es diferente a Facebook)
                      </FormHelperText>
                    </FormControl>

                    <FormControl>
                      <FormLabel>Instagram App Secret</FormLabel>
                      <Input
                        type="password"
                        value={settings.instagramAppSecret}
                        onChange={(e) => updateSetting('instagramAppSecret', e.target.value)}
                        placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      />
                      <FormHelperText>
                        Clave secreta de tu aplicacion de Instagram
                      </FormHelperText>
                    </FormControl>
                  </Stack>
                </Box>

                <Divider />

                {/* Seccion: Cuenta Publicitaria */}
                <Box>
                  <Typography level="title-lg" sx={{ mb: 2 }}>
                    Cuenta Publicitaria (Opcional)
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 2 }}>
                    Configura tu cuenta publicitaria para ver campanas y metricas.
                    Nota: Tambien puedes configurar esto desde Conexiones - Facebook - Credenciales.
                  </Typography>
                  <Stack spacing={2}>
                    <FormControl>
                      <FormLabel>Ad Account ID</FormLabel>
                      <Input
                        type="text"
                        value={settings.facebookAdAccountId}
                        onChange={(e) => updateSetting('facebookAdAccountId', e.target.value)}
                        placeholder="123456789"
                      />
                      <FormHelperText>
                        ID de la cuenta publicitaria (sin el prefijo act_)
                      </FormHelperText>
                    </FormControl>

                    <FormControl>
                      <FormLabel>Business Manager ID</FormLabel>
                      <Input
                        type="text"
                        value={settings.facebookBusinessId}
                        onChange={(e) => updateSetting('facebookBusinessId', e.target.value)}
                        placeholder="123456789"
                      />
                      <FormHelperText>
                        ID del Business Manager (opcional)
                      </FormHelperText>
                    </FormControl>

                    <FormControl>
                      <FormLabel>Access Token</FormLabel>
                      <Input
                        type="password"
                        value={settings.facebookSystemUserToken}
                        onChange={(e) => updateSetting('facebookSystemUserToken', e.target.value)}
                        placeholder="EAAxxxxxxx..."
                      />
                      <FormHelperText>
                        Token con permisos: ads_read, ads_management, read_insights
                      </FormHelperText>
                    </FormControl>
                  </Stack>
                </Box>

                <Box sx={{ mt: 2, p: 2, bgcolor: 'background.level1', borderRadius: 'sm' }}>
                  <Typography level="title-sm" sx={{ mb: 1 }}>
                    Como obtener las credenciales:
                  </Typography>
                  <Typography level="body-xs" component="div" sx={{ pl: 2 }}>
                    <ol style={{ margin: 0, paddingLeft: '1rem' }}>
                      <li>Ve a <strong>developers.facebook.com</strong></li>
                      <li>Selecciona tu aplicacion o crea una nueva</li>
                      <li>En Configuracion - Basica, copia el <strong>App ID</strong> y <strong>App Secret</strong></li>
                      <li>Asegurate de configurar los productos: Facebook Login, Instagram Basic Display</li>
                    </ol>
                  </Typography>
                </Box>
              </Stack>
            </TabPanel>

            {/* TAB 9: TikTok Credentials Configuration */}
            <TabPanel value={8}>
              <Stack spacing={3}>
                <Typography level="h4">Configuracion de TikTok</Typography>
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Configura las credenciales de TikTok para conectar cuentas y responder comentarios.
                  Cada empresa puede tener sus propias credenciales.
                </Typography>
                <Divider />

                {/* Seccion: Credenciales Login Kit */}
                <Box>
                  <Typography level="title-lg" sx={{ mb: 2 }}>
                    Credenciales Login Kit (OAuth)
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 2 }}>
                    Necesarias para conectar cuentas de TikTok via OAuth.
                    Obtenlas desde developers.tiktok.com en tu aplicacion Login Kit.
                  </Typography>
                  <Stack spacing={2}>
                    <FormControl>
                      <FormLabel>TikTok Client Key</FormLabel>
                      <Input
                        type="text"
                        value={settings.tiktokClientKey}
                        onChange={(e) => updateSetting('tiktokClientKey', e.target.value)}
                        placeholder="awXXXXXXXXXXXXXX"
                      />
                      <FormHelperText>
                        App ID de tu aplicacion TikTok Login Kit
                      </FormHelperText>
                    </FormControl>

                    <FormControl>
                      <FormLabel>TikTok Client Secret</FormLabel>
                      <Input
                        type="password"
                        value={settings.tiktokClientSecret}
                        onChange={(e) => updateSetting('tiktokClientSecret', e.target.value)}
                        placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      />
                      <FormHelperText>
                        Secret de tu aplicacion TikTok Login Kit
                      </FormHelperText>
                    </FormControl>
                  </Stack>
                </Box>

                <Divider />

                {/* Seccion: Credenciales Business API */}
                <Box>
                  <Typography level="title-lg" sx={{ mb: 2 }}>
                    Credenciales Business API (para responder comentarios)
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 2 }}>
                    Necesarias para responder comentarios via API. Sin esto, solo se pueden leer comentarios.
                    Obtenlas desde business-api.tiktok.com creando una app de tipo Business.
                  </Typography>
                  <Stack spacing={2}>
                    <FormControl>
                      <FormLabel>TikTok Business App ID</FormLabel>
                      <Input
                        type="text"
                        value={settings.tiktokBusinessAppId}
                        onChange={(e) => updateSetting('tiktokBusinessAppId', e.target.value)}
                        placeholder="123456789"
                      />
                      <FormHelperText>
                        App ID de tu aplicacion TikTok Business API
                      </FormHelperText>
                    </FormControl>

                    <FormControl>
                      <FormLabel>TikTok Business Secret</FormLabel>
                      <Input
                        type="password"
                        value={settings.tiktokBusinessSecret}
                        onChange={(e) => updateSetting('tiktokBusinessSecret', e.target.value)}
                        placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      />
                      <FormHelperText>
                        Secret de tu aplicacion TikTok Business API
                      </FormHelperText>
                    </FormControl>
                  </Stack>
                </Box>

                <Box sx={{ mt: 2, p: 2, bgcolor: 'background.level1', borderRadius: 'sm' }}>
                  <Typography level="title-sm" sx={{ mb: 1 }}>
                    Como obtener las credenciales:
                  </Typography>
                  <Typography level="body-xs" component="div" sx={{ pl: 2 }}>
                    <ol style={{ margin: 0, paddingLeft: '1rem' }}>
                      <li>Ve a <strong>developers.tiktok.com</strong> y crea una app Login Kit</li>
                      <li>Copia el <strong>Client Key</strong> y <strong>Client Secret</strong></li>
                      <li>Para responder comentarios, ve a <strong>business-api.tiktok.com</strong></li>
                      <li>Crea una app Business y copia el <strong>App ID</strong> y <strong>Secret</strong></li>
                    </ol>
                  </Typography>
                </Box>
              </Stack>
            </TabPanel>

            {/* TAB 10: Payment Configuration (SuperAdmin Only) */}
            {isSuperAdmin && (
              <TabPanel value={9}>
                <Stack spacing={3}>
                  <Typography level="h4">Configuración de Pagos</Typography>
                  <Divider />

                  <Typography level="body-sm" sx={{ color: 'warning.main', fontWeight: 'bold' }}>
                    ⚠️ Esta sección es visible solo para SuperAdministradores
                  </Typography>

                  {/* PayPal Configuration */}
                  <Box>
                    <Typography level="title-lg" sx={{ mb: 2 }}>
                      PayPal
                    </Typography>
                    <Stack spacing={2}>
                      <FormControl>
                        <FormLabel>Client ID de PayPal</FormLabel>
                        <Input
                          type="text"
                          value={settings.paypalClientId}
                          onChange={(e) => updateSetting('paypalClientId', e.target.value)}
                          placeholder="Ingresa el Client ID de PayPal"
                        />
                        <FormHelperText>
                          Client ID público de tu cuenta de PayPal
                        </FormHelperText>
                      </FormControl>

                      <FormControl>
                        <FormLabel>Secret Key de PayPal</FormLabel>
                        <Input
                          type="password"
                          value={settings.paypalSecretKey}
                          onChange={(e) => updateSetting('paypalSecretKey', e.target.value)}
                          placeholder="Ingresa el Secret Key de PayPal"
                        />
                        <FormHelperText>
                          Clave secreta de tu cuenta de PayPal (se mantiene oculta)
                        </FormHelperText>
                      </FormControl>
                    </Stack>
                  </Box>

                  <Divider />

                  {/* Stripe Configuration */}
                  <Box>
                    <Typography level="title-lg" sx={{ mb: 2 }}>
                      Stripe
                    </Typography>
                    <Stack spacing={2}>
                      <FormControl>
                        <FormLabel>Publishable Key de Stripe</FormLabel>
                        <Input
                          type="text"
                          value={settings.stripePublicKey}
                          onChange={(e) => updateSetting('stripePublicKey', e.target.value)}
                          placeholder="Ingresa el Publishable Key de Stripe"
                        />
                        <FormHelperText>
                          Clave pública de tu cuenta de Stripe
                        </FormHelperText>
                      </FormControl>

                      <FormControl>
                        <FormLabel>Secret Key de Stripe</FormLabel>
                        <Input
                          type="password"
                          value={settings.stripeSecretKey}
                          onChange={(e) => updateSetting('stripeSecretKey', e.target.value)}
                          placeholder="Ingresa el Secret Key de Stripe"
                        />
                        <FormHelperText>
                          Clave secreta de tu cuenta de Stripe (se mantiene oculta)
                        </FormHelperText>
                      </FormControl>
                    </Stack>
                  </Box>

                  <Typography level="body-sm" sx={{ mt: 2, color: 'text.tertiary' }}>
                    Las claves de API se utilizan para procesar pagos a través de PayPal y Stripe.
                    Asegúrate de mantener las claves secretas seguras.
                  </Typography>
                </Stack>
              </TabPanel>
            )}
          </Tabs>
        </Card>
      </Stack>
    </Container>
  )
}
