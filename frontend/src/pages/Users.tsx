import { useState, useEffect, type ReactNode } from 'react'
import {
  Users as UsersIcon,
  Plus,
  PencilSimple,
  Trash,
  MagnifyingGlass,
  ArrowClockwise,
  ShieldCheck,
  User as PersonIcon,
  Buildings,
} from '@phosphor-icons/react'
import { useAuth } from '../hooks/useAuth'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Avatar } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import api from '../services/api'

interface QueueOption {
  id: number
  name: string
  color?: string
}

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
  notifyNewAppointments?: boolean
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
  notifyNewAppointments: boolean
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
  notifyNewAppointments: false,
}

const columns = ['', 'Nombre', 'Email', 'Perfil', 'Estado', 'Fecha creación', '']

// Opciones reutilizables de los selects de permisos.
const enabledOptions = (
  <>
    <SelectItem value="enabled">Habilitado</SelectItem>
    <SelectItem value="disabled">Deshabilitado</SelectItem>
  </>
)

const boolOptions = (
  <>
    <SelectItem value="true">Habilitado</SelectItem>
    <SelectItem value="false">Deshabilitado</SelectItem>
  </>
)

// Campo select con label asociado (misma altura que los Input del form).
function SelectField({
  id,
  label,
  value,
  onValueChange,
  placeholder,
  children,
}: {
  id: string
  label: string
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} className="h-11">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  )
}

// Toggle accesible (role=switch) — reemplaza el Switch de Joy.
function ToggleSwitch({
  checked,
  onToggle,
  label,
}: {
  checked: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer appearance-none items-center rounded-full border-0 p-0 outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        checked ? 'bg-success' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'pointer-events-none block size-5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
        aria-hidden
      />
    </button>
  )
}

