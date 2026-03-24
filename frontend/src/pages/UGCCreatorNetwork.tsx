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
  Divider,
  IconButton,
  Select,
  Option,
  Input,
  Modal,
  ModalDialog,
  ModalClose,
  Textarea,
  Stack,
  Badge,
} from '@mui/joy'
import {
  Groups as GroupsIcon,
  Add as AddIcon,
  Refresh,
  Star as StarIcon,
  AttachMoney as MoneyIcon,
  Campaign as CampaignIcon,
  Edit as EditIcon,
  Instagram,
  Videocam,
  YouTube as YouTubeIcon,
  Facebook,
  Search as SearchIcon,
  Person as PersonIcon,
  CheckCircle,
  HourglassEmpty,
  Block as BlockIcon,
  Verified,
  Payments as PaymentsIcon,
} from '@mui/icons-material'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devError = (...args: unknown[]) => { if (isDev) console.error(...args) }

// ─── Types ────────────────────────────────────────────────────────────────────

type CreatorStatus = 'pending' | 'verified' | 'active' | 'suspended'
type CreatorNiche = 'belleza' | 'fitness' | 'tech' | 'lifestyle' | 'food' | 'travel'
type Platform = 'instagram' | 'tiktok' | 'youtube' | 'facebook'
type PaymentMethod = 'stripe' | 'paypal' | 'bank_transfer'

interface Creator {
  id: number
  name: string
  email: string
  phone?: string
  niche: CreatorNiche
  platforms: Platform[]
  followers: number
  engagementRate: number
  completedCampaigns: number
  rating: number
  baseRate: number
  status: CreatorStatus
  paymentMethod: PaymentMethod
  paypalEmail?: string
  stripeAccountId?: string
  createdAt: string
}

interface Campaign {
  id: number
  name: string
}

interface Assignment {
  id: number
  campaignName: string
  status: string
  agreedRate: number
  deadline: string
}

interface CreatorStats {
  totalActive: number
  assignedCampaigns: number
  paymentsThisMonth: number
  avgRating: number
}

interface NewCreatorForm {
  name: string
  email: string
  phone: string
  niche: CreatorNiche | ''
  platforms: Platform[]
  baseRate: string
  paymentMethod: PaymentMethod | ''
  paypalEmail: string
}

interface AssignForm {
  campaignId: string
  brief: string
  deadline: string
  agreedRate: string
}

interface PayForm {
  amount: string
  description: string
  assignmentId: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NICHE_CONFIG: Record<CreatorNiche, { label: string; color: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  belleza:   { label: 'Belleza',   color: 'danger' },
  fitness:   { label: 'Fitness',   color: 'success' },
  tech:      { label: 'Tech',      color: 'primary' },
  lifestyle: { label: 'Lifestyle', color: 'warning' },
  food:      { label: 'Food',      color: 'warning' },
  travel:    { label: 'Travel',    color: 'neutral' },
}

const PLATFORM_CONFIG: Record<Platform, { label: string; color: string; icon: React.ReactNode }> = {
  instagram: { label: 'Instagram', color: '#E1306C', icon: <Instagram sx={{ fontSize: 13 }} /> },
  tiktok:    { label: 'TikTok',    color: '#010101', icon: <Videocam sx={{ fontSize: 13 }} /> },
  youtube:   { label: 'YouTube',   color: '#FF0000', icon: <YouTubeIcon sx={{ fontSize: 13 }} /> },
  facebook:  { label: 'Facebook',  color: '#1877F2', icon: <Facebook sx={{ fontSize: 13 }} /> },
}

const STATUS_CONFIG: Record<CreatorStatus, {
  label: string
  color: 'warning' | 'primary' | 'success' | 'danger'
  icon: React.ReactNode
}> = {
  pending:   { label: 'Pendiente',  color: 'warning', icon: <HourglassEmpty sx={{ fontSize: 13 }} /> },
  verified:  { label: 'Verificado', color: 'primary', icon: <Verified sx={{ fontSize: 13 }} /> },
  active:    { label: 'Activo',     color: 'success', icon: <CheckCircle sx={{ fontSize: 13 }} /> },
  suspended: { label: 'Suspendido', color: 'danger',  icon: <BlockIcon sx={{ fontSize: 13 }} /> },
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function renderStars(rating: number): React.ReactNode {
  const full = Math.floor(rating)
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <StarIcon
          key={i}
          sx={{ fontSize: 14, color: i < full ? 'warning.400' : 'neutral.300' }}
        />
      ))}
      <Typography level="body-xs" sx={{ ml: 0.5 }}>{rating.toFixed(1)}</Typography>
    </Box>
  )
}

