import { useState } from 'react'
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Sheet,
  Chip,
  Button,
  IconButton,
  Select,
  Option,
  Table,
  LinearProgress,
  Divider as _Divider,
  Avatar,
} from '@mui/joy'
import {
  Download as DownloadIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  CalendarToday as CalendarIcon,
  AccessTime as TimeIcon,
  AttachMoney as MoneyIcon,
  People as _PeopleIcon,
  Star as StarIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as _CancelIcon,
  EventBusy as _EventBusyIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'

interface AgentReport {
  id: number
  name: string
  avatar: string
  totalAppointments: number
  completed: number
  cancelled: number
  noShow: number
  revenue: number
  avgRating: number
  avgDuration: number
  completionRate: number
}

interface ServiceReport {
  name: string
  appointments: number
  revenue: number
  avgDuration: number
  cancellationRate: number
  popularityTrend: number
}

interface TimeSlotAnalysis {
  timeSlot: string
  appointments: number
  avgOccupancy: number
  peakDay: string
}

interface MonthlyData {
  month: string
  appointments: number
  revenue: number
  completionRate: number
  avgRating: number
}

const mockAgentReports: AgentReport[] = [
  {
    id: 1,
    name: 'Dr. Ana García',
    avatar: 'https://i.pravatar.cc/150?img=1',
    totalAppointments: 89,
    completed: 82,
    cancelled: 4,
    noShow: 3,
    revenue: 13450,
    avgRating: 4.8,
    avgDuration: 32,
    completionRate: 92.1,
  },
  {
    id: 2,
    name: 'Dr. Luis Rodríguez',
    avatar: 'https://i.pravatar.cc/150?img=2',
    totalAppointments: 76,
    completed: 68,
    cancelled: 5,
    noShow: 3,
    revenue: 11800,
    avgRating: 4.7,
    avgDuration: 38,
    completionRate: 89.5,
  },
  {
    id: 3,
    name: 'Dra. Carmen Silva',
    avatar: 'https://i.pravatar.cc/150?img=3',
    totalAppointments: 92,
    completed: 85,
    cancelled: 4,
    noShow: 3,
    revenue: 15230,
    avgRating: 4.9,
    avgDuration: 41,
    completionRate: 92.4,
  },
  {
    id: 4,
    name: 'Dr. Miguel Herrera',
    avatar: 'https://i.pravatar.cc/150?img=4',
    totalAppointments: 85,
    completed: 75,
    cancelled: 7,
    noShow: 3,
    revenue: 9300,
    avgRating: 4.6,
    avgDuration: 28,
    completionRate: 88.2,
  },
]

const mockServiceReports: ServiceReport[] = [
  {
    name: 'Consulta General',
    appointments: 145,
    revenue: 21750,
    avgDuration: 30,
    cancellationRate: 4.1,
    popularityTrend: 12.5,
  },
  {
    name: 'Revisión de Seguimiento',
    appointments: 98,
    revenue: 19600,
    avgDuration: 45,
    cancellationRate: 3.2,
    popularityTrend: 8.3,
  },
  {
    name: 'Consulta Especializada',
    appointments: 56,
    revenue: 19600,
    avgDuration: 60,
    cancellationRate: 5.4,
    popularityTrend: -2.1,
  },
  {
    name: 'Evaluación Inicial',
    appointments: 28,
    revenue: 5040,
    avgDuration: 30,
    cancellationRate: 3.6,
    popularityTrend: 15.7,
  },
  {
    name: 'Consulta Express',
    appointments: 15,
    revenue: 1500,
    avgDuration: 20,
    cancellationRate: 13.3,
    popularityTrend: -5.2,
  },
]

const mockTimeSlots: TimeSlotAnalysis[] = [
  { timeSlot: '09:00 - 10:00', appointments: 48, avgOccupancy: 85.7, peakDay: 'Martes' },
  { timeSlot: '10:00 - 11:00', appointments: 52, avgOccupancy: 92.9, peakDay: 'Jueves' },
  { timeSlot: '11:00 - 12:00', appointments: 45, avgOccupancy: 80.4, peakDay: 'Lunes' },
  { timeSlot: '12:00 - 13:00', appointments: 38, avgOccupancy: 67.9, peakDay: 'Viernes' },
  { timeSlot: '14:00 - 15:00', appointments: 58, avgOccupancy: 96.7, peakDay: 'Jueves' },
  { timeSlot: '15:00 - 16:00', appointments: 62, avgOccupancy: 98.4, peakDay: 'Miércoles' },
  { timeSlot: '16:00 - 17:00', appointments: 55, avgOccupancy: 91.7, peakDay: 'Lunes' },
  { timeSlot: '17:00 - 18:00', appointments: 42, avgOccupancy: 70.0, peakDay: 'Viernes' },
]

const mockMonthlyData: MonthlyData[] = [
  { month: 'Ene', appointments: 285, revenue: 38500, completionRate: 88.4, avgRating: 4.6 },
  { month: 'Feb', appointments: 298, revenue: 41200, completionRate: 89.3, avgRating: 4.6 },
  { month: 'Mar', appointments: 312, revenue: 43800, completionRate: 90.1, avgRating: 4.7 },
  { month: 'Abr', appointments: 328, revenue: 45200, completionRate: 89.6, avgRating: 4.7 },
  { month: 'May', appointments: 342, revenue: 45780, completionRate: 91.2, avgRating: 4.7 },
  { month: 'Jun', appointments: 335, revenue: 46100, completionRate: 90.4, avgRating: 4.8 },
]

export default function AppointmentsReports() {
  const [timeRange, setTimeRange] = useState<string>('month')
  const [_reportType, _setReportType] = useState<string>('overview')

  const currentPeriod = mockMonthlyData[mockMonthlyData.length - 1]
  const previousPeriod = mockMonthlyData[mockMonthlyData.length - 2]

  const calculateGrowth = (current: number, previous: number) => {
    return (((current - previous) / previous) * 100).toFixed(1)
  }

  const totalRevenue = mockAgentReports.reduce((sum, a) => sum + a.revenue, 0)
  const totalAppointments = mockAgentReports.reduce((sum, a) => sum + a.totalAppointments, 0)
  const avgCompletionRate = mockAgentReports.reduce((sum, a) => sum + a.completionRate, 0) / mockAgentReports.length
  const avgRating = mockAgentReports.reduce((sum, a) => sum + a.avgRating, 0) / mockAgentReports.length

  const appointmentsGrowth = calculateGrowth(currentPeriod.appointments, previousPeriod.appointments)
  const revenueGrowth = calculateGrowth(currentPeriod.revenue, previousPeriod.revenue)

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography level="h2" sx={{ mb: 0.5 }}>
            Reportes y Analytics
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Análisis detallado del rendimiento de citas
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Select value={timeRange} onChange={(_, value) => setTimeRange(value as string)} size="sm">
            <Option value="week">Esta Semana</Option>
            <Option value="month">Este Mes</Option>
            <Option value="quarter">Este Trimestre</Option>
            <Option value="year">Este Año</Option>
          </Select>
          <IconButton variant="outlined" size="sm">
            <RefreshIcon />
          </IconButton>
          <Button variant="outlined" size="sm" startDecorator={<DownloadIcon />}>
            Exportar PDF
          </Button>
        </Box>
      </Box>

      {/* KPIs Overview */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                    Total Citas
                  </Typography>
                  <Typography level="h3">{totalAppointments}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                    {parseFloat(appointmentsGrowth) > 0 ? (
                      <>
                        <TrendingUpIcon sx={{ fontSize: 16, color: 'success.500' }} />
                        <Typography level="body-xs" sx={{ color: 'success.500' }}>
                          +{appointmentsGrowth}%
                        </Typography>
                      </>
                    ) : (
                      <>
                        <TrendingDownIcon sx={{ fontSize: 16, color: 'danger.500' }} />
                        <Typography level="body-xs" sx={{ color: 'danger.500' }}>
                          {appointmentsGrowth}%
                        </Typography>
                      </>
                    )}
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      vs mes anterior
                    </Typography>
                  </Box>
                </Box>
                <Sheet sx={{ p: 1.5, borderRadius: 'sm', bgcolor: 'primary.softBg' }}>
                  <CalendarIcon sx={{ color: 'primary.500' }} />
                </Sheet>
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
                    Ingresos Totales
                  </Typography>
                  <Typography level="h3">${totalRevenue.toLocaleString()}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                    {parseFloat(revenueGrowth) > 0 ? (
                      <>
                        <TrendingUpIcon sx={{ fontSize: 16, color: 'success.500' }} />
                        <Typography level="body-xs" sx={{ color: 'success.500' }}>
                          +{revenueGrowth}%
                        </Typography>
                      </>
                    ) : (
                      <>
                        <TrendingDownIcon sx={{ fontSize: 16, color: 'danger.500' }} />
                        <Typography level="body-xs" sx={{ color: 'danger.500' }}>
                          {revenueGrowth}%
                        </Typography>
                      </>
                    )}
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      vs mes anterior
                    </Typography>
                  </Box>
                </Box>
                <Sheet sx={{ p: 1.5, borderRadius: 'sm', bgcolor: 'success.softBg' }}>
                  <MoneyIcon sx={{ color: 'success.500' }} />
                </Sheet>
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
                    Tasa Completitud
                  </Typography>
                  <Typography level="h3">{avgCompletionRate.toFixed(1)}%</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                    <TrendingUpIcon sx={{ fontSize: 16, color: 'success.500' }} />
                    <Typography level="body-xs" sx={{ color: 'success.500' }}>
                      +2.3%
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      vs mes anterior
                    </Typography>
                  </Box>
                </Box>
                <Sheet sx={{ p: 1.5, borderRadius: 'sm', bgcolor: 'warning.softBg' }}>
                  <CheckCircleIcon sx={{ color: 'warning.500' }} />
                </Sheet>
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
                    Calificación
                  </Typography>
                  <Typography level="h3">{avgRating.toFixed(1)}/5.0</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                    <TrendingUpIcon sx={{ fontSize: 16, color: 'success.500' }} />
                    <Typography level="body-xs" sx={{ color: 'success.500' }}>
                      +0.2
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      vs mes anterior
                    </Typography>
                  </Box>
                </Box>
                <Sheet sx={{ p: 1.5, borderRadius: 'sm', bgcolor: 'info.softBg' }}>
                  <StarIcon sx={{ color: 'info.500' }} />
                </Sheet>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Monthly Trend */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2 }}>
            Tendencia Mensual
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {mockMonthlyData.map((data) => {
              const maxAppointments = Math.max(...mockMonthlyData.map((d) => d.appointments))
              const percentage = (data.appointments / maxAppointments) * 100
              return (
                <Box key={data.month}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography level="body-sm">{data.month}</Typography>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Typography level="body-sm">
                        {data.appointments} citas • ${data.revenue.toLocaleString()}
                      </Typography>
                      <Typography level="body-sm" sx={{ minWidth: 80 }}>
                        {data.completionRate}% completitud
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <StarIcon sx={{ fontSize: 16, color: 'warning.500' }} />
                        <Typography level="body-sm">{data.avgRating}</Typography>
                      </Box>
                    </Box>
                  </Box>
                  <LinearProgress determinate value={percentage} size="sm" />
                </Box>
              )
            })}
          </Box>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        {/* Agent Performance */}
        <Grid xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                Rendimiento por Agente
              </Typography>
              <Sheet sx={{ overflow: 'auto' }}>
                <Table>
                  <thead>
                    <tr>
                      <th>Agente</th>
                      <th>Total</th>
                      <th>Completadas</th>
                      <th>Canceladas</th>
                      <th>No Show</th>
                      <th>Ingresos</th>
                      <th>Rating</th>
                      <th>Tasa Completitud</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockAgentReports.map((agent) => (
                      <tr key={agent.id}>
                        <td>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar src={agent.avatar} size="sm" />
                            <Typography level="body-sm">{agent.name}</Typography>
                          </Box>
                        </td>
                        <td>
                          <Typography level="body-sm" fontWeight="md">
                            {agent.totalAppointments}
                          </Typography>
                        </td>
                        <td>
                          <Chip size="sm" color="success" variant="soft">
                            {agent.completed}
                          </Chip>
                        </td>
                        <td>
                          <Chip size="sm" color="danger" variant="soft">
                            {agent.cancelled}
                          </Chip>
                        </td>
                        <td>
                          <Chip size="sm" color="neutral" variant="soft">
                            {agent.noShow}
                          </Chip>
                        </td>
                        <td>
                          <Typography level="body-sm" fontWeight="md">
                            ${agent.revenue.toLocaleString()}
                          </Typography>
                        </td>
                        <td>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <StarIcon sx={{ fontSize: 16, color: 'warning.500' }} />
                            <Typography level="body-sm">{agent.avgRating}</Typography>
                          </Box>
                        </td>
                        <td>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 120 }}>
                            <LinearProgress determinate value={agent.completionRate} size="sm" sx={{ flex: 1 }} />
                            <Typography level="body-xs">{agent.completionRate}%</Typography>
                          </Box>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Sheet>
            </CardContent>
          </Card>
        </Grid>

        {/* Time Slot Analysis */}
        <Grid xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                Análisis por Horario
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {mockTimeSlots.map((slot, index) => (
                  <Box
                    key={index}
                    sx={{
                      p: 1.5,
                      borderRadius: 'sm',
                      bgcolor: slot.avgOccupancy > 90 ? 'success.softBg' : 'background.level1',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography level="body-sm" fontWeight="md">
                        {slot.timeSlot}
                      </Typography>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        Peak: {slot.peakDay}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LinearProgress determinate value={slot.avgOccupancy} size="sm" sx={{ flex: 1 }} />
                      <Typography level="body-xs">{slot.avgOccupancy}%</Typography>
                    </Box>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                      {slot.appointments} citas
                    </Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Service Performance */}
        <Grid xs={12}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                Rendimiento por Servicio
              </Typography>
              <Sheet sx={{ overflow: 'auto' }}>
                <Table>
                  <thead>
                    <tr>
                      <th>Servicio</th>
                      <th>Citas</th>
                      <th>Ingresos</th>
                      <th>Duración Promedio</th>
                      <th>Tasa Cancelación</th>
                      <th>Tendencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockServiceReports.map((service, index) => (
                      <tr key={index}>
                        <td>
                          <Typography level="body-sm" fontWeight="md">
                            {service.name}
                          </Typography>
                        </td>
                        <td>
                          <Typography level="body-sm">{service.appointments}</Typography>
                        </td>
                        <td>
                          <Typography level="body-sm" fontWeight="md">
                            ${service.revenue.toLocaleString()}
                          </Typography>
                        </td>
                        <td>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <TimeIcon sx={{ fontSize: 16, color: 'text.tertiary' }} />
                            <Typography level="body-sm">{service.avgDuration} min</Typography>
                          </Box>
                        </td>
                        <td>
                          <Chip
                            size="sm"
                            color={service.cancellationRate < 5 ? 'success' : service.cancellationRate < 10 ? 'warning' : 'danger'}
                            variant="soft"
                          >
                            {service.cancellationRate}%
                          </Chip>
                        </td>
                        <td>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {service.popularityTrend > 0 ? (
                              <>
                                <TrendingUpIcon sx={{ fontSize: 16, color: 'success.500' }} />
                                <Typography level="body-sm" sx={{ color: 'success.500' }}>
                                  +{service.popularityTrend}%
                                </Typography>
                              </>
                            ) : (
                              <>
                                <TrendingDownIcon sx={{ fontSize: 16, color: 'danger.500' }} />
                                <Typography level="body-sm" sx={{ color: 'danger.500' }}>
                                  {service.popularityTrend}%
                                </Typography>
                              </>
                            )}
                          </Box>
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
    </Container>
  )
}
