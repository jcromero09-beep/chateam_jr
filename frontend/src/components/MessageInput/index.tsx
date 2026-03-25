import { useState, useRef, useEffect } from 'react'
import {
  Box,
  IconButton,
  Textarea,
  Stack,
  Menu,
  MenuItem,
  ListItemDecorator,
  Typography,
  CircularProgress,
  Tooltip,
  Chip,
  Alert,
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
} from '@mui/icons-material'
import api from '../../services/api'
import type { Message } from '../../types/Message'
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react'

interface QuickMessage {
  value: string
  label: string
  shortcode: string
}

interface MessageInputProps {
  ticketId: number
  ticketStatus: string
  ticketChannel?: string
  onSendMessage?: (message: string) => void
  droppedFiles?: File[]
  contactId?: number
  replyingTo?: Message
  onCancelReply?: () => void
}

export default function MessageInput({
  ticketId,
  ticketStatus,
  ticketChannel: _ticketChannel = 'whatsapp',
  onSendMessage,
  droppedFiles,
  contactId: _contactId,
  replyingTo,
  onCancelReply,
}: MessageInputProps) {
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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isPrivateMode, setIsPrivateMode] = useState(false)

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
        value: m.message,
        label: `/${m.shortcode} - ${(m.message || '').substring(0, 50)}...`,
        shortcode: m.shortcode,
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

  const handleSendMessage = async () => {
    if (message.trim() === '' && selectedFiles.length === 0) return
    setLoading(true)

    try {
      if (selectedFiles.length > 0) {
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
          {filteredQuickMessages.map((qm, index) => (
            <Box
              key={index}
              sx={{
                p: 1,
                cursor: 'pointer',
                '&:hover': { bgcolor: 'background.level1' },
              }}
              onClick={() => handleQuickMessageClick(qm)}
            >
              <Typography level="body-sm">{qm.label}</Typography>
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
                onClick={(e) => setAnchorEl(e.currentTarget)}
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
    </Box>
  )
}
