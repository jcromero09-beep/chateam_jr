import { useEffect, useState, useCallback } from 'react'
import {
  IconButton,
  Badge,
  Dropdown,
  MenuButton,
  Menu,
  MenuItem,
  Box,
  Typography,
  Stack,
  Chip,
  Divider,
  Tooltip,
} from '@mui/joy'
import {
  Notifications as NotificationsIcon,
  Circle as CircleIcon,
  Event as EventIcon,
  Campaign as CampaignIcon,
  Info as InfoIcon,
  Person as PersonIcon,
  Mail as MailIcon,
  Settings as SettingsIcon,
  MarkEmailRead as MarkReadIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'
import socketService from '../services/socket'
import {
  listNotifications,
  markAllNotificationsAsRead,
  NotificationDTO,
} from '../services/notificationService'

const MAX_PREVIEW = 5

const categoryIcon = (category: string) => {
  switch (category) {
    case 'appointment':
      return <EventIcon fontSize="small" />
    case 'campaign':
      return <CampaignIcon fontSize="small" />
    case 'ticket':
      return <InfoIcon fontSize="small" />
    case 'user':
      return <PersonIcon fontSize="small" />
    case 'message':
      return <MailIcon fontSize="small" />
    case 'system':
      return <SettingsIcon fontSize="small" />
    default:
      return <NotificationsIcon fontSize="small" />
  }
}

const typeColor = (type: string): 'primary' | 'success' | 'warning' | 'danger' => {
  switch (type) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'error':
      return 'danger'
    default:
      return 'primary'
  }
}

const formatRelative = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'Ahora'
  if (min < 60) return `Hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `Hace ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `Hace ${d}d`
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}

export default function NotificationBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<NotificationDTO[]>([])
  const [unread, setUnread] = useState(0)

  const fetchPreview = useCallback(async () => {
    try {
      const { data } = await listNotifications({ filter: 'all', pageNumber: 1 })
      setItems((data.records || []).slice(0, MAX_PREVIEW))
      setUnread(data.unreadCount || 0)
    } catch (err) {
      // sin sesión o error transitorio: no spamear consola
    }
  }, [])

  useEffect(() => {
    if (!user?.id) return
    fetchPreview()
  }, [user?.id, fetchPreview])

  // Realtime via Socket.IO
  useEffect(() => {
    if (!user?.companyId || !user?.id) return
    const socket = socketService.getSocket() ?? socketService.connect(user.companyId, user.id)

    const channel = `user-${user.id}-notification`
    const handler = (payload: { action: string; notification: NotificationDTO }) => {
      if (payload.action === 'create' && payload.notification) {
        setItems((prev) => [payload.notification, ...prev].slice(0, MAX_PREVIEW))
        setUnread((prev) => prev + 1)
      }
    }

    socket.on(channel, handler)
    return () => {
      socket.off(channel, handler)
    }
  }, [user?.companyId, user?.id])

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsAsRead()
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })))
      setUnread(0)
    } catch {
      /* ignore */
    }
  }

  const handleNavigate = (n: NotificationDTO) => {
    if (n.actionUrl) navigate(n.actionUrl)
    else navigate('/notifications')
  }

  if (!user?.id) return null

  return (
    <Dropdown>
      <Tooltip title="Notificaciones" arrow>
        <MenuButton
          slots={{ root: IconButton }}
          slotProps={{ root: { variant: 'plain', color: 'neutral', size: 'sm' } }}
        >
          <Badge
            badgeContent={unread}
            color="danger"
            max={99}
            invisible={unread === 0}
            size="sm"
          >
            <NotificationsIcon />
          </Badge>
        </MenuButton>
      </Tooltip>
      <Menu placement="bottom-end" sx={{ minWidth: 360, maxWidth: 420 }}>
        <Box sx={{ px: 2, py: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography level="title-sm">Notificaciones</Typography>
            {unread > 0 && (
              <Chip
                size="sm"
                color="danger"
                variant="soft"
                startDecorator={<CircleIcon sx={{ fontSize: 8 }} />}
              >
                {unread} sin leer
              </Chip>
            )}
          </Stack>
        </Box>
        <Divider />
        {items.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              No tienes notificaciones
            </Typography>
          </Box>
        ) : (
          items.map((n) => (
            <MenuItem
              key={n.id}
              onClick={() => handleNavigate(n)}
              sx={{
                py: 1.25,
                bgcolor: n.isRead ? 'transparent' : 'background.level1',
                borderLeft: n.isRead ? '3px solid transparent' : `3px solid var(--joy-palette-${typeColor(n.type)}-500)`,
              }}
            >
              <Stack direction="row" spacing={1.5} sx={{ width: '100%' }}>
                <Box sx={{ color: `${typeColor(n.type)}.500`, mt: 0.25 }}>
                  {categoryIcon(n.category)}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography level="body-sm" fontWeight={n.isRead ? 400 : 600} noWrap>
                    {n.title}
                  </Typography>
                  {n.message && (
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }} noWrap>
                      {n.message}
                    </Typography>
                  )}
                  <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.25 }}>
                    {formatRelative(n.createdAt)}
                  </Typography>
                </Box>
              </Stack>
            </MenuItem>
          ))
        )}
        <Divider />
        <Stack direction="row" sx={{ p: 1 }} spacing={1}>
          {unread > 0 && (
            <MenuItem
              onClick={handleMarkAll}
              sx={{ flex: 1, justifyContent: 'center', borderRadius: 'sm' }}
            >
              <MarkReadIcon fontSize="small" sx={{ mr: 1 }} />
              <Typography level="body-xs">Marcar todas leídas</Typography>
            </MenuItem>
          )}
          <MenuItem
            onClick={() => navigate('/notifications')}
            sx={{ flex: 1, justifyContent: 'center', borderRadius: 'sm' }}
          >
            <Typography level="body-xs" sx={{ fontWeight: 600 }}>
              Ver todas
            </Typography>
          </MenuItem>
        </Stack>
      </Menu>
    </Dropdown>
  )
}
