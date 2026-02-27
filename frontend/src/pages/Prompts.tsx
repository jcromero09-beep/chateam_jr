import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'react-toastify'
import toastError from '../errors/toastError'
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
  FormHelperText,
  Textarea,
  Autocomplete,
  // Select, // COMENTADO: Ya no se usa para proveedor de IA
  // Option, // COMENTADO: Ya no se usa para proveedor de IA
  Alert,
  CircularProgress,
} from '@mui/joy'
import {
  Psychology as PromptsIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
  // SmartToy as AIIcon, // COMENTADO: Ya no se usa para proveedor de IA
  Warning as WarningIcon,
  UploadFile as UploadFileIcon,
  AttachFile as AttachFileIcon,
  Close as CloseIcon,
} from '@mui/icons-material'
import api from '../services/api'
import { i18n } from "../translate/i18n" // P3.47: i18n support
import { useAuth } from '../hooks/useAuth'

// Interface para proveedores de IA configurados en /openai/settings
interface AIProvider {
  id: number
  provider: string
  name: string
  isActive: boolean
  isDefault: boolean
  connectionStatus: string
  settings: {
    defaultModel?: string
    defaultTemperature?: number
    defaultMaxTokens?: number
  }
}

interface Queue {
  id: number
  name: string
  color?: string
}

interface Prompt {
  id: number
  name: string
  prompt: string
  // apiKey?: string // COMENTADO: Ahora se usa el proveedor de IA configurado
  aiProviderId?: number // ID del proveedor de IA configurado en /openai/settings
  aiProvider?: AIProvider // Relación con el proveedor
  queueId: number
  queueIds?: number[]
  queues?: Queue[]
  maxTokens: number
  temperature: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  maxMessages: number
  voice?: string
  voiceKey?: string
  voiceRegion?: string
  companyId: number
  createdAt: string
}

