import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { CssVarsProvider, useColorScheme } from '@mui/joy/styles'
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
  Edit as EditIcon,
  Save as SaveIcon,
  AttachMoney as MoneyIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
} from '@mui/icons-material'
import api from '../services/api'
import ContactDrawer from '../components/ContactDrawer'
import MessageInput from '../components/MessageInput'
import FacebookBackground from '../components/FacebookBackground'
import socketService from '../services/socket'
import { useAuth } from '../hooks/useAuth'
import { useMessageFormatting } from '../hooks/useMessageFormatting'
import DateSeparator from '../components/Messages/DateSeparator'
import TikTokCommentBubble from '../components/Messages/TikTokCommentBubble'
import { useThemeColors } from '../context/ThemeContext'

// URL del backend para medios
const BACKEND_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'https://appro.chateam.ws';

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
  dataJson?: string
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
  const location = useLocation()
  const { facebookTheme, facebookDesignTokens } = useThemeColors()
  const { mode, setMode } = useColorScheme()
  const isDark = mode === 'dark'

  // Scrollbar delgado estilo Shadcn
  const thinScrollbarSx = {
    '&::-webkit-scrollbar': { width: '4px' },
    '&::-webkit-scrollbar-track': { background: 'transparent' },
    '&::-webkit-scrollbar-thumb': {
      background: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
      borderRadius: '4px',
    },
    '&::-webkit-scrollbar-thumb:hover': {
      background: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
    },
    scrollbarWidth: 'thin' as const,
    scrollbarColor: isDark ? 'rgba(255,255,255,0.15) transparent' : 'rgba(0,0,0,0.15) transparent',
  }

  const { formatTime, formatDate, formatDateSeparator, formatTicketDate, shouldShowDateSeparator } = useMessageFormatting()

  const toggleTheme = () => {
    setMode(mode === 'light' ? 'dark' : 'light')
  }

  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchTerm(value)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearchTerm(value)
    }, 300)
  }, [])

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

  // Campaign Message (para mostrar banner de campaña publicitaria)
  const [campaignMessage, setCampaignMessage] = useState<any>(null)
  const [editingConversion, setEditingConversion] = useState(false)
  const [conversionNoteValue, setConversionNoteValue] = useState('')
  const [savingConversion, setSavingConversion] = useState(false)

  // Asignación manual de campaña
  const [campaigns, setCampaigns] = useState<{
    id: string
    name: string
    status: string
    effective_status?: string
    activeAds?: number // Cantidad de anuncios activos (viene del backend)
    insights?: {
      impressions: number
      clicks: number
      spend: number
    }
  }[]>([])
  const [ads, setAds] = useState<{ id: string; name: string; status: string; creative?: any }[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('')
  const [selectedAdId, setSelectedAdId] = useState<string>('')
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [loadingAds, setLoadingAds] = useState(false)
  const [assigning, setAssigning] = useState(false)

  // Customer Origin (Origen de Cliente)
  const [customerOrigins, setCustomerOrigins] = useState<{
    id: number
    name: string
    color: string
    isActive: boolean
  }[]>([])
  const [loadingOrigins, setLoadingOrigins] = useState(false)

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

  // Debounce fetchTicketCounts to avoid excessive API calls from socket events
  const fetchTicketCountsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debouncedFetchTicketCounts = useCallback(() => {
    if (fetchTicketCountsTimeoutRef.current) {
      clearTimeout(fetchTicketCountsTimeoutRef.current)
    }
    fetchTicketCountsTimeoutRef.current = setTimeout(() => {
      fetchTicketCounts()
    }, 2000)
  }, [fetchTicketCounts])

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

  // Cargar mensaje de campaña cuando cambie el ticket seleccionado
  useEffect(() => {
    const fetchCampaignMessage = async () => {
      if (!selectedTicket?.id) {
        setCampaignMessage(null)
        setConversionNoteValue('')
        setEditingConversion(false)
        return
      }
      try {
        const { data } = await api.get(`/campaign-messages/ticket/${selectedTicket.id}`)
        const msg = data?.[0] || null
        setCampaignMessage(msg)
        setConversionNoteValue(msg?.conversionNote || '')
        setEditingConversion(false)
      } catch (error) {
        console.log('No campaign message for this ticket')
        setCampaignMessage(null)
        setConversionNoteValue('')
      }
    }
    fetchCampaignMessage()
  }, [selectedTicket?.id])

  // Función para guardar el conversionNote
  const handleSaveConversionNote = async () => {
    if (!campaignMessage?.id) return
    setSavingConversion(true)
    try {
      const { data } = await api.put(`/campaign-messages/${campaignMessage.id}`, {
        conversionNote: conversionNoteValue
      })
      setCampaignMessage(data)
      setEditingConversion(false)
    } catch (error) {
      console.error('Error saving conversion note:', error)
    } finally {
      setSavingConversion(false)
    }
  }

  // Función para clasificar el estado de entrega (mismo criterio que CampaignsInsights)
  // Esta lógica evita marcar como "COMPLETADA" campañas que aún están activas con presupuesto diario
  const classifyCampaignDelivery = (campaign: any): string => {
    // 1. Si el usuario pausó manualmente la campaña
    if (campaign.status === 'PAUSED') return 'DESACTIVADA'

    // 2. Si effective_status indica que la campaña está completada a nivel de Meta
    if (campaign.effective_status === 'COMPLETED') return 'COMPLETADA'

    // 3. Si CAMPAIGN_PAUSED (pausada por Meta por presupuesto u otros motivos)
    // Solo marcar como completada si además tiene stop_time en el pasado O budget lifetime agotado
    if (campaign.effective_status === 'CAMPAIGN_PAUSED') {
      const hasValidStopTime = campaign.stop_time && campaign.stop_time !== '0000-00-00' && campaign.stop_time !== ''
      const stopTimePassed = hasValidStopTime && new Date(campaign.stop_time) < new Date()
      const budgetExhausted = campaign.budget_remaining !== undefined && Number(campaign.budget_remaining) <= 0
      const hasDailyBudget = campaign.daily_budget !== undefined && Number(campaign.daily_budget) > 0

      // Solo marcar completada si terminó realmente O no hay presupuesto diario activo
      if (stopTimePassed || (budgetExhausted && !hasDailyBudget)) {
        return 'COMPLETADA'
      }
      // De lo contrario está pausada pero podría reactivarse
      return 'PAUSADA'
    }

    // 4. Si el presupuesto lifetime se agotó Y no hay daily budget activo
    const hasLifetimeBudget = campaign.lifetime_budget !== undefined && Number(campaign.lifetime_budget) > 0
    const hasDailyBudget = campaign.daily_budget !== undefined && Number(campaign.daily_budget) > 0
    const budgetRemaining = campaign.budget_remaining !== undefined ? Number(campaign.budget_remaining) : null

    if (hasLifetimeBudget && !hasDailyBudget && budgetRemaining !== null && budgetRemaining <= 0) {
      return 'COMPLETADA'
    }

    // 5. Si la fecha de fin ya pasó (solo para campañas con lifetime budget)
    if (campaign.stop_time && campaign.stop_time !== '0000-00-00' && campaign.stop_time !== '') {
      const stopDate = new Date(campaign.stop_time)
      if (!isNaN(stopDate.getTime()) && stopDate < new Date()) {
        if (!hasDailyBudget || (budgetRemaining !== null && budgetRemaining <= 0)) {
          return 'COMPLETADA'
        }
      }
    }

    // 6. Si no hay ads activos (dato viene del backend)
    if (campaign.activeAds !== undefined && campaign.activeAds === 0) return 'NO_HAY_ANUNCIOS'

    // 7. Si status y effective_status son ACTIVE → la campaña está activa
    if (campaign.status === 'ACTIVE' && campaign.effective_status === 'ACTIVE') return 'ACTIVA'

    // 8. Si solo status es ACTIVE → también activa
    if (campaign.status === 'ACTIVE') return 'ACTIVA'

    // 9. Otros estados de efectivo
    if (campaign.effective_status === 'PAUSED' || campaign.effective_status === 'DELETED' || campaign.effective_status === 'ARCHIVED') {
      return 'DESACTIVADA'
    }

    // Default:假设 activa si tiene presupuesto
    if (hasDailyBudget || hasLifetimeBudget) {
      return 'ACTIVA'
    }

    return 'DESACTIVADA'
  }

  // Función para cargar campañas de Facebook (solo ACTIVAS CON ANUNCIOS)
  const fetchCampaigns = async () => {
    setLoadingCampaigns(true)
    try {
      // Usar /meta-marketing/campaigns en vez de /dashboard
      // porque dashboard usa Promise.all con 4 queries y si alguna falla (insights, ads), todo falla
      // campaigns ya incluye insights + activeAds count
      const { data } = await api.get('/meta-marketing/campaigns', {
        params: { period: 'last_30_days' }
      })

      // Filtrar solo campañas con estado "ACTIVA" (mismo criterio que CampaignsInsights)
      // Esto incluye: status ACTIVE + tiene ads activos (activeAds > 0)
      const allCampaigns = data.campaigns || data || []
      const activeCampaignsWithAds = allCampaigns.filter((campaign: any) => {
        return classifyCampaignDelivery(campaign) === 'ACTIVA'
      })
      setCampaigns(activeCampaignsWithAds)
    } catch (error) {
      console.error('Error fetching campaigns:', error)
      setCampaigns([])
    } finally {
      setLoadingCampaigns(false)
    }
  }

  // Función para cargar orígenes de cliente
  const fetchCustomerOrigins = async () => {
    setLoadingOrigins(true)
    try {
      const { data } = await api.get('/customer-origins', {
        params: { showAll: 'false' } // Solo activos
      })
      setCustomerOrigins(data.records || [])
    } catch (error) {
      console.error('Error fetching customer origins:', error)
      setCustomerOrigins([])
    } finally {
      setLoadingOrigins(false)
    }
  }

  // Referencia para evitar actualizaciones automáticas del Select
  const userInteractedWithOriginSelect = useRef(false)

  // Función para actualizar el origen del cliente en el ticket
  const handleUpdateCustomerOrigin = async (originId: number | string | null) => {
    if (!selectedTicket) return

    // Solo procesar si fue una interacción del usuario, no un cambio automático del Select
    if (!userInteractedWithOriginSelect.current) {
      console.log('🔍 [CustomerOrigin] Ignorando cambio automático del Select')
      return
    }
    userInteractedWithOriginSelect.current = false // Reset para la próxima vez

    // Convertir string vacío a null para el backend
    const finalOriginId = originId === '' || originId === null ? null : Number(originId)

    // Evitar enviar update si el valor no cambió realmente
    const currentOriginId = (selectedTicket as any)?.customerOriginId || null
    if (finalOriginId === currentOriginId) {
      console.log('🔍 [CustomerOrigin] Valor no cambió, ignorando')
      return
    }

    console.log('🔍 [CustomerOrigin] Actualizando:', { from: currentOriginId, to: finalOriginId })

    try {
      await api.put(`/tickets/${selectedTicket.id}`, {
        customerOriginId: finalOriginId
      })
      // Actualizar el ticket localmente
      setSelectedTicket({
        ...selectedTicket,
        customerOriginId: finalOriginId,
        customerOrigin: finalOriginId ? customerOrigins.find(o => o.id === finalOriginId) : null
      } as any)
      // También actualizar en la lista de tickets
      setTickets(prev => prev.map(t =>
        t.id === selectedTicket.id
          ? { ...t, customerOriginId: finalOriginId, customerOrigin: finalOriginId ? customerOrigins.find(o => o.id === finalOriginId) : null } as any
          : t
      ))
    } catch (error) {
      console.error('Error updating customer origin:', error)
    }
  }

  // Cargar anuncios cuando se selecciona una campaña
  useEffect(() => {
    if (!selectedCampaignId) {
      setAds([])
      setSelectedAdId('')
      return
    }
    const fetchAds = async () => {
      setLoadingAds(true)
      try {
        const { data } = await api.get(`/meta-marketing/campaigns/${selectedCampaignId}/ads`)
        setAds(data.ads || data || [])
      } catch (error) {
        console.error('Error fetching ads:', error)
        setAds([])
      } finally {
        setLoadingAds(false)
      }
    }
    fetchAds()
  }, [selectedCampaignId])

  // Función para asignar campaña manualmente al ticket
  const handleAssignCampaign = async () => {
    if (!selectedAdId || !selectedTicket) return

    const selectedAd = ads.find(ad => ad.id === selectedAdId)
    const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId)

    if (!selectedAd) return

    setAssigning(true)
    try {
      const { data } = await api.post('/campaign-messages', {
        ticketId: selectedTicket.id,
        contactId: selectedTicket.contact?.id,
        whatsappId: selectedTicket.whatsappId,
        sourceId: selectedAd.id,
        sourceType: 'MANUAL_ASSIGNMENT',
        headline: selectedAd.name,
        body: selectedAd.creative?.body,
        channel: 'facebook',
        campaignId: selectedCampaignId,
        campaignName: selectedCampaign?.name
      })
      setCampaignMessage(data)
      setConversionNoteValue(data?.conversionNote || '')
      setSelectedCampaignId('')
      setSelectedAdId('')
      setCampaigns([])
      setAds([])
    } catch (error: any) {
      console.error('Error assigning campaign:', error)
      alert(error?.response?.data?.error || 'Error al asignar campaña')
    } finally {
      setAssigning(false)
    }
  }

  // Limpiar selección de campaña cuando cambia el ticket
  useEffect(() => {
    setSelectedCampaignId('')
    setSelectedAdId('')
    setCampaigns([])
    setAds([])
  }, [selectedTicket?.id])

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
    const handleAppMessage = (data: { action: string; message: Message & { ticketId: number; wid?: string } }) => {
      console.log('📨 Socket appMessage received:', data.action, data.message?.id, 'wid:', (data.message as any)?.wid)

      if (data.action === 'create' || data.action === 'update') {
        // Dedup helper: find by id OR by wid (race condition can create different ids for same wid)
        const findMsgIndex = (messages: Message[]) => {
          const msg = data.message as any
          let idx = messages.findIndex(m => m.id === msg.id)
          if (idx < 0 && msg.wid) {
            idx = messages.findIndex(m => (m as any).wid === msg.wid)
          }
          return idx
        }

        // Update messages in the ticket list
        setTickets(prevTickets =>
          prevTickets.map(ticket => {
            if (ticket.id === data.message.ticketId) {
              const existingMsgIndex = findMsgIndex(ticket.messages)
              let updatedMessages: Message[]

              if (existingMsgIndex >= 0) {
                // Update existing message (keep higher ack)
                updatedMessages = [...ticket.messages]
                const existing = updatedMessages[existingMsgIndex] as any
                const incoming = data.message as any
                if (!existing.ack || (incoming.ack && incoming.ack >= existing.ack)) {
                  updatedMessages[existingMsgIndex] = data.message
                }
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
            const existingMsgIndex = findMsgIndex(prevSelected.messages)
            let updatedMessages: Message[]

            if (existingMsgIndex >= 0) {
              updatedMessages = [...prevSelected.messages]
              const existing = updatedMessages[existingMsgIndex] as any
              const incoming = data.message as any
              if (!existing.ack || (incoming.ack && incoming.ack >= existing.ack)) {
                updatedMessages[existingMsgIndex] = data.message
              }
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
        debouncedFetchTicketCounts()
      } else if (data.action === 'create') {
        // New ticket - refresh the list
        fetchTickets()
        debouncedFetchTicketCounts()
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
          debouncedFetchTicketCounts()
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
  }, [user?.companyId, debouncedFetchTicketCounts])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Auto-selección de ticket cuando se navega desde Contactos
  const pendingContactIdRef = useRef<number | null>(null)

  useEffect(() => {
    const state = location.state as { contactId?: number } | null
    if (state?.contactId) {
      pendingContactIdRef.current = state.contactId
      // Mostrar todos los tickets para encontrar el del contacto sin importar status
      setStatusFilter('all')
      setShowAll(true)
      // Limpiar el state para que no se repita al navegar dentro de tickets
      window.history.replaceState({}, '')
    }
  }, [location.state])

  const fetchTicketsAbortRef = useRef<AbortController | null>(null)

  const fetchTickets = async () => {
    try {
      // Cancel previous request
      if (fetchTicketsAbortRef.current) {
        fetchTicketsAbortRef.current.abort()
      }
      fetchTicketsAbortRef.current = new AbortController()
      const signal = fetchTicketsAbortRef.current.signal

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

      const response = await api.get('/tickets', { params, signal })
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
            const msgResponse = await api.get(`/messages/${ticket.id}`, { signal })
            return { ...ticket, messages: msgResponse.data.messages || [] }
          } catch {
            return { ...ticket, messages: [] }
          }
        })
      )

      setTickets(ticketsWithMessages)

      // Si venimos de Contactos, buscar y seleccionar el ticket del contacto
      if (pendingContactIdRef.current) {
        const contactTicket = ticketsWithMessages.find(
          (t: Ticket) => t.contactId === pendingContactIdRef.current
        )
        if (contactTicket) {
          setSelectedTicket(contactTicket)
        } else if (ticketsWithMessages.length > 0) {
          setSelectedTicket(ticketsWithMessages[0])
        }
        pendingContactIdRef.current = null
      } else if (ticketsWithMessages.length > 0 && !selectedTicket) {
        setSelectedTicket(ticketsWithMessages[0])
      }
    } catch (error: any) {
      if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return
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

  // formatTime, formatDate, formatTicketDate, formatDateSeparator, shouldShowDateSeparator
  // ahora vienen del hook useMessageFormatting()

  const filteredTickets = useMemo(() => tickets.filter(
    (ticket) =>
      ticket.contact?.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      ticket.contact?.number.includes(debouncedSearchTerm) ||
      ticket.lastMessage?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
  ), [tickets, debouncedSearchTerm])

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
    <CssVarsProvider theme={facebookTheme}>
      {/* Page background - fondo muted para contraste con la card */}
      <Box
        sx={{
          height: '100%',
          bgcolor: isDark ? '#111213' : '#F4F5F7',
          m: { xs: -2, sm: -3 },
          p: { xs: 2, sm: 3 },
        }}
      >
      {/* Card container unificado estilo Shadcn */}
      <Box
        sx={{
          display: 'flex',
          height: 'calc(100vh - 48px)',
          bgcolor: 'background.body',
          borderRadius: facebookDesignTokens.card.borderRadius,
          border: '1px solid',
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          boxShadow: isDark ? facebookDesignTokens.card.shadowDark : facebookDesignTokens.card.shadow,
          overflow: 'hidden',
        }}
      >
        {/* Sidebar - Tickets List */}
        <Box
          sx={{
            width: facebookDesignTokens.sidebar.width,
            minWidth: facebookDesignTokens.sidebar.width,
            maxWidth: facebookDesignTokens.sidebar.width,
            borderRight: '1px solid',
            borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'background.surface',
            overflow: 'hidden',
          }}
        >
        {/* Sidebar Header */}
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography level="h4" sx={{ fontWeight: 700 }}>Chats</Typography>
              <Stack direction="row" spacing={0.5}>
                <Tooltip
                  title={showAll ? 'Mostrar solo mis tickets' : 'Mostrar todos los tickets'}
                  placement="top"
                >
                  <IconButton
                    size="sm"
                    variant="plain"
                    color={showAll ? 'primary' : 'neutral'}
                    onClick={() => {
                      setShowAll(!showAll)
                      fetchTicketCounts()
                    }}
                    sx={{
                      borderRadius: '50%',
                      color: showAll ? '#5BC2D2' : 'text.secondary',
                      '&:hover': { bgcolor: 'background.level2', color: '#5BC2D2' },
                    }}
                  >
                    {showAll ? <VisibilityIcon sx={{ fontSize: 20 }} /> : <VisibilityOffIcon sx={{ fontSize: 20 }} />}
                  </IconButton>
                </Tooltip>
                <Tooltip title="Actualizar" placement="top">
                  <IconButton
                    size="sm"
                    variant="plain"
                    onClick={() => {
                      fetchTickets()
                      fetchTicketCounts()
                    }}
                    sx={{
                      borderRadius: '50%',
                      color: 'text.secondary',
                      '&:hover': { bgcolor: 'background.level2', color: '#5BC2D2' },
                    }}
                  >
                    <RefreshIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title={showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}>
                  <IconButton
                    size="sm"
                    variant={showFilters ? 'solid' : 'plain'}
                    color={showFilters ? 'primary' : 'neutral'}
                    onClick={() => setShowFilters(!showFilters)}
                    sx={{ borderRadius: '50%' }}
                  >
                    {showFilters ? <ExpandLessIcon sx={{ fontSize: 20 }} /> : <FilterIcon sx={{ fontSize: 20 }} />}
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
            <Input
              placeholder="Buscar tickets y mensajes..."
              startDecorator={<SearchIcon />}
              value={searchTerm}
              onChange={handleSearchChange}
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

          </Stack>
        </Box>

        {/* Tabs con contadores - Diseño moderno */}
        <Box sx={{
          p: 1.5,
          bgcolor: 'background.level1',
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
              <Tooltip
                title={
                  <Box sx={{ px: 1.5, py: 0.5, bgcolor: '#22c55e', borderRadius: '8px' }}>
                    <Typography sx={{ fontWeight: 700, color: 'white', fontSize: '0.875rem' }}>Abiertos</Typography>
                  </Box>
                }
                placement="top"
                variant="plain"
              >
                <Tab
                  value="open"
                  disableIndicator
                  sx={{
                    flex: 1,
                    py: 1.5,
                    px: 1,
                    borderRadius: 'lg',
                    fontWeight: 600,
                    minHeight: 46,
                    transition: 'background 0.2s ease, box-shadow 0.2s ease',
                    '&:hover': {
                      bgcolor: 'rgba(34, 197, 94, 0.1)',
                    },
                    '&[aria-selected="true"]': {
                      background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                      color: 'white',
                      boxShadow: '0 4px 12px rgba(34, 197, 94, 0.4)',
                    },
                  }}
                >
                  <Badge
                    badgeContent={openCount}
                    sx={{
                      '& .MuiBadge-badge': {
                        bgcolor: statusFilter === 'open' ? 'rgba(255,255,255,0.3)' : '#22c55e',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '0.65rem',
                        minWidth: 18,
                        height: 18,
                        top: -4,
                        right: -4,
                      },
                    }}
                  >
                    <MessageIcon sx={{ fontSize: 22 }} />
                  </Badge>
                </Tab>
              </Tooltip>

              {/* Tab Pendientes - Naranja */}
              <Tooltip
                title={
                  <Box sx={{ px: 1.5, py: 0.5, bgcolor: '#f97316', borderRadius: '8px' }}>
                    <Typography sx={{ fontWeight: 700, color: 'white', fontSize: '0.875rem' }}>Pendientes</Typography>
                  </Box>
                }
                placement="top"
                variant="plain"
              >
                <Tab
                  value="pending"
                  disableIndicator
                  sx={{
                    flex: 1,
                    py: 1.5,
                    px: 1,
                    borderRadius: 'lg',
                    fontWeight: 600,
                    minHeight: 46,
                    transition: 'background 0.2s ease, box-shadow 0.2s ease',
                    '&:hover': {
                      bgcolor: 'rgba(249, 115, 22, 0.1)',
                    },
                    '&[aria-selected="true"]': {
                      background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                      color: 'white',
                      boxShadow: '0 4px 12px rgba(249, 115, 22, 0.4)',
                    },
                  }}
                >
                  <Badge
                    badgeContent={pendingCount}
                    sx={{
                      '& .MuiBadge-badge': {
                        bgcolor: statusFilter === 'pending' ? 'rgba(255,255,255,0.3)' : '#f97316',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '0.65rem',
                        minWidth: 18,
                        height: 18,
                        top: -4,
                        right: -4,
                      },
                    }}
                  >
                    <AccessTimeIcon sx={{ fontSize: 22 }} />
                  </Badge>
                </Tab>
              </Tooltip>

              {/* Tab Grupos - Teal */}
              <Tooltip
                title={
                  <Box sx={{ px: 1.5, py: 0.5, bgcolor: '#5BC2D2', borderRadius: '8px' }}>
                    <Typography sx={{ fontWeight: 700, color: 'white', fontSize: '0.875rem' }}>Grupos</Typography>
                  </Box>
                }
                placement="top"
                variant="plain"
              >
                <Tab
                  value="group"
                  disableIndicator
                  sx={{
                    flex: 1,
                    py: 1.5,
                    px: 1,
                    borderRadius: 'lg',
                    fontWeight: 600,
                    minHeight: 46,
                    transition: 'background 0.2s ease, box-shadow 0.2s ease',
                    '&:hover': {
                      bgcolor: 'rgba(91, 194, 210, 0.1)',
                    },
                    '&[aria-selected="true"]': {
                      background: 'linear-gradient(135deg, #5BC2D2 0%, #4BA8B6 100%)',
                      color: 'white',
                      boxShadow: '0 4px 12px rgba(91, 194, 210, 0.4)',
                    },
                  }}
                >
                  <Badge
                    badgeContent={groupCount}
                    sx={{
                      '& .MuiBadge-badge': {
                        bgcolor: statusFilter === 'group' ? 'rgba(255,255,255,0.3)' : '#5BC2D2',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '0.65rem',
                        minWidth: 18,
                        height: 18,
                        top: -4,
                        right: -4,
                      },
                    }}
                  >
                    <GroupIcon sx={{ fontSize: 22 }} />
                  </Badge>
                </Tab>
              </Tooltip>

              {/* Tab Cerrados - Gris */}
              <Tooltip
                title={
                  <Box sx={{ px: 1.5, py: 0.5, bgcolor: '#6b7280', borderRadius: '8px' }}>
                    <Typography sx={{ fontWeight: 700, color: 'white', fontSize: '0.875rem' }}>Cerrados</Typography>
                  </Box>
                }
                placement="top"
                variant="plain"
              >
                <Tab
                  value="closed"
                  disableIndicator
                  sx={{
                    flex: 1,
                    py: 1.5,
                    px: 1,
                    borderRadius: 'lg',
                    fontWeight: 600,
                    minHeight: 46,
                    transition: 'background 0.2s ease, box-shadow 0.2s ease',
                    '&:hover': {
                      bgcolor: 'rgba(107, 114, 128, 0.1)',
                    },
                    '&[aria-selected="true"]': {
                      background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                      color: 'white',
                      boxShadow: '0 4px 12px rgba(107, 114, 128, 0.4)',
                    },
                  }}
                >
                  <Badge
                    badgeContent={closedCount}
                    sx={{
                      '& .MuiBadge-badge': {
                        bgcolor: statusFilter === 'closed' ? 'rgba(255,255,255,0.3)' : '#6b7280',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '0.65rem',
                        minWidth: 18,
                        height: 18,
                        top: -4,
                        right: -4,
                      },
                    }}
                  >
                    <CheckBoxIcon sx={{ fontSize: 22 }} />
                  </Badge>
                </Tab>
              </Tooltip>
            </TabList>
          </Tabs>
        </Box>

        {/* Tickets List */}
        <Sheet sx={{ overflowY: 'auto', overflowX: 'hidden', flex: 1, minHeight: 0, ...thinScrollbarSx }}>
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
                const getChannelIcon = (channel?: string, size: number = 13) => {
                  switch (channel) {
                    case 'whatsapp':
                      return <WhatsAppIcon sx={{ fontSize: size, color: '#25D366' }} />
                    case 'telegram':
                      return <TelegramIcon sx={{ fontSize: size, color: '#0088cc' }} />
                    case 'facebook':
                      return <FacebookIcon sx={{ fontSize: size, color: '#4267B2' }} />
                    case 'instagram':
                      return <InstagramIcon sx={{ fontSize: size, color: '#E1306C' }} />
                    default:
                      return <WhatsAppIcon sx={{ fontSize: size, color: '#25D366' }} />
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
                  <ListItem key={ticket.id} sx={{ p: 0, mx: 1, my: 0.5 }}>
                    <ListItemButton
                      selected={selectedTicket?.id === ticket.id}
                      onClick={() => setSelectedTicket(ticket)}
                      sx={{
                        py: 1.25,
                        px: 1.5,
                        gap: 3,
                        borderRadius: '14px',
                        transition: 'all 0.15s ease-in-out',
                        '&:hover': {
                          bgcolor: isDark ? '#3A3B3C' : '#F0F2F5',
                          '& .ticket-actions': { opacity: 1 },
                        },
                        '&.Mui-selected': {
                          bgcolor: isDark ? 'rgba(111,212,228,0.15)' : 'rgba(91,194,210,0.12)',
                          '&:hover': {
                            bgcolor: isDark ? 'rgba(111,212,228,0.2)' : 'rgba(91,194,210,0.18)',
                          },
                        },
                      }}
                    >
                      <ListItemDecorator>
                        <Box sx={{ position: 'relative' }}>
                          <Badge
                            badgeContent={ticket.unreadMessages}
                            size="sm"
                            invisible={ticket.unreadMessages === 0}
                            anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
                            sx={{
                              '& .MuiBadge-badge': {
                                transform: 'translate(-25%, -25%)',
                                zIndex: 2,
                                bgcolor: getChannelColor(ticket.channel),
                                color: 'white',
                              },
                            }}
                          >
                            {ticket.isGroup ? (
                              <Avatar size="lg" sx={{ width: 48, height: 48 }}>
                                <GroupIcon />
                              </Avatar>
                            ) : (
                              <Avatar size="lg" src={ticket.contact?.urlPicture || ticket.contact?.profilePicUrl} sx={{ width: 48, height: 48 }}>
                                {ticket.contact?.name.charAt(0)}
                              </Avatar>
                            )}
                          </Badge>
                          {/* Channel icon overlay en el avatar */}
                          <Box
                            sx={{
                              position: 'absolute',
                              bottom: -2,
                              right: -2,
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              bgcolor: isDark ? '#242526' : '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              zIndex: 1,
                              boxShadow: '0 0 0 1.5px ' + (isDark ? '#242526' : '#FFFFFF'),
                            }}
                          >
                            {getChannelIcon(ticket.channel || ticket.whatsapp?.channel)}
                          </Box>
                        </Box>
                      </ListItemDecorator>
                      <ListItemContent sx={{ minWidth: 0 }}>
                        {/* Linea 1: Nombre + Timestamp */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                            <Typography
                              level="title-sm"
                              noWrap
                              sx={{
                                fontWeight: ticket.unreadMessages > 0 ? 700 : 600,
                                maxWidth: 160,
                              }}
                            >
                              {ticket.contact?.name}
                            </Typography>
                          </Stack>
                          <Typography
                            level="body-xs"
                            sx={{
                              color: ticket.unreadMessages > 0 ? '#5BC2D2' : 'text.tertiary',
                              fontWeight: ticket.unreadMessages > 0 ? 700 : 400,
                              flexShrink: 0,
                              fontSize: '11px',
                            }}
                          >
                            {formatTicketDate(ticket.updatedAt)}
                          </Typography>
                        </Stack>

                        {/* Linea 2: Ultimo mensaje */}
                        <Typography
                          level="body-xs"
                          noWrap
                          sx={{
                            color: ticket.unreadMessages > 0 ? 'text.primary' : 'text.tertiary',
                            fontWeight: ticket.unreadMessages > 0 ? 600 : 400,
                            mt: 0.5,
                            pr: 2,
                          }}
                        >
                          {ticket.lastMessage || 'Sin mensajes'}
                        </Typography>

                        {/* Linea 3: Cola + Usuario + Tags compactos + Botones accion */}
                        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="space-between" sx={{ mt: 0.5 }}>
                          <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ minWidth: 0, flex: 1 }}>
                            {ticket.queue && (
                              <Chip
                                size="sm"
                                sx={{
                                  bgcolor: ticket.queue.color,
                                  color: 'white',
                                  fontSize: '0.6rem',
                                  height: 18,
                                  px: 0.5,
                                }}
                              >
                                {ticket.queue.name}
                              </Chip>
                            )}
                            {ticket.user && (
                              <Chip
                                size="sm"
                                variant="soft"
                                sx={{
                                  fontSize: '0.6rem',
                                  height: 18,
                                  px: 0.5,
                                }}
                              >
                                {ticket.user.name}
                              </Chip>
                            )}
                            {ticket.tags && ticket.tags.length > 0 && ticket.tags.slice(0, 2).map((tag) => (
                              <Chip
                                key={tag.id}
                                size="sm"
                                sx={{
                                  bgcolor: tag.color,
                                  color: 'white',
                                  fontSize: '0.55rem',
                                  height: 16,
                                  px: 0.5,
                                  border: tag.kanban === 1 ? '1px solid rgba(255,255,255,0.5)' : 'none',
                                }}
                              >
                                {tag.name}
                              </Chip>
                            ))}
                          </Stack>
                          {/* Botones de accion - visibles en hover */}
                          <Stack
                            className="ticket-actions"
                            direction="row"
                            spacing={0.3}
                            sx={{
                              opacity: selectedTicket?.id === ticket.id ? 1 : 0,
                              transition: 'opacity 0.15s ease',
                              flexShrink: 0,
                            }}
                          >
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
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {/* Campaign Banner - Muestra info de campaña O selector para asignar */}
          {campaignMessage ? (
            // ✅ HAY campaña asignada - Mostrar info + conversión
            <Box
              sx={(theme) => ({
                display: 'flex',
                alignItems: 'stretch',
                borderBottom: '1px solid',
                borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
              })}
            >
              {/* Sección Anuncio - Azul */}
              <Tooltip
                variant="outlined"
                title={
                  <Box sx={{ p: 1 }}>
                    <Typography level="body-xs" fontWeight="lg" sx={{ color: 'primary.600', mb: 0.5 }}>
                      Detalles del Anuncio
                    </Typography>
                    {campaignMessage.headline && (
                      <Typography level="body-xs" sx={{ color: 'text.secondary' }}>Título: {campaignMessage.headline}</Typography>
                    )}
                    {campaignMessage.sourceId && (
                      <Typography level="body-xs" sx={{ color: 'text.secondary' }}>Ad ID: {campaignMessage.sourceId}</Typography>
                    )}
                    {campaignMessage.ctwaClid && (
                      <Typography level="body-xs" sx={{ color: 'text.secondary' }}>CTWA: {campaignMessage.ctwaClid.substring(0, 20)}...</Typography>
                    )}
                    {campaignMessage.rawData?.manuallyAssigned && (
                      <Typography level="body-xs" sx={{ color: 'warning.500', fontStyle: 'italic' }}>Asignación manual</Typography>
                    )}
                  </Box>
                }
                placement="bottom-start"
              >
                <Box
                  sx={(theme) => ({
                    px: 1.5,
                    py: 0.75,
                    bgcolor: theme.palette.mode === 'dark' ? '#1C3A3F' : '#E8F8FA',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    cursor: 'pointer',
                    borderRight: '1px solid',
                    borderColor: theme.palette.mode === 'dark' ? '#5BC2D2' : '#9FE1EB',
                    '&:hover': {
                      bgcolor: theme.palette.mode === 'dark' ? '#3B8E9A' : '#C5EDF3',
                    },
                  })}
                >
                  <Typography sx={{ fontSize: 14 }}>📢</Typography>
                  <Typography level="body-xs" fontWeight="lg" sx={(theme) => ({ color: theme.palette.mode === 'dark' ? '#9FE1EB' : '#3B8E9A' })}>
                    {(campaignMessage.headline || campaignMessage.sourceId || 'Anuncio').substring(0, 25)}{(campaignMessage.headline || campaignMessage.sourceId || '').length > 25 ? '...' : ''}
                  </Typography>
                  {campaignMessage.rawData?.manuallyAssigned && (
                    <Chip size="sm" variant="soft" color="warning" sx={{ height: 16, fontSize: '0.55rem' }}>
                      Manual
                    </Chip>
                  )}
                  {campaignMessage.channel && (
                    <Chip size="sm" variant="solid" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#5BC2D2', color: 'white' }}>
                      {campaignMessage.channel}
                    </Chip>
                  )}
                </Box>
              </Tooltip>

              {/* Sección Conversión - Verde */}
              <Box
                sx={(theme) => ({
                  px: 1.5,
                  py: 0.75,
                  bgcolor: theme.palette.mode === 'dark' ? '#14532d' : '#dcfce7',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  flex: 1,
                })}
              >
                <MoneyIcon sx={(theme) => ({ fontSize: 16, color: theme.palette.mode === 'dark' ? '#86efac' : '#16a34a' })} />
                <Typography level="body-xs" fontWeight="lg" sx={(theme) => ({ color: theme.palette.mode === 'dark' ? '#86efac' : '#15803d', mr: 0.5 })}>
                  Conversión:
                </Typography>
                {editingConversion ? (
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flex: 1 }}>
                    <Input
                      size="sm"
                      placeholder="ej: $100"
                      value={conversionNoteValue}
                      onChange={(e) => setConversionNoteValue(e.target.value)}
                      sx={{ flex: 1, maxWidth: 140, '--Input-minHeight': '26px', fontSize: '0.75rem' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveConversionNote()
                        if (e.key === 'Escape') { setEditingConversion(false); setConversionNoteValue(campaignMessage?.conversionNote || '') }
                      }}
                      autoFocus
                    />
                    <IconButton size="sm" variant="solid" color="success" onClick={handleSaveConversionNote} loading={savingConversion} sx={{ minWidth: 26, minHeight: 26 }}>
                      <SaveIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                    <IconButton size="sm" variant="soft" color="neutral" onClick={() => { setEditingConversion(false); setConversionNoteValue(campaignMessage?.conversionNote || '') }} sx={{ minWidth: 26, minHeight: 26 }}>
                      <ClearIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Stack>
                ) : (
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    {campaignMessage.conversionNote ? (
                      <Chip size="sm" variant="solid" sx={{ height: 22, fontSize: '0.75rem', fontWeight: 700, bgcolor: '#16a34a', color: 'white' }}>
                        {campaignMessage.conversionNote}
                      </Chip>
                    ) : (
                      <Typography level="body-xs" sx={(theme) => ({ color: theme.palette.mode === 'dark' ? '#6b7280' : '#9ca3af', fontStyle: 'italic' })}>
                        Sin valor
                      </Typography>
                    )}
                    <Tooltip title="Editar conversión">
                      <IconButton size="sm" variant="soft" color="success" onClick={() => setEditingConversion(true)} sx={{ minWidth: 24, minHeight: 24 }}>
                        <EditIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                )}
              </Box>
            </Box>
          ) : (
            // ❌ NO hay campaña - Mostrar selector para asignar
            <Box
              sx={(theme) => ({
                px: 2,
                py: 1,
                bgcolor: theme.palette.mode === 'dark' ? '#1e293b' : '#f1f5f9',
                borderBottom: '1px solid',
                borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                flexWrap: 'wrap',
              })}
            >
              <Typography level="body-xs" fontWeight="lg" sx={{ color: 'text.secondary' }}>
                📢 Asignar a campaña:
              </Typography>

              {/* Select de Campañas */}
              <Select
                size="sm"
                placeholder="Seleccionar campaña..."
                value={selectedCampaignId}
                onChange={(_, value) => {
                  setSelectedCampaignId(value as string)
                  setSelectedAdId('')
                }}
                sx={{ minWidth: 200, '--Select-minHeight': '28px' }}
                slotProps={{ button: { sx: { fontSize: '0.75rem' } } }}
                onListboxOpenChange={(isOpen) => {
                  if (isOpen && campaigns.length === 0) fetchCampaigns()
                }}
              >
                {loadingCampaigns ? (
                  <Option value="" disabled>Cargando campañas...</Option>
                ) : campaigns.length === 0 ? (
                  <Option value="" disabled>No hay campañas disponibles</Option>
                ) : (
                  campaigns.map(campaign => (
                    <Option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </Option>
                  ))
                )}
              </Select>

              {/* Select de Anuncios (aparece cuando hay campaña seleccionada) */}
              {selectedCampaignId && (
                <Select
                  size="sm"
                  placeholder="Seleccionar anuncio..."
                  value={selectedAdId}
                  onChange={(_, value) => setSelectedAdId(value as string)}
                  sx={{ minWidth: 200, '--Select-minHeight': '28px' }}
                  slotProps={{ button: { sx: { fontSize: '0.75rem' } } }}
                >
                  {loadingAds ? (
                    <Option value="" disabled>Cargando anuncios...</Option>
                  ) : ads.length === 0 ? (
                    <Option value="" disabled>No hay anuncios en esta campaña</Option>
                  ) : (
                    ads.map(ad => (
                      <Option key={ad.id} value={ad.id}>
                        {ad.name}
                      </Option>
                    ))
                  )}
                </Select>
              )}

              {/* Botón Asignar (aparece cuando hay anuncio seleccionado) */}
              {selectedAdId && (
                <Button
                  size="sm"
                  color="primary"
                  variant="solid"
                  loading={assigning}
                  onClick={handleAssignCampaign}
                  sx={{ '--Button-minHeight': '28px' }}
                >
                  Asignar
                </Button>
              )}
            </Box>
          )}

          {/* Customer Origin Selector - Origen del Cliente */}
          <Box
            sx={(theme) => ({
              px: 2,
              py: 1,
              bgcolor: theme.palette.mode === 'dark' ? '#1a1a2e' : '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            })}
          >
            <Typography level="body-xs" fontWeight="lg" sx={{ color: 'text.secondary' }}>
              🎯 Origen:
            </Typography>
            <Select
              size="sm"
              placeholder="Seleccionar origen..."
              value={(selectedTicket as any)?.customerOriginId ?? ''}
              onChange={(_, value) => handleUpdateCustomerOrigin(value as number | string | null)}
              sx={{ minWidth: 180, '--Select-minHeight': '28px' }}
              slotProps={{ button: { sx: { fontSize: '0.75rem' } } }}
              onListboxOpenChange={(isOpen) => {
                if (isOpen) {
                  userInteractedWithOriginSelect.current = true // Marcar que el usuario abrió el dropdown
                  if (customerOrigins.length === 0) fetchCustomerOrigins()
                }
              }}
            >
              <Option value="">Sin origen</Option>
              {loadingOrigins ? (
                <Option value="" disabled>Cargando...</Option>
              ) : (
                customerOrigins.map(origin => (
                  <Option key={origin.id} value={origin.id}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          bgcolor: origin.color,
                        }}
                      />
                      <span>{origin.name}</span>
                    </Stack>
                  </Option>
                ))
              )}
            </Select>
            {(selectedTicket as any)?.customerOrigin && (
              <Chip
                size="sm"
                sx={{
                  bgcolor: (selectedTicket as any).customerOrigin.color,
                  color: 'white',
                  fontWeight: 'bold',
                }}
              >
                {(selectedTicket as any).customerOrigin.name}
              </Chip>
            )}
          </Box>

          {/* Chat Header - Messenger Style */}
          <Box
            sx={{
              px: 2,
              py: 1.5,
              borderBottom: '1px solid',
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
              bgcolor: 'background.surface',
              minHeight: 60,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: '100%' }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                {selectedTicket.isGroup ? (
                  <Avatar sx={{ width: 40, height: 40 }}>
                    <GroupIcon />
                  </Avatar>
                ) : (
                  <Avatar src={selectedTicket.contact?.profilePicUrl} sx={{ width: 40, height: 40 }}>
                    {selectedTicket.contact?.name.charAt(0)}
                  </Avatar>
                )}
                <Box>
                  <Typography level="title-sm" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                    {selectedTicket.contact?.name}
                  </Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Box sx={{
                      width: 8, height: 8, borderRadius: '50%',
                      bgcolor: selectedTicket.status === 'open' ? '#31A24C' : '#8A8D91',
                    }} />
                    <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '11px' }}>
                      {selectedTicket.status === 'open' ? 'Activo' : getStatusLabel(selectedTicket.status)}
                    </Typography>
                    {selectedTicket.queue && (
                      <>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>·</Typography>
                        <Chip size="sm" sx={{ bgcolor: selectedTicket.queue.color, color: 'white', height: 18, fontSize: '0.6rem' }}>
                          {selectedTicket.queue.name}
                        </Chip>
                      </>
                    )}
                    {selectedTicket.user && (
                      <>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>·</Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '11px' }}>
                          {selectedTicket.user.name}
                        </Typography>
                      </>
                    )}
                  </Stack>
                </Box>
              </Stack>

              <Stack direction="row" spacing={0.5}>
                {selectedTicket.status !== 'closed' && (
                  <Tooltip title="Cerrar ticket">
                    <IconButton
                      size="sm"
                      variant="plain"
                      color="danger"
                      onClick={() => handleCloseTicket()}
                      sx={{
                        borderRadius: '50%',
                        '&:hover': { bgcolor: isDark ? '#3A3B3C' : '#E4E6EB' },
                      }}
                    >
                      <CloseIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title="Ver contacto">
                  <IconButton
                    size="sm"
                    variant="plain"
                    onClick={() => setContactDrawerOpen(true)}
                    sx={{
                      borderRadius: '50%',
                      color: 'text.secondary',
                      '&:hover': { bgcolor: isDark ? '#3A3B3C' : '#E4E6EB', color: '#5BC2D2' },
                    }}
                  >
                    <ContactIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>
                <IconButton
                  size="sm"
                  variant="plain"
                  sx={{
                    borderRadius: '50%',
                    color: 'text.secondary',
                    '&:hover': { bgcolor: isDark ? '#3A3B3C' : '#E4E6EB' },
                  }}
                >
                  <MoreIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Stack>
            </Stack>
          </Box>

          {/* Messages */}
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              p: 2,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              ...thinScrollbarSx,
            }}
          >
            <FacebookBackground />
            <Stack spacing={0.5} sx={{ position: 'relative', zIndex: 1, marginTop: 'auto' }}>
              {selectedTicket.messages.map((msg, index) => {
                const isOwn = msg.fromMe
                const prevMsg = index > 0 ? selectedTicket.messages[index - 1] : null
                const showSeparator = shouldShowDateSeparator(msg, prevMsg)

                return (
                  <Box key={msg.id}>
                    {showSeparator && (
                      <DateSeparator
                        label={formatDateSeparator(msg.createdAt)}
                        isDark={isDark}
                      />
                    )}
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: isOwn ? 'flex-end' : 'flex-start',
                        mb: 0.25,
                      }}
                    >
                      {/* TikTok Comment: renderizar burbuja especial */}
                      {selectedTicket.channel === 'tiktok' && !isOwn && msg.dataJson ? (
                        <TikTokCommentBubble message={msg} />
                      ) : (
                      <Box
                        sx={{
                          maxWidth: facebookDesignTokens.message.maxWidth,
                          bgcolor: isOwn
                            ? (isDark
                                ? facebookDesignTokens.message.outgoing.background
                                : facebookDesignTokens.message.outgoing.backgroundLight)
                            : (isDark
                                ? facebookDesignTokens.message.incoming.background
                                : facebookDesignTokens.message.incoming.backgroundLight),
                          color: isOwn
                            ? (isDark
                                ? facebookDesignTokens.message.outgoing.color
                                : facebookDesignTokens.message.outgoing.colorLight)
                            : (isDark
                                ? facebookDesignTokens.message.incoming.color
                                : facebookDesignTokens.message.incoming.colorLight),
                          p: facebookDesignTokens.message.padding,
                          borderRadius: facebookDesignTokens.message.borderRadius,
                          borderTopRightRadius: isOwn ? '4px' : facebookDesignTokens.message.borderRadius,
                          borderTopLeftRadius: !isOwn ? '4px' : facebookDesignTokens.message.borderRadius,
                          boxShadow: isDark ? '0 1px 0.5px rgba(11,20,26,.13)' : '0 1px 0.5px rgba(0,0,0,.08)',
                        }}
                      >
                        {/* Renderizar media (imágenes, videos, audio, documentos) */}
                        {msg.mediaUrl && (
                          <Box sx={{ mb: 1 }}>
                            {msg.mediaType === 'image' && (
                              <Box
                                component="img"
                                src={`${BACKEND_URL}/public/company${user?.companyId}/${msg.mediaUrl}`}
                                alt="Imagen"
                                sx={{
                                  maxWidth: '100%',
                                  borderRadius: 1,
                                  cursor: 'pointer',
                                }}
                                onClick={() => window.open(`${BACKEND_URL}/public/company${user?.companyId}/${msg.mediaUrl}`, '_blank')}
                                onError={(e: any) => {
                                  console.error('Error cargando imagen:', msg.mediaUrl)
                                  e.currentTarget.style.display = 'none'
                                }}
                              />
                            )}
                            {msg.mediaType === 'video' && (
                              <Box
                                component="video"
                                controls
                                src={`${BACKEND_URL}/public/company${user?.companyId}/${msg.mediaUrl}`}
                                sx={{ maxWidth: '100%', borderRadius: 1 }}
                              />
                            )}
                            {msg.mediaType === 'audio' && (
                              <Box
                                component="audio"
                                controls
                                src={`${BACKEND_URL}/public/company${user?.companyId}/${msg.mediaUrl}`}
                                sx={{ width: '100%' }}
                              />
                            )}
                            {msg.mediaType !== 'image' && msg.mediaType !== 'video' && msg.mediaType !== 'audio' && (
                              <Box
                                component="a"
                                href={`/company${user?.companyId}/${msg.mediaUrl}`}
                                target="_blank"
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  p: 1,
                                  borderRadius: 1,
                                  bgcolor: isOwn ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                  color: 'inherit',
                                  textDecoration: 'none',
                                  '&:hover': { bgcolor: isOwn ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)' }
                                }}
                              >
                                <Box component="span" sx={{ fontSize: 20 }}>📎</Box>
                                <Typography level="body-sm">{msg.mediaUrl}</Typography>
                              </Box>
                            )}
                          </Box>
                        )}
                        <Typography level="body-sm" sx={{ color: 'inherit', wordBreak: 'break-word' }}>{msg.body}</Typography>
                        <Stack
                          direction="row"
                          spacing={0.5}
                          alignItems="center"
                          justifyContent="flex-end"
                          sx={{ mt: 0.25 }}
                        >
                          <Typography
                            sx={{
                              fontSize: '11px',
                              lineHeight: 1,
                              color: isOwn
                                ? 'rgba(255,255,255,0.6)'
                                : (isDark ? '#8A8D91' : 'rgba(5,5,5,0.45)'),
                              userSelect: 'none',
                            }}
                          >
                            {formatTime(msg.createdAt)}
                          </Typography>
                          {isOwn && msg.ack !== undefined && (
                            <Typography
                              sx={{
                                fontSize: '11px',
                                lineHeight: 1,
                                color: msg.ack >= 3
                                  ? '#5BC2D2'
                                  : 'rgba(255,255,255,0.5)',
                              }}
                            >
                              {msg.ack >= 2 ? '✓✓' : '✓'}
                            </Typography>
                          )}
                        </Stack>
                      </Box>
                      )}
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
            ticketChannel={selectedTicket.channel === 'tiktok' ? 'tiktok' : selectedTicket.isGroup ? 'group' : (selectedTicket.channel || 'whatsapp')}
            droppedFiles={dragDropFiles}
            contactId={selectedTicket.contact?.id}
            onSendMessage={(msg) => {
              // Feedback inmediato: actualizar lastMessage y updatedAt
              // El mensaje real se mostrará cuando el socket emita el evento
              setSelectedTicket((prev) => prev ? {
                ...prev,
                lastMessage: msg,
                updatedAt: new Date().toISOString(),
              } : null)
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
            position: 'relative',
            bgcolor: isDark ? '#18191A' : '#FAFBFC',
          }}
        >
          <FacebookBackground />
          <Box sx={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
            {/* Circulo decorativo con icono */}
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                bgcolor: isDark ? 'rgba(91,194,210,0.1)' : 'rgba(91,194,210,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 3,
              }}
            >
              <MessageIcon sx={{ fontSize: 36, color: '#5BC2D2', opacity: 0.7 }} />
            </Box>
            <Box
              component="img"
              src="/chateam-logo.png"
              alt="Chateam"
              sx={{ width: 200, height: 'auto', mb: 2, opacity: 0.35 }}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
            <Typography level="title-lg" sx={{ mb: 1, color: 'text.secondary', fontWeight: 600 }}>
              Selecciona una conversacion
            </Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary', maxWidth: 300, mx: 'auto', lineHeight: 1.6 }}>
              Elige un ticket de la lista para ver los mensajes y comenzar a chatear
            </Typography>
            <Typography level="body-xs" sx={{ color: '#5BC2D2', opacity: 0.5, mt: 3 }}>
              Powered by Chateam
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
    </Box>
    </CssVarsProvider>
  )
}
