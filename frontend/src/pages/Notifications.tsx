import { useState, useEffect, useCallback } from 'react'
import {
  Bell,
  BellRinging,
  CheckCircle,
  Info,
  Warning,
  Envelope,
  EnvelopeOpen,
  Megaphone,
  User,
  Gear,
  Trash,
  Funnel,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useAuth } from '../hooks/useAuth'
import socketService from '../services/socket'
import {
  listNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification as apiDeleteNotification,
  NotificationDTO,
} from '../services/notificationService'

/**
 * Tipo local — extiende DTO del backend para permitir icono opcional en UI.
 * El backend devuelve `NotificationDTO` con la misma forma.
 */
type Notification = NotificationDTO & { icon?: React.ReactNode }

// Toggle accesible (role="switch") con tokens del design system.
// No hay componente Switch en @/components/ui; se define local (mismo patrón que IntegrationBillie).
function Toggle({
  checked,
  onChange,
  id,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  id?: string
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer appearance-none items-center rounded-full border-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-card shadow-sm transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
        aria-hidden
      />
    </button>
  )
}

// Botón de acción de fila (icono) con reset de estilos (tailwind.css va sin preflight).
function ActionBtn({
  label,
  onClick,
  className,
  children,
}: {
  label: string
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex size-8 shrink-0 cursor-pointer appearance-none items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {children}
    </button>
  )
}

const separator = <div className="h-px w-full bg-border" aria-hidden />

/**
 * Notifications Center Module
 * Complete notification management system with filters and preferences
 *
 * Features:
 * - Real-time notifications display
 * - Filter by type and category
 * - Mark as read/unread
 * - Notification preferences
 * - Statistics dashboard
 * - Action buttons
 */