const EMPTY_NEW_CREATOR: NewCreatorForm = {
  name: '',
  email: '',
  phone: '',
  niche: '',
  platforms: [],
  baseRate: '',
  paymentMethod: '',
  paypalEmail: '',
}

const EMPTY_ASSIGN_FORM: AssignForm = {
  campaignId: '',
  brief: '',
  deadline: '',
  agreedRate: '',
}

const EMPTY_PAY_FORM: PayForm = {
  amount: '',
  description: '',
  assignmentId: '',
}

// ─── Stats Strip ──────────────────────────────────────────────────────────────

function StatsStrip({ stats, loading }: { stats: CreatorStats | null; loading: boolean }) {
  const items = [
    { label: 'Creadores Activos',    value: stats ? String(stats.totalActive) : '—',            color: 'primary'  as const },
    { label: 'Campanas Asignadas',   value: stats ? String(stats.assignedCampaigns) : '—',      color: 'success'  as const },
    { label: 'Pagos Este Mes',       value: stats ? `$${stats.paymentsThisMonth.toFixed(0)}` : '—', color: 'warning' as const },
    { label: 'Rating Promedio',      value: stats ? `${stats.avgRating.toFixed(1)} ★` : '—',   color: 'neutral'  as const },
  ]
  return (
    <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
      {items.map(item => (
        <Card key={item.label} variant="soft" color={item.color} sx={{ flex: 1, minWidth: 150, py: 1.5, px: 2 }}>
          {loading ? (
            <CircularProgress size="sm" />
          ) : (
            <Typography level="h3" fontWeight={700}>{item.value}</Typography>
          )}
          <Typography level="body-xs" sx={{ opacity: 0.8 }}>{item.label}</Typography>
        </Card>
      ))}
    </Box>
  )
}

// ─── Creator Card ─────────────────────────────────────────────────────────────

interface CreatorCardProps {
  creator: Creator
  onAssign: (creator: Creator) => void
  onPay: (creator: Creator) => void
  onEdit: (creator: Creator) => void
}

