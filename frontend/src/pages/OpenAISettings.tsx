import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Input,
  FormControl,
  FormLabel,
  Switch,
  Select,
  Option,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Alert,
  Divider,
  Slider,
  Chip,
  Modal,
  ModalDialog,
  ModalClose,
  CircularProgress,
  IconButton,
  Table,
  Sheet,
} from '@mui/joy'
import {
  Settings as SettingsIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon,
  VpnKey as KeyIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Pending as PendingIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Close as CloseIcon,
  // Iconos para capacidades de IA
  TextFields as TextIcon,
  Translate as TranslateIcon,
  Image as ImageIcon,
  RemoveRedEye as VisionIcon,
  Mic as AudioIcon,
} from '@mui/icons-material'
import api from '../services/api'
import { i18n } from "../translate/i18n" // P3.47: i18n support

interface AIProvider {
  id: number
  provider: string
  displayName: string
  apiKey: string
  isActive: boolean
  isDefault: boolean
  connectionStatus: 'pending' | 'connected' | 'error'
  lastConnectionTest: string | null
  settings: {
    baseUrl?: string
    defaultModel?: string
    defaultTemperature?: number
    defaultMaxTokens?: number
    organization?: string
  }
  availableModels: string[]
  createdAt: string
  updatedAt: string
  // Capacidades de IA
  textGenerationEnabled: boolean
  translationEnabled: boolean
  imageGenerationEnabled: boolean
  imageAnalysisEnabled: boolean
  speechToTextEnabled: boolean
  textToSpeechEnabled: boolean
  // Proveedor por defecto para cada capacidad
  isDefaultForText: boolean
  isDefaultForTranslation: boolean
  isDefaultForImages: boolean
  isDefaultForImageAnalysis: boolean
  isDefaultForSTT: boolean
  isDefaultForTTS: boolean
  // Precios por capacidad
  textGenerationPricing: number
  translationPricing: number
  imageGenerationPricing: { [key: string]: number }
  imageAnalysisPricing: number
  speechToTextPricing: number
}

interface FormData {
  provider: string
  displayName: string
  apiKey: string
  isActive: boolean
  isDefault: boolean
  settings: {
    baseUrl: string
    defaultModel: string
    defaultTemperature: number
    defaultMaxTokens: number
    organization: string
  }
  // Capacidades de IA
  textGenerationEnabled: boolean
  translationEnabled: boolean
  imageGenerationEnabled: boolean
  imageAnalysisEnabled: boolean
  speechToTextEnabled: boolean
  textToSpeechEnabled: boolean
  // Proveedor por defecto para cada capacidad
  isDefaultForText: boolean
  isDefaultForTranslation: boolean
  isDefaultForImages: boolean
  isDefaultForImageAnalysis: boolean
  isDefaultForSTT: boolean
  isDefaultForTTS: boolean
  // Precios por capacidad
  textGenerationPricing: number
  translationPricing: number
  imageGenerationPricing: { [key: string]: number }
  imageAnalysisPricing: number
  speechToTextPricing: number
}

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI', keyPrefix: 'sk-', baseUrl: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic (Claude)', keyPrefix: 'sk-ant-', baseUrl: 'https://api.anthropic.com/v1' },
  { value: 'google', label: 'Google (Gemini)', keyPrefix: 'AIza', baseUrl: 'https://generativelanguage.googleapis.com/v1' },
  { value: 'azure', label: 'Azure OpenAI', keyPrefix: '', baseUrl: '' },
  { value: 'cohere', label: 'Cohere', keyPrefix: '', baseUrl: 'https://api.cohere.ai/v1' },
  { value: 'mistral', label: 'Mistral AI', keyPrefix: '', baseUrl: 'https://api.mistral.ai/v1' },
  { value: 'deepseek', label: 'DeepSeek', keyPrefix: 'sk-', baseUrl: 'https://api.deepseek.com/v1' },
]

// Helper function to mask API keys for display
const maskApiKey = (key: string | undefined): string => {
  if (!key || key.length < 8) return '****';
  return `${key.substring(0, 4)}****${key.substring(key.length - 4)}`;
};

const initialFormData: FormData = {
  provider: 'openai',
  displayName: '',
  apiKey: '',
  isActive: true,
  isDefault: false,
  settings: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    defaultTemperature: 0.7,
    defaultMaxTokens: 2000,
    organization: '',
  },
  // Capacidades de IA por defecto
  textGenerationEnabled: true,
  translationEnabled: false,
  imageGenerationEnabled: false,
  imageAnalysisEnabled: false,
  speechToTextEnabled: false,
  textToSpeechEnabled: false,
  // Proveedor por defecto para cada capacidad
  isDefaultForText: false,
  isDefaultForTranslation: false,
  isDefaultForImages: false,
  isDefaultForImageAnalysis: false,
  isDefaultForSTT: false,
  isDefaultForTTS: false,
  // Precios por defecto
  textGenerationPricing: 2,
  translationPricing: 3,
  imageGenerationPricing: { "1024x1024": 30, "512x512": 20, "256x256": 10 },
  imageAnalysisPricing: 15,
  speechToTextPricing: 10,
}

