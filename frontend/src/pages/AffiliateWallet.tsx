import { useEffect, useState } from 'react'
import { CircularProgress } from '@mui/joy'
import { Wallet, ArrowClockwise } from '@phosphor-icons/react'
import { toast } from 'react-toastify'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import api from '../services/api'

interface WalletSummary {
  companyId: number
  totalReferrals: number
  registeredReferrals: number
  activeReferrals: number
  pendingClaim: number
  claimedCount: number
  pendingTokens: number
  pendingDays: number
  tokensEarned: number
  daysEarned: number
  currentTokenBalance: number
  currency: string
}

interface RewardRow {
  id: number
  status: string
  rewardStatus: 'pending' | 'claimable' | 'claimed' | 'cancelled' | string
  rewardType: 'tokens' | 'days' | null
  rewardTokens: number
  rewardDays: number
  rewardClaimedAt: string | null
  activatedAt: string | null
  createdAt: string
  affiliate?: {
    id: number
    name: string
    rewardType: 'tokens' | 'days'
    rewardTokens: number
    rewardDays: number
  }
  referredCompany?: { id: number; name: string; email?: string; planId?: number }
}

type KpiColor = 'primary' | 'success' | 'warning' | 'neutral'

const kpiValueTone: Record<KpiColor, string> = {
  primary: 'text-primary',
  success: 'text-success-text',
  warning: 'text-warning-text',
  neutral: 'text-foreground',
}

const KpiCard = ({
  label,
  value,
  hint,
  color = 'neutral',
}: {
  label: string
  value: string | number
  hint?: string
  color?: KpiColor
}) => (
  <div className="min-w-[180px] flex-1 rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={cn('mt-1 text-2xl font-semibold tracking-tight tabular-nums', kpiValueTone[color])}>
      {value}
    </p>
    {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
  </div>
)

const RewardStatusChip = ({ status }: { status: string }) => {
  const map: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    pending: { variant: 'neutral', label: 'Pendiente de pago' },
    claimable: { variant: 'warning', label: 'Disponible para cobrar' },
    claimed: { variant: 'success', label: 'Cobrado' },
    cancelled: { variant: 'neutral', label: 'Cancelado' },
  }
  const m = map[status] || { variant: 'neutral' as const, label: status }
  return <Badge variant={m.variant}>{m.label}</Badge>
}

const expectedReward = (r: RewardRow): { kind: 'tokens' | 'days' | null; amount: number } => {
  if (r.rewardStatus === 'claimed') {
    if (r.rewardType === 'tokens') return { kind: 'tokens', amount: Number(r.rewardTokens || 0) }
    if (r.rewardType === 'days') return { kind: 'days', amount: Number(r.rewardDays || 0) }
  }
  if (r.affiliate) {
    if (r.affiliate.rewardType === 'tokens') return { kind: 'tokens', amount: Number(r.affiliate.rewardTokens || 0) }
    if (r.affiliate.rewardType === 'days') return { kind: 'days', amount: Number(r.affiliate.rewardDays || 0) }
  }
  return { kind: null, amount: 0 }
}

const columns = ['Empresa referida', 'Programa', 'Tipo', 'Cantidad', 'Estado', 'Cobrado', '']

