import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  Table,
  Sheet,
  CircularProgress,
  Alert,
  Select,
  Option,
  IconButton,
  LinearProgress,
} from '@mui/joy'
import {
  Coins,
  RefreshCw,
  X,
  TrendingUp,
  Zap,
  Database,
  DollarSign,
  ShoppingCart,
} from 'lucide-react'
import SubplanModal from '../components/SubplanModal'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// --- Types ---
interface CostReport {
  totalCostMonth: number
  totalTokens: number
  cacheHitRate: number
  costPerInteraction: number
  costByModel: CostByModel[]
  dailyTrend: DailyTrend[]
}

interface CostByModel {
  name: string
  cost: number
  color?: string
}

interface DailyTrend {
  date: string
  cost: number
}

interface CacheStats {
  hitRate: number
  totalHits: number
  totalMisses: number
}

interface CreditBalance {
  id: number
  creditType: string
  balance: number
  totalAdded: number
  totalConsumed: number
  expiresAt: string | null
  status: 'active' | 'expired' | 'depleted'
}

interface CreditQuota {
  creditType: string
  usedCredits: number
  totalCredits: number
  resetAt: string | null
}

type Period = '7d' | '30d' | '90d'

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#14b8a6']

const STATUS_CONFIG: Record<string, { label: string; color: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  active: { label: 'Activo', color: 'success' },
  expired: { label: 'Expirado', color: 'danger' },
  depleted: { label: 'Agotado', color: 'warning' },
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    })
  } catch { return dateStr }
}

const getQuotaColor = (pct: number): 'success' | 'warning' | 'danger' => {
  if (pct > 85) return 'danger'
  if (pct >= 60) return 'warning'
  return 'success'
}

