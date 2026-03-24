import { useState, useEffect, useRef } from 'react'
import {
  Typography,
  Stack,
  Container,
  Card,
  CardContent,
  Box,
  Grid,
  Button,
  IconButton,
  Avatar,
  Input,
  Divider,
  Chip,
  Sheet,
  List,
  ListItem,
  ListItemButton,
  ListItemContent,
  ListItemDecorator,
  Badge,
  Textarea,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Dropdown,
  Menu,
  MenuButton,
  MenuItem,
} from '@mui/joy'
import {
  Forum as InternalChatIcon,
  Add as AddIcon,
  Search as SearchIcon,
  Send as SendIcon,
  AttachFile as AttachIcon,
  MoreVert as MoreIcon,
  Group as GroupIcon,
  EmojiEmotions as EmojiIcon,
  Refresh as RefreshIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  PushPin as PinIcon,
} from '@mui/icons-material'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { useInternalChatSocket } from '../hooks/useInternalChatSocket'

interface User {
  id: number
  name: string
  email?: string
  online?: boolean
  lastSeen?: string
  avatar?: string
}

interface ChatUser {
  id: number
  userId: number
  chatId: number
  unreads: number
  user?: User
}

interface Message {
  id: number
  chatId: number
  senderId: number
  senderName?: string
  message: string
  mediaPath?: string
  mediaName?: string
  mediaUrl?: string
  mediaType?: string
  createdAt: string
  status?: string
}

interface Chat {
  id: number
  uuid: string
  title: string
  ownerId: number
  lastMessage?: string
  companyId: number
  createdAt: string
  updatedAt: string
  owner?: User
  users: ChatUser[]
  messages?: Message[]
  // Computed properties for UI
  name?: string
  type?: 'direct' | 'group'
  participants?: User[]
  unreadCount?: number
  lastMessageTime?: string
}

