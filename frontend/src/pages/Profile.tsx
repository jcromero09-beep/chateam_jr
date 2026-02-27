import { Container, Typography, Box, Stack, Card, CardContent, Avatar } from '@mui/joy'
import { Person as PersonIcon } from '@mui/icons-material'
import { useAuth } from '../hooks/useAuth'

export default function Profile() {
  const { user } = useAuth()

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        <Stack direction="row" spacing={2} alignItems="center">
          <PersonIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography level="h2">Mi Perfil</Typography>
        </Stack>

        <Card>
          <CardContent>
            <Stack direction="row" spacing={3} alignItems="center">
              <Avatar
                src={user?.profileImage}
                alt={user?.name}
                sx={{ width: 100, height: 100 }}
              >
                {user?.name?.charAt(0) || 'U'}
              </Avatar>
              <Box>
                <Typography level="h3">{user?.name || 'Usuario'}</Typography>
                <Typography level="body-md" sx={{ color: 'text.secondary' }}>
                  {user?.email || 'email@example.com'}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography level="h4" sx={{ mb: 2 }}>
              Configuración de Perfil
            </Typography>
            <Typography level="body-md" sx={{ color: 'text.secondary' }}>
              Esta página está en desarrollo. Aquí podrás editar tu información personal, cambiar contraseña y gestionar tus preferencias.
            </Typography>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  )
}
