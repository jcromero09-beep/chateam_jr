/**
 * Página: Resultado de análisis Derma
 * Ruta: /derma/analyses/:id · Módulo: derma
 *
 * Muestra la foto analizada, el score global, tipo y edad de piel, cada
 * métrica con su score/severidad/hallazgos/recomendación, el plan recomendado
 * y el detalle clínico (si se contrató). Permite exportar el informe a PDF.
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FilePdf, FileText, SpinnerGap, Trash, WarningCircle } from '@phosphor-icons/react'
import { toast } from 'react-toastify'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { usePermissions } from '../hooks/usePermissions'
import toastError from '../errors/toastError'
import {
  dermaService,
  formatDateTime,
  scoreTone,
  severityLabel,
  type DermaAnalysis,
  type DermaMetricResult,
  type DermaSeverity,
} from '../services/dermaService'

// Logging solo en desarrollo (misma convención que AIMultimodal)
const devError = (...args: unknown[]) => {
  // eslint-disable-next-line no-console
  if (import.meta.env.DEV) console.error(...args)
}

const toneText: Record<ReturnType<typeof scoreTone>, string> = {
  success: 'text-success-text',
  warning: 'text-warning-text',
  destructive: 'text-destructive-text',
  neutral: 'text-muted-foreground',
}
const toneBar: Record<ReturnType<typeof scoreTone>, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  neutral: 'bg-muted-foreground',
}

const severityBadge = (s: DermaSeverity) => {
  const label = severityLabel(s)
  if (s === 'ninguna') return <Badge variant="success">{label}</Badge>
  if (s === 'leve') return <Badge variant="primary">{label}</Badge>
  if (s === 'moderada') return <Badge variant="warning">{label}</Badge>
  if (s === 'alta') return <Badge variant="warning">{label}</Badge>
  return <Badge variant="neutral">{label}</Badge>
}

const ScoreRing = ({ score }: { score: number }) => {
  const tone = scoreTone(score)
  const r = 44
  const c = 2 * Math.PI * r
  const offset = c - (Math.max(0, Math.min(100, score)) / 100) * c
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} className="fill-none stroke-muted" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          className={cn('fill-none transition-[stroke-dashoffset] duration-700', {
            'stroke-success': tone === 'success',
            'stroke-warning': tone === 'warning',
            'stroke-destructive': tone === 'destructive',
            'stroke-muted-foreground': tone === 'neutral',
          })}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className={cn('absolute inset-0 flex items-center justify-center text-3xl font-semibold tabular-nums', toneText[tone])}>
        {score}
      </span>
    </div>
  )
}

const MetricCard = ({ m }: { m: DermaMetricResult }) => {
  const tone = scoreTone(m.score)
  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-foreground">{m.label}</p>
        {m.score === null ? (
          <Badge variant="primary">{m.value || '—'}</Badge>
        ) : (
          <span className="flex items-center gap-2">
            {severityBadge(m.severity)}
            <span className={cn('text-lg font-semibold tabular-nums', toneText[tone])}>{m.score}</span>
          </span>
        )}
      </div>
      {m.score !== null && (
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full', toneBar[tone])} style={{ width: `${m.score}%` }} />
        </div>
      )}
      {m.findings && <p className="mt-2 text-sm text-foreground/85">{m.findings}</p>}
      {m.zones.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Zonas: {m.zones.join(', ')}</p>}
      {m.recommendation && (
        <p className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-sm text-foreground">
          <span className="font-medium">Recomendación: </span>
          {m.recommendation}
        </p>
      )}
    </li>
  )
}

export default function DermaAnalysisResult() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { canWrite } = usePermissions()
  const analysisId = Number(id)

  const [analysis, setAnalysis] = useState<DermaAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    if (!analysisId) return
    try {
      setLoading(true)
      const data = await dermaService.getAnalysis(analysisId)
      setAnalysis(data)
      if (data.hasImage) {
        dermaService
          .getAnalysisImageUrl(analysisId)
          .then(setImageUrl)
          .catch(() => setImageUrl(null))
      }
    } catch (err) {
      devError('[Derma] análisis', err)
      setAnalysis(null)
    } finally {
      setLoading(false)
    }
  }, [analysisId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    },
    [imageUrl],
  )

  const exportPdf = async () => {
    try {
      setExporting(true)
      await dermaService.downloadReportPdf(analysisId)
    } catch (err) {
      const e = err as { response?: { status?: number } }
      if (e.response?.status === 500) {
        toast.warning('El PDF no está disponible en este servidor; abriendo la versión imprimible.')
        await dermaService.openReportHtml(analysisId).catch(() => undefined)
      } else {
        toastError(err as Parameters<typeof toastError>[0])
      }
    } finally {
      setExporting(false)
    }
  }

  const remove = async () => {
    if (!analysis) return
    if (!confirm('¿Eliminar este análisis? Esta acción no se puede deshacer.')) return
    try {
      await dermaService.deleteAnalysis(analysis.id)
      toast.success('Análisis eliminado')
      navigate(`/derma/patients/${analysis.patientId}`)
    } catch (err) {
      toastError(err as Parameters<typeof toastError>[0])
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-sm text-muted-foreground">
        <SpinnerGap className="mr-2 size-4 animate-spin" weight="bold" aria-hidden />
        Cargando análisis...
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center gap-3 p-16 text-center text-muted-foreground">
        <WarningCircle className="size-10" aria-hidden />
        <p>No se encontró el análisis.</p>
        <Button variant="outline" onClick={() => navigate('/derma')}>
          Volver a Derma
        </Button>
      </div>
    )
  }

  const r = analysis.result
  const back = `/derma/patients/${analysis.patientId}`

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Volver" onClick={() => navigate(back)}>
            <ArrowLeft className="size-5" aria-hidden />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Resultado de análisis</h1>
            <p className="text-sm text-muted-foreground">
              {analysis.patient?.name ?? 'Paciente'}
              {analysis.patient?.age != null ? ` · ${analysis.patient.age} años` : ''} · {formatDateTime(analysis.createdAt)}
              {analysis.user?.name ? ` · ${analysis.user.name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canWrite('derma') && (
            <Button variant="ghost" size="sm" onClick={() => void remove()} aria-label="Eliminar análisis">
              <Trash className="size-4" aria-hidden />
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void dermaService.openReportHtml(analysisId)}>
            <FileText className="size-4" aria-hidden />
            Ver informe
          </Button>
          <Button size="sm" loading={exporting} onClick={() => void exportPdf()} disabled={analysis.status !== 'completed'}>
            {!exporting && <FilePdf className="size-4" aria-hidden />}
            Exportar PDF
          </Button>
        </div>
      </div>

      {analysis.status !== 'completed' || !r ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text"
        >
          {analysis.status === 'failed'
            ? `El análisis falló: ${analysis.errorMessage || 'error desconocido'}. Los créditos fueron reembolsados.`
            : 'El análisis aún no está completado.'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Foto */}
            <div className="lg:col-span-4">
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="aspect-[4/5] bg-muted/40">
                  {imageUrl ? (
                    <img src={imageUrl} alt="Foto analizada" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                      {analysis.hasImage ? 'Cargando foto...' : 'Sin foto'}
                    </div>
                  )}
                </div>
                {!r.imageQuality.ok && (
                  <p className="border-t border-border px-4 py-2 text-xs text-warning-text">
                    Calidad de la foto limitada: {r.imageQuality.notes}
                  </p>
                )}
              </div>
            </div>

            {/* Score y resumen */}
            <div className="lg:col-span-8">
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <ScoreRing score={r.globalScore} />
                  <div className="flex-1">
                    <p className="text-lg font-semibold text-foreground">Score global</p>
                    <p className="text-sm text-muted-foreground">
                      {r.metrics.length} métricas · estado: Completado
                      {analysis.clinicalDetail ? ' · Detalle clínico' : ''}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Tipo de piel</p>
                        <p className="mt-0.5 font-semibold capitalize text-foreground">{r.skinType}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Edad de piel</p>
                        <p className="mt-0.5 font-semibold text-foreground">{r.skinAge ?? '—'}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Créditos usados</p>
                        <p className="mt-0.5 font-semibold text-foreground">{analysis.creditsUsed}</p>
                      </div>
                    </div>
                  </div>
                </div>
                {r.summary && (
                  <p className="mt-5 rounded-lg border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-foreground">{r.summary}</p>
                )}
              </div>

              {r.recommendations.length > 0 && (
                <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
                  <h2 className="text-base font-semibold text-foreground">Plan recomendado</h2>
                  <ul className="mt-3 space-y-2">
                    {r.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm">
                        <Badge variant={rec.priority === 'alta' ? 'warning' : rec.priority === 'media' ? 'primary' : 'neutral'}>
                          {rec.priority}
                        </Badge>
                        <span>
                          <span className="font-medium text-foreground">{rec.title}</span>
                          {rec.detail && <span className="text-foreground/80"> — {rec.detail}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Métricas */}
          <section>
            <h2 className="mb-3 text-base font-semibold text-foreground">Resultados por métrica</h2>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {r.metrics.map((m) => (
                <MetricCard key={m.key} m={m} />
              ))}
            </ul>
          </section>

          {/* Detalle clínico */}
          {r.clinicalDetail && (
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-base font-semibold text-foreground">Detalle clínico</h2>
              {r.clinicalDetail.observations && <p className="mt-2 text-sm text-foreground/85">{r.clinicalDetail.observations}</p>}

              {r.clinicalDetail.suggestedTreatments.length > 0 && (
                <>
                  <h3 className="mt-4 text-sm font-semibold text-foreground">Tratamientos sugeridos</h3>
                  <ul className="mt-2 grid gap-2 md:grid-cols-2">
                    {r.clinicalDetail.suggestedTreatments.map((t, i) => (
                      <li key={i} className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                        <p className="font-medium text-foreground">
                          {t.name}
                          {t.sessions && <span className="ml-2 text-xs font-normal text-muted-foreground">{t.sessions}</span>}
                        </p>
                        <p className="mt-1 text-foreground/80">{t.rationale}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {(r.clinicalDetail.homeCare.morning.length > 0 || r.clinicalDetail.homeCare.night.length > 0) && (
                <>
                  <h3 className="mt-4 text-sm font-semibold text-foreground">Rutina en casa</h3>
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mañana</p>
                      <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-foreground/85">
                        {r.clinicalDetail.homeCare.morning.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Noche</p>
                      <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-foreground/85">
                        {r.clinicalDetail.homeCare.night.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </>
              )}

              {r.clinicalDetail.cautions.length > 0 && (
                <>
                  <h3 className="mt-4 text-sm font-semibold text-foreground">Precauciones</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-warning-text">
                    {r.clinicalDetail.cautions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </>
              )}

              {r.clinicalDetail.followUpWeeks && (
                <p className="mt-4 text-sm text-foreground">
                  <span className="font-medium">Revisión sugerida:</span> en {r.clinicalDetail.followUpWeeks} semanas.
                </p>
              )}
            </section>
          )}

          <p className="text-xs text-muted-foreground">
            Valoración estética asistida por IA ({analysis.provider ?? 'IA'} · {analysis.model ?? ''}) para apoyo del profesional. No
            constituye diagnóstico médico ni sustituye la consulta con un dermatólogo.
          </p>
        </>
      )}
    </div>
  )
}
