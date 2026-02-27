/**
 * Hook: useTicketActions
 * Gestiona las acciones sobre tickets (cerrar, aceptar, reabrir)
 */

import api from '../services/api'

interface Ticket {
  id: number
  status: string
  isGroup?: boolean
  [key: string]: any
}

interface UseTicketActionsParams {
  fetchTickets: () => void
  fetchTicketCounts: () => void
  setStatusFilter: (status: string) => void
  setSelectedTicket: (fn: any) => void
  selectedTicket: Ticket | null
}

export const useTicketActions = ({
  fetchTickets,
  fetchTicketCounts,
  setStatusFilter,
  setSelectedTicket,
  selectedTicket,
}: UseTicketActionsParams) => {
  /**
   * Cierra un ticket
   * @param ticketId - ID del ticket a cerrar (opcional, usa selectedTicket si no se provee)
   */
  const handleCloseTicket = async (ticketId?: number) => {
    const id = ticketId || selectedTicket?.id
    if (!id) return
    try {
      await api.put(`/tickets/${id}`, { status: 'closed' })
      fetchTickets()
      fetchTicketCounts()
    } catch (error) {
      console.error('Error closing ticket:', error)
    }
  }

  /**
   * Acepta un ticket pendiente
   * - Si es grupo: cambia a estado 'group'
   * - Si no es grupo: cambia a estado 'open'
   * @param ticket - Ticket a aceptar
   */
  const handleAcceptTicket = async (ticket: Ticket) => {
    try {
      const newStatus = ticket.isGroup ? 'group' : 'open'
      await api.put(`/tickets/${ticket.id}`, { status: newStatus })
      // Cambiar a la tab del nuevo estado
      setStatusFilter(newStatus)
      fetchTickets()
      fetchTicketCounts()
      setSelectedTicket({ ...ticket, status: newStatus })
    } catch (error) {
      console.error('Error accepting ticket:', error)
    }
  }

  /**
   * Reabre un ticket cerrado
   * @param ticket - Ticket a reabrir
   */
  const handleReopenTicket = async (ticket: Ticket) => {
    try {
      await api.put(`/tickets/${ticket.id}`, { status: 'open' })
      // Cambiar a la tab de abiertos
      setStatusFilter('open')
      fetchTickets()
      fetchTicketCounts()
      setSelectedTicket({ ...ticket, status: 'open' })
    } catch (error) {
      console.error('Error reopening ticket:', error)
    }
  }

  return {
    handleCloseTicket,
    handleAcceptTicket,
    handleReopenTicket,
  }
}