export default function Prompts() {
  const { user } = useAuth()

  // P3.44: Helper para logging solo en desarrollo
  const isDev = import.meta.env.DEV;
  const devError = (...args: any[]) => {
    if (isDev) console.error(...args);
  };

  // Verificar si el usuario es superadmin
  const isSuperAdmin = user?.profile === 'super' || user?.super === true

  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [queues, setQueues] = useState<Queue[]>([])
  const [aiProviders, setAiProviders] = useState<AIProvider[]>([]) // Proveedores de IA (legacy, comentado)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null) // P1.18: Error state management
  const [searchTerm, setSearchTerm] = useState('')
  const [openModal, setOpenModal] = useState(false)
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
  const [selectedQueues, setSelectedQueues] = useState<Queue[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null) // Archivo para subir
  const fileInputRef = useRef<HTMLInputElement>(null) // Ref para el input de archivo
  const [formData, setFormData] = useState({
    name: '',
    prompt: '',
    // apiKey: '', // COMENTADO: Ahora se usa aiProviderId
    // aiProviderId: 0, // COMENTADO: Ya no se usa proveedor de IA
    queueId: 0,
    queueIds: [] as number[],
    maxTokens: 2000,
    temperature: 0.7,
    maxMessages: 10,
  })

  // P2.28: Track if queues and providers have been fetched to avoid refetching
  const queuesFetched = useRef(false)
  const providersFetched = useRef(false)

  useEffect(() => {
    fetchPrompts()
    // P2.28: Only fetch if not already fetched
    if (!queuesFetched.current) {
      fetchQueues()
    }
    // Solo cargar proveedores de IA si el usuario es superadmin
    if (!providersFetched.current && isSuperAdmin) {
      fetchAiProviders()
    }
  }, [isSuperAdmin])

  const fetchQueues = async () => {
    try {
      const response = await api.get('/queue')
      setQueues(response.data || [])
      // P2.28: Mark as fetched
      queuesFetched.current = true
    } catch (error: any) {
      devError('Error fetching queues:', error)
      // P1.16: No silent failure - show error to user
      toastError(error)
      setQueues([])
    }
  }

  // Cargar proveedores de IA configurados en /openai/settings
  const fetchAiProviders = async () => {
    try {
      const response = await api.get('/ai/providers')
      // Solo mostrar proveedores activos y conectados
      const activeProviders = (response.data || []).filter(
        (p: AIProvider) => p.isActive && p.connectionStatus === 'connected'
      )
      setAiProviders(activeProviders)
      // P2.28: Mark as fetched
      providersFetched.current = true
    } catch (error: any) {
      devError('Error fetching AI providers:', error)
      // P1.16: No silent failure - show error to user
      toastError(error)
      setAiProviders([])
    }
  }

  const fetchPrompts = async () => {
    try {
      setLoading(true)
      setError(null) // Clear previous errors
      const response = await api.get('/prompt')
      setPrompts(response.data.prompts || response.data)
    } catch (error: any) {
      devError('Error fetching prompts:', error)
      // P1.17: No fallback data - show error state instead
      const errorMessage = error.response?.data?.error || i18n.t("aiModules.prompts.toasts.errorLoading")
      setError(errorMessage)
      toastError(error) // P1.16: Show error to user
      setPrompts([]) // Set empty array instead of fallback data
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      // Usar FormData para soportar carga de archivos
      const formDataToSend = new FormData()
      formDataToSend.append('name', formData.name)
      formDataToSend.append('prompt', formData.prompt)
      formDataToSend.append('queueId', formData.queueId.toString())
      formDataToSend.append('queueIds', JSON.stringify(selectedQueues.map(q => q.id)))
      formDataToSend.append('maxTokens', formData.maxTokens.toString())
      formDataToSend.append('temperature', formData.temperature.toString())
      formDataToSend.append('maxMessages', formData.maxMessages.toString())

      // Agregar archivo si existe
      if (selectedFile) {
        formDataToSend.append('file', selectedFile)
      }

      await api.post('/prompt', formDataToSend, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      // P1.15 & P1.23: Add success notification
      toast.success(i18n.t("aiModules.prompts.toasts.createSuccess"))
      fetchPrompts()
      setOpenModal(false)
      resetForm()
    } catch (error: any) {
      devError('Error creating prompt:', error)
      // P1.15: Add error notification
      toastError(error)
    }
  }

  const handleUpdate = async () => {
    if (!selectedPrompt) return
    try {
      // Usar FormData para soportar carga de archivos
      const formDataToSend = new FormData()
      formDataToSend.append('name', formData.name)
      formDataToSend.append('prompt', formData.prompt)
      formDataToSend.append('queueId', formData.queueId.toString())
      formDataToSend.append('queueIds', JSON.stringify(selectedQueues.map(q => q.id)))
      formDataToSend.append('maxTokens', formData.maxTokens.toString())
      formDataToSend.append('temperature', formData.temperature.toString())
      formDataToSend.append('maxMessages', formData.maxMessages.toString())

      // Agregar archivo si existe
      if (selectedFile) {
        formDataToSend.append('file', selectedFile)
      }

      await api.put(`/prompt/${selectedPrompt.id}`, formDataToSend, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      // P1.15 & P1.23: Add success notification
      toast.success(i18n.t("aiModules.prompts.toasts.updateSuccess"))
      fetchPrompts()
      setOpenModal(false)
      resetForm()
    } catch (error: any) {
      devError('Error updating prompt:', error)
      // P1.15: Add error notification
      toastError(error)
    }
  }

  const handleDelete = async (promptId: number) => {
    // TODO P2: Replace browser confirm with MUI Dialog for consistency
    if (confirm(i18n.t("aiModules.prompts.delete.confirmMessage"))) {
      try {
        await api.delete(`/prompt/${promptId}`)
        // P1.15 & P1.23: Add success notification
        toast.success(i18n.t("aiModules.prompts.toasts.deleteSuccess"))
        fetchPrompts()
      } catch (error: any) {
        devError('Error deleting prompt:', error)
        // P1.15: Add error notification
        toastError(error)
      }
    }
  }

  const handleCopyPrompt = (promptText: string) => {
    navigator.clipboard.writeText(promptText)
  }

  const openEditModal = (prompt: Prompt) => {
    setSelectedPrompt(prompt)
    setFormData({
      name: prompt.name,
      prompt: prompt.prompt,
      queueId: prompt.queueId,
      queueIds: prompt.queues?.map(q => q.id) || [],
      maxTokens: prompt.maxTokens,
      temperature: prompt.temperature,
      maxMessages: prompt.maxMessages,
    })
    // Cargar las queues seleccionadas
    setSelectedQueues(prompt.queues || [])
    setSelectedFile(null) // Limpiar archivo seleccionado
    setOpenModal(true)
  }

  const openCreateModal = () => {
    setSelectedPrompt(null)
    resetForm()
    setOpenModal(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      prompt: '',
      queueId: 0,
      queueIds: [],
      maxTokens: 2000,
      temperature: 0.7,
      maxMessages: 10,
    })
    setSelectedQueues([])
    setSelectedFile(null) // Limpiar archivo seleccionado
  }

  // P2.26: Memoize filteredPrompts to avoid recalculation on every render
  const filteredPrompts = useMemo(() => {
    return prompts.filter((prompt) =>
      prompt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prompt.prompt.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [prompts, searchTerm])

  // P2.27: Memoize stats calculation to avoid recalculation on every render
  const stats = useMemo(() => {
    return {
      total: prompts.length,
      totalTokens: prompts.reduce((sum, p) => sum + p.totalTokens, 0),
      avgTokensPerPrompt: prompts.length > 0
        ? Math.round(prompts.reduce((sum, p) => sum + p.totalTokens, 0) / prompts.length)
        : 0,
      maxTokensPrompt: prompts.length > 0
        ? prompts.reduce((max, p) => (p.totalTokens > max.totalTokens ? p : max))
        : null,
    }
  }, [prompts])

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <PromptsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">{i18n.t("aiModules.prompts.title")}</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                {i18n.t("aiModules.prompts.description")}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <IconButton variant="outlined" color="neutral" onClick={fetchPrompts}>
              <RefreshIcon />
            </IconButton>
            <Button startDecorator={<AddIcon />} color="primary" onClick={openCreateModal}>
              {i18n.t("aiModules.prompts.buttons.new")}
            </Button>
          </Stack>
        </Stack>

        {/* P1.18: Error State Display */}
        {error && (
          <Alert
            color="danger"
            startDecorator={<WarningIcon />}
            endDecorator={
              <IconButton size="sm" variant="plain" color="danger" onClick={() => setError(null)}>
                <DeleteIcon />
              </IconButton>
            }
          >
            {error}
          </Alert>
        )}

        {/* Stats */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  {i18n.t("aiModules.prompts.stats.total")}
                </Typography>
                <Typography level="h2">{stats.total}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  {i18n.t("aiModules.prompts.stats.totalTokens")}
                </Typography>
                <Typography level="h2" sx={{ color: 'primary.main' }}>
                  {stats.totalTokens.toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  {i18n.t("aiModules.prompts.stats.avgTokens")}
                </Typography>
                <Typography level="h2">{stats.avgTokensPerPrompt}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  {i18n.t("aiModules.prompts.stats.mostUsed")}
                </Typography>
                <Typography level="body-sm" fontWeight="bold" noWrap>
                  {stats.maxTokensPrompt?.name || '-'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Search */}
        <Card>
          <CardContent>
            <Input
              placeholder={i18n.t("aiModules.prompts.search.placeholder")}
              startDecorator={<SearchIcon />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </CardContent>
        </Card>

        {/* Prompts Table */}
        <Card>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 180 }}>{i18n.t("aiModules.prompts.table.name")}</th>
                  <th>{i18n.t("aiModules.prompts.table.prompt")}</th>
                  <th style={{ width: 130 }}>{i18n.t("aiModules.prompts.table.provider")}</th>
                  <th style={{ width: 130 }}>{i18n.t("aiModules.prompts.table.queues")}</th>
                  <th style={{ width: 80 }}>{i18n.t("aiModules.prompts.table.maxTokens")}</th>
                  <th style={{ width: 70 }}>{i18n.t("aiModules.prompts.table.temperature")}</th>
                  <th style={{ width: 80 }}>{i18n.t("aiModules.prompts.table.tokens")}</th>
                  <th style={{ width: 60 }}>{i18n.t("aiModules.prompts.table.messages")}</th>
                  <th style={{ width: 130 }}>{i18n.t("aiModules.prompts.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>{i18n.t("aiModules.prompts.table.loading")}</Typography>
                    </td>
                  </tr>
                ) : filteredPrompts.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>{i18n.t("aiModules.prompts.table.empty")}</Typography>
                    </td>
                  </tr>
                ) : (
                  filteredPrompts.map((prompt) => (
                    <tr key={prompt.id}>
                      <td>
                        <Typography level="body-sm" fontWeight="bold">
                          {prompt.name}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-sm" noWrap sx={{ maxWidth: 200 }}>
                          {prompt.prompt}
                        </Typography>
                      </td>
                      {/* Columna Proveedor de IA */}
                      <td>
                        {prompt.aiProviderId ? (
                          <Chip size="sm" variant="soft" color="primary">
                            {aiProviders.find(p => p.id === prompt.aiProviderId)?.name ||
                              aiProviders.find(p => p.id === prompt.aiProviderId)?.provider ||
                              'IA'}
                          </Chip>
                        ) : (
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {i18n.t("aiModules.prompts.table.noProvider")}
                          </Typography>
                        )}
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {prompt.queues && prompt.queues.length > 0 ? (
                            prompt.queues.map((queue) => (
                              <Chip
                                key={queue.id}
                                size="sm"
                                variant="soft"
                                sx={{
                                  backgroundColor: queue.color || undefined,
                                  color: queue.color ? '#fff' : undefined
                                }}
                              >
                                {queue.name}
                              </Chip>
                            ))
                          ) : (
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              {i18n.t("aiModules.prompts.table.noQueues")}
                            </Typography>
                          )}
                        </Stack>
                      </td>
                      <td>
                        <Chip size="sm" variant="soft" color="primary">
                          {prompt.maxTokens}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-sm">{prompt.temperature}</Typography>
                      </td>
                      <td>
                        <Typography level="body-xs">
                          <strong>{prompt.totalTokens.toLocaleString()}</strong>
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-sm">{prompt.maxMessages}</Typography>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="neutral"
                            onClick={() => handleCopyPrompt(prompt.prompt)}
                            title={i18n.t("aiModules.prompts.buttons.copy")}
                          >
                            <CopyIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="primary"
                            onClick={() => openEditModal(prompt)}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={() => handleDelete(prompt.id)}
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
          <ModalDialog sx={{ minWidth: 700, maxWidth: 800 }}>
            <ModalClose />
            <Typography level="h4" sx={{ mb: 2 }}>
              {selectedPrompt ? i18n.t("aiModules.prompts.modal.titleEdit") : i18n.t("aiModules.prompts.modal.titleCreate")}
            </Typography>
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>{i18n.t("aiModules.prompts.modal.nameLabel")}</FormLabel>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={i18n.t("aiModules.prompts.modal.namePlaceholder")}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{i18n.t("aiModules.prompts.modal.promptLabel")}</FormLabel>
                <Textarea
                  value={formData.prompt}
                  onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                  placeholder={i18n.t("aiModules.prompts.modal.promptPlaceholder")}
                  minRows={6}
                  maxRows={12}
                />
              </FormControl>
              <Grid container spacing={2}>
                <Grid xs={6}>
                  <FormControl>
                    <FormLabel>{i18n.t("aiModules.prompts.modal.maxTokensLabel")}</FormLabel>
                    <Input
                      type="number"
                      value={formData.maxTokens}
                      onChange={(e) =>
                        setFormData({ ...formData, maxTokens: parseInt(e.target.value) || 2000 })
                      }
                      slotProps={{
                        input: {
                          min: 100,
                          max: 4000,
                        },
                      }}
                    />
                  </FormControl>
                </Grid>
                <Grid xs={6}>
                  <FormControl>
                    <FormLabel>{i18n.t("aiModules.prompts.modal.temperatureLabel")}</FormLabel>
                    <Input
                      type="number"
                      value={formData.temperature}
                      onChange={(e) =>
                        setFormData({ ...formData, temperature: parseFloat(e.target.value) || 0.7 })
                      }
                      slotProps={{
                        input: {
                          min: 0,
                          max: 1,
                          step: 0.1,
                        },
                      }}
                    />
                  </FormControl>
                </Grid>
              </Grid>
              <Grid container spacing={2}>
                <Grid xs={6}>
                  <FormControl>
                    <FormLabel>{i18n.t("aiModules.prompts.modal.maxMessagesLabel")}</FormLabel>
                    <Input
                      type="number"
                      value={formData.maxMessages}
                      onChange={(e) =>
                        setFormData({ ...formData, maxMessages: parseInt(e.target.value) || 10 })
                      }
                    />
                  </FormControl>
                </Grid>
                <Grid xs={6}>
                  <FormControl>
                    <FormLabel>{i18n.t("aiModules.prompts.modal.queuesLabel")}</FormLabel>
                    <Autocomplete
                      multiple
                      placeholder={i18n.t("aiModules.prompts.modal.queuesPlaceholder")}
                      options={queues}
                      value={selectedQueues}
                      onChange={(_event, newValue) => {
                        setSelectedQueues(newValue)
                        setFormData({
                          ...formData,
                          queueIds: newValue.map(q => q.id)
                        })
                      }}
                      getOptionLabel={(option) => option.name}
                      isOptionEqualToValue={(option, value) => option.id === value.id}
                      renderTags={(tags, getTagProps) =>
                        tags.map((item, index) => (
                          <Chip
                            size="sm"
                            variant="soft"
                            color="primary"
                            sx={{
                              backgroundColor: item.color || undefined,
                              color: item.color ? '#fff' : undefined
                            }}
                            {...getTagProps({ index })}
                            key={item.id}
                          >
                            {item.name}
                          </Chip>
                        ))
                      }
                    />
                  </FormControl>
                </Grid>
              </Grid>
              {/* Sección de carga de archivos */}
              <FormControl>
                <FormLabel>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <AttachFileIcon sx={{ fontSize: 18 }} />
                    <span>{i18n.t("aiModules.prompts.modal.fileUploadLabel") || "Archivo de contexto (opcional)"}</span>
                  </Stack>
                </FormLabel>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".txt,.pdf,.xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      // Validar tipo de archivo
                      const allowedTypes = [
                        'text/plain',
                        'application/pdf',
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        'application/vnd.ms-excel'
                      ]
                      const allowedExtensions = ['.txt', '.pdf', '.xlsx', '.xls']
                      const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))

                      if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
                        toast.error(i18n.t("aiModules.prompts.modal.fileTypeError") || "Solo se permiten archivos .txt, .pdf y .xlsx")
                        return
                      }

                      // Validar tamaño (máx 10MB)
                      if (file.size > 10 * 1024 * 1024) {
                        toast.error(i18n.t("aiModules.prompts.modal.fileSizeError") || "El archivo no puede superar los 10MB")
                        return
                      }

                      setSelectedFile(file)
                    }
                  }}
                />
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Button
                    variant="outlined"
                    color="neutral"
                    startDecorator={<UploadFileIcon />}
                    onClick={() => fileInputRef.current?.click()}
                    size="sm"
                  >
                    {i18n.t("aiModules.prompts.modal.selectFile") || "Seleccionar archivo"}
                  </Button>
                  {selectedFile && (
                    <Chip
                      size="sm"
                      variant="soft"
                      color="primary"
                      endDecorator={
                        <IconButton
                          size="sm"
                          variant="plain"
                          color="neutral"
                          onClick={() => {
                            setSelectedFile(null)
                            if (fileInputRef.current) fileInputRef.current.value = ''
                          }}
                        >
                          <CloseIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      }
                    >
                      {selectedFile.name}
                    </Chip>
                  )}
                </Box>
                <FormHelperText>
                  {i18n.t("aiModules.prompts.modal.fileUploadHelper") || "Sube un archivo .txt, .pdf o .xlsx para usarlo como contexto adicional"}
                </FormHelperText>
              </FormControl>

              {/* COMENTADO: Selector de Proveedor de IA - Ya no se usa
              <FormControl required>
                <FormLabel>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <AIIcon sx={{ fontSize: 18 }} />
                    <span>{i18n.t("aiModules.prompts.modal.aiProviderLabel")}</span>
                  </Stack>
                </FormLabel>
                {aiProviders.length === 0 ? (
                  <Alert color="warning" size="sm">
                    {i18n.t("aiModules.prompts.modal.noProvidersWarning")}
                    <a href="/openai/settings" style={{ marginLeft: 8 }}>{i18n.t("aiModules.prompts.modal.configureNow")}</a>
                  </Alert>
                ) : (
                  <Select
                    value={formData.aiProviderId}
                    onChange={(_, val) => {
                      const provider = aiProviders.find(p => p.id === val)
                      setFormData({
                        ...formData,
                        aiProviderId: val as number,
                        maxTokens: provider?.settings?.defaultMaxTokens || formData.maxTokens,
                        temperature: provider?.settings?.defaultTemperature || formData.temperature,
                      })
                    }}
                    placeholder={i18n.t("aiModules.prompts.modal.providerPlaceholder")}
                  >
                    {aiProviders.map((provider) => (
                      <Option key={provider.id} value={provider.id}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip size="sm" variant="soft" color={provider.isDefault ? 'primary' : 'neutral'}>
                            {provider.provider.toUpperCase()}
                          </Chip>
                          <span>{provider.name}</span>
                        </Stack>
                      </Option>
                    ))}
                  </Select>
                )}
              </FormControl>
              */}

              <Box
                sx={{
                  display: 'flex',
                  gap: 1,
                  flexDirection: 'column',
                  p: 2,
                  bgcolor: 'background.level1',
                  borderRadius: 'sm',
                }}
              >
                <Typography level="body-sm">
                  <strong>{i18n.t("aiModules.prompts.modal.previewTitle")}</strong>
                </Typography>
                <Typography level="body-xs" sx={{ whiteSpace: 'pre-wrap' }}>
                  {formData.prompt || i18n.t("aiModules.prompts.modal.previewEmpty")}
                </Typography>
                {/* Mostrar archivo seleccionado */}
                {selectedFile && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <AttachFileIcon sx={{ fontSize: 14, color: 'primary.main' }} />
                    <Typography level="body-xs" sx={{ color: 'primary.main' }}>
                      {i18n.t("aiModules.prompts.modal.attachedFile") || "Archivo adjunto"}: {selectedFile.name}
                    </Typography>
                  </Stack>
                )}
                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                  {i18n.t("aiModules.prompts.modal.previewSettings", {
                    maxTokens: formData.maxTokens,
                    temperature: formData.temperature,
                    maxMessages: formData.maxMessages
                  })}
                </Typography>
              </Box>
              <Button color="primary" onClick={selectedPrompt ? handleUpdate : handleCreate}>
                {selectedPrompt ? i18n.t("aiModules.prompts.buttons.update") : i18n.t("aiModules.prompts.buttons.create")}
              </Button>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
