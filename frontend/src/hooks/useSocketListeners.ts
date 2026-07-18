/**
 * Hook: useSocketListeners
 * Gestiona los listeners de Socket.IO para updates en tiempo real
 */

import { useEffect } from 'react'
import socketService from '../services/socket'

interface Message {
  id: number
  body: string
  createdAt: string
  ticketId: number
  [key: string]: any
}

interface Ticket {
  id: number
  status: string
  messages: Message[]
  lastMessage?: string
  updatedAt: string
  [key: string]: any
}

interface UseSocketListenersParams {
  user: any
  fetchTicketCounts: () => void
  setTickets: (fn: (prevTickets: Ticket[]) => Ticket[]) => void
  setSelectedTicket: (fn: (prevSelected: Ticket | null) => Ticket | null) => void
  fetchTickets: () => void
}

export const useSocketListeners = ({
  user,
  fetchTicketCounts,
  setTickets,
  setSelectedTicket,
  fetchTickets,
}: UseSocketListenersParams) => {
  useEffect(() => {
    if (!user?.companyId) return

    const socket = socketService.getSocket()
    if (!socket) {
      console.log('⚠️ Socket not available yet')
      return
    }

    const companyId = user.companyId
    const messageEvent = `company-${companyId}-appMessage`
    const ticketEvent = `company-${companyId}-ticket`

    console.log(`🔌 Setting up socket listeners for company ${companyId}`)

    // Handler for new/updated messages
    const handleAppMessage = (data: { action: string; message: Message }) => {
      console.log('📨 Socket appMessage received:', data.action, data.message?.id)

      if (data.action === 'create' || data.action === 'update') {
        // Update messages in the ticket list
        setTickets(prevTickets =>
          prevTickets.map(ticket => {
            if (ticket.id === data.message.ticketId) {
              const existingMsgIndex = ticket.messages.findIndex(m => m.id === data.message.id)
              let updatedMessages: Message[]

              if (existingMsgIndex >= 0) {
                // Update existing message
                updatedMessages = [...ticket.messages]
                updatedMessages[existingMsgIndex] = data.message
              } else {
                // Add new message
                updatedMessages = [...ticket.messages, data.message]
              }

              return {
                ...ticket,
                messages: updatedMessages,
                lastMessage: data.message.body,
                updatedAt: data.message.createdAt
              }
            }
            return ticket
          })
        )

        // Update selected ticket messages
        setSelectedTicket(prevSelected => {
          if (prevSelected && prevSelected.id === data.message.ticketId) {
            const existingMsgIndex = prevSelected.messages.findIndex(m => m.id === data.message.id)
            let updatedMessages: Message[]

            if (existingMsgIndex >= 0) {
              updatedMessages = [...prevSelected.messages]
              updatedMessages[existingMsgIndex] = data.message
            } else {
              updatedMessages = [...prevSelected.messages, data.message]
            }

            return {
              ...prevSelected,
              messages: updatedMessages,
              lastMessage: data.message.body,
              updatedAt: data.message.createdAt
            }
          }
          return prevSelected
        })
      }
    }

    // Handler for ticket updates
    const handleTicketUpdate = (data: { action: string; ticket: Ticket; ticketId?: number }) => {
      console.log('🎫 Socket ticket event received:', data.action, data.ticket?.id)

      if (data.action === 'update') {
        setTickets(prevTickets =>
          prevTickets.map(t => (t.id === data.ticket.id ? { ...t, ...data.ticket } : t))
        )

        setSelectedTicket(prevSelected => {
          if (prevSelected && prevSelected.id === data.ticket.id) {
            return { ...prevSelected, ...data.ticket }
          }
          return prevSelected
        })

        // Refresh counts when ticket status changes
        fetchTicketCounts()
      } else if (data.action === 'create') {
        // New ticket - refresh the list
        fetchTickets()
        fetchTicketCounts()
      } else if (data.action === 'delete') {
        // Get ticketId from either data.ticket.id or data.ticketId
        const ticketId = data.ticket?.id || data.ticketId
        if (ticketId) {
          setTickets(prevTickets => prevTickets.filter(t => t.id !== ticketId))
          setSelectedTicket(prevSelected => {
            if (prevSelected && prevSelected.id === ticketId) {
              return null
            }
            return prevSelected
          })
          fetchTicketCounts()
        }
      }
    }

    // Register listeners
    socket.on(messageEvent, handleAppMessage)
    socket.on(ticketEvent, handleTicketUpdate)

    console.log(`✅ Socket listeners registered for ${messageEvent} and ${ticketEvent}`)

    // Cleanup on unmount
    return () => {
      console.log(`🔌 Removing socket listeners for company ${companyId}`)
      socket.off(messageEvent, handleAppMessage)
      socket.off(ticketEvent, handleTicketUpdate)
    }
  }, [user?.companyId, fetchTicketCounts, setTickets, setSelectedTicket, fetchTickets])
}
