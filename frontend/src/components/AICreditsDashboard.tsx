import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Stack,
  Chip,
  CircularProgress,
  Alert,
  LinearProgress,
  Button,
  Divider,
  Tooltip,
  Table,
  Sheet,
  Select,
  Option,
  Input,
  IconButton
} from '@mui/joy'
import {
  SmartToy as AIIcon,
  Memory as CreditIcon,
  Refresh as RefreshIcon,
  ShoppingCart as BuyIcon,
  AccessTime as TimeIcon,
  TrendingUp as TrendIcon,
  TrendingDown as TrendingDownIcon,
  ChatBubble as MessageIcon,
  Image as ImageIcon,
  Videocam as VideoIcon,
  Mic as AudioIcon,
  RecordVoiceOver as TTSIcon,
  Search as RAGIcon,
  DataObject as EmbeddingIcon,
  Psychology as AgentIcon,
  Description as DocIcon,
  Visibility as VisionIcon,
  PictureAsPdf as PDFIcon,
  Download as DownloadIcon,
  History as HistoryIcon,
  BarChart as BarChartIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon
} from '@mui/icons-material'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  LineChart,
  Line
} from 'recharts'
import api from '../services/api'

// ─── Tipos de Auditoría ───────────────────────────────────────────────────────

interface TransactionCreditType {
  key: string
  name: string
}

interface TransactionUser {
  name: string
}

interface CreditTransaction {
  id: number | string
  createdAt: string
  creditType: TransactionCreditType
  direction: 'debit' | 'credit'
  amount: number
  balanceBefore: number
  balanceAfter: number
  source: string
  sourceId?: string
  description?: string
  user?: TransactionUser
}

interface AnalyticsData {
  period: string
  totals: {
    debited: number
    credited: number
    transactions: number
  }
  byType: Array<{ key: string; name: string; debited: number; credited: number }>
  bySource: Array<{ source: string; count: number; debited: number }>
  daily: Array<{ date: string; debited: number; credited: number; transactions: number }>
}

// Etiquetas legibles para los valores de source
const SOURCE_LABELS: Record<string, string> = {
  message: 'Mensaje',
  image_gen: 'Imagen IA',
  agent_execution: 'Agente IA',
  rag_query: 'RAG/KB',
  embedding: 'Embedding',
  tts: 'TTS',
  video_gen: 'Video IA',
  audio: 'Audio',
  vision: 'Visión',
  pdf: 'PDF',
  purchase: 'Compra',
  reset: 'Reset ciclo',
  manual: 'Manual',
  stripe: 'Stripe',
}

const formatSourceLabel = (src: string): string =>
  SOURCE_LABELS[src] ?? src.replace(/_/g, ' ')

const formatDatetime = (dateStr: string): string => {
  try {
    return new Date(dateStr).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

// ─── Tipos basados en la respuesta de GET /ai/credits/usage ──────────────────
interface CreditUsageSummary {
  creditTypeId: number
  creditTypeName: string
  creditTypeKey: string
  unit: string
  totalCredits: number
  usedCredits: number
  remainingCredits: number
  usagePercentage: number
}

interface UsageTotals {
  totalCredits: number
  totalUsed: number
  totalRemaining: number
  overallUsagePercentage: number
}

interface UsageResponse {
  companyId: number
  summary: CreditUsageSummary[]
  totals: UsageTotals
}

interface CreditBalance {
  id: number
  companyId: number
  creditTypeId: number
  totalCredits: number
  usedCredits: number
  resetAt: string | null
  creditType: {
    id: number
    key: string
    name: string
    unit: string
  }
}

// Mapeo de iconos por key de tipo de credito
const CREDIT_TYPE_ICONS: Record<string, React.ReactElement> = {
  message: <MessageIcon sx={{ fontSize: 18 }} />,
  image: <ImageIcon sx={{ fontSize: 18 }} />,
  video: <VideoIcon sx={{ fontSize: 18 }} />,
  audio_minute: <AudioIcon sx={{ fontSize: 18 }} />,
  tts_character: <TTSIcon sx={{ fontSize: 18 }} />,
  rag_query: <RAGIcon sx={{ fontSize: 18 }} />,
  embedding_token: <EmbeddingIcon sx={{ fontSize: 18 }} />,
  agent_execution: <AgentIcon sx={{ fontSize: 18 }} />,
  kb_document: <DocIcon sx={{ fontSize: 18 }} />,
  vision_analysis: <VisionIcon sx={{ fontSize: 18 }} />,
  pdf_processing: <PDFIcon sx={{ fontSize: 18 }} />
}

const getUsageColor = (pct: number): 'success' | 'warning' | 'danger' => {
  if (pct >= 90) return 'danger'
  if (pct >= 70) return 'warning'
  return 'success'
}

const formatNumber = (n: number): string => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toLocaleString('es-ES')
}

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return 'Sin fecha'
  try {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return dateStr
  }
}

