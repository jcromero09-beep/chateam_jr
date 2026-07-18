import { useState, useEffect, useRef } from 'react'
// [Fase2·G] Conservado como MUI: LinearProgress (sin equivalente en el design system).
import { LinearProgress } from '@mui/joy'
import {
  User as PersonIcon,
  PencilSimple as EditIcon,
  FloppyDisk as SaveIcon,
  Lock as LockIcon,
  Camera as CameraIcon,
  Envelope as EmailIcon,
  IdentificationBadge as BadgeIcon,
  Buildings as BusinessIcon,
  CalendarBlank as CalendarIcon,
  CheckCircle as CheckIcon,
  Eye as VisibilityIcon,
  EyeSlash as VisibilityOffIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useAuth } from '../hooks/useAuth'
import api from '../services/api'

const API_URL = import.meta.env.VITE_API_URL || ''

const alertStyles: Record<'success' | 'danger' | 'warning', string> = {
  success: 'border-success/30 bg-success/14 text-success-text',
  danger: 'border-destructive/30 bg-destructive/12 text-destructive-text',
  warning: 'border-warning/30 bg-warning/16 text-warning-text',
}

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

  const roleVariant: BadgeProps['variant'] =
    user?.profile === 'admin' ? 'primary' : user?.profile === 'supervisor' ? 'warning' : 'neutral'

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] p-5 sm:p-6 lg:p-8">
        <LinearProgress />
      </div>
    )
  }

  const profileImageUrl = getProfileImageUrl()

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Notification */}
        {notification && (
          <div
            role="alert"
            className={cn(
              'flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm',
              alertStyles[notification.type]
            )}
          >
            <span>{notification.message}</span>
            <button
              type="button"
              onClick={() => setNotification(null)}
              className="shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold outline-none transition-colors hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-current dark:hover:bg-white/10"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <PersonIcon className="size-6" weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Mi Perfil</h1>
            <p className="text-sm text-muted-foreground">
              Gestiona tu información personal y seguridad
            </p>
          </div>
        </div>

        {/* Profile Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            {/* Avatar with upload */}
            <div className="relative">
              {profileImageUrl ? (
                <img
                  src={profileImageUrl}
                  alt={name}
                  width={120}
                  height={120}
                  className="size-30 rounded-full object-cover ring-1 ring-inset ring-border"
                />
              ) : (
                <span className="flex size-30 select-none items-center justify-center rounded-full bg-primary/12 text-[2.5rem] font-semibold text-primary">
                  {name?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
              <Button
                type="button"
                variant="primary"
                aria-label="Cambiar imagen de perfil"
                loading={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 -right-2 size-9 rounded-full p-0"
              >
                {!uploading && <CameraIcon className="size-[18px]" aria-hidden />}
              </Button>
            </div>

            {/* Basic info */}
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <h2 className="text-xl font-semibold text-foreground">{name || 'Usuario'}</h2>
              <p className="text-sm text-muted-foreground">{email}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                <Badge variant="primary">
                  <BadgeIcon className="size-3.5" aria-hidden />
                  {getRoleName(user?.profile || '')}
                </Badge>
                {user?.company?.name && (
                  <Badge variant="neutral">
                    <BusinessIcon className="size-3.5" aria-hidden />
                    {user.company.name}
                  </Badge>
                )}
                {user?.super && <Badge variant="warning">Super Admin</Badge>}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02]">
          <Tabs defaultValue="personal">
            <TabsList>
              <TabsTrigger value="personal">Información Personal</TabsTrigger>
              <TabsTrigger value="password">Cambiar Contraseña</TabsTrigger>
              <TabsTrigger value="account">Cuenta</TabsTrigger>
            </TabsList>

            {/* Tab 1: Personal Info */}
            <TabsContent value="personal" className="mt-6">
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-foreground">Datos Personales</h3>
                  {!editMode ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditMode(true)}
                    >
                      <EditIcon className="size-4" aria-hidden />
                      Editar
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCancelEdit}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSaveProfile}
                        loading={saving}
                      >
                        <SaveIcon className="size-4" aria-hidden />
                        Guardar
                      </Button>
                    </div>
                  )}
                </div>

                <div className="h-px w-full bg-border" role="separator" />

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="profile-name">Nombre completo</Label>
                    <Input
                      id="profile-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={!editMode}
                      leftIcon={<PersonIcon aria-hidden />}
                      placeholder="Tu nombre completo"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="profile-email">Correo electrónico</Label>
                    <Input
                      id="profile-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={!editMode}
                      leftIcon={<EmailIcon aria-hidden />}
                      placeholder="tu@email.com"
                    />
                  </div>
                </div>

                <div className="h-px w-full bg-border" role="separator" />
                <h4 className="text-base font-semibold text-foreground">Información Adicional</h4>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="profile-role">Rol</Label>
                    <Input
                      id="profile-role"
                      value={getRoleName(user?.profile || '')}
                      disabled
                      leftIcon={<BadgeIcon aria-hidden />}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="profile-company">Empresa</Label>
                    <Input
                      id="profile-company"
                      value={user?.company?.name || 'Sin empresa'}
                      disabled
                      leftIcon={<BusinessIcon aria-hidden />}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Tab 2: Change Password */}
            <TabsContent value="password" className="mt-6">
              <div className="max-w-[500px] space-y-6">
                <h3 className="text-lg font-semibold text-foreground">Cambiar Contraseña</h3>
                <div className="h-px w-full bg-border" role="separator" />

                <div className="rounded-lg border border-primary/25 bg-primary/8 px-4 py-3 text-sm text-foreground">
                  La contraseña debe tener al menos 6 caracteres. Elige una contraseña segura
                  combinando letras, números y símbolos.
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="current-password">Contraseña actual</Label>
                  <Input
                    id="current-password"
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    leftIcon={<LockIcon aria-hidden />}
                    placeholder="Ingresa tu contraseña actual"
                    rightSlot={
                      <button
                        type="button"
                        onClick={() => setShowCurrentPw(!showCurrentPw)}
                        aria-label={showCurrentPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        aria-pressed={showCurrentPw}
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {showCurrentPw ? (
                          <VisibilityOffIcon className="size-[18px]" aria-hidden />
                        ) : (
                          <VisibilityIcon className="size-[18px]" aria-hidden />
                        )}
                      </button>
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-password">Nueva contraseña</Label>
                  <Input
                    id="new-password"
                    type={showNewPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    leftIcon={<LockIcon aria-hidden />}
                    placeholder="Mínimo 6 caracteres"
                    rightSlot={
                      <button
                        type="button"
                        onClick={() => setShowNewPw(!showNewPw)}
                        aria-label={showNewPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        aria-pressed={showNewPw}
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {showNewPw ? (
                          <VisibilityOffIcon className="size-[18px]" aria-hidden />
                        ) : (
                          <VisibilityIcon className="size-[18px]" aria-hidden />
                        )}
                      </button>
                    }
                  />
                  {newPassword && newPassword.length < 6 && (
                    <p className="text-xs text-destructive-text">
                      La contraseña debe tener al menos 6 caracteres
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirmar nueva contraseña</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    leftIcon={<LockIcon aria-hidden />}
                    placeholder="Repite la nueva contraseña"
                    invalid={Boolean(confirmPassword && confirmPassword !== newPassword)}
                  />
                  {confirmPassword && confirmPassword !== newPassword && (
                    <p className="text-xs text-destructive-text">Las contraseñas no coinciden</p>
                  )}
                  {confirmPassword &&
                    confirmPassword === newPassword &&
                    newPassword.length >= 6 && (
                      <p className="flex items-center gap-1 text-xs text-success-text">
                        <CheckIcon className="size-3.5" aria-hidden /> Las contraseñas coinciden
                      </p>
                    )}
                </div>

                <Button
                  type="button"
                  onClick={handleChangePassword}
                  loading={changingPassword}
                  disabled={
                    !currentPassword ||
                    !newPassword ||
                    newPassword.length < 6 ||
                    newPassword !== confirmPassword
                  }
                  className="self-start"
                >
                  <LockIcon className="size-4" aria-hidden />
                  Cambiar Contraseña
                </Button>
              </div>
            </TabsContent>

            {/* Tab 3: Account Info */}
            <TabsContent value="account" className="mt-6">
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-foreground">Información de Cuenta</h3>
                <div className="h-px w-full bg-border" role="separator" />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">ID de Usuario</p>
                    <p className="mt-1 text-base font-semibold text-foreground">{user?.id || '—'}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">Rol del Sistema</p>
                    <div className="mt-1">
                      <Badge variant={roleVariant}>{getRoleName(user?.profile || '')}</Badge>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">Empresa</p>
                    <p className="mt-1 text-base font-semibold text-foreground">
                      {user?.company?.name || '—'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">Plan Actual</p>
                    <p className="mt-1 text-base font-semibold text-foreground">
                      {user?.company?.plan?.name || '—'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">Estado de Cuenta</p>
                    <div className="mt-1">
                      <Badge variant={user?.company?.status ? 'success' : 'destructive'}>
                        {user?.company?.status ? 'Activa' : 'Suspendida'}
                      </Badge>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">Vencimiento</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <CalendarIcon className="size-[18px] text-muted-foreground" aria-hidden />
                      <p className="text-base font-semibold text-foreground">
                        {user?.company?.dueDate
                          ? new Date(user.company.dueDate).toLocaleDateString('es-ES', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })
                          : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="h-px w-full bg-border" role="separator" />

                <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  Para cambios en tu rol, empresa o plan, contacta al administrador de tu
                  organización.
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