// Botón de acción de fila (mismo look que RowAction, con onClick).
function ActionBtn({
  label,
  onClick,
  className,
  children,
}: {
  label: string
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [queues, setQueues] = useState<QueueOption[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [profileFilter, setProfileFilter] = useState<string>('all')
  const [openModal, setOpenModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [selectedQueueIds, setSelectedQueueIds] = useState<number[]>([])
  const [activeTab, setActiveTab] = useState<number>(0)

  // [Multi-empresa · F4.1/F4.2] Gestión de MIEMBROS de la empresa activa.
  const { user } = useAuth()
  const canManageMembers = user?.super === true || user?.profile === 'admin'
  const [membersOpen, setMembersOpen] = useState(false)
  const [members, setMembers] = useState<any[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberForm, setMemberForm] = useState<{
    email: string
    profile: string
    queueIds: number[]
    name: string
    password: string
  }>({ email: '', profile: 'user', queueIds: [], name: '', password: '' })
  const [memberError, setMemberError] = useState('')
  const [savingMember, setSavingMember] = useState(false)
  // [F5.1] Edición de colas de un miembro existente (por fila).
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null)
  const [editQueueIds, setEditQueueIds] = useState<number[]>([])

  const fetchMembers = async () => {
    if (!user?.companyId) return
    setMembersLoading(true)
    try {
      const res = await api.get(`/companies/${user.companyId}/members`)
      setMembers(res.data?.members || [])
    } catch {
      setMembers([])
    } finally {
      setMembersLoading(false)
    }
  }
  const openMembers = () => {
    setMemberForm({ email: '', profile: 'user', queueIds: [], name: '', password: '' })
    setMemberError('')
    setEditingMemberId(null)
    setMembersOpen(true)
    fetchMembers()
  }
  const addMember = async () => {
    if (!memberForm.email.trim()) {
      setMemberError('El email es requerido')
      return
    }
    setSavingMember(true)
    setMemberError('')
    try {
      await api.post(`/companies/${user!.companyId}/members`, {
        email: memberForm.email.trim(),
        profile: memberForm.profile,
        queueIds: memberForm.queueIds,
        // [F5.2] solo se usan si el email NO existe (crear identidad nueva)
        name: memberForm.name.trim() || undefined,
        password: memberForm.password || undefined,
      })
      setMemberForm({ email: '', profile: 'user', queueIds: [], name: '', password: '' })
      fetchMembers()
    } catch (e: any) {
      setMemberError(e.response?.data?.error || e.response?.data?.message || 'No se pudo agregar el miembro')
    } finally {
      setSavingMember(false)
    }
  }
  // [F5.1] Editar colas de un miembro existente.
  const startEditQueues = (m: any) => {
    setEditingMemberId(m.userId)
    setEditQueueIds((m.queues || []).map((q: any) => q.id))
  }
  const toggleEditQueue = (qid: number) =>
    setEditQueueIds((ids) => (ids.includes(qid) ? ids.filter((x) => x !== qid) : [...ids, qid]))
  const saveMemberQueues = async (userId: number) => {
    setMemberError('')
    try {
      await api.put(`/companies/${user!.companyId}/members/${userId}`, { queueIds: editQueueIds })
      setEditingMemberId(null)
      fetchMembers()
    } catch (e: any) {
      setMemberError(e.response?.data?.error || e.response?.data?.message || 'No se pudieron guardar las colas')
    }
  }
  const removeMember = async (userId: number) => {
    setMemberError('')
    try {
      await api.delete(`/companies/${user!.companyId}/members/${userId}`)
      fetchMembers()
    } catch (e: any) {
      setMemberError(e.response?.data?.error || e.response?.data?.message || 'No se pudo quitar el miembro')
    }
  }
  const updateMemberProfile = async (userId: number, profile: string) => {
    try {
      await api.put(`/companies/${user!.companyId}/members/${userId}`, { profile })
      fetchMembers()
    } catch { /* noop */ }
  }
  const toggleMemberQueue = (qid: number) =>
    setMemberForm((f) => ({
      ...f,
      queueIds: f.queueIds.includes(qid) ? f.queueIds.filter((x) => x !== qid) : [...f.queueIds, qid],
    }))

  useEffect(() => {
    fetchUsers()
    fetchQueues()
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

  const fetchQueues = async () => {
    try {
      const response = await api.get('/queue')
      setQueues(response.data.queues || response.data || [])
    } catch (error) {
      console.error('[Users] Error fetching queues:', error)
      setQueues([])
    }
  }

  const handleCreate = async () => {
    try {
      const payload = {
        ...formData,
        queueIds: selectedQueueIds,
      }
      // payload incluye la contraseña en claro: no loguear.
      await api.post('/users', payload)
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
      const updateData: any = {
        ...formData,
        queueIds: selectedQueueIds,
      }
      if (!updateData.password) {
        delete updateData.password
      }
      // updateData conserva la contraseña en claro cuando el admin la cambia: no loguear.
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
    setSelectedQueueIds((user.queues || []).map((queue: any) => Number(queue.id)).filter(Boolean))
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
      notifyNewAppointments: !!user.notifyNewAppointments,
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
    setSelectedQueueIds([])
  }

  const toggleQueue = (queueId: number) => {
    setSelectedQueueIds((prev) =>
      prev.includes(queueId) ? prev.filter((id) => id !== queueId) : [...prev, queueId],
    )
  }

  const getProfileVariant = (profile: string): BadgeProps['variant'] => {
    switch (profile) {
      case 'admin':
        return 'destructive'
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

  const formatCreatedAt = (value?: string) => {
    if (!value) return '-'

    const parsedDate = new Date(value)

    if (Number.isNaN(parsedDate.getTime())) {
      return '-'
    }

    return parsedDate.toLocaleDateString('es-ES')
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <UsersIcon className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Usuarios
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestión de usuarios y permisos del sistema
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refrescar"
              className="text-muted-foreground"
              onClick={fetchUsers}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            {canManageMembers && (
              <Button size="sm" variant="outline" onClick={openMembers}>
                <Buildings className="size-4" weight="fill" aria-hidden />
                Miembros
              </Button>
            )}
            <Button size="sm" onClick={openCreateModal}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nuevo usuario
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total usuarios" value={String(stats.total)} />
          <StatTile label="Activos" value={String(stats.active)} tone="success" />
          <StatTile label="Administradores" value={String(stats.admins)} tone="destructive" />
          <StatTile label="Usuarios básicos" value={String(stats.users)} />
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-md">
            <MagnifyingGlass
              className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              placeholder="Buscar usuarios"
              aria-label="Buscar usuarios"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
          <Select value={profileFilter} onValueChange={setProfileFilter}>
            <SelectTrigger
              aria-label="Filtrar por perfil"
              className="h-10 rounded-lg sm:w-52"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los perfiles</SelectItem>
              <SelectItem value="admin">Administradores</SelectItem>
              <SelectItem value="supervisor">Supervisores</SelectItem>
              <SelectItem value="user">Usuarios</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Users Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  {columns.map((c, i) => (
                    <th
                      key={i}
                      className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      Cargando usuarios...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      No se encontraron usuarios
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        {user.profileImage ? (
                          <img
                            src={user.profileImage}
                            alt=""
                            width={32}
                            height={32}
                            className="size-8 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <Avatar name={user.name || '?'} size="sm" />
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{user.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                      <td className="px-4 py-3">
                        <Badge variant={getProfileVariant(user.profile)}>
                          {getProfileLabel(user.profile)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <ToggleSwitch
                          checked={user.enabled !== false}
                          onToggle={() => handleToggleEnabled(user)}
                          label={
                            user.enabled !== false
                              ? `Desactivar a ${user.name}`
                              : `Activar a ${user.name}`
                          }
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatCreatedAt(user.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <ActionBtn label="Editar" onClick={() => openEditModal(user)}>
                            <PencilSimple className="size-[18px]" aria-hidden />
                          </ActionBtn>
                          <ActionBtn
                            label="Eliminar"
                            onClick={() => handleDelete(user.id)}
                            className="hover:bg-destructive/10 hover:text-destructive-text"
                          >
                            <Trash className="size-[18px]" aria-hidden />
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Create/Edit with Tabs */}
      <Dialog open={openModal} onOpenChange={(open) => !open && setOpenModal(false)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedUser ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
          </DialogHeader>

          <Tabs
            value={String(activeTab)}
            onValueChange={(value) => setActiveTab(Number(value))}
          >
            <TabsList>
              <TabsTrigger value="0">
                <PersonIcon className="size-4" aria-hidden />
                General
              </TabsTrigger>
              <TabsTrigger value="1">
                <ShieldCheck className="size-4" aria-hidden />
                Permisos
              </TabsTrigger>
            </TabsList>

            {/* Tab: General */}
            <TabsContent value="0" className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="user-name">
                    Nombre <span className="text-destructive-text">*</span>
                  </Label>
                  <Input
                    id="user-name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Nombre completo"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="user-password">
                    Contraseña {selectedUser && '(dejar vacío para mantener)'}
                  </Label>
                  <PasswordInput
                    id="user-password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="user-email">
                    Email <span className="text-destructive-text">*</span>
                  </Label>
                  <Input
                    id="user-email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@ejemplo.com"
                  />
                </div>
                <SelectField
                  id="user-profile"
                  label="Perfil"
                  value={formData.profile}
                  onValueChange={(value) => setFormData({ ...formData, profile: value })}
                >
                  <SelectItem value="user">Usuario</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectField>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="user-start-work">Hora inicio</Label>
                  <Input
                    id="user-start-work"
                    type="time"
                    value={formData.startWork}
                    onChange={(e) => setFormData({ ...formData, startWork: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="user-end-work">Hora fin</Label>
                  <Input
                    id="user-end-work"
                    type="time"
                    value={formData.endWork}
                    onChange={(e) => setFormData({ ...formData, endWork: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="user-farewell">Mensaje de despedida</Label>
                <textarea
                  id="user-farewell"
                  rows={3}
                  value={formData.farewellMessage}
                  onChange={(e) => setFormData({ ...formData, farewellMessage: e.target.value })}
                  placeholder="Mensaje de despedida automático..."
                  className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors [font-family:inherit] placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SelectField
                  id="user-theme"
                  label="Tema predeterminado"
                  value={formData.defaultTheme}
                  onValueChange={(value) => setFormData({ ...formData, defaultTheme: value })}
                >
                  <SelectItem value="light">Claro</SelectItem>
                  <SelectItem value="dark">Oscuro</SelectItem>
                </SelectField>
                <SelectField
                  id="user-menu"
                  label="Menú predeterminado"
                  value={formData.defaultMenu}
                  onValueChange={(value) => setFormData({ ...formData, defaultMenu: value })}
                >
                  <SelectItem value="open">Abierto</SelectItem>
                  <SelectItem value="closed">Cerrado</SelectItem>
                </SelectField>
              </div>

              <div className="space-y-1.5">
                <Label id="queues-label">Colas asignadas</Label>
                {queues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay colas disponibles</p>
                ) : (
                  <div
                    role="group"
                    aria-labelledby="queues-label"
                    className="flex max-h-40 flex-wrap gap-x-5 gap-y-2.5 overflow-y-auto rounded-md border border-input bg-card p-3"
                  >
                    {queues.map((queue) => (
                      <div key={queue.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`queue-${queue.id}`}
                          checked={selectedQueueIds.includes(queue.id)}
                          onCheckedChange={() => toggleQueue(queue.id)}
                        />
                        <label
                          htmlFor={`queue-${queue.id}`}
                          className="flex cursor-pointer select-none items-center gap-1.5 text-sm text-foreground"
                        >
                          {queue.color && (
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: queue.color }}
                              aria-hidden
                            />
                          )}
                          {queue.name}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Tab: Permisos */}
            <TabsContent value="1" className="mt-4 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">
                Configuración de permisos
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SelectField
                  id="perm-all-ticket"
                  label="Ver todos los tickets"
                  value={formData.allTicket}
                  onValueChange={(value) => setFormData({ ...formData, allTicket: value })}
                >
                  {enabledOptions}
                </SelectField>
                <SelectField
                  id="perm-allow-group"
                  label="Permitir grupos"
                  value={formData.allowGroup ? 'true' : 'false'}
                  onValueChange={(value) =>
                    setFormData({ ...formData, allowGroup: value === 'true' })
                  }
                >
                  {boolOptions}
                </SelectField>
                <SelectField
                  id="perm-all-historic"
                  label="Ver historial completo"
                  value={formData.allHistoric}
                  onValueChange={(value) => setFormData({ ...formData, allHistoric: value })}
                >
                  {enabledOptions}
                </SelectField>
                <SelectField
                  id="perm-all-user-chat"
                  label="Ver chat de todos los usuarios"
                  value={formData.allUserChat}
                  onValueChange={(value) => setFormData({ ...formData, allUserChat: value })}
                >
                  {enabledOptions}
                </SelectField>
                <SelectField
                  id="perm-close-pending"
                  label="Cerrar tickets pendientes"
                  value={formData.userClosePendingTicket}
                  onValueChange={(value) =>
                    setFormData({ ...formData, userClosePendingTicket: value })
                  }
                >
                  {enabledOptions}
                </SelectField>
                <SelectField
                  id="perm-allow-connections"
                  label="Permitir conexiones"
                  value={formData.allowConnections}
                  onValueChange={(value) => setFormData({ ...formData, allowConnections: value })}
                >
                  {enabledOptions}
                </SelectField>
                <SelectField
                  id="perm-show-dashboard"
                  label="Ver dashboard"
                  value={formData.showDashboard}
                  onValueChange={(value) => setFormData({ ...formData, showDashboard: value })}
                >
                  {enabledOptions}
                </SelectField>
                <SelectField
                  id="perm-real-time"
                  label="Tiempo real"
                  value={formData.allowRealTime}
                  onValueChange={(value) => setFormData({ ...formData, allowRealTime: value })}
                >
                  {enabledOptions}
                </SelectField>
              </div>

              <div className="border-t border-border" />

              {/* Permiso especial: recordatorios/avisos de citas */}
              <h3 className="text-sm font-semibold text-foreground">
                Notificaciones de citas
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SelectField
                  id="perm-notify-appointments"
                  label="Recibir notificaciones de citas nuevas"
                  value={formData.notifyNewAppointments ? 'true' : 'false'}
                  onValueChange={(value) =>
                    setFormData({ ...formData, notifyNewAppointments: value === 'true' })
                  }
                >
                  {boolOptions}
                </SelectField>
                <p className="text-xs text-muted-foreground md:mt-7">
                  Los admins con este permiso reciben una notificación in-app cada vez que se
                  registra una cita nueva en la empresa. El usuario asignado a la cita siempre
                  recibe la notificación, sin importar este toggle.
                </p>
              </div>

              <div className="border-t border-border" />
              <p className="text-xs text-muted-foreground">
                Nota: Los permisos afectan lo que el usuario puede ver y hacer en el sistema.
              </p>
            </TabsContent>
          </Tabs>

          <div className="border-t border-border" />

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpenModal(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={selectedUser ? handleUpdate : handleCreate}>
              {selectedUser ? 'Actualizar' : 'Crear'} usuario
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* [Multi-empresa · F4.1/F4.2] Gestión de miembros de la empresa activa */}
      <Dialog open={membersOpen} onOpenChange={(o) => !o && setMembersOpen(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Buildings className="size-5" weight="fill" aria-hidden />
              Miembros de {user?.company?.name || 'la empresa'}
            </DialogTitle>
          </DialogHeader>

          {memberError && (
            <div role="alert" className="rounded-md bg-destructive/12 px-3 py-2 text-sm text-destructive-text">
              {memberError}
            </div>
          )}

          {/* Agregar miembro por email + rol + colas */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-sm font-medium text-foreground">Agregar miembro</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1 space-y-1">
                <Label htmlFor="member-email">Email</Label>
                <Input
                  id="member-email"
                  type="email"
                  value={memberForm.email}
                  onChange={(e) => setMemberForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="usuario@correo.com"
                />
              </div>
              <div className="w-44 space-y-1">
                <Label htmlFor="member-profile">Rol en esta empresa</Label>
                <Select
                  value={memberForm.profile}
                  onValueChange={(v) => setMemberForm((f) => ({ ...f, profile: v }))}
                >
                  <SelectTrigger id="member-profile" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Agente</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={addMember} loading={savingMember}>
                <Plus className="size-4" weight="bold" aria-hidden />
                Agregar
              </Button>
            </div>
            {/* [F5.2] Nombre + contraseña: solo se usan si el email NO existe (crea identidad nueva) */}
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[160px] flex-1 space-y-1">
                <Label htmlFor="member-name" className="text-xs text-muted-foreground">
                  Nombre <span className="opacity-70">(si el email es nuevo)</span>
                </Label>
                <Input
                  id="member-name"
                  value={memberForm.name}
                  onChange={(e) => setMemberForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nombre del usuario nuevo"
                />
              </div>
              <div className="min-w-[160px] flex-1 space-y-1">
                <Label htmlFor="member-password" className="text-xs text-muted-foreground">
                  Contraseña <span className="opacity-70">(si el email es nuevo)</span>
                </Label>
                <PasswordInput
                  id="member-password"
                  value={memberForm.password}
                  onChange={(e) => setMemberForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 5 caracteres"
                />
              </div>
            </div>
            {/* Colas (solo roles no-admin; admin ve todas) */}
            {memberForm.profile !== 'admin' && queues.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Colas asignadas (vacío = ninguna · admin/supervisor con acceso total ven todas)
                </Label>
                <div className="flex flex-wrap gap-2">
                  {queues.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => toggleMemberQueue(q.id)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition-colors',
                        memberForm.queueIds.includes(q.id)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {q.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Lista de miembros actuales */}
          <div className="max-h-[320px] space-y-1.5 overflow-y-auto">
            {membersLoading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Cargando…</p>
            ) : members.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Sin miembros</p>
            ) : (
              members.map((m) => (
                <div key={m.userId} className="rounded-md border border-border">
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{m.name || m.email}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.email} · colas:{' '}
                        {m.profile === 'admin'
                          ? 'todas'
                          : (m.queues || []).map((q: any) => q.name).join(', ') || 'ninguna'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Select value={m.profile} onValueChange={(v) => updateMemberProfile(m.userId, v)}>
                        <SelectTrigger className="h-8 w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">Agente</SelectItem>
                          <SelectItem value="supervisor">Supervisor</SelectItem>
                          <SelectItem value="admin">Administrador</SelectItem>
                        </SelectContent>
                      </Select>
                      {m.profile !== 'admin' && queues.length > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => (editingMemberId === m.userId ? setEditingMemberId(null) : startEditQueues(m))}
                          title="Editar colas"
                          aria-label="Editar colas"
                        >
                          <PencilSimple className="size-4" aria-hidden />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive-text"
                        onClick={() => removeMember(m.userId)}
                        title="Quitar de la empresa"
                        aria-label="Quitar de la empresa"
                      >
                        <Trash className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                  {editingMemberId === m.userId && (
                    <div className="space-y-2 border-t border-border bg-muted/20 px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">Colas asignadas</p>
                      <div className="flex flex-wrap gap-2">
                        {queues.map((q) => (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() => toggleEditQueue(q.id)}
                            className={cn(
                              'rounded-full border px-3 py-1 text-xs transition-colors',
                              editQueueIds.includes(q.id)
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:bg-accent',
                            )}
                          >
                            {q.name}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveMemberQueues(m.userId)}>
                          Guardar colas
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingMemberId(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
