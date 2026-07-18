import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'react-toastify'
import toastError from '../errors/toastError'
// [Migración] Autocomplete se CONSERVA como MUI Joy (no hay equivalente Radix).
// El Chip de Joy se conserva SOLO dentro de renderTags del Autocomplete por
// compatibilidad con getTagProps (onDelete). El resto migra a design system.
import { Autocomplete, Chip } from '@mui/joy'
import {
  Brain,
  Plus,
  PencilSimple,
  Trash,
  MagnifyingGlass,
  ArrowClockwise,
  Copy,
  Warning,
  UploadSimple,
  Paperclip,
  X,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import api from '../services/api'
import { i18n } from "../translate/i18n" // P3.47: i18n support
import { useAuth } from '../hooks/useAuth'

// Clases compartidas para inputs (mismo look que Tags/Connections)
const inputClass =
  "h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"

// Botón de acción de fila (mismo look que RowAction, con onClick)
function ActionBtn({
  label,
  onClick,
  className,
  children,
}: {
  label: string
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

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
    // TODO P2: Replace browser confirm with Dialog for consistency
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

  const closeModal = () => {
    setOpenModal(false)
    resetForm()
    setSelectedPrompt(null)
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Brain className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {i18n.t("aiModules.prompts.title")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {i18n.t("aiModules.prompts.description")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={fetchPrompts}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={openCreateModal}>
              <Plus className="size-4" weight="bold" aria-hidden />
              {i18n.t("aiModules.prompts.buttons.new")}
            </Button>
          </div>
        </div>

        {/* P1.18: Error State Display */}
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text">
            <Warning className="size-5 shrink-0" weight="fill" aria-hidden />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => setError(null)}
              className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-destructive/10"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label={i18n.t("aiModules.prompts.stats.total")} value={String(stats.total)} />
          <StatTile
            label={i18n.t("aiModules.prompts.stats.totalTokens")}
            value={stats.totalTokens.toLocaleString()}
            tone="primary"
          />
          <StatTile label={i18n.t("aiModules.prompts.stats.avgTokens")} value={String(stats.avgTokensPerPrompt)} />
          <StatTile label={i18n.t("aiModules.prompts.stats.mostUsed")} value={stats.maxTokensPrompt?.name || '-'} />
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <MagnifyingGlass
            className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            placeholder={i18n.t("aiModules.prompts.search.placeholder")}
            aria-label={i18n.t("aiModules.prompts.search.placeholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>

        {/* Prompts Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{i18n.t("aiModules.prompts.table.name")}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{i18n.t("aiModules.prompts.table.prompt")}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{i18n.t("aiModules.prompts.table.provider")}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{i18n.t("aiModules.prompts.table.queues")}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{i18n.t("aiModules.prompts.table.maxTokens")}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{i18n.t("aiModules.prompts.table.temperature")}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{i18n.t("aiModules.prompts.table.tokens")}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{i18n.t("aiModules.prompts.table.messages")}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{i18n.t("aiModules.prompts.table.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      {i18n.t("aiModules.prompts.table.loading")}
                    </td>
                  </tr>
                ) : filteredPrompts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      {i18n.t("aiModules.prompts.table.empty")}
                    </td>
                  </tr>
                ) : (
                  filteredPrompts.map((prompt) => (
                    <tr key={prompt.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {prompt.name}
                      </td>
                      <td className="px-4 py-3">
                        <span className="block max-w-[200px] truncate text-muted-foreground">
                          {prompt.prompt}
                        </span>
                      </td>
                      {/* Columna Proveedor de IA */}
                      <td className="px-4 py-3">
                        {prompt.aiProviderId ? (
                          <Badge variant="primary">
                            {aiProviders.find(p => p.id === prompt.aiProviderId)?.name ||
                              aiProviders.find(p => p.id === prompt.aiProviderId)?.provider ||
                              'IA'}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {i18n.t("aiModules.prompts.table.noProvider")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {prompt.queues && prompt.queues.length > 0 ? (
                            prompt.queues.map((queue) => (
                              queue.color ? (
                                <span
                                  key={queue.id}
                                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium leading-none text-white"
                                  style={{ backgroundColor: queue.color }}
                                >
                                  {queue.name}
                                </span>
                              ) : (
                                <Badge key={queue.id} variant="neutral">
                                  {queue.name}
                                </Badge>
                              )
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {i18n.t("aiModules.prompts.table.noQueues")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="primary">{prompt.maxTokens}</Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{prompt.temperature}</td>
                      <td className="px-4 py-3 tabular-nums font-semibold text-foreground">
                        {prompt.totalTokens.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{prompt.maxMessages}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <ActionBtn
                            label="Copiar"
                            onClick={() => handleCopyPrompt(prompt.prompt)}
                          >
                            <Copy className="size-[18px]" aria-hidden />
                          </ActionBtn>
                          <ActionBtn
                            label="Editar"
                            onClick={() => openEditModal(prompt)}
                            className="hover:text-primary"
                          >
                            <PencilSimple className="size-[18px]" aria-hidden />
                          </ActionBtn>
                          <ActionBtn
                            label="Eliminar"
                            onClick={() => handleDelete(prompt.id)}
                            className="hover:bg-destructive/10 hover:text-destructive-text"
                          >
                            <Trash className="size-[18px]" aria-hidden />
                          </ActionBtn>
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

      {/* Modal Create/Edit */}
      {openModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {selectedPrompt ? i18n.t("aiModules.prompts.modal.titleEdit") : i18n.t("aiModules.prompts.modal.titleCreate")}
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={closeModal}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <X className="size-[18px]" aria-hidden />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="prompt-name">{i18n.t("aiModules.prompts.modal.nameLabel")}</Label>
                <input
                  id="prompt-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={i18n.t("aiModules.prompts.modal.namePlaceholder")}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prompt-text">{i18n.t("aiModules.prompts.modal.promptLabel")}</Label>
                <textarea
                  id="prompt-text"
                  value={formData.prompt}
                  onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                  placeholder={i18n.t("aiModules.prompts.modal.promptPlaceholder")}
                  rows={6}
                  className="min-h-[9rem] w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="prompt-maxtokens">{i18n.t("aiModules.prompts.modal.maxTokensLabel")}</Label>
                  <input
                    id="prompt-maxtokens"
                    type="number"
                    min={100}
                    max={4000}
                    value={formData.maxTokens}
                    onChange={(e) =>
                      setFormData({ ...formData, maxTokens: parseInt(e.target.value) || 2000 })
                    }
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prompt-temperature">{i18n.t("aiModules.prompts.modal.temperatureLabel")}</Label>
                  <input
                    id="prompt-temperature"
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={formData.temperature}
                    onChange={(e) =>
                      setFormData({ ...formData, temperature: parseFloat(e.target.value) || 0.7 })
                    }
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="prompt-maxmessages">{i18n.t("aiModules.prompts.modal.maxMessagesLabel")}</Label>
                  <input
                    id="prompt-maxmessages"
                    type="number"
                    value={formData.maxMessages}
                    onChange={(e) =>
                      setFormData({ ...formData, maxMessages: parseInt(e.target.value) || 10 })
                    }
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{i18n.t("aiModules.prompts.modal.queuesLabel")}</Label>
                  {/* [Migración] Autocomplete CONSERVADO como MUI Joy (sin equivalente Radix) */}
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
                </div>
              </div>

              {/* Sección de carga de archivos */}
              <div className="space-y-1.5">
                <Label>
                  <span className="flex items-center gap-1.5">
                    <Paperclip className="size-4" aria-hidden />
                    <span>{i18n.t("aiModules.prompts.modal.fileUploadLabel") || "Archivo de contexto (opcional)"}</span>
                  </span>
                </Label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".txt,.pdf,.xlsx,.xls"
                  className="hidden"
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
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <UploadSimple className="size-4" aria-hidden />
                    {i18n.t("aiModules.prompts.modal.selectFile") || "Seleccionar archivo"}
                  </Button>
                  {selectedFile && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary">
                      {selectedFile.name}
                      <button
                        type="button"
                        aria-label="Quitar archivo"
                        onClick={() => {
                          setSelectedFile(null)
                          if (fileInputRef.current) fileInputRef.current.value = ''
                        }}
                        className="flex size-5 items-center justify-center rounded-full transition-colors hover:bg-primary/20"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {i18n.t("aiModules.prompts.modal.fileUploadHelper") || "Sube un archivo .txt, .pdf o .xlsx para usarlo como contexto adicional"}
                </p>
              </div>

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

              <div className="flex flex-col gap-1 rounded-md bg-muted p-4">
                <p className="text-sm font-semibold text-foreground">
                  {i18n.t("aiModules.prompts.modal.previewTitle")}
                </p>
                <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {formData.prompt || i18n.t("aiModules.prompts.modal.previewEmpty")}
                </p>
                {/* Mostrar archivo seleccionado */}
                {selectedFile && (
                  <span className="flex items-center gap-1.5 text-xs text-primary">
                    <Paperclip className="size-3.5" aria-hidden />
                    {i18n.t("aiModules.prompts.modal.attachedFile") || "Archivo adjunto"}: {selectedFile.name}
                  </span>
                )}
                <p className="text-xs text-muted-foreground">
                  {i18n.t("aiModules.prompts.modal.previewSettings", {
                    maxTokens: formData.maxTokens,
                    temperature: formData.temperature,
                    maxMessages: formData.maxMessages
                  })}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={closeModal}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={selectedPrompt ? handleUpdate : handleCreate}>
                  {selectedPrompt ? i18n.t("aiModules.prompts.buttons.update") : i18n.t("aiModules.prompts.buttons.create")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
