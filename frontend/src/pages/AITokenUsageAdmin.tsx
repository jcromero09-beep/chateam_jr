import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircularProgress } from '@mui/joy'
import {
  Money,
  Buildings,
  CaretLineLeft,
  CaretLineRight,
  CaretLeft,
  CaretRight,
  Coins,
  ArrowClockwise,
  MagnifyingGlass,
  Sigma,
  Lightning,
  ChartBar,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import api from '../services/api'

type UsageRow = {
  id: number
  createdAt: string
  companyId: number
  companyName: string
  module: string | null
  model: string
  pricingModel: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  storedCostUsd: number
  estimatedCostUsd: number
  balanceAfter: number | null
  referenceId: string | null
  description: string | null
}

type UsageResponse = {
  rows: UsageRow[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  summary: {
    totalTokens: number
    totalRequests: number
    totalCostUsd: number
    grantedTokens: number
    averageTokensPerRequest: number
  }
}

type FilterOptions = {
  companies: Array<{ id: number; name: string }>
  modules: string[]
  models: string[]
}

const pad = (value: number) => String(value).padStart(2, '0')

const toDateInput = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const startOfLocalDayIso = (value: string) => {
  if (!value) return undefined
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString()
}

const nextLocalDayIso = (value: string) => {
  if (!value) return undefined
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day + 1, 0, 0, 0, 0).toISOString()
}

const formatNumber = (value: number, maximumFractionDigits = 0) =>
  Number(value || 0).toLocaleString('es-EC', { maximumFractionDigits })

const formatUsd = (value: number) =>
  Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  })

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value))

const moduleColor = (module?: string | null): BadgeProps['variant'] => {
  if (module === 'classification') return 'warning'
  if (module === 'embedding') return 'primary'
  if (module === 'chat') return 'success'
  if (module === 'whisper') return 'destructive'
  return 'neutral'
}

// Estilos base de campos de formulario (mismo look que Tags/Connections).
const inputClass =
  'h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

// Botón de paginación (ícono) con aria-label + title para a11y.
function PagerButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  )
}

