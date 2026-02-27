import { useState } from 'react'
import {
  Typography,
  Stack,
  Container,
  Card,
  CardContent,
  Box,
  Grid,
  Avatar,
  Chip,
  Input,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  Textarea,
  Button,
} from '@mui/joy'
import {
  Chat as ChatIcon,
  Search as SearchIcon,
  Send as SendIcon,
  MoreVert as MoreIcon,
  AttachFile as AttachIcon,
  EmojiEmotions as EmojiIcon,
} from '@mui/icons-material'

export default function RealtimeChats() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedChat, setSelectedChat] = useState(1)
  const [message, setMessage] = useState('')

  const chats = [
    {
      id: 1,
      name: 'Juan Pérez',
      lastMessage: 'Hola, necesito ayuda con mi pedido',
      time: '10:30 AM',
      unread: 2,
      status: 'online',
      avatar: '',
    },
    {
      id: 2,
      name: 'María García',
      lastMessage: '¿Cuándo llega mi producto?',
      time: '10:15 AM',
      unread: 0,
      status: 'online',
      avatar: '',
    },
    {
      id: 3,
      name: 'Carlos López',
      lastMessage: 'Gracias por la información',
      time: '9:45 AM',
      unread: 0,
      status: 'offline',
      avatar: '',
    },
    {
      id: 4,
      name: 'Ana Martínez',
      lastMessage: 'Me interesa conocer más...',
      time: '9:30 AM',
      unread: 5,
      status: 'online',
      avatar: '',
    },
  ]

  const messages = [
    {
      id: 1,
      sender: 'client',
      text: 'Hola, necesito ayuda con mi pedido',
      time: '10:30 AM',
    },
    {
      id: 2,
      sender: 'agent',
      text: '¡Hola! Claro, con gusto te ayudo. ¿Cuál es tu número de pedido?',
      time: '10:31 AM',
    },
    {
      id: 3,
      sender: 'client',
      text: 'Es el #12345',
      time: '10:32 AM',
    },
    {
      id: 4,
      sender: 'agent',
      text: 'Perfecto, déjame revisar tu pedido...',
      time: '10:33 AM',
    },
  ]

  const handleSend = () => {
    if (message.trim()) {
      console.log('Sending message:', message)
      setMessage('')
    }
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center">
          <ChatIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography level="h2">Chats en Tiempo Real</Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              Conversaciones activas en tiempo real
            </Typography>
          </Box>
        </Stack>

        {/* Stats */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Chats Activos
                </Typography>
                <Typography level="h2">24</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  En Espera
                </Typography>
                <Typography level="h2" sx={{ color: 'warning.main' }}>
                  8
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Resueltos Hoy
                </Typography>
                <Typography level="h2" sx={{ color: 'success.main' }}>
                  67
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Tiempo Promedio
                </Typography>
                <Typography level="h2">8m 32s</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Chat Interface */}
        <Grid container spacing={2}>
          {/* Chat List */}
          <Grid xs={12} md={4}>
            <Card sx={{ height: 600 }}>
              <CardContent sx={{ p: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Box sx={{ p: 2 }}>
                  <Input
                    placeholder="Buscar chats..."
                    startDecorator={<SearchIcon />}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </Box>
                <List sx={{ overflow: 'auto', flexGrow: 1 }}>
                  {chats.map((chat) => (
                    <ListItem key={chat.id}>
                      <ListItemButton
                        selected={selectedChat === chat.id}
                        onClick={() => setSelectedChat(chat.id)}
                      >
                        <Avatar size="sm" sx={{ mr: 2 }}>
                          {chat.name.charAt(0)}
                        </Avatar>
                        <ListItemContent>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography level="body-sm" fontWeight="bold">
                              {chat.name}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              {chat.time}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography level="body-xs" noWrap sx={{ maxWidth: 200 }}>
                              {chat.lastMessage}
                            </Typography>
                            {chat.unread > 0 && (
                              <Chip size="sm" color="danger" variant="solid">
                                {chat.unread}
                              </Chip>
                            )}
                          </Box>
                        </ListItemContent>
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Chat Messages */}
          <Grid xs={12} md={8}>
            <Card sx={{ height: 600 }}>
              <CardContent sx={{ p: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Chat Header */}
                <Box
                  sx={{
                    p: 2,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar>J</Avatar>
                    <Box>
                      <Typography level="body-sm" fontWeight="bold">
                        Juan Pérez
                      </Typography>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        En línea
                      </Typography>
                    </Box>
                  </Stack>
                  <IconButton size="sm" variant="plain">
                    <MoreIcon />
                  </IconButton>
                </Box>

                {/* Messages */}
                <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
                  <Stack spacing={2}>
                    {messages.map((msg) => (
                      <Box
                        key={msg.id}
                        sx={{
                          display: 'flex',
                          justifyContent: msg.sender === 'agent' ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <Box
                          sx={{
                            maxWidth: '70%',
                            bgcolor: msg.sender === 'agent' ? 'primary.main' : 'background.level2',
                            color: msg.sender === 'agent' ? 'white' : 'text.primary',
                            p: 1.5,
                            borderRadius: 'md',
                          }}
                        >
                          <Typography level="body-sm">{msg.text}</Typography>
                          <Typography
                            level="body-xs"
                            sx={{
                              color: msg.sender === 'agent' ? 'rgba(255,255,255,0.7)' : 'text.tertiary',
                              mt: 0.5,
                            }}
                          >
                            {msg.time}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                </Box>

                {/* Message Input */}
                <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Stack direction="row" spacing={1} alignItems="flex-end">
                    <IconButton size="sm" variant="plain">
                      <AttachIcon />
                    </IconButton>
                    <IconButton size="sm" variant="plain">
                      <EmojiIcon />
                    </IconButton>
                    <Textarea
                      placeholder="Escribe tu mensaje..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      minRows={1}
                      maxRows={4}
                      sx={{ flexGrow: 1 }}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSend()
                        }
                      }}
                    />
                    <Button
                      onClick={handleSend}
                      startDecorator={<SendIcon />}
                      disabled={!message.trim()}
                    >
                      Enviar
                    </Button>
                  </Stack>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Stack>
    </Container>
  )
}
