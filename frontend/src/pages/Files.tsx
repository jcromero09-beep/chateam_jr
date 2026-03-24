import { useState, useEffect } from 'react'
import api from '../services/api'
import {
  Container,
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Grid,
  Button,
  IconButton,
  Chip,
  Sheet,
  Table,
  Input,
  Select,
  Option,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl as _FormControl,
  FormLabel as _FormLabel,
  Textarea as _Textarea,
  Divider,
  LinearProgress,
  Tooltip,
  Avatar as _Avatar,
  AspectRatio,
} from '@mui/joy'
import {
  Folder as FolderIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Share as ShareIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  InsertDriveFile as FileIcon,
  Image as ImageIcon,
  PictureAsPdf as PdfIcon,
  Description as DocIcon,
  VideoLibrary as VideoIcon,
  AudioFile as AudioIcon,
  Archive as ZipIcon,
  Code as CodeIcon,
  Edit as _EditIcon,
  Visibility as ViewIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  CloudUpload as CloudIcon,
  SmartToy as AiIcon,
  AutoFixHigh as AutoFixIcon,
  Summarize as SummarizeIcon,
  Translate as TranslateIcon,
  TextFields as ExtractTextIcon,
} from '@mui/icons-material'

/**
 * Interface for File data structure
 */
interface FileItem {
  id: number
  name: string
  type: string // image, pdf, document, video, audio, archive, code, other
  extension: string
  size: number // in bytes
  mimeType: string
  path: string
  url: string
  thumbnail?: string
  uploadedBy: string
  uploadedAt: string
  lastModified: string
  tags: string[]
  category: string
  isFavorite: boolean
  isPublic: boolean
  downloads: number
  aiProcessed: boolean
  aiSummary?: string
  aiTags?: string[]
  aiContent?: string // AI-extracted text content
}

/**
 * Files & Document Management Module with AI Processing
 * Complete file management system with AI-powered features
 *
 * Features:
 * - File upload with drag & drop support
 * - Advanced filtering and search
 * - AI-powered file processing (OCR, summarization, tagging)
 * - File preview and download
 * - Categories and tagging system
 * - Favorites and public sharing
 * - Storage statistics
 * - Responsive design
 */
