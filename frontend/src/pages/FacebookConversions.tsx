import { useState, useEffect, useMemo } from 'react'
import {
    Container,
    Typography,
    Box,
    Stack,
    Card,
    CardContent,
    Grid,
    Select,
    Option,
    Chip,
    Sheet,
    Table,
    Button,
    IconButton,
    Tooltip,
    LinearProgress,
    Alert,
    Modal,
    ModalDialog,
    Input,
    FormControl,
    FormLabel,
    Badge
} from '@mui/joy'
import {
    Facebook as FacebookIcon,
    CheckCircle as CheckCircleIcon,
    Error as ErrorIcon,
    Pending as PendingIcon,
    Refresh as RefreshIcon,
    Send as SendIcon,
    Sync as SyncIcon,
    TrendingUp as TrendingUpIcon,
    Storage as StorageIcon,
    Assignment as AssignmentIcon,
    Instagram as InstagramIcon,
    WhatsApp as WhatsAppIcon,
    UploadFile as UploadFileIcon,
    PersonAdd as PersonAddIcon,
    Receipt as ReceiptIcon,
    Search as SearchIcon,
    NavigateBefore as NavigateBeforeIcon,
    NavigateNext as NavigateNextIcon,
    Warning as WarningIcon
} from '@mui/icons-material'
import api from '../services/api'
import { showSuccess, showError } from '../utils/showToast'

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
    channel: string
    channelIdentifier: string
    status: string
    whatsapp?: {
        name: string
        channel: string
    }
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

