import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Box,
  IconButton,
  Textarea,
  Stack,
  Button,
  Menu,
  MenuItem,
  ListItemDecorator,
  Typography,
  CircularProgress,
  Tooltip,
  Alert,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Select,
  Option,
  Autocomplete,
  Input,
  Switch,
} from '@mui/joy'
import {
  Send as SendIcon,
  AttachFile as _AttachIcon,
  EmojiEmotions as EmojiIcon,
  Mic as MicIcon,
  Stop as StopIcon,
  Close as CloseIcon,
  Image as ImageIcon,
  Description as DocumentIcon,
  CameraAlt as CameraIcon,
  Person as PersonIcon,
  Videocam as VideoIcon,
  Audiotrack as AudioFileIcon,
  PictureAsPdf as PdfIcon,
  InsertDriveFile as GenericFileIcon,
  Schedule as ScheduleIcon,
  FlashOn as QuickIcon,
  Add as AddIcon,
  CheckCircle as _CheckIcon,
  Cancel as CancelIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  UploadFile as UploadFileIcon,
  DriveFileRenameOutline as SignatureIcon,
} from '@mui/icons-material'
import api from '../../services/api'
import type { Message } from '../../types/Message'
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react'
import { toast } from 'react-toastify'
import { useAuth } from '../../hooks/useAuth'
import getApiErrorMessage from '../../utils/getApiErrorMessage'

interface QuickMessage {
  id: number
  value: string
  label: string
  shortcode: string
  hasMedia: boolean
  mediaName?: string
}

interface ContactOption {
  id: number
  name: string
  number: string
  whatsappId?: number | null
  whatsapp?: {
    id: number
    name: string
  } | null
}

interface UserOption {
  id: number
  name: string
}

interface QueueOption {
  id: number
  name: string
}

interface WhatsappOption {
  id: number
  name: string
}

interface MessageInputProps {
  ticketId: number
  ticketStatus: string
  ticketChannel?: string
  onSendMessage?: (message: string) => void
  droppedFiles?: File[]
  onDroppedFilesHandled?: () => void
  contactId?: number
  contactName?: string
  contactNumber?: string
  whatsappId?: number | null
  whatsappName?: string
  replyingTo?: Message
  onCancelReply?: () => void
  /** Optimistic UI de media: se invoca ANTES de subir el/los archivo(s) con los
   *  placeholders a mostrar de inmediato en el chat (preview local + "enviando"). */
  onMediaSendStart?: (placeholders: OptimisticMediaMessage[]) => void
  /** Progreso de subida (0-100) para los placeholders del lote. */
  onMediaSendProgress?: (tempIds: string[], percent: number) => void
  /** Subida finalizada (éxito o error): el chat debe retirar los placeholders. */
  onMediaSendEnd?: (tempIds: string[], success: boolean) => void
}

/** Mensaje provisional que se pinta mientras el archivo sube. Usa una URL local
 *  (blob:) para previsualizar sin esperar al servidor. */
export interface OptimisticMediaMessage {
  id: string
  tempId: string
  body: string
  fromMe: true
  mediaType: string
  mediaUrl: string
  ack: number
  createdAt: string
  isUploading: true
}

