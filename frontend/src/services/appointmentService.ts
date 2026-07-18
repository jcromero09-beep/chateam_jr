import api from './api'

export interface Appointment {
  id: number
  companyId: number
  serviceId: number
  userId?: number
  contactId?: number
  ticketId?: number
  reminderTemplateId?: number
  title: string
  description?: string
  startTime: string
  endTime: string
  duration: number
  timezone: string
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'rescheduled' | 'no-show'
  attendeeName?: string
  attendeeEmail?: string
  attendeePhone?: string
  attendeeCount?: number
  location?: string
  locationType?: string
  meetingUrl?: string
  meetingPlatform?: string
  notes?: string
  createdBy: number
  confirmationSent: boolean
  reminderSent: boolean
  cancelledAt?: string
  confirmedAt?: string
  completedAt?: string
  cancellationReason?: string
  internalNotes?: string
  rescheduledFrom?: number
  rescheduledTo?: number
  googleCalendarEventId?: string
  outlookCalendarEventId?: string
  createdAt: string
  updatedAt: string
  service?: {
    id: number
    name: string
    duration: number
    price: number
  }
  assignedUser?: {
    id: number
    name: string
    email: string
  }
  contact?: {
    id: number
    name: string
    email: string
    phone: string
  }
}

export interface CreateAppointmentData {
  serviceId: number
  userId?: number
  contactId?: number
  ticketId?: number
  reminderTemplateId?: number
  title: string
  description?: string
  startTime: string
  endTime: string
  timezone?: string
  attendeeName?: string
  attendeeEmail?: string
  attendeePhone?: string
  attendeeCount?: number
  location?: string
  locationType?: string
  meetingUrl?: string
  meetingPlatform?: string
  notes?: string
  sendReminders?: boolean
}

export interface UpdateAppointmentData {
  title?: string
  description?: string
  attendeeName?: string
  attendeeEmail?: string
  attendeePhone?: string
  attendeeCount?: number
  location?: string
  locationType?: string
  meetingUrl?: string
  meetingPlatform?: string
  notes?: string
}

export interface GetAppointmentsParams {
  startDate: string
  endDate: string
  userId?: number
  serviceId?: number
  status?: string
  contactId?: number
}

// Appointment Service Types
export interface AppointmentServiceType {
  id: number
  companyId: number
  name: string
  description?: string
  duration: number
  bufferTime?: number
  price?: number
  currency?: string
  color?: string
  isActive: boolean
  maxAttendees?: number
  requiresConfirmation?: boolean
  settings?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface CreateServiceData {
  name: string
  description?: string
  duration: number
  bufferTime?: number
  price?: number
  currency?: string
  color?: string
  isActive?: boolean
  maxAttendees?: number
  requiresConfirmation?: boolean
}

export type UpdateServiceData = Partial<CreateServiceData>

class AppointmentService {
  private baseUrl = '/appointments'

  /**
   * Get appointments with optional filters
   */
  async getAppointments(params: GetAppointmentsParams): Promise<Appointment[]> {
    const response = await api.get(`${this.baseUrl}/appointments`, { params })
    return response.data
  }

  /**
   * Get a single appointment by ID
   */
  async getAppointment(id: number): Promise<Appointment> {
    const response = await api.get(`${this.baseUrl}/appointments/${id}`)
    return response.data
  }

  /**
   * Create a new appointment
   */
  async createAppointment(data: CreateAppointmentData): Promise<Appointment> {
    const response = await api.post(`${this.baseUrl}/appointments`, data)
    return response.data
  }

  /**
   * Update an existing appointment
   */
  async updateAppointment(id: number, data: UpdateAppointmentData): Promise<Appointment> {
    const response = await api.put(`${this.baseUrl}/appointments/${id}`, data)
    return response.data
  }

  /**
   * Delete an appointment
   */
  async deleteAppointment(id: number): Promise<void> {
    await api.delete(`${this.baseUrl}/appointments/${id}`)
  }

