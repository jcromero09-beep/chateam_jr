/**
 * Component: MessageBubble
 * Renderiza una burbuja individual de mensaje con estilos de Facebook/Messenger
 *
 * FASE 1 Coexistencia: se integra ChannelBadge para mostrar el
 * proveedor/sourceChannel real del mensaje (Meta, Baileys, etc.).
 * Si el backend no envía esos campos, el badge no se renderiza
 * (fallback silencioso — no rompe UI existente).
 */

import { Box, Typography, Stack } from '@mui/joy'
import { facebookDesignTokens } from '../../themes/facebookTheme'
import ChannelBadge from './ChannelBadge'
import type {
  MessageProvider,
  MessageSourceChannel
} from '../../types/Message'

interface Message {
  id: number
  body: string
  fromMe: boolean
  mediaUrl?: string
  mediaType?: string
  quotedMsg?: any
  createdAt: string
  ack?: number
  read: boolean
  dataJson?: string
  messageStatus?: 'pending' | 'sent' | 'failed' | 'deleted'
  sendAttempts?: number
  /** FASE 1 Coexistencia */
  provider?: MessageProvider
  /** FASE 1 Coexistencia */
  sourceChannel?: MessageSourceChannel
}

interface MessageBubbleProps {
  message: Message
  isDark: boolean
  formatTime: (dateString: string) => string
}

export default function MessageBubble({ message, isDark, formatTime }: MessageBubbleProps) {
  const isOwn = message.fromMe

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isOwn ? 'flex-end' : 'flex-start',
      }}
    >
      <Box
        sx={{
          maxWidth: facebookDesignTokens.message.maxWidth,
          bgcolor: isOwn
            ? (isDark
                ? facebookDesignTokens.message.outgoing.background
                : facebookDesignTokens.message.outgoing.backgroundLight)
            : (isDark
                ? facebookDesignTokens.message.incoming.background
                : facebookDesignTokens.message.incoming.backgroundLight),
          color: isOwn
            ? (isDark
                ? facebookDesignTokens.message.outgoing.color
                : facebookDesignTokens.message.outgoing.colorLight)
            : (isDark
                ? facebookDesignTokens.message.incoming.color
                : facebookDesignTokens.message.incoming.colorLight),
          p: facebookDesignTokens.message.padding,
          borderRadius: facebookDesignTokens.message.borderRadius,
          borderTopRightRadius: isOwn ? 0 : facebookDesignTokens.message.borderRadius,
          borderTopLeftRadius: !isOwn ? 0 : facebookDesignTokens.message.borderRadius,
          boxShadow: isDark ? '0 1px 0.5px rgba(11,20,26,.13)' : '0 1px 0.5px rgba(0,0,0,.08)',
        }}
      >
        <Typography level="body-sm" sx={{ color: 'inherit' }}>{message.body}</Typography>
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          justifyContent="flex-end"
          sx={{ mt: 0.5 }}
        >
          <Typography
            sx={{
              fontSize: '11px',
              lineHeight: 1,
              color: isOwn
                ? 'rgba(255,255,255,0.6)'
                : (isDark ? '#8A8D91' : 'rgba(5,5,5,0.45)'),
              userSelect: 'none',
            }}
          >
            {formatTime(message.createdAt)}
          </Typography>
          {/* FASE 1 Coexistencia — badge de canal físico (Meta / Baileys / business_app / history_import).
              Silencioso si no hay data: no rompe mensajes antiguos. */}
          <ChannelBadge
            provider={message.provider}
            sourceChannel={message.sourceChannel}
            isDark={isDark}
            compact
          />

          {isOwn && message.ack !== undefined && (
            <Typography
              sx={{
                fontSize: '11px',
                lineHeight: 1,
                color: message.ack >= 3
                  ? '#5BC2D2'
                  : 'rgba(255,255,255,0.5)',
              }}
            >
              {message.messageStatus === 'pending' ? '⏳' : (message.ack >= 2 ? '✓✓' : '✓')}
            </Typography>
          )}
          {isOwn && message.messageStatus === 'failed' && (
            <Typography
              sx={{
                fontSize: '11px',
                lineHeight: 1,
                color: '#ff6b6b',
                ml: 0.5,
                cursor: 'pointer'
              }}
              title={`Error al enviar. Intentos: ${message.sendAttempts || 0}`}
            >
              ⚠️
            </Typography>
          )}
        </Stack>
      </Box>
    </Box>
  )
}
