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
  Button,
  Avatar,
  Divider as _Divider,
  Table,
  Sheet,
  Alert,
} from '@mui/joy'
import {
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
  Chat as ChatIcon,
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

const _COLORS = ['#3b82f6', '#52b788', '#f3a43b', '#FF8042', '#8884D8']

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [fetchError, setFetchError] = useState(false)

  useEffect(() => {
    if (user?.companyId) {
      fetchDashboardStats()
    }
  }, [user, showAll])

  const fetchDashboardStats = async () => {
    try {
      setLoading(true)
      setFetchError(false)
      const companyId = user?.companyId

      if (companyId) {
        const response = await api.get('/dashboard', {
          params: { showAll: showAll ? 'true' : 'false' }
        })
        setStats(response.data)
      } else {
        throw new Error('No companyId found')
      }
    } catch (_error) {
      setFetchError(true)
      setStats({
        totalUsers: 0,
        activeConversations: 0,
        totalMessages: 0,
        aiInteractions: 0,
        trends: [],
        tickets: { open: 0, pending: 0, closed: 0 },
        campaigns: { active: 0, scheduled: 0, completed: 0 },
        connections: { connected: 0, disconnected: 0, total: 0 },
        topAgents: [],
        recentActivity: [],
        performance: { avgResponseTime: 0, satisfactionRate: 0, firstContactResolution: 0 },
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
      title: 'Usuarios',
      value: stats?.totalUsers?.toLocaleString() || '0',
      chipLabel: 'Registrados',
      chipColor: 'primary' as const,
    },
    {
      title: 'Conversaciones',
      value: stats?.activeConversations?.toString() || '0',
      chipLabel: 'Activas (24h)',
      chipColor: 'warning' as const,
    },
    {
      title: 'Mensajes',
      value: stats?.totalMessages?.toLocaleString() || '0',
      chipLabel: 'Este mes',
      chipColor: 'success' as const,
    },
    {
      title: 'IA',
      value: stats?.aiInteractions?.toLocaleString() || '0',
      chipLabel: 'Interacciones IA',
      chipColor: 'primary' as const,
    },
  ]

  const ticketsData = [
    { name: 'Abiertos', value: stats?.tickets?.open || 0, color: '#3b82f6' },
    { name: 'Pendientes', value: stats?.tickets?.pending || 0, color: '#f3a43b' },
    { name: 'Cerrados', value: stats?.tickets?.closed || 0, color: '#52b788' },
  ]
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
        {/* Error alert */}
        {fetchError && (
          <Alert color="warning" variant="soft">
            No se pudieron cargar los datos del dashboard. Intenta de nuevo.
          </Alert>
        )}

        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Box>
            <Typography level="h2">
              Bienvenido, {user?.name || 'Administrador'}
            </Typography>
            <Typography level="body-sm" sx={{ color: 'text.secondary', textTransform: 'capitalize' }}>
              Tus tickets asignados —{' '}
              {new Date().toLocaleDateString('es-ES', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              color="neutral"
              startDecorator={showAll ? <VisibilityIcon /> : <VisibilityOffIcon />}
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? 'Todos' : 'Mis tickets'}
            </Button>
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
                  <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                    {card.title}
                  </Typography>
                  <Typography level="h2" sx={{ my: 1 }}>
                    {card.value}
                  </Typography>
                  <Chip size="sm" variant="soft" color={card.chipColor}>
                    {card.chipLabel}
                  </Chip>
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
                <Typography level="h4" sx={{ mb: 1 }}>
                  Actividad — Últimos 7 días
                </Typography>
                <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#3b82f6' }} />
                    <Typography level="body-xs" sx={{ color: 'text.secondary' }}>Mensajes</Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#52b788' }} />
                    <Typography level="body-xs" sx={{ color: 'text.secondary' }}>Usuarios activos</Typography>
                  </Stack>
                </Stack>
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
                      formatter={((value: number, name: string) => [
                        value.toLocaleString(),
                        name === 'messages' ? 'Mensajes' : 'Usuarios Activos',
                      ]) as any}
                    />
                    <Line
                      type="monotone"
                      dataKey="messages"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      name="messages"
                    />
                    <Line
                      type="monotone"
                      dataKey="users"
                      stroke="#52b788"
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
                  Tickets
                </Typography>
                <Box sx={{ position: 'relative' }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={ticketsData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {ticketsData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <Box
                    sx={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      textAlign: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    <Typography level="h2" sx={{ lineHeight: 1 }}>
                      {(ticketsData[0].value + ticketsData[1].value + ticketsData[2].value)}
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                      Total
                    </Typography>
                  </Box>
                </Box>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {ticketsData.map((item) => (
                    <Stack key={item.name} direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: item.color }} />
                        <Typography level="body-sm" sx={{ color: 'text.secondary' }}>{item.name}</Typography>
                      </Stack>
                      <Typography level="body-sm" sx={{ fontWeight: 'md' }}>{item.value}</Typography>
                    </Stack>
                  ))}
                </Stack>
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
                      {!stats?.topAgents?.length ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem' }}>
                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                              No hay datos de agentes disponibles
                            </Typography>
                          </td>
                        </tr>
                      ) : (
                        stats.topAgents.map((agent, index) => (
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
                        ))
                      )}
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
                  {!stats?.recentActivity?.length ? (
                    <Box sx={{ py: 3, textAlign: 'center' }}>
                      <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                        No hay actividad reciente
                      </Typography>
                    </Box>
                  ) : (
                    stats.recentActivity.map((activity) => (
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
                    ))
                  )}
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
                    <Bar dataKey="value" fill="#3b82f6" />
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
