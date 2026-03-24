import { useState, useEffect, useRef } from 'react'
import {
  Container,
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Grid,
  Button,
  Input,
  FormControl,
  FormLabel,
  Avatar,
  Divider,
  Chip,
  Alert,
  LinearProgress,
  Tabs,
  TabList,
  Tab,
  TabPanel,
} from '@mui/joy'
import {
  Person as PersonIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Lock as LockIcon,
  PhotoCamera as CameraIcon,
  Email as EmailIcon,
  Badge as BadgeIcon,
  Business as BusinessIcon,
  CalendarMonth as CalendarIcon,
  CheckCircle as CheckIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material'
import { useAuth } from '../hooks/useAuth'
import api from '../services/api'

const API_URL = import.meta.env.VITE_API_URL || ''

export default function Profile() {
  const { user } = useAuth()

  // Profile data
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [profileImage, setProfileImage] = useState<string | undefined>('')
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  // Password change
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)

  // Upload
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Notifications
  const [notification, setNotification] = useState<{
    type: 'success' | 'danger' | 'warning'
    message: string
  } | null>(null)

  // User detail from API
  const [userDetail, setUserDetail] = useState<Record<string, unknown> | null>(null)

  const showNotification = (type: 'success' | 'danger' | 'warning', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  // Load user data
  useEffect(() => {
    if (user?.id) {
      fetchUserData()
    }
  }, [user?.id])

  const fetchUserData = async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/users/${user?.id}`)
      const userData = data?.data ?? data
      setName(userData.name || '')
      setEmail(userData.email || '')
      setProfileImage(userData.profileImage || '')
      setUserDetail(userData)
    } catch {
      // Fallback to auth context
      setName(user?.name || '')
      setEmail(user?.email || '')
      setProfileImage(user?.profileImage || '')
    } finally {
      setLoading(false)
    }
  }

  // Save profile
  const handleSaveProfile = async () => {
    if (!name.trim()) {
      showNotification('warning', 'El nombre es obligatorio')
      return
    }
    if (!email.trim()) {
      showNotification('warning', 'El email es obligatorio')
      return
    }

    setSaving(true)
    try {
      await api.put(`/users/${user?.id}`, { name: name.trim(), email: email.trim() })
      setEditMode(false)
      showNotification('success', 'Perfil actualizado correctamente')
      fetchUserData()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      showNotification('danger', error?.response?.data?.error || 'Error al actualizar el perfil')
    } finally {
      setSaving(false)
    }
  }

  // Change password
  const handleChangePassword = async () => {
    if (!currentPassword) {
      showNotification('warning', 'Ingresa tu contraseña actual')
      return
    }
    if (!newPassword || newPassword.length < 6) {
      showNotification('warning', 'La nueva contraseña debe tener al menos 6 caracteres')
      return
    }
    if (newPassword !== confirmPassword) {
      showNotification('danger', 'Las contraseñas no coinciden')
      return
    }

    setChangingPassword(true)
    try {
      await api.put(`/users/${user?.id}`, {
        password: newPassword,
        oldPassword: currentPassword,
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      showNotification('success', 'Contraseña actualizada correctamente')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      showNotification(
        'danger',
        error?.response?.data?.error || 'Error al cambiar la contraseña. Verifica tu contraseña actual.'
      )
    } finally {
      setChangingPassword(false)
    }
  }

  // Upload profile image
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!validTypes.includes(file.type)) {
      showNotification('warning', 'Solo se permiten imágenes (JPG, PNG, GIF, WebP)')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      showNotification('warning', 'La imagen no debe superar 5MB')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('profileImage', file)

      await api.post(`/users/${user?.id}/media-upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      showNotification('success', 'Imagen de perfil actualizada')
      fetchUserData()
    } catch {
      showNotification('danger', 'Error al subir la imagen')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleCancelEdit = () => {
    setName((userDetail?.name as string) || user?.name || '')
    setEmail((userDetail?.email as string) || user?.email || '')
    setEditMode(false)
  }

  const getProfileImageUrl = () => {
    if (!profileImage) return undefined
    if (profileImage.startsWith('http')) return profileImage
    return `${API_URL}/public/${profileImage}`
  }

  const getRoleName = (profile: string) => {
    switch (profile) {
      case 'admin':
        return 'Administrador'
      case 'supervisor':
        return 'Supervisor'
      case 'user':
        return 'Agente'
      default:
        return profile || '—'
    }
  }

  if (loading) {
    return (
      <Container maxWidth="lg">
        <LinearProgress />
      </Container>
    )
  }

  return (
    <Container maxWidth="lg">
      <Stack spacing={3}>
        {/* Notification */}
        {notification && (
          <Alert
            color={notification.type}
            variant="soft"
            endDecorator={
              <Button
                variant="plain"
                size="sm"
                color={notification.type}
                onClick={() => setNotification(null)}
              >
                Cerrar
              </Button>
            }
          >
            {notification.message}
          </Alert>
        )}

        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center">
          <PersonIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography level="h2">Mi Perfil</Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              Gestiona tu información personal y seguridad
            </Typography>
          </Box>
        </Stack>

        {/* Profile Card */}
        <Card>
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems="center">
              {/* Avatar with upload */}
              <Box sx={{ position: 'relative' }}>
                <Avatar
                  src={getProfileImageUrl()}
                  alt={name}
                  sx={{ width: 120, height: 120, fontSize: '2.5rem' }}
                >
                  {name?.charAt(0)?.toUpperCase() || 'U'}
                </Avatar>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleImageUpload}
                />
                <Button
                  size="sm"
                  variant="solid"
                  color="primary"
                  loading={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  sx={{
                    position: 'absolute',
                    bottom: 0,
                    right: -8,
                    minWidth: 36,
                    minHeight: 36,
                    borderRadius: '50%',
                    p: 0,
                  }}
                >
                  {!uploading && <CameraIcon sx={{ fontSize: 18 }} />}
                </Button>
              </Box>

              {/* Basic info */}
              <Box sx={{ flex: 1 }}>
                <Typography level="h3">{name || 'Usuario'}</Typography>
                <Typography level="body-md" sx={{ color: 'text.secondary' }}>
                  {email}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap">
                  <Chip
                    size="sm"
                    variant="soft"
                    color="primary"
                    startDecorator={<BadgeIcon sx={{ fontSize: 14 }} />}
                  >
                    {getRoleName(user?.profile || '')}
                  </Chip>
                  {user?.company?.name && (
                    <Chip
                      size="sm"
                      variant="soft"
                      color="neutral"
                      startDecorator={<BusinessIcon sx={{ fontSize: 14 }} />}
                    >
                      {user.company.name}
                    </Chip>
                  )}
                  {user?.super && (
                    <Chip size="sm" variant="soft" color="warning">
                      Super Admin
                    </Chip>
                  )}
                </Stack>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Card>
          <Tabs defaultValue={0}>
            <TabList>
              <Tab>Información Personal</Tab>
              <Tab>Cambiar Contraseña</Tab>
              <Tab>Cuenta</Tab>
            </TabList>

            {/* Tab 1: Personal Info */}
            <TabPanel value={0}>
              <Stack spacing={3}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography level="title-lg">Datos Personales</Typography>
                  {!editMode ? (
                    <Button
                      variant="outlined"
                      size="sm"
                      startDecorator={<EditIcon />}
                      onClick={() => setEditMode(true)}
                    >
                      Editar
                    </Button>
                  ) : (
                    <Stack direction="row" spacing={1}>
                      <Button
                        variant="outlined"
                        size="sm"
                        color="neutral"
                        onClick={handleCancelEdit}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        startDecorator={<SaveIcon />}
                        onClick={handleSaveProfile}
                        loading={saving}
                      >
                        Guardar
                      </Button>
                    </Stack>
                  )}
                </Stack>

                <Divider />

                <Grid container spacing={3}>
                  <Grid xs={12} md={6}>
                    <FormControl>
                      <FormLabel>Nombre completo</FormLabel>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={!editMode}
                        startDecorator={<PersonIcon />}
                        placeholder="Tu nombre completo"
                      />
                    </FormControl>
                  </Grid>
                  <Grid xs={12} md={6}>
                    <FormControl>
                      <FormLabel>Correo electrónico</FormLabel>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={!editMode}
                        startDecorator={<EmailIcon />}
                        placeholder="tu@email.com"
                      />
                    </FormControl>
                  </Grid>
                </Grid>

                <Divider />
                <Typography level="title-md">Información Adicional</Typography>
                <Grid container spacing={3}>
                  <Grid xs={12} md={6}>
                    <FormControl>
                      <FormLabel>Rol</FormLabel>
                      <Input
                        value={getRoleName(user?.profile || '')}
                        disabled
                        startDecorator={<BadgeIcon />}
                      />
                    </FormControl>
                  </Grid>
                  <Grid xs={12} md={6}>
                    <FormControl>
                      <FormLabel>Empresa</FormLabel>
                      <Input
                        value={user?.company?.name || 'Sin empresa'}
                        disabled
                        startDecorator={<BusinessIcon />}
                      />
                    </FormControl>
                  </Grid>
                </Grid>
              </Stack>
            </TabPanel>

            {/* Tab 2: Change Password */}
            <TabPanel value={1}>
              <Stack spacing={3} sx={{ maxWidth: 500 }}>
                <Typography level="title-lg">Cambiar Contraseña</Typography>
                <Divider />

                <Alert color="primary" variant="soft">
                  La contraseña debe tener al menos 6 caracteres. Elige una contraseña segura
                  combinando letras, números y símbolos.
                </Alert>

                <FormControl>
                  <FormLabel>Contraseña actual</FormLabel>
                  <Input
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    startDecorator={<LockIcon />}
                    endDecorator={
                      <Button
                        variant="plain"
                        size="sm"
                        onClick={() => setShowCurrentPw(!showCurrentPw)}
                        sx={{ minWidth: 'auto' }}
                      >
                        {showCurrentPw ? (
                          <VisibilityOffIcon sx={{ fontSize: 18 }} />
                        ) : (
                          <VisibilityIcon sx={{ fontSize: 18 }} />
                        )}
                      </Button>
                    }
                    placeholder="Ingresa tu contraseña actual"
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Nueva contraseña</FormLabel>
                  <Input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    startDecorator={<LockIcon />}
                    endDecorator={
                      <Button
                        variant="plain"
                        size="sm"
                        onClick={() => setShowNewPw(!showNewPw)}
                        sx={{ minWidth: 'auto' }}
                      >
                        {showNewPw ? (
                          <VisibilityOffIcon sx={{ fontSize: 18 }} />
                        ) : (
                          <VisibilityIcon sx={{ fontSize: 18 }} />
                        )}
                      </Button>
                    }
                    placeholder="Mínimo 6 caracteres"
                  />
                  {newPassword && newPassword.length < 6 && (
                    <Typography level="body-xs" sx={{ color: 'danger.500', mt: 0.5 }}>
                      La contraseña debe tener al menos 6 caracteres
                    </Typography>
                  )}
                </FormControl>

                <FormControl>
                  <FormLabel>Confirmar nueva contraseña</FormLabel>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    startDecorator={<LockIcon />}
                    placeholder="Repite la nueva contraseña"
                    color={
                      confirmPassword && confirmPassword !== newPassword ? 'danger' : undefined
                    }
                  />
                  {confirmPassword && confirmPassword !== newPassword && (
                    <Typography level="body-xs" sx={{ color: 'danger.500', mt: 0.5 }}>
                      Las contraseñas no coinciden
                    </Typography>
                  )}
                  {confirmPassword &&
                    confirmPassword === newPassword &&
                    newPassword.length >= 6 && (
                      <Typography
                        level="body-xs"
                        sx={{
                          color: 'success.500',
                          mt: 0.5,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                        }}
                      >
                        <CheckIcon sx={{ fontSize: 14 }} /> Las contraseñas coinciden
                      </Typography>
                    )}
                </FormControl>

                <Button
                  startDecorator={<LockIcon />}
                  onClick={handleChangePassword}
                  loading={changingPassword}
                  disabled={
                    !currentPassword ||
                    !newPassword ||
                    newPassword.length < 6 ||
                    newPassword !== confirmPassword
                  }
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Cambiar Contraseña
                </Button>
              </Stack>
            </TabPanel>

            {/* Tab 3: Account Info */}
            <TabPanel value={2}>
              <Stack spacing={3}>
                <Typography level="title-lg">Información de Cuenta</Typography>
                <Divider />

                <Grid container spacing={3}>
                  <Grid xs={12} sm={6} md={4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Stack spacing={1}>
                          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                            ID de Usuario
                          </Typography>
                          <Typography level="title-md">{user?.id || '—'}</Typography>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid xs={12} sm={6} md={4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Stack spacing={1}>
                          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                            Rol del Sistema
                          </Typography>
                          <Chip
                            color={
                              user?.profile === 'admin'
                                ? 'primary'
                                : user?.profile === 'supervisor'
                                  ? 'warning'
                                  : 'neutral'
                            }
                            variant="soft"
                          >
                            {getRoleName(user?.profile || '')}
                          </Chip>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid xs={12} sm={6} md={4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Stack spacing={1}>
                          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                            Empresa
                          </Typography>
                          <Typography level="title-md">
                            {user?.company?.name || '—'}
                          </Typography>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid xs={12} sm={6} md={4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Stack spacing={1}>
                          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                            Plan Actual
                          </Typography>
                          <Typography level="title-md">
                            {user?.company?.plan?.name || '—'}
                          </Typography>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid xs={12} sm={6} md={4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Stack spacing={1}>
                          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                            Estado de Cuenta
                          </Typography>
                          <Chip
                            color={user?.company?.status ? 'success' : 'danger'}
                            variant="soft"
                          >
                            {user?.company?.status ? 'Activa' : 'Suspendida'}
                          </Chip>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid xs={12} sm={6} md={4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Stack spacing={1}>
                          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                            Vencimiento
                          </Typography>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <CalendarIcon sx={{ fontSize: 18, color: 'text.tertiary' }} />
                            <Typography level="title-md">
                              {user?.company?.dueDate
                                ? new Date(user.company.dueDate).toLocaleDateString('es-ES', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                  })
                                : '—'}
                            </Typography>
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>

                <Divider />

                <Alert color="neutral" variant="soft">
                  Para cambios en tu rol, empresa o plan, contacta al administrador de tu
                  organización.
                </Alert>
              </Stack>
            </TabPanel>
          </Tabs>
        </Card>
      </Stack>
    </Container>
  )
}
