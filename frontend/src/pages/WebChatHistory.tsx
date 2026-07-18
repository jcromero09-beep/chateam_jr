import { useState } from 'react'
import {
  ClockCounterClockwise,
  MagnifyingGlass,
  FunnelSimple,
  DownloadSimple,
  Eye,
  Trash,
  CheckCircle,
  Clock,
  ChatCircle,
  Star,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
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

interface HistoricalConversation {
  id: number
  contactName: string
  contactEmail: string
  contactAvatar?: string
  agent: string
  startTime: string
  endTime: string
  duration: number
  messagesCount: number
  status: 'resolved' | 'abandoned' | 'transferred'
  satisfaction?: number
  tags: string[]
  notes: string
  messages: Array<{
    text: string
    sender: 'user' | 'agent'
    timestamp: string
  }>
}

const columns = [
  'Contacto',
  'Agente',
  'Fecha/Hora Inicio',
  'Duración',
  'Mensajes',
  'Estado',
  'Satisfacción',
  'Etiquetas',
  '',
]

export default function WebChatHistory() {
  const [conversations, setConversations] = useState<HistoricalConversation[]>([
    {
      id: 1,
      contactName: 'María González',
      contactEmail: 'maria@example.com',
      agent: 'Juan Pérez',
      startTime: '2025-01-13T14:25:00Z',
      endTime: '2025-01-13T14:45:00Z',
      duration: 20,
      messagesCount: 15,
      status: 'resolved',
      satisfaction: 5,
      tags: ['urgente', 'pedido'],
      notes: 'Cliente consultó sobre estado de pedido #12345. Problema resuelto satisfactoriamente.',
      messages: [
        {
          text: 'Hola, necesito ayuda con mi pedido',
          sender: 'user',
          timestamp: '2025-01-13T14:25:00Z',
        },
        {
          text: 'Por supuesto, ¿cuál es tu número de pedido?',
          sender: 'agent',
          timestamp: '2025-01-13T14:26:00Z',
        },
        {
          text: 'Es el #12345',
          sender: 'user',
          timestamp: '2025-01-13T14:27:00Z',
        },
      ],
    },
    {
      id: 2,
      contactName: 'Carlos Rodríguez',
      contactEmail: 'carlos@example.com',
      agent: 'Ana López',
      startTime: '2025-01-13T13:00:00Z',
      endTime: '2025-01-13T13:15:00Z',
      duration: 15,
      messagesCount: 8,
      status: 'resolved',
      satisfaction: 4,
      tags: ['consulta', 'precios'],
      notes: 'Cliente solicitó información sobre planes y precios.',
      messages: [
        {
          text: 'Tengo una consulta sobre los precios',
          sender: 'user',
          timestamp: '2025-01-13T13:00:00Z',
        },
      ],
    },
    {
      id: 3,
      contactName: 'Pedro Sánchez',
      contactEmail: 'pedro@example.com',
      agent: 'Carlos Gómez',
      startTime: '2025-01-13T11:30:00Z',
      endTime: '2025-01-13T11:32:00Z',
      duration: 2,
      messagesCount: 2,
      status: 'abandoned',
      tags: ['abandonado'],
      notes: 'Usuario abandonó la conversación sin responder.',
      messages: [],
    },
    {
      id: 4,
      contactName: 'Laura Fernández',
      contactEmail: 'laura@example.com',
      agent: 'Juan Pérez',
      startTime: '2025-01-13T10:00:00Z',
      endTime: '2025-01-13T10:25:00Z',
      duration: 25,
      messagesCount: 18,
      status: 'transferred',
      satisfaction: 4,
      tags: ['técnico', 'transferido'],
      notes: 'Caso técnico transferido al departamento de soporte.',
      messages: [],
    },
  ])

  const [selectedConversation, setSelectedConversation] = useState<HistoricalConversation | null>(
    null
  )
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterAgent, setFilterAgent] = useState('all')
  const [dateRange, setDateRange] = useState('7d')

  const getStatusVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'resolved':
        return 'success'
      case 'abandoned':
        return 'destructive'
      case 'transferred':
        return 'warning'
      default:
        return 'neutral'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'resolved':
        return 'Resuelta'
      case 'abandoned':
        return 'Abandonada'
      case 'transferred':
        return 'Transferida'
      default:
        return status
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'resolved':
        return <CheckCircle className="size-3.5" weight="fill" aria-hidden />
      case 'abandoned':
        return <Clock className="size-3.5" weight="fill" aria-hidden />
      case 'transferred':
        return <ChatCircle className="size-3.5" weight="fill" aria-hidden />
      default:
        return <ChatCircle className="size-3.5" weight="fill" aria-hidden />
    }
  }

  const filteredConversations = conversations
    .filter((c) => filterStatus === 'all' || c.status === filterStatus)
    .filter((c) => filterAgent === 'all' || c.agent === filterAgent)
    .filter((c) =>
      searchTerm
        ? c.contactName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.contactEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.notes.toLowerCase().includes(searchTerm.toLowerCase())
        : true
    )

  const formatDateTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }

  const renderSatisfactionStars = (rating?: number) => {
    if (!rating) return <span className="text-xs text-muted-foreground">Sin calificación</span>
    return (
      <span className="flex items-center gap-0.5" aria-label={`Satisfacción: ${rating} de 5`}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={
              star <= rating ? 'size-4 text-warning-text' : 'size-4 text-muted-foreground/40'
            }
            weight={star <= rating ? 'fill' : 'regular'}
            aria-hidden
          />
        ))}
      </span>
    )
  }

  const renderContactAvatar = (
    conversation: HistoricalConversation,
    size: 'sm' | 'lg',
    px: number
  ) =>
    conversation.contactAvatar ? (
      <img
        src={conversation.contactAvatar}
        alt=""
        width={px}
        height={px}
        className="shrink-0 rounded-full object-cover"
        style={{ width: px, height: px }}
      />
    ) : (
      <Avatar name={conversation.contactName} size={size} />
    )

  const stats = {
    total: conversations.length,
    resolved: conversations.filter((c) => c.status === 'resolved').length,
    abandoned: conversations.filter((c) => c.status === 'abandoned').length,
    avgDuration:
      conversations.reduce((acc, c) => acc + c.duration, 0) / conversations.length || 0,
    avgSatisfaction:
      conversations.filter((c) => c.satisfaction).reduce((acc, c) => acc + (c.satisfaction || 0), 0) /
        conversations.filter((c) => c.satisfaction).length || 0,
  }

  const agents = Array.from(new Set(conversations.map((c) => c.agent)))

  const handleExport = () => {
    // Lógica para exportar conversaciones
    alert('Exportando conversaciones filtradas...')
  }

  const handleDelete = (id: number) => {
    if (confirm('¿Estás seguro de eliminar esta conversación del historial?')) {
      setConversations(conversations.filter((c) => c.id !== id))
    }
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
                Historial de Conversaciones
              </h1>
              <p className="text-sm text-muted-foreground">
                Búsqueda y revisión de conversaciones pasadas
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <DownloadSimple className="size-4" aria-hidden />
            Exportar
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total Conversaciones" value={String(stats.total)} />
          <StatTile label="Resueltas" value={String(stats.resolved)} tone="success" />
          <StatTile label="Duración Promedio" value={`${stats.avgDuration.toFixed(1)}min`} />
          <StatTile label="Satisfacción Promedio" value={`${stats.avgSatisfaction.toFixed(1)}/5`} />
        </div>

        {/* Filters */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <div className="relative">
              <MagnifyingGlass
                className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                placeholder="Buscar..."
                aria-label="Buscar conversaciones"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>

            <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value)}>
              <SelectTrigger aria-label="Filtrar por estado">
                <span className="flex min-w-0 items-center gap-2">
                  <FunnelSimple className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="resolved">Resueltas</SelectItem>
                <SelectItem value="abandoned">Abandonadas</SelectItem>
                <SelectItem value="transferred">Transferidas</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterAgent} onValueChange={(value) => setFilterAgent(value)}>
              <SelectTrigger aria-label="Filtrar por agente">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los agentes</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent} value={agent}>
                    {agent}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={dateRange} onValueChange={(value) => setDateRange(value)}>
              <SelectTrigger aria-label="Filtrar por rango de fechas">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Últimos 7 días</SelectItem>
                <SelectItem value="30d">Últimos 30 días</SelectItem>
                <SelectItem value="90d">Últimos 90 días</SelectItem>
                <SelectItem value="all">Todo el tiempo</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4 xl:col-span-1">
              <Button variant="outline" size="sm" className="h-9 flex-1">
                Limpiar Filtros
              </Button>
              <Button size="sm" className="h-9 flex-1">
                Aplicar
              </Button>
            </div>
          </div>
        </div>

        {/* Conversations Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
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
                {filteredConversations.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      No hay conversaciones que coincidan con los filtros
                    </td>
                  </tr>
                ) : (
                  filteredConversations.map((conversation) => (
                    <tr key={conversation.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {renderContactAvatar(conversation, 'sm', 32)}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {conversation.contactName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {conversation.contactEmail}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {conversation.agent}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatDateTime(conversation.startTime)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                        {conversation.duration} min
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {conversation.messagesCount}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={getStatusVariant(conversation.status)}>
                          {getStatusIcon(conversation.status)}
                          {getStatusLabel(conversation.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{renderSatisfactionStars(conversation.satisfaction)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          {conversation.tags.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                          {conversation.tags.length > 2 && (
                            <Badge variant="outline">+{conversation.tags.length - 2}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Ver conversación de ${conversation.contactName}`}
                            title="Ver"
                            className="size-8 text-primary hover:bg-primary/10 hover:text-primary"
                            onClick={() => setSelectedConversation(conversation)}
                          >
                            <Eye className="size-[18px]" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Eliminar conversación de ${conversation.contactName}`}
                            title="Eliminar"
                            className="size-8 hover:bg-destructive/10 hover:text-destructive-text"
                            onClick={() => handleDelete(conversation.id)}
                          >
                            <Trash className="size-[18px]" aria-hidden />
                          </Button>
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

      {/* Modal Ver Conversación */}
      <Dialog
        open={selectedConversation !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedConversation(null)
        }}
      >
        <DialogContent className="max-w-3xl">
          {selectedConversation && (
            <>
              <DialogHeader>
                <DialogTitle>Detalles de la Conversación</DialogTitle>
              </DialogHeader>

              <div className="rounded-xl border border-border bg-card p-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-3">
                    {renderContactAvatar(selectedConversation, 'lg', 44)}
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">
                        {selectedConversation.contactName}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {selectedConversation.contactEmail}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Atendido por:</p>
                    <p className="font-semibold text-foreground">{selectedConversation.agent}</p>
                  </div>
                </div>

                <div className="my-4 border-t border-border" />

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Inicio</p>
                    <p className="text-sm text-foreground">
                      {formatDateTime(selectedConversation.startTime)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Fin</p>
                    <p className="text-sm text-foreground">
                      {formatDateTime(selectedConversation.endTime)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Duración</p>
                    <p className="text-sm tabular-nums text-foreground">
                      {selectedConversation.duration} min
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Mensajes</p>
                    <p className="text-sm tabular-nums text-foreground">
                      {selectedConversation.messagesCount}
                    </p>
                  </div>
                </div>

                <div className="my-4 border-t border-border" />

                <div>
                  <p className="mb-1.5 text-sm font-semibold text-foreground">Estado:</p>
                  <Badge variant={getStatusVariant(selectedConversation.status)}>
                    {getStatusIcon(selectedConversation.status)}
                    {getStatusLabel(selectedConversation.status)}
                  </Badge>
                </div>

                <div className="my-4 border-t border-border" />

                <div>
                  <p className="mb-1.5 text-sm font-semibold text-foreground">Satisfacción:</p>
                  {renderSatisfactionStars(selectedConversation.satisfaction)}
                </div>

                <div className="my-4 border-t border-border" />

                <div>
                  <p className="mb-1.5 text-sm font-semibold text-foreground">Etiquetas:</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {selectedConversation.tags.map((tag) => (
                      <Badge key={tag} variant="neutral">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                {selectedConversation.notes && (
                  <>
                    <div className="my-4 border-t border-border" />
                    <div>
                      <p className="mb-1.5 text-sm font-semibold text-foreground">Notas:</p>
                      <p className="text-sm text-muted-foreground">{selectedConversation.notes}</p>
                    </div>
                  </>
                )}
              </div>

              {selectedConversation.messages.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="mb-3 font-semibold text-foreground">
                    Transcript de la Conversación
                  </p>
                  <div className="space-y-3">
                    {selectedConversation.messages.map((message, index) => (
                      <div
                        key={index}
                        className={
                          message.sender === 'agent'
                            ? 'flex justify-end'
                            : 'flex justify-start'
                        }
                      >
                        <div
                          className={
                            message.sender === 'agent'
                              ? 'max-w-[70%] rounded-lg bg-primary/12 p-3'
                              : 'max-w-[70%] rounded-lg bg-muted p-3'
                          }
                        >
                          <p className="text-sm text-foreground">{message.text}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatTime(message.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