function CreatorCard({ creator, onAssign, onPay, onEdit }: CreatorCardProps) {
  const nicheConfig  = NICHE_CONFIG[creator.niche]
  const statusConfig = STATUS_CONFIG[creator.status]

  return (
    <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Header: avatar + nombre + status */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Badge
          badgeContent={<Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: statusConfig.color + '.400' }} />}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          sx={{ '--Badge-paddingX': '0px', '--Badge-minH': '10px' }}
        >
          <Avatar sx={{ width: 48, height: 48, fontSize: 20 }}>
            {creator.name.charAt(0).toUpperCase()}
          </Avatar>
        </Badge>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography level="title-sm" fontWeight="lg" noWrap>{creator.name}</Typography>
          <Typography level="body-xs" color="neutral" noWrap>{creator.email}</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
            <Chip size="sm" variant="soft" color={nicheConfig.color}>{nicheConfig.label}</Chip>
            <Chip
              size="sm"
              variant="soft"
              color={statusConfig.color}
              startDecorator={statusConfig.icon}
            >
              {statusConfig.label}
            </Chip>
          </Box>
        </Box>
      </Box>

      {/* Plataformas */}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {creator.platforms.map(p => {
          const cfg = PLATFORM_CONFIG[p]
          return (
            <Chip
              key={p}
              size="sm"
              variant="outlined"
              startDecorator={cfg.icon}
              sx={{ color: cfg.color, borderColor: cfg.color, fontSize: 10 }}
            >
              {cfg.label}
            </Chip>
          )
        })}
      </Box>

      <Divider />

      {/* Stats 2x2 */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        <Box>
          <Typography level="body-xs" color="neutral">Seguidores</Typography>
          <Typography level="body-sm" fontWeight="lg">{formatNumber(creator.followers)}</Typography>
        </Box>
        <Box>
          <Typography level="body-xs" color="neutral">Engagement</Typography>
          <Typography level="body-sm" fontWeight="lg">{creator.engagementRate.toFixed(1)}%</Typography>
        </Box>
        <Box>
          <Typography level="body-xs" color="neutral">Campanas Completadas</Typography>
          <Typography level="body-sm" fontWeight="lg">{creator.completedCampaigns}</Typography>
        </Box>
        <Box>
          <Typography level="body-xs" color="neutral">Rating</Typography>
          {renderStars(creator.rating)}
        </Box>
      </Box>

      {/* Tarifa */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <MoneyIcon sx={{ fontSize: 16, color: 'success.500' }} />
        <Typography level="body-sm">
          <Typography component="span" fontWeight="lg">${creator.baseRate}</Typography>
          <Typography component="span" color="neutral"> / video</Typography>
        </Typography>
      </Box>

      <Divider />

      {/* Acciones */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button
          size="sm"
          variant="soft"
          color="primary"
          startDecorator={<CampaignIcon sx={{ fontSize: 14 }} />}
          onClick={() => onAssign(creator)}
          sx={{ flex: 1 }}
        >
          Asignar Campana
        </Button>
        <Button
          size="sm"
          variant="soft"
          color="success"
          startDecorator={<PaymentsIcon sx={{ fontSize: 14 }} />}
          onClick={() => onPay(creator)}
        >
          Ver Pagos
        </Button>
        <IconButton size="sm" variant="plain" color="neutral" onClick={() => onEdit(creator)}>
          <EditIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    </Card>
  )
}

// ─── Modal Agregar Creador ────────────────────────────────────────────────────

interface AddCreatorModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

function AddCreatorModal({ open, onClose, onSuccess }: AddCreatorModalProps) {
  const [form, setForm]       = useState<NewCreatorForm>(EMPTY_NEW_CREATOR)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const togglePlatform = (p: Platform) => {
    setForm(prev => ({
      ...prev,
      platforms: prev.platforms.includes(p)
        ? prev.platforms.filter(x => x !== p)
        : [...prev.platforms, p],
    }))
  }

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.niche || !form.baseRate || !form.paymentMethod) {
      setError('Completa los campos obligatorios.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.post('/ugc/creators', {
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        niche: form.niche,
        platforms: form.platforms,
        baseRate: Number(form.baseRate),
        paymentMethod: form.paymentMethod,
        paypalEmail: form.paymentMethod === 'paypal' ? form.paypalEmail : undefined,
      })
      setForm(EMPTY_NEW_CREATOR)
      onSuccess()
      onClose()
    } catch (err: unknown) {
      devError('[AddCreatorModal] error:', err)
      setError('No se pudo crear el creador. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ maxWidth: 500, width: '100%', overflow: 'auto', maxHeight: '90vh' }}>
        <ModalClose />
        <Typography level="title-lg">Agregar Creador</Typography>
        <Divider />

        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {error && (
            <Sheet variant="soft" color="danger" sx={{ p: 1.5, borderRadius: 'sm' }}>
              <Typography level="body-sm" color="danger">{error}</Typography>
            </Sheet>
          )}

          <Input
            placeholder="Nombre *"
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            startDecorator={<PersonIcon sx={{ fontSize: 16 }} />}
          />
          <Input
            placeholder="Email *"
            type="email"
            value={form.email}
            onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
          />
          <Input
            placeholder="Telefono (opcional)"
            value={form.phone}
            onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
          />

          <Select
            placeholder="Nicho *"
            value={form.niche || null}
            onChange={(_, v) => v && setForm(prev => ({ ...prev, niche: v as CreatorNiche }))}
          >
            {(Object.entries(NICHE_CONFIG) as [CreatorNiche, typeof NICHE_CONFIG[CreatorNiche]][]).map(([key, cfg]) => (
              <Option key={key} value={key}>{cfg.label}</Option>
            ))}
          </Select>

          <Box>
            <Typography level="body-xs" color="neutral" sx={{ mb: 0.75 }}>Plataformas</Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {(Object.entries(PLATFORM_CONFIG) as [Platform, typeof PLATFORM_CONFIG[Platform]][]).map(([key, cfg]) => (
                <Chip
                  key={key}
                  size="sm"
                  variant={form.platforms.includes(key) ? 'solid' : 'outlined'}
                  color={form.platforms.includes(key) ? 'primary' : 'neutral'}
                  startDecorator={cfg.icon}
                  onClick={() => togglePlatform(key)}
                  sx={{ cursor: 'pointer' }}
                >
                  {cfg.label}
                </Chip>
              ))}
            </Box>
          </Box>

          <Input
            placeholder="Tarifa base por video ($) *"
            type="number"
            value={form.baseRate}
            onChange={e => setForm(prev => ({ ...prev, baseRate: e.target.value }))}
            startDecorator={<MoneyIcon sx={{ fontSize: 16 }} />}
          />

          <Select
            placeholder="Metodo de pago *"
            value={form.paymentMethod || null}
            onChange={(_, v) => v && setForm(prev => ({ ...prev, paymentMethod: v as PaymentMethod }))}
          >
            <Option value="stripe">Stripe</Option>
            <Option value="paypal">PayPal</Option>
            <Option value="bank_transfer">Transferencia bancaria</Option>
          </Select>

          {form.paymentMethod === 'paypal' && (
            <Input
              placeholder="PayPal email"
              type="email"
              value={form.paypalEmail}
              onChange={e => setForm(prev => ({ ...prev, paypalEmail: e.target.value }))}
            />
          )}

          <Box sx={{ display: 'flex', gap: 1, pt: 0.5 }}>
            <Button variant="plain" color="neutral" onClick={onClose} sx={{ flex: 1 }} disabled={saving}>
              Cancelar
            </Button>
            <Button color="primary" onClick={handleSubmit} loading={saving} sx={{ flex: 2 }}>
              Agregar Creador
            </Button>
          </Box>
        </Stack>
      </ModalDialog>
    </Modal>
  )
}

