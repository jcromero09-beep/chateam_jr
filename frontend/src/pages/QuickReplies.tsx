import { useState, useEffect, useRef } from 'react'
import {
  Typography,
  Stack,
  Container,
  Card,
  CardContent,
  Box,
  Grid,
  Button,
  Table,
  Sheet,
  Chip,
  IconButton,
  Input,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Textarea,
  Select,
  Option,
  CircularProgress,
  Tooltip,
} from '@mui/joy'
import {
  Speed as QuickRepliesIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
  AttachFile as AttachFileIcon,
  CloudUpload as CloudUploadIcon,
  Close as CloseIcon,
  InsertDriveFile as FileIcon,
  Image as ImageIcon,
  VideoFile as VideoFileIcon,
  AudioFile as AudioFileIcon,
} from '@mui/icons-material'
import api from '../services/api'

interface QuickMessage {
  id: number
  shortcode: string
  message: string
  geral?: boolean
  mediaPath?: string
  mediaName?: string
  userId?: number
  createdAt: string
}

// Helper para detectar si un archivo/URL es imagen por extensión
const isImageFile = (name: string): boolean => /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name)
const isVideoFile = (name: string): boolean => /\.(mp4|mov|avi|webm|mkv)$/i.test(name)
const isAudioFile = (name: string): boolean => /\.(mp3|wav|ogg|opus|aac|m4a)$/i.test(name)

const getFileIcon = (name: string) => {
  if (isImageFile(name)) return <ImageIcon />
  if (isVideoFile(name)) return <VideoFileIcon />
  if (isAudioFile(name)) return <AudioFileIcon />
  return <FileIcon />
}

