import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ContactAvatar } from '@/components/ui/contact-avatar'
import { ColorTag } from '@/components/ui/color-tag'
import { useLocation } from 'react-router-dom'
import DateRangePicker from '../components/DateRangePicker'
import { CssVarsProvider, useColorScheme } from '@mui/joy/styles'
import {
  Stack,
  Input,
  Badge,
  Sheet,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
  FormControl,
  FormLabel,
  Switch,
  Autocomplete,
  LinearProgress,
  CircularProgress,
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
  DoneAll as DoneAllIcon,
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
  Reply as ReplyIcon,
  Forward as ForwardIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Download as DownloadIcon,
} from '@mui/icons-material'
import api from '../services/api'
import logger from '../utils/logger'
import { Button } from '@/components/ui/button'
import { Badge as UIBadge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'react-toastify'
import ContactDrawer from '../components/ContactDrawer'
import formatLastMessagePreview from '../utils/formatLastMessagePreview'
import AcceptTicketModal from '../components/AcceptTicketModal'
import MessageInput, { type OptimisticMediaMessage } from '../components/MessageInput'
import socketService from '../services/socket'
import { useAuth } from '../hooks/useAuth'
import { useMessageFormatting } from '../hooks/useMessageFormatting'
import DateSeparator from '../components/Messages/DateSeparator'
import TikTokCommentBubble from '../components/Messages/TikTokCommentBubble'
import MessageContent from '../components/Messages/MessageContent'
import ChannelBadge from '../components/Messages/ChannelBadge'
import RoutingPolicySelector from '../components/Messages/RoutingPolicySelector'
import MetaWindowIndicator from '../components/Messages/MetaWindowIndicator'
import DispatchTimeline from '../components/Messages/DispatchTimeline'
import ConversationSearchBar from '../components/Messages/ConversationSearchBar'
import MediaLightbox from '../components/Messages/MediaLightbox'
import ForwardSelectionBar from '../components/ForwardSelectionBar'
import ForwardContactPicker from '../components/ForwardContactPicker'
import { useThemeColors } from '../context/ThemeContext'
import type { Message } from '../types/Message'
import {
  displayContactName,
  displayContactSubtitle,
  mergeContactPreservingName,
} from '../utils/contactDisplay'

// URL del backend para medios
const BACKEND_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'https://appro.chateam.ws';

const dragEventHasFiles = (event: React.DragEvent<HTMLDivElement>) => (
  Array.from(event.dataTransfer.types || []).includes('Files')
)

const getChatBackgroundSx = (isDark: boolean) => {
  // Nuevo patrón de fondo del chat (imágenes PNG con transparencia):
  //  - claro → patron-fondo-claro.png sobre fondo BLANCO (#FFFFFF)
  //  - oscuro → patron-fondo-oscuro.png sobre fondo oscuro (#18191A)
  // [Fase C] WebP: patrón de fondo pasó de ~2.9 MB (PNG) a ~0.56 MB total.
  const pattern = isDark ? '/patron-fondo-oscuro.webp' : '/patron-fondo-claro.webp'

  return {
    backgroundColor: isDark ? '#18191A' : '#FFFFFF',
    backgroundImage: `url("${pattern}")`,
    // Patrón de iconos en mosaico (repetible). backgroundSize controla el
    // tamaño de los iconos; 'auto' mantiene la proporción del PNG.
    backgroundRepeat: 'repeat',
    // Iconos al doble de tamaño (620 -> 1240px). El PNG nativo es 3841px de
    // ancho, así que a 1240px sigue reduciéndose desde el original: sin pérdida
    // de calidad (se ve nítido).
    backgroundSize: '1240px auto',
    backgroundPosition: 'center top',
  }
}

const isRequestCanceled = (error: any) => (
  error?.name === 'CanceledError' ||
  error?.code === 'ERR_CANCELED' ||
  error?.name === 'AbortError'
)

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
  profile?: string
  whatsappId?: number | null
  queues?: Queue[]
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
  messagesPageNumber?: number
  messagesHasMore?: boolean
  createdAt: string
  updatedAt: string
}

