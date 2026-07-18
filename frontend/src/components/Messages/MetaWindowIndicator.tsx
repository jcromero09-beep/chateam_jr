/**
 * MetaWindowIndicator — FASE 7 Coexistencia WhatsApp.
 *
 * Indicador contextual de la ventana de 24h de Meta Cloud API.
 *
 * Estados visuales:
 *   - Verde:  ventana abierta y holgada (>60 min)
 *   - Ámbar:  vence pronto (15-60 min) — warning "Meta vence pronto"
 *   - Rojo:   menos de 15 min o ya venció — botón "Pasar a WhatsApp"
 *   - Gris:   sin información (no es ticket coexistencia)
 *
 * Acciones:
 *   - Click "Pasar a WhatsApp": switchea la política de routing a
 *     `force_baileys` para esta conversación (PUT routing-policy).
 *   - Si Baileys no está disponible: muestra "Usar plantilla Meta".
 *
 * Auto-refresh cada 60s para mantener el countdown vivo.
 */
import { useEffect, useState, useCallback } from 'react'
import {
  Box,
  Chip,
  IconButton,
  Tooltip,
  Stack,
  Typography,
  CircularProgress
} from '@mui/joy'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import api from '../../services/api'

interface MetaWindowIndicatorProps {
  ticketId: number
  ticketChannel?: string
  isDark?: boolean
  /** Llamado tras un cambio exitoso de policy (para que el padre recargue). */
  onPolicyChanged?: (mode: string) => void
}

interface RoutingPreview {
  ticketId: number
  conversationId: string | null
  lastCustomerMessageAt: string | null
  hoursSinceLastCustomerMessage: number | null
  metaWindow: {
    isOpen: boolean
    expiresAt: string | null
    minutesRemaining: number | null
  }
  chosenProvider: 'meta' | 'baileys'
  fallbackProvider: 'meta' | 'baileys' | null
  linkedWhatsappId: number | null
  canUseBaileys: boolean
  reason: string
}