interface AICreditsDashboardProps {
  compact?: boolean
  showBuyButton?: boolean
  onBuyCredits?: () => void
}

export default function AICreditsDashboard({
  compact = false,
  showBuyButton = true,
  onBuyCredits
}: AICreditsDashboardProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [usage, setUsage] = useState<UsageResponse | null>(null)
  const [balances, setBalances] = useState<CreditBalance[]>([])
  const [resetDate, setResetDate] = useState<string | null>(null)

  // ── Estados de Auditoría ──────────────────────────────────────────────────
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [txLoading, setTxLoading] = useState(false)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [txPage, setTxPage] = useState(1)
  const [txTotal, setTxTotal] = useState(0)
  const [txFilter, setTxFilter] = useState({ source: '', creditType: '' })
  const TX_LIMIT = 15

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [usageResult, balancesResult] = await Promise.allSettled([
        api.get('/ai/credits/usage'),
        api.get('/ai/credits/balances')
      ])

      if (usageResult.status === 'fulfilled') {
        const raw = usageResult.value.data
        const data = (raw as { data?: UsageResponse }).data ?? (raw as UsageResponse)
        setUsage(data)
      }

      if (balancesResult.status === 'fulfilled') {
        const raw = balancesResult.value.data
        const data: CreditBalance[] = (raw as { data?: CreditBalance[] }).data ?? (raw as CreditBalance[]) ?? []
        setBalances(data)

        // Obtener resetAt del primer balance que tenga fecha
        const withReset = data.find(b => b.resetAt)
        if (withReset) {
          setResetDate(withReset.resetAt)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar datos de creditos'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Fetch transacciones ───────────────────────────────────────────────────
  const fetchTransactions = useCallback(async () => {
    try {
      setTxLoading(true)
      const params = new URLSearchParams({
        page: String(txPage),
        limit: String(TX_LIMIT),
      })
      if (txFilter.source) params.set('source', txFilter.source)
      if (txFilter.creditType) params.set('creditType', txFilter.creditType)

      const { data } = await api.get(`/ai/credits/transactions?${params}`)
      const raw = (data as { success?: boolean; data?: CreditTransaction[]; pagination?: { total: number } })
      if (raw.success !== false) {
        setTransactions(raw.data ?? [])
        setTxTotal(raw.pagination?.total ?? 0)
      }
    } catch (e) {
      // Error silencioso en sección secundaria — no interrumpe el dashboard principal
    } finally {
      setTxLoading(false)
    }
  }, [txPage, txFilter, TX_LIMIT])

  const fetchAnalytics = useCallback(async () => {
    try {
      const { data } = await api.get('/ai/credits/analytics?days=30')
      const raw = (data as { success?: boolean; data?: AnalyticsData })
      if (raw.success !== false && raw.data) {
        setAnalytics(raw.data)
      }
    } catch (e) {
      // Error silencioso
    }
  }, [])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert color="danger" variant="soft">
        {error}
        <Button size="sm" variant="plain" onClick={fetchData} sx={{ ml: 1 }}>
          Reintentar
        </Button>
      </Alert>
    )
  }

  const totals = usage?.totals ?? {
    totalCredits: 0,
    totalUsed: 0,
    totalRemaining: 0,
    overallUsagePercentage: 0
  }

  const summaryItems = usage?.summary ?? []

  return (
    <Stack spacing={2}>
      {/* Header con resumen global */}
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={2} alignItems="center">
              <AIIcon color="primary" sx={{ fontSize: 28 }} />
              <Box>
                <Typography level="title-lg">Creditos IA</Typography>
                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                  Uso del ciclo actual
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              {resetDate && (
                <Tooltip title="Fecha de renovacion">
                  <Chip
                    size="sm"
                    variant="soft"
                    color="neutral"
                    startDecorator={<TimeIcon sx={{ fontSize: 14 }} />}
                  >
                    Renueva: {formatDate(resetDate)}
                  </Chip>
                </Tooltip>
              )}
              <Button
                size="sm"
                variant="plain"
                onClick={fetchData}
                startDecorator={<RefreshIcon sx={{ fontSize: 16 }} />}
              >
                Actualizar
              </Button>
            </Stack>
          </Stack>

          {/* Barra de progreso global */}
          <Box sx={{ mt: 2 }}>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
              <Typography level="body-sm">
                Uso global: <strong>{formatNumber(totals.totalUsed)}</strong> / {formatNumber(totals.totalCredits)}
              </Typography>
              <Typography level="body-sm" fontWeight="lg" color={getUsageColor(totals.overallUsagePercentage)}>
                {totals.overallUsagePercentage.toFixed(1)}%
              </Typography>
            </Stack>
            <LinearProgress
              determinate
              value={Math.min(totals.overallUsagePercentage, 100)}
              color={getUsageColor(totals.overallUsagePercentage)}
              sx={{ '--LinearProgress-thickness': '10px', borderRadius: 'sm' }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Cards de resumen rapido */}
      {!compact && (
        <Grid container spacing={2}>
          <Grid xs={12} sm={4}>
            <Card variant="soft" color="primary">
              <CardContent>
                <Typography level="body-xs">Total Creditos</Typography>
                <Typography level="h3">{formatNumber(totals.totalCredits)}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={4}>
            <Card variant="soft" color="warning">
              <CardContent>
                <Typography level="body-xs">Consumidos</Typography>
                <Typography level="h3">{formatNumber(totals.totalUsed)}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={4}>
            <Card variant="soft" color="success">
              <CardContent>
                <Typography level="body-xs">Disponibles</Typography>
                <Typography level="h3">{formatNumber(totals.totalRemaining)}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Detalle por tipo de credito */}
      <Card variant="outlined">
        <CardContent>
          <Typography level="title-md" sx={{ mb: 2 }} startDecorator={<TrendIcon />}>
            Detalle por Tipo
          </Typography>

          <Stack spacing={1.5}>
            {summaryItems.map((item) => {
              const icon = CREDIT_TYPE_ICONS[item.creditTypeKey] ?? <CreditIcon sx={{ fontSize: 18 }} />
              const pct = item.usagePercentage
              const color = getUsageColor(pct)

              return (
                <Box key={item.creditTypeId}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ minWidth: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {icon}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                        <Typography level="body-xs" fontWeight="md">
                          {item.creditTypeName}
                        </Typography>
                        <Typography level="body-xs">
                          {formatNumber(item.usedCredits)} / {formatNumber(item.totalCredits)}
                          {' '}
                          <Typography component="span" color={color} fontWeight="lg">
                            ({pct.toFixed(0)}%)
                          </Typography>
                        </Typography>
                      </Stack>
                      <LinearProgress
                        determinate
                        value={Math.min(pct, 100)}
                        color={color}
                        sx={{ '--LinearProgress-thickness': '6px', borderRadius: 'xs' }}
                      />
                    </Box>
                  </Stack>
                </Box>
              )
            })}

            {summaryItems.length === 0 && (
              <Alert color="neutral" variant="soft">
                No hay creditos asignados a esta empresa. Contacta al administrador.
              </Alert>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Boton comprar mas */}
      {showBuyButton && (
        <Box sx={{ textAlign: 'center' }}>
          <Button
            variant="soft"
            color="primary"
            size="lg"
            startDecorator={<BuyIcon />}
            onClick={onBuyCredits}
          >
            Comprar Mas Creditos
          </Button>
        </Box>
      )}

      {/* ─── SECCIÓN DE AUDITORÍA ─────────────────────────────────────── */}
      {!compact && (
        <>
          <Divider sx={{ my: 1 }} />

          {/* ── Gráficos de Analytics ─────────────────────────────────── */}
          {analytics && (
            <Grid container spacing={2}>
              {/* Totales rápidos de Analytics */}
              <Grid xs={12}>
                <Card variant="outlined" sx={{ borderRadius: 'lg' }}>
                  <CardContent>
                    <Stack
                      direction="row"
                      spacing={2}
                      alignItems="center"
                      justifyContent="space-between"
                      sx={{ mb: 2 }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <BarChartIcon sx={{ color: '#3b82f6', fontSize: 22 }} />
                        <Typography level="title-md">
                          Analítica de Consumo — Últimos 30 días
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={1}>
                        <Chip size="sm" variant="soft" color="danger"
                          startDecorator={<TrendingDownIcon sx={{ fontSize: 14 }} />}>
                          {formatNumber(analytics.totals.debited)} debitados
                        </Chip>
                        <Chip size="sm" variant="soft" color="success"
                          startDecorator={<TrendIcon sx={{ fontSize: 14 }} />}>
                          {formatNumber(analytics.totals.credited)} acreditados
                        </Chip>
                        <Chip size="sm" variant="soft" color="neutral">
                          {analytics.totals.transactions} tx
                        </Chip>
                      </Stack>
                    </Stack>

                    {/* LineChart consumo diario */}
                    {analytics.daily && analytics.daily.length > 0 && (
                      <Box sx={{ mb: 3 }}>
                        <Typography level="body-xs" sx={{ mb: 1, color: 'text.tertiary' }}>
                          Consumo diario (débitos vs créditos)
                        </Typography>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart
                            data={analytics.daily}
                            margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis
                              dataKey="date"
                              tickFormatter={(v: string) => {
                                try {
                                  return new Date(v).toLocaleDateString('es-ES', {
                                    day: '2-digit',
                                    month: '2-digit',
                                  })
                                } catch {
                                  return v
                                }
                              }}
                              tick={{ fontSize: 11 }}
                            />
                            <YAxis tick={{ fontSize: 11 }} width={48} />
                            <RechartsTooltip
                              formatter={(value, name) => [
                                formatNumber(typeof value === "number" ? value : 0),
                                name === 'debited' ? 'Débitos' : 'Créditos',
                              ]}
                            />
                            <Legend
                              formatter={(value: string) =>
                                value === 'debited' ? 'Débitos' : 'Créditos'
                              }
                            />
                            <Line
                              type="monotone"
                              dataKey="debited"
                              stroke="#ef4444"
                              strokeWidth={2}
                              dot={false}
                            />
                            <Line
                              type="monotone"
                              dataKey="credited"
                              stroke="#52b788"
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </Box>
                    )}

                    {/* BarChart por fuente (top 5) */}
                    {analytics.bySource && analytics.bySource.length > 0 && (
                      <Box>
                        <Typography level="body-xs" sx={{ mb: 1, color: 'text.tertiary' }}>
                          Top fuentes de consumo
                        </Typography>
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart
                            data={analytics.bySource.slice(0, 5).map(s => ({
                              ...s,
                              sourceLabel: formatSourceLabel(s.source),
                            }))}
                            margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="sourceLabel" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} width={48} />
                            <RechartsTooltip
                              formatter={(value) => [formatNumber(value as number), 'Débitos']}
                            />
                            <Bar dataKey="debited" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Débitos" />
                          </BarChart>
                        </ResponsiveContainer>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          {/* ── Tabla de Transacciones ────────────────────────────────── */}
          <Sheet
            variant="outlined"
            sx={{ borderRadius: 'lg', overflow: 'hidden' }}
          >
            {/* Header de la sección */}
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                alignItems={{ xs: 'stretch', sm: 'center' }}
                justifyContent="space-between"
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <HistoryIcon sx={{ color: '#3b82f6', fontSize: 20 }} />
                  <Typography level="title-md">Historial de Transacciones</Typography>
                  {txTotal > 0 && (
                    <Chip size="sm" variant="soft" color="neutral">
                      {txTotal.toLocaleString('es-ES')} registros
                    </Chip>
                  )}
                </Stack>

                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  {/* Filtro por fuente */}
                  <Select
                    size="sm"
                    placeholder="Fuente"
                    value={txFilter.source || null}
                    onChange={(_e, val) => {
                      setTxFilter(f => ({ ...f, source: val ?? '' }))
                      setTxPage(1)
                    }}
                    sx={{ minWidth: 130 }}
                  >
                    <Option value="">Todas las fuentes</Option>
                    {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                      <Option key={k} value={k}>{v}</Option>
                    ))}
                  </Select>

                  {/* Filtro por tipo de crédito */}
                  <Select
                    size="sm"
                    placeholder="Tipo"
                    value={txFilter.creditType || null}
                    onChange={(_e, val) => {
                      setTxFilter(f => ({ ...f, creditType: val ?? '' }))
                      setTxPage(1)
                    }}
                    sx={{ minWidth: 140 }}
                  >
                    <Option value="">Todos los tipos</Option>
                    <Option value="message">Mensaje</Option>
                    <Option value="image">Imagen</Option>
                    <Option value="video">Video</Option>
                    <Option value="audio_minute">Audio/min</Option>
                    <Option value="tts_character">TTS</Option>
                    <Option value="rag_query">RAG</Option>
                    <Option value="embedding_token">Embedding</Option>
                    <Option value="agent_execution">Agente</Option>
                    <Option value="kb_document">Documento KB</Option>
                    <Option value="vision_analysis">Visión</Option>
                    <Option value="pdf_processing">PDF</Option>
                  </Select>

                  {/* Refresh */}
                  <Tooltip title="Actualizar transacciones">
                    <IconButton
                      size="sm"
                      variant="outlined"
                      color="neutral"
                      onClick={fetchTransactions}
                      disabled={txLoading}
                    >
                      <RefreshIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>

                  {/* Exportar CSV */}
                  <Button
                    size="sm"
                    variant="outlined"
                    color="neutral"
                    component="a"
                    href="/ai/credits/transactions/export"
                    target="_blank"
                    rel="noopener noreferrer"
                    startDecorator={<DownloadIcon sx={{ fontSize: 16 }} />}
                  >
                    Exportar CSV
                  </Button>
                </Stack>
              </Stack>
            </Box>

            {/* Estado de carga */}
            {txLoading && (
              <Box sx={{ px: 2, pt: 1 }}>
                <LinearProgress />
              </Box>
            )}

            {/* Tabla */}
            <Box sx={{ overflowX: 'auto' }}>
              <Table
                stripe="odd"
                hoverRow
                size="sm"
                sx={{
                  '--Table-headerUnderlineThickness': '2px',
                  '--TableCell-paddingY': '8px',
                  '--TableCell-paddingX': '12px',
                  minWidth: 700,
                  '& thead th': {
                    bgcolor: 'background.level1',
                    fontWeight: 'lg',
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  },
                }}
              >
                <thead>
                  <tr>
                    <th style={{ width: 130 }}>Fecha</th>
                    <th>Tipo</th>
                    <th>Fuente</th>
                    <th style={{ textAlign: 'center' }}>Dirección</th>
                    <th style={{ textAlign: 'right' }}>Cantidad</th>
                    <th style={{ textAlign: 'right' }}>Balance</th>
                    <th>Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 && !txLoading ? (
                    <tr>
                      <td colSpan={7}>
                        <Box sx={{ textAlign: 'center', py: 3 }}>
                          <Typography level="body-sm" color="neutral">
                            No hay transacciones registradas
                            {(txFilter.source || txFilter.creditType) && ' con los filtros aplicados'}
                          </Typography>
                        </Box>
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx, idx) => (
                      <tr key={tx.id ?? idx}>
                        {/* Fecha */}
                        <td>
                          <Typography level="body-xs" sx={{ whiteSpace: 'nowrap' }}>
                            {formatDatetime(tx.createdAt)}
                          </Typography>
                        </td>

                        {/* Tipo de crédito */}
                        <td>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.tertiary' }}>
                              {CREDIT_TYPE_ICONS[tx.creditType?.key] ?? <CreditIcon sx={{ fontSize: 15 }} />}
                            </Box>
                            <Typography level="body-xs">
                              {tx.creditType?.name ?? tx.creditType?.key ?? '—'}
                            </Typography>
                          </Stack>
                        </td>

                        {/* Fuente */}
                        <td>
                          <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                            {formatSourceLabel(tx.source ?? '')}
                          </Typography>
                        </td>

                        {/* Dirección */}
                        <td style={{ textAlign: 'center' }}>
                          <Chip
                            size="sm"
                            variant="soft"
                            color={tx.direction === 'credit' ? 'success' : 'danger'}
                          >
                            {tx.direction === 'credit' ? 'Crédito' : 'Débito'}
                          </Chip>
                        </td>

                        {/* Cantidad */}
                        <td style={{ textAlign: 'right' }}>
                          <Typography
                            level="body-sm"
                            fontWeight="lg"
                            sx={{
                              color: tx.direction === 'credit' ? '#52b788' : '#ef4444',
                            }}
                          >
                            {tx.direction === 'credit' ? '+' : '-'}{formatNumber(tx.amount)}
                          </Typography>
                        </td>

                        {/* Balance después */}
                        <td style={{ textAlign: 'right' }}>
                          <Tooltip
                            title={`Antes: ${formatNumber(tx.balanceBefore)}`}
                            placement="top"
                          >
                            <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                              {formatNumber(tx.balanceAfter)}
                            </Typography>
                          </Tooltip>
                        </td>

                        {/* Usuario */}
                        <td>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {tx.user?.name ?? '—'}
                          </Typography>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Box>

            {/* Paginación */}
            {txTotal > TX_LIMIT && (
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Typography level="body-xs" color="neutral">
                  Mostrando {Math.min((txPage - 1) * TX_LIMIT + 1, txTotal)}–
                  {Math.min(txPage * TX_LIMIT, txTotal)} de {txTotal.toLocaleString('es-ES')}
                </Typography>
                <Stack direction="row" spacing={0.5}>
                  <IconButton
                    size="sm"
                    variant="outlined"
                    color="neutral"
                    disabled={txPage <= 1 || txLoading}
                    onClick={() => setTxPage(p => Math.max(1, p - 1))}
                  >
                    <PrevIcon />
                  </IconButton>
                  <Chip size="sm" variant="soft" color="primary" sx={{ px: 1.5 }}>
                    {txPage} / {Math.ceil(txTotal / TX_LIMIT)}
                  </Chip>
                  <IconButton
                    size="sm"
                    variant="outlined"
                    color="neutral"
                    disabled={txPage >= Math.ceil(txTotal / TX_LIMIT) || txLoading}
                    onClick={() => setTxPage(p => p + 1)}
                  >
                    <NextIcon />
                  </IconButton>
                </Stack>
              </Box>
            )}
          </Sheet>
        </>
      )}
    </Stack>
  )
}
