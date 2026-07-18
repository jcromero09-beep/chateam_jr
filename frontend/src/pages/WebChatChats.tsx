import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChatCircleDots,
  ArrowClockwise,
  MagnifyingGlass,
  PaperPlaneTilt,
  CheckCircle,
} from '@phosphor-icons/react'
import DateRangePicker from '../components/DateRangePicker'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import api from '../services/api'

interface WebChatWidget {
  id: number
  name: string
}

interface WebChatConversation {
  id: number
  uuid: string
  widgetId: number
  sessionId: string
  visitorName: string
  status: 'open' | 'resolved' | 'closed'
  unreadMessages: number
  lastMessage?: string
  lastMessageAt?: string
  createdAt: string
  updatedAt: string
  widget?: WebChatWidget
  metadata?: Record<string, any>
}

interface WebChatMessage {
  id: number
  conversationId: number
  direction: 'inbound' | 'outbound'
  body: string
  senderId?: number
  sender?: { id: number; name: string }
  createdAt: string
}

export default function WebChatChats() {
  const [conversations, setConversations] = useState<WebChatConversation[]>([])
  const [selected, setSelected] = useState<WebChatConversation | null>(null)
  const [messages, setMessages] = useState<WebChatMessage[]>([])
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  // Filtro por rango de fechas (default: últimos 30 días), igual que en Tickets.
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const selectedId = selected?.id

  useEffect(() => {
    void fetchConversations()
  }, [status, startDate, endDate])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!selectedId) return

    const timer = window.setInterval(() => {
      void fetchMessages(selectedId, false)
      void fetchConversations(false)
    }, 5000)

    return () => window.clearInterval(timer)
  }, [selectedId, status])

  const fetchConversations = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      const { data } = await api.get('/webchat/conversations', {
        params: {
          status,
          search: search.trim() || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
      })

      const records = data.records || []
      setConversations(records)

      if (selected) {
        const freshSelected = records.find((item: WebChatConversation) => item.id === selected.id)
        if (freshSelected) setSelected(freshSelected)
      }
    } catch (error) {
      console.error('Error loading webchat conversations:', error)
      setConversations([])
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  const fetchMessages = async (conversationId: number, markRead = true) => {
    try {
      const { data } = await api.get(`/webchat/conversations/${conversationId}/messages`)
      setMessages(data.records || [])

      if (markRead) {
        await api.post(`/webchat/conversations/${conversationId}/read`)
        setConversations(prev =>
          prev.map(item => item.id === conversationId ? { ...item, unreadMessages: 0 } : item)
        )
      }
    } catch (error) {
      console.error('Error loading webchat messages:', error)
      setMessages([])
    }
  }

  const handleSelect = async (conversation: WebChatConversation) => {
    setSelected(conversation)
    await fetchMessages(conversation.id)
  }

  const handleSend = async () => {
    const text = message.trim()
    if (!text || !selected) return

    setMessage('')

    try {
      const { data } = await api.post(`/webchat/conversations/${selected.id}/messages`, {
        message: text,
      })

      setMessages(prev => [...prev, data])
      setConversations(prev =>
        prev.map(item =>
          item.id === selected.id
            ? { ...item, lastMessage: text, lastMessageAt: data.createdAt, status: 'open' }
            : item
        )
      )
    } catch (error) {
      console.error('Error sending webchat message:', error)
      setMessage(text)
    }
  }

  const handleStatusChange = async (nextStatus: 'open' | 'resolved' | 'closed') => {
    if (!selected) return

    try {
      const { data } = await api.put(`/webchat/conversations/${selected.id}/status`, {
        status: nextStatus,
      })
      setSelected(data)
      setConversations(prev => prev.map(item => item.id === data.id ? data : item))
    } catch (error) {
      console.error('Error updating webchat status:', error)
    }
  }

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return conversations

    return conversations.filter(item =>
      item.visitorName.toLowerCase().includes(term) ||
      item.sessionId.toLowerCase().includes(term) ||
      (item.lastMessage || '').toLowerCase().includes(term)
    )
  }, [conversations, search])

  const formatTime = (value?: string) => {
    if (!value) return ''
    const date = new Date(value)
    const now = new Date()
    const sameDay = date.toDateString() === now.toDateString()
    return sameDay
      ? date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
  }

  const statusLabel = (value: string) => {
    if (value === 'resolved') return 'Resuelto'
    if (value === 'closed') return 'Cerrado'
    return 'Abierto'
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-4 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ChatCircleDots className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                WebChat
              </h1>
              <p className="text-sm text-muted-foreground">
                Conversaciones recibidas desde los widgets instalados en landings.
              </p>
            </div>
          </div>

          <Button variant="outline" size="sm" loading={loading} onClick={() => fetchConversations()}>
            <ArrowClockwise className="size-4" aria-hidden />
            Actualizar
          </Button>
        </div>

        {/* Panel principal */}
        <div className="grid min-h-[calc(100vh-190px)] grid-cols-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02] md:grid-cols-[360px_1fr]">
          {/* Columna izquierda: lista de conversaciones */}
          <div className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
            <div className="space-y-3 p-4">
              <div className="relative">
                <MagnifyingGlass
                  className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  placeholder="Buscar conversación"
                  aria-label="Buscar conversación"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') void fetchConversations()
                  }}
                  className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              {/* Filtro por estado DESHABILITADO (fallaba al cambiar). Reemplazado por el filtro
                  de rango de fechas (default últimos 30 días), igual que en Tickets. */}
              <div className="space-y-1.5">
                <Label htmlFor="webchat-daterange">Rango de fechas</Label>
                <DateRangePicker
                  since={startDate}
                  until={endDate}
                  presetLabel=""
                  months={1}
                  showPresets={false}
                  align="left"
                  allowClear
                  showRangeInTrigger
                  fullWidth
                  placeholder="Últimos 30 días"
                  onApply={(s, u) => {
                    setStartDate(s)
                    setEndDate(u)
                  }}
                />
              </div>
            </div>

            <div className="border-t border-border" />

            <div className="flex-1 overflow-auto p-1.5">
              {filteredConversations.map(conversation => {
                const isSelected = selected?.id === conversation.id
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => handleSelect(conversation)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-accent/60',
                      isSelected && 'bg-accent'
                    )}
                  >
                    <div className="relative shrink-0">
                      <Avatar name={conversation.visitorName} size="sm" />
                      {conversation.unreadMessages > 0 && (
                        <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
                          {conversation.unreadMessages}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {conversation.visitorName}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatTime(conversation.lastMessageAt || conversation.updatedAt)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {conversation.widget?.name || 'Widget'} · {statusLabel(conversation.status)}
                      </p>
                      <p className="truncate text-sm text-foreground">
                        {conversation.lastMessage || 'Sin mensajes'}
                      </p>
                    </div>
                  </button>
                )
              })}

              {filteredConversations.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No hay conversaciones WebChat.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Columna derecha: conversación seleccionada */}
          {selected ? (
            <div className="flex min-h-0 flex-col">
              {/* Cabecera de la conversación */}
              <div className="flex items-center justify-between gap-4 border-b border-border p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={selected.visitorName} />
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-foreground">{selected.visitorName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {selected.widget?.name || 'Widget'} · {selected.metadata?.pageUrl || selected.metadata?.origin || 'Landing'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={selected.status === 'open' ? 'success' : 'neutral'}>
                    {statusLabel(selected.status)}
                  </Badge>
                  <button
                    type="button"
                    aria-label="Marcar como resuelto"
                    title="Marcar como resuelto"
                    onClick={() => handleStatusChange('resolved')}
                    disabled={selected.status === 'resolved'}
                    className="flex size-9 items-center justify-center rounded-md border border-input bg-card text-success-text transition-colors hover:bg-success/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCircle className="size-[18px]" aria-hidden />
                  </button>
                </div>
              </div>

              {/* Mensajes */}
              <div className="flex-1 space-y-2.5 overflow-auto bg-muted/30 p-4">
                {messages.map(item => {
                  const outbound = item.direction === 'outbound'
                  return (
                    <div
                      key={item.id}
                      className={cn('flex', outbound ? 'justify-end' : 'justify-start')}
                    >
                      <div
                        className={cn(
                          'max-w-[72%] rounded-lg px-3 py-2',
                          outbound
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'border border-border bg-card text-foreground'
                        )}
                      >
                        <p className="whitespace-pre-wrap text-sm">
                          {item.body}
                        </p>
                        <p
                          className={cn(
                            'mt-1 text-xs',
                            outbound ? 'text-primary-foreground/75' : 'text-muted-foreground'
                          )}
                        >
                          {outbound ? item.sender?.name || 'Equipo' : selected.visitorName} · {formatTime(item.createdAt)}
                        </p>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <div className="flex items-end gap-2 border-t border-border p-4">
                <textarea
                  rows={1}
                  placeholder="Responder desde WebChat"
                  aria-label="Responder desde WebChat"
                  value={message}
                  onChange={event => setMessage(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void handleSend()
                    }
                  }}
                  className="max-h-32 min-h-11 flex-1 resize-none rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
                <Button onClick={handleSend} disabled={!message.trim()}>
                  Enviar
                  <PaperPlaneTilt className="size-4" weight="fill" aria-hidden />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-2 p-6 text-center">
              <ChatCircleDots className="size-14 text-muted-foreground" aria-hidden />
              <p className="text-base font-semibold text-foreground">Selecciona una conversación</p>
              <p className="text-sm text-muted-foreground">
                Las respuestas se entregan al widget instalado en la landing.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
