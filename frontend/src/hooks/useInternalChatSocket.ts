/**
 * Hook: useInternalChatSocket
 * Escucha eventos de socket para el chat interno en tiempo real.
 * Canales: company-${companyId}-chat, company-${companyId}-chat-user-${userId},
 *          company-${companyId}-chat-${chatId}
 */

import { useEffect, useCallback } from 'react'
import socketService from '../services/socket'

interface ChatMessage {
  id: number
  chatId: number
  senderId: number
  message: string
  mediaPath?: string
  mediaName?: string
  status?: string
  createdAt: string
  [key: string]: any
}

interface Chat {
  id: number
  uuid: string
  title: string
  ownerId: number
  lastMessage?: string
  users?: Array<{ userId: number; unreads: number; user?: any }>
  messages?: ChatMessage[]
  [key: string]: any
}

interface UseInternalChatSocketParams {
  user: { id: number; companyId: number } | null
  chats: any[]
  setChats: React.Dispatch<React.SetStateAction<any[]>>
  selectedChat: any | null
  setSelectedChat: (chat: any | null | ((prev: any) => any)) => void
  onNewMessage?: (message: ChatMessage) => void
  onUnreadChange?: () => void
}

export const useInternalChatSocket = ({
  user,
  chats,
  setChats,
  selectedChat,
  setSelectedChat,
  onNewMessage,
  onUnreadChange,
}: UseInternalChatSocketParams) => {

  const companyId = user?.companyId
  const userId = user?.id

  // Canal general: new-message, update, delete
  const handleGeneralChat = useCallback((data: any) => {
    const { action, chat, newMessage, id } = data

    if (action === 'new-message' && newMessage && chat) {
      onNewMessage?.(newMessage)

      setChats((prev: any[]) => {
        const exists = prev.find(c => c.id === chat.id)
        if (exists) {
          return [chat, ...prev.filter(c => c.id !== chat.id)]
        }
        return [chat, ...prev]
      })
      onUnreadChange?.()
    }

    if (action === 'update' && chat) {
      setChats((prev: any[]) => prev.map(c => c.id === chat.id ? { ...c, ...chat } : c))
      if (selectedChat?.id === chat.id) {
        setSelectedChat((prev: any) => prev ? { ...prev, ...chat } : prev)
      }
    }

    if (action === 'delete') {
      const chatId = Number(id)
      setChats((prev: any[]) => prev.filter(c => c.id !== chatId))
      if (selectedChat?.id === chatId) {
        setSelectedChat(null)
      }
    }
  }, [selectedChat, onNewMessage, onUnreadChange, setChats, setSelectedChat])

  // Canal usuario: create
  const handleUserChat = useCallback((data: any) => {
    if (data.action === 'create' && data.record) {
      setChats(prev => {
        const exists = prev.find(c => c.id === data.record.id)
        if (exists) return prev
        return [{ ...data.record, messages: [] }, ...prev]
      })
    }
  }, [setChats])

  // Canal chat específico: append mensaje, status, mark-as-read
  const handleChatSpecific = useCallback((data: any) => {
    const { action, message } = data

    if (action === 'new-message' && message && selectedChat) {
      setSelectedChat((prev: any) => {
        if (!prev || prev.id !== message.chatId) return prev
        const alreadyExists = prev.messages?.some((m: ChatMessage) => m.id === message.id)
        if (alreadyExists) return prev
        return { ...prev, messages: [...(prev.messages || []), message] }
      })
    }

    if (action === 'messageStatusUpdate' && message) {
      setSelectedChat((prev: any) => {
        if (!prev) return prev
        return {
          ...prev,
          messages: prev.messages?.map((m: ChatMessage) =>
            m.id === message.id ? { ...m, ...message } : m
          )
        }
      })
    }

    if (action === 'chatMarkedAsRead') {
      setSelectedChat((prev: any) => {
        if (!prev) return prev
        return {
          ...prev,
          users: prev.users?.map((u: any) =>
            u.userId === userId ? { ...u, unreads: 0 } : u
          )
        }
      })
    }
  }, [selectedChat, userId, setSelectedChat])

  // Efecto para canales general y de usuario
  useEffect(() => {
    if (!companyId || !userId) return

    const socket = socketService.getSocket()
    if (!socket) return

    const generalChannel = `company-${companyId}-chat`
    const userChannel = `company-${companyId}-chat-user-${userId}`

    socket.on(generalChannel, handleGeneralChat)
    socket.on(userChannel, handleUserChat)

    return () => {
      socket.off(generalChannel, handleGeneralChat)
      socket.off(userChannel, handleUserChat)
    }
  }, [companyId, userId, handleGeneralChat, handleUserChat])

  // Efecto para canal del chat seleccionado
  useEffect(() => {
    if (!companyId || !selectedChat) return

    const socket = socketService.getSocket()
    if (!socket) return

    const chatChannel = `company-${companyId}-chat-${selectedChat.id}`
    socket.on(chatChannel, handleChatSpecific)

    return () => {
      socket.off(chatChannel, handleChatSpecific)
    }
  }, [companyId, selectedChat?.id, handleChatSpecific])
}

export default useInternalChatSocket