export default function Notifications() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [filterType, setFilterType] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')

  // Notification preferences (UI-only, persistencia futura)
  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    pushNotifications: true,
    campaignAlerts: true,
    ticketAlerts: true,
    systemAlerts: true,
  })

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await listNotifications({ filter: 'all', pageNumber: 1 })
      setNotifications(data.records as Notification[])
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // Socket.IO: notificaciones en tiempo real
  useEffect(() => {
    if (!user?.companyId || !user?.id) return
    const socket = socketService.getSocket() ?? socketService.connect(user.companyId, user.id)

    const channel = `user-${user.id}-notification`
    const handler = (payload: { action: string; notification: NotificationDTO }) => {
      if (payload.action === 'create' && payload.notification) {
        setNotifications((prev) => [payload.notification as Notification, ...prev])
      }
    }

    socket.on(channel, handler)
    return () => {
      socket.off(channel, handler)
    }
  }, [user?.companyId, user?.id])

  // Calculate statistics
  const stats = {
    total: notifications.length,
    unread: notifications.filter((n) => !n.isRead).length,
    success: notifications.filter((n) => n.type === 'success').length,
    warnings: notifications.filter((n) => n.type === 'warning').length,
    errors: notifications.filter((n) => n.type === 'error').length,
  }

  // Get notification icon based on category
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'campaign':
        return <Megaphone className="size-5" aria-hidden />
      case 'ticket':
        return <Info className="size-5" aria-hidden />
      case 'user':
        return <User className="size-5" aria-hidden />
      case 'message':
        return <Envelope className="size-5" aria-hidden />
      case 'system':
        return <Gear className="size-5" aria-hidden />
      default:
        return <Bell className="size-5" aria-hidden />
    }
  }

  // Variante de Badge según el tipo (tokens *-text para el texto de estado)
  const getTypeBadgeVariant = (type: string): BadgeProps['variant'] => {
    switch (type) {
      case 'success':
        return 'success'
      case 'warning':
        return 'warning'
      case 'error':
        return 'destructive'
      case 'info':
      default:
        return 'primary'
    }
  }

  // Tinte del avatar de categoría según el tipo
  const getTypeAvatarClass = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-success/14 text-success-text'
      case 'warning':
        return 'bg-warning/16 text-warning-text'
      case 'error':
        return 'bg-destructive/12 text-destructive-text'
      case 'info':
      default:
        return 'bg-primary/12 text-primary'
    }
  }

  // Filter notifications
  const filteredNotifications = notifications.filter((notification) => {
    const matchesType = filterType === 'all' || notification.type === filterType
    const matchesCategory = filterCategory === 'all' || notification.category === filterCategory
    const matchesTab =
      activeTab === 0 || (activeTab === 1 && !notification.isRead) || (activeTab === 2 && notification.isRead)

    return matchesType && matchesCategory && matchesTab
  })

  // Mark notification as read
  const markAsRead = async (notificationId: number) => {
    try {
      await markNotificationAsRead(notificationId)
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
      )
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  // Delete notification
  const deleteNotification = async (notificationId: number) => {
    try {
      await apiDeleteNotification(notificationId)
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId))
    } catch (error) {
      console.error('Error deleting notification:', error)
    }
  }

  // Handle action
  const handleAction = (notification: Notification) => {
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl
    }
    markAsRead(notification.id)
  }

  const preferenceRows: {
    id: string
    label: string
    hint: string
    key: keyof typeof preferences
  }[] = [
    {
      id: 'pref-email',
      label: 'Notificaciones por Email',
      hint: 'Recibir notificaciones importantes por correo',
      key: 'emailNotifications',
    },
    {
      id: 'pref-push',
      label: 'Notificaciones Push',
      hint: 'Notificaciones en tiempo real en el navegador',
      key: 'pushNotifications',
    },
    {
      id: 'pref-campaigns',
      label: 'Alertas de Campañas',
      hint: 'Notificar sobre el estado de campañas de marketing',
      key: 'campaignAlerts',
    },
    {
      id: 'pref-tickets',
      label: 'Alertas de Tickets',
      hint: 'Notificar sobre nuevos tickets y asignaciones',
      key: 'ticketAlerts',
    },
    {
      id: 'pref-system',
      label: 'Alertas del Sistema',
      hint: 'Notificaciones sobre actualizaciones y mantenimiento',
      key: 'systemAlerts',
    },
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="relative flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <BellRinging className="size-6" weight="fill" aria-hidden />
              {stats.unread > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[11px] font-semibold leading-none text-destructive-foreground tabular-nums">
                  {stats.unread}
                </span>
              )}
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Notificaciones
              </h1>
              <p className="text-sm text-muted-foreground">
                Centro de notificaciones y alertas
              </p>
            </div>
          </div>
          {stats.unread > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead}>
              <EnvelopeOpen className="size-4" aria-hidden />
              Marcar todas como leídas
            </Button>
          )}
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  {stats.total}
                </p>
                <Badge variant="neutral" className="mt-2">
                  Todas
                </Badge>
              </div>
              <Bell className="size-12 shrink-0 text-primary/30" aria-hidden />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">No Leídas</p>
                <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  {stats.unread}
                </p>
                <Badge variant="destructive" className="mt-2">
                  Pendientes
                </Badge>
              </div>
              <Envelope className="size-12 shrink-0 text-destructive/30" aria-hidden />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Exitosas</p>
                <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-success-text">
                  {stats.success}
                </p>
                <Badge variant="success" className="mt-2">
                  Completadas
                </Badge>
              </div>
              <CheckCircle className="size-12 shrink-0 text-success/30" aria-hidden />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Alertas</p>
                <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-warning-text">
                  {stats.warnings + stats.errors}
                </p>
                <Badge variant="warning" className="mt-2">
                  {stats.errors} críticas
                </Badge>
              </div>
              <Warning className="size-12 shrink-0 text-warning/30" aria-hidden />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Funnel className="size-[18px]" aria-hidden />
              Filtros
            </span>
            <Select value={filterType} onValueChange={(value) => setFilterType(value)}>
              <SelectTrigger className="md:w-[180px]" aria-label="Filtrar por tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="info">Información</SelectItem>
                <SelectItem value="success">Exitosas</SelectItem>
                <SelectItem value="warning">Advertencias</SelectItem>
                <SelectItem value="error">Errores</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={(value) => setFilterCategory(value)}>
              <SelectTrigger className="md:w-[180px]" aria-label="Filtrar por categoría">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                <SelectItem value="system">Sistema</SelectItem>
                <SelectItem value="campaign">Campañas</SelectItem>
                <SelectItem value="ticket">Tickets</SelectItem>
                <SelectItem value="user">Usuarios</SelectItem>
                <SelectItem value="message">Mensajes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabs */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
          <Tabs
            value={String(activeTab)}
            onValueChange={(value) => setActiveTab(Number(value))}
          >
            <TabsList className="flex-wrap">
              <TabsTrigger value="0">
                Todas
                <Badge variant="neutral">{stats.total}</Badge>
              </TabsTrigger>
              <TabsTrigger value="1">
                No Leídas
                <Badge variant="destructive">{stats.unread}</Badge>
              </TabsTrigger>
              <TabsTrigger value="2">Leídas</TabsTrigger>
              <TabsTrigger value="3">Configuración</TabsTrigger>
            </TabsList>

            {/* Tab 1: All Notifications */}
            <TabsContent value="0">
              <ul className="space-y-2">
                {filteredNotifications.length === 0 ? (
                  <li className="py-10 text-center text-sm text-muted-foreground">
                    No hay notificaciones
                  </li>
                ) : (
                  filteredNotifications.map((notification) => (
                    <li
                      key={notification.id}
                      className={cn(
                        'flex items-start gap-3 rounded-lg p-4 transition-colors',
                        notification.isRead ? 'bg-transparent' : 'bg-muted/50',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-10 shrink-0 items-center justify-center rounded-full',
                          getTypeAvatarClass(notification.type),
                        )}
                      >
                        {getCategoryIcon(notification.category)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {notification.title}
                          </span>
                          {!notification.isRead && (
                            <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                          )}
                          <Badge variant={getTypeBadgeVariant(notification.type)}>
                            {notification.type}
                          </Badge>
                          <Badge variant="outline">{notification.category}</Badge>
                        </div>
                        <p className="mb-1 text-sm text-foreground">{notification.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(notification.createdAt).toLocaleString('es-ES')}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {notification.actionUrl && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction(notification)}
                          >
                            Ver
                          </Button>
                        )}
                        {!notification.isRead && (
                          <ActionBtn
                            label="Marcar como leída"
                            onClick={() => markAsRead(notification.id)}
                          >
                            <EnvelopeOpen className="size-[18px]" aria-hidden />
                          </ActionBtn>
                        )}
                        <ActionBtn
                          label="Eliminar"
                          onClick={() => deleteNotification(notification.id)}
                          className="hover:bg-destructive/10 hover:text-destructive-text"
                        >
                          <Trash className="size-[18px]" aria-hidden />
                        </ActionBtn>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </TabsContent>

            {/* Tab 2: Unread Notifications */}
            <TabsContent value="1">
              <ul className="space-y-2">
                {filteredNotifications.length === 0 ? (
                  <li className="py-10 text-center text-sm text-muted-foreground">
                    No hay notificaciones sin leer
                  </li>
                ) : (
                  filteredNotifications.map((notification) => (
                    <li
                      key={notification.id}
                      className="flex items-start gap-3 rounded-lg bg-muted/50 p-4"
                    >
                      <span
                        className={cn(
                          'flex size-10 shrink-0 items-center justify-center rounded-full',
                          getTypeAvatarClass(notification.type),
                        )}
                      >
                        {getCategoryIcon(notification.category)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {notification.title}
                          </span>
                          <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                        </div>
                        <p className="text-sm text-foreground">{notification.message}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {notification.actionUrl && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction(notification)}
                          >
                            Ver
                          </Button>
                        )}
                        <ActionBtn
                          label="Marcar como leída"
                          onClick={() => markAsRead(notification.id)}
                        >
                          <EnvelopeOpen className="size-[18px]" aria-hidden />
                        </ActionBtn>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </TabsContent>

            {/* Tab 3: Read Notifications */}
            <TabsContent value="2">
              <ul className="space-y-2">
                {filteredNotifications.length === 0 ? (
                  <li className="py-10 text-center text-sm text-muted-foreground">
                    No hay notificaciones leídas
                  </li>
                ) : (
                  filteredNotifications.map((notification) => (
                    <li
                      key={notification.id}
                      className="flex items-start gap-3 rounded-lg p-4 transition-colors hover:bg-accent/40"
                    >
                      <span
                        className={cn(
                          'flex size-10 shrink-0 items-center justify-center rounded-full',
                          getTypeAvatarClass(notification.type),
                        )}
                      >
                        {getCategoryIcon(notification.category)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                          {notification.title}
                        </p>
                        <p className="text-sm text-muted-foreground">{notification.message}</p>
                      </div>
                      <ActionBtn
                        label="Eliminar"
                        onClick={() => deleteNotification(notification.id)}
                        className="hover:bg-destructive/10 hover:text-destructive-text"
                      >
                        <Trash className="size-[18px]" aria-hidden />
                      </ActionBtn>
                    </li>
                  ))
                )}
              </ul>
            </TabsContent>

            {/* Tab 4: Settings */}
            <TabsContent value="3">
              <div className="space-y-6 p-2">
                <div>
                  <h2 className="mb-4 text-lg font-semibold text-foreground">
                    Preferencias de Notificaciones
                  </h2>
                  <div className="space-y-4">
                    {preferenceRows.map((row, index) => (
                      <div key={row.id} className="space-y-4">
                        {index > 0 && separator}
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <Label htmlFor={row.id}>{row.label}</Label>
                            <p className="mt-1 text-sm text-muted-foreground">{row.hint}</p>
                          </div>
                          <Toggle
                            id={row.id}
                            label={row.label}
                            checked={preferences[row.key]}
                            onChange={(checked) =>
                              setPreferences({ ...preferences, [row.key]: checked })
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {separator}
                <Button size="sm">Guardar Preferencias</Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
