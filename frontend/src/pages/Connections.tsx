import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Typography,
  Stack,
  Container,
  Card,
  CardContent,
  Box,
  Grid,
  Button,
  Table,
  Sheet,
  Chip,
  IconButton,
  Input,
  Modal,
  ModalDialog,
  ModalClose,
  CircularProgress,
  Menu,
  MenuItem,
  ListItemDecorator,
  Dropdown,
  MenuButton,
} from '@mui/joy'
import UnifiedConnectionModal, { ConnectionType } from '../components/UnifiedConnectionModal'
import { useAuth } from '../hooks/useAuth'
import { toast } from 'react-toastify'
import {
  Cable as ConnectionsIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  QrCode as QrCodeIcon,
  PowerSettingsNew as PowerIcon,
  RestartAlt as RestartIcon,
  CheckCircle as ConnectedIcon,
  Cancel as DisconnectedIcon,
  Error as ErrorIcon,
  Settings as SettingsIcon,
  Facebook as FacebookIcon,
  Instagram as InstagramIcon,
  WhatsApp as WhatsAppIcon,
  Telegram as TelegramIcon,
  Battery50 as BatteryIcon,
  Cloud as CloudIcon,
  KeyboardArrowDown as ArrowDownIcon,
} from '@mui/icons-material'
import QRCode from 'qrcode'
import api from '../services/api'
import socketService from '../services/socket'

interface Connection {
  id: number
  name: string
  status: string // CONNECTED, DISCONNECTED, OPENING, PAIRING, TIMEOUT, qrcode, ERROR
  number?: string
  battery?: number
  plugged?: boolean
  isDefault?: boolean
  retries?: number
  greetingMessage?: string
  farewellMessage?: string
  qrcode?: string
  type?: string // whatsapp, facebook, instagram (legacy)
  channel?: string // whatsapp, telegram, facebook, instagram
  botToken?: string
  botUsername?: string
  companyId: number
  createdAt: string
  updatedAt: string
}

// Constantes para Instagram OAuth
const IG_AUTH_FLAG = 'ig_auth_started'
const IG_STATE_KEY = 'ig_oauth_state'