// --- Pagina Principal ---
export default function AICredits() {
  const [period, setPeriod] = useState<Period>('30d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [costReport, setCostReport] = useState<CostReport | null>(null)
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [balances, setBalances] = useState<CreditBalance[]>([])
  const [quotas, setQuotas] = useState<CreditQuota[]>([])

  // Modal de compra de subplanes
  const [subplanModalOpen, setSubplanModalOpen] = useState(false)
  const [tokenInfo, setTokenInfo] = useState<{ tokenBalance: number; activeSubplan: { name: string } | null; activeSubplanId: number | null } | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      devLog('[AICredits] Cargando datos para periodo:', period)

      const [reportResult, cacheResult, balancesResult, quotasResult, tokenInfoResult] = await Promise.allSettled([
        api.get<CostReport>(`/ai/costs/report?period=${period}`),
        api.get<CacheStats>('/ai/costs/cache-stats'),
        api.get<CreditBalance[]>('/ai/credits/balances'),
        api.get<CreditQuota[]>('/ai/credits/quotas'),
        api.get<{ balance: number; subplanName?: string }>('/ai/subplan-purchase/token-info'),
      ])

      // Cargar info de tokens
      if (tokenInfoResult.status === 'fulfilled') {
        setTokenInfo(tokenInfoResult.value.data as any)
      }

      if (reportResult.status === 'fulfilled') {
        const raw = reportResult.value.data
        const report = (raw as unknown as { data?: CostReport }).data ?? (raw as unknown as CostReport)
        setCostReport(report)
      } else {
        devError('[AICredits] Error al cargar reporte:', reportResult.reason)
      }

      if (cacheResult.status === 'fulfilled') {
        const raw = cacheResult.value.data
        setCacheStats((raw as unknown as { data?: CacheStats }).data ?? (raw as unknown as CacheStats))
      } else {
        devError('[AICredits] Error al cargar cache stats:', cacheResult.reason)
      }

      if (balancesResult.status === 'fulfilled') {
        const raw = balancesResult.value.data
        const rawArr: any[] = (raw as unknown as { data?: any[] }).data ?? (raw as unknown as any[]) ?? []
        // Mapear campos del modelo backend (totalCredits, usedCredits, resetAt, creditType obj)
        // a la interfaz frontend (balance, totalAdded, totalConsumed, expiresAt, creditType string)
        const mapped: CreditBalance[] = rawArr.map((b: any) => ({
          id: b.id,
          creditType: typeof b.creditType === 'object' && b.creditType?.name
            ? b.creditType.name
            : (b.creditType ?? `Tipo #${b.creditTypeId ?? b.id}`),
          balance: b.balance ?? (Number(b.totalCredits ?? 0) - Number(b.usedCredits ?? 0)),
          totalAdded: b.totalAdded ?? Number(b.totalCredits ?? 0),
          totalConsumed: b.totalConsumed ?? Number(b.usedCredits ?? 0),
          expiresAt: b.expiresAt ?? b.resetAt ?? null,
          status: b.status ?? (
            Number(b.usedCredits ?? 0) >= Number(b.totalCredits ?? 0)
              ? 'depleted'
              : 'active'
          ),
        }))
        setBalances(mapped)
      } else {
        devError('[AICredits] Error al cargar balances:', balancesResult.reason)
      }

      if (quotasResult.status === 'fulfilled') {
        const raw = quotasResult.value.data
        const rawQuotas: any[] = (raw as unknown as { data?: any[] }).data ?? (raw as unknown as any[]) ?? []
        // Mapear creditType objeto a string si viene como asociación Sequelize
        const mappedQuotas: CreditQuota[] = rawQuotas.map((q: any) => ({
          creditType: typeof q.creditType === 'object' && q.creditType?.name
            ? q.creditType.name
            : (q.creditType ?? `Tipo #${q.creditTypeId ?? q.id}`),
          usedCredits: Number(q.usedCredits ?? 0),
          totalCredits: Number(q.totalCredits ?? 0),
          resetAt: q.resetAt ?? null,
        }))
        setQuotas(mappedQuotas)
      } else {
        devError('[AICredits] Error al cargar cuotas:', quotasResult.reason)
      }

      const allFailed = [reportResult, cacheResult, balancesResult, quotasResult]
        .every((r) => r.status === 'rejected')
      if (allFailed) setError('No se pudo cargar ninguna fuente de datos. Intenta de nuevo.')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      devError('[AICredits] Error general:', err)
      setError(e.response?.data?.message || 'Error inesperado al cargar los datos')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetchData() }, [fetchData])

  // Pie data con colores asignados
  const pieData = (costReport?.costByModel ?? []).map((item, idx) => ({
    ...item,
    color: item.color ?? PIE_COLORS[idx % PIE_COLORS.length],
  }))

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress size="lg" />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography level="h2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Coins size={28} />
            Creditos y Costos de IA
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary', mt: 0.5 }}>
            Monitoreo de consumo, costos y cuotas de creditos por tipo
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            color="primary"
            startDecorator={<ShoppingCart size={16} />}
            onClick={() => setSubplanModalOpen(true)}
          >
            Comprar Tokens
          </Button>
          <Select
            size="sm"
            value={period}
            onChange={(_, val) => { if (val) setPeriod(val as Period) }}
            sx={{ minWidth: 120 }}
          >
            <Option value="7d">7 dias</Option>
            <Option value="30d">30 dias</Option>
            <Option value="90d">90 dias</Option>
          </Select>
          <Button variant="outlined" startDecorator={<RefreshCw size={16} />} onClick={fetchData}>
            Actualizar
          </Button>
        </Box>
      </Box>

      {/* Error */}
      {error && (
        <Alert color="danger" sx={{ mb: 3 }} endDecorator={
          <IconButton size="sm" variant="plain" color="danger" onClick={() => setError(null)}><X size={16} /></IconButton>
        }>
          {error}
        </Alert>
      )}

      {/* Seccion 1: Stat Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <DollarSign size={18} style={{ opacity: 0.6 }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Costo Mensual</Typography>
              </Box>
              <Typography level="h3">
                ${(costReport?.totalCostMonth ?? 0).toFixed(2)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Zap size={18} style={{ opacity: 0.6 }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Tokens Utilizados</Typography>
              </Box>
              <Typography level="h3">
                {(costReport?.totalTokens ?? 0).toLocaleString('es-ES')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Database size={18} style={{ opacity: 0.6 }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Cache Hit Rate</Typography>
              </Box>
              <Typography level="h3">
                {((cacheStats?.hitRate ?? costReport?.cacheHitRate ?? 0) * 100).toFixed(1)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <TrendingUp size={18} style={{ opacity: 0.6 }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Costo por Interaccion</Typography>
              </Box>
              <Typography level="h3">
                ${(costReport?.costPerInteraction ?? 0).toFixed(4)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Seccion 2: Graficos */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* PieChart - Costo por modelo */}
        <Grid xs={12} md={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>Costo por Modelo</Typography>
              {pieData.length === 0 ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 280 }}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Sin datos de modelos</Typography>
                </Box>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      dataKey="cost"
                      nameKey="name"
                      labelLine={false}
                      label={(props: unknown) => {
                        const p = props as { name: unknown; percent: number }
                        const name = String(p.name ?? '')
                        return `${name.split('-')[0]} ${((p.percent ?? 0) * 100).toFixed(0)}%`
                      }}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: unknown) => [`$${(value as number).toFixed(4)}`, 'Costo']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* AreaChart - Tendencia diaria */}
        <Grid xs={12} md={7}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>Tendencia de Costo Diario</Typography>
              {(costReport?.dailyTrend ?? []).length === 0 ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 280 }}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Sin datos de tendencia</Typography>
                </Box>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={costReport?.dailyTrend ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: unknown) => [`$${(value as number).toFixed(4)}`, 'Costo']}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="cost"
                      stroke="#6366f1"
                      fill="#6366f133"
                      name="Costo (USD)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Seccion 3: Cuota por Tipo de Credito */}
      {quotas.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography level="title-lg" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Coins size={20} />
              Cuota por Tipo de Credito
            </Typography>
            <Grid container spacing={2}>
              {quotas.map((quota) => {
                const pct = quota.totalCredits > 0
                  ? (quota.usedCredits / quota.totalCredits) * 100
                  : 0
                const color = getQuotaColor(pct)
                return (
                  <Grid key={quota.creditType} xs={12} sm={6} md={4}>
                    <Box sx={{ p: 1.5, borderRadius: 'sm', border: '1px solid', borderColor: 'divider' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography level="body-sm" fontWeight="lg">{quota.creditType}</Typography>
                        <Chip size="sm" color={color}>{pct.toFixed(1)}%</Chip>
                      </Box>
                      <LinearProgress
                        determinate
                        value={Math.min(pct, 100)}
                        color={color}
                        sx={{ mb: 0.5 }}
                      />
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {(quota.usedCredits ?? 0).toLocaleString('es-ES')} / {(quota.totalCredits ?? 0).toLocaleString('es-ES')}
                        </Typography>
                        {quota.resetAt && (
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            Reset: {formatDate(quota.resetAt)}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </Grid>
                )
              })}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Seccion 4: Tabla de Balances */}
      <Card>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <DollarSign size={20} />
            Balances de Creditos
          </Typography>
          {balances.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                No hay balances de creditos registrados
              </Typography>
            </Box>
          ) : (
            <Sheet sx={{ overflow: 'auto' }}>
              <Table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 140 }}>Tipo de Credito</th>
                    <th style={{ minWidth: 100, textAlign: 'right' }}>Balance</th>
                    <th style={{ minWidth: 120, textAlign: 'right' }}>Total Agregado</th>
                    <th style={{ minWidth: 120, textAlign: 'right' }}>Total Consumido</th>
                    <th style={{ minWidth: 120 }}>Expiracion</th>
                    <th style={{ minWidth: 100 }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((bal) => {
                    const statusConf = STATUS_CONFIG[bal.status] ?? { label: bal.status, color: 'neutral' as const }
                    return (
                      <tr key={bal.id}>
                        <td>
                          <Typography level="body-sm" fontWeight="lg">{bal.creditType}</Typography>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Typography level="body-sm" sx={{ color: 'success.600' }}>
                            {(bal.balance ?? 0).toLocaleString('es-ES')}
                          </Typography>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Typography level="body-sm">{(bal.totalAdded ?? 0).toLocaleString('es-ES')}</Typography>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Typography level="body-sm">{(bal.totalConsumed ?? 0).toLocaleString('es-ES')}</Typography>
                        </td>
                        <td>
                          <Typography level="body-xs">{formatDate(bal.expiresAt)}</Typography>
                        </td>
                        <td>
                          <Chip size="sm" color={statusConf.color}>{statusConf.label}</Chip>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </Sheet>
          )}
        </CardContent>
      </Card>

      {/* Modal de compra de subplanes */}
      <SubplanModal
        open={subplanModalOpen}
        onClose={() => setSubplanModalOpen(false)}
        onSuccess={() => {
          setSubplanModalOpen(false)
          fetchData()
        }}
        currentTokenInfo={tokenInfo as any}
      />
    </Box>
  )
}
