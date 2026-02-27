import { useState, useEffect } from 'react'
import {
  Typography,
  Stack,
  Container,
  Card,
  CardContent,
  Box,
  Grid,
  Button,
  Table,
  Sheet,
  Chip,
  IconButton,
  Input,
  Select,
  Option,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Avatar,
  Switch,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Divider,
  Textarea,
} from '@mui/joy'
import {
  People as UsersIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Security as PermissionsIcon,
  Person as PersonIcon,
} from '@mui/icons-material'
import api from '../services/api'

interface User {
  id: number
  name: string
  email: string
  profile: string
  profileImage?: string
  queues?: any[]
  whatsappId?: number
  startWork?: string
  endWork?: string
  farewellMessage?: string
  isTricked?: boolean
  enabled?: boolean
  // Permission fields
  allTicket?: string
  allowGroup?: boolean
  allHistoric?: string
  allUserChat?: string
  userClosePendingTicket?: string
  allowConnections?: string
  showDashboard?: string
  allowRealTime?: string
  defaultTheme?: string
  defaultMenu?: string
  createdAt: string
}

interface FormData {
  name: string
  email: string
  password: string
  profile: string
  whatsappId: string
  startWork: string
  endWork: string
  farewellMessage: string
  defaultTheme: string
  defaultMenu: string
  // Permissions
  allTicket: string
  allowGroup: boolean
  allHistoric: string
  allUserChat: string
  userClosePendingTicket: string
  allowConnections: string
  showDashboard: string
  allowRealTime: string
}

