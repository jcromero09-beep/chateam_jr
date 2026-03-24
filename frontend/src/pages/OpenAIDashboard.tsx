import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Chip,
  Table,
  Sheet,
  Button,
  Select,
  Option,
  CircularProgress,
} from '@mui/joy'
import {
  Psychology as AIIcon,
  TrendingUp as TrendingUpIcon,
  Speed as SpeedIcon,
  AttachMoney as CostIcon,
  Refresh as RefreshIcon,
  AccountBalanceWallet as WalletIcon,
  ShoppingCart as ShopIcon,
} from '@mui/icons-material'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import SubplanModal from '../components/SubplanModal'

interface Stats {
  totalTokensMonth: number
  totalTokensAll: number
  totalCostMonth: number
  totalCostAll: number
  activeModels: number
  avgCostPerRequest: number
  popularModel: string
}

interface ModelUsage {
  name: string
  value: number
  tokens: number
  cost: number
  color: string
}

interface TokenTrend {
  month: string
  tokens: number
  cost: number
}

interface RecentActivity {
  id: number
  month: string
  model: string
  tokens_month: number
  cost_usd_month: number
  updated_at: string
}

interface DashboardData {
  stats: Stats
  modelUsage: ModelUsage[]
  tokenTrends: TokenTrend[]
  recentActivity: RecentActivity[]
}

// Interface para consumo de tokens por subplan
interface SubplanConsumption {
  id: number
  name: string
  tokens: number
  tokensConsumed: number
}