export default function Tickets() {
  const { user } = useAuth()
  const location = useLocation()
  const { facebookTheme, facebookDesignTokens } = useThemeColors()
  const { mode, setMode } = useColorScheme()
  const isDark = mode === 'dark'
  const ticketSidebarWidth = 300

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
  // Por defecto muestra SOLO mis tickets. El usuario puede activar el toggle "Mostrar todos"
  // si es admin/super o tiene allUserChat habilitado. Bug fix: antes iniciaba en true y
  // mostraba tickets de toda la empresa al cargar (2026-05-22).
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [recoveringMessages, setRecoveringMessages] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [whatsappFilter, setWhatsappFilter] = useState<string>('')
  // Filtro por CANAL ACTIVO del ticket (no crea conversaciones separadas):
  // 'all' | 'whatsapp' (Baileys) | 'meta' | 'facebook' | 'instagram' | 'telegram'
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [userFilter, setUserFilter] = useState<string>('')
  const [queueFilter, setQueueFilter] = useState<string>('')
  const [searchMessages, setSearchMessages] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [queues, setQueues] = useState<Queue[]>([])
  const [whatsapps, setWhatsapps] = useState<Whatsapp[]>([])
  const [contactDrawerOpen, setContactDrawerOpen] = useState(false)
  const [dragDropFiles, setDragDropFiles] = useState<File[]>([])
  const [isChatDraggingFiles, setIsChatDraggingFiles] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const preserveMessageScrollRef = useRef(false)
  const chatDragDepthRef = useRef(0)

  // ─── CREAR TICKET MANUAL ───
  const [showNewTicketModal, setShowNewTicketModal] = useState(false)
  const [newTicketContactSearch, setNewTicketContactSearch] = useState('')
  const [newTicketContacts, setNewTicketContacts] = useState<{ id: number; name: string; number: string }[]>([])
  const [newTicketContactId, setNewTicketContactId] = useState<number | null>(null)
  const [newTicketQueueId, setNewTicketQueueId] = useState<string>('')
  const [newTicketWhatsappId, setNewTicketWhatsappId] = useState<string>('')
  const [newTicketLoading, setNewTicketLoading] = useState(false)
  const [searchingNewTicketContacts, setSearchingNewTicketContacts] = useState(false)
  const contactSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Campaign Message (para mostrar banner de campaña publicitaria)
  const [campaignMessage, setCampaignMessage] = useState<any>(null)
  const [editingConversion, setEditingConversion] = useState(false)
  const [conversionNoteValue, setConversionNoteValue] = useState('')
  const [savingConversion, setSavingConversion] = useState(false)
  const [sendingPurchaseConversion, setSendingPurchaseConversion] = useState(false)
  const [purchaseConfirmModal, setPurchaseConfirmModal] = useState<{
    open: boolean
    campaignMessage: any | null
    value: number
  }>({ open: false, campaignMessage: null, value: 0 })

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

  // ─── EDICIÓN INLINE ───
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)
  const [editingMessageBody, setEditingMessageBody] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // ─── MEDIA LIGHTBOX ───
  const [lightboxData, setLightboxData] = useState<{
    src: string
    type: string
    currentIndex: number
    allMedia: Array<{ id: number; src: string; type: string }>
  } | null>(null)

  // ─── UI OPTIMISTA DE MEDIA (subida en progreso) ───
  // Mapa tempId -> porcentaje de subida (0-100) para los placeholders en vuelo.
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})

  // Inserta los placeholders (preview local + "enviando") en la conversación abierta.
  const handleMediaSendStart = (placeholders: OptimisticMediaMessage[]) => {
    setSelectedTicket((prev) =>
      prev ? { ...prev, messages: [...prev.messages, ...(placeholders as unknown as Message[])] } : prev
    )
    setUploadProgress((prev) => {
      const next = { ...prev }
      placeholders.forEach((p) => { next[p.id] = 0 })
      return next
    })
  }

  // Actualiza el % de subida de los placeholders del lote.
  const handleMediaSendProgress = (tempIds: string[], percent: number) => {
    setUploadProgress((prev) => {
      const next = { ...prev }
      tempIds.forEach((id) => { next[id] = percent })
      return next
    })
  }

  // Retira los placeholders al terminar (éxito → el real ya llegó por socket; error → se descarta).
  const handleMediaSendEnd = (tempIds: string[]) => {
    const ids = new Set(tempIds)
    setSelectedTicket((prev) => {
      if (!prev) return prev
      prev.messages.forEach((m) => {
        const url = (m as { mediaUrl?: string }).mediaUrl
        if (ids.has(String(m.id)) && typeof url === 'string' && url.startsWith('blob:')) {
          URL.revokeObjectURL(url)
        }
      })
      return { ...prev, messages: prev.messages.filter((m) => !ids.has(String(m.id))) }
    })
    setUploadProgress((prev) => {
      const next = { ...prev }
      tempIds.forEach((id) => { delete next[id] })
      return next
    })
  }

  // ─── REPLY TO ───
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)

  // ─── BÚSQUEDA EN CONVERSACIÓN ───
  const [conversationSearchTerm, setConversationSearchTerm] = useState('')
  const [conversationSearchActive, setConversationSearchActive] = useState(false)

  // ─── SELECCIÓN MÚLTIPLE ───
  const [selectionMode, setSelectionMode] = useState<'forward' | 'delete' | null>(null)
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<number>>(new Set())
  const [showForwardModal, setShowForwardModal] = useState(false)
  const [forwardLoading, setForwardLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // ─── PAGINACIÓN INFINITA ───
  const [pageNumber, setPageNumber] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false)
  const ticketsListRef = useRef<HTMLDivElement>(null)
  const ticketsRef = useRef<Ticket[]>([])
  const selectedTicketRef = useRef<Ticket | null>(null)
  const fetchTicketsRef = useRef<(reset?: boolean, explicitPage?: number, silent?: boolean) => Promise<void>>(async () => {})
  const ticketDetailsFetchInFlightRef = useRef<Set<number>>(new Set())
  const ticketDetailsLastFetchAtRef = useRef<Map<number, number>>(new Map())
  const ticketListRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref sincronizada con `debouncedSearchTerm` para que los handlers socket
  // (cerrados sobre estado viejo) puedan saber si hay búsqueda activa sin
  // forzar re-suscripción de listeners.
  const searchActiveRef = useRef<boolean>(false)

  // ─── MENÚ DE ACCIONES ───
  const [messageActionMenu, setMessageActionMenu] = useState<{
    messageId: number
    anchorEl: HTMLElement | null
    fromMe: boolean
  } | null>(null)

  // ─── MENÚ DE OPCIONES DEL TICKET ───
  const [ticketMoreMenu, setTicketMoreMenu] = useState<HTMLElement | null>(null)
  const [showTransferModal, setShowTransferModal] = useState(false)
  // El modal "Transferir Ticket" reasigna el ticket a otro USUARIO/AGENTE (cambia ticket.userId),
  // no cambia el contacto. Las variables siguen el patrón de usuarios.
  const [searchUserQuery, setSearchUserQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState<any | null>(null)
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [transferring, setTransferring] = useState(false)

  // ─── ACEPTAR TICKET CON COLA OBLIGATORIA ───
  const [acceptQueueModalOpen, setAcceptQueueModalOpen] = useState(false)
  const [ticketToAccept, setTicketToAccept] = useState<Ticket | null>(null)
  const [acceptingTicket, setAcceptingTicket] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  useEffect(() => {
    ticketsRef.current = tickets
  }, [tickets])

  useEffect(() => {
    selectedTicketRef.current = selectedTicket
  }, [selectedTicket])

  const getTicketTimestamp = useCallback((ticket?: Partial<Ticket> | null) => {
    if (!ticket) return 0
    const rawValue = ticket.updatedAt || ticket.createdAt
    if (!rawValue) return 0

    const parsedValue = new Date(rawValue).getTime()
    return Number.isNaN(parsedValue) ? 0 : parsedValue
  }, [])

  const mergeTicketData = useCallback((
    previousTicket: Ticket | null | undefined,
    incomingTicket: Partial<Ticket> & { id: number }
  ): Ticket => {
    const fallbackDate = new Date().toISOString()
    const baseTicket = (previousTicket ?? {
      id: incomingTicket.id,
      uuid: incomingTicket.uuid || '',
      status: incomingTicket.status || 'pending',
      unreadMessages: incomingTicket.unreadMessages ?? 0,
      contactId: incomingTicket.contactId ?? incomingTicket.contact?.id ?? 0,
      contact: (incomingTicket.contact ?? {
        id: incomingTicket.contactId ?? 0,
        name: '',
        number: ''
      }) as Contact,
      messages: [],
      createdAt: incomingTicket.createdAt || fallbackDate,
      updatedAt: incomingTicket.updatedAt || incomingTicket.createdAt || fallbackDate
    }) as Ticket

    // Preserva el name humano del contacto previo si el entrante no trae uno válido.
    // Esto evita que eventos socket parciales (donde contact.name === contact.number)
    // pisen el name humano que tenía la BD/lista (bug visible: header del chat
    // mostraba número mientras la lista mostraba "GARCIA ANDRADE...").
    const mergedContact = incomingTicket.contact
      ? ({
          ...(mergeContactPreservingName(
            baseTicket.contact,
            incomingTicket.contact as Partial<Contact>
          ) ?? incomingTicket.contact),
          tags: incomingTicket.contact.tags ?? baseTicket.contact?.tags
        } as Contact)
      : baseTicket.contact

    const incomingMessages = Array.isArray(incomingTicket.messages)
      ? incomingTicket.messages
      : undefined
    const baseMessages = baseTicket.messages || []
    const isExplicitMessageLoad =
      incomingTicket.messagesPageNumber !== undefined ||
      incomingTicket.messagesHasMore !== undefined
    const shouldUseIncomingMessages =
      incomingMessages !== undefined &&
      (
        isExplicitMessageLoad ||
        incomingMessages.length > 0 ||
        baseMessages.length === 0
      )

    return {
      ...baseTicket,
      ...incomingTicket,
      contact: mergedContact,
      user: incomingTicket.user ?? baseTicket.user,
      queue: incomingTicket.queue ?? baseTicket.queue,
      whatsapp: incomingTicket.whatsapp ?? baseTicket.whatsapp,
      tags: incomingTicket.tags ?? baseTicket.tags,
      messages: shouldUseIncomingMessages ? incomingMessages! : baseMessages,
      messagesPageNumber: incomingTicket.messagesPageNumber ?? baseTicket.messagesPageNumber ?? 1,
      messagesHasMore: incomingTicket.messagesHasMore ?? baseTicket.messagesHasMore ?? false,
      createdAt: incomingTicket.createdAt ?? baseTicket.createdAt ?? fallbackDate,
      updatedAt: incomingTicket.updatedAt ?? baseTicket.updatedAt ?? incomingTicket.createdAt ?? fallbackDate
    }
  }, [])

  const normalizeTickets = useCallback((ticketList: Ticket[]) => {
    const ticketMap = new Map<number, Ticket>()

    ticketList.forEach(ticket => {
      if (!ticket?.id) return

      const previousTicket = ticketMap.get(ticket.id)
      ticketMap.set(ticket.id, mergeTicketData(previousTicket, ticket))
    })

    return Array.from(ticketMap.values()).sort(
      (leftTicket, rightTicket) => getTicketTimestamp(rightTicket) - getTicketTimestamp(leftTicket)
    )
  }, [getTicketTimestamp, mergeTicketData])

  const shouldDisplayTicket = useCallback((ticket: Ticket) => {
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        if (!['pending', 'lgpd'].includes(ticket.status)) return false
      } else if (ticket.status !== statusFilter) {
        return false
      }
    }

    if (whatsappFilter && ticket.whatsappId !== Number(whatsappFilter)) return false
    // Filtro por canal activo del ticket (coexistencia: Meta y Baileys son
    // transportes del MISMO WhatsApp → 'whatsapp' agrupa Baileys/whatsapp).
    if (channelFilter && channelFilter !== 'all') {
      const tChannel = (ticket as any).channel || 'whatsapp'
      if (channelFilter === 'whatsapp') {
        if (!['whatsapp', 'baileys'].includes(tChannel)) return false
      } else if (tChannel !== channelFilter) {
        return false
      }
    }
    if (userFilter && ticket.userId !== Number(userFilter)) return false
    if (queueFilter && ticket.queueId !== Number(queueFilter)) return false

    const ticketTimestamp = getTicketTimestamp(ticket)

    if (startDate) {
      const startTimestamp = new Date(`${startDate}T00:00:00`).getTime()
      if (ticketTimestamp < startTimestamp) return false
    }

    if (endDate) {
      const endTimestamp = new Date(`${endDate}T23:59:59.999`).getTime()
      if (ticketTimestamp > endTimestamp) return false
    }

    const currentUserRecord = users.find(item => item.id === user?.id)

    if (user?.profile === 'user') {
      if (currentUserRecord?.whatsappId && ticket.whatsappId && ticket.whatsappId !== currentUserRecord.whatsappId) {
        return false
      }

      const assignedQueueIds = new Set((currentUserRecord?.queues || []).map(queue => queue.id))
      if (ticket.queueId && assignedQueueIds.size > 0 && !assignedQueueIds.has(ticket.queueId)) {
        return false
      }
    }

    if (!showAll && user?.id) {
      if (statusFilter === 'open' && ticket.userId !== user.id) return false
      if (statusFilter === 'pending' && ticket.userId !== undefined && ticket.userId !== null && ticket.userId !== user.id) return false
      if (statusFilter === 'closed' && ticket.userId !== user.id) return false
    }

    return true
  }, [endDate, getTicketTimestamp, queueFilter, showAll, startDate, statusFilter, user?.id, user?.profile, userFilter, users, whatsappFilter, channelFilter])

  const upsertTicketInList = useCallback((ticketList: Ticket[], incomingTicket: Ticket) => {
    const ticketIndex = ticketList.findIndex(ticket => ticket.id === incomingTicket.id)
    const mergedTicket = mergeTicketData(ticketIndex >= 0 ? ticketList[ticketIndex] : null, incomingTicket)

    if (!shouldDisplayTicket(mergedTicket)) {
      return normalizeTickets(ticketList.filter(ticket => ticket.id !== incomingTicket.id))
    }

    if (ticketIndex >= 0) {
      const nextTicketList = [...ticketList]
      nextTicketList[ticketIndex] = mergedTicket
      return normalizeTickets(nextTicketList)
    }

    return normalizeTickets([mergedTicket, ...ticketList])
  }, [mergeTicketData, normalizeTickets, shouldDisplayTicket])

  const removeTicketFromList = useCallback((ticketList: Ticket[], ticketId: number) => {
    return normalizeTickets(ticketList.filter(ticket => ticket.id !== ticketId))
  }, [normalizeTickets])

  // Buscar usuarios/agentes para transferencia del ticket
  // (no se buscan contactos: la transferencia reasigna el responsable del ticket)
  const handleSearchUser = async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([])
      return
    }
    setSearchingUsers(true)
    try {
      const res = await api.get('/users', {
        params: { searchParam: query, pageNumber: 1 }
      })
      // El endpoint /users devuelve { users, count, hasMore }
      setSearchResults(res.data.users || res.data.records || [])
    } catch (error) {
      console.error('Error searching users:', error)
      setSearchResults([])
    } finally {
      setSearchingUsers(false)
    }
  }

  // Transferir ticket a otro usuario/agente (cambia ticket.userId)
  // IMPORTANTE: NO cambiamos el status del ticket. Transferir solo reasigna
  // el responsable. Si el ticket era `pending`, sigue `pending` y el nuevo
  // agente lo acepta cuando esté listo. Esto evita disparar la validación
  // `requireQueueOnAccept` que aplica solo a transiciones pending → open.
  const handleTransferTicket = async () => {
    if (!selectedTicket?.id || !selectedUser) return
    setTransferring(true)
    try {
      // Solo enviamos los campos que cambian: userId (y queueId si se eligió otra).
      // El status se preserva enviando el actual del ticket.
      const payload: { userId: number; status: string; queueId?: number } = {
        userId: selectedUser.id,
        status: selectedTicket.status,
      }

      // Preservar la cola actual si existe (nunca borrar la asignación)
      if (selectedTicket.queueId) {
        payload.queueId = selectedTicket.queueId
      }

      await api.put(`/tickets/${selectedTicket.id}`, payload)
      toast.success(`Ticket transferido a ${selectedUser.name}`)
      setShowTransferModal(false)
      setSelectedUser(null)
      setSearchUserQuery('')
      setSearchResults([])
      setTicketMoreMenu(null)
      // NO recargamos la lista: el socket `company-X-ticket` con action='update'
      // ya upsertea el ticket (con queue/user/whatsapp hidratados) sin perder el
      // scroll del operador. Solo refrescamos contadores.
      fetchTicketCounts()
    } catch (error: any) {
      console.error('Error transferring ticket:', error)
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Error al transferir el ticket')
    } finally {
      setTransferring(false)
    }
  }

  const handleRecoverTicketMessages = async () => {
    if (!selectedTicket?.id || recoveringMessages) return

    setRecoveringMessages(true)
    try {
      const { data } = await api.post(`/messages/ticket/${selectedTicket.id}/recover`, {
        limit: 20
      })

      const placeholderRequested = data?.placeholder?.requested || 0
      const alreadyResolved = data?.placeholder?.alreadyResolved || 0
      const failed = data?.placeholder?.failed || 0
      const historyRequested = Boolean(data?.history?.requested)

      const parts = [
        placeholderRequested > 0 ? `${placeholderRequested} solicitados` : null,
        alreadyResolved > 0 ? `${alreadyResolved} ya resueltos` : null,
        historyRequested ? `historial solicitado` : null,
        failed > 0 ? `${failed} fallidos` : null,
      ].filter(Boolean)

      toast.info(parts.length ? `Recuperación iniciada: ${parts.join(' · ')}` : (data?.message || 'No hay mensajes recuperables'))
    } catch (error: any) {
      console.error('Error recovering ticket messages:', error)
      toast.error(error.response?.data?.message || 'No se pudo iniciar la recuperación')
    } finally {
      setRecoveringMessages(false)
      setTicketMoreMenu(null)
    }
  }

  // Función para obtener contadores de todos los estados
  const fetchTicketCounts = useCallback(async () => {
    try {
      const showAllParam = showAll ? 'true' : 'false'

      // Construir parámetros base con TODOS los filtros activos
      const baseParams = {
        showAll: showAllParam,
        limit: 0,
        pageNumber: 1,
        // Incluir todos los filtros activos para que el conteo sea preciso
        ...(whatsappFilter && { whatsapps: JSON.stringify([Number(whatsappFilter)]) }),
        ...(userFilter && { users: JSON.stringify([Number(userFilter)]) }),
        ...(queueFilter && { queueIds: JSON.stringify([Number(queueFilter)]) }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(searchMessages && { searchOnMessages: 'true' })
      }

      // Obtener contadores reales de cada status usando el endpoint /tickets con limit=0
      const [openRes, pendingRes, closedRes, groupRes] = await Promise.all([
        api.get('/tickets', { params: { ...baseParams, status: 'open' } }),
        api.get('/tickets', { params: { ...baseParams, status: 'pending' } }),
        api.get('/tickets', { params: { ...baseParams, status: 'closed' } }),
        api.get('/tickets', { params: { ...baseParams, status: 'group' } })
      ])

      setOpenCount(openRes.data.totalCount ?? openRes.data.count ?? 0)
      setPendingCount(pendingRes.data.totalCount ?? pendingRes.data.count ?? 0)
      setClosedCount(closedRes.data.totalCount ?? closedRes.data.count ?? 0)
      setGroupCount(groupRes.data.totalCount ?? groupRes.data.count ?? 0)
    } catch (error) {
      console.error('Error fetching ticket counts:', error)
    }
  }, [showAll, whatsappFilter, userFilter, queueFilter, startDate, endDate, searchMessages])

  // Debounce fetchTicketCounts to avoid excessive API calls from socket events
  const fetchTicketCountsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debouncedFetchTicketCounts = useCallback(() => {
    if (fetchTicketCountsTimeoutRef.current) {
      clearTimeout(fetchTicketCountsTimeoutRef.current)
    }
    fetchTicketCountsTimeoutRef.current = setTimeout(() => {
      fetchTicketCounts()
    }, 800)
  }, [fetchTicketCounts])

  const scheduleTicketListRefresh = useCallback(() => {
    if (ticketListRefreshTimeoutRef.current) {
      clearTimeout(ticketListRefreshTimeoutRef.current)
    }

    ticketListRefreshTimeoutRef.current = setTimeout(() => {
      // silent=true → refresh "transparente" disparado por eventos socket.
      // No muestra "Cargando chats..." al operador (eso solo debe verlo quien
      // explícitamente cambió un filtro o búsqueda).
      void fetchTicketsRef.current(true, undefined, true)
    }, 250)
  }, [])

  useEffect(() => {
    return () => {
      if (ticketListRefreshTimeoutRef.current) {
        clearTimeout(ticketListRefreshTimeoutRef.current)
      }
    }
  }, [])

  // Resetear paginación cuando cambian los filtros o el término de búsqueda
  useEffect(() => {
    setPageNumber(1)
    setHasMore(true)
    // Mantener ref sincronizada con búsqueda activa (la consultan los handlers
    // socket para evitar refrescos que pisarían los resultados de la búsqueda).
    searchActiveRef.current = debouncedSearchTerm.trim().length > 0
    fetchTickets(true)
    // Actualizar contadores con debounce para evitar demasiadas llamadas
    debouncedFetchTicketCounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, showAll, startDate, endDate, whatsappFilter, userFilter, queueFilter, searchMessages, debouncedSearchTerm])

  // Obtener contadores al inicio y cuando cambie showAll
  useEffect(() => {
    fetchTicketCounts()
  }, [fetchTicketCounts])

  useEffect(() => {
    fetchFilterOptions()
  }, [])

  useEffect(() => {
    if (preserveMessageScrollRef.current) return
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

      const purchaseValue = parseFloat(String(conversionNoteValue || '').replace(/[^0-9.]/g, '') || '0')
      if (purchaseValue > 0) {
        setPurchaseConfirmModal({
          open: true,
          campaignMessage: data,
          value: purchaseValue
        })
      }
    } catch (error) {
      console.error('Error saving conversion note:', error)
      toast.error('Error al guardar el valor de conversión')
    } finally {
      setSavingConversion(false)
    }
  }

  const handleSendPurchaseConversionFromTicket = async () => {
    const msg = purchaseConfirmModal.campaignMessage
    const value = purchaseConfirmModal.value
    const contactId = msg?.contactId || selectedTicket?.contact?.id
    const whatsappId = msg?.whatsappId || selectedTicket?.whatsappId

    if (!msg?.id || !contactId || !whatsappId || !value) {
      toast.error('No hay datos suficientes para enviar Purchase a Meta')
      return
    }

    setSendingPurchaseConversion(true)
    try {
      await api.post('/facebook-conversions/send', {
        whatsappId,
        eventName: 'Purchase',
        contactId,
        messageId: msg.messageId,
        ctwaClid: msg.ctwaClid,
        customData: {
          value,
          currency: 'USD'
        }
      })

      toast.success(`Purchase de $${value} USD enviado a Meta`)
      setPurchaseConfirmModal({ open: false, campaignMessage: null, value: 0 })
    } catch (error: any) {
      console.error('Error sending Purchase conversion from ticket:', error)
      toast.error(error?.response?.data?.error || error?.message || 'Error al enviar Purchase a Meta')
    } finally {
      setSendingPurchaseConversion(false)
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
    } catch {
      // Filtro de campañas es opcional en Tickets: si Meta Ads no está
      // configurado o la API falla, degradamos en silencio a lista vacía.
      // (El backend ya devuelve 200 vacío para el caso "no configurado".)
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

  const customerOriginSelector = selectedTicket ? (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        Origen:
      </span>
      <Select
        value={(selectedTicket as any)?.customerOriginId != null ? String((selectedTicket as any).customerOriginId) : '__none__'}
        onValueChange={(value) => handleUpdateCustomerOrigin(value === '__none__' ? '' : value)}
        onOpenChange={(isOpen) => {
          if (isOpen) {
            userInteractedWithOriginSelect.current = true
            if (customerOrigins.length === 0) fetchCustomerOrigins()
          }
        }}
      >
        <SelectTrigger className="h-7 min-w-[132px] max-w-[180px] px-2 py-0.5 text-xs">
          <SelectValue placeholder="Origen" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Sin origen</SelectItem>
          {loadingOrigins ? (
            <SelectItem value="__loading__" disabled>Cargando...</SelectItem>
          ) : (
            customerOrigins.map(origin => (
              <SelectItem key={origin.id} value={String(origin.id)}>
                <span className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ backgroundColor: origin.color }}
                  />
                  <span>{origin.name}</span>
                </span>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </Stack>
  ) : null

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

  const getCampaignMessageCampaignName = (message: any) => {
    const raw = message?.rawData || {}
    return raw.campaignName ||
      raw.campaign_name ||
      raw.campaign?.name ||
      raw.campaign?.campaign_name ||
      raw.ad?.campaign_name ||
      message?.campaignName ||
      ''
  }

  const getCampaignMessageDisplayName = (message: any) => {
    return getCampaignMessageCampaignName(message) || message?.headline || message?.sourceId || 'Anuncio'
  }

  const formatCompactCampaignName = (message: any) => {
    const name = String(getCampaignMessageDisplayName(message))
    return `${name.substring(0, 25)}${name.length > 25 ? '...' : ''}`
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
    if (!user?.companyId || !user?.id) return

    const socket = socketService.getSocket() ?? socketService.connect(user.companyId, user.id)

    const companyId = user.companyId
    const messageEvent = `company-${companyId}-appMessage`
    const ticketEvent = `company-${companyId}-ticket`
    const contactEvent = `company-${companyId}-contact`

    console.log(`🔌 Setting up socket listeners for company ${companyId}`)

    const refreshCounts = () => {
      debouncedFetchTicketCounts()
    }

    const refreshVisibleTicketAndCounts = (ticketId: number) => {
      const isVisibleInCurrentList = ticketsRef.current.some(ticket => ticket.id === ticketId)
      const isSelected = selectedTicketRef.current?.id === ticketId

      if (isVisibleInCurrentList || isSelected) {
        void fetchTicketDetails(ticketId)
      }

      refreshCounts()
    }

    // Handler for new/updated messages
    const handleAppMessage = (data: {
      action: string
      message: Message & { ticketId: number; wid?: string }
      ticket?: Ticket
      contact?: Contact
    }) => {
      console.log('📨 Socket appMessage received:', data.action, data.message?.id, 'wid:', (data.message as any)?.wid)
      // 🔎[ORDEN] LOG TEMPORAL diagnóstico reorden (2026-06-16)
      console.log('🔎[ORDEN] appMessage', {
        action: data.action,
        ticketId: data.message?.ticketId,
        msgId: data.message?.id,
        fromMe: (data.message as any)?.fromMe,
        msgCreatedAt: data.message?.createdAt,
        socketTicketUpdatedAt: data.ticket?.updatedAt
      })

      if (data.action === 'create' || data.action === 'update') {
        const socketTicket = data.ticket

        // Dedup helper: buscar primero por wid (incluye pending_xxx), luego por id
        const findMsgIndex = (messages: Message[]) => {
          const msg = data.message as any
          // 1. Buscar por wid primero (incluye pending_xxx que luego se actualiza)
          let idx = msg.wid ? messages.findIndex(m => (m as any).wid === msg.wid) : -1
          // 2. Si no encuentra, buscar por id
          if (idx < 0 && msg.id) {
            idx = messages.findIndex(m => m.id === msg.id)
          }
          return idx
        }

        const isEditedSocketMessage = (message: Message) => {
          const msg = message as any
          const dataJson = msg.dataJson

          if (msg.isEdited === true) return true
          if (dataJson && typeof dataJson === 'object' && dataJson.lastEdit) return true
          if (typeof dataJson === 'string' && dataJson.includes('"lastEdit"')) return true

          return false
        }

        const shouldReplaceSocketMessage = (existing: Message, incoming: Message) => {
          const existingMsg = existing as any
          const incomingMsg = incoming as any

          if (isEditedSocketMessage(incoming)) return true

          return !existingMsg.ack || (incomingMsg.ack && incomingMsg.ack >= existingMsg.ack)
        }

        // Update messages in the ticket list
        setTickets(prevTickets => {
          const existingTicket = prevTickets.find(ticket => ticket.id === data.message.ticketId)

          if (!existingTicket) {
            if (socketTicket) {
              const incomingTicket = mergeTicketData(null, {
                ...socketTicket,
                contact: socketTicket.contact || data.contact || socketTicket.contact,
                messages: [data.message],
                lastMessage: socketTicket.lastMessage || data.message.body,
                updatedAt: socketTicket.updatedAt || data.message.createdAt
              })

              return upsertTicketInList(prevTickets, incomingTicket)
            }

            void fetchTicketDetails(data.message.ticketId)
            return prevTickets
          }

          return normalizeTickets(prevTickets.map(ticket => {
            if (ticket.id !== data.message.ticketId) return ticket

            const existingMsgIndex = findMsgIndex(ticket.messages)
            let updatedMessages: Message[]

            if (existingMsgIndex >= 0) {
              // Update existing message (keep higher ack)
              updatedMessages = [...ticket.messages]
              if (shouldReplaceSocketMessage(updatedMessages[existingMsgIndex], data.message)) {
                updatedMessages[existingMsgIndex] = data.message
              }
            } else {
              // Add new message
              updatedMessages = [...ticket.messages, data.message]
            }

            const ticketFromSocket = socketTicket && socketTicket.id === ticket.id
              ? mergeTicketData(ticket, {
                  ...socketTicket,
                  contact: socketTicket.contact || data.contact || ticket.contact
                })
              : ticket

            // FECHA SAGRADA: SOLO un mensaje NUEVO (action 'create' no duplicado)
            // mueve la fecha y reordena la lista. Los eventos 'update' (cambios de
            // ACK enviado→entregado→leído, ediciones, o el marcado-como-leído que
            // dispara el click en un ticket) NO deben reordenar. (regresión click 2026-06-16)
            const isNewIncomingMessage = data.action === 'create' && existingMsgIndex < 0
            const nextUpdatedAt = isNewIncomingMessage
              ? (socketTicket?.updatedAt || data.message.createdAt)
              : ticket.updatedAt

            return {
              ...ticketFromSocket,
              messages: updatedMessages,
              lastMessage: isNewIncomingMessage
                ? (socketTicket?.lastMessage || data.message.body)
                : (ticketFromSocket.lastMessage ?? ticket.lastMessage),
              updatedAt: nextUpdatedAt
            }
          }))
        })

        if (socketTicket && !shouldDisplayTicket(socketTicket)) {
          setTickets(prevTickets => removeTicketFromList(prevTickets, socketTicket.id))
        }

        debouncedFetchTicketCounts()

        // Si hay búsqueda activa, NO refrescamos por socket: pisaría los
        // resultados que el operador está viendo. Cuando termine de buscar
        // (cambie/borre el query), el useEffect del filtro recargará todo.
        if (
          !searchActiveRef.current &&
          !socketTicket &&
          !ticketsRef.current.some(ticket => ticket.id === data.message.ticketId)
        ) {
          scheduleTicketListRefresh()
        }

        // Update selected ticket messages
        setSelectedTicket(prevSelected => {
          if (prevSelected && prevSelected.id === data.message.ticketId) {
            const existingMsgIndex = findMsgIndex(prevSelected.messages)
            let updatedMessages: Message[]

            if (existingMsgIndex >= 0) {
              updatedMessages = [...prevSelected.messages]
              if (shouldReplaceSocketMessage(updatedMessages[existingMsgIndex], data.message)) {
                updatedMessages[existingMsgIndex] = data.message
              }
            } else {
              updatedMessages = [...prevSelected.messages, data.message]
            }

            const selectedFromSocket = socketTicket && socketTicket.id === prevSelected.id
              ? mergeTicketData(prevSelected, {
                  ...socketTicket,
                  contact: socketTicket.contact || data.contact || prevSelected.contact
                })
              : prevSelected

            // FECHA SAGRADA: igual que en la lista, solo un mensaje nuevo mueve la
            // fecha. Eventos 'update' (ACK/lectura/edición) preservan updatedAt.
            const isNewIncomingMessageSel = data.action === 'create' && existingMsgIndex < 0

            return {
              ...selectedFromSocket,
              messages: updatedMessages,
              lastMessage: isNewIncomingMessageSel
                ? (socketTicket?.lastMessage || data.message.body)
                : (selectedFromSocket.lastMessage ?? prevSelected.lastMessage),
              updatedAt: isNewIncomingMessageSel
                ? (socketTicket?.updatedAt || data.message.createdAt)
                : prevSelected.updatedAt
            }
          }

          return prevSelected
        })
      } else if (data.action === 'delete') {
        const deletedId = data.message?.id
        const ticketId = data.message?.ticketId

        // Remover de tickets
        setTickets(prevTickets =>
          normalizeTickets(prevTickets.map(ticket => ({
            ...ticket,
            messages: ticket.messages.filter((m: Message) => m.id !== deletedId)
          })))
        )

        // Remover del ticket seleccionado
        setSelectedTicket(prevSelected => {
          if (prevSelected && prevSelected.id === ticketId) {
            return {
              ...prevSelected,
              messages: prevSelected.messages.filter((m: Message) => m.id !== deletedId)
            }
          }
          return prevSelected
        })

        // Si estaba en modo edición, salir
        if (editingMessageId === deletedId) {
          setEditingMessageId(null)
          setEditingMessageBody('')
        }

        debouncedFetchTicketCounts()
      }
    }

    const fetchTicketDetails = async (ticketId: number) => {
      const now = Date.now()
      const lastFetchAt = ticketDetailsLastFetchAtRef.current.get(ticketId) || 0

      if (ticketDetailsFetchInFlightRef.current.has(ticketId) || now - lastFetchAt < 1500) {
        return
      }

      ticketDetailsFetchInFlightRef.current.add(ticketId)

      try {
        const { data } = await api.get(`/tickets/${ticketId}`)
        const previousTicket = ticketsRef.current.find(ticket => ticket.id === ticketId)
        const ticketPayload: Partial<Ticket> & { id: number } = {
          id: ticketId,
          ...data
        }

        if (Array.isArray(data?.messages)) {
          ticketPayload.messages = data.messages
          ticketPayload.messagesPageNumber = data.messagesPageNumber || 1
          ticketPayload.messagesHasMore = data.messagesHasMore ?? false
        } else {
          delete (ticketPayload as any).messages
          delete (ticketPayload as any).messagesPageNumber
          delete (ticketPayload as any).messagesHasMore
        }

        const detailedTicket = mergeTicketData(previousTicket, ticketPayload)

        setTickets(prevTickets => upsertTicketInList(prevTickets, detailedTicket))
        setSelectedTicket(prevSelected => (
          prevSelected && prevSelected.id === ticketId
            ? mergeTicketData(prevSelected, detailedTicket)
            : prevSelected
        ))
      } catch (error: any) {
        if (error?.response?.status === 404) {
          setTickets(prevTickets => removeTicketFromList(prevTickets, ticketId))
          setSelectedTicket(prevSelected => (prevSelected?.id === ticketId ? null : prevSelected))
        } else if (!isRequestCanceled(error)) {
          console.error('Error fetching ticket details from socket event:', error)
        }
      } finally {
        ticketDetailsLastFetchAtRef.current.set(ticketId, Date.now())
        ticketDetailsFetchInFlightRef.current.delete(ticketId)
      }
    }

    // Handler for ticket updates
    const handleTicketUpdate = (data: { action: string; ticket?: Ticket; ticketId?: number }) => {
      console.log('🎫 Socket ticket event received:', data.action, data.ticket?.id || data.ticketId)
      // 🔎[ORDEN] LOG TEMPORAL diagnóstico reorden (2026-06-16)
      console.log('🔎[ORDEN] ticketEvent', {
        action: data.action,
        ticketId: data.ticket?.id || data.ticketId,
        incomingUpdatedAt: data.ticket?.updatedAt,
        traeTicket: !!data.ticket
      })

      const incomingTicket = data.ticket
      const incomingTicketId = incomingTicket?.id || data.ticketId

      if (!incomingTicketId) return

      let selectedNeedsHydratedTicket = false

      if (data.action === 'update') {
        if (!incomingTicket) {
          refreshVisibleTicketAndCounts(incomingTicketId)
          return
        }

        const existingTicket = ticketsRef.current.find(ticket => ticket.id === incomingTicketId)
        const mergedIncomingTicket = mergeTicketData(existingTicket, incomingTicket)
        const selectedMergedTicket = selectedTicketRef.current?.id === incomingTicketId
          ? mergeTicketData(selectedTicketRef.current, incomingTicket)
          : null
        const shouldAppearInCurrentList = shouldDisplayTicket(mergedIncomingTicket)
        const needsHydratedTicket = shouldAppearInCurrentList && (
          !mergedIncomingTicket.contact ||
          !mergedIncomingTicket.whatsapp ||
          (mergedIncomingTicket.userId !== undefined && !mergedIncomingTicket.user) ||
          (mergedIncomingTicket.queueId !== undefined && mergedIncomingTicket.queueId !== null && !mergedIncomingTicket.queue)
        )
        selectedNeedsHydratedTicket = !!selectedMergedTicket && (
          !selectedMergedTicket.contact ||
          !selectedMergedTicket.whatsapp ||
          (selectedMergedTicket.userId !== undefined && !selectedMergedTicket.user) ||
          (selectedMergedTicket.queueId !== undefined && selectedMergedTicket.queueId !== null && !selectedMergedTicket.queue)
        )

        if (shouldAppearInCurrentList) {
          setTickets(prevTickets => upsertTicketInList(prevTickets, incomingTicket))
        } else {
          setTickets(prevTickets => removeTicketFromList(prevTickets, incomingTicketId))
        }

        setSelectedTicket(prevSelected => {
          if (prevSelected && prevSelected.id === incomingTicketId) {
            return shouldAppearInCurrentList ? mergeTicketData(prevSelected, incomingTicket) : null
          }
          return prevSelected
        })

        if (needsHydratedTicket) {
          void fetchTicketDetails(incomingTicketId)
        }
      } else if (data.action === 'create') {
        if (incomingTicket) {
          if (shouldDisplayTicket(incomingTicket)) {
            setTickets(prevTickets => upsertTicketInList(prevTickets, incomingTicket))
            if (!incomingTicket.contact || !incomingTicket.whatsapp) {
              void fetchTicketDetails(incomingTicketId)
            }
          } else {
            setTickets(prevTickets => removeTicketFromList(prevTickets, incomingTicketId))
          }
        }
        refreshCounts()
      } else if (data.action === 'delete') {
        setTickets(prevTickets => removeTicketFromList(prevTickets, incomingTicketId))
        setSelectedTicket(prevSelected => (
          prevSelected && prevSelected.id === incomingTicketId ? null : prevSelected
        ))
        refreshCounts()
      }

      if (data.action === 'update' && incomingTicket) {
        const existingTicket = ticketsRef.current.find(ticket => ticket.id === incomingTicketId)
        const statusChanged = existingTicket ? existingTicket.status !== incomingTicket.status : false

        if (statusChanged) {
          refreshCounts()
        } else if (selectedNeedsHydratedTicket) {
          void fetchTicketDetails(incomingTicketId)
        } else {
          refreshCounts()
        }
      }
    }

    // Handler para actualizaciones de contacto en tiempo real (edición desde el
    // ContactDrawer, propia o de otro agente). El backend emite
    // `company-{id}-contact` con action update|delete. Actualizamos el contacto
    // embebido en el ticket seleccionado y en la lista (mismo contactId), sin
    // tocar updatedAt para NO reordenar la lista (FECHA SAGRADA).
    const handleContactUpdate = (data: { action: string; contact?: Contact }) => {
      const incoming = data?.contact
      if (!incoming?.id || data.action === 'delete') return

      setSelectedTicket(prevSelected => {
        if (prevSelected?.contact && prevSelected.contact.id === incoming.id) {
          return { ...prevSelected, contact: { ...prevSelected.contact, ...incoming } }
        }
        return prevSelected
      })

      setTickets(prevTickets =>
        prevTickets.map(t =>
          t.contact?.id === incoming.id
            ? { ...t, contact: { ...t.contact, ...incoming } }
            : t
        )
      )
    }

    const handleSocketConnect = () => {
      console.log(`🔄 Socket reconnected for company ${companyId}, refreshing ticket list`)
      scheduleTicketListRefresh()
      refreshCounts()
    }

    // Register listeners
    socket.on(messageEvent, handleAppMessage)
    socket.on(ticketEvent, handleTicketUpdate)
    socket.on(contactEvent, handleContactUpdate)
    socket.on('connect', handleSocketConnect)

    console.log(`✅ Socket listeners registered for ${messageEvent}, ${ticketEvent} and ${contactEvent}`)

    // Cleanup on unmount
    return () => {
      console.log(`🔌 Removing socket listeners for company ${companyId}`)
      socket.off(messageEvent, handleAppMessage)
      socket.off(ticketEvent, handleTicketUpdate)
      socket.off(contactEvent, handleContactUpdate)
      socket.off('connect', handleSocketConnect)
    }
  }, [
    user?.companyId,
    user?.id,
    debouncedFetchTicketCounts,
    mergeTicketData,
    normalizeTickets,
    removeTicketFromList,
    scheduleTicketListRefresh,
    shouldDisplayTicket,
    upsertTicketInList
  ])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // ─── BUSCAR CONTACTOS PARA NUEVO TICKET ───
  const searchContacts = useCallback(async (term: string) => {
    if (term.length < 2) {
      setNewTicketContacts([])
      return
    }
    try {
      setSearchingNewTicketContacts(true)
      const { data } = await api.get('/contacts', { params: { searchParam: term, pageNumber: 1 } })
      const contacts = (data.contacts || data || []).map((c: any) => ({
        id: c.id,
        name: c.name || c.number,
        number: c.number || '',
      }))
      setNewTicketContacts(contacts)
    } catch (err) {
      console.error('Error buscando contactos:', err)
    } finally {
      setSearchingNewTicketContacts(false)
    }
  }, [])

  const handleContactSearchChange = useCallback((value: string) => {
    setNewTicketContactSearch(value)
    if (contactSearchDebounceRef.current) clearTimeout(contactSearchDebounceRef.current)
    contactSearchDebounceRef.current = setTimeout(() => {
      searchContacts(value)
    }, 400)
  }, [searchContacts])

  const handleCreateNewTicket = async () => {
    if (!newTicketContactId) {
      toast.error('Selecciona un contacto')
      return
    }
    try {
      setNewTicketLoading(true)
      const payload: any = {
        contactId: newTicketContactId,
        status: 'open',
        userId: user?.id,
      }
      if (newTicketQueueId) payload.queueId = Number(newTicketQueueId)
      if (newTicketWhatsappId) payload.whatsappId = Number(newTicketWhatsappId)

      const { data } = await api.post('/tickets', payload)
      toast.success(data?.alreadyOpen ? 'Ticket existente abierto' : 'Ticket creado correctamente')
      setShowNewTicketModal(false)
      setNewTicketContactSearch('')
      setNewTicketContacts([])
      setNewTicketContactId(null)
      setNewTicketQueueId('')
      setNewTicketWhatsappId('')
      await fetchTickets(true)

      // Seleccionar el ticket recién creado
      if (data?.id) {
        const ticketResponse = await api.get(`/tickets/${data.id}`)
        if (ticketResponse.data) {
          setSelectedTicket({
            ...ticketResponse.data,
            messages: ticketResponse.data.messages || [],
            messagesPageNumber: 1,
            messagesHasMore: false
          })
        }
      }
    } catch (error: any) {
      console.error('Error creando ticket:', error)
      toast.error(error.response?.data?.message || 'Error al crear el ticket')
    } finally {
      setNewTicketLoading(false)
    }
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

  // Función para cargar tickets con paginación
  // `silent`: si true, NO activa `loading` global (no muestra "Cargando chats..."
  // en pantalla). Usado para refrescos disparados por eventos socket — evita que
  // todos los operadores de la company vean el loading cuando llegan mensajes a
  // tickets que no están en sus listas.
  const fetchTickets = async (reset: boolean = false, explicitPage?: number, silent: boolean = false) => {
    try {
      // Cancel previous request
      if (fetchTicketsAbortRef.current) {
        fetchTicketsAbortRef.current.abort()
      }
      fetchTicketsAbortRef.current = new AbortController()
      const signal = fetchTicketsAbortRef.current.signal

      if (!silent) setLoading(true)
      const currentPage = explicitPage ?? (reset ? 1 : pageNumber)

      if (reset) {
        setPageNumber(1)
      }

      const params: any = {
        showAll: showAll ? 'true' : 'false',
        pageNumber: currentPage,
        limit: 20
      }

      // Cuando hay un término de búsqueda activo se delega al backend (status="search")
      // así se busca en TODA la BD por nombre / número (y mensajes si searchMessages=true).
      // Si no hay búsqueda, se respeta el filtro de status seleccionado por el usuario.
      const trimmedSearch = debouncedSearchTerm.trim()
      const isSearching = trimmedSearch.length > 0

      if (isSearching) {
        params.searchParam = trimmedSearch
        params.status = 'search'
        // FIX: antes era `searchMessages ? 'true' : 'true'` (typo) → SIEMPRE buscaba en la
        // tabla Messages (JOIN + LOWER(unaccent(body)) LIKE → seq scan de millones de filas),
        // aunque el toggle "buscar en mensajes" estuviera apagado. Eso colgaba el buscador al
        // escribir un número. Ahora se respeta el toggle: por defecto la búsqueda va sólo a
        // contacto (nombre/número), que es rápida; sólo si el usuario activa "buscar en
        // mensajes" se hace la búsqueda pesada en el cuerpo de los mensajes.
        params.searchOnMessages = searchMessages ? 'true' : 'false'
      } else if (statusFilter && statusFilter !== 'all') {
        params.status = statusFilter
      }

      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      if (whatsappFilter) params.whatsapps = JSON.stringify([Number(whatsappFilter)])
      if (userFilter) params.users = JSON.stringify([Number(userFilter)])
      if (queueFilter) params.queueIds = JSON.stringify([Number(queueFilter)])
      if (!isSearching && searchMessages) params.searchOnMessages = 'true'

      const response = await api.get('/tickets', { params, signal })
      const ticketsData = response.data.tickets || response.data || []
      const hasMoreData = response.data.hasMore ?? false

      setHasMore(hasMoreData)

      if (ticketsData.length === 0) {
        if (reset) {
          setTickets([])
          setSelectedTicket(null)
        }
        return
      }

      // [Ola 5 · N+1] Antes se hacía un GET /messages/:id por CADA ticket de la página
      // (1 + N peticiones por listado, y el socket 'create' lo repetía entero), solo
      // para precalentar el historial. Era innecesario: la lista se pinta con
      // `lastMessage`, no con `messages`, y handleSelectTicket ya carga el historial
      // bajo demanda al abrir un ticket que no lo tenga.
      //
      // Se conservan los mensajes ya cargados de tickets que el usuario abrió antes
      // (vienen de previousTicket), para no forzar una recarga al volver a ellos.
      const mergedTickets = ticketsData.map((ticket: Ticket) => {
        const previousTicket = ticketsRef.current.find(currentTicket => currentTicket.id === ticket.id)

        return mergeTicketData(previousTicket, {
          ...ticket,
          messages: previousTicket?.messages || [],
          messagesPageNumber: previousTicket?.messagesPageNumber || 1,
          messagesHasMore: previousTicket?.messagesHasMore ?? false
        })
      })

      if (signal.aborted) return

      // Si es reset, reemplazar; si no, agregar al final
      if (reset) {
        setTickets(normalizeTickets(mergedTickets))
      } else {
        setTickets(prev => normalizeTickets([...prev, ...mergedTickets]))
      }

      // [Ola 5] Auto-selección: el ticket que se abre solo SÍ necesita su historial.
      // Como ya no se precargan los mensajes de toda la lista, hay que pedir los suyos
      // aquí o el panel de chat se abriría vacío. Es 1 petición (la del ticket abierto)
      // en lugar de N (una por cada ticket de la página).
      const selectWithMessages = async (ticket: Ticket) => {
        if ((ticket.messages?.length || 0) > 0) {
          setSelectedTicket(ticket) // ya cargado en una visita previa
          return
        }
        try {
          const msgResponse = await api.get(`/messages/${ticket.id}`, {
            signal,
            params: { pageNumber: 1 }
          })
          const withMessages = mergeTicketData(ticket, {
            ...ticket,
            messages: msgResponse.data.messages || [],
            messagesPageNumber: 1,
            messagesHasMore: msgResponse.data.hasMore ?? false
          })
          setSelectedTicket(withMessages)
          setTickets(prev => normalizeTickets(
            prev.map(t => (t.id === ticket.id ? withMessages : t))
          ))
        } catch (error: any) {
          if (isRequestCanceled(error) || signal.aborted) return
          logger.error(`[Tickets] no se pudo cargar el historial del ticket ${ticket.id}`, error)
          setSelectedTicket(ticket) // se abre igual; el historial se reintenta al re-seleccionar
        }
      }

      // Si venimos de Contactos, buscar y seleccionar el ticket del contacto
      if (pendingContactIdRef.current) {
        const contactTicket = mergedTickets.find(
          (t: Ticket) => t.contactId === pendingContactIdRef.current
        )
        if (contactTicket) {
          await selectWithMessages(contactTicket)
        } else if (mergedTickets.length > 0) {
          await selectWithMessages(mergedTickets[0])
        }
        pendingContactIdRef.current = null
      } else if (reset && mergedTickets.length > 0 && !selectedTicket) {
        await selectWithMessages(mergedTickets[0])
      }
    } catch (error: any) {
      if (isRequestCanceled(error)) return
      console.error('❌ Error fetching tickets:', error?.response?.data || error.message || error)
      if (reset) {
        setTickets([])
        setSelectedTicket(null)
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // Ref para acceder siempre a la versión más reciente de fetchTickets (evita stale closure en socket handlers)
  useEffect(() => { fetchTicketsRef.current = fetchTickets })

  // Función para cargar más tickets (paginación infinita)
  const loadMoreTickets = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const nextPage = pageNumber + 1
    setPageNumber(nextPage)
    // silent=true → NO dispara setLoading(true), así la lista NO se desmonta
    // ni se resetea el scrollTop. Los nuevos tickets se agregan al final
    // (append) y el usuario permanece exactamente donde estaba.
    await fetchTickets(false, nextPage, true)
    setLoadingMore(false)
  }

  // IntersectionObserver para paginación infinita
  useEffect(() => {
    if (!ticketsListRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadMoreTickets()
        }
      },
      { threshold: 0.1 }
    )

    if (ticketsListRef.current) {
      observer.observe(ticketsListRef.current)
    }

    return () => observer.disconnect()
  }, [hasMore, loadingMore, loading, pageNumber])

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

  const handleSelectTicket = async (ticket: Ticket) => {
    if (selectedTicket?.id === ticket.id) return
    // 🔎[ORDEN] LOG TEMPORAL diagnóstico reorden (2026-06-16)
    console.log('🔎[ORDEN] CLICK en ticket', ticket.id, 'updatedAt actual=', ticket.updatedAt,
      '| orden actual=', ticketsRef.current.map(t => `${t.id}:${t.updatedAt}`))

    const nextTicket: Ticket = {
      ...ticket,
      messages: ticket.messages || [],
      messagesPageNumber: ticket.messagesPageNumber || 1,
      messagesHasMore: ticket.messagesHasMore ?? false
    }

    setSelectedTicket(nextTicket)

    if ((nextTicket.messages?.length || 0) > 0) return

    try {
      const response = await api.get(`/messages/${ticket.id}`, {
        params: { pageNumber: 1 }
      })
      const messagePayload = {
        id: ticket.id,
        messages: response.data.messages || [],
        messagesPageNumber: 1,
        messagesHasMore: response.data.hasMore ?? false
      }

      setTickets(prevTickets => normalizeTickets(prevTickets.map(currentTicket => (
        currentTicket.id === ticket.id
          ? mergeTicketData(currentTicket, messagePayload)
          : currentTicket
      ))))
      setSelectedTicket(prevSelected => (
        prevSelected?.id === ticket.id
          ? mergeTicketData(prevSelected, messagePayload)
          : prevSelected
      ))
    } catch (error: any) {
      if (!isRequestCanceled(error)) {
        console.error(`Error loading messages for selected ticket ${ticket.id}:`, error?.response?.data || error.message || error)
      }
    }
  }

  const loadOlderMessages = useCallback(async () => {
    if (!selectedTicket?.id || loadingMoreMessages) return
    if (selectedTicket.messagesHasMore === false) return

    const nextPage = (selectedTicket.messagesPageNumber || 1) + 1
    const container = messagesContainerRef.current
    const previousScrollHeight = container?.scrollHeight || 0
    const previousScrollTop = container?.scrollTop || 0
    const selectedTicketId = selectedTicket.id

    setLoadingMoreMessages(true)
    preserveMessageScrollRef.current = true

    try {
      const response = await api.get(`/messages/${selectedTicketId}`, {
        params: { pageNumber: nextPage }
      })

      const olderMessages: Message[] = response.data.messages || []
      const hasMoreData = response.data.hasMore ?? false

      setSelectedTicket(prevSelected => {
        if (!prevSelected || prevSelected.id !== selectedTicketId) return prevSelected

        const existingIds = new Set(prevSelected.messages.map(message => message.id))
        const dedupedOlderMessages = olderMessages.filter(message => !existingIds.has(message.id))

        return {
          ...prevSelected,
          messages: [...dedupedOlderMessages, ...prevSelected.messages],
          messagesPageNumber: nextPage,
          messagesHasMore: hasMoreData
        }
      })

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight
            container.scrollTop = newScrollHeight - previousScrollHeight + previousScrollTop
          }
          preserveMessageScrollRef.current = false
        })
      })
    } catch (error) {
      console.error('Error loading older messages:', error)
      preserveMessageScrollRef.current = false
    } finally {
      setLoadingMoreMessages(false)
    }
  }, [selectedTicket, loadingMoreMessages])

  const handleMessagesScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container || loadingMoreMessages) return

    if (container.scrollTop <= 80) {
      loadOlderMessages()
    }
  }, [loadOlderMessages, loadingMoreMessages])

  const canAttachFilesToSelectedTicket = selectedTicket?.status === 'open' || selectedTicket?.status === 'group'

  const resetChatDragState = useCallback(() => {
    chatDragDepthRef.current = 0
    setIsChatDraggingFiles(false)
  }, [])

  const handleChatDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!dragEventHasFiles(event)) return

    event.preventDefault()
    event.stopPropagation()
    chatDragDepthRef.current += 1
    setIsChatDraggingFiles(true)
  }, [])

  const handleChatDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!dragEventHasFiles(event)) return

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = canAttachFilesToSelectedTicket ? 'copy' : 'none'
  }, [canAttachFilesToSelectedTicket])

  const handleChatDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!dragEventHasFiles(event)) return

    event.preventDefault()
    event.stopPropagation()
    chatDragDepthRef.current = Math.max(0, chatDragDepthRef.current - 1)
    if (chatDragDepthRef.current === 0) {
      setIsChatDraggingFiles(false)
    }
  }, [])

  const handleChatDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!dragEventHasFiles(event)) return

    event.preventDefault()
    event.stopPropagation()
    resetChatDragState()

    const files = Array.from(event.dataTransfer.files || []).filter((file) => file.size > 0)
    if (files.length === 0) return

    if (!canAttachFilesToSelectedTicket) {
      toast.warn('Abre el ticket para adjuntar archivos')
      return
    }

    setDragDropFiles(files)
  }, [canAttachFilesToSelectedTicket, resetChatDragState])

  const handleDroppedFilesHandled = useCallback(() => {
    setDragDropFiles([])
  }, [])

  useEffect(() => {
    setDragDropFiles([])
    resetChatDragState()
  }, [resetChatDragState, selectedTicket?.id])

  const handleCloseTicket = async (ticketId?: number) => {
    const id = ticketId || selectedTicket?.id
    if (!id) return
    try {
      await api.put(`/tickets/${id}`, { status: 'closed' })
      // NO recargamos la lista: el socket `company-X-ticket` con action='update'
      // ya remueve/upsertea el ticket in-place y conserva el scroll del operador.
      fetchTicketCounts() // Solo refresca los badges/contadores, no la lista.
    } catch (error) {
      console.error('Error closing ticket:', error)
    }
  }

  // Confirma la aceptación con un queueId explícito (o el del ticket si ya tenía).
  const confirmAcceptTicket = async (ticket: Ticket, queueId?: number | null) => {
    const newStatus = ticket.isGroup ? 'group' : 'open'
    const payload: { status: string; userId?: number; queueId?: number } = {
      status: newStatus,
    }
    if (user?.id) payload.userId = user.id
    if (queueId) payload.queueId = queueId

    await api.put(`/tickets/${ticket.id}`, payload)

    // Cambiar de tab a la nueva categoría dispara fetch del nuevo filtro
    // a través del useEffect que depende de statusFilter. NO llamamos
    // fetchTickets(true) explícitamente para no romper el scroll del operador.
    setStatusFilter(newStatus)
    fetchTicketCounts()
    setSelectedTicket({
      ...ticket,
      status: newStatus,
      userId: user?.id || ticket.userId,
      queueId: queueId ?? ticket.queueId,
      user: user?.id ? { id: user.id, name: user.name } : ticket.user,
    })
  }

  const handleAcceptTicket = async (ticket: Ticket) => {
    const assignedQueues = currentUserQueues.filter(q => q && typeof q.id === 'number')

    // Si el ticket ya tiene cola, aceptar directo.
    if (ticket.queueId) {
      try {
        await confirmAcceptTicket(ticket)
      } catch (error: any) {
        const apiMsg =
          error?.response?.data?.error || error?.response?.data?.message
        toast.error(apiMsg || 'No se pudo aceptar el ticket')
        console.error('Error accepting ticket:', error)
      }
      return
    }

    // Si el usuario solo tiene una cola asignada, se usa automáticamente.
    if (assignedQueues.length === 1) {
      try {
        await confirmAcceptTicket(ticket, assignedQueues[0].id)
      } catch (error: any) {
        const apiMsg =
          error?.response?.data?.error || error?.response?.data?.message
        toast.error(apiMsg || 'No se pudo aceptar el ticket')
        console.error('Error accepting ticket:', error)
      }
      return
    }

    // Sin cola y con varias opciones: mostrar solo las colas asignadas al usuario.
    setTicketToAccept(ticket)
    setAcceptError(assignedQueues.length === 0 ? 'No tienes colas asignadas para aceptar este ticket' : null)
    setAcceptQueueModalOpen(true)
  }

  const handleAcceptQueueConfirm = async (queueId: number) => {
    if (!ticketToAccept) return
    setAcceptingTicket(true)
    setAcceptError(null)
    try {
      await confirmAcceptTicket(ticketToAccept, queueId)
      setAcceptQueueModalOpen(false)
      setTicketToAccept(null)
    } catch (error: any) {
      const apiMsg =
        error?.response?.data?.error || error?.response?.data?.message
      setAcceptError(apiMsg || 'No se pudo aceptar el ticket')
      console.error('Error accepting ticket with queue:', error)
    } finally {
      setAcceptingTicket(false)
    }
  }

  const handleAcceptQueueClose = () => {
    if (acceptingTicket) return
    setAcceptQueueModalOpen(false)
    setTicketToAccept(null)
    setAcceptError(null)
  }

  const handleReopenTicket = async (ticket: Ticket) => {
    try {
      await api.put(`/tickets/${ticket.id}`, { status: 'open' })
      // Cambiar de tab a "open" hace que el useEffect (statusFilter) cargue la
      // lista de abiertos. NO necesitamos fetchTickets(true) — el socket
      // upsertea el ticket reabierto in-place sin perder el scroll.
      setStatusFilter('open')
      fetchTicketCounts() // Solo refresca los badges/contadores.
      setSelectedTicket({ ...ticket, status: 'open' })
    } catch (error) {
      console.error('Error reopening ticket:', error)
    }
  }

  // formatTime, formatDate, formatTicketDate, formatDateSeparator, shouldShowDateSeparator
  // ahora vienen del hook useMessageFormatting()

  // El backend ya devuelve los tickets filtrados (status='search' + searchParam)
  // cuando hay búsqueda activa. Mantenemos `filteredTickets` como la lista
  // recibida para no ocultar coincidencias de mensajes que no aparecen en
  // contact.name/number/lastMessage.
  //
  // Filtro CLIENT-SIDE por CANAL ACTIVO (chips Todos/WhatsApp/Meta/FB/IG/Telegram).
  // Coexistencia: 'whatsapp' agrupa Baileys/whatsapp (mismo transporte WhatsApp).
  // NO crea conversaciones separadas: solo acota la vista de la bandeja.
  const filteredTickets = useMemo(() => {
    if (!channelFilter || channelFilter === 'all') return tickets
    return tickets.filter((ticket) => {
      const tChannel = ((ticket as any).channel || 'whatsapp').toLowerCase()
      if (channelFilter === 'whatsapp') return ['whatsapp', 'baileys'].includes(tChannel)
      return tChannel === channelFilter
    })
  }, [tickets, channelFilter])

  const queueMap = useMemo(
    () => new Map(queues.map(queue => [queue.id, queue])),
    [queues]
  )

  const userMap = useMemo(
    () => new Map(users.map(item => [item.id, item])),
    [users]
  )

  const currentUserQueues = useMemo(() => {
    const currentUser = users.find(item => item.id === user?.id)
    const assignedQueues = currentUser?.queues || []

    if (assignedQueues.length === 0) {
      return []
    }

    const assignedQueueIds = new Set(assignedQueues.map(queue => queue.id))
    const hydratedQueues = queues.filter(queue => assignedQueueIds.has(queue.id))
    return hydratedQueues.length > 0 ? hydratedQueues : assignedQueues
  }, [queues, user?.id, users])

  const whatsappMap = useMemo(
    () => new Map(whatsapps.map(item => [item.id, item])),
    [whatsapps]
  )

  const getResolvedQueue = useCallback((ticket: Ticket) => {
    if (ticket.queue?.name) return ticket.queue
    if (!ticket.queueId) return null
    const fallbackQueue = queueMap.get(ticket.queueId)
    return fallbackQueue ? { ...fallbackQueue, color: fallbackQueue.color || '#64748B' } : null
  }, [queueMap])

  const getResolvedUser = useCallback((ticket: Ticket) => {
    if (ticket.user?.name) return ticket.user
    if (!ticket.userId) return null
    return userMap.get(ticket.userId) || null
  }, [userMap])

  const getResolvedWhatsapp = useCallback((ticket: Ticket) => {
    if (ticket.whatsapp?.name) return ticket.whatsapp
    if (!ticket.whatsappId) return null
    return whatsappMap.get(ticket.whatsappId) || null
  }, [whatsappMap])

  const getResolvedTags = useCallback((ticket: Ticket) => {
    if (Array.isArray(ticket.tags) && ticket.tags.length > 0) return ticket.tags
    if (Array.isArray(ticket.contact?.tags) && ticket.contact.tags.length > 0) return ticket.contact.tags
    return []
  }, [])

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

  // ══════════════════════════════════════════
  // HANDLERS DE EDICIÓN DE MENSAJES
  // ══════════════════════════════════════════
  const handleStartEditMessage = (messageId: number, currentBody: string) => {
    setEditingMessageId(messageId)
    setEditingMessageBody(currentBody)
    setMessageActionMenu(null)
  }

  const handleCancelEdit = () => {
    setEditingMessageId(null)
    setEditingMessageBody('')
  }

  const handleSaveEditMessage = async () => {
    if (!editingMessageId || !editingMessageBody.trim()) return
    setSavingEdit(true)
    try {
      await api.post(`/messages/edit/${editingMessageId}`, {
        body: editingMessageBody.trim()
      })
      setEditingMessageId(null)
      setEditingMessageBody('')
    } catch (error: any) {
      console.error('Error editando mensaje:', error)
      toast.error(error?.response?.data?.error || 'Error al editar mensaje')
    } finally {
      setSavingEdit(false)
    }
  }

  // ══════════════════════════════════════════
  // HANDLERS DE SELECCIÓN MÚLTIPLE
  // ══════════════════════════════════════════
  const isMessageDeletedForActions = (message: Message) => (
    Boolean(message.isDeleted || message.messageStatus === 'deleted')
  )

  const canSelectMessageForMode = (
    message: Message,
    mode: 'forward' | 'delete' | null = selectionMode
  ) => {
    if (!mode || isMessageDeletedForActions(message)) return false
    if (mode === 'forward') return !message.isPrivate
    return Boolean(message.fromMe)
  }

  const handleEnterSelectionMode = (
    mode: 'forward' | 'delete',
    message: Message
  ) => {
    if (!canSelectMessageForMode(message, mode)) {
      if (mode === 'delete' && !message.fromMe) {
        toast.warning('Solo puedes eliminar tus propios mensajes')
      }
      return
    }
    if (mode === 'delete' && !message.fromMe) {
      toast.warning('Solo puedes eliminar tus propios mensajes')
      return
    }
    setSelectionMode(mode)
    setSelectedMessageIds(new Set([message.id]))
    setMessageActionMenu(null)
    setEditingMessageId(null)
  }

  const handleToggleMessageSelection = (message: Message) => {
    if (!canSelectMessageForMode(message)) {
      if (selectionMode === 'delete' && !message.fromMe) {
        toast.warning('Solo puedes eliminar tus propios mensajes')
      }
      return
    }

    setSelectedMessageIds(prev => {
      const next = new Set(prev)
      if (next.has(message.id)) {
        next.delete(message.id)
      } else {
        next.add(message.id)
      }
      if (next.size === 0) {
        setSelectionMode(null)
      }
      return next
    })
  }

  const handleExitSelectionMode = () => {
    setSelectionMode(null)
    setSelectedMessageIds(new Set())
    setMessageActionMenu(null)
  }

  const handleDeleteMessages = async () => {
    if (selectedMessageIds.size === 0) return
    const count = selectedMessageIds.size
    const confirmed = window.confirm(
      `¿Eliminar ${count} mensaje${count > 1 ? 's' : ''}? Esta acción no se puede deshacer.`
    )
    if (!confirmed) return
    setActionLoading(true)
    try {
      await Promise.all(
        Array.from(selectedMessageIds).map(messageId =>
          api.delete(`/messages/${messageId}`)
        )
      )
      toast.success(`${count} mensaje${count > 1 ? 's' : ''} eliminad${count > 1 ? 'os' : 'o'}`)
      handleExitSelectionMode()
    } catch (error: any) {
      console.error('Error eliminando mensajes:', error)
      toast.error(error?.response?.data?.error || 'Error al eliminar mensajes')
    } finally {
      setActionLoading(false)
    }
  }

  const handleForwardMessages = async (contactIds: number[]) => {
    if (selectedMessageIds.size === 0 || contactIds.length === 0) return
    setForwardLoading(true)
    try {
      const selectedMessages = (selectedTicket?.messages || []).filter(
        message => selectedMessageIds.has(message.id) && canSelectMessageForMode(message, 'forward')
      )

      if (selectedMessages.length === 0) {
        toast.warning('No hay mensajes válidos para reenviar')
        return
      }

      const promises: Promise<any>[] = []
      for (const message of selectedMessages) {
        for (const contactId of contactIds) {
          promises.push(
            api.post('/message/forward', { messageId: message.id, contactId })
          )
        }
      }
      await Promise.all(promises)
      const msgCount = selectedMessages.length
      const contactCount = contactIds.length
      toast.success(
        `${msgCount} mensaje${msgCount > 1 ? 's' : ''} reenviad${msgCount > 1 ? 'os' : 'o'} a ${contactCount} contacto${contactCount > 1 ? 's' : ''}`
      )
      setShowForwardModal(false)
      handleExitSelectionMode()
    } catch (error: any) {
      console.error('Error reenviando mensajes:', error)
      toast.error(error?.response?.data?.error || 'Error al reenviar mensajes')
    } finally {
      setForwardLoading(false)
    }
  }

  // ══════════════════════════════════════════
  // HANDLERS DE MENÚ DE ACCIONES
  // ══════════════════════════════════════════
  const handleCloseMessageMenu = () => {
    setMessageActionMenu(null)
  }

  // Determina si un mensaje tiene un archivo descargable (imagen, video, audio, documento)
  const getDownloadableMedia = (
    msg?: { mediaUrl?: string; mediaType?: string; body?: string; isUploading?: boolean }
  ): { url: string; name: string } | null => {
    if (!msg || !msg.mediaUrl || msg.isUploading) return null
    const type = (msg.mediaType || '').toLowerCase()
    // Excluir tipos que no son archivos descargables
    if (['ciphertext', 'contact', 'vcard', 'location', 'admetapreview'].includes(type)) {
      return null
    }
    const rawName = msg.mediaUrl.split('/').pop() || 'descarga'
    // Nombre legible: preferir el body si parece un nombre de archivo, si no el de la URL
    const name = decodeURIComponent(rawName)
    const base = `${BACKEND_URL}/public/company${user?.companyId}/${msg.mediaUrl}`
    const url = `${base}${base.includes('?') ? '&' : '?'}download=${encodeURIComponent(name)}`
    return { url, name }
  }

  // ─── Reflejo en tiempo real de los cambios del ContactDrawer ───
  // El drawer notifica sus mutaciones (contacto / ticket) para actualizar al
  // instante el header de la conversación y la lista, sin esperar el socket.
  // Tipamos con `unknown` + cast para puentear los tipos del drawer sin `any`.
  const handleContactPatchedFromDrawer = useCallback((patch: unknown) => {
    const p = patch as Partial<Contact>
    const contactId = selectedTicketRef.current?.contact?.id
    setSelectedTicket(prev =>
      prev && prev.contact ? { ...prev, contact: { ...prev.contact, ...p } } : prev
    )
    if (contactId) {
      setTickets(prev =>
        prev.map(t =>
          t.contact?.id === contactId ? { ...t, contact: { ...t.contact, ...p } } : t
        )
      )
    }
  }, [])

  const handleTicketPatchedFromDrawer = useCallback((patch: unknown) => {
    const p = patch as Partial<Ticket>
    const id = selectedTicketRef.current?.id
    if (!id) return
    // FECHA SAGRADA: no incluimos updatedAt, por lo que NO se reordena la lista.
    setSelectedTicket(prev => (prev && prev.id === id ? { ...prev, ...p } : prev))
    setTickets(prev => prev.map(t => (t.id === id ? { ...t, ...p } : t)))
  }, [])

  return (
    <CssVarsProvider theme={facebookTheme}>
      <TooltipProvider delayDuration={300}>
      {/* Page background - fondo muted para contraste con la card */}
      <div className="h-full bg-muted -m-4 sm:-m-6 p-px">
      {/* Paneles-tarjeta separados por gap sobre el fondo muted (estilo referencia chats.png) */}
      <div className="flex h-[calc(100vh-66px)] gap-3 p-3">
        {/* Sidebar - Tickets List (tarjeta propia, separada del borde) */}
        <div
          className="flex flex-col rounded-md border border-border bg-card shadow-sm overflow-hidden"
          style={{ width: ticketSidebarWidth, minWidth: ticketSidebarWidth, maxWidth: ticketSidebarWidth }}
        >
        {/* Sidebar Header */}
        <div className="p-3 border-b border-border">
          <Stack spacing={1.25}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <h4 className="text-lg font-bold text-foreground">Chats</h4>
              <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                <Tooltip
                  title={showAll ? 'Mostrar solo mis tickets' : 'Mostrar todos los tickets'}
                  side="top"
                >
                  <button
                    type="button"
                    aria-label={showAll ? 'Ocultar todos los tickets' : 'Mostrar todos los tickets'}
                    onClick={() => {
                      setShowAll(!showAll)
                      fetchTicketCounts()
                    }}
                    className={`inline-flex items-center justify-center appearance-none border-0 bg-transparent cursor-pointer rounded-full size-8 transition-colors hover:bg-accent ${showAll ? 'text-brand-cyan' : 'text-muted-foreground hover:text-brand-cyan'}`}
                  >
                    {showAll ? <VisibilityIcon sx={{ fontSize: 20 }} /> : <VisibilityOffIcon sx={{ fontSize: 20 }} />}
                  </button>
                </Tooltip>
                <Tooltip title="Nuevo ticket" side="top">
                  <button
                    type="button"
                    aria-label="Nuevo ticket"
                    onClick={() => setShowNewTicketModal(true)}
                    className="inline-flex items-center justify-center appearance-none border-0 cursor-pointer rounded-full size-8 bg-brand-teal text-white transition-colors hover:bg-brand-teal/90"
                  >
                    <AddIcon sx={{ fontSize: 20 }} />
                  </button>
                </Tooltip>
                <Tooltip title="Actualizar" side="top">
                  <button
                    type="button"
                    aria-label="Actualizar"
                    onClick={() => {
                      fetchTickets(true)
                      fetchTicketCounts()
                    }}
                    className="inline-flex items-center justify-center appearance-none border-0 bg-transparent cursor-pointer rounded-full size-8 text-muted-foreground transition-colors hover:bg-accent hover:text-brand-cyan"
                  >
                    <RefreshIcon sx={{ fontSize: 20 }} />
                  </button>
                </Tooltip>
                <Tooltip title={showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}>
                  <button
                    type="button"
                    aria-label={showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
                    onClick={() => setShowFilters(!showFilters)}
                    className={`inline-flex items-center justify-center appearance-none border-0 cursor-pointer rounded-full size-8 transition-colors ${showFilters ? 'bg-brand-teal text-white hover:bg-brand-teal/90' : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-brand-cyan'}`}
                  >
                    {showFilters ? <ExpandLessIcon sx={{ fontSize: 20 }} /> : <FilterIcon sx={{ fontSize: 20 }} />}
                  </button>
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
                {/* Filtro de rango de fechas - un solo selector (ahorra espacio) */}
                <FormControl size="sm">
                  <FormLabel>Rango de fechas</FormLabel>
                  <DateRangePicker
                    since={startDate}
                    until={endDate}
                    presetLabel=""
                    months={1}
                    showPresets={false}
                    align="left"
                    allowClear
                    showRangeInTrigger
                    fullWidth
                    placeholder="Todas las fechas"
                    onApply={(s, u) => {
                      setStartDate(s)
                      setEndDate(u)
                    }}
                  />
                </FormControl>

                {/* [Soho] Canal: antes era una segunda fila siempre visible que se
                    CORTABA en 296px. Aqui convive con los demas filtros y hace wrap. */}
                <FormControl size="sm">
                  <FormLabel>Canal</FormLabel>
                  <div className="flex flex-wrap gap-1">
                    {[
                      { key: 'all', label: 'Todos', icon: null },
                      { key: 'whatsapp', label: 'WhatsApp', icon: <WhatsAppIcon sx={{ fontSize: 14 }} /> },
                      { key: 'meta', label: 'Meta', icon: <WhatsAppIcon sx={{ fontSize: 14 }} /> },
                      { key: 'facebook', label: 'Facebook', icon: <FacebookIcon sx={{ fontSize: 14 }} /> },
                      { key: 'instagram', label: 'Instagram', icon: <InstagramIcon sx={{ fontSize: 14 }} /> },
                      { key: 'telegram', label: 'Telegram', icon: <TelegramIcon sx={{ fontSize: 14 }} /> },
                    ].map((ch) => {
                      const active = channelFilter === ch.key
                      return (
                        <button
                          key={ch.key}
                          type="button"
                          onClick={() => setChannelFilter(ch.key)}
                          aria-pressed={active}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                            active
                              ? 'border-transparent bg-primary text-primary-foreground'
                              : 'border-border bg-background text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {ch.icon}
                          {ch.label}
                        </button>
                      )
                    })}
                  </div>
                </FormControl>

                {/* Connection Filter */}
                <FormControl size="sm">
                  <FormLabel>Conexión (WhatsApp)</FormLabel>
                  <Select
                    value={whatsappFilter || 'all'}
                    onValueChange={(value) => setWhatsappFilter(value === 'all' ? '' : value)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Todas las conexiones" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las conexiones</SelectItem>
                      {whatsapps.map((whatsapp) => (
                        <SelectItem key={whatsapp.id} value={whatsapp.id.toString()}>
                          {whatsapp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>

                {/* Users Filter */}
                <FormControl size="sm">
                  <FormLabel>Usuario</FormLabel>
                  <Select
                    value={userFilter || 'all'}
                    onValueChange={(value) => setUserFilter(value === 'all' ? '' : value)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Todos los usuarios" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los usuarios</SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>

                {/* Queues Filter */}
                <FormControl size="sm">
                  <FormLabel>Cola</FormLabel>
                  <Select
                    value={queueFilter || 'all'}
                    onValueChange={(value) => setQueueFilter(value === 'all' ? '' : value)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Todas las colas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las colas</SelectItem>
                      {queues.map((queue) => (
                        <SelectItem key={queue.id} value={queue.id.toString()}>
                          {queue.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
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
        </div>

        {/* Tabs con contadores - Diseño moderno */}
        <div className="p-2 bg-muted">
          <Tabs
            value={statusFilter}
            onValueChange={(value) => {
              if (value) {
                setStatusFilter(value)
              }
            }}
          >
            {/* [Soho] Segmentado neutro: fondo muted, activo en background con sombra
                sutil. Antes cada tab traia su propio gradiente y su glow de color
                (verde/naranja/cian) + un badge flotante con borde: cuatro estilos
                distintos en 296px = ruido, que es justo lo que se veia "desordenado". */}
            <TabsList className="grid w-full grid-cols-4 gap-1 rounded-lg bg-muted p-1">
              {[
                { value: 'open', label: 'Abiertos', icon: <MessageIcon sx={{ fontSize: 18 }} />, count: openCount },
                { value: 'pending', label: 'Pendientes', icon: <AccessTimeIcon sx={{ fontSize: 18 }} />, count: pendingCount },
                { value: 'group', label: 'Grupos', icon: <GroupIcon sx={{ fontSize: 18 }} />, count: groupCount },
                { value: 'closed', label: 'Cerrados', icon: <CheckBoxIcon sx={{ fontSize: 18 }} />, count: closedCount },
              ].map((tab) => {
                // OJO: aqui NO se puede usar data-[state=active]. El Tooltip del DS
                // monta <TooltipTrigger asChild>, y Radix pisa el data-state del hijo
                // con el SUYO (closed/delayed-open) => el tab siempre parece inactivo.
                // (Por esto el codigo original marcaba el activo con estilos inline.)
                const active = statusFilter === tab.value
                return (
                  <Tooltip key={tab.value} title={tab.label} side="top">
                    <TabsTrigger
                      value={tab.value}
                      aria-label={tab.label}
                      className={cn(
                        'flex h-9 items-center justify-center gap-1.5 rounded-md transition-colors',
                        active
                          ? 'bg-card text-primary shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {tab.icon}
                      {tab.count > 0 && (
                        <span className="text-[11px] font-semibold tabular-nums">{tab.count}</span>
                      )}
                    </TabsTrigger>
                  </Tooltip>
                )
              })}
            </TabsList>
            {/* [a11y W7-FE-03] Radix Tabs.Trigger emite aria-controls apuntando a un
                panel de contenido; aquí las pestañas son un selector de estado (la
                lista se renderiza abajo), así que sin TabsContent ese aria-controls
                quedaba colgando → axe crítico `aria-valid-attr-value`. Estos paneles
                sr-only (forceMount) hacen que el IDREF resuelva a un elemento real. */}
            {['open', 'pending', 'group', 'closed'].map((v) => (
              <TabsContent key={v} value={v} forceMount className="sr-only" tabIndex={-1} />
            ))}
          </Tabs>

        </div>

        {/* Tickets List */}
        <Sheet sx={{ overflowY: 'auto', overflowX: 'hidden', flex: 1, minHeight: 0, ...thinScrollbarSx }}>
          <List sx={{ py: 0 }}>
            {loading ? (
              <ListItem>
                <p className="p-4 text-sm text-foreground">
                  Cargando chats...
                </p>
              </ListItem>
            ) : filteredTickets.length === 0 ? (
              <ListItem>
                <p className="p-4 text-sm text-muted-foreground">
                  No se encontraron chats
                </p>
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

                const resolvedQueue = getResolvedQueue(ticket)
                const resolvedUser = getResolvedUser(ticket)
                const resolvedWhatsapp = getResolvedWhatsapp(ticket)
                const resolvedTags = getResolvedTags(ticket)

                return (
                  <li key={ticket.id} className="group relative list-none border-b border-border/50 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => handleSelectTicket(ticket)}
                      className={`flex w-full items-start gap-3 px-3 py-2 text-left transition-colors ${
                        selectedTicket?.id === ticket.id
                          ? 'bg-primary/[0.10]'
                          : 'hover:bg-muted/60'
                      }`}
                    >
                      {/* Avatar + punto de canal */}
                      <div className="relative shrink-0">
                        {ticket.isGroup ? (
                          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <GroupIcon />
                          </span>
                        ) : (
                          <ContactAvatar
                            src={ticket.contact?.urlPicture || ticket.contact?.profilePicUrl}
                            name={displayContactName(ticket.contact)}
                            size="md"
                          />
                        )}
                        {/* Punto verde de estado "en línea" (cosmético estilo referencia).
                            TODO: conectar a estado real del contacto cuando el backend lo exponga;
                            hoy no hay dato de presencia, se muestra fijo. La señal de canal sigue
                            visible en el chip de conexión de la línea 3. */}
                        <span className="absolute bottom-0 right-0 size-3 rounded-full bg-success ring-2 ring-card" />
                      </div>

                      {/* Contenido */}
                      <div className="min-w-0 flex-1">
                        {/* Linea 1: Nombre + Fecha */}
                        <div className="flex items-center gap-2">
                          <p
                            className={`my-0 min-w-0 flex-1 truncate text-sm leading-tight text-foreground ${ticket.unreadMessages > 0 ? 'font-bold' : 'font-semibold'}`}
                          >
                            {displayContactName(ticket.contact)}
                          </p>
                          <span
                            className={`shrink-0 text-[11px] font-medium ${ticket.unreadMessages > 0 ? 'text-success' : 'text-muted-foreground'}`}
                          >
                            {formatTicketDate(ticket.updatedAt)}
                          </span>
                        </div>

                        {/* Linea 2: check de leído + último mensaje + pill no-leídos */}
                        <div className="mt-px flex items-center gap-2">
                          <div className="flex min-w-0 flex-1 items-center gap-1">
                            {/* Doble-check de leído (cosmético estilo referencia).
                                TODO: alimentar con el ack real y la dirección del último mensaje
                                cuando el backend los exponga; hoy no hay dato, se muestra en verde
                                cuando existe un último mensaje. */}
                            {ticket.lastMessage && (
                              <DoneAllIcon className="shrink-0 text-success" sx={{ fontSize: 15 }} />
                            )}
                            <p
                              className={`my-0 min-w-0 flex-1 truncate text-[13px] leading-tight ${ticket.unreadMessages > 0 ? 'font-medium text-foreground' : 'font-normal text-muted-foreground'}`}
                            >
                              {formatLastMessagePreview(ticket.lastMessage) || 'Sin mensajes'}
                            </p>
                          </div>
                          {ticket.unreadMessages > 0 && (
                            <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-success px-1.5 text-[11px] font-bold leading-none text-white">
                              {ticket.unreadMessages > 99 ? '99+' : ticket.unreadMessages}
                            </span>
                          )}
                        </div>

                        {/* Linea 3: Conexion + Cola + Usuario + Tags (sutil) */}
                        {(resolvedWhatsapp || resolvedQueue || resolvedUser || resolvedTags.length > 0) && (
                          <div className="mt-0.5 flex items-center gap-1 overflow-hidden">
                            {resolvedWhatsapp && (
                              <span
                                className="inline-flex h-[17px] max-w-[92px] shrink-0 items-center rounded px-1.5 text-[0.65rem] font-medium"
                                style={{
                                  backgroundColor: `${getChannelColor(ticket.channel || ticket.whatsapp?.channel)}1f`,
                                  color: getChannelColor(ticket.channel || ticket.whatsapp?.channel),
                                }}
                              >
                                <span className="truncate">{resolvedWhatsapp.name}</span>
                              </span>
                            )}
                            {resolvedQueue && (
                              <ColorTag color={resolvedQueue.color} name={resolvedQueue.name} />
                            )}
                            {resolvedUser && (
                              <span className="inline-flex h-[17px] max-w-[64px] shrink-0 items-center rounded bg-muted px-1.5 text-[0.65rem] text-muted-foreground">
                                <span className="truncate">{resolvedUser.name}</span>
                              </span>
                            )}
                            {resolvedTags.slice(0, 2).map((tag) => (
                              <ColorTag key={tag.id} color={tag.color} name={tag.name} />
                            ))}
                          </div>
                        )}
                      </div>
                    </button>

                    {/* Acciones flotantes (hover / seleccionado) */}
                    <div
                      className={`absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md bg-card/95 px-1 py-0.5 shadow-sm ring-1 ring-border/60 backdrop-blur-sm transition-opacity ${
                        selectedTicket?.id === ticket.id ? 'opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'
                      }`}
                    >
                      {ticket.status === 'pending' && (
                        <>
                          <Tooltip title="Aceptar">
                            <button
                              type="button"
                              aria-label="Aceptar ticket"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleAcceptTicket(ticket)
                              }}
                              className="inline-flex size-6 cursor-pointer appearance-none items-center justify-center rounded-md border-0 bg-success/14 text-success-text transition-colors hover:bg-success/24"
                            >
                              <CheckIcon sx={{ fontSize: 14 }} />
                            </button>
                          </Tooltip>
                          <Tooltip title="Cerrar">
                            <button
                              type="button"
                              aria-label="Cerrar ticket"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCloseTicket(ticket.id)
                              }}
                              className="inline-flex size-6 cursor-pointer appearance-none items-center justify-center rounded-md border-0 bg-destructive/12 text-destructive-text transition-colors hover:bg-destructive/20"
                            >
                              <ClearIcon sx={{ fontSize: 14 }} />
                            </button>
                          </Tooltip>
                        </>
                      )}
                      {(ticket.status === 'open' || ticket.status === 'group') && (
                        <Tooltip title="Cerrar">
                          <button
                            type="button"
                            aria-label="Cerrar ticket"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCloseTicket(ticket.id)
                            }}
                            className="inline-flex size-6 cursor-pointer appearance-none items-center justify-center rounded-md border-0 bg-destructive/12 text-destructive-text transition-colors hover:bg-destructive/20"
                          >
                            <ClearIcon sx={{ fontSize: 14 }} />
                          </button>
                        </Tooltip>
                      )}
                      {ticket.status === 'closed' && (
                        <Tooltip title="Reabrir">
                          <button
                            type="button"
                            aria-label="Reabrir ticket"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleReopenTicket(ticket)
                            }}
                            className="inline-flex size-6 cursor-pointer appearance-none items-center justify-center rounded-md border-0 bg-primary/12 text-primary transition-colors hover:bg-primary/20"
                          >
                            <ReplayIcon sx={{ fontSize: 14 }} />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </li>
                )
              })
            )}
          </List>

          {/* Loader para paginación infinita — logo ChatEAM con pulso */}
          {loadingMore && (
            <div className="flex justify-center py-4">
              <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                <img
                  src="/logo.png"
                  alt="ChatEAM"
                  className="w-9 h-9 object-contain animate-pulse [animation-duration:1s]"
                />
                <span className="text-xs">Cargando más tickets...</span>
              </div>
            </div>
          )}

          {/* Scroll sentinel para paginación infinita */}
          {hasMore && tickets.length > 0 && (
            <div ref={ticketsListRef} className="h-full mt-2" />
          )}
        </Sheet>
      </div>

      {/* Chat Area */}
      {selectedTicket ? (
        <div
          onDragEnter={handleChatDragEnter}
          onDragOver={handleChatDragOver}
          onDragLeave={handleChatDragLeave}
          onDrop={handleChatDrop}
          className="flex-1 flex flex-col overflow-hidden min-h-0 relative rounded-md border border-border bg-card shadow-sm"
        >
          {isChatDraggingFiles && (
            <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center bg-background/60 border-2 border-dashed border-brand-cyan">
              <div className="px-4 py-2 rounded-md bg-card shadow-md">
                <p className="text-sm font-semibold text-foreground">Suelta para adjuntar</p>
              </div>
            </div>
          )}
          {/* Campaign Banner - Muestra info de campaña O selector para asignar */}
          {campaignMessage ? (
            // ✅ HAY campaña asignada - Mostrar info + conversión
            <div className="flex items-stretch border-b border-border">
              {/* Sección Anuncio - Azul */}
              <Tooltip
                side="bottom"
                title={
                  <div className="p-2">
                    <p className="text-xs font-bold text-primary mb-1">
                      Detalles del Anuncio
                    </p>
                    {getCampaignMessageCampaignName(campaignMessage) && (
                      <p className="text-xs text-muted-foreground">Campaña: {getCampaignMessageCampaignName(campaignMessage)}</p>
                    )}
                    {campaignMessage.headline && (
                      <p className="text-xs text-muted-foreground">Título: {campaignMessage.headline}</p>
                    )}
                    {campaignMessage.sourceId && (
                      <p className="text-xs text-muted-foreground">Ad ID: {campaignMessage.sourceId}</p>
                    )}
                    {campaignMessage.ctwaClid && (
                      <p className="text-xs text-muted-foreground">CTWA: {campaignMessage.ctwaClid.substring(0, 20)}...</p>
                    )}
                    {campaignMessage.rawData?.manuallyAssigned && (
                      <p className="text-xs italic text-warning-text">Asignación manual</p>
                    )}
                  </div>
                }
              >
                <div className="px-3 py-1.5 flex items-center gap-2 cursor-pointer border-r border-brand-cyan bg-accent hover:bg-accent/70">
                  <span className="text-sm">📢</span>
                  <span className="text-xs font-bold text-accent-foreground">
                    {formatCompactCampaignName(campaignMessage)}
                  </span>
                  {campaignMessage.rawData?.manuallyAssigned && (
                    <UIBadge variant="warning" className="h-4 text-[0.55rem]">
                      Manual
                    </UIBadge>
                  )}
                  {campaignMessage.channel && (
                    <UIBadge className="h-[18px] text-[0.6rem] bg-brand-teal text-white border-transparent">
                      {campaignMessage.channel}
                    </UIBadge>
                  )}
                </div>
              </Tooltip>

              {/* Sección Conversión - Verde */}
              <div className="px-3 py-1.5 flex items-center gap-2 flex-1 bg-success/15">
                <MoneyIcon sx={(theme) => ({ fontSize: 16, color: theme.palette.mode === 'dark' ? '#86efac' : '#16a34a' })} />
                <span className="text-xs font-bold text-success-text mr-1">
                  Conversión:
                </span>
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
                    <Button size="icon" variant="primary" aria-label="Guardar conversión" onClick={handleSaveConversionNote} loading={savingConversion} className="size-[26px] bg-success text-white hover:bg-success/90">
                      <SaveIcon sx={{ fontSize: 14 }} />
                    </Button>
                    <button type="button" aria-label="Cancelar edición de conversión" onClick={() => { setEditingConversion(false); setConversionNoteValue(campaignMessage?.conversionNote || '') }} className="inline-flex items-center justify-center appearance-none border-0 cursor-pointer rounded-md size-[26px] bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
                      <ClearIcon sx={{ fontSize: 14 }} />
                    </button>
                  </Stack>
                ) : (
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                    {campaignMessage.conversionNote ? (
                      <span className="inline-flex items-center rounded-full bg-[#16a34a] px-2 py-0.5 text-xs font-bold text-white">
                        {campaignMessage.conversionNote}
                      </span>
                    ) : (
                      <span className="text-xs italic text-muted-foreground">
                        Sin valor
                      </span>
                    )}
                    <Tooltip title="Editar conversión">
                      <button type="button" aria-label="Editar conversión" onClick={() => setEditingConversion(true)} className="inline-flex items-center justify-center appearance-none border-0 cursor-pointer rounded-md size-6 bg-success/14 text-success-text transition-colors hover:bg-success/24">
                        <EditIcon sx={{ fontSize: 14 }} />
                      </button>
                    </Tooltip>
                  </Stack>
                )}
              </div>
            </div>
          ) : (
            // ❌ NO hay campaña - Mostrar selector para asignar
            // [Barrido UI] Banda de contexto, no un cartel: fuera el emoji y la
            // negrita, y menos alto. Sale en TODA conversacion sin campaña, asi que
            // no puede competir visualmente con el nombre del contacto.
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-1.5">
              <span className="text-xs text-muted-foreground">
                Asignar a campaña
              </span>

              {/* Select de Campañas */}
              <Select
                value={selectedCampaignId}
                onValueChange={(value) => {
                  setSelectedCampaignId(value)
                  setSelectedAdId('')
                }}
                onOpenChange={(isOpen) => {
                  if (isOpen && campaigns.length === 0) fetchCampaigns()
                }}
              >
                <SelectTrigger className="min-w-[200px] h-7 text-xs">
                  <SelectValue placeholder="Seleccionar campaña..." />
                </SelectTrigger>
                <SelectContent>
                  {loadingCampaigns ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Cargando campañas...</div>
                  ) : campaigns.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No hay campañas disponibles</div>
                  ) : (
                    campaigns.map(campaign => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {/* Select de Anuncios (aparece cuando hay campaña seleccionada) */}
              {selectedCampaignId && (
                <Select
                  value={selectedAdId}
                  onValueChange={(value) => setSelectedAdId(value)}
                >
                  <SelectTrigger className="min-w-[200px] h-7 text-xs">
                    <SelectValue placeholder="Seleccionar anuncio..." />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingAds ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">Cargando anuncios...</div>
                    ) : ads.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">No hay anuncios en esta campaña</div>
                    ) : (
                      ads.map(ad => (
                        <SelectItem key={ad.id} value={ad.id}>
                          {ad.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}

              {/* Botón Asignar (aparece cuando hay anuncio seleccionado) */}
              {selectedAdId && (
                <Button
                  size="sm"
                  variant="primary"
                  loading={assigning}
                  onClick={handleAssignCampaign}
                >
                  Asignar
                </Button>
              )}
            </div>
          )}


          {/* Chat Header - Messenger Style */}
          <div className="px-3 py-1.5 border-b border-border bg-card min-h-[48px] flex items-center">
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ width: '100%', minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                {selectedTicket.isGroup ? (
                  <span className="flex items-center justify-center rounded-full size-8 bg-muted text-muted-foreground shrink-0">
                    <GroupIcon />
                  </span>
                ) : (
                  <ContactAvatar
                    src={selectedTicket.contact?.urlPicture || selectedTicket.contact?.profilePicUrl}
                    name={displayContactName(selectedTicket.contact)}
                    size="sm"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-[0.9rem] leading-[1.15] text-foreground">
                    {displayContactName(selectedTicket.contact)}
                  </p>
                  {displayContactSubtitle(selectedTicket.contact) && (
                    <p className="truncate text-[10px] leading-[1.1] text-muted-foreground">
                      {displayContactSubtitle(selectedTicket.contact)}
                    </p>
                  )}
                  <Stack
                    direction="row"
                    spacing={0.5}
                    alignItems="center"
                    sx={{
                      flexWrap: 'nowrap',
                      overflowX: 'auto',
                      overflowY: 'hidden',
                      scrollbarWidth: 'none',
                      '&::-webkit-scrollbar': { display: 'none' },
                    }}
                  >
                    <div
                      className="w-[7px] h-[7px] rounded-full shrink-0"
                      style={{ backgroundColor: selectedTicket.status === 'open' ? '#31A24C' : '#8A8D91' }}
                    />
                    <span className="text-xs whitespace-nowrap shrink-0 text-muted-foreground">
                      {selectedTicket.status === 'open' ? 'Activo' : getStatusLabel(selectedTicket.status)}
                    </span>
                    {/* FASE 1 Coexistencia — chip de canal actual del ticket */}
                    {selectedTicket.channel && (
                      <ChannelBadge
                        provider={
                          selectedTicket.channel === 'whatsapp'
                            ? 'baileys'
                            : (selectedTicket.channel as any)
                        }
                        isDark={isDark}
                        compact
                      />
                    )}
                    {/* FASE 5 Coexistencia — selector dinámico de routing saliente */}
                    {selectedTicket.id && (selectedTicket.channel === 'whatsapp' || selectedTicket.channel === 'meta') && (
                      <RoutingPolicySelector
                        ticketId={selectedTicket.id}
                        ticketChannel={selectedTicket.channel}
                        isDark={isDark}
                      />
                    )}
                    {/* FASE 7 Coexistencia — indicador ventana 24h Meta + botón Pasar a WhatsApp */}
                    {selectedTicket.id && (selectedTicket.channel === 'whatsapp' || selectedTicket.channel === 'meta') && (
                      <MetaWindowIndicator
                        ticketId={selectedTicket.id}
                        ticketChannel={selectedTicket.channel}
                        isDark={isDark}
                      />
                    )}
                    {(() => {
                      const headerQueue = getResolvedQueue(selectedTicket)
                      return headerQueue ? (
                        <>
                          <span className="text-xs shrink-0 text-muted-foreground">·</span>
                          <ColorTag color={headerQueue.color} name={headerQueue.name} />
                        </>
                      ) : null
                    })()}
                    {selectedTicket.user && (
                      <>
                        <span className="text-xs shrink-0 text-muted-foreground">·</span>
                        <span className="text-xs whitespace-nowrap shrink-0 text-muted-foreground">
                          {selectedTicket.user.name}
                        </span>
                      </>
                    )}
                    <span className="text-xs shrink-0 text-muted-foreground">·</span>
                    {customerOriginSelector}
                  </Stack>
                </div>
              </Stack>

              <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                {(selectedTicket.channel === 'whatsapp' || selectedTicket.isGroup) && (
                  <Tooltip title="Recuperar mensajes faltantes">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Recuperar mensajes faltantes"
                      loading={recoveringMessages}
                      onClick={handleRecoverTicketMessages}
                      className="size-8 rounded-full text-warning-text hover:bg-accent hover:text-warning-text"
                    >
                      <RefreshIcon sx={{ fontSize: 20 }} />
                    </Button>
                  </Tooltip>
                )}
                {selectedTicket.status !== 'closed' && (
                  <Tooltip title="Cerrar ticket">
                    <button
                      type="button"
                      aria-label="Cerrar ticket"
                      onClick={() => handleCloseTicket()}
                      className="inline-flex items-center justify-center appearance-none border-0 bg-transparent cursor-pointer rounded-full size-8 text-destructive-text transition-colors hover:bg-accent"
                    >
                      <CloseIcon sx={{ fontSize: 20 }} />
                    </button>
                  </Tooltip>
                )}
                <Tooltip title="Ver contacto">
                  <button
                    type="button"
                    aria-label="Ver contacto"
                    onClick={() => setContactDrawerOpen(true)}
                    className="inline-flex items-center justify-center appearance-none border-0 bg-transparent cursor-pointer rounded-full size-8 text-muted-foreground transition-colors hover:bg-accent hover:text-brand-cyan"
                  >
                    <ContactIcon sx={{ fontSize: 20 }} />
                  </button>
                </Tooltip>
                <DropdownMenu>
                  <Tooltip title="Más opciones">
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Más opciones"
                        className="inline-flex items-center justify-center appearance-none border-0 bg-transparent cursor-pointer rounded-full size-8 text-muted-foreground transition-colors hover:bg-accent"
                      >
                        <MoreIcon sx={{ fontSize: 20 }} />
                      </button>
                    </DropdownMenuTrigger>
                  </Tooltip>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => {
                      setTicketMoreMenu(null)
                      setContactDrawerOpen(true)
                    }}>
                      <div className="flex items-center gap-2">
                        <ContactIcon sx={{ fontSize: 18 }} />
                        <span className="text-sm">Ver contacto</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => {
                      setTicketMoreMenu(null)
                      setShowTransferModal(true)
                    }}>
                      <div className="flex items-center gap-2">
                        <TransferIcon sx={{ fontSize: 18 }} />
                        <span className="text-sm">Transferir ticket</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={async () => {
                        setTicketMoreMenu(null)
                        if (!selectedTicket) return
                        const confirmed = window.confirm('¿Estás seguro de eliminar este ticket? Esta acción no se puede deshacer.')
                        if (!confirmed) return
                        try {
                          await api.delete(`/tickets/${selectedTicket.id}`)
                          toast.success('Ticket eliminado correctamente')
                          setSelectedTicket(null)
                          // El socket `company-X-ticket` con action='delete' remueve
                          // el ticket de la lista sin recargar (preserva scroll).
                          fetchTicketCounts()
                        } catch (error: any) {
                          console.error('Error al eliminar ticket:', error)
                          toast.error(error.response?.data?.message || 'Error al eliminar el ticket')
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <DeleteIcon sx={{ fontSize: 18, color: 'var(--joy-palette-danger-500)' }} />
                        <span className="text-sm text-destructive-text">Eliminar ticket</span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Tooltip title="Buscar en conversación">
                  <button
                    type="button"
                    aria-label="Buscar en conversación"
                    onClick={() => setConversationSearchActive(!conversationSearchActive)}
                    className={`inline-flex items-center justify-center appearance-none border-0 bg-transparent cursor-pointer rounded-full size-8 transition-colors hover:bg-accent ${conversationSearchActive ? 'text-brand-cyan' : 'text-muted-foreground'}`}
                  >
                    <SearchIcon sx={{ fontSize: 20 }} />
                  </button>
                </Tooltip>
              </Stack>
            </Stack>
          </div>

          {/* Barra de búsqueda en conversación */}
          {conversationSearchActive && (
            <ConversationSearchBar
              messages={selectedTicket?.messages || []}
              searchTerm={conversationSearchTerm}
              onSearchTermChange={setConversationSearchTerm}
              isDark={isDark}
            />
          )}

          {/* FASE 6 Coexistencia — "Trazabilidad de envíos (coexistencia)" OCULTO temporalmente (a pedido del usuario).
              Para reactivar: descomentar el bloque siguiente.
          {selectedTicket.id && (selectedTicket.channel === 'whatsapp' || selectedTicket.channel === 'meta') && (
            <div className="px-4 pt-2">
              <DispatchTimeline
                ticketId={selectedTicket.id}
                ticketChannel={selectedTicket.channel}
                isDark={isDark}
              />
            </div>
          )}
          */}

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 md:px-3 py-1.5 md:py-2 relative flex flex-col [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-foreground/15 hover:[&::-webkit-scrollbar-thumb]:bg-foreground/30"
            style={getChatBackgroundSx(isDark)}
          >
            <Stack spacing={0.25} sx={{ position: 'relative', zIndex: 1, marginTop: 'auto' }}>
              {loadingMoreMessages && (
                <div className="flex justify-center py-2">
                  <span className="text-xs text-muted-foreground">
                    Cargando mensajes anteriores...
                  </span>
                </div>
              )}
              {selectedTicket.messages.map((msg, index) => {
                const isOwn = msg.fromMe
                // Rol de color de la burbuja. Invertimos el énfasis: los mensajes
                // del CLIENTE (no propios) llevan el color destacado (azul/teal) y
                // los propios el gris. `isOwn` se sigue usando para la POSICIÓN
                // (izq/der), la cola de la burbuja y la visibilidad de los checks.
                const emphasized = !isOwn
                const prevMsg = index > 0 ? selectedTicket.messages[index - 1] : null
                const showSeparator = shouldShowDateSeparator(msg, prevMsg)
                const isMessageDeleted = msg.isDeleted || msg.messageStatus === 'deleted'
                const isBeingEdited = editingMessageId === msg.id
                const isMetaMessage = selectedTicket.channel === 'tiktok' && !isOwn && msg.dataJson
                const canSelectCurrentMessage = canSelectMessageForMode(msg)

                // Footer inline: en mensajes de SOLO texto ponemos hora+checks al final
                // del texto (compacto, estilo WhatsApp). En media/audio/contacto/etc. se
                // mantiene el footer en su fila propia debajo.
                const _mt = (msg.mediaType || '').toLowerCase()
                const bubbleHasMedia =
                  !!(msg as { mediaUrl?: string }).mediaUrl ||
                  (msg as { isUploading?: boolean }).isUploading === true ||
                  _mt.includes('image') || _mt.includes('sticker') || _mt.includes('video') ||
                  _mt.includes('audio') || _mt === 'ptt' ||
                  _mt.includes('contact') || _mt === 'vcard' ||
                  _mt.includes('location') || _mt === 'admetapreview'
                const inlineFooter = !bubbleHasMedia && !isMessageDeleted

                if (msg.isPrivate && !isOwn) return null

                return (
                  <div key={msg.id} id={`msg-${msg.id}`}>
                    {showSeparator && (
                      <DateSeparator
                        label={formatDateSeparator(msg.createdAt)}
                        isDark={isDark}
                      />
                    )}

                    <div
                      className={`flex items-start mb-0.5 relative [&:hover_.message-actions]:opacity-100 ${isOwn ? 'justify-end' : 'justify-start'}`}
                      onClick={() => {
                        if (selectionMode && canSelectCurrentMessage) {
                          handleToggleMessageSelection(msg)
                        }
                      }}
                    >
                      {/* CHECKBOX en modo selección */}
                      {selectionMode && (
                        <div
                          className={`flex items-center mr-1 ${!canSelectCurrentMessage ? 'opacity-50 pointer-events-none' : ''}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Checkbox
                            checked={selectedMessageIds.has(msg.id)}
                            onCheckedChange={() => handleToggleMessageSelection(msg)}
                          />
                        </div>
                      )}

                      {/* ─── MODO EDICIÓN ─── */}
                      {isBeingEdited ? (
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ maxWidth: '65%' }}>
                          <Input
                            value={editingMessageBody}
                            onChange={(e) => setEditingMessageBody(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEditMessage()
                              if (e.key === 'Escape') handleCancelEdit()
                            }}
                            autoFocus
                            sx={{ flex: 1, fontSize: '0.875rem' }}
                            disabled={savingEdit}
                          />
                          <Button size="icon" variant="primary" aria-label="Guardar edición"
                            onClick={handleSaveEditMessage} loading={savingEdit}
                            disabled={!editingMessageBody.trim()} className="size-8">
                            <CheckIcon sx={{ fontSize: 16 }} />
                          </Button>
                          <button type="button" aria-label="Cancelar edición"
                            onClick={handleCancelEdit} disabled={savingEdit}
                            className="inline-flex items-center justify-center rounded-md size-8 appearance-none border-0 bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none cursor-pointer">
                            <CloseIcon sx={{ fontSize: 16 }} />
                          </button>
                        </Stack>
                      ) : (
                        /* ─── MODO NORMAL / ELIMINADO ─── */
                        <>
                          {/* TikTok special */}
                          {isMetaMessage ? (
                            <TikTokCommentBubble message={msg} />
                          ) : (
                            <div
                              className={[
                                'relative max-w-[92%] sm:max-w-[82%] md:max-w-[74%]',
                                'px-2 md:px-2.5 py-1 md:py-1.5',
                                'shadow-[0_1px_0.5px_rgba(0,0,0,.08)] dark:shadow-[0_1px_0.5px_rgba(11,20,26,.13)]',
                                '[&_a]:[text-decoration-color:currentColor] [&_a:hover]:[text-decoration-color:currentColor]',
                                isMessageDeleted ? 'opacity-60 text-muted-foreground' : '',
                                emphasized
                                  ? '[&_a]:!text-inherit [&_a:visited]:!text-inherit [&_a:hover]:!text-inherit'
                                  : '[&_a]:text-[#1877F2] [&_a:visited]:text-[#6B46C1] [&_a:hover]:text-[#0F5EC7]',
                              ].join(' ')}
                              style={{
                                backgroundColor: isMessageDeleted
                                  ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)')
                                  : (emphasized
                                      ? (isDark
                                          ? facebookDesignTokens.message.outgoing.background
                                          : facebookDesignTokens.message.outgoing.backgroundLight)
                                      : (isDark
                                          ? facebookDesignTokens.message.incoming.background
                                          : facebookDesignTokens.message.incoming.backgroundLight)),
                                color: isMessageDeleted ? undefined : (emphasized
                                    ? (isDark
                                        ? facebookDesignTokens.message.outgoing.color
                                        : facebookDesignTokens.message.outgoing.colorLight)
                                    : (isDark
                                        ? facebookDesignTokens.message.incoming.color
                                        : facebookDesignTokens.message.incoming.colorLight)),
                                borderRadius: facebookDesignTokens.message.borderRadius,
                                borderTopRightRadius: isOwn ? '4px' : facebookDesignTokens.message.borderRadius,
                                borderTopLeftRadius: !isOwn ? '4px' : facebookDesignTokens.message.borderRadius,
                              }}
                            >
                              {/* Body — badge "Mensaje eliminado" (si aplica) + el contenido SIEMPRE visible.
                                  ChatEAM: como servicio de mensajería conservamos y mostramos el contenido
                                  original aunque el mensaje haya sido eliminado por el contacto. */}
                              {isMessageDeleted && (
                                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.25 }}>
                                  <DeleteIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                                  <span className="text-sm italic text-muted-foreground">
                                    Mensaje eliminado
                                  </span>
                                </Stack>
                              )}
                              {/* Cuerpo + footer. En msgs de texto van en un flex-wrap
                                  items-end para que la hora/checks queden inline al final. */}
                              <div className={inlineFooter ? 'flex flex-wrap items-end gap-x-1.5' : ''}>
                              <div className={inlineFooter ? 'min-w-0' : ''}>
                              {(
                                <MessageContent
                                  message={{
                                    ...msg,
                                    // Placeholder optimista: la mediaUrl ya es un blob: local, NO anteponer backend
                                    mediaUrl: (msg as { isUploading?: boolean }).isUploading
                                      ? msg.mediaUrl
                                      : msg.mediaUrl
                                        ? `${BACKEND_URL}/public/company${user?.companyId}/${msg.mediaUrl}`
                                        : msg.mediaUrl,
                                  }}
                                  isDark={isDark}
                                  isOwn={emphasized}
                                  isGroup={selectedTicket?.isGroup}
                                  searchTerm={conversationSearchActive ? conversationSearchTerm : undefined}
                                  onLightboxOpen={(src, type, currentIndex, allMedia) =>
                                    setLightboxData({ src, type, currentIndex: currentIndex as number, allMedia: (allMedia ?? []) as Array<{id: number; src: string; type: string}> })
                                  }
                                  allMedia={selectedTicket?.messages
                                    ?.filter((m) => m.mediaUrl && !(m as { isUploading?: boolean }).isUploading && (m.mediaType?.toLowerCase().includes('image') || m.mediaType?.toLowerCase().includes('video')))
                                    .map((m) => ({
                                      id: m.id,
                                      src: `${BACKEND_URL}/public/company${user?.companyId}/${m.mediaUrl!}`,
                                      type: m.mediaType?.toLowerCase().includes('video') ? 'video' : 'image',
                                    })) || []
                                  }
                                />
                              )}

                              {/* Barra de progreso de subida (UI optimista de media) */}
                              {(msg as { isUploading?: boolean }).isUploading && (
                                <LinearProgress
                                  determinate={(uploadProgress[String(msg.id)] ?? 0) > 0}
                                  value={uploadProgress[String(msg.id)] ?? 0}
                                  sx={{
                                    mt: 0.5,
                                    '--LinearProgress-thickness': '4px',
                                    '--LinearProgress-radius': '4px',
                                    color: emphasized ? 'rgba(255,255,255,0.85)' : '#5BC2D2',
                                  }}
                                />
                              )}

                              </div>
                              {/* Footer: indicadores + tiempo. Inline (ml-auto, sin mt) en msgs de texto. */}
                              <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end" sx={{ mt: inlineFooter ? 0 : 0.25, ml: inlineFooter ? 'auto' : 0, position: 'relative' }}>
                                {(msg as { isUploading?: boolean }).isUploading ? (
                                  <Stack direction="row" spacing={0.5} alignItems="center">
                                    <CircularProgress
                                      size="sm"
                                      determinate={(uploadProgress[String(msg.id)] ?? 0) > 0}
                                      value={uploadProgress[String(msg.id)] ?? 0}
                                      sx={{ '--CircularProgress-size': '14px', '--CircularProgress-trackThickness': '2px', '--CircularProgress-progressThickness': '2px', color: emphasized ? 'rgba(255,255,255,0.8)' : '#5BC2D2' }}
                                    />
                                    <span
                                      className="text-[11px] select-none"
                                      style={{ color: emphasized ? 'rgba(255,255,255,0.75)' : (isDark ? '#8A8D91' : 'rgba(5,5,5,0.55)') }}
                                    >
                                      Enviando… {uploadProgress[String(msg.id)] ?? 0}%
                                    </span>
                                  </Stack>
                                ) : (
                                <>
                                {msg.isEdited && !isMessageDeleted && (
                                  <span className="text-[10px] italic text-muted-foreground">
                                    editado
                                  </span>
                                )}
                                {msg.isForwarded && !isMessageDeleted && (
                                  <span className="text-[10px] text-muted-foreground">
                                    reenviado
                                  </span>
                                )}
                                <span
                                  className="text-[11px] select-none"
                                  style={{ color: emphasized ? 'rgba(255,255,255,0.6)' : (isDark ? '#8A8D91' : 'rgba(5,5,5,0.45)') }}
                                >
                                  {formatTime(msg.createdAt)}
                                </span>
                                {/* FASE 1 Coexistencia — badge de canal físico (Meta/Baileys/business_app).
                                    Se renderiza sólo si el backend envía provider o sourceChannel. */}
                                {!isMessageDeleted && (
                                  <ChannelBadge
                                    provider={(msg as any).provider}
                                    sourceChannel={(msg as any).sourceChannel}
                                    isDark={isDark}
                                    compact
                                  />
                                )}
                                {isOwn && msg.ack !== undefined && !isMessageDeleted && (
                                  <span
                                    className="text-[11px]"
                                    style={{ color: msg.ack >= 3 ? '#5BC2D2' : (isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.35)') }}
                                  >
                                    {msg.ack === 0 ? '🕐' : msg.ack >= 2 ? '✓✓' : '✓'}
                                    {msg.ack === 4 && <span style={{ marginLeft: 2 }}>▶</span>}
                                  </span>
                                )}

                                {/* BOTÓN MENÚ (hover) — anclado al footer, abajo-right */}
                                {!isMessageDeleted && !selectionMode && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <div
                                        className="message-actions absolute -right-5 -bottom-1 opacity-0 transition-opacity duration-150 bg-muted rounded-full flex items-center justify-center w-6 h-6 shadow-sm cursor-pointer z-[2] hover:opacity-100"
                                      >
                                        <MoreIcon sx={{ fontSize: 14 }} />
                                      </div>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent side="top" align="start">
                                      {(() => {
                                        const media = getDownloadableMedia(msg)
                                        if (!media) return null
                                        return (
                                          <DropdownMenuItem asChild onSelect={() => handleCloseMessageMenu()}>
                                            <a href={media.url} download={media.name}>
                                              <ListItemDecorator><DownloadIcon /></ListItemDecorator>
                                              Descargar
                                            </a>
                                          </DropdownMenuItem>
                                        )
                                      })()}
                                      <DropdownMenuItem onSelect={() => {
                                        const msgToReply = selectedTicket?.messages.find((m) => m.id === msg.id)
                                        if (msgToReply) setReplyingTo(msgToReply)
                                        setMessageActionMenu(null)
                                      }}>
                                        <ListItemDecorator><ReplyIcon /></ListItemDecorator>
                                        Responder
                                      </DropdownMenuItem>
                                      {canSelectMessageForMode(msg, 'forward') && (
                                        <DropdownMenuItem onSelect={() => { handleCloseMessageMenu(); handleEnterSelectionMode('forward', msg); }}>
                                          <ListItemDecorator sx={{ transform: 'scaleX(-1)' }}><ReplyIcon /></ListItemDecorator>
                                          Reenviar
                                        </DropdownMenuItem>
                                      )}
                                      {isOwn && (
                                        <DropdownMenuItem onSelect={() => { handleCloseMessageMenu(); handleStartEditMessage(msg.id, msg.body || ''); }}>
                                          <ListItemDecorator><EditIcon /></ListItemDecorator>
                                          Editar
                                        </DropdownMenuItem>
                                      )}
                                      {isOwn && (
                                        <DropdownMenuItem onSelect={() => { handleCloseMessageMenu(); handleEnterSelectionMode('delete', msg); }}>
                                          <ListItemDecorator><DeleteIcon /></ListItemDecorator>
                                          Eliminar
                                        </DropdownMenuItem>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                                </>
                                )}
                              </Stack>
                              </div>
                            </div>
                          )}

                        </>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </Stack>
          </div>

          {/* Message Input */}
          <MessageInput
            ticketId={selectedTicket.id}
            ticketStatus={selectedTicket.status}
            ticketChannel={selectedTicket.channel === 'tiktok' ? 'tiktok' : selectedTicket.isGroup ? 'group' : (selectedTicket.channel || 'whatsapp')}
            droppedFiles={dragDropFiles}
            onDroppedFilesHandled={handleDroppedFilesHandled}
            contactId={selectedTicket.contact?.id}
            contactName={displayContactName(selectedTicket.contact)}
            contactNumber={selectedTicket.contact?.number}
            whatsappId={selectedTicket.whatsappId ?? selectedTicket.whatsapp?.id}
            whatsappName={selectedTicket.whatsapp?.name}
            replyingTo={replyingTo || undefined}
            onCancelReply={() => setReplyingTo(null)}
            onSendMessage={(msg) => {
              setReplyingTo(null)
              setSelectedTicket((prev) => prev ? {
                ...prev,
                lastMessage: msg,
                updatedAt: new Date().toISOString(),
              } : null)
            }}
            onMediaSendStart={handleMediaSendStart}
            onMediaSendProgress={handleMediaSendProgress}
            onMediaSendEnd={handleMediaSendEnd}
          />

          {/* Media Lightbox */}
          {lightboxData && (
            <MediaLightbox
              open={true}
              onClose={() => setLightboxData(null)}
              currentSrc={lightboxData.src}
              currentType={lightboxData.type}
              currentIndex={lightboxData.currentIndex}
              allMedia={lightboxData.allMedia}
              isDark={isDark}
              onNavigate={(src, type, idx) =>
                setLightboxData((prev) => prev ? { ...prev, src, type, currentIndex: idx } : null)
              }
            />
          )}
        </div>
      ) : (
        <div
          className="flex-1 flex items-center justify-center relative rounded-md border border-border shadow-sm overflow-hidden"
          style={getChatBackgroundSx(isDark)}
        >
          <div className="text-center relative z-[1]">
            {/* Circulo decorativo con icono */}
            <div className="w-20 h-20 rounded-full bg-brand-cyan/10 flex items-center justify-center mx-auto mb-6">
              <MessageIcon sx={{ fontSize: 36, color: '#5BC2D2', opacity: 0.7 }} />
            </div>
            <img
              src="/chateam-logo.png"
              alt="Chateam"
              className="w-[200px] h-auto mb-4 opacity-35"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
            <p className="mb-2 text-lg font-semibold text-muted-foreground">
              Selecciona una conversacion
            </p>
            <p className="text-sm text-muted-foreground max-w-[300px] mx-auto leading-relaxed">
              Elige un ticket de la lista para ver los mensajes y comenzar a chatear
            </p>
            <p className="text-xs text-brand-cyan opacity-50 mt-6">
              Powered by Chateam
            </p>
          </div>
        </div>
      )}

      {/* Contact Drawer */}
      <ContactDrawer
        open={contactDrawerOpen}
        onClose={() => setContactDrawerOpen(false)}
        contact={selectedTicket?.contact || null}
        ticket={selectedTicket}
        loading={loading}
        onContactPatched={handleContactPatchedFromDrawer}
        onTicketPatched={handleTicketPatchedFromDrawer}
      />

      {/* ─── MODAL ACEPTAR TICKET (selección de cola obligatoria si falta) ─── */}
      <AcceptTicketModal
        open={acceptQueueModalOpen}
        onClose={handleAcceptQueueClose}
        queues={currentUserQueues}
        ticketId={ticketToAccept?.id ?? null}
        contactName={ticketToAccept?.contact ? displayContactName(ticketToAccept.contact) : undefined}
        submitting={acceptingTicket}
        errorMessage={acceptError}
        onConfirm={handleAcceptQueueConfirm}
      />

      {/* ─── BARRA DE SELECCIÓN ─── */}
      {selectionMode && (
        <ForwardSelectionBar
          mode={selectionMode}
          selectedCount={selectedMessageIds.size}
          onCancel={handleExitSelectionMode}
          onAction={selectionMode === 'delete' ? handleDeleteMessages : () => setShowForwardModal(true)}
          loading={actionLoading}
        />
      )}

      {/* ─── MODAL REENVÍO ─── */}
      <ForwardContactPicker
        open={showForwardModal}
        onClose={() => setShowForwardModal(false)}
        onForward={handleForwardMessages}
        loading={forwardLoading}
      />

      {/* ─── MODAL NUEVO TICKET ─── */}
      <Dialog
        open={showNewTicketModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowNewTicketModal(false)
            setNewTicketContactSearch('')
            setNewTicketContacts([])
            setNewTicketContactId(null)
            setNewTicketQueueId('')
            setNewTicketWhatsappId('')
          }
        }}
      >
        <DialogContent className="max-w-[500px]">
          <p className="text-lg font-semibold mb-2 text-foreground">
            Nuevo Ticket
          </p>
          <p className="text-sm mb-6 text-muted-foreground">
            Crea un ticket manualmente seleccionando un contacto existente.
          </p>

          {/* Buscar contacto */}
          <FormControl sx={{ mb: 2 }}>
            <FormLabel>Contacto *</FormLabel>
            <Autocomplete
              placeholder="Busca por nombre o número..."
              inputValue={newTicketContactSearch}
              onInputChange={(_event, newInputValue) => {
                handleContactSearchChange(newInputValue)
              }}
              onChange={(_event, newValue: any) => {
                setNewTicketContactId(newValue?.id || null)
              }}
              loading={searchingNewTicketContacts}
              options={newTicketContacts}
              getOptionLabel={(option: any) => `${option.name} - ${option.number}`}
              isOptionEqualToValue={(option: any, value: any) => option.id === value.id}
              filterOptions={(options) => options}
              renderOption={(props: any, option: any) => (
                <li {...props}>
                  <div className="flex items-center gap-2">
                    <Avatar name={option.name || ''} size="sm" />
                    <div>
                      <p className="text-sm text-foreground">{option.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {option.number}
                      </p>
                    </div>
                  </div>
                </li>
              )}
            />
          </FormControl>

          {/* Cola */}
          <FormControl sx={{ mb: 2 }}>
            <FormLabel>Cola</FormLabel>
            <Select
              value={newTicketQueueId === '' ? '__none__' : newTicketQueueId}
              onValueChange={(value) => setNewTicketQueueId(value === '__none__' ? '' : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una cola (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin cola</SelectItem>
                {queues.map((queue) => (
                  <SelectItem key={queue.id} value={queue.id.toString()}>
                    {queue.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormControl>

          {/* Conexión WhatsApp */}
          <FormControl sx={{ mb: 3 }}>
            <FormLabel>Conexión</FormLabel>
            <Select
              value={newTicketWhatsappId === '' ? '__none__' : newTicketWhatsappId}
              onValueChange={(value) => setNewTicketWhatsappId(value === '__none__' ? '' : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona conexión (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Predeterminada</SelectItem>
                {whatsapps
                  .filter((w) => w.channel === 'whatsapp' || w.channel === 'meta')
                  .map((w) => (
                    <SelectItem key={w.id} value={w.id.toString()}>
                      {w.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FormControl>

          <div className="flex gap-4 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setShowNewTicketModal(false)
                setNewTicketContactSearch('')
                setNewTicketContacts([])
                setNewTicketContactId(null)
                setNewTicketQueueId('')
                setNewTicketWhatsappId('')
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateNewTicket}
              loading={newTicketLoading}
              disabled={!newTicketContactId}
            >
              Crear Ticket
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL TRANSFERIR TICKET ─── */}
      <Dialog
        open={showTransferModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowTransferModal(false)
            setSelectedUser(null)
            setSearchUserQuery('')
            setSearchResults([])
          }
        }}
      >
        <DialogContent className="max-w-[500px]">
          <p className="text-lg font-semibold mb-4 text-foreground">
            Transferir Ticket
          </p>
          <p className="text-sm mb-6 text-muted-foreground">
            Selecciona el agente al que se reasignará este ticket. El responsable cambiará al usuario seleccionado.
          </p>

          <FormControl sx={{ mb: 3 }}>
            <FormLabel>Buscar usuario</FormLabel>
            <Autocomplete
              placeholder="Escribe el nombre o email del agente..."
              value={selectedUser}
              onChange={(_event, newValue) => {
                setSelectedUser(newValue)
              }}
              inputValue={searchUserQuery}
              onInputChange={(_event, newInputValue) => {
                setSearchUserQuery(newInputValue)
                handleSearchUser(newInputValue)
              }}
              loading={searchingUsers}
              options={searchResults}
              getOptionLabel={(option: any) => option?.email ? `${option.name} (${option.email})` : option?.name || ''}
              isOptionEqualToValue={(option: any, value: any) => option.id === value.id}
              filterOptions={(options) => options}
              renderOption={(props: any, option: any) => (
                <li {...props}>
                  <div className="flex items-center gap-2">
                    <Avatar name={option.name || ''} size="sm" />
                    <div>
                      <p className="text-sm text-foreground">{option.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {option.email}
                      </p>
                    </div>
                  </div>
                </li>
              )}
            />
          </FormControl>

          {selectedUser && (
            <div className="mb-6 p-4 bg-muted rounded-lg">
              <p className="text-xs mb-1 text-muted-foreground">
                Usuario seleccionado
              </p>
              <div className="flex items-center gap-2">
                <Avatar name={selectedUser.name || ''} size="sm" className="size-6 text-[10px]" />
                <div>
                  <p className="text-sm text-foreground">{selectedUser.name}</p>
                  {selectedUser.email && (
                    <p className="text-xs text-muted-foreground">
                      {selectedUser.email}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-4 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setShowTransferModal(false)
                setSelectedUser(null)
                setSearchUserQuery('')
                setSearchResults([])
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleTransferTicket}
              loading={transferring}
              disabled={!selectedUser}
            >
              Transferir
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={purchaseConfirmModal.open}
        onOpenChange={(open) => {
          if (!open && !sendingPurchaseConversion) {
            setPurchaseConfirmModal({ open: false, campaignMessage: null, value: 0 })
          }
        }}
      >
        <DialogContent className="w-[min(92vw,460px)]">
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center">
              <MoneyIcon sx={{ color: 'success.500' }} />
              <p className="text-lg font-semibold text-foreground">
                Enviar Purchase a Meta
              </p>
            </Stack>

            <p className="text-sm text-muted-foreground">
              Guardaste un valor de conversión. ¿Quieres enviar ahora la conversión Purchase a Meta Conversions API?
            </p>

            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-bold text-foreground">
                Valor: ${purchaseConfirmModal.value} USD
              </p>
              <p className="text-xs mt-1 text-muted-foreground">
                {purchaseConfirmModal.campaignMessage?.ctwaClid
                  ? 'Se enviará con CTWA click id para atribución exacta.'
                  : 'No hay CTWA click id. Se enviará igual con atribución aproximada usando los datos del contacto.'}
              </p>
            </div>

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                variant="outline"
                disabled={sendingPurchaseConversion}
                onClick={() => setPurchaseConfirmModal({ open: false, campaignMessage: null, value: 0 })}
              >
                Solo guardar
              </Button>
              <Button
                variant="primary"
                className="bg-success text-white hover:bg-success/90"
                loading={sendingPurchaseConversion}
                onClick={handleSendPurchaseConversionFromTicket}
              >
                Enviar Purchase
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </div>
    </div>
      </TooltipProvider>
    </CssVarsProvider>
  )
}
