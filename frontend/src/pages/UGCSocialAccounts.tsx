import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Sheet,
  Card,
  Chip,
  Avatar,
  Button,
  CircularProgress,
  Modal,
  ModalDialog,
  ModalClose,
  Select,
  Option,
  FormControl,
  FormLabel,
  Input,
  Divider,
  IconButton,
} from '@mui/joy'
import {
  Add,
  Share,
  Refresh,
  SyncAlt,
  LinkOff,
  Instagram,
  Videocam,
  Facebook,
  Person,
} from '@mui/icons-material'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// ─── Types ────────────────────────────────────────────────────────────────────

type SocialPlatform = 'instagram' | 'tiktok' | 'facebook' | 'youtube'
type AccountStatus = 'active' | 'expired' | 'revoked'

interface SocialAccount {
  id: number
  platform: SocialPlatform
  username: string
  displayName: string
  avatarUrl?: string
  followers: number
  postsCount: number
  engagementRate: number
  status: AccountStatus
  lastSyncAt: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_CONFIG: Record<SocialPlatform, {
  label: string
  color: string
  bgColor: string
  icon: React.ReactNode
}> = {
  instagram: {
    label: 'Instagram',
    color: '#E1306C',
    bgColor: '#fce4ec',
    icon: <Instagram />,
  },
  tiktok: {
    label: 'TikTok',
    color: '#010101',
    bgColor: '#f5f5f5',
    icon: <Videocam />,
  },
  facebook: {
    label: 'Facebook',
    color: '#1877F2',
    bgColor: '#e3f2fd',
    icon: <Facebook />,
  },
  youtube: {
    label: 'YouTube',
    color: '#FF0000',
    bgColor: '#ffebee',
    icon: <Videocam />,
  },
}

const STATUS_CONFIG: Record<AccountStatus, { label: string; color: 'success' | 'warning' | 'danger' }> = {
  active:  { label: 'Activa',   color: 'success' },
  expired: { label: 'Expirada', color: 'warning' },
  revoked: { label: 'Revocada', color: 'danger'  },
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Connect Modal ─────────────────────────────────────────────────────────────

interface ConnectModalProps {
  open: boolean
  onClose: () => void
  onConnected: (account: SocialAccount) => void
}

function ConnectAccountModal({ open, onClose, onConnected }: ConnectModalProps) {
  const [platform, setPlatform]   = useState<SocialPlatform>('instagram')
  const [username, setUsername]   = useState('')
  const [accountId, setAccountId] = useState('')
  const [token, setToken]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const handleConnect = async () => {
    if (!username.trim() || !accountId.trim() || !token.trim()) {
      setError('Todos los campos son obligatorios.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.post('/ugc/social/connect', {
        platform,
        username: username.trim(),
        platformAccountId: accountId.trim(),
        accessToken: token.trim(),
      })
      onConnected(data.data ?? data)
      onClose()
      setUsername('')
      setAccountId('')
      setToken('')
    } catch (err: unknown) {
      devError('[UGCSocialAccounts] connect error:', err)
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Error al conectar la cuenta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={() => { if (!loading) onClose() }}>
      <ModalDialog sx={{ width: 480, maxWidth: '95vw' }}>
        {!loading && <ModalClose />}
        <Typography level="h4" sx={{ mb: 0.5 }}>Conectar Cuenta Social</Typography>
        <Typography level="body-sm" color="neutral" sx={{ mb: 2.5 }}>
          Vincula una cuenta de red social al UGC Pipeline.
        </Typography>

        {error && (
          <Sheet variant="soft" color="danger" sx={{ p: 1.5, borderRadius: 'sm', mb: 2 }}>
            <Typography level="body-sm" color="danger">{error}</Typography>
          </Sheet>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormControl>
            <FormLabel>Plataforma</FormLabel>
            <Select
              value={platform}
              onChange={(_, v) => v && setPlatform(v)}
              disabled={loading}
            >
              {(Object.entries(PLATFORM_CONFIG) as [SocialPlatform, typeof PLATFORM_CONFIG[SocialPlatform]][]).map(([key, cfg]) => (
                <Option key={key} value={key}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ color: cfg.color, display: 'flex' }}>{cfg.icon}</Box>
                    {cfg.label}
                  </Box>
                </Option>
              ))}
            </Select>
          </FormControl>

          <FormControl>
            <FormLabel>Username</FormLabel>
            <Input
              placeholder="@usuario"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={loading}
            />
          </FormControl>

          <FormControl>
            <FormLabel>Platform Account ID</FormLabel>
            <Input
              placeholder="ID de la cuenta en la plataforma"
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              disabled={loading}
            />
          </FormControl>

          <FormControl>
            <FormLabel>Access Token</FormLabel>
            <Input
              type="password"
              placeholder="Token de acceso"
              value={token}
              onChange={e => setToken(e.target.value)}
              disabled={loading}
            />
          </FormControl>

          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
            <Button variant="outlined" color="neutral" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button
              startDecorator={loading ? <CircularProgress size="sm" /> : <Add />}
              onClick={handleConnect}
              loading={loading}
            >
              Conectar
            </Button>
          </Box>
        </Box>
      </ModalDialog>
    </Modal>
  )
}

// ─── Account Card ─────────────────────────────────────────────────────────────

interface AccountCardProps {
  account: SocialAccount
  onSync: (id: number) => void
  onDisconnect: (id: number) => void
  syncingId: number | null
}

function AccountCard({ account, onSync, onDisconnect, syncingId }: AccountCardProps) {
  const platformCfg = PLATFORM_CONFIG[account.platform]
  const statusCfg   = STATUS_CONFIG[account.status]
  const isSyncing   = syncingId === account.id

  return (
    <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Platform header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1.5,
          mx: -1.5,
          mt: -1.5,
          borderRadius: 'sm sm 0 0',
          bgcolor: platformCfg.bgColor,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ color: platformCfg.color, display: 'flex' }}>
            {platformCfg.icon}
          </Box>
          <Typography level="title-sm" sx={{ color: platformCfg.color, fontWeight: 700 }}>
            {platformCfg.label}
          </Typography>
        </Box>
        <Chip size="sm" variant="soft" color={statusCfg.color}>
          {statusCfg.label}
        </Chip>
      </Box>

      {/* Account info */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar src={account.avatarUrl} sx={{ width: 48, height: 48, flexShrink: 0 }}>
          {account.displayName.charAt(0)}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography level="title-sm" noWrap>{account.displayName}</Typography>
          <Typography level="body-xs" color="neutral" noWrap>@{account.username}</Typography>
        </Box>
      </Box>

      {/* Metrics */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
        {[
          { label: 'Seguidores',  value: formatNumber(account.followers) },
          { label: 'Posts',       value: formatNumber(account.postsCount) },
          { label: 'Engagement',  value: `${account.engagementRate.toFixed(1)}%` },
        ].map(metric => (
          <Box key={metric.label} sx={{ textAlign: 'center', p: 1, bgcolor: 'background.level1', borderRadius: 'sm' }}>
            <Typography level="body-sm" fontWeight="lg">{metric.value}</Typography>
            <Typography level="body-xs" color="neutral" sx={{ fontSize: 10 }}>{metric.label}</Typography>
          </Box>
        ))}
      </Box>

      {/* Last sync */}
      <Typography level="body-xs" color="neutral">
        Ultima sinc: {formatDate(account.lastSyncAt)}
      </Typography>

      <Divider />

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          size="sm"
          variant="outlined"
          color="neutral"
          startDecorator={isSyncing ? <CircularProgress size="sm" /> : <SyncAlt sx={{ fontSize: 16 }} />}
          onClick={() => onSync(account.id)}
          loading={isSyncing}
          sx={{ flex: 1 }}
        >
          Sincronizar
        </Button>
        <IconButton
          size="sm"
          variant="outlined"
          color="danger"
          onClick={() => onDisconnect(account.id)}
        >
          <LinkOff sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
    </Card>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UGCSocialAccounts() {
  const [accounts, setAccounts]       = useState<SocialAccount[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [showConnect, setShowConnect] = useState(false)
  const [syncingId, setSyncingId]     = useState<number | null>(null)

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/ugc/social/accounts')
      setAccounts(data.data ?? data ?? [])
    } catch (err: unknown) {
      devError('[UGCSocialAccounts] fetch error:', err)
      setError('No se pudieron cargar las cuentas sociales.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  const handleSync = async (id: number) => {
    setSyncingId(id)
    try {
      const { data } = await api.post(`/ugc/social/${id}/sync`)
      const updated: SocialAccount = data.data ?? data
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, ...updated, lastSyncAt: new Date().toISOString() } : a))
    } catch (err: unknown) {
      devError('[UGCSocialAccounts] sync error:', err)
    } finally {
      setSyncingId(null)
    }
  }

  const handleDisconnect = async (id: number) => {
    if (!window.confirm('¿Desconectar esta cuenta? Perderás el acceso a sus datos.')) return
    try {
      await api.delete(`/ugc/social/${id}`)
      setAccounts(prev => prev.filter(a => a.id !== id))
    } catch (err: unknown) {
      devError('[UGCSocialAccounts] disconnect error:', err)
    }
  }

  const handleConnected = (account: SocialAccount) => {
    setAccounts(prev => [account, ...prev])
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Share sx={{ fontSize: 28, color: 'primary.500' }} />
          <Box>
            <Typography level="h3">Cuentas Sociales</Typography>
            <Typography level="body-sm" color="neutral">
              Gestiona las cuentas de redes sociales conectadas al Pipeline
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton variant="outlined" color="neutral" size="sm" onClick={fetchAccounts} disabled={loading}>
            <Refresh />
          </IconButton>
          <Button startDecorator={<Add />} onClick={() => setShowConnect(true)}>
            Conectar Cuenta
          </Button>
        </Box>
      </Box>

      {/* ── Error state ── */}
      {error && (
        <Sheet variant="soft" color="danger" sx={{ p: 2, borderRadius: 'md', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography level="body-sm" color="danger">{error}</Typography>
            <Button size="sm" variant="plain" color="danger" onClick={fetchAccounts}>Reintentar</Button>
          </Box>
        </Sheet>
      )}

      {/* ── Loading state ── */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size="lg" />
        </Box>
      ) : accounts.length === 0 ? (
        /* ── Empty state ── */
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
          <Person sx={{ fontSize: 64, color: 'text.tertiary' }} />
          <Typography level="h3" textAlign="center">Sin cuentas conectadas</Typography>
          <Typography level="body-md" color="neutral" textAlign="center" sx={{ maxWidth: 400 }}>
            Conecta tus cuentas de redes sociales para monitorear publicaciones y comentarios desde el Pipeline.
          </Typography>
          <Button size="lg" startDecorator={<Add />} onClick={() => setShowConnect(true)}>
            Conectar Primera Cuenta
          </Button>
        </Box>
      ) : (
        /* ── Accounts grid ── */
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
              lg: 'repeat(4, 1fr)',
            },
            gap: 2,
          }}
        >
          {accounts.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              onSync={handleSync}
              onDisconnect={handleDisconnect}
              syncingId={syncingId}
            />
          ))}
        </Box>
      )}

      {/* ── Connect Modal ── */}
      <ConnectAccountModal
        open={showConnect}
        onClose={() => setShowConnect(false)}
        onConnected={handleConnected}
      />
    </Box>
  )
}
