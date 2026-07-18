import { useEffect, useState } from 'react'
import { CircularProgress } from '@mui/joy'
import { UsersThree, ArrowClockwise } from '@phosphor-icons/react'
import { toast } from 'react-toastify'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import api from '../services/api'

interface ReferralRow {
  id: number
  status: string
  rewardStatus: 'pending' | 'claimable' | 'claimed' | 'cancelled' | string
  rewardType: 'tokens' | 'days' | null
  rewardTokens: number
  rewardDays: number
  activatedAt: string | null
  rewardClaimedAt: string | null
  rewardProcessedAt: string | null
  createdAt: string
  affiliate?: {
    id: number
    name: string
    rewardType: 'tokens' | 'days'
    rewardTokens: number
    rewardDays: number
  }
  referredCompany?: {
    id: number
    name: string
    email?: string
    planId?: number
    plan?: { id: number; name: string }
  }
}

const StatusChip = ({ status }: { status: string }) => {
  const map: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    registered: { variant: 'warning', label: 'Registrado' },
    active: { variant: 'success', label: 'Activo' },
    paid: { variant: 'success', label: 'Pagado' },
    pending: { variant: 'neutral', label: 'Pendiente' },
    cancelled: { variant: 'neutral', label: 'Cancelado' },
  }
  const m = map[status] || { variant: 'neutral' as const, label: status }
  return <Badge variant={m.variant}>{m.label}</Badge>
}

const RewardChip = ({ status }: { status: string }) => {
  const map: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    pending: { variant: 'neutral', label: 'Pendiente de pago' },
    claimable: { variant: 'warning', label: 'Disponible' },
    claimed: { variant: 'success', label: 'Cobrado' },
    cancelled: { variant: 'neutral', label: 'Cancelado' },
  }
  const m = map[status] || { variant: 'neutral' as const, label: status }
  return <Badge variant={m.variant}>{m.label}</Badge>
}

const formatReward = (r: ReferralRow): string => {
  if (r.rewardStatus === 'claimed') {
    if (r.rewardType === 'tokens') return `${Number(r.rewardTokens).toLocaleString()} tokens`
    if (r.rewardType === 'days') return `${r.rewardDays} días`
  }
  if (r.affiliate?.rewardType === 'tokens') {
    return `${Number(r.affiliate.rewardTokens || 0).toLocaleString()} tokens`
  }
  if (r.affiliate?.rewardType === 'days') {
    return `${r.affiliate.rewardDays || 0} días`
  }
  return '—'
}

const columns = [
  'Empresa referida',
  'Programa',
  'Plan actual',
  'Estado',
  'Recompensa',
  'Estado pago',
  'Registro',
  '',
]

export default function AffiliateReferrals() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ReferralRow[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [claimingId, setClaimingId] = useState<number | null>(null)
  const limit = 20
  const totalPages = Math.max(1, Math.ceil(count / limit))

  useEffect(() => { fetchData() }, [page, statusFilter])

  const fetchData = async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/affiliates/referrals', {
        params: { page, limit, status: statusFilter || undefined },
      })
      setRows(data?.data?.rows || [])
      setCount(data?.data?.count || 0)
    } catch (err) {
      console.error('Error cargando referidos', err)
    } finally {
      setLoading(false)
    }
  }

  const handleClaim = async (referralId: number) => {
    if (claimingId) return
    try {
      setClaimingId(referralId)
      const { data } = await api.post(`/affiliates/referrals/${referralId}/claim-reward`)
      if (data?.data?.alreadyClaimed) {
        toast.info('La recompensa ya estaba cobrada')
      } else {
        const r = data?.data
        if (r?.rewardType === 'tokens' && r.rewardTokens > 0) {
          toast.success(`Recompensa cobrada: ${Number(r.rewardTokens).toLocaleString()} tokens`)
        } else if (r?.rewardType === 'days' && r.rewardDays > 0) {
          toast.success(`Recompensa cobrada: ${r.rewardDays} días extra`)
        } else {
          toast.success('Recompensa cobrada')
        }
      }
      await fetchData()
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.errors?.[0] || 'No se pudo cobrar la recompensa'
      toast.error(msg)
    } finally {
      setClaimingId(null)
    }
  }

  const summary = {
    total: count,
    registered: rows.filter(r => r.rewardStatus === 'pending').length,
    claimable: rows.filter(r => r.rewardStatus === 'claimable').length,
    claimed: rows.filter(r => r.rewardStatus === 'claimed').length,
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <UsersThree className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Mis Referidos
              </h1>
              <p className="text-sm text-muted-foreground">
                Empresas registradas con tus links de afiliado.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualizar"
            className="text-muted-foreground"
            onClick={fetchData}
          >
            <ArrowClockwise className="size-5" aria-hidden />
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total" value={String(summary.total)} />
          <StatTile label="Pendientes" value={String(summary.registered)} />
          <StatTile label="Por cobrar" value={String(summary.claimable)} tone="warning" />
          <StatTile label="Cobrados" value={String(summary.claimed)} tone="success" />
        </div>

        {/* Filters */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="sm:w-52">
              <Select
                value={statusFilter || 'all'}
                onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1) }}
              >
                <SelectTrigger aria-label="Filtrar por estado">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="registered">Registrado</SelectItem>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="paid">Pagado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={fetchData}>
              Actualizar
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          {loading ? (
            <div className="flex items-center justify-center p-10 text-muted-foreground">
              <CircularProgress size="md" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Aún no tienes referidos. Comparte tus links en la sección "Links".
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {columns.map((c, i) => (
                      <th
                        key={i}
                        className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const planName =
                      r.referredCompany?.plan?.name ||
                      (r.referredCompany?.planId === 1 ? 'Demo' : '—')
                    const canClaim = r.rewardStatus === 'claimable'
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-sm text-foreground">
                              {r.referredCompany?.name || '—'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {r.referredCompany?.email || ''}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{r.affiliate?.name || '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{planName}</td>
                        <td className="px-4 py-3"><StatusChip status={r.status} /></td>
                        <td className="whitespace-nowrap px-4 py-3 text-foreground">{formatReward(r)}</td>
                        <td className="px-4 py-3"><RewardChip status={r.rewardStatus} /></td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canClaim ? (
                            <Button
                              size="sm"
                              loading={claimingId === r.id}
                              onClick={() => handleClaim(r.id)}
                            >
                              Cobrar
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            {count} referidos — página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