const initialFormData: FormData = {
  name: '',
  email: '',
  password: '',
  profile: 'user',
  whatsappId: '',
  startWork: '00:00',
  endWork: '23:59',
  farewellMessage: '',
  defaultTheme: 'light',
  defaultMenu: 'open',
  // Permissions - Default values
  allTicket: 'enabled',
  allowGroup: false,
  allHistoric: 'enabled',
  allUserChat: 'enabled',
  userClosePendingTicket: 'enabled',
  allowConnections: 'enabled',
  showDashboard: 'enabled',
  allowRealTime: 'enabled',
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [profileFilter, setProfileFilter] = useState<string>('all')
  const [openModal, setOpenModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [activeTab, setActiveTab] = useState<number>(0)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      console.log('[Users] Fetching users...')
      const response = await api.get('/users')
      console.log('[Users] Users loaded:', response.data)
      setUsers(response.data.users || response.data)
    } catch (error) {
      console.error('[Users] Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      console.log('[Users] Creating user:', formData)
      await api.post('/users', formData)
      fetchUsers()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('[Users] Error creating user:', error)
    }
  }

  const handleUpdate = async () => {
    if (!selectedUser) return
    try {
      // Don't send password if empty
      const updateData = { ...formData }
      if (!updateData.password) {
        delete (updateData as any).password
      }
      console.log('[Users] Updating user:', selectedUser.id, updateData)
      await api.put(`/users/${selectedUser.id}`, updateData)
      fetchUsers()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('[Users] Error updating user:', error)
    }
  }

  const handleDelete = async (userId: number) => {
    if (confirm('¿Estas seguro de eliminar este usuario?')) {
      try {
        console.log('[Users] Deleting user:', userId)
        await api.delete(`/users/${userId}`)
        fetchUsers()
      } catch (error) {
        console.error('[Users] Error deleting user:', error)
      }
    }
  }

  const handleToggleEnabled = async (user: User) => {
    try {
      await api.put(`/users/${user.id}`, { enabled: !user.enabled })
      fetchUsers()
    } catch (error) {
      console.error('[Users] Error toggling user status:', error)
    }
  }

  const openEditModal = (user: User) => {
    console.log('[Users] Opening edit modal for user:', user)
    setSelectedUser(user)
    setFormData({
      name: user.name || '',
      email: user.email || '',
      password: '',
      profile: user.profile || 'user',
      whatsappId: user.whatsappId?.toString() || '',
      startWork: user.startWork || '00:00',
      endWork: user.endWork || '23:59',
      farewellMessage: user.farewellMessage || '',
      defaultTheme: user.defaultTheme || 'light',
      defaultMenu: user.defaultMenu || 'open',
      // Permissions
      allTicket: user.allTicket || 'enabled',
      allowGroup: user.allowGroup || false,
      allHistoric: user.allHistoric || 'enabled',
      allUserChat: user.allUserChat || 'enabled',
      userClosePendingTicket: user.userClosePendingTicket || 'enabled',
      allowConnections: user.allowConnections || 'enabled',
      showDashboard: user.showDashboard || 'enabled',
      allowRealTime: user.allowRealTime || 'enabled',
    })
    setActiveTab(0)
    setOpenModal(true)
  }

  const openCreateModal = () => {
    setSelectedUser(null)
    resetForm()
    setActiveTab(0)
    setOpenModal(true)
  }

  const resetForm = () => {
    setFormData(initialFormData)
  }

  const getProfileColor = (profile: string) => {
    switch (profile) {
      case 'admin':
        return 'danger'
      case 'supervisor':
        return 'warning'
      case 'user':
        return 'primary'
      default:
        return 'neutral'
    }
  }

  const getProfileLabel = (profile: string) => {
    switch (profile) {
      case 'admin':
        return 'Administrador'
      case 'supervisor':
        return 'Supervisor'
      case 'user':
        return 'Usuario'
      default:
        return profile
    }
  }

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesProfile = profileFilter === 'all' || user.profile === profileFilter
    return matchesSearch && matchesProfile
  })

  const stats = {
    total: users.length,
    active: users.filter((u) => u.enabled !== false).length,
    admins: users.filter((u) => u.profile === 'admin').length,
    users: users.filter((u) => u.profile === 'user').length,
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <UsersIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Usuarios</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Gestion de usuarios y permisos del sistema
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <IconButton variant="outlined" color="neutral" onClick={fetchUsers}>
              <RefreshIcon />
            </IconButton>
            <Button startDecorator={<AddIcon />} color="primary" onClick={openCreateModal}>
              Nuevo Usuario
            </Button>
          </Stack>
        </Stack>

        {/* Stats */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Total Usuarios
                </Typography>
                <Typography level="h2">{stats.total}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Activos
                </Typography>
                <Typography level="h2" sx={{ color: 'success.main' }}>
                  {stats.active}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Administradores
                </Typography>
                <Typography level="h2" sx={{ color: 'danger.main' }}>
                  {stats.admins}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Usuarios Basicos
                </Typography>
                <Typography level="h2">{stats.users}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Filters */}
        <Card>
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Input
                placeholder="Buscar usuarios..."
                startDecorator={<SearchIcon />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{ flexGrow: 1 }}
              />
              <Select
                value={profileFilter}
                onChange={(_, value) => setProfileFilter(value as string)}
                sx={{ minWidth: 180 }}
              >
                <Option value="all">Todos los perfiles</Option>
                <Option value="admin">Administradores</Option>
                <Option value="supervisor">Supervisores</Option>
                <Option value="user">Usuarios</Option>
              </Select>
            </Stack>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 60 }}></th>
                  <th style={{ width: 200 }}>Nombre</th>
                  <th style={{ width: 220 }}>Email</th>
                  <th style={{ width: 120 }}>Perfil</th>
                  <th style={{ width: 100 }}>Estado</th>
                  <th style={{ width: 180 }}>Fecha Creacion</th>
                  <th style={{ width: 150 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>Cargando usuarios...</Typography>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>No se encontraron usuarios</Typography>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <Avatar size="sm" src={user.profileImage}>
                          {user.name?.charAt(0) || '?'}
                        </Avatar>
                      </td>
                      <td>
                        <Typography level="body-sm" fontWeight="bold">
                          {user.name}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-xs">{user.email}</Typography>
                      </td>
                      <td>
                        <Chip color={getProfileColor(user.profile)} size="sm">
                          {getProfileLabel(user.profile)}
                        </Chip>
                      </td>
                      <td>
                        <Switch
                          checked={user.enabled !== false}
                          onChange={() => handleToggleEnabled(user)}
                          size="sm"
                        />
                      </td>
                      <td>
                        <Typography level="body-xs">
                          {new Date(user.createdAt).toLocaleDateString('es-ES')}
                        </Typography>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="primary"
                            onClick={() => openEditModal(user)}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={() => handleDelete(user.id)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Stack>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Sheet>
        </Card>

        {/* Modal Create/Edit with Tabs */}
        <Modal open={openModal} onClose={() => setOpenModal(false)}>
          <ModalDialog sx={{ minWidth: 650, maxWidth: 800, maxHeight: '90vh', overflow: 'auto' }}>
            <ModalClose />
            <Typography level="h4" sx={{ mb: 2 }}>
              {selectedUser ? 'Editar Usuario' : 'Nuevo Usuario'}
            </Typography>

            <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value as number)}>
              <TabList>
                <Tab>
                  <PersonIcon sx={{ mr: 1 }} />
                  General
                </Tab>
                <Tab>
                  <PermissionsIcon sx={{ mr: 1 }} />
                  Permisos
                </Tab>
              </TabList>

              {/* Tab: General */}
              <TabPanel value={0}>
                <Stack spacing={2}>
                  <Grid container spacing={2}>
                    <Grid xs={12} md={6}>
                      <FormControl required>
                        <FormLabel>Nombre</FormLabel>
                        <Input
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="Nombre completo"
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Contrasena {selectedUser && '(dejar vacio para mantener)'}</FormLabel>
                        <Input
                          type="password"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          placeholder="••••••••"
                        />
                      </FormControl>
                    </Grid>
                  </Grid>

                  <Grid container spacing={2}>
                    <Grid xs={12} md={8}>
                      <FormControl required>
                        <FormLabel>Email</FormLabel>
                        <Input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="email@ejemplo.com"
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={4}>
                      <FormControl required>
                        <FormLabel>Perfil</FormLabel>
                        <Select
                          value={formData.profile}
                          onChange={(_, value) => setFormData({ ...formData, profile: value as string })}
                        >
                          <Option value="user">Usuario</Option>
                          <Option value="supervisor">Supervisor</Option>
                          <Option value="admin">Administrador</Option>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>

                  <Grid container spacing={2}>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Hora Inicio</FormLabel>
                        <Input
                          type="time"
                          value={formData.startWork}
                          onChange={(e) => setFormData({ ...formData, startWork: e.target.value })}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Hora Fin</FormLabel>
                        <Input
                          type="time"
                          value={formData.endWork}
                          onChange={(e) => setFormData({ ...formData, endWork: e.target.value })}
                        />
                      </FormControl>
                    </Grid>
                  </Grid>

                  <FormControl>
                    <FormLabel>Mensaje de Despedida</FormLabel>
                    <Textarea
                      minRows={2}
                      value={formData.farewellMessage}
                      onChange={(e) => setFormData({ ...formData, farewellMessage: e.target.value })}
                      placeholder="Mensaje de despedida automatico..."
                    />
                  </FormControl>

                  <Grid container spacing={2}>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Tema Predeterminado</FormLabel>
                        <Select
                          value={formData.defaultTheme}
                          onChange={(_, value) => setFormData({ ...formData, defaultTheme: value as string })}
                        >
                          <Option value="light">Claro</Option>
                          <Option value="dark">Oscuro</Option>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Menu Predeterminado</FormLabel>
                        <Select
                          value={formData.defaultMenu}
                          onChange={(_, value) => setFormData({ ...formData, defaultMenu: value as string })}
                        >
                          <Option value="open">Abierto</Option>
                          <Option value="closed">Cerrado</Option>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                </Stack>
              </TabPanel>

              {/* Tab: Permisos */}
              <TabPanel value={1}>
                <Stack spacing={2}>
                  <Typography level="title-sm" sx={{ mb: 1 }}>
                    Configuracion de Permisos
                  </Typography>

                  <Grid container spacing={2}>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Ver Todos los Tickets</FormLabel>
                        <Select
                          value={formData.allTicket}
                          onChange={(_, value) => setFormData({ ...formData, allTicket: value as string })}
                        >
                          <Option value="enabled">Habilitado</Option>
                          <Option value="disabled">Deshabilitado</Option>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Permitir Grupos</FormLabel>
                        <Select
                          value={formData.allowGroup ? 'true' : 'false'}
                          onChange={(_, value) => setFormData({ ...formData, allowGroup: value === 'true' })}
                        >
                          <Option value="true">Habilitado</Option>
                          <Option value="false">Deshabilitado</Option>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>

                  <Grid container spacing={2}>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Ver Historial Completo</FormLabel>
                        <Select
                          value={formData.allHistoric}
                          onChange={(_, value) => setFormData({ ...formData, allHistoric: value as string })}
                        >
                          <Option value="enabled">Habilitado</Option>
                          <Option value="disabled">Deshabilitado</Option>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Ver Chat de Todos los Usuarios</FormLabel>
                        <Select
                          value={formData.allUserChat}
                          onChange={(_, value) => setFormData({ ...formData, allUserChat: value as string })}
                        >
                          <Option value="enabled">Habilitado</Option>
                          <Option value="disabled">Deshabilitado</Option>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>

                  <Grid container spacing={2}>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Cerrar Tickets Pendientes</FormLabel>
                        <Select
                          value={formData.userClosePendingTicket}
                          onChange={(_, value) => setFormData({ ...formData, userClosePendingTicket: value as string })}
                        >
                          <Option value="enabled">Habilitado</Option>
                          <Option value="disabled">Deshabilitado</Option>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Permitir Conexiones</FormLabel>
                        <Select
                          value={formData.allowConnections}
                          onChange={(_, value) => setFormData({ ...formData, allowConnections: value as string })}
                        >
                          <Option value="enabled">Habilitado</Option>
                          <Option value="disabled">Deshabilitado</Option>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>

                  <Grid container spacing={2}>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Ver Dashboard</FormLabel>
                        <Select
                          value={formData.showDashboard}
                          onChange={(_, value) => setFormData({ ...formData, showDashboard: value as string })}
                        >
                          <Option value="enabled">Habilitado</Option>
                          <Option value="disabled">Deshabilitado</Option>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Tiempo Real</FormLabel>
                        <Select
                          value={formData.allowRealTime}
                          onChange={(_, value) => setFormData({ ...formData, allowRealTime: value as string })}
                        >
                          <Option value="enabled">Habilitado</Option>
                          <Option value="disabled">Deshabilitado</Option>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>

                  <Divider sx={{ my: 1 }} />
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                    Nota: Los permisos afectan lo que el usuario puede ver y hacer en el sistema.
                  </Typography>
                </Stack>
              </TabPanel>
            </Tabs>

            <Divider sx={{ my: 2 }} />

            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button variant="outlined" onClick={() => setOpenModal(false)}>
                Cancelar
              </Button>
              <Button color="primary" onClick={selectedUser ? handleUpdate : handleCreate}>
                {selectedUser ? 'Actualizar' : 'Crear'} Usuario
              </Button>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