export default function InternalChats() {
  const [chats, setChats] = useState<Chat[]>([])
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const { user: authUser } = useAuth()
  const currentUser: User = authUser || {
    id: 0,
    name: 'Usuario',
    email: '',
    online: false,
  }
  const isAdminOrSuper = authUser?.profile === 'admin' || authUser?.super === true
  const isChatOwner = (chat: Chat) => chat.ownerId === currentUser.id
  const canModifyChat = (chat: Chat) => isAdminOrSuper || isChatOwner(chat)
  const [message, setMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [, setLoading] = useState(true)
  const [openNewChatModal, setOpenNewChatModal] = useState(false)
  const [availableUsers, setAvailableUsers] = useState<User[]>([])
  const [selectedUsers, setSelectedUsers] = useState<number[]>([])
  const [chatTitle, setChatTitle] = useState('')
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)

  useEffect(() => {
    fetchChats()
  }, [])

  // ─── Socket en tiempo real ─────────────────────────────────────────────────
  useInternalChatSocket({
    user: authUser ? { id: authUser.id, companyId: authUser.companyId } : null,
    chats,
    setChats,
    selectedChat,
    setSelectedChat,
    onNewMessage: () => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    },
    onUnreadChange: () => {
      window.dispatchEvent(new CustomEvent('chatUnreadsChange', { detail: {} }))
    },
  })

  useEffect(() => {
    scrollToBottom()
  }, [selectedChat?.messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Transform backend chat data to UI format
  const transformChat = (chat: Chat): Chat => {
    try {
      // Determine if it's a group chat (more than 2 users including owner)
      const isGroup = (chat.users?.length || 0) > 1

      // Get participants (users excluding current user)
      const participants = (chat.users || [])
        .filter(cu => cu.userId !== currentUser.id)
        .map(cu => cu.user)
        .filter((u): u is User => u !== undefined)

      // Calculate total unread count
      const unreadCount = (chat.users || [])
        .filter(cu => cu.userId === currentUser.id)
        .reduce((sum, cu) => sum + (cu.unreads || 0), 0)

      return {
        ...chat,
        name: chat.title || (isGroup ? 'Grupo sin nombre' : participants[0]?.name || 'Chat'),
        type: isGroup ? 'group' : 'direct',
        participants,
        unreadCount,
        messages: chat.messages || []
      }
    } catch (error) {
      console.error('Error transforming chat:', error, chat)
      // Return chat with minimal transformation on error
      return {
        ...chat,
        name: chat.title || 'Chat',
        type: 'direct',
        participants: [],
        unreadCount: 0,
        messages: []
      }
    }
  }

  const fetchChats = async () => {
    try {
      setLoading(true)
      const response = await api.get('/chats')
      console.log('Chats API full response:', response)
      console.log('Chats API data:', response.data)

      // Backend returns { records, count, hasMore }
      const chatsData = Array.isArray(response.data)
        ? response.data
        : (response.data.records || [])

      console.log('Chats data extracted:', chatsData)

      // Transform chats to UI format
      const transformedChats = chatsData.map(transformChat)
      console.log('Transformed chats:', transformedChats)

      setChats(transformedChats)
    } catch (error) {
      console.error('Error fetching chats:', error)
      // Set empty array on error instead of mock data
      setChats([])
      /*
      // Mock data removed - using real API data only
      const mockChats: Chat[] = []
      /*
      [
        {
          id: 1,
          name: 'María López',
          type: 'direct',
          participants: [
            {
              id: 2,
              name: 'María López',
              email: 'maria.lopez@empresa.com',
              online: true,
              avatar: '',
            },
          ],
          lastMessage: '¿Cómo va el ticket #1234?',
          lastMessageTime: '2025-01-12T16:30:00',
          unreadCount: 2,
          messages: [
            {
              id: 1,
              chatId: 1,
              senderId: 2,
              senderName: 'María López',
              content: 'Hola, necesito ayuda con el ticket #1234',
              type: 'text',
              createdAt: '2025-01-12T16:25:00',
              read: true,
            },
            {
              id: 2,
              chatId: 1,
              senderId: 1,
              senderName: 'Usuario Actual',
              content: 'Claro, déjame revisarlo',
              type: 'text',
              createdAt: '2025-01-12T16:26:00',
              read: true,
            },
            {
              id: 3,
              chatId: 1,
              senderId: 2,
              senderName: 'María López',
              content: '¿Cómo va el ticket #1234?',
              type: 'text',
              createdAt: '2025-01-12T16:30:00',
              read: false,
            },
          ],
        },
        {
          id: 2,
          name: 'Equipo de Ventas',
          type: 'group',
          participants: [
            {
              id: 3,
              name: 'Carlos Ruiz',
              email: 'carlos.ruiz@empresa.com',
              online: true,
            },
            {
              id: 4,
              name: 'Ana García',
              email: 'ana.garcia@empresa.com',
              online: false,
              lastSeen: '2025-01-12T15:00:00',
            },
            {
              id: 5,
              name: 'Pedro Sánchez',
              email: 'pedro.sanchez@empresa.com',
              online: true,
            },
          ],
          lastMessage: 'Reunión a las 3pm',
          lastMessageTime: '2025-01-12T14:00:00',
          unreadCount: 0,
          messages: [
            {
              id: 4,
              chatId: 2,
              senderId: 3,
              senderName: 'Carlos Ruiz',
              content: 'Chicos, tenemos reunión a las 3pm',
              type: 'text',
              createdAt: '2025-01-12T14:00:00',
              read: true,
            },
            {
              id: 5,
              chatId: 2,
              senderId: 5,
              senderName: 'Pedro Sánchez',
              content: 'Perfecto, ahí estaré',
              type: 'text',
              createdAt: '2025-01-12T14:05:00',
              read: true,
            },
          ],
        },
        {
          id: 3,
          name: 'Soporte Técnico',
          type: 'group',
          participants: [
            {
              id: 6,
              name: 'Laura Martínez',
              online: true,
            },
            {
              id: 7,
              name: 'Roberto Díaz',
              online: true,
            },
            {
              id: 8,
              name: 'Sofía Torres',
              online: false,
              lastSeen: '2025-01-12T12:00:00',
            },
          ],
          lastMessage: 'Cliente reporta error en el sistema',
          lastMessageTime: '2025-01-12T10:30:00',
          unreadCount: 5,
          messages: [
            {
              id: 6,
              chatId: 3,
              senderId: 6,
              senderName: 'Laura Martínez',
              content: 'Cliente reporta error en el sistema',
              type: 'text',
              createdAt: '2025-01-12T10:30:00',
              read: false,
            },
          ],
        },
        {
          id: 4,
          name: 'Juan Pérez',
          type: 'direct',
          participants: [
            {
              id: 9,
              name: 'Juan Pérez',
              online: false,
              lastSeen: '2025-01-11T18:00:00',
            },
          ],
          lastMessage: 'Gracias por tu ayuda',
          lastMessageTime: '2025-01-11T17:45:00',
          unreadCount: 0,
          messages: [
            {
              id: 7,
              chatId: 4,
              senderId: 9,
              senderName: 'Juan Pérez',
              content: '¿Me puedes ayudar con este cliente?',
              type: 'text',
              createdAt: '2025-01-11T17:30:00',
              read: true,
            },
            {
              id: 8,
              chatId: 4,
              senderId: 1,
              senderName: 'Usuario Actual',
              content: 'Claro, cuéntame',
              type: 'text',
              createdAt: '2025-01-11T17:35:00',
              read: true,
            },
            {
              id: 9,
              chatId: 4,
              senderId: 9,
              senderName: 'Juan Pérez',
              content: 'Gracias por tu ayuda',
              type: 'text',
              createdAt: '2025-01-11T17:45:00',
              read: true,
            },
          ],
        },
      ]
      setChats(mockChats)
      setSelectedChat(mockChats[0])
      */
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessage = async () => {
    if ((!message.trim() && !selectedFile) || !selectedChat) return

    const text = message
    const file = selectedFile
    setMessage('')
    setSelectedFile(null)
    setFilePreview(null)

    try {
      const formData = new FormData()
      if (text.trim()) formData.append('message', text)
      if (file) formData.append('file', file)

      const response = await api.post(`/chats/${selectedChat.id}/messages`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      const newMsg: Message = {
        id: response.data.id,
        chatId: selectedChat.id,
        senderId: currentUser.id,
        senderName: currentUser.name,
        message: response.data.message || '',
        mediaPath: response.data.mediaPath,
        mediaName: response.data.mediaName,
        mediaUrl: response.data.mediaPath
          ? `/public/${response.data.mediaPath}`
          : undefined,
        mediaType: response.data.mediaName
          ? getMediaType(response.data.mediaName)
          : undefined,
        createdAt: response.data.createdAt,
        status: 'sent',
      }

      setSelectedChat(prev => {
        if (!prev) return prev
        return { ...prev, messages: [...(prev.messages || []), newMsg] }
      })

      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })

      setChats(prev => prev.map(c =>
        c.id === selectedChat.id
          ? { ...c, lastMessage: text || (file ? '📎 Archivo' : '') }
          : c
      ))
    } catch (error) {
      console.error('Error sending message:', error)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const fetchChatMessages = async (chatId: number) => {
    try {
      const response = await api.get(`/chats/${chatId}/messages`)
      console.log('Chat messages API response:', response.data)

      // Backend returns { records, count, hasMore }
      const messagesData = Array.isArray(response.data)
        ? response.data
        : (response.data.records || [])

      console.log('Messages extracted:', messagesData)
      return messagesData.map((m: any) => ({
        ...m,
        senderName: m.sender?.name || `Usuario ${m.senderId}`,
        mediaType: m.mediaName ? getMediaType(m.mediaName) : undefined,
        mediaUrl: m.mediaPath ? `/public/${m.mediaPath}` : undefined,
      }))
    } catch (error) {
      console.error('Error fetching chat messages:', error)
      return []
    }
  }

  const handleSelectChat = async (chat: Chat) => {
    // Set selected chat immediately
    setSelectedChat(chat)

    // Load messages for this chat
    const messages = await fetchChatMessages(chat.id)

    // Update selected chat with messages
    setSelectedChat({
      ...chat,
      messages
    })

    // Mark as read
    try {
      await api.post(`/chats/${chat.id}/read`, { userId: currentUser.id })
    } catch { /* silent */ }

    // Notify sidebar badge
    window.dispatchEvent(new CustomEvent('chatUnreadsChange', { detail: {} }))
  }

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users')
      console.log('Users API response:', response.data)
      const usersData = Array.isArray(response.data)
        ? response.data
        : (response.data.users || response.data.records || [])
      setAvailableUsers(usersData.filter((u: User) => u.id !== currentUser.id))
    } catch (error) {
      console.error('Error fetching users:', error)
      setAvailableUsers([])
    }
  }

  const openNewChatModalHandler = () => {
    setOpenNewChatModal(true)
    setSelectedUsers([])
    setChatTitle('')
    setUserSearchTerm('')
    fetchUsers()
  }

  const handleUserToggle = (userId: number) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const handleCreateChat = async () => {
    if (selectedUsers.length === 0) {
      alert('Por favor selecciona al menos un usuario')
      return
    }

    try {
      // Backend expects users as array of objects with id property
      const usersFormatted = selectedUsers.map(userId => ({ id: userId }))

      const response = await api.post('/chats', {
        users: usersFormatted,
        title: selectedUsers.length > 1 ? chatTitle || 'Grupo sin nombre' : chatTitle
      })

      console.log('Chat created:', response.data)

      // Refresh chats list
      await fetchChats()

      // Select the new chat
      const newChat = response.data
      if (newChat) {
        const transformedChat = transformChat(newChat)
        await handleSelectChat(transformedChat)
      }

      // Close modal
      setOpenNewChatModal(false)
      setChatTitle('')
      setSelectedUsers([])
    } catch (error) {
      console.error('Error creating chat:', error)
      alert('Error al crear el chat. Por favor intenta de nuevo.')
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)

    if (diffInHours < 24) {
      return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    } else {
      return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
    }
  }

  // ─── Media helpers ──────────────────────────────────────────────────────────
  const getMediaType = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video'
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio'
    return 'document'
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 50 * 1024 * 1024) {
      alert('El archivo excede el límite de 50MB')
      return
    }
    setSelectedFile(file)
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      const reader = new FileReader()
      reader.onload = (ev) => setFilePreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  const handleDeleteChat = async (chatId: number) => {
    if (!confirm('¿Estás seguro de eliminar este chat?')) return
    try {
      await api.delete(`/chats/${chatId}`)
      setChats(prev => prev.filter(c => c.id !== chatId))
      setSelectedChat(null)
    } catch {
      alert('Error al eliminar chat')
    }
  }

  const renderMedia = (msg: Message) => {
    if (!msg.mediaPath && !msg.mediaName) return null

    const mediaUrl = msg.mediaUrl || `/public/${msg.mediaPath}`
    const mediaType = msg.mediaType || getMediaType(msg.mediaName || '')
    const filename = msg.mediaName || 'Archivo'

    if (mediaType === 'image') {
      return (
        <Box
          component="a"
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ display: 'block', mb: 0.5 }}
          onClick={(e) => { e.preventDefault(); window.open(mediaUrl, '_blank') }}
        >
          <Box
            component="img"
            src={mediaUrl}
            alt={filename}
            sx={{
              maxWidth: '100%',
              maxHeight: 250,
              borderRadius: 'sm',
              objectFit: 'cover',
              cursor: 'pointer',
            }}
          />
        </Box>
      )
    }

    if (mediaType === 'video') {
      return (
        <Box sx={{ mb: 0.5 }}>
          <video
            src={mediaUrl}
            controls
            style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }}
          />
          <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
            {filename}
          </Typography>
        </Box>
      )
    }

    if (mediaType === 'audio') {
      return (
        <Box sx={{ mb: 0.5 }}>
          <audio
            src={mediaUrl}
            controls
            style={{ width: '100%', maxWidth: 300 }}
          />
          <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
            {filename}
          </Typography>
        </Box>
      )
    }

    return (
      <Box
        component="a"
        href={mediaUrl}
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1,
          borderRadius: 'sm',
          bgcolor: 'background.level2',
          textDecoration: 'none',
          '&:hover': { bgcolor: 'background.level3' },
          mb: 0.5,
        }}
      >
        <AttachIcon fontSize="small" />
        <Typography
          level="body-sm"
          sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {filename}
        </Typography>
      </Box>
    )
  }

  const filteredChats = chats.filter(
    (chat) =>
      (chat.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      chat.lastMessage?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const stats = {
    activeChats: chats.filter((c) => (c.unreadCount || 0) > 0).length,
    totalMessages: chats.reduce((sum, chat) => sum + (chat.messages?.length || 0), 0),
    onlineUsers: chats.reduce(
      (sum, chat) => sum + (chat.participants?.filter((p) => p.online).length || 0),
      0
    ),
    groups: chats.filter((c) => c.type === 'group').length,
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <InternalChatIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Chats Internos</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Comunicación en tiempo real entre miembros del equipo
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <IconButton variant="outlined" color="neutral" onClick={fetchChats}>
              <RefreshIcon />
            </IconButton>
            {isAdminOrSuper && (
              <Button startDecorator={<AddIcon />} color="primary" onClick={openNewChatModalHandler}>
                Nuevo Chat
              </Button>
            )}
          </Stack>
        </Stack>

        {/* Stats */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Conversaciones Activas
                </Typography>
                <Typography level="h2">{stats.activeChats}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Total Mensajes
                </Typography>
                <Typography level="h2">{stats.totalMessages}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Usuarios Online
                </Typography>
                <Typography level="h2" sx={{ color: 'success.main' }}>
                  {stats.onlineUsers}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Grupos
                </Typography>
                <Typography level="h2">{stats.groups}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Chat Interface */}
        <Card sx={{ height: 600 }}>
          <Box sx={{ display: 'flex', height: '100%' }}>
            {/* Chat List Sidebar */}
            <Box
              sx={{
                width: 320,
                borderRight: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box sx={{ p: 2 }}>
                <Input
                  placeholder="Buscar conversaciones..."
                  startDecorator={<SearchIcon />}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </Box>
              <Divider />
              <Sheet sx={{ overflow: 'auto', flex: 1 }}>
                <List>
                  {filteredChats.map((chat) => (
                    <ListItem key={chat.id}>
                      <ListItemButton
                        selected={selectedChat?.id === chat.id}
                        onClick={() => handleSelectChat(chat)}
                      >
                        <ListItemDecorator>
                          <Badge
                            badgeContent={chat.unreadCount}
                            color="danger"
                            size="sm"
                            invisible={chat.unreadCount === 0}
                          >
                            {chat.type === 'group' ? (
                              <Avatar size="sm">
                                <GroupIcon />
                              </Avatar>
                            ) : (
                              <Avatar size="sm">{(chat.name || 'C').charAt(0)}</Avatar>
                            )}
                          </Badge>
                        </ListItemDecorator>
                        <ListItemContent>
                          <Stack direction="row" justifyContent="space-between" alignItems="start">
                            <Box sx={{ flex: 1 }}>
                              <Typography level="title-sm">{chat.name || 'Chat'}</Typography>
                              <Typography
                                level="body-xs"
                                sx={{
                                  color: 'text.tertiary',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  fontWeight: (chat.unreadCount || 0) > 0 ? 'bold' : 'normal',
                                }}
                              >
                                {chat.lastMessage}
                              </Typography>
                            </Box>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary', ml: 1 }}>
                              {chat.lastMessageTime && formatTime(chat.lastMessageTime)}
                            </Typography>
                          </Stack>
                        </ListItemContent>
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </Sheet>
            </Box>

            {/* Chat Messages Area */}
            {selectedChat ? (
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Chat Header */}
                <Box
                  sx={{
                    p: 2,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.surface',
                  }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={2} alignItems="center">
                      {selectedChat.type === 'group' ? (
                        <Avatar>
                          <GroupIcon />
                        </Avatar>
                      ) : (
                        <Badge
                          badgeInset="14%"
                          color={
                            selectedChat.participants?.[0]?.online ? 'success' : 'neutral'
                          }
                          sx={{
                            '& .MuiBadge-badge': {
                              '&::after': {
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                borderRadius: '50%',
                                animation: selectedChat.participants?.[0]?.online
                                  ? 'ripple 1.2s infinite ease-in-out'
                                  : 'none',
                                border: '1px solid currentColor',
                                content: '""',
                              },
                            },
                            '@keyframes ripple': {
                              '0%': {
                                transform: 'scale(.8)',
                                opacity: 1,
                              },
                              '100%': {
                                transform: 'scale(2.4)',
                                opacity: 0,
                              },
                            },
                          }}
                        >
                          <Avatar>{(selectedChat.name || 'C').charAt(0)}</Avatar>
                        </Badge>
                      )}
                      <Box>
                        <Typography level="title-md">{selectedChat.name || 'Chat'}</Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {selectedChat.type === 'group'
                            ? `${selectedChat.participants?.length || 0} miembros, ${selectedChat.participants?.filter((p) => p.online).length || 0} en línea`
                            : selectedChat.participants?.[0]?.online
                              ? 'En línea'
                              : selectedChat.participants?.[0]?.lastSeen
                                ? `Última vez ${formatTime(selectedChat.participants[0].lastSeen)}`
                                : 'Sin conexión reciente'}
                        </Typography>
                      </Box>
                    </Stack>
                    <Dropdown>
                      <MenuButton size="sm" variant="plain">
                        <MoreIcon />
                      </MenuButton>
                      <Menu placement="bottom-end">
                        {canModifyChat(selectedChat) && (
                          <>
                            <MenuItem color="danger" onClick={() => handleDeleteChat(selectedChat.id)}>
                              <DeleteIcon sx={{ mr: 1, fontSize: 18 }} />
                              Eliminar Chat
                            </MenuItem>
                            <Divider />
                          </>
                        )}
                        <MenuItem onClick={() => alert('Mensajes fijados: en desarrollo')}>
                          <PinIcon sx={{ mr: 1, fontSize: 18 }} />
                          Mensajes Fijados
                        </MenuItem>
                      </Menu>
                    </Dropdown>
                  </Stack>
                </Box>

                {/* Messages */}
                <Box
                  sx={{
                    flex: 1,
                    overflow: 'auto',
                    p: 2,
                    bgcolor: 'background.level1',
                  }}
                >
                  <Stack spacing={2}>
                    {(selectedChat.messages || []).map((msg) => {
                      const isOwn = msg.senderId === currentUser.id
                      return (
                        <Box
                          key={msg.id}
                          sx={{
                            display: 'flex',
                            justifyContent: isOwn ? 'flex-end' : 'flex-start',
                          }}
                        >
                          <Box
                            sx={{
                              maxWidth: '70%',
                              bgcolor: isOwn ? 'primary.softBg' : 'background.surface',
                              p: 1.5,
                              borderRadius: 'md',
                              border: '1px solid',
                              borderColor: isOwn ? 'primary.outlinedBorder' : 'divider',
                            }}
                          >
                            {!isOwn && selectedChat.type === 'group' && (
                              <Typography level="body-xs" sx={{ color: 'primary.main', mb: 0.5 }}>
                                {msg.senderName || `Usuario ${msg.senderId}`}
                              </Typography>
                            )}
                            {renderMedia(msg)}
                            {msg.message && (
                              <Typography level="body-sm">{msg.message}</Typography>
                            )}
                            <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end" sx={{ mt: 0.5 }}>
                              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                {formatTime(msg.createdAt)}
                              </Typography>
                              {isOwn && (
                                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                  {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}
                                </Typography>
                              )}
                            </Stack>
                          </Box>
                        </Box>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </Stack>
                </Box>

                {/* Message Input */}
                <Box
                  sx={{
                    p: 2,
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.surface',
                  }}
                >
                  {/* Input file oculto */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.csv,.txt"
                  />
                  {/* Preview del archivo seleccionado */}
                  {selectedFile && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, mb: 1, bgcolor: 'background.level2', borderRadius: 'sm' }}>
                      {filePreview ? (
                        <Box
                          component="img"
                          src={filePreview}
                          alt="Preview"
                          sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 1 }}
                        />
                      ) : (
                        <Avatar size="sm"><AttachIcon /></Avatar>
                      )}
                      <Typography level="body-sm" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {selectedFile.name}
                      </Typography>
                      <IconButton size="sm" onClick={() => { setSelectedFile(null); setFilePreview(null) }}>
                        <CloseIcon />
                      </IconButton>
                    </Box>
                  )}
                  <Stack direction="row" spacing={1} alignItems="end">
                    <IconButton
                      size="sm"
                      variant="plain"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <AttachIcon color={selectedFile ? 'primary' : undefined} />
                    </IconButton>
                    <Textarea
                      placeholder="Escribe un mensaje..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      minRows={1}
                      maxRows={4}
                      sx={{ flex: 1 }}
                    />
                    <IconButton
                      color="primary"
                      onClick={handleSendMessage}
                      disabled={!message.trim() && !selectedFile}
                    >
                      <SendIcon />
                    </IconButton>
                  </Stack>
                </Box>
              </Box>
            ) : (
              <Box
                sx={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Box sx={{ textAlign: 'center' }}>
                  <InternalChatIcon sx={{ fontSize: 64, color: 'text.tertiary', mb: 2 }} />
                  <Typography level="h4" sx={{ mb: 1 }}>
                    Selecciona una conversación
                  </Typography>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Elige un chat para comenzar a conversar
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        </Card>

        {/* Modal New Chat */}
        <Modal open={openNewChatModal} onClose={() => setOpenNewChatModal(false)}>
          <ModalDialog sx={{ minWidth: 500, maxWidth: 600 }}>
            <ModalClose />
            <Typography level="h4" sx={{ mb: 2 }}>
              Nuevo Chat Interno
            </Typography>
            <Stack spacing={2}>
              {/* Chat Title */}
              <FormControl>
                <FormLabel>Título del Chat (opcional)</FormLabel>
                <Input
                  value={chatTitle}
                  onChange={(e) => setChatTitle(e.target.value)}
                  placeholder={selectedUsers.length > 1 ? 'Ej: Equipo de Ventas' : 'Opcional para chats directos'}
                />
              </FormControl>

              {/* User Search */}
              <FormControl>
                <FormLabel>Buscar Usuarios</FormLabel>
                <Input
                  placeholder="Buscar por nombre..."
                  startDecorator={<SearchIcon />}
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                />
              </FormControl>

              {/* Users List */}
              <Box>
                <Typography level="body-sm" sx={{ mb: 1, fontWeight: 'bold' }}>
                  Selecciona usuarios ({selectedUsers.length} seleccionados)
                </Typography>
                <Sheet
                  sx={{
                    maxHeight: 300,
                    overflow: 'auto',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 'sm',
                  }}
                >
                  <List>
                    {availableUsers
                      .filter(user =>
                        user.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                        user.email?.toLowerCase().includes(userSearchTerm.toLowerCase())
                      )
                      .map((user) => (
                        <ListItem key={user.id}>
                          <ListItemButton
                            selected={selectedUsers.includes(user.id)}
                            onClick={() => handleUserToggle(user.id)}
                          >
                            <ListItemDecorator>
                              <Avatar size="sm">{user.name.charAt(0)}</Avatar>
                            </ListItemDecorator>
                            <ListItemContent>
                              <Typography level="title-sm">{user.name}</Typography>
                              {user.email && (
                                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                  {user.email}
                                </Typography>
                              )}
                            </ListItemContent>
                            {selectedUsers.includes(user.id) && (
                              <Chip size="sm" color="primary" variant="soft">
                                ✓
                              </Chip>
                            )}
                          </ListItemButton>
                        </ListItem>
                      ))}
                    {availableUsers.length === 0 && (
                      <ListItem>
                        <Typography level="body-sm" sx={{ textAlign: 'center', width: '100%', p: 2 }}>
                          No hay usuarios disponibles
                        </Typography>
                      </ListItem>
                    )}
                  </List>
                </Sheet>
              </Box>

              {/* Selected Users Summary */}
              {selectedUsers.length > 0 && (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Typography level="body-sm" sx={{ width: '100%', mb: 0.5 }}>
                    Usuarios seleccionados:
                  </Typography>
                  {selectedUsers.map((userId) => {
                    const user = availableUsers.find((u) => u.id === userId)
                    return user ? (
                      <Chip
                        key={userId}
                        size="sm"
                        variant="soft"
                        color="primary"
                        endDecorator={
                          <IconButton
                            size="sm"
                            variant="plain"
                            onClick={() => handleUserToggle(userId)}
                          >
                            <CloseIcon />
                          </IconButton>
                        }
                      >
                        {user.name}
                      </Chip>
                    ) : null
                  })}
                </Box>
              )}

              {/* Action Buttons */}
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button variant="outlined" color="neutral" onClick={() => setOpenNewChatModal(false)}>
                  Cancelar
                </Button>
                <Button
                  color="primary"
                  onClick={handleCreateChat}
                  disabled={selectedUsers.length === 0}
                >
                  Crear Chat
                </Button>
              </Stack>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