// ─── Modal Asignar Campana ────────────────────────────────────────────────────

interface AssignModalProps {
  open: boolean
  creator: Creator | null
  onClose: () => void
  onSuccess: () => void
}

function AssignModal({ open, creator, onClose, onSuccess }: AssignModalProps) {
  const [form, setForm]           = useState<AssignForm>(EMPTY_ASSIGN_FORM)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm(EMPTY_ASSIGN_FORM)
    setError(null)
    setLoadingCampaigns(true)
    api.get('/ugc/campaigns')
      .then(res => setCampaigns(res.data?.data ?? res.data ?? []))
      .catch(err => devError('[AssignModal] campaigns:', err))
      .finally(() => setLoadingCampaigns(false))
  }, [open])

  const handleSubmit = async () => {
    if (!creator || !form.campaignId || !form.deadline || !form.agreedRate) {
      setError('Completa los campos obligatorios.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.post(`/ugc/creators/${creator.id}/assign/${form.campaignId}`, {
        brief: form.brief,
        deadline: form.deadline,
        agreedRate: Number(form.agreedRate),
      })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      devError('[AssignModal] error:', err)
      setError('No se pudo asignar. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ maxWidth: 460, width: '100%' }}>
        <ModalClose />
        <Typography level="title-lg">
          Asignar a Campana
          {creator && <Typography component="span" color="neutral" fontWeight="normal"> — {creator.name}</Typography>}
        </Typography>
        <Divider />

        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {error && (
            <Sheet variant="soft" color="danger" sx={{ p: 1.5, borderRadius: 'sm' }}>
              <Typography level="body-sm" color="danger">{error}</Typography>
            </Sheet>
          )}

          {loadingCampaigns ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size="sm" />
            </Box>
          ) : (
            <Select
              placeholder="Campana activa *"
              value={form.campaignId || null}
              onChange={(_, v) => v && setForm(prev => ({ ...prev, campaignId: String(v) }))}
            >
              {campaigns.map(c => (
                <Option key={c.id} value={String(c.id)}>{c.name}</Option>
              ))}
            </Select>
          )}

          <Textarea
            placeholder="Brief / instrucciones"
            minRows={3}
            value={form.brief}
            onChange={e => setForm(prev => ({ ...prev, brief: e.target.value }))}
          />

          <Box>
            <Typography level="body-xs" color="neutral" sx={{ mb: 0.5 }}>Deadline *</Typography>
            <Input
              type="date"
              value={form.deadline}
              onChange={e => setForm(prev => ({ ...prev, deadline: e.target.value }))}
            />
          </Box>

          <Input
            placeholder="Tarifa acordada ($) *"
            type="number"
            value={form.agreedRate}
            onChange={e => setForm(prev => ({ ...prev, agreedRate: e.target.value }))}
            startDecorator={<MoneyIcon sx={{ fontSize: 16 }} />}
          />

          <Box sx={{ display: 'flex', gap: 1, pt: 0.5 }}>
            <Button variant="plain" color="neutral" onClick={onClose} sx={{ flex: 1 }} disabled={saving}>
              Cancelar
            </Button>
            <Button color="primary" onClick={handleSubmit} loading={saving} sx={{ flex: 2 }}>
              Asignar
            </Button>
          </Box>
        </Stack>
      </ModalDialog>
    </Modal>
  )
}

