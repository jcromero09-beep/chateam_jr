import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ShareNetwork,
  ArrowClockwise,
  Plus,
  MagnifyingGlass,
  WhatsappLogo,
  TelegramLogo,
  FacebookLogo,
  InstagramLogo,
  Cloud,
  Power,
  PencilSimple,
  Trash,
  QrCode,
  CaretDown,
  CircleNotch,
  X,
} from '@phosphor-icons/react'
import UnifiedConnectionModal, { ConnectionType } from '../components/UnifiedConnectionModal'
import ConfirmModal, { ConfirmColor } from '../components/ConfirmModal'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '../hooks/useAuth'
import { toast } from 'react-toastify'
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
  // Campos de Coexistencia Meta
  coexistenceEnabled?: boolean
  coexistenceStatus?: string
  lastAppOpenedAt?: string
}

// Constantes para Instagram OAuth
const IG_AUTH_FLAG = 'ig_auth_started'
const IG_STATE_KEY = 'ig_oauth_state'

const columns = ['Tipo', 'Nombre', 'Número', 'Estado', 'Por defecto', 'Reintentos', 'Actualizado', '']

// Botón de acción de fila (mismo look que RowAction del prototipo, con onClick)
function ActionBtn({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}

export default function Connections() {
  const { user, socket } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

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

  // Modal de confirmación reutilizable (reemplaza los window.confirm nativos)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    confirmText: string
    color: ConfirmColor
    action: () => Promise<void> | void
  } | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  const handleRunConfirm = async () => {
    if (!confirmDialog) return
    try {
      setConfirmLoading(true)
      await confirmDialog.action()
    } finally {
      setConfirmLoading(false)
      setConfirmDialog(null)
    }
  }

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

  const handleDelete = (connectionId: number) => {
    setConfirmDialog({
      title: 'Eliminar conexión',
      message: '¿Estás seguro de eliminar esta conexión? Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      color: 'danger',
      action: async () => {
        try {
          await api.delete(`/whatsapp/${connectionId}`)
          fetchConnections()
        } catch (error) {
          console.error('Error deleting connection:', error)
        }
      },
    })
  }

  const handleRestart = (connectionId: number) => {
    setConfirmDialog({
      title: 'Reiniciar conexión',
      message: '¿Deseas reiniciar esta conexión? Se restablecerá la sesión de WhatsApp.',
      confirmText: 'Reiniciar',
      color: 'primary',
      action: async () => {
        try {
          await api.put(`/whatsappsession/${connectionId}`)
          fetchConnections()
        } catch (error) {
          console.error('Error restarting connection:', error)
        }
      },
    })
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

  const handleDisconnect = (connectionId: number) => {
    setConfirmDialog({
      title: 'Desconectar conexión',
      message: '¿Deseas desconectar esta conexión? Dejará de recibir y enviar mensajes hasta reconectarla.',
      confirmText: 'Desconectar',
      color: 'warning',
      action: async () => {
        try {
          await api.delete(`/whatsappsession/${connectionId}`)
          fetchConnections()
        } catch (error) {
          console.error('Error disconnecting:', error)
        }
      },
    })
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
    setMenuOpen(false)
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

  const handleDeleteTelegram = (telegramId: number) => {
    setConfirmDialog({
      title: 'Eliminar bot de Telegram',
      message: '¿Deseas eliminar este bot de Telegram? Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      color: 'danger',
      action: async () => {
        try {
          await api.delete(`/telegram/${telegramId}`)
          fetchConnections()
        } catch (error) {
          console.error('Error deleting Telegram:', error)
        }
      },
    })
  }

  // Helper para obtener el icono del canal
  const getChannelIcon = (connection: Connection) => {
    const channel = connection.channel || connection.type || 'whatsapp'
    switch (channel) {
      case 'telegram':
        return <TelegramLogo className="size-5 text-[#0088cc]" weight="fill" aria-hidden />
      case 'facebook':
        return <FacebookLogo className="size-5 text-[#1877f2]" weight="fill" aria-hidden />
      case 'instagram':
        return <InstagramLogo className="size-5 text-[#e4405f]" weight="fill" aria-hidden />
      case 'meta':
        return <Cloud className="size-5 text-wa" weight="fill" aria-hidden />
      default:
        return <WhatsappLogo className="size-5 text-wa" weight="fill" aria-hidden />
    }
  }

  const getChannelLabel = (connection: Connection) => {
    const channel = connection.channel || connection.type || 'whatsapp'
    switch (channel) {
      case 'telegram':
        return 'Telegram'
      case 'facebook':
        return 'Facebook'
      case 'instagram':
        return 'Instagram'
      case 'meta':
        return 'Cloud API'
      default:
        return 'WhatsApp'
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

  const getStatusBadge = (status: string): { label: string; variant: BadgeProps['variant'] } => {
    switch (status) {
      case 'CONNECTED':
        return { label: 'Conectado', variant: 'success' }
      case 'DISCONNECTED':
      case 'TIMEOUT':
        return { label: 'Desconectado', variant: 'destructive' }
      case 'OPENING':
      case 'PAIRING':
        return { label: 'Conectando', variant: 'warning' }
      case 'qrcode':
        return { label: 'QR Code', variant: 'primary' }
      case 'ERROR':
        return { label: 'Error', variant: 'destructive' }
      default:
        return { label: status, variant: 'neutral' }
    }
  }

  // Helper para determinar si es conexion de Telegram
  const isTelegramConnection = (connection: Connection) => {
    return connection.channel === 'telegram' || connection.botToken
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ShareNetwork className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Conexiones
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestión de conexiones de WhatsApp y redes sociales
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={fetchConnections}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            {/* Menú Nueva conexión */}
            <div className="relative">
              <Button size="sm" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
                <Plus className="size-4" weight="bold" aria-hidden />
                Nueva conexión
                <CaretDown className="size-4" aria-hidden />
              </Button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
                  <div
                    role="menu"
                    className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-lg border border-border bg-card p-1.5 shadow-lg"
                  >
                    <p className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      WhatsApp
                    </p>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openConnectionModal('whatsapp')}
                      className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-wa/15">
                        <WhatsappLogo className="size-5 text-wa" weight="fill" aria-hidden />
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-foreground">WhatsApp Baileys</span>
                        <span className="block text-xs text-muted-foreground">Conexión vía código QR</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openConnectionModal('meta')}
                      className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-wa/15">
                        <Cloud className="size-5 text-wa" weight="fill" aria-hidden />
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-foreground">Meta Cloud API</span>
                        <span className="block text-xs text-muted-foreground">API oficial de WhatsApp Business</span>
                      </span>
                    </button>

                    <div className="my-1.5 border-t border-border" />

                    <p className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Redes sociales
                    </p>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openConnectionModal('facebook')}
                      className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#1877f2]/15">
                        <FacebookLogo className="size-5 text-[#1877f2]" weight="fill" aria-hidden />
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-foreground">Facebook Messenger</span>
                        <span className="block text-xs text-muted-foreground">Conectar página de Facebook</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openConnectionModal('instagram')}
                      className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#e4405f]/15">
                        <InstagramLogo className="size-5 text-[#e4405f]" weight="fill" aria-hidden />
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-foreground">Instagram Direct</span>
                        <span className="block text-xs text-muted-foreground">Mensajes de Instagram Business</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openConnectionModal('telegram')}
                      className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#0088cc]/15">
                        <TelegramLogo className="size-5 text-[#0088cc]" weight="fill" aria-hidden />
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-foreground">Telegram Bot</span>
                        <span className="block text-xs text-muted-foreground">Conectar bot de Telegram</span>
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total conexiones" value={String(stats.total)} />
          <StatTile label="Conectadas" value={String(stats.connected)} tone="success" />
          <StatTile label="Desconectadas" value={String(stats.disconnected)} tone="destructive" />
          <StatTile label="Conectando" value={String(stats.opening)} tone="warning" />
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <MagnifyingGlass
            className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            placeholder="Buscar por nombre o número"
            aria-label="Buscar conexiones"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>

        {/* Connections Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  {columns.map((c, i) => (
                    <th
                      key={i}
                      className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      Cargando conexiones...
                    </td>
                  </tr>
                ) : filteredConnections.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      No se encontraron conexiones
                    </td>
                  </tr>
                ) : (
                  filteredConnections.map((connection) => {
                    const status = getStatusBadge(connection.status)
                    return (
                      <tr key={connection.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            {getChannelIcon(connection)}
                            <span>{getChannelLabel(connection)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">{connection.name}</td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                          {connection.number || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={status.variant} dot>{status.label}</Badge>
                            {connection.coexistenceEnabled && (
                              <Badge
                                variant={
                                  connection.coexistenceStatus === 'active'
                                    ? 'success'
                                    : connection.coexistenceStatus === 'disabled'
                                      ? 'destructive'
                                      : 'warning'
                                }
                              >
                                Coex: {connection.coexistenceStatus || 'N/A'}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={connection.isDefault ? 'primary' : 'neutral'}>
                            {connection.isDefault ? 'Sí' : 'No'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {connection.retries || 0}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {new Date(connection.updatedAt).toLocaleString('es-ES')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-0.5">
                            {isTelegramConnection(connection) ? (
                              <>
                                <ActionBtn
                                  label="Reiniciar bot"
                                  onClick={() => handleRestartTelegram(connection.id)}
                                >
                                  <ArrowClockwise className="size-[18px]" aria-hidden />
                                </ActionBtn>
                                <ActionBtn
                                  label="Editar"
                                  onClick={() => openConnectionModal('telegram', connection.id)}
                                >
                                  <PencilSimple className="size-[18px]" aria-hidden />
                                </ActionBtn>
                                <ActionBtn
                                  label="Eliminar"
                                  onClick={() => handleDeleteTelegram(connection.id)}
                                  className="hover:bg-destructive/10 hover:text-destructive-text"
                                >
                                  <Trash className="size-[18px]" aria-hidden />
                                </ActionBtn>
                              </>
                            ) : (
                              <>
                                {(connection.status === 'OPENING' || connection.status === 'PAIRING') && (
                                  <ActionBtn
                                    label="Generar código QR"
                                    onClick={() => handleStartQrSession(connection)}
                                    disabled={startingSessionId === connection.id}
                                    className="text-warning-text hover:bg-warning/10 hover:text-warning-text"
                                  >
                                    <QrCode className="size-[18px]" aria-hidden />
                                  </ActionBtn>
                                )}
                                {connection.status === 'qrcode' && (
                                  <ActionBtn
                                    label="Ver código QR"
                                    onClick={() => handleShowQrCode(connection)}
                                    className="text-primary hover:bg-primary/10 hover:text-primary"
                                  >
                                    <QrCode className="size-[18px]" aria-hidden />
                                  </ActionBtn>
                                )}
                                {(connection.status === 'DISCONNECTED' || connection.status === 'TIMEOUT') && (
                                  <ActionBtn
                                    label="Iniciar sesión"
                                    onClick={() => handleStartSession(connection.id)}
                                    className="text-success-text hover:bg-success/10 hover:text-success-text"
                                  >
                                    <Power className="size-[18px]" aria-hidden />
                                  </ActionBtn>
                                )}
                                {connection.status === 'CONNECTED' && (
                                  <ActionBtn
                                    label="Desconectar"
                                    onClick={() => handleDisconnect(connection.id)}
                                    className="hover:bg-destructive/10 hover:text-destructive-text"
                                  >
                                    <Power className="size-[18px]" aria-hidden />
                                  </ActionBtn>
                                )}
                                <ActionBtn label="Reiniciar" onClick={() => handleRestart(connection.id)}>
                                  <ArrowClockwise className="size-[18px]" aria-hidden />
                                </ActionBtn>
                                <ActionBtn
                                  label="Editar"
                                  onClick={() => openConnectionModal(getConnectionType(connection), connection.id)}
                                >
                                  <PencilSimple className="size-[18px]" aria-hidden />
                                </ActionBtn>
                                <ActionBtn
                                  label="Eliminar"
                                  onClick={() => handleDelete(connection.id)}
                                  className="hover:bg-destructive/10 hover:text-destructive-text"
                                >
                                  <Trash className="size-[18px]" aria-hidden />
                                </ActionBtn>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Unificado para todas las conexiones */}
      <UnifiedConnectionModal
        open={modalOpen}
        onClose={handleCloseModal}
        connectionId={selectedConnectionId}
        connectionType={selectedConnectionType}
        onSuccess={fetchConnections}
      />

      {/* Modal de confirmación (reemplaza window.confirm nativo) */}
      <ConfirmModal
        open={!!confirmDialog}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        confirmText={confirmDialog?.confirmText}
        color={confirmDialog?.color}
        loading={confirmLoading}
        onConfirm={handleRunConfirm}
        onClose={() => setConfirmDialog(null)}
      />

      {/* Modal QR Code */}
      {openQrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenQrModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                Código QR - {selectedConnection?.name}
              </h2>
              <ActionBtn label="Cerrar" onClick={() => setOpenQrModal(false)}>
                <X className="size-[18px]" aria-hidden />
              </ActionBtn>
            </div>

            <div className="flex flex-col items-center gap-4">
              <div className="rounded-lg border-2 border-border bg-background p-3">
                {qrLoading ? (
                  <div className="flex size-[300px] flex-col items-center justify-center gap-3 text-muted-foreground">
                    <CircleNotch className="size-10 animate-spin" aria-hidden />
                    <span className="text-sm">Generando código QR...</span>
                  </div>
                ) : qrCodeData ? (
                  <img
                    src={qrCodeData}
                    alt="Código QR"
                    className="size-[300px] object-contain"
                  />
                ) : (
                  <div className="flex size-[300px] flex-col items-center justify-center gap-3 text-muted-foreground">
                    <CircleNotch className="size-10 animate-spin" aria-hidden />
                    <span className="text-sm">Esperando código QR...</span>
                  </div>
                )}
              </div>
              <div className="max-w-sm text-center text-sm text-muted-foreground">
                1. Abre WhatsApp en tu teléfono
                <br />
                2. Ve a Ajustes → Dispositivos vinculados
                <br />
                3. Toca "Vincular un dispositivo"
                <br />
                4. Escanea este código QR
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={() => setOpenQrModal(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