export default function OpenAIDashboard() {
  const { user } = useAuth()
  const [timeRange, setTimeRange] = useState('30d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subplans, setSubplans] = useState<SubplanConsumption[]>([])

  // State para balance de tokens y modal de compra
  const [tokenInfo, setTokenInfo] = useState<{
    tokenBalance: number
    activeSubplan: any
    activeSubplanId: number | null
  } | null>(null)
  const [subplanModalOpen, setSubplanModalOpen] = useState(false)

  // Verificar si el usuario es superadmin
  const isSuperAdmin = user?.profile === 'super' || user?.super === true

  const [data, setData] = useState<DashboardData>({
    stats: {
      totalTokensMonth: 0,
      totalTokensAll: 0,
      totalCostMonth: 0,
      totalCostAll: 0,
      activeModels: 0,
      avgCostPerRequest: 0,
      popularModel: 'N/A',
    },
    modelUsage: [],
    tokenTrends: [],
    recentActivity: [],
  })

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Cargar info de tokens desde Company
      try {
        const companyRes = await api.get('/companies/find')
        const company = companyRes.data
        setTokenInfo({
          tokenBalance: Number(company.aiTokenBalance || 0),
          activeSubplan: company.activeAISubplan || null,
          activeSubplanId: company.activeAISubplanId || null
        })
      } catch (tokenErr) {
        console.error('Error fetching company info:', tokenErr)
        // No bloquear si falla la carga de company info
      }

      // Solo cargar subplans si el usuario es superadmin
      if (isSuperAdmin) {
        const [statsRes, subplansRes] = await Promise.all([
          api.get('/openai/dashboard-stats', { params: { timeRange } }),
          api.get('/ai/subplans')
        ])
        setData(statsRes.data)
        setSubplans(subplansRes.data)
      } else {
        // Para usuarios no superadmin, solo cargar stats del dashboard
        const statsRes = await api.get('/openai/dashboard-stats', { params: { timeRange } })
        setData(statsRes.data)
        setSubplans([]) // No hay subplans para usuarios no superadmin
      }
    } catch (err: any) {
      console.error('Error fetching dashboard stats:', err)
      setError(err.response?.data?.error || 'Error al cargar los datos')
    } finally {
      setLoading(false)
    }
  }, [timeRange, isSuperAdmin])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('es-ES').format(num)
  }

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(num)
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateStr
    }
  }

  // Calcular color semáforo basado en porcentaje de tokens restantes
  const getTokenBalanceColor = () => {
    if (!tokenInfo?.activeSubplan) return 'neutral'
    const totalTokens = Number(tokenInfo.activeSubplan.tokens || 0)
    const currentBalance = Number(tokenInfo.tokenBalance || 0)
    if (totalTokens === 0) return 'neutral'
    const percentage = (currentBalance / totalTokens) * 100
    if (percentage < 5) return 'danger' // Rojo: menos del 5%
    if (percentage < 30) return 'warning' // Amarillo: menos del 30%
    return 'success' // Verde: más del 30%
  }

  // Calcular porcentaje de tokens restantes
  const getTokenPercentage = () => {
    if (!tokenInfo?.activeSubplan) return 0
    const totalTokens = Number(tokenInfo.activeSubplan.tokens || 0)
    const currentBalance = Number(tokenInfo.tokenBalance || 0)
    if (totalTokens === 0) return 0
    return (currentBalance / totalTokens) * 100
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress size="lg" />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <AIIcon sx={{ fontSize: 32 }} />
            Dashboard OpenAI
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Metricas de uso, tokens y costos de modelos de IA
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Select value={timeRange} onChange={(_, val) => setTimeRange(val as string)} size="sm">
            <Option value="24h">Ultimas 24 horas</Option>
            <Option value="7d">Ultimos 7 dias</Option>
            <Option value="30d">Ultimos 30 dias</Option>
            <Option value="90d">Ultimos 90 dias</Option>
          </Select>
          <Button variant="outlined" size="sm" startDecorator={<RefreshIcon />} onClick={fetchData}>
            Actualizar
          </Button>
        </Box>
      </Box>

      {error && (
        <Card sx={{ mb: 3, bgcolor: 'danger.softBg' }}>
          <CardContent>
            <Typography color="danger">{error}</Typography>
          </CardContent>
        </Card>
      )}

      {/* KPIs Principales */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                    Tokens (Este mes)
                  </Typography>
                  <Typography level="h3">{formatNumber(data.stats.totalTokensMonth)}</Typography>
                </Box>
                <AIIcon sx={{ fontSize: 40, color: 'primary.500', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                    Total Tokens (Historico)
                  </Typography>
                  <Typography level="h3">{formatNumber(data.stats.totalTokensAll)}</Typography>
                </Box>
                <TrendingUpIcon sx={{ fontSize: 40, color: 'success.500', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                    Costo (Este mes)
                  </Typography>
                  <Typography level="h3">{formatCurrency(data.stats.totalCostMonth)}</Typography>
                </Box>
                <CostIcon sx={{ fontSize: 40, color: 'warning.500', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                    Costo Total (Historico)
                  </Typography>
                  <Typography level="h3">{formatCurrency(data.stats.totalCostAll)}</Typography>
                </Box>
                <SpeedIcon sx={{ fontSize: 40, color: 'info.500', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Metricas Adicionales */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                Modelos Activos
              </Typography>
              <Typography level="h4">{data.stats.activeModels} modelos</Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 1 }}>
                Configurados y en uso
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                Costo Promedio / Request
              </Typography>
              <Typography level="h4">{formatCurrency(data.stats.avgCostPerRequest)}</Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 1 }}>
                Estimado por solicitud
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                Modelo Mas Usado
              </Typography>
              <Typography level="h4">{data.stats.popularModel}</Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 1 }}>
                Mayor cantidad de tokens
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Card de Balance de Tokens IA */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
              <WalletIcon sx={{ fontSize: 40, color: `${getTokenBalanceColor()}.500` }} />
              <Box sx={{ flex: 1 }}>
                <Typography level="title-lg" sx={{ mb: 0.5 }}>
                  Balance de Tokens IA
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  <Typography level="h2" sx={{ color: `${getTokenBalanceColor()}.600` }}>
                    {formatNumber(tokenInfo?.tokenBalance || 0)}
                  </Typography>
                  <Typography level="body-md">tokens disponibles</Typography>
                </Box>
                {tokenInfo?.activeSubplan && (
                  <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Chip size="sm" variant="soft" color="primary">
                      Plan activo: {tokenInfo.activeSubplan.name} ({formatNumber(tokenInfo.activeSubplan.tokens)} tokens)
                    </Chip>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                      <LinearProgress
                        determinate
                        value={getTokenPercentage()}
                        color={getTokenBalanceColor()}
                        sx={{ flex: 1, height: 8 }}
                      />
                      <Typography level="body-xs" sx={{ minWidth: 45, color: `${getTokenBalanceColor()}.600` }}>
                        {getTokenPercentage().toFixed(1)}%
                      </Typography>
                    </Box>
                  </Box>
                )}
                {!tokenInfo?.activeSubplan && (
                  <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                    No tienes un plan activo. Compra tokens para comenzar.
                  </Typography>
                )}
              </Box>
            </Box>
            <Button
              variant="solid"
              color="primary"
              size="lg"
              startDecorator={<ShopIcon />}
              onClick={() => setSubplanModalOpen(true)}
            >
              {tokenInfo?.activeSubplan ? 'Comprar Más Tokens' : 'Comprar Tokens'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Modal de compra de subplans */}
      <SubplanModal
        open={subplanModalOpen}
        onClose={() => {
          setSubplanModalOpen(false)
          fetchData() // Refrescar datos al cerrar
        }}
        currentTokenInfo={tokenInfo}
      />

      {/* Consumo de Tokens por Subplan */}
      {subplans.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography level="title-lg" sx={{ mb: 2 }}>
              Consumo de Tokens por Subplan
            </Typography>
            <Sheet sx={{ overflow: 'auto' }}>
              <Table>
                <thead>
                  <tr>
                    <th>Subplan</th>
                    <th style={{ textAlign: 'right' }}>Tokens Totales</th>
                    <th style={{ textAlign: 'right' }}>Usados</th>
                    <th style={{ textAlign: 'right' }}>Restantes</th>
                    <th style={{ width: 200 }}>Progreso</th>
                  </tr>
                </thead>
                <tbody>
                  {subplans.map((subplan) => {
                    const remaining = Number(subplan.tokens) - Number(subplan.tokensConsumed || 0)
                    const usedPercent = Number(subplan.tokens) > 0
                      ? (Number(subplan.tokensConsumed || 0) / Number(subplan.tokens)) * 100
                      : 0
                    return (
                      <tr key={subplan.id}>
                        <td>
                          <Typography level="body-sm" fontWeight="lg">{subplan.name}</Typography>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Typography level="body-sm">{formatNumber(Number(subplan.tokens))}</Typography>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Typography level="body-sm">{formatNumber(Number(subplan.tokensConsumed || 0))}</Typography>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Typography level="body-sm" sx={{ color: remaining > 0 ? 'success.600' : 'danger.600' }}>
                            {formatNumber(remaining)}
                          </Typography>
                        </td>
                        <td>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LinearProgress
                              determinate
                              value={Math.min(usedPercent, 100)}
                              color={usedPercent > 90 ? 'danger' : usedPercent > 70 ? 'warning' : 'success'}
                              sx={{ flex: 1 }}
                            />
                            <Typography level="body-xs" sx={{ minWidth: 40 }}>
                              {usedPercent.toFixed(0)}%
                            </Typography>
                          </Box>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </Sheet>
          </CardContent>
        </Card>
      )}

      {/* Graficos */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Tendencia de Tokens por Mes */}
        <Grid xs={12} lg={8}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                Uso de Tokens por Mes
              </Typography>
              {data.tokenTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={data.tokenTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={((value: number) => formatNumber(value)) as any} />
                    <Legend />
                    <Area type="monotone" dataKey="tokens" stroke="#10b981" fill="#10b981" name="Tokens" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Sin datos de tendencia disponibles
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Distribucion por Modelo */}
        <Grid xs={12} lg={4}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                Distribucion por Modelo
              </Typography>
              {data.modelUsage.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.modelUsage as any}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(props: any) => `${(props.name || '').split('-')[0]} ${props.value}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {data.modelUsage.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={((value: number, name: string) => [`${value}%`, name]) as any} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Sin datos de modelos disponibles
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Tendencia de Costos */}
        <Grid xs={12}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                Costos por Mes
              </Typography>
              {data.tokenTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.tokenTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={((value: number) => formatCurrency(value)) as any} />
                    <Legend />
                    <Bar dataKey="cost" fill="#f59e0b" name="Costo (USD)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Sin datos de costos disponibles
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Detalle por Modelo */}
      {data.modelUsage.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography level="title-lg" sx={{ mb: 2 }}>
              Detalle por Modelo
            </Typography>
            <Sheet sx={{ overflow: 'auto' }}>
              <Table>
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th style={{ textAlign: 'right' }}>Tokens</th>
                    <th style={{ textAlign: 'right' }}>Costo USD</th>
                    <th style={{ textAlign: 'right' }}>% del Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.modelUsage.map((model) => (
                    <tr key={model.name}>
                      <td>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: model.color }} />
                          <Typography level="body-sm">{model.name}</Typography>
                        </Box>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Typography level="body-sm">{formatNumber(model.tokens)}</Typography>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Typography level="body-sm">{formatCurrency(model.cost)}</Typography>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
                          <LinearProgress determinate value={model.value} sx={{ width: 60 }} />
                          <Typography level="body-sm">{model.value}%</Typography>
                        </Box>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Sheet>
          </CardContent>
        </Card>
      )}

      {/* Actividad Reciente */}
      <Card>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2 }}>
            Actividad Reciente
          </Typography>
          {data.recentActivity.length > 0 ? (
            <Sheet sx={{ overflow: 'auto' }}>
              <Table>
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>Mes</th>
                    <th style={{ width: 180 }}>Modelo</th>
                    <th style={{ width: 120, textAlign: 'right' }}>Tokens</th>
                    <th style={{ width: 120, textAlign: 'right' }}>Costo USD</th>
                    <th style={{ width: 180 }}>Ultima actualizacion</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentActivity.map((activity) => (
                    <tr key={activity.id}>
                      <td>
                        <Chip size="sm" variant="soft">{activity.month}</Chip>
                      </td>
                      <td>
                        <Chip size="sm" variant="outlined">{activity.model}</Chip>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Typography level="body-sm">{formatNumber(activity.tokens_month)}</Typography>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Typography level="body-sm">{formatCurrency(activity.cost_usd_month)}</Typography>
                      </td>
                      <td>
                        <Typography level="body-xs">{formatDate(activity.updated_at)}</Typography>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Sheet>
          ) : (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                No hay actividad registrada aun. Los tokens se registraran cuando la IA responda mensajes.
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
