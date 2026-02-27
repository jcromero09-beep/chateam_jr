import { useState } from 'react'
import {
  Container,
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Grid,
  Button,
  Input,
  Select,
  Option,
  Chip,
  Sheet,
  Table,
  Modal,
  ModalDialog,
  ModalClose,
  Avatar,
  Divider,
  IconButton,
} from '@mui/joy'
import {
  History as HistoryIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Download as DownloadIcon,
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  CheckCircle as ResolvedIcon,
  Schedule as PendingIcon,
  Chat as ChatIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
} from '@mui/icons-material'

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved':
        return 'success'
      case 'abandoned':
        return 'danger'
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
        return <ResolvedIcon />
      case 'abandoned':
        return <PendingIcon />
      case 'transferred':
        return <ChatIcon />
      default:
        return <ChatIcon />
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
    if (!rating) return <Typography level="body-xs">Sin calificación</Typography>
    return (
      <Stack direction="row" spacing={0.5}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Box key={star} sx={{ color: star <= rating ? 'warning.main' : 'neutral.outlinedBorder' }}>
            {star <= rating ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
          </Box>
        ))}
      </Stack>
    )
  }

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
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <HistoryIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Historial de Conversaciones</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Búsqueda y revisión de conversaciones pasadas
              </Typography>
            </Box>
          </Stack>
          <Button
            variant="outlined"
            color="neutral"
            startDecorator={<DownloadIcon />}
            onClick={handleExport}
          >
            Exportar
          </Button>
        </Stack>

        {/* Stats */}
        <Grid container spacing={2}>
          <Grid xs={6} sm={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Total Conversaciones
                </Typography>
                <Typography level="h2">{stats.total}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={6} sm={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Resueltas
                </Typography>
                <Typography level="h2" sx={{ color: 'success.main' }}>
                  {stats.resolved}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={6} sm={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Duración Promedio
                </Typography>
                <Typography level="h2">{stats.avgDuration.toFixed(1)}min</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={6} sm={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Satisfacción Promedio
                </Typography>
                <Typography level="h2">{stats.avgSatisfaction.toFixed(1)}/5</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Filters */}
        <Card>
          <CardContent>
            <Grid container spacing={2}>
              <Grid xs={12} sm={6} md={3}>
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  startDecorator={<SearchIcon />}
                  size="sm"
                />
              </Grid>
              <Grid xs={12} sm={6} md={2}>
                <Select
                  value={filterStatus}
                  onChange={(_, value) => setFilterStatus(value as string)}
                  size="sm"
                  startDecorator={<FilterIcon />}
                >
                  <Option value="all">Todos los estados</Option>
                  <Option value="resolved">Resueltas</Option>
                  <Option value="abandoned">Abandonadas</Option>
                  <Option value="transferred">Transferidas</Option>
                </Select>
              </Grid>
              <Grid xs={12} sm={6} md={2}>
                <Select
                  value={filterAgent}
                  onChange={(_, value) => setFilterAgent(value as string)}
                  size="sm"
                >
                  <Option value="all">Todos los agentes</Option>
                  {agents.map((agent) => (
                    <Option key={agent} value={agent}>
                      {agent}
                    </Option>
                  ))}
                </Select>
              </Grid>
              <Grid xs={12} sm={6} md={2}>
                <Select
                  value={dateRange}
                  onChange={(_, value) => setDateRange(value as string)}
                  size="sm"
                >
                  <Option value="7d">Últimos 7 días</Option>
                  <Option value="30d">Últimos 30 días</Option>
                  <Option value="90d">Últimos 90 días</Option>
                  <Option value="all">Todo el tiempo</Option>
                </Select>
              </Grid>
              <Grid xs={12} sm={6} md={3}>
                <Stack direction="row" spacing={1}>
                  <Button fullWidth variant="outlined" size="sm">
                    Limpiar Filtros
                  </Button>
                  <Button fullWidth variant="solid" size="sm">
                    Aplicar
                  </Button>
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Conversations Table */}
        <Card>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 200 }}>Contacto</th>
                  <th style={{ width: 150 }}>Agente</th>
                  <th style={{ width: 150 }}>Fecha/Hora Inicio</th>
                  <th style={{ width: 100 }}>Duración</th>
                  <th style={{ width: 80 }}>Mensajes</th>
                  <th style={{ width: 120 }}>Estado</th>
                  <th style={{ width: 150 }}>Satisfacción</th>
                  <th style={{ width: 200 }}>Etiquetas</th>
                  <th style={{ width: 150 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredConversations.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>No hay conversaciones que coincidan con los filtros</Typography>
                    </td>
                  </tr>
                ) : (
                  filteredConversations.map((conversation) => (
                    <tr key={conversation.id}>
                      <td>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Avatar size="sm" src={conversation.contactAvatar}>
                            {conversation.contactName.charAt(0)}
                          </Avatar>
                          <Box>
                            <Typography level="body-sm" fontWeight="bold">
                              {conversation.contactName}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              {conversation.contactEmail}
                            </Typography>
                          </Box>
                        </Stack>
                      </td>
                      <td>
                        <Typography level="body-sm">{conversation.agent}</Typography>
                      </td>
                      <td>
                        <Typography level="body-sm">
                          {formatDateTime(conversation.startTime)}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-sm">{conversation.duration} min</Typography>
                      </td>
                      <td>
                        <Typography level="body-sm">{conversation.messagesCount}</Typography>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={getStatusColor(conversation.status)}
                          startDecorator={getStatusIcon(conversation.status)}
                        >
                          {getStatusLabel(conversation.status)}
                        </Chip>
                      </td>
                      <td>{renderSatisfactionStars(conversation.satisfaction)}</td>
                      <td>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                          {conversation.tags.slice(0, 2).map((tag) => (
                            <Chip key={tag} size="sm" variant="outlined">
                              {tag}
                            </Chip>
                          ))}
                          {conversation.tags.length > 2 && (
                            <Chip size="sm" variant="outlined">
                              +{conversation.tags.length - 2}
                            </Chip>
                          )}
                        </Stack>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="primary"
                            onClick={() => setSelectedConversation(conversation)}
                          >
                            <ViewIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={() => handleDelete(conversation.id)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Stack>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Sheet>
        </Card>

        {/* Modal Ver Conversación */}
        <Modal
          open={selectedConversation !== null}
          onClose={() => setSelectedConversation(null)}
        >
          <ModalDialog sx={{ minWidth: 700, maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto' }}>
            <ModalClose />
            {selectedConversation && (
              <Stack spacing={2}>
                <Typography level="h4">Detalles de la Conversación</Typography>

                <Card variant="outlined">
                  <CardContent>
                    <Grid container spacing={2}>
                      <Grid xs={12} sm={6}>
                        <Stack direction="row" spacing={2} alignItems="center">
                          <Avatar size="lg" src={selectedConversation.contactAvatar}>
                            {selectedConversation.contactName.charAt(0)}
                          </Avatar>
                          <Box>
                            <Typography level="body-md" fontWeight="bold">
                              {selectedConversation.contactName}
                            </Typography>
                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                              {selectedConversation.contactEmail}
                            </Typography>
                          </Box>
                        </Stack>
                      </Grid>
                      <Grid xs={12} sm={6}>
                        <Box>
                          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                            Atendido por:
                          </Typography>
                          <Typography level="body-md" fontWeight="bold">
                            {selectedConversation.agent}
                          </Typography>
                        </Box>
                      </Grid>
                    </Grid>

                    <Divider sx={{ my: 2 }} />

                    <Grid container spacing={2}>
                      <Grid xs={6} sm={3}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          Inicio
                        </Typography>
                        <Typography level="body-sm">
                          {formatDateTime(selectedConversation.startTime)}
                        </Typography>
                      </Grid>
                      <Grid xs={6} sm={3}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          Fin
                        </Typography>
                        <Typography level="body-sm">
                          {formatDateTime(selectedConversation.endTime)}
                        </Typography>
                      </Grid>
                      <Grid xs={6} sm={3}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          Duración
                        </Typography>
                        <Typography level="body-sm">{selectedConversation.duration} min</Typography>
                      </Grid>
                      <Grid xs={6} sm={3}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          Mensajes
                        </Typography>
                        <Typography level="body-sm">
                          {selectedConversation.messagesCount}
                        </Typography>
                      </Grid>
                    </Grid>

                    <Divider sx={{ my: 2 }} />

                    <Box>
                      <Typography level="body-sm" fontWeight="bold" sx={{ mb: 1 }}>
                        Estado:
                      </Typography>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={getStatusColor(selectedConversation.status)}
                        startDecorator={getStatusIcon(selectedConversation.status)}
                      >
                        {getStatusLabel(selectedConversation.status)}
                      </Chip>
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    <Box>
                      <Typography level="body-sm" fontWeight="bold" sx={{ mb: 1 }}>
                        Satisfacción:
                      </Typography>
                      {renderSatisfactionStars(selectedConversation.satisfaction)}
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    <Box>
                      <Typography level="body-sm" fontWeight="bold" sx={{ mb: 1 }}>
                        Etiquetas:
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        {selectedConversation.tags.map((tag) => (
                          <Chip key={tag} size="sm" variant="soft">
                            {tag}
                          </Chip>
                        ))}
                      </Stack>
                    </Box>

                    {selectedConversation.notes && (
                      <>
                        <Divider sx={{ my: 2 }} />
                        <Box>
                          <Typography level="body-sm" fontWeight="bold" sx={{ mb: 1 }}>
                            Notas:
                          </Typography>
                          <Typography level="body-sm">{selectedConversation.notes}</Typography>
                        </Box>
                      </>
                    )}
                  </CardContent>
                </Card>

                {selectedConversation.messages.length > 0 && (
                  <Card variant="outlined">
                    <CardContent>
                      <Typography level="body-md" fontWeight="bold" sx={{ mb: 2 }}>
                        Transcript de la Conversación
                      </Typography>
                      <Stack spacing={2}>
                        {selectedConversation.messages.map((message, index) => (
                          <Box
                            key={index}
                            sx={{
                              display: 'flex',
                              justifyContent:
                                message.sender === 'agent' ? 'flex-end' : 'flex-start',
                            }}
                          >
                            <Box
                              sx={{
                                maxWidth: '70%',
                                p: 1.5,
                                borderRadius: 'sm',
                                bgcolor:
                                  message.sender === 'agent'
                                    ? 'primary.softBg'
                                    : 'neutral.softBg',
                              }}
                            >
                              <Typography level="body-sm">{message.text}</Typography>
                              <Typography
                                level="body-xs"
                                sx={{ mt: 0.5, color: 'text.tertiary' }}
                              >
                                {formatTime(message.timestamp)}
                              </Typography>
                            </Box>
                          </Box>
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                )}
              </Stack>
            )}
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
