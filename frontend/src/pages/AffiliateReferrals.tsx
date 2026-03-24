import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, Table, Sheet, Chip, CircularProgress, Alert, Select, Option
} from '@mui/joy'
import { Users, AlertCircle } from 'lucide-react'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }

interface Referral {
  id: number
  affiliateId: number
  referredCompanyId: number
  commissionAmount: number
  status: string
  level: number
  sourceType: string
  paidAt: string | null
  createdAt: string
  affiliate?: { id: number; name: string; referralCode: string }
}

const STATUS_MAP: Record<string, { label: string; color: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  pending: { label: 'Pendiente', color: 'warning' },
  paid: { label: 'Pagado', color: 'success' },
  cancelled: { label: 'Cancelado', color: 'danger' },
}

export default function AffiliateReferrals() {
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [page, setPage] = useState(1)

  const fetchReferrals = useCallback(async () => {
    try {
      setLoading(true)
      const params: Record<string, string | number> = { page, limit: 20 }
      if (statusFilter) params.status = statusFilter
      const { data: res } = await api.get('/affiliates/referrals', { params })
      if (res.success) {
        setReferrals(res.data.rows || [])
        setCount(res.data.count || 0)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar'
      setError(msg)
      devLog('[AffiliateReferrals] Error:', err)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, page])

  useEffect(() => { fetchReferrals() }, [fetchReferrals])

  const formatCurrency = (val: number) => `$${Number(val || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography level="h3" sx={{ fontWeight: 700 }}>
            <Users size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Referidos
          </Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.500' }}>
            {count} referidos en total
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Select
            size="sm" placeholder="Estado"
            value={statusFilter}
            onChange={(_, v) => { setStatusFilter(v || ''); setPage(1) }}
            sx={{ minWidth: 130 }}
          >
            <Option value="">Todos</Option>
            <Option value="pending">Pendiente</Option>
            <Option value="paid">Pagado</Option>
            <Option value="cancelled">Cancelado</Option>
          </Select>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress size="lg" /></Box>
      ) : error ? (
        <Alert color="danger" startDecorator={<AlertCircle size={18} />}>{error}</Alert>
      ) : referrals.length === 0 ? (
        <Alert color="neutral">Sin referidos registrados</Alert>
      ) : (
        <Sheet variant="outlined" sx={{ borderRadius: 'md', overflow: 'auto' }}>
          <Table stickyHeader hoverRow sx={{ '& th': { bgcolor: 'background.level1' } }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Programa</th>
                <th>Empresa Referida</th>
                <th>Comisión</th>
                <th>Nivel</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => {
                const sc = STATUS_MAP[r.status] || STATUS_MAP.pending
                return (
                  <tr key={r.id}>
                    <td><Typography level="body-xs">#{r.id}</Typography></td>
                    <td>
                      <Typography level="body-sm">{r.affiliate?.name || `Programa #${r.affiliateId}`}</Typography>
                    </td>
                    <td><Typography level="body-sm">Empresa #{r.referredCompanyId}</Typography></td>
                    <td><Typography level="body-sm" sx={{ fontWeight: 600 }}>{formatCurrency(r.commissionAmount)}</Typography></td>
                    <td><Chip size="sm" variant="outlined">Nivel {r.level}</Chip></td>
                    <td><Chip size="sm" variant="soft" color="primary">{r.sourceType || 'signup'}</Chip></td>
                    <td><Chip size="sm" variant="soft" color={sc.color}>{sc.label}</Chip></td>
                    <td><Typography level="body-xs">{formatDate(r.createdAt)}</Typography></td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </Sheet>
      )}

      {/* Paginación simple */}
      {count > 20 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 2 }}>
          <Chip
            variant={page > 1 ? 'soft' : 'outlined'}
            onClick={() => page > 1 && setPage(p => p - 1)}
            sx={{ cursor: page > 1 ? 'pointer' : 'default' }}
          >
            Anterior
          </Chip>
          <Chip variant="outlined">Página {page}</Chip>
          <Chip
            variant={referrals.length === 20 ? 'soft' : 'outlined'}
            onClick={() => referrals.length === 20 && setPage(p => p + 1)}
            sx={{ cursor: referrals.length === 20 ? 'pointer' : 'default' }}
          >
            Siguiente
          </Chip>
        </Box>
      )}
    </Box>
  )
}
