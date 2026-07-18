import { useState, useEffect, useRef, type ReactNode } from 'react'
import {
  Lightning,
  ArrowClockwise,
  Plus,
  MagnifyingGlass,
  Copy,
  PencilSimple,
  Trash,
  FileImage,
  FileVideo,
  FileAudio,
  File as FileIcon,
  CloudArrowUp,
  X,
  Sparkle,
  Paperclip,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { StatTile } from '@/components/ui/stat-tile'
import { cn } from '@/lib/utils'
import api from '../services/api'

/** Botón de acción de fila (mismo look que row-action, pero con onClick). */
function IconAction({
  label,
  className,
  onClick,
  children,
}: {
  label: string
  className?: string
  onClick?: () => void
  children: ReactNode
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

interface QuickMessage {
  id: number
  shortcode: string
  message: string
  geral?: boolean
  mediaPath?: string
  mediaName?: string
  userId?: number
  createdAt: string
  /** Descripción semántica para búsqueda por IA */
  intent?: string
  /** Key estable para matching por IA */
  intentKey?: string
  /** Si está habilitado para uso por el orquestador IA */
  isAiEnabled?: boolean
}

// Helper para detectar si un archivo/URL es imagen por extensión
const isImageFile = (name: string): boolean => /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name)
const isVideoFile = (name: string): boolean => /\.(mp4|mov|avi|webm|mkv)$/i.test(name)
const isAudioFile = (name: string): boolean => /\.(mp3|wav|ogg|opus|aac|m4a)$/i.test(name)

const getFileIcon = (name: string, className = 'size-[18px]') => {
  if (isImageFile(name)) return <FileImage className={className} aria-hidden />
  if (isVideoFile(name)) return <FileVideo className={className} aria-hidden />
  if (isAudioFile(name)) return <FileAudio className={className} aria-hidden />
  return <FileIcon className={className} aria-hidden />
}

// Funcionalidad de IA semántica ("Habilitar para IA" / intent / key) temporalmente
// desactivada. Cambiar a true para reactivar el toggle del modal, la tarjeta
// "Habilitados para IA" y la columna "IA" de la tabla.
const AI_FEATURES_ENABLED = false

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
    intentKey: '',
    intent: '',
    isAiEnabled: false,
  })

  // Media upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [existingMedia, setExistingMedia] = useState<{ path: string; name: string } | null>(null)
  const [removeMedia, setRemoveMedia] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [suggestingIntent, setSuggestingIntent] = useState(false)
  const [redrafting, setRedrafting] = useState(false)
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
    // Axios maneja automáticamente el Content-Type: multipart/form-data con boundary cuando usas FormData
    await api.post(`/quick-messages/${quickMessageId}/media-upload`, fd)
  }

  const deleteMediaFromServer = async (quickMessageId: number) => {
    await api.delete(`/quick-messages/${quickMessageId}/media-upload`)
  }

  const fileToDataUrl = (file: File): Promise<string> => (
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  )

  const requestAiIntentSuggestion = async () => {
    let mediaDataUrl: string | undefined

    if (selectedFile?.type.startsWith('image/') && selectedFile.size <= 4 * 1024 * 1024) {
      mediaDataUrl = await fileToDataUrl(selectedFile)
    }

    const response = await api.post('/quick-messages/ai/suggest-intent', {
      shortcode: formData.shortcode,
      message: formData.message,
      mediaName: selectedFile?.name || existingMedia?.name,
      mediaUrl: !selectedFile ? existingMedia?.path : undefined,
      mediaDataUrl,
    })

    return response.data || {}
  }

  const ensureAiIntentBeforeSave = async () => {
    if (!formData.isAiEnabled || (formData.intent.trim() && formData.intentKey.trim())) {
      return formData
    }

    try {
      const suggestion = await requestAiIntentSuggestion()
      const nextFormData = {
        ...formData,
        intentKey: formData.intentKey || suggestion.intentKey || '',
        intent: formData.intent || suggestion.intent || '',
      }
      setFormData(nextFormData)
      return nextFormData
    } catch (error) {
      console.error('Error ensuring AI intent:', error)
      return formData
    }
  }

  const handleSuggestAiIntent = async () => {
    try {
      setSuggestingIntent(true)
      setFormData((prev) => ({
        ...prev,
        isAiEnabled: true,
        intentKey: '',
        intent: '',
      }))
      const suggestion = await requestAiIntentSuggestion()

      setFormData((prev) => ({
        ...prev,
        isAiEnabled: true,
        intentKey: suggestion.intentKey || '',
        intent: suggestion.intent || '',
      }))
    } catch (error) {
      console.error('Error generating AI intent:', error)
    } finally {
      setSuggestingIntent(false)
    }
  }

  const handleRedraftWithAI = async () => {
    if (!formData.message.trim()) return
    try {
      setRedrafting(true)
      const response = await api.post('/quick-messages/ai/redraft', {
        shortcode: formData.shortcode,
        message: formData.message,
      })
      const redrafted = response.data?.message
      if (redrafted && typeof redrafted === 'string') {
        setFormData((prev) => ({ ...prev, message: redrafted }))
      }
    } catch (error) {
      console.error('Error redactando con IA:', error)
    } finally {
      setRedrafting(false)
    }
  }

  const handleCreate = async () => {
    try {
      setUploading(true)
      const payload = await ensureAiIntentBeforeSave()
      const response = await api.post('/quick-messages', payload)
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
      const payload = await ensureAiIntentBeforeSave()
      await api.put(`/quick-messages/${selectedMessage.id}`, payload)
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
      intentKey: message.intentKey || '',
      intent: message.intent || '',
      isAiEnabled: message.isAiEnabled ?? false,
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
      intentKey: '',
      intent: '',
      isAiEnabled: false,
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
      msg.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (msg.intent || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (msg.intentKey || '').toLowerCase().includes(searchTerm.toLowerCase())

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
    aiEnabled: messages.filter((m) => m.isAiEnabled).length,
  }

  const statTiles: { label: string; value: string; tone: 'primary' | 'success' | 'neutral' }[] = [
    { label: 'Total mensajes', value: String(stats.total), tone: 'neutral' },
    { label: 'Globales', value: String(stats.global), tone: 'success' },
    { label: 'Personales', value: String(stats.personal), tone: 'primary' },
    { label: 'Con archivos', value: String(stats.withMedia), tone: 'neutral' },
    ...(AI_FEATURES_ENABLED
      ? [{ label: 'Habilitados IA', value: String(stats.aiEnabled), tone: 'primary' as const }]
      : []),
  ]

  const columns = ['Atajo', 'Mensaje', 'Tipo', 'Archivo', ...(AI_FEATURES_ENABLED ? ['IA'] : []), 'Creado', '']
  const colSpan = columns.length

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Lightning className="size-6" weight="fill" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Mensajes Rápidos</h1>
              <p className="text-sm text-muted-foreground">
                Respuestas predefinidas para agilizar las conversaciones
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              onClick={fetchMessages}
              className="text-muted-foreground"
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={openCreateModal}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nuevo mensaje
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {statTiles.map((s) => (
            <StatTile key={s.label} label={s.label} value={s.value} tone={s.tone} />
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="w-full sm:max-w-md">
            <Input
              placeholder="Buscar mensajes rápidos"
              aria-label="Buscar mensajes rápidos"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              leftIcon={<MagnifyingGlass aria-hidden />}
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filtrar por tipo"
            className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:w-48"
          >
            <option value="all">Todos</option>
            <option value="global">Globales</option>
            <option value="personal">Personales</option>
          </select>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
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
                {loading ? (
                  <tr>
                    <td colSpan={colSpan} className="px-4 py-10 text-center text-muted-foreground">
                      Cargando mensajes...
                    </td>
                  </tr>
                ) : filteredMessages.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="px-4 py-10 text-center text-muted-foreground">
                      No se encontraron mensajes
                    </td>
                  </tr>
                ) : (
                  filteredMessages.map((message) => (
                    <tr key={message.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                          {message.shortcode}
                        </span>
                      </td>
                      <td className="max-w-md px-4 py-3 text-muted-foreground">
                        <span className="line-clamp-1">{message.message}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={message.geral ? 'accent' : 'neutral'}>
                          {message.geral ? 'Global' : 'Personal'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {message.mediaPath ? (
                          <IconAction
                            label={message.mediaName || 'Ver archivo'}
                            className="text-primary hover:text-primary"
                            onClick={() => window.open(message.mediaPath, '_blank')}
                          >
                            {getFileIcon(message.mediaName || '')}
                          </IconAction>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      {AI_FEATURES_ENABLED && (
                        <td className="px-4 py-3">
                          {message.isAiEnabled ? (
                            <Badge
                              variant="primary"
                              title={`Key: ${message.intentKey || '(sin key)'} | Intent: ${message.intent || '(sin descripción)'}`}
                            >
                              <Sparkle className="size-3" weight="fill" aria-hidden />
                              IA
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {new Date(message.createdAt).toLocaleDateString('es-ES')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <IconAction label="Copiar" onClick={() => handleCopyMessage(message.message)}>
                            <Copy className="size-[18px]" aria-hidden />
                          </IconAction>
                          <IconAction label="Editar" onClick={() => openEditModal(message)}>
                            <PencilSimple className="size-[18px]" aria-hidden />
                          </IconAction>
                          <IconAction
                            label="Eliminar"
                            className="hover:bg-destructive/10 hover:text-destructive-text"
                            onClick={() => handleDelete(message.id)}
                          >
                            <Trash className="size-[18px]" aria-hidden />
                          </IconAction>
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
          onClick={() => !uploading && setOpenModal(false)}
        >
          <div
            className="flex max-h-[calc(100vh-32px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold text-foreground">
                {selectedMessage ? 'Editar Mensaje Rápido' : 'Nuevo Mensaje Rápido'}
              </h2>
              <IconAction label="Cerrar" onClick={() => setOpenModal(false)}>
                <X className="size-[18px]" aria-hidden />
              </IconAction>
            </div>

            {/* Modal body */}
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div className="space-y-1.5">
                <Label htmlFor="qr-shortcode">Atajo</Label>
                <Input
                  id="qr-shortcode"
                  value={formData.shortcode}
                  onChange={(e) => setFormData({ ...formData, shortcode: e.target.value })}
                  placeholder="/ejemplo"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="qr-message">Mensaje</Label>
                <textarea
                  id="qr-message"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Escribe el mensaje predefinido..."
                  rows={4}
                  className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={redrafting}
                  onClick={handleRedraftWithAI}
                  disabled={redrafting || !formData.message.trim()}
                  className="mt-1"
                >
                  {!redrafting && <Sparkle className="size-4" aria-hidden />}
                  {redrafting ? 'Redactando...' : 'Redactar con IA'}
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="qr-type">Tipo de Mensaje</Label>
                <select
                  id="qr-type"
                  value={formData.geral ? 'global' : 'personal'}
                  onChange={(e) => setFormData({ ...formData, geral: e.target.value === 'global' })}
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  <option value="global">Global (Todos los usuarios)</option>
                  <option value="personal">Personal (Solo yo)</option>
                </select>
              </div>

              {/* Sección IA (desactivada temporalmente — AI_FEATURES_ENABLED) */}
              {AI_FEATURES_ENABLED && (
                <div className="rounded-lg border border-border bg-accent/40 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <Sparkle className="size-4 text-primary" weight="fill" aria-hidden />
                        Habilitar para IA
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Permite que el orquestador IA use este mensaje en respuestas semánticas
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={formData.isAiEnabled}
                      onClick={() => setFormData({ ...formData, isAiEnabled: !formData.isAiEnabled })}
                      className={cn(
                        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        formData.isAiEnabled ? 'bg-primary' : 'bg-muted',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform',
                          formData.isAiEnabled && 'translate-x-[22px]',
                        )}
                      />
                    </button>
                  </div>

                  {formData.isAiEnabled && (
                    <div className="mt-4 space-y-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        loading={suggestingIntent}
                        onClick={handleSuggestAiIntent}
                        disabled={
                          suggestingIntent || (!formData.message.trim() && !selectedFile && !existingMedia)
                        }
                      >
                        {!suggestingIntent && <Sparkle className="size-4" aria-hidden />}
                        {suggestingIntent ? 'Generando...' : 'Generar key con IA'}
                      </Button>

                      <div className="space-y-1.5">
                        <Label htmlFor="qr-intentkey">Key IA</Label>
                        <Input
                          id="qr-intentkey"
                          value={formData.intentKey}
                          onChange={(e) => setFormData({ ...formData, intentKey: e.target.value })}
                          placeholder="location_question, plan_gold_selection, pricing_question"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="qr-intent">Intención (para búsqueda semántica)</Label>
                        <Input
                          id="qr-intent"
                          value={formData.intent}
                          onChange={(e) => setFormData({ ...formData, intent: e.target.value })}
                          placeholder="Ej: usar cuando el cliente pregunte ubicación, dirección o mapa"
                        />
                        <p className="text-xs text-muted-foreground">
                          La búsqueda IA usa la key, el mensaje, el atajo y el archivo para encontrar esta respuesta.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Archivo multimedia */}
              <div className="space-y-1.5">
                <Label>Archivo Multimedia (opcional)</Label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                />

                {/* Estado: sin archivo */}
                {!selectedFile && !existingMedia?.path && !removeMedia && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full flex-col items-center gap-1 rounded-md border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary/50"
                  >
                    <CloudArrowUp className="size-9 text-muted-foreground" aria-hidden />
                    <span className="text-sm text-muted-foreground">
                      Haz clic para adjuntar imagen, video, audio o documento
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Formatos: JPG, PNG, GIF, MP4, MP3, PDF, DOC, XLS...
                    </span>
                  </button>
                )}

                {/* Estado: archivo nuevo seleccionado */}
                {selectedFile && (
                  <div className="flex items-center gap-3 rounded-md border border-primary/40 p-3">
                    {selectedFile.type.startsWith('image/') ? (
                      <img
                        src={URL.createObjectURL(selectedFile)}
                        alt="preview"
                        className="size-14 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex size-14 items-center justify-center rounded-md bg-primary/10 text-primary">
                        {getFileIcon(selectedFile.name, 'size-6')}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <IconAction
                        label="Cambiar archivo"
                        className="text-primary hover:text-primary"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <CloudArrowUp className="size-[18px]" aria-hidden />
                      </IconAction>
                      <IconAction
                        label="Quitar archivo"
                        className="hover:bg-destructive/10 hover:text-destructive-text"
                        onClick={handleRemoveFile}
                      >
                        <X className="size-[18px]" aria-hidden />
                      </IconAction>
                    </div>
                  </div>
                )}

                {/* Estado: archivo existente (editando) */}
                {!selectedFile && existingMedia?.path && !removeMedia && (
                  <div className="flex items-center gap-3 rounded-md border border-success/40 p-3">
                    {isImageFile(existingMedia.name) ? (
                      <img
                        src={existingMedia.path}
                        alt="media actual"
                        className="size-14 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex size-14 items-center justify-center rounded-md bg-success/10 text-success-text">
                        {getFileIcon(existingMedia.name, 'size-6')}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{existingMedia.name}</p>
                      <Badge variant="success" className="mt-1">Archivo actual</Badge>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <IconAction
                        label="Reemplazar archivo"
                        className="text-primary hover:text-primary"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <CloudArrowUp className="size-[18px]" aria-hidden />
                      </IconAction>
                      <IconAction
                        label="Eliminar archivo"
                        className="hover:bg-destructive/10 hover:text-destructive-text"
                        onClick={handleRemoveFile}
                      >
                        <X className="size-[18px]" aria-hidden />
                      </IconAction>
                    </div>
                  </div>
                )}

                {/* Estado: archivo eliminado (se marcó para borrar) */}
                {!selectedFile && removeMedia && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full flex-col items-center gap-1 rounded-md border-2 border-dashed border-destructive/40 p-4 text-center transition-colors hover:border-primary/50"
                  >
                    <span className="text-sm text-destructive-text">Archivo marcado para eliminar</span>
                    <span className="text-xs text-muted-foreground">
                      Haz clic para adjuntar uno nuevo, o guarda para eliminar
                    </span>
                  </button>
                )}
              </div>

              {/* Vista previa */}
              <div className="rounded-md bg-accent/40 p-3">
                <p className="line-clamp-3 text-sm text-foreground">
                  <strong>Vista Previa:</strong>
                  <br />
                  {formData.shortcode || '/atajo'} → {formData.message || 'Mensaje aquí...'}
                  {(selectedFile || (existingMedia && !removeMedia)) && (
                    <>
                      <br />
                      <Paperclip className="mr-1 inline size-3.5 align-middle" aria-hidden />
                      {selectedFile?.name || existingMedia?.name}
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-2 border-t border-border bg-muted/30 px-6 py-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpenModal(false)}
                disabled={uploading}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={selectedMessage ? handleUpdate : handleCreate}
                loading={uploading}
                disabled={uploading}
              >
                {uploading ? 'Guardando...' : `${selectedMessage ? 'Actualizar' : 'Crear'} Mensaje`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