const formatRemaining = (minutes: number | null): string => {
  if (minutes === null || minutes === undefined) return '—'
  if (minutes <= 0) return 'Vencida'
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export default function MetaWindowIndicator({
  ticketId,
  ticketChannel,
  isDark = false,
  onPolicyChanged
}: MetaWindowIndicatorProps) {
  const [data, setData] = useState<RoutingPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [switching, setSwitching] = useState(false)

  const isApplicable =
    ticketChannel === 'whatsapp' ||
    ticketChannel === 'meta' ||
    ticketChannel === undefined

  const loadPreview = useCallback(async () => {
    if (!isApplicable || !ticketId) return
    setLoading(true)
    try {
      const { data: res } = await api.get(
        `/coexistence/routing-preview/${ticketId}`
      )
      setData(res)
    } catch (_err) {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [ticketId, isApplicable])

  useEffect(() => {
    loadPreview()
    if (!isApplicable) return
    // Refresh cada 60s para mantener countdown vivo.
    const t = setInterval(loadPreview, 60000)
    return () => clearInterval(t)
  }, [loadPreview, isApplicable])

  const switchToBaileys = useCallback(async () => {
    if (!ticketId || switching) return
    setSwitching(true)
    try {
      await api.put(`/coexistence/tickets/${ticketId}/routing-policy`, {
        mode: 'force_baileys'
      })
      onPolicyChanged?.('force_baileys')
      // Recargar preview inmediatamente.
      await loadPreview()
    } catch (_err) {
      /* silencioso — el chip seguirá mostrando el estado real */
    } finally {
      setSwitching(false)
    }
  }, [ticketId, switching, onPolicyChanged, loadPreview])

  if (!isApplicable) return null
  if (loading && !data) {
    return (
      <Chip size="sm" variant="soft" color="neutral" sx={{ height: 20, fontSize: '10px' }}>
        <CircularProgress size="sm" sx={{ '--CircularProgress-size': '10px' }} />
      </Chip>
    )
  }
  if (!data) return null

  // Si el ticket no tiene contacto inbound, mostrar gris informativo.
  const hasInbound = !!data.lastCustomerMessageAt
  const minutesRemaining = data.metaWindow.minutesRemaining
  const isOpen = data.metaWindow.isOpen
  const canUseBaileys = data.canUseBaileys

  // Decidir estado visual.
  let color: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral'
  let icon = <AccessTimeIcon sx={{ fontSize: 12 }} />
  let label = '—'
  let tooltip = 'Sin info de ventana Meta'
  let showSwitchButton = false

  if (!hasInbound) {
    color = 'neutral'
    icon = <AccessTimeIcon sx={{ fontSize: 12 }} />
    label = 'Sin inbound'
    tooltip = 'No hay mensaje del cliente en este ticket — Meta no permite mensaje libre. Usa template o Baileys.'
    showSwitchButton = canUseBaileys
  } else if (!isOpen) {
    color = 'danger'
    icon = <ErrorOutlineIcon sx={{ fontSize: 12 }} />
    label = 'Vencida'
    tooltip = canUseBaileys
      ? 'La ventana Meta de 24h ya cerró. Usa "Pasar a WhatsApp" para enviar por Baileys.'
      : 'Ventana Meta cerrada y Baileys no disponible. Necesitas enviar template aprobado.'
    showSwitchButton = canUseBaileys
  } else if (minutesRemaining !== null && minutesRemaining < 30) {
    color = 'danger'
    icon = <ErrorOutlineIcon sx={{ fontSize: 12 }} />
    label = `Meta ${formatRemaining(minutesRemaining)}`
    tooltip = `Quedan ${formatRemaining(minutesRemaining)} para que cierre la ventana Meta de 24h. Considera pasar a WhatsApp ahora.`
    showSwitchButton = canUseBaileys
  } else if (minutesRemaining !== null && minutesRemaining < 60) {
    color = 'warning'
    icon = <WarningAmberIcon sx={{ fontSize: 12 }} />
    label = `Meta ${formatRemaining(minutesRemaining)}`
    tooltip = `Meta vence pronto (${formatRemaining(minutesRemaining)}). Si necesitas escribir libre después, cambia a Baileys.`
    showSwitchButton = canUseBaileys
  } else {
    color = 'success'
    icon = <AccessTimeIcon sx={{ fontSize: 12 }} />
    label = `Meta ${formatRemaining(minutesRemaining)}`
    tooltip = `Ventana Meta abierta — quedan ${formatRemaining(minutesRemaining)}.`
    showSwitchButton = false
  }

  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Tooltip title={tooltip} arrow placement="bottom">
        <Chip
          size="sm"
          variant="soft"
          color={color}
          startDecorator={icon}
          sx={{
            height: 20,
            fontSize: '10px',
            fontWeight: 600,
            cursor: 'help',
            border: isDark ? '1px solid rgba(255,255,255,0.08)' : 'none'
          }}
        >
          {label}
        </Chip>
      </Tooltip>
      {showSwitchButton && (
        <Tooltip
          title={
            canUseBaileys
              ? 'Pasar este ticket a Baileys (WhatsApp Web no oficial) para responder fuera de la ventana Meta de 24h.'
              : 'Baileys no está conectado. Necesitas enviar template aprobado.'
          }
          arrow
        >
          <Chip
            size="sm"
            variant="solid"
            color="primary"
            startDecorator={
              switching ? (
                <CircularProgress size="sm" sx={{ '--CircularProgress-size': '12px' }} />
              ) : (
                <WhatsAppIcon sx={{ fontSize: 12 }} />
              )
            }
            onClick={switchToBaileys}
            disabled={switching || !canUseBaileys}
            sx={{
              height: 20,
              fontSize: '10px',
              fontWeight: 700,
              cursor: switching || !canUseBaileys ? 'not-allowed' : 'pointer'
            }}
          >
            {canUseBaileys ? 'Pasar a WhatsApp' : 'Usar plantilla Meta'}
          </Chip>
        </Tooltip>
      )}
    </Stack>
  )
}
