import React, { useEffect, useState } from 'react'
import {
  Box,
  Stack,
  Sheet,
  Typography,
  Avatar,
  Chip,
  Divider,
  Autocomplete,
  AutocompleteOption,
  FormControl,
  FormLabel,
  CircularProgress,
  IconButton,
  Button,
} from '@mui/joy'
import {
  WhatsApp,
  Instagram,
  Facebook,
  Telegram,
  Language,
  Close,
  Event,
  StickyNote2,
  Campaign as CampaignIcon,
  Send,
  ChatBubbleOutline,
} from '@mui/icons-material'
import { format, parseISO, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import api from '../../services/api'
import { toast } from 'react-toastify'
import formatLastMessagePreview from '../../utils/formatLastMessagePreview'

/* ============================ Tipos ============================ */
export interface FunnelTag {
  id: number
  name: string
  color: string
  kanban?: number
}

export interface FunnelTicket {
  id: number
  uuid: string
  status: string
  channel: string
  lastMessage?: string
  unreadMessages?: number
  createdAt?: string
  updatedAt?: string
  contact?: {
    id?: number
    name?: string
    number?: string
    email?: string
    urlPicture?: string
    profilePicUrl?: string
  }
  user?: { id?: number; name?: string }
  queue?: { id?: number; name?: string; color?: string }
  whatsapp?: { id?: number; name?: string }
  tags?: FunnelTag[]
  /** Preparados para cuando el backend los exponga (hoy no hay endpoint). */
  campaign?: { name?: string; source?: string } | null
  lastLead?: { product?: string; createdAt?: string; status?: string } | null
}

interface Appointment {
  id: number
  title?: string
  startTime?: string
  status?: string
  assignedUser?: { name?: string }
}

interface TicketNote {
  id: number
  note: string
  createdAt?: string
  user?: { name?: string }
}

interface Props {
  ticket: FunnelTicket | null
  kanbanTags: FunnelTag[]
  /** Notifica al padre el cambio de etiqueta de funnel (para refrescar lista y contadores). */
  onFunnelTagChange: (ticketId: number, newTag: FunnelTag | null) => void
  onClose: () => void
  onOpenConversation?: (uuid: string) => void
}

/* ============================ Helpers ============================ */
const channelIcon = (channel?: string) => {
  switch ((channel || '').toLowerCase()) {
    case 'whatsapp':
      return <WhatsApp sx={{ fontSize: 16, color: '#25d366' }} />
    case 'instagram':
      return <Instagram sx={{ fontSize: 16, color: '#e1306c' }} />
    case 'facebook':
      return <Facebook sx={{ fontSize: 16, color: '#1877f2' }} />
    case 'telegram':
      return <Telegram sx={{ fontSize: 16, color: '#229ED9' }} />
    default:
      return <Language sx={{ fontSize: 16, color: '#64748b' }} />
  }
}

const channelLabel = (channel?: string) => {
  if (!channel) return 'Desconocido'
  return channel.charAt(0).toUpperCase() + channel.slice(1)
}

const fmtDateTime = (value?: string) => {
  if (!value) return '—'
  try {
    const d = parseISO(value)
    if (isSameDay(d, new Date())) return `Hoy ${format(d, 'HH:mm')}`
    return format(d, "dd MMM yyyy · HH:mm", { locale: es })
  } catch {
    return '—'
  }
}

const statusMap: Record<string, { label: string; color: 'success' | 'warning' | 'neutral' | 'primary' }> = {
  open: { label: 'Abierto', color: 'success' },
  pending: { label: 'Pendiente', color: 'warning' },
  closed: { label: 'Cerrado', color: 'neutral' },
  group: { label: 'Grupo', color: 'primary' },
}

/* Sección reutilizable con título e icono */
const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({
  icon,
  title,
  children,
}) => (
  <Box sx={{ px: 2, py: 1.5 }}>
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
      <Box sx={{ color: 'text.tertiary', display: 'flex' }}>{icon}</Box>
      <Typography level="title-sm" sx={{ color: 'text.secondary', textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>
        {title}
      </Typography>
    </Stack>
    {children}
  </Box>
)

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <Typography level="body-sm" sx={{ color: 'text.tertiary', fontStyle: 'italic' }}>
    {text}
  </Typography>
)

/* ============================ Componente ============================ */
const FunnelTicketPanel: React.FC<Props> = ({ ticket, kanbanTags, onFunnelTagChange, onClose, onOpenConversation }) => {
  const [detail, setDetail] = useState<FunnelTicket | null>(null)
  const [normalTags, setNormalTags] = useState<FunnelTag[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [notes, setNotes] = useState<TicketNote[]>([])
  const [loading, setLoading] = useState(false)
  const [savingTag, setSavingTag] = useState(false)
  const [currentFunnelTag, setCurrentFunnelTag] = useState<FunnelTag | null>(null)

  useEffect(() => {
    if (!ticket?.id) {
      setDetail(null)
      return
    }
    let cancelled = false

    const load = async () => {
      setLoading(true)
      // Render inmediato con datos de la lista
      setDetail(ticket)
      setCurrentFunnelTag(ticket.tags?.find(t => t.kanban === 1) || null)
      setNormalTags((ticket.tags || []).filter(t => t.kanban !== 1))

      try {
        const [detailRes, notesRes, apptRes] = await Promise.allSettled([
          api.get(`/tickets/${ticket.id}`),
          api.get('/ticket-notes/list', { params: { contactId: ticket.contact?.id, ticketId: ticket.id } }),
          ticket.contact?.id
            ? api.get('/appointments/appointments', {
                params: { contactId: ticket.contact.id, status: 'scheduled,confirmed,pending', limit: 5 },
              })
            : Promise.resolve({ data: { appointments: [] } } as any),
        ])

        if (cancelled) return

        if (detailRes.status === 'fulfilled') {
          const d = detailRes.value.data
          setDetail(prev => ({ ...(prev || {}), ...d }))
          const allTags: FunnelTag[] = d?.contact?.tags || d?.tags || []
          setCurrentFunnelTag(allTags.find(t => t.kanban === 1) || (d?.tags || []).find((t: FunnelTag) => t.kanban === 1) || null)
          setNormalTags(allTags.filter(t => t.kanban !== 1))
        }
        if (notesRes.status === 'fulfilled') {
          const list = notesRes.value.data?.notes || notesRes.value.data || []
          setNotes(Array.isArray(list) ? list : [])
        }
        if (apptRes.status === 'fulfilled') {
          setAppointments(apptRes.value.data?.appointments || [])
        }
      } catch (err) {
        // estados vacíos silenciosos, sin romper la vista
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [ticket?.id])

  const handleFunnelTagChange = async (_e: React.SyntheticEvent | null, value: FunnelTag | null) => {
    if (!ticket?.id) return
    const previous = currentFunnelTag
    setSavingTag(true)
    setCurrentFunnelTag(value) // optimista
    try {
      // Quitar etiqueta de funnel existente
      await api.delete(`/ticket-tags/${ticket.id}`)
      // Agregar la nueva si corresponde
      if (value) {
        await api.put(`/ticket-tags/${ticket.id}/${value.id}`)
      }
      onFunnelTagChange(ticket.id, value)
      toast.success(value ? `Movido a "${value.name}"` : 'Etiqueta de funnel removida')
    } catch (err) {
      setCurrentFunnelTag(previous) // revertir
      toast.error('No se pudo cambiar la etiqueta')
    } finally {
      setSavingTag(false)
    }
  }

  if (!ticket) {
    return (
      <Sheet
        variant="outlined"
        sx={{
          width: 340,
          borderRadius: 'md',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
        }}
      >
        <Stack spacing={1} alignItems="center">
          <ChatBubbleOutline sx={{ fontSize: 40, color: 'text.tertiary' }} />
          <Typography level="body-sm" sx={{ color: 'text.tertiary', textAlign: 'center' }}>
            Selecciona un ticket para ver su información
          </Typography>
        </Stack>
      </Sheet>
    )
  }

  const c = detail?.contact || ticket.contact
  const st = statusMap[detail?.status || ticket.status] || { label: detail?.status || '—', color: 'neutral' as const }
  const avatarSrc = c?.urlPicture || c?.profilePicUrl

  return (
    <Sheet
      variant="outlined"
      sx={{
        width: 340,
        borderRadius: 'md',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: 'background.surface',
      }}
    >
      {/* Cabecera */}
      <Box sx={{ p: 2, position: 'relative' }}>
        <IconButton
          size="sm"
          variant="plain"
          color="neutral"
          onClick={onClose}
          sx={{ position: 'absolute', top: 8, right: 8 }}
        >
          <Close fontSize="small" />
        </IconButton>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar src={avatarSrc} size="lg">
            {c?.name?.charAt(0)?.toUpperCase() || '?'}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography level="title-md" noWrap>
              {c?.name || 'Sin nombre'}
            </Typography>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                #{ticket.id}
              </Typography>
              {channelIcon(detail?.channel || ticket.channel)}
              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                {channelLabel(detail?.channel || ticket.channel)}
              </Typography>
            </Stack>
            {c?.number && (
              <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                {c.number}
              </Typography>
            )}
          </Box>
        </Stack>
      </Box>

      <Divider />

      {/* Cuerpo scrolleable */}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {/* Información principal (solo lectura) */}
        <Section icon={<ChatBubbleOutline fontSize="small" />} title="Información">
          <Stack spacing={0.75}>
            <InfoRow label="Estado">
              <Chip size="sm" variant="soft" color={st.color}>
                {st.label}
              </Chip>
            </InfoRow>
            <InfoRow label="Agente asignado" value={detail?.user?.name || '— Sin asignar'} />
            <InfoRow label="Cola / Negocio" value={detail?.queue?.name || ticket.whatsapp?.name || '—'} />
            <InfoRow label="Última interacción" value={fmtDateTime(detail?.updatedAt || ticket.updatedAt)} />
            <InfoRow label="Creado" value={fmtDateTime(detail?.createdAt || ticket.createdAt)} />
            {c?.email && <InfoRow label="Email" value={c.email} />}
          </Stack>
        </Section>

        <Divider />

        {/* B. Etiqueta del funnel — ÚNICO CAMPO EDITABLE */}
        <Section icon={<CampaignIcon fontSize="small" />} title="Etiqueta del funnel">
          <FormControl size="sm">
            <FormLabel sx={{ display: 'none' }}>Mover a etiqueta</FormLabel>
            <Autocomplete
              placeholder="Buscar o seleccionar etiqueta..."
              options={kanbanTags}
              value={currentFunnelTag}
              loading={savingTag}
              disabled={savingTag}
              getOptionLabel={o => o.name}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              onChange={handleFunnelTagChange}
              startDecorator={
                currentFunnelTag ? (
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: currentFunnelTag.color,
                      flexShrink: 0,
                    }}
                  />
                ) : undefined
              }
              endDecorator={savingTag ? <CircularProgress size="sm" /> : null}
              renderOption={(props, option) => (
                <AutocompleteOption {...props} key={option.id}>
                  <Box
                    sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: option.color, mr: 1, flexShrink: 0 }}
                  />
                  {option.name}
                </AutocompleteOption>
              )}
            />
          </FormControl>
        </Section>

        <Divider />

        {/* C. Etiquetas normales del contacto (solo lectura) */}
        <Section icon={<StickyNote2 fontSize="small" />} title="Etiquetas del contacto">
          {normalTags.length > 0 ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {normalTags.map(t => (
                <Chip
                  key={t.id}
                  size="sm"
                  variant="soft"
                  sx={{
                    bgcolor: `${t.color}22`,
                    color: t.color,
                    fontWeight: 600,
                  }}
                >
                  {t.name}
                </Chip>
              ))}
            </Box>
          ) : (
            <EmptyState text="Sin etiquetas adicionales" />
          )}
        </Section>

        <Divider />

        {/* G. Campaña de origen (sin endpoint → estado vacío preparado) */}
        <Section icon={<CampaignIcon fontSize="small" />} title="Campaña de origen">
          {detail?.campaign ? (
            <Stack spacing={0.25}>
              <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                {detail.campaign.name}
              </Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                {detail.campaign.source}
              </Typography>
            </Stack>
          ) : (
            <EmptyState text="Sin campaña asociada" />
          )}
        </Section>

        <Divider />

        {/* F. Último lead enviado (sin endpoint → estado vacío preparado) */}
        <Section icon={<Send fontSize="small" />} title="Último lead enviado">
          {detail?.lastLead ? (
            <Stack spacing={0.25}>
              <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                {detail.lastLead.product}
              </Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                {fmtDateTime(detail.lastLead.createdAt)} · {detail.lastLead.status}
              </Typography>
            </Stack>
          ) : (
            <EmptyState text="Sin leads enviados" />
          )}
        </Section>

        <Divider />

        {/* D. Citas agendadas (solo lectura) */}
        <Section icon={<Event fontSize="small" />} title="Citas agendadas">
          {appointments.length > 0 ? (
            <Stack spacing={1}>
              {appointments.map(a => (
                <Box
                  key={a.id}
                  sx={{ p: 1, borderRadius: 'sm', bgcolor: 'background.level1', border: '1px solid', borderColor: 'divider' }}
                >
                  <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                    {a.title || 'Cita'}
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                    {fmtDateTime(a.startTime)}
                  </Typography>
                  {a.assignedUser?.name && (
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                      Asignado a: {a.assignedUser.name}
                    </Typography>
                  )}
                </Box>
              ))}
            </Stack>
          ) : (
            <EmptyState text="Sin citas agendadas" />
          )}
        </Section>

        <Divider />

        {/* E. Observaciones / notas internas (solo lectura) */}
        <Section icon={<StickyNote2 fontSize="small" />} title="Observación">
          {notes.length > 0 ? (
            <Stack spacing={1}>
              {notes.slice(0, 3).map(n => (
                <Box
                  key={n.id}
                  sx={{
                    p: 1,
                    borderRadius: 'sm',
                    bgcolor: 'warning.softBg',
                    border: '1px solid',
                    borderColor: 'warning.outlinedBorder',
                  }}
                >
                  <Typography level="body-sm">{n.note}</Typography>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                    {n.user?.name ? `Agregado por ${n.user.name} · ` : ''}
                    {fmtDateTime(n.createdAt)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          ) : (
            <EmptyState text="Sin observaciones registradas" />
          )}
        </Section>

        <Divider />

        {/* H. Último mensaje */}
        <Section icon={<ChatBubbleOutline fontSize="small" />} title="Último mensaje">
          {detail?.lastMessage || ticket.lastMessage ? (
            <Box sx={{ p: 1, borderRadius: 'sm', bgcolor: 'background.level1' }}>
              <Typography level="body-sm" sx={{ fontStyle: 'italic' }}>
                "{formatLastMessagePreview(detail?.lastMessage || ticket.lastMessage)}"
              </Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                {fmtDateTime(detail?.updatedAt || ticket.updatedAt)}
              </Typography>
            </Box>
          ) : (
            <EmptyState text="Sin mensajes" />
          )}
        </Section>
      </Box>

      {/* Acción: abrir conversación */}
      {onOpenConversation && (
        <>
          <Divider />
          <Box sx={{ p: 1.5 }}>
            <Button
              fullWidth
              color="success"
              startDecorator={<WhatsApp />}
              onClick={() => onOpenConversation(ticket.uuid)}
            >
              Abrir conversación
            </Button>
          </Box>
        </>
      )}

      {loading && (
        <Box sx={{ position: 'absolute', top: 8, left: 8 }}>
          <CircularProgress size="sm" />
        </Box>
      )}
    </Sheet>
  )
}

const InfoRow: React.FC<{ label: string; value?: string; children?: React.ReactNode }> = ({
  label,
  value,
  children,
}) => (
  <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
    <Typography level="body-xs" sx={{ color: 'text.tertiary', flexShrink: 0 }}>
      {label}
    </Typography>
    {children || (
      <Typography level="body-sm" sx={{ textAlign: 'right', wordBreak: 'break-word' }}>
        {value}
      </Typography>
    )}
  </Stack>
)

export default FunnelTicketPanel
