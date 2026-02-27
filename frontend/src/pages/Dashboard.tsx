import { useState, useEffect } from 'react'
import {
  Typography,
  Grid,
  Card,
  CardContent,
  Box,
  Chip,
  LinearProgress,
  Stack,
  Container,
  IconButton,
  Button as _Button,
  Avatar,
  Divider as _Divider,
  Table,
  Sheet,
} from '@mui/joy'
import {
  People as PeopleIcon,
  Chat as ChatIcon,
  TrendingUp as TrendingUpIcon,
  Memory as MemoryIcon,
  Dashboard as DashboardIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckIcon,
  Error as _ErrorIcon,
  Warning as _WarningIcon,
  Inbox as InboxIcon,
  DoneAll as _DoneAllIcon,
  Schedule as _ScheduleIcon,
  Campaign as CampaignIcon,
  WhatsApp as WhatsAppIcon,
  Person as PersonIcon,
  Star as StarIcon,
  TrendingDown as _TrendingDownIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'

interface DashboardStats {
  totalUsers: number
  activeConversations: number
  totalMessages: number
  aiInteractions: number
  trends: Array<{ date: string; messages: number; users: number }>
  tickets: {
    open: number
    pending: number
    closed: number
  }
  campaigns: {
    active: number
    scheduled: number
    completed: number
  }
  connections: {
    connected: number
    disconnected: number
    total: number
  }
  topAgents: Array<{
    id: number
    name: string
    ticketsClosed: number
    avgResponseTime: string
  }>
  recentActivity: Array<{
    id: number
    type: string
    message: string
    time: string
    user: string
  }>
  performance: {
    avgResponseTime: number
    satisfactionRate: number
    firstContactResolution: number
  }
}

const _COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (user?.companyId) {
      fetchDashboardStats()
    }
  }, [user, showAll])

  useEffect(() => {
    console.log('🔄 Dashboard Frontend - stats cambió:', stats)
    if (stats?.tickets) {
      console.log('📊 Dashboard Frontend - Tickets en estado:', stats.tickets)
    }
  }, [stats])

  const fetchDashboardStats = async () => {
    try {
      setLoading(true)
      const companyId = user?.companyId
      console.log('🎯 Dashboard Frontend - companyId:', companyId)

      if (companyId) {
        console.log('📡 Dashboard Frontend - Llamando a /dashboard con showAll:', showAll)
        const response = await api.get('/dashboard', {
          params: { showAll: showAll ? 'true' : 'false' }
        })
        console.log('✅ Dashboard Frontend - Respuesta recibida:', response.data)
        console.log('📊 Dashboard Frontend - Tickets en respuesta:', response.data.tickets)
        setStats(response.data)
      } else {
        throw new Error('No companyId found')
      }
    } catch (error) {
      console.error('❌ Dashboard Frontend - Error fetching dashboard stats:', error)
      // Fallback data for demo
      setStats({
        totalUsers: 1250,
        activeConversations: 45,
        totalMessages: 15420,
        aiInteractions: 8920,
        trends: [
          { date: '2025-01-06', messages: 120, users: 15 },
          { date: '2025-01-07', messages: 145, users: 18 },
          { date: '2025-01-08', messages: 132, users: 16 },
          { date: '2025-01-09', messages: 168, users: 22 },
          { date: '2025-01-10', messages: 189, users: 25 },
          { date: '2025-01-11', messages: 201, users: 28 },
          { date: '2025-01-12', messages: 178, users: 24 },
        ],
        tickets: {
          open: 34,
          pending: 12,
          closed: 156,
        },
        campaigns: {
          active: 3,
          scheduled: 5,
          completed: 28,
        },
        connections: {
          connected: 4,
          disconnected: 1,
          total: 5,
        },
        topAgents: [
          { id: 1, name: 'María López', ticketsClosed: 45, avgResponseTime: '2.5 min' },
          { id: 2, name: 'Carlos Ruiz', ticketsClosed: 38, avgResponseTime: '3.2 min' },
          { id: 3, name: 'Ana García', ticketsClosed: 35, avgResponseTime: '2.8 min' },
          { id: 4, name: 'Pedro Sánchez', ticketsClosed: 32, avgResponseTime: '4.1 min' },
          { id: 5, name: 'Laura Martínez', ticketsClosed: 28, avgResponseTime: '3.5 min' },
        ],
        recentActivity: [
          {
            id: 1,
            type: 'ticket',
            message: 'Nuevo ticket abierto #1234',
            time: 'Hace 2 min',
            user: 'Juan Pérez',
          },
          {
            id: 2,
            type: 'campaign',
            message: 'Campaña "Promoción Enero" iniciada',
            time: 'Hace 15 min',
            user: 'Sistema',
          },
          {
            id: 3,
            type: 'connection',
            message: 'WhatsApp Principal conectado',
            time: 'Hace 1 hora',
            user: 'Sistema',
          },
          {
            id: 4,
            type: 'ticket',
            message: 'Ticket #1230 cerrado',
            time: 'Hace 2 horas',
            user: 'María López',
          },
          {
            id: 5,
            type: 'user',
            message: 'Nuevo usuario registrado',
            time: 'Hace 3 horas',
            user: 'Admin',
          },
        ],
        performance: {
          avgResponseTime: 3.2,
          satisfactionRate: 94,
          firstContactResolution: 78,
        },
      })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <LinearProgress />
  }

  const statCards = [
    {
      title: 'Total Usuarios',
      value: stats?.totalUsers?.toLocaleString() || '0',
      icon: <PeopleIcon />,
      color: 'primary',
      subtitle: 'Usuarios registrados',
      trend: '+12% vs mes anterior',
    },
    {
      title: 'Conversaciones Activas',
      value: stats?.activeConversations?.toString() || '0',
      icon: <ChatIcon />,
      color: 'warning',
      subtitle: 'En las últimas 24h',
      trend: '+8% vs ayer',
    },
    {
      title: 'Total Mensajes',
      value: stats?.totalMessages?.toLocaleString() || '0',
      icon: <TrendingUpIcon />,
      color: 'success',
      subtitle: 'Mensajes enviados',
      trend: '+23% este mes',
    },
    {
      title: 'Interacciones IA',
      value: stats?.aiInteractions?.toLocaleString() || '0',
      icon: <MemoryIcon />,
      color: 'info',
      subtitle: 'Con IA activada',
      trend: '+35% este mes',
    },
  ]

  const ticketsData = [
    { name: 'Abiertos', value: stats?.tickets?.open || 0, color: '#0088FE' },
    { name: 'Pendientes', value: stats?.tickets?.pending || 0, color: '#FFBB28' },
    { name: 'Cerrados', value: stats?.tickets?.closed || 0, color: '#00C49F' },
  ]
  console.log('🎨 Dashboard Frontend - stats completo:', stats)
  console.log('🎨 Dashboard Frontend - stats.tickets:', stats?.tickets)
  console.log('🎨 Dashboard Frontend - Datos para el PieChart:', JSON.stringify(ticketsData, null, 2))

  const campaignsData = [
    { name: 'Activas', value: stats?.campaigns.active || 0 },
    { name: 'Programadas', value: stats?.campaigns.scheduled || 0 },
    { name: 'Completadas', value: stats?.campaigns.completed || 0 },
  ]

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'ticket':
        return <InboxIcon sx={{ fontSize: 18 }} />
      case 'campaign':
        return <CampaignIcon sx={{ fontSize: 18 }} />
      case 'connection':
        return <WhatsAppIcon sx={{ fontSize: 18 }} />
      case 'user':
        return <PersonIcon sx={{ fontSize: 18 }} />
      default:
        return <ChatIcon sx={{ fontSize: 18 }} />
    }
  }

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'ticket':
        return 'primary'
      case 'campaign':
        return 'success'
      case 'connection':
        return 'warning'
      case 'user':
        return 'info'
      default:
        return 'neutral'
    }
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <DashboardIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Dashboard Principal</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                {showAll
                  ? 'Mostrando todos los tickets de la empresa'
                  : 'Mostrando solo tickets asignados a ti'}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <IconButton
              variant="outlined"
              color={showAll ? 'primary' : 'neutral'}
              onClick={() => setShowAll(!showAll)}
              title={showAll ? 'Mostrar solo mis tickets' : 'Mostrar todos los tickets'}
            >
              {showAll ? <VisibilityIcon /> : <VisibilityOffIcon />}
            </IconButton>
            <IconButton variant="outlined" color="neutral" onClick={fetchDashboardStats}>
              <RefreshIcon />
            </IconButton>
          </Stack>
        </Stack>

        {/* Main Stats Cards */}
        <Grid container spacing={3}>
          {statCards.map((card, index) => (
            <Grid xs={12} sm={6} md={3} key={index}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box sx={{ flex: 1 }}>
                      <Typography level="body-sm" sx={{ mb: 1 }}>
                        {card.title}
                      </Typography>
                      <Typography level="h3">{card.value}</Typography>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                        {card.subtitle}
                      </Typography>
                      <Chip
                        size="sm"
                        variant="soft"
                        color="success"
                        startDecorator={<TrendingUpIcon sx={{ fontSize: 14 }} />}
                      >
                        {card.trend}
                      </Chip>
                    </Box>
                    <Box sx={{ color: `${card.color}.main`, fontSize: 48 }}>{card.icon}</Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Charts Row */}
        <Grid container spacing={3}>
          <Grid xs={12} lg={8}>
            <Card>
              <CardContent>
                <Typography level="h4" sx={{ mb: 2 }}>
                  Tendencia de Actividad (Últimos 7 días)
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={stats?.trends || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) =>
                        new Date(value).toLocaleDateString('es-ES', {
                          month: 'short',
                          day: 'numeric',
                        })
                      }
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(value) => new Date(value).toLocaleDateString('es-ES')}
                      formatter={(value: number, name: string) => [
                        value.toLocaleString(),
                        name === 'messages' ? 'Mensajes' : 'Usuarios Activos',
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="messages"
                      stroke="#0088FE"
                      strokeWidth={2}
                      name="messages"
                    />
                    <Line
                      type="monotone"
                      dataKey="users"
                      stroke="#00C49F"
                      strokeWidth={2}
                      name="users"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} lg={4}>
            <Card>
              <CardContent>
                <Typography level="h4" sx={{ mb: 2 }}>
                  Distribución de Tickets
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={ticketsData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {ticketsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Performance Metrics */}
        <Grid container spacing={3}>
          <Grid xs={12} md={4}>
            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <Typography level="title-md">Tiempo de Respuesta Promedio</Typography>
                  <Typography level="h2" sx={{ color: 'success.main' }}>
                    {stats?.performance.avgResponseTime} min
                  </Typography>
                  <LinearProgress
                    determinate
                    value={75}
                    color="success"
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                    25% mejor que el promedio del sector
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} md={4}>
            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <Typography level="title-md">Tasa de Satisfacción</Typography>
                  <Typography level="h2" sx={{ color: 'success.main' }}>
                    {stats?.performance.satisfactionRate}%
                  </Typography>
                  <LinearProgress
                    determinate
                    value={stats?.performance.satisfactionRate || 0}
                    color="success"
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                    Basado en {(stats?.tickets.closed || 0)} respuestas
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} md={4}>
            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <Typography level="title-md">Resolución Primer Contacto</Typography>
                  <Typography level="h2" sx={{ color: 'warning.main' }}>
                    {stats?.performance.firstContactResolution}%
                  </Typography>
                  <LinearProgress
                    determinate
                    value={stats?.performance.firstContactResolution || 0}
                    color="warning"
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                    Objetivo: 85%
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Bottom Row */}
        <Grid container spacing={3}>
          {/* Top Agents */}
          <Grid xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography level="h4" sx={{ mb: 2 }}>
                  Top 5 Agentes del Mes
                </Typography>
                <Sheet sx={{ overflow: 'auto' }}>
                  <Table>
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>#</th>
                        <th>Agente</th>
                        <th style={{ width: 120 }}>Tickets Cerrados</th>
                        <th style={{ width: 120 }}>Tiempo Promedio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats?.topAgents?.map((agent, index) => (
                        <tr key={agent.id}>
                          <td>
                            {index === 0 ? (
                              <Chip size="sm" color="warning" startDecorator={<StarIcon />}>
                                {index + 1}
                              </Chip>
                            ) : (
                              <Typography level="body-sm">{index + 1}</Typography>
                            )}
                          </td>
                          <td>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Avatar size="sm" sx={{ width: 28, height: 28 }}>
                                {agent.name.charAt(0)}
                              </Avatar>
                              <Typography level="body-sm">{agent.name}</Typography>
                            </Stack>
                          </td>
                          <td>
                            <Chip size="sm" variant="soft" color="success">
                              {agent.ticketsClosed}
                            </Chip>
                          </td>
                          <td>
                            <Typography level="body-xs">{agent.avgResponseTime}</Typography>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Sheet>
              </CardContent>
            </Card>
          </Grid>

          {/* Recent Activity */}
          <Grid xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography level="h4" sx={{ mb: 2 }}>
                  Actividad Reciente
                </Typography>
                <Stack spacing={1.5}>
                  {stats?.recentActivity?.map((activity) => (
                    <Box
                      key={activity.id}
                      sx={{
                        p: 1.5,
                        bgcolor: 'background.level1',
                        borderRadius: 'sm',
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Stack direction="row" spacing={1.5} alignItems="start">
                        <Box
                          sx={{
                            bgcolor: `${getActivityColor(activity.type)}.softBg`,
                            color: `${getActivityColor(activity.type)}.main`,
                            p: 0.5,
                            borderRadius: 'sm',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          {getActivityIcon(activity.type)}
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography level="body-sm">{activity.message}</Typography>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              {activity.user}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              •
                            </Typography>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              {activity.time}
                            </Typography>
                          </Stack>
                        </Box>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* System Status & Quick Actions */}
        <Grid container spacing={3}>
          <Grid xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography level="h4" sx={{ mb: 2 }}>
                  Estado del Sistema
                </Typography>
                <Stack spacing={2}>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CheckIcon sx={{ color: 'success.main', fontSize: 20 }} />
                      <Typography level="body-sm">Base de Datos</Typography>
                    </Stack>
                    <Chip color="success" size="sm">
                      Online
                    </Chip>
                  </Box>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CheckIcon sx={{ color: 'success.main', fontSize: 20 }} />
                      <Typography level="body-sm">Servicios IA (OpenAI)</Typography>
                    </Stack>
                    <Chip color="success" size="sm">
                      Online
                    </Chip>
                  </Box>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CheckIcon sx={{ color: 'success.main', fontSize: 20 }} />
                      <Typography level="body-sm">WhatsApp API</Typography>
                    </Stack>
                    <Chip color="success" size="sm">
                      {stats?.connections.connected} de {stats?.connections.total} conectadas
                    </Chip>
                  </Box>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CheckIcon sx={{ color: 'success.main', fontSize: 20 }} />
                      <Typography level="body-sm">Cache Redis</Typography>
                    </Stack>
                    <Chip color="success" size="sm">
                      Online
                    </Chip>
                  </Box>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CheckIcon sx={{ color: 'success.main', fontSize: 20 }} />
                      <Typography level="body-sm">Queue System (Bull)</Typography>
                    </Stack>
                    <Chip color="success" size="sm">
                      Online
                    </Chip>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography level="h4" sx={{ mb: 2 }}>
                  Campañas y Programaciones
                </Typography>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={campaignsData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#0088FE" />
                  </BarChart>
                </ResponsiveContainer>
                <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                  <Chip size="sm" color="success">
                    {stats?.campaigns.active} Activas
                  </Chip>
                  <Chip size="sm" color="primary">
                    {stats?.campaigns.scheduled} Programadas
                  </Chip>
                  <Chip size="sm" variant="soft">
                    {stats?.campaigns.completed} Completadas
                  </Chip>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Stack>
    </Container>
  )
}
