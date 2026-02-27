import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Typography,
  Stack,
  Box,
  Chip,
  IconButton,
  Input,
  Avatar,
  Badge,
  Sheet,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
  Button,
  Tooltip,
  FormControl,
  FormLabel,
  Switch,
  Tabs,
  TabList,
  Tab,
  tabClasses,
  Select,
  Option,
} from '@mui/joy'
import {
  Search as SearchIcon,
  MoreVert as MoreIcon,
  Group as GroupIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CheckCircle as ResolvedIcon,
  Schedule as PendingIcon,
  Error as OpenIcon,
  Close as CloseIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  ContactPage as ContactIcon,
  WhatsApp as WhatsAppIcon,
  Telegram as TelegramIcon,
  Facebook as FacebookIcon,
  Instagram as InstagramIcon,
  Phone as PhoneIcon,
  Check as CheckIcon,
  Clear as ClearIcon,
  Replay as ReplayIcon,
  SwapHoriz as TransferIcon,
  Message as MessageIcon,
  AccessTime as AccessTimeIcon,
  CheckBox as CheckBoxIcon,
} from '@mui/icons-material'
import api from '../services/api'
import ContactDrawer from '../components/ContactDrawer'
import MessageInput from '../components/MessageInput'
import socketService from '../services/socket'
import { useAuth } from '../hooks/useAuth'

interface Message {
  id: number
  body: string
  fromMe: boolean
  mediaUrl?: string
  mediaType?: string
  quotedMsg?: any
  createdAt: string
  ack?: number
  read: boolean
}

interface Tag {
  id: number
  name: string
  color: string
  kanban?: number
}

interface Contact {
  id: number
  name: string
  number: string
  profilePicUrl?: string
  urlPicture?: string
  tags?: Tag[]
}

interface User {
  id: number
  name: string
}

interface Queue {
  id: number
  name: string
  color: string
}

interface Whatsapp {
  id: number
  name: string
  channel?: string
}

interface Ticket {
  id: number
  uuid: string
  status: string
  unreadMessages: number
  lastMessage?: string
  contactId: number
  userId?: number
  queueId?: number
  whatsappId?: number
  isGroup?: boolean
  channel?: string
  contact: Contact
  user?: User
  queue?: Queue
  whatsapp?: Whatsapp
  tags?: Tag[]
  messages: Message[]
  createdAt: string
  updatedAt: string
}

