/**
 * Página: AIKnowledgeBase
 * Base de Conocimiento RAG — gestión completa de documentos, búsqueda semántica,
 * filtros, paginación, subida de documentos, y detalle de chunks.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
// [Fase2·G] CircularProgress se conserva de MUI Joy (no hay equivalente en el DS).
import { CircularProgress } from '@mui/joy'
import {
  BookOpen,
  FileText,
  Stack,
  Hash,
  X,
  ArrowClockwise,
  Tray,
  MagnifyingGlass,
  UploadSimple,
  Eye,
  Trash,
  CaretLeft,
  CaretRight,
  Brain,
  Lightning,
  Warning,
  Clock,
  CheckCircle,
  XCircle,
  Funnel,
  SpinnerGap,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
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

const STATUS_BADGE: Record<string, BadgeProps['variant']> = {
  pending: 'neutral',
  processing: 'warning',
  completed: 'success',
  ready: 'success',
  error: 'destructive',
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

// Botón de acción de fila (mismo look que RowAction del DS, con onClick/loading)
function ActionBtn({
  label,
  onClick,
  disabled,
  loading,
  className,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {loading ? (
        <SpinnerGap className="size-[18px] animate-spin" aria-hidden />
      ) : (
        children
      )}
    </button>
  )
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
      icon: <FileText className="size-5 text-primary" weight="fill" aria-hidden />,
    },
    {
      label: 'Total Chunks',
      value: stats.totalChunks,
      icon: <Stack className="size-5 text-success-text" weight="fill" aria-hidden />,
    },
    {
      label: 'Tokens Procesados',
      value: stats.totalTokens,
      icon: <Hash className="size-5 text-warning-text" weight="fill" aria-hidden />,
    },
  ]

  const hasFilters = Boolean(searchQuery) || statusFilter !== 'all' || sourceFilter !== 'all'

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <BookOpen className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Base de Conocimiento
              </h1>
              <p className="text-sm text-muted-foreground">
                Documentos RAG indexados para respuestas contextuales
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <UploadSimple className="size-4" weight="bold" aria-hidden />
              Subir Documento
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Recargar"
              className="text-muted-foreground"
              disabled={loading}
              onClick={refresh}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text"
          >
            <span>{error}</span>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => setError(null)}
              className="flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-destructive/15"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]"
            >
              <div className="mb-1 flex items-center gap-2">
                {card.icon}
                <p className="text-sm text-muted-foreground">{card.label}</p>
              </div>
              {loading ? (
                <CircularProgress size="sm" />
              ) : (
                <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  {formatNumber(card.value)}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Status breakdown */}
        {stats.byStatus && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byStatus).map(([status, count]) => (
              <Badge key={status} variant={STATUS_BADGE[status] ?? 'neutral'}>
                {status === 'completed' || status === 'ready' ? (
                  <CheckCircle className="size-3" weight="fill" aria-hidden />
                ) : status === 'processing' ? (
                  <Clock className="size-3" weight="fill" aria-hidden />
                ) : status === 'error' ? (
                  <XCircle className="size-3" weight="fill" aria-hidden />
                ) : (
                  <Warning className="size-3" weight="fill" aria-hidden />
                )}
                {STATUS_LABELS[status] ?? status}: {count}
              </Badge>
            ))}
          </div>
        )}

        {/* Barra de filtros */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <MagnifyingGlass
                className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                placeholder="Buscar documentos..."
                aria-label="Buscar documentos"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>
            <div className="flex items-center gap-2">
              <Funnel className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[150px]" aria-label="Filtrar por estado">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="processing">Procesando</SelectItem>
                  <SelectItem value="completed">Listo</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={handleSourceChange}>
                <SelectTrigger className="w-[150px]" aria-label="Filtrar por tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  <SelectItem value="manual">Texto Manual</SelectItem>
                  <SelectItem value="url">URL</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="txt">Texto</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="docx">Word</SelectItem>
                  <SelectItem value="xlsx">Excel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Tabla de documentos */}
        <div className="rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <FileText className="size-5 text-muted-foreground" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">Documentos indexados</h2>
            {!loading && <Badge variant="neutral">{totalCount}</Badge>}
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <CircularProgress />
            </div>
          ) : documents.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Tray className="mx-auto mb-3 size-12 text-muted-foreground/60" aria-hidden />
              <p className="text-sm text-foreground">
                {hasFilters
                  ? 'No se encontraron documentos con los filtros aplicados'
                  : 'No hay documentos en la base de conocimiento'}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {hasFilters
                  ? 'Intenta cambiar los filtros de búsqueda'
                  : 'Sube documentos para empezar a usar el sistema RAG'}
              </p>
              {!hasFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setUploadOpen(true)}
                >
                  <UploadSimple className="size-4" aria-hidden />
                  Subir primer documento
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Nombre
                      </th>
                      <th className="w-[100px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Tipo
                      </th>
                      <th className="w-[110px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Estado
                      </th>
                      <th className="w-[90px] whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Chunks
                      </th>
                      <th className="w-[100px] whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Tokens
                      </th>
                      <th className="w-[130px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Creado
                      </th>
                      <th className="w-[120px] whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {documents.map((doc) => (
                      <tr key={doc.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">{doc.title}</p>
                              {doc.sourceUrl && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {doc.sourceUrl.length > 40
                                    ? doc.sourceUrl.substring(0, 40) + '...'
                                    : doc.sourceUrl}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">
                            {SOURCE_LABELS[doc.sourceType] ?? doc.sourceType}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_BADGE[doc.status] ?? 'neutral'}>
                            {STATUS_LABELS[doc.status] ?? doc.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">
                          {formatNumber(doc.chunksCount ?? 0)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">
                          {formatNumber(doc.tokensCount ?? 0)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {formatDate(doc.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-0.5">
                            <ActionBtn
                              label="Ver detalles"
                              onClick={() => handleViewDetail(doc.id)}
                              className="hover:bg-primary/10 hover:text-primary"
                            >
                              <Eye className="size-[18px]" aria-hidden />
                            </ActionBtn>
                            <ActionBtn
                              label="Reindexar"
                              onClick={() => handleReindex(doc)}
                              disabled={reindexingId === doc.id || doc.status === 'processing'}
                              loading={reindexingId === doc.id}
                              className="text-warning-text hover:bg-warning/10 hover:text-warning-text"
                            >
                              <ArrowClockwise className="size-[18px]" aria-hidden />
                            </ActionBtn>
                            <ActionBtn
                              label="Eliminar"
                              onClick={() => handleDelete(doc)}
                              disabled={deletingId === doc.id}
                              loading={deletingId === doc.id}
                              className="hover:bg-destructive/10 hover:text-destructive-text"
                            >
                              <Trash className="size-[18px]" aria-hidden />
                            </ActionBtn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <p className="text-sm text-muted-foreground">
                  Mostrando {showingFrom}–{showingTo} de {totalCount}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Página anterior"
                    className="size-9"
                    disabled={currentPage <= 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                  >
                    <CaretLeft className="size-4" aria-hidden />
                  </Button>
                  <span className="text-sm text-foreground">
                    Página {currentPage} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Página siguiente"
                    className="size-9"
                    disabled={currentPage >= totalPages}
                    onClick={() => handlePageChange(currentPage + 1)}
                  >
                    <CaretRight className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Búsqueda RAG Semántica */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="mb-2 flex items-center gap-2">
            <Brain className="size-5 text-primary" weight="fill" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">Búsqueda Semántica</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Busca en toda la base de conocimiento usando IA. Los resultados se ordenan por relevancia
            semántica.
          </p>

          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <MagnifyingGlass
                className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                placeholder="Escribe tu pregunta o búsqueda..."
                aria-label="Búsqueda semántica"
                value={ragQuery}
                onChange={(e) => setRagQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRagSearch()}
                className="h-9 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>
            <Button
              size="sm"
              onClick={handleRagSearch}
              disabled={ragSearching || !ragQuery.trim()}
              loading={ragSearching}
            >
              <Lightning className="size-4" weight="fill" aria-hidden />
              Buscar
            </Button>
          </div>

          {/* Resultados RAG */}
          {ragSearched && !ragSearching && ragResults.length === 0 && (
            <div className="py-8 text-center">
              <MagnifyingGlass className="mx-auto mb-2 size-8 text-muted-foreground/60" aria-hidden />
              <p className="text-sm text-muted-foreground">No se encontraron resultados relevantes</p>
            </div>
          )}

          {ragResults.length > 0 && (
            <div className="flex flex-col gap-3">
              {ragResults.map((result, idx) => (
                <div key={idx} className="rounded-lg border border-border bg-muted/40 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="size-4 shrink-0 text-primary" aria-hidden />
                      <span className="truncate font-medium text-foreground">
                        {result.documentTitle}
                      </span>
                      <Badge variant="outline">Chunk #{result.chunkIndex}</Badge>
                    </div>
                    <Badge variant="success">Score: {(result.score * 100).toFixed(1)}%</Badge>
                  </div>
                  <p className="max-h-[150px] overflow-auto whitespace-pre-wrap text-sm text-muted-foreground">
                    {result.content}
                  </p>
                  {result.topic && (
                    <p className="mt-2 text-xs text-muted-foreground">Tema: {result.topic}</p>
                  )}
                  {result.keywords && result.keywords.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {result.keywords.map((kw) => (
                        <Badge key={kw} variant="outline">
                          {kw}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
    </div>
  )
}
