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
  Alert,
  Divider,
  Chip,
  Modal,
  ModalDialog,
  ModalClose,
  CircularProgress,
  IconButton,
  Table,
  Sheet,
  Textarea,
} from '@mui/joy'
import {
  Inventory as SubplanIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Save as SaveIcon,
  Token as TokenIcon,
  AttachMoney as MoneyIcon,
  Public as PublicIcon,
  Close as CloseIcon,
} from '@mui/icons-material'
import api from '../services/api'
import { AxiosResponse } from 'axios'
import { i18n } from "../translate/i18n" // P3.47: i18n support

// P3.44: Helper for development-only logging
const isDev = import.meta.env.DEV;
const devLog = (...args: any[]) => {
  if (isDev) console.log(...args);
};
const devError = (...args: any[]) => {
  if (isDev) console.error(...args);
};

// COMENTADO: Subplanes ya no están ligados a un proveedor específico
// interface AIProviderConfig {
//   id: number
//   name: string
//   provider: string
//   textGenerationEnabled: boolean
//   translationEnabled: boolean
//   imageGenerationEnabled: boolean
//   imageAnalysisEnabled: boolean
//   speechToTextEnabled: boolean
//   textGenerationPricing: number
//   translationPricing: number
//   imageGenerationPricing: { [key: string]: number }
//   imageAnalysisPricing: number
//   speechToTextPricing: number
// }

interface AISubplan {
  id: number
  companyId: number
  // COMENTADO: aiProviderConfigId: number
  name: string
  description: string
  tokens: number
  priceUsd: number
  tokensConsumed: number  // Tokens consumidos del subplan
  isActive: boolean
  isPublic: boolean
  stripeProductId?: string
  stripePriceId?: string
  createdAt: string
  updatedAt: string
  // COMENTADO: aiProviderConfig?: AIProviderConfig
}

interface FormData {
  // COMENTADO: aiProviderConfigId: number | ''
  name: string
  description: string
  tokens: number
  priceUsd: number
  isActive: boolean
  isPublic: boolean
}

const initialFormData: FormData = {
  // COMENTADO: aiProviderConfigId: '',
  name: '',
  description: '',
  tokens: 10000,
  priceUsd: 5,
  isActive: true,
  isPublic: false,
}

