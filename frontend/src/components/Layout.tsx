import { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Box, Sheet, List, ListItem, ListItemButton, ListItemContent, Typography } from '@mui/joy'
import DashboardIcon from '@mui/icons-material/Dashboard'
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber'
import ContactsIcon from '@mui/icons-material/Contacts'
import CampaignIcon from '@mui/icons-material/Campaign'
import BarChartIcon from '@mui/icons-material/BarChart'
import SettingsIcon from '@mui/icons-material/Settings'
import LogoutIcon from '@mui/icons-material/Logout'
import { useAuth } from '../hooks/useAuth'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout, user } = useAuth()

  const menuItems = [
    { path: '/', label: 'Dashboard', icon: <DashboardIcon /> },
    { path: '/tickets', label: 'Tickets', icon: <ConfirmationNumberIcon /> },
    { path: '/contacts', label: 'Contactos', icon: <ContactsIcon /> },
    { path: '/campaigns', label: 'Campañas', icon: <CampaignIcon /> },
    { path: '/analytics', label: 'Analytics', icon: <BarChartIcon /> },
    { path: '/settings', label: 'Configuración', icon: <SettingsIcon /> },
  ]

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <Sheet
        sx={{
          width: 240,
          p: 2,
          borderRight: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box mb={3}>
          <Typography level="h4" component="h1">
            JR Chateam
          </Typography>
          <Typography level="body-sm">{user?.name || 'Usuario'}</Typography>
        </Box>

        <List sx={{ flexGrow: 1, gap: 1 }}>
          {menuItems.map((item) => (
            <ListItem key={item.path}>
              <ListItemButton
                selected={location.pathname === item.path}
                onClick={() => navigate(item.path)}
              >
                {item.icon}
                <ListItemContent sx={{ ml: 2 }}>{item.label}</ListItemContent>
              </ListItemButton>
            </ListItem>
          ))}
        </List>

        <Box mt={2}>
          <ListItemButton variant="soft" color="danger" onClick={handleLogout}>
            <LogoutIcon />
            <ListItemContent sx={{ ml: 2 }}>
              Cerrar Sesión
            </ListItemContent>
          </ListItemButton>
        </Box>
      </Sheet>

      {/* Main Content */}
      <Box sx={{ flexGrow: 1, p: 3, bgcolor: 'background.level1' }}>{children}</Box>
    </Box>
  )
}
