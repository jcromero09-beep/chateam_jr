import { useState } from 'react'
import {
  Article as LogIcon,
  MagnifyingGlass,
  DownloadSimple,
  ArrowClockwise,
  CheckCircle,
  XCircle,
  Warning,
  Info,
  Funnel,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface IntegrationLog {
  id: number
  timestamp: string
  integration: 'Billie' | 'Aria Lite' | 'SmartTrack' | 'SGR' | 'Custom' | 'All'
  type: 'sync' | 'error' | 'warning' | 'info'
  message: string
  records: number
  duration: number
  details?: string
}

export default function IntegrationsLogs() {
  const [filterIntegration, setFilterIntegration] = useState<string>('All')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterDate, setFilterDate] = useState<string>('today')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const stats = {
    totalEvents: 15234,
    successRate: 99.2,
    avgDuration: 156,
    errors24h: 23,
  }

  const logs: IntegrationLog[] = [
    {
      id: 1,
      timestamp: '2025-10-13 10:45:23',
      integration: 'Billie',
      type: 'sync',
      message: 'Sincronización de contactos completada exitosamente',
      records: 245,
      duration: 18,
      details: 'Sincronizados 245 contactos, 0 errores',
    },
    {
      id: 2,
      timestamp: '2025-10-13 10:40:12',
      integration: 'Aria Lite',
      type: 'sync',
      message: 'Sincronización bidireccional de leads completada',
      records: 87,
      duration: 12,
      details: 'Creados 45 leads, actualizados 42',
    },
    {
      id: 3,
      timestamp: '2025-10-13 10:35:45',
      integration: 'SmartTrack',
      type: 'warning',
      message: 'Sincronización con retrasos - alto volumen de datos',
      records: 456,
      duration: 67,
      details: 'Procesamiento más lento de lo habitual',
    },
    {
      id: 4,
      timestamp: '2025-10-13 10:35:18',
      integration: 'SGR',
      type: 'sync',
      message: 'Reclamos actualizados - 34 casos cerrados',
      records: 34,
      duration: 12,
      details: '34 casos cerrados, 12 en proceso',
    },
    {
      id: 5,
      timestamp: '2025-10-13 10:30:45',
      integration: 'Billie',
      type: 'sync',
      message: 'Sincronización de facturas completada',
      records: 89,
      duration: 24,
      details: 'Procesadas 89 facturas',
    },
    {
      id: 6,
      timestamp: '2025-10-13 10:25:33',
      integration: 'SmartTrack',
      type: 'sync',
      message: 'Actualización de envíos en tránsito',
      records: 156,
      duration: 34,
      details: '156 envíos actualizados',
    },
    {
      id: 7,
      timestamp: '2025-10-13 10:20:12',
      integration: 'Aria Lite',
      type: 'sync',
      message: 'Sincronización de oportunidades',
      records: 44,
      duration: 15,
      details: '44 oportunidades sincronizadas',
    },
    {
      id: 8,
      timestamp: '2025-10-13 10:15:47',
      integration: 'Billie',
      type: 'sync',
      message: 'Sincronización de productos completada',
      records: 156,
      duration: 12,
      details: 'Actualizados 156 productos',
    },
    {
      id: 9,
      timestamp: '2025-10-13 10:10:23',
      integration: 'SGR',
      type: 'info',
      message: 'Verificación de estado de reclamos',
      records: 0,
      duration: 3,
      details: 'Verificación de rutina completada',
    },
    {
      id: 10,
      timestamp: '2025-10-13 10:05:15',
      integration: 'SmartTrack',
      type: 'warning',
      message: 'Tiempo de respuesta de API elevado',
      records: 234,
      duration: 45,
      details: 'API respondiendo lentamente',
    },
    {
      id: 11,
      timestamp: '2025-10-13 10:00:12',
      integration: 'Billie',
      type: 'warning',
      message: 'Algunos registros no se pudieron sincronizar',
      records: 67,
      duration: 32,
      details: '5 registros con errores de validación',
    },
    {
      id: 12,
      timestamp: '2025-10-13 09:55:47',
      integration: 'Aria Lite',
      type: 'sync',
      message: 'Sincronización de clientes completada',
      records: 123,
      duration: 18,
      details: '123 clientes actualizados',
    },
    {
      id: 13,
      timestamp: '2025-10-13 09:50:33',
      integration: 'SGR',
      type: 'sync',
      message: 'Nuevos reclamos sincronizados',
      records: 8,
      duration: 6,
      details: '8 nuevos reclamos recibidos',
    },
    {
      id: 14,
      timestamp: '2025-10-13 09:45:33',
      integration: 'Billie',
      type: 'error',
      message: 'Error de autenticación - Token expirado',
      records: 0,
      duration: 0,
      details: 'Se requiere renovar el token de API',
    },
    {
      id: 15,
      timestamp: '2025-10-13 09:40:18',
      integration: 'SmartTrack',
      type: 'sync',
      message: 'Sincronización de rutas completada',
      records: 89,
      duration: 21,
      details: '89 rutas actualizadas',
    },
    {
      id: 16,
      timestamp: '2025-10-13 09:35:45',
      integration: 'Aria Lite',
      type: 'sync',
      message: 'Actualización de pipeline de ventas',
      records: 67,
      duration: 14,
      details: '67 oportunidades en pipeline',
    },
    {
      id: 17,
      timestamp: '2025-10-13 09:30:12',
      integration: 'Custom',
      type: 'error',
      message: 'Fallo en conexión con API externa',
      records: 0,
      duration: 0,
      details: 'Error de red - timeout',
    },
    {
      id: 18,
      timestamp: '2025-10-13 09:25:33',
      integration: 'Billie',
      type: 'sync',
      message: 'Sincronización de órdenes de compra',
      records: 45,
      duration: 16,
      details: '45 órdenes procesadas',
    },
    {
      id: 19,
      timestamp: '2025-10-13 09:20:47',
      integration: 'SGR',
      type: 'info',
      message: 'Backup de datos completado',
      records: 0,
      duration: 8,
      details: 'Backup automático ejecutado',
    },
    {
      id: 20,
      timestamp: '2025-10-13 09:15:22',
      integration: 'Custom',
      type: 'error',
      message: 'Error de autenticación - Token expirado',
      records: 0,
      duration: 0,
      details: 'Credenciales inválidas',
    },
  ]

  const activityByHour = [
    { hour: '00:00', events: 45 },
    { hour: '01:00', events: 23 },
    { hour: '02:00', events: 12 },
    { hour: '03:00', events: 8 },
    { hour: '04:00', events: 15 },
    { hour: '05:00', events: 34 },
    { hour: '06:00', events: 67 },
    { hour: '07:00', events: 123 },
    { hour: '08:00', events: 234 },
    { hour: '09:00', events: 456 },
    { hour: '10:00', events: 678 },
    { hour: '11:00', events: 543 },
  ]

  const getTypeVariant = (type: string): BadgeProps['variant'] => {
    switch (type) {
      case 'sync':
        return 'success'
      case 'error':
        return 'destructive'
      case 'warning':
        return 'warning'
      case 'info':
        return 'primary'
      default:
        return 'neutral'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'sync':
        return <CheckCircle className="size-3.5" weight="fill" aria-hidden />
      case 'error':
        return <XCircle className="size-3.5" weight="fill" aria-hidden />
      case 'warning':
        return <Warning className="size-3.5" weight="fill" aria-hidden />
      case 'info':
        return <Info className="size-3.5" weight="fill" aria-hidden />
      default:
        return null
    }
  }

  const filteredLogs = logs.filter(log => {
    if (filterIntegration !== 'All' && log.integration !== filterIntegration) return false
    if (filterType !== 'all' && log.type !== filterType) return false
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage)

  const handleExportCSV = () => {
    console.log('Exportando logs a CSV...')
  }

  const handleRefresh = () => {
    console.log('Actualizando logs...')
  }

  const maxActivity = Math.max(...activityByHour.map(a => a.events))

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <LogIcon className="size-6" weight="fill" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Logs de Integraciones
                </h1>
                <p className="text-sm text-muted-foreground">
                  Registro centralizado de todas las operaciones de integración
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <DownloadSimple className="size-4" aria-hidden />
                Exportar CSV
              </Button>
              <Button size="sm" onClick={handleRefresh}>
                <ArrowClockwise className="size-4" aria-hidden />
                Actualizar
              </Button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <p className="text-sm text-muted-foreground">Total Eventos</p>
              <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                {stats.totalEvents.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Últimos 30 días</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <p className="text-sm text-muted-foreground">Tasa de Éxito</p>
              <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-success-text">
                {stats.successRate}%
              </p>
              <p className="mt-1 text-xs text-success-text">+0.3% vs semana pasada</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <p className="text-sm text-muted-foreground">Duración Promedio</p>
              <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                {stats.avgDuration}ms
              </p>
              <p className="mt-1 text-xs text-success-text">-12ms vs semana pasada</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <p className="text-sm text-muted-foreground">Errores 24h</p>
              <p
                className={cn(
                  'mt-1.5 text-3xl font-semibold tracking-tight tabular-nums',
                  stats.errors24h > 20 ? 'text-destructive-text' : 'text-warning-text'
                )}
              >
                {stats.errors24h}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">0.8% del total</p>
            </div>
          </div>

          {/* Gráfico de Actividad */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <h2 className="mb-4 text-base font-semibold text-foreground">
              Actividad por Hora (Últimas 12 horas)
            </h2>
            <div className="flex h-[200px] items-end gap-1">
              {activityByHour.map((item, idx) => (
                <Tooltip key={idx} title={`${item.hour}: ${item.events} eventos`}>
                  <div className="flex flex-1 cursor-pointer flex-col items-center justify-end">
                    <div
                      className="w-full rounded-sm bg-primary transition-all hover:bg-primary-hover hover:scale-y-[1.05]"
                      style={{ height: `${(item.events / maxActivity) * 100}%` }}
                    />
                    <span className="mt-1 text-xs text-muted-foreground">
                      {item.hour.split(':')[0]}h
                    </span>
                  </div>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* Filtros */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="filter-integration">Integración</Label>
                <Select value={filterIntegration} onValueChange={setFilterIntegration}>
                  <SelectTrigger id="filter-integration">
                    <Funnel className="size-4 shrink-0 opacity-60" aria-hidden />
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">Todas</SelectItem>
                    <SelectItem value="Billie">Billie</SelectItem>
                    <SelectItem value="Aria Lite">Aria Lite</SelectItem>
                    <SelectItem value="SmartTrack">SmartTrack</SelectItem>
                    <SelectItem value="SGR">SGR</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filter-type">Tipo de Evento</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger id="filter-type">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="sync">Sync</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filter-date">Período</Label>
                <Select value={filterDate} onValueChange={setFilterDate}>
                  <SelectTrigger id="filter-date">
                    <SelectValue placeholder="Hoy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Hoy</SelectItem>
                    <SelectItem value="yesterday">Ayer</SelectItem>
                    <SelectItem value="week">Última semana</SelectItem>
                    <SelectItem value="month">Último mes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filter-search">Buscar</Label>
                <div className="relative">
                  <MagnifyingGlass
                    className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <input
                    id="filter-search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar en mensajes..."
                    className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Tabla de Logs */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-foreground">
                Registro de Eventos ({filteredLogs.length})
              </h2>
              <span className="text-sm text-muted-foreground">
                Página {currentPage} de {totalPages}
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-border">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      <th className="w-[140px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Timestamp
                      </th>
                      <th className="w-[120px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Integración
                      </th>
                      <th className="w-[100px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Tipo
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Mensaje
                      </th>
                      <th className="w-[80px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Registros
                      </th>
                      <th className="w-[80px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Duración
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                          No se encontraron logs con los filtros seleccionados
                        </td>
                      </tr>
                    ) : (
                      paginatedLogs.map((log) => (
                        <tr key={log.id} className="transition-colors hover:bg-accent/40">
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {log.timestamp}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{log.integration}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={getTypeVariant(log.type)}>
                              {getTypeIcon(log.type)}
                              {log.type}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-foreground">{log.message}</p>
                            {log.details && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{log.details}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold tabular-nums text-foreground">
                            {log.records > 0 ? log.records : '-'}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-muted-foreground">
                            {log.duration > 0 ? `${log.duration}s` : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                >
                  Anterior
                </Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const pageNum = currentPage <= 3 ? i + 1 : currentPage - 2 + i
                  if (pageNum > totalPages) return null
                  return (
                    <Button
                      key={pageNum}
                      size="sm"
                      variant={currentPage === pageNum ? 'primary' : 'outline'}
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  )
                })}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                >
                  Siguiente
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