// Formatea Date a 'YYYY-MM-DDTHH:mm' para <input type="datetime-local"> (hora LOCAL del navegador)
const buildDefaultSendAt = (minutesAhead = 15): string => {
  const date = new Date(Date.now() + minutesAhead * 60_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function MessageInput({
  ticketId,
  ticketStatus,
  ticketChannel: _ticketChannel = 'whatsapp',
  onSendMessage,
  droppedFiles,
  onDroppedFilesHandled,
  contactId,
  contactName,
  contactNumber,
  whatsappId,
  whatsappName,
  replyingTo,
  onCancelReply,
  onMediaSendStart,
  onMediaSendProgress,
  onMediaSendEnd,
}: MessageInputProps) {
  const { user } = useAuth()
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [audioChunks, setAudioChunks] = useState<Blob[]>([])
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [quickMessages, setQuickMessages] = useState<QuickMessage[]>([])
  const [showQuickMessages, setShowQuickMessages] = useState(false)
  const [filteredQuickMessages, setFilteredQuickMessages] = useState<QuickMessage[]>([])
  const [selectedQuickMessage, setSelectedQuickMessage] = useState<QuickMessage | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isPrivateMode, setIsPrivateMode] = useState(false)
  const [useSignature, setUseSignature] = useState(false)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleUsers, setScheduleUsers] = useState<UserOption[]>([])
  const [scheduleQueues, setScheduleQueues] = useState<QueueOption[]>([])
  const [scheduleWhatsapps, setScheduleWhatsapps] = useState<WhatsappOption[]>([])
  const [scheduleContacts, setScheduleContacts] = useState<ContactOption[]>([])
  const [scheduleContactSearch, setScheduleContactSearch] = useState('')
  const [loadingScheduleContacts, setLoadingScheduleContacts] = useState(false)
  const [selectedScheduleContact, setSelectedScheduleContact] = useState<ContactOption | null>(null)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([])
  const [contactSearch, setContactSearch] = useState('')
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [selectedContactToShare, setSelectedContactToShare] = useState<ContactOption | null>(null)
  const [sendingContact, setSendingContact] = useState(false)
  const [scheduleFile, setScheduleFile] = useState<File | null>(null)
  const [scheduleForm, setScheduleForm] = useState({
    body: '',
    sendAt: '',
    contactId: 0,
    whatsappId: 0,
    openTicket: 'disabled',
    statusTicket: 'closed',
    ticketUserId: 0,
    queueId: 0,
    intervalo: 1,
    valorIntervalo: 0,
    enviarQuantasVezes: 1,
    tipoDias: 4,
    contadorEnvio: 0,
    assinar: false,
  })

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const scheduleBodyRef = useRef<HTMLTextAreaElement>(null)
  const canManageSignature = user?.profile === 'admin'
  const signatureLockedOn = Boolean(user && !canManageSignature)
  const signatureStorageKey = user?.id ? `chat-signature-enabled-${user.id}` : 'chat-signature-enabled'
  const isWhatsAppChannel = _ticketChannel === 'whatsapp'

  // Solo permite escribir cuando el ticket está abierto o es grupo
  // `isDisabled` se usa para bloqueos por estado del ticket (cerrado, etc.).
  // NO incluye `loading` para que el textarea conserve el foco durante el envío
  // y el operador pueda seguir escribiendo el siguiente mensaje sin re-clickear.
  // El botón "Enviar" y la tecla Enter ya consultan `loading` por separado para
  // evitar doble click / doble Enter durante un envío en curso.
  const isDisabled = ticketStatus !== 'open' && ticketStatus !== 'group'

  const getContactOptionLabel = (option: ContactOption) => {
    const connectionName = option.whatsapp?.name
    return `${option.name} - ${option.number}${connectionName ? ` · ${connectionName}` : ''}`
  }

  // Fetch quick messages solo cuando se necesita (al escribir "/")
  const fetchQuickMessages = async () => {
    if (quickMessages.length > 0) return // Ya están cargados
    try {
      const { data } = await api.get('/quick-messages')
      const records = data.records || []
      const messages = records.map((m: any) => ({
        id: m.id,
        value: m.message,
        label: `/${m.shortcode} - ${(m.message || '').substring(0, 50)}...`,
        shortcode: m.shortcode,
        hasMedia: Boolean(m.mediaPath && m.mediaName),
        mediaName: m.mediaName || undefined,
      }))
      setQuickMessages(messages)
    } catch (error) {
      console.error('Error fetching quick messages:', error)
    }
  }

  const appendSelectedFiles = useCallback((files: File[]) => {
    const validFiles = files.filter((file) => file.size > 0)
    if (validFiles.length === 0) return

    setSelectedFiles((prev) => [...prev, ...validFiles])
    setSelectedQuickMessage(null)
    inputRef.current?.focus()
  }, [])

  // Handle files dropped from the chat area
  useEffect(() => {
    if (!droppedFiles || droppedFiles.length === 0) return

    appendSelectedFiles(droppedFiles)
    onDroppedFilesHandled?.()
  }, [appendSelectedFiles, droppedFiles, onDroppedFilesHandled])

  // Filter quick messages when typing /
  useEffect(() => {
    if (message.startsWith('/')) {
      // Cargar quick messages solo cuando se escribe "/"
      fetchQuickMessages()
      const search = message.toLowerCase()
      const filtered = quickMessages.filter(
        (m) => m.label.toLowerCase().includes(search) || `/${m.shortcode}`.includes(search)
      )
      setFilteredQuickMessages(filtered)
      setShowQuickMessages(filtered.length > 0 || quickMessages.length === 0) // Mostrar mientras carga
    } else {
      setShowQuickMessages(false)
    }
  }, [message, quickMessages])

  useEffect(() => {
    if (selectedQuickMessage && message !== selectedQuickMessage.value) {
      setSelectedQuickMessage(null)
    }
  }, [message, selectedQuickMessage])

  useEffect(() => {
    if (signatureLockedOn) {
      setUseSignature(true)
      return
    }

    // Firma ACTIVADA por defecto: si el usuario nunca eligió (sin valor guardado)
    // arranca en ON. Solo queda OFF si lo apagó explícitamente antes (= 'false').
    const saved = localStorage.getItem(signatureStorageKey)
    setUseSignature(saved === null ? true : saved === 'true')
  }, [signatureLockedOn, signatureStorageKey])

  const handleToggleSignature = () => {
    if (!canManageSignature) return

    setUseSignature((current) => {
      const next = !current
      localStorage.setItem(signatureStorageKey, String(next))
      return next
    })
    inputRef.current?.focus()
  }

  // Close emoji picker on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmoji(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [ticketId])

  useEffect(() => {
    if (!scheduleModalOpen) return

    const defaultContact = contactId && contactName
      ? { id: contactId, name: contactName, number: contactNumber || '' }
      : null

    setSelectedScheduleContact(defaultContact)
    setScheduleContacts(defaultContact ? [defaultContact] : [])
    setScheduleContactSearch(defaultContact?.name || '')
    setScheduleFile(null)
    setScheduleForm({
      body: message,
      sendAt: buildDefaultSendAt(15),
      contactId: defaultContact?.id || 0,
      whatsappId: whatsappId || 0,
      openTicket: 'disabled',
      statusTicket: 'closed',
      ticketUserId: 0,
      queueId: 0,
      intervalo: 1,
      valorIntervalo: 0,
      enviarQuantasVezes: 1,
      tipoDias: 4,
      contadorEnvio: 0,
      assinar: false,
    })

    const loadScheduleOptions = async () => {
      try {
        const [usersRes, queuesRes, whatsappsRes] = await Promise.all([
          api.get('/users'),
          api.get('/queues'),
          api.get('/whatsapps'),
        ])

        setScheduleUsers(usersRes.data.users || usersRes.data || [])
        setScheduleQueues(queuesRes.data.queues || queuesRes.data || [])
        setScheduleWhatsapps(whatsappsRes.data.whatsapps || whatsappsRes.data || [])
      } catch (error) {
        console.error('Error loading schedule modal options:', error)
        toast.error('No se pudieron cargar usuarios, colas o conexiones')
      }
    }

    loadScheduleOptions()
  }, [scheduleModalOpen, contactId, contactName, contactNumber, whatsappId, message])

  // Asegura que cuando las conexiones cargan después, el whatsappId precargado
  // siga apareciendo seleccionado en el Select (MUI Joy hace match por value exacto).
  useEffect(() => {
    if (!scheduleModalOpen) return
    if (!whatsappId || scheduleWhatsapps.length === 0) return
    setScheduleForm(prev => {
      if (prev.whatsappId === whatsappId) return prev
      const exists = scheduleWhatsapps.some(w => w.id === whatsappId)
      if (!exists) return prev
      return { ...prev, whatsappId }
    })
  }, [scheduleModalOpen, scheduleWhatsapps, whatsappId])

  useEffect(() => {
    if (!scheduleModalOpen) return
    if (scheduleContactSearch.length < 2 || (selectedScheduleContact && scheduleContactSearch === selectedScheduleContact.name)) return

    const timeout = setTimeout(async () => {
      try {
        setLoadingScheduleContacts(true)
        const response = await api.get('/contacts', {
          params: { searchParam: scheduleContactSearch, pageNumber: 1 },
        })
        setScheduleContacts(response.data.contacts || response.data || [])
      } catch (error) {
        console.error('Error searching contacts for schedule modal:', error)
      } finally {
        setLoadingScheduleContacts(false)
      }
    }, 300)

    return () => clearTimeout(timeout)
  }, [scheduleModalOpen, scheduleContactSearch, selectedScheduleContact])

  useEffect(() => {
    if (!contactModalOpen) return

    setContactSearch('')
    setContactOptions([])
    setSelectedContactToShare(null)
  }, [contactModalOpen, ticketId])

  useEffect(() => {
    if (!contactModalOpen) return
    if (contactSearch.length < 2 || (selectedContactToShare && contactSearch === selectedContactToShare.name)) return

    const timeout = setTimeout(async () => {
      try {
        setLoadingContacts(true)
        const response = await api.get('/contacts', {
          params: { searchParam: contactSearch, pageNumber: 1 },
        })
        setContactOptions(response.data.contacts || response.data || [])
      } catch (error) {
        console.error('Error searching contacts to share:', error)
      } finally {
        setLoadingContacts(false)
      }
    }, 300)

    return () => clearTimeout(timeout)
  }, [contactModalOpen, contactSearch, selectedContactToShare])

  const handleSendMessage = async () => {
    if (message.trim() === '' && selectedFiles.length === 0) return

    // Optimistic UI: capturamos los datos y limpiamos input + restauramos foco INMEDIATAMENTE
    // para que el operador pueda seguir escribiendo el siguiente mensaje sin esperar la red.
    const messageToSend = message
    const filesToSend = selectedFiles
    const quickMessageToSend = selectedQuickMessage
    const replyingToSend = replyingTo
    const wasPrivateMode = isPrivateMode
    const shouldSignMessage = useSignature && !wasPrivateMode

    setMessage('')
    setSelectedFiles([])
    setSelectedQuickMessage(null)
    if (onCancelReply) onCancelReply()
    // Devolver el foco al textarea en el siguiente tick (después del re-render)
    setTimeout(() => inputRef.current?.focus(), 0)

    setLoading(true)

    // IDs de los placeholders optimistas de media en vuelo (para retirarlos al terminar)
    let uploadTempIds: string[] = []

    try {
      const shouldSendQuickMessageWithMedia =
        Boolean(quickMessageToSend?.hasMedia) &&
        filesToSend.length === 0 &&
        !wasPrivateMode &&
        !replyingToSend &&
        _ticketChannel === 'whatsapp' &&
        messageToSend === quickMessageToSend?.value

      if (shouldSendQuickMessageWithMedia && quickMessageToSend) {
        await api.post(`/messages/quick/${ticketId}`, {
          quickMessageId: quickMessageToSend.id,
          ...(shouldSignMessage && { signMessage: true }),
        })
      } else if (filesToSend.length > 0) {
        // Send files
        const formData = new FormData()
        formData.append('fromMe', 'true')
        if (wasPrivateMode) formData.append('isPrivate', 'true')
        if (shouldSignMessage) formData.append('signMessage', 'true')
        if (replyingToSend) formData.append('quotedMsgId', String(replyingToSend.id))
        filesToSend.forEach((file) => {
          formData.append('medias', file)
          formData.append('body', messageToSend || file.name)
        })

        // ── UI optimista: pintar placeholders con preview local + "enviando" ──
        // (no para notas privadas, que no se renderizan en la conversación)
        if (!wasPrivateMode) {
          const placeholders: OptimisticMediaMessage[] = filesToSend.map((file, i) => {
            const t = file.type || ''
            const category = t.startsWith('video')
              ? 'video'
              : t.startsWith('image')
                ? 'image'
                : t.startsWith('audio')
                  ? 'audio'
                  : 'application'
            return {
              id: `pending_${Date.now()}_${i}`,
              tempId: `pending_${Date.now()}_${i}`,
              body: messageToSend || file.name,
              fromMe: true,
              mediaType: category,
              mediaUrl: URL.createObjectURL(file),
              ack: 0,
              createdAt: new Date().toISOString(),
              isUploading: true,
            }
          })
          uploadTempIds = placeholders.map((p) => p.id)
          onMediaSendStart?.(placeholders)
        }

        await api.post(`/messages/${ticketId}`, formData, {
          onUploadProgress: (evt) => {
            if (uploadTempIds.length === 0 || !evt.total) return
            const percent = Math.min(99, Math.round((evt.loaded / evt.total) * 100))
            onMediaSendProgress?.(uploadTempIds, percent)
          },
        })
      } else {
        // Send text message
        await api.post(`/messages/${ticketId}`, {
          body: messageToSend,
          fromMe: true,
          ...(shouldSignMessage && { signMessage: true }),
          ...(wasPrivateMode && { isPrivate: 'true' }),
          ...(replyingToSend && { quotedMsg: { id: replyingToSend.id } }),
        })
      }

      if (onSendMessage) {
        onSendMessage(messageToSend)
      }
      // Subida OK: retiramos los placeholders; el mensaje real ya llegó (o llega
      // en milisegundos) por socket. success=true.
      if (uploadTempIds.length > 0) onMediaSendEnd?.(uploadTempIds, true)
    } catch (error) {
      console.error('Error sending message:', error)
      toast.error('No se pudo enviar el mensaje. Revisa tu conexión e intenta de nuevo.')
      // Rollback optimistic: solo restauramos el texto si el textarea está vacío
      // (si el usuario ya empezó a escribir el siguiente mensaje, NO pisamos su input)
      setMessage((current) => (current.trim() === '' ? messageToSend : current))
      // Si había archivos seleccionados, los devolvemos para que el operador reintente
      if (filesToSend.length > 0) setSelectedFiles(filesToSend)
      // Retiramos los placeholders fallidos del chat. success=false.
      if (uploadTempIds.length > 0) onMediaSendEnd?.(uploadTempIds, false)
    } finally {
      setLoading(false)
      // Re-asegurar foco después de que loading vuelva a false
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!loading && !isDisabled) {
        handleSendMessage()
      }
    }
  }

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessage((prev) => prev + emojiData.emoji)
    inputRef.current?.focus()
  }

  const handleQuickMessageClick = (qm: QuickMessage) => {
    setSelectedQuickMessage(qm)
    setMessage(qm.value)
    setShowQuickMessages(false)
    inputRef.current?.focus()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files))
    }
    setAnchorEl(null)
  }

  const handleOpenContactModal = () => {
    setAnchorEl(null)

    if (isPrivateMode) {
      toast.error('No se puede enviar una tarjeta de contacto como nota interna')
      return
    }

    if (!isWhatsAppChannel) {
      toast.error('El envío de contacto está disponible solo para WhatsApp')
      return
    }

    setContactModalOpen(true)
  }

  const handleCloseContactModal = () => {
    if (sendingContact) return
    setContactModalOpen(false)
  }

  const handleSendContactCard = async () => {
    if (!selectedContactToShare) {
      toast.error('Selecciona un contacto')
      return
    }

    try {
      setSendingContact(true)
      await api.post(`/messages/${ticketId}`, {
        vCardId: selectedContactToShare.id,
        fromMe: true,
        ...(replyingTo && { quotedMsg: { id: replyingTo.id } }),
      })

      setContactModalOpen(false)
      if (onCancelReply) onCancelReply()
      if (onSendMessage) onSendMessage(`Contacto: ${selectedContactToShare.name}`)
      setTimeout(() => inputRef.current?.focus(), 0)
    } catch (error) {
      console.error('Error sending contact card:', error)
      toast.error(getApiErrorMessage(error, 'No se pudo enviar el contacto'))
    } finally {
      setSendingContact(false)
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    if (isDisabled) return

    const clipboard = e.clipboardData
    const directFiles = Array.from(clipboard.files || [])
    const itemFiles = Array.from(clipboard.items || [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))

    const files = directFiles.length > 0 ? directFiles : itemFiles
    if (files.length === 0) return

    e.preventDefault()
    appendSelectedFiles(files)
  }

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const formatFileSize = (size: number) => {
    if (!size) return '0 KB'
    if (size < 1024 * 1024) return Math.max(1, Math.round(size / 1024)) + ' KB'
    return (size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0) + ' MB'
  }

  const getSelectedFileMeta = (file: File) => {
    const type = file.type.toLowerCase()
    const name = file.name.toLowerCase()

    if (type.startsWith('image/')) {
      return {
        label: 'Imagen lista para enviar',
        icon: <ImageIcon sx={{ fontSize: 20 }} />,
        color: '#0EA5E9',
        bg: 'rgba(14,165,233,0.10)',
        border: 'rgba(14,165,233,0.35)',
      }
    }

    if (type.startsWith('video/')) {
      return {
        label: 'Video listo para enviar',
        icon: <VideoIcon sx={{ fontSize: 20 }} />,
        color: '#7C3AED',
        bg: 'rgba(124,58,237,0.10)',
        border: 'rgba(124,58,237,0.35)',
      }
    }

    if (type.startsWith('audio/')) {
      return {
        label: 'Audio listo para enviar',
        icon: <AudioFileIcon sx={{ fontSize: 20 }} />,
        color: '#059669',
        bg: 'rgba(5,150,105,0.10)',
        border: 'rgba(5,150,105,0.35)',
      }
    }

    if (type.includes('pdf') || name.endsWith('.pdf')) {
      return {
        label: 'PDF listo para enviar',
        icon: <PdfIcon sx={{ fontSize: 20 }} />,
        color: '#DC2626',
        bg: 'rgba(220,38,38,0.10)',
        border: 'rgba(220,38,38,0.35)',
      }
    }

    return {
      label: 'Archivo listo para enviar',
      icon: <GenericFileIcon sx={{ fontSize: 20 }} />,
      color: '#64748B',
      bg: 'rgba(100,116,139,0.10)',
      border: 'rgba(100,116,139,0.35)',
    }
  }

  // Audio recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []

      recorder.ondataavailable = (e) => {
        chunks.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/mp3' })
        setAudioChunks([blob])
        stream.getTracks().forEach((track) => track.stop())
      }

      recorder.start()
      setMediaRecorder(recorder)
      setRecording(true)
      setRecordingTime(0)

      // Start timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    } catch (error) {
      console.error('Error starting recording:', error)
    }
  }

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop()
      setRecording(false)
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
    }
  }

  const cancelRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop()
      setRecording(false)
      setAudioChunks([])
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
    }
  }

  const sendAudio = async () => {
    if (audioChunks.length === 0) return
    setLoading(true)

    try {
      const formData = new FormData()
      const filename = `${Date.now()}.mp3`
      formData.append('medias', audioChunks[0], filename)
      formData.append('body', filename)
      formData.append('fromMe', 'true')

      await api.post(`/messages/${ticketId}`, formData)
      setAudioChunks([])
    } catch (error) {
      console.error('Error sending audio:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleOpenScheduleModal = () => {
    setScheduleModalOpen(true)
    // Foco automático en el textarea del mensaje (espera el render del Modal)
    setTimeout(() => {
      scheduleBodyRef.current?.focus()
    }, 80)
  }

  const handleCloseScheduleModal = () => {
    if (scheduleLoading) return
    setScheduleModalOpen(false)
  }

  const validateScheduleForm = () => {
    if (!scheduleForm.body.trim()) {
      toast.error('Escribe el mensaje a programar')
      return false
    }
    if (!scheduleForm.sendAt) {
      toast.error('Selecciona la fecha y hora de envío')
      return false
    }
    const sendAtDate = new Date(scheduleForm.sendAt)
    if (Number.isNaN(sendAtDate.getTime())) {
      toast.error('La fecha de envío no es válida')
      return false
    }
    if (sendAtDate.getTime() <= Date.now()) {
      toast.error('La fecha debe ser futura')
      return false
    }
    if (!scheduleForm.contactId) {
      toast.error('Selecciona un contacto')
      return false
    }
    if (!scheduleForm.whatsappId) {
      toast.error('Selecciona una conexión')
      return false
    }
    if (scheduleForm.valorIntervalo > 0 && scheduleForm.enviarQuantasVezes < 2) {
      toast.error('Si configuras recurrencia, la cantidad de envíos debe ser al menos 2')
      return false
    }
    return true
  }

  const handleCreateScheduledMessage = async () => {
    if (!validateScheduleForm()) return

    try {
      setScheduleLoading(true)
      // Convertir 'YYYY-MM-DDTHH:mm' local a ISO 8601 UTC para evitar ambigüedades
      const sendAtIso = new Date(scheduleForm.sendAt).toISOString()
      const payload = {
        body: scheduleForm.body.trim(),
        sendAt: sendAtIso,
        contactId: scheduleForm.contactId,
        ticketId,
        userId: user?.id,
        whatsappId: scheduleForm.whatsappId || undefined,
        openTicket: scheduleForm.openTicket,
        statusTicket: scheduleForm.statusTicket,
        ticketUserId: scheduleForm.openTicket === 'enabled' && scheduleForm.ticketUserId > 0 ? scheduleForm.ticketUserId : undefined,
        queueId: scheduleForm.openTicket === 'enabled' && scheduleForm.queueId > 0 ? scheduleForm.queueId : undefined,
        intervalo: scheduleForm.intervalo,
        valorIntervalo: Math.max(0, scheduleForm.valorIntervalo),
        enviarQuantasVezes: Math.max(1, scheduleForm.enviarQuantasVezes),
        tipoDias: scheduleForm.tipoDias,
        contadorEnvio: scheduleForm.contadorEnvio,
        assinar: scheduleForm.assinar,
      }

      const { data } = await api.post('/schedules', payload)

      if (scheduleFile) {
        const formData = new FormData()
        formData.append('typeArch', 'schedule')
        formData.append('file', scheduleFile)
        await api.post(`/schedules/${data.id}/media-upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }

      toast.success('Mensaje programado correctamente')
      setScheduleModalOpen(false)
    } catch (error) {
      console.error('Error creating scheduled message from ticket chat:', error)
      toast.error(getApiErrorMessage(error, 'Error al programar el mensaje'))
    } finally {
      setScheduleLoading(false)
    }
  }

  const isTikTokChannel = _ticketChannel === 'tiktok'

  return (
    <Box sx={{ position: 'relative' }}>
      {/* Alerta TikTok: solo lectura */}
      {isTikTokChannel && (
        <Alert
          color="warning"
          variant="soft"
          sx={{ mx: 1, mt: 1, borderRadius: 'sm' }}
        >
          <Typography level="body-sm">
            TikTok no permite responder comentarios via API. Usa el boton &quot;Abrir en TikTok&quot; en el comentario para responder. Aqui solo puedes escribir notas internas.
          </Typography>
        </Alert>
      )}
      {/* Quick Messages Popup */}
      {showQuickMessages && (
        <Box
          sx={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            bgcolor: 'background.surface',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 'sm',
            maxHeight: 200,
            overflow: 'auto',
            zIndex: 1000,
            mb: 1,
          }}
        >
          {filteredQuickMessages.map((qm) => (
            <Box
              key={qm.id}
              sx={{
                p: 1,
                cursor: 'pointer',
                '&:hover': { bgcolor: 'background.level1' },
              }}
              onClick={() => handleQuickMessageClick(qm)}
            >
              <Typography level="body-sm">{qm.label}</Typography>
              {qm.hasMedia && (
                <Typography level="body-xs" sx={{ color: 'warning.600' }}>
                  Incluye adjunto{qm.mediaName ? `: ${qm.mediaName}` : ''}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Selected Files Preview */}
      {selectedFiles.length > 0 && (
        <Box
          sx={(theme) => ({
            px: 1.25,
            py: 1,
            borderTop: '1px solid',
            borderBottom: '1px solid',
            borderColor: theme.palette.mode === 'dark' ? 'rgba(91,194,210,0.24)' : 'rgba(91,194,210,0.28)',
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(91,194,210,0.08)' : 'rgba(91,194,210,0.06)',
          })}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75, gap: 1 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
              <UploadFileIcon sx={{ fontSize: 18, color: '#3B8E9A' }} />
              <Typography level="body-xs" sx={{ fontWeight: 700, color: '#3B8E9A' }}>
                {selectedFiles.length === 1 ? 'Adjunto preparado' : selectedFiles.length + ' adjuntos preparados'}
              </Typography>
            </Stack>
            <Typography level="body-xs" sx={{ color: 'text.tertiary', whiteSpace: 'nowrap' }}>
              Presiona enviar para compartir
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
            {selectedFiles.map((file, index) => {
              const meta = getSelectedFileMeta(file)
              return (
                <Box
                  key={file.name + '-' + file.lastModified + '-' + index}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    minWidth: 220,
                    maxWidth: { xs: '100%', sm: 360 },
                    px: 1,
                    py: 0.75,
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: meta.border,
                    bgcolor: meta.bg,
                  }}
                >
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: meta.color,
                      bgcolor: 'rgba(255,255,255,0.72)',
                      flexShrink: 0,
                    }}
                  >
                    {meta.icon}
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography level="body-xs" sx={{ fontWeight: 700, color: meta.color, lineHeight: 1.2 }}>
                      {meta.label}
                    </Typography>
                    <Typography level="body-xs" noWrap sx={{ color: 'text.secondary', lineHeight: 1.25 }}>
                      {file.name}
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary', lineHeight: 1.2 }}>
                      {formatFileSize(file.size)}
                    </Typography>
                  </Box>
                  <Tooltip title="Quitar adjunto">
                    <IconButton
                      size="sm"
                      variant="plain"
                      color="neutral"
                      onClick={() => handleRemoveFile(index)}
                      aria-label="Quitar adjunto"
                      sx={{ minWidth: 28, minHeight: 28, flexShrink: 0 }}
                    >
                      <CloseIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              )
            })}
          </Stack>
        </Box>
      )}

      {/* Reply Preview Bar */}
      {replyingTo && (
        <Box sx={{
          p: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderLeft: '4px solid #5BC2D2',
          bgcolor: (theme) => theme.palette.mode === 'dark'
            ? 'rgba(91,194,210,0.08)'
            : 'rgba(91,194,210,0.06)',
          borderBottom: '1px solid',
          borderColor: (theme) => theme.palette.mode === 'dark' ? '#3A3B3C' : '#DADDE1',
        }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography level="body-xs" sx={{ fontWeight: 700, color: '#5BC2D2' }}>
              {replyingTo.fromMe ? 'Tú' : replyingTo.contact?.name || 'Contacto'}
            </Typography>
            <Typography level="body-xs" noWrap sx={{
              color: (theme) => theme.palette.mode === 'dark' ? '#8A8D91' : '#65676B',
            }}>
              {replyingTo.body}
            </Typography>
          </Box>
          <IconButton size="sm" onClick={onCancelReply} aria-label="Cancelar respuesta">
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      )}

      {/* Emoji Picker */}
      {showEmoji && (
        <Box
          ref={emojiPickerRef}
          sx={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            zIndex: 1000,
            mb: 1,
          }}
        >
          <EmojiPicker onEmojiClick={handleEmojiClick} />
        </Box>
      )}

      {/* Main Input Area */}
      <Box
        sx={{
          p: 2,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.surface',
          minHeight: 62,
        }}
      >
        {recording ? (
          // Recording UI
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
            <IconButton color="danger" onClick={cancelRecording} aria-label="Cancelar grabación">
              <CancelIcon />
            </IconButton>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 1,
                bgcolor: 'danger.softBg',
                borderRadius: 'md',
              }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: 'danger.500',
                  animation: 'pulse 1s infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.5 },
                  },
                }}
              />
              <Typography level="body-sm">{formatTime(recordingTime)}</Typography>
            </Box>
            <IconButton color="success" onClick={stopRecording} aria-label="Detener grabación">
              <StopIcon />
            </IconButton>
          </Stack>
        ) : audioChunks.length > 0 ? (
          // Audio Preview UI
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
            <IconButton color="danger" onClick={() => setAudioChunks([])} aria-label="Descartar audio">
              <CancelIcon />
            </IconButton>
            <Typography level="body-sm">Audio grabado - {formatTime(recordingTime)}</Typography>
            <IconButton color="success" onClick={sendAudio} disabled={loading} aria-label="Enviar audio">
              {loading ? <CircularProgress size="sm" /> : <SendIcon />}
            </IconButton>
          </Stack>
        ) : (
          // Normal Input UI
          <Stack direction="row" spacing={1} alignItems="flex-end">
            {/* Emoji Button */}
            <Tooltip title="Emojis">
              <IconButton
                size="sm"
                variant="plain"
                disabled={isDisabled}
                onClick={() => setShowEmoji(!showEmoji)}
                aria-label="Emojis"
                sx={{
                  color: 'text.icon',
                  '&:hover': { bgcolor: 'transparent', color: 'primary.500' },
                }}
              >
                <EmojiIcon />
              </IconButton>
            </Tooltip>

            {/* Lock Button - Private Notes */}
            <Tooltip title={isPrivateMode ? 'Nota interna activa' : 'Nota interna'}>
              <IconButton
                size="sm"
                variant="plain"
                disabled={isDisabled}
                onClick={() => setIsPrivateMode(!isPrivateMode)}
                aria-label={isPrivateMode ? 'Nota interna activa' : 'Nota interna'}
                sx={{
                  color: isPrivateMode ? '#FFC107' : 'text.icon',
                  '&:hover': { bgcolor: 'transparent', color: '#FFC107' },
                }}
              >
                {isPrivateMode ? <LockIcon /> : <LockOpenIcon />}
              </IconButton>
            </Tooltip>

            {/* Signature Button — solo admin puede cambiar la firma */}
            {canManageSignature && (
              <Tooltip
                title={
                  useSignature
                    ? `Firma activa: se enviará "*${user?.name || 'Usuario'}:*" al inicio del mensaje. Click para desactivar.`
                    : 'Activar firma del agente al inicio del mensaje'
                }
              >
                <IconButton
                  size="sm"
                  variant="plain"
                  disabled={isDisabled || isPrivateMode}
                  onClick={handleToggleSignature}
                  sx={{
                    color: useSignature && !isPrivateMode ? '#10b981' : 'text.secondary',
                    bgcolor: useSignature && !isPrivateMode
                      ? 'rgba(16,185,129,0.12)'
                      : 'transparent',
                    border: '1px solid',
                    borderColor: useSignature && !isPrivateMode
                      ? 'rgba(16,185,129,0.45)'
                      : 'transparent',
                    '&:hover': {
                      bgcolor: useSignature && !isPrivateMode
                        ? 'rgba(16,185,129,0.18)'
                        : 'transparent',
                      color: '#10b981'
                    },
                  }}
                  aria-label={useSignature ? 'Desactivar firma' : 'Activar firma'}
                >
                  <SignatureIcon />
                </IconButton>
              </Tooltip>
            )}

            {/* Attach Button */}
            <Tooltip title="Adjuntar">
              <IconButton
                size="sm"
                variant="plain"
                disabled={isDisabled}
                onClick={(e) => setAnchorEl((prev) => (prev ? null : e.currentTarget))}
                aria-label="Adjuntar"
                sx={{
                  color: 'text.icon',
                  '&:hover': { bgcolor: 'transparent', color: 'primary.500' },
                }}
              >
                <AddIcon />
              </IconButton>
            </Tooltip>

            {/* Attach Menu */}
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={() => setAnchorEl(null)}
              placement="top-start"
            >
              <MenuItem
                onClick={() => {
                  setAnchorEl(null)
                  fileInputRef.current?.click()
                }}
              >
                <ListItemDecorator>
                  <ImageIcon />
                </ListItemDecorator>
                Imagen/Video
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAnchorEl(null)
                  fileInputRef.current?.click()
                }}
              >
                <ListItemDecorator>
                  <DocumentIcon />
                </ListItemDecorator>
                Documento
              </MenuItem>
              <MenuItem onClick={() => setAnchorEl(null)}>
                <ListItemDecorator>
                  <CameraIcon />
                </ListItemDecorator>
                Camara
              </MenuItem>
              <MenuItem onClick={handleOpenContactModal} disabled={isPrivateMode || !isWhatsAppChannel}>
                <ListItemDecorator>
                  <PersonIcon />
                </ListItemDecorator>
                Contacto
              </MenuItem>
            </Menu>

            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              multiple
              accept="image/*,video/*,audio/*,application/*"
              onChange={handleFileSelect}
            />

            {/* Message Input */}
            <Textarea
              slotProps={{
                textarea: {
                  ref: inputRef,
                },
              }}
              placeholder={
                isPrivateMode
                  ? 'Escribir nota interna...'
                  : ticketStatus === 'open' || ticketStatus === 'group'
                  ? 'Escribe un mensaje...'
                  : 'Ticket cerrado'
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onPaste={handlePaste}
              onKeyPress={handleKeyPress}
              minRows={1}
              maxRows={4}
              disabled={isDisabled}
              sx={{
                flex: 1,
                bgcolor: 'background.level1',
                borderRadius: '20px',
                border: isPrivateMode ? '2px solid #FFC107' : '2px solid transparent',
                '&:focus-within': {
                  boxShadow: isPrivateMode
                    ? '0 0 0 2px rgba(255,193,7,0.3)'
                    : (theme) => `0 0 0 2px ${theme.vars.palette.primary[500]}40`,
                },
                '& textarea': {
                  color: 'text.primary',
                },
                '& textarea::placeholder': {
                  color: 'text.tertiary',
                },
              }}
            />

            {/* Quick Messages Button */}
            <Tooltip title="Respuestas rapidas">
              <IconButton
                size="sm"
                variant="plain"
                disabled={isDisabled}
                onClick={() => setMessage('/')}
                aria-label="Respuestas rápidas"
                sx={{
                  color: 'text.icon',
                  '&:hover': { bgcolor: 'transparent', color: 'primary.500' },
                }}
              >
                <QuickIcon />
              </IconButton>
            </Tooltip>

            {/* Schedule Button */}
            <Tooltip title="Programar mensaje">
              <IconButton
                size="sm"
                variant="plain"
                disabled={isDisabled}
                onClick={handleOpenScheduleModal}
                aria-label="Programar mensaje"
                sx={{
                  color: 'text.icon',
                  '&:hover': { bgcolor: 'transparent', color: 'primary.500' },
                }}
              >
                <ScheduleIcon />
              </IconButton>
            </Tooltip>

            {/* Send or Record Button */}
            {message.trim() || selectedFiles.length > 0 ? (
              <IconButton
                variant="solid"
                color="primary"
                onClick={handleSendMessage}
                disabled={loading || isDisabled}
                aria-label="Enviar mensaje"
                sx={{
                  borderRadius: '50%',
                  width: 36,
                  height: 36,
                  bgcolor: '#5BC2D2',
                  '&:hover': { bgcolor: '#4BA8B6' },
                  '&:active': { bgcolor: '#3B8E9A' },
                }}
              >
                {loading ? <CircularProgress size="sm" /> : <SendIcon />}
              </IconButton>
            ) : (
              <Tooltip title="Grabar audio">
                <IconButton
                  size="sm"
                  variant="plain"
                  disabled={isDisabled}
                  onClick={startRecording}
                  aria-label="Grabar audio"
                  sx={{ color: 'text.icon' }}
                >
                  <MicIcon />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        )}
      </Box>

      <Modal open={contactModalOpen} onClose={handleCloseContactModal}>
        <ModalDialog sx={{ width: 'min(460px, calc(100vw - 32px))' }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 1 }}>
            Enviar contacto
          </Typography>

          <Stack spacing={2}>
            <FormControl>
              <FormLabel>Contacto</FormLabel>
              <Autocomplete
                placeholder="Buscar por nombre o número..."
                options={contactOptions}
                value={selectedContactToShare}
                onChange={(_event, value) => setSelectedContactToShare(value)}
                inputValue={contactSearch}
                onInputChange={(_event, value) => setContactSearch(value)}
                getOptionLabel={getContactOptionLabel}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                loading={loadingContacts}
                startDecorator={<PersonIcon />}
                endDecorator={loadingContacts ? <CircularProgress size="sm" /> : null}
                noOptionsText={contactSearch.length < 2 ? 'Escribe al menos 2 caracteres' : 'No se encontraron contactos'}
              />
            </FormControl>

            {selectedContactToShare && (
              <Box sx={{ p: 1.25, borderRadius: 'sm', bgcolor: 'background.level1' }}>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      bgcolor: '#25D366',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      flexShrink: 0,
                    }}
                  >
                    <PersonIcon sx={{ fontSize: 20 }} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography level="title-sm" noWrap>
                      {selectedContactToShare.name}
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      {selectedContactToShare.number}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            )}

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button variant="plain" color="neutral" onClick={handleCloseContactModal} disabled={sendingContact}>
                Cancelar
              </Button>
              <Button
                color="primary"
                loading={sendingContact}
                disabled={!selectedContactToShare}
                onClick={handleSendContactCard}
                startDecorator={<PersonIcon />}
              >
                Enviar
              </Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>

      <Modal open={scheduleModalOpen} onClose={handleCloseScheduleModal}>
        <ModalDialog sx={{ width: 'min(920px, calc(100vw - 32px))', maxHeight: '90vh', overflowY: 'auto' }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 0.5 }}>
            {contactName ? `Programar mensaje para ${contactName}` : 'Nuevo Mensaje Programado'}
          </Typography>
          {whatsappName && (
            <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 2 }}>
              Conexión: {whatsappName}
            </Typography>
          )}

          <Stack spacing={2}>
            <FormControl>
              <FormLabel>Mensaje</FormLabel>
              <Textarea
                slotProps={{ textarea: { ref: scheduleBodyRef } }}
                value={scheduleForm.body}
                onChange={(e) => setScheduleForm(prev => ({ ...prev, body: e.target.value }))}
                placeholder="Escribe el mensaje a enviar..."
                minRows={4}
                maxRows={8}
              />
            </FormControl>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <FormControl sx={{ flex: 1 }}>
                <FormLabel>Contacto</FormLabel>
                <Autocomplete
                  placeholder="Buscar por nombre o número..."
                  options={scheduleContacts}
                  value={selectedScheduleContact}
                  onChange={(_event, value) => {
                    setSelectedScheduleContact(value)
                    setScheduleForm(prev => ({ ...prev, contactId: value?.id || 0 }))
                  }}
                  inputValue={scheduleContactSearch}
                  onInputChange={(_event, value) => setScheduleContactSearch(value)}
                  getOptionLabel={getContactOptionLabel}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  loading={loadingScheduleContacts}
                  startDecorator={<PersonIcon />}
                  endDecorator={loadingScheduleContacts ? <CircularProgress size="sm" /> : null}
                  noOptionsText={scheduleContactSearch.length < 2 ? 'Escribe al menos 2 caracteres' : 'No se encontraron contactos'}
                />
              </FormControl>

              <FormControl sx={{ flex: 1 }}>
                <FormLabel>Fecha y Hora de Envío</FormLabel>
                <Input
                  type="datetime-local"
                  value={scheduleForm.sendAt}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, sendAt: e.target.value }))}
                />
              </FormControl>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <FormControl sx={{ flex: 1 }}>
                <FormLabel>Conexión</FormLabel>
                <Select
                  value={scheduleForm.whatsappId}
                  onChange={(_, value) => setScheduleForm(prev => ({ ...prev, whatsappId: Number(value) || 0 }))}
                >
                  <Option value={0}>Sin seleccionar</Option>
                  {scheduleWhatsapps.map((item) => (
                    <Option key={item.id} value={item.id}>
                      {item.name}
                    </Option>
                  ))}
                </Select>
              </FormControl>

              <FormControl sx={{ flex: 1 }}>
                <FormLabel>Abrir ticket</FormLabel>
                <Select
                  value={scheduleForm.openTicket}
                  onChange={(_, value) => setScheduleForm(prev => ({ ...prev, openTicket: (value as string) || 'disabled' }))}
                >
                  <Option value="enabled">Activado</Option>
                  <Option value="disabled">Desactivado</Option>
                </Select>
              </FormControl>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <FormControl sx={{ flex: 1 }}>
                <FormLabel>Usuario asignado al ticket</FormLabel>
                <Select
                  value={scheduleForm.ticketUserId}
                  disabled={scheduleForm.openTicket !== 'enabled'}
                  onChange={(_, value) => setScheduleForm(prev => ({ ...prev, ticketUserId: Number(value) || 0 }))}
                >
                  <Option value={0}>Sin asignar</Option>
                  {scheduleUsers.map((item) => (
                    <Option key={item.id} value={item.id}>
                      {item.name}
                    </Option>
                  ))}
                </Select>
              </FormControl>

              <FormControl sx={{ flex: 1 }}>
                <FormLabel>Transferir para departamentos</FormLabel>
                <Select
                  value={scheduleForm.queueId}
                  disabled={scheduleForm.openTicket !== 'enabled'}
                  onChange={(_, value) => setScheduleForm(prev => ({ ...prev, queueId: Number(value) || 0 }))}
                >
                  <Option value={0}>Sin departamento</Option>
                  {scheduleQueues.map((item) => (
                    <Option key={item.id} value={item.id}>
                      {item.name}
                    </Option>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <FormControl sx={{ flex: 1 }}>
                <FormLabel>Status del ticket</FormLabel>
                <Select
                  value={scheduleForm.statusTicket}
                  disabled={scheduleForm.openTicket !== 'enabled'}
                  onChange={(_, value) => setScheduleForm(prev => ({ ...prev, statusTicket: (value as string) || 'closed' }))}
                >
                  <Option value="open">Abierto</Option>
                  <Option value="closed">Cerrado</Option>
                </Select>
              </FormControl>

              <FormControl sx={{ flex: 1 }}>
                <FormLabel>Adjunto</FormLabel>
                <Input
                  type="file"
                  startDecorator={<UploadFileIcon />}
                  onChange={(event) => setScheduleFile(event.target.files?.[0] || null)}
                />
              </FormControl>
            </Stack>

            <Stack direction="row" spacing={1.5} alignItems="center">
              <Switch
                checked={scheduleForm.assinar}
                onChange={(e) => setScheduleForm(prev => ({ ...prev, assinar: e.target.checked }))}
              />
              <Box>
                <Typography level="body-sm">Enviar firma</Typography>
                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                  Usa la opción de firma del backend al momento del envío.
                </Typography>
              </Box>
            </Stack>

            <Box sx={{ p: 2, borderRadius: 'sm', bgcolor: 'background.level1' }}>
              <Typography level="title-sm" sx={{ mb: 0.5 }}>
                Recurrencia
              </Typography>
              <Typography level="body-sm" sx={{ color: 'text.secondary', mb: 1.5 }}>
                Si no quieres recurrencia, deja el valor del intervalo en 0 y la cantidad de envíos en 1.
              </Typography>

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
                <FormControl sx={{ flex: 1 }}>
                  <FormLabel>Intervalo</FormLabel>
                  <Select
                    value={scheduleForm.intervalo}
                    onChange={(_, value) => setScheduleForm(prev => ({ ...prev, intervalo: Number(value) || 1 }))}
                  >
                    <Option value={1}>Días</Option>
                    <Option value={2}>Semanas</Option>
                    <Option value={3}>Meses</Option>
                    <Option value={4}>Minutos</Option>
                  </Select>
                </FormControl>

                <FormControl sx={{ flex: 1 }}>
                  <FormLabel>Rango valor</FormLabel>
                  <Input
                    type="number"
                    value={scheduleForm.valorIntervalo}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, valorIntervalo: Math.max(0, Number(e.target.value) || 0) }))}
                  />
                </FormControl>

                <FormControl sx={{ flex: 1 }}>
                  <FormLabel>Enviar cuántas veces</FormLabel>
                  <Input
                    type="number"
                    value={scheduleForm.enviarQuantasVezes}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, enviarQuantasVezes: Math.max(1, Number(e.target.value) || 1) }))}
                  />
                </FormControl>
              </Stack>

              <FormControl>
                <FormLabel>Comportamiento en días no laborables</FormLabel>
                <Select
                  value={scheduleForm.tipoDias}
                  onChange={(_, value) => setScheduleForm(prev => ({ ...prev, tipoDias: Number(value) || 4 }))}
                >
                  <Option value={4}>Enviar normalmente en días no laborables</Option>
                  <Option value={5}>Enviar un día laborable antes</Option>
                  <Option value={6}>Enviar un día laborable después</Option>
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ p: 2, bgcolor: 'background.level1', borderRadius: 'sm' }}>
              <Typography level="body-sm">
                <strong>Vista previa:</strong>
                <br />
                {selectedScheduleContact
                  ? `Contacto: ${selectedScheduleContact.name} (${selectedScheduleContact.number})`
                  : 'Contacto: no seleccionado'}
                <br />
                {scheduleWhatsapps.find(item => item.id === scheduleForm.whatsappId)?.name
                  ? `Conexión: ${scheduleWhatsapps.find(item => item.id === scheduleForm.whatsappId)?.name}`
                  : 'Conexión: no seleccionada'}
              </Typography>
            </Box>

            <Button color="primary" loading={scheduleLoading} onClick={handleCreateScheduledMessage}>
              Programar Mensaje
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>
    </Box>
  )
}
