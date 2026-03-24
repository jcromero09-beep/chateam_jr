import { useState, useEffect } from 'react'
import {
  Typography,
  Stack,
  Container,
  Card,
  CardContent,
  Box,
  Grid,
  Button,
  Input,
  Table,
  Sheet,
  Chip,
  CircularProgress,
} from '@mui/joy'
import {
  Assessment as ReportIcon,
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  PieChart as PieChartIcon,
  TableChart as TableIcon,
} from '@mui/icons-material'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'
import api from '../services/api'
import { toast } from 'react-toastify'

interface OriginStats {
  originId: number | null
  originName: string
  originColor: string
  ticketCount: number
  percentage: number
}

interface TrendData {
  date: string
  total: number
  byOrigin: { [key: string]: number }
}

interface ReportData {
  summary: {
    totalTickets: number
    ticketsWithOrigin: number
    ticketsWithoutOrigin: number
  }
  byOrigin: OriginStats[]
  trends: TrendData[]
}

export default function CustomerOriginReports() {
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<ReportData | null>(null)
  const [startDate, setStartDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 30)
    return date.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })

  useEffect(() => {
    fetchReport()
  }, [])

  const fetchReport = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/customer-origins/report', {
        params: { startDate, endDate }
      })
      setReport(data.report)
    } catch (error) {
      console.error('Error fetching report:', error)
      toast.error('Error al cargar el reporte')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    fetchReport()
  }

  // Preparar datos para el gráfico de tendencias
  const getTrendsChartData = () => {
    if (!report?.trends) return []
    return report.trends.map(t => ({
      date: new Date(t.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      total: t.total,
      ...t.byOrigin
    }))
  }

  // Obtener lista única de orígenes para el gráfico de tendencias
  const getUniqueOrigins = () => {
    if (!report?.byOrigin) return []
    return report.byOrigin.map(o => ({
      name: o.originName,
      color: o.originColor
    }))
  }

  if (loading) {
    return (
      <Container maxWidth="xl">
        <Stack alignItems="center" justifyContent="center" sx={{ minHeight: '50vh' }}>
          <CircularProgress size="lg" />
          <Typography level="body-sm" sx={{ mt: 2 }}>Cargando reporte...</Typography>
        </Stack>
      </Container>
    )
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <ReportIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Reporte de Origen de Clientes</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Analiza de dónde provienen tus clientes
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              size="sm"
            />
            <Typography level="body-sm">a</Typography>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              size="sm"
            />
            <Button
              variant="outlined"
              color="neutral"
              startDecorator={<RefreshIcon />}
              onClick={handleRefresh}
            >
              Actualizar
            </Button>
          </Stack>
        </Stack>

        {/* KPI Cards */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <TrendingUpIcon sx={{ color: 'primary.main' }} />
                  <Typography level="body-sm">Total Tickets</Typography>
                </Stack>
                <Typography level="h2" sx={{ mt: 1 }}>
                  {report?.summary.totalTickets || 0}
                </Typography>
                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                  En el período seleccionado
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <PieChartIcon sx={{ color: 'success.main' }} />
                  <Typography level="body-sm">Con Origen</Typography>
                </Stack>
                <Typography level="h2" sx={{ mt: 1, color: 'success.main' }}>
                  {report?.summary.ticketsWithOrigin || 0}
                </Typography>
                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                  {report?.summary.totalTickets
                    ? Math.round((report.summary.ticketsWithOrigin / report.summary.totalTickets) * 100)
                    : 0}% del total
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <TableIcon sx={{ color: 'neutral.500' }} />
                  <Typography level="body-sm">Sin Origen</Typography>
                </Stack>
                <Typography level="h2" sx={{ mt: 1, color: 'neutral.500' }}>
                  {report?.summary.ticketsWithoutOrigin || 0}
                </Typography>
                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                  {report?.summary.totalTickets
                    ? Math.round((report.summary.ticketsWithoutOrigin / report.summary.totalTickets) * 100)
                    : 0}% del total
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Charts Row */}
        <Grid container spacing={2}>
          {/* Pie Chart */}
          <Grid xs={12} md={5}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography level="title-md" sx={{ mb: 2 }}>
                  Distribución por Origen
                </Typography>
                {report?.byOrigin && report.byOrigin.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={report.byOrigin}
                        dataKey="ticketCount"
                        nameKey="originName"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {report.byOrigin.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.originColor} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={((value: number) => [`${value} tickets`, 'Cantidad']) as any}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      No hay datos para mostrar
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Bar Chart */}
          <Grid xs={12} md={7}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography level="title-md" sx={{ mb: 2 }}>
                  Tickets por Origen
                </Typography>
                {report?.byOrigin && report.byOrigin.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={report.byOrigin} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="originName" type="category" width={120} />
                      <Tooltip
                        formatter={((value: number, name: string) => [
                          `${value} tickets (${report.byOrigin.find(o => o.originName === name)?.percentage || 0}%)`,
                          'Cantidad'
                        ]) as any}
                      />
                      <Bar dataKey="ticketCount" name="Tickets">
                        {report.byOrigin.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.originColor} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      No hay datos para mostrar
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Trends Chart */}
        <Card>
          <CardContent>
            <Typography level="title-md" sx={{ mb: 2 }}>
              Tendencia por Día
            </Typography>
            {report?.trends && report.trends.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={getTrendsChartData()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Total"
                    stroke="#6366f1"
                    fill="#6366f1"
                    fillOpacity={0.3}
                    strokeWidth={2}
                  />
                  {getUniqueOrigins().map((origin, index) => (
                    <Area
                      key={origin.name}
                      type="monotone"
                      dataKey={origin.name}
                      name={origin.name}
                      stroke={origin.color}
                      fill={origin.color}
                      fillOpacity={0.2}
                      strokeWidth={1}
                      stackId="1"
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 350 }}>
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  No hay datos de tendencia
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Detail Table */}
        <Card>
          <CardContent>
            <Typography level="title-md" sx={{ mb: 2 }}>
              Detalle por Origen
            </Typography>
            <Sheet sx={{ overflow: 'auto' }}>
              <Table stickyHeader>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Color</th>
                    <th>Origen</th>
                    <th style={{ width: 120, textAlign: 'right' }}>Tickets</th>
                    <th style={{ width: 120, textAlign: 'right' }}>Porcentaje</th>
                  </tr>
                </thead>
                <tbody>
                  {report?.byOrigin && report.byOrigin.length > 0 ? (
                    report.byOrigin.map((origin, index) => (
                      <tr key={index}>
                        <td>
                          <Box
                            sx={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              bgcolor: origin.originColor,
                            }}
                          />
                        </td>
                        <td>
                          <Chip
                            size="sm"
                            sx={{
                              bgcolor: origin.originColor,
                              color: 'white',
                              fontWeight: 'bold'
                            }}
                          >
                            {origin.originName}
                          </Chip>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Typography level="body-sm" fontWeight="bold">
                            {origin.ticketCount}
                          </Typography>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Typography level="body-sm">
                            {origin.percentage}%
                          </Typography>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>
                        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                          No hay datos para mostrar
                        </Typography>
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Sheet>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  )
}
