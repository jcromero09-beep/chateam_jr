import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Select,
  Option,
  Chip,
  Table,
  Sheet,
  Button,
  LinearProgress,
  CircularProgress,
  Alert,
} from '@mui/joy'
import {
  Analytics as AnalyticsIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AttachMoney as CostIcon,
  Speed as SpeedIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  Close as CloseIcon,
} from '@mui/icons-material'
import IconButton from '@mui/joy/IconButton'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import api from '../services/api'

interface AnalyticsData {
  summary: {
    totalTokensMonth: number
    totalTokensAll: number
    totalCostMonth: number
    totalCostAll: number
    totalRequests: number
    avgCostPerRequest: number
    avgTokensPerRequest: number
    mostUsedModel: string
    costTrend: number // percentage change
  }
  byModel: Array<{
    model: string
    tokens: number
    cost: number
    requests: number
    percentage: number
    color: string
  }>
  byMonth: Array<{
    month: string
    tokens: number
    cost: number
    requests: number
  }>
  byModule: Array<{
    module: string
    tokens: number
    cost: number
    requests: number
    percentage: number
  }>
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658']

export default function OpenAIAnalytics() {
  const [timeRange, setTimeRange] = useState('30d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [data, setData] = useState<AnalyticsData>({
    summary: {
      totalTokensMonth: 0,
      totalTokensAll: 0,
      totalCostMonth: 0,
      totalCostAll: 0,
      totalRequests: 0,
      avgCostPerRequest: 0,
      avgTokensPerRequest: 0,
      mostUsedModel: 'N/A',
      costTrend: 0,
    },
    byModel: [],
    byMonth: [],
    byModule: [],
  })

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      console.log('[OpenAIAnalytics] Fetching analytics data...')
      const response = await api.get('/ai/analytics', {
        params: { timeRange }
      })
      console.log('[OpenAIAnalytics] Analytics loaded:', response.data)
      setData(response.data)
    } catch (err: any) {
      console.error('[OpenAIAnalytics] Error fetching analytics:', err)
      setError(err.response?.data?.error || 'Error al cargar analytics')
    } finally {
      setLoading(false)
    }
  }, [timeRange])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('es-ES').format(num)
  }

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(num)
  }

  const handleExport = async () => {
    try {
      console.log('[OpenAIAnalytics] Exporting analytics...')
      const csvContent = [
        'Modelo,Tokens,Costo USD,Requests,Porcentaje',
        ...data.byModel.map(m => `${m.model},${m.tokens},${m.cost},${m.requests},${m.percentage}%`)
      ].join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[OpenAIAnalytics] Error exporting:', err)
    }
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
            <AnalyticsIcon sx={{ fontSize: 32 }} />
            Analytics de IA
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Analisis detallado de costos y rendimiento por modelo
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Select value={timeRange} onChange={(_, val) => setTimeRange(val as string)} size="sm">
            <Option value="7d">Ultimos 7 dias</Option>
            <Option value="30d">Ultimos 30 dias</Option>
            <Option value="90d">Ultimos 90 dias</Option>
            <Option value="1y">Ultimo ano</Option>
          </Select>
          <Button variant="outlined" size="sm" startDecorator={<RefreshIcon />} onClick={fetchAnalytics}>
            Actualizar
          </Button>
          <Button variant="outlined" size="sm" startDecorator={<DownloadIcon />} onClick={handleExport}>
            Exportar
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert
          color="danger"
          sx={{ mb: 2 }}
          endDecorator={
            <IconButton variant="soft" color="danger" onClick={() => setError(null)}>
              <CloseIcon />
            </IconButton>
          }
        >
          {error}
        </Alert>
      )}

      {/* KPIs de Costos */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                    Costo Total (Este Mes)
                  </Typography>
                  <Typography level="h3">{formatCurrency(data.summary.totalCostMonth)}</Typography>
                  {data.summary.costTrend !== 0 && (
                    <Chip
                      size="sm"
                      color={data.summary.costTrend > 0 ? 'warning' : 'success'}
                      startDecorator={data.summary.costTrend > 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
                      sx={{ mt: 1 }}
                    >
                      {data.summary.costTrend > 0 ? '+' : ''}{data.summary.costTrend.toFixed(1)}%
                    </Chip>
                  )}
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
                    Costo Promedio/Request
                  </Typography>
                  <Typography level="h3">{formatCurrency(data.summary.avgCostPerRequest)}</Typography>
                </Box>
                <SpeedIcon sx={{ fontSize: 40, color: 'success.500', opacity: 0.3 }} />
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
                    Total Tokens (Este Mes)
                  </Typography>
                  <Typography level="h3">{formatNumber(data.summary.totalTokensMonth)}</Typography>
                </Box>
                <TrendingUpIcon sx={{ fontSize: 40, color: 'primary.500', opacity: 0.3 }} />
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
                    Modelo Mas Usado
                  </Typography>
                  <Typography level="h3" sx={{ fontSize: '1.2rem' }}>
                    {data.summary.mostUsedModel}
                  </Typography>
                </Box>
                <CostIcon sx={{ fontSize: 40, color: 'info.500', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Distribucion de Costos */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid xs={12} lg={8}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                Tendencia de Costos por Mes
              </Typography>
              {data.byMonth.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={data.byMonth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend />
                    <Area type="monotone" dataKey="cost" stroke="#10b981" fill="#10b981" name="Costo (USD)" />
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

        <Grid xs={12} lg={4}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                Distribucion por Modelo
              </Typography>
              {data.byModel.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={data.byModel}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(props: any) => `${(props.name || '').split('-')[0]} ${((props.percent || 0) * 100).toFixed(0)}%`}
                        outerRadius={70}
                        fill="#8884d8"
                        dataKey="cost"
                      >
                        {data.byModel.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <Box sx={{ mt: 2 }}>
                    {data.byModel.map((model, index) => (
                      <Box key={model.model} sx={{ mb: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box
                              sx={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                bgcolor: model.color || COLORS[index % COLORS.length],
                              }}
                            />
                            <Typography level="body-sm">{model.model}</Typography>
                          </Box>
                          <Typography level="body-sm" fontWeight="lg">
                            {formatCurrency(model.cost)}
                          </Typography>
                        </Box>
                        <LinearProgress determinate value={model.percentage} />
                      </Box>
                    ))}
                  </Box>
                </>
              ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Sin datos de modelos disponibles
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tendencia de Tokens */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid xs={12}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                Uso de Tokens por Mes
              </Typography>
              {data.byMonth.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.byMonth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => formatNumber(value)} />
                    <Legend />
                    <Bar dataKey="tokens" fill="#3b82f6" name="Tokens" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Sin datos de tokens disponibles
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabla de Rendimiento por Modelo */}
      {data.byModel.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography level="title-lg" sx={{ mb: 2 }}>
              Rendimiento por Modelo
            </Typography>
            <Sheet sx={{ overflow: 'auto' }}>
              <Table>
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th style={{ textAlign: 'right' }}>Tokens</th>
                    <th style={{ textAlign: 'right' }}>Costo USD</th>
                    <th style={{ textAlign: 'right' }}>Requests</th>
                    <th style={{ textAlign: 'right' }}>% del Total</th>
                    <th>Eficiencia</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byModel.map((model, index) => (
                    <tr key={model.model}>
                      <td>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box
                            sx={{
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              bgcolor: model.color || COLORS[index % COLORS.length],
                            }}
                          />
                          <Typography level="title-sm">{model.model}</Typography>
                        </Box>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Typography level="body-sm">{formatNumber(model.tokens)}</Typography>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Typography level="body-sm">{formatCurrency(model.cost)}</Typography>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Typography level="body-sm">{formatNumber(model.requests)}</Typography>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
                          <LinearProgress determinate value={model.percentage} sx={{ width: 60 }} />
                          <Typography level="body-sm">{model.percentage.toFixed(1)}%</Typography>
                        </Box>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={
                            model.requests > 0 && (model.cost / model.requests) < 0.01
                              ? 'success'
                              : (model.cost / model.requests) < 0.03
                              ? 'warning'
                              : 'danger'
                          }
                        >
                          {model.requests > 0 && (model.cost / model.requests) < 0.01
                            ? 'Excelente'
                            : (model.cost / model.requests) < 0.03
                            ? 'Buena'
                            : 'Media'}
                        </Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Sheet>
          </CardContent>
        </Card>
      )}

      {/* Uso por Modulo */}
      {data.byModule && data.byModule.length > 0 && (
        <Card>
          <CardContent>
            <Typography level="title-lg" sx={{ mb: 2 }}>
              Uso por Modulo
            </Typography>
            <Sheet sx={{ overflow: 'auto' }}>
              <Table>
                <thead>
                  <tr>
                    <th>Modulo</th>
                    <th style={{ textAlign: 'right' }}>Tokens</th>
                    <th style={{ textAlign: 'right' }}>Costo USD</th>
                    <th style={{ textAlign: 'right' }}>Requests</th>
                    <th style={{ textAlign: 'right' }}>% del Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byModule.map((module) => (
                    <tr key={module.module}>
                      <td>
                        <Chip size="sm" variant="soft">
                          {module.module}
                        </Chip>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Typography level="body-sm">{formatNumber(module.tokens)}</Typography>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Typography level="body-sm">{formatCurrency(module.cost)}</Typography>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Typography level="body-sm">{formatNumber(module.requests)}</Typography>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
                          <LinearProgress determinate value={module.percentage} sx={{ width: 60 }} />
                          <Typography level="body-sm">{module.percentage.toFixed(1)}%</Typography>
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

      {/* Mensaje cuando no hay datos */}
      {data.byModel.length === 0 && data.byMonth.length === 0 && (
        <Card>
          <CardContent>
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                No hay datos de analytics disponibles. Los datos se registraran automaticamente cuando la IA procese mensajes.
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}
