/**
 * DocumentDetailModal — Modal para ver detalles de un documento RAG.
 * Muestra metadata, estado, y lista de chunks con contenido.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Box,
  Button,
  Chip,
  Sheet,
  Table,
  CircularProgress,
  Alert,
  Divider,
  Card,
  CardContent,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  AccordionGroup,
} from '@mui/joy'
import {
  FileText,
  Layers,
  Hash,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Trash2,
  ChevronDown,
  Tag,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '../../services/api'

interface RAGChunk {
  id: number
  chunkIndex: number
  content: string
  tokenCount: number
  topic: string | null
  keywords: string[] | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

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

interface DocumentDetailModalProps {
  open: boolean
  documentId: number | null
  onClose: () => void
  onDelete: () => void
  onReindex: () => void
}

const STATUS_COLORS: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
  pending: 'neutral',
  processing: 'warning',
  completed: 'success',
  error: 'danger',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  processing: 'Procesando',
  completed: 'Listo',
  error: 'Error',
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

export default function DocumentDetailModal({
  open,
  documentId,
  onClose,
  onDelete,
  onReindex,
}: DocumentDetailModalProps) {
  const [loading, setLoading] = useState(true)
  const [document, setDocument] = useState<RAGDocument | null>(null)
  const [chunks, setChunks] = useState<RAGChunk[]>([])
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const loadDetail = useCallback(async () => {
    if (!documentId) return
    setLoading(true)
    setError(null)
    try {
      const { data: resp } = await api.get(`/ai/rag/documents/${documentId}`)
      const payload = resp?.data || resp
      setDocument(payload.document || payload)
      setChunks(Array.isArray(payload.chunks) ? payload.chunks : [])
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Error al cargar detalles'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    if (open && documentId) {
      loadDetail()
      setConfirmDelete(false)
    }
  }, [open, documentId, loadDetail])

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    try {
      await api.delete(`/ai/rag/documents/${documentId}`)
      toast.success('Documento eliminado correctamente')
      onDelete()
      onClose()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Error al eliminar'
      toast.error(msg)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const handleReindex = async () => {
    try {
      await api.put(`/ai/rag/documents/${documentId}/reindex`)
      toast.success('Reindexacion iniciada')
      onReindex()
      onClose()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Error al reindexar'
      toast.error(msg)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: { xs: '95%', sm: 700 }, maxHeight: '90vh', overflow: 'auto' }}>
        <ModalClose />

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert color="danger">{error}</Alert>
        ) : document ? (
          <>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2 }}>
              <FileText size={24} color="var(--joy-palette-primary-500)" />
              <Box sx={{ flex: 1 }}>
                <Typography level="title-lg">{document.title}</Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                  <Chip size="sm" color={STATUS_COLORS[document.status] ?? 'neutral'} variant="soft">
                    {STATUS_LABELS[document.status] ?? document.status}
                  </Chip>
                  <Chip size="sm" variant="outlined">
                    {SOURCE_LABELS[document.sourceType] ?? document.sourceType}
                  </Chip>
                </Box>
              </Box>
            </Box>

            {/* Error del documento */}
            {document.errorMessage && (
              <Alert color="danger" sx={{ mb: 2 }} startDecorator={<AlertTriangle size={16} />}>
                {document.errorMessage}
              </Alert>
            )}

            {/* KPI mini */}
            <Grid container spacing={1.5} sx={{ mb: 2 }}>
              <Grid xs={4}>
                <Card variant="soft" size="sm">
                  <CardContent sx={{ textAlign: 'center' }}>
                    <Layers size={16} color="var(--joy-palette-success-500)" />
                    <Typography level="title-md">{formatNumber(document.chunksCount)}</Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Chunks</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid xs={4}>
                <Card variant="soft" size="sm">
                  <CardContent sx={{ textAlign: 'center' }}>
                    <Hash size={16} color="var(--joy-palette-warning-500)" />
                    <Typography level="title-md">{formatNumber(document.tokensCount)}</Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Tokens</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid xs={4}>
                <Card variant="soft" size="sm">
                  <CardContent sx={{ textAlign: 'center' }}>
                    <Calendar size={16} color="var(--joy-palette-primary-500)" />
                    <Typography level="body-xs" fontWeight="md">
                      {formatDate(document.createdAt)}
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Creado</Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Info adicional */}
            {document.sourceUrl && (
              <Typography level="body-sm" sx={{ mb: 1 }}>
                <strong>URL:</strong>{' '}
                <a href={document.sourceUrl} target="_blank" rel="noreferrer">
                  {document.sourceUrl}
                </a>
              </Typography>
            )}
            {document.fileSizeBytes > 0 && (
              <Typography level="body-sm" sx={{ mb: 1, color: 'text.tertiary' }}>
                Tamano: {(document.fileSizeBytes / 1024).toFixed(1)} KB
              </Typography>
            )}

            <Divider sx={{ my: 2 }} />

            {/* Chunks */}
            <Typography level="title-md" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Layers size={18} />
              Chunks ({chunks.length})
            </Typography>

            {chunks.length === 0 ? (
              <Typography level="body-sm" sx={{ color: 'text.tertiary', py: 2, textAlign: 'center' }}>
                {document.status === 'processing'
                  ? 'El documento esta siendo procesado...'
                  : 'No hay chunks disponibles'}
              </Typography>
            ) : (
              <AccordionGroup sx={{ maxHeight: 350, overflow: 'auto' }}>
                {chunks.map((chunk) => (
                  <Accordion key={chunk.id}>
                    <AccordionSummary indicator={<ChevronDown size={16} />}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                        <Chip size="sm" variant="outlined">#{chunk.chunkIndex}</Chip>
                        <Typography level="body-sm" noWrap sx={{ flex: 1 }}>
                          {chunk.content.substring(0, 80)}...
                        </Typography>
                        <Chip size="sm" color="neutral">{chunk.tokenCount} tokens</Chip>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Typography level="body-sm" sx={{ whiteSpace: 'pre-wrap', mb: 1 }}>
                        {chunk.content}
                      </Typography>
                      {chunk.topic && (
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          <strong>Tema:</strong> {chunk.topic}
                        </Typography>
                      )}
                      {chunk.keywords && chunk.keywords.length > 0 && (
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                          {chunk.keywords.map((kw) => (
                            <Chip key={kw} size="sm" variant="soft" startDecorator={<Tag size={10} />}>
                              {kw}
                            </Chip>
                          ))}
                        </Box>
                      )}
                    </AccordionDetails>
                  </Accordion>
                ))}
              </AccordionGroup>
            )}

            <Divider sx={{ my: 2 }} />

            {/* Acciones */}
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button
                variant="soft"
                color="warning"
                size="sm"
                startDecorator={<RefreshCw size={14} />}
                onClick={handleReindex}
                disabled={document.status === 'processing'}
              >
                Reindexar
              </Button>
              <Button
                variant={confirmDelete ? 'solid' : 'soft'}
                color="danger"
                size="sm"
                startDecorator={<Trash2 size={14} />}
                onClick={handleDelete}
                loading={deleting}
              >
                {confirmDelete ? 'Confirmar eliminacion' : 'Eliminar'}
              </Button>
            </Box>
          </>
        ) : null}
      </ModalDialog>
    </Modal>
  )
}
