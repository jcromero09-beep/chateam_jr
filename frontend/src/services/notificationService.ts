import api from './api'

export interface NotificationDTO {
  id: number
  companyId: number
  userId: number
  type: 'info' | 'success' | 'warning' | 'error'
  category: 'system' | 'appointment' | 'campaign' | 'ticket' | 'user' | 'message'
  title: string
  message: string | null
  actionUrl: string | null
  metadata: Record<string, any> | null
  isRead: boolean
  readAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ListNotificationsParams {
  filter?: 'all' | 'unread' | 'read'
  category?: string
  type?: string
  pageNumber?: number
}

export interface ListNotificationsResponse {
  records: NotificationDTO[]
  count: number
  unreadCount: number
  page: number
  hasMore: boolean
}

export const listNotifications = (params: ListNotificationsParams = {}) =>
  api.get<ListNotificationsResponse>('/notifications', { params })

export const getUnreadCount = () =>
  api.get<{ count: number }>('/notifications/unread-count')

export const markNotificationAsRead = (id: number) =>
  api.post<NotificationDTO>(`/notifications/${id}/read`)

export const markAllNotificationsAsRead = () =>
  api.post<{ success: boolean; updated: number }>('/notifications/mark-all-read')

export const deleteNotification = (id: number) =>
  api.delete<{ success: boolean }>(`/notifications/${id}`)
