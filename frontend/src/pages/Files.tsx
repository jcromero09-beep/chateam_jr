import { useState, useEffect } from 'react'
import {
  Folder,
  UploadSimple,
  DownloadSimple,
  Trash,
  ShareNetwork,
  MagnifyingGlass,
  FunnelSimple,
  File as FileGenericIcon,
  Image as ImageIcon,
  FilePdf,
  FileDoc,
  VideoCamera,
  FileAudio,
  FileZip,
  Code,
  Eye,
  Star,
  CloudArrowUp,
  Robot,
  MagicWand,
  Article,
  Translate,
  TextT,
} from '@phosphor-icons/react'
// [Rule 3] LinearProgress se conserva como MUI: no hay equivalente en el design system.
import { LinearProgress } from '@mui/joy'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import api from '../services/api'

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

const columns = ['', 'Archivo', 'Tipo', 'Tamaño', 'Subido por', 'Fecha', 'Tags', 'IA', 'Acciones']

/**
 * Files & Document Management Module with AI Processing
 * Complete file management system with AI-powered features
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

  // Get file icon based on type (colores por token del design system)
  const getFileIcon = (file: FileItem) => {
    switch (file.type) {
      case 'image':
        return <ImageIcon className="size-5 text-success" weight="fill" aria-hidden />
      case 'pdf':
        return <FilePdf className="size-5 text-destructive" weight="fill" aria-hidden />
      case 'document':
        return <FileDoc className="size-5 text-primary" weight="fill" aria-hidden />
      case 'video':
        return <VideoCamera className="size-5 text-warning" weight="fill" aria-hidden />
      case 'audio':
        return <FileAudio className="size-5 text-brand-cyan" weight="fill" aria-hidden />
      case 'archive':
        return <FileZip className="size-5 text-muted-foreground" weight="fill" aria-hidden />
      case 'code':
        return <Code className="size-5 text-success" weight="fill" aria-hidden />
      default:
        return <FileGenericIcon className="size-5 text-muted-foreground" aria-hidden />
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
    <TooltipProvider delayDuration={300}>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <Folder className="size-6" weight="fill" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Archivos
                </h1>
                <p className="text-sm text-muted-foreground">
                  Gestión de archivos con procesamiento IA
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => setOpenUploadModal(true)}>
              <UploadSimple className="size-4" weight="bold" aria-hidden />
              Subir Archivos
            </Button>
          </div>

          {loading && <LinearProgress />}

          {/* Statistics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Total Archivos</p>
                  <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {stats.totalFiles}
                  </p>
                  <Badge variant="neutral" className="mt-2">
                    {formatFileSize(stats.totalSize)}
                  </Badge>
                </div>
                <Folder className="size-11 shrink-0 text-primary/25" weight="fill" aria-hidden />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Procesados IA</p>
                  <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {stats.aiProcessed}
                  </p>
                  <Badge variant="success" className="mt-2">
                    {stats.totalFiles > 0
                      ? ((stats.aiProcessed / stats.totalFiles) * 100).toFixed(0)
                      : 0}
                    %
                  </Badge>
                </div>
                <Robot className="size-11 shrink-0 text-success/30" weight="fill" aria-hidden />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Favoritos</p>
                  <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {stats.favorites}
                  </p>
                  <Badge variant="warning" className="mt-2">
                    {stats.public} públicos
                  </Badge>
                </div>
                <Star className="size-11 shrink-0 text-warning/30" weight="fill" aria-hidden />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Por Tipo</p>
                  <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {stats.images}
                  </p>
                  <Badge variant="primary" className="mt-2">
                    {stats.pdfs} PDFs
                  </Badge>
                </div>
                <ImageIcon className="size-11 shrink-0 text-primary/25" weight="fill" aria-hidden />
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <MagnifyingGlass
                  className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  placeholder="Buscar archivos por nombre, tags, contenido..."
                  aria-label="Buscar archivos"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-10 md:w-48" aria-label="Filtrar por tipo">
                  <span className="flex items-center gap-2">
                    <FunnelSimple className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <SelectValue placeholder="Tipo" />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  <SelectItem value="image">Imágenes</SelectItem>
                  <SelectItem value="pdf">PDFs</SelectItem>
                  <SelectItem value="document">Documentos</SelectItem>
                  <SelectItem value="video">Videos</SelectItem>
                  <SelectItem value="code">Código</SelectItem>
                  <SelectItem value="archive">Archivos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-10 md:w-48" aria-label="Filtrar por categoría">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  <SelectItem value="presentations">Presentaciones</SelectItem>
                  <SelectItem value="contracts">Contratos</SelectItem>
                  <SelectItem value="branding">Branding</SelectItem>
                  <SelectItem value="videos">Videos</SelectItem>
                  <SelectItem value="databases">Bases de Datos</SelectItem>
                  <SelectItem value="invoices">Facturas</SelectItem>
                  <SelectItem value="projects">Proyectos</SelectItem>
                  <SelectItem value="scripts">Scripts</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Files Table */}
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {columns.map((c, i) => (
                      <th
                        key={i}
                        className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredFiles.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-10 text-center text-muted-foreground"
                      >
                        {files.length === 0
                          ? 'No hay archivos subidos. Arrastra o selecciona archivos para comenzar.'
                          : 'No se encontraron archivos con los filtros aplicados.'}
                      </td>
                    </tr>
                  ) : (
                    filteredFiles.map((file) => (
                      <tr key={file.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            aria-label={file.isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                            title={file.isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                            onClick={() => toggleFavorite(file.id)}
                            className={cn(
                              'flex size-8 items-center justify-center rounded-md transition-colors hover:bg-accent',
                              file.isFavorite
                                ? 'text-warning-text'
                                : 'text-muted-foreground',
                            )}
                          >
                            <Star
                              className="size-[18px]"
                              weight={file.isFavorite ? 'fill' : 'regular'}
                              aria-hidden
                            />
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {file.thumbnail ? (
                              <img
                                src={file.thumbnail}
                                alt={file.name}
                                width={40}
                                height={40}
                                className="size-10 shrink-0 rounded-md object-cover ring-1 ring-inset ring-border"
                              />
                            ) : (
                              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                                {getFileIcon(file)}
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">{file.name}</p>
                              {file.aiSummary && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {file.aiSummary.substring(0, 60)}...
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="neutral">{file.extension.toUpperCase()}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                          {formatFileSize(file.size)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{file.uploadedBy}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {new Date(file.uploadedAt).toLocaleDateString('es-ES')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {file.tags.slice(0, 2).map((tag, idx) => (
                              <Badge key={idx} variant="outline">
                                {tag}
                              </Badge>
                            ))}
                            {file.tags.length > 2 && (
                              <Badge variant="neutral">+{file.tags.length - 2}</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {file.aiProcessed ? (
                            <Badge variant="success">
                              <Robot className="size-3.5" weight="fill" aria-hidden />
                              IA
                            </Badge>
                          ) : (
                            <Badge variant="outline">No</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-0.5">
                            <Tooltip title="Ver">
                              <button
                                type="button"
                                aria-label="Ver"
                                className="flex size-8 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/10"
                              >
                                <Eye className="size-[18px]" aria-hidden />
                              </button>
                            </Tooltip>
                            <Tooltip title="Descargar">
                              <button
                                type="button"
                                aria-label="Descargar"
                                onClick={() => handleDownload(file)}
                                className="flex size-8 items-center justify-center rounded-md text-success-text transition-colors hover:bg-success/10"
                              >
                                <DownloadSimple className="size-[18px]" aria-hidden />
                              </button>
                            </Tooltip>
                            <Tooltip title="Procesar con IA">
                              <button
                                type="button"
                                aria-label="Procesar con IA"
                                onClick={() => openAiProcessing(file)}
                                className="flex size-8 items-center justify-center rounded-md text-warning-text transition-colors hover:bg-warning/10"
                              >
                                <Robot className="size-[18px]" aria-hidden />
                              </button>
                            </Tooltip>
                            <Tooltip title="Compartir">
                              <button
                                type="button"
                                aria-label="Compartir"
                                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                              >
                                <ShareNetwork className="size-[18px]" aria-hidden />
                              </button>
                            </Tooltip>
                            <Tooltip title="Eliminar">
                              <button
                                type="button"
                                aria-label="Eliminar"
                                onClick={() => handleDelete(file.id)}
                                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-text"
                              >
                                <Trash className="size-[18px]" aria-hidden />
                              </button>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Upload Modal */}
        <Dialog open={openUploadModal} onOpenChange={setOpenUploadModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Subir Archivos</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={cn(
                  'flex flex-col items-center rounded-lg border-2 border-dashed p-8 text-center transition-colors',
                  dragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-input bg-background',
                )}
              >
                <CloudArrowUp className="mb-3 size-14 text-primary" weight="fill" aria-hidden />
                <p className="text-base font-medium text-foreground">
                  Arrastra archivos aquí
                </p>
                <p className="mb-4 text-sm text-muted-foreground">
                  o haz clic para seleccionar archivos
                </p>
                <label className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                  <UploadSimple className="size-4" weight="bold" aria-hidden />
                  Seleccionar Archivos
                  <input
                    type="file"
                    multiple
                    hidden
                    onChange={(e) => handleUpload(e.target.files)}
                  />
                </label>
              </div>
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div>
                  <p className="mb-1.5 text-sm text-muted-foreground">
                    Subiendo archivos... {uploadProgress}%
                  </p>
                  {/* [Rule 3] LinearProgress conservado como MUI */}
                  <LinearProgress determinate value={uploadProgress} />
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* AI Processing Modal */}
        <Dialog open={openAiModal} onOpenChange={setOpenAiModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Procesamiento IA</DialogTitle>
            </DialogHeader>
            {selectedFile && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Archivo seleccionado:</p>
                  <p className="text-sm text-muted-foreground">{selectedFile.name}</p>
                </div>
                <div className="border-t border-border" />
                <p className="text-sm text-muted-foreground">
                  Selecciona una acción de procesamiento IA:
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => handleAiProcess('summarize')}
                  >
                    <Article className="size-5 text-primary" aria-hidden />
                    Generar Resumen Automático
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => handleAiProcess('tags')}
                  >
                    <MagicWand className="size-5 text-success" aria-hidden />
                    Generar Tags Inteligentes
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => handleAiProcess('extract')}
                  >
                    <TextT className="size-5 text-warning" aria-hidden />
                    Extraer Texto (OCR)
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => handleAiProcess('translate')}
                  >
                    <Translate className="size-5 text-muted-foreground" aria-hidden />
                    Traducir Contenido
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