export default function AffiliateWallet() {
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<WalletSummary | null>(null)
  const [rows, setRows] = useState<RewardRow[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [claimingId, setClaimingId] = useState<number | null>(null)
  const limit = 20
  const totalPages = Math.max(1, Math.ceil(count / limit))

  useEffect(() => { fetchAll() }, [page, typeFilter])

  const fetchAll = async () => {
    try {
      setLoading(true)
      const [walletRes, txRes] = await Promise.all([
        api.get('/affiliates/wallet'),
        api.get('/affiliates/wallet/transactions', {
          params: { page, limit, type: typeFilter || undefined },
        }),
      ])
      setSummary(walletRes.data?.data || null)
      setRows(txRes.data?.data?.rows || [])
      setCount(txRes.data?.data?.count || 0)
    } catch (err) {
      console.error('Error cargando wallet', err)
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
      await fetchAll()
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.errors?.[0] || 'No se pudo cobrar la recompensa'
      toast.error(msg)
    } finally {
      setClaimingId(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Wallet className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Resumen de Recompensas
              </h1>
              <p className="text-sm text-muted-foreground">
                Tokens IA y días extra ganados por las empresas que invitaste.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualizar"
            className="text-muted-foreground"
            onClick={fetchAll}
          >
            <ArrowClockwise className="size-5" aria-hidden />
          </Button>
        </div>

        {/* KPIs */}
        <div className="flex flex-wrap gap-4">
          <KpiCard label="Referidos totales" value={summary?.totalReferrals ?? 0} />
          <KpiCard
            label="Por cobrar"
            value={summary?.pendingClaim ?? 0}
            color="warning"
            hint="Activos sin cobrar"
          />
          <KpiCard label="Cobrados" value={summary?.claimedCount ?? 0} color="success" />
          <KpiCard
            label="Tokens pendientes"
            value={(summary?.pendingTokens ?? 0).toLocaleString()}
            color="warning"
          />
          <KpiCard
            label="Días pendientes"
            value={summary?.pendingDays ?? 0}
            color="warning"
          />
          <KpiCard
            label="Tokens cobrados"
            value={(summary?.tokensEarned ?? 0).toLocaleString()}
            color="success"
          />
          <KpiCard
            label="Días cobrados"
            value={summary?.daysEarned ?? 0}
            color="success"
          />
          <KpiCard
            label="Saldo de tokens"
            value={(summary?.currentTokenBalance ?? 0).toLocaleString()}
            hint="Tu saldo IA actual"
          />
        </div>

        {/* Filtros */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Select
              value={typeFilter || 'all'}
              onValueChange={(v) => { setTypeFilter(v === 'all' ? '' : v); setPage(1) }}
            >
              <SelectTrigger aria-label="Filtrar recompensas" className="sm:w-[240px]">
                <SelectValue placeholder="Filtrar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas (cobrables + cobradas)</SelectItem>
                <SelectItem value="claimable">Solo por cobrar</SelectItem>
                <SelectItem value="claimed">Solo cobradas</SelectItem>
                <SelectItem value="tokens">Tipo: Tokens</SelectItem>
                <SelectItem value="days">Tipo: Días</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchAll}>
              Actualizar
            </Button>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          {loading ? (
            <div className="p-10 text-center">
              <CircularProgress size="md" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-muted-foreground">
                Aún no hay recompensas. Cuando un referido pase de demo a un plan
                pagado, aparecerá aquí con un botón para cobrar.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
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
                    const exp = expectedReward(r)
                    const canClaim = r.rewardStatus === 'claimable'
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-sm text-foreground">{r.referredCompany?.name || '—'}</span>
                            <span className="text-xs text-muted-foreground">
                              {r.referredCompany?.email || ''}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{r.affiliate?.name || '—'}</td>
                        <td className="px-4 py-3">
                          {exp.kind ? (
                            <Badge variant={exp.kind === 'tokens' ? 'primary' : 'success'}>
                              {exp.kind === 'tokens' ? 'Tokens' : 'Días'}
                            </Badge>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-foreground">
                          {exp.kind === 'tokens'
                            ? exp.amount.toLocaleString()
                            : exp.kind === 'days'
                              ? exp.amount
                              : '—'}
                        </td>
                        <td className="px-4 py-3"><RewardStatusChip status={r.rewardStatus} /></td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {r.rewardClaimedAt
                            ? new Date(r.rewardClaimedAt).toLocaleString()
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {canClaim ? (
                            <Button
                              size="sm"
                              loading={claimingId === r.id}
                              onClick={() => handleClaim(r.id)}
                            >
                              Cobrar recompensa
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

        {/* Paginación */}
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            {count} recompensas — página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              Anterior
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
