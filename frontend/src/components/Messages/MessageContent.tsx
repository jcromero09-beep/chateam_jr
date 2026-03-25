import React from 'react'
import { Box, Typography, Stack } from '@mui/joy'
import LockIcon from '@mui/icons-material/Lock'
import type { Message } from '../../types/Message'
import { formatWhatsAppText } from '../../utils/formatWhatsAppText'
import ForwardedLabel from './ForwardedLabel'
import GroupSenderName from './GroupSenderName'
import QuotedMessage from './QuotedMessage'
import MediaImage from './MediaImage'
import MediaVideo from './MediaVideo'
import MediaDocument from './MediaDocument'
import AudioPlayer from './AudioPlayer'
import VCardMessage from './VCardMessage'
import LocationMessage from './LocationMessage'

interface MediaItem {
  id: number
  src: string
  type: string
}

interface MessageContentProps {
  message: Message
  isDark: boolean
  isOwn: boolean
  isGroup?: boolean
  searchTerm?: string
  onLightboxOpen?: (
    src: string,
    type: string,
    currentIndex?: number,
    allMedia?: MediaItem[]
  ) => void
  allMedia?: MediaItem[]
}

export default function MessageContent({
  message,
  isDark,
  isOwn,
  isGroup = false,
  searchTerm,
  onLightboxOpen,
  allMedia = [],
}: MessageContentProps) {
  const mediaType = message.mediaType?.toLowerCase() || ''

  // Normalizar mediaType a categoría
  const isImage = mediaType.includes('image') || mediaType === 'image'
  const isSticker = mediaType.includes('sticker') || mediaType === 'sticker'
  const isVideo = mediaType.includes('video') || mediaType === 'video'
  const isAudio = mediaType.includes('audio') || mediaType === 'ptt' || mediaType === 'audio'
  const isDoc = mediaType.includes('application') || mediaType === 'document' || mediaType.includes('pdf') || mediaType.includes('document')
  const isContact = mediaType.includes('contact') || mediaType === 'contact'
  const isLocation = mediaType.includes('location') || mediaType === 'location'

  const hasMedia = message.mediaUrl && (isImage || isSticker || isVideo || isAudio || isDoc || isContact || isLocation)
  const textContent = message.body

  // Si es nota privada, envolver todo en wrapper ambar
  const privateNoteWrapper = (content: React.ReactNode) => {
    if (!message.isPrivate) return content
    return (
      <Box
        sx={{
          borderLeft: '3px solid #FFC107',
          bgcolor: isDark ? 'rgba(255,193,7,0.12)' : 'rgba(255,193,7,0.08)',
          borderRadius: '0 6px 6px 0',
          px: 1,
          py: 0.5,
        }}
      >
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.25 }}>
          <LockIcon sx={{ fontSize: 12, color: '#FFC107' }} />
          <Typography
            sx={{ fontSize: '11px', color: '#FFC107', fontWeight: 600 }}
          >
            Nota interna
          </Typography>
        </Stack>
        {content}
      </Box>
    )
  }

  const renderMedia = () => {
    if (!hasMedia) return null

    if (isImage || isSticker) {
      return (
        <MediaImage
          src={message.mediaUrl!}
          isSticker={isSticker}
          isDark={isDark}
          caption={!isSticker && textContent ? textContent : undefined}
          onLightboxOpen={onLightboxOpen}
        />
      )
    }

    if (isVideo) {
      return (
        <MediaVideo
          src={message.mediaUrl!}
          isDark={isDark}
          onLightboxOpen={onLightboxOpen}
        />
      )
    }

    if (isDoc) {
      return (
        <MediaDocument
          src={message.mediaUrl!}
          filename={textContent || 'Documento'}
          isDark={isDark}
          isOwn={isOwn}
        />
      )
    }

    if (isAudio) {
      return (
        <AudioPlayer
          src={message.mediaUrl!}
          isDark={isDark}
          isOwn={isOwn}
          ack={message.ack}
        />
      )
    }

    if (isContact) {
      return (
        <VCardMessage
          body={textContent || message.dataJson || ''}
          dataJson={message.dataJson}
          isDark={isDark}
          isOwn={isOwn}
        />
      )
    }

    if (isLocation) {
      return (
        <LocationMessage
          body={textContent || message.dataJson || ''}
          dataJson={message.dataJson}
          isDark={isDark}
        />
      )
    }

    return null
  }

  const renderText = () => {
    if (!textContent) return null
    // Si hay media, mostrar caption debajo (ya se maneja arriba)
    if (hasMedia && (isImage || isSticker)) {
      // Si es sticker, mostrar solo la imagen
      if (isSticker) {
        return null
      }
      return null // caption ya se muestra en MediaImage
    }
    return (
      <Typography
        level="body-sm"
        sx={{
          color: isOwn ? 'inherit' : (isDark ? '#E9EDEF' : 'rgba(0,0,0,0.85)'),
          wordBreak: 'break-word',
        }}
      >
        {formatWhatsAppText(textContent, searchTerm)}
      </Typography>
    )
  }

  const content = (
    <>
      {/* Label "Reenviado" */}
      {message.isForwarded && <ForwardedLabel isDark={isDark} />}

      {/* Nombre del sender en grupos */}
      {isGroup && !message.fromMe && message.contact && (
        <GroupSenderName contact={message.contact} isDark={isDark} />
      )}

      {/* Mensaje citado (quote) */}
      {message.quotedMsg && (
        <QuotedMessage
          quotedMsg={message.quotedMsg}
          isDark={isDark}
          isOwn={isOwn}
        />
      )}

      {/* Media */}
      {renderMedia()}

      {/* Texto (si no hay media o es caption ya manejado) */}
      {!hasMedia && renderText()}
      {hasMedia && !isImage && !isSticker && textContent && !isAudio && !isDoc && !isContact && !isLocation && (
        <Typography
          level="body-sm"
          sx={{
            mt: 0.5,
            color: isOwn ? 'inherit' : (isDark ? '#E9EDEF' : 'rgba(0,0,0,0.85)'),
            wordBreak: 'break-word',
          }}
        >
          {formatWhatsAppText(textContent, searchTerm)}
        </Typography>
      )}
    </>
  )

  return privateNoteWrapper(content)
}
