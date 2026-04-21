/**
 * RoutingPolicySelector — FASE 5 Coexistencia WhatsApp.
 *
 * Muestra un chip clickable en el header del ticket que permite al
 * agente ver y cambiar la política de routing saliente:
 *   - Auto        → el sistema decide (default)
 *   - Forzar Meta → todos los envíos por Meta Cloud API
 *   - Forzar Baileys → todos los envíos por Baileys
 *   - Sticky (último inbound) → sigue el canal del último mensaje del cliente
 *
 * Muestra también el canal efectivo (con fallback detection) para que
 * el agente sepa por dónde saldría realmente.
 *
 * NO se renderiza si el ticket no es de canal whatsapp/meta.
 */
import { useEffect, useState } from 'react'
import {
  Box,
  Chip,
  Menu,
  MenuItem,
  Typography,
  ListItemDecorator,
  Stack,
  CircularProgress
} from '@mui/joy'
import CheckIcon from '@mui/icons-material/Check'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import api from '../../services/api'

type RoutingMode = 'auto' | 'force_meta' | 'force_baileys' | 'sticky_inbound'

interface PolicyData {
  ticketId: number
  conversationId: string | null
  routingPolicy: RoutingMode
  lastInboundChannel: string | null
  lastOutboundChannel: string | null
  currentChannel: string | null
  availability: {
    meta: { available: boolean; whatsappName: string | null }
    baileys: { available: boolean; whatsappName: string | null }
  }
  preview: {
    provider: 'meta' | 'baileys'
    whatsappId: number
    whatsappName: string
    reason: string
    fallbackApplied: boolean
  } | null
}

interface RoutingPolicySelectorProps {
  ticketId: number
  ticketChannel?: string
  isDark?: boolean
  onChange?: (mode: RoutingMode) => void
}

const MODE_LABELS: Record<RoutingMode, { short: string; long: string }> = {
  auto: { short: 'Auto', long: 'Auto (sistema decide)' },
  force_meta: { short: 'Meta', long: 'Forzar Meta Cloud API' },
  force_baileys: { short: 'Baileys', long: 'Forzar Baileys' },
  sticky_inbound: { short: 'Sticky', long: 'Sticky (último inbound)' }
}

