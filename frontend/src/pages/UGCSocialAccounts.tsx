import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  ShareNetwork,
  ArrowClockwise,
  ArrowsClockwise,
  LinkBreak,
  InstagramLogo,
  TiktokLogo,
  FacebookLogo,
  YoutubeLogo,
  User,
} from '@phosphor-icons/react'
// [Migración Ola G] CircularProgress se conserva como MUI Joy: sin equivalente en el DS.
import { CircularProgress } from '@mui/joy'
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
import { cn } from '@/lib/utils'
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

// Colores de marca de cada plataforma (identidad, no tokens de superficie): se
// mantienen como valores arbitrarios estáticos igual que en Connections.tsx.
const PLATFORM_CONFIG: Record<SocialPlatform, {
  label: string
  iconClass: string
  headerClass: string
  icon: React.ReactNode
}> = {
  instagram: {
    label: 'Instagram',
    iconClass: 'text-[#E1306C]',
    headerClass: 'bg-[#E1306C]/10',
    icon: <InstagramLogo className="size-5" weight="fill" aria-hidden />,
  },
  tiktok: {
    label: 'TikTok',
    iconClass: 'text-foreground',
    headerClass: 'bg-muted',
    icon: <TiktokLogo className="size-5" weight="fill" aria-hidden />,
  },
  facebook: {
    label: 'Facebook',
    iconClass: 'text-[#1877F2]',
    headerClass: 'bg-[#1877F2]/10',
    icon: <FacebookLogo className="size-5" weight="fill" aria-hidden />,
  },
  youtube: {
    label: 'YouTube',
    iconClass: 'text-[#FF0000]',
    headerClass: 'bg-[#FF0000]/10',
    icon: <YoutubeLogo className="size-5" weight="fill" aria-hidden />,
  },
}

const STATUS_CONFIG: Record<AccountStatus, { label: string; variant: BadgeProps['variant'] }> = {
  active:  { label: 'Activa',   variant: 'success' },
  expired: { label: 'Expirada', variant: 'warning' },
  revoked: { label: 'Revocada', variant: 'destructive' },
}

const inputClass =
  'h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

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
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) onClose() }}>
      <DialogContent className="max-w-md" hideClose={loading}>
        <DialogHeader>
          <DialogTitle>Conectar Cuenta Social</DialogTitle>
          <DialogDescription>
            Vincula una cuenta de red social al UGC Pipeline.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/12 px-3 py-2 text-sm text-destructive-text">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="ugc-platform">Plataforma</Label>
            <Select
              value={platform}
              onValueChange={(v) => setPlatform(v as SocialPlatform)}
              disabled={loading}
            >
              <SelectTrigger id="ugc-platform" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(PLATFORM_CONFIG) as [SocialPlatform, typeof PLATFORM_CONFIG[SocialPlatform]][]).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <span className={cn('flex', cfg.iconClass)}>{cfg.icon}</span>
                      {cfg.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ugc-username">Username</Label>
            <input
              id="ugc-username"
              className={inputClass}
              placeholder="@usuario"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ugc-account-id">Platform Account ID</Label>
            <input
              id="ugc-account-id"
              className={inputClass}
              placeholder="ID de la cuenta en la plataforma"
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ugc-token">Access Token</Label>
            <input
              id="ugc-token"
              type="password"
              className={inputClass}
              placeholder="Token de acceso"
              value={token}
              onChange={e => setToken(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button size="sm" loading={loading} onClick={handleConnect}>
            {!loading && <Plus className="size-4" weight="bold" aria-hidden />}
            Conectar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  const metrics = [
    { label: 'Seguidores', value: formatNumber(account.followers) },
    { label: 'Posts',      value: formatNumber(account.postsCount) },
    { label: 'Engagement', value: `${account.engagementRate.toFixed(1)}%` },
  ]

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm shadow-black/[0.02]">
      {/* Platform header */}
      <div className={cn('flex items-center justify-between px-4 py-3', platformCfg.headerClass)}>
        <div className="flex items-center gap-2">
          <span className={cn('flex', platformCfg.iconClass)}>{platformCfg.icon}</span>
          <span className={cn('text-sm font-bold', platformCfg.iconClass)}>
            {platformCfg.label}
          </span>
        </div>
        <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {/* Account info */}
        <div className="flex items-center gap-3">
          {account.avatarUrl ? (
            <img
              src={account.avatarUrl}
              alt={account.displayName}
              width={48}
              height={48}
              className="size-12 shrink-0 rounded-full object-cover"
            />
          ) : (
            <Avatar name={account.displayName} size="lg" className="size-12" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{account.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">@{account.username}</p>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2">
          {metrics.map(metric => (
            <div key={metric.label} className="rounded-md bg-muted p-2 text-center">
              <p className="text-sm font-bold text-foreground">{metric.value}</p>
              <p className="text-[10px] text-muted-foreground">{metric.label}</p>
            </div>
          ))}
        </div>

        {/* Last sync */}
        <p className="text-xs text-muted-foreground">
          Última sinc: {formatDate(account.lastSyncAt)}
        </p>

        <div className="border-t border-border" />

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            loading={isSyncing}
            onClick={() => onSync(account.id)}
          >
            {!isSyncing && <ArrowsClockwise className="size-4" aria-hidden />}
            Sincronizar
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Desconectar cuenta"
            className="size-9 border-destructive/40 text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
            onClick={() => onDisconnect(account.id)}
          >
            <LinkBreak className="size-[18px]" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ShareNetwork className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Cuentas Sociales
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestiona las cuentas de redes sociales conectadas al Pipeline
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={fetchAccounts}
              disabled={loading}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={() => setShowConnect(true)}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Conectar Cuenta
            </Button>
          </div>
        </div>

        {/* ── Error state ── */}
        {error && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-destructive/12 px-4 py-3">
            <p className="text-sm text-destructive-text">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
              onClick={fetchAccounts}
            >
              Reintentar
            </Button>
          </div>
        )}

        {/* ── Loading / Empty / Grid ── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <CircularProgress size="lg" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <User className="size-9" aria-hidden />
            </span>
            <h2 className="text-xl font-semibold text-foreground">Sin cuentas conectadas</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Conecta tus cuentas de redes sociales para monitorear publicaciones y comentarios desde el Pipeline.
            </p>
            <Button size="lg" onClick={() => setShowConnect(true)}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Conectar Primera Cuenta
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {accounts.map(account => (
              <AccountCard
                key={account.id}
                account={account}
                onSync={handleSync}
                onDisconnect={handleDisconnect}
                syncingId={syncingId}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Connect Modal ── */}
      <ConnectAccountModal
        open={showConnect}
        onClose={() => setShowConnect(false)}
        onConnected={handleConnected}
      />
    </div>
  )
}
