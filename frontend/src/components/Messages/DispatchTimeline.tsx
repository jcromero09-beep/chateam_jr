/**
 * DispatchTimeline — FASE 6 Coexistencia WhatsApp.
 *
 * Timeline colapsable que muestra los últimos dispatches salientes
 * del ticket con metadata de trazabilidad:
 *   - provider final (Meta / Baileys)
 *   - mode solicitado (auto / force_* / sticky)
 *   - requestedBy (agent, cron, ai, campaign, ...)
 *   - fallback aplicado con origen
 *   - providerMessageId (wamid o Baileys key.id)
 *   - ackLevel (0-3) con iconos
 *   - duración del envío
 *
 * Se renderiza sólo para canales whatsapp/meta.
 * Silencioso si no hay dispatches (feature no activa aún).
 */
import { useEffect, useState } from 'react'
import {
  Box,
  Typography,
  Chip,
  Stack,
  IconButton,
  CircularProgress
} from '@mui/joy'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import TimelineIcon from '@mui/icons-material/Timeline'
import RefreshIcon from '@mui/icons-material/Refresh'
import api from '../../services/api'

interface Dispatch {
  id: string
  provider: string
  requestedMode?: string
  requestedBy?: string
  fallbackApplied: boolean
  fallbackFromProvider?: string
  providerMessageId?: string
  bodyPreview?: string
  status: string
  attemptCount: number
  lastError?: string
  traceId?: string
  durationMs?: number
  requestedAt: string
  dispatchedAt?: string
  ackedAt?: string
  ackLevel?: number
  whatsappId?: number
}

interface DispatchTimelineProps {
  ticketId: number
  ticketChannel?: string
  isDark?: boolean
}

const statusColor = (
  s: string
): 'success' | 'warning' | 'danger' | 'neutral' | 'primary' => {
  if (s === 'dispatched' || s === 'acked') return 'success'
  if (s === 'fallback') return 'warning'
  if (s === 'failed') return 'danger'
  if (s === 'queued') return 'primary'
  return 'neutral'
}

const ackIcon = (level?: number): string => {
  if (level == null) return ''
  if (level >= 3) return '✓✓'
  if (level >= 2) return '✓✓'
  if (level >= 1) return '✓'
  if (level === -1) return '⚠️'
  return '🕐'
}

export default function DispatchTimeline({
  ticketId,
  ticketChannel
}: DispatchTimelineProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<Dispatch[] | null>(null)

  const isApplicable =
    ticketChannel === 'whatsapp' ||
    ticketChannel === 'meta' ||
    ticketChannel === undefined

  const load = async () => {
    if (!isApplicable) return
    setLoading(true)
    try {
      const { data: res } = await api.get(
        `/coexistence/tickets/${ticketId}/dispatches?limit=20`
      )
      setData(res.dispatches || [])
    } catch (_err) {
      setData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && data === null && ticketId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticketId])

  if (!isApplicable) return null

  return (
    <Box
      sx={{
        mt: 1,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 'md',
        bgcolor: 'background.level1'
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 1.5, py: 0.75, cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}
      >
        <TimelineIcon sx={{ fontSize: 16 }} />
        <Typography level="body-xs" sx={{ flex: 1, fontWeight: 600 }}>
          Trazabilidad de envíos (coexistencia)
        </Typography>
        {open && (
          <IconButton
            size="sm"
            variant="plain"
            onClick={(e) => {
              e.stopPropagation()
              load()
            }}
            title="Refrescar"
          >
            <RefreshIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}
        {open ? (
          <ExpandLessIcon sx={{ fontSize: 16 }} />
        ) : (
          <ExpandMoreIcon sx={{ fontSize: 16 }} />
        )}
      </Stack>
      {open && (
        <Box sx={{ px: 1.5, py: 1, borderTop: '1px solid', borderColor: 'divider' }}>
          {loading && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size="sm" />
              <Typography level="body-xs">Cargando…</Typography>
            </Stack>
          )}
          {!loading && data && data.length === 0 && (
            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
              Sin dispatches registrados para este ticket.
              <br />
              (Requiere usar el pipeline unificado — FASE 4+6.)
            </Typography>
          )}
          {!loading && data && data.length > 0 && (
            <Stack spacing={0.75}>
              {data.map((d) => (
                <Box
                  key={d.id}
                  sx={{
                    p: 0.75,
                    borderRadius: 'sm',
                    bgcolor: 'background.surface',
                    border: '1px solid',
                    borderColor: 'divider'
                  }}
                >
                  <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                    <Chip size="sm" color={statusColor(d.status)} variant="soft" sx={{ fontSize: '9px', height: 18 }}>
                      {d.status}
                    </Chip>
                    <Chip size="sm" variant="outlined" sx={{ fontSize: '9px', height: 18 }}>
                      {d.provider.toUpperCase()}
                    </Chip>
                    {d.requestedMode && d.requestedMode !== 'auto' && (
                      <Chip size="sm" variant="outlined" color="primary" sx={{ fontSize: '9px', height: 18 }}>
                        mode: {d.requestedMode}
                      </Chip>
                    )}
                    {d.fallbackApplied && (
                      <Chip size="sm" color="warning" variant="soft" sx={{ fontSize: '9px', height: 18 }}>
                        fallback {d.fallbackFromProvider ? `de ${d.fallbackFromProvider}` : ''}
                      </Chip>
                    )}
                    {d.requestedBy && (
                      <Chip size="sm" variant="plain" sx={{ fontSize: '9px', height: 18 }}>
                        by {d.requestedBy}
                      </Chip>
                    )}
                    <Typography level="body-xs" sx={{ ml: 'auto', fontSize: '10px', color: 'text.tertiary' }}>
                      {new Date(d.requestedAt).toLocaleString()}
                    </Typography>
                  </Stack>
                  {d.bodyPreview && (
                    <Typography level="body-xs" sx={{ mt: 0.25, fontSize: '11px', fontStyle: 'italic', color: 'text.secondary' }}>
                      "{d.bodyPreview.substring(0, 100)}"
                    </Typography>
                  )}
                  <Stack direction="row" spacing={1} sx={{ mt: 0.25 }}>
                    {d.providerMessageId && (
                      <Typography level="body-xs" sx={{ fontSize: '9px', fontFamily: 'monospace', color: 'text.tertiary' }}>
                        id: {d.providerMessageId.substring(0, 20)}
                      </Typography>
                    )}
                    {d.ackLevel !== undefined && (
                      <Typography level="body-xs" sx={{ fontSize: '10px' }}>
                        ack: {d.ackLevel} {ackIcon(d.ackLevel)}
                      </Typography>
                    )}
                    {d.durationMs && (
                      <Typography level="body-xs" sx={{ fontSize: '10px', color: 'text.tertiary' }}>
                        {d.durationMs}ms
                      </Typography>
                    )}
                    {d.traceId && (
                      <Typography level="body-xs" sx={{ fontSize: '9px', fontFamily: 'monospace', color: 'text.tertiary' }} title={d.traceId}>
                        trace: {d.traceId.substring(0, 12)}…
                      </Typography>
                    )}
                  </Stack>
                  {d.lastError && (
                    <Typography level="body-xs" sx={{ mt: 0.25, fontSize: '10px', color: 'danger.plainColor' }}>
                      ⚠ {d.lastError.substring(0, 200)}
                    </Typography>
                  )}
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      )}
    </Box>
  )
}