export default function QuickReplies() {
  const [messages, setMessages] = useState<QuickMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [openModal, setOpenModal] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<QuickMessage | null>(null)
  const [formData, setFormData] = useState({
    shortcode: '',
    message: '',
    geral: true,
  })

  // Media upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [existingMedia, setExistingMedia] = useState<{ path: string; name: string } | null>(null)
  const [removeMedia, setRemoveMedia] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchMessages()
  }, [])

  const fetchMessages = async () => {
    try {
      setLoading(true)
      const response = await api.get('/quick-messages')
      console.log('Quick messages API response:', response.data)

      // Backend returns { records, count, hasMore }
      const messagesData = Array.isArray(response.data)
        ? response.data
        : (response.data.records || [])

      setMessages(messagesData)

      if (messagesData.length === 0) {
        console.log('No quick messages found in database')
      }
    } catch (error) {
      console.error('Error fetching quick messages:', error)
      // Show empty array on error to see real state
      setMessages([])
    } finally {
      setLoading(false)
    }
  }

  const uploadMedia = async (quickMessageId: number) => {
    if (!selectedFile) return
    const fd = new FormData()
    fd.append('file', selectedFile)
    fd.append('typeArch', 'quickMessage')
    await api.post(`/quick-messages/${quickMessageId}/media-upload`, fd)
  }

  const deleteMediaFromServer = async (quickMessageId: number) => {
    await api.delete(`/quick-messages/${quickMessageId}/media-upload`)
  }

  const handleCreate = async () => {
    try {
      setUploading(true)
      const response = await api.post('/quick-messages', formData)
      const newId = response.data.id
      if (selectedFile && newId) {
        await uploadMedia(newId)
      }
      fetchMessages()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error creating quick message:', error)
    } finally {
      setUploading(false)
    }
  }

  const handleUpdate = async () => {
    if (!selectedMessage) return
    try {
      setUploading(true)
      // Si se marcó para eliminar media (y no hay archivo nuevo)
      if (removeMedia && !selectedFile && existingMedia) {
        await deleteMediaFromServer(selectedMessage.id)
      }
      await api.put(`/quick-messages/${selectedMessage.id}`, formData)
      // Si hay nuevo archivo, subir (si había media anterior, el backend la reemplaza)
      if (selectedFile) {
        if (existingMedia) {
          await deleteMediaFromServer(selectedMessage.id)
        }
        await uploadMedia(selectedMessage.id)
      }
      fetchMessages()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error updating quick message:', error)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (messageId: number) => {
    if (confirm('¿Estás seguro de eliminar este mensaje rápido?')) {
      try {
        await api.delete(`/quick-messages/${messageId}`)
        fetchMessages()
      } catch (error) {
        console.error('Error deleting quick message:', error)
      }
    }
  }

  const handleCopyMessage = (message: string) => {
    navigator.clipboard.writeText(message)
    // Could add a toast notification here
  }

  const openEditModal = (message: QuickMessage) => {
    setSelectedMessage(message)
    setFormData({
      shortcode: message.shortcode,
      message: message.message,
      geral: message.geral ?? true,
    })
    setExistingMedia(
      message.mediaPath
        ? { path: message.mediaPath, name: message.mediaName || 'archivo' }
        : null
    )
    setSelectedFile(null)
    setRemoveMedia(false)
    setOpenModal(true)
  }

  const openCreateModal = () => {
    setSelectedMessage(null)
    resetForm()
    setOpenModal(true)
  }

  const resetForm = () => {
    setFormData({
      shortcode: '',
      message: '',
      geral: true,
    })
    setSelectedFile(null)
    setExistingMedia(null)
    setRemoveMedia(false)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setRemoveMedia(false)
    }
    // Reset input para permitir re-seleccionar el mismo archivo
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveFile = () => {
    setSelectedFile(null)
    if (existingMedia) {
      setRemoveMedia(true)
    }
  }

  const filteredMessages = messages.filter((msg) => {
    const matchesSearch =
      msg.shortcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      msg.message.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesCategory =
      categoryFilter === 'all' ||
      (categoryFilter === 'global' && msg.geral) ||
      (categoryFilter === 'personal' && !msg.geral)

    return matchesSearch && matchesCategory
  })

  const stats = {
    total: messages.length,
    global: messages.filter((m) => m.geral).length,
    personal: messages.filter((m) => !m.geral).length,
    withMedia: messages.filter((m) => m.mediaPath).length,
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <QuickRepliesIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Mensajes Rápidos</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Respuestas predefinidas para agilizar las conversaciones
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <IconButton variant="outlined" color="neutral" onClick={fetchMessages}>
              <RefreshIcon />
            </IconButton>
            <Button startDecorator={<AddIcon />} color="primary" onClick={openCreateModal}>
              Nuevo Mensaje
            </Button>
          </Stack>
        </Stack>

        {/* Stats */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Total Mensajes
                </Typography>
                <Typography level="h2">{stats.total}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Globales
                </Typography>
                <Typography level="h2" sx={{ color: 'success.main' }}>
                  {stats.global}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Personales
                </Typography>
                <Typography level="h2" sx={{ color: 'primary.main' }}>
                  {stats.personal}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Con Archivos
                </Typography>
                <Typography level="h2">{stats.withMedia}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Filters */}
        <Card>
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Input
                placeholder="Buscar mensajes rápidos..."
                startDecorator={<SearchIcon />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{ flexGrow: 1 }}
              />
              <Select
                value={categoryFilter}
                onChange={(_, value) => setCategoryFilter(value as string)}
                sx={{ minWidth: 180 }}
              >
                <Option value="all">Todos</Option>
                <Option value="global">Globales</Option>
                <Option value="personal">Personales</Option>
              </Select>
            </Stack>
          </CardContent>
        </Card>

        {/* Quick Messages Table */}
        <Card>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 150 }}>Atajo</th>
                  <th>Mensaje</th>
                  <th style={{ width: 100 }}>Tipo</th>
                  <th style={{ width: 100 }}>Archivo</th>
                  <th style={{ width: 180 }}>Fecha Creación</th>
                  <th style={{ width: 180 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>Cargando mensajes...</Typography>
                    </td>
                  </tr>
                ) : filteredMessages.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>No se encontraron mensajes</Typography>
                    </td>
                  </tr>
                ) : (
                  filteredMessages.map((message) => (
                    <tr key={message.id}>
                      <td>
                        <Chip size="sm" variant="soft" color="primary">
                          {message.shortcode}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-sm" noWrap sx={{ maxWidth: 400 }}>
                          {message.message}
                        </Typography>
                      </td>
                      <td>
                        <Chip size="sm" color={message.geral ? 'success' : 'neutral'}>
                          {message.geral ? 'Global' : 'Personal'}
                        </Chip>
                      </td>
                      <td>
                        {message.mediaPath ? (
                          <Tooltip title={message.mediaName || 'Ver archivo'}>
                            <IconButton
                              size="sm"
                              variant="soft"
                              color="primary"
                              onClick={() => window.open(message.mediaPath, '_blank')}
                            >
                              {getFileIcon(message.mediaName || '')}
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            -
                          </Typography>
                        )}
                      </td>
                      <td>
                        <Typography level="body-xs">
                          {new Date(message.createdAt).toLocaleDateString('es-ES')}
                        </Typography>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="neutral"
                            onClick={() => handleCopyMessage(message.message)}
                            title="Copiar mensaje"
                          >
                            <CopyIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="primary"
                            onClick={() => openEditModal(message)}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={() => handleDelete(message.id)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Stack>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Sheet>
        </Card>

        {/* Modal Create/Edit */}
        <Modal open={openModal} onClose={() => setOpenModal(false)}>
          <ModalDialog sx={{ minWidth: 600 }}>
            <ModalClose />
            <Typography level="h4" sx={{ mb: 2 }}>
              {selectedMessage ? 'Editar Mensaje Rápido' : 'Nuevo Mensaje Rápido'}
            </Typography>
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>Atajo</FormLabel>
                <Input
                  value={formData.shortcode}
                  onChange={(e) => setFormData({ ...formData, shortcode: e.target.value })}
                  placeholder="/ejemplo"
                  startDecorator="/"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Mensaje</FormLabel>
                <Textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Escribe el mensaje predefinido..."
                  minRows={4}
                  maxRows={8}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Tipo de Mensaje</FormLabel>
                <Select
                  value={formData.geral ? 'global' : 'personal'}
                  onChange={(_, value) => setFormData({ ...formData, geral: value === 'global' })}
                >
                  <Option value="global">Global (Todos los usuarios)</Option>
                  <Option value="personal">Personal (Solo yo)</Option>
                </Select>
              </FormControl>

              {/* Archivo multimedia */}
              <FormControl>
                <FormLabel>Archivo Multimedia (opcional)</FormLabel>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                  style={{ display: 'none' }}
                />

                {/* Estado: sin archivo */}
                {!selectedFile && !existingMedia?.path && !removeMedia && (
                  <Box
                    onClick={() => fileInputRef.current?.click()}
                    sx={{
                      border: '2px dashed',
                      borderColor: 'neutral.300',
                      borderRadius: 'sm',
                      p: 3,
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'border-color 0.2s',
                      '&:hover': { borderColor: 'primary.400' },
                    }}
                  >
                    <CloudUploadIcon sx={{ fontSize: 36, color: 'neutral.400', mb: 1 }} />
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      Haz clic para adjuntar imagen, video, audio o documento
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                      Formatos: JPG, PNG, GIF, MP4, MP3, PDF, DOC, XLS...
                    </Typography>
                  </Box>
                )}

                {/* Estado: archivo nuevo seleccionado */}
                {selectedFile && (
                  <Box sx={{ border: '1px solid', borderColor: 'primary.300', borderRadius: 'sm', p: 1.5 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      {selectedFile.type.startsWith('image/') ? (
                        <Box
                          component="img"
                          src={URL.createObjectURL(selectedFile)}
                          alt="preview"
                          sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 'sm' }}
                        />
                      ) : (
                        <Box sx={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'primary.softBg', borderRadius: 'sm' }}>
                          {getFileIcon(selectedFile.name)}
                        </Box>
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography level="body-sm" fontWeight="bold" noWrap>
                          {selectedFile.name}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Cambiar archivo">
                          <IconButton size="sm" variant="plain" color="primary" onClick={() => fileInputRef.current?.click()}>
                            <CloudUploadIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Quitar archivo">
                          <IconButton size="sm" variant="plain" color="danger" onClick={handleRemoveFile}>
                            <CloseIcon />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>
                  </Box>
                )}

                {/* Estado: archivo existente (editando) */}
                {!selectedFile && existingMedia?.path && !removeMedia && (
                  <Box sx={{ border: '1px solid', borderColor: 'success.300', borderRadius: 'sm', p: 1.5 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      {isImageFile(existingMedia.name) ? (
                        <Box
                          component="img"
                          src={existingMedia.path}
                          alt="media actual"
                          sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 'sm' }}
                        />
                      ) : (
                        <Box sx={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'success.softBg', borderRadius: 'sm' }}>
                          {getFileIcon(existingMedia.name)}
                        </Box>
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography level="body-sm" fontWeight="bold" noWrap>
                          {existingMedia.name}
                        </Typography>
                        <Chip size="sm" color="success" variant="soft" sx={{ mt: 0.5 }}>
                          Archivo actual
                        </Chip>
                      </Box>
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Reemplazar archivo">
                          <IconButton size="sm" variant="plain" color="primary" onClick={() => fileInputRef.current?.click()}>
                            <CloudUploadIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Eliminar archivo">
                          <IconButton size="sm" variant="plain" color="danger" onClick={handleRemoveFile}>
                            <CloseIcon />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>
                  </Box>
                )}

                {/* Estado: archivo eliminado (se marcó para borrar) */}
                {!selectedFile && removeMedia && (
                  <Box
                    onClick={() => fileInputRef.current?.click()}
                    sx={{
                      border: '2px dashed',
                      borderColor: 'danger.300',
                      borderRadius: 'sm',
                      p: 2,
                      textAlign: 'center',
                      cursor: 'pointer',
                      '&:hover': { borderColor: 'primary.400' },
                    }}
                  >
                    <Typography level="body-sm" sx={{ color: 'danger.500' }}>
                      Archivo marcado para eliminar
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                      Haz clic para adjuntar uno nuevo, o guarda para eliminar
                    </Typography>
                  </Box>
                )}
              </FormControl>

              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 2, bgcolor: 'background.level1', borderRadius: 'sm' }}>
                <Typography level="body-sm" sx={{ flex: 1 }}>
                  <strong>Vista Previa:</strong><br />
                  {formData.shortcode || '/atajo'} → {formData.message || 'Mensaje aquí...'}
                  {(selectedFile || (existingMedia && !removeMedia)) && (
                    <>
                      <br />
                      <AttachFileIcon sx={{ fontSize: 14, verticalAlign: 'middle', mr: 0.5 }} />
                      {selectedFile?.name || existingMedia?.name}
                    </>
                  )}
                </Typography>
              </Box>
              <Button
                color="primary"
                onClick={selectedMessage ? handleUpdate : handleCreate}
                disabled={uploading}
                startDecorator={uploading ? <CircularProgress size="sm" /> : undefined}
              >
                {uploading ? 'Guardando...' : `${selectedMessage ? 'Actualizar' : 'Crear'} Mensaje`}
              </Button>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
