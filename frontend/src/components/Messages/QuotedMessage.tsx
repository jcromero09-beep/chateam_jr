import React from 'react'
import { Box, Stack, Typography } from '@mui/joy'
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined'
import type { QuotedMessage as QuotedMessageType } from '../../types/Message'

interface QuotedMessageProps {
  quotedMsg: QuotedMessageType
  isDark: boolean
  isOwn: boolean
}

export default function QuotedMessage({ quotedMsg, isDark, isOwn }: QuotedMessageProps) {
  const borderColor = isOwn ? '#5BC2D2' : (isDark ? '#4a4a4a' : '#b0b0b0')
  const bgColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'

  // Determinar tipo de media para el label
  const mediaType = quotedMsg.mediaType?.toLowerCase() || ''
  const isImage = mediaType.includes('image')
  const isVideo = mediaType.includes('video')
  const isAudio = mediaType.includes('audio') || mediaType === 'ptt'
  const isDoc = !isImage && !isVideo && !isAudio && quotedMsg.mediaUrl

  const senderName = quotedMsg.fromMe
    ? 'Tú'
    : quotedMsg.contact?.name || 'Contacto'

  return (
    <Box
      sx={{
        borderLeft: `4px solid ${borderColor}`,
        bgcolor: bgColor,
        borderRadius: '0 4px 4px 0',
        p: '4px 8px',
        mb: 0.5,
        cursor: 'pointer',
        '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
      }}
    >
      <Stack direction="row" spacing={1} alignItems="flex-start">
        {/* Contenido del quote */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            level="body-xs"
            sx={{ fontWeight: 700, color: borderColor, lineHeight: 1.2 }}
          >
            {senderName}
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center">
            {isDoc && (
              <InsertDriveFileOutlinedIcon sx={{ fontSize: 12, color: 'text.tertiary' }} />
            )}
            <Typography
              level="body-xs"
              noWrap
              sx={{
                color: isDark ? '#8A8D91' : '#65676B',
                fontStyle: isImage ? 'normal' : 'italic',
              }}
            >
              {isImage
                ? '📷 Foto'
                : isVideo
                ? '🎬 Video'
                : isAudio
                ? '🎤 Audio'
                : isDoc
                ? '📄 Documento'
                : quotedMsg.body || 'Mensaje'}
            </Typography>
          </Stack>
        </Box>

        {/* Thumbnail si hay imagen */}
        {isImage && quotedMsg.mediaUrl && (
          <Box
            component="img"
            src={quotedMsg.mediaUrl}
            alt="quoted"
            sx={{
              width: 40,
              height: 40,
              objectFit: 'cover',
              borderRadius: '4px',
              flexShrink: 0,
            }}
          />
        )}
      </Stack>
    </Box>
  )
}
