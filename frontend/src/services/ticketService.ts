import api from './api'

export interface Ticket {
  id: number
  status: string
  contactId: number
  userId: number
  queueId?: number
  companyId: number
  createdAt: string
  updatedAt: string
}

export interface CreateTicketData {
  contactId: number
  status?: string
  userId?: number
  queueId?: number
}

class TicketService {
  /**
   * Obtener todos los tickets
   */
  async getTickets(params?: {
    status?: string
    queueId?: number
    page?: number
    limit?: number
  }): Promise<{ tickets: Ticket[]; count: number }> {
    const response = await api.get('/api/tickets', { params })
    return response.data
  }

  /**
   * Obtener un ticket por ID
   */
  async getTicket(id: number): Promise<Ticket> {
    const response = await api.get(`/api/tickets/${id}`)
    return response.data
  }

  /**
   * Crear un nuevo ticket
   */
  async createTicket(data: CreateTicketData): Promise<Ticket> {
    const response = await api.post('/api/tickets', data)
    return response.data
  }

  /**
   * Actualizar un ticket
   */
  async updateTicket(id: number, data: Partial<Ticket>): Promise<Ticket> {
    const response = await api.put(`/api/tickets/${id}`, data)
    return response.data
  }

  /**
   * Eliminar un ticket
   */
  async deleteTicket(id: number): Promise<void> {
    await api.delete(`/api/tickets/${id}`)
  }
}

export default new TicketService()
