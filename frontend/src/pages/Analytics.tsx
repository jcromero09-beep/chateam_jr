import { useState, useEffect } from 'react'
import {
  Typography,
  Stack,
  Container,
  Card,
  CardContent,
  Select,
  Option,
  Box,
  Grid,
  Table,
  Sheet,
  Chip,
  LinearProgress,
} from '@mui/joy'
import {
  BarChart as BarChartIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Remove as RemoveIcon,
  BarChart as EmptyIcon,
} from '@mui/icons-material'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import api from '../services/api'

interface TrendPoint {
  date: string
  tickets: number
  messages: number
  contacts: number
}

interface ChannelPoint {
  name: string
  value: number
  color: string
}

interface AgentPoint {
  name: string
  tickets: number
  avgTime: string
  satisfaction: number
}

interface StatCard {
  title: string
  value: string
  change: string
  trend: 'up' | 'down' | 'neutral'
  color: string
}

export default function Analytics() {
  const [period, setPeriod] = useState('7days')
  const [loading, setLoading] = useState(true)
  const [trendData, setTrendData] = useState<TrendPoint[]>([])
  const [channelData, setChannelData] = useState<ChannelPoint[]>([])
  const [agentData, setAgentData] = useState<AgentPoint[]>([])
  const [stats, setStats] = useState<StatCard[]>([])

  useEffect(() => {
    fetchAnalytics()
  }, [period])

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const response = await api.get('/analytics', { params: { period } })
      const data = response.data?.data ?? response.data ?? {}
      setTrendData(data.trendData ?? [])
      setChannelData(data.channelData ?? [])
      setAgentData(data.agentData ?? [])
      setStats(data.stats ?? [])
    } catch {
      // Sin datos disponibles — se mostrará estado vacío
      setTrendData([])
      setChannelData([])
      setAgentData([])
      setStats([])
    } finally {
      setLoading(false)
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUpIcon sx={{ fontSize: 20 }} />
      case 'down':
        return <TrendingDownIcon sx={{ fontSize: 20 }} />
      default:
        return <RemoveIcon sx={{ fontSize: 20 }} />
    }
  }

  const isEmpty = !loading && stats.length === 0 && trendData.length === 0

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <BarChartIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Analytics</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Análisis y reportes del sistema
              </Typography>
            </Box>
          </Stack>
          <Select value={period} onChange={(_, value) => setPeriod(value as string)} sx={{ minWidth: 150 }}>
            <Option value="24hours">Últimas 24h</Option>
            <Option value="7days">Últimos 7 días</Option>
            <Option value="30days">Últimos 30 días</Option>
            <Option value="90days">Últimos 90 días</Option>
          </Select>
        </Stack>

        {/* Loading */}
        {loading && <LinearProgress />}

        {/* Estado vacío */}
        {isEmpty && (
          <Card>
            <CardContent>
              <Stack spacing={2} alignItems="center" sx={{ py: 6 }}>
                <EmptyIcon sx={{ fontSize: 56, color: 'text.tertiary' }} />
                <Typography level="title-lg" sx={{ color: 'text.secondary' }}>
                  No hay datos de analytics disponibles
                </Typography>
                <Typography level="body-sm" sx={{ color: 'text.tertiary', textAlign: 'center', maxWidth: 480 }}>
                  Los datos se generarán automáticamente a medida que uses la plataforma.
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        {stats.length > 0 && (
          <Grid container spacing={2}>
            {stats.map((stat, index) => (
              <Grid xs={12} sm={6} md={3} key={index}>
                <Card>
                  <CardContent>
                    <Typography level="body-sm" sx={{ mb: 1 }}>
                      {stat.title}
                    </Typography>
                    <Typography level="h2" sx={{ mb: 1 }}>
                      {stat.value}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip
                        size="sm"
                        color={stat.color as any}
                        startDecorator={getTrendIcon(stat.trend)}
                        variant="soft"
                      >
                        {stat.change}
                      </Chip>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        vs período anterior
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Charts — solo si hay datos */}
        {(trendData.length > 0 || channelData.length > 0 || agentData.length > 0) && (
          <Grid container spacing={3}>
            {/* Line Chart - Tendencia */}
            <Grid xs={12} md={8}>
              <Card>
                <CardContent>
                  <Typography level="h4" sx={{ mb: 3 }}>
                    Tendencia de Actividad
                  </Typography>
                  {trendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) =>
                            new Date(value).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })
                          }
                        />
                        <YAxis />
                        <Tooltip
                          labelFormatter={(value) => new Date(value).toLocaleDateString('es-ES')}
                          formatter={((value: number, name: string) => [
                            value,
                            name === 'tickets'
                              ? 'Tickets'
                              : name === 'messages'
                              ? 'Mensajes'
                              : 'Contactos Nuevos',
                          ]) as any}
                        />
                        <Line type="monotone" dataKey="tickets" stroke="#3b82f6" strokeWidth={2} name="tickets" />
                        <Line type="monotone" dataKey="messages" stroke="#10b981" strokeWidth={2} name="messages" />
                        <Line type="monotone" dataKey="contacts" stroke="#f59e0b" strokeWidth={2} name="contacts" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                        Sin datos de tendencia para este período
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Pie Chart - Distribución por Canal */}
            <Grid xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography level="h4" sx={{ mb: 3 }}>
                    Distribución por Canal
                  </Typography>
                  {channelData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={channelData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }: any) => `${name} ${((percent as number) * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {channelData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                        Sin datos por canal
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Bar Chart - Rendimiento por Agente */}
            <Grid xs={12}>
              <Card>
                <CardContent>
                  <Typography level="h4" sx={{ mb: 3 }}>
                    Rendimiento por Agente
                  </Typography>
                  {agentData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={agentData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="tickets" fill="#3b82f6" name="Tickets Atendidos" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                        Sin datos de agentes
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Tabla de Agentes */}
            {agentData.length > 0 && (
              <Grid xs={12}>
                <Card>
                  <CardContent>
                    <Typography level="h4" sx={{ mb: 2 }}>
                      Detalle de Agentes
                    </Typography>
                    <Sheet sx={{ overflow: 'auto' }}>
                      <Table>
                        <thead>
                          <tr>
                            <th>Agente</th>
                            <th>Tickets Atendidos</th>
                            <th>Tiempo Promedio</th>
                            <th>Satisfacción</th>
                            <th>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {agentData.map((agent, index) => (
                            <tr key={index}>
                              <td>
                                <Typography level="body-sm" fontWeight="bold">
                                  {agent.name}
                                </Typography>
                              </td>
                              <td>
                                <Typography level="body-sm">{agent.tickets}</Typography>
                              </td>
                              <td>
                                <Typography level="body-sm">{agent.avgTime}</Typography>
                              </td>
                              <td>
                                <Stack direction="row" spacing={1} alignItems="center">
                                  <Typography level="body-sm" fontWeight="bold">
                                    {agent.satisfaction}
                                  </Typography>
                                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                    / 5.0
                                  </Typography>
                                </Stack>
                              </td>
                              <td>
                                <Chip
                                  size="sm"
                                  color={agent.satisfaction >= 4.7 ? 'success' : 'primary'}
                                  variant="soft"
                                >
                                  {agent.satisfaction >= 4.7 ? 'Excelente' : 'Bueno'}
                                </Chip>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </Sheet>
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>
        )}
      </Stack>
    </Container>
  )
}
