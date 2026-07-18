/**
 * Hook: useTicketsList
 * Gestiona la obtención y gestión de la lista de tickets con sus mensajes
 */

import { useState, useEffect } from 'react'
import api from '../services/api'

interface Message {
  id: number
  body: string
  fromMe: boolean
  mediaUrl?: string
  mediaType?: string
  quotedMsg?: any
  createdAt: string
  ack?: number
  read: boolean
}

interface Tag {
  id: number
  name: string
  color: string
  kanban?: number
}

interface Contact {
  id: number
  name: string
  number: string
  profilePicUrl?: string
  urlPicture?: string
  tags?: Tag[]
}

interface User {
  id: number
  name: string
}

interface Queue {
  id: number
  name: string
  color: string
}

interface Whatsapp {
  id: number
  name: string
  channel?: string
}

interface Ticket {
  id: number
  uuid: string
  status: string
  unreadMessages: number
  lastMessage?: string
  contactId: number
  userId?: number
  queueId?: number
  whatsappId?: number
  isGroup?: boolean
  channel?: string
  contact: Contact
  user?: User
  queue?: Queue
  whatsapp?: Whatsapp
  tags?: Tag[]
  messages: Message[]
  createdAt: string
  updatedAt: string
}

interface FilterParams {
  statusFilter: string
  showAll: boolean
  startDate: string
  endDate: string
  whatsappFilter: string
  userFilter: string
  queueFilter: string
  searchMessages: boolean
}

export const useTicketsList = (filters: FilterParams) => {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [loading, setLoading] = useState(true)

  /**
   * Obtiene la lista de tickets con sus mensajes
   * Aplica todos los filtros configurados
   */
  const fetchTickets = async () => {
    try {
      setLoading(true)
      const params: any = {
        showAll: filters.showAll ? 'true' : 'false',
      }

      // Solo enviar status si no es 'all'
      if (filters.statusFilter && filters.statusFilter !== 'all') {
        params.status = filters.statusFilter
      }

      if (filters.startDate) params.startDate = filters.startDate
      if (filters.endDate) params.endDate = filters.endDate
      if (filters.whatsappFilter) params.whatsappIds = JSON.stringify([Number(filters.whatsappFilter)])
      if (filters.userFilter) params.users = JSON.stringify([Number(filters.userFilter)])
      if (filters.queueFilter) params.queueIds = JSON.stringify([Number(filters.queueFilter)])
      if (filters.searchMessages) params.searchOnMessages = 'true'

      const response = await api.get('/tickets', { params })
      const ticketsData = response.data.tickets || response.data || []

      if (ticketsData.length === 0) {
        setTickets([])
        setSelectedTicket(null)
        return
      }

      // Fetch messages for each ticket
      const ticketsWithMessages = await Promise.all(
        ticketsData.map(async (ticket: Ticket) => {
          try {
            const msgResponse = await api.get(`/messages/${ticket.id}`)
            return { ...ticket, messages: msgResponse.data.messages || [] }
          } catch {
            return { ...ticket, messages: [] }
          }
        })
      )

      setTickets(ticketsWithMessages)
      if (ticketsWithMessages.length > 0 && !selectedTicket) {
        setSelectedTicket(ticketsWithMessages[0])
      }
    } catch (error: any) {
      console.error('❌ Error fetching tickets:', error?.response?.data || error.message || error)
      setTickets([])
      setSelectedTicket(null)
    } finally {
      setLoading(false)
    }
  }

  // Auto-fetch cuando cambien los filtros
  useEffect(() => {
    fetchTickets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.statusFilter,
    filters.showAll,
    filters.startDate,
    filters.endDate,
    filters.whatsappFilter,
    filters.userFilter,
    filters.queueFilter,
    filters.searchMessages,
  ])

  return {
    tickets,
    setTickets,
    selectedTicket,
    setSelectedTicket,
    loading,
    fetchTickets,
  }
}