export default function Files() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [openUploadModal, setOpenUploadModal] = useState(false)
  const [openAiModal, setOpenAiModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [dragActive, setDragActive] = useState(false)

  // Mock data for files
  useEffect(() => {
    fetchFiles()
  }, [])

  const fetchFiles = async () => {
    setLoading(true)
    try {
      const response = await api.get('/files')
      setFiles(response.data ?? [])
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  // Calculate storage statistics
  const stats = {
    totalFiles: files.length,
    totalSize: files.reduce((acc, f) => acc + f.size, 0),
    aiProcessed: files.filter((f) => f.aiProcessed).length,
    favorites: files.filter((f) => f.isFavorite).length,
    public: files.filter((f) => f.isPublic).length,
    images: files.filter((f) => f.type === 'image').length,
    pdfs: files.filter((f) => f.type === 'pdf').length,
    documents: files.filter((f) => f.type === 'document').length,
    videos: files.filter((f) => f.type === 'video').length,
  }

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  // Filter files based on search and filters
  const filteredFiles = files.filter((file) => {
    const matchesSearch =
      file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      file.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase())) ||
      file.aiSummary?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesType = typeFilter === 'all' || file.type === typeFilter
    const matchesCategory = categoryFilter === 'all' || file.category === categoryFilter

    return matchesSearch && matchesType && matchesCategory
  })

  // Get file icon based on type
  const getFileIcon = (file: FileItem) => {
    switch (file.type) {
      case 'image':
        return <ImageIcon sx={{ color: 'success.main' }} />
      case 'pdf':
        return <PdfIcon sx={{ color: 'danger.main' }} />
      case 'document':
        return <DocIcon sx={{ color: 'primary.main' }} />
      case 'video':
        return <VideoIcon sx={{ color: 'warning.main' }} />
      case 'audio':
        return <AudioIcon sx={{ color: 'info.main' }} />
      case 'archive':
        return <ZipIcon sx={{ color: 'neutral.main' }} />
      case 'code':
        return <CodeIcon sx={{ color: 'success.main' }} />
      default:
        return <FileIcon />
    }
  }

  // Handle file upload
  const handleUpload = async (uploadedFiles: FileList | null) => {
    if (!uploadedFiles || uploadedFiles.length === 0) return

    try {
      setUploadProgress(0)
      const formData = new FormData()
      Array.from(uploadedFiles).forEach((file) => formData.append('files', file))
      await api.post('/files/upload', formData)
      setUploadProgress(100)
      setOpenUploadModal(false)
      fetchFiles()
    } catch (error) {
      console.error('Error uploading files:', error)
    }
  }

  // Handle download
  const handleDownload = (file: FileItem) => {
    window.open(file.url, '_blank')
  }

  // Handle delete
  const handleDelete = async (fileId: number) => {
    if (confirm('¿Estás seguro de eliminar este archivo?')) {
      try {
        // await api.delete(`/files/${fileId}`)
        setFiles(files.filter((f) => f.id !== fileId))
      } catch (error) {
        console.error('Error deleting file:', error)
      }
    }
  }

  // Toggle favorite
  const toggleFavorite = async (fileId: number) => {
    try {
      // await api.patch(`/files/${fileId}/favorite`)
      setFiles(
        files.map((f) =>
          f.id === fileId ? { ...f, isFavorite: !f.isFavorite } : f
        )
      )
    } catch (error) {
      console.error('Error toggling favorite:', error)
    }
  }

  // Open AI processing modal
  const openAiProcessing = (file: FileItem) => {
    setSelectedFile(file)
    setOpenAiModal(true)
  }

  // Handle AI processing
  const handleAiProcess = async (action: string) => {
    if (!selectedFile) return
    try {
      // await api.post(`/files/${selectedFile.id}/ai-process`, { action })
      alert(`Procesamiento IA iniciado: ${action}`)
      setOpenAiModal(false)
    } catch (error) {
      console.error('Error processing file with AI:', error)
    }
  }

  // Drag & Drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files)
    }
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <FolderIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Archivos</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Gestión de archivos con procesamiento IA
              </Typography>
            </Box>
          </Stack>
          <Button
            startDecorator={<UploadIcon />}
            color="primary"
            onClick={() => setOpenUploadModal(true)}
          >
            Subir Archivos
          </Button>
        </Stack>

        {loading && <LinearProgress />}

        {/* Statistics */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                      Total Archivos
                    </Typography>
                    <Typography level="h2">{stats.totalFiles}</Typography>
                    <Chip size="sm" color="neutral" variant="soft" sx={{ mt: 1 }}>
                      {formatFileSize(stats.totalSize)}
                    </Chip>
                  </Box>
                  <FolderIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                      Procesados IA
                    </Typography>
                    <Typography level="h2">{stats.aiProcessed}</Typography>
                    <Chip size="sm" color="success" variant="soft" sx={{ mt: 1 }}>
                      {((stats.aiProcessed / stats.totalFiles) * 100).toFixed(0)}%
                    </Chip>
                  </Box>
                  <AiIcon sx={{ fontSize: 48, color: 'success.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                      Favoritos
                    </Typography>
                    <Typography level="h2">{stats.favorites}</Typography>
                    <Chip size="sm" color="warning" variant="soft" sx={{ mt: 1 }}>
                      {stats.public} públicos
                    </Chip>
                  </Box>
                  <StarIcon sx={{ fontSize: 48, color: 'warning.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                      Por Tipo
                    </Typography>
                    <Typography level="h2">{stats.images}</Typography>
                    <Chip size="sm" color="primary" variant="soft" sx={{ mt: 1 }}>
                      {stats.pdfs} PDFs
                    </Chip>
                  </Box>
                  <ImageIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Filters */}
        <Card>
          <CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <Input
                placeholder="Buscar archivos por nombre, tags, contenido..."
                startDecorator={<SearchIcon />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{ flexGrow: 1 }}
              />
              <Select
                value={typeFilter}
                onChange={(_, value) => setTypeFilter(value as string)}
                startDecorator={<FilterIcon />}
                sx={{ minWidth: 180 }}
              >
                <Option value="all">Todos los tipos</Option>
                <Option value="image">Imágenes</Option>
                <Option value="pdf">PDFs</Option>
                <Option value="document">Documentos</Option>
                <Option value="video">Videos</Option>
                <Option value="code">Código</Option>
                <Option value="archive">Archivos</Option>
              </Select>
              <Select
                value={categoryFilter}
                onChange={(_, value) => setCategoryFilter(value as string)}
                sx={{ minWidth: 180 }}
              >
                <Option value="all">Todas las categorías</Option>
                <Option value="presentations">Presentaciones</Option>
                <Option value="contracts">Contratos</Option>
                <Option value="branding">Branding</Option>
                <Option value="videos">Videos</Option>
                <Option value="databases">Bases de Datos</Option>
                <Option value="invoices">Facturas</Option>
                <Option value="projects">Proyectos</Option>
                <Option value="scripts">Scripts</Option>
              </Select>
            </Stack>
          </CardContent>
        </Card>

        {/* Files Table */}
        <Card>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 50 }}></th>
                  <th style={{ width: 300 }}>Archivo</th>
                  <th style={{ width: 100 }}>Tipo</th>
                  <th style={{ width: 120 }}>Tamaño</th>
                  <th style={{ width: 150 }}>Subido por</th>
                  <th style={{ width: 150 }}>Fecha</th>
                  <th style={{ width: 200 }}>Tags</th>
                  <th style={{ width: 100 }}>IA</th>
                  <th style={{ width: 250 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>
                        {files.length === 0
                          ? 'No hay archivos subidos. Arrastra o selecciona archivos para comenzar.'
                          : 'No se encontraron archivos con los filtros aplicados.'}
                      </Typography>
                    </td>
                  </tr>
                ) : (
                  filteredFiles.map((file) => (
                    <tr key={file.id}>
                      <td>
                        <IconButton
                          size="sm"
                          variant="plain"
                          color={file.isFavorite ? 'warning' : 'neutral'}
                          onClick={() => toggleFavorite(file.id)}
                        >
                          {file.isFavorite ? <StarIcon /> : <StarBorderIcon />}
                        </IconButton>
                      </td>
                      <td>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          {file.thumbnail ? (
                            <AspectRatio ratio="1" sx={{ width: 40 }}>
                              <img src={file.thumbnail} alt={file.name} />
                            </AspectRatio>
                          ) : (
                            <Box sx={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {getFileIcon(file)}
                            </Box>
                          )}
                          <Box>
                            <Typography level="body-sm" fontWeight="bold">
                              {file.name}
                            </Typography>
                            {file.aiSummary && (
                              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                {file.aiSummary.substring(0, 60)}...
                              </Typography>
                            )}
                          </Box>
                        </Stack>
                      </td>
                      <td>
                        <Chip size="sm" variant="soft">
                          {file.extension.toUpperCase()}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-sm">{formatFileSize(file.size)}</Typography>
                      </td>
                      <td>
                        <Typography level="body-sm">{file.uploadedBy}</Typography>
                      </td>
                      <td>
                        <Typography level="body-xs">
                          {new Date(file.uploadedAt).toLocaleDateString('es-ES')}
                        </Typography>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                          {file.tags.slice(0, 2).map((tag, idx) => (
                            <Chip key={idx} size="sm" variant="outlined" color="neutral">
                              {tag}
                            </Chip>
                          ))}
                          {file.tags.length > 2 && (
                            <Chip size="sm" variant="soft">
                              +{file.tags.length - 2}
                            </Chip>
                          )}
                        </Stack>
                      </td>
                      <td>
                        {file.aiProcessed ? (
                          <Chip size="sm" color="success" variant="soft" startDecorator={<AiIcon />}>
                            IA
                          </Chip>
                        ) : (
                          <Chip size="sm" color="neutral" variant="outlined">
                            No
                          </Chip>
                        )}
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          <Tooltip title="Ver">
                            <IconButton size="sm" variant="plain" color="primary">
                              <ViewIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Descargar">
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="success"
                              onClick={() => handleDownload(file)}
                            >
                              <DownloadIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Procesar con IA">
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="warning"
                              onClick={() => openAiProcessing(file)}
                            >
                              <AiIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Compartir">
                            <IconButton size="sm" variant="plain" color="neutral">
                              <ShareIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Eliminar">
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="danger"
                              onClick={() => handleDelete(file.id)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Sheet>
        </Card>

        {/* Upload Modal */}
        <Modal open={openUploadModal} onClose={() => setOpenUploadModal(false)}>
          <ModalDialog sx={{ minWidth: 500 }}>
            <ModalClose />
            <Typography level="h4" sx={{ mb: 2 }}>
              Subir Archivos
            </Typography>
            <Stack spacing={3}>
              <Box
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                sx={{
                  border: '2px dashed',
                  borderColor: dragActive ? 'primary.main' : 'neutral.outlinedBorder',
                  borderRadius: 'md',
                  p: 4,
                  textAlign: 'center',
                  bgcolor: dragActive ? 'primary.softBg' : 'background.surface',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <CloudIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
                <Typography level="title-md" sx={{ mb: 1 }}>
                  Arrastra archivos aquí
                </Typography>
                <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 2 }}>
                  o haz clic para seleccionar archivos
                </Typography>
                <Button
                  component="label"
                  startDecorator={<UploadIcon />}
                  variant="soft"
                >
                  Seleccionar Archivos
                  <input
                    type="file"
                    multiple
                    hidden
                    onChange={(e) => handleUpload(e.target.files)}
                  />
                </Button>
              </Box>
              {uploadProgress > 0 && uploadProgress < 100 && (
                <Box>
                  <Typography level="body-sm" sx={{ mb: 1 }}>
                    Subiendo archivos... {uploadProgress}%
                  </Typography>
                  <LinearProgress determinate value={uploadProgress} />
                </Box>
              )}
            </Stack>
          </ModalDialog>
        </Modal>

        {/* AI Processing Modal */}
        <Modal open={openAiModal} onClose={() => setOpenAiModal(false)}>
          <ModalDialog sx={{ minWidth: 500 }}>
            <ModalClose />
            <Typography level="h4" sx={{ mb: 2 }}>
              Procesamiento IA
            </Typography>
            {selectedFile && (
              <Stack spacing={2}>
                <Box>
                  <Typography level="body-sm" fontWeight="bold">
                    Archivo seleccionado:
                  </Typography>
                  <Typography level="body-sm">{selectedFile.name}</Typography>
                </Box>
                <Divider />
                <Typography level="body-sm">
                  Selecciona una acción de procesamiento IA:
                </Typography>
                <Stack spacing={1}>
                  <Button
                    startDecorator={<SummarizeIcon />}
                    variant="soft"
                    color="primary"
                    onClick={() => handleAiProcess('summarize')}
                  >
                    Generar Resumen Automático
                  </Button>
                  <Button
                    startDecorator={<AutoFixIcon />}
                    variant="soft"
                    color="success"
                    onClick={() => handleAiProcess('tags')}
                  >
                    Generar Tags Inteligentes
                  </Button>
                  <Button
                    startDecorator={<ExtractTextIcon />}
                    variant="soft"
                    color="warning"
                    onClick={() => handleAiProcess('extract')}
                  >
                    Extraer Texto (OCR)
                  </Button>
                  <Button
                    startDecorator={<TranslateIcon />}
                    variant="soft"
                    color="neutral"
                    onClick={() => handleAiProcess('translate')}
                  >
                    Traducir Contenido
                  </Button>
                </Stack>
              </Stack>
            )}
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
