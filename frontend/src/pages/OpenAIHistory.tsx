import { useState } from 'react'
import {
  ClockCounterClockwise,
  MagnifyingGlass,
  DownloadSimple,
  Eye,
  Trash,
  FunnelSimple,
  CheckCircle,
  WarningCircle,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface HistoryEntry {
  id: number
  timestamp: string
  user: string
  model: string
  category: string
  prompt: string
  response: string
  tokens: number
  cost: number
  duration: number
  status: 'success' | 'error'
  errorMessage?: string
}

const columns = [
  'Timestamp',
  'Usuario',
  'Modelo',
  'Categoría',
  'Prompt',
  'Tokens',
  'Costo',
  'Duración',
  'Estado',
  '',
]

// Botón de acción de fila (mismo look que RowAction del prototipo, con onClick)
function ActionBtn({
  label,
  onClick,
  className,
  children,
}: {
  label: string
  onClick?: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

// Campo de solo lectura del detalle (label + valor)
function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  )
}

export default function OpenAIHistory() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterModel, setFilterModel] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterDate, setFilterDate] = useState('7d')
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null)

  const [history] = useState<HistoryEntry[]>([
    {
      id: 1,
      timestamp: '2025-10-13 14:35:22',
      user: 'admin@empresa.com',
      model: 'GPT-4 Turbo',
      category: 'Análisis',
      prompt: 'Analiza el sentimiento del siguiente mensaje: "Estoy muy contento con el servicio"',
      response: '{\n  "sentimiento": "positivo",\n  "confianza": 95,\n  "emocion": "alegría",\n  "urgencia": 2,\n  "razonamiento": "El mensaje expresa satisfacción clara con el servicio"\n}',
      tokens: 85,
      cost: 0.00255,
      duration: 1.2,
      status: 'success',
    },
    {
      id: 2,
      timestamp: '2025-10-13 14:30:15',
      user: 'agent1@empresa.com',
      model: 'GPT-3.5 Turbo',
      category: 'Generación',
      prompt: 'Genera una respuesta profesional para: "¿Cuándo recibiré mi pedido?"',
      response: 'Estimado/a cliente,\n\nGracias por contactarnos. Su pedido está siendo procesado y será enviado en las próximas 24-48 horas. Recibirá un email con el número de seguimiento una vez despachado.\n\nQuedamos a su disposición para cualquier consulta.\n\nSaludos cordiales',
      tokens: 120,
      cost: 0.00012,
      duration: 0.8,
      status: 'success',
    },
    {
      id: 3,
      timestamp: '2025-10-13 14:28:45',
      user: 'agent2@empresa.com',
      model: 'Gemini Pro',
      category: 'Clasificación',
      prompt: 'Clasifica la intención: "Necesito cancelar mi suscripción urgentemente"',
      response: '{\n  "categoria_principal": "Solicitud",\n  "categorias_secundarias": ["Urgente", "Cancelación"],\n  "confianza": 98,\n  "requiere_escalamiento": true\n}',
      tokens: 65,
      cost: 0.00003,
      duration: 0.9,
      status: 'success',
    },
    {
      id: 4,
      timestamp: '2025-10-13 14:25:10',
      user: 'admin@empresa.com',
      model: 'GPT-4 Turbo',
      category: 'Resumen',
      prompt: 'Resume la siguiente conversación de 50 mensajes...',
      response: '',
      tokens: 0,
      cost: 0,
      duration: 5.2,
      status: 'error',
      errorMessage: 'Timeout: Request took longer than 5 seconds',
    },
    {
      id: 5,
      timestamp: '2025-10-13 14:20:33',
      user: 'agent3@empresa.com',
      model: 'DeepSeek',
      category: 'Extracción',
      prompt: 'Extrae datos del mensaje: "Mi nombre es Juan Pérez, email juan@example.com, pedido #12345"',
      response: '{\n  "cliente": {\n    "nombre": "Juan Pérez",\n    "email": "juan@example.com"\n  },\n  "solicitud": {\n    "tipo": "consulta",\n    "descripcion": "pedido"\n  },\n  "referencias": {\n    "orden": "12345"\n  }\n}',
      tokens: 95,
      cost: 0.00013,
      duration: 1.1,
      status: 'success',
    },
    {
      id: 6,
      timestamp: '2025-10-13 14:15:18',
      user: 'agent1@empresa.com',
      model: 'GPT-3.5 Turbo',
      category: 'Traducción',
      prompt: 'Traduce de ES a EN: "Gracias por su compra"',
      response: 'Thank you for your purchase',
      tokens: 15,
      cost: 0.000015,
      duration: 0.4,
      status: 'success',
    },
    {
      id: 7,
      timestamp: '2025-10-13 14:10:55',
      user: 'admin@empresa.com',
      model: 'GPT-4 Turbo',
      category: 'Análisis',
      prompt: 'Analiza el sentimiento de 20 mensajes...',
      response: '[Análisis de 20 mensajes con sentimiento, urgencia y recomendaciones...]',
      tokens: 850,
      cost: 0.0255,
      duration: 3.5,
      status: 'success',
    },
    {
      id: 8,
      timestamp: '2025-10-13 14:05:42',
      user: 'agent2@empresa.com',
      model: 'Gemini Pro',
      category: 'Generación',
      prompt: 'Genera un email de bienvenida para nuevo cliente',
      response: '',
      tokens: 0,
      cost: 0,
      duration: 0.1,
      status: 'error',
      errorMessage: 'API Error: Invalid API key',
    },
  ])

  const filteredHistory = history.filter((entry) => {
    const matchesSearch =
      entry.prompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.category.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesModel = filterModel === 'all' || entry.model === filterModel
    const matchesStatus = filterStatus === 'all' || entry.status === filterStatus
    return matchesSearch && matchesModel && matchesStatus
  })

  const totalEntries = filteredHistory.length
  const totalTokens = filteredHistory.reduce((sum, entry) => sum + entry.tokens, 0)
  const totalCost = filteredHistory.reduce((sum, entry) => sum + entry.cost, 0)
  const successRate = (filteredHistory.filter((e) => e.status === 'success').length / totalEntries * 100).toFixed(1)

  const successCount = filteredHistory.filter((e) => e.status === 'success').length
  const errorCount = filteredHistory.filter((e) => e.status === 'error').length

  const handleViewDetail = (entry: HistoryEntry) => {
    setSelectedEntry(entry)
  }

  const handleExport = () => {
    console.log('Exportando historial...')
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ClockCounterClockwise className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Historial de IA
              </h1>
              <p className="text-sm text-muted-foreground">
                Registro completo de todas las interacciones con modelos de IA
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <DownloadSimple className="size-4" aria-hidden />
            Exportar CSV
          </Button>
        </div>

        {/* Estadísticas */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total Entries" value={String(totalEntries)} />
          <StatTile label="Total Tokens" value={totalTokens.toLocaleString()} />
          <StatTile label="Costo Total" value={`$${totalCost.toFixed(4)}`} />
          <StatTile label="Tasa de Éxito" value={`${successRate}%`} tone="success" />
        </div>

        {/* Filtros */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <MagnifyingGlass
                className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                placeholder="Buscar..."
                aria-label="Buscar en el historial"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>

            <Select value={filterModel} onValueChange={setFilterModel}>
              <SelectTrigger aria-label="Filtrar por modelo">
                <SelectValue placeholder="Todos los modelos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los modelos</SelectItem>
                <SelectItem value="GPT-4 Turbo">GPT-4 Turbo</SelectItem>
                <SelectItem value="GPT-3.5 Turbo">GPT-3.5 Turbo</SelectItem>
                <SelectItem value="Gemini Pro">Gemini Pro</SelectItem>
                <SelectItem value="DeepSeek">DeepSeek</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger aria-label="Filtrar por estado">
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="success">Exitosos</SelectItem>
                <SelectItem value="error">Con errores</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterDate} onValueChange={setFilterDate}>
              <SelectTrigger aria-label="Filtrar por fecha">
                <SelectValue placeholder="Últimos 7 días" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Últimas 24h</SelectItem>
                <SelectItem value="7d">Últimos 7 días</SelectItem>
                <SelectItem value="30d">Últimos 30 días</SelectItem>
                <SelectItem value="90d">Últimos 90 días</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              <FunnelSimple className="size-3.5" aria-hidden />
              {totalEntries} resultados
            </Badge>
            <Badge variant="success">{successCount} éxito</Badge>
            <Badge variant="destructive">{errorCount} error</Badge>
          </div>
        </div>

        {/* Tabla de Historial */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
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
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                      No se encontraron registros
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((entry) => (
                    <tr key={entry.id} className="transition-colors hover:bg-accent/40">
                      <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-muted-foreground">
                        {entry.timestamp}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                        {entry.user.split('@')[0]}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{entry.model}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="neutral">{entry.category}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <p className="max-w-[300px] truncate text-muted-foreground">
                          {entry.prompt}
                        </p>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {entry.tokens}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-muted-foreground">
                        ${entry.cost.toFixed(5)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                        {entry.duration}s
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={entry.status === 'success' ? 'success' : 'destructive'}>
                          {entry.status === 'success' ? (
                            <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                          ) : (
                            <WarningCircle className="size-3.5" weight="fill" aria-hidden />
                          )}
                          {entry.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <ActionBtn label="Ver detalle" onClick={() => handleViewDetail(entry)}>
                            <Eye className="size-[18px]" aria-hidden />
                          </ActionBtn>
                          <ActionBtn
                            label="Eliminar"
                            className="hover:bg-destructive/10 hover:text-destructive-text"
                          >
                            <Trash className="size-[18px]" aria-hidden />
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal de Detalle */}
      <Dialog
        open={selectedEntry !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null)
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalle de Interacción</DialogTitle>
          </DialogHeader>

          {selectedEntry && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Timestamp" value={selectedEntry.timestamp} />
                <DetailField label="Usuario" value={selectedEntry.user} />
                <DetailField label="Modelo" value={selectedEntry.model} />
                <DetailField label="Categoría" value={selectedEntry.category} />
              </div>

              <div className="border-t border-border" />

              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Prompt Enviado</h3>
                <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-4 font-mono text-sm text-foreground">
                  {selectedEntry.prompt}
                </pre>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Respuesta del Modelo</h3>
                {selectedEntry.status === 'success' ? (
                  <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-4 font-mono text-sm text-foreground">
                    {selectedEntry.response}
                  </pre>
                ) : (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
                    <p className="text-sm text-destructive-text">
                      Error: {selectedEntry.errorMessage}
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t border-border" />

              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Tokens Utilizados</p>
                  <p className="mt-1 text-base font-semibold tabular-nums text-foreground">
                    {selectedEntry.tokens}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Costo</p>
                  <p className="mt-1 text-base font-semibold tabular-nums text-foreground">
                    ${selectedEntry.cost.toFixed(5)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Duración</p>
                  <p className="mt-1 text-base font-semibold tabular-nums text-foreground">
                    {selectedEntry.duration}s
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