// ─── Modal Procesar Pago ──────────────────────────────────────────────────────

interface PayModalProps {
  open: boolean
  creator: Creator | null
  onClose: () => void
  onSuccess: () => void
}

function PayModal({ open, creator, onClose, onSuccess }: PayModalProps) {
  const [form, setForm]               = useState<PayForm>(EMPTY_PAY_FORM)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)

  const PLATFORM_FEE = 0.1

  useEffect(() => {
    if (!open || !creator) return
    setForm(EMPTY_PAY_FORM)
    setError(null)
    api.get(`/ugc/creators/${creator.id}/assignments`)
      .then(res => setAssignments(res.data?.data ?? res.data ?? []))
      .catch(err => devError('[PayModal] assignments:', err))
  }, [open, creator])

  const grossAmount = Number(form.amount) || 0
  const feeAmount   = grossAmount * PLATFORM_FEE
  const netAmount   = grossAmount - feeAmount

  const handleSubmit = async () => {
    if (!creator || !form.amount || !form.description) {
      setError('Completa los campos obligatorios.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.post(`/ugc/creators/${creator.id}/pay`, {
        amount: grossAmount,
        description: form.description,
        assignmentId: form.assignmentId ? Number(form.assignmentId) : undefined,
      })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      devError('[PayModal] error:', err)
      setError('No se pudo procesar el pago. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const paymentMethodLabel: Record<PaymentMethod, string> = {
    stripe: 'Stripe',
    paypal: 'PayPal',
    bank_transfer: 'Transferencia bancaria',
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ maxWidth: 440, width: '100%' }}>
        <ModalClose />
        <Typography level="title-lg">Procesar Pago</Typography>
        <Divider />

        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {error && (
            <Sheet variant="soft" color="danger" sx={{ p: 1.5, borderRadius: 'sm' }}>
              <Typography level="body-sm" color="danger">{error}</Typography>
            </Sheet>
          )}

          {creator && (
            <Sheet variant="soft" color="neutral" sx={{ p: 1.5, borderRadius: 'sm' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography level="body-xs" color="neutral">Creador</Typography>
                <Typography level="body-xs" fontWeight="md">{creator.name}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography level="body-xs" color="neutral">Metodo</Typography>
                <Typography level="body-xs" fontWeight="md">{paymentMethodLabel[creator.paymentMethod]}</Typography>
              </Box>
              {creator.paymentMethod === 'paypal' && creator.paypalEmail && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography level="body-xs" color="neutral">PayPal</Typography>
                  <Typography level="body-xs" fontWeight="md">{creator.paypalEmail}</Typography>
                </Box>
              )}
              {creator.paymentMethod === 'stripe' && creator.stripeAccountId && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography level="body-xs" color="neutral">Stripe Account</Typography>
                  <Typography level="body-xs" fontWeight="md">{creator.stripeAccountId}</Typography>
                </Box>
              )}
            </Sheet>
          )}

          <Input
            placeholder="Monto ($) *"
            type="number"
            value={form.amount}
            onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))}
            startDecorator={<MoneyIcon sx={{ fontSize: 16 }} />}
          />

          {grossAmount > 0 && (
            <Sheet variant="soft" color="success" sx={{ p: 1.5, borderRadius: 'sm' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                <Typography level="body-xs" color="neutral">Fee plataforma (10%)</Typography>
                <Typography level="body-xs" color="danger">-${feeAmount.toFixed(2)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography level="body-xs" fontWeight="lg">Monto neto</Typography>
                <Typography level="body-xs" color="success" fontWeight="lg">${netAmount.toFixed(2)}</Typography>
              </Box>
            </Sheet>
          )}

          <Input
            placeholder="Descripcion *"
            value={form.description}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
          />

          {assignments.length > 0 && (
            <Select
              placeholder="Asignacion relacionada (opcional)"
              value={form.assignmentId || null}
              onChange={(_, v) => setForm(prev => ({ ...prev, assignmentId: v ? String(v) : '' }))}
            >
              {assignments.map(a => (
                <Option key={a.id} value={String(a.id)}>
                  {a.campaignName} — ${a.agreedRate}
                </Option>
              ))}
            </Select>
          )}

          <Box sx={{ display: 'flex', gap: 1, pt: 0.5 }}>
            <Button variant="plain" color="neutral" onClick={onClose} sx={{ flex: 1 }} disabled={saving}>
              Cancelar
            </Button>
            <Button color="success" onClick={handleSubmit} loading={saving} sx={{ flex: 2 }}>
              Procesar Pago
            </Button>
          </Box>
        </Stack>
      </ModalDialog>
    </Modal>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UGCCreatorNetwork() {
  const [creators, setCreators]         = useState<Creator[]>([])
  const [stats, setStats]               = useState<CreatorStats | null>(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<CreatorStatus | 'all'>('all')
  const [nicheFilter, setNicheFilter]   = useState<CreatorNiche | 'all'>('all')

  const [addOpen, setAddOpen]           = useState(false)
  const [assignCreator, setAssignCreator] = useState<Creator | null>(null)
  const [payCreator, setPayCreator]     = useState<Creator | null>(null)
  const [editCreator, setEditCreator]   = useState<Creator | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/ugc/creators')
      const list: Creator[] = data.data ?? data ?? []
      setCreators(list)

      const active   = list.filter(c => c.status === 'active').length
      const assigned = list.reduce((acc, c) => acc + c.completedCampaigns, 0)
      const avgRating = list.length > 0 ? list.reduce((acc, c) => acc + c.rating, 0) / list.length : 0

      setStats({
        totalActive: active,
        assignedCampaigns: assigned,
        paymentsThisMonth: 0,
        avgRating,
      })
    } catch (err: unknown) {
      devError('[UGCCreatorNetwork] fetch error:', err)
      setError('No se pudo cargar la red de creadores. Verifica tu conexion.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredCreators = creators.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (nicheFilter  !== 'all' && c.niche  !== nicheFilter)  return false
    if (search) {
      const q = search.toLowerCase()
      if (!c.name.toLowerCase().includes(q) && !c.email.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <GroupsIcon sx={{ fontSize: 28, color: 'primary.500' }} />
          <Box>
            <Typography level="h3">Red de Creadores</Typography>
            <Typography level="body-sm" color="neutral">
              Gestiona tu red de creadores de contenido UGC
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton variant="outlined" color="neutral" size="sm" onClick={fetchData} disabled={loading}>
            <Refresh />
          </IconButton>
          <Button
            color="primary"
            startDecorator={<AddIcon />}
            onClick={() => setAddOpen(true)}
          >
            Agregar Creador
          </Button>
        </Box>
      </Box>

      {/* ── Stats strip ── */}
      <StatsStrip stats={stats} loading={loading} />

      {/* ── Error state ── */}
      {error && (
        <Sheet variant="soft" color="danger" sx={{ p: 2, borderRadius: 'md', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography level="body-sm" color="danger">{error}</Typography>
            <Button size="sm" variant="plain" color="danger" onClick={fetchData}>Reintentar</Button>
          </Box>
        </Sheet>
      )}

      {/* ── Filtros ── */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          size="sm"
          placeholder="Buscar por nombre o email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          startDecorator={<SearchIcon sx={{ fontSize: 16 }} />}
          sx={{ minWidth: 220 }}
        />
        <Select
          size="sm"
          value={statusFilter}
          onChange={(_, v) => v && setStatusFilter(v as CreatorStatus | 'all')}
          sx={{ minWidth: 150 }}
        >
          <Option value="all">Todos los estados</Option>
          <Option value="pending">Pendiente</Option>
          <Option value="verified">Verificado</Option>
          <Option value="active">Activo</Option>
          <Option value="suspended">Suspendido</Option>
        </Select>
        <Select
          size="sm"
          value={nicheFilter}
          onChange={(_, v) => v && setNicheFilter(v as CreatorNiche | 'all')}
          sx={{ minWidth: 140 }}
        >
          <Option value="all">Todos los nichos</Option>
          {(Object.entries(NICHE_CONFIG) as [CreatorNiche, typeof NICHE_CONFIG[CreatorNiche]][]).map(([key, cfg]) => (
            <Option key={key} value={key}>{cfg.label}</Option>
          ))}
        </Select>
        <Typography level="body-xs" color="neutral" sx={{ ml: 'auto', alignSelf: 'center' }}>
          {filteredCreators.length} creador{filteredCreators.length !== 1 ? 'es' : ''}
        </Typography>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* ── Content ── */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size="lg" />
        </Box>
      ) : filteredCreators.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
          <GroupsIcon sx={{ fontSize: 64, color: 'text.tertiary' }} />
          <Typography level="h3" textAlign="center">Sin creadores</Typography>
          <Typography level="body-md" color="neutral" textAlign="center" sx={{ maxWidth: 380 }}>
            {creators.length === 0
              ? 'No hay creadores registrados. Agrega tu primer creador de contenido.'
              : 'No hay creadores que coincidan con los filtros seleccionados.'}
          </Typography>
          {creators.length === 0 && (
            <Button startDecorator={<AddIcon />} onClick={() => setAddOpen(true)}>
              Agregar Primer Creador
            </Button>
          )}
        </Box>
      ) : (
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
          {filteredCreators.map(creator => (
            <CreatorCard
              key={creator.id}
              creator={creator}
              onAssign={c => setAssignCreator(c)}
              onPay={c => setPayCreator(c)}
              onEdit={c => setEditCreator(c)}
            />
          ))}
        </Box>
      )}

      {/* ── Edit placeholder info ── */}
      {editCreator && (
        <Sheet
          variant="soft"
          color="neutral"
          sx={{ p: 2, borderRadius: 'md', mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Typography level="body-sm">Editando: <strong>{editCreator.name}</strong> — Funcionalidad de edicion disponible en la proxima version.</Typography>
          <Button size="sm" variant="plain" color="neutral" onClick={() => setEditCreator(null)}>Cerrar</Button>
        </Sheet>
      )}

      {/* ── Modales ── */}
      <AddCreatorModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={fetchData}
      />
      <AssignModal
        open={assignCreator !== null}
        creator={assignCreator}
        onClose={() => setAssignCreator(null)}
        onSuccess={fetchData}
      />
      <PayModal
        open={payCreator !== null}
        creator={payCreator}
        onClose={() => setPayCreator(null)}
        onSuccess={fetchData}
      />
    </Box>
  )
}
