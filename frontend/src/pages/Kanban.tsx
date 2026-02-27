import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import api from "../services/api";
import { toast } from "react-toastify";
import { useNavigate } from 'react-router-dom';
import { Facebook, Instagram, WhatsApp } from "@material-ui/icons";
import {
  Tooltip,
  Typography,
  Button,
  TextField,
  Paper,
  Card,
  CardContent,
  Chip
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import { format, isSameDay, parseISO } from "date-fns";
import { useAuth } from "../hooks/useAuth";

const useStyles = makeStyles(theme => ({
  root: {
    display: "flex",
    flexDirection: "column",
    padding: theme.spacing(2),
    height: "100%",
    overflow: "hidden",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing(2),
    flexWrap: 'wrap',
    gap: theme.spacing(1),
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  kanbanContainer: {
    display: "flex",
    gap: theme.spacing(2),
    overflowX: "auto",
    flex: 1,
    paddingBottom: theme.spacing(2),
  },
  lane: {
    minWidth: 280,
    maxWidth: 320,
    backgroundColor: "#f4f5f7",
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    maxHeight: "calc(100vh - 200px)",
  },
  laneHeader: {
    padding: theme.spacing(1.5),
    fontWeight: 600,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  laneContent: {
    padding: theme.spacing(1),
    flex: 1,
    overflowY: "auto",
    minHeight: 100,
  },
  ticketCard: {
    marginBottom: theme.spacing(1),
    cursor: "pointer",
    "&:hover": {
      boxShadow: theme.shadows[4],
    },
  },
  ticketHeader: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(0.5),
    marginBottom: theme.spacing(0.5),
  },
  ticketName: {
    fontWeight: 500,
    fontSize: "0.9rem",
    wordBreak: "break-word",
  },
  ticketNumber: {
    color: theme.palette.text.secondary,
    fontSize: "0.75rem",
  },
  ticketMessage: {
    fontSize: "0.8rem",
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.5),
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ticketFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing(1),
  },
  userBadge: {
    backgroundColor: "#000",
    color: "#fff",
    fontSize: "0.6rem",
    padding: "2px 6px",
    borderRadius: 3,
  },
  timeUnread: {
    color: theme.palette.success.main,
    fontWeight: "bold",
    fontSize: "0.75rem",
  },
  timeRead: {
    color: theme.palette.text.secondary,
    fontSize: "0.75rem",
  },
  countBadge: {
    backgroundColor: "rgba(255,255,255,0.3)",
    padding: "2px 8px",
    borderRadius: 12,
    fontSize: "0.8rem",
  },
}));

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
  const classes = useStyles();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tags, setTags] = useState<Tag[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
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
    <div className={classes.root}>
      {/* Header */}
      <div className={classes.header}>
        <div className={classes.headerLeft}>
          <TextField
            label="Fecha inicio"
            type="date"
            value={startDate}
            onChange={handleStartDateChange}
            InputLabelProps={{ shrink: true }}
            variant="outlined"
            size="small"
          />
          <TextField
            label="Fecha final"
            type="date"
            value={endDate}
            onChange={handleEndDateChange}
            InputLabelProps={{ shrink: true }}
            variant="outlined"
            size="small"
          />
          <Button variant="contained" color="primary" onClick={handleSearchClick}>
            Buscar
          </Button>
        </div>
        <Button variant="contained" color="primary" onClick={handleAddConnectionClick}>
          Añadir columnas
        </Button>
      </div>

      {/* Kanban Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className={classes.kanbanContainer}>
          {lanes.map(lane => (
            <Paper key={lane.id} className={classes.lane} elevation={1}>
              <div
                className={classes.laneHeader}
                style={{ backgroundColor: lane.color, color: "#fff" }}
              >
                <span>{lane.title}</span>
                <span className={classes.countBadge}>{lane.tickets.length}</span>
              </div>

              <Droppable droppableId={lane.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={classes.laneContent}
                    style={{
                      backgroundColor: snapshot.isDraggingOver ? "#e3f2fd" : undefined,
                    }}
                  >
                    {lane.tickets.map((ticket, index) => (
                      <Draggable
                        key={ticket.id.toString()}
                        draggableId={ticket.id.toString()}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <Card
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={classes.ticketCard}
                            style={{
                              ...provided.draggableProps.style,
                              boxShadow: snapshot.isDragging ? "0 5px 15px rgba(0,0,0,0.3)" : undefined,
                            }}
                            onClick={() => handleCardClick(ticket.uuid)}
                          >
                            <CardContent style={{ padding: 12 }}>
                              <div className={classes.ticketHeader}>
                                <Tooltip title={ticket.whatsapp?.name || ticket.channel}>
                                  <span>{IconChannel(ticket.channel)}</span>
                                </Tooltip>
                                <Typography className={classes.ticketName}>
                                  {ticket.contact?.name || "Sin nombre"}
                                </Typography>
                              </div>

                              <Typography className={classes.ticketNumber}>
                                #{ticket.id} • {ticket.contact?.number}
                              </Typography>

                              {ticket.lastMessage && (
                                <Typography className={classes.ticketMessage}>
                                  {ticket.lastMessage}
                                </Typography>
                              )}

                              <div className={classes.ticketFooter}>
                                {ticket.user && (
                                  <span className={classes.userBadge}>
                                    {ticket.user.name.toUpperCase()}
                                  </span>
                                )}
                                <span
                                  className={
                                    Number(ticket.unreadMessages) > 0
                                      ? classes.timeUnread
                                      : classes.timeRead
                                  }
                                >
                                  {formatTime(ticket.updatedAt)}
                                  {Number(ticket.unreadMessages) > 0 && (
                                    <Chip
                                      size="small"
                                      label={ticket.unreadMessages}
                                      color="primary"
                                      style={{ marginLeft: 4, height: 18, fontSize: "0.7rem" }}
                                    />
                                  )}
                                </span>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </Paper>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
};

export default Kanban;