export default function AISubplans() {
  const [subplans, setSubplans] = useState<AISubplan[]>([])
  // COMENTADO: Ya no se cargan proveedores
  // const [providers, setProviders] = useState<AIProviderConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false) // P1.19: Loading state for delete
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // P2.25: Pagination state
  const [pageNumber, setPageNumber] = useState(1)
  const [pageSize] = useState(20)
  const [totalPages, setTotalPages] = useState(1)
  const [totalSubplans, setTotalSubplans] = useState(0)

  const [openModal, setOpenModal] = useState(false)
  const [editingSubplan, setEditingSubplan] = useState<AISubplan | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      devLog('[AISubplans] Fetching data...')

      // P2.25: Solo cargar subplanes con paginación
      const subplansRes = await api.get('/ai/subplans', {
        params: { pageNumber, pageSize }
      })
      // COMENTADO: const providersRes = await api.get('/ai/providers')

      // P2.25: Handle paginated response
      if (subplansRes.data.data) {
        devLog('[AISubplans] Subplans loaded:', subplansRes.data.data.length, 'of', subplansRes.data.pagination.total)
        setSubplans(subplansRes.data.data)
        setTotalPages(subplansRes.data.pagination.totalPages)
        setTotalSubplans(subplansRes.data.pagination.total)
      } else {
        // Fallback for non-paginated response
        devLog('[AISubplans] Subplans loaded (no pagination):', subplansRes.data.length)
        setSubplans(subplansRes.data)
      }
      // COMENTADO: setProviders(providersRes.data)
    } catch (err: any) {
      devError('[AISubplans] Error fetching data:', err)
      setError(err.response?.data?.error || i18n.t("aiModules.subplans.toasts.errorLoading"))
    } finally {
      setLoading(false)
    }
  }, [pageNumber, pageSize])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleCreate = () => {
    setEditingSubplan(null)
    setFormData(initialFormData)
    setOpenModal(true)
  }

  const handleEdit = (subplan: AISubplan) => {
    devLog('[AISubplans] Editing subplan:', subplan.id)
    setEditingSubplan(subplan)
    setFormData({
      // COMENTADO: aiProviderConfigId: subplan.aiProviderConfigId,
      name: subplan.name,
      description: subplan.description || '',
      tokens: subplan.tokens,
      priceUsd: subplan.priceUsd,
      isActive: subplan.isActive,
      isPublic: subplan.isPublic,
    })
    setOpenModal(true)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      // Validación comprehensiva
      // 1. Validar nombre
      if (!formData.name || formData.name.trim().length === 0) {
        setError(i18n.t("aiModules.subplans.validation.nameRequired"))
        setSaving(false)
        return
      }

      if (formData.name.length > 100) {
        setError(i18n.t("aiModules.subplans.validation.nameLength"))
        setSaving(false)
        return
      }

      // 2. Validar descripción (opcional pero con límite)
      if (formData.description && formData.description.length > 500) {
        setError(i18n.t("aiModules.subplans.validation.descriptionLength"))
        setSaving(false)
        return
      }

      // 3. Validar tokens
      if (!formData.tokens && formData.tokens !== 0) {
        setError(i18n.t("aiModules.subplans.validation.tokensRequired"))
        setSaving(false)
        return
      }

      const tokensNum = Number(formData.tokens)
      if (isNaN(tokensNum) || !Number.isInteger(tokensNum)) {
        setError(i18n.t("aiModules.subplans.validation.tokensInvalid"))
        setSaving(false)
        return
      }

      if (tokensNum < 0) {
        setError(i18n.t("aiModules.subplans.validation.tokensMin"))
        setSaving(false)
        return
      }

      if (tokensNum > 1000000) {
        setError(i18n.t("aiModules.subplans.validation.tokensMax"))
        setSaving(false)
        return
      }

      // 4. Validar precio
      const priceNum = Number(formData.priceUsd)
      if (isNaN(priceNum)) {
        setError(i18n.t("aiModules.subplans.validation.priceInvalid"))
        setSaving(false)
        return
      }

      if (priceNum < 0) {
        setError(i18n.t("aiModules.subplans.validation.priceMin"))
        setSaving(false)
        return
      }

      if (priceNum > 100000) {
        setError(i18n.t("aiModules.subplans.validation.priceMax"))
        setSaving(false)
        return
      }

      // Validar decimales del precio (máximo 2 decimales)
      if (!Number.isInteger(priceNum * 100)) {
        setError(i18n.t("aiModules.subplans.validation.priceDecimals"))
        setSaving(false)
        return
      }

      const payload = {
        ...formData,
        tokens: Number(formData.tokens),
        priceUsd: Number(formData.priceUsd),
      }

      let response: AxiosResponse<AISubplan>
      if (editingSubplan) {
        devLog('[AISubplans] Updating subplan:', editingSubplan.id)
        response = await api.put(`/ai/subplans/${editingSubplan.id}`, payload)
        setSuccess(i18n.t("aiModules.subplans.toasts.updateSuccess"))

        // P2.24 + P2.25: Update state with response instead of refetching
        setSubplans(prev => prev.map(s => s.id === editingSubplan.id ? response.data : s))
      } else {
        devLog('[AISubplans] Creating new subplan')
        response = await api.post('/ai/subplans', payload)
        setSuccess(i18n.t("aiModules.subplans.toasts.createSuccess"))

        // P2.25: For new items, go to page 1 and refetch (new items appear first)
        if (pageNumber !== 1) {
          setPageNumber(1)
        } else {
          // Already on page 1, just refetch
          fetchData()
        }
      }

      setOpenModal(false)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      devError('[AISubplans] Error saving subplan:', err)
      setError(err.response?.data?.error || i18n.t("aiModules.subplans.toasts.errorSaving"))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      setDeleting(true) // P1.19: Set loading state
      devLog('[AISubplans] Deleting subplan:', id)
      await api.delete(`/ai/subplans/${id}`)
      setSuccess(i18n.t("aiModules.subplans.toasts.deleteSuccess"))
      setDeleteConfirm(null)
      fetchData()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      devError('[AISubplans] Error deleting subplan:', err)
      setError(err.response?.data?.error || i18n.t("aiModules.subplans.toasts.errorDeleting"))
    } finally {
      setDeleting(false) // P1.19: Clear loading state
    }
  }

  // COMENTADO: Ya no se usa proveedor seleccionado
  // const selectedProvider = providers.find(p => p.id === formData.aiProviderConfigId)

  // COMENTADO: Ya no se calcula capacidad basada en proveedor
  // const calculateCapacity = (tokens: number, provider?: AIProviderConfig) => {
  //   if (!provider) return null
  //   const capacity: { label: string; value: string; icon: JSX.Element }[] = []
  //   if (provider.textGenerationEnabled && provider.textGenerationPricing > 0) {
  //     const words = Math.floor(tokens / provider.textGenerationPricing)
  //     capacity.push({ label: 'Palabras de texto', value: `~${words.toLocaleString()}`, icon: <TextIcon sx={{ fontSize: 16 }} /> })
  //   }
  //   if (provider.translationEnabled && provider.translationPricing > 0) {
  //     const words = Math.floor(tokens / provider.translationPricing)
  //     capacity.push({ label: 'Palabras traducidas', value: `~${words.toLocaleString()}`, icon: <TranslateIcon sx={{ fontSize: 16 }} /> })
  //   }
  //   if (provider.imageGenerationEnabled && provider.imageGenerationPricing['1024x1024'] > 0) {
  //     const images = Math.floor(tokens / provider.imageGenerationPricing['1024x1024'])
  //     capacity.push({ label: 'Imagenes 1024x1024', value: `~${images.toLocaleString()}`, icon: <ImageIcon sx={{ fontSize: 16 }} /> })
  //   }
  //   if (provider.imageAnalysisEnabled && provider.imageAnalysisPricing > 0) {
  //     const images = Math.floor(tokens / provider.imageAnalysisPricing)
  //     capacity.push({ label: 'Imagenes analizadas', value: `~${images.toLocaleString()}`, icon: <VisionIcon sx={{ fontSize: 16 }} /> })
  //   }
  //   if (provider.speechToTextEnabled && provider.speechToTextPricing > 0) {
  //     const seconds = Math.floor(tokens / provider.speechToTextPricing)
  //     const minutes = Math.floor(seconds / 60)
  //     capacity.push({ label: 'Minutos de audio', value: `~${minutes.toLocaleString()}`, icon: <AudioIcon sx={{ fontSize: 16 }} /> })
  //   }
  //   return capacity
  // }

  const formatNumber = (num: number | string) => {
    return Number(num).toLocaleString()
  }

  const formatCurrency = (num: number | string) => {
    return `$${Number(num).toFixed(2)}`
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
            <SubplanIcon sx={{ fontSize: 32 }} />
            {i18n.t("aiModules.subplans.title")}
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            {i18n.t("aiModules.subplans.description")}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startDecorator={<RefreshIcon />} onClick={fetchData}>
            {i18n.t("aiModules.subplans.buttons.reload")}
          </Button>
          <Button startDecorator={<AddIcon />} onClick={handleCreate}>
            {i18n.t("aiModules.subplans.buttons.new")}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert
          color="danger"
          sx={{ mb: 2 }}
          endDecorator={
            <IconButton size="sm" variant="plain" color="danger" onClick={() => setError(null)}>
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
            <IconButton size="sm" variant="plain" color="success" onClick={() => setSuccess(null)}>
              <CloseIcon />
            </IconButton>
          }
        >
          {success}
        </Alert>
      )}

      {/* Resumen */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                {i18n.t("aiModules.subplans.stats.total")}
              </Typography>
              <Typography level="h3">{subplans.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                {i18n.t("aiModules.subplans.stats.active")}
              </Typography>
              <Typography level="h3" sx={{ color: 'success.500' }}>
                {subplans.filter(s => s.isActive).length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                {i18n.t("aiModules.subplans.stats.public")}
              </Typography>
              <Typography level="h3" sx={{ color: 'primary.500' }}>
                {subplans.filter(s => s.isPublic).length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                {i18n.t("aiModules.subplans.stats.totalTokens")}
              </Typography>
              <Typography level="h3">{formatNumber(subplans.reduce((acc, s) => acc + Number(s.tokens || 0), 0))}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Lista de Subplanes */}
      <Card>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TokenIcon />
            {i18n.t("aiModules.subplans.table.title")}
          </Typography>

          {/* COMENTADO: Ya no se requiere validación de proveedores */}

          {subplans.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 2 }}>
                {i18n.t("aiModules.subplans.table.empty")}
              </Typography>
              <Button startDecorator={<AddIcon />} onClick={handleCreate}>
                {i18n.t("aiModules.subplans.buttons.createFirst")}
              </Button>
            </Box>
          ) : (
            <Sheet sx={{ overflow: 'auto' }}>
              <Table>
                <thead>
                  <tr>
                    <th style={{ width: 200 }}>{i18n.t("aiModules.subplans.table.name")}</th>
                    {/* COMENTADO: <th style={{ width: 150 }}>Proveedor</th> */}
                    <th style={{ width: 120, textAlign: 'right' }}>{i18n.t("aiModules.subplans.table.tokens")}</th>
                    <th style={{ width: 100, textAlign: 'right' }}>{i18n.t("aiModules.subplans.table.used")}</th>
                    <th style={{ width: 100, textAlign: 'right' }}>{i18n.t("aiModules.subplans.table.remaining")}</th>
                    <th style={{ width: 100, textAlign: 'right' }}>{i18n.t("aiModules.subplans.table.price")}</th>
                    <th style={{ width: 80 }}>{i18n.t("aiModules.subplans.table.active")}</th>
                    <th style={{ width: 80 }}>{i18n.t("aiModules.subplans.table.public")}</th>
                    <th style={{ width: 150, textAlign: 'center' }}>{i18n.t("aiModules.subplans.table.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {subplans.map((subplan) => (
                    <tr key={subplan.id}>
                      <td>
                        <Box>
                          <Typography level="body-sm" fontWeight="lg">
                            {subplan.name}
                          </Typography>
                          {subplan.description && (
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              {subplan.description.substring(0, 50)}{subplan.description.length > 50 ? '...' : ''}
                            </Typography>
                          )}
                        </Box>
                      </td>
                      {/* COMENTADO: Columna de proveedor
                      <td>
                        <Typography level="body-sm">
                          {subplan.aiProviderConfig?.name || '-'}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {subplan.aiProviderConfig?.provider}
                        </Typography>
                      </td>
                      */}
                      <td style={{ textAlign: 'right' }}>
                        <Typography level="body-sm" fontWeight="lg">
                          {formatNumber(subplan.tokens)}
                        </Typography>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Typography level="body-sm">
                          {formatNumber(subplan.tokensConsumed || 0)}
                        </Typography>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Typography level="body-sm" sx={{ color: 'success.600' }}>
                          {formatNumber((subplan.tokens || 0) - (subplan.tokensConsumed || 0))}
                        </Typography>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Typography level="body-sm" fontWeight="lg" sx={{ color: 'success.600' }}>
                          {formatCurrency(subplan.priceUsd)}
                        </Typography>
                      </td>
                      <td>
                        <Chip size="sm" color={subplan.isActive ? 'success' : 'neutral'}>
                          {subplan.isActive ? i18n.t("aiModules.subplans.table.yes") : i18n.t("aiModules.subplans.table.no")}
                        </Chip>
                      </td>
                      <td>
                        <Chip size="sm" color={subplan.isPublic ? 'primary' : 'neutral'} startDecorator={subplan.isPublic ? <PublicIcon sx={{ fontSize: 14 }} /> : null}>
                          {subplan.isPublic ? i18n.t("aiModules.subplans.table.yes") : i18n.t("aiModules.subplans.table.no")}
                        </Chip>
                      </td>
                      <td>
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          <IconButton size="sm" variant="outlined" onClick={() => handleEdit(subplan)}>
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="outlined"
                            color="danger"
                            onClick={() => setDeleteConfirm(subplan.id)}
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

          {/* P2.25: Pagination Controls */}
          {totalPages > 1 && (
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                {i18n.t("aiModules.subplans.pagination.showing", { current: subplans.length, total: totalSubplans })}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Button
                  size="sm"
                  variant="outlined"
                  disabled={pageNumber === 1}
                  onClick={() => setPageNumber(prev => Math.max(1, prev - 1))}
                >
                  {i18n.t("aiModules.subplans.pagination.previous")}
                </Button>
                <Typography level="body-sm">
                  {i18n.t("aiModules.subplans.pagination.page", { current: pageNumber, total: totalPages })}
                </Typography>
                <Button
                  size="sm"
                  variant="outlined"
                  disabled={pageNumber >= totalPages}
                  onClick={() => setPageNumber(prev => Math.min(totalPages, prev + 1))}
                >
                  {i18n.t("aiModules.subplans.pagination.next")}
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Modal Crear/Editar */}
      <Modal open={openModal} onClose={() => setOpenModal(false)}>
        <ModalDialog sx={{ minWidth: 600, maxWidth: 700, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2, flexShrink: 0 }}>
            {editingSubplan ? i18n.t("aiModules.subplans.modal.titleEdit") : i18n.t("aiModules.subplans.modal.titleCreate")}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'auto', pr: 1 }}>
            {/* COMENTADO: Ya no se selecciona proveedor en el subplan
            <FormControl required>
              <FormLabel>Proveedor de IA</FormLabel>
              <Select
                value={formData.aiProviderConfigId || ''}
                onChange={(_, val) => setFormData({ ...formData, aiProviderConfigId: val as number })}
                placeholder="Selecciona un proveedor"
              >
                {providers.map((provider) => (
                  <Option key={provider.id} value={provider.id}>
                    {provider.name} ({provider.provider})
                  </Option>
                ))}
              </Select>
            </FormControl>

            {selectedProvider && (
              <Box sx={{ p: 1.5, bgcolor: 'background.level1', borderRadius: 'sm' }}>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 1 }}>
                  Capacidades del proveedor:
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {selectedProvider.textGenerationEnabled && <Chip size="sm" color="primary" startDecorator={<TextIcon sx={{ fontSize: 12 }} />}>Texto ({selectedProvider.textGenerationPricing} cred/palabra)</Chip>}
                  {selectedProvider.translationEnabled && <Chip size="sm" color="success" startDecorator={<TranslateIcon sx={{ fontSize: 12 }} />}>Traduccion ({selectedProvider.translationPricing} cred/palabra)</Chip>}
                  {selectedProvider.imageGenerationEnabled && <Chip size="sm" color="warning" startDecorator={<ImageIcon sx={{ fontSize: 12 }} />}>Imagenes ({selectedProvider.imageGenerationPricing['1024x1024']} cred/img)</Chip>}
                  {selectedProvider.imageAnalysisEnabled && <Chip size="sm" color="neutral" startDecorator={<VisionIcon sx={{ fontSize: 12 }} />}>Vision ({selectedProvider.imageAnalysisPricing} cred/img)</Chip>}
                  {selectedProvider.speechToTextEnabled && <Chip size="sm" color="danger" startDecorator={<AudioIcon sx={{ fontSize: 12 }} />}>STT ({selectedProvider.speechToTextPricing} cred/seg)</Chip>}
                </Box>
              </Box>
            )}
            */}

            <FormControl required>
              <FormLabel>{i18n.t("aiModules.subplans.modal.nameLabel")}</FormLabel>
              <Input
                placeholder={i18n.t("aiModules.subplans.modal.namePlaceholder")}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </FormControl>

            <FormControl>
              <FormLabel>{i18n.t("aiModules.subplans.modal.descriptionLabel")}</FormLabel>
              <Textarea
                placeholder={i18n.t("aiModules.subplans.modal.descriptionPlaceholder")}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                minRows={2}
              />
            </FormControl>

            <Divider />
            <Typography level="title-sm">{i18n.t("aiModules.subplans.modal.tokensSection")}</Typography>

            <Grid container spacing={2}>
              <Grid xs={12} md={6}>
                <FormControl required>
                  <FormLabel>{i18n.t("aiModules.subplans.modal.tokensLabel")}</FormLabel>
                  <Input
                    type="number"
                    startDecorator={<TokenIcon />}
                    value={formData.tokens}
                    onChange={(e) => setFormData({ ...formData, tokens: parseInt(e.target.value) || 0 })}
                    slotProps={{ input: { min: 0 } }}
                  />
                </FormControl>
              </Grid>
              <Grid xs={12} md={6}>
                <FormControl required>
                  <FormLabel>{i18n.t("aiModules.subplans.modal.priceLabel")}</FormLabel>
                  <Input
                    type="number"
                    startDecorator={<MoneyIcon />}
                    value={formData.priceUsd}
                    onChange={(e) => setFormData({ ...formData, priceUsd: parseFloat(e.target.value) || 0 })}
                    slotProps={{ input: { min: 0, step: 0.01 } }}
                  />
                </FormControl>
              </Grid>
            </Grid>

            {/* COMENTADO: Ya no se calcula capacidad basada en proveedor
            {selectedProvider && formData.tokens > 0 && (
              <>
                <Divider />
                <Typography level="title-sm">Capacidad Aproximada</Typography>
                <Box sx={{ p: 1.5, bgcolor: 'success.softBg', borderRadius: 'sm' }}>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 1 }}>
                    Con {formatNumber(formData.tokens)} tokens puedes obtener aproximadamente:
                  </Typography>
                  <Grid container spacing={1}>
                    {calculateCapacity(formData.tokens, selectedProvider)?.map((item, idx) => (
                      <Grid xs={6} key={idx}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {item.icon}
                          <Typography level="body-sm">
                            <strong>{item.value}</strong> {item.label}
                          </Typography>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              </>
            )}
            */}

            <Divider />
            <Typography level="title-sm">{i18n.t("aiModules.subplans.modal.optionsSection")}</Typography>

            <Grid container spacing={2}>
              <Grid xs={6}>
                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <FormLabel>{i18n.t("aiModules.subplans.modal.activeLabel")}</FormLabel>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {i18n.t("aiModules.subplans.modal.activeHelper")}
                      </Typography>
                    </Box>
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
                    <Box>
                      <FormLabel>{i18n.t("aiModules.subplans.modal.publicLabel")}</FormLabel>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {i18n.t("aiModules.subplans.modal.publicHelper")}
                      </Typography>
                    </Box>
                    <Switch
                      checked={formData.isPublic}
                      onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                    />
                  </Box>
                </FormControl>
              </Grid>
            </Grid>

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
              <Button variant="outlined" onClick={() => setOpenModal(false)}>
                {i18n.t("aiModules.subplans.buttons.cancel")}
              </Button>
              <Button
                startDecorator={<SaveIcon />}
                onClick={handleSave}
                loading={saving}
              >
                {editingSubplan ? i18n.t("aiModules.subplans.buttons.save") : i18n.t("aiModules.subplans.buttons.create")}
              </Button>
            </Box>
          </Box>
        </ModalDialog>
      </Modal>

      {/* Modal Confirmar Eliminacion */}
      <Modal open={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)}>
        <ModalDialog>
          <Typography level="h4" sx={{ mb: 2 }}>
            {i18n.t("aiModules.subplans.delete.title")}
          </Typography>
          <Typography level="body-md" sx={{ mb: 3 }}>
            {i18n.t("aiModules.subplans.delete.message")}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              onClick={() => setDeleteConfirm(null)}
              disabled={deleting}
            >
              {i18n.t("aiModules.subplans.buttons.cancel")}
            </Button>
            <Button
              color="danger"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              loading={deleting}
              disabled={deleting}
            >
              {i18n.t("aiModules.subplans.buttons.delete")}
            </Button>
          </Box>
        </ModalDialog>
      </Modal>
    </Box>
  )
}
