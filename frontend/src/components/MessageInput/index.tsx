import { useState, useRef, useEffect } from 'react'
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
  Chip,
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
  Videocam as _VideoIcon,
  Schedule as ScheduleIcon,
  FlashOn as QuickIcon,
  Add as AddIcon,
  CheckCircle as _CheckIcon,
  Cancel as CancelIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  UploadFile as UploadFileIcon,
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
  contactId?: number
  contactName?: string
  contactNumber?: string
  whatsappId?: number | null
  replyingTo?: Message
  onCancelReply?: () => void
}

export default function MessageInput({
  ticketId,
  ticketStatus,
  ticketChannel: _ticketChannel = 'whatsapp',
  onSendMessage,
  droppedFiles,
  contactId,
  contactName,
  contactNumber,
  whatsappId,
  replyingTo,
  onCancelReply,
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
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleUsers, setScheduleUsers] = useState<UserOption[]>([])
  const [scheduleQueues, setScheduleQueues] = useState<QueueOption[]>([])
  const [scheduleWhatsapps, setScheduleWhatsapps] = useState<WhatsappOption[]>([])
  const [scheduleContacts, setScheduleContacts] = useState<ContactOption[]>([])
  const [scheduleContactSearch, setScheduleContactSearch] = useState('')
  const [loadingScheduleContacts, setLoadingScheduleContacts] = useState(false)
  const [selectedScheduleContact, setSelectedScheduleContact] = useState<ContactOption | null>(null)
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

  // Solo permite escribir cuando el ticket está abierto o es grupo
  const isDisabled = loading || (ticketStatus !== 'open' && ticketStatus !== 'group')

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

  // Handle dropped files
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      setSelectedFiles(droppedFiles)
    }
  }, [droppedFiles])

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
      sendAt: '',
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

  const handleSendMessage = async () => {
    if (message.trim() === '' && selectedFiles.length === 0) return
    setLoading(true)

    try {
      const shouldSendQuickMessageWithMedia =
        Boolean(selectedQuickMessage?.hasMedia) &&
        selectedFiles.length === 0 &&
        !isPrivateMode &&
        !replyingTo &&
        _ticketChannel === 'whatsapp' &&
        message === selectedQuickMessage?.value

      if (shouldSendQuickMessageWithMedia && selectedQuickMessage) {
        await api.post(`/messages/quick/${ticketId}`, {
          quickMessageId: selectedQuickMessage.id,
        })
      } else if (selectedFiles.length > 0) {
        // Send files
        const formData = new FormData()
        formData.append('fromMe', 'true')
        if (isPrivateMode) formData.append('isPrivate', 'true')
        if (replyingTo) formData.append('quotedMsgId', String(replyingTo.id))
        selectedFiles.forEach((file) => {
          formData.append('medias', file)
          formData.append('body', message || file.name)
        })
        await api.post(`/messages/${ticketId}`, formData)
        setSelectedFiles([])
      } else {
        // Send text message
        await api.post(`/messages/${ticketId}`, {
          body: message,
          fromMe: true,
          ...(isPrivateMode && { isPrivate: 'true' }),
          ...(replyingTo && { quotedMsg: { id: replyingTo.id } }),
        })
      }

      if (onSendMessage) {
        onSendMessage(message)
      }

      if (onCancelReply) onCancelReply()
      setMessage('')
      setSelectedQuickMessage(null)
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setLoading(false)
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

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
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
      const payload = {
        body: scheduleForm.body.trim(),
        sendAt: scheduleForm.sendAt,
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
          sx={{
            p: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          {selectedFiles.map((file, index) => (
            <Chip
              key={index}
              size="sm"
              variant="soft"
              endDecorator={
                <CloseIcon
                  sx={{ fontSize: 16, cursor: 'pointer' }}
                  onClick={() => handleRemoveFile(index)}
                />
              }
            >
              {file.name.length > 20 ? file.name.substring(0, 20) + '...' : file.name}
            </Chip>
          ))}
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
          <IconButton size="sm" onClick={onCancelReply}>
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
            <IconButton color="danger" onClick={cancelRecording}>
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
            <IconButton color="success" onClick={stopRecording}>
              <StopIcon />
            </IconButton>
          </Stack>
        ) : audioChunks.length > 0 ? (
          // Audio Preview UI
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
            <IconButton color="danger" onClick={() => setAudioChunks([])}>
              <CancelIcon />
            </IconButton>
            <Typography level="body-sm">Audio grabado - {formatTime(recordingTime)}</Typography>
            <IconButton color="success" onClick={sendAudio} disabled={loading}>
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
                sx={{
                  color: 'text.secondary',
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
                sx={{
                  color: isPrivateMode ? '#FFC107' : 'text.secondary',
                  '&:hover': { bgcolor: 'transparent', color: '#FFC107' },
                }}
              >
                {isPrivateMode ? <LockIcon /> : <LockOpenIcon />}
              </IconButton>
            </Tooltip>

            {/* Attach Button */}
            <Tooltip title="Adjuntar">
              <IconButton
                size="sm"
                variant="plain"
                disabled={isDisabled}
                onClick={(e) => setAnchorEl((prev) => (prev ? null : e.currentTarget))}
                sx={{
                  color: 'text.secondary',
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
              <MenuItem onClick={() => setAnchorEl(null)}>
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
                sx={{
                  color: 'text.secondary',
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
                sx={{
                  color: 'text.secondary',
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
                >
                  <MicIcon />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        )}
      </Box>

      <Modal open={scheduleModalOpen} onClose={handleCloseScheduleModal}>
        <ModalDialog sx={{ width: 'min(920px, calc(100vw - 32px))', maxHeight: '90vh', overflowY: 'auto' }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            Nuevo Mensaje Programado
          </Typography>

          <Stack spacing={2}>
            <FormControl>
              <FormLabel>Mensaje</FormLabel>
              <Textarea
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
                  getOptionLabel={(option) => `${option.name} - ${option.number}`}
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
