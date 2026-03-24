import { useState, useEffect } from 'react'
import {
  Box, Typography, Card, CardContent, Grid, CircularProgress, Alert, LinearProgress, Select, Option, Chip
} from '@mui/joy'
import {
  Zap, CreditCard, DollarSign, Activity
} from 'lucide-react'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }

interface UsageByAgent {
  source: string
  tokens: number
  credits: number
  cost: number
}

interface UsageData {
  period: string
  dateRange: { start: string; end: string }
  tokensConsumed: number
  creditsUsed: number
  costThisMonth: number
  creditsRemaining: number
  usageByAgent: UsageByAgent[]
  transactionCount: number
}

const KPICard = ({
  title, value, icon, color, subtitle
}: {
  title: string
  value: string | number
  icon: React.ReactNode
  color: string
  subtitle?: string
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
    </CardContent>
  </Card>
)

export default function AIUsageDashboard() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<string>('monthly')

  const fetchDashboard = async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await api.get(`/ai-costs/company/summary?period=${period}`)

      if (res.data.success) {
        setData(res.data.data)
      } else {
        setError('Error al cargar datos')
      }
    } catch (err: any) {
      devLog('Error fetching AI usage:', err)
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

  const { tokensConsumed, creditsUsed, costThisMonth, creditsRemaining, usageByAgent, transactionCount } = data || {}

  // Calcular porcentaje de uso
  const totalCredits = (creditsUsed || 0) + (creditsRemaining || 0)
  const usagePercent = totalCredits > 0 ? ((creditsUsed || 0) / totalCredits) * 100 : 0

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography level="h2">Mi Consumo de IA</Typography>
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
            title="Tokens Consumidos"
            value={(tokensConsumed || 0).toLocaleString()}
            icon={<Zap size={24} />}
            color="#3b82f6"
            subtitle={`${transactionCount || 0} transacciones`}
          />
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <KPICard
            title="Créditos Usados"
            value={creditsUsed?.toLocaleString() || 0}
            icon={<CreditCard size={24} />}
            color="#f59e0b"
          />
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <KPICard
            title="Costo Este Mes"
            value={`$${(costThisMonth || 0).toFixed(2)}`}
            icon={<DollarSign size={24} />}
            color="#f85149"
          />
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <KPICard
            title="Créditos Restantes"
            value={creditsRemaining?.toLocaleString() || 0}
            icon={<Activity size={24} />}
            color="#52b788"
            subtitle={`${usagePercent.toFixed(1)}% usado`}
          />
        </Grid>
      </Grid>

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography level="h4" sx={{ mb: 2 }}>Uso de Créditos</Typography>
          <Box sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography level="body-sm">Progreso</Typography>
              <Typography level="body-sm">{usagePercent.toFixed(1)}%</Typography>
            </Box>
            <LinearProgress
              value={usagePercent}
              color={usagePercent > 80 ? 'danger' : usagePercent > 50 ? 'warning' : 'success'}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography level="h4" sx={{ mb: 2 }}>Uso por Agente</Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e0e0e0' }}>Agente/Fuente</th>
                  <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e0e0e0' }}>Tokens</th>
                  <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e0e0e0' }}>Créditos</th>
                  <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #e0e0e0' }}>Costo</th>
                </tr>
              </thead>
              <tbody>
                {(usageByAgent || []).map((agent) => (
                  <tr key={agent.source}>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
                      <Chip size="sm" variant="soft">{agent.source}</Chip>
                    </td>
                    <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
                      {agent.tokens.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
                      {agent.credits.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #f0f0f0', color: '#f85149' }}>
                      ${agent.cost.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {(!usageByAgent || usageByAgent.length === 0) && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: '#999' }}>
                      No hay datos de uso para este período
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
