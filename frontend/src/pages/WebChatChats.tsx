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
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  Avatar,
  IconButton,
  Badge,
} from '@mui/joy'
import {
  Chat as ChatIcon,
  Send as SendIcon,
  AttachFile as AttachIcon,
  MoreVert as MoreIcon,
  Close as CloseIcon,
  CheckCircle as ResolvedIcon,
  Schedule as PendingIcon,
  Person as PersonIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'

interface Message {
  id: number
  text: string
  sender: 'user' | 'agent'
  timestamp: string
  read: boolean
}

interface Conversation {
  id: number
  contactName: string
  contactEmail: string
  contactAvatar?: string
  lastMessage: string
  lastMessageTime: string
  unreadCount: number
  status: 'active' | 'pending' | 'resolved'
  agent?: string
  tags: string[]
  messages: Message[]
}

export default function WebChatChats() {
  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: 1,
      contactName: 'María González',
      contactEmail: 'maria@example.com',
      lastMessage: '¿Cuándo llegará mi pedido?',
      lastMessageTime: '2025-01-13T14:30:00Z',
      unreadCount: 2,
      status: 'active',
      agent: 'Juan Pérez',
      tags: ['urgente', 'pedido'],
      messages: [
        {
          id: 1,
          text: 'Hola, necesito ayuda con mi pedido',
          sender: 'user',
          timestamp: '2025-01-13T14:25:00Z',
          read: true,
        },
        {
          id: 2,
          text: 'Por supuesto, ¿cuál es tu número de pedido?',
          sender: 'agent',
          timestamp: '2025-01-13T14:26:00Z',
          read: true,
        },
        {
          id: 3,
          text: 'Es el #12345',
          sender: 'user',
          timestamp: '2025-01-13T14:27:00Z',
          read: true,
        },
        {
          id: 4,
          text: '¿Cuándo llegará mi pedido?',
          sender: 'user',
          timestamp: '2025-01-13T14:30:00Z',
          read: false,
        },
      ],
    },
    {
      id: 2,
      contactName: 'Carlos Rodríguez',
      contactEmail: 'carlos@example.com',
      lastMessage: 'Gracias por la ayuda',
      lastMessageTime: '2025-01-13T13:15:00Z',
      unreadCount: 0,
      status: 'resolved',
      agent: 'Ana López',
      tags: ['consulta'],
      messages: [
        {
          id: 1,
          text: 'Tengo una consulta sobre los precios',
          sender: 'user',
          timestamp: '2025-01-13T13:00:00Z',
          read: true,
        },
        {
          id: 2,
          text: 'Claro, déjame ayudarte con eso',
          sender: 'agent',
          timestamp: '2025-01-13T13:05:00Z',
          read: true,
        },
        {
          id: 3,
          text: 'Gracias por la ayuda',
          sender: 'user',
          timestamp: '2025-01-13T13:15:00Z',
          read: true,
        },
      ],
    },
    {
      id: 3,
      contactName: 'Ana Martínez',
      contactEmail: 'ana@example.com',
      lastMessage: 'Esperando respuesta...',
      lastMessageTime: '2025-01-13T12:00:00Z',
      unreadCount: 1,
      status: 'pending',
      tags: ['nuevo'],
      messages: [
        {
          id: 1,
          text: '¿Tienen disponibilidad para mañana?',
          sender: 'user',
          timestamp: '2025-01-13T12:00:00Z',
          read: false,
        },
      ],
    },
  ])

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(
    conversations[0]
  )
  const [messageText, setMessageText] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'success'
      case 'pending':
        return 'warning'
      case 'resolved':
        return 'neutral'
      default:
        return 'neutral'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return 'Activa'
      case 'pending':
        return 'Pendiente'
      case 'resolved':
        return 'Resuelta'
      default:
        return status
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <ChatIcon />
      case 'pending':
        return <PendingIcon />
      case 'resolved':
        return <ResolvedIcon />
      default:
        return <ChatIcon />
    }
  }

  const filteredConversations = conversations
    .filter((c) => filterStatus === 'all' || c.status === filterStatus)
    .filter((c) =>
      searchTerm
        ? c.contactName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.contactEmail.toLowerCase().includes(searchTerm.toLowerCase())
        : true
    )

  const handleSendMessage = () => {
    if (!messageText.trim() || !selectedConversation) return

    const newMessage: Message = {
      id: selectedConversation.messages.length + 1,
      text: messageText,
      sender: 'agent',
      timestamp: new Date().toISOString(),
      read: true,
    }

    const updatedConversation = {
      ...selectedConversation,
      messages: [...selectedConversation.messages, newMessage],
      lastMessage: messageText,
      lastMessageTime: new Date().toISOString(),
    }

    setConversations(
      conversations.map((c) => (c.id === selectedConversation.id ? updatedConversation : c))
    )
    setSelectedConversation(updatedConversation)
    setMessageText('')
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Hoy'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Ayer'
    } else {
      return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    }
  }

  const stats = {
    total: conversations.length,
    active: conversations.filter((c) => c.status === 'active').length,
    pending: conversations.filter((c) => c.status === 'pending').length,
    resolved: conversations.filter((c) => c.status === 'resolved').length,
    unread: conversations.reduce((acc, c) => acc + c.unreadCount, 0),
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <ChatIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Conversaciones WebChat</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Gestión de conversaciones activas con Socket.IO en tiempo real
              </Typography>
            </Box>
          </Stack>
          <Button variant="outlined" color="neutral" startDecorator={<RefreshIcon />}>
            Actualizar
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
                  Activas
                </Typography>
                <Typography level="h2" sx={{ color: 'success.main' }}>
                  {stats.active}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={6} sm={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Pendientes
                </Typography>
                <Typography level="h2" sx={{ color: 'warning.main' }}>
                  {stats.pending}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={6} sm={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Sin Leer
                </Typography>
                <Typography level="h2" sx={{ color: 'danger.main' }}>
                  {stats.unread}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Chat Interface */}
        <Card>
          <Box sx={{ display: 'flex', height: 600 }}>
            {/* Conversations List */}
            <Box
              sx={{
                width: 350,
                borderRight: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Search and Filters */}
              <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Input
                  placeholder="Buscar conversaciones..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  startDecorator={<SearchIcon />}
                  size="sm"
                  sx={{ mb: 1 }}
                />
                <Select
                  value={filterStatus}
                  onChange={(_, value) => setFilterStatus(value as string)}
                  size="sm"
                >
                  <Option value="all">Todas ({stats.total})</Option>
                  <Option value="active">Activas ({stats.active})</Option>
                  <Option value="pending">Pendientes ({stats.pending})</Option>
                  <Option value="resolved">Resueltas ({stats.resolved})</Option>
                </Select>
              </Box>

              {/* Conversations */}
              <List sx={{ flexGrow: 1, overflow: 'auto', p: 0 }}>
                {filteredConversations.map((conversation) => (
                  <ListItem key={conversation.id} sx={{ p: 0 }}>
                    <ListItemButton
                      selected={selectedConversation?.id === conversation.id}
                      onClick={() => setSelectedConversation(conversation)}
                      sx={{ p: 2 }}
                    >
                      <Badge
                        badgeContent={conversation.unreadCount}
                        color="danger"
                        size="sm"
                        sx={{ mr: 2 }}
                      >
                        <Avatar src={conversation.contactAvatar}>
                          {conversation.contactName.charAt(0)}
                        </Avatar>
                      </Badge>
                      <ListItemContent>
                        <Stack direction="row" justifyContent="space-between">
                          <Typography level="body-md" fontWeight="bold">
                            {conversation.contactName}
                          </Typography>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {formatDate(conversation.lastMessageTime)}
                          </Typography>
                        </Stack>
                        <Typography level="body-sm" sx={{ color: 'text.tertiary' }} noWrap>
                          {conversation.lastMessage}
                        </Typography>
                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                          <Chip
                            size="sm"
                            variant="soft"
                            color={getStatusColor(conversation.status)}
                            startDecorator={getStatusIcon(conversation.status)}
                          >
                            {getStatusLabel(conversation.status)}
                          </Chip>
                          {conversation.agent && (
                            <Chip size="sm" variant="outlined" color="neutral">
                              {conversation.agent}
                            </Chip>
                          )}
                        </Stack>
                      </ListItemContent>
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Box>

            {/* Chat Area */}
            {selectedConversation ? (
              <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Chat Header */}
                <Box
                  sx={{
                    p: 2,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar src={selectedConversation.contactAvatar}>
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
                  <Stack direction="row" spacing={1}>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={getStatusColor(selectedConversation.status)}
                    >
                      {getStatusLabel(selectedConversation.status)}
                    </Chip>
                    <IconButton size="sm" variant="plain">
                      <MoreIcon />
                    </IconButton>
                    <IconButton size="sm" variant="plain" onClick={() => setSelectedConversation(null)}>
                      <CloseIcon />
                    </IconButton>
                  </Stack>
                </Box>

                {/* Messages */}
                <Box sx={{ flexGrow: 1, p: 2, overflow: 'auto', bgcolor: 'background.level1' }}>
                  <Stack spacing={2}>
                    {selectedConversation.messages.map((message) => (
                      <Box
                        key={message.id}
                        sx={{
                          display: 'flex',
                          justifyContent: message.sender === 'agent' ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <Box
                          sx={{
                            maxWidth: '70%',
                            p: 1.5,
                            borderRadius: 'sm',
                            bgcolor:
                              message.sender === 'agent' ? 'primary.main' : 'neutral.softBg',
                            color: message.sender === 'agent' ? 'white' : 'text.primary',
                          }}
                        >
                          <Typography level="body-sm">{message.text}</Typography>
                          <Typography
                            level="body-xs"
                            sx={{
                              mt: 0.5,
                              color: message.sender === 'agent' ? 'white' : 'text.tertiary',
                              opacity: 0.8,
                            }}
                          >
                            {formatTime(message.timestamp)}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                </Box>

                {/* Contact Info Sidebar */}
                <Box
                  sx={{
                    p: 2,
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.level2',
                  }}
                >
                  <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                    {selectedConversation.tags.map((tag) => (
                      <Chip key={tag} size="sm" variant="soft">
                        {tag}
                      </Chip>
                    ))}
                  </Stack>
                  {selectedConversation.agent && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <PersonIcon sx={{ fontSize: 16, color: 'text.tertiary' }} />
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        Atendido por: {selectedConversation.agent}
                      </Typography>
                    </Stack>
                  )}
                </Box>

                {/* Message Input */}
                <Box
                  sx={{
                    p: 2,
                    borderTop: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Stack direction="row" spacing={1}>
                    <IconButton variant="plain" color="neutral">
                      <AttachIcon />
                    </IconButton>
                    <Input
                      placeholder="Escribe un mensaje..."
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      sx={{ flexGrow: 1 }}
                    />
                    <Button
                      variant="solid"
                      color="primary"
                      onClick={handleSendMessage}
                      disabled={!messageText.trim()}
                      startDecorator={<SendIcon />}
                    >
                      Enviar
                    </Button>
                  </Stack>
                </Box>
              </Box>
            ) : (
              <Box
                sx={{
                  flexGrow: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Stack alignItems="center" spacing={2}>
                  <ChatIcon sx={{ fontSize: 64, color: 'text.tertiary' }} />
                  <Typography level="body-lg" sx={{ color: 'text.tertiary' }}>
                    Selecciona una conversación para comenzar
                  </Typography>
                </Stack>
              </Box>
            )}
          </Box>
        </Card>
      </Stack>
    </Container>
  )
}
