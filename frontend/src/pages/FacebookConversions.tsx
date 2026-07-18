import { useState, useEffect, useMemo } from 'react'
// [migración G] LinearProgress se conserva como MUI (no hay equivalente en el DS).
import { LinearProgress } from '@mui/joy'
import {
    FacebookLogo,
    InstagramLogo,
    WhatsappLogo,
    CheckCircle,
    XCircle,
    Clock,
    ArrowClockwise,
    ArrowsClockwise,
    PaperPlaneTilt,
    TrendUp,
    Database,
    ClipboardText,
    FileArrowUp,
    UserPlus,
    Receipt,
    MagnifyingGlass,
    CaretLeft,
    CaretRight,
    Warning,
    ShoppingCart,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import api from '../services/api'
import { showSuccess, showError } from '../utils/showToast'
import KanbanLeadConversions from './KanbanLeadConversions'
import MetaSignalMonitor from '../components/MetaSignalMonitor' // [Fase2·A4.1/B6.1]

interface ConversionEvent {
    id: number
    companyId: number
    whatsappId: number
    contactId: number
    eventName: string
    eventTime: number
    responseStatus: 'pending' | 'sent' | 'success' | 'failed'
    errorMessage?: string
    createdAt: string
    sentAt?: string
    messagingChannel?: string
    customData?: {
        value?: number
        currency?: string
        orderId?: string
    }
    contact?: {
        name: string
        number: string
    }
    whatsapp?: {
        name: string
        channel: string
    }
}

interface ConversionStats {
    totalSent: number
    totalFailed: number
    totalPending: number
    total: number
}

interface Dataset {
    id: number
    companyId: number
    whatsappId: number
    datasetId: string
    datasetName?: string
    datasetSource?: 'manual' | 'auto' | 'legacy' | string
    validationStatus?: 'valid' | 'failed' | 'pending' | string
    validationError?: string
    validatedAt?: string
    channel: string
    channelIdentifier: string
    status: string
    whatsapp?: {
        name: string
        channel: string
    }
}

interface Connection {
    id: number
    name: string
    channel: string
    status?: string
    number?: string
    phoneNumberId?: string
    facebookUserId?: string
    facebookPageUserId?: string
}

interface ImportDetail {
    phone: string
    name: string
    total: number
    invoiceNumber: string
    origin: string
    status: 'campaign_matched' | 'created' | 'matched' | 'duplicate' | 'failed' | 'no_campaign'
    contactName?: string
    reason?: string
    campaignHeadline?: string
    campaignType?: string
    hasCtwaClid?: boolean
}

interface ImportResult {
    totalRows: number
    processedRows: number
    skippedAnuladas: number
    matched: number
    created: number
    campaignMatched: number
    noCampaign: number
    campaignMsgsCreated: number
    duplicates: number
    failed: number
    totalRevenue: number
    matchedRevenue: number
    details: ImportDetail[]
}

interface CampaignMessage {
    id: number
    companyId: number
    contactId: number
    messageId?: number
    ticketId?: number
    whatsappId?: number
    sourceId?: string
    sourceType?: string
    sourceUrl?: string
    headline?: string
    body?: string
    ctwaClid?: string
    thumbnail?: string
    channel?: string
    conversionNote?: string
    createdAt: string
    contact?: {
        id: number
        name: string
        number: string
        profilePicUrl?: string
    }
    whatsapp?: {
        id: number
        name: string
    }
}

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'destructive'

// [a11y] Texto de estado con los tokens *-text; los tokens de superficie no
// alcanzan 4.5:1 como color de texto.
const toneText: Record<Tone, string> = {
    neutral: 'text-foreground',
    primary: 'text-primary',
    success: 'text-success-text',
    warning: 'text-warning-text',
    destructive: 'text-destructive-text',
}

const toneSurface: Record<Tone, string> = {
    neutral: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/12 text-primary',
    success: 'bg-success/14 text-success-text',
    warning: 'bg-warning/16 text-warning-text',
    destructive: 'bg-destructive/12 text-destructive-text',
}

/** Tarjeta de estadística con ícono (equivalente al Card+Stack del layout previo). */
function StatCard({
    icon,
    value,
    label,
    tone = 'neutral',
}: {
    icon: React.ReactNode
    value: React.ReactNode
    label: string
    tone?: Tone
}) {
    return (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-center gap-3">
                <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg', toneSurface[tone])}>
                    {icon}
                </span>
                <div className="min-w-0">
                    <p className={cn('text-2xl font-semibold tracking-tight tabular-nums', toneText[tone])}>{value}</p>
                    <p className="truncate text-sm text-muted-foreground">{label}</p>
                </div>
            </div>
        </div>
    )
}

/** Tarjeta compacta para el resumen de importación. */
function MiniStat({
    value,
    label,
    tone = 'neutral',
    icon,
    className,
}: {
    value: React.ReactNode
    label: string
    tone?: Tone
    icon?: React.ReactNode
    className?: string
}) {
    return (
        <div className={cn('rounded-lg border border-border bg-muted/40 p-3', className)}>
            <div className="flex items-center gap-1.5">
                {icon}
                <span className={cn('text-xl font-semibold tabular-nums', toneText[tone])}>{value}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
        </div>
    )
}

export default function FacebookConversions() {
    const [loading, setLoading] = useState(false)
    const [events, setEvents] = useState<ConversionEvent[]>([])
    const [stats, setStats] = useState<ConversionStats | null>(null)
    const [datasets, setDatasets] = useState<Dataset[]>([])
    const [connections, setConnections] = useState<Connection[]>([])
    const [statusFilter, setStatusFilter] = useState('all')
    const [channelFilter, setChannelFilter] = useState('all')
    const [openTestModal, setOpenTestModal] = useState(false)
    const [syncing, setSyncing] = useState(false)
    const [syncingConnectionId, setSyncingConnectionId] = useState<number | null>(null)

    // Test event form
    const [testEvent, setTestEvent] = useState({
        eventName: 'Contact',
        contactId: '',
        testEventCode: ''
    })

    // Campaign Messages
    const [campaignMessages, setCampaignMessages] = useState<CampaignMessage[]>([])
    const [campaignLoading, setCampaignLoading] = useState(false)
    const [editingNote, setEditingNote] = useState<{ [key: number]: string }>({})
    const [sendingConversion, setSendingConversion] = useState<number | null>(null)

    // Events search & pagination
    const [eventsSearch, setEventsSearch] = useState('')
    const [eventsPage, setEventsPage] = useState(1)

    // Tab activo de la Card unificada: 0 = Eventos de Conversión, 1 = Leads Kanban
    const [activeTab, setActiveTab] = useState(0)
    const EVENTS_PER_PAGE = 15

    // Campaign Messages search & pagination
    const [campaignSearch, setCampaignSearch] = useState('')
    const [campaignPage, setCampaignPage] = useState(1)
    const [campaignCount, setCampaignCount] = useState(0)
    const [campaignHasMore, setCampaignHasMore] = useState(false)
    // Filtro por estado de conversión: 'all' | 'sent' (enviadas) | 'pending' (no enviadas)
    const [campaignStatusFilter, setCampaignStatusFilter] = useState<'all' | 'sent' | 'pending' | 'pending_no_value'>('all')
    // Envío masivo de conversiones pendientes
    const [sendingAllPending, setSendingAllPending] = useState(false)
    const [sendAllModal, setSendAllModal] = useState<{ open: boolean; total: number; enviables: number; skipped: number }>({ open: false, total: 0, enviables: 0, skipped: 0 })
    // Conteos TOTALES por filtro (de toda la BD, no de la página actual)
    const [campaignCounts, setCampaignCounts] = useState<{ all: number; sent: number; pending: number; pending_no_value: number }>({ all: 0, sent: 0, pending: 0, pending_no_value: 0 })

    // Sales Import
    const [showImportModal, setShowImportModal] = useState(false)
    const [importFile, setImportFile] = useState<File | null>(null)
    const [importing, setImporting] = useState(false)
    const [importResult, setImportResult] = useState<ImportResult | null>(null)
    const [selectedWhatsappId, setSelectedWhatsappId] = useState<number | null>(null)

    // Confirmation modal for sending conversion
    const [confirmSendModal, setConfirmSendModal] = useState<{ open: boolean; msg: CampaignMessage | null; value: number }>({ open: false, msg: null, value: 0 })
    // Result notification modal
    const [resultModal, setResultModal] = useState<{ open: boolean; success: boolean; message: string }>({ open: false, success: false, message: '' })

    // ============================================
    // Tracking unificado Meta Conversions
    // ============================================
    type TrackableEvent = 'CompleteRegistration' | 'StartTrial' | 'Purchase' | 'Login'

    interface TrackedInfo { status: string; sentAt: string | null; eventId: number }
    type TrackedMap = Record<number, Partial<Record<TrackableEvent, TrackedInfo>>>

    const [trackedEvents, setTrackedEvents] = useState<TrackedMap>({})
    const [trackingEvent, setTrackingEvent] = useState<{ msgId: number | null; eventName: TrackableEvent | null }>({ msgId: null, eventName: null })
    const [trackModal, setTrackModal] = useState<{ open: boolean; msg: CampaignMessage | null; eventName: TrackableEvent | null }>({ open: false, msg: null, eventName: null })
    const [trackForm, setTrackForm] = useState<{ value: string; currency: string; contentName: string; predictedLtv: string; method: string; orderId: string }>({
        value: '', currency: 'USD', contentName: '', predictedLtv: '', method: 'whatsapp', orderId: ''
    })

    const supportedConnections = useMemo(
        () => connections.filter(c => ['facebook', 'instagram', 'whatsapp', 'meta'].includes((c.channel || '').toLowerCase())),
        [connections]
    )

    const linkedDatasetRows = useMemo(() => {
        return datasets.map(dataset => {
            const connection = supportedConnections.find(c => c.id === dataset.whatsappId) || {
                id: dataset.whatsappId,
                name: dataset.whatsapp?.name || `Conexión ${dataset.whatsappId}`,
                channel: dataset.whatsapp?.channel || dataset.channel,
                status: dataset.status
            }

            return { connection, dataset }
        })
    }, [datasets, supportedConnections])

    const missingDatasetConnections = useMemo(() => {
        const linkedWhatsappIds = new Set(datasets.map(dataset => dataset.whatsappId))
        return supportedConnections.filter(connection => !linkedWhatsappIds.has(connection.id))
    }, [datasets, supportedConnections])

    // Client-side filtered + paginated events
    const filteredEvents = useMemo(() => {
        if (!eventsSearch.trim()) return events
        const term = eventsSearch.toLowerCase()
        return events.filter(e =>
            (e.contact?.name || '').toLowerCase().includes(term) ||
            (e.contact?.number || '').toLowerCase().includes(term) ||
            (e.eventName || '').toLowerCase().includes(term) ||
            (e.whatsapp?.name || '').toLowerCase().includes(term) ||
            (e.responseStatus || '').toLowerCase().includes(term)
        )
    }, [events, eventsSearch])

    const eventsTotalPages = Math.max(1, Math.ceil(filteredEvents.length / EVENTS_PER_PAGE))
    const paginatedEvents = useMemo(() => {
        const start = (eventsPage - 1) * EVENTS_PER_PAGE
        return filteredEvents.slice(start, start + EVENTS_PER_PAGE)
    }, [filteredEvents, eventsPage])

    useEffect(() => {
        fetchData()
        fetchCampaignMessages()
        fetchCampaignCounts()
    }, [statusFilter, channelFilter])

    const fetchData = async () => {
        setLoading(true)
        try {
            // Fetch events
            const params: any = {}
            if (statusFilter !== 'all') params.status = statusFilter

            const eventsResponse = await api.get('/facebook-conversions/events', { params })
            let fetchedEvents = eventsResponse.data.events || []

            // Filter by channel on frontend
            if (channelFilter !== 'all') {
                fetchedEvents = fetchedEvents.filter((e: ConversionEvent) =>
                    e.whatsapp?.channel === channelFilter
                )
            }

            setEvents(fetchedEvents)

            // Fetch stats
            const statsResponse = await api.get('/facebook-conversions/stats')
            setStats(statsResponse.data.summary)

            // Fetch datasets
            const datasetsResponse = await api.get('/facebook-conversions/datasets')
            setDatasets(datasetsResponse.data.datasets || [])

            // Fetch connections so a dataset can be linked before it exists.
            const connectionsResponse = await api.get('/whatsapp')
            setConnections(connectionsResponse.data || [])
        } catch (error) {
            console.error('Error fetching Facebook conversions data:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchCampaignMessages = async (search?: string, page?: number, status?: 'all' | 'sent' | 'pending' | 'pending_no_value') => {
        setCampaignLoading(true)
        try {
            const params: any = {
                pageNumber: page ?? campaignPage,
            }
            const searchTerm = search ?? campaignSearch
            if (searchTerm.trim()) params.searchParam = searchTerm.trim()
            const statusFilter = status ?? campaignStatusFilter
            if (statusFilter && statusFilter !== 'all') params.conversionStatus = statusFilter

            const response = await api.get('/campaign-messages', { params })
            setCampaignMessages(response.data.campaignMessages || [])
            setCampaignCount(response.data.count || 0)
            setCampaignHasMore(response.data.hasMore || false)
        } catch (error) {
            console.error('Error fetching campaign messages:', error)
        } finally {
            setCampaignLoading(false)
        }
    }

    // Conteos TOTALES por estado (para los badges de los botones de filtro).
    const fetchCampaignCounts = async () => {
        try {
            const { data } = await api.get('/campaign-messages/counts')
            setCampaignCounts({
                all: data.all || 0,
                sent: data.sent || 0,
                pending: data.pending || 0,
                pending_no_value: data.pending_no_value || 0
            })
        } catch (error) {
            console.error('Error fetching campaign counts:', error)
        }
    }

    const handleUpdateConversionNote = async (id: number, note: string) => {
        try {
            await api.put(`/campaign-messages/${id}`, { conversionNote: note })
            setCampaignMessages(prev =>
                prev.map(msg => msg.id === id ? { ...msg, conversionNote: note } : msg)
            )
            fetchCampaignCounts()
        } catch (error) {
            console.error('Error updating conversion note:', error)
            alert('❌ Error al actualizar la nota')
        }
    }

    const handleSendConversion = async (msg: CampaignMessage) => {
        const note = editingNote[msg.id] ?? msg.conversionNote ?? ''
        const value = parseFloat(note.replace(/[^0-9.]/g, '') || '0')

        if (!value) {
            setResultModal({ open: true, success: false, message: 'Ingresa un valor en la columna "Valor" (ej: $100)' })
            return
        }

        const whatsappId = msg.whatsappId || datasets[0]?.whatsappId
        if (!whatsappId) {
            setResultModal({ open: true, success: false, message: 'No hay whatsappId disponible. Sincroniza un dataset primero.' })
            return
        }

        // Si no tiene ctwaClid, mostrar modal de confirmacion
        if (!msg.ctwaClid) {
            setConfirmSendModal({ open: true, msg, value })
            return
        }

        // Si tiene ctwaClid, enviar directamente
        await executeSendConversion(msg, value, whatsappId)
    }

    const executeSendConversion = async (msg: CampaignMessage, value: number, whatsappId?: number) => {
        const resolvedWhatsappId = whatsappId || msg.whatsappId || datasets[0]?.whatsappId
        if (!resolvedWhatsappId) return

        setSendingConversion(msg.id)
        try {
            await api.post('/facebook-conversions/send', {
                whatsappId: resolvedWhatsappId,
                eventName: 'Purchase',
                contactId: msg.contactId,
                messageId: msg.messageId,
                ctwaClid: msg.ctwaClid,
                customData: {
                    value,
                    currency: 'USD'
                }
            })

            if (editingNote[msg.id] && editingNote[msg.id] !== msg.conversionNote) {
                await handleUpdateConversionNote(msg.id, editingNote[msg.id])
            }

            setResultModal({ open: true, success: true, message: `Conversion Purchase de $${value} USD enviada exitosamente a Facebook para ${msg.contact?.name || 'contacto'}` })
            fetchData()
            fetchCampaignCounts()
        } catch (error: any) {
            console.error('Error sending conversion:', error)
            setResultModal({ open: true, success: false, message: error.response?.data?.error || error.message })
        } finally {
            setSendingConversion(null)
        }
    }

    // Envío MASIVO: primero dryRun para el conteo del modal, luego el envío real.
    const handleOpenSendAll = async () => {
        try {
            const { data } = await api.post('/facebook-conversions/send-all-pending', {}, { params: { dryRun: 'true' } })
            setSendAllModal({
                open: true,
                total: data.totalPendingContacts || 0,
                enviables: data.sent || 0,
                skipped: data.skipped || 0
            })
        } catch (error: any) {
            setResultModal({ open: true, success: false, message: error.response?.data?.error || 'No se pudo calcular las conversiones pendientes' })
        }
    }

    const handleConfirmSendAll = async () => {
        setSendAllModal(prev => ({ ...prev, open: false }))
        setSendingAllPending(true)
        try {
            const { data } = await api.post('/facebook-conversions/send-all-pending', {})
            setResultModal({
                open: true,
                success: (data.failed || 0) === 0,
                message: `Conversiones enviadas: ${data.sent || 0} · Omitidas sin valor: ${data.skipped || 0} · Fallidas: ${data.failed || 0}`
            })
            fetchData()
            fetchCampaignMessages(campaignSearch, campaignPage)
            fetchCampaignCounts()
        } catch (error: any) {
            setResultModal({ open: true, success: false, message: error.response?.data?.error || error.message })
        } finally {
            setSendingAllPending(false)
        }
    }

    // ============================================
    // Tracking unificado: fetch + handlers
    // ============================================
    const fetchTrackedEvents = async (contactIds: number[]) => {
        if (!contactIds.length) {
            setTrackedEvents({})
            return
        }
        try {
            const response = await api.get('/facebook-conversions/tracked-events', {
                params: { contactIds: contactIds.join(',') }
            })
            setTrackedEvents(response.data.tracked || {})
        } catch (error) {
            console.error('Error fetching tracked events:', error)
        }
    }

    useEffect(() => {
        const ids = campaignMessages.map(m => m.contactId).filter(Boolean) as number[]
        fetchTrackedEvents(ids)
    }, [campaignMessages])

    const openTrackModal = (msg: CampaignMessage, eventName: TrackableEvent) => {
        if (eventName !== "Purchase") {
            setResultModal({ open: true, success: false, message: "Desde este panel solo se permite enviar Purchase manualmente." })
            return
        }

        const defaults = {
            value: "",
            currency: "USD",
            contentName: "",
            predictedLtv: "",
            method: "whatsapp",
            orderId: ""
        }

        const note = editingNote[msg.id] ?? msg.conversionNote ?? ""
        const numericFromNote = parseFloat(note.replace(/[^0-9.]/g, "") || "0")
        if (numericFromNote > 0) {
            defaults.value = String(numericFromNote)
        }
        setTrackForm(defaults)
        setTrackModal({ open: true, msg, eventName })
    }

    const executeTrackEvent = async () => {
        const { msg, eventName } = trackModal
        if (!msg || !eventName) return
        if (eventName !== "Purchase") {
            setResultModal({ open: true, success: false, message: "Desde este panel solo se permite enviar Purchase manualmente." })
            return
        }

        const customData: Record<string, any> = {}
        const v = parseFloat(trackForm.value || "0")
        if (!v || v <= 0) {
            setResultModal({ open: true, success: false, message: "Purchase requiere un valor numérico > 0" })
            return
        }
        customData.value = v
        customData.currency = trackForm.currency || "USD"
        if (trackForm.orderId.trim()) customData.order_id = trackForm.orderId.trim()

        setTrackingEvent({ msgId: msg.id, eventName })
        try {
            const response = await api.post("/facebook-conversions/track", {
                campaignMessageId: msg.id,
                eventName,
                customData
            })
            const deduped = !!response.data?.deduped
            setResultModal({
                open: true,
                success: true,
                message: deduped
                    ? "El evento Purchase ya estaba enviado para este contacto (idempotencia respetada)."
                    : "Evento Purchase enviado correctamente a Meta Conversions API."
            })
            setTrackModal({ open: false, msg: null, eventName: null })
            await fetchTrackedEvents(campaignMessages.map(m => m.contactId).filter(Boolean) as number[])
            await fetchData()
        } catch (error: any) {
            const errMsg = error.response?.data?.error || error.message || "Error desconocido"
            setResultModal({ open: true, success: false, message: errMsg })
        } finally {
            setTrackingEvent({ msgId: null, eventName: null })
        }
    }

    const getTrackedStatus = (contactId: number, eventName: TrackableEvent): TrackedInfo | undefined => {
        return trackedEvents[contactId]?.[eventName]
    }

    // ¿La conversión Purchase ya se envió correctamente para este contacto?
    // Se usa para deshabilitar el botón de envío y mostrar "Conversión enviada".
    const isPurchaseSent = (contactId: number): boolean => {
        const t = trackedEvents[contactId]?.["Purchase"]
        return !!t && (t.status === 'sent' || t.status === 'success')
    }

    const getConnectionIdentifierLabel = (connection?: Connection | null) => {
        if (!connection) return 'Sin identificador'
        const number = String(connection.number || '').trim()
        if (number) return number.startsWith('+') ? number : `+${number}`

        if (connection.phoneNumberId) return `Phone ID ${connection.phoneNumberId}`
        if (connection.facebookPageUserId) return `Page ID ${connection.facebookPageUserId}`
        if (connection.facebookUserId) {
            return connection.channel === 'instagram'
                ? `IG ID ${connection.facebookUserId}`
                : `WABA ID ${connection.facebookUserId}`
        }
        return `ID conexión ${connection.id}`
    }

    const syncConnectionDataset = async (connectionId: number) => {
        setSyncingConnectionId(connectionId)
        try {
            await api.post(`/facebook-conversions/sync-datasets/${connectionId}`, {
                mode: 'auto'
            })
            await fetchData()
            showSuccess('Dataset oficial sincronizado')
        } catch (error: any) {
            console.error('Error syncing dataset:', error)
            showError(error.response?.data?.error || error.message)
        } finally {
            setSyncingConnectionId(null)
        }
    }

    const handleSyncDatasets = async () => {
        if (supportedConnections.length === 0) {
            showError('No hay conexiones Facebook, Instagram, WhatsApp o Meta para sincronizar')
            return
        }

        setSyncing(true)
        try {
            const results = await Promise.allSettled(
                supportedConnections.map((connection) =>
                    api.post(`/facebook-conversions/sync-datasets/${connection.id}`, {
                        mode: 'auto'
                    })
                )
            )
            await fetchData()
            const failed = results.filter(result => result.status === 'rejected')
            const success = results.length - failed.length

            if (failed.length > 0) {
                console.error('Error syncing some datasets:', failed)
                showError(`Se sincronizaron ${success} conexiones y fallaron ${failed.length}. Revisa logs para el detalle.`)
                return
            }

            showSuccess(`Datasets oficiales sincronizados (${success})`)
        } catch (error: any) {
            console.error('Error syncing datasets:', error)
            showError(error.response?.data?.error || error.message)
        } finally {
            setSyncing(false)
        }
    }

    const handleSendTestEvent = async () => {
        if (!testEvent.contactId || !testEvent.testEventCode) {
            alert('Por favor completa todos los campos')
            return
        }

        try {
            const whatsappId = datasets[0]?.whatsappId
            if (!whatsappId) {
                alert('No hay conexión disponible')
                return
            }

            await api.post('/facebook-conversions/test', {
                whatsappId,
                eventName: testEvent.eventName,
                contactId: parseInt(testEvent.contactId),
                testEventCode: testEvent.testEventCode
            })

            alert('✅ Evento de prueba enviado. Verifica en Facebook Events Manager > Test Events')
            setOpenTestModal(false)
            fetchData()
        } catch (error: any) {
            console.error('Error sending test event:', error)
            alert(`❌ Error: ${error.response?.data?.error || error.message}`)
        }
    }

    const handleImportSales = async () => {
        if (!importFile) {
            alert('Selecciona un archivo Excel primero')
            return
        }

        setImporting(true)
        try {
            const formData = new FormData()
            formData.append('file', importFile)
            const whatsappId = selectedWhatsappId || datasets[0]?.whatsappId
            if (whatsappId) {
                formData.append('whatsappId', String(whatsappId))
            }

            const response = await api.post('/campaign-messages/import-sales', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 120000
            })

            setImportResult(response.data)
            fetchCampaignMessages()
        } catch (error: any) {
            console.error('Error importing sales:', error)
            alert(`Error: ${error.response?.data?.error || error.message}`)
        } finally {
            setImporting(false)
        }
    }

    const getOriginColor = (origin: string) => {
        switch (origin?.toLowerCase()) {
            case 'fb ads': return 'primary'
            case 'google ads': return 'danger'
            case 'tik tok': return 'warning'
            case 'marketplace': return 'neutral'
            case 'referido': return 'success'
            default: return 'neutral'
        }
    }

    // El ícono hereda el color del Badge que lo contiene (currentColor).
    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'success':
                return <CheckCircle className="size-3.5" weight="fill" aria-hidden />
            case 'failed':
                return <XCircle className="size-3.5" weight="fill" aria-hidden />
            case 'pending':
                return <Clock className="size-3.5" weight="fill" aria-hidden />
            default:
                return <Clock className="size-3.5" aria-hidden />
        }
    }

    const getStatusColor = (status: string): BadgeProps['variant'] => {
        switch (status) {
            case 'success':
                return 'success'
            case 'failed':
                return 'destructive'
            case 'pending':
                return 'warning'
            default:
                return 'neutral'
        }
    }

    const getChannelIcon = (channel: string) => {
        switch (channel) {
            case 'facebook':
                return <FacebookLogo className="size-3.5" weight="fill" aria-hidden />
            case 'instagram':
                return <InstagramLogo className="size-3.5" weight="fill" aria-hidden />
            case 'whatsapp':
                return <WhatsappLogo className="size-3.5" weight="fill" aria-hidden />
            default:
                return null
        }
    }

    // Ícono suelto (fuera de un Badge): color de marca del canal, igual que en Connections.
    const getChannelBrandIcon = (channel: string) => {
        switch (channel) {
            case 'facebook':
                return <FacebookLogo className="size-5 text-[#1877f2]" weight="fill" aria-hidden />
            case 'instagram':
                return <InstagramLogo className="size-5 text-[#e4405f]" weight="fill" aria-hidden />
            case 'whatsapp':
                return <WhatsappLogo className="size-5 text-wa" weight="fill" aria-hidden />
            default:
                return <Database className="size-5 text-muted-foreground" aria-hidden />
        }
    }

    const getChannelColor = (channel: string): BadgeProps['variant'] => {
        switch (channel) {
            case 'facebook':
                return 'primary'
            case 'instagram':
                return 'destructive'
            case 'whatsapp':
                return 'success'
            default:
                return 'neutral'
        }
    }

    const getChannelLabel = (channel: string) => {
        switch (channel) {
            case 'facebook':
                return 'Facebook'
            case 'instagram':
                return 'Instagram'
            case 'whatsapp':
                return 'WhatsApp'
            default:
                return channel
        }
    }

    return (
        <TooltipProvider>
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                            <FacebookLogo className="size-6" weight="fill" aria-hidden />
                        </span>
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                                Facebook Conversions API
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Gestión de eventos de conversión para anuncios de Facebook, Instagram y WhatsApp
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Tooltip title="Importar ventas desde archivo Excel">
                            <Button
                                size="sm"
                                variant="outline"
                                className="border-success/40 text-success-text hover:bg-success/10 hover:text-success-text"
                                onClick={() => { setShowImportModal(true); setImportResult(null); setImportFile(null) }}
                            >
                                <FileArrowUp className="size-4" aria-hidden />
                                Importar Ventas
                            </Button>
                        </Tooltip>

                        <Tooltip title="Enviar evento de prueba">
                            <Button size="sm" variant="outline" onClick={() => setOpenTestModal(true)}>
                                <PaperPlaneTilt className="size-4" aria-hidden />
                                Test Event
                            </Button>
                        </Tooltip>

                        <Tooltip title="Sincronizar datasets">
                            <Button size="sm" onClick={handleSyncDatasets} loading={syncing}>
                                <ArrowsClockwise className="size-4" aria-hidden />
                                Sync Datasets
                            </Button>
                        </Tooltip>

                        <Tooltip title="Actualizar">
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Actualizar"
                                className="text-muted-foreground"
                                onClick={fetchData}
                                disabled={loading}
                            >
                                <ArrowClockwise className="size-5" aria-hidden />
                            </Button>
                        </Tooltip>
                    </div>
                </div>

                {loading && <LinearProgress />}

                {/* Stats */}
                {stats && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            tone="success"
                            icon={<CheckCircle className="size-6" weight="fill" aria-hidden />}
                            value={stats.totalSent}
                            label="Eventos Enviados"
                        />
                        <StatCard
                            tone="destructive"
                            icon={<XCircle className="size-6" weight="fill" aria-hidden />}
                            value={stats.totalFailed}
                            label="Eventos Fallidos"
                        />
                        <StatCard
                            tone="warning"
                            icon={<Clock className="size-6" weight="fill" aria-hidden />}
                            value={stats.totalPending}
                            label="Eventos Pendientes"
                        />
                        <StatCard
                            tone="primary"
                            icon={<TrendUp className="size-6" weight="fill" aria-hidden />}
                            value={stats.total}
                            label="Total Eventos"
                        />
                    </div>
                )}

                {/* Datasets */}
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">
                                Datasets Configurados ({linkedDatasetRows.length})
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Dataset oficial vinculado a cada conexión para eventos CAPI y conversiones personalizadas.
                                {missingDatasetConnections.length > 0
                                    ? ` Hay ${missingDatasetConnections.length} conexión(es) sin dataset; usa Sincronizar oficiales para crearlas.`
                                    : ''}
                            </p>
                        </div>
                        <Button size="sm" onClick={handleSyncDatasets} loading={syncing}>
                            <ArrowsClockwise className="size-4" aria-hidden />
                            Sincronizar oficiales
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {linkedDatasetRows.map(({ connection, dataset }) => (
                            <div
                                key={`linked-${connection.id}`}
                                className={cn(
                                    'flex items-start gap-3 rounded-lg border p-3',
                                    dataset.validationStatus === 'failed'
                                        ? 'border-destructive/30 bg-destructive/10'
                                        : 'border-border bg-muted/40',
                                )}
                            >
                                <span className="mt-0.5 shrink-0">{getChannelBrandIcon(dataset.channel)}</span>
                                <div className="flex flex-1 flex-col justify-between gap-2 sm:flex-row sm:items-center">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="text-sm font-semibold text-foreground">
                                                {connection.name}
                                            </span>
                                            <Badge variant={getChannelColor(dataset.channel)}>
                                                {getChannelIcon(dataset.channel)}
                                                {getChannelLabel(dataset.channel)}
                                            </Badge>
                                            <Badge variant={dataset.datasetSource === 'auto' ? 'success' : 'primary'}>
                                                {dataset.datasetSource === 'auto' ? 'Oficial Meta' : 'Vinculado'}
                                            </Badge>
                                            <Badge
                                                variant={
                                                    dataset.validationStatus === 'failed'
                                                        ? 'destructive'
                                                        : dataset.validationStatus === 'valid' || dataset.status === 'active'
                                                            ? 'success'
                                                            : 'warning'
                                                }
                                            >
                                                {dataset.validationStatus === 'valid'
                                                    ? 'Validado'
                                                    : dataset.validationStatus === 'failed'
                                                        ? 'Error'
                                                        : dataset.status === 'active'
                                                            ? 'Activo'
                                                            : 'Pendiente'}
                                            </Badge>
                                        </div>
                                        <p className="mt-1 text-xs text-foreground">
                                            Dataset vinculado: {dataset.datasetName || `Dataset ${dataset.datasetId}`} · Dataset ID:{' '}
                                            <span className="font-mono">{dataset.datasetId}</span>
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Conexión: {getConnectionIdentifierLabel(connection)} ·{' '}
                                            {dataset.channelIdentifier && `${dataset.channel === 'facebook' ? 'Page ID' :
                                                dataset.channel === 'instagram' ? 'User ID' :
                                                    'WABA ID'
                                            }: ${dataset.channelIdentifier}`}
                                            {dataset.validationError ? ` · ${dataset.validationError}` : ''}
                                        </p>
                                        {dataset.validatedAt && (
                                            <p className="text-xs text-muted-foreground">
                                                Última validación: {new Date(dataset.validatedAt).toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="shrink-0"
                                        loading={syncingConnectionId === connection.id}
                                        onClick={() => syncConnectionDataset(connection.id)}
                                    >
                                        Re-sincronizar
                                    </Button>
                                </div>
                            </div>
                        ))}

                        {linkedDatasetRows.length === 0 && (
                            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                                No hay datasets vinculados todavía.
                            </div>
                        )}
                    </div>
                </div>

                {/* Eventos de Conversión + Leads Kanban — tabs para separar las tablas */}
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
                    <Tabs value={String(activeTab)} onValueChange={(v) => setActiveTab(Number(v))}>
                        <TabsList className="mb-4">
                            <TabsTrigger value="0">Eventos de Conversión</TabsTrigger>
                            <TabsTrigger value="1">Leads Kanban</TabsTrigger>
                            <TabsTrigger value="2">Monitor de señales</TabsTrigger>
                        </TabsList>

                        <TabsContent value="0" className="mt-0">
                            <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
                                <Select value={channelFilter} onValueChange={(value) => setChannelFilter(value)}>
                                    <SelectTrigger className="w-[190px]" aria-label="Filtrar por canal">
                                        <span className="flex items-center gap-2 truncate">
                                            <Database className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                                            <SelectValue />
                                        </span>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos los Canales</SelectItem>
                                        <SelectItem value="facebook">
                                            <span className="flex items-center gap-2">
                                                <FacebookLogo className="size-4" weight="fill" aria-hidden />
                                                Facebook
                                            </span>
                                        </SelectItem>
                                        <SelectItem value="instagram">
                                            <span className="flex items-center gap-2">
                                                <InstagramLogo className="size-4" weight="fill" aria-hidden />
                                                Instagram
                                            </span>
                                        </SelectItem>
                                        <SelectItem value="whatsapp">
                                            <span className="flex items-center gap-2">
                                                <WhatsappLogo className="size-4" weight="fill" aria-hidden />
                                                WhatsApp
                                            </span>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>

                                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value)}>
                                    <SelectTrigger className="w-[170px]" aria-label="Filtrar por estado">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos los Estados</SelectItem>
                                        <SelectItem value="success">Exitosos</SelectItem>
                                        <SelectItem value="failed">Fallidos</SelectItem>
                                        <SelectItem value="pending">Pendientes</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Input
                                    className="h-9 w-[250px]"
                                    placeholder="Buscar por nombre, telefono, evento..."
                                    aria-label="Buscar eventos"
                                    leftIcon={<MagnifyingGlass />}
                                    value={eventsSearch}
                                    onChange={(e) => { setEventsSearch(e.target.value); setEventsPage(1) }}
                                />
                            </div>

                            <div className="overflow-hidden rounded-lg border border-border">
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[900px] text-sm">
                                        <thead>
                                            <tr className="border-b border-border bg-muted/40 text-left">
                                                {['Canal', 'Status', 'Evento', 'Contacto', 'Conexión', 'Valor', 'Fecha Creación', 'Fecha Envío', 'Error'].map((c) => (
                                                    <th
                                                        key={c}
                                                        className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                                    >
                                                        {c}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {paginatedEvents.map((event) => (
                                                <tr key={event.id} className="transition-colors hover:bg-accent/40">
                                                    <td className="px-4 py-3">
                                                        <Badge variant={getChannelColor(event.whatsapp?.channel || '')}>
                                                            {getChannelIcon(event.whatsapp?.channel || '')}
                                                            {getChannelLabel(event.whatsapp?.channel || 'unknown')}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <Badge variant={getStatusColor(event.responseStatus)}>
                                                            {getStatusIcon(event.responseStatus)}
                                                            {event.responseStatus}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-4 py-3 font-semibold text-foreground">
                                                        {event.eventName}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="text-foreground">{event.contact?.name || 'N/A'}</p>
                                                        <p className="text-xs text-muted-foreground">{event.contact?.number}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-foreground">
                                                        {event.whatsapp?.name || `ID: ${event.whatsappId}`}
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3">
                                                        {event.customData?.value ? (
                                                            <span className="font-semibold tabular-nums text-success-text">
                                                                ${event.customData.value} {event.customData.currency || 'USD'}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">-</span>
                                                        )}
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                                                        {new Date(event.createdAt).toLocaleString()}
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                                                        {event.sentAt ? new Date(event.sentAt).toLocaleString() : '-'}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {event.errorMessage && (
                                                            <Tooltip title={event.errorMessage}>
                                                                <span className="cursor-pointer text-xs font-medium text-destructive-text underline decoration-dotted underline-offset-2">
                                                                    Ver error
                                                                </span>
                                                            </Tooltip>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {paginatedEvents.length === 0 && (
                                    <div className="flex flex-col items-center gap-2 p-8 text-center">
                                        <ClipboardText className="size-12 text-muted-foreground" aria-hidden />
                                        <p className="text-sm text-muted-foreground">
                                            {eventsSearch ? 'No se encontraron eventos para esta búsqueda' : 'No hay eventos de conversión registrados'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Events pagination */}
                            {filteredEvents.length > EVENTS_PER_PAGE && (
                                <div className="mt-4 flex items-center justify-center gap-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Página anterior"
                                        disabled={eventsPage <= 1}
                                        onClick={() => setEventsPage(p => p - 1)}
                                    >
                                        <CaretLeft className="size-[18px]" aria-hidden />
                                    </Button>
                                    <span className="text-sm text-muted-foreground">
                                        Página {eventsPage} de {eventsTotalPages} ({filteredEvents.length} resultados)
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Página siguiente"
                                        disabled={eventsPage >= eventsTotalPages}
                                        onClick={() => setEventsPage(p => p + 1)}
                                    >
                                        <CaretRight className="size-[18px]" aria-hidden />
                                    </Button>
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="1" className="mt-0">
                            {activeTab === 1 && <KanbanLeadConversions embedded />}
                        </TabsContent>

                        <TabsContent value="2" className="mt-0">
                            <MetaSignalMonitor />
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Campaign Messages Table */}
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <h2 className="text-lg font-semibold text-foreground">Mensajes de Campañas Publicitarias</h2>
                            <Badge variant="primary">{campaignCount}</Badge>
                            <Button
                                size="sm"
                                loading={sendingAllPending}
                                disabled={campaignLoading}
                                onClick={handleOpenSendAll}
                            >
                                <PaperPlaneTilt className="size-4" aria-hidden />
                                Enviar pendientes
                            </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {(['all', 'pending', 'pending_no_value', 'sent'] as const).map(f => {
                                const label = f === 'all' ? 'Todas' : f === 'pending' ? 'Pendientes' : f === 'pending_no_value' ? 'Sin valor' : 'Enviadas'
                                const active = campaignStatusFilter === f
                                return (
                                    <Button
                                        key={f}
                                        size="sm"
                                        variant={active ? 'primary' : 'outline'}
                                        className={cn(
                                            !active && f === 'sent' && 'text-success-text',
                                            !active && f === 'pending' && 'text-warning-text',
                                            !active && f === 'pending_no_value' && 'text-destructive-text',
                                        )}
                                        aria-pressed={active}
                                        disabled={campaignLoading}
                                        onClick={() => { setCampaignStatusFilter(f); setCampaignPage(1); fetchCampaignMessages(campaignSearch, 1, f) }}
                                    >
                                        {label} ({campaignCounts[f]})
                                    </Button>
                                )
                            })}
                            <Input
                                className="h-9 w-[250px]"
                                placeholder="Buscar por nombre, telefono, factura..."
                                aria-label="Buscar mensajes de campaña"
                                leftIcon={<MagnifyingGlass />}
                                value={campaignSearch}
                                onChange={(e) => setCampaignSearch(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        setCampaignPage(1)
                                        fetchCampaignMessages(campaignSearch, 1)
                                    }
                                }}
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Buscar"
                                onClick={() => { setCampaignPage(1); fetchCampaignMessages(campaignSearch, 1) }}
                                disabled={campaignLoading}
                            >
                                <MagnifyingGlass className="size-[18px]" aria-hidden />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Limpiar búsqueda"
                                onClick={() => { setCampaignSearch(''); setCampaignPage(1); fetchCampaignMessages('', 1) }}
                                disabled={campaignLoading}
                            >
                                <ArrowClockwise className="size-[18px]" aria-hidden />
                            </Button>
                        </div>
                    </div>

                    {campaignLoading && <LinearProgress sx={{ mb: 2 }} />}

                    <div className="overflow-hidden rounded-lg border border-border">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[900px] text-sm">
                                <thead>
                                    <tr className="border-b border-border bg-muted/40 text-left">
                                        <th className="w-[100px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fecha</th>
                                        <th className="w-[140px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contacto</th>
                                        <th className="w-[180px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anuncio</th>
                                        <th className="w-[80px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Canal</th>
                                        <th className="w-[100px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tracking</th>
                                        <th className="w-[140px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valor</th>
                                        <th className="w-[120px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {campaignMessages.map((msg) => (
                                        <tr key={msg.id} className="transition-colors hover:bg-accent/40">
                                            <td className="px-4 py-3 align-top">
                                                <p className="whitespace-nowrap text-xs text-foreground">
                                                    {new Date(msg.createdAt).toLocaleDateString()}
                                                </p>
                                                <p className="whitespace-nowrap text-xs text-muted-foreground">
                                                    {new Date(msg.createdAt).toLocaleTimeString()}
                                                </p>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <p className="font-medium text-foreground">{msg.contact?.name || 'N/A'}</p>
                                                <p className="text-xs text-muted-foreground">{msg.contact?.number}</p>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                {msg.sourceType === 'SALES_IMPORT' ? (
                                                    <>
                                                        <Badge variant="success" className="mb-1">
                                                            <Receipt className="size-3.5" aria-hidden />
                                                            Venta Importada
                                                        </Badge>
                                                        <p className="font-medium text-foreground">
                                                            {msg.headline || 'Sin titulo'}
                                                        </p>
                                                        {msg.body && (
                                                            <Tooltip title={msg.body}>
                                                                <p className="max-w-[150px] truncate text-xs text-muted-foreground">
                                                                    {msg.body}
                                                                </p>
                                                            </Tooltip>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        <p className="font-medium text-foreground">
                                                            {msg.headline || 'Sin titulo'}
                                                        </p>
                                                        {msg.sourceId && (
                                                            <Tooltip title={`Ad ID: ${msg.sourceId}`}>
                                                                <p className="cursor-pointer text-xs text-primary">
                                                                    ID: {msg.sourceId.length > 12 ? msg.sourceId.substring(0, 12) + '...' : msg.sourceId}
                                                                </p>
                                                            </Tooltip>
                                                        )}
                                                        {msg.body && (
                                                            <Tooltip title={msg.body}>
                                                                <p className="max-w-[150px] truncate text-xs text-muted-foreground">
                                                                    {msg.body}
                                                                </p>
                                                            </Tooltip>
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <Badge variant={getChannelColor(msg.channel || '')}>
                                                    {getChannelIcon(msg.channel || '')}
                                                    {getChannelLabel(msg.channel || 'unknown')}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                {msg.ctwaClid ? (
                                                    <Tooltip title={`CTWA ID: ${msg.ctwaClid}`}>
                                                        <span className="inline-flex">
                                                            <Badge variant="success">
                                                                <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                                                                Exacto
                                                            </Badge>
                                                        </span>
                                                    </Tooltip>
                                                ) : (
                                                    <Tooltip title="Sin ctwa_clid - La atribución será por número de teléfono (menos precisa)">
                                                        <span className="inline-flex">
                                                            <Badge variant="warning">
                                                                <Clock className="size-3.5" weight="fill" aria-hidden />
                                                                Aprox.
                                                            </Badge>
                                                        </span>
                                                    </Tooltip>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <Input
                                                    className="h-9 w-[120px]"
                                                    placeholder="ej: $100"
                                                    aria-label={`Valor de conversión para ${msg.contact?.name || 'contacto'}`}
                                                    value={editingNote[msg.id] ?? msg.conversionNote ?? ''}
                                                    onChange={(e) => setEditingNote(prev => ({ ...prev, [msg.id]: e.target.value }))}
                                                    onBlur={() => {
                                                        const note = editingNote[msg.id]
                                                        if (note !== undefined && note !== msg.conversionNote) {
                                                            handleUpdateConversionNote(msg.id, note)
                                                        }
                                                    }}
                                                />
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <div className="flex flex-col items-start gap-1">
                                                    {/* Botón legacy: Purchase rápido desde nota */}
                                                    <Tooltip title={msg.ctwaClid ? 'Purchase rápido con valor de la nota' : 'Purchase rápido (atribución aproximada)'}>
                                                        <Button
                                                            size="sm"
                                                            variant={isPurchaseSent(msg.contactId) ? 'outline' : (msg.ctwaClid ? 'primary' : 'outline')}
                                                            className={cn(
                                                                isPurchaseSent(msg.contactId) && 'text-success-text',
                                                                !isPurchaseSent(msg.contactId) && !msg.ctwaClid && 'text-warning-text',
                                                            )}
                                                            loading={sendingConversion === msg.id}
                                                            disabled={isPurchaseSent(msg.contactId) || sendingConversion === msg.id}
                                                            onClick={() => handleSendConversion(msg)}
                                                        >
                                                            <PaperPlaneTilt className="size-4" aria-hidden />
                                                            {isPurchaseSent(msg.contactId) ? 'Conversión enviada' : 'Purchase rápido'}
                                                        </Button>
                                                    </Tooltip>

                                                    <Tooltip title="Enviar Purchase manual con valor personalizado">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            loading={trackingEvent.msgId === msg.id}
                                                            disabled={isPurchaseSent(msg.contactId)}
                                                            onClick={() => openTrackModal(msg, "Purchase")}
                                                        >
                                                            <ShoppingCart className="size-4" aria-hidden />
                                                            {isPurchaseSent(msg.contactId) ? 'Enviada' : 'Purchase'}
                                                        </Button>
                                                    </Tooltip>

                                                    {/* Badges de estado por evento */}
                                                    <div className="flex flex-wrap gap-1">
                                                        {(["Purchase"] as TrackableEvent[]).map(ev => {
                                                            const tracked = getTrackedStatus(msg.contactId, ev)
                                                            if (!tracked) return null
                                                            const short = "Buy"
                                                            const variant: BadgeProps['variant'] = tracked.status === 'success' || tracked.status === 'sent' ? 'success' : tracked.status === 'pending' ? 'warning' : 'destructive'
                                                            return (
                                                                <Tooltip key={ev} title={`${ev}: ${tracked.status}`}>
                                                                    <span className="inline-flex">
                                                                        <Badge variant={variant}>{short}</Badge>
                                                                    </span>
                                                                </Tooltip>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {campaignMessages.length === 0 && !campaignLoading && (
                            <div className="flex flex-col items-center gap-2 p-8 text-center">
                                <ClipboardText className="size-12 text-muted-foreground" aria-hidden />
                                <p className="text-sm text-muted-foreground">
                                    {campaignSearch ? 'No se encontraron mensajes para esta búsqueda' : 'No hay mensajes de campañas publicitarias registrados'}
                                </p>
                                {!campaignSearch && (
                                    <>
                                        <p className="text-xs text-muted-foreground">
                                            Los mensajes aparecerán aquí cuando un contacto envíe un mensaje desde un anuncio Click-to-WhatsApp
                                        </p>
                                        <div className="mt-2 w-full max-w-md rounded-lg bg-muted/60 p-4 text-left">
                                            <p className="mb-2 text-xs font-semibold text-foreground">Tipos de Tracking:</p>
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="success">Exacto</Badge>
                                                    <span className="text-xs text-muted-foreground">Tiene ctwa_clid - Atribución 100% precisa</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="warning">Aprox.</Badge>
                                                    <span className="text-xs text-muted-foreground">Sin ctwa_clid - Atribución por teléfono (menos precisa)</span>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Campaign Messages pagination */}
                    {campaignCount > 0 && (
                        <div className="mt-4 flex items-center justify-center gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Página anterior"
                                disabled={campaignPage <= 1}
                                onClick={() => { const p = campaignPage - 1; setCampaignPage(p); fetchCampaignMessages(campaignSearch, p) }}
                            >
                                <CaretLeft className="size-[18px]" aria-hidden />
                            </Button>
                            <span className="text-sm text-muted-foreground">
                                Página {campaignPage} de {Math.max(1, Math.ceil(campaignCount / 20))} ({campaignCount} resultados)
                            </span>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Página siguiente"
                                disabled={!campaignHasMore}
                                onClick={() => { const p = campaignPage + 1; setCampaignPage(p); fetchCampaignMessages(campaignSearch, p) }}
                            >
                                <CaretRight className="size-[18px]" aria-hidden />
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Test Event Modal */}
            <Dialog open={openTestModal} onOpenChange={(o) => { if (!o) setOpenTestModal(false) }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Enviar Evento de Prueba</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="test-event-name">Tipo de Evento</Label>
                            <Select
                                value={testEvent.eventName}
                                onValueChange={(value) => setTestEvent({ ...testEvent, eventName: value })}
                            >
                                <SelectTrigger id="test-event-name" className="h-11">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Contact">Contact</SelectItem>
                                    <SelectItem value="Lead">Lead</SelectItem>
                                    <SelectItem value="Purchase">Purchase</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="test-contact-id">Contact ID</Label>
                            <Input
                                id="test-contact-id"
                                type="number"
                                value={testEvent.contactId}
                                onChange={(e) => setTestEvent({ ...testEvent, contactId: e.target.value })}
                                placeholder="Ej: 123"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="test-event-code">Test Event Code</Label>
                            <Input
                                id="test-event-code"
                                value={testEvent.testEventCode}
                                onChange={(e) => setTestEvent({ ...testEvent, testEventCode: e.target.value })}
                                placeholder="Obtener de Facebook Events Manager"
                            />
                            <p className="text-xs text-muted-foreground">
                                Ve a Facebook Events Manager {'>'} Test Events para obtener tu código
                            </p>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" size="sm" onClick={() => setOpenTestModal(false)}>
                                Cancelar
                            </Button>
                            <Button size="sm" onClick={handleSendTestEvent}>
                                Enviar
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Import Sales Modal */}
            <Dialog
                open={showImportModal}
                onOpenChange={(o) => { if (!o && !importing) { setShowImportModal(false); setImportResult(null); setImportFile(null) } }}
            >
                <DialogContent className="max-w-[700px]">
                    <DialogHeader>
                        <DialogTitle>Importar Ventas desde Excel</DialogTitle>
                    </DialogHeader>

                    {!importResult ? (
                        <div className="space-y-4">
                            <div className="rounded-lg border border-border bg-muted/40 p-3">
                                <p className="text-sm font-semibold text-foreground">Formato del archivo Excel:</p>
                                <p className="text-xs text-muted-foreground">
                                    Columnas requeridas: TELEFONO, CLIENTE, Total, ESTADO
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Solo se importan filas con ESTADO = PROCESADA. Los telefonos se normalizan al formato internacional de Ecuador (593...).
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="import-file">Archivo Excel (.xlsx)</Label>
                                <Input
                                    id="import-file"
                                    type="file"
                                    accept=".xlsx,.xls"
                                    className="py-2.5 file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:text-foreground"
                                    onChange={(e: any) => setImportFile(e.target.files?.[0] || null)}
                                />
                            </div>

                            {datasets.length > 0 && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="import-whatsapp">Conexion WhatsApp (para enviar conversiones)</Label>
                                    <Select
                                        value={String(selectedWhatsappId ?? datasets[0]?.whatsappId ?? '')}
                                        onValueChange={(value) => setSelectedWhatsappId(Number(value))}
                                    >
                                        <SelectTrigger id="import-whatsapp" className="h-11">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {datasets.map(d => (
                                                <SelectItem key={d.whatsappId} value={String(d.whatsappId)}>
                                                    {d.whatsapp?.name || `Connection ${d.whatsappId}`} ({d.channel})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {importing && (
                                <div>
                                    <LinearProgress sx={{ mb: 1 }} />
                                    <p className="text-center text-xs text-muted-foreground">
                                        Procesando archivo... Esto puede tardar unos segundos.
                                    </p>
                                </div>
                            )}

                            <DialogFooter>
                                <Button variant="outline" size="sm" onClick={() => { setShowImportModal(false); setImportFile(null) }} disabled={importing}>
                                    Cancelar
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleImportSales}
                                    loading={importing}
                                    disabled={!importFile}
                                >
                                    <FileArrowUp className="size-4" aria-hidden />
                                    Importar
                                </Button>
                            </DialogFooter>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div
                                className={cn(
                                    'rounded-lg border p-3',
                                    importResult.campaignMatched > 0
                                        ? 'border-success/30 bg-success/10'
                                        : 'border-warning/30 bg-warning/10',
                                )}
                            >
                                <p className="font-semibold text-foreground">Importacion completada</p>
                                <p className="text-sm text-muted-foreground">
                                    {importResult.campaignMatched > 0
                                        ? `${importResult.campaignMatched} ventas vinculadas a campanas ($${importResult.matchedRevenue.toFixed(2)}) de ${importResult.processedRows} procesadas`
                                        : `${importResult.processedRows} filas procesadas, ninguna vinculada a campanas existentes`
                                    }
                                </p>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                <MiniStat value={importResult.totalRows} label="Filas totales" />
                                <MiniStat value={importResult.processedRows} label="Procesadas" tone="primary" />
                                <MiniStat value={importResult.skippedAnuladas} label="Anuladas" tone="warning" />
                                <MiniStat
                                    className="border-success/50 bg-success/10"
                                    icon={<FacebookLogo className="size-[18px] text-[#1877f2]" weight="fill" aria-hidden />}
                                    value={importResult.campaignMatched}
                                    label="Match con campana"
                                    tone="success"
                                />
                                <MiniStat
                                    icon={<Receipt className="size-[18px] text-muted-foreground" aria-hidden />}
                                    value={importResult.noCampaign}
                                    label="Sin campana (aprox.)"
                                />
                                <MiniStat
                                    icon={<CheckCircle className="size-[18px] text-success-text" weight="fill" aria-hidden />}
                                    value={importResult.matched}
                                    label="Contactos existentes"
                                    tone="success"
                                />
                                <MiniStat
                                    icon={<UserPlus className="size-[18px] text-primary" aria-hidden />}
                                    value={importResult.created}
                                    label="Contactos nuevos"
                                    tone="primary"
                                />
                                <MiniStat value={importResult.duplicates} label="Duplicados" />
                                <MiniStat value={importResult.failed} label="Fallidos" tone="destructive" />
                                <MiniStat
                                    value={`$${importResult.totalRevenue.toFixed(2)}`}
                                    label="Revenue total"
                                    tone="success"
                                />
                            </div>

                            {/* Campaign matched details */}
                            {importResult.details.filter(d => d.status === 'campaign_matched').length > 0 && (
                                <div className="rounded-lg border border-success/40 p-3">
                                    <p className="mb-2 text-sm font-semibold text-success-text">
                                        Ventas vinculadas a campanas ({importResult.details.filter(d => d.status === 'campaign_matched').length})
                                    </p>
                                    <div className="max-h-[200px] overflow-auto rounded-md border border-border">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="border-b border-border bg-muted/40 text-left">
                                                    {['Cliente', 'Total', 'Campana', 'Tracking'].map((c) => (
                                                        <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold uppercase tracking-wide text-muted-foreground">
                                                            {c}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {importResult.details.filter(d => d.status === 'campaign_matched').map((detail, idx) => (
                                                    <tr key={idx}>
                                                        <td className="px-3 py-2">
                                                            <p className="text-foreground">{detail.name}</p>
                                                            <p className="text-muted-foreground">{detail.phone}</p>
                                                        </td>
                                                        <td className="px-3 py-2 font-semibold tabular-nums text-success-text">${detail.total}</td>
                                                        <td className="px-3 py-2 text-foreground">{detail.campaignHeadline}</td>
                                                        <td className="px-3 py-2">
                                                            <Badge variant={detail.hasCtwaClid ? 'success' : 'warning'}>
                                                                {detail.hasCtwaClid ? 'Exacto' : 'Aprox.'}
                                                            </Badge>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* No campaign match details */}
                            {importResult.details.filter(d => d.status === 'no_campaign').length > 0 && (
                                <div className="rounded-lg border border-border p-3">
                                    <p className="mb-1 text-sm font-semibold text-foreground">
                                        Sin match de campana ({importResult.details.filter(d => d.status === 'no_campaign').length})
                                    </p>
                                    <p className="mb-2 text-xs text-muted-foreground">
                                        Estos contactos no tienen campanas previas. Se crearon como SALES_IMPORT (atribucion aproximada por telefono).
                                    </p>
                                    <div className="max-h-[150px] overflow-auto rounded-md border border-border">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="border-b border-border bg-muted/40 text-left">
                                                    {['Cliente', 'Telefono', 'Total', 'Factura'].map((c) => (
                                                        <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold uppercase tracking-wide text-muted-foreground">
                                                            {c}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {importResult.details.filter(d => d.status === 'no_campaign').slice(0, 50).map((detail, idx) => (
                                                    <tr key={idx}>
                                                        <td className="px-3 py-2 text-foreground">{detail.name}</td>
                                                        <td className="px-3 py-2 text-foreground">{detail.phone}</td>
                                                        <td className="px-3 py-2 tabular-nums text-foreground">${detail.total}</td>
                                                        <td className="px-3 py-2 text-foreground">{detail.invoiceNumber}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Failed details */}
                            {importResult.details.filter(d => d.status === 'failed').length > 0 && (
                                <div className="rounded-lg border border-destructive/40 p-3">
                                    <p className="mb-2 text-sm font-semibold text-destructive-text">
                                        Registros fallidos ({importResult.details.filter(d => d.status === 'failed').length})
                                    </p>
                                    <div className="max-h-[200px] overflow-auto rounded-md border border-border">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="border-b border-border bg-muted/40 text-left">
                                                    {['Telefono', 'Cliente', 'Total', 'Razon'].map((c) => (
                                                        <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold uppercase tracking-wide text-muted-foreground">
                                                            {c}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {importResult.details.filter(d => d.status === 'failed').map((detail, idx) => (
                                                    <tr key={idx}>
                                                        <td className="px-3 py-2 text-foreground">{detail.phone}</td>
                                                        <td className="px-3 py-2 text-foreground">{detail.name}</td>
                                                        <td className="px-3 py-2 tabular-nums text-foreground">${detail.total}</td>
                                                        <td className="px-3 py-2 text-destructive-text">{detail.reason}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Duplicate details */}
                            {importResult.details.filter(d => d.status === 'duplicate').length > 0 && (
                                <div className="rounded-lg border border-border p-3">
                                    <p className="mb-2 text-sm font-semibold text-foreground">
                                        Duplicados omitidos ({importResult.details.filter(d => d.status === 'duplicate').length})
                                    </p>
                                    <div className="max-h-[150px] overflow-auto rounded-md border border-border">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="border-b border-border bg-muted/40 text-left">
                                                    {['Telefono', 'Cliente', 'Factura'].map((c) => (
                                                        <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold uppercase tracking-wide text-muted-foreground">
                                                            {c}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {importResult.details.filter(d => d.status === 'duplicate').map((detail, idx) => (
                                                    <tr key={idx}>
                                                        <td className="px-3 py-2 text-foreground">{detail.phone}</td>
                                                        <td className="px-3 py-2 text-foreground">{detail.name}</td>
                                                        <td className="px-3 py-2 text-foreground">{detail.invoiceNumber}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            <Button
                                size="sm"
                                onClick={() => { setShowImportModal(false); setImportResult(null); setImportFile(null) }}
                            >
                                Cerrar
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Confirmation Modal - Send Approximate Conversion */}
            <Dialog
                open={confirmSendModal.open}
                onOpenChange={(o) => { if (!o) setConfirmSendModal({ open: false, msg: null, value: 0 }) }}
            >
                <DialogContent className="max-w-[450px]">
                    <div className="flex flex-col items-center gap-5">
                        <span className="flex size-14 items-center justify-center rounded-full bg-warning/16 text-warning-text">
                            <Warning className="size-8" weight="fill" aria-hidden />
                        </span>

                        <div className="text-center">
                            <DialogTitle className="mb-1">Atribucion Aproximada</DialogTitle>
                            <p className="text-sm text-muted-foreground">
                                Este contacto no tiene <strong>ctwa_clid</strong> (Click-to-WhatsApp ID).
                                La atribucion sera por numero de telefono, lo cual puede resultar en una atribucion menos precisa.
                            </p>
                        </div>

                        {confirmSendModal.msg && (
                            <div className="w-full space-y-1 rounded-lg border border-border bg-muted/40 p-3">
                                <div className="flex justify-between gap-2">
                                    <span className="text-xs text-muted-foreground">Contacto</span>
                                    <span className="text-sm font-semibold text-foreground">{confirmSendModal.msg.contact?.name || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <span className="text-xs text-muted-foreground">Telefono</span>
                                    <span className="text-sm text-foreground">{confirmSendModal.msg.contact?.number || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <span className="text-xs text-muted-foreground">Valor</span>
                                    <span className="text-sm font-semibold tabular-nums text-success-text">${confirmSendModal.value} USD</span>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <span className="text-xs text-muted-foreground">Evento</span>
                                    <span className="text-sm text-foreground">Purchase</span>
                                </div>
                            </div>
                        )}

                        <div className="flex w-full gap-3">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => setConfirmSendModal({ open: false, msg: null, value: 0 })}
                            >
                                Cancelar
                            </Button>
                            <Button
                                className="flex-1"
                                loading={sendingConversion === confirmSendModal.msg?.id}
                                onClick={async () => {
                                    if (confirmSendModal.msg) {
                                        setConfirmSendModal(prev => ({ ...prev, open: false }))
                                        await executeSendConversion(confirmSendModal.msg, confirmSendModal.value)
                                    }
                                }}
                            >
                                <PaperPlaneTilt className="size-4" aria-hidden />
                                Enviar Aprox.
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Track Event Modal — Purchase manual */}
            <Dialog
                open={trackModal.open}
                onOpenChange={(o) => { if (!o && trackingEvent.msgId === null) setTrackModal({ open: false, msg: null, eventName: null }) }}
            >
                <DialogContent className="max-w-[500px]">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            {trackModal.eventName === 'Purchase' && (
                                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-success/14 text-success-text">
                                    <ShoppingCart className="size-6" weight="fill" aria-hidden />
                                </span>
                            )}
                            <div>
                                <DialogTitle>Enviar {trackModal.eventName}</DialogTitle>
                                <p className="text-xs text-muted-foreground">
                                    {trackModal.msg?.contact?.name || 'Contacto'} · {trackModal.msg?.contact?.number || ''}
                                </p>
                            </div>
                        </div>

                        {trackModal.msg && !trackModal.msg.ctwaClid && (
                            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
                                <Warning className="mt-0.5 size-4 shrink-0 text-warning-text" weight="fill" aria-hidden />
                                <p className="text-xs text-foreground">
                                    Sin <strong>ctwa_clid</strong>. La atribución será aproximada por teléfono.
                                </p>
                            </div>
                        )}

                        {/* Campos según evento */}
                        {trackModal.eventName === 'Purchase' && (
                            <>
                                <div className="space-y-1.5">
                                    <Label htmlFor="track-value">Valor *</Label>
                                    <Input id="track-value" type="number" value={trackForm.value} onChange={e => setTrackForm(p => ({ ...p, value: e.target.value }))} placeholder="100.00" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="track-currency">Moneda *</Label>
                                    <Input id="track-currency" value={trackForm.currency} onChange={e => setTrackForm(p => ({ ...p, currency: e.target.value.toUpperCase() }))} placeholder="USD" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="track-order-id">Order ID (opcional, idempotencia)</Label>
                                    <Input id="track-order-id" value={trackForm.orderId} onChange={e => setTrackForm(p => ({ ...p, orderId: e.target.value }))} placeholder="FAC-001234" />
                                </div>
                            </>
                        )}

                        <DialogFooter>
                            <Button variant="outline" size="sm" onClick={() => setTrackModal({ open: false, msg: null, eventName: null })} disabled={trackingEvent.msgId !== null}>
                                Cancelar
                            </Button>
                            <Button size="sm" loading={trackingEvent.msgId === trackModal.msg?.id} onClick={executeTrackEvent}>
                                <PaperPlaneTilt className="size-4" aria-hidden />
                                Enviar a Meta
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Result Notification Modal */}
            {/* Modal de confirmación: envío MASIVO de conversiones pendientes */}
            <Dialog
                open={sendAllModal.open}
                onOpenChange={(o) => { if (!o) setSendAllModal(prev => ({ ...prev, open: false })) }}
            >
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Enviar conversiones pendientes</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        Se enviarán <strong className="text-foreground">{sendAllModal.enviables}</strong> conversiones Purchase pendientes (con valor), tanto exactas como aproximadas.
                        {sendAllModal.skipped > 0 && <> Se omitirán <strong className="text-foreground">{sendAllModal.skipped}</strong> por no tener valor asignado.</>}
                        <br />Contactos pendientes en total: {sendAllModal.total}.
                    </p>
                    <DialogFooter>
                        <Button variant="ghost" size="sm" onClick={() => setSendAllModal(prev => ({ ...prev, open: false }))}>
                            Cancelar
                        </Button>
                        <Button size="sm" disabled={sendAllModal.enviables === 0} onClick={handleConfirmSendAll}>
                            <PaperPlaneTilt className="size-4" aria-hidden />
                            Enviar {sendAllModal.enviables}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={resultModal.open}
                onOpenChange={(o) => { if (!o) setResultModal({ open: false, success: false, message: '' }) }}
            >
                <DialogContent className="max-w-[420px]">
                    <div className="flex flex-col items-center gap-4">
                        <span
                            className={cn(
                                'flex size-14 items-center justify-center rounded-full',
                                resultModal.success ? 'bg-success/14 text-success-text' : 'bg-destructive/12 text-destructive-text',
                            )}
                        >
                            {resultModal.success
                                ? <CheckCircle className="size-8" weight="fill" aria-hidden />
                                : <XCircle className="size-8" weight="fill" aria-hidden />
                            }
                        </span>

                        <div className="text-center">
                            <DialogTitle className="mb-1">
                                {resultModal.success ? 'Conversion Enviada' : 'Error al Enviar'}
                            </DialogTitle>
                            <p className="text-sm text-muted-foreground">
                                {resultModal.message}
                            </p>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                                'min-w-[120px]',
                                resultModal.success ? 'text-success-text' : 'text-destructive-text',
                            )}
                            onClick={() => setResultModal({ open: false, success: false, message: '' })}
                        >
                            {resultModal.success ? 'Entendido' : 'Cerrar'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
        </TooltipProvider>
    )
}