  /**
   * Confirm an appointment
   */
  async confirmAppointment(id: number): Promise<Appointment> {
    const response = await api.post(`${this.baseUrl}/appointments/${id}/confirm`)
    return response.data
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(id: number, reason?: string): Promise<Appointment> {
    const response = await api.post(`${this.baseUrl}/appointments/${id}/cancel`, { reason })
    return response.data
  }

  /**
   * Complete an appointment
   */
  async completeAppointment(id: number, internalNotes?: string): Promise<Appointment> {
    const response = await api.post(`${this.baseUrl}/appointments/${id}/complete`, { internalNotes })
    return response.data
  }

  /**
   * Reschedule an appointment
   */
  async rescheduleAppointment(id: number, newStartTime: string, newEndTime: string, reason?: string): Promise<Appointment> {
    const response = await api.post(`${this.baseUrl}/appointments/${id}/reschedule`, {
      newStartTime,
      newEndTime,
      reason
    })
    return response.data
  }

  /**
   * Get available services
   */
  async getServices(activeOnly: boolean = false): Promise<AppointmentServiceType[]> {
    const response = await api.get(`${this.baseUrl}/services`, {
      params: { activeOnly: activeOnly.toString() }
    })
    return response.data
  }

  /**
   * Create a new service
   */
  async createService(data: CreateServiceData): Promise<AppointmentServiceType> {
    const response = await api.post(`${this.baseUrl}/services`, data)
    return response.data
  }

  /**
   * Update an existing service
   */
  async updateService(id: number, data: UpdateServiceData): Promise<AppointmentServiceType> {
    const response = await api.put(`${this.baseUrl}/services/${id}`, data)
    return response.data
  }

  /**
   * Delete a service (deactivate)
   */
  async deleteService(id: number): Promise<void> {
    await api.delete(`${this.baseUrl}/services/${id}`)
  }

  /**
   * Get available time slots
   */
  async getAvailableSlots(params: {
    serviceId?: number
    userId?: number
    startDate: string
    endDate: string
    timezone?: string
  }): Promise<any[]> {
    const response = await api.get(`${this.baseUrl}/availability/slots`, { params })
    return response.data
  }

  /**
   * Get simultaneous appointment counts by time slot
   */
  async getSimultaneousCounts(params: {
    startDate: string
    endDate: string
    userId?: number
  }): Promise<{ [timeSlot: string]: number }> {
    const response = await api.get(`${this.baseUrl}/simultaneous-counts`, { params })
    return response.data
  }

  /**
   * Get appointment change history timeline
   */
  async getAppointmentHistory(id: number): Promise<{
    current: Appointment
    timeline: Array<{
      type: string
      timestamp: string
      details: string
      relatedAppointmentId?: number
    }>
  }> {
    const response = await api.get(`${this.baseUrl}/${id}/history`)
    return response.data
  }
  // ============ CALENDAR SYNC ============

  /**
   * Get Google Calendar OAuth authorization URL
   */
  async getGoogleAuthUrl(redirectUri: string): Promise<{ authUrl: string }> {
    const response = await api.get(`${this.baseUrl}/calendar/google/auth-url`, {
      params: { redirectUri }
    })
    return response.data
  }

  /**
   * Get user's active calendar syncs
   */
  async getCalendarSyncs(): Promise<Array<{
    id: number
    provider: string
    calendarName: string
    syncEnabled: boolean
    lastSyncAt: string
    syncDirection: string
  }>> {
    const response = await api.get(`${this.baseUrl}/calendar/syncs`)
    return response.data
  }

  /**
   * Disable calendar sync for a provider
   */
  async disableCalendarSync(provider: string): Promise<{ success: boolean }> {
    const response = await api.delete(`${this.baseUrl}/calendar/sync/${provider}`)
    return response.data
  }
}

export default new AppointmentService()