export default function Connections() {
  const { user, socket } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Modal unificado
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null)
  const [selectedConnectionType, setSelectedConnectionType] = useState<ConnectionType>('whatsapp')

  // Modal QR
  const [openQrModal, setOpenQrModal] = useState(false)
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null)
  const [qrCodeData, setQrCodeData] = useState<string>('')
  const [qrLoading, setQrLoading] = useState(false)
  const [startingSessionId, setStartingSessionId] = useState<number | null>(null)

  useEffect(() => {
    fetchConnections()
  }, [])

  // Manejar callback de Instagram OAuth
  useEffect(() => {
    const started = sessionStorage.getItem(IG_AUTH_FLAG) === '1'
    if (!started) return

    const params = new URLSearchParams(location.search)
    const code = params.get('code')
    const error = params.get('error') || params.get('error_reason') || params.get('error_description')
    const returnedState = params.get('state')
    const expectedState = sessionStorage.getItem(IG_STATE_KEY)

    sessionStorage.removeItem(IG_AUTH_FLAG)
    sessionStorage.removeItem(IG_STATE_KEY)

    if (error) {
      toast.error('Se cancelo la conexion con Instagram')
      navigate('/connections', { replace: true })
      return
    }

    if (!code || !returnedState || returnedState !== expectedState) {
      navigate('/connections', { replace: true })
      return
    }

    // Enviar codigo al backend
    const connectInstagram = async () => {
      try {
        await api.post('/instagram/connect', { code })
        toast.success('Instagram conectado exitosamente!')
        fetchConnections()
      } catch (err) {
        toast.error('Hubo un problema conectando Instagram')
      }
      navigate('/connections', { replace: true })
    }

    connectInstagram()
  }, [location.search, navigate])

  // Escuchar eventos de socket para actualizaciones en tiempo real
  useEffect(() => {
    // Get socket from socketService as single source of truth
    const socketInstance = socket || socketService.getSocket()

    if (!socketInstance || !user?.companyId) {
      console.log('🔌 [Connections] Socket setup check:', {
        hasSocket: !!socket,
        hasSocketService: !!socketService.getSocket(),
        companyId: user?.companyId
      })
      return
    }

    const companyId = user.companyId
    const eventName = `company-${companyId}-whatsappSession`

    console.log(`🔌 [Connections] Setting up socket listener:`, {
      eventName,
      socketConnected: socketInstance.connected,
      socketId: socketInstance.id
    })

    // Handler para actualizaciones de WhatsApp
    const handleWhatsappUpdate = (data: any) => {
      if (data.action === 'update' && data.whatsapp) {
        setConnections(prev => {
          const index = prev.findIndex(c => c.id === data.whatsapp.id)
          if (index !== -1) {
            const updated = [...prev]
            updated[index] = { ...updated[index], ...data.whatsapp }
            return updated
          }
          return [data.whatsapp, ...prev]
        })
      }
      if (data.action === 'delete' && data.whatsappId) {
        setConnections(prev => prev.filter(c => c.id !== data.whatsappId))
      }
    }

    // Handler para actualizaciones de sesion (incluye QR code)
    const handleSessionUpdate = (data: any) => {
      console.log('📨 [Socket] whatsappSession event received:', data)

      if (data.action === 'update' && data.session) {
        console.log('📱 [Socket] Session update:', {
          id: data.session.id,
          status: data.session.status,
          hasQrcode: !!data.session.qrcode,
          qrcodeLength: data.session.qrcode?.length
        })

        // Limpiar estado de loading si esta sesion estaba inicializandose
        if (data.session.id === startingSessionId) {
          setStartingSessionId(null)
        }

        // Actualizar la conexion en la lista
        setConnections(prev => {
          const index = prev.findIndex(c => c.id === data.session.id)
          console.log(`📋 [Socket] Updating connection ${data.session.id} at index ${index}`)
          if (index !== -1) {
            const updated = [...prev]
            updated[index] = {
              ...updated[index],
              status: data.session.status,
              qrcode: data.session.qrcode,
              retries: data.session.retries,
              updatedAt: data.session.updatedAt
            }
            return updated
          }
          return prev
        })

        // Si hay QR code y el status es qrcode, actualizar el QR y abrir modal si no está abierto
        if (data.session.qrcode && data.session.status === 'qrcode') {
          console.log('🔄 [Socket] QR code received, generating image...')

          // Generar imagen QR
          QRCode.toDataURL(data.session.qrcode, {
            width: 300,
            margin: 2,
            color: { dark: '#000000', light: '#FFFFFF' }
          }).then(qrImageUrl => {
            console.log('✅ [Socket] QR image generated successfully')
            setQrCodeData(qrImageUrl)
            setQrLoading(false)

            // Si no hay conexion seleccionada o es diferente, actualizar
            if (!selectedConnection || selectedConnection.id !== data.session.id) {
              // Find the connection and set it as selected
              setConnections(prev => {
                const conn = prev.find(c => c.id === data.session.id)
                if (conn) {
                  setSelectedConnection(conn)
                  setOpenQrModal(true)
                  console.log('📱 [Socket] Auto-opened QR modal for connection', conn.name)
                }
                return prev
              })
            }
          }).catch(err => {
            console.error('❌ [Socket] Error generating QR:', err)
            setQrLoading(false)
          })
        }

        // Si el QR se vacio (escaneo exitoso), cerrar modal
        if (data.session.qrcode === '' && data.session.status === 'CONNECTED') {
          console.log('✅ [Socket] Connection successful, closing modal')
          setOpenQrModal(false)
        }
      }
    }

    socketInstance.on(`company-${companyId}-whatsapp`, handleWhatsappUpdate)
    socketInstance.on(eventName, handleSessionUpdate)

    return () => {
      socketInstance.off(`company-${companyId}-whatsapp`, handleWhatsappUpdate)
      socketInstance.off(eventName, handleSessionUpdate)
    }
  }, [socket, user?.companyId, selectedConnection])

  const fetchConnections = async () => {
    try {
      setLoading(true)
      // Obtener conexiones de WhatsApp y Telegram
      const [whatsappResponse, telegramResponse] = await Promise.all([
        api.get('/whatsapp/'),
        api.get('/telegram').catch(() => ({ data: [] })) // Si falla, devolver array vacío
      ])

      console.log('WhatsApp API response:', whatsappResponse.data)
      console.log('Telegram API response:', telegramResponse.data)

      // La API devuelve un array directamente
      const whatsappData = Array.isArray(whatsappResponse.data)
        ? whatsappResponse.data
        : (whatsappResponse.data.connections || whatsappResponse.data.whatsapps || [])

      const telegramData = Array.isArray(telegramResponse.data)
        ? telegramResponse.data.map((t: any) => ({ ...t, channel: 'telegram' }))
        : []

      // Combinar ambas listas
      setConnections([...whatsappData, ...telegramData])
    } catch (error) {
      console.error('Error fetching connections:', error)
      // Mostrar array vacío en caso de error para ver el estado real
      setConnections([])
    } finally {
      setLoading(false)
    }
  }

  const handleModalSuccess = () => {
    fetchConnections()
  }

  const handleDelete = async (connectionId: number) => {
    if (confirm('¿Estás seguro de eliminar esta conexión?')) {
      try {
        await api.delete(`/whatsapp/${connectionId}`)
        fetchConnections()
      } catch (error) {
        console.error('Error deleting connection:', error)
      }
    }
  }

  const handleRestart = async (connectionId: number) => {
    if (confirm('¿Deseas reiniciar esta conexión?')) {
      try {
        await api.put(`/whatsappsession/${connectionId}`)
        fetchConnections()
      } catch (error) {
        console.error('Error restarting connection:', error)
      }
    }
  }

  const handleStartSession = async (connectionId: number) => {
    try {
      // Actualizar el estado a OPENING para que se pueda ver el botón de QR
      await api.put(`/whatsapp/${connectionId}`, {
        status: 'OPENING',
        qrcode: '',
        session: ''
      })
      fetchConnections()
    } catch (error) {
      console.error('Error starting session:', error)
    }
  }

  const handleDisconnect = async (connectionId: number) => {
    if (confirm('¿Deseas desconectar esta conexión?')) {
      try {
        await api.delete(`/whatsappsession/${connectionId}`)
        fetchConnections()
      } catch (error) {
        console.error('Error disconnecting:', error)
      }
    }
  }

  // Iniciar sesion cuando está en OPENING (genera el QR en el backend)
  const handleStartQrSession = async (connection: Connection) => {
    if (startingSessionId === connection.id) return // Evitar doble clic
    try {
      setStartingSessionId(connection.id)
      console.log('Iniciando sesion WhatsApp para generar QR...')
      await api.post(`/whatsappsession/${connection.id}`)
      // Refrescar la lista para ver el nuevo estado
      fetchConnections()
    } catch (error) {
      console.error('Error starting QR session:', error)
      // Aun asi refrescamos para ver si cambio algo
      fetchConnections()
    } finally {
      // Limpiar despues de 5s como safety net
      setTimeout(() => setStartingSessionId(null), 5000)
    }
  }

  // Mostrar el QR cuando ya está en estado qrcode
  const handleShowQrCode = async (connection: Connection) => {
    setSelectedConnection(connection)
    setQrCodeData('')
    setQrLoading(true)
    setOpenQrModal(true)

    try {
      // Obtener el QR code actual
      const response = await api.get(`/whatsapp/${connection.id}`)
      const qrText = response.data.qrcode || ''

      if (qrText) {
        const qrImageUrl = await QRCode.toDataURL(qrText, {
          width: 300,
          margin: 2,
          color: { dark: '#000000', light: '#FFFFFF' }
        })
        setQrCodeData(qrImageUrl)
      }
      setQrLoading(false)
    } catch (error) {
      console.error('Error fetching QR code:', error)
      setQrLoading(false)
    }
  }

  // Funcion unificada para abrir modal de conexion
  const openConnectionModal = (type: ConnectionType, connectionId?: number) => {
    setSelectedConnectionType(type)
    setSelectedConnectionId(connectionId || null)
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setSelectedConnectionId(null)
  }

  // Helper para determinar el tipo de conexion
  const getConnectionType = (connection: Connection): ConnectionType => {
    const channel = connection.channel || connection.type || 'whatsapp'
    if (channel === 'telegram' || connection.botToken) return 'telegram'
    if (channel === 'facebook') return 'facebook'
    if (channel === 'instagram') return 'instagram'
    if (channel === 'meta') return 'meta'
    return 'whatsapp'
  }

  const handleRestartTelegram = async (telegramId: number) => {
    try {
      await api.post(`/telegram/${telegramId}/restart`)
      fetchConnections()
    } catch (error) {
      console.error('Error restarting Telegram:', error)
    }
  }

  const handleDeleteTelegram = async (telegramId: number) => {
    if (confirm('¿Deseas eliminar este bot de Telegram?')) {
      try {
        await api.delete(`/telegram/${telegramId}`)
        fetchConnections()
      } catch (error) {
        console.error('Error deleting Telegram:', error)
      }
    }
  }

  // Helper para obtener el icono del canal
  const getChannelIcon = (connection: Connection) => {
    const channel = connection.channel || connection.type || 'whatsapp'
    switch (channel) {
      case 'telegram':
        return <TelegramIcon sx={{ color: '#0088cc' }} />
      case 'facebook':
        return <FacebookIcon sx={{ color: '#1877f2' }} />
      case 'instagram':
        return <InstagramIcon sx={{ color: '#e4405f' }} />
      case 'meta':
        return <CloudIcon sx={{ color: '#25d366' }} />
      default:
        return <WhatsAppIcon sx={{ color: '#25d366' }} />
    }
  }

  const filteredConnections = connections.filter(
    (connection) =>
      connection.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (connection.number && connection.number.includes(searchTerm))
  )

  const stats = {
    total: connections.length,
    connected: connections.filter((c) => c.status === 'CONNECTED').length,
    disconnected: connections.filter((c) => c.status === 'DISCONNECTED' || c.status === 'TIMEOUT')
      .length,
    opening: connections.filter((c) => c.status === 'OPENING' || c.status === 'PAIRING').length,
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONNECTED':
        return 'success'
      case 'DISCONNECTED':
      case 'TIMEOUT':
        return 'danger'
      case 'OPENING':
      case 'PAIRING':
        return 'warning'
      case 'qrcode':
        return 'primary'
      default:
        return 'neutral'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'CONNECTED':
        return <ConnectedIcon />
      case 'DISCONNECTED':
      case 'TIMEOUT':
        return <DisconnectedIcon />
      case 'OPENING':
      case 'PAIRING':
        return <PowerIcon />
      default:
        return <ErrorIcon />
    }
  }

  // Helper para determinar si es conexion de Telegram
  const isTelegramConnection = (connection: Connection) => {
    return connection.channel === 'telegram' || connection.botToken
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <ConnectionsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Conexiones</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Gestión de conexiones WhatsApp y redes sociales
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="center">
            <Dropdown>
              <MenuButton
                variant="solid"
                color="primary"
                size="lg"
                endDecorator={<ArrowDownIcon />}
                startDecorator={<AddIcon />}
                sx={{
                  px: 3,
                  py: 1,
                  fontWeight: 600,
                  borderRadius: 'lg',
                  boxShadow: 'sm',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #5a6fd6 0%, #6a4190 100%)',
                    boxShadow: 'md',
                  },
                }}
              >
                Nueva Conexion
              </MenuButton>
              <Menu
                placement="bottom-end"
                sx={{
                  minWidth: 280,
                  p: 1,
                  borderRadius: 'lg',
                  boxShadow: 'lg',
                  '--ListItem-radius': '8px',
                }}
              >
                {/* WhatsApp Section */}
                <Typography
                  level="body-xs"
                  sx={{ px: 1.5, py: 0.5, color: 'text.tertiary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}
                >
                  WhatsApp
                </Typography>
                <MenuItem
                  onClick={() => openConnectionModal('whatsapp')}
                  sx={{
                    py: 1.5,
                    '&:hover': { bgcolor: '#25d36615' },
                  }}
                >
                  <ListItemDecorator>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: '10px',
                        bgcolor: '#25d36620',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <WhatsAppIcon sx={{ color: '#25d366', fontSize: 20 }} />
                    </Box>
                  </ListItemDecorator>
                  <Box sx={{ ml: 0.5 }}>
                    <Typography level="body-sm" fontWeight={600}>WhatsApp Baileys</Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Conexion via QR Code</Typography>
                  </Box>
                </MenuItem>
                <MenuItem
                  onClick={() => openConnectionModal('meta')}
                  sx={{
                    py: 1.5,
                    '&:hover': { bgcolor: '#25d36615' },
                  }}
                >
                  <ListItemDecorator>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: '10px',
                        bgcolor: '#25d36620',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <CloudIcon sx={{ color: '#25d366', fontSize: 20 }} />
                    </Box>
                  </ListItemDecorator>
                  <Box sx={{ ml: 0.5 }}>
                    <Typography level="body-sm" fontWeight={600}>Meta Cloud API</Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>API oficial de WhatsApp Business</Typography>
                  </Box>
                </MenuItem>

                <Box sx={{ my: 1, borderTop: '1px solid', borderColor: 'divider' }} />

                {/* Social Section */}
                <Typography
                  level="body-xs"
                  sx={{ px: 1.5, py: 0.5, color: 'text.tertiary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}
                >
                  Redes Sociales
                </Typography>
                <MenuItem
                  onClick={() => openConnectionModal('facebook')}
                  sx={{
                    py: 1.5,
                    '&:hover': { bgcolor: '#1877f215' },
                  }}
                >
                  <ListItemDecorator>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: '10px',
                        bgcolor: '#1877f220',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <FacebookIcon sx={{ color: '#1877f2', fontSize: 20 }} />
                    </Box>
                  </ListItemDecorator>
                  <Box sx={{ ml: 0.5 }}>
                    <Typography level="body-sm" fontWeight={600}>Facebook Messenger</Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Conectar pagina de Facebook</Typography>
                  </Box>
                </MenuItem>
                <MenuItem
                  onClick={() => openConnectionModal('instagram')}
                  sx={{
                    py: 1.5,
                    '&:hover': { bgcolor: '#e4405f15' },
                  }}
                >
                  <ListItemDecorator>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: '10px',
                        background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
                        opacity: 0.2,
                        position: 'absolute',
                      }}
                    />
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: '10px',
                        bgcolor: '#e4405f20',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <InstagramIcon sx={{ color: '#e4405f', fontSize: 20 }} />
                    </Box>
                  </ListItemDecorator>
                  <Box sx={{ ml: 0.5 }}>
                    <Typography level="body-sm" fontWeight={600}>Instagram Direct</Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Mensajes de Instagram Business</Typography>
                  </Box>
                </MenuItem>
                <MenuItem
                  onClick={() => openConnectionModal('telegram')}
                  sx={{
                    py: 1.5,
                    '&:hover': { bgcolor: '#0088cc15' },
                  }}
                >
                  <ListItemDecorator>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: '10px',
                        bgcolor: '#0088cc20',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <TelegramIcon sx={{ color: '#0088cc', fontSize: 20 }} />
                    </Box>
                  </ListItemDecorator>
                  <Box sx={{ ml: 0.5 }}>
                    <Typography level="body-sm" fontWeight={600}>Telegram Bot</Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Conectar bot de Telegram</Typography>
                  </Box>
                </MenuItem>
              </Menu>
            </Dropdown>
            <IconButton
              variant="soft"
              color="neutral"
              size="lg"
              onClick={fetchConnections}
              sx={{
                borderRadius: 'lg',
                '&:hover': { bgcolor: 'neutral.200' },
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Stack>
        </Stack>

        {/* Stats */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Total Conexiones
                </Typography>
                <Typography level="h2">{stats.total}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Conectadas
                </Typography>
                <Typography level="h2" sx={{ color: 'success.main' }}>
                  {stats.connected}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Desconectadas
                </Typography>
                <Typography level="h2" sx={{ color: 'danger.main' }}>
                  {stats.disconnected}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Conectando
                </Typography>
                <Typography level="h2" sx={{ color: 'warning.main' }}>
                  {stats.opening}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Search */}
        <Card>
          <CardContent>
            <Input
              placeholder="Buscar conexiones por nombre o número..."
              startDecorator={<SearchIcon />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </CardContent>
        </Card>

        {/* Connections Table */}
        <Card>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Tipo</th>
                  <th style={{ width: 200 }}>Nombre</th>
                  <th style={{ width: 150 }}>Número</th>
                  <th style={{ width: 120 }}>Estado</th>
                  <th style={{ width: 100 }}>Batería</th>
                  <th style={{ width: 100 }}>Por Defecto</th>
                  <th style={{ width: 100 }}>Reintentos</th>
                  <th style={{ width: 180 }}>Última Actualización</th>
                  <th style={{ width: 250 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>Cargando conexiones...</Typography>
                    </td>
                  </tr>
                ) : filteredConnections.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>No se encontraron conexiones</Typography>
                    </td>
                  </tr>
                ) : (
                  filteredConnections.map((connection) => (
                    <tr key={connection.id}>
                      <td>
                        <IconButton size="sm" variant="plain" color="neutral">
                          {getChannelIcon(connection)}
                        </IconButton>
                      </td>
                      <td>
                        <Typography level="body-sm" fontWeight="bold">
                          {connection.name}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-xs">{connection.number || '-'}</Typography>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={getStatusColor(connection.status)}
                          startDecorator={getStatusIcon(connection.status)}
                        >
                          {connection.status}
                        </Chip>
                      </td>
                      <td>
                        {connection.battery !== undefined ? (
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <BatteryIcon
                              sx={{
                                fontSize: 18,
                                color:
                                  connection.battery > 50
                                    ? 'success.main'
                                    : connection.battery > 20
                                      ? 'warning.main'
                                      : 'danger.main',
                              }}
                            />
                            <Typography level="body-xs">{connection.battery}%</Typography>
                            {connection.plugged && (
                              <Chip size="sm" variant="soft" color="success">
                                🔌
                              </Chip>
                            )}
                          </Stack>
                        ) : (
                          <Typography level="body-xs">-</Typography>
                        )}
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={connection.isDefault ? 'success' : 'neutral'}
                          variant="soft"
                        >
                          {connection.isDefault ? 'Sí' : 'No'}
                        </Chip>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={
                            (connection.retries || 0) > 2
                              ? 'danger'
                              : (connection.retries || 0) > 0
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {connection.retries || 0}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-xs">
                          {new Date(connection.updatedAt).toLocaleString('es-ES')}
                        </Typography>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          {/* Acciones para Telegram */}
                          {isTelegramConnection(connection) ? (
                            <>
                              {/* Reiniciar bot de Telegram */}
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="warning"
                                onClick={() => handleRestartTelegram(connection.id)}
                                title="Reiniciar Bot"
                              >
                                <RestartIcon />
                              </IconButton>

                              {/* Editar Telegram - Usa modal unificado */}
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="primary"
                                onClick={() => openConnectionModal('telegram', connection.id)}
                                title="Editar"
                              >
                                <EditIcon />
                              </IconButton>

                              {/* Eliminar Telegram */}
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="danger"
                                onClick={() => handleDeleteTelegram(connection.id)}
                                title="Eliminar"
                              >
                                <DeleteIcon />
                              </IconButton>
                            </>
                          ) : (
                            <>
                              {/* Acciones para WhatsApp/Meta/Facebook/Instagram */}
                              {/* Boton para OPENING/PAIRING: inicia la sesion para generar QR */}
                              {(connection.status === 'OPENING' || connection.status === 'PAIRING') && (
                                <IconButton
                                  size="sm"
                                  variant="solid"
                                  color="warning"
                                  onClick={() => handleStartQrSession(connection)}
                                  disabled={startingSessionId === connection.id}
                                  title="Generar Código QR"
                                >
                                  <QrCodeIcon />
                                </IconButton>
                              )}

                              {/* Boton para qrcode: muestra el QR en modal */}
                              {connection.status === 'qrcode' && (
                                <IconButton
                                  size="sm"
                                  variant="solid"
                                  color="primary"
                                  onClick={() => handleShowQrCode(connection)}
                                  title="Ver Código QR"
                                >
                                  <QrCodeIcon />
                                </IconButton>
                              )}

                              {/* Show Start Session button when status is DISCONNECTED or TIMEOUT */}
                              {(connection.status === 'DISCONNECTED' || connection.status === 'TIMEOUT') && (
                                <IconButton
                                  size="sm"
                                  variant="solid"
                                  color="success"
                                  onClick={() => handleStartSession(connection.id)}
                                  title="Iniciar Sesión"
                                >
                                  <PowerIcon />
                                </IconButton>
                              )}

                              {/* Show Disconnect button when CONNECTED */}
                              {connection.status === 'CONNECTED' && (
                                <IconButton
                                  size="sm"
                                  variant="plain"
                                  color="danger"
                                  onClick={() => handleDisconnect(connection.id)}
                                  title="Desconectar"
                                >
                                  <PowerIcon />
                                </IconButton>
                              )}

                              {/* Restart button - always visible */}
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="warning"
                                onClick={() => handleRestart(connection.id)}
                                title="Reiniciar"
                              >
                                <RestartIcon />
                              </IconButton>

                              {/* Editar - Usa modal unificado con tipo detectado */}
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="primary"
                                onClick={() => openConnectionModal(getConnectionType(connection), connection.id)}
                                title="Editar"
                              >
                                <EditIcon />
                              </IconButton>
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="neutral"
                                title="Configuración"
                              >
                                <SettingsIcon />
                              </IconButton>
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="danger"
                                onClick={() => handleDelete(connection.id)}
                                title="Eliminar"
                              >
                                <DeleteIcon />
                              </IconButton>
                            </>
                          )}
                        </Stack>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Sheet>
        </Card>

        {/* Modal Unificado para todas las conexiones */}
        <UnifiedConnectionModal
          open={modalOpen}
          onClose={handleCloseModal}
          connectionId={selectedConnectionId}
          connectionType={selectedConnectionType}
          onSuccess={fetchConnections}
        />

        {/* Modal QR Code */}
        <Modal open={openQrModal} onClose={() => setOpenQrModal(false)}>
          <ModalDialog sx={{ minWidth: 400, textAlign: 'center' }}>
            <ModalClose />
            <Typography level="h4" sx={{ mb: 2 }}>
              Código QR - {selectedConnection?.name}
            </Typography>
            <Stack spacing={2} alignItems="center">
              <Box
                sx={{
                  p: 2,
                  bgcolor: 'background.surface',
                  borderRadius: 'md',
                  border: '2px solid',
                  borderColor: 'divider',
                }}
              >
                {qrLoading ? (
                  <Box sx={{ width: 300, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2 }}>
                    <CircularProgress size="lg" />
                    <Typography>Generando codigo QR...</Typography>
                  </Box>
                ) : qrCodeData ? (
                  <img
                    src={qrCodeData}
                    alt="QR Code"
                    style={{ width: 300, height: 300, objectFit: 'contain' }}
                  />
                ) : (
                  <Box sx={{ width: 300, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2 }}>
                    <CircularProgress size="lg" />
                    <Typography>Esperando codigo QR...</Typography>
                  </Box>
                )}
              </Box>
              <Typography level="body-sm" sx={{ textAlign: 'center', maxWidth: 350 }}>
                1. Abre WhatsApp en tu teléfono
                <br />
                2. Ve a Ajustes → Dispositivos vinculados
                <br />
                3. Toca "Vincular un dispositivo"
                <br />
                4. Escanea este código QR
              </Typography>
              <Button
                color="neutral"
                variant="outlined"
                onClick={() => setOpenQrModal(false)}
                fullWidth
              >
                Cerrar
              </Button>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
