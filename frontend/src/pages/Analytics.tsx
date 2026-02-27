import { useState } from 'react'
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
} from '@mui/joy'
import {
  BarChart as BarChartIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Remove as RemoveIcon,
} from '@mui/icons-material'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

export default function Analytics() {
  const [period, setPeriod] = useState('7days')

  // Datos de tendencia
  const trendData = [
    { date: '2025-01-04', tickets: 45, messages: 320, contacts: 28 },
    { date: '2025-01-05', tickets: 52, messages: 380, contacts: 35 },
    { date: '2025-01-06', tickets: 48, messages: 350, contacts: 30 },
    { date: '2025-01-07', tickets: 65, messages: 450, contacts: 42 },
    { date: '2025-01-08', tickets: 58, messages: 410, contacts: 38 },
    { date: '2025-01-09', tickets: 72, messages: 520, contacts: 48 },
    { date: '2025-01-10', tickets: 68, messages: 480, contacts: 45 },
  ]

  // Datos de distribución por canal
  const channelData = [
    { name: 'WhatsApp', value: 450, color: '#25D366' },
    { name: 'Email', value: 280, color: '#0078D4' },
    { name: 'SMS', value: 120, color: '#FF6B35' },
    { name: 'Web Chat', value: 180, color: '#9333EA' },
  ]

  // Datos de rendimiento por agente
  const agentData = [
    { name: 'María García', tickets: 145, avgTime: '8m 32s', satisfaction: 4.8 },
    { name: 'Carlos López', tickets: 132, avgTime: '9m 15s', satisfaction: 4.6 },
    { name: 'Ana Martínez', tickets: 128, avgTime: '7m 48s', satisfaction: 4.9 },
    { name: 'Pedro Rodríguez', tickets: 118, avgTime: '10m 22s', satisfaction: 4.5 },
    { name: 'Laura Sánchez', tickets: 105, avgTime: '8m 55s', satisfaction: 4.7 },
  ]

  const stats = [
    {
      title: 'Tickets Resueltos',
      value: '628',
      change: '+12.5%',
      trend: 'up',
      color: 'success',
    },
    {
      title: 'Tiempo Promedio Respuesta',
      value: '8m 42s',
      change: '-8.3%',
      trend: 'down',
      color: 'success',
    },
    {
      title: 'Satisfacción Cliente',
      value: '4.7',
      change: '+0.2',
      trend: 'up',
      color: 'success',
    },
    {
      title: 'Tasa de Resolución',
      value: '94.2%',
      change: '0%',
      trend: 'neutral',
      color: 'neutral',
    },
  ]

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

        {/* KPI Cards */}
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

        {/* Charts */}
        <Grid container spacing={3}>
          {/* Line Chart - Tendencia */}
          <Grid xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography level="h4" sx={{ mb: 3 }}>
                  Tendencia de Actividad
                </Typography>
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
                      formatter={(value: number, name: string) => [
                        value,
                        name === 'tickets'
                          ? 'Tickets'
                          : name === 'messages'
                          ? 'Mensajes'
                          : 'Contactos Nuevos',
                      ]}
                    />
                    <Line type="monotone" dataKey="tickets" stroke="#3b82f6" strokeWidth={2} name="tickets" />
                    <Line type="monotone" dataKey="messages" stroke="#10b981" strokeWidth={2} name="messages" />
                    <Line type="monotone" dataKey="contacts" stroke="#f59e0b" strokeWidth={2} name="contacts" />
                  </LineChart>
                </ResponsiveContainer>
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
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={agentData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="tickets" fill="#3b82f6" name="Tickets Atendidos" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          {/* Tabla de Agentes */}
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
        </Grid>
      </Stack>
    </Container>
  )
}
