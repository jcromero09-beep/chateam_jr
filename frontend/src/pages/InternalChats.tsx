import { useState, useEffect, useRef } from 'react'
import {
  ChatsCircle,
  ArrowClockwise,
  Plus,
  MagnifyingGlass,
  PaperPlaneTilt,
  UsersThree,
  Paperclip,
  X,
  DotsThreeVertical,
  Trash,
  PushPin,
  CaretLeft,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar } from '@/components/ui/avatar'
import { StatTile } from '@/components/ui/stat-tile'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import api from '../services/api'
import logger from '../utils/logger'
import { toast } from 'react-toastify'
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
  const [menuOpen, setMenuOpen] = useState(false)
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

      // Backend returns { records, count, hasMore }
      const chatsData = Array.isArray(response.data)
        ? response.data
        : (response.data.records || [])

      // Transform chats to UI format
      const transformedChats = chatsData.map(transformChat)

      setChats(transformedChats)
    } catch (error) {
      console.error('Error fetching chats:', error)
      // Set empty array on error instead of mock data
      setChats([])
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessage = async () => {
    if ((!message.trim() && !selectedFile) || !selectedChat) return

    // [Ola 3] Se limpia el input de forma optimista (la UI responde al instante),
    // pero se guarda el estado previo para poder devolverlo si el envío falla:
    // antes, un POST fallido dejaba el input vacío y el mensaje se perdía en silencio.
    const text = message
    const file = selectedFile
    const preview = filePreview
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
      // Devolver lo escrito al input para que el usuario pueda reintentar sin perderlo.
      setMessage(text)
      setSelectedFile(file)
      setFilePreview(preview)
      logger.error('[InternalChats] error al enviar el mensaje', error)
      toast.error('No se pudo enviar el mensaje. Tu texto se ha conservado.')
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

      // Backend returns { records, count, hasMore }
      const messagesData = Array.isArray(response.data)
        ? response.data
        : (response.data.records || [])

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
    setMenuOpen(false)

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
    } catch (err) {
      // Si falla, el badge de no-leídos queda desfasado hasta el próximo refresco.
      logger.warn('[InternalChats] no se pudo marcar el chat como leído', err)
    }

    // Notify sidebar badge
    window.dispatchEvent(new CustomEvent('chatUnreadsChange', { detail: {} }))
  }

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users')
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
    setMenuOpen(false)
    if (!confirm('¿Estás seguro de eliminar este chat?')) return
    try {
      await api.delete(`/chats/${chatId}`)
      setChats(prev => prev.filter(c => c.id !== chatId))
      setSelectedChat(null)
    } catch {
      alert('Error al eliminar chat')
    }
  }

  const renderMedia = (msg: Message, isOwn: boolean) => {
    if (!msg.mediaPath && !msg.mediaName) return null

    const mediaUrl = msg.mediaUrl || `/public/${msg.mediaPath}`
    const mediaType = msg.mediaType || getMediaType(msg.mediaName || '')
    const filename = msg.mediaName || 'Archivo'

    if (mediaType === 'image') {
      return (
        <a
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-1 block"
          onClick={(e) => { e.preventDefault(); window.open(mediaUrl, '_blank') }}
        >
          <img
            src={mediaUrl}
            alt={filename}
            className="max-h-[250px] max-w-full cursor-pointer rounded-md object-cover"
          />
        </a>
      )
    }

    if (mediaType === 'video') {
      return (
        <div className="mb-1">
          <video
            src={mediaUrl}
            controls
            className="max-h-[200px] max-w-full rounded-md"
          />
          <p className={cn('mt-1 text-[11px]', isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
            {filename}
          </p>
        </div>
      )
    }

    if (mediaType === 'audio') {
      return (
        <div className="mb-1">
          <audio src={mediaUrl} controls className="w-full max-w-[300px]" />
          <p className={cn('mt-1 text-[11px]', isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
            {filename}
          </p>
        </div>
      )
    }

    return (
      <a
        href={mediaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'mb-1 flex items-center gap-2 rounded-md p-2 no-underline transition-colors',
          isOwn ? 'bg-primary-foreground/15 hover:bg-primary-foreground/25' : 'bg-accent hover:bg-accent/70',
        )}
      >
        <Paperclip className="size-4 shrink-0" aria-hidden />
        <span className="truncate text-sm">{filename}</span>
      </a>
    )
  }

  const filteredChats = chats.filter(
    (chat) =>
      (chat.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      chat.lastMessage?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredUsers = availableUsers.filter(user =>
    user.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(userSearchTerm.toLowerCase())
  )

  const stats: { label: string; value: string; tone?: 'primary' | 'success' | 'neutral' }[] = [
    {
      label: 'Conversaciones activas',
      value: String(chats.filter((c) => (c.unreadCount || 0) > 0).length),
      tone: 'primary',
    },
    {
      label: 'Total mensajes',
      value: String(chats.reduce((sum, chat) => sum + (chat.messages?.length || 0), 0)),
    },
    {
      label: 'Usuarios online',
      value: String(
        chats.reduce(
          (sum, chat) => sum + (chat.participants?.filter((p) => p.online).length || 0),
          0,
        ),
      ),
      tone: 'success',
    },
    {
      label: 'Grupos',
      value: String(chats.filter((c) => c.type === 'group').length),
    },
  ]

  return (
    <div className="mx-auto flex h-full min-h-[600px] max-w-[1400px] flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <ChatsCircle className="size-6" weight="duotone" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Chats Internos</h1>
            <p className="text-sm text-muted-foreground">
              Comunicación en tiempo real entre miembros del equipo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchChats}
            aria-label="Actualizar"
            className="text-muted-foreground"
          >
            <ArrowClockwise className="size-5" aria-hidden />
          </Button>
          {isAdminOrSuper && (
            <Button size="sm" onClick={openNewChatModalHandler}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nuevo Chat
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid shrink-0 grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <StatTile key={s.label} label={s.label} value={s.value} tone={s.tone} />
        ))}
      </div>

      {/* Chat Interface */}
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
        {/* Chat List Sidebar */}
        <div
          className={cn(
            'flex w-full flex-col border-r border-border md:w-[320px] md:shrink-0',
            selectedChat && 'hidden md:flex',
          )}
        >
          <div className="p-3">
            <Input
              placeholder="Buscar conversaciones..."
              aria-label="Buscar conversaciones"
              leftIcon={<MagnifyingGlass />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {filteredChats.map((chat) => (
              <li key={chat.id}>
                <button
                  type="button"
                  onClick={() => handleSelectChat(chat)}
                  aria-current={selectedChat?.id === chat.id}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors',
                    selectedChat?.id === chat.id ? 'bg-primary/[0.08]' : 'hover:bg-accent/60',
                  )}
                >
                  {chat.type === 'group' ? (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                      <UsersThree className="size-5" weight="duotone" aria-hidden />
                    </span>
                  ) : (
                    <Avatar name={chat.name || 'Chat'} size="md" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {chat.name || 'Chat'}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {chat.lastMessageTime && formatTime(chat.lastMessageTime)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p
                        className={cn(
                          'truncate text-[13px] text-muted-foreground',
                          (chat.unreadCount || 0) > 0 && 'font-semibold text-foreground',
                        )}
                      >
                        {chat.lastMessage}
                      </p>
                      {(chat.unreadCount || 0) > 0 && (
                        <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-white">
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
            {filteredChats.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                No hay conversaciones
              </li>
            )}
          </ul>
        </div>

        {/* Chat Messages Area */}
        <div className={cn('min-w-0 flex-1', selectedChat ? 'flex' : 'hidden md:flex')}>
          {selectedChat ? (
            <div className="relative flex h-full w-full flex-col bg-accent/30 dark:bg-background">
              {/* Chat Header */}
              <header className="relative z-10 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
                <button
                  type="button"
                  onClick={() => setSelectedChat(null)}
                  aria-label="Volver"
                  className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent md:hidden"
                >
                  <CaretLeft className="size-5" aria-hidden />
                </button>
                {selectedChat.type === 'group' ? (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                    <UsersThree className="size-5" weight="duotone" aria-hidden />
                  </span>
                ) : (
                  <Avatar name={selectedChat.name || 'Chat'} size="md" />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-foreground">
                    {selectedChat.name || 'Chat'}
                  </h2>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    {selectedChat.type === 'group' ? (
                      <>
                        <UsersThree className="size-3.5" aria-hidden />
                        {`${selectedChat.participants?.length || 0} miembros, ${selectedChat.participants?.filter((p) => p.online).length || 0} en línea`}
                      </>
                    ) : selectedChat.participants?.[0]?.online ? (
                      'En línea'
                    ) : selectedChat.participants?.[0]?.lastSeen ? (
                      `Última vez ${formatTime(selectedChat.participants[0].lastSeen)}`
                    ) : (
                      'Sin conexión reciente'
                    )}
                  </p>
                </div>
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-label="Más opciones"
                    className="text-muted-foreground"
                  >
                    <DotsThreeVertical className="size-5" weight="bold" aria-hidden />
                  </Button>
                  {menuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setMenuOpen(false)}
                        aria-hidden
                      />
                      <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg">
                        {canModifyChat(selectedChat) && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDeleteChat(selectedChat.id)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive-text transition-colors hover:bg-accent"
                            >
                              <Trash className="size-4" aria-hidden />
                              Eliminar Chat
                            </button>
                            <div className="my-1 h-px bg-border" />
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => { setMenuOpen(false); alert('Mensajes fijados: en desarrollo') }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
                        >
                          <PushPin className="size-4" aria-hidden />
                          Mensajes Fijados
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </header>

              {/* Messages */}
              <div className="relative z-10 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-5">
                {(selectedChat.messages || []).map((msg) => {
                  const isOwn = msg.senderId === currentUser.id
                  return (
                    <div key={msg.id} className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
                      <div
                        className={cn(
                          'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
                          isOwn
                            ? 'rounded-br-md bg-primary text-primary-foreground'
                            : 'rounded-bl-md border border-border bg-card text-card-foreground',
                        )}
                      >
                        {!isOwn && selectedChat.type === 'group' && (
                          <span className="mb-0.5 block text-[11px] font-semibold text-primary">
                            {msg.senderName || `Usuario ${msg.senderId}`}
                          </span>
                        )}
                        {renderMedia(msg, isOwn)}
                        {msg.message && <p className="leading-relaxed">{msg.message}</p>}
                        <span
                          className={cn(
                            'mt-1 flex items-center justify-end gap-1 text-[10px]',
                            isOwn ? 'text-primary-foreground/65' : 'text-muted-foreground',
                          )}
                        >
                          {formatTime(msg.createdAt)}
                          {isOwn && (
                            <span>
                              {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="relative z-10 shrink-0 border-t border-border bg-card px-4 py-3">
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
                  <div className="mb-2 flex items-center gap-2 rounded-lg bg-accent p-2">
                    {filePreview ? (
                      <img
                        src={filePreview}
                        alt="Preview"
                        className="size-12 rounded-md object-cover"
                      />
                    ) : (
                      <span className="flex size-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Paperclip className="size-5" aria-hidden />
                      </span>
                    )}
                    <span className="flex-1 truncate text-sm text-foreground">
                      {selectedFile.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => { setSelectedFile(null); setFilePreview(null) }}
                      aria-label="Quitar archivo"
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Adjuntar archivo"
                    className={cn(
                      'flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent',
                      selectedFile && 'text-primary',
                    )}
                  >
                    <Paperclip className="size-5" aria-hidden />
                  </button>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    rows={1}
                    placeholder="Escribe un mensaje..."
                    aria-label="Escribe un mensaje"
                    className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-input bg-background px-3.5 py-3 text-sm leading-tight text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={!message.trim() && !selectedFile}
                    aria-label="Enviar mensaje"
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-[background-color,transform] hover:bg-primary-hover active:translate-y-px disabled:opacity-45 disabled:hover:bg-primary"
                  >
                    <PaperPlaneTilt className="size-5" weight="fill" aria-hidden />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ChatsCircle className="size-7" weight="duotone" aria-hidden />
              </span>
              <div>
                <h2 className="font-semibold text-foreground">Selecciona una conversación</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Elige un chat para comenzar a conversar.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal New Chat */}
      {openNewChatModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpenNewChatModal(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-[600px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold text-foreground">Nuevo Chat Interno</h2>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setOpenNewChatModal(false)}
                aria-label="Cerrar"
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
              {/* Chat Title */}
              <div className="space-y-1.5">
                <Label htmlFor="chat-title">Título del Chat (opcional)</Label>
                <Input
                  id="chat-title"
                  value={chatTitle}
                  onChange={(e) => setChatTitle(e.target.value)}
                  placeholder={selectedUsers.length > 1 ? 'Ej: Equipo de Ventas' : 'Opcional para chats directos'}
                />
              </div>

              {/* User Search */}
              <div className="space-y-1.5">
                <Label htmlFor="user-search">Buscar Usuarios</Label>
                <Input
                  id="user-search"
                  placeholder="Buscar por nombre..."
                  leftIcon={<MagnifyingGlass />}
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                />
              </div>

              {/* Users List */}
              <div>
                <p className="mb-2 text-sm font-semibold text-foreground">
                  Selecciona usuarios ({selectedUsers.length} seleccionados)
                </p>
                <ul className="max-h-[300px] overflow-y-auto rounded-lg border border-border">
                  {filteredUsers.map((user) => {
                    const checked = selectedUsers.includes(user.id)
                    return (
                      <li key={user.id}>
                        <button
                          type="button"
                          onClick={() => handleUserToggle(user.id)}
                          className={cn(
                            'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                            checked ? 'bg-primary/[0.08]' : 'hover:bg-accent/60',
                          )}
                        >
                          <Checkbox checked={checked} onCheckedChange={() => handleUserToggle(user.id)} />
                          <Avatar name={user.name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
                            {user.email && (
                              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                            )}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                  {availableUsers.length === 0 && (
                    <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No hay usuarios disponibles
                    </li>
                  )}
                </ul>
              </div>

              {/* Selected Users Summary */}
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <p className="w-full text-sm text-muted-foreground">Usuarios seleccionados:</p>
                  {selectedUsers.map((userId) => {
                    const user = availableUsers.find((u) => u.id === userId)
                    return user ? (
                      <span
                        key={userId}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/12 py-1 pl-3 pr-1.5 text-xs font-medium text-primary"
                      >
                        {user.name}
                        <button
                          type="button"
                          onClick={() => handleUserToggle(userId)}
                          aria-label={`Quitar ${user.name}`}
                          className="flex size-4 items-center justify-center rounded-full hover:bg-primary/20"
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      </span>
                    ) : null
                  })}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <Button variant="outline" size="sm" onClick={() => setOpenNewChatModal(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleCreateChat} disabled={selectedUsers.length === 0}>
                Crear Chat
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
