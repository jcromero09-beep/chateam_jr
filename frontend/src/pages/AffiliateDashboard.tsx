import { useEffect, useState } from 'react'
import { CircularProgress } from '@mui/joy'
import {
  UsersThree,
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import api from '../services/api'

interface Kpis {
  totalPrograms: number
  activePrograms: number
  totalReferrals: number
  registeredReferrals: number
  activeReferrals: number
  tokensDelivered: number
  daysDelivered: number
  uniqueAffiliators: number
  totalClicks: number
  conversionRate: number
}

interface ReferralRow {
  id: number
  status: 'registered' | 'active' | string
  rewardType?: 'tokens' | 'days' | null
  rewardTokens: number
  rewardDays: number
  activatedAt: string | null
  rewardProcessedAt: string | null
  createdAt: string
  affiliate?: { id: number; name: string; rewardType: string }
  referredCompany?: { id: number; name: string; email?: string; planId?: number; plan?: { id: number; name: string } }
  affiliateCompany?: { id: number; name: string; email?: string }
}

const KpiCard = ({ label, value, hint }: { label: string; value: string | number; hint?: string }) => (
  <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">{value}</p>
    {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
  </div>
)

const StatusChip = ({ status }: { status: string }) => {
  const map: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    registered: { variant: 'warning', label: 'Registrado' },
    active: { variant: 'success', label: 'Activo' },
    pending: { variant: 'neutral', label: 'Pendiente' },
    paid: { variant: 'success', label: 'Pagado' },
    cancelled: { variant: 'neutral', label: 'Cancelado' },
  }
  const m = map[status] || { variant: 'neutral' as const, label: status }
  return <Badge variant={m.variant}>{m.label}</Badge>
}

const columns = ['Referida', 'Afiliador', 'Programa', 'Plan actual', 'Estado', 'Recompensa', 'Registrado', 'Activado']

export default function AffiliateDashboard() {
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [rows, setRows] = useState<ReferralRow[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const limit = 20

  const totalPages = Math.max(1, Math.ceil(count / limit))

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter])

  const fetchData = async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/affiliates/dashboard', {
        params: { page, limit, search, status: statusFilter || undefined },
      })
      setKpis(data?.data?.kpis || null)
      setRows(data?.data?.referralsTable?.rows || [])
      setCount(data?.data?.referralsTable?.count || 0)
    } catch (err) {
      console.error('Error cargando dashboard de afiliados', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    setPage(1)
    fetchData()
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <UsersThree className="size-6" weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Dashboard de Afiliados
            </h1>
            <p className="text-sm text-muted-foreground">
              Visión global de programas, referidos y recompensas entregadas.
            </p>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <KpiCard label="Programas activos" value={`${kpis?.activePrograms ?? 0} / ${kpis?.totalPrograms ?? 0}`} />
          <KpiCard label="Referidos totales" value={kpis?.totalReferrals ?? 0} />
          <KpiCard label="Registrados" value={kpis?.registeredReferrals ?? 0} hint="En plan demo" />
          <KpiCard label="Activos" value={kpis?.activeReferrals ?? 0} hint="Plan pagado" />
          <KpiCard label="Tokens entregados" value={(kpis?.tokensDelivered ?? 0).toLocaleString()} />
          <KpiCard label="Días entregados" value={kpis?.daysDelivered ?? 0} />
          <KpiCard label="Afiliadores únicos" value={kpis?.uniqueAffiliators ?? 0} />
          <KpiCard
            label="Conversión"
            value={`${((kpis?.conversionRate ?? 0) * 100).toFixed(1)}%`}
            hint={`${kpis?.totalClicks ?? 0} clicks`}
          />
        </div>

        {/* Filtros */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <MagnifyingGlass
                className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                placeholder="Buscar empresa referida o afiliadora"
                aria-label="Buscar empresa referida o afiliadora"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>
            <Select
              value={statusFilter || 'all'}
              onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1) }}
            >
              <SelectTrigger className="h-10 sm:w-[180px]" aria-label="Filtrar por estado">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="registered">Registrado</SelectItem>
                <SelectItem value="active">Activo</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleSearch}>Buscar</Button>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
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
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center">
                      <div className="flex items-center justify-center">
                        <CircularProgress size="md" />
                      </div>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      No hay referidos aún.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-foreground">{r.referredCompany?.name || '—'}</span>
                          <span className="text-xs text-muted-foreground">
                            {r.referredCompany?.email || ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-foreground">{r.affiliateCompany?.name || '—'}</span>
                          <span className="text-xs text-muted-foreground">
                            {r.affiliateCompany?.email || ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.affiliate?.name || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.referredCompany?.plan?.name || (r.referredCompany?.planId === 1 ? 'Demo' : '—')}
                      </td>
                      <td className="px-4 py-3"><StatusChip status={r.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.rewardType === 'tokens' && Number(r.rewardTokens) > 0
                          ? `${Number(r.rewardTokens).toLocaleString()} tokens`
                          : r.rewardType === 'days' && Number(r.rewardDays) > 0
                            ? `${r.rewardDays} días`
                            : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {r.activatedAt ? new Date(r.activatedAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Paginación */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {count} referidos — página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Página anterior"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <CaretLeft className="size-5" aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Página siguiente"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              <CaretRight className="size-5" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
