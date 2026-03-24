/**
 * UploadDocumentModal — Modal para subir documentos a la Knowledge Base.
 * Soporta 3 modos: Texto manual, URL, y Archivo (PDF, TXT, DOCX, CSV).
 */
import { useState, useRef } from 'react'
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Box,
  Button,
  Input,
  Textarea,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  FormControl,
  FormLabel,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/joy'
import { Upload, FileText, Link, Type, X } from 'lucide-react'
import { toast } from 'sonner'
import api from '../../services/api'

interface UploadDocumentModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

const ACCEPTED_EXTENSIONS = '.pdf,.txt,.csv,.md,.docx,.xlsx'
const MAX_FILE_SIZE_MB = 20

export default function UploadDocumentModal({ open, onClose, onSuccess }: UploadDocumentModalProps) {
  const [tab, setTab] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Texto manual
  const [manualTitle, setManualTitle] = useState('')
  const [manualContent, setManualContent] = useState('')

  // URL
  const [urlTitle, setUrlTitle] = useState('')
  const [urlValue, setUrlValue] = useState('')

  // Archivo
  const [fileTitle, setFileTitle] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetForm = () => {
    setManualTitle('')
    setManualContent('')
    setUrlTitle('')
    setUrlValue('')
    setFileTitle('')
    setSelectedFile(null)
    setError(null)
    setTab(0)
  }

  const handleClose = () => {
    if (!loading) {
      resetForm()
      onClose()
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`El archivo excede el limite de ${MAX_FILE_SIZE_MB}MB`)
      return
    }

    setSelectedFile(file)
    if (!fileTitle) {
      setFileTitle(file.name.replace(/\.[^/.]+$/, ''))
    }
    setError(null)
  }

  const handleSubmitManual = async () => {
    if (!manualTitle.trim()) return setError('El titulo es obligatorio')
    if (!manualContent.trim()) return setError('El contenido es obligatorio')

    setLoading(true)
    setError(null)
    try {
      await api.post('/ai/rag/documents', {
        title: manualTitle.trim(),
        sourceType: 'manual',
        content: manualContent.trim(),
      })
      toast.success('Documento creado. Procesamiento iniciado.')
      resetForm()
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Error al crear documento'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitUrl = async () => {
    if (!urlTitle.trim()) return setError('El titulo es obligatorio')
    if (!urlValue.trim()) return setError('La URL es obligatoria')

    setLoading(true)
    setError(null)
    try {
      await api.post('/ai/rag/documents', {
        title: urlTitle.trim(),
        sourceType: 'url',
        sourceUrl: urlValue.trim(),
      })
      toast.success('Documento creado desde URL. Procesamiento iniciado.')
      resetForm()
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Error al crear documento'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitFile = async () => {
    if (!fileTitle.trim()) return setError('El titulo es obligatorio')
    if (!selectedFile) return setError('Selecciona un archivo')

    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('title', fileTitle.trim())
      formData.append('sourceType', selectedFile.name.split('.').pop()?.toLowerCase() || 'txt')
      formData.append('file', selectedFile)

      await api.post('/ai/rag/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Archivo subido. Procesamiento iniciado.')
      resetForm()
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Error al subir archivo'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose}>
      <ModalDialog sx={{ width: { xs: '95%', sm: 560 }, maxHeight: '90vh', overflow: 'auto' }}>
        <ModalClose />
        <Typography level="title-lg" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Upload size={22} />
          Subir Documento
        </Typography>
        <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 2 }}>
          Agrega contenido a la base de conocimiento para mejorar las respuestas de IA.
        </Typography>

        {error && (
          <Alert color="danger" sx={{ mb: 2 }} endDecorator={
            <Button size="sm" variant="plain" color="danger" onClick={() => setError(null)}>
              <X size={14} />
            </Button>
          }>
            {error}
          </Alert>
        )}

        <Tabs value={tab} onChange={(_, v) => setTab(v as number)}>
          <TabList>
            <Tab>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Type size={14} /> Texto
              </Box>
            </Tab>
            <Tab>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Link size={14} /> URL
              </Box>
            </Tab>
            <Tab>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <FileText size={14} /> Archivo
              </Box>
            </Tab>
          </TabList>

          {/* Tab: Texto Manual */}
          <TabPanel value={0} sx={{ pt: 2 }}>
            <FormControl sx={{ mb: 2 }}>
              <FormLabel>Titulo del documento</FormLabel>
              <Input
                placeholder="Ej: Politica de devoluciones"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                disabled={loading}
              />
            </FormControl>
            <FormControl sx={{ mb: 2 }}>
              <FormLabel>Contenido</FormLabel>
              <Textarea
                placeholder="Pega o escribe el contenido del documento aqui..."
                minRows={6}
                maxRows={12}
                value={manualContent}
                onChange={(e) => setManualContent(e.target.value)}
                disabled={loading}
              />
              <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                {manualContent.length.toLocaleString()} caracteres
              </Typography>
            </FormControl>
            <Button
              fullWidth
              loading={loading}
              onClick={handleSubmitManual}
              disabled={!manualTitle.trim() || !manualContent.trim()}
            >
              Crear Documento
            </Button>
          </TabPanel>

          {/* Tab: URL */}
          <TabPanel value={1} sx={{ pt: 2 }}>
            <FormControl sx={{ mb: 2 }}>
              <FormLabel>Titulo del documento</FormLabel>
              <Input
                placeholder="Ej: FAQ del sitio web"
                value={urlTitle}
                onChange={(e) => setUrlTitle(e.target.value)}
                disabled={loading}
              />
            </FormControl>
            <FormControl sx={{ mb: 2 }}>
              <FormLabel>URL de la fuente</FormLabel>
              <Input
                type="url"
                placeholder="https://ejemplo.com/documento"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                disabled={loading}
              />
            </FormControl>
            <Button
              fullWidth
              loading={loading}
              onClick={handleSubmitUrl}
              disabled={!urlTitle.trim() || !urlValue.trim()}
            >
              Importar desde URL
            </Button>
          </TabPanel>

          {/* Tab: Archivo */}
          <TabPanel value={2} sx={{ pt: 2 }}>
            <FormControl sx={{ mb: 2 }}>
              <FormLabel>Titulo del documento</FormLabel>
              <Input
                placeholder="Ej: Manual de usuario v2"
                value={fileTitle}
                onChange={(e) => setFileTitle(e.target.value)}
                disabled={loading}
              />
            </FormControl>

            <input
              type="file"
              ref={fileInputRef}
              accept={ACCEPTED_EXTENSIONS}
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />

            <Box
              onClick={() => !loading && fileInputRef.current?.click()}
              sx={{
                border: '2px dashed',
                borderColor: selectedFile ? 'success.300' : 'neutral.300',
                borderRadius: 'lg',
                p: 3,
                textAlign: 'center',
                cursor: loading ? 'default' : 'pointer',
                transition: 'all 0.2s',
                bgcolor: selectedFile ? 'success.50' : 'transparent',
                '&:hover': loading ? {} : {
                  borderColor: 'primary.400',
                  bgcolor: 'primary.50',
                },
                mb: 2,
              }}
            >
              {selectedFile ? (
                <Box>
                  <FileText size={32} color="var(--joy-palette-success-500)" />
                  <Typography level="body-sm" fontWeight="md" sx={{ mt: 1 }}>
                    {selectedFile.name}
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </Typography>
                  <Chip
                    size="sm"
                    color="danger"
                    variant="soft"
                    sx={{ mt: 1, cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                  >
                    Quitar
                  </Chip>
                </Box>
              ) : (
                <Box>
                  <Upload size={32} color="var(--joy-palette-neutral-400)" />
                  <Typography level="body-sm" sx={{ mt: 1, color: 'text.secondary' }}>
                    Haz clic o arrastra un archivo aqui
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                    PDF, TXT, DOCX, CSV, XLSX — Max {MAX_FILE_SIZE_MB}MB
                  </Typography>
                </Box>
              )}
            </Box>

            <Button
              fullWidth
              loading={loading}
              onClick={handleSubmitFile}
              disabled={!fileTitle.trim() || !selectedFile}
            >
              Subir Archivo
            </Button>
          </TabPanel>
        </Tabs>
      </ModalDialog>
    </Modal>
  )
}
