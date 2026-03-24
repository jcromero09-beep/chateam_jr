import { useState, useEffect } from 'react'
import {
  Box, Typography, Card, CardContent, Grid, CircularProgress, Alert, Chip, Select, Option
} from '@mui/joy'
import {
  DollarSign, TrendingUp, TrendingDown, PieChart, BarChart3
} from 'lucide-react'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }

interface CostSummary {
  period: string
  dateRange: { start: string; end: string }
  totalTokensBilled: number
  totalTokensCost: number
  totalCreditsUsed: number
  totalRevenue: number
  margin: number
  marginPercent: number
  transactionCount: number
}

interface TrendDay {
  date: string
  tokensBilled: number
  tokensCost: number
  creditsUsed: number
  revenue: number
  margin: number
}

interface DashboardData {
  summary: CostSummary
  trends: TrendDay[]
}

const KPICard = ({
  title, value, icon, color, subtitle, trend
}: {
  title: string
  value: string | number
  icon: React.ReactNode
  color: string
  subtitle?: string
  trend?: 'up' | 'down' | 'neutral'
}) => (
  <Card variant="outlined" sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography level="body-sm" sx={{ color: 'neutral.500', mb: 0.5 }}>
            {title}
          </Typography>
          <Typography level="h3" sx={{ fontWeight: 700 }}>
            {value}
          </Typography>
          {subtitle && (
            <Typography level="body-xs" sx={{ color: 'neutral.400', mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        <Box sx={{
          p: 1, borderRadius: 'md',
          bgcolor: `${color}15`,
          color: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          {icon}
        </Box>
      </Box>
      {trend && (
        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, gap: 0.5 }}>
          {trend === 'up' ? <TrendingUp size={16} color="#52b788" /> : trend === 'down' ? <TrendingDown size={16} color="#f85149" /> : null}
          <Typography level="body-xs" sx={{ color: trend === 'up' ? '#52b788' : trend === 'down' ? '#f85149' : 'neutral.400' }}>
            {subtitle}
          </Typography>
        </Box>
      )}
    </CardContent>
  </Card>
)

export default function AIRentabilityDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<string>('monthly')

  const fetchDashboard = async () => {
    try {
      setLoading(true)
      setError(null)

      const [summaryRes, trendsRes] = await Promise.all([
        api.get(`/ai-costs/summary?period=${period}`),
        api.get(`/ai-costs/trends?days=30`)
      ])

      if (summaryRes.data.success && trendsRes.data.success) {
        setData({
          summary: summaryRes.data.data,
          trends: trendsRes.data.data
        })
      } else {
        setError('Error al cargar datos')
      }
    } catch (err: any) {
      devLog('Error fetching AI costs:', err)
      setError(err.response?.data?.message || 'Error al cargar dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboard()
  }, [period])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Alert color="danger" sx={{ m: 2 }}>
        {error}
      </Alert>
    )
  }

  const { summary, trends } = data || { summary: {}, trends: [] }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography level="h2">Rentabilidad IA</Typography>
        <Select value={period} onChange={(_, v) => v && setPeriod(v)} sx={{ minWidth: 150 }}>
          <Option value="daily">Hoy</Option>
          <Option value="weekly">Última semana</Option>
          <Option value="monthly">Último mes</Option>
          <Option value="yearly">Último año</Option>
        </Select>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <KPICard
            title="Tokens Facturados"
            value={summary.totalTokensBilled?.toLocaleString() || 0}
            icon={<BarChart3 size={24} />}
            color="#3b82f6"
            subtitle={`${summary.transactionCount || 0} transacciones`}
          />
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <KPICard
            title="Costo IA (USD)"
            value={`$${(summary.totalTokensCost || 0).toFixed(2)}`}
            icon={<DollarSign size={24} />}
            color="#f85149"
          />
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <KPICard
            title="Ingresos (USD)"
            value={`$${(summary.totalRevenue || 0).toFixed(2)}`}
            icon={<TrendingUp size={24} />}
            color="#52b788"
            subtitle="1 crédito = $0.01"
          />
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <KPICard
            title="Margen"
            value={`$${(summary.margin || 0).toFixed(2)}`}
            icon={<PieChart size={24} />}
            color={(summary.margin || 0) >= 0 ? '#52b788' : '#f85149'}
            subtitle={`${(summary.marginPercent || 0).toFixed(1)}%`}
            trend={(summary.margin || 0) >= 0 ? 'up' : 'down'}
          />
        </Grid>
      </Grid>

      <Card variant="outlined">
        <CardContent>
          <Typography level="h4" sx={{ mb: 2 }}>Tendencias Diarias</Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e0e0e0' }}>Fecha</th>
                  <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e0e0e0' }}>Tokens</th>
                  <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e0e0e0' }}>Costo</th>
                  <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e0e0e0' }}>Ingresos</th>
                  <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e0e0e0' }}>Margen</th>
                </tr>
              </thead>
              <tbody>
                {(trends as TrendDay[]).slice(-10).map((day) => (
                  <tr key={day.date}>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>{day.date}</td>
                    <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #f0f0f0' }}>{day.tokensBilled.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #f0f0f0', color: '#f85149' }}>${day.tokensCost.toFixed(2)}</td>
                    <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #f0f0f0', color: '#52b788' }}>${day.revenue.toFixed(2)}</td>
                    <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #f0f0f0', color: (day.margin || 0) >= 0 ? '#52b788' : '#f85149' }}>
                      ${(day.margin || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
