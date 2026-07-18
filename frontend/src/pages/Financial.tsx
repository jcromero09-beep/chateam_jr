import { useState, useEffect } from 'react'
import { LinearProgress } from '@mui/joy'
import {
  CurrencyDollar,
  TrendUp,
  DownloadSimple,
  ArrowClockwise,
  CheckCircle,
  Clock,
  Receipt,
  CreditCard,
  Wallet,
  CalendarBlank,
} from '@phosphor-icons/react'
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
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
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

// [migracion MUI -> DS] Radix Select no admite value="" en <SelectItem>. Usamos este
// centinela en la capa de UI y lo mapeamos de vuelta a '' para NO alterar el
// contrato de estado/filtrado existente (que sigue usando '' como "todos").
const ALL = '__all__'

function FilterSelect({
  value,
  onValueChange,
  placeholder,
  ariaLabel,
  options,
  className,
}: {
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  ariaLabel: string
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onValueChange(v === ALL ? '' : v)}>
      <SelectTrigger aria-label={ariaLabel} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || ALL} value={o.value || ALL}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

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

  // Cargar pagos cuando cambia la pagina o filtros
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

  const getStatusConfig = (
    status: string
  ): { variant: BadgeProps['variant']; label: string; icon: React.ReactNode } => {
    const configs: Record<string, { variant: BadgeProps['variant']; label: string; icon: React.ReactNode }> = {
      paid: { variant: 'success', label: 'Pagado', icon: <CheckCircle className="size-3.5" aria-hidden /> },
      open: { variant: 'warning', label: 'Pendiente', icon: <Clock className="size-3.5" aria-hidden /> },
      proceso: { variant: 'primary', label: 'En Proceso', icon: <Clock className="size-3.5" aria-hidden /> },
      refunded: { variant: 'destructive', label: 'Reembolsado', icon: <Receipt className="size-3.5" aria-hidden /> },
    }
    return configs[status] || configs.open
  }

  const getPaymentMethodIcon = (method: string | null) => {
    switch (method) {
      case 'stripe':
        return <CreditCard className="size-3.5" aria-hidden />
      case 'paypal':
        return <Wallet className="size-3.5" aria-hidden />
      case 'outline':
        return <Receipt className="size-3.5" aria-hidden />
      default:
        return <CreditCard className="size-3.5" aria-hidden />
    }
  }

  // Datos para el grafico de barras (Pagos por Mes)
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

  // Datos para el grafico de dona (Por Recurrencia)
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

  // Datos para grafico de metodos de pago
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
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <CurrencyDollar className="size-6" weight="fill" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Dashboard Financiero
                </h1>
                <p className="text-sm text-muted-foreground">
                  Control de ingresos y pagos (Super Admin)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip title="Actualizar datos">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Actualizar datos"
                  onClick={fetchData}
                >
                  <ArrowClockwise className="size-5" aria-hidden />
                </Button>
              </Tooltip>
              <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
                <DownloadSimple className="size-4" aria-hidden />
                Exportar CSV
              </Button>
            </div>
          </div>

          {loading && <LinearProgress />}

          {/* Filtros */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
            <div className="flex flex-wrap gap-3">
              <FilterSelect
                value={selectedMonth}
                onValueChange={setSelectedMonth}
                placeholder="Mes"
                ariaLabel="Filtrar por mes"
                options={months}
                className="min-w-[120px]"
              />
              <FilterSelect
                value={selectedYear}
                onValueChange={setSelectedYear}
                placeholder="Año"
                ariaLabel="Filtrar por año"
                options={years}
                className="min-w-[100px]"
              />
              <FilterSelect
                value={selectedRecurrence}
                onValueChange={setSelectedRecurrence}
                placeholder="Recurrencia"
                ariaLabel="Filtrar por recurrencia"
                options={recurrenceOptions}
                className="min-w-[140px]"
              />
              <FilterSelect
                value={selectedPaymentMethod}
                onValueChange={setSelectedPaymentMethod}
                placeholder="Método de Pago"
                ariaLabel="Filtrar por método de pago"
                options={paymentMethodOptions}
                className="min-w-[150px]"
              />
              <FilterSelect
                value={selectedStatus}
                onValueChange={setSelectedStatus}
                placeholder="Estado"
                ariaLabel="Filtrar por estado"
                options={statusOptions}
                className="min-w-[130px]"
              />
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Total Pagado</p>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums text-success-text">
                    {formatCurrency(summary?.totalPaid || 0)}
                  </p>
                </div>
                <TrendUp className="size-12 shrink-0 text-success opacity-30" aria-hidden />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Pendiente</p>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums text-warning-text">
                    {formatCurrency(summary?.totalPending || 0)}
                  </p>
                </div>
                <Clock className="size-12 shrink-0 text-warning opacity-30" aria-hidden />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Pagos Stripe</p>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                    {summary?.paymentsByMethod.stripe.count || 0}
                  </p>
                  <Badge variant="primary" className="mt-1.5">
                    {formatCurrency(summary?.paymentsByMethod.stripe.total || 0)}
                  </Badge>
                </div>
                <CreditCard className="size-12 shrink-0 text-primary opacity-30" aria-hidden />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Pagos PayPal</p>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                    {summary?.paymentsByMethod.paypal.count || 0}
                  </p>
                  <Badge variant="success" className="mt-1.5">
                    {formatCurrency(summary?.paymentsByMethod.paypal.total || 0)}
                  </Badge>
                </div>
                <Wallet className="size-12 shrink-0 text-success opacity-30" aria-hidden />
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Grafico de Barras - Ingresos por Mes */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] lg:col-span-2">
              <h2 className="mb-4 text-lg font-semibold text-foreground">Ingresos por Mes</h2>
              <div className="h-[300px]">
                <Bar data={barChartData} options={barChartOptions} />
              </div>
            </div>

            {/* Grafico Dona - Por Recurrencia */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-4 text-lg font-semibold text-foreground">Por Recurrencia</h2>
              <div className="flex h-[300px] justify-center">
                <Doughnut data={doughnutData} />
              </div>
            </div>
          </div>

          {/* Metodos de Pago */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-4 text-lg font-semibold text-foreground">Por Método de Pago</h2>
              <div className="flex h-[250px] justify-center">
                <Doughnut data={paymentMethodsData} />
              </div>
            </div>

            {/* Por Recurrencia - Detalles */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] lg:col-span-2">
              <h2 className="mb-4 text-lg font-semibold text-foreground">Detalles por Recurrencia</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {summary &&
                  Object.entries(summary.paymentsByRecurrence).map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-border bg-muted/40 p-4">
                      <p className="text-sm text-muted-foreground">{key}</p>
                      <p className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums text-foreground">
                        {formatCurrency(value.total)}
                      </p>
                      <Badge variant="outline" className="mt-2">
                        {value.count} pagos
                      </Badge>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Tabla de Pagos Recientes */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Pagos Recientes</h2>
              <Badge variant="primary">{totalPayments} registros</Badge>
            </div>
            <div className="mb-4 h-px bg-border" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">ID</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Empresa</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fecha</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detalle</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Método</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recurrencia</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                        No se encontraron pagos
                      </td>
                    </tr>
                  ) : (
                    payments.map((payment) => (
                      <tr key={payment.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3">
                          <span className="text-sm font-bold text-foreground">#{payment.id}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-foreground">
                            {payment.company?.name || `Empresa ${payment.companyId}`}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CalendarBlank className="size-4" aria-hidden />
                            {new Date(payment.dueDate).toLocaleDateString('es-ES')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-foreground">{payment.detail}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="neutral">
                            {getPaymentMethodIcon(payment.paymentMethod)}
                            {payment.paymentMethod || 'N/A'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{payment.recurrence || 'N/A'}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={getStatusConfig(payment.status).variant}>
                            {getStatusConfig(payment.status).icon}
                            {getStatusConfig(payment.status).label}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="text-sm font-bold tabular-nums text-success-text">
                            {formatCurrency(payment.value)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginacion */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </Button>
                <Badge variant="neutral">
                  Página {page} de {totalPages}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Siguiente
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