export default function FacebookConversions() {
    const [loading, setLoading] = useState(false)
    const [events, setEvents] = useState<ConversionEvent[]>([])
    const [stats, setStats] = useState<ConversionStats | null>(null)
    const [datasets, setDatasets] = useState<Dataset[]>([])
    const [statusFilter, setStatusFilter] = useState('all')
    const [channelFilter, setChannelFilter] = useState('all')
    const [openTestModal, setOpenTestModal] = useState(false)
    const [syncing, setSyncing] = useState(false)

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
    const EVENTS_PER_PAGE = 15

    // Campaign Messages search & pagination
    const [campaignSearch, setCampaignSearch] = useState('')
    const [campaignPage, setCampaignPage] = useState(1)
    const [campaignCount, setCampaignCount] = useState(0)
    const [campaignHasMore, setCampaignHasMore] = useState(false)

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
        } catch (error) {
            console.error('Error fetching Facebook conversions data:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchCampaignMessages = async (search?: string, page?: number) => {
        setCampaignLoading(true)
        try {
            const params: any = {
                pageNumber: page ?? campaignPage,
            }
            const searchTerm = search ?? campaignSearch
            if (searchTerm.trim()) params.searchParam = searchTerm.trim()

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

    const handleUpdateConversionNote = async (id: number, note: string) => {
        try {
            await api.put(`/campaign-messages/${id}`, { conversionNote: note })
            setCampaignMessages(prev =>
                prev.map(msg => msg.id === id ? { ...msg, conversionNote: note } : msg)
            )
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
        } catch (error: any) {
            console.error('Error sending conversion:', error)
            setResultModal({ open: true, success: false, message: error.response?.data?.error || error.message })
        } finally {
            setSendingConversion(null)
        }
    }

    const handleSyncDatasets = async () => {
        setSyncing(true)
        try {
            await api.post('/facebook-conversions/sync-datasets')
            await fetchData()
            showSuccess('Datasets sincronizados exitosamente')
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

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'success':
                return <CheckCircleIcon sx={{ color: 'success.main' }} />
            case 'failed':
                return <ErrorIcon sx={{ color: 'danger.main' }} />
            case 'pending':
                return <PendingIcon sx={{ color: 'warning.main' }} />
            default:
                return <PendingIcon />
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'success':
                return 'success'
            case 'failed':
                return 'danger'
            case 'pending':
                return 'warning'
            default:
                return 'neutral'
        }
    }

    const getChannelIcon = (channel: string) => {
        switch (channel) {
            case 'facebook':
                return <FacebookIcon sx={{ fontSize: 18 }} />
            case 'instagram':
                return <InstagramIcon sx={{ fontSize: 18 }} />
            case 'whatsapp':
                return <WhatsAppIcon sx={{ fontSize: 18 }} />
            default:
                return null
        }
    }

    const getChannelColor = (channel: string) => {
        switch (channel) {
            case 'facebook':
                return 'primary'
            case 'instagram':
                return 'danger'
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
        <Container maxWidth="xl">
            <Stack spacing={3}>
                {/* Header */}
                <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={2} alignItems="center">
                        <FacebookIcon sx={{ fontSize: 32, color: '#1877F2' }} />
                        <Box>
                            <Typography level="h2">Facebook Conversions API</Typography>
                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                Gestión de eventos de conversión para anuncios de Facebook, Instagram y WhatsApp
                            </Typography>
                        </Box>
                    </Stack>

                    <Stack direction="row" spacing={2}>
                        <Tooltip title="Importar ventas desde archivo Excel">
                            <Button
                                startDecorator={<UploadFileIcon />}
                                onClick={() => { setShowImportModal(true); setImportResult(null); setImportFile(null) }}
                                variant="outlined"
                                color="success"
                            >
                                Importar Ventas
                            </Button>
                        </Tooltip>

                        <Tooltip title="Enviar evento de prueba">
                            <Button
                                startDecorator={<SendIcon />}
                                onClick={() => setOpenTestModal(true)}
                                variant="outlined"
                            >
                                Test Event
                            </Button>
                        </Tooltip>

                        <Tooltip title="Sincronizar datasets">
                            <Button
                                startDecorator={<SyncIcon />}
                                onClick={handleSyncDatasets}
                                loading={syncing}
                                color="primary"
                            >
                                Sync Datasets
                            </Button>
                        </Tooltip>

                        <Tooltip title="Actualizar">
                            <IconButton onClick={fetchData} disabled={loading}>
                                <RefreshIcon />
                            </IconButton>
                        </Tooltip>
                    </Stack>
                </Stack>

                {loading && <LinearProgress />}

                {/* Stats */}
                {stats && (
                    <Grid container spacing={2}>
                        <Grid xs={12} sm={6} md={3}>
                            <Card>
                                <CardContent>
                                    <Stack direction="row" spacing={2} alignItems="center">
                                        <CheckCircleIcon sx={{ fontSize: 32, color: 'success.main' }} />
                                        <Box>
                                            <Typography level="h2">{stats.totalSent}</Typography>
                                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                                Eventos Enviados
                                            </Typography>
                                        </Box>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid>

                        <Grid xs={12} sm={6} md={3}>
                            <Card>
                                <CardContent>
                                    <Stack direction="row" spacing={2} alignItems="center">
                                        <ErrorIcon sx={{ fontSize: 32, color: 'danger.main' }} />
                                        <Box>
                                            <Typography level="h2">{stats.totalFailed}</Typography>
                                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                                Eventos Fallidos
                                            </Typography>
                                        </Box>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid>

                        <Grid xs={12} sm={6} md={3}>
                            <Card>
                                <CardContent>
                                    <Stack direction="row" spacing={2} alignItems="center">
                                        <PendingIcon sx={{ fontSize: 32, color: 'warning.main' }} />
                                        <Box>
                                            <Typography level="h2">{stats.totalPending}</Typography>
                                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                                Eventos Pendientes
                                            </Typography>
                                        </Box>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid>

                        <Grid xs={12} sm={6} md={3}>
                            <Card>
                                <CardContent>
                                    <Stack direction="row" spacing={2} alignItems="center">
                                        <TrendingUpIcon sx={{ fontSize: 32, color: 'primary.main' }} />
                                        <Box>
                                            <Typography level="h2">{stats.total}</Typography>
                                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                                Total Eventos
                                            </Typography>
                                        </Box>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>
                )}

                {/* Datasets */}
                {datasets.length > 0 && (
                    <Card>
                        <CardContent>
                            <Typography level="h4" sx={{ mb: 2 }}>
                                Datasets Configurados ({datasets.length})
                            </Typography>
                            <Stack spacing={1}>
                                {datasets.map((dataset) => (
                                    <Alert
                                        key={dataset.id}
                                        color={getChannelColor(dataset.channel) as any}
                                        variant="soft"
                                        startDecorator={getChannelIcon(dataset.channel)}
                                    >
                                        <Box sx={{ flex: 1 }}>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Typography level="title-sm">
                                                    {dataset.whatsapp?.name || `Connection ${dataset.whatsappId}`}
                                                </Typography>
                                                <Chip size="sm" color={getChannelColor(dataset.channel) as any}>
                                                    {getChannelLabel(dataset.channel)}
                                                </Chip>
                                            </Stack>
                                            <Typography level="body-xs">
                                                Dataset ID: {dataset.datasetId}
                                                {dataset.channelIdentifier && ` | ${dataset.channel === 'facebook' ? 'Page ID' :
                                                        dataset.channel === 'instagram' ? 'User ID' :
                                                            'WABA ID'
                                                    }: ${dataset.channelIdentifier}`}
                                            </Typography>
                                        </Box>
                                    </Alert>
                                ))}
                            </Stack>
                        </CardContent>
                    </Card>
                )}

                {/* Events Table */}
                <Card>
                    <CardContent>
                        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                            <Typography level="h4">Eventos de Conversión</Typography>

                            <Stack direction="row" spacing={2}>
                                <Select
                                    value={channelFilter}
                                    onChange={(_, value) => setChannelFilter(value as string)}
                                    size="sm"
                                    sx={{ minWidth: 150 }}
                                    startDecorator={<StorageIcon />}
                                >
                                    <Option value="all">Todos los Canales</Option>
                                    <Option value="facebook">
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <FacebookIcon sx={{ fontSize: 16 }} />
                                            <span>Facebook</span>
                                        </Stack>
                                    </Option>
                                    <Option value="instagram">
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <InstagramIcon sx={{ fontSize: 16 }} />
                                            <span>Instagram</span>
                                        </Stack>
                                    </Option>
                                    <Option value="whatsapp">
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <WhatsAppIcon sx={{ fontSize: 16 }} />
                                            <span>WhatsApp</span>
                                        </Stack>
                                    </Option>
                                </Select>

                                <Select
                                    value={statusFilter}
                                    onChange={(_, value) => setStatusFilter(value as string)}
                                    size="sm"
                                    sx={{ minWidth: 150 }}
                                >
                                    <Option value="all">Todos los Estados</Option>
                                    <Option value="success">Exitosos</Option>
                                    <Option value="failed">Fallidos</Option>
                                    <Option value="pending">Pendientes</Option>
                                </Select>

                                <Input
                                    size="sm"
                                    placeholder="Buscar por nombre, telefono, evento..."
                                    startDecorator={<SearchIcon />}
                                    value={eventsSearch}
                                    onChange={(e) => { setEventsSearch(e.target.value); setEventsPage(1) }}
                                    sx={{ minWidth: 250 }}
                                />
                            </Stack>
                        </Stack>

                        <Sheet sx={{ overflow: 'auto' }}>
                            <Table>
                                <thead>
                                    <tr>
                                        <th>Canal</th>
                                        <th>Status</th>
                                        <th>Evento</th>
                                        <th>Contacto</th>
                                        <th>Conexión</th>
                                        <th>Valor</th>
                                        <th>Fecha Creación</th>
                                        <th>Fecha Envío</th>
                                        <th>Error</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedEvents.map((event) => (
                                        <tr key={event.id}>
                                            <td>
                                                <Chip
                                                    size="sm"
                                                    color={getChannelColor(event.whatsapp?.channel || '') as any}
                                                    startDecorator={getChannelIcon(event.whatsapp?.channel || '')}
                                                >
                                                    {getChannelLabel(event.whatsapp?.channel || 'unknown')}
                                                </Chip>
                                            </td>
                                            <td>
                                                <Chip
                                                    size="sm"
                                                    color={getStatusColor(event.responseStatus) as any}
                                                    startDecorator={getStatusIcon(event.responseStatus)}
                                                >
                                                    {event.responseStatus}
                                                </Chip>
                                            </td>
                                            <td>
                                                <Typography level="body-sm" fontWeight="bold">
                                                    {event.eventName}
                                                </Typography>
                                            </td>
                                            <td>
                                                <Typography level="body-sm">
                                                    {event.contact?.name || 'N/A'}
                                                </Typography>
                                                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                                    {event.contact?.number}
                                                </Typography>
                                            </td>
                                            <td>
                                                <Typography level="body-sm">
                                                    {event.whatsapp?.name || `ID: ${event.whatsappId}`}
                                                </Typography>
                                            </td>
                                            <td>
                                                {event.customData?.value ? (
                                                    <Typography level="body-sm" fontWeight="bold" sx={{ color: 'success.main' }}>
                                                        ${event.customData.value} {event.customData.currency || 'USD'}
                                                    </Typography>
                                                ) : (
                                                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                                        -
                                                    </Typography>
                                                )}
                                            </td>
                                            <td>
                                                <Typography level="body-sm">
                                                    {new Date(event.createdAt).toLocaleString()}
                                                </Typography>
                                            </td>
                                            <td>
                                                <Typography level="body-sm">
                                                    {event.sentAt ? new Date(event.sentAt).toLocaleString() : '-'}
                                                </Typography>
                                            </td>
                                            <td>
                                                {event.errorMessage && (
                                                    <Tooltip title={event.errorMessage}>
                                                        <Typography level="body-xs" sx={{ color: 'danger.main', cursor: 'pointer' }}>
                                                            Ver error
                                                        </Typography>
                                                    </Tooltip>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>

                            {paginatedEvents.length === 0 && (
                                <Box sx={{ p: 3, textAlign: 'center' }}>
                                    <AssignmentIcon sx={{ fontSize: 48, color: 'text.tertiary', mb: 1 }} />
                                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                        {eventsSearch ? 'No se encontraron eventos para esta búsqueda' : 'No hay eventos de conversión registrados'}
                                    </Typography>
                                </Box>
                            )}
                        </Sheet>

                        {/* Events pagination */}
                        {filteredEvents.length > EVENTS_PER_PAGE && (
                            <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mt: 2 }}>
                                <IconButton
                                    size="sm"
                                    disabled={eventsPage <= 1}
                                    onClick={() => setEventsPage(p => p - 1)}
                                >
                                    <NavigateBeforeIcon />
                                </IconButton>
                                <Typography level="body-sm">
                                    Página {eventsPage} de {eventsTotalPages} ({filteredEvents.length} resultados)
                                </Typography>
                                <IconButton
                                    size="sm"
                                    disabled={eventsPage >= eventsTotalPages}
                                    onClick={() => setEventsPage(p => p + 1)}
                                >
                                    <NavigateNextIcon />
                                </IconButton>
                            </Stack>
                        )}
                    </CardContent>
                </Card>

                {/* Campaign Messages Table */}
                <Card>
                    <CardContent>
                        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                            <Stack direction="row" spacing={2} alignItems="center">
                                <Typography level="h4">Mensajes de Campañas Publicitarias</Typography>
                                <Badge badgeContent={campaignCount} color="primary" />
                            </Stack>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Input
                                    size="sm"
                                    placeholder="Buscar por nombre, telefono, factura..."
                                    startDecorator={<SearchIcon />}
                                    value={campaignSearch}
                                    onChange={(e) => setCampaignSearch(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            setCampaignPage(1)
                                            fetchCampaignMessages(campaignSearch, 1)
                                        }
                                    }}
                                    sx={{ minWidth: 250 }}
                                />
                                <IconButton onClick={() => { setCampaignPage(1); fetchCampaignMessages(campaignSearch, 1) }} disabled={campaignLoading}>
                                    <SearchIcon />
                                </IconButton>
                                <IconButton onClick={() => { setCampaignSearch(''); setCampaignPage(1); fetchCampaignMessages('', 1) }} disabled={campaignLoading}>
                                    <RefreshIcon />
                                </IconButton>
                            </Stack>
                        </Stack>

                        {campaignLoading && <LinearProgress sx={{ mb: 2 }} />}

                        <Sheet sx={{ overflow: 'auto' }}>
                            <Table>
                                <thead>
                                    <tr>
                                        <th style={{ width: 100 }}>Fecha</th>
                                        <th style={{ width: 140 }}>Contacto</th>
                                        <th style={{ width: 180 }}>Anuncio</th>
                                        <th style={{ width: 80 }}>Canal</th>
                                        <th style={{ width: 100 }}>Tracking</th>
                                        <th style={{ width: 140 }}>Valor</th>
                                        <th style={{ width: 120 }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {campaignMessages.map((msg) => (
                                        <tr key={msg.id}>
                                            <td>
                                                <Typography level="body-xs">
                                                    {new Date(msg.createdAt).toLocaleDateString()}
                                                </Typography>
                                                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                                    {new Date(msg.createdAt).toLocaleTimeString()}
                                                </Typography>
                                            </td>
                                            <td>
                                                <Typography level="body-sm" fontWeight="md">
                                                    {msg.contact?.name || 'N/A'}
                                                </Typography>
                                                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                                    {msg.contact?.number}
                                                </Typography>
                                            </td>
                                            <td>
                                                {msg.sourceType === 'SALES_IMPORT' ? (
                                                    <>
                                                        <Chip size="sm" color="success" variant="soft" startDecorator={<ReceiptIcon sx={{ fontSize: 14 }} />} sx={{ mb: 0.5 }}>
                                                            Venta Importada
                                                        </Chip>
                                                        <Typography level="body-sm" fontWeight="md">
                                                            {msg.headline || 'Sin titulo'}
                                                        </Typography>
                                                        {msg.body && (
                                                            <Tooltip title={msg.body}>
                                                                <Typography level="body-xs" sx={{ color: 'text.tertiary', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {msg.body}
                                                                </Typography>
                                                            </Tooltip>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        <Typography level="body-sm" fontWeight="md">
                                                            {msg.headline || 'Sin titulo'}
                                                        </Typography>
                                                        {msg.sourceId && (
                                                            <Tooltip title={`Ad ID: ${msg.sourceId}`}>
                                                                <Typography level="body-xs" sx={{ color: 'primary.main', cursor: 'pointer' }}>
                                                                    ID: {msg.sourceId.length > 12 ? msg.sourceId.substring(0, 12) + '...' : msg.sourceId}
                                                                </Typography>
                                                            </Tooltip>
                                                        )}
                                                        {msg.body && (
                                                            <Tooltip title={msg.body}>
                                                                <Typography level="body-xs" sx={{ color: 'text.tertiary', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {msg.body}
                                                                </Typography>
                                                            </Tooltip>
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                            <td>
                                                <Chip
                                                    size="sm"
                                                    color={getChannelColor(msg.channel || '') as any}
                                                    startDecorator={getChannelIcon(msg.channel || '')}
                                                >
                                                    {getChannelLabel(msg.channel || 'unknown')}
                                                </Chip>
                                            </td>
                                            <td>
                                                {msg.ctwaClid ? (
                                                    <Tooltip title={`CTWA ID: ${msg.ctwaClid}`}>
                                                        <Chip size="sm" color="success" variant="soft" startDecorator={<CheckCircleIcon sx={{ fontSize: 14 }} />}>
                                                            Exacto
                                                        </Chip>
                                                    </Tooltip>
                                                ) : (
                                                    <Tooltip title="Sin ctwa_clid - La atribución será por número de teléfono (menos precisa)">
                                                        <Chip size="sm" color="warning" variant="soft" startDecorator={<PendingIcon sx={{ fontSize: 14 }} />}>
                                                            Aprox.
                                                        </Chip>
                                                    </Tooltip>
                                                )}
                                            </td>
                                            <td>
                                                <Input
                                                    size="sm"
                                                    placeholder="ej: $100"
                                                    value={editingNote[msg.id] ?? msg.conversionNote ?? ''}
                                                    onChange={(e) => setEditingNote(prev => ({ ...prev, [msg.id]: e.target.value }))}
                                                    onBlur={() => {
                                                        const note = editingNote[msg.id]
                                                        if (note !== undefined && note !== msg.conversionNote) {
                                                            handleUpdateConversionNote(msg.id, note)
                                                        }
                                                    }}
                                                    sx={{ maxWidth: 120 }}
                                                />
                                            </td>
                                            <td>
                                                <Tooltip title={msg.ctwaClid ? 'Enviar conversión con tracking exacto' : 'Enviar conversión (atribución aproximada)'}>
                                                    <Button
                                                        size="sm"
                                                        color={msg.ctwaClid ? 'primary' : 'warning'}
                                                        variant={msg.ctwaClid ? 'solid' : 'outlined'}
                                                        startDecorator={<SendIcon />}
                                                        loading={sendingConversion === msg.id}
                                                        onClick={() => handleSendConversion(msg)}
                                                    >
                                                        Enviar
                                                    </Button>
                                                </Tooltip>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>

                            {campaignMessages.length === 0 && !campaignLoading && (
                                <Box sx={{ p: 3, textAlign: 'center' }}>
                                    <AssignmentIcon sx={{ fontSize: 48, color: 'text.tertiary', mb: 1 }} />
                                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                        {campaignSearch ? 'No se encontraron mensajes para esta búsqueda' : 'No hay mensajes de campañas publicitarias registrados'}
                                    </Typography>
                                    {!campaignSearch && (
                                        <>
                                            <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 1 }}>
                                                Los mensajes aparecerán aquí cuando un contacto envíe un mensaje desde un anuncio Click-to-WhatsApp
                                            </Typography>
                                            <Box sx={{ mt: 2, p: 2, bgcolor: 'background.level1', borderRadius: 'sm', textAlign: 'left' }}>
                                                <Typography level="body-xs" fontWeight="lg" sx={{ mb: 1 }}>Tipos de Tracking:</Typography>
                                                <Stack spacing={0.5}>
                                                    <Stack direction="row" spacing={1} alignItems="center">
                                                        <Chip size="sm" color="success" variant="soft">Exacto</Chip>
                                                        <Typography level="body-xs">Tiene ctwa_clid - Atribución 100% precisa</Typography>
                                                    </Stack>
                                                    <Stack direction="row" spacing={1} alignItems="center">
                                                        <Chip size="sm" color="warning" variant="soft">Aprox.</Chip>
                                                        <Typography level="body-xs">Sin ctwa_clid - Atribución por teléfono (menos precisa)</Typography>
                                                    </Stack>
                                                </Stack>
                                            </Box>
                                        </>
                                    )}
                                </Box>
                            )}
                        </Sheet>

                        {/* Campaign Messages pagination */}
                        {campaignCount > 0 && (
                            <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mt: 2 }}>
                                <IconButton
                                    size="sm"
                                    disabled={campaignPage <= 1}
                                    onClick={() => { const p = campaignPage - 1; setCampaignPage(p); fetchCampaignMessages(campaignSearch, p) }}
                                >
                                    <NavigateBeforeIcon />
                                </IconButton>
                                <Typography level="body-sm">
                                    Página {campaignPage} de {Math.max(1, Math.ceil(campaignCount / 20))} ({campaignCount} resultados)
                                </Typography>
                                <IconButton
                                    size="sm"
                                    disabled={!campaignHasMore}
                                    onClick={() => { const p = campaignPage + 1; setCampaignPage(p); fetchCampaignMessages(campaignSearch, p) }}
                                >
                                    <NavigateNextIcon />
                                </IconButton>
                            </Stack>
                        )}
                    </CardContent>
                </Card>
            </Stack>

            {/* Test Event Modal */}
            <Modal open={openTestModal} onClose={() => setOpenTestModal(false)}>
                <ModalDialog>
                    <Typography level="h4" sx={{ mb: 2 }}>
                        Enviar Evento de Prueba
                    </Typography>

                    <Stack spacing={2}>
                        <FormControl>
                            <FormLabel>Tipo de Evento</FormLabel>
                            <Select
                                value={testEvent.eventName}
                                onChange={(_, value) => setTestEvent({ ...testEvent, eventName: value as string })}
                            >
                                <Option value="Contact">Contact</Option>
                                <Option value="Lead">Lead</Option>
                                <Option value="Purchase">Purchase</Option>
                            </Select>
                        </FormControl>

                        <FormControl>
                            <FormLabel>Contact ID</FormLabel>
                            <Input
                                type="number"
                                value={testEvent.contactId}
                                onChange={(e) => setTestEvent({ ...testEvent, contactId: e.target.value })}
                                placeholder="Ej: 123"
                            />
                        </FormControl>

                        <FormControl>
                            <FormLabel>Test Event Code</FormLabel>
                            <Input
                                value={testEvent.testEventCode}
                                onChange={(e) => setTestEvent({ ...testEvent, testEventCode: e.target.value })}
                                placeholder="Obtener de Facebook Events Manager"
                            />
                            <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                                Ve a Facebook Events Manager {'>'} Test Events para obtener tu código
                            </Typography>
                        </FormControl>

                        <Stack direction="row" spacing={2} justifyContent="flex-end">
                            <Button variant="outlined" onClick={() => setOpenTestModal(false)}>
                                Cancelar
                            </Button>
                            <Button onClick={handleSendTestEvent}>
                                Enviar
                            </Button>
                        </Stack>
                    </Stack>
                </ModalDialog>
            </Modal>

            {/* Import Sales Modal */}
            <Modal open={showImportModal} onClose={() => { if (!importing) { setShowImportModal(false); setImportResult(null); setImportFile(null) } }}>
                <ModalDialog sx={{ maxWidth: 700, maxHeight: '85vh', overflow: 'auto' }}>
                    <Typography level="h4" sx={{ mb: 2 }}>
                        Importar Ventas desde Excel
                    </Typography>

                    {!importResult ? (
                        <Stack spacing={2}>
                            <Alert color="neutral" variant="soft">
                                <Box>
                                    <Typography level="body-sm" fontWeight="lg">Formato del archivo Excel:</Typography>
                                    <Typography level="body-xs">
                                        Columnas requeridas: TELEFONO, CLIENTE, Total, ESTADO
                                    </Typography>
                                    <Typography level="body-xs">
                                        Solo se importan filas con ESTADO = PROCESADA. Los telefonos se normalizan al formato internacional de Ecuador (593...).
                                    </Typography>
                                </Box>
                            </Alert>

                            <FormControl>
                                <FormLabel>Archivo Excel (.xlsx)</FormLabel>
                                <Input
                                    type="file"
                                    slotProps={{ input: { accept: '.xlsx,.xls' } }}
                                    onChange={(e: any) => setImportFile(e.target.files?.[0] || null)}
                                />
                            </FormControl>

                            {datasets.length > 0 && (
                                <FormControl>
                                    <FormLabel>Conexion WhatsApp (para enviar conversiones)</FormLabel>
                                    <Select
                                        value={selectedWhatsappId || datasets[0]?.whatsappId}
                                        onChange={(_, value) => setSelectedWhatsappId(value as number)}
                                    >
                                        {datasets.map(d => (
                                            <Option key={d.whatsappId} value={d.whatsappId}>
                                                {d.whatsapp?.name || `Connection ${d.whatsappId}`} ({d.channel})
                                            </Option>
                                        ))}
                                    </Select>
                                </FormControl>
                            )}

                            {importing && (
                                <Box>
                                    <LinearProgress sx={{ mb: 1 }} />
                                    <Typography level="body-xs" sx={{ color: 'text.tertiary', textAlign: 'center' }}>
                                        Procesando archivo... Esto puede tardar unos segundos.
                                    </Typography>
                                </Box>
                            )}

                            <Stack direction="row" spacing={2} justifyContent="flex-end">
                                <Button variant="outlined" onClick={() => { setShowImportModal(false); setImportFile(null) }} disabled={importing}>
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleImportSales}
                                    loading={importing}
                                    disabled={!importFile}
                                    color="success"
                                    startDecorator={<UploadFileIcon />}
                                >
                                    Importar
                                </Button>
                            </Stack>
                        </Stack>
                    ) : (
                        <Stack spacing={2}>
                            <Alert color={importResult.campaignMatched > 0 ? 'success' : 'warning'} variant="soft">
                                <Box>
                                    <Typography level="title-md">
                                        Importacion completada
                                    </Typography>
                                    <Typography level="body-sm">
                                        {importResult.campaignMatched > 0
                                            ? `${importResult.campaignMatched} ventas vinculadas a campanas ($${importResult.matchedRevenue.toFixed(2)}) de ${importResult.processedRows} procesadas`
                                            : `${importResult.processedRows} filas procesadas, ninguna vinculada a campanas existentes`
                                        }
                                    </Typography>
                                </Box>
                            </Alert>

                            {/* Stats Grid */}
                            <Grid container spacing={1}>
                                <Grid xs={6} sm={4}>
                                    <Card variant="soft" color="neutral" size="sm">
                                        <CardContent>
                                            <Typography level="h4">{importResult.totalRows}</Typography>
                                            <Typography level="body-xs">Filas totales</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid xs={6} sm={4}>
                                    <Card variant="soft" color="primary" size="sm">
                                        <CardContent>
                                            <Typography level="h4">{importResult.processedRows}</Typography>
                                            <Typography level="body-xs">Procesadas</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid xs={6} sm={4}>
                                    <Card variant="soft" color="warning" size="sm">
                                        <CardContent>
                                            <Typography level="h4">{importResult.skippedAnuladas}</Typography>
                                            <Typography level="body-xs">Anuladas</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid xs={6} sm={4}>
                                    <Card variant="outlined" color="success" size="sm" sx={{ border: '2px solid', borderColor: 'success.500' }}>
                                        <CardContent>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <FacebookIcon sx={{ fontSize: 18, color: '#1877F2' }} />
                                                <Typography level="h4" sx={{ color: 'success.main' }}>{importResult.campaignMatched}</Typography>
                                            </Stack>
                                            <Typography level="body-xs" fontWeight="lg">Match con campana</Typography>
                                            <Typography level="body-xs" sx={{ color: 'success.main' }}>${importResult.matchedRevenue.toFixed(2)}</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid xs={6} sm={4}>
                                    <Card variant="soft" color="neutral" size="sm">
                                        <CardContent>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <ReceiptIcon sx={{ fontSize: 18 }} />
                                                <Typography level="h4">{importResult.noCampaign}</Typography>
                                            </Stack>
                                            <Typography level="body-xs">Sin campana (aprox.)</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid xs={6} sm={4}>
                                    <Card variant="soft" color="success" size="sm">
                                        <CardContent>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <CheckCircleIcon sx={{ fontSize: 18 }} />
                                                <Typography level="h4">{importResult.matched}</Typography>
                                            </Stack>
                                            <Typography level="body-xs">Contactos existentes</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid xs={6} sm={4}>
                                    <Card variant="soft" color="primary" size="sm">
                                        <CardContent>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <PersonAddIcon sx={{ fontSize: 18 }} />
                                                <Typography level="h4">{importResult.created}</Typography>
                                            </Stack>
                                            <Typography level="body-xs">Contactos nuevos</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid xs={6} sm={4}>
                                    <Card variant="soft" color="neutral" size="sm">
                                        <CardContent>
                                            <Typography level="h4">{importResult.duplicates}</Typography>
                                            <Typography level="body-xs">Duplicados</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid xs={6} sm={4}>
                                    <Card variant="soft" color="danger" size="sm">
                                        <CardContent>
                                            <Typography level="h4">{importResult.failed}</Typography>
                                            <Typography level="body-xs">Fallidos</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid xs={6} sm={4}>
                                    <Card variant="soft" color="success" size="sm">
                                        <CardContent>
                                            <Typography level="h4" sx={{ color: 'success.main' }}>${importResult.totalRevenue.toFixed(2)}</Typography>
                                            <Typography level="body-xs">Revenue total</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            </Grid>

                            {/* Campaign matched details */}
                            {importResult.details.filter(d => d.status === 'campaign_matched').length > 0 && (
                                <Card variant="outlined" color="success" size="sm">
                                    <CardContent>
                                        <Typography level="title-sm" sx={{ mb: 1, color: 'success.main' }}>
                                            Ventas vinculadas a campanas ({importResult.details.filter(d => d.status === 'campaign_matched').length})
                                        </Typography>
                                        <Sheet sx={{ overflow: 'auto', maxHeight: 200 }}>
                                            <Table size="sm">
                                                <thead>
                                                    <tr>
                                                        <th>Cliente</th>
                                                        <th>Total</th>
                                                        <th>Campana</th>
                                                        <th>Tracking</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {importResult.details.filter(d => d.status === 'campaign_matched').map((detail, idx) => (
                                                        <tr key={idx}>
                                                            <td>
                                                                <Typography level="body-xs">{detail.name}</Typography>
                                                                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>{detail.phone}</Typography>
                                                            </td>
                                                            <td><Typography level="body-xs" fontWeight="lg" sx={{ color: 'success.main' }}>${detail.total}</Typography></td>
                                                            <td><Typography level="body-xs">{detail.campaignHeadline}</Typography></td>
                                                            <td>
                                                                <Chip size="sm" color={detail.hasCtwaClid ? 'success' : 'warning'} variant="soft">
                                                                    {detail.hasCtwaClid ? 'Exacto' : 'Aprox.'}
                                                                </Chip>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </Table>
                                        </Sheet>
                                    </CardContent>
                                </Card>
                            )}

                            {/* No campaign match details */}
                            {importResult.details.filter(d => d.status === 'no_campaign').length > 0 && (
                                <Card variant="outlined" color="neutral" size="sm">
                                    <CardContent>
                                        <Typography level="title-sm" sx={{ mb: 1 }}>
                                            Sin match de campana ({importResult.details.filter(d => d.status === 'no_campaign').length})
                                        </Typography>
                                        <Typography level="body-xs" sx={{ mb: 1, color: 'text.tertiary' }}>
                                            Estos contactos no tienen campanas previas. Se crearon como SALES_IMPORT (atribucion aproximada por telefono).
                                        </Typography>
                                        <Sheet sx={{ overflow: 'auto', maxHeight: 150 }}>
                                            <Table size="sm">
                                                <thead>
                                                    <tr>
                                                        <th>Cliente</th>
                                                        <th>Telefono</th>
                                                        <th>Total</th>
                                                        <th>Factura</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {importResult.details.filter(d => d.status === 'no_campaign').slice(0, 50).map((detail, idx) => (
                                                        <tr key={idx}>
                                                            <td><Typography level="body-xs">{detail.name}</Typography></td>
                                                            <td><Typography level="body-xs">{detail.phone}</Typography></td>
                                                            <td><Typography level="body-xs">${detail.total}</Typography></td>
                                                            <td><Typography level="body-xs">{detail.invoiceNumber}</Typography></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </Table>
                                        </Sheet>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Failed details */}
                            {importResult.details.filter(d => d.status === 'failed').length > 0 && (
                                <Card variant="outlined" color="danger" size="sm">
                                    <CardContent>
                                        <Typography level="title-sm" sx={{ mb: 1, color: 'danger.main' }}>
                                            Registros fallidos ({importResult.details.filter(d => d.status === 'failed').length})
                                        </Typography>
                                        <Sheet sx={{ overflow: 'auto', maxHeight: 200 }}>
                                            <Table size="sm">
                                                <thead>
                                                    <tr>
                                                        <th>Telefono</th>
                                                        <th>Cliente</th>
                                                        <th>Total</th>
                                                        <th>Razon</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {importResult.details.filter(d => d.status === 'failed').map((detail, idx) => (
                                                        <tr key={idx}>
                                                            <td><Typography level="body-xs">{detail.phone}</Typography></td>
                                                            <td><Typography level="body-xs">{detail.name}</Typography></td>
                                                            <td><Typography level="body-xs">${detail.total}</Typography></td>
                                                            <td><Typography level="body-xs" sx={{ color: 'danger.main' }}>{detail.reason}</Typography></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </Table>
                                        </Sheet>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Duplicate details */}
                            {importResult.details.filter(d => d.status === 'duplicate').length > 0 && (
                                <Card variant="outlined" color="neutral" size="sm">
                                    <CardContent>
                                        <Typography level="title-sm" sx={{ mb: 1 }}>
                                            Duplicados omitidos ({importResult.details.filter(d => d.status === 'duplicate').length})
                                        </Typography>
                                        <Sheet sx={{ overflow: 'auto', maxHeight: 150 }}>
                                            <Table size="sm">
                                                <thead>
                                                    <tr>
                                                        <th>Telefono</th>
                                                        <th>Cliente</th>
                                                        <th>Factura</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {importResult.details.filter(d => d.status === 'duplicate').map((detail, idx) => (
                                                        <tr key={idx}>
                                                            <td><Typography level="body-xs">{detail.phone}</Typography></td>
                                                            <td><Typography level="body-xs">{detail.name}</Typography></td>
                                                            <td><Typography level="body-xs">{detail.invoiceNumber}</Typography></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </Table>
                                        </Sheet>
                                    </CardContent>
                                </Card>
                            )}

                            <Button
                                onClick={() => { setShowImportModal(false); setImportResult(null); setImportFile(null) }}
                                color="primary"
                            >
                                Cerrar
                            </Button>
                        </Stack>
                    )}
                </ModalDialog>
            </Modal>

            {/* Confirmation Modal - Send Approximate Conversion */}
            <Modal open={confirmSendModal.open} onClose={() => setConfirmSendModal({ open: false, msg: null, value: 0 })}>
                <ModalDialog variant="outlined" sx={{ maxWidth: 450, p: 3 }}>
                    <Stack spacing={2.5} alignItems="center">
                        <Box sx={{
                            width: 56, height: 56, borderRadius: '50%',
                            bgcolor: 'warning.softBg', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <WarningIcon sx={{ fontSize: 32, color: 'warning.500' }} />
                        </Box>

                        <Box sx={{ textAlign: 'center' }}>
                            <Typography level="title-lg" sx={{ mb: 1 }}>
                                Atribucion Aproximada
                            </Typography>
                            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                                Este contacto no tiene <strong>ctwa_clid</strong> (Click-to-WhatsApp ID).
                                La atribucion sera por numero de telefono, lo cual puede resultar en una atribucion menos precisa.
                            </Typography>
                        </Box>

                        {confirmSendModal.msg && (
                            <Card variant="soft" color="neutral" size="sm" sx={{ width: '100%' }}>
                                <CardContent>
                                    <Stack spacing={0.5}>
                                        <Stack direction="row" justifyContent="space-between">
                                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Contacto</Typography>
                                            <Typography level="body-sm" fontWeight="lg">{confirmSendModal.msg.contact?.name || 'N/A'}</Typography>
                                        </Stack>
                                        <Stack direction="row" justifyContent="space-between">
                                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Telefono</Typography>
                                            <Typography level="body-sm">{confirmSendModal.msg.contact?.number || 'N/A'}</Typography>
                                        </Stack>
                                        <Stack direction="row" justifyContent="space-between">
                                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Valor</Typography>
                                            <Typography level="body-sm" fontWeight="lg" sx={{ color: 'success.600' }}>${confirmSendModal.value} USD</Typography>
                                        </Stack>
                                        <Stack direction="row" justifyContent="space-between">
                                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Evento</Typography>
                                            <Typography level="body-sm">Purchase</Typography>
                                        </Stack>
                                    </Stack>
                                </CardContent>
                            </Card>
                        )}

                        <Stack direction="row" spacing={1.5} sx={{ width: '100%' }}>
                            <Button
                                variant="outlined"
                                color="neutral"
                                sx={{ flex: 1 }}
                                onClick={() => setConfirmSendModal({ open: false, msg: null, value: 0 })}
                            >
                                Cancelar
                            </Button>
                            <Button
                                color="warning"
                                sx={{ flex: 1 }}
                                startDecorator={<SendIcon />}
                                loading={sendingConversion === confirmSendModal.msg?.id}
                                onClick={async () => {
                                    if (confirmSendModal.msg) {
                                        setConfirmSendModal(prev => ({ ...prev, open: false }))
                                        await executeSendConversion(confirmSendModal.msg, confirmSendModal.value)
                                    }
                                }}
                            >
                                Enviar Aprox.
                            </Button>
                        </Stack>
                    </Stack>
                </ModalDialog>
            </Modal>

            {/* Result Notification Modal */}
            <Modal open={resultModal.open} onClose={() => setResultModal({ open: false, success: false, message: '' })}>
                <ModalDialog variant="outlined" sx={{ maxWidth: 420, p: 3 }}>
                    <Stack spacing={2} alignItems="center">
                        <Box sx={{
                            width: 56, height: 56, borderRadius: '50%',
                            bgcolor: resultModal.success ? 'success.softBg' : 'danger.softBg',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            {resultModal.success
                                ? <CheckCircleIcon sx={{ fontSize: 32, color: 'success.500' }} />
                                : <ErrorIcon sx={{ fontSize: 32, color: 'danger.500' }} />
                            }
                        </Box>

                        <Box sx={{ textAlign: 'center' }}>
                            <Typography level="title-lg" sx={{ mb: 0.5 }}>
                                {resultModal.success ? 'Conversion Enviada' : 'Error al Enviar'}
                            </Typography>
                            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                                {resultModal.message}
                            </Typography>
                        </Box>

                        <Button
                            color={resultModal.success ? 'success' : 'danger'}
                            variant="soft"
                            sx={{ minWidth: 120 }}
                            onClick={() => setResultModal({ open: false, success: false, message: '' })}
                        >
                            {resultModal.success ? 'Entendido' : 'Cerrar'}
                        </Button>
                    </Stack>
                </ModalDialog>
            </Modal>
        </Container>
    )
}
