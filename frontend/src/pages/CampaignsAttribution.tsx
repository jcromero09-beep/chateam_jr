import { useState, useEffect } from 'react'
// [Re-skin Tailwind v4] Sólo se conserva de MUI Joy el indicador de progreso
// (LinearProgress), que no tiene equivalente en el design system.
import { LinearProgress } from '@mui/joy'
import {
  Signpost,
  TrendUp,
  HandTap,
  Path,
  ArrowClockwise,
  DownloadSimple,
  EnvelopeSimple,
  WhatsappLogo,
  TelegramLogo,
  FacebookLogo,
  GoogleLogo,
  Megaphone,
  ShoppingCart,
  ArrowRight,
} from '@phosphor-icons/react'
import {
  Sankey as _Sankey,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  LineChart as _LineChart,
  Line as _Line,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import api from '../services/api'
import { toast } from 'react-toastify'

interface TouchPoint {
  id: number
  channel: string
  campaign: string
  timestamp: string
  action: string
  position: number
}

interface AttributionModel {
  model: string
  label: string
  description: string
}

interface ChannelAttribution {
  channel: string
  firstTouch: number
  lastTouch: number
  linear: number
  timeDecay: number
  positionBased: number
  datadriven: number
  conversions: number
  revenue: number
}

interface CustomerJourney {
  id: number
  customerId: string
  customerName: string
  touchPoints: TouchPoint[]
  converted: boolean
  revenue: number
  duration: number
}

interface AttributionMetrics {
  avgTouchpoints: number
  multiTouchPercentage: number
  avgConversionTimeHours: number
  totalConversions: number
  totalRevenue: number
}

const tableColumns = [
  'Canal',
  'First Touch',
  'Last Touch',
  'Linear',
  'Time Decay',
  'Position Based',
  'Data-Driven (IA)',
  'Revenue',
]

export default function CampaignsAttribution() {
  const [loading, setLoading] = useState(false)
  const [attributionModel, setAttributionModel] = useState('datadriven')
  const [period, setPeriod] = useState('30days')
  // Fixed datadriven property name throughout the file
  const [channelAttribution, setChannelAttribution] = useState<ChannelAttribution[]>([])
  const [customerJourneys, setCustomerJourneys] = useState<CustomerJourney[]>([])
  const [sankeyData, setSankeyData] = useState<any>(null)
  const [metrics, setMetrics] = useState<AttributionMetrics>({
    avgTouchpoints: 2.4,
    multiTouchPercentage: 35,
    avgConversionTimeHours: 48,
    totalConversions: 0,
    totalRevenue: 0
  })
  // Suppress unused warning for sankeyData
  void sankeyData

  const attributionModels: AttributionModel[] = [
    {
      model: 'firsttouch',
      label: 'First Touch',
      description: '100% del crédito al primer punto de contacto',
    },
    {
      model: 'lasttouch',
      label: 'Last Touch',
      description: '100% del crédito al último punto de contacto',
    },
    {
      model: 'linear',
      label: 'Linear',
      description: 'Crédito igual distribuido entre todos los touchpoints',
    },
    {
      model: 'timedecay',
      label: 'Time Decay',
      description: 'Más crédito a touchpoints más cercanos a la conversión',
    },
    {
      model: 'positionbased',
      label: 'Position Based (U-Shaped)',
      description: '40% primer y último touchpoint, 20% resto',
    },
    {
      model: 'datadriven',
      label: 'Data-Driven (IA)',
      description: 'Modelo basado en machine learning y datos históricos',
    },
  ]

  useEffect(() => {
    fetchAttributionData()
  }, [period, attributionModel])

  const fetchAttributionData = async () => {
    setLoading(true)
    try {
      // Map frontend model names to backend model names
      const modelMap: Record<string, string> = {
        'firsttouch': 'first_touch',
        'lasttouch': 'last_touch',
        'linear': 'linear',
        'timedecay': 'time_decay',
        'positionbased': 'position_based',
        'datadriven': 'data_driven'
      }

      const backendModel = modelMap[attributionModel] || 'time_decay'

      const response = await api.get('/attribution/dashboard', {
        params: {
          period,
          model: backendModel
        }
      })

      if (response.data) {
        // Update state with real data
        if (response.data.channels && response.data.channels.length > 0) {
          setChannelAttribution(response.data.channels)
        } else {
          // Use mock data as fallback if no real data
          setChannelAttribution(mockChannelAttribution)
        }

        if (response.data.journeys && response.data.journeys.length > 0) {
          setCustomerJourneys(response.data.journeys)
        } else {
          setCustomerJourneys(mockCustomerJourneys)
        }

        if (response.data.metrics) {
          setMetrics(response.data.metrics)
        }

        setSankeyData(mockSankeyData)
      }
    } catch (error: any) {
      console.error('Error fetching attribution data:', error)
      // Use mock data on error
      setChannelAttribution(mockChannelAttribution)
      setCustomerJourneys(mockCustomerJourneys)
      setSankeyData(mockSankeyData)

      if (error.response?.status !== 401) {
        toast.error('Error al cargar datos de atribución. Mostrando datos de ejemplo.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Mock data
  const mockChannelAttribution: ChannelAttribution[] = [
    {
      channel: 'WhatsApp',
      firstTouch: 45,
      lastTouch: 78,
      linear: 62,
      timeDecay: 68,
      positionBased: 65,
      datadriven: 72,
      conversions: 289,
      revenue: 86700,
    },
    {
      channel: 'Email',
      firstTouch: 120,
      lastTouch: 32,
      linear: 68,
      timeDecay: 45,
      positionBased: 58,
      datadriven: 52,
      conversions: 156,
      revenue: 31200,
    },
    {
      channel: 'Telegram',
      firstTouch: 28,
      lastTouch: 56,
      linear: 42,
      timeDecay: 48,
      positionBased: 45,
      datadriven: 58,
      conversions: 184,
      revenue: 55200,
    },
    {
      channel: 'Facebook',
      firstTouch: 85,
      lastTouch: 45,
      linear: 58,
      timeDecay: 52,
      positionBased: 62,
      datadriven: 68,
      conversions: 217,
      revenue: 65100,
    },
    {
      channel: 'Google Ads',
      firstTouch: 142,
      lastTouch: 89,
      linear: 105,
      timeDecay: 98,
      positionBased: 112,
      datadriven: 124,
      conversions: 356,
      revenue: 142400,
    },
    {
      channel: 'Organic Search',
      firstTouch: 98,
      lastTouch: 42,
      linear: 65,
      timeDecay: 55,
      positionBased: 68,
      datadriven: 62,
      conversions: 198,
      revenue: 39600,
    },
  ]

  const mockCustomerJourneys: CustomerJourney[] = [
    {
      id: 1,
      customerId: 'C001',
      customerName: 'María González',
      touchPoints: [
        { id: 1, channel: 'email', campaign: 'Newsletter', timestamp: '2025-01-01T10:00:00', action: 'opened', position: 1 },
        { id: 2, channel: 'facebook', campaign: 'Retargeting', timestamp: '2025-01-02T15:30:00', action: 'clicked', position: 2 },
        { id: 3, channel: 'whatsapp', campaign: 'Follow-up', timestamp: '2025-01-03T09:15:00', action: 'replied', position: 3 },
        { id: 4, channel: 'whatsapp', campaign: 'Offer', timestamp: '2025-01-03T18:45:00', action: 'converted', position: 4 },
      ],
      converted: true,
      revenue: 450,
      duration: 2.5,
    },
    {
      id: 2,
      customerId: 'C002',
      customerName: 'Carlos Martínez',
      touchPoints: [
        { id: 5, channel: 'google', campaign: 'Search Ads', timestamp: '2025-01-05T11:20:00', action: 'clicked', position: 1 },
        { id: 6, channel: 'email', campaign: 'Welcome', timestamp: '2025-01-05T12:00:00', action: 'opened', position: 2 },
        { id: 7, channel: 'email', campaign: 'Promotion', timestamp: '2025-01-06T10:30:00', action: 'clicked', position: 3 },
        { id: 8, channel: 'telegram', campaign: 'Support', timestamp: '2025-01-07T14:15:00', action: 'converted', position: 4 },
      ],
      converted: true,
      revenue: 780,
      duration: 2.1,
    },
    {
      id: 3,
      customerId: 'C003',
      customerName: 'Ana López',
      touchPoints: [
        { id: 9, channel: 'facebook', campaign: 'Brand Awareness', timestamp: '2025-01-08T09:00:00', action: 'viewed', position: 1 },
        { id: 10, channel: 'whatsapp', campaign: 'Initial Contact', timestamp: '2025-01-08T16:30:00', action: 'replied', position: 2 },
        { id: 11, channel: 'whatsapp', campaign: 'Quote', timestamp: '2025-01-09T11:00:00', action: 'converted', position: 3 },
      ],
      converted: true,
      revenue: 1200,
      duration: 1.1,
    },
    {
      id: 4,
      customerId: 'C004',
      customerName: 'Pedro Sánchez',
      touchPoints: [
        { id: 12, channel: 'organic', campaign: 'Blog Post', timestamp: '2025-01-10T08:45:00', action: 'viewed', position: 1 },
        { id: 13, channel: 'email', campaign: 'Lead Magnet', timestamp: '2025-01-10T09:30:00', action: 'opened', position: 2 },
        { id: 14, channel: 'telegram', campaign: 'Demo Invite', timestamp: '2025-01-11T14:00:00', action: 'clicked', position: 3 },
        { id: 15, channel: 'telegram', campaign: 'Proposal', timestamp: '2025-01-12T10:15:00', action: 'replied', position: 4 },
        { id: 16, channel: 'email', campaign: 'Contract', timestamp: '2025-01-13T16:30:00', action: 'converted', position: 5 },
      ],
      converted: true,
      revenue: 2500,
      duration: 3.3,
    },
  ]

  const mockSankeyData = {
    nodes: [
      { name: 'Email' },
      { name: 'WhatsApp' },
      { name: 'Facebook' },
      { name: 'Telegram' },
      { name: 'Google' },
      { name: 'Conversión' },
    ],
    links: [
      { source: 0, target: 5, value: 120 },
      { source: 1, target: 5, value: 289 },
      { source: 2, target: 5, value: 217 },
      { source: 3, target: 5, value: 184 },
      { source: 4, target: 5, value: 356 },
    ],
  }

  const getChannelIcon = (channel: string) => {
    switch (channel.toLowerCase()) {
      case 'whatsapp':
        return <WhatsappLogo className="size-[18px] shrink-0 text-wa" weight="fill" aria-hidden />
      case 'email':
        return <EnvelopeSimple className="size-[18px] shrink-0 text-[#0078d4]" weight="fill" aria-hidden />
      case 'telegram':
        return <TelegramLogo className="size-[18px] shrink-0 text-[#0088cc]" weight="fill" aria-hidden />
      case 'facebook':
        return <FacebookLogo className="size-[18px] shrink-0 text-[#1877f2]" weight="fill" aria-hidden />
      case 'google':
        return <GoogleLogo className="size-[18px] shrink-0 text-[#4285f4]" weight="bold" aria-hidden />
      case 'organic':
        return <TrendUp className="size-[18px] shrink-0 text-success-text" weight="bold" aria-hidden />
      default:
        return <Megaphone className="size-[18px] shrink-0 text-muted-foreground" weight="fill" aria-hidden />
    }
  }

  const getAttributionValue = (channel: ChannelAttribution) => {
    switch (attributionModel) {
      case 'firsttouch':
        return channel.firstTouch
      case 'lasttouch':
        return channel.lastTouch
      case 'linear':
        return channel.linear
      case 'timedecay':
        return channel.timeDecay
      case 'positionbased':
        return channel.positionBased
      case 'datadriven':
        return channel.datadriven
      default:
        return channel.datadriven
    }
  }

  const totalConversions = channelAttribution.reduce((acc, ch) => acc + getAttributionValue(ch), 0)

  // Formato de porcentaje con guarda de división por cero (antes renderizaba "NaN%")
  const pct = (value: number) =>
    totalConversions > 0 ? `${((value / totalConversions) * 100).toFixed(1)}%` : '—'

  const exportData = () => {
    try {
      if (channelAttribution.length === 0) {
        toast.info('No hay datos de atribución para exportar')
        return
      }

      const headers = [
        'Canal', 'First Touch', 'Last Touch', 'Linear',
        'Time Decay', 'Position Based', 'Data Driven',
        'Conversiones', 'Revenue'
      ]

      const rows = channelAttribution.map((ch) => [
        ch.channel,
        ch.firstTouch,
        ch.lastTouch,
        ch.linear,
        ch.timeDecay,
        ch.positionBased,
        ch.datadriven,
        ch.conversions,
        ch.revenue
      ])

      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.join(','))
      ].join('\n')

      const BOM = '\uFEFF'
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `atribucion-${attributionModel}-${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      toast.success('Datos de atribución exportados')
    } catch (error) {
      console.error('Error exporting attribution data:', error)
      toast.error('Error al exportar datos')
    }
  }

  const activeModelLabel = attributionModels.find((m) => m.model === attributionModel)?.label

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <Signpost className="size-6" weight="fill" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Atribución de Marketing
                </h1>
                <p className="text-sm text-muted-foreground">
                  Análisis multi-touch del recorrido del cliente
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="h-10 w-[180px]" aria-label="Periodo">
                  <SelectValue placeholder="Periodo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7days">Últimos 7 días</SelectItem>
                  <SelectItem value="30days">Últimos 30 días</SelectItem>
                  <SelectItem value="90days">Últimos 90 días</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>

              <Tooltip title="Actualizar datos">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Actualizar datos"
                  onClick={fetchAttributionData}
                >
                  <ArrowClockwise className="size-5" aria-hidden />
                </Button>
              </Tooltip>

              <Tooltip title="Exportar reporte">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Exportar reporte"
                  onClick={exportData}
                >
                  <DownloadSimple className="size-5" aria-hidden />
                </Button>
              </Tooltip>
            </div>
          </div>

          {loading && <LinearProgress />}

          {/* Attribution Models */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <h2 className="text-base font-semibold text-foreground">Modelo de Atribución</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Selecciona cómo quieres atribuir el crédito de conversión entre los diferentes touchpoints
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {attributionModels.map((model) => {
                const selected = attributionModel === model.model
                return (
                  <button
                    key={model.model}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setAttributionModel(model.model)}
                    className={cn(
                      'appearance-none [font-family:inherit] cursor-pointer rounded-lg border p-4 text-left outline-none transition-colors',
                      'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent/40',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {model.model === 'datadriven' && (
                        <HandTap className="size-[18px] shrink-0" weight="fill" aria-hidden />
                      )}
                      <span className="text-sm font-semibold">{model.label}</span>
                    </span>
                    <span
                      className={cn(
                        'mt-1.5 block text-xs',
                        selected ? 'text-primary-foreground/80' : 'text-muted-foreground',
                      )}
                    >
                      {model.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Channel Attribution Chart */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">Atribución por Canal</h2>
              <Badge variant="primary">
                <HandTap className="size-4" aria-hidden />
                {activeModelLabel}
              </Badge>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={channelAttribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="channel" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <RechartsTooltip
                  formatter={((value: number) => [`${value} conversiones`, 'Conversiones Atribuidas']) as any}
                />
                <Legend />
                <Bar
                  dataKey={(data) => getAttributionValue(data)}
                  fill="#3b82f6"
                  name="Conversiones Atribuidas"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </section>

          {/* Attribution Table */}
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">
                Comparación de Modelos de Atribución
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {tableColumns.map((c) => (
                      <th
                        key={c}
                        className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {channelAttribution.length === 0 ? (
                    <tr>
                      <td
                        colSpan={tableColumns.length}
                        className="px-4 py-10 text-center text-muted-foreground"
                      >
                        {loading ? 'Cargando atribución...' : 'No hay datos de atribución'}
                      </td>
                    </tr>
                  ) : (
                    channelAttribution.map((channel, index) => (
                      <tr key={index} className="transition-colors hover:bg-accent/40">
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-2">
                            {getChannelIcon(channel.channel)}
                            <span className="font-medium text-foreground">{channel.channel}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="block font-semibold tabular-nums text-foreground">
                            {channel.firstTouch}
                          </span>
                          <span className="block text-xs tabular-nums text-muted-foreground">
                            {pct(channel.firstTouch)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="block font-semibold tabular-nums text-foreground">
                            {channel.lastTouch}
                          </span>
                          <span className="block text-xs tabular-nums text-muted-foreground">
                            {pct(channel.lastTouch)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="block font-semibold tabular-nums text-foreground">
                            {channel.linear}
                          </span>
                          <span className="block text-xs tabular-nums text-muted-foreground">
                            {pct(channel.linear)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="block font-semibold tabular-nums text-foreground">
                            {channel.timeDecay}
                          </span>
                          <span className="block text-xs tabular-nums text-muted-foreground">
                            {pct(channel.timeDecay)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="block font-semibold tabular-nums text-foreground">
                            {channel.positionBased}
                          </span>
                          <span className="block text-xs tabular-nums text-muted-foreground">
                            {pct(channel.positionBased)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="block font-semibold tabular-nums text-primary">
                            {channel.datadriven}
                          </span>
                          <span className="block text-xs tabular-nums text-muted-foreground">
                            {pct(channel.datadriven)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-foreground">
                          ${(channel.revenue / 1000).toFixed(1)}K
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Customer Journeys */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <h2 className="text-base font-semibold text-foreground">
              Recorridos de Cliente Exitosos
            </h2>

            <div className="mt-4 space-y-4">
              {customerJourneys.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {loading ? 'Cargando recorridos...' : 'No hay recorridos para este periodo'}
                </p>
              ) : (
                customerJourneys.map((journey) => (
                  <article
                    key={journey.id}
                    className="rounded-lg border border-border bg-card p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">
                          {journey.customerName}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          ID: {journey.customerId} • Duración: {journey.duration} días
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="success">
                          <ShoppingCart className="size-3.5" weight="fill" aria-hidden />
                          ${journey.revenue}
                        </Badge>
                        <Badge variant="primary">
                          {journey.touchPoints.length} touchpoints
                        </Badge>
                      </div>
                    </div>

                    <div className="my-4 border-t border-border" />

                    <ol className="flex items-stretch gap-2 overflow-x-auto pb-1">
                      {journey.touchPoints.map((touchPoint, index) => {
                        const isLast = index === journey.touchPoints.length - 1
                        return (
                          <li key={touchPoint.id} className="flex shrink-0 items-center gap-2">
                            <div
                              className={cn(
                                'w-[180px] rounded-lg border p-3',
                                isLast
                                  ? 'border-success/40 bg-success/10'
                                  : 'border-border bg-muted/40',
                              )}
                            >
                              <div className="flex items-center gap-1.5">
                                {getChannelIcon(touchPoint.channel)}
                                <span className="text-xs font-semibold text-muted-foreground">
                                  Paso {touchPoint.position}
                                </span>
                              </div>
                              <p className="mt-1.5 text-sm font-semibold text-foreground">
                                {touchPoint.channel.charAt(0).toUpperCase() + touchPoint.channel.slice(1)}
                              </p>
                              <p className="mb-2 text-xs text-muted-foreground">
                                {touchPoint.campaign}
                              </p>
                              <Badge
                                variant={touchPoint.action === 'converted' ? 'success' : 'neutral'}
                              >
                                {touchPoint.action}
                              </Badge>
                            </div>
                            {!isLast && (
                              <ArrowRight
                                className="size-4 shrink-0 text-muted-foreground"
                                aria-hidden
                              />
                            )}
                          </li>
                        )
                      })}
                    </ol>
                  </article>
                ))
              )}
            </div>
          </section>

          {/* Insights */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                  <Path className="size-6" weight="fill" aria-hidden />
                </span>
                <div>
                  <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                    {metrics.avgTouchpoints.toFixed(1)}
                  </p>
                  <p className="text-sm text-muted-foreground">Touchpoints Promedio</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Los clientes interactúan en promedio con {metrics.avgTouchpoints.toFixed(1)} canales antes de convertir
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-success/14 text-success-text">
                  <HandTap className="size-6" weight="fill" aria-hidden />
                </span>
                <div>
                  <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                    {metrics.multiTouchPercentage.toFixed(0)}%
                  </p>
                  <p className="text-sm text-muted-foreground">Conversiones Multi-Touch</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {metrics.multiTouchPercentage.toFixed(0)}% de conversiones involucran múltiples puntos de contacto
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-warning/16 text-warning-text">
                  <TrendUp className="size-6" weight="bold" aria-hidden />
                </span>
                <div>
                  <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                    {(metrics.avgConversionTimeHours / 24).toFixed(1)} días
                  </p>
                  <p className="text-sm text-muted-foreground">Tiempo Promedio de Conversión</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                El ciclo promedio desde el primer touchpoint hasta la conversión
              </p>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
