import { useState, useEffect, useCallback } from 'react'
import { ArrowClockwise, CheckCircle, XCircle, Warning, Lightning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatTile } from '@/components/ui/stat-tile'
import { cn } from '@/lib/utils'
import api from '../services/api'
import { showError, showSuccess } from '../utils/showToast'

type Rec = {
  id: number
  kind: string
  method: string
  targetType?: string
  targetId?: string
  recommendation: string
  metrics?: Record<string, any>
  assumption?: string
  sufficientData: boolean
  status: 'pending' | 'applied' | 'dismissed'
  runDate: string
}

const KIND_LABEL: Record<string, string> = {
  cpa_confidence: 'CPA · Intervalo de confianza',
  chat_demand: 'Demanda de chat',
  lead_scoring: 'Scoring de leads',
}

const StatsRecommendations = () => {
  const [recs, setRecs] = useState<Rec[]>([])
  const [summary, setSummary] = useState({ total: 0, conDatos: 0, insuficientes: 0 })
  const [accuracy, setAccuracy] = useState<{ hitRate: number | null; evaluated: number; applied: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [list, acc] = await Promise.all([
        api.get('/stats/recommendations'),
        api.get('/stats/accuracy'),
      ])
      setRecs(list.data.recommendations || [])
      setSummary(list.data.resumen || { total: 0, conDatos: 0, insuficientes: 0 })
      setAccuracy(acc.data.accuracy || null)
    } catch {
      showError('No se pudieron cargar las recomendaciones')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const runNow = async () => {
    try {
      setRunning(true)
      const res = await api.post('/stats/run')
      showSuccess(`Motor ejecutado: ${res.data.recorded} recomendaciones`)
      await load()
    } catch {
      showError('No se pudo ejecutar el motor')
    } finally {
      setRunning(false)
    }
  }

  const act = async (id: number, status: 'applied' | 'dismissed') => {
    try {
      await api.put(`/stats/recommendations/${id}`, { status })
      setRecs((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))
    } catch {
      showError('No se pudo actualizar')
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Recomendaciones</h1>
          <p className="text-sm text-muted-foreground">
            Cada recomendación viene de un método estadístico, con su probabilidad y su supuesto.
          </p>
        </div>
        <Button onClick={runNow} disabled={running}>
          <Lightning className={cn('size-4', running && 'animate-pulse')} weight="fill" />
          Ejecutar ahora
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Recomendaciones" value={String(summary.total)} />
        <StatTile label="Con datos suficientes" value={String(summary.conDatos)} tone="success" />
        <StatTile label="Datos insuficientes" value={String(summary.insuficientes)} tone={summary.insuficientes > 0 ? 'warning' : 'neutral'} />
        <StatTile
          label="Tasa de acierto"
          value={accuracy?.hitRate == null ? '—' : `${accuracy.hitRate}%`}
          tone={accuracy?.hitRate != null && accuracy.hitRate >= 60 ? 'success' : 'neutral'}
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : recs.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Aún no hay recomendaciones. El motor corre cada noche, o pulsa “Ejecutar ahora”.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {recs.map((r) => (
            <div
              key={r.id}
              className={cn(
                'rounded-xl border border-border bg-card p-4',
                r.status === 'dismissed' && 'opacity-55',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">{KIND_LABEL[r.kind] || r.kind}</Badge>
                <Badge variant="outline">{r.method}</Badge>
                {!r.sufficientData && (
                  <Badge variant="warning" dot>
                    Datos insuficientes
                  </Badge>
                )}
                {r.status === 'applied' && <Badge variant="success" dot>Aplicada</Badge>}
                <span className="ml-auto text-xs text-muted-foreground">{r.runDate}</span>
              </div>

              <p className="mt-2 text-sm text-foreground">{r.recommendation}</p>

              {r.assumption && (
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium">Supuesto:</span> {r.assumption}
                </p>
              )}

              {r.metrics && Object.keys(r.metrics).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(r.metrics).map(([k, v]) => (
                    <span
                      key={k}
                      className="rounded border border-border/60 bg-background px-1.5 py-0.5 text-[0.65rem] text-muted-foreground"
                    >
                      {k}: <span className="font-medium tabular-nums">{typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(3)) : String(v)}</span>
                    </span>
                  ))}
                </div>
              )}

              {r.status === 'pending' && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => act(r.id, 'applied')}>
                    <CheckCircle className="size-4" /> Aplicar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => act(r.id, 'dismissed')}>
                    <XCircle className="size-4" /> Descartar
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default StatsRecommendations
