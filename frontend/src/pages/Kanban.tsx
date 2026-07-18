import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import api from "../services/api";
import { toast } from "react-toastify";
import { useNavigate } from 'react-router-dom';
import { Facebook, Instagram, WhatsApp } from "@mui/icons-material";
import { format, isSameDay, parseISO } from "date-fns";
import { useAuth } from "../hooks/useAuth";
import DateRangePicker from "../components/DateRangePicker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Tag {
  id: number;
  name: string;
  color: string;
}

interface Ticket {
  id: number;
  uuid: string;
  status: string;
  lastMessage: string;
  updatedAt: string;
  unreadMessages: number;
  channel: string;
  contact: {
    name: string;
    number: string;
  };
  user?: {
    name: string;
  };
  whatsapp?: {
    name: string;
  };
  tags: Tag[];
}

interface Lane {
  id: string;
  title: string;
  color: string;
  tickets: Ticket[];
}

const Kanban = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tags, setTags] = useState<Tag[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [lanes, setLanes] = useState<Lane[]>([]);
  // Por defecto: último 1 mes (no "todas las fechas").
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return format(d, "yyyy-MM-dd");
  });
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const jsonString = (user as any)?.queues?.map((queue: any) => queue.UserQueue?.queueId || queue.id) || [];

  useEffect(() => {
    if (user) {
      fetchTags();
    }
  }, [user]);

  const fetchTags = async () => {
    try {
      const response = await api.get("/tag/kanban/");
      const fetchedTags = response.data.lista || [];
      setTags(fetchedTags);
      fetchTickets();
    } catch (error) {
      console.log(error);
    }
  };

  const fetchTickets = async () => {
    try {
      const { data } = await api.get("/ticket/kanban", {
        params: {
          queueIds: JSON.stringify(jsonString),
          startDate: startDate,
          endDate: endDate,
        }
      });
      setTickets(data.tickets || []);
    } catch (err) {
      console.log(err);
      setTickets([]);
    }
  };

  // Refresh tickets periodically
  useEffect(() => {
    if (user) {
      const interval = setInterval(() => {
        fetchTickets();
      }, 10000); // Refresh every 10 seconds

      return () => clearInterval(interval);
    }
  }, [user, startDate, endDate]);

  // Build lanes from tags and tickets
  useEffect(() => {
    const untaggedTickets = tickets.filter(ticket => !ticket.tags || ticket.tags.length === 0);

    const newLanes: Lane[] = [
      {
        id: "lane0",
        title: "Sin Etiqueta",
        color: "#9e9e9e",
        tickets: untaggedTickets,
      },
      ...tags.map(tag => ({
        id: tag.id.toString(),
        title: tag.name,
        color: tag.color,
        tickets: tickets.filter(ticket =>
          ticket.tags && ticket.tags.some(t => t.id === tag.id)
        ),
      })),
    ];

    setLanes(newLanes);
  }, [tags, tickets]);

  const handleSearchClick = () => {
    fetchTickets();
  };

  const handleStartDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setStartDate(event.target.value);
  };

  const handleEndDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEndDate(event.target.value);
  };

  const IconChannel = (channel: string) => {
    switch (channel) {
      case "facebook":
        return <Facebook style={{ color: "#3b5998", fontSize: 16 }} />;
      case "instagram":
        return <Instagram style={{ color: "#e1306c", fontSize: 16 }} />;
      case "whatsapp":
        return <WhatsApp style={{ color: "#25d366", fontSize: 16 }} />;
      default:
        return null;
    }
  };

  const handleCardClick = (uuid: string) => {
    navigate('/tickets/' + uuid);
  };

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // Dropped outside a droppable
    if (!destination) return;

    // Dropped in the same position
    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      return;
    }

    const ticketId = draggableId;
    const targetLaneId = destination.droppableId;

    try {
      // Remove old tag
      await api.delete(`/ticket-tags/${ticketId}`);

      // Add new tag if not moving to "Sin Etiqueta" lane
      if (targetLaneId !== "lane0") {
        await api.put(`/ticket-tags/${ticketId}/${targetLaneId}`);
        toast.success('¡Etiqueta actualizada con éxito!');
      } else {
        toast.success('Etiqueta removida');
      }

      // Refresh tickets
      await fetchTickets();
    } catch (err) {
      console.log(err);
      toast.error('Error al mover el ticket');
    }
  };

  const handleAddConnectionClick = () => {
    navigate('/tagsKanban');
  };

  const formatTime = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      if (isSameDay(date, new Date())) {
        return format(date, "HH:mm");
      }
      return format(date, "dd/MM/yyyy");
    } catch {
      return "";
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background p-4 text-foreground">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Filtro de rango de fechas (mismo componente que Tickets). Por defecto
              muestra el último mes; al Aplicar/Limpiar refresca automáticamente. */}
          <DateRangePicker
            since={startDate}
            until={endDate}
            presetLabel=""
            months={1}
            showPresets={false}
            align="left"
            allowClear
            showRangeInTrigger
            placeholder="Todas las fechas"
            onApply={(s, u) => {
              setStartDate(s);
              setEndDate(u);
            }}
          />
        </div>
        <Button size="sm" onClick={handleAddConnectionClick}>
          Añadir columnas
        </Button>
      </div>

      {/* Kanban Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
          {lanes.map(lane => (
            <div
              key={lane.id}
              className="flex max-h-[calc(100vh-200px)] w-80 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-muted/40"
            >
              {/* [Barrido UI · ref. kanban shadcn] Cabecera neutra: antes cada columna
                  llevaba una banda de color saturado a todo lo ancho con texto blanco,
                  asi que el tablero eran N bloques gritando a la vez. El color de la
                  etapa se conserva como punto de acento (sigue codificando la etapa)
                  y el peso visual vuelve a las tarjetas, que es donde esta la info. */}
              <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: lane.color }}
                />
                <span className="truncate text-sm font-semibold text-foreground">{lane.title}</span>
                <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                  {lane.tickets.length}
                </span>
              </div>

              <Droppable droppableId={lane.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "min-h-[100px] flex-1 space-y-2 overflow-y-auto p-2 transition-colors",
                      snapshot.isDraggingOver && "bg-primary/5"
                    )}
                  >
                    {lane.tickets.map((ticket, index) => (
                      <Draggable
                        key={ticket.id.toString()}
                        draggableId={ticket.id.toString()}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            style={provided.draggableProps.style}
                            onClick={() => handleCardClick(ticket.uuid)}
                            className={cn(
                              "cursor-pointer rounded-md border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
                              snapshot.isDragging && "ring-2 ring-primary shadow-lg"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <Avatar name={ticket.contact?.name || "?"} size="sm" />
                              <span
                                className="inline-flex shrink-0"
                                title={ticket.whatsapp?.name || ticket.channel}
                              >
                                {IconChannel(ticket.channel)}
                              </span>
                              <span className="truncate text-sm font-medium text-foreground">
                                {ticket.contact?.name || "Sin nombre"}
                              </span>
                            </div>

                            <p className="mt-1 text-xs text-muted-foreground">
                              #{ticket.id} • {ticket.contact?.number}
                            </p>

                            {ticket.lastMessage && (
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {ticket.lastMessage}
                              </p>
                            )}

                            <div className="mt-2.5 flex items-center justify-between gap-2">
                              {ticket.user && (
                                <Badge variant="neutral" className="uppercase">
                                  {ticket.user.name}
                                </Badge>
                              )}
                              <span
                                className={cn(
                                  "ml-auto flex items-center gap-1 text-[11px]",
                                  Number(ticket.unreadMessages) > 0
                                    ? "font-bold text-success-text"
                                    : "text-muted-foreground"
                                )}
                              >
                                {formatTime(ticket.updatedAt)}
                                {Number(ticket.unreadMessages) > 0 && (
                                  <Badge variant="primary">
                                    {ticket.unreadMessages}
                                  </Badge>
                                )}
                              </span>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
};

export default Kanban;
