import { ChartLineUp, Info } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'

const features = [
  'Tasa de apertura y clicks por campana',
  'Evolucion de suscriptores y bajas',
  'Comparativa entre campanas',
  'Rendimiento por hora y dia de la semana',
  'Reportes exportables en CSV y PDF',
]

export default function EmailMarketingAnalytics() {
  const navigate = useNavigate()

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <ChartLineUp className="size-6" weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Analytics de Email
            </h1>
            <p className="text-sm text-muted-foreground">
              Reportes y metricas de campanas de email
            </p>
          </div>
        </div>

        {/* Info card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
          <div className="flex flex-col items-start gap-5">
            <div className="flex items-center gap-3">
              <Info className="size-[22px] text-brand-teal" weight="fill" aria-hidden />
              <h2 className="text-base font-semibold text-foreground">
                Proximamente disponible
              </h2>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">
              Los analytics detallados de campanas de email estaran disponibles proximamente.
              Por ahora, puedes ver el estado de tus campanas en el Dashboard.
            </p>

            <div className="w-full rounded-lg border border-border bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">Funcionalidades previstas:</p>
              <ul className="mt-2 space-y-2">
                {features.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-brand-teal"
                      aria-hidden
                    />
                    <span className="text-sm text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Button size="sm" onClick={() => navigate('/email-marketing')}>
              Volver al Dashboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
