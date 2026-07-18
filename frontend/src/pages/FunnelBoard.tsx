import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult, DragUpdate } from '@hello-pangea/dnd'
import { useNavigate } from 'react-router-dom'
import {
  MagnifyingGlass,
  WhatsappLogo,
  InstagramLogo,
  FacebookLogo,
  TelegramLogo,
  Globe,
  ArrowClockwise,
  Columns,
  DotsSixVertical,
  CaretLeft,
  CaretRight,
  Funnel,
  CircleNotch,
} from '@phosphor-icons/react'
import { format, parseISO, isSameDay, subDays } from 'date-fns'
import { toast } from 'react-toastify'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import FunnelTicketPanel, { FunnelTag, FunnelTicket } from '../components/FunnelTicketPanel'

interface Lane {
  id: string
  title: string
  color: string
  tagId: number | null
  droppable: boolean
}

const PAGE_SIZE = 10

const channelIcon = (channel?: string) => {
  switch ((channel || '').toLowerCase()) {
    case 'whatsapp':
      return <WhatsappLogo className="size-[15px] text-wa" weight="fill" aria-hidden />
    case 'instagram':
      return <InstagramLogo className="size-[15px] text-[#e4405f]" weight="fill" aria-hidden />
    case 'facebook':
      return <FacebookLogo className="size-[15px] text-[#1877f2]" weight="fill" aria-hidden />
    case 'telegram':
      return <TelegramLogo className="size-[15px] text-[#0088cc]" weight="fill" aria-hidden />
    default:
      return <Globe className="size-[15px] text-muted-foreground" aria-hidden />
  }
}

const formatTime = (dateStr?: string) => {
  if (!dateStr) return ''
  try {
    const d = parseISO(dateStr)
    return isSameDay(d, new Date()) ? format(d, 'HH:mm') : format(d, 'dd/MM/yy')
  } catch {
    return ''
  }
}

