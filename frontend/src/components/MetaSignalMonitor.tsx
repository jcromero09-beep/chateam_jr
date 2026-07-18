import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle,
  XCircle,
  Warning,
  Question,
  ArrowClockwise,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatTile } from '@/components/ui/stat-tile'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import api from '../services/api'
import { showError } from '../utils/showToast'

type CheckStatus = 'ok' | 'warn' | 'error' | 'unknown'

type SignalCheck = {
  key: string
  label: string
  status: CheckStatus
  detail: string
  hint?: string
}

type DailyPoint = { date: string; sent: number; accepted: number; rejected: number; pending: number }
type EmqEvent = { eventName: string; score: number | null; weakKeys: string[] }

type SignalMonitorData = {
  overall: CheckStatus
  checks: SignalCheck[]
  daily: DailyPoint[]
  totals: { sent: number; accepted: number; rejected: number; pending: number; acceptRate: number | null }
  byEvent: Array<{ eventName: string; sent: number; accepted: number; rejected: number }>
  emq: { available: boolean; reason?: string; events: EmqEvent[] }
  generatedAt: string
}

const STATUS_META: Record<CheckStatus, { icon: typeof CheckCircle; className: string; label: string }> = {
  ok: { icon: CheckCircle, className: 'text-success-text', label: 'Correcto' },
  warn: { icon: Warning, className: 'text-warning-text', label: 'Atención' },
  error: { icon: XCircle, className: 'text-destructive-text', label: 'Fallo' },
  unknown: { icon: Question, className: 'text-muted-foreground', label: 'Sin dato' },
}

const OVERALL_COPY: Record<CheckStatus, string> = {
  ok: 'Las señales llegan a Meta correctamente.',
  warn: 'Funciona, pero hay algo que revisar.',
  error: 'Hay un fallo que corta las conversiones.',
  unknown: 'No se pudo comprobar la integración.',
}

// EMQ va sobre 10; Meta considera 6 el mínimo razonable y ~8 un buen match.
const emqTone = (score: number | null): 'success' | 'warning' | 'destructive' | 'neutral' => {
  if (score === null) return 'neutral'
  if (score >= 8) return 'success'
  if (score >= 6) return 'warning'
  return 'destructive'
}

const MetaSignalMonitor = () => {
  const [data, setData] = useState<SignalMonitorData | null>(null)
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState(14)

  const load = useCallback(async (rangeDays: number) => {
    try {
      setLoading(true)
      const res = await api.get<SignalMonitorData>('/facebook-conversions/signal-monitor', {
        params: { days: rangeDays },
      })
      setData(res.data)
    } catch {
      showError('No se pudo cargar el monitor de señales')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(days)
  }, [load, days])

  const maxSent = Math.max(1, ...(data?.daily || []).map(d => d.sent))

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Monitor de señales</h3>
            <p className="text-sm text-muted-foreground">
              Salud de la integración con Meta y calidad de los eventos enviados.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[7, 14, 30].map(d => (
              <Button
                key={d}
                variant={days === d ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setDays(d)}
              >
                {d} días
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => load(days)} disabled={loading}>
              <ArrowClockwise className={cn('size-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {data && (
          <>
            {/* Semáforo */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <Badge
                  variant={
                    data.overall === 'ok'
                      ? 'success'
                      : data.overall === 'warn'
                        ? 'warning'
                        : data.overall === 'error'
                          ? 'destructive'
                          : 'neutral'
                  }
                  dot
                >
                  {STATUS_META[data.overall].label}
                </Badge>
                <span className="text-sm text-muted-foreground">{OVERALL_COPY[data.overall]}</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {data.checks.map(check => {
                  const Icon = STATUS_META[check.status].icon
                  return (
                    <div
                      key={check.key}
                      className="flex items-start gap-3 rounded-lg border border-border/60 bg-background p-3"
                    >
                      <Icon className={cn('mt-0.5 size-5 shrink-0', STATUS_META[check.status].className)} weight="fill" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{check.label}</p>
                        <p className="text-sm text-muted-foreground">{check.detail}</p>
                        {check.hint && (
                          <p className="mt-1 text-xs text-muted-foreground/80">{check.hint}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Totales */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label={`Enviados (${days} días)`} value={String(data.totals.sent)} />
              <StatTile label="Aceptados por Meta" value={String(data.totals.accepted)} tone="success" />
              <StatTile
                label="Rechazados"
                value={String(data.totals.rejected)}
                tone={data.totals.rejected > 0 ? 'destructive' : 'neutral'}
              />
              <StatTile
                label="Tasa de aceptación"
                value={data.totals.acceptRate === null ? '—' : `${data.totals.acceptRate}%`}
                tone={
                  data.totals.acceptRate === null
                    ? 'neutral'
                    : data.totals.acceptRate >= 95
                      ? 'success'
                      : 'warning'
                }
              />
            </div>

            {/* EMQ */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h4 className="text-sm font-semibold">Calidad de coincidencia (EMQ) según Meta</h4>
              {data.emq.available ? (
                <div className="mt-3 space-y-2">
                  {data.emq.events.map(ev => (
                    <div
                      key={ev.eventName}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-3 py-2"
                    >
                      <span className="text-sm font-medium">{ev.eventName}</span>
                      <div className="flex items-center gap-2">
                        {ev.weakKeys.length > 0 && (
                          <Tooltip title={`Datos que casi no envías: ${ev.weakKeys.join(', ')}`}>
                            <span className="text-xs text-muted-foreground">
                              {ev.weakKeys.length} dato(s) débil(es)
                            </span>
                          </Tooltip>
                        )}
                        <Badge variant={emqTone(ev.score)}>
                          {ev.score === null ? '—' : `${ev.score.toFixed(1)}/10`}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">{data.emq.reason}</p>
              )}
            </div>

            {/* Serie diaria */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h4 className="mb-3 text-sm font-semibold">Eventos por día</h4>
              {data.daily.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin eventos en los últimos {days} días.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {data.daily.map(d => (
                    <div key={d.date} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">
                        {d.date.slice(5)}
                      </span>
                      <div className="flex h-4 flex-1 overflow-hidden rounded bg-muted">
                        <div
                          className="bg-success/70"
                          style={{ width: `${(d.accepted / maxSent) * 100}%` }}
                        />
                        <div
                          className="bg-destructive/70"
                          style={{ width: `${(d.rejected / maxSent) * 100}%` }}
                        />
                      </div>
                      <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {d.accepted} ok
                        {d.rejected > 0 && ` · ${d.rejected} ko`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Por evento */}
            {data.byEvent.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h4 className="mb-3 text-sm font-semibold">Por evento</h4>
                <div className="space-y-2">
                  {data.byEvent.map(e => (
                    <div
                      key={e.eventName}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-3 py-2"
                    >
                      <span className="text-sm font-medium">{e.eventName}</span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {e.accepted}/{e.sent} aceptados
                        {e.rejected > 0 && ` · ${e.rejected} rechazados`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Actualizado: {new Date(data.generatedAt).toLocaleString()}
            </p>
          </>
        )}
      </div>
    </TooltipProvider>
  )
}

export default MetaSignalMonitor