export default function OpenAISettings() {
  // P3.44: Helper para logging solo en desarrollo
  const isDev = import.meta.env.DEV;
  const devLog = (...args: any[]) => {
    if (isDev) console.log(...args);
  };
  const devError = (...args: any[]) => {
    if (isDev) console.error(...args);
  };

  const [providers, setProviders] = useState<AIProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [openModal, setOpenModal] = useState(false)
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [showApiKey, setShowApiKey] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      devLog('[OpenAISettings] Fetching providers...')
      const response = await api.get('/ai/providers')
      devLog('[OpenAISettings] Providers loaded:', response.data)
      setProviders(response.data)
    } catch (err: any) {
      devError('[OpenAISettings] Error fetching providers:', err)
      setError(err.response?.data?.error || 'Error al cargar proveedores')
    } finally {
      setLoading(false)
    }
  }, []) // 👈 Vacío - devLog y devError no deben ser dependencias

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  const handleCreate = () => {
    setEditingProvider(null)
    setFormData(initialFormData)
    setShowApiKey(false)
    setOpenModal(true)
  }

  const handleEdit = (provider: AIProvider) => {
    devLog('[OpenAISettings] Editing provider:', provider.id)
    setEditingProvider(provider)
    setFormData({
      provider: provider.provider,
      displayName: provider.displayName || (provider as any).name || '',  // Fallback to 'name' if displayName is missing
      apiKey: '', // Never show real API key
      isActive: provider.isActive,
      isDefault: provider.isDefault,
      settings: {
        baseUrl: provider.settings?.baseUrl || '',
        defaultModel: provider.settings?.defaultModel || '',
        defaultTemperature: provider.settings?.defaultTemperature || 0.7,
        defaultMaxTokens: provider.settings?.defaultMaxTokens || 2000,
        organization: provider.settings?.organization || '',
      },
      // Capacidades de IA
      textGenerationEnabled: provider.textGenerationEnabled ?? true,
      translationEnabled: provider.translationEnabled ?? false,
      imageGenerationEnabled: provider.imageGenerationEnabled ?? false,
      imageAnalysisEnabled: provider.imageAnalysisEnabled ?? false,
      speechToTextEnabled: provider.speechToTextEnabled ?? false,
      textToSpeechEnabled: provider.textToSpeechEnabled ?? false,
      // Proveedor por defecto para cada capacidad
      isDefaultForText: provider.isDefaultForText ?? false,
      isDefaultForTranslation: provider.isDefaultForTranslation ?? false,
      isDefaultForImages: provider.isDefaultForImages ?? false,
      isDefaultForImageAnalysis: provider.isDefaultForImageAnalysis ?? false,
      isDefaultForSTT: provider.isDefaultForSTT ?? false,
      isDefaultForTTS: provider.isDefaultForTTS ?? false,
      // Precios por capacidad
      textGenerationPricing: provider.textGenerationPricing ?? 2,
      translationPricing: provider.translationPricing ?? 3,
      imageGenerationPricing: provider.imageGenerationPricing ?? { "1024x1024": 30, "512x512": 20, "256x256": 10 },
      imageAnalysisPricing: provider.imageAnalysisPricing ?? 15,
      speechToTextPricing: provider.speechToTextPricing ?? 10,
    })
    setShowApiKey(false)
    setOpenModal(true)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      // P1.13: Validar display name (required)
      if (!formData.displayName || formData.displayName.trim().length === 0) {
        setError('El nombre para mostrar es requerido')
        setSaving(false)
        return
      }

      if (formData.displayName.length > 100) {
        setError('El nombre para mostrar no puede exceder 100 caracteres')
        setSaving(false)
        return
      }

      // P1.14: Validar base URL (formato válido)
      if (formData.settings.baseUrl && formData.settings.baseUrl.trim().length > 0) {
        try {
          const url = new URL(formData.settings.baseUrl)

          // Opcionalmente, validar que sea HTTPS (comentado para permitir localhost HTTP)
          // if (url.protocol !== 'https:') {
          //   setError('La Base URL debe usar HTTPS para seguridad')
          //   setSaving(false)
          //   return
          // }

          if (!url.protocol.startsWith('http')) {
            setError('La Base URL debe ser una URL HTTP o HTTPS válida')
            setSaving(false)
            return
          }
        } catch (err) {
          setError('La Base URL no es una URL válida')
          setSaving(false)
          return
        }
      }

      // P1.12: Validar precios (min, max, decimales)
      const pricingFields = [
        { value: formData.textGenerationPricing, name: 'Generación de Texto' },
        { value: formData.translationPricing, name: 'Traducción' },
        { value: formData.imageAnalysisPricing, name: 'Análisis de Imagen' },
        { value: formData.speechToTextPricing, name: 'Speech to Text' }
      ]

      for (const field of pricingFields) {
        if (field.value !== undefined && field.value !== null) {
          const priceNum = Number(field.value)

          if (isNaN(priceNum)) {
            setError(`${field.name}: El precio debe ser un número válido`)
            setSaving(false)
            return
          }

          if (priceNum < 0) {
            setError(`${field.name}: El precio no puede ser negativo`)
            setSaving(false)
            return
          }

          if (priceNum > 1000000) {
            setError(`${field.name}: El precio no puede exceder 1,000,000`)
            setSaving(false)
            return
          }

          // Validar máximo 4 decimales
          if (!Number.isInteger(priceNum * 10000)) {
            setError(`${field.name}: El precio solo puede tener hasta 4 decimales`)
            setSaving(false)
            return
          }
        }
      }

      // Validar image generation pricing (es un objeto)
      if (formData.imageGenerationPricing) {
        for (const [size, price] of Object.entries(formData.imageGenerationPricing)) {
          const priceNum = Number(price)

          if (isNaN(priceNum)) {
            setError(`Generación de Imagen (${size}): El precio debe ser un número válido`)
            setSaving(false)
            return
          }

          if (priceNum < 0) {
            setError(`Generación de Imagen (${size}): El precio no puede ser negativo`)
            setSaving(false)
            return
          }

          if (priceNum > 1000000) {
            setError(`Generación de Imagen (${size}): El precio no puede exceder 1,000,000`)
            setSaving(false)
            return
          }

          if (!Number.isInteger(priceNum * 10000)) {
            setError(`Generación de Imagen (${size}): El precio solo puede tener hasta 4 decimales`)
            setSaving(false)
            return
          }
        }
      }

      // Map displayName to name for backend compatibility
      const payload = {
        ...formData,
        name: formData.displayName, // Backend expects 'name', frontend uses 'displayName'
        // Only include apiKey if it was changed (not empty)
        ...(formData.apiKey ? { apiKey: formData.apiKey } : {}),
      }

      if (editingProvider) {
        devLog('[OpenAISettings] Updating provider:', editingProvider.id)
        await api.put(`/ai/providers/${editingProvider.id}`, payload)
        setSuccess(i18n.t("aiModules.openaiSettings.toasts.updateSuccess"))
      } else {
        devLog('[OpenAISettings] Creating new provider')
        await api.post('/ai/providers', payload)
        setSuccess(i18n.t("aiModules.openaiSettings.toasts.createSuccess"))
      }

      setOpenModal(false)
      fetchProviders()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      devError('[OpenAISettings] Error saving provider:', err)
      setError(err.response?.data?.error || i18n.t("aiModules.openaiSettings.toasts.errorSaving"))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      devLog('[OpenAISettings] Deleting provider:', id)
      await api.delete(`/ai/providers/${id}`)
      setSuccess(i18n.t("aiModules.openaiSettings.toasts.deleteSuccess"))
      setDeleteConfirm(null)
      fetchProviders()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      devError('[OpenAISettings] Error deleting provider:', err)
      setError(err.response?.data?.error || i18n.t("aiModules.openaiSettings.toasts.errorDeleting"))
    }
  }

  const handleTestConnection = async (id: number) => {
    try {
      setTesting(id)
      devLog('[OpenAISettings] Testing connection for provider:', id)
      const response = await api.post(`/ai/providers/${id}/test`)
      devLog('[OpenAISettings] Test result:', response.data)

      if (response.data.success) {
        setSuccess(i18n.t("aiModules.openaiSettings.toasts.testSuccess", { model: response.data.model || 'API' }))
      } else {
        setError(i18n.t("aiModules.openaiSettings.toasts.testError", { error: response.data.error }))
      }
      fetchProviders()
      setTimeout(() => { setSuccess(null); setError(null) }, 5000)
    } catch (err: any) {
      devError('[OpenAISettings] Error testing connection:', err)
      setError(err.response?.data?.error || i18n.t("aiModules.openaiSettings.toasts.errorTesting"))
    } finally {
      setTesting(null)
    }
  }

  const handleProviderChange = (provider: string) => {
    const providerConfig = PROVIDER_OPTIONS.find(p => p.value === provider)
    setFormData({
      ...formData,
      provider,
      displayName: formData.displayName || providerConfig?.label || provider,
      settings: {
        ...formData.settings,
        baseUrl: providerConfig?.baseUrl || '',
      },
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckIcon color="success" />
      case 'error':
        return <ErrorIcon color="error" />
      default:
        return <PendingIcon color="warning" />
    }
  }

  const getStatusColor = (status: string): 'success' | 'danger' | 'warning' => {
    switch (status) {
      case 'connected':
        return 'success'
      case 'error':
        return 'danger'
      default:
        return 'warning'
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress size="lg" />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <SettingsIcon sx={{ fontSize: 32 }} />
            {i18n.t("aiModules.openaiSettings.title")}
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            {i18n.t("aiModules.openaiSettings.description")}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startDecorator={<RefreshIcon />} onClick={fetchProviders}>
            {i18n.t("aiModules.openaiSettings.buttons.reload")}
          </Button>
          <Button startDecorator={<AddIcon />} onClick={handleCreate}>
            {i18n.t("aiModules.openaiSettings.buttons.addProvider")}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert
          color="danger"
          sx={{ mb: 2 }}
          endDecorator={
            <IconButton variant="soft" color="danger" onClick={() => setError(null)}>
              <CloseIcon />
            </IconButton>
          }
        >
          {error}
        </Alert>
      )}

      {success && (
        <Alert
          color="success"
          sx={{ mb: 2 }}
          endDecorator={
            <IconButton variant="soft" color="success" onClick={() => setSuccess(null)}>
              <CloseIcon />
            </IconButton>
          }
        >
          {success}
        </Alert>
      )}

      {/* Resumen de Proveedores */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                {i18n.t("aiModules.openaiSettings.stats.configured")}
              </Typography>
              <Typography level="h3">{providers.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                {i18n.t("aiModules.openaiSettings.stats.active")}
              </Typography>
              <Typography level="h3">{providers.filter(p => p.isActive).length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                {i18n.t("aiModules.openaiSettings.stats.connected")}
              </Typography>
              <Typography level="h3" sx={{ color: 'success.500' }}>
                {providers.filter(p => p.connectionStatus === 'connected').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                {i18n.t("aiModules.openaiSettings.stats.errors")}
              </Typography>
              <Typography level="h3" sx={{ color: 'danger.500' }}>
                {providers.filter(p => p.connectionStatus === 'error').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Lista de Proveedores */}
      <Card>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <KeyIcon />
            {i18n.t("aiModules.openaiSettings.table.title")}
          </Typography>

          <Alert color="warning" sx={{ mb: 3 }}>
            {i18n.t("aiModules.openaiSettings.security.warning")}
          </Alert>

          {providers.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 2 }}>
                {i18n.t("aiModules.openaiSettings.table.empty")}
              </Typography>
              <Button startDecorator={<AddIcon />} onClick={handleCreate}>
                {i18n.t("aiModules.openaiSettings.buttons.createFirst")}
              </Button>
            </Box>
          ) : (
            <Sheet sx={{ overflow: 'auto' }}>
              <Table>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>{i18n.t("aiModules.openaiSettings.table.status")}</th>
                    <th style={{ width: 150 }}>{i18n.t("aiModules.openaiSettings.table.provider")}</th>
                    <th style={{ width: 200 }}>{i18n.t("aiModules.openaiSettings.table.name")}</th>
                    <th style={{ width: 200 }}>{i18n.t("aiModules.openaiSettings.table.apiKey")}</th>
                    <th style={{ width: 100 }}>{i18n.t("aiModules.openaiSettings.table.active")}</th>
                    <th style={{ width: 100 }}>{i18n.t("aiModules.openaiSettings.table.default")}</th>
                    <th style={{ width: 150 }}>{i18n.t("aiModules.openaiSettings.table.defaultModel")}</th>
                    <th style={{ width: 200 }}>{i18n.t("aiModules.openaiSettings.table.capabilities")}</th>
                    <th style={{ width: 180, textAlign: 'center' }}>{i18n.t("aiModules.openaiSettings.table.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map((provider) => (
                    <tr key={provider.id}>
                      <td>
                        <Chip
                          size="sm"
                          color={getStatusColor(provider.connectionStatus)}
                          startDecorator={getStatusIcon(provider.connectionStatus)}
                        >
                          {provider.connectionStatus === 'connected' ? 'OK' :
                           provider.connectionStatus === 'error' ? i18n.t("aiModules.openaiSettings.status.error") : i18n.t("aiModules.openaiSettings.status.pending")}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-sm" fontWeight="lg">
                          {PROVIDER_OPTIONS.find(p => p.value === provider.provider)?.label || provider.provider}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-sm">{provider.displayName}</Typography>
                      </td>
                      <td>
                        <Typography level="body-sm" sx={{ fontFamily: 'monospace' }}>
                          {maskApiKey(provider.apiKey)}
                        </Typography>
                      </td>
                      <td>
                        <Chip size="sm" color={provider.isActive ? 'success' : 'neutral'}>
                          {provider.isActive ? i18n.t("aiModules.openaiSettings.common.yes") : i18n.t("aiModules.openaiSettings.common.no")}
                        </Chip>
                      </td>
                      <td>
                        <Chip size="sm" color={provider.isDefault ? 'primary' : 'neutral'}>
                          {provider.isDefault ? i18n.t("aiModules.openaiSettings.common.yes") : i18n.t("aiModules.openaiSettings.common.no")}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-xs">
                          {provider.settings?.defaultModel || '-'}
                        </Typography>
                      </td>
                      <td>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {provider.textGenerationEnabled && <Chip size="sm" color="primary" startDecorator={<TextIcon sx={{ fontSize: 12 }} />}>{i18n.t("aiModules.openaiSettings.capabilities.text")}</Chip>}
                          {provider.translationEnabled && <Chip size="sm" color="success" startDecorator={<TranslateIcon sx={{ fontSize: 12 }} />}>{i18n.t("aiModules.openaiSettings.capabilities.translation")}</Chip>}
                          {provider.imageGenerationEnabled && <Chip size="sm" color="warning" startDecorator={<ImageIcon sx={{ fontSize: 12 }} />}>{i18n.t("aiModules.openaiSettings.capabilities.image")}</Chip>}
                          {provider.imageAnalysisEnabled && <Chip size="sm" color="neutral" startDecorator={<VisionIcon sx={{ fontSize: 12 }} />}>{i18n.t("aiModules.openaiSettings.capabilities.vision")}</Chip>}
                          {provider.speechToTextEnabled && <Chip size="sm" color="danger" startDecorator={<AudioIcon sx={{ fontSize: 12 }} />}>{i18n.t("aiModules.openaiSettings.capabilities.stt")}</Chip>}
                        </Box>
                      </td>
                      <td>
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          <Button
                            size="sm"
                            variant="outlined"
                            loading={testing === provider.id}
                            onClick={() => handleTestConnection(provider.id)}
                          >
                            {i18n.t("aiModules.openaiSettings.common.test")}
                          </Button>
                          <IconButton size="sm" variant="outlined" onClick={() => handleEdit(provider)}>
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="outlined"
                            color="danger"
                            onClick={() => setDeleteConfirm(provider.id)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Sheet>
          )}
        </CardContent>
      </Card>

      {/* Modal Crear/Editar */}
      <Modal open={openModal} onClose={() => setOpenModal(false)}>
        <ModalDialog sx={{ minWidth: 600, maxWidth: 800, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2, flexShrink: 0 }}>
            {editingProvider ? i18n.t("aiModules.openaiSettings.modal.titleEdit") : i18n.t("aiModules.openaiSettings.modal.titleCreate")}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'auto', pr: 1 }}>
            <Grid container spacing={2}>
              <Grid xs={12} md={6}>
                <FormControl required>
                  <FormLabel>{i18n.t("aiModules.openaiSettings.modal.providerLabel")}</FormLabel>
                  <Select
                    value={formData.provider}
                    onChange={(_, val) => handleProviderChange(val as string)}
                    disabled={!!editingProvider}
                  >
                    {PROVIDER_OPTIONS.map((option) => (
                      <Option key={option.value} value={option.value}>
                        {option.label}
                      </Option>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid xs={12} md={6}>
                <FormControl required>
                  <FormLabel>{i18n.t("aiModules.openaiSettings.modal.displayNameLabel")}</FormLabel>
                  <Input
                    placeholder={i18n.t("aiModules.openaiSettings.modal.displayNamePlaceholder")}
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  />
                </FormControl>
              </Grid>
            </Grid>

            <FormControl required={!editingProvider}>
              <FormLabel>
                {i18n.t("aiModules.openaiSettings.modal.apiKeyLabel")}
                {editingProvider && (
                  <Typography level="body-xs" sx={{ color: 'text.tertiary', ml: 1 }}>
                    (Dejar vacío para mantener actual: {editingProvider.apiKey})
                  </Typography>
                )}
              </FormLabel>
              <Input
                type={showApiKey ? 'text' : 'password'}
                placeholder={
                  editingProvider
                    ? `Actual: ${editingProvider.apiKey} (dejar vacío para mantener)`
                    : PROVIDER_OPTIONS.find(p => p.value === formData.provider)?.keyPrefix + '...' || i18n.t("aiModules.openaiSettings.modal.apiKeyPlaceholder")
                }
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                endDecorator={
                  <IconButton onClick={() => setShowApiKey(!showApiKey)}>
                    {showApiKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                }
              />
            </FormControl>

            <FormControl>
              <FormLabel>{i18n.t("aiModules.openaiSettings.modal.baseUrlLabel")}</FormLabel>
              <Input
                placeholder={i18n.t("aiModules.openaiSettings.modal.baseUrlPlaceholder")}
                value={formData.settings.baseUrl}
                onChange={(e) => setFormData({
                  ...formData,
                  settings: { ...formData.settings, baseUrl: e.target.value }
                })}
              />
            </FormControl>

            <Divider />
            <Typography level="title-sm">{i18n.t("aiModules.openaiSettings.modal.settingsTitle")}</Typography>

            <Grid container spacing={2}>
              <Grid xs={12} md={6}>
                <FormControl>
                  <FormLabel>{i18n.t("aiModules.openaiSettings.modal.defaultModelLabel")}</FormLabel>
                  <Input
                    placeholder={i18n.t("aiModules.openaiSettings.modal.defaultModelPlaceholder")}
                    value={formData.settings.defaultModel}
                    onChange={(e) => setFormData({
                      ...formData,
                      settings: { ...formData.settings, defaultModel: e.target.value }
                    })}
                  />
                </FormControl>
              </Grid>
              <Grid xs={12} md={6}>
                <FormControl>
                  <FormLabel>{i18n.t("aiModules.openaiSettings.modal.maxTokensLabel")}</FormLabel>
                  <Input
                    type="number"
                    value={formData.settings.defaultMaxTokens}
                    onChange={(e) => setFormData({
                      ...formData,
                      settings: { ...formData.settings, defaultMaxTokens: parseInt(e.target.value) || 2000 }
                    })}
                  />
                </FormControl>
              </Grid>
            </Grid>

            <FormControl>
              <FormLabel>{i18n.t("aiModules.openaiSettings.modal.temperatureLabel")}: {formData.settings.defaultTemperature}</FormLabel>
              <Slider
                value={formData.settings.defaultTemperature}
                onChange={(_, value) => setFormData({
                  ...formData,
                  settings: { ...formData.settings, defaultTemperature: value as number }
                })}
                min={0}
                max={2}
                step={0.1}
                marks={[
                  { value: 0, label: '0' },
                  { value: 1, label: '1' },
                  { value: 2, label: '2' },
                ]}
              />
            </FormControl>

            {formData.provider === 'openai' && (
              <FormControl>
                <FormLabel>{i18n.t("aiModules.openaiSettings.modal.organizationLabel")}</FormLabel>
                <Input
                  placeholder={i18n.t("aiModules.openaiSettings.modal.organizationPlaceholder")}
                  value={formData.settings.organization}
                  onChange={(e) => setFormData({
                    ...formData,
                    settings: { ...formData.settings, organization: e.target.value }
                  })}
                />
              </FormControl>
            )}

            <Divider />

            <Grid container spacing={2}>
              <Grid xs={6}>
                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FormLabel>{i18n.t("aiModules.openaiSettings.modal.activeLabel")}</FormLabel>
                    <Switch
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    />
                  </Box>
                </FormControl>
              </Grid>
              <Grid xs={6}>
                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FormLabel>{i18n.t("aiModules.openaiSettings.modal.defaultLabel")}</FormLabel>
                    <Switch
                      checked={formData.isDefault}
                      onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                    />
                  </Box>
                </FormControl>
              </Grid>
            </Grid>

            <Divider />
            <Typography level="title-sm">{i18n.t("aiModules.openaiSettings.modal.capabilitiesTitle")}</Typography>
            <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 1 }}>
              {i18n.t("aiModules.openaiSettings.modal.capabilitiesDescription")}
            </Typography>

            <Grid container spacing={2}>
              {/* Generacion de Texto */}
              <Grid xs={12} md={6}>
                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <FormLabel>{i18n.t("aiModules.openaiSettings.modal.textGenerationLabel")}</FormLabel>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {i18n.t("aiModules.openaiSettings.modal.textGenerationDescription")}
                      </Typography>
                    </Box>
                    <Switch
                      checked={formData.textGenerationEnabled}
                      onChange={(e) => setFormData({
                        ...formData,
                        textGenerationEnabled: e.target.checked,
                        isDefaultForText: e.target.checked ? formData.isDefaultForText : false
                      })}
                    />
                  </Box>
                  {formData.textGenerationEnabled && (
                    <Box sx={{ mt: 1, pl: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Switch
                        size="sm"
                        checked={formData.isDefaultForText}
                        onChange={(e) => setFormData({ ...formData, isDefaultForText: e.target.checked })}
                      />
                      <Typography level="body-xs" sx={{ color: 'primary.500' }}>
                        Usar como predeterminado para texto
                      </Typography>
                    </Box>
                  )}
                </FormControl>
              </Grid>

              {/* Traduccion */}
              <Grid xs={12} md={6}>
                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <FormLabel>{i18n.t("aiModules.openaiSettings.modal.translationLabel")}</FormLabel>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {i18n.t("aiModules.openaiSettings.modal.translationDescription")}
                      </Typography>
                    </Box>
                    <Switch
                      checked={formData.translationEnabled}
                      onChange={(e) => setFormData({
                        ...formData,
                        translationEnabled: e.target.checked,
                        isDefaultForTranslation: e.target.checked ? formData.isDefaultForTranslation : false
                      })}
                    />
                  </Box>
                  {formData.translationEnabled && (
                    <Box sx={{ mt: 1, pl: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Switch
                        size="sm"
                        checked={formData.isDefaultForTranslation}
                        onChange={(e) => setFormData({ ...formData, isDefaultForTranslation: e.target.checked })}
                      />
                      <Typography level="body-xs" sx={{ color: 'primary.500' }}>
                        Usar como predeterminado para traduccion
                      </Typography>
                    </Box>
                  )}
                </FormControl>
              </Grid>

              {/* Generacion de Imagenes */}
              <Grid xs={12} md={6}>
                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <FormLabel>{i18n.t("aiModules.openaiSettings.modal.imageGenerationLabel")}</FormLabel>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {i18n.t("aiModules.openaiSettings.modal.imageGenerationDescription")}
                      </Typography>
                    </Box>
                    <Switch
                      checked={formData.imageGenerationEnabled}
                      onChange={(e) => setFormData({
                        ...formData,
                        imageGenerationEnabled: e.target.checked,
                        isDefaultForImages: e.target.checked ? formData.isDefaultForImages : false
                      })}
                    />
                  </Box>
                  {formData.imageGenerationEnabled && (
                    <Box sx={{ mt: 1, pl: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Switch
                        size="sm"
                        checked={formData.isDefaultForImages}
                        onChange={(e) => setFormData({ ...formData, isDefaultForImages: e.target.checked })}
                      />
                      <Typography level="body-xs" sx={{ color: 'primary.500' }}>
                        Usar como predeterminado para imagenes
                      </Typography>
                    </Box>
                  )}
                </FormControl>
              </Grid>

              {/* Analisis de Imagenes (Vision) */}
              <Grid xs={12} md={6}>
                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <FormLabel>{i18n.t("aiModules.openaiSettings.modal.imageAnalysisLabel")}</FormLabel>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {i18n.t("aiModules.openaiSettings.modal.imageAnalysisDescription")}
                      </Typography>
                    </Box>
                    <Switch
                      checked={formData.imageAnalysisEnabled}
                      onChange={(e) => setFormData({
                        ...formData,
                        imageAnalysisEnabled: e.target.checked,
                        isDefaultForImageAnalysis: e.target.checked ? formData.isDefaultForImageAnalysis : false
                      })}
                    />
                  </Box>
                  {formData.imageAnalysisEnabled && (
                    <Box sx={{ mt: 1, pl: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Switch
                        size="sm"
                        checked={formData.isDefaultForImageAnalysis}
                        onChange={(e) => setFormData({ ...formData, isDefaultForImageAnalysis: e.target.checked })}
                      />
                      <Typography level="body-xs" sx={{ color: 'primary.500' }}>
                        Usar como predeterminado para Vision AI
                      </Typography>
                    </Box>
                  )}
                </FormControl>
              </Grid>

              {/* Speech to Text */}
              <Grid xs={12} md={6}>
                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <FormLabel>{i18n.t("aiModules.openaiSettings.modal.speechToTextLabel")}</FormLabel>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {i18n.t("aiModules.openaiSettings.modal.speechToTextDescription")}
                      </Typography>
                    </Box>
                    <Switch
                      checked={formData.speechToTextEnabled}
                      onChange={(e) => setFormData({
                        ...formData,
                        speechToTextEnabled: e.target.checked,
                        isDefaultForSTT: e.target.checked ? formData.isDefaultForSTT : false
                      })}
                    />
                  </Box>
                  {formData.speechToTextEnabled && (
                    <Box sx={{ mt: 1, pl: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Switch
                        size="sm"
                        checked={formData.isDefaultForSTT}
                        onChange={(e) => setFormData({ ...formData, isDefaultForSTT: e.target.checked })}
                      />
                      <Typography level="body-xs" sx={{ color: 'primary.500' }}>
                        Usar como predeterminado para STT
                      </Typography>
                    </Box>
                  )}
                </FormControl>
              </Grid>

              {/* Text to Speech */}
              <Grid xs={12} md={6}>
                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <FormLabel>Text to Speech (TTS)</FormLabel>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        Convertir texto a voz
                      </Typography>
                    </Box>
                    <Switch
                      checked={formData.textToSpeechEnabled}
                      onChange={(e) => setFormData({
                        ...formData,
                        textToSpeechEnabled: e.target.checked,
                        isDefaultForTTS: e.target.checked ? formData.isDefaultForTTS : false
                      })}
                    />
                  </Box>
                  {formData.textToSpeechEnabled && (
                    <Box sx={{ mt: 1, pl: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Switch
                        size="sm"
                        checked={formData.isDefaultForTTS}
                        onChange={(e) => setFormData({ ...formData, isDefaultForTTS: e.target.checked })}
                      />
                      <Typography level="body-xs" sx={{ color: 'primary.500' }}>
                        Usar como predeterminado para TTS
                      </Typography>
                    </Box>
                  )}
                </FormControl>
              </Grid>
            </Grid>

            {/* Seccion de Precios - Solo se muestra si hay al menos una capacidad habilitada */}
            {(formData.textGenerationEnabled || formData.translationEnabled || formData.imageGenerationEnabled || formData.imageAnalysisEnabled || formData.speechToTextEnabled) && (
              <>
                <Divider />
                <Typography level="title-sm">{i18n.t("aiModules.openaiSettings.modal.pricingTitle")}</Typography>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 1 }}>
                  {i18n.t("aiModules.openaiSettings.modal.pricingDescription")}
                </Typography>

                <Grid container spacing={2}>
                  {/* Precio Texto - solo si textGenerationEnabled */}
                  {formData.textGenerationEnabled && (
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>{i18n.t("aiModules.openaiSettings.modal.pricingTextLabel")}</FormLabel>
                        <Input
                          type="number"
                          value={formData.textGenerationPricing}
                          onChange={(e) => setFormData({ ...formData, textGenerationPricing: parseFloat(e.target.value) || 0 })}
                          slotProps={{ input: { min: 0, step: 0.01 } }}
                        />
                      </FormControl>
                    </Grid>
                  )}

                  {/* Precio Traduccion - solo si translationEnabled */}
                  {formData.translationEnabled && (
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>{i18n.t("aiModules.openaiSettings.modal.pricingTranslationLabel")}</FormLabel>
                        <Input
                          type="number"
                          value={formData.translationPricing}
                          onChange={(e) => setFormData({ ...formData, translationPricing: parseFloat(e.target.value) || 0 })}
                          slotProps={{ input: { min: 0, step: 0.01 } }}
                        />
                      </FormControl>
                    </Grid>
                  )}

                  {/* Precios Imagenes - solo si imageGenerationEnabled */}
                  {formData.imageGenerationEnabled && (
                    <>
                      <Grid xs={12}>
                        <Typography level="body-sm" fontWeight="lg">{i18n.t("aiModules.openaiSettings.modal.pricingImageGenerationLabel")}</Typography>
                      </Grid>
                      <Grid xs={12} md={4}>
                        <FormControl>
                          <FormLabel>1024x1024</FormLabel>
                          <Input
                            type="number"
                            value={formData.imageGenerationPricing['1024x1024'] || 30}
                            onChange={(e) => setFormData({
                              ...formData,
                              imageGenerationPricing: { ...formData.imageGenerationPricing, '1024x1024': parseInt(e.target.value) || 0 }
                            })}
                            slotProps={{ input: { min: 0 } }}
                          />
                        </FormControl>
                      </Grid>
                      <Grid xs={12} md={4}>
                        <FormControl>
                          <FormLabel>512x512</FormLabel>
                          <Input
                            type="number"
                            value={formData.imageGenerationPricing['512x512'] || 20}
                            onChange={(e) => setFormData({
                              ...formData,
                              imageGenerationPricing: { ...formData.imageGenerationPricing, '512x512': parseInt(e.target.value) || 0 }
                            })}
                            slotProps={{ input: { min: 0 } }}
                          />
                        </FormControl>
                      </Grid>
                      <Grid xs={12} md={4}>
                        <FormControl>
                          <FormLabel>256x256</FormLabel>
                          <Input
                            type="number"
                            value={formData.imageGenerationPricing['256x256'] || 10}
                            onChange={(e) => setFormData({
                              ...formData,
                              imageGenerationPricing: { ...formData.imageGenerationPricing, '256x256': parseInt(e.target.value) || 0 }
                            })}
                            slotProps={{ input: { min: 0 } }}
                          />
                        </FormControl>
                      </Grid>
                    </>
                  )}

                  {/* Precio Vision - solo si imageAnalysisEnabled */}
                  {formData.imageAnalysisEnabled && (
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>{i18n.t("aiModules.openaiSettings.modal.pricingImageAnalysisLabel")}</FormLabel>
                        <Input
                          type="number"
                          value={formData.imageAnalysisPricing}
                          onChange={(e) => setFormData({ ...formData, imageAnalysisPricing: parseFloat(e.target.value) || 0 })}
                          slotProps={{ input: { min: 0, step: 0.01 } }}
                        />
                      </FormControl>
                    </Grid>
                  )}

                  {/* Precio STT - solo si speechToTextEnabled */}
                  {formData.speechToTextEnabled && (
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>{i18n.t("aiModules.openaiSettings.modal.pricingSpeechToTextLabel")}</FormLabel>
                        <Input
                          type="number"
                          value={formData.speechToTextPricing}
                          onChange={(e) => setFormData({ ...formData, speechToTextPricing: parseFloat(e.target.value) || 0 })}
                          slotProps={{ input: { min: 0, step: 0.01 } }}
                        />
                      </FormControl>
                    </Grid>
                  )}
                </Grid>
              </>
            )}

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
              <Button variant="outlined" onClick={() => setOpenModal(false)}>
                {i18n.t("aiModules.openaiSettings.buttons.cancel")}
              </Button>
              <Button
                startDecorator={<SaveIcon />}
                onClick={handleSave}
                loading={saving}
              >
                {editingProvider ? i18n.t("aiModules.openaiSettings.buttons.save") : i18n.t("aiModules.openaiSettings.buttons.create")}
              </Button>
            </Box>
          </Box>
        </ModalDialog>
      </Modal>

      {/* Modal Confirmar Eliminacion */}
      <Modal open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)}>
        <ModalDialog>
          <Typography level="h4" sx={{ mb: 2 }}>
            {i18n.t("aiModules.openaiSettings.delete.title")}
          </Typography>
          <Typography level="body-md" sx={{ mb: 3 }}>
            {i18n.t("aiModules.openaiSettings.delete.message")}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button variant="outlined" onClick={() => setDeleteConfirm(null)}>
              {i18n.t("aiModules.openaiSettings.buttons.cancel")}
            </Button>
            <Button
              color="danger"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              {i18n.t("aiModules.openaiSettings.buttons.delete")}
            </Button>
          </Box>
        </ModalDialog>
      </Modal>
    </Box>
  )
}
