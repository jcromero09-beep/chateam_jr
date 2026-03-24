/**
 * Página: AIKnowledgeBase
 * Base de Conocimiento RAG — gestión completa de documentos, búsqueda semántica,
 * filtros, paginación, subida de documentos, y detalle de chunks.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert,
  IconButton,
  Sheet,
  Table,
  Chip,
  Button,
  Input,
  Select,
  Option,
  Tooltip,
  Divider,
} from '@mui/joy'
import {
  BookOpen,
  FileText,
  Layers,
  Hash,
  X,
  RefreshCw,
  Inbox,
  Search,
  Upload,
  Eye,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Brain,
  Zap,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Filter,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '../services/api'
import UploadDocumentModal from '../components/KnowledgeBase/UploadDocumentModal'
import DocumentDetailModal from '../components/KnowledgeBase/DocumentDetailModal'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface RAGDocument {
  id: number
  title: string
  sourceType: string
  sourceUrl: string | null
  filePath: string | null
  fileSizeBytes: number
  chunksCount: number
  tokensCount: number
  status: string
  errorMessage: string | null
  metadata: Record<string, unknown> | null
  processedAt: string | null
  createdAt: string
  updatedAt: string
}

interface RAGStats {
  totalDocuments: number
  totalChunks: number
  totalTokens: number
  byStatus?: Record<string, number>
}

interface SearchResult {
  content: string
  score: number
  documentTitle: string
  documentId: number
  chunkIndex: number
  topic: string | null
  keywords: string[] | null
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  processing: 'Procesando',
  completed: 'Listo',
  ready: 'Listo',
  error: 'Error',
}

const STATUS_COLORS: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
  pending: 'neutral',
  processing: 'warning',
  completed: 'success',
  ready: 'success',
  error: 'danger',
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Texto Manual',
  url: 'URL',
  pdf: 'PDF',
  txt: 'Texto',
  csv: 'CSV',
  docx: 'Word',
  xlsx: 'Excel',
  ticket: 'Ticket',
  qa_pairs: 'Q&A',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-ES').format(value)
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function AIKnowledgeBase() {
  // Estado principal
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [documents, setDocuments] = useState<RAGDocument[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [stats, setStats] = useState<RAGStats>({
    totalDocuments: 0,
    totalChunks: 0,
    totalTokens: 0,
  })

  // Filtros y paginación
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)

  // Modales
  const [uploadOpen, setUploadOpen] = useState(false)
  const [detailDocId, setDetailDocId] = useState<number | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Búsqueda RAG
  const [ragQuery, setRagQuery] = useState('')
  const [ragSearching, setRagSearching] = useState(false)
  const [ragResults, setRagResults] = useState<SearchResult[]>([])
  const [ragSearched, setRagSearched] = useState(false)

  // Acciones en progreso
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [reindexingId, setReindexingId] = useState<number | null>(null)

  // Debounce para búsqueda de texto
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // -------------------------------------------------------------------------
  // Carga de datos
  // -------------------------------------------------------------------------

  const loadData = useCallback(async (page = 1, search = '', status = 'all', source = 'all') => {
    try {
      setLoading(true)
      setError(null)

      const params: Record<string, string | number> = {
        page,
        limit: PAGE_SIZE,
      }
      if (search.trim()) params.search = search.trim()
      if (status !== 'all') params.status = status
      if (source !== 'all') params.sourceType = source

      const [docsResult, statsResult] = await Promise.allSettled([
        api.get('/ai/rag/documents', { params }),
        api.get('/ai/rag/stats'),
      ])

      // Documentos
      if (docsResult.status === 'fulfilled') {
        const resp = docsResult.value.data as Record<string, unknown>
        const inner = (resp?.data ?? resp) as Record<string, unknown>
        const docs: RAGDocument[] =
          Array.isArray(inner?.records)
            ? inner.records as RAGDocument[]
            : Array.isArray(inner)
              ? inner as RAGDocument[]
              : []
        const count = typeof inner?.count === 'number' ? inner.count : docs.length
        setDocuments(docs)
        setTotalCount(count as number)
      } else {
        const reason = docsResult.reason as { response?: { data?: { error?: string } } }
        throw new Error(reason?.response?.data?.error ?? 'Error al cargar documentos')
      }

      // Estadísticas
      if (statsResult.status === 'fulfilled') {
        const payload = statsResult.value.data as Record<string, unknown>
        const s = (payload?.data ?? payload) as RAGStats
        setStats({
          totalDocuments: s.totalDocuments ?? 0,
          totalChunks: s.totalChunks ?? 0,
          totalTokens: s.totalTokens ?? 0,
          byStatus: s.byStatus,
        })
      }
    } catch (err: unknown) {
      const message = (err as Error).message ?? 'Error al cargar la base de conocimiento'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Carga inicial
  useEffect(() => {
    loadData(1, '', 'all', 'all')
  }, [loadData])

  // Refrescar con filtros actuales
  const refresh = useCallback(() => {
    loadData(currentPage, searchQuery, statusFilter, sourceFilter)
  }, [loadData, currentPage, searchQuery, statusFilter, sourceFilter])

  // -------------------------------------------------------------------------
  // Handlers de filtros
  // -------------------------------------------------------------------------

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setCurrentPage(1)
      loadData(1, value, statusFilter, sourceFilter)
    }, 500)
  }

  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    setCurrentPage(1)
    loadData(1, searchQuery, value, sourceFilter)
  }

  const handleSourceChange = (value: string) => {
    setSourceFilter(value)
    setCurrentPage(1)
    loadData(1, searchQuery, statusFilter, value)
  }

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
    loadData(newPage, searchQuery, statusFilter, sourceFilter)
  }

  // -------------------------------------------------------------------------
  // Acciones CRUD
  // -------------------------------------------------------------------------

  const handleDelete = async (doc: RAGDocument) => {
    if (!confirm(`¿Eliminar "${doc.title}"? Esta acción no se puede deshacer.`)) return
    setDeletingId(doc.id)
    try {
      await api.delete(`/ai/rag/documents/${doc.id}`)
      toast.success('Documento eliminado correctamente')
      refresh()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Error al eliminar'
      toast.error(msg)
    } finally {
      setDeletingId(null)
    }
  }

  const handleReindex = async (doc: RAGDocument) => {
    setReindexingId(doc.id)
    try {
      await api.put(`/ai/rag/documents/${doc.id}/reindex`)
      toast.success('Reindexación iniciada')
      refresh()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Error al reindexar'
      toast.error(msg)
    } finally {
      setReindexingId(null)
    }
  }

  const handleViewDetail = (docId: number) => {
    setDetailDocId(docId)
    setDetailOpen(true)
  }

  // -------------------------------------------------------------------------
  // Búsqueda RAG
  // -------------------------------------------------------------------------

  const handleRagSearch = async () => {
    if (!ragQuery.trim()) return
    setRagSearching(true)
    setRagSearched(true)
    setRagResults([])
    try {
      const { data: resp } = await api.post('/ai/rag/search', { query: ragQuery.trim(), limit: 10 })
      const payload = resp?.data ?? resp
      const results: SearchResult[] = Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload)
          ? payload
          : []
      setRagResults(results)
      if (results.length === 0) {
        toast.info('No se encontraron resultados para tu búsqueda')
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Error en la búsqueda'
      toast.error(msg)
    } finally {
      setRagSearching(false)
    }
  }

  // -------------------------------------------------------------------------
  // Paginación
  // -------------------------------------------------------------------------

  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1
  const showingFrom = documents.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0
  const showingTo = Math.min(currentPage * PAGE_SIZE, totalCount)

  // -------------------------------------------------------------------------
  // KPI Cards
  // -------------------------------------------------------------------------

  const statCards = [
    {
      label: 'Total Documentos',
      value: stats.totalDocuments,
      icon: <FileText size={20} color="var(--joy-palette-primary-500)" />,
    },
    {
      label: 'Total Chunks',
      value: stats.totalChunks,
      icon: <Layers size={20} color="var(--joy-palette-success-500)" />,
    },
    {
      label: 'Tokens Procesados',
      value: stats.totalTokens,
      icon: <Hash size={20} color="var(--joy-palette-warning-500)" />,
    },
  ]

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          gap: 2,
          mb: 3,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <BookOpen size={32} color="var(--joy-palette-primary-500)" />
          <Box>
            <Typography level="h2">Base de Conocimiento</Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              Documentos RAG indexados para respuestas contextuales
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="solid"
            color="primary"
            startDecorator={<Upload size={16} />}
            onClick={() => setUploadOpen(true)}
          >
            Subir Documento
          </Button>
          <IconButton
            variant="outlined"
            onClick={refresh}
            disabled={loading}
            title="Recargar"
          >
            <RefreshCw size={18} />
          </IconButton>
        </Box>
      </Box>

      {/* Error */}
      {error && (
        <Alert
          color="danger"
          sx={{ mb: 3 }}
          endDecorator={
            <IconButton size="sm" variant="plain" color="danger" onClick={() => setError(null)}>
              <X size={16} />
            </IconButton>
          }
        >
          {error}
        </Alert>
      )}

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {statCards.map((card) => (
          <Grid key={card.label} xs={12} sm={4}>
            <Card variant="outlined">
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {card.icon}
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    {card.label}
                  </Typography>
                </Box>
                {loading ? (
                  <CircularProgress size="sm" />
                ) : (
                  <Typography level="h3">{formatNumber(card.value)}</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Status breakdown */}
      {stats.byStatus && (
        <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
          {Object.entries(stats.byStatus).map(([status, count]) => (
            <Chip
              key={status}
              size="sm"
              variant="soft"
              color={STATUS_COLORS[status] ?? 'neutral'}
              startDecorator={
                status === 'completed' || status === 'ready' ? <CheckCircle2 size={12} /> :
                status === 'processing' ? <Clock size={12} /> :
                status === 'error' ? <XCircle size={12} /> :
                <AlertTriangle size={12} />
              }
            >
              {STATUS_LABELS[status] ?? status}: {count}
            </Chip>
          ))}
        </Box>
      )}

      {/* Barra de filtros */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              gap: 1.5,
              alignItems: { md: 'center' },
            }}
          >
            <Input
              placeholder="Buscar documentos..."
              startDecorator={<Search size={16} />}
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              sx={{ flex: 1, minWidth: 200 }}
              size="sm"
            />
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Filter size={14} color="var(--joy-palette-neutral-500)" />
              <Select
                size="sm"
                value={statusFilter}
                onChange={(_, val) => handleStatusChange(val as string)}
                sx={{ minWidth: 140 }}
              >
                <Option value="all">Todos los estados</Option>
                <Option value="pending">Pendiente</Option>
                <Option value="processing">Procesando</Option>
                <Option value="completed">Listo</Option>
                <Option value="error">Error</Option>
              </Select>
              <Select
                size="sm"
                value={sourceFilter}
                onChange={(_, val) => handleSourceChange(val as string)}
                sx={{ minWidth: 140 }}
              >
                <Option value="all">Todos los tipos</Option>
                <Option value="manual">Texto Manual</Option>
                <Option value="url">URL</Option>
                <Option value="pdf">PDF</Option>
                <Option value="txt">Texto</Option>
                <Option value="csv">CSV</Option>
                <Option value="docx">Word</Option>
                <Option value="xlsx">Excel</Option>
              </Select>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Tabla de documentos */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <FileText size={20} />
            Documentos indexados
            {!loading && (
              <Chip size="sm" variant="soft" color="neutral">
                {totalCount}
              </Chip>
            )}
          </Typography>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : documents.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Inbox size={48} color="var(--joy-palette-neutral-400)" style={{ marginBottom: 12 }} />
              <Typography level="body-md" sx={{ color: 'text.tertiary' }}>
                {searchQuery || statusFilter !== 'all' || sourceFilter !== 'all'
                  ? 'No se encontraron documentos con los filtros aplicados'
                  : 'No hay documentos en la base de conocimiento'}
              </Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                {searchQuery || statusFilter !== 'all' || sourceFilter !== 'all'
                  ? 'Intenta cambiar los filtros de búsqueda'
                  : 'Sube documentos para empezar a usar el sistema RAG'}
              </Typography>
              {!searchQuery && statusFilter === 'all' && sourceFilter === 'all' && (
                <Button
                  variant="soft"
                  color="primary"
                  size="sm"
                  startDecorator={<Upload size={14} />}
                  sx={{ mt: 2 }}
                  onClick={() => setUploadOpen(true)}
                >
                  Subir primer documento
                </Button>
              )}
            </Box>
          ) : (
            <>
              <Sheet sx={{ overflow: 'auto' }}>
                <Table hoverRow>
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th style={{ width: 100 }}>Tipo</th>
                      <th style={{ width: 110 }}>Estado</th>
                      <th style={{ width: 90, textAlign: 'right' }}>Chunks</th>
                      <th style={{ width: 100, textAlign: 'right' }}>Tokens</th>
                      <th style={{ width: 130 }}>Creado</th>
                      <th style={{ width: 120, textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id}>
                        <td>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <FileText size={16} color="var(--joy-palette-neutral-500)" />
                            <Box>
                              <Typography level="body-sm" fontWeight="md">
                                {doc.title}
                              </Typography>
                              {doc.sourceUrl && (
                                <Typography level="body-xs" sx={{ color: 'text.tertiary' }} noWrap>
                                  {doc.sourceUrl.length > 40
                                    ? doc.sourceUrl.substring(0, 40) + '...'
                                    : doc.sourceUrl}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        </td>
                        <td>
                          <Chip size="sm" variant="outlined">
                            {SOURCE_LABELS[doc.sourceType] ?? doc.sourceType}
                          </Chip>
                        </td>
                        <td>
                          <Chip
                            size="sm"
                            color={STATUS_COLORS[doc.status] ?? 'neutral'}
                            variant="soft"
                          >
                            {STATUS_LABELS[doc.status] ?? doc.status}
                          </Chip>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Typography level="body-sm">
                            {formatNumber(doc.chunksCount ?? 0)}
                          </Typography>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Typography level="body-sm">
                            {formatNumber(doc.tokensCount ?? 0)}
                          </Typography>
                        </td>
                        <td>
                          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                            {formatDate(doc.createdAt)}
                          </Typography>
                        </td>
                        <td>
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                            <Tooltip title="Ver detalles">
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="primary"
                                onClick={() => handleViewDetail(doc.id)}
                              >
                                <Eye size={16} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Reindexar">
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="warning"
                                onClick={() => handleReindex(doc)}
                                disabled={reindexingId === doc.id || doc.status === 'processing'}
                                loading={reindexingId === doc.id}
                              >
                                <RefreshCw size={16} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Eliminar">
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="danger"
                                onClick={() => handleDelete(doc)}
                                disabled={deletingId === doc.id}
                                loading={deletingId === doc.id}
                              >
                                <Trash2 size={16} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Sheet>

              {/* Paginación */}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mt: 2,
                  pt: 2,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Mostrando {showingFrom}–{showingTo} de {totalCount}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <IconButton
                    size="sm"
                    variant="outlined"
                    disabled={currentPage <= 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                  >
                    <ChevronLeft size={16} />
                  </IconButton>
                  <Typography level="body-sm">
                    Página {currentPage} de {totalPages}
                  </Typography>
                  <IconButton
                    size="sm"
                    variant="outlined"
                    disabled={currentPage >= totalPages}
                    onClick={() => handlePageChange(currentPage + 1)}
                  >
                    <ChevronRight size={16} />
                  </IconButton>
                </Box>
              </Box>
            </>
          )}
        </CardContent>
      </Card>

      {/* Búsqueda RAG Semántica */}
      <Card variant="outlined">
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Brain size={20} color="var(--joy-palette-primary-500)" />
            Búsqueda Semántica
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 2 }}>
            Busca en toda la base de conocimiento usando IA. Los resultados se ordenan por relevancia semántica.
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Input
              placeholder="Escribe tu pregunta o búsqueda..."
              startDecorator={<Search size={16} />}
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRagSearch()}
              sx={{ flex: 1 }}
              size="sm"
            />
            <Button
              variant="solid"
              color="primary"
              size="sm"
              startDecorator={ragSearching ? <CircularProgress size="sm" /> : <Zap size={14} />}
              onClick={handleRagSearch}
              disabled={ragSearching || !ragQuery.trim()}
              loading={ragSearching}
            >
              Buscar
            </Button>
          </Box>

          {/* Resultados RAG */}
          {ragSearched && !ragSearching && ragResults.length === 0 && (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Search size={32} color="var(--joy-palette-neutral-400)" style={{ marginBottom: 8 }} />
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                No se encontraron resultados relevantes
              </Typography>
            </Box>
          )}

          {ragResults.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {ragResults.map((result, idx) => (
                <Card key={idx} variant="soft" size="sm">
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FileText size={14} color="var(--joy-palette-primary-500)" />
                        <Typography level="body-sm" fontWeight="md">
                          {result.documentTitle}
                        </Typography>
                        <Chip size="sm" variant="outlined">
                          Chunk #{result.chunkIndex}
                        </Chip>
                      </Box>
                      <Chip size="sm" color="success" variant="soft">
                        Score: {(result.score * 100).toFixed(1)}%
                      </Chip>
                    </Box>
                    <Typography
                      level="body-sm"
                      sx={{
                        whiteSpace: 'pre-wrap',
                        maxHeight: 150,
                        overflow: 'auto',
                        color: 'text.secondary',
                      }}
                    >
                      {result.content}
                    </Typography>
                    {result.topic && (
                      <Typography level="body-xs" sx={{ mt: 1, color: 'text.tertiary' }}>
                        Tema: {result.topic}
                      </Typography>
                    )}
                    {result.keywords && result.keywords.length > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                        {result.keywords.map((kw) => (
                          <Chip key={kw} size="sm" variant="outlined">
                            {kw}
                          </Chip>
                        ))}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Modales */}
      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => {
          setUploadOpen(false)
          refresh()
        }}
      />

      <DocumentDetailModal
        open={detailOpen}
        documentId={detailDocId}
        onClose={() => {
          setDetailOpen(false)
          setDetailDocId(null)
        }}
        onDelete={refresh}
        onReindex={refresh}
      />
    </Box>
  )
}
