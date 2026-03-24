import { useState, useEffect } from 'react'
import {
  Box, Typography, Card, CardContent, Grid, CircularProgress, Alert, Chip
} from '@mui/joy'
import {
  Users, DollarSign, TrendingUp, MousePointerClick, ArrowUpRight,
  AlertCircle, Wallet, Clock
} from 'lucide-react'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }

interface DashboardKPIs {
  totalPrograms: number
  activePrograms: number
  totalReferrals: number
  totalEarnings: number
  pendingEarnings: number
  withdrawnEarnings: number
  totalClicks: number
  pendingWithdrawals: number
}

interface CommissionMonth {
  month: string
  total: number
}

interface DashboardData {
  kpis: DashboardKPIs
  commissionsPerMonth: CommissionMonth[]
  topReferrals: Array<Record<string, unknown>>
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

export default function AffiliateDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setLoading(true)
        const { data: res } = await api.get('/affiliates/dashboard')
        if (res.success) {
          setData(res.data)
        } else {
          setError(res.message || 'Error al cargar el dashboard')
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error de conexión'
        setError(msg)
        devLog('[AffiliateDashboard] Error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchDashboard()
  }, [])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress size="lg" />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert color="danger" startDecorator={<AlertCircle size={18} />}>
          {error}
        </Alert>
      </Box>
    )
  }

  if (!data) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert color="neutral">No hay datos disponibles</Alert>
      </Box>
    )
  }

  const { kpis } = data

  const formatCurrency = (val: number) => `$${val.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ mb: 3 }}>
        <Typography level="h3" sx={{ fontWeight: 700 }}>
          Dashboard de Afiliados
        </Typography>
        <Typography level="body-sm" sx={{ color: 'neutral.500' }}>
          Resumen general del programa de afiliados
        </Typography>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <KPICard
            title="Programas Activos"
            value={`${kpis.activePrograms} / ${kpis.totalPrograms}`}
            icon={<Users size={20} />}
            color="#3b82f6"
          />
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <KPICard
            title="Total Referidos"
            value={kpis.totalReferrals}
            icon={<ArrowUpRight size={20} />}
            color="#52b788"
          />
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <KPICard
            title="Ganancias Totales"
            value={formatCurrency(kpis.totalEarnings)}
            icon={<DollarSign size={20} />}
            color="#52b788"
            subtitle={`Pendiente: ${formatCurrency(kpis.pendingEarnings)}`}
          />
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <KPICard
            title="Retirado"
            value={formatCurrency(kpis.withdrawnEarnings)}
            icon={<Wallet size={20} />}
            color="#f3a43b"
          />
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <KPICard
            title="Total Clicks"
            value={kpis.totalClicks.toLocaleString()}
            icon={<MousePointerClick size={20} />}
            color="#3b82f6"
          />
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <KPICard
            title="Retiros Pendientes"
            value={kpis.pendingWithdrawals}
            icon={<Clock size={20} />}
            color="#f3a43b"
          />
        </Grid>
      </Grid>

      {/* Comisiones por Mes */}
      <Grid container spacing={2}>
        <Grid xs={12} md={7}>
          <Card variant="outlined">
            <CardContent>
              <Typography level="title-md" sx={{ mb: 2 }}>Comisiones por Mes (últimos 6 meses)</Typography>
              {data.commissionsPerMonth.length === 0 ? (
                <Typography level="body-sm" sx={{ color: 'neutral.400', textAlign: 'center', py: 4 }}>
                  Sin datos de comisiones aún
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {data.commissionsPerMonth.map((m) => (
                    <Box key={m.month} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Typography level="body-sm" sx={{ width: 80, flexShrink: 0 }}>{m.month}</Typography>
                      <Box sx={{
                        flex: 1, height: 24, borderRadius: 'sm', bgcolor: 'neutral.100',
                        position: 'relative', overflow: 'hidden'
                      }}>
                        <Box sx={{
                          position: 'absolute', top: 0, left: 0, bottom: 0,
                          width: `${Math.min(100, (m.total / Math.max(...data.commissionsPerMonth.map(x => x.total), 1)) * 100)}%`,
                          bgcolor: '#3b82f6', borderRadius: 'sm',
                          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', px: 1
                        }}>
                          <Typography level="body-xs" sx={{ color: 'white', fontWeight: 600 }}>
                            {formatCurrency(m.total)}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Top Referidos */}
        <Grid xs={12} md={5}>
          <Card variant="outlined">
            <CardContent>
              <Typography level="title-md" sx={{ mb: 2 }}>
                <TrendingUp size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                Top 5 Referidos
              </Typography>
              {data.topReferrals.length === 0 ? (
                <Typography level="body-sm" sx={{ color: 'neutral.400', textAlign: 'center', py: 4 }}>
                  Sin referidos aún
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {data.topReferrals.map((ref, idx) => (
                    <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip size="sm" variant="soft" color="primary">#{idx + 1}</Chip>
                        <Typography level="body-sm">
                          Referido #{String(ref.id || ref.referredCompanyId || idx)}
                        </Typography>
                      </Box>
                      <Chip size="sm" variant="soft" color="success">
                        {formatCurrency(Number(ref.commissionAmount || 0))}
                      </Chip>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
