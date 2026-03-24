/**
 * KanbanDashboard — Pipeline Kanban con métricas IA
 *
 * Endpoints consumidos:
 *   GET /tag/kanban/metrics?from=&to=
 *   GET /tag/kanban/funnel?from=&to=
 *
 * Secciones:
 *   1. Header con filtro de fechas y botón refresh
 *   2. 4 KPI Cards
 *   3. Funnel Chart (barras horizontales por etapa)
 *   4. Tabla de últimos 20 movimientos (KanbanMovementLog)
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  Sheet,
  Table,
  Chip,
  Button,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  AspectRatio,
  Divider,
} from '@mui/joy'
import {
  Refresh as RefreshIcon,
  ViewKanban as KanbanIcon,
  TrendingUp as TrendingUpIcon,
  AccessTime as AccessTimeIcon,
  SmartToy as SmartToyIcon,
  ConfirmationNumber as TicketIcon,
  MoveDown as MoveDownIcon,
  Inbox as InboxIcon,
} from '@mui/icons-material'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { toast } from 'sonner'
import api from '../services/api'

// ---------------------------------------------------------------------------
// Tipos estrictos
// ---------------------------------------------------------------------------

interface KanbanMetrics {
  totalTickets: number
  conversionRate: number
  avgPipelineHours: number
  aiAccuracy: number
}

interface KanbanFunnelStage {
  stageId: number
  stageName: string
  color: string
  count: number
}

interface KanbanMovement {
  id: number
  ticketId: number
  ticketTitle: string
  fromStage: string | null
  toStage: string
  moveType: 'system' | 'user' | 'ai'
  reason: string | null
  aiConfidence: number | null
  movedAt: string
}

interface MetricsResponse {
  metrics: KanbanMetrics
}

interface FunnelResponse {
  funnel: KanbanFunnelStage[]
  movements: KanbanMovement[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function moveTypeLabel(type: 'system' | 'user' | 'ai'): string {
  const map: Record<string, string> = {
    system: 'Sistema',
    user: 'Usuario',
    ai: 'IA',
  }
  return map[type] ?? type
}

function moveTypeColor(
  type: 'system' | 'user' | 'ai'
): 'neutral' | 'primary' | 'success' {
  const map: Record<string, 'neutral' | 'primary' | 'success'> = {
    system: 'neutral',
    user: 'primary',
    ai: 'success',
  }
  return map[type] ?? 'neutral'
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function monthAgoISO(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().split('T')[0]
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function KanbanDashboard() {
  const [from, setFrom] = useState<string>(monthAgoISO())
  const [to, setTo] = useState<string>(todayISO())
  const [loadingMetrics, setLoadingMetrics] = useState(true)
  const [loadingFunnel, setLoadingFunnel] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<KanbanMetrics | null>(null)
  const [funnel, setFunnel] = useState<KanbanFunnelStage[]>([])
  const [movements, setMovements] = useState<KanbanMovement[]>([])

  const fetchAll = useCallback(async () => {
    setLoadingMetrics(true)
    setLoadingFunnel(true)
    setError(null)

    try {
      const params = { from, to }

      const [metricsRes, funnelRes] = await Promise.all([
        api.get<MetricsResponse>('/tag/kanban/metrics', { params }),
        api.get<FunnelResponse>('/tag/kanban/funnel', { params }),
      ])

      setMetrics(metricsRes.data.metrics)
      setFunnel(funnelRes.data.funnel ?? [])
      setMovements(funnelRes.data.movements ?? [])
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      const msg = e.response?.data?.error ?? e.message ?? 'Error cargando datos del pipeline'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoadingMetrics(false)
      setLoadingFunnel(false)
    }
  }, [from, to])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const isLoading = loadingMetrics || loadingFunnel

  // ─── Loading global (primera carga) ───────────────────────────────────────
  if (isLoading && metrics === null && funnel.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
        }}
      >
        <Stack spacing={2} alignItems="center">
          <CircularProgress size="lg" />
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Cargando pipeline kanban...
          </Typography>
        </Stack>
      </Box>
    )
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #5B4CF5, #2BBFA3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <KanbanIcon sx={{ color: 'white', fontSize: 28 }} />
          </Box>
          <Box>
            <Typography level="h3">Pipeline Kanban — Dashboard IA</Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              Metricas de conversion, tiempos y precision de automatizacion IA
            </Typography>
          </Box>
        </Stack>

        {/* Filtros de fecha + Refresh */}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography level="body-xs" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
              Desde:
            </Typography>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid var(--joy-palette-neutral-300)',
                background: 'var(--joy-palette-background-surface)',
                color: 'var(--joy-palette-text-primary)',
                fontSize: 13,
                outline: 'none',
                cursor: 'pointer',
              }}
            />
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography level="body-xs" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
              Hasta:
            </Typography>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid var(--joy-palette-neutral-300)',
                background: 'var(--joy-palette-background-surface)',
                color: 'var(--joy-palette-text-primary)',
                fontSize: 13,
                outline: 'none',
                cursor: 'pointer',
              }}
            />
          </Stack>
          <Tooltip title="Actualizar datos">
            <IconButton
              variant="outlined"
              color="neutral"
              onClick={fetchAll}
              loading={isLoading}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* ── Error Alert ────────────────────────────────────────────────────── */}
      {error && (
        <Alert
          variant="soft"
          color="danger"
          sx={{ mb: 3 }}
          endDecorator={
            <Button size="sm" variant="plain" color="danger" onClick={fetchAll}>
              Reintentar
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* ── Fila 1: KPI Cards ──────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        {/* Card 1: Total tickets */}
        <Card variant="soft" color="primary">
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography
                  level="body-xs"
                  sx={{
                    color: 'text.tertiary',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    letterSpacing: 0.5,
                  }}
                >
                  Total Tickets
                </Typography>
                <Typography level="h2" sx={{ mt: 0.5 }}>
                  {loadingMetrics ? '—' : (metrics?.totalTickets ?? 0)}
                </Typography>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.25 }}>
                  en el pipeline
                </Typography>
              </Box>
              <AspectRatio ratio="1" sx={{ width: 44, borderRadius: '50%', bgcolor: 'primary.softBg' }}>
                <Box>
                  <TicketIcon sx={{ color: 'primary.500', fontSize: 22 }} />
                </Box>
              </AspectRatio>
            </Stack>
          </CardContent>
        </Card>

        {/* Card 2: Conversion global */}
        <Card variant="soft" color="success">
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography
                  level="body-xs"
                  sx={{
                    color: 'text.tertiary',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    letterSpacing: 0.5,
                  }}
                >
                  Conversion Global
                </Typography>
                <Typography level="h2" sx={{ mt: 0.5 }}>
                  {loadingMetrics ? '—' : `${(metrics?.conversionRate ?? 0).toFixed(1)}%`}
                </Typography>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.25 }}>
                  tickets cerrados / total
                </Typography>
              </Box>
              <AspectRatio ratio="1" sx={{ width: 44, borderRadius: '50%', bgcolor: 'success.softBg' }}>
                <Box>
                  <TrendingUpIcon sx={{ color: 'success.500', fontSize: 22 }} />
                </Box>
              </AspectRatio>
            </Stack>
          </CardContent>
        </Card>

        {/* Card 3: Tiempo promedio */}
        <Card variant="soft" color="warning">
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography
                  level="body-xs"
                  sx={{
                    color: 'text.tertiary',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    letterSpacing: 0.5,
                  }}
                >
                  Tiempo Promedio
                </Typography>
                <Typography level="h2" sx={{ mt: 0.5 }}>
                  {loadingMetrics ? '—' : `${(metrics?.avgPipelineHours ?? 0).toFixed(1)}h`}
                </Typography>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.25 }}>
                  horas en pipeline
                </Typography>
              </Box>
              <AspectRatio ratio="1" sx={{ width: 44, borderRadius: '50%', bgcolor: 'warning.softBg' }}>
                <Box>
                  <AccessTimeIcon sx={{ color: 'warning.500', fontSize: 22 }} />
                </Box>
              </AspectRatio>
            </Stack>
          </CardContent>
        </Card>

        {/* Card 4: Precision IA */}
        <Card
          variant="soft"
          color={(metrics?.aiAccuracy ?? 0) >= 70 ? 'success' : 'neutral'}
        >
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography
                  level="body-xs"
                  sx={{
                    color: 'text.tertiary',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    letterSpacing: 0.5,
                  }}
                >
                  Precision IA
                </Typography>
                <Typography level="h2" sx={{ mt: 0.5 }}>
                  {loadingMetrics ? '—' : `${(metrics?.aiAccuracy ?? 0).toFixed(1)}%`}
                </Typography>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.25 }}>
                  sin overrides de usuario
                </Typography>
              </Box>
              <AspectRatio
                ratio="1"
                sx={{
                  width: 44,
                  borderRadius: '50%',
                  bgcolor:
                    (metrics?.aiAccuracy ?? 0) >= 70 ? 'success.softBg' : 'neutral.softBg',
                }}
              >
                <Box>
                  <SmartToyIcon
                    sx={{
                      color:
                        (metrics?.aiAccuracy ?? 0) >= 70 ? 'success.500' : 'neutral.500',
                      fontSize: 22,
                    }}
                  />
                </Box>
              </AspectRatio>
            </Stack>
          </CardContent>
        </Card>
      </Box>

      {/* ── Fila 2: Funnel Chart ───────────────────────────────────────────── */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Stack spacing={0.5}>
              <Typography level="title-md" startDecorator={<TrendingUpIcon />}>
                Funnel por Etapa
              </Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                Cantidad de tickets activos en cada etapa del pipeline
              </Typography>
            </Stack>
            {loadingFunnel && <CircularProgress size="sm" />}
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {!loadingFunnel && funnel.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <InboxIcon sx={{ fontSize: 48, color: 'text.tertiary', mb: 1 }} />
              <Typography level="body-md" sx={{ color: 'text.tertiary' }}>
                Sin datos de etapas en el rango seleccionado
              </Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                Ajusta el filtro de fechas o verifica que existan tickets en el kanban
              </Typography>
            </Box>
          ) : (
            <Box sx={{ width: '100%', height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={funnel}
                  layout="vertical"
                  margin={{ top: 4, right: 32, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12 }}
                    allowDecimals={false}
                    label={{
                      value: 'Tickets',
                      position: 'insideBottomRight',
                      offset: -8,
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    type="category"
                    dataKey="stageName"
                    width={130}
                    tick={{ fontSize: 12 }}
                  />
                  <RechartsTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <Box
                          sx={{
                            bgcolor: 'background.surface',
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 'sm',
                            p: 1,
                            boxShadow: 'sm',
                          }}
                        >
                          <Typography level="body-xs" fontWeight={700}>
                            {label}
                          </Typography>
                          <Typography level="body-xs">
                            {payload[0].value} tickets
                          </Typography>
                        </Box>
                      )
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={32}>
                    {funnel.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color || '#5B4CF5'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ── Fila 3: Tabla de movimientos recientes ─────────────────────────── */}
      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Stack spacing={0.5}>
              <Typography level="title-md" startDecorator={<MoveDownIcon />}>
                Movimientos Recientes
              </Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                Ultimos 20 cambios de etapa registrados en el pipeline
              </Typography>
            </Stack>
            <Chip size="sm" variant="outlined" color="neutral">
              {movements.length} registros
            </Chip>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {!loadingFunnel && movements.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <MoveDownIcon sx={{ fontSize: 48, color: 'text.tertiary', mb: 1 }} />
              <Typography level="body-md" sx={{ color: 'text.tertiary' }}>
                Sin movimientos en el rango seleccionado
              </Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                Los movimientos se registran cuando un ticket cambia de etapa en el kanban
              </Typography>
            </Box>
          ) : (
            <Sheet variant="outlined" sx={{ borderRadius: 'sm', overflow: 'auto' }}>
              <Table size="sm" stickyHeader stripe="even">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>Ticket</th>
                    <th style={{ minWidth: 160 }}>De → A</th>
                    <th style={{ width: 90 }}>Tipo</th>
                    <th style={{ minWidth: 140 }}>Razon</th>
                    <th style={{ width: 110 }}>Confianza IA</th>
                    <th style={{ width: 130 }}>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((mov) => (
                    <tr key={mov.id}>
                      {/* Ticket */}
                      <td>
                        <Stack spacing={0.25}>
                          <Typography level="body-xs" fontWeight={700}>
                            #{mov.ticketId}
                          </Typography>
                          {mov.ticketTitle && (
                            <Typography
                              level="body-xs"
                              sx={{
                                color: 'text.tertiary',
                                maxWidth: 80,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {mov.ticketTitle}
                            </Typography>
                          )}
                        </Stack>
                      </td>

                      {/* De → A */}
                      <td>
                        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                          {mov.fromStage ? (
                            <Chip size="sm" variant="plain" color="neutral">
                              {mov.fromStage}
                            </Chip>
                          ) : (
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              Inicio
                            </Typography>
                          )}
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            →
                          </Typography>
                          <Chip size="sm" variant="soft" color="primary">
                            {mov.toStage}
                          </Chip>
                        </Stack>
                      </td>

                      {/* Tipo */}
                      <td>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={moveTypeColor(mov.moveType)}
                        >
                          {moveTypeLabel(mov.moveType)}
                        </Chip>
                      </td>

                      {/* Razon */}
                      <td>
                        <Typography
                          level="body-xs"
                          sx={{
                            maxWidth: 180,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: mov.reason ? 'text.primary' : 'text.tertiary',
                          }}
                        >
                          {mov.reason ?? '—'}
                        </Typography>
                      </td>

                      {/* Confianza IA */}
                      <td>
                        {mov.aiConfidence !== null ? (
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <SmartToyIcon sx={{ fontSize: 14, color: 'success.500' }} />
                            <Typography
                              level="body-xs"
                              fontWeight={600}
                              sx={{
                                color:
                                  mov.aiConfidence >= 80
                                    ? 'success.600'
                                    : mov.aiConfidence >= 50
                                    ? 'warning.600'
                                    : 'danger.600',
                              }}
                            >
                              {mov.aiConfidence.toFixed(0)}%
                            </Typography>
                          </Stack>
                        ) : (
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            —
                          </Typography>
                        )}
                      </td>

                      {/* Fecha */}
                      <td>
                        <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                          {formatDate(mov.movedAt)}
                        </Typography>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Sheet>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