const FunnelBoard: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [tags, setTags] = useState<FunnelTag[]>([])
  const [tickets, setTickets] = useState<FunnelTicket[]>([])
  const [activeLaneId, setActiveLaneId] = useState<string>('all')
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [hoverLaneId, setHoverLaneId] = useState<string | null>(null)

  // Scroll horizontal de los chips superiores mediante flechas
  const chipsRef = useRef<HTMLDivElement>(null)
  const scrollChips = (dir: -1 | 1) => {
    chipsRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' })
  }

  const queueIds = useMemo(
    () => (user as any)?.queues?.map((q: any) => q.UserQueue?.queueId || q.id) || [],
    [user]
  )

  /* ----------------------------- Carga de datos ----------------------------- */
  const fetchTags = useCallback(async () => {
    try {
      const res = await api.get('/tags/list', { params: { kanban: 1 } })
      const list = res.data?.lista || res.data || []
      setTags(Array.isArray(list) ? list : [])
    } catch (err) {
      console.error('Error cargando etiquetas de funnel', err)
    }
  }, [])

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/ticket/kanban', {
        params: { queueIds: JSON.stringify(queueIds), startDate, endDate },
      })
      setTickets(data?.tickets || [])
    } catch (err) {
      console.error('Error cargando tickets', err)
      setTickets([])
    } finally {
      setLoading(false)
    }
  }, [queueIds, startDate, endDate])

  useEffect(() => {
    if (user) {
      fetchTags()
      fetchTickets()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Refresco periódico (pausado mientras se arrastra para no pisar el cambio optimista)
  useEffect(() => {
    if (!user) return
    const interval = setInterval(() => {
      if (!isDragging) fetchTickets()
    }, 20000)
    return () => clearInterval(interval)
  }, [user, isDragging, fetchTickets])

  /* ----------------------------- Lanes / contadores ----------------------------- */
  const lanes: Lane[] = useMemo(
    () => [
      { id: 'all', title: 'Todas', color: '#64748b', tagId: null, droppable: false },
      { id: 'untagged', title: 'Sin etiqueta', color: '#94a3b8', tagId: null, droppable: true },
      ...tags.map(t => ({ id: `tag-${t.id}`, title: t.name, color: t.color, tagId: t.id, droppable: true })),
    ],
    [tags]
  )

  const laneOfTicket = (t: FunnelTicket): string => {
    const k = (t.tags || []).find(tag => tag.kanban === 1)
    return k ? `tag-${k.id}` : 'untagged'
  }

  const countFor = (laneId: string): number => {
    if (laneId === 'all') return tickets.length
    return tickets.filter(t => laneOfTicket(t) === laneId).length
  }

  const laneTickets = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tickets.filter(t => {
      const inLane = activeLaneId === 'all' || laneOfTicket(t) === activeLaneId
      if (!inLane) return false
      if (!q) return true
      return (
        t.contact?.name?.toLowerCase().includes(q) ||
        t.contact?.number?.toLowerCase().includes(q) ||
        String(t.id).includes(q)
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, activeLaneId, search])

  // Paginación (10 por etapa). Se reinicia al cambiar de etapa, búsqueda o fechas.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [activeLaneId, search, startDate, endDate])

  const pagedTickets = useMemo(() => laneTickets.slice(0, visibleCount), [laneTickets, visibleCount])
  const hasMore = visibleCount < laneTickets.length

  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 140) {
      setVisibleCount(c => (c < laneTickets.length ? c + PAGE_SIZE : c))
    }
  }

  const selectedTicket = useMemo(
    () => tickets.find(t => t.id === selectedTicketId) || null,
    [tickets, selectedTicketId]
  )

  const activeLane = lanes.find(l => l.id === activeLaneId)

  /* ----------------------------- Mover ticket ----------------------------- */
  const applyMoveLocal = useCallback((ticketId: number, lane: Lane) => {
    setTickets(prev =>
      prev.map(t => {
        if (t.id !== ticketId) return t
        const others = (t.tags || []).filter(tag => tag.kanban !== 1)
        const newTags = lane.tagId
          ? [...others, { id: lane.tagId, name: lane.title, color: lane.color, kanban: 1 }]
          : others
        return { ...t, tags: newTags }
      })
    )
  }, [])

  const persistMove = async (ticketId: number, lane: Lane) => {
    await api.delete(`/ticket-tags/${ticketId}`)
    if (lane.tagId) {
      await api.put(`/ticket-tags/${ticketId}/${lane.tagId}`)
    }
  }

  const moveTicket = useCallback(
    async (ticketId: number, targetLane: Lane, withUndo = true) => {
      const ticket = tickets.find(t => t.id === ticketId)
      if (!ticket) return
      const currentLaneId = laneOfTicket(ticket)
      if (currentLaneId === targetLane.id) return
      const prevLane = lanes.find(l => l.id === currentLaneId) || lanes[1]

      applyMoveLocal(ticketId, targetLane) // optimista → contadores se actualizan solos
      try {
        await persistMove(ticketId, targetLane)
        if (withUndo) {
          toast.success(
            ({ closeToast }: any) => (
              <div className="flex items-center justify-between gap-2">
                <span>Movido a "{targetLane.title}"</span>
                <button
                  type="button"
                  onClick={() => {
                    moveTicket(ticketId, prevLane, false)
                    closeToast?.()
                  }}
                  className="cursor-pointer appearance-none border-0 bg-transparent font-bold text-primary"
                >
                  Deshacer
                </button>
              </div>
            ),
            { autoClose: 4000 }
          )
        } else {
          toast.success(`Movido a "${targetLane.title}"`)
        }
      } catch (err) {
        console.error('Error moviendo ticket', err)
        applyMoveLocal(ticketId, prevLane) // revertir
        toast.error('No se pudo mover el ticket')
      }
    },
    [tickets, lanes, applyMoveLocal]
  )

  const handlePanelTagChange = useCallback(
    (ticketId: number, newTag: FunnelTag | null) => {
      const lane: Lane = newTag
        ? { id: `tag-${newTag.id}`, title: newTag.name, color: newTag.color, tagId: newTag.id, droppable: true }
        : { id: 'untagged', title: 'Sin etiqueta', color: '#94a3b8', tagId: null, droppable: true }
      applyMoveLocal(ticketId, lane)
    },
    [applyMoveLocal]
  )

  /* ----------------------------- Drag & Drop ----------------------------- */
  const onDragStart = () => setIsDragging(true)

  const onDragUpdate = (update: DragUpdate) => {
    setHoverLaneId(update.destination?.droppableId ?? null)
  }

  const onDragEnd = (result: DropResult) => {
    setIsDragging(false)
    setHoverLaneId(null)
    const { destination, draggableId } = result
    if (!destination) return
    const targetLane = lanes.find(l => l.id === destination.droppableId)
    if (!targetLane || !targetLane.droppable) return // 'Todas' o destino inválido
    const ticketId = Number(draggableId)
    moveTicket(ticketId, targetLane)
  }

  /* ----------------------------- Render ----------------------------- */
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col bg-background p-4">
        {/* Cabecera */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Funnel className="size-6" weight="fill" aria-hidden />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Funnel de Tickets</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[260px]">
              <MagnifyingGlass
                className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                placeholder="Buscar por nombre, teléfono o #ticket…"
                aria-label="Buscar tickets"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>
            <input
              type="date"
              aria-label="Fecha inicial"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="h-9 w-[150px] rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <input
              type="date"
              aria-label="Fecha final"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="h-9 w-[150px] rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <Button variant="outline" size="sm" onClick={fetchTickets}>
              <MagnifyingGlass className="size-4" aria-hidden />
              Buscar
            </Button>
            <Tooltip title="Refrescar">
              <Button
                variant="outline"
                size="icon"
                aria-label="Refrescar"
                className="size-9"
                onClick={fetchTickets}
              >
                {loading ? (
                  <CircleNotch className="size-4 animate-spin" aria-hidden />
                ) : (
                  <ArrowClockwise className="size-[18px]" aria-hidden />
                )}
              </Button>
            </Tooltip>
            <Button variant="outline" size="sm" onClick={() => navigate('/tagsKanban')}>
              <Columns className="size-4" aria-hidden />
              Columnas
            </Button>
          </div>
        </div>

        <DragDropContext onDragStart={onDragStart} onDragUpdate={onDragUpdate} onDragEnd={onDragEnd}>
          {/* Chips superiores = filtros + zonas de destino (con flechas de navegación) */}
          <div className="mb-3 flex items-center gap-1">
            <Tooltip title="Desplazar a la izquierda">
              <Button
                variant="outline"
                size="icon"
                aria-label="Desplazar a la izquierda"
                className="size-9 shrink-0 rounded-full"
                onClick={() => scrollChips(-1)}
              >
                <CaretLeft className="size-4" aria-hidden />
              </Button>
            </Tooltip>

            <div
              ref={chipsRef}
              className="flex flex-1 gap-2 overflow-x-auto pb-1 [scroll-behavior:smooth] [&::-webkit-scrollbar]:h-1.5"
            >
              {lanes.map(lane => {
                const isActive = activeLaneId === lane.id
                const isHover = hoverLaneId === lane.id && lane.droppable
                const count = countFor(lane.id)
                const chip = (
                  <button
                    type="button"
                    onClick={() => setActiveLaneId(lane.id)}
                    className={cn(
                      'flex select-none items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition-all',
                      isActive
                        ? 'border-transparent bg-primary text-primary-foreground'
                        : 'border-border bg-card text-foreground hover:border-muted-foreground/40'
                    )}
                    style={
                      isHover
                        ? {
                            backgroundColor: `${lane.color}26`,
                            borderColor: lane.color,
                            boxShadow: `0 0 0 3px ${lane.color}33`,
                          }
                        : undefined
                    }
                  >
                    {lane.tagId !== null || lane.id === 'untagged' ? (
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: lane.color }}
                        aria-hidden
                      />
                    ) : null}
                    <span>{isHover ? `Mover a ${lane.title}` : lane.title}</span>
                    <span
                      className={cn(
                        'inline-flex min-w-6 justify-center rounded-full px-1.5 py-0.5 text-xs font-medium',
                        isActive
                          ? 'bg-primary-foreground/20 text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {count}
                    </span>
                  </button>
                )

                // 'Todas' no es zona de destino
                if (!lane.droppable) {
                  return (
                    <div key={lane.id} className="shrink-0">
                      {chip}
                    </div>
                  )
                }

                return (
                  <Droppable droppableId={lane.id} key={lane.id} direction="horizontal">
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          'shrink-0 rounded-full',
                          snapshot.isDraggingOver && 'outline-dashed outline-2'
                        )}
                        style={
                          snapshot.isDraggingOver ? { outlineColor: lane.color } : undefined
                        }
                      >
                        {chip}
                        <div className="hidden">{provided.placeholder}</div>
                      </div>
                    )}
                  </Droppable>
                )
              })}
            </div>

            <Tooltip title="Desplazar a la derecha">
              <Button
                variant="outline"
                size="icon"
                aria-label="Desplazar a la derecha"
                className="size-9 shrink-0 rounded-full"
                onClick={() => scrollChips(1)}
              >
                <CaretRight className="size-4" aria-hidden />
              </Button>
            </Tooltip>
          </div>

          {/* Cuerpo: lista de tickets (centro) · panel (der) */}
          <div className="flex min-h-0 flex-1 gap-3">
            {/* Columna central: tickets */}
            <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-foreground">{activeLane?.title || 'Tickets'}</h2>
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {laneTickets.length} tickets
                  </span>
                  {laneTickets.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Mostrando {pagedTickets.length} de {laneTickets.length}
                    </span>
                  )}
                </div>
              </div>

              <Droppable droppableId="ticket-list" isDropDisabled>
                {provided => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    onScroll={handleListScroll}
                    className="flex-1 overflow-y-auto p-2"
                  >
                    {laneTickets.length === 0 && !loading && (
                      <div className="flex h-full flex-col items-center justify-center py-12">
                        <p className="text-sm text-muted-foreground">No hay tickets en esta etapa</p>
                      </div>
                    )}

                    {pagedTickets.map((ticket, index) => {
                      const isSelected = ticket.id === selectedTicketId
                      const avatarSrc = ticket.contact?.urlPicture || ticket.contact?.profilePicUrl
                      return (
                        <Draggable key={ticket.id} draggableId={String(ticket.id)} index={index}>
                          {(prov, snapshot) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              onClick={() => setSelectedTicketId(ticket.id)}
                              style={prov.draggableProps.style}
                              className={cn(
                                'mb-2 rounded-md border bg-card p-3 transition-[border-color,box-shadow]',
                                snapshot.isDragging ? 'cursor-grabbing shadow-xl' : 'cursor-grab',
                                isSelected
                                  ? 'border-primary ring-2 ring-primary/30'
                                  : 'border-border shadow-sm hover:border-primary/50'
                              )}
                            >
                              <div className="flex items-start gap-2">
                                {/* Indicador visual de arrastre (toda la tarjeta arrastra) */}
                                <span className="flex items-center pt-0.5 text-muted-foreground">
                                  <DotsSixVertical className="size-[18px]" aria-hidden />
                                </span>

                                {avatarSrc ? (
                                  <img
                                    src={avatarSrc}
                                    alt=""
                                    width={32}
                                    height={32}
                                    className="size-8 shrink-0 rounded-full object-cover"
                                  />
                                ) : (
                                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                                    {ticket.contact?.name?.charAt(0)?.toUpperCase() || '?'}
                                  </span>
                                )}

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                                      {ticket.contact?.name || 'Sin nombre'}
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                      {formatTime(ticket.updatedAt)}
                                    </span>
                                  </div>

                                  <div className="mt-0.5 flex items-center gap-1">
                                    <span className="text-xs text-muted-foreground">#{ticket.id}</span>
                                    {ticket.contact?.number && (
                                      <span className="truncate text-xs text-muted-foreground">
                                        · {ticket.contact.number}
                                      </span>
                                    )}
                                    {channelIcon(ticket.channel)}
                                  </div>

                                  {ticket.lastMessage && (
                                    <p className="mt-1 truncate text-xs text-muted-foreground">
                                      {ticket.lastMessage}
                                    </p>
                                  )}

                                  <div className="mt-2 flex items-center justify-between">
                                    <div className="flex flex-wrap items-center gap-1">
                                      {(ticket.tags || [])
                                        .filter(t => t.kanban === 1)
                                        .map(t => (
                                          <span
                                            key={t.id}
                                            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                                            style={{ backgroundColor: `${t.color}22`, color: t.color }}
                                          >
                                            {t.name}
                                          </span>
                                        ))}
                                    </div>
                                    {Number(ticket.unreadMessages) > 0 && (
                                      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
                                        {ticket.unreadMessages}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      )
                    })}
                    {provided.placeholder}

                    {hasMore && (
                      <div className="flex justify-center py-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                        >
                          Cargar más ({laneTickets.length - pagedTickets.length} restantes)
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>

            {/* Columna derecha: panel de detalle */}
            <div className="hidden shrink-0 lg:block">
              <FunnelTicketPanel
                ticket={selectedTicket}
                kanbanTags={tags}
                onFunnelTagChange={handlePanelTagChange}
                onClose={() => setSelectedTicketId(null)}
                onOpenConversation={uuid => navigate('/tickets/' + uuid)}
              />
            </div>
          </div>
        </DragDropContext>
      </div>
    </TooltipProvider>
  )
}

export default FunnelBoard
