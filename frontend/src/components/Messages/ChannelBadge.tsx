/**
 * ChannelBadge — FASE 1 Coexistencia WhatsApp
 *
 * Chip pequeño que muestra el canal físico real de un mensaje
 * (Meta Cloud API, Baileys, Business App echo, history import, etc.).
 *
 * Se renderiza sólo cuando hay información útil. Si la metadata no
 * está disponible (mensaje antiguo, proveedor no indicado), no se
 * muestra nada — FALLBACK SILENCIOSO para no romper UI existente.
 */
import { Box, Typography } from '@mui/joy'
import type {
  MessageProvider,
  MessageSourceChannel
} from '../../types/Message'

interface ChannelBadgeProps {
  provider?: MessageProvider
  sourceChannel?: MessageSourceChannel
  isDark?: boolean
  compact?: boolean
}

interface BadgeSpec {
  label: string
  short: string
  color: string
  bg: string
  title: string
}

const buildBadge = (
  provider?: MessageProvider,
  sourceChannel?: MessageSourceChannel
): BadgeSpec | null => {
  // Priorizamos sourceChannel para distinguir los 4 sub-modos WhatsApp
  if (sourceChannel === 'cloud_api') {
    return {
      label: 'Meta Cloud API',
      short: 'Meta',
      color: '#ffffff',
      bg: '#1877F2',
      title: 'Recibido/enviado vía Meta Cloud API (canal oficial)'
    }
  }
  if (sourceChannel === 'business_app') {
    return {
      label: 'WhatsApp Business App',
      short: 'Business App',
      color: '#ffffff',
      bg: '#25D366',
      title:
        'Mensaje escrito por el staff desde la app WhatsApp Business (eco de coexistencia)'
    }
  }
  if (sourceChannel === 'baileys') {
    return {
      label: 'WhatsApp Web (Baileys)',
      short: 'Baileys',
      color: '#ffffff',
      bg: '#128C7E',
      title: 'Recibido/enviado vía Baileys (WhatsApp Web no oficial)'
    }
  }
  if (sourceChannel === 'history_import') {
    return {
      label: 'Histórico importado',
      short: 'Histórico',
      color: '#ffffff',
      bg: '#607D8B',
      title: 'Mensaje sincronizado del histórico de Business App'
    }
  }
  // Si no hay sourceChannel, caemos a provider
  if (provider === 'meta') {
    return {
      label: 'Meta Cloud API',
      short: 'Meta',
      color: '#ffffff',
      bg: '#1877F2',
      title: 'Enviado vía Meta Cloud API'
    }
  }
  if (provider === 'baileys') {
    return {
      label: 'Baileys',
      short: 'Baileys',
      color: '#ffffff',
      bg: '#128C7E',
      title: 'Enviado vía Baileys'
    }
  }
  if (provider === 'telegram')
    return {
      label: 'Telegram',
      short: 'TG',
      color: '#ffffff',
      bg: '#0088cc',
      title: 'Telegram'
    }
  if (provider === 'facebook')
    return {
      label: 'Facebook',
      short: 'FB',
      color: '#ffffff',
      bg: '#1877F2',
      title: 'Facebook Messenger'
    }
  if (provider === 'instagram')
    return {
      label: 'Instagram',
      short: 'IG',
      color: '#ffffff',
      bg: '#E1306C',
      title: 'Instagram Direct'
    }
  if (provider === 'webchat')
    return {
      label: 'Webchat',
      short: 'Web',
      color: '#ffffff',
      bg: '#3b82f6',
      title: 'Webchat embebido'
    }
  return null
}

export default function ChannelBadge({
  provider,
  sourceChannel,
  isDark = false,
  compact = false
}: ChannelBadgeProps) {
  const spec = buildBadge(provider, sourceChannel)
  if (!spec) return null

  const text = compact ? spec.short : spec.label

  return (
    <Box
      title={spec.title}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: 0.75,
        py: 0.1,
        borderRadius: 10,
        bgcolor: spec.bg,
        color: spec.color,
        lineHeight: 1,
        letterSpacing: 0.2,
        fontSize: compact ? '9px' : '10px',
        fontWeight: 600,
        border: isDark ? '1px solid rgba(255,255,255,0.15)' : 'none',
        userSelect: 'none',
        ml: 0.5,
        maxHeight: 18
      }}
    >
      <Typography
        component="span"
        sx={{
          fontSize: 'inherit',
          color: 'inherit',
          fontWeight: 'inherit',
          lineHeight: 1
        }}
      >
        {text}
      </Typography>
    </Box>
  )
}
