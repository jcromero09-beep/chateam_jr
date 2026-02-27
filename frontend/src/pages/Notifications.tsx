import { useState, useEffect } from 'react'
import {
  Container,
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Grid,
  Button,
  IconButton,
  Chip,
  List,
  ListItem,
  ListItemContent,
  ListItemDecorator,
  Avatar,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Badge,
  Switch,
  FormControl,
  FormLabel,
  Select,
  Option,
  Divider,
} from '@mui/joy'
import {
  Notifications as NotificationsIcon,
  CheckCircle as CheckIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Mail as MailIcon,
  Campaign as CampaignIcon,
  Person as PersonIcon,
  Settings as SettingsIcon,
  Delete as DeleteIcon,
  MarkEmailRead as MarkReadIcon,
  FilterList as FilterIcon,
  Circle as CircleIcon,
} from '@mui/icons-material'

/**
 * Interface for Notification data structure
 */
interface Notification {
  id: number
  type: 'info' | 'success' | 'warning' | 'error'
  category: 'system' | 'campaign' | 'ticket' | 'user' | 'message'
  title: string
  message: string
  isRead: boolean
  createdAt: string
  actionUrl?: string
  icon?: React.ReactNode
}

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
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [filterType, setFilterType] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')

  // Notification preferences
  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    pushNotifications: true,
    campaignAlerts: true,
    ticketAlerts: true,
    systemAlerts: true,
  })

  useEffect(() => {
    fetchNotifications()
  }, [])

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      // In production, replace with actual API call
      // const response = await api.get('/notifications')
      // setNotifications(response.data)

      // Mock data
      const mockNotifications: Notification[] = [
        {
          id: 1,
          type: 'success',
          category: 'campaign',
          title: 'Campaña enviada exitosamente',
          message: 'Tu campaña "Promoción Verano 2025" fue enviada a 1,500 contactos',
          isRead: false,
          createdAt: '2025-01-13T10:30:00Z',
          actionUrl: '/marketing/campaigns/123',
        },
        {
          id: 2,
          type: 'info',
          category: 'ticket',
          title: 'Nuevo ticket asignado',
          message: 'Se te ha asignado el ticket #4521 del cliente TechCorp',
          isRead: false,
          createdAt: '2025-01-13T09:15:00Z',
          actionUrl: '/tickets/4521',
        },
        {
          id: 3,
          type: 'warning',
          category: 'system',
          title: 'Límite de mensajes alcanzado',
          message: 'Has usado el 90% de tu límite mensual de mensajes (9,000/10,000)',
          isRead: false,
          createdAt: '2025-01-13T08:45:00Z',
          actionUrl: '/billing',
        },
        {
          id: 4,
          type: 'success',
          category: 'user',
          title: 'Nuevo usuario registrado',
          message: 'María García se ha unido a tu equipo como Agente',
          isRead: true,
          createdAt: '2025-01-12T16:20:00Z',
          actionUrl: '/settings/users',
        },
        {
          id: 5,
          type: 'info',
          category: 'message',
          title: 'Mensaje recibido',
          message: 'Tienes 3 mensajes nuevos sin leer de clientes',
          isRead: true,
          createdAt: '2025-01-12T14:30:00Z',
          actionUrl: '/tickets',
        },
        {
          id: 6,
          type: 'error',
          category: 'campaign',
          title: 'Error en campaña',
          message: 'La campaña "Email Newsletter" falló por credenciales inválidas',
          isRead: true,
          createdAt: '2025-01-12T11:00:00Z',
          actionUrl: '/marketing/campaigns/124',
        },
        {
          id: 7,
          type: 'info',
          category: 'system',
          title: 'Actualización disponible',
          message: 'Nueva versión del sistema disponible (v6.1.0)',
          isRead: true,
          createdAt: '2025-01-11T09:00:00Z',
        },
        {
          id: 8,
          type: 'success',
          category: 'campaign',
          title: 'Campaña completada',
          message: 'Campaña "Black Friday" finalizada - Tasa de apertura: 45.2%',
          isRead: true,
          createdAt: '2025-01-10T18:00:00Z',
          actionUrl: '/marketing/insights',
        },
      ]

      setNotifications(mockNotifications)
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }

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
        return <CampaignIcon />
      case 'ticket':
        return <InfoIcon />
      case 'user':
        return <PersonIcon />
      case 'message':
        return <MailIcon />
      case 'system':
        return <SettingsIcon />
      default:
        return <NotificationsIcon />
    }
  }

  // Get color based on type
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'success'
      case 'warning':
        return 'warning'
      case 'error':
        return 'danger'
      case 'info':
      default:
        return 'primary'
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
      // await api.patch(`/notifications/${notificationId}/read`)
      setNotifications(
        notifications.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
      )
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      // await api.post('/notifications/mark-all-read')
      setNotifications(notifications.map((n) => ({ ...n, isRead: true })))
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  // Delete notification
  const deleteNotification = async (notificationId: number) => {
    try {
      // await api.delete(`/notifications/${notificationId}`)
      setNotifications(notifications.filter((n) => n.id !== notificationId))
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

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <Badge badgeContent={stats.unread} color="danger">
              <NotificationsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            </Badge>
            <Box>
              <Typography level="h2">Notificaciones</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Centro de notificaciones y alertas
              </Typography>
            </Box>
          </Stack>
          {stats.unread > 0 && (
            <Button variant="outlined" onClick={markAllAsRead} startDecorator={<MarkReadIcon />}>
              Marcar todas como leídas
            </Button>
          )}
        </Stack>

        {/* Statistics */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                      Total
                    </Typography>
                    <Typography level="h2">{stats.total}</Typography>
                    <Chip size="sm" color="neutral" variant="soft" sx={{ mt: 1 }}>
                      Todas
                    </Chip>
                  </Box>
                  <NotificationsIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                      No Leídas
                    </Typography>
                    <Typography level="h2">{stats.unread}</Typography>
                    <Chip size="sm" color="danger" variant="soft" sx={{ mt: 1 }}>
                      Pendientes
                    </Chip>
                  </Box>
                  <MailIcon sx={{ fontSize: 48, color: 'danger.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                      Exitosas
                    </Typography>
                    <Typography level="h2">{stats.success}</Typography>
                    <Chip size="sm" color="success" variant="soft" sx={{ mt: 1 }}>
                      Completadas
                    </Chip>
                  </Box>
                  <CheckIcon sx={{ fontSize: 48, color: 'success.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                      Alertas
                    </Typography>
                    <Typography level="h2">{stats.warnings + stats.errors}</Typography>
                    <Chip size="sm" color="warning" variant="soft" sx={{ mt: 1 }}>
                      {stats.errors} críticas
                    </Chip>
                  </Box>
                  <WarningIcon sx={{ fontSize: 48, color: 'warning.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Filters */}
        <Card>
          <CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
              <FilterIcon />
              <Select
                value={filterType}
                onChange={(_, value) => setFilterType(value as string)}
                sx={{ minWidth: 180 }}
                size="sm"
              >
                <Option value="all">Todos los tipos</Option>
                <Option value="info">Información</Option>
                <Option value="success">Exitosas</Option>
                <Option value="warning">Advertencias</Option>
                <Option value="error">Errores</Option>
              </Select>
              <Select
                value={filterCategory}
                onChange={(_, value) => setFilterCategory(value as string)}
                sx={{ minWidth: 180 }}
                size="sm"
              >
                <Option value="all">Todas las categorías</Option>
                <Option value="system">Sistema</Option>
                <Option value="campaign">Campañas</Option>
                <Option value="ticket">Tickets</Option>
                <Option value="user">Usuarios</Option>
                <Option value="message">Mensajes</Option>
              </Select>
            </Stack>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Card>
          <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value as number)}>
            <TabList>
              <Tab>
                Todas
                <Chip size="sm" sx={{ ml: 1 }}>
                  {stats.total}
                </Chip>
              </Tab>
              <Tab>
                No Leídas
                <Chip size="sm" color="danger" sx={{ ml: 1 }}>
                  {stats.unread}
                </Chip>
              </Tab>
              <Tab>Leídas</Tab>
              <Tab>Configuración</Tab>
            </TabList>

            {/* Tab 1: All Notifications */}
            <TabPanel value={0}>
              <List>
                {filteredNotifications.length === 0 ? (
                  <ListItem>
                    <ListItemContent>
                      <Typography level="body-md" sx={{ textAlign: 'center', py: 4 }}>
                        No hay notificaciones
                      </Typography>
                    </ListItemContent>
                  </ListItem>
                ) : (
                  filteredNotifications.map((notification) => (
                    <ListItem
                      key={notification.id}
                      sx={{
                        bgcolor: notification.isRead ? 'transparent' : 'background.level1',
                        borderRadius: 'sm',
                        mb: 1,
                        p: 2,
                      }}
                    >
                      <ListItemDecorator>
                        <Avatar color={getTypeColor(notification.type)}>
                          {getCategoryIcon(notification.category)}
                        </Avatar>
                      </ListItemDecorator>
                      <ListItemContent>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                          <Typography level="title-md">{notification.title}</Typography>
                          {!notification.isRead && (
                            <CircleIcon sx={{ fontSize: 8, color: 'primary.main' }} />
                          )}
                          <Chip size="sm" color={getTypeColor(notification.type)} variant="soft">
                            {notification.type}
                          </Chip>
                          <Chip size="sm" variant="outlined">
                            {notification.category}
                          </Chip>
                        </Stack>
                        <Typography level="body-sm" sx={{ mb: 1 }}>
                          {notification.message}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {new Date(notification.createdAt).toLocaleString('es-ES')}
                        </Typography>
                      </ListItemContent>
                      <Stack direction="row" spacing={0.5}>
                        {notification.actionUrl && (
                          <Button
                            size="sm"
                            variant="soft"
                            onClick={() => handleAction(notification)}
                          >
                            Ver
                          </Button>
                        )}
                        {!notification.isRead && (
                          <IconButton
                            size="sm"
                            variant="plain"
                            onClick={() => markAsRead(notification.id)}
                          >
                            <MarkReadIcon />
                          </IconButton>
                        )}
                        <IconButton
                          size="sm"
                          variant="plain"
                          color="danger"
                          onClick={() => deleteNotification(notification.id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Stack>
                    </ListItem>
                  ))
                )}
              </List>
            </TabPanel>

            {/* Tab 2: Unread Notifications */}
            <TabPanel value={1}>
              <List>
                {filteredNotifications.length === 0 ? (
                  <ListItem>
                    <ListItemContent>
                      <Typography level="body-md" sx={{ textAlign: 'center', py: 4 }}>
                        No hay notificaciones sin leer
                      </Typography>
                    </ListItemContent>
                  </ListItem>
                ) : (
                  filteredNotifications.map((notification) => (
                    <ListItem
                      key={notification.id}
                      sx={{
                        bgcolor: 'background.level1',
                        borderRadius: 'sm',
                        mb: 1,
                        p: 2,
                      }}
                    >
                      <ListItemDecorator>
                        <Avatar color={getTypeColor(notification.type)}>
                          {getCategoryIcon(notification.category)}
                        </Avatar>
                      </ListItemDecorator>
                      <ListItemContent>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                          <Typography level="title-md">{notification.title}</Typography>
                          <CircleIcon sx={{ fontSize: 8, color: 'primary.main' }} />
                        </Stack>
                        <Typography level="body-sm">{notification.message}</Typography>
                      </ListItemContent>
                      <Stack direction="row" spacing={0.5}>
                        {notification.actionUrl && (
                          <Button
                            size="sm"
                            variant="soft"
                            onClick={() => handleAction(notification)}
                          >
                            Ver
                          </Button>
                        )}
                        <IconButton
                          size="sm"
                          variant="plain"
                          onClick={() => markAsRead(notification.id)}
                        >
                          <MarkReadIcon />
                        </IconButton>
                      </Stack>
                    </ListItem>
                  ))
                )}
              </List>
            </TabPanel>

            {/* Tab 3: Read Notifications */}
            <TabPanel value={2}>
              <List>
                {filteredNotifications.length === 0 ? (
                  <ListItem>
                    <ListItemContent>
                      <Typography level="body-md" sx={{ textAlign: 'center', py: 4 }}>
                        No hay notificaciones leídas
                      </Typography>
                    </ListItemContent>
                  </ListItem>
                ) : (
                  filteredNotifications.map((notification) => (
                    <ListItem key={notification.id} sx={{ mb: 1, p: 2 }}>
                      <ListItemDecorator>
                        <Avatar color={getTypeColor(notification.type)} variant="soft">
                          {getCategoryIcon(notification.category)}
                        </Avatar>
                      </ListItemDecorator>
                      <ListItemContent>
                        <Typography level="title-sm">{notification.title}</Typography>
                        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                          {notification.message}
                        </Typography>
                      </ListItemContent>
                      <IconButton
                        size="sm"
                        variant="plain"
                        color="danger"
                        onClick={() => deleteNotification(notification.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </ListItem>
                  ))
                )}
              </List>
            </TabPanel>

            {/* Tab 4: Settings */}
            <TabPanel value={3}>
              <Stack spacing={3}>
                <Box>
                  <Typography level="h4" sx={{ mb: 2 }}>
                    Preferencias de Notificaciones
                  </Typography>
                  <Stack spacing={2}>
                    <FormControl>
                      <Stack
                        direction="row"
                        spacing={2}
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <Box>
                          <FormLabel>Notificaciones por Email</FormLabel>
                          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                            Recibir notificaciones importantes por correo
                          </Typography>
                        </Box>
                        <Switch
                          checked={preferences.emailNotifications}
                          onChange={(e) =>
                            setPreferences({ ...preferences, emailNotifications: e.target.checked })
                          }
                        />
                      </Stack>
                    </FormControl>
                    <Divider />
                    <FormControl>
                      <Stack
                        direction="row"
                        spacing={2}
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <Box>
                          <FormLabel>Notificaciones Push</FormLabel>
                          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                            Notificaciones en tiempo real en el navegador
                          </Typography>
                        </Box>
                        <Switch
                          checked={preferences.pushNotifications}
                          onChange={(e) =>
                            setPreferences({ ...preferences, pushNotifications: e.target.checked })
                          }
                        />
                      </Stack>
                    </FormControl>
                    <Divider />
                    <FormControl>
                      <Stack
                        direction="row"
                        spacing={2}
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <Box>
                          <FormLabel>Alertas de Campañas</FormLabel>
                          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                            Notificar sobre el estado de campañas de marketing
                          </Typography>
                        </Box>
                        <Switch
                          checked={preferences.campaignAlerts}
                          onChange={(e) =>
                            setPreferences({ ...preferences, campaignAlerts: e.target.checked })
                          }
                        />
                      </Stack>
                    </FormControl>
                    <Divider />
                    <FormControl>
                      <Stack
                        direction="row"
                        spacing={2}
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <Box>
                          <FormLabel>Alertas de Tickets</FormLabel>
                          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                            Notificar sobre nuevos tickets y asignaciones
                          </Typography>
                        </Box>
                        <Switch
                          checked={preferences.ticketAlerts}
                          onChange={(e) =>
                            setPreferences({ ...preferences, ticketAlerts: e.target.checked })
                          }
                        />
                      </Stack>
                    </FormControl>
                    <Divider />
                    <FormControl>
                      <Stack
                        direction="row"
                        spacing={2}
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <Box>
                          <FormLabel>Alertas del Sistema</FormLabel>
                          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                            Notificaciones sobre actualizaciones y mantenimiento
                          </Typography>
                        </Box>
                        <Switch
                          checked={preferences.systemAlerts}
                          onChange={(e) =>
                            setPreferences({ ...preferences, systemAlerts: e.target.checked })
                          }
                        />
                      </Stack>
                    </FormControl>
                  </Stack>
                </Box>
                <Divider />
                <Button color="primary">Guardar Preferencias</Button>
              </Stack>
            </TabPanel>
          </Tabs>
        </Card>
      </Stack>
    </Container>
  )
}