export default function AITokenUsageAdmin() {
  const today = useMemo(() => new Date(), [])
  const sevenDaysAgo = useMemo(() => {
    const date = new Date(today)
    date.setDate(date.getDate() - 6)
    return date
  }, [today])

  const [options, setOptions] = useState<FilterOptions>({ companies: [], modules: [], models: [] })
  const [data, setData] = useState<UsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [companyId, setCompanyId] = useState('all')
  const [module, setModule] = useState('all')
  const [model, setModel] = useState('all')
  const [dateFrom, setDateFrom] = useState(toDateInput(sevenDaysAgo))
  const [dateTo, setDateTo] = useState(toDateInput(today))
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const requestId = useRef(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [companyId, module, model, dateFrom, dateTo, debouncedSearch, limit])

  useEffect(() => {
    let active = true
    setOptionsLoading(true)
    api.get<FilterOptions>('/admin/ai-token-usage/filters')
      .then(response => {
        if (active) setOptions(response.data)
      })
      .catch(() => {
        if (active) setError('No se pudieron cargar las opciones de filtros')
      })
      .finally(() => {
        if (active) setOptionsLoading(false)
      })

    return () => { active = false }
  }, [])

  const fetchUsage = useCallback(async () => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setError(null)

    try {
      const params: Record<string, string | number> = {
        page,
        limit,
        dateFrom: startOfLocalDayIso(dateFrom) || '',
        dateTo: nextLocalDayIso(dateTo) || '',
      }

      if (companyId !== 'all') params.companyId = companyId
      if (module !== 'all') params.module = module
      if (model !== 'all') params.model = model
      if (debouncedSearch) params.search = debouncedSearch

      const response = await api.get<UsageResponse>('/admin/ai-token-usage', { params })
      if (currentRequest === requestId.current) setData(response.data)
    } catch (requestError: any) {
      if (currentRequest === requestId.current) {
        setError(requestError?.response?.data?.message || 'No se pudo cargar el consumo de tokens')
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [companyId, dateFrom, dateTo, debouncedSearch, limit, model, module, page])

  useEffect(() => { fetchUsage() }, [fetchUsage])

  const summary = data?.summary
  const pagination = data?.pagination

  const summaryCards: Array<{
    label: string
    value: string
    icon: React.ReactNode
    iconClass: string
  }> = [
    { label: 'Costo estimado OpenAI', value: formatUsd(summary?.totalCostUsd || 0), icon: <Money className="size-5" aria-hidden />, iconClass: 'text-success-text' },
    { label: 'Tokens consumidos', value: formatNumber(summary?.totalTokens || 0), icon: <Lightning className="size-5" aria-hidden />, iconClass: 'text-primary' },
    { label: 'Tokens acreditados', value: formatNumber(summary?.grantedTokens || 0), icon: <Coins className="size-5" aria-hidden />, iconClass: 'text-warning-text' },
    { label: 'Peticiones IA', value: formatNumber(summary?.totalRequests || 0), icon: <Sigma className="size-5" aria-hidden />, iconClass: 'text-muted-foreground' },
    { label: 'Promedio por petición', value: formatNumber(summary?.averageTokensPerRequest || 0, 1), icon: <Buildings className="size-5" aria-hidden />, iconClass: 'text-muted-foreground' },
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1800px] space-y-5 p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ChartBar className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Consumo global de tokens IA
              </h1>
              <p className="text-sm text-muted-foreground">
                Auditoría por petición, company, modelo y módulo
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="Actualizar datos"
            title="Actualizar datos"
            onClick={fetchUsage}
            disabled={loading}
          >
            <ArrowClockwise className="size-5" aria-hidden />
          </Button>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text"
          >
            {error}
          </div>
        )}

        {/* Filtros */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-12">
            <div className="col-span-2 space-y-1.5 md:col-span-3 lg:col-span-4">
              <Label htmlFor="usage-search">Búsqueda global</Label>
              <div className="relative">
                <MagnifyingGlass
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  id="usage-search"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Company, modelo, módulo o referencia"
                  className={cn(inputClass, 'pl-9')}
                />
              </div>
            </div>

            <div className="col-span-2 space-y-1.5 md:col-span-1 lg:col-span-2">
              <Label htmlFor="usage-company">Company</Label>
              <Select
                value={companyId}
                onValueChange={value => setCompanyId(value || 'all')}
              >
                <SelectTrigger id="usage-company" className="h-10" disabled={optionsLoading}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las companies</SelectItem>
                  {options.companies.map(company => (
                    <SelectItem key={company.id} value={String(company.id)}>
                      {company.name} (#{company.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-1 space-y-1.5 md:col-span-1 lg:col-span-2">
              <Label htmlFor="usage-module">Módulo</Label>
              <Select value={module} onValueChange={value => setModule(value || 'all')}>
                <SelectTrigger id="usage-module" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {options.modules.map(item => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-1 space-y-1.5 md:col-span-1 lg:col-span-2">
              <Label htmlFor="usage-model">Modelo</Label>
              <Select value={model} onValueChange={value => setModel(value || 'all')}>
                <SelectTrigger id="usage-model" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {options.models.map(item => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-1 space-y-1.5 md:col-span-1 lg:col-span-1">
              <Label htmlFor="usage-from">Desde</Label>
              <input
                id="usage-from"
                type="date"
                value={dateFrom}
                onChange={event => setDateFrom(event.target.value)}
                className={inputClass}
              />
            </div>

            <div className="col-span-1 space-y-1.5 md:col-span-1 lg:col-span-1">
              <Label htmlFor="usage-to">Hasta</Label>
              <input
                id="usage-to"
                type="date"
                value={dateTo}
                onChange={event => setDateTo(event.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {summaryCards.map(card => (
            <div
              key={card.label}
              className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]"
            >
              <div className={cn('mb-1.5 flex items-center gap-2', card.iconClass)}>
                {card.icon}
                <span className="text-sm text-muted-foreground">{card.label}</span>
              </div>
              <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                {card.value}
              </p>
            </div>
          ))}
        </div>

        {/* Tabla */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="min-h-[360px] overflow-x-auto">
            <table className="w-full min-w-[1280px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fecha y hora</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Modelo</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entrada</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Salida</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Costo OpenAI</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saldo</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Referencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && !data ? (
                  <tr>
                    <td colSpan={10}>
                      <div className="flex justify-center py-16">
                        <CircularProgress />
                      </div>
                    </td>
                  </tr>
                ) : (data?.rows.length || 0) === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-16 text-center text-muted-foreground">
                      Sin consumos para estos filtros
                    </td>
                  </tr>
                ) : data?.rows.map(row => {
                  const costWasCorrected = Math.abs(row.storedCostUsd - row.estimatedCostUsd) > 0.0000005
                  return (
                    <tr key={row.id} className="align-middle transition-colors hover:bg-accent/40">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {formatDateTime(row.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{row.companyName}</div>
                        <div className="text-xs text-muted-foreground">Company #{row.companyId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={moduleColor(row.module)}>{row.module || 'sin módulo'}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-foreground">{row.model}</div>
                        {row.pricingModel !== row.model && (
                          <div className="text-xs text-muted-foreground">Tarifa: {row.pricingModel}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatNumber(row.promptTokens)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatNumber(row.completionTokens)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                        {formatNumber(row.totalTokens)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-semibold tabular-nums text-foreground">
                          {formatUsd(row.estimatedCostUsd)}
                        </div>
                        {costWasCorrected && (
                          <div className="text-xs text-warning-text">
                            Guardado: {formatUsd(row.storedCostUsd)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {row.balanceAfter === null ? '—' : formatNumber(row.balanceAfter)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-foreground">
                          {row.referenceId || `tx-${row.id}`}
                        </div>
                        {row.description && (
                          <div className="max-w-[300px] truncate text-xs text-muted-foreground">
                            {row.description}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {formatNumber(pagination?.total || 0)} registros
              </span>
              <Select value={String(limit)} onValueChange={value => setLimit(Number(value || 25))}>
                <SelectTrigger className="h-9 w-[90px]" aria-label="Registros por página">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <PagerButton
                label="Primera página"
                disabled={page <= 1 || loading}
                onClick={() => setPage(1)}
              >
                <CaretLineLeft className="size-4" aria-hidden />
              </PagerButton>
              <PagerButton
                label="Página anterior"
                disabled={page <= 1 || loading}
                onClick={() => setPage(current => Math.max(1, current - 1))}
              >
                <CaretLeft className="size-4" aria-hidden />
              </PagerButton>
              <span className="min-w-[110px] text-center text-sm text-muted-foreground">
                Página {pagination?.page || page} de {pagination?.totalPages || 1}
              </span>
              <PagerButton
                label="Página siguiente"
                disabled={page >= (pagination?.totalPages || 1) || loading}
                onClick={() => setPage(current => current + 1)}
              >
                <CaretRight className="size-4" aria-hidden />
              </PagerButton>
              <PagerButton
                label="Última página"
                disabled={page >= (pagination?.totalPages || 1) || loading}
                onClick={() => setPage(pagination?.totalPages || 1)}
              >
                <CaretLineRight className="size-4" aria-hidden />
              </PagerButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
