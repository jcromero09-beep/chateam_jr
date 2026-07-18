import { useState, useEffect, useCallback } from 'react'
// [Migración] Se CONSERVAN como MUI Joy (no hay equivalente en el DS): indicadores de progreso.
import { LinearProgress, CircularProgress } from '@mui/joy'
import {
  Plus,
  DeviceMobile,
  ArrowClockwise,
  WifiHigh,
  WifiSlash,
  UserPlus,
  User,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// ─── Types ────────────────────────────────────────────────────────────────────

type DeviceStatus = 'online' | 'offline' | 'cooldown' | 'banned'

interface AgentDevice {
  id: number
  deviceId: string
  name: string
  model: string
  androidVersion: string
  ip: string
  proxyConfig?: string
  status: DeviceStatus
  dailyActionCount: number
  dailyActionLimit: number
  lastHeartbeat: string
  assignedIdentity?: {
    id: number
    name: string
    handle: string
    avatarUrl?: string
  }
  createdAt: string
}

interface AgentIdentityOption {
  id: number
  name: string
  handle: string
  avatarUrl?: string
}

type AndroidVersion = '12' | '13' | '14'
type DeviceModel =
  | 'Samsung Galaxy A14'
  | 'Xiaomi Redmi Note 12'
  | 'Motorola G54'
  | 'Samsung Galaxy A54'
  | 'Xiaomi Poco X5'
  | 'Motorola Edge 40'
  | 'OnePlus Nord N20'
  | 'Realme 11 Pro'

const DEVICE_MODELS: DeviceModel[] = [
  'Samsung Galaxy A14',
  'Xiaomi Redmi Note 12',
  'Motorola G54',
  'Samsung Galaxy A54',
  'Xiaomi Poco X5',
  'Motorola Edge 40',
  'OnePlus Nord N20',
  'Realme 11 Pro',
]

const ANDROID_VERSIONS: AndroidVersion[] = ['12', '13', '14']

// Badge del DS (variant) + color de la barra lateral de estado (token de superficie).
const STATUS_CONFIG: Record<
  DeviceStatus,
  { label: string; badge: BadgeProps['variant']; bar: string; progress: 'success' | 'warning' | 'danger' }
> = {
  online:   { label: 'Online',   badge: 'success',     bar: 'bg-success',              progress: 'success' },
  offline:  { label: 'Offline',  badge: 'neutral',     bar: 'bg-muted-foreground/40',  progress: 'success' },
  cooldown: { label: 'Cooldown', badge: 'warning',     bar: 'bg-warning',              progress: 'warning' },
  banned:   { label: 'Banned',   badge: 'destructive', bar: 'bg-destructive',          progress: 'danger'  },
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  return `hace ${Math.floor(hours / 24)}d`
}

// ─── Register Device Modal ─────────────────────────────────────────────────────

interface RegisterModalProps {
  open: boolean
  onClose: () => void
  onRegistered: (device: AgentDevice) => void
}

function RegisterModal({ open, onClose, onRegistered }: RegisterModalProps) {
  const [deviceId, setDeviceId]       = useState('')
  const [name, setName]               = useState('')
  const [model, setModel]             = useState<DeviceModel>('Samsung Galaxy A14')
  const [androidVersion, setAndroidVersion] = useState<AndroidVersion>('13')
  const [ip, setIp]                   = useState('')
  const [proxyConfig, setProxyConfig] = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!deviceId.trim() || !name.trim() || !ip.trim()) {
      setError('Device ID, nombre e IP son obligatorios.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.post('/ugc/devices/register', {
        deviceId: deviceId.trim(),
        name: name.trim(),
        model,
        androidVersion,
        ip: ip.trim(),
        proxyConfig: proxyConfig.trim() || undefined,
      })
      devLog('[AgentDeviceFarm] registered:', data)
      onRegistered(data.data ?? data)
      onClose()
      setDeviceId('')
      setName('')
      setIp('')
      setProxyConfig('')
    } catch (err: unknown) {
      devError('[AgentDeviceFarm] register error:', err)
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Error al registrar el dispositivo.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-55'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) onClose() }}>
      <DialogContent hideClose={loading}>
        <DialogHeader>
          <DialogTitle>Registrar Dispositivo</DialogTitle>
          <DialogDescription>
            Agrega un nuevo dispositivo Android al Device Farm.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/12 px-3 py-2.5 text-sm text-destructive-text">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="reg-device-id">Device ID</Label>
              <input
                id="reg-device-id"
                className={inputClass}
                placeholder="ej. device_001"
                value={deviceId}
                onChange={e => setDeviceId(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-name">Nombre</Label>
              <input
                id="reg-name"
                className={inputClass}
                placeholder="ej. Dispositivo Principal"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-model">Modelo</Label>
            <Select value={model} onValueChange={(v) => setModel(v as DeviceModel)} disabled={loading}>
              <SelectTrigger id="reg-model" className="h-11">
                <SelectValue placeholder="Seleccionar modelo..." />
              </SelectTrigger>
              <SelectContent>
                {DEVICE_MODELS.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-android">Version Android</Label>
            <Select value={androidVersion} onValueChange={(v) => setAndroidVersion(v as AndroidVersion)} disabled={loading}>
              <SelectTrigger id="reg-android" className="h-11">
                <SelectValue placeholder="Seleccionar versión..." />
              </SelectTrigger>
              <SelectContent>
                {ANDROID_VERSIONS.map(v => (
                  <SelectItem key={v} value={v}>Android {v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="reg-ip">IP</Label>
              <input
                id="reg-ip"
                className={inputClass}
                placeholder="192.168.1.100"
                value={ip}
                onChange={e => setIp(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-proxy">Proxy (opcional)</Label>
              <input
                id="reg-proxy"
                className={inputClass}
                placeholder="host:port"
                value={proxyConfig}
                onChange={e => setProxyConfig(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSubmit} loading={loading}>
            {!loading && <Plus className="size-4" weight="bold" aria-hidden />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Assign Identity Modal ─────────────────────────────────────────────────────

interface AssignModalProps {
  open: boolean
  device: AgentDevice | null
  identities: AgentIdentityOption[]
  onClose: () => void
  onAssigned: (deviceId: number, identity: AgentIdentityOption) => void
}

function AssignIdentityModal({ open, device, identities, onClose, onAssigned }: AssignModalProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const handleAssign = async () => {
    if (!device || !selectedId) {
      setError('Selecciona una identidad.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await api.post(`/ugc/devices/${device.id}/assign/${selectedId}`)
      const identity = identities.find(i => i.id === selectedId)
      if (identity) onAssigned(device.id, identity)
      onClose()
    } catch (err: unknown) {
      devError('[AgentDeviceFarm] assign error:', err)
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Error al asignar la identidad.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) onClose() }}>
      <DialogContent hideClose={loading} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Asignar Identidad</DialogTitle>
          <DialogDescription>
            Dispositivo: <strong className="text-foreground">{device?.name}</strong>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/12 px-3 py-2.5 text-sm text-destructive-text">
            {error}
          </div>
        )}

        {identities.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-6 text-center">
            <User className="size-10 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">No hay identidades disponibles.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="assign-identity">Identidad</Label>
            <Select
              value={selectedId != null ? String(selectedId) : undefined}
              onValueChange={(v) => setSelectedId(Number(v))}
              disabled={loading}
            >
              <SelectTrigger id="assign-identity" className="h-11">
                <SelectValue placeholder="Seleccionar identidad..." />
              </SelectTrigger>
              <SelectContent>
                {identities.map(identity => (
                  <SelectItem key={identity.id} value={String(identity.id)}>
                    <span className="flex items-center gap-2">
                      {identity.avatarUrl ? (
                        <img
                          src={identity.avatarUrl}
                          alt=""
                          width={24}
                          height={24}
                          className="size-6 rounded-full object-cover"
                        />
                      ) : (
                        <Avatar name={identity.name} size="sm" className="size-6 text-[10px]" />
                      )}
                      {identity.name} — @{identity.handle}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleAssign}
            loading={loading}
            disabled={!selectedId || identities.length === 0}
          >
            Asignar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Device Card ──────────────────────────────────────────────────────────────

interface DeviceCardProps {
  device: AgentDevice
  onAssign: (device: AgentDevice) => void
}

function DeviceCard({ device, onAssign }: DeviceCardProps) {
  const statusConfig = STATUS_CONFIG[device.status]
  const progressPct = device.dailyActionLimit > 0
    ? Math.min((device.dailyActionCount / device.dailyActionLimit) * 100, 100)
    : 0
  const progressColor = progressPct >= 90 ? 'danger' : progressPct >= 70 ? 'warning' : 'success'

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
      {/* Header + status */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className={`h-10 w-1 shrink-0 rounded-full ${statusConfig.bar}`} aria-hidden />
          <div>
            <p className="text-sm font-semibold text-foreground">{device.name}</p>
            <p className="text-xs text-muted-foreground">{device.model}</p>
          </div>
        </div>
        <Badge variant={statusConfig.badge}>{statusConfig.label}</Badge>
      </div>

      <hr className="border-border" />

      {/* Device info */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Android</p>
          <p className="text-sm font-medium text-foreground">{device.androidVersion}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">IP</p>
          <p className="text-sm font-medium text-foreground">{device.ip}</p>
        </div>
      </div>

      {/* Daily progress */}
      <div>
        <div className="mb-1 flex justify-between">
          <span className="text-xs text-muted-foreground">Acciones diarias</span>
          <span className="text-xs font-medium text-foreground tabular-nums">
            {device.dailyActionCount} / {device.dailyActionLimit}
          </span>
        </div>
        <LinearProgress determinate value={progressPct} color={progressColor} size="sm" />
      </div>

      {/* Last heartbeat */}
      <div className="flex items-center gap-1.5">
        {device.status === 'online'
          ? <WifiHigh className="size-3.5 text-success-text" aria-hidden />
          : <WifiSlash className="size-3.5 text-muted-foreground" aria-hidden />
        }
        <span className="text-xs text-muted-foreground">
          {device.status === 'online' ? 'Activo' : 'Ultimo heartbeat'}: {formatTimeAgo(device.lastHeartbeat)}
        </span>
      </div>

      <hr className="border-border" />

      {/* Assigned identity */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {device.assignedIdentity ? (
            <>
              {device.assignedIdentity.avatarUrl ? (
                <img
                  src={device.assignedIdentity.avatarUrl}
                  alt=""
                  width={28}
                  height={28}
                  className="size-7 rounded-full object-cover"
                />
              ) : (
                <Avatar name={device.assignedIdentity.name} size="sm" className="size-7" />
              )}
              <div>
                <p className="max-w-[120px] truncate text-xs font-medium text-foreground">
                  {device.assignedIdentity.name}
                </p>
                <p className="text-xs text-muted-foreground">@{device.assignedIdentity.handle}</p>
              </div>
            </>
          ) : (
            <>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden>
                <User className="size-4 text-muted-foreground" />
              </span>
              <span className="text-xs text-muted-foreground">Sin asignar</span>
            </>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => onAssign(device)}>
          <UserPlus className="size-4" aria-hidden />
          Asignar
        </Button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AgentDeviceFarm() {
  const [devices, setDevices]         = useState<AgentDevice[]>([])
  const [identities, setIdentities]   = useState<AgentIdentityOption[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  const [assignTarget, setAssignTarget] = useState<AgentDevice | null>(null)

  const onlineCount = devices.filter(d => d.status === 'online').length

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [devRes, idRes] = await Promise.all([
        api.get('/ugc/devices'),
        api.get('/ugc/identities?limit=100'),
      ])
      setDevices(devRes.data.data ?? devRes.data ?? [])
      setIdentities(idRes.data.data ?? idRes.data ?? [])
    } catch (err: unknown) {
      devError('[AgentDeviceFarm] fetch error:', err)
      setError('No se pudieron cargar los dispositivos. Verifica tu conexion.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleRegistered = (device: AgentDevice) => {
    setDevices(prev => [device, ...prev])
  }

  const handleAssigned = (deviceId: number, identity: AgentIdentityOption) => {
    setDevices(prev => prev.map(d =>
      d.id === deviceId ? { ...d, assignedIdentity: identity } : d
    ))
    setAssignTarget(null)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <DeviceMobile className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Device Farm</h1>
                {!loading && (
                  <Badge variant="success">{onlineCount} online</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Gestiona los dispositivos Android del UGC Pipeline
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={fetchData}
              disabled={loading}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={() => setShowRegister(true)}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Registrar Dispositivo
            </Button>
          </div>
        </div>

        {/* ── Error state ── */}
        {error && (
          <div className="rounded-lg bg-destructive/12 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-destructive-text">{error}</p>
              <Button variant="ghost" size="sm" className="text-destructive-text hover:bg-destructive/10" onClick={fetchData}>
                Reintentar
              </Button>
            </div>
          </div>
        )}

        {/* ── Loading state ── */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <CircularProgress size="lg" />
          </div>
        ) : devices.length === 0 ? (
          /* ── Empty state ── */
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <DeviceMobile className="size-16 text-muted-foreground" aria-hidden />
            <h2 className="text-xl font-semibold text-foreground">Sin dispositivos registrados</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Registra tu primer dispositivo Android para comenzar a escalar las interacciones del UGC Pipeline.
            </p>
            <Button size="lg" onClick={() => setShowRegister(true)}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Registrar Primer Dispositivo
            </Button>
          </div>
        ) : (
          /* ── Device grid ── */
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {devices.map(device => (
              <DeviceCard
                key={device.id}
                device={device}
                onAssign={d => setAssignTarget(d)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <RegisterModal
        open={showRegister}
        onClose={() => setShowRegister(false)}
        onRegistered={handleRegistered}
      />

      <AssignIdentityModal
        open={assignTarget !== null}
        device={assignTarget}
        identities={identities}
        onClose={() => setAssignTarget(null)}
        onAssigned={handleAssigned}
      />
    </div>
  )
}