export default function RoutingPolicySelector({
  ticketId,
  ticketChannel,
  isDark = false,
  onChange
}: RoutingPolicySelectorProps) {
  const [data, setData] = useState<PolicyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isApplicable =
    ticketChannel === 'whatsapp' ||
    ticketChannel === 'meta' ||
    ticketChannel === undefined

  const load = async () => {
    if (!isApplicable) return
    setLoading(true)
    setError(null)
    try {
      const { data: res } = await api.get(
        `/coexistence/tickets/${ticketId}/routing-policy`
      )
      setData(res)
    } catch (err: any) {
      // Silencioso si 404/403 (feature aún no desplegado del todo / ticket sin contexto)
      setError(err?.response?.data?.detail || err?.message || 'error')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (ticketId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId])

  if (!isApplicable || (!data && !loading)) return null

  const handleOpen = (e: React.MouseEvent<HTMLElement>) =>
    setMenuAnchor(e.currentTarget)
  const handleClose = () => setMenuAnchor(null)

  const handleSelect = async (mode: RoutingMode) => {
    handleClose()
    if (!data || data.routingPolicy === mode) return
    setSaving(true)
    setError(null)
    try {
      const { data: res } = await api.put(
        `/coexistence/tickets/${ticketId}/routing-policy`,
        { mode }
      )
      setData((prev) =>
        prev ? { ...prev, routingPolicy: res.routingPolicy, preview: res.preview } : prev
      )
      if (onChange) onChange(res.routingPolicy)
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'error')
    } finally {
      setSaving(false)
    }
  }

  const currentMode = data?.routingPolicy || 'auto'
  const preview = data?.preview
  const previewReason = preview?.reason || ''
  const fallback = !!preview?.fallbackApplied

  // Color del chip según modo + fallback
  const chipColor: 'primary' | 'success' | 'warning' | 'neutral' = fallback
    ? 'warning'
    : currentMode === 'auto'
    ? 'neutral'
    : 'primary'

  return (
    <>
      <Chip
        size="sm"
        variant="soft"
        color={chipColor}
        onClick={handleOpen}
        startDecorator={
          saving || loading ? (
            <CircularProgress size="sm" sx={{ '--CircularProgress-size': '12px' }} />
          ) : fallback ? (
            <WarningAmberIcon sx={{ fontSize: 14 }} />
          ) : (
            <SwapHorizIcon sx={{ fontSize: 14 }} />
          )
        }
        sx={{
          cursor: 'pointer',
          fontSize: '10px',
          height: 20,
          fontWeight: 600,
          ml: 0.5
        }}
        title={
          preview
            ? `Saliendo por: ${preview.provider.toUpperCase()} (${preview.whatsappName}) — ${previewReason}${fallback ? ' — FALLBACK' : ''}`
            : 'Política de routing saliente'
        }
      >
        {MODE_LABELS[currentMode]?.short || currentMode}
        {preview && (
          <Typography
            component="span"
            sx={{
              ml: 0.5,
              fontSize: '9px',
              opacity: 0.75,
              fontWeight: 500
            }}
          >
            → {preview.provider.toUpperCase()}
          </Typography>
        )}
      </Chip>

      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={handleClose}
        placement="bottom-start"
      >
        <Box sx={{ px: 1.5, py: 0.5, minWidth: 240 }}>
          <Typography level="body-xs" sx={{ fontWeight: 700, opacity: 0.8 }}>
            Canal de salida
          </Typography>
          {preview && (
            <Typography level="body-xs" sx={{ fontSize: '10px', color: fallback ? 'warning.plainColor' : 'text.tertiary', mt: 0.25 }}>
              Actual: <strong>{preview.provider.toUpperCase()}</strong> ({preview.whatsappName})
              {fallback && ' — FALLBACK'}
            </Typography>
          )}
          {data?.availability && (
            <Stack direction="row" spacing={0.5} mt={0.5}>
              <Chip
                size="sm"
                variant="soft"
                color={data.availability.meta.available ? 'success' : 'danger'}
                sx={{ fontSize: '9px', height: 18 }}
              >
                Meta {data.availability.meta.available ? '✓' : '✗'}
              </Chip>
              <Chip
                size="sm"
                variant="soft"
                color={data.availability.baileys.available ? 'success' : 'danger'}
                sx={{ fontSize: '9px', height: 18 }}
              >
                Baileys {data.availability.baileys.available ? '✓' : '✗'}
              </Chip>
            </Stack>
          )}
        </Box>
        {(['auto', 'force_meta', 'force_baileys', 'sticky_inbound'] as RoutingMode[]).map(
          (m) => {
            const notAvailable =
              (m === 'force_meta' && !data?.availability?.meta?.available) ||
              (m === 'force_baileys' && !data?.availability?.baileys?.available)
            return (
              <MenuItem
                key={m}
                onClick={() => handleSelect(m)}
                disabled={notAvailable || saving}
                selected={m === currentMode}
              >
                <ListItemDecorator>
                  {m === currentMode ? <CheckIcon sx={{ fontSize: 16 }} /> : null}
                </ListItemDecorator>
                <Stack>
                  <Typography level="body-sm">{MODE_LABELS[m].long}</Typography>
                  {notAvailable && (
                    <Typography level="body-xs" sx={{ color: 'danger.plainColor', fontSize: '10px' }}>
                      No disponible (conexión offline)
                    </Typography>
                  )}
                </Stack>
              </MenuItem>
            )
          }
        )}
        {error && (
          <Box sx={{ px: 1.5, py: 0.5 }}>
            <Typography level="body-xs" sx={{ color: 'danger.plainColor', fontSize: '10px' }}>
              {error}
            </Typography>
          </Box>
        )}
      </Menu>
    </>
  )
}
