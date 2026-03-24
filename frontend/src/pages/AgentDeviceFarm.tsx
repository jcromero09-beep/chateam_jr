import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Sheet,
  Card,
  Chip,
  Avatar,
  Button,
  LinearProgress,
  IconButton,
  Modal,
  ModalDialog,
  ModalClose,
  Select,
  Option,
  FormControl,
  FormLabel,
  Input,
  CircularProgress,
  Divider,
} from '@mui/joy'
import {
  Add,
  PhoneAndroid,
  Refresh,
  WifiTethering,
  WifiOff,
  AccessTime,
  PersonAdd,
  Person,
} from '@mui/icons-material'
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

const STATUS_CONFIG: Record<DeviceStatus, { label: string; color: 'success' | 'neutral' | 'warning' | 'danger' }> = {
  online:   { label: 'Online',   color: 'success'  },
  offline:  { label: 'Offline',  color: 'neutral'  },
  cooldown: { label: 'Cooldown', color: 'warning'  },
  banned:   { label: 'Banned',   color: 'danger'   },
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

  return (
    <Modal open={open} onClose={() => { if (!loading) onClose() }}>
      <ModalDialog sx={{ width: 500, maxWidth: '95vw' }}>
        {!loading && <ModalClose />}
        <Typography level="h4" sx={{ mb: 0.5 }}>Registrar Dispositivo</Typography>
        <Typography level="body-sm" color="neutral" sx={{ mb: 2.5 }}>
          Agrega un nuevo dispositivo Android al Device Farm.
        </Typography>

        {error && (
          <Sheet variant="soft" color="danger" sx={{ p: 1.5, borderRadius: 'sm', mb: 2 }}>
            <Typography level="body-sm" color="danger">{error}</Typography>
          </Sheet>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <FormControl>
              <FormLabel>Device ID</FormLabel>
              <Input
                placeholder="ej. device_001"
                value={deviceId}
                onChange={e => setDeviceId(e.target.value)}
                disabled={loading}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Nombre</FormLabel>
              <Input
                placeholder="ej. Dispositivo Principal"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={loading}
              />
            </FormControl>
          </Box>

          <FormControl>
            <FormLabel>Modelo</FormLabel>
            <Select
              value={model}
              onChange={(_, v) => v && setModel(v)}
              disabled={loading}
            >
              {DEVICE_MODELS.map(m => (
                <Option key={m} value={m}>{m}</Option>
              ))}
            </Select>
          </FormControl>

          <FormControl>
            <FormLabel>Version Android</FormLabel>
            <Select
              value={androidVersion}
              onChange={(_, v) => v && setAndroidVersion(v)}
              disabled={loading}
            >
              {ANDROID_VERSIONS.map(v => (
                <Option key={v} value={v}>Android {v}</Option>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <FormControl>
              <FormLabel>IP</FormLabel>
              <Input
                placeholder="192.168.1.100"
                value={ip}
                onChange={e => setIp(e.target.value)}
                disabled={loading}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Proxy (opcional)</FormLabel>
              <Input
                placeholder="host:port"
                value={proxyConfig}
                onChange={e => setProxyConfig(e.target.value)}
                disabled={loading}
              />
            </FormControl>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
            <Button variant="outlined" color="neutral" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button
              startDecorator={loading ? <CircularProgress size="sm" /> : <Add />}
              onClick={handleSubmit}
              loading={loading}
            >
              Registrar
            </Button>
          </Box>
        </Box>
      </ModalDialog>
    </Modal>
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
    <Modal open={open} onClose={() => { if (!loading) onClose() }}>
      <ModalDialog sx={{ width: 420, maxWidth: '95vw' }}>
        {!loading && <ModalClose />}
        <Typography level="h4" sx={{ mb: 0.5 }}>Asignar Identidad</Typography>
        <Typography level="body-sm" color="neutral" sx={{ mb: 2 }}>
          Dispositivo: <strong>{device?.name}</strong>
        </Typography>

        {error && (
          <Sheet variant="soft" color="danger" sx={{ p: 1.5, borderRadius: 'sm', mb: 2 }}>
            <Typography level="body-sm" color="danger">{error}</Typography>
          </Sheet>
        )}

        {identities.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Person sx={{ fontSize: 40, color: 'text.tertiary', mb: 1 }} />
            <Typography level="body-sm" color="neutral">No hay identidades disponibles.</Typography>
          </Box>
        ) : (
          <FormControl sx={{ mb: 2.5 }}>
            <FormLabel>Identidad</FormLabel>
            <Select
              placeholder="Seleccionar identidad..."
              value={selectedId}
              onChange={(_, v) => setSelectedId(v)}
              disabled={loading}
            >
              {identities.map(identity => (
                <Option key={identity.id} value={identity.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar src={identity.avatarUrl} sx={{ width: 24, height: 24, fontSize: 10 }}>
                      {identity.name.charAt(0)}
                    </Avatar>
                    {identity.name} — @{identity.handle}
                  </Box>
                </Option>
              ))}
            </Select>
          </FormControl>
        )}

        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button variant="outlined" color="neutral" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleAssign}
            loading={loading}
            disabled={!selectedId || identities.length === 0}
          >
            Asignar
          </Button>
        </Box>
      </ModalDialog>
    </Modal>
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
    <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Status bar left border */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 4,
              height: 40,
              borderRadius: 2,
              bgcolor: `${statusConfig.color}.500`,
              flexShrink: 0,
            }}
          />
          <Box>
            <Typography level="title-sm">{device.name}</Typography>
            <Typography level="body-xs" color="neutral">{device.model}</Typography>
          </Box>
        </Box>
        <Chip size="sm" variant="soft" color={statusConfig.color}>
          {statusConfig.label}
        </Chip>
      </Box>

      <Divider />

      {/* Device info */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        <Box>
          <Typography level="body-xs" color="neutral">Android</Typography>
          <Typography level="body-sm" fontWeight="md">{device.androidVersion}</Typography>
        </Box>
        <Box>
          <Typography level="body-xs" color="neutral">IP</Typography>
          <Typography level="body-sm" fontWeight="md">{device.ip}</Typography>
        </Box>
      </Box>

      {/* Daily progress */}
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography level="body-xs" color="neutral">Acciones diarias</Typography>
          <Typography level="body-xs" fontWeight="md">
            {device.dailyActionCount} / {device.dailyActionLimit}
          </Typography>
        </Box>
        <LinearProgress
          determinate
          value={progressPct}
          color={progressColor}
          size="sm"
        />
      </Box>

      {/* Last heartbeat */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {device.status === 'online'
          ? <WifiTethering sx={{ fontSize: 14, color: 'success.500' }} />
          : <WifiOff sx={{ fontSize: 14, color: 'neutral.400' }} />
        }
        <Typography level="body-xs" color="neutral">
          {device.status === 'online' ? 'Activo' : 'Ultimo heartbeat'}: {formatTimeAgo(device.lastHeartbeat)}
        </Typography>
      </Box>

      <Divider />

      {/* Assigned identity */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {device.assignedIdentity ? (
            <>
              <Avatar
                src={device.assignedIdentity.avatarUrl}
                sx={{ width: 28, height: 28, fontSize: 11 }}
              >
                {device.assignedIdentity.name.charAt(0)}
              </Avatar>
              <Box>
                <Typography level="body-xs" fontWeight="md" noWrap sx={{ maxWidth: 120 }}>
                  {device.assignedIdentity.name}
                </Typography>
                <Typography level="body-xs" color="neutral">@{device.assignedIdentity.handle}</Typography>
              </Box>
            </>
          ) : (
            <>
              <Avatar sx={{ width: 28, height: 28, bgcolor: 'neutral.100' }}>
                <Person sx={{ fontSize: 16, color: 'neutral.400' }} />
              </Avatar>
              <Typography level="body-xs" color="neutral">Sin asignar</Typography>
            </>
          )}
        </Box>
        <Button
          size="sm"
          variant="outlined"
          color="neutral"
          startDecorator={<PersonAdd sx={{ fontSize: 16 }} />}
          onClick={() => onAssign(device)}
        >
          Asignar
        </Button>
      </Box>
    </Card>
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
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <PhoneAndroid sx={{ fontSize: 28, color: 'primary.500' }} />
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography level="h3">Device Farm</Typography>
              {!loading && (
                <Chip size="sm" variant="soft" color="success">
                  {onlineCount} online
                </Chip>
              )}
            </Box>
            <Typography level="body-sm" color="neutral">
              Gestiona los dispositivos Android del UGC Pipeline
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton variant="outlined" color="neutral" size="sm" onClick={fetchData} disabled={loading}>
            <Refresh />
          </IconButton>
          <Button
            startDecorator={<Add />}
            onClick={() => setShowRegister(true)}
          >
            Registrar Dispositivo
          </Button>
        </Box>
      </Box>

      {/* ── Error state ── */}
      {error && (
        <Sheet variant="soft" color="danger" sx={{ p: 2, borderRadius: 'md', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography level="body-sm" color="danger">{error}</Typography>
            <Button size="sm" variant="plain" color="danger" onClick={fetchData}>
              Reintentar
            </Button>
          </Box>
        </Sheet>
      )}

      {/* ── Loading state ── */}
      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8 }}>
          <CircularProgress size="lg" />
        </Box>
      ) : devices.length === 0 ? (
        /* ── Empty state ── */
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10, gap: 2 }}>
          <PhoneAndroid sx={{ fontSize: 64, color: 'text.tertiary' }} />
          <Typography level="h3" textAlign="center">Sin dispositivos registrados</Typography>
          <Typography level="body-md" color="neutral" textAlign="center" sx={{ maxWidth: 400 }}>
            Registra tu primer dispositivo Android para comenzar a escalar las interacciones del UGC Pipeline.
          </Typography>
          <Button size="lg" startDecorator={<Add />} onClick={() => setShowRegister(true)}>
            Registrar Primer Dispositivo
          </Button>
        </Box>
      ) : (
        /* ── Device grid ── */
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              lg: 'repeat(3, 1fr)',
              xl: 'repeat(4, 1fr)',
            },
            gap: 2,
          }}
        >
          {devices.map(device => (
            <DeviceCard
              key={device.id}
              device={device}
              onAssign={d => setAssignTarget(d)}
            />
          ))}
        </Box>
      )}

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

      {/* Spacer for last heartbeat icon */}
      <Box sx={{ display: 'none' }}>
        <AccessTime />
      </Box>
    </Box>
  )
}