export default function Tickets() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('open')
  const [showAll, setShowAll] = useState(true)
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [whatsappFilter, setWhatsappFilter] = useState<string>('')
  const [userFilter, setUserFilter] = useState<string>('')
  const [queueFilter, setQueueFilter] = useState<string>('')
  const [searchMessages, setSearchMessages] = useState(false)
  const [users, setUsers] = useState<{ id: number; name: string }[]>([])
  const [queues, setQueues] = useState<{ id: number; name: string }[]>([])
  const [whatsapps, setWhatsapps] = useState<{ id: number; name: string }[]>([])
  const [contactDrawerOpen, setContactDrawerOpen] = useState(false)
  const [dragDropFiles] = useState<File[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Contadores para las tabs
  const [openCount, setOpenCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [closedCount, setClosedCount] = useState(0)
  const [groupCount, setGroupCount] = useState(0)

  // Función para obtener contadores de todos los estados
  const fetchTicketCounts = useCallback(async () => {
    try {
      const showAllParam = showAll ? 'true' : 'false'

      // Obtener contadores para cada estado en paralelo
      const [openRes, pendingRes, closedRes, groupRes] = await Promise.all([
        api.get('/tickets', { params: { status: 'open', showAll: showAllParam, pageNumber: 1 } }),
        api.get('/tickets', { params: { status: 'pending', showAll: showAllParam, pageNumber: 1 } }),
        api.get('/tickets', { params: { status: 'closed', showAll: showAllParam, pageNumber: 1 } }),
        api.get('/tickets', { params: { status: 'group', showAll: showAllParam, pageNumber: 1 } }),
      ])

      setOpenCount(openRes.data.count || 0)
      setPendingCount(pendingRes.data.count || 0)
      setClosedCount(closedRes.data.count || 0)
      setGroupCount(groupRes.data.count || 0)
    } catch (error) {
      console.error('Error fetching ticket counts:', error)
    }
  }, [showAll])

  useEffect(() => {
    fetchTickets()
  }, [statusFilter, showAll, startDate, endDate, whatsappFilter, userFilter, queueFilter, searchMessages])

  // Obtener contadores al inicio y cuando cambie showAll
  useEffect(() => {
    fetchTicketCounts()
  }, [fetchTicketCounts])

  useEffect(() => {
    fetchFilterOptions()
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [selectedTicket?.messages])

  // Socket event listeners for real-time updates
  useEffect(() => {
    if (!user?.companyId) return

    const socket = socketService.getSocket()
    if (!socket) {
      console.log('⚠️ Socket not available yet')
      return
    }

    const companyId = user.companyId
    const messageEvent = `company-${companyId}-appMessage`
    const ticketEvent = `company-${companyId}-ticket`

    console.log(`🔌 Setting up socket listeners for company ${companyId}`)

    // Handler for new/updated messages
    const handleAppMessage = (data: { action: string; message: Message & { ticketId: number } }) => {
      console.log('📨 Socket appMessage received:', data.action, data.message?.id)

      if (data.action === 'create' || data.action === 'update') {
        // Update messages in the ticket list
        setTickets(prevTickets =>
          prevTickets.map(ticket => {
            if (ticket.id === data.message.ticketId) {
              const existingMsgIndex = ticket.messages.findIndex(m => m.id === data.message.id)
              let updatedMessages: Message[]

              if (existingMsgIndex >= 0) {
                // Update existing message
                updatedMessages = [...ticket.messages]
                updatedMessages[existingMsgIndex] = data.message
              } else {
                // Add new message
                updatedMessages = [...ticket.messages, data.message]
              }

              return {
                ...ticket,
                messages: updatedMessages,
                lastMessage: data.message.body,
                updatedAt: data.message.createdAt
              }
            }
            return ticket
          })
        )

        // Update selected ticket messages
        setSelectedTicket(prevSelected => {
          if (prevSelected && prevSelected.id === data.message.ticketId) {
            const existingMsgIndex = prevSelected.messages.findIndex(m => m.id === data.message.id)
            let updatedMessages: Message[]

            if (existingMsgIndex >= 0) {
              updatedMessages = [...prevSelected.messages]
              updatedMessages[existingMsgIndex] = data.message
            } else {
              updatedMessages = [...prevSelected.messages, data.message]
            }

            return {
              ...prevSelected,
              messages: updatedMessages,
              lastMessage: data.message.body,
              updatedAt: data.message.createdAt
            }
          }
          return prevSelected
        })
      }
    }

    // Handler for ticket updates
    const handleTicketUpdate = (data: { action: string; ticket: Ticket }) => {
      console.log('🎫 Socket ticket event received:', data.action, data.ticket?.id)

      if (data.action === 'update') {
        setTickets(prevTickets =>
          prevTickets.map(t => (t.id === data.ticket.id ? { ...t, ...data.ticket } : t))
        )

        setSelectedTicket(prevSelected => {
          if (prevSelected && prevSelected.id === data.ticket.id) {
            return { ...prevSelected, ...data.ticket }
          }
          return prevSelected
        })

        // Refresh counts when ticket status changes
        fetchTicketCounts()
      } else if (data.action === 'create') {
        // New ticket - refresh the list
        fetchTickets()
        fetchTicketCounts()
      } else if (data.action === 'delete') {
        // Get ticketId from either data.ticket.id or data.ticketId
        const ticketId = data.ticket?.id || (data as any).ticketId
        if (ticketId) {
          setTickets(prevTickets => prevTickets.filter(t => t.id !== ticketId))
          setSelectedTicket(prevSelected => {
            if (prevSelected && prevSelected.id === ticketId) {
              return null
            }
            return prevSelected
          })
          fetchTicketCounts()
        }
      }
    }

    // Register listeners
    socket.on(messageEvent, handleAppMessage)
    socket.on(ticketEvent, handleTicketUpdate)

    console.log(`✅ Socket listeners registered for ${messageEvent} and ${ticketEvent}`)

    // Cleanup on unmount
    return () => {
      console.log(`🔌 Removing socket listeners for company ${companyId}`)
      socket.off(messageEvent, handleAppMessage)
      socket.off(ticketEvent, handleTicketUpdate)
    }
  }, [user?.companyId, fetchTicketCounts])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchTickets = async () => {
    try {
      setLoading(true)
      const params: any = {
        showAll: showAll ? 'true' : 'false',
      }

      // Solo enviar status si no es 'all'
      if (statusFilter && statusFilter !== 'all') {
        params.status = statusFilter
      }

      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      if (whatsappFilter) params.whatsappIds = JSON.stringify([Number(whatsappFilter)])
      if (userFilter) params.users = JSON.stringify([Number(userFilter)])
      if (queueFilter) params.queueIds = JSON.stringify([Number(queueFilter)])
      if (searchMessages) params.searchOnMessages = 'true'

      const response = await api.get('/tickets', { params })
      const ticketsData = response.data.tickets || response.data || []

      if (ticketsData.length === 0) {
        setTickets([])
        setSelectedTicket(null)
        return
      }

      // Fetch messages for each ticket
      const ticketsWithMessages = await Promise.all(
        ticketsData.map(async (ticket: Ticket) => {
          try {
            const msgResponse = await api.get(`/messages/${ticket.id}`)
            return { ...ticket, messages: msgResponse.data.messages || [] }
          } catch {
            return { ...ticket, messages: [] }
          }
        })
      )

      setTickets(ticketsWithMessages)
      if (ticketsWithMessages.length > 0 && !selectedTicket) {
        setSelectedTicket(ticketsWithMessages[0])
      }
    } catch (error: any) {
      console.error('❌ Error fetching tickets:', error?.response?.data || error.message || error)
      setTickets([])
      setSelectedTicket(null)
    } finally {
      setLoading(false)
    }
  }

  const fetchFilterOptions = async () => {
    try {
      const [usersRes, queuesRes, whatsappsRes] = await Promise.all([
        api.get('/users'),
        api.get('/queues'),
        api.get('/whatsapps')
      ])

      setUsers(usersRes.data.users || usersRes.data || [])
      setQueues(queuesRes.data.queues || queuesRes.data || [])
      setWhatsapps(whatsappsRes.data.whatsapps || whatsappsRes.data || [])
    } catch (error) {
      console.error('Error fetching filter options:', error)
    }
  }

  const handleCloseTicket = async (ticketId?: number) => {
    const id = ticketId || selectedTicket?.id
    if (!id) return
    try {
      await api.put(`/tickets/${id}`, { status: 'closed' })
      fetchTickets()
      fetchTicketCounts() // Actualizar contadores
    } catch (error) {
      console.error('Error closing ticket:', error)
    }
  }

  const handleAcceptTicket = async (ticket: Ticket) => {
    try {
      const newStatus = ticket.isGroup ? 'group' : 'open'
      await api.put(`/tickets/${ticket.id}`, { status: newStatus })
      // Cambiar a la tab del nuevo estado
      setStatusFilter(newStatus)
      fetchTickets()
      fetchTicketCounts() // Actualizar contadores
      setSelectedTicket({ ...ticket, status: newStatus })
    } catch (error) {
      console.error('Error accepting ticket:', error)
    }
  }

  const handleReopenTicket = async (ticket: Ticket) => {
    try {
      await api.put(`/tickets/${ticket.id}`, { status: 'open' })
      // Cambiar a la tab de abiertos
      setStatusFilter('open')
      fetchTickets()
      fetchTicketCounts() // Actualizar contadores
      setSelectedTicket({ ...ticket, status: 'open' })
    } catch (error) {
      console.error('Error reopening ticket:', error)
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)

    if (diffInHours < 24) {
      return formatTime(dateString)
    } else {
      return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
    }
  }

  const filteredTickets = tickets.filter(
    (ticket) =>
      ticket.contact?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.contact?.number.includes(searchTerm) ||
      ticket.lastMessage?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <OpenIcon sx={{ fontSize: 16, color: 'success.main' }} />
      case 'pending':
        return <PendingIcon sx={{ fontSize: 16, color: 'warning.main' }} />
      case 'closed':
        return <ResolvedIcon sx={{ fontSize: 16, color: 'neutral.main' }} />
      default:
        return null
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open':
        return 'Abierto'
      case 'pending':
        return 'Pendiente'
      case 'closed':
        return 'Cerrado'
      default:
        return status
    }
  }


  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 120px)', bgcolor: 'background.body' }}>
      {/* Sidebar - Tickets List */}
      <Box
        sx={{
          width: 400,
          borderRight: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.surface',
        }}
      >
        {/* Sidebar Header */}
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography level="h4">Chats</Typography>
              <Tooltip title={showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}>
                <IconButton
                  size="sm"
                  variant={showFilters ? 'solid' : 'outlined'}
                  color={showFilters ? 'primary' : 'neutral'}
                  onClick={() => setShowFilters(!showFilters)}
                >
                  {showFilters ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </Tooltip>
            </Stack>
            <Input
              placeholder="Buscar tickets y mensajes..."
              startDecorator={<SearchIcon />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              size="sm"
            />

            {/* Filtros colapsables */}
            {showFilters && (
              <>
                {/* Date Range Filters */}
                <Stack direction="row" spacing={1}>
                  <FormControl size="sm" sx={{ flex: 1 }}>
                    <FormLabel>Fecha Inicio</FormLabel>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      size="sm"
                    />
                  </FormControl>
                  <FormControl size="sm" sx={{ flex: 1 }}>
                    <FormLabel>Fecha Fin</FormLabel>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      size="sm"
                    />
                  </FormControl>
                </Stack>

                {/* Connection Filter */}
                <FormControl size="sm">
                  <FormLabel>Conexión (WhatsApp)</FormLabel>
                  <Select
                    value={whatsappFilter}
                    onChange={(_, value) => setWhatsappFilter(value as string)}
                    size="sm"
                  >
                    <Option value="">Todas las conexiones</Option>
                    {whatsapps.map((whatsapp) => (
                      <Option key={whatsapp.id} value={whatsapp.id.toString()}>
                        {whatsapp.name}
                      </Option>
                    ))}
                  </Select>
                </FormControl>

                {/* Users Filter */}
                <FormControl size="sm">
                  <FormLabel>Usuario</FormLabel>
                  <Select
                    value={userFilter}
                    onChange={(_, value) => setUserFilter(value as string)}
                    size="sm"
                  >
                    <Option value="">Todos los usuarios</Option>
                    {users.map((user) => (
                      <Option key={user.id} value={user.id.toString()}>
                        {user.name}
                      </Option>
                    ))}
                  </Select>
                </FormControl>

                {/* Queues Filter */}
                <FormControl size="sm">
                  <FormLabel>Cola</FormLabel>
                  <Select
                    value={queueFilter}
                    onChange={(_, value) => setQueueFilter(value as string)}
                    size="sm"
                  >
                    <Option value="">Todas las colas</Option>
                    {queues.map((queue) => (
                      <Option key={queue.id} value={queue.id.toString()}>
                        {queue.name}
                      </Option>
                    ))}
                  </Select>
                </FormControl>

                {/* Search Messages Toggle */}
                <FormControl orientation="horizontal" sx={{ alignItems: 'center' }}>
                  <FormLabel>Buscar en mensajes</FormLabel>
                  <Switch
                    checked={searchMessages}
                    onChange={(e) => setSearchMessages(e.target.checked)}
                    size="sm"
                  />
                </FormControl>
              </>
            )}

            <Stack direction="row" spacing={1} alignItems="center">
              <Tooltip
                title={showAll ? 'Mostrar solo mis tickets' : 'Mostrar todos los tickets'}
                placement="top"
              >
                <IconButton
                  size="sm"
                  variant="outlined"
                  color={showAll ? 'primary' : 'neutral'}
                  onClick={() => {
                    setShowAll(!showAll)
                    fetchTicketCounts()
                  }}
                >
                  {showAll ? <VisibilityIcon /> : <VisibilityOffIcon />}
                </IconButton>
              </Tooltip>
              <IconButton size="sm" variant="outlined" onClick={() => {
                fetchTickets()
                fetchTicketCounts()
              }}>
                <RefreshIcon />
              </IconButton>
            </Stack>
          </Stack>
        </Box>

        {/* Tabs con contadores - Diseño moderno */}
        <Box sx={{
          p: 1.5,
          bgcolor: 'background.level1',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}>
          <Tabs
            value={statusFilter}
            onChange={(_, value) => {
              if (value !== null) {
                setStatusFilter(value as string)
              }
            }}
            sx={{
              bgcolor: 'transparent',
              '--Tabs-gap': '8px',
            }}
          >
            <TabList
              disableUnderline
              sx={{
                display: 'flex',
                gap: 1,
                p: 0.5,
                borderRadius: 'xl',
                bgcolor: 'background.surface',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              {/* Tab Abiertos - Verde */}
              <Tab
                value="open"
                disableIndicator
                sx={{
                  flex: 1,
                  py: 1.5,
                  px: 1,
                  borderRadius: 'lg',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  minHeight: 75,
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    bgcolor: 'rgba(34, 197, 94, 0.1)',
                    transform: 'translateY(-1px)',
                  },
                  '&[aria-selected="true"]': {
                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    color: 'white',
                    boxShadow: '0 4px 12px rgba(34, 197, 94, 0.4)',
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                <Stack direction="column" spacing={0.5} alignItems="center">
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <MessageIcon sx={{ fontSize: 22 }} />
                    <Typography
                      level="body-sm"
                      sx={{
                        fontWeight: 700,
                        color: 'inherit',
                      }}
                    >
                      Abiertos
                    </Typography>
                  </Stack>
                  <Chip
                    size="md"
                    variant="solid"
                    sx={{
                      bgcolor: statusFilter === 'open' ? 'rgba(255,255,255,0.3)' : '#22c55e',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      minWidth: 28,
                      height: 22,
                      px: 1.5,
                    }}
                  >
                    {openCount}
                  </Chip>
                </Stack>
              </Tab>

              {/* Tab Pendientes - Naranja */}
              <Tab
                value="pending"
                disableIndicator
                sx={{
                  flex: 1,
                  py: 1.5,
                  px: 1,
                  borderRadius: 'lg',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  minHeight: 75,
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    bgcolor: 'rgba(249, 115, 22, 0.1)',
                    transform: 'translateY(-1px)',
                  },
                  '&[aria-selected="true"]': {
                    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                    color: 'white',
                    boxShadow: '0 4px 12px rgba(249, 115, 22, 0.4)',
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                <Stack direction="column" spacing={0.5} alignItems="center">
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <AccessTimeIcon sx={{ fontSize: 22 }} />
                    <Typography
                      level="body-sm"
                      sx={{
                        fontWeight: 700,
                        color: 'inherit',
                      }}
                    >
                      Pendientes
                    </Typography>
                  </Stack>
                  <Chip
                    size="md"
                    variant="solid"
                    sx={{
                      bgcolor: statusFilter === 'pending' ? 'rgba(255,255,255,0.3)' : '#f97316',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      minWidth: 28,
                      height: 22,
                      px: 1.5,
                    }}
                  >
                    {pendingCount}
                  </Chip>
                </Stack>
              </Tab>

              {/* Tab Grupos - Azul */}

              <Tab
                value="group"
                disableIndicator
                sx={{
                  flex: 1,
                  py: 1.5,
                  px: 1,
                  borderRadius: 'lg',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  minHeight: 75,
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    bgcolor: 'rgba(59, 130, 246, 0.1)',
                    transform: 'translateY(-1px)',
                  },
                  '&[aria-selected="true"]': {
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: 'white',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                <Stack direction="column" spacing={0.5} alignItems="center">
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <GroupIcon sx={{ fontSize: 22 }} />
                    <Typography
                      level="body-sm"
                      sx={{
                        fontWeight: 700,
                        color: 'inherit',
                      }}
                    >
                      Grupos
                    </Typography>
                  </Stack>
                  <Chip
                    size="md"
                    variant="solid"
                    sx={{
                      bgcolor: statusFilter === 'group' ? 'rgba(255,255,255,0.3)' : '#3b82f6',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      minWidth: 28,
                      height: 22,
                      px: 1.5,
                    }}
                  >
                    {groupCount}
                  </Chip>
                </Stack>
              </Tab>

              {/* Tab Cerrados - Gris */}
              <Tab
                value="closed"
                disableIndicator
                sx={{
                  flex: 1,
                  py: 1.5,
                  px: 2,
                  borderRadius: 'lg',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    bgcolor: 'rgba(107, 114, 128, 0.1)',
                    transform: 'translateY(-1px)',
                  },
                  '&[aria-selected="true"]': {
                    background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                    color: 'white',
                    boxShadow: '0 4px 12px rgba(107, 114, 128, 0.4)',
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                <Stack direction="column" spacing={0.5} alignItems="center">
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <CheckBoxIcon sx={{ fontSize: 22 }} />
                    <Typography
                      level="body-sm"
                      sx={{
                        fontWeight: 700,
                        color: 'inherit',
                      }}
                    >
                      Cerrados
                    </Typography>
                  </Stack>
                  <Chip
                    size="md"
                    variant="solid"
                    sx={{
                      bgcolor: statusFilter === 'closed' ? 'rgba(255,255,255,0.3)' : '#6b7280',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      minWidth: 28,
                      height: 22,
                      px: 1.5,
                    }}
                  >
                    {closedCount}
                  </Chip>
                </Stack>
              </Tab>
            </TabList>
          </Tabs>
        </Box>

        {/* Tickets List */}
        <Sheet sx={{ overflow: 'auto', flex: 1 }}>
          <List sx={{ py: 0 }}>
            {loading ? (
              <ListItem>
                <Typography level="body-sm" sx={{ p: 2 }}>
                  Cargando chats...
                </Typography>
              </ListItem>
            ) : filteredTickets.length === 0 ? (
              <ListItem>
                <Typography level="body-sm" sx={{ p: 2, color: 'text.tertiary' }}>
                  No se encontraron chats
                </Typography>
              </ListItem>
            ) : (
              filteredTickets.map((ticket) => {
                // Función para obtener icono de canal
                const getChannelIcon = (channel?: string) => {
                  switch (channel) {
                    case 'whatsapp':
                      return <WhatsAppIcon sx={{ fontSize: 14, color: '#25D366' }} />
                    case 'telegram':
                      return <TelegramIcon sx={{ fontSize: 14, color: '#0088cc' }} />
                    case 'facebook':
                      return <FacebookIcon sx={{ fontSize: 14, color: '#4267B2' }} />
                    case 'instagram':
                      return <InstagramIcon sx={{ fontSize: 14, color: '#E1306C' }} />
                    default:
                      return <WhatsAppIcon sx={{ fontSize: 14, color: '#25D366' }} />
                  }
                }

                // Función para obtener color del canal
                const getChannelColor = (channel?: string) => {
                  switch (channel) {
                    case 'whatsapp': return '#25D366'
                    case 'telegram': return '#0088cc'
                    case 'facebook': return '#4267B2'
                    case 'instagram': return '#E1306C'
                    default: return '#25D366'
                  }
                }

                return (
                  <ListItem key={ticket.id} sx={{ p: 0 }}>
                    <ListItemButton
                      selected={selectedTicket?.id === ticket.id}
                      onClick={() => setSelectedTicket(ticket)}
                      sx={{
                        py: 1.5,
                        px: 2,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        '&:hover': { bgcolor: 'background.level1' },
                      }}
                    >
                      <ListItemDecorator>
                        <Badge
                          badgeContent={ticket.unreadMessages}
                          color="danger"
                          size="sm"
                          invisible={ticket.unreadMessages === 0}
                        >
                          {ticket.isGroup ? (
                            <Avatar size="md">
                              <GroupIcon />
                            </Avatar>
                          ) : (
                            <Avatar size="md" src={ticket.contact?.urlPicture || ticket.contact?.profilePicUrl}>
                              {ticket.contact?.name.charAt(0)}
                            </Avatar>
                          )}
                        </Badge>
                      </ListItemDecorator>
                      <ListItemContent sx={{ ml: 1.5 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="start">
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            {/* Línea 1: Icono canal + Nombre + Cola */}
                            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.3 }}>
                              {getChannelIcon(ticket.channel || ticket.whatsapp?.channel)}
                              <Typography
                                level="title-sm"
                                sx={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  maxWidth: 150,
                                }}
                              >
                                {ticket.contact?.name}
                              </Typography>
                              {ticket.queue && (
                                <Chip
                                  size="sm"
                                  sx={{
                                    bgcolor: ticket.queue.color,
                                    color: 'white',
                                    minWidth: 'auto',
                                    px: 0.5,
                                    fontSize: '0.65rem',
                                    height: 18,
                                  }}
                                >
                                  {ticket.queue.name}
                                </Chip>
                              )}
                            </Stack>

                            {/* Línea 2: Número de teléfono */}
                            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.3 }}>
                              <PhoneIcon sx={{ fontSize: 12, color: 'text.tertiary' }} />
                              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                {ticket.contact?.number}
                              </Typography>
                            </Stack>

                            {/* Línea 3: Último mensaje */}
                            <Typography
                              level="body-xs"
                              sx={{
                                color: 'text.tertiary',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontWeight: ticket.unreadMessages > 0 ? 'bold' : 'normal',
                                mb: 0.3,
                              }}
                            >
                              {ticket.lastMessage}
                            </Typography>

                            {/* Línea 4: Conexión + Usuario */}
                            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.3 }}>
                              {ticket.whatsapp && (
                                <Chip
                                  size="sm"
                                  sx={{
                                    bgcolor: getChannelColor(ticket.channel || ticket.whatsapp?.channel),
                                    color: 'white',
                                    fontSize: '0.6rem',
                                    height: 16,
                                    px: 0.5,
                                  }}
                                >
                                  {ticket.whatsapp.name}
                                </Chip>
                              )}
                              {ticket.user && (
                                <Chip
                                  size="sm"
                                  sx={{
                                    bgcolor: '#333',
                                    color: 'white',
                                    fontSize: '0.6rem',
                                    height: 16,
                                    px: 0.5,
                                  }}
                                >
                                  {ticket.user.name}
                                </Chip>
                              )}
                              {getStatusIcon(ticket.status)}
                            </Stack>

                            {/* Línea 5: Tags (kanban y normales) */}
                            {ticket.tags && ticket.tags.length > 0 && (
                              <Stack direction="row" spacing={0.3} alignItems="center" flexWrap="wrap" useFlexGap>
                                {ticket.tags.map((tag) => (
                                  <Chip
                                    key={tag.id}
                                    size="sm"
                                    sx={{
                                      bgcolor: tag.color,
                                      color: 'white',
                                      fontSize: '0.6rem',
                                      height: 16,
                                      px: 0.5,
                                      border: tag.kanban === 1 ? '1px solid #fff' : 'none',
                                    }}
                                  >
                                    {tag.name}
                                  </Chip>
                                ))}
                              </Stack>
                            )}
                          </Box>
                          <Stack alignItems="flex-end" spacing={0.5} sx={{ ml: 1, flexShrink: 0 }}>
                            <Typography
                              level="body-xs"
                              sx={{
                                color: ticket.unreadMessages > 0 ? 'success.main' : 'text.tertiary',
                                fontWeight: ticket.unreadMessages > 0 ? 'bold' : 'normal',
                              }}
                            >
                              {formatDate(ticket.updatedAt)}
                            </Typography>
                            {/* Botones de acción según estado */}
                            <Stack direction="row" spacing={0.3}>
                              {/* Pending: Aceptar + Cerrar */}
                              {ticket.status === 'pending' && (
                                <>
                                  <Tooltip title="Aceptar">
                                    <IconButton
                                      size="sm"
                                      variant="soft"
                                      color="success"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleAcceptTicket(ticket)
                                      }}
                                      sx={{ minWidth: 24, minHeight: 24 }}
                                    >
                                      <CheckIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Cerrar">
                                    <IconButton
                                      size="sm"
                                      variant="soft"
                                      color="danger"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleCloseTicket(ticket.id)
                                      }}
                                      sx={{ minWidth: 24, minHeight: 24 }}
                                    >
                                      <ClearIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  </Tooltip>
                                </>
                              )}
                              {/* Open: Cerrar */}
                              {(ticket.status === 'open' || ticket.status === 'group') && (
                                <Tooltip title="Cerrar">
                                  <IconButton
                                    size="sm"
                                    variant="soft"
                                    color="danger"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleCloseTicket(ticket.id)
                                    }}
                                    sx={{ minWidth: 24, minHeight: 24 }}
                                  >
                                    <ClearIcon sx={{ fontSize: 14 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                              {/* Closed: Reabrir */}
                              {ticket.status === 'closed' && (
                                <Tooltip title="Reabrir">
                                  <IconButton
                                    size="sm"
                                    variant="soft"
                                    color="primary"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleReopenTicket(ticket)
                                    }}
                                    sx={{ minWidth: 24, minHeight: 24 }}
                                  >
                                    <ReplayIcon sx={{ fontSize: 14 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Stack>
                          </Stack>
                        </Stack>
                      </ListItemContent>
                    </ListItemButton>
                  </ListItem>
                )
              })
            )}
          </List>
        </Sheet>
      </Box>

      {/* Chat Area */}
      {selectedTicket ? (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Chat Header */}
          <Box
            sx={{
              p: 2,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.surface',
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" spacing={2} alignItems="center">
                {selectedTicket.isGroup ? (
                  <Avatar>
                    <GroupIcon />
                  </Avatar>
                ) : (
                  <Avatar src={selectedTicket.contact?.profilePicUrl}>
                    {selectedTicket.contact?.name.charAt(0)}
                  </Avatar>
                )}
                <Box>
                  <Typography level="title-md">{selectedTicket.contact?.name}</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      {selectedTicket.contact?.number}
                    </Typography>
                    {selectedTicket.queue && (
                      <>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          •
                        </Typography>
                        <Chip
                          size="sm"
                          variant="soft"
                          sx={{ bgcolor: selectedTicket.queue.color, color: 'white' }}
                        >
                          {selectedTicket.queue.name}
                        </Chip>
                      </>
                    )}
                    {selectedTicket.user && (
                      <>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          •
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {selectedTicket.user.name}
                        </Typography>
                      </>
                    )}
                  </Stack>
                </Box>
              </Stack>
              <Stack direction="row" spacing={1}>
                <Tooltip title={getStatusLabel(selectedTicket.status)}>
                  <Chip
                    size="sm"
                    startDecorator={getStatusIcon(selectedTicket.status)}
                    color={
                      selectedTicket.status === 'open'
                        ? 'success'
                        : selectedTicket.status === 'pending'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {getStatusLabel(selectedTicket.status)}
                  </Chip>
                </Tooltip>
                {selectedTicket.status !== 'closed' && (
                  <Button
                    size="sm"
                    variant="outlined"
                    color="danger"
                    startDecorator={<CloseIcon />}
                    onClick={() => handleCloseTicket()}
                  >
                    Cerrar
                  </Button>
                )}
                <Tooltip title="Ver datos del contacto">
                  <IconButton
                    size="sm"
                    variant="outlined"
                    color="primary"
                    onClick={() => setContactDrawerOpen(true)}
                  >
                    <ContactIcon />
                  </IconButton>
                </Tooltip>
                <IconButton size="sm" variant="plain">
                  <MoreIcon />
                </IconButton>
              </Stack>
            </Stack>
          </Box>

          {/* Messages */}
          <Box
            sx={{
              flex: 1,
              overflow: 'auto',
              p: 2,
              bgcolor: 'background.level1',
            }}
          >
            <Stack spacing={1.5}>
              {selectedTicket.messages.map((msg) => {
                const isOwn = msg.fromMe
                return (
                  <Box
                    key={msg.id}
                    sx={{
                      display: 'flex',
                      justifyContent: isOwn ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <Box
                      sx={{
                        maxWidth: '70%',
                        bgcolor: isOwn ? '#005C4B' : 'background.surface',
                        color: isOwn ? 'white' : 'text.primary',
                        p: 1.5,
                        borderRadius: isOwn ? '8px 8px 0 8px' : '8px 8px 8px 0',
                        boxShadow: 'sm',
                      }}
                    >
                      <Typography level="body-sm">{msg.body}</Typography>
                      <Stack
                        direction="row"
                        spacing={0.5}
                        alignItems="center"
                        justifyContent="flex-end"
                        sx={{ mt: 0.5 }}
                      >
                        <Typography
                          level="body-xs"
                          sx={{ color: isOwn ? 'rgba(255,255,255,0.7)' : 'text.tertiary' }}
                        >
                          {formatTime(msg.createdAt)}
                        </Typography>
                        {isOwn && msg.ack && (
                          <Typography
                            level="body-xs"
                            sx={{ color: 'rgba(255,255,255,0.7)' }}
                          >
                            {msg.ack === 3 ? '✓✓' : msg.ack === 2 ? '✓✓' : '✓'}
                          </Typography>
                        )}
                      </Stack>
                    </Box>
                  </Box>
                )
              })}
              <div ref={messagesEndRef} />
            </Stack>
          </Box>

          {/* Message Input */}
          <MessageInput
            ticketId={selectedTicket.id}
            ticketStatus={selectedTicket.status}
            ticketChannel={selectedTicket.isGroup ? 'group' : 'whatsapp'}
            droppedFiles={dragDropFiles}
            contactId={selectedTicket.contact?.id}
            onSendMessage={(msg) => {
              // Update local state after sending
              const newMessage: Message = {
                id: Date.now(),
                body: msg,
                fromMe: true,
                createdAt: new Date().toISOString(),
                ack: 1,
                read: false,
              }
              setSelectedTicket({
                ...selectedTicket,
                messages: [...selectedTicket.messages, newMessage],
                lastMessage: msg,
                updatedAt: newMessage.createdAt,
              })
            }}
          />
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'background.level1',
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            <Box
              component="img"
              src="/chateam-logo.png"
              alt="Chateam"
              sx={{ width: 300, height: 'auto', mb: 2, opacity: 0.5 }}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
            <Typography level="h4" sx={{ mb: 1, color: 'text.tertiary' }}>
              Selecciona un ticket para empezar a chatear
            </Typography>
          </Box>
        </Box>
      )}

      {/* Contact Drawer */}
      <ContactDrawer
        open={contactDrawerOpen}
        onClose={() => setContactDrawerOpen(false)}
        contact={selectedTicket?.contact || null}
        ticket={selectedTicket}
        loading={loading}
      />
    </Box>
  )
}
