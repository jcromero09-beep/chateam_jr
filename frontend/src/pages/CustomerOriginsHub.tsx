import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Path, ChartBar, GearSix } from '@phosphor-icons/react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { usePermissions } from '../hooks/usePermissions'
import CustomerOriginReports from './CustomerOriginReports'
import CustomerOrigins from './CustomerOrigins'

type TabKey = 'analisis' | 'gestion'

/**
 * Hub unificado de "Origen de Clientes".
 * Combina en una sola página, mediante pestañas:
 *   - Análisis  → reportes/gráficos (CustomerOriginReports)
 *   - Gestión   → tabla CRUD de orígenes (CustomerOrigins)
 *
 * Respeta el RBAC: cada pestaña se muestra solo si el usuario tiene su módulo.
 *   - Análisis  ⇒ módulo 'customer_origins_reports'
 *   - Gestión   ⇒ módulo 'customer_origins'
 * Soporta deep-link con ?tab=analisis | ?tab=gestion (compatibilidad con
 * la ruta antigua /customer-origins/reports).
 */
export default function CustomerOriginsHub() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { canAccess } = usePermissions()

  const canReports = canAccess('customer_origins_reports')
  const canManage = canAccess('customer_origins')

  // Resolver pestaña inicial respetando permisos disponibles.
  const resolveTab = (requested: string | null): TabKey => {
    const wanted: TabKey = requested === 'gestion' ? 'gestion' : 'analisis'
    if (wanted === 'analisis' && !canReports) return 'gestion'
    if (wanted === 'gestion' && !canManage) return 'analisis'
    return wanted
  }

  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    resolveTab(searchParams.get('tab'))
  )

  // Mantener sincronizada la pestaña con el query param (para enlaces compartibles).
  useEffect(() => {
    const current = searchParams.get('tab')
    if (current !== activeTab) {
      const next = new URLSearchParams(searchParams)
      next.set('tab', activeTab)
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const handleChange = (value: TabKey) => setActiveTab(value)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header unificado */}
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <Path className="size-6" weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Origen de Clientes
            </h1>
            <p className="text-sm text-muted-foreground">
              Analiza y gestiona de dónde provienen tus clientes
            </p>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => handleChange(value as TabKey)}
        >
          <TabsList>
            {canReports && (
              <TabsTrigger value="analisis">
                <ChartBar className="size-4" aria-hidden />
                <span>Análisis</span>
              </TabsTrigger>
            )}
            {canManage && (
              <TabsTrigger value="gestion">
                <GearSix className="size-4" aria-hidden />
                <span>Gestión de Orígenes</span>
              </TabsTrigger>
            )}
          </TabsList>

          {canReports && (
            <TabsContent value="analisis">
              <CustomerOriginReports embedded />
            </TabsContent>
          )}
          {canManage && (
            <TabsContent value="gestion">
              <CustomerOrigins embedded />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  )
}
