import { useState, useEffect } from 'react'
import {
  Container,
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  Sheet,
  Table,
  Select,
  Option,
  LinearProgress,
  Tooltip,
  IconButton,
  Divider,
} from '@mui/joy'
import {
  AttachMoney as FinancialIcon,
  TrendingUp as TrendingUpIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckIcon,
  Pending as PendingIcon,
  Receipt as ReceiptIcon,
  CreditCard as CardIcon,
  AccountBalanceWallet as WalletIcon,
  CalendarMonth as CalendarIcon,
} from '@mui/icons-material'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  ArcElement,
  LineElement,
  PointElement,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import { getFinancialSummary, getPaymentsList, exportFinancialReport } from '../services/financialService'
import type { FinancialSummary, PaymentRecord, PaymentsListResponse } from '../services/financialService'

// Registrar componentes de Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  ChartTooltip,
  Legend,
  ArcElement,
  LineElement,
  PointElement
)

export default function Financial() {
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<FinancialSummary | null>(null)
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [totalPayments, setTotalPayments] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // Filtros
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString())
  const [selectedRecurrence, setSelectedRecurrence] = useState<string>('')
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')

  // Cargar datos iniciales
  useEffect(() => {
    fetchData()
  }, [selectedMonth, selectedYear, selectedRecurrence, selectedPaymentMethod])

  // Cargar pagos cuando cambia la página o filtros
  useEffect(() => {
    fetchPayments()
  }, [page, selectedStatus, selectedRecurrence, selectedPaymentMethod])

  const fetchData = async () => {
    setLoading(true)
    try {
      const summaryData = await getFinancialSummary({
        month: selectedMonth || undefined,
        year: selectedYear || undefined,
        recurrence: selectedRecurrence || undefined,
        paymentMethod: selectedPaymentMethod || undefined,
      })
      setSummary(summaryData)
    } catch (error) {
      console.error('Error fetching financial data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPayments = async () => {
    try {
      const response: PaymentsListResponse = await getPaymentsList({
        status: selectedStatus || undefined,
        recurrence: selectedRecurrence || undefined,
        paymentMethod: selectedPaymentMethod || undefined,
        page,
        limit: 10,
      })
      setPayments(response.payments)
      setTotalPayments(response.count)
      setTotalPages(response.totalPages)
    } catch (error) {
      console.error('Error fetching payments:', error)
    }
  }

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const result = await exportFinancialReport(format, {
        status: selectedStatus || undefined,
        recurrence: selectedRecurrence || undefined,
        paymentMethod: selectedPaymentMethod || undefined,
      })

      if (format === 'csv') {
        const blob = result as Blob
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `financial-report-${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Error exporting report:', error)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'USD',
    }).format(value)
  }

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: 'success' | 'warning' | 'primary' | 'danger'; label: string; icon: React.ReactNode }> = {
      paid: { color: 'success', label: 'Pagado', icon: <CheckIcon /> },
      open: { color: 'warning', label: 'Pendiente', icon: <PendingIcon /> },
      proceso: { color: 'primary', label: 'En Proceso', icon: <PendingIcon /> },
      refunded: { color: 'danger', label: 'Reembolsado', icon: <ReceiptIcon /> },
    }
    return configs[status] || configs.open
  }

  const getPaymentMethodIcon = (method: string | null) => {
    switch (method) {
      case 'stripe':
        return <CardIcon />
      case 'paypal':
        return <WalletIcon />
      case 'outline':
        return <ReceiptIcon />
      default:
        return <CardIcon />
    }
  }

  // Datos para el gráfico de barras (Pagos por Mes)
  const barChartData = {
    labels: summary?.paymentsByMonth.map((m) => m.monthName) || [],
    datasets: [
      {
        label: 'Ingresos por Mes',
        data: summary?.paymentsByMonth.map((m) => m.total) || [],
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
      },
    ],
  }

  const barChartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: true, text: 'Ingresos por Mes' },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function (tickValue: number | string) {
            return '$' + tickValue
          },
        },
      },
    },
  }

  // Datos para el gráfico de dona (Por Recurrencia)
  const doughnutData = {
    labels: ['Mensual', 'Bimestral', 'Trimestral', 'Semestral', 'Anual'],
    datasets: [
      {
        data: summary
          ? [
              summary.paymentsByRecurrence.MENSUAL.total,
              summary.paymentsByRecurrence.BIMESTRAL.total,
              summary.paymentsByRecurrence.TRIMESTRAL.total,
              summary.paymentsByRecurrence.SEMESTRAL.total,
              summary.paymentsByRecurrence.ANUAL.total,
            ]
          : [0, 0, 0, 0, 0],
        backgroundColor: [
          'rgba(59, 130, 246, 0.7)',
          'rgba(16, 185, 129, 0.7)',
          'rgba(245, 158, 11, 0.7)',
          'rgba(239, 68, 68, 0.7)',
          'rgba(139, 92, 246, 0.7)',
        ],
        borderWidth: 2,
      },
    ],
  }

  // Datos para gráfico de métodos de pago
  const paymentMethodsData = {
    labels: ['Stripe', 'PayPal', 'Comprobante'],
    datasets: [
      {
        data: summary
          ? [
              summary.paymentsByMethod.stripe.total,
              summary.paymentsByMethod.paypal.total,
              summary.paymentsByMethod.outline.total,
            ]
          : [0, 0, 0],
        backgroundColor: [
          'rgba(99, 102, 241, 0.7)',
          'rgba(0, 112, 186, 0.7)',
          'rgba(107, 114, 128, 0.7)',
        ],
        borderWidth: 2,
      },
    ],
  }

  const months = [
    { value: '', label: 'Todos' },
    { value: '1', label: 'Enero' },
    { value: '2', label: 'Febrero' },
    { value: '3', label: 'Marzo' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Mayo' },
    { value: '6', label: 'Junio' },
    { value: '7', label: 'Julio' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Septiembre' },
    { value: '10', label: 'Octubre' },
    { value: '11', label: 'Noviembre' },
    { value: '12', label: 'Diciembre' },
  ]

  const years = [
    { value: '2025', label: '2025' },
    { value: '2024', label: '2024' },
    { value: '2023', label: '2023' },
  ]

  const recurrenceOptions = [
    { value: '', label: 'Todas' },
    { value: 'MENSUAL', label: 'Mensual' },
    { value: 'BIMESTRAL', label: 'Bimestral' },
    { value: 'TRIMESTRAL', label: 'Trimestral' },
    { value: 'SEMESTRAL', label: 'Semestral' },
    { value: 'ANUAL', label: 'Anual' },
  ]

  const paymentMethodOptions = [
    { value: '', label: 'Todos' },
    { value: 'stripe', label: 'Stripe' },
    { value: 'paypal', label: 'PayPal' },
    { value: 'outline', label: 'Comprobante' },
  ]

  const statusOptions = [
    { value: '', label: 'Todos' },
    { value: 'paid', label: 'Pagado' },
    { value: 'open', label: 'Pendiente' },
    { value: 'proceso', label: 'En Proceso' },
    { value: 'refunded', label: 'Reembolsado' },
  ]

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <FinancialIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Dashboard Financiero</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Control de ingresos y pagos (Super Admin)
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Tooltip title="Actualizar datos">
              <IconButton variant="soft" onClick={fetchData}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Button
              startDecorator={<DownloadIcon />}
              variant="soft"
              color="primary"
              onClick={() => handleExport('csv')}
            >
              Exportar CSV
            </Button>
          </Stack>
        </Stack>

        {loading && <LinearProgress />}

        {/* Filtros */}
        <Card>
          <CardContent>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Select
                value={selectedMonth}
                onChange={(_, value) => setSelectedMonth(value as string)}
                placeholder="Mes"
                sx={{ minWidth: 120 }}
              >
                {months.map((m) => (
                  <Option key={m.value} value={m.value}>
                    {m.label}
                  </Option>
                ))}
              </Select>

              <Select
                value={selectedYear}
                onChange={(_, value) => setSelectedYear(value as string)}
                placeholder="Año"
                sx={{ minWidth: 100 }}
              >
                {years.map((y) => (
                  <Option key={y.value} value={y.value}>
                    {y.label}
                  </Option>
                ))}
              </Select>

              <Select
                value={selectedRecurrence}
                onChange={(_, value) => setSelectedRecurrence(value as string)}
                placeholder="Recurrencia"
                sx={{ minWidth: 140 }}
              >
                {recurrenceOptions.map((r) => (
                  <Option key={r.value} value={r.value}>
                    {r.label}
                  </Option>
                ))}
              </Select>

              <Select
                value={selectedPaymentMethod}
                onChange={(_, value) => setSelectedPaymentMethod(value as string)}
                placeholder="Método de Pago"
                sx={{ minWidth: 150 }}
              >
                {paymentMethodOptions.map((p) => (
                  <Option key={p.value} value={p.value}>
                    {p.label}
                  </Option>
                ))}
              </Select>

              <Select
                value={selectedStatus}
                onChange={(_, value) => setSelectedStatus(value as string)}
                placeholder="Estado"
                sx={{ minWidth: 130 }}
              >
                {statusOptions.map((s) => (
                  <Option key={s.value} value={s.value}>
                    {s.label}
                  </Option>
                ))}
              </Select>
            </Stack>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                      Total Pagado
                    </Typography>
                    <Typography level="h2" sx={{ color: 'success.main' }}>
                      {formatCurrency(summary?.totalPaid || 0)}
                    </Typography>
                  </Box>
                  <TrendingUpIcon sx={{ fontSize: 48, color: 'success.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                      Pendiente
                    </Typography>
                    <Typography level="h2" sx={{ color: 'warning.main' }}>
                      {formatCurrency(summary?.totalPending || 0)}
                    </Typography>
                  </Box>
                  <PendingIcon sx={{ fontSize: 48, color: 'warning.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                      Pagos Stripe
                    </Typography>
                    <Typography level="h2">
                      {summary?.paymentsByMethod.stripe.count || 0}
                    </Typography>
                    <Chip size="sm" color="primary" variant="soft">
                      {formatCurrency(summary?.paymentsByMethod.stripe.total || 0)}
                    </Chip>
                  </Box>
                  <CardIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                      Pagos PayPal
                    </Typography>
                    <Typography level="h2">
                      {summary?.paymentsByMethod.paypal.count || 0}
                    </Typography>
                    <Chip size="sm" color="success" variant="soft">
                      {formatCurrency(summary?.paymentsByMethod.paypal.total || 0)}
                    </Chip>
                  </Box>
                  <WalletIcon sx={{ fontSize: 48, color: 'success.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Charts */}
        <Grid container spacing={2}>
          {/* Gráfico de Barras - Ingresos por Mes */}
          <Grid xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography level="title-lg" sx={{ mb: 2 }}>
                  Ingresos por Mes
                </Typography>
                <Box sx={{ height: 300 }}>
                  <Bar data={barChartData} options={barChartOptions} />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Gráfico Dona - Por Recurrencia */}
          <Grid xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography level="title-lg" sx={{ mb: 2 }}>
                  Por Recurrencia
                </Typography>
                <Box sx={{ height: 300, display: 'flex', justifyContent: 'center' }}>
                  <Doughnut data={doughnutData} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Métodos de Pago */}
        <Grid container spacing={2}>
          <Grid xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography level="title-lg" sx={{ mb: 2 }}>
                  Por Método de Pago
                </Typography>
                <Box sx={{ height: 250, display: 'flex', justifyContent: 'center' }}>
                  <Doughnut data={paymentMethodsData} />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Por Recurrencia - Detalles */}
          <Grid xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography level="title-lg" sx={{ mb: 2 }}>
                  Detalles por Recurrencia
                </Typography>
                <Grid container spacing={2}>
                  {summary &&
                    Object.entries(summary.paymentsByRecurrence).map(([key, value]) => (
                      <Grid xs={6} sm={4} key={key}>
                        <Card variant="soft">
                          <CardContent>
                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                              {key}
                            </Typography>
                            <Typography level="h4">{formatCurrency(value.total)}</Typography>
                            <Chip size="sm" variant="outlined">
                              {value.count} pagos
                            </Chip>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Tabla de Pagos Recientes */}
        <Card>
          <CardContent>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
              <Typography level="title-lg">Pagos Recientes</Typography>
              <Chip variant="soft" color="primary">
                {totalPayments} registros
              </Chip>
            </Stack>
            <Divider sx={{ mb: 2 }} />
            <Sheet sx={{ overflow: 'auto' }}>
              <Table stickyHeader>
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>ID</th>
                    <th style={{ width: 150 }}>Empresa</th>
                    <th style={{ width: 120 }}>Fecha</th>
                    <th style={{ width: 200 }}>Detalle</th>
                    <th style={{ width: 120 }}>Método</th>
                    <th style={{ width: 120 }}>Recurrencia</th>
                    <th style={{ width: 100 }}>Estado</th>
                    <th style={{ width: 120 }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                        <Typography>No se encontraron pagos</Typography>
                      </td>
                    </tr>
                  ) : (
                    payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>
                          <Typography level="body-sm" fontWeight="bold">
                            #{payment.id}
                          </Typography>
                        </td>
                        <td>
                          <Typography level="body-sm">
                            {payment.company?.name || `Empresa ${payment.companyId}`}
                          </Typography>
                        </td>
                        <td>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <CalendarIcon sx={{ fontSize: 16, color: 'text.tertiary' }} />
                            <Typography level="body-xs">
                              {new Date(payment.dueDate).toLocaleDateString('es-ES')}
                            </Typography>
                          </Stack>
                        </td>
                        <td>
                          <Typography level="body-sm">{payment.detail}</Typography>
                        </td>
                        <td>
                          <Chip
                            size="sm"
                            variant="soft"
                            startDecorator={getPaymentMethodIcon(payment.paymentMethod)}
                          >
                            {payment.paymentMethod || 'N/A'}
                          </Chip>
                        </td>
                        <td>
                          <Chip size="sm" variant="outlined">
                            {payment.recurrence || 'N/A'}
                          </Chip>
                        </td>
                        <td>
                          <Chip
                            size="sm"
                            color={getStatusConfig(payment.status).color}
                            startDecorator={getStatusConfig(payment.status).icon}
                          >
                            {getStatusConfig(payment.status).label}
                          </Chip>
                        </td>
                        <td>
                          <Typography level="body-sm" fontWeight="bold" sx={{ color: 'success.main' }}>
                            {formatCurrency(payment.value)}
                          </Typography>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Sheet>

            {/* Paginación */}
            {totalPages > 1 && (
              <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 2 }}>
                <Button
                  size="sm"
                  variant="outlined"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </Button>
                <Chip variant="soft">
                  Página {page} de {totalPages}
                </Chip>
                <Button
                  size="sm"
                  variant="outlined"
                  disabled={page === totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Siguiente
                </Button>
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Container>
  )
}
