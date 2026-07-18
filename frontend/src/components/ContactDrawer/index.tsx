import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  IconButton,
  Drawer,
  Avatar,
  Button,
  Card,
  Switch,
  Stack,
  Skeleton,
  Input,
  FormControl,
  FormLabel,
  Textarea,
  Chip,
  Select,
  Option,
  Divider,
  Tooltip,
  Menu,
  MenuItem,
  Modal,
  ModalDialog,
  Autocomplete,
  List,
} from '@mui/joy'
import {
  Close as CloseIcon,
  Edit as EditIcon,
  Block as BlockIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Notes as NotesIcon,
  LocalOffer as TagIcon,
  ViewKanban as KanbanIcon,
  CalendarMonth as CalendarIcon,
  Schedule,
  CheckCircle,
  Notifications,
  NotificationsOff,
  MoreVert as MoreVertIcon,
  SwapHoriz as TransferIcon,
} from '@mui/icons-material'
import api from '../../services/api'
import { toast } from 'react-toastify'
import translateBackendError from '../../utils/translateBackendError'
import { TagsContainer } from '../TagsContainer'
import CreateAppointmentModal from '../CreateAppointmentModal'

interface Contact {
  id: number
  name: string
  number: string
  email?: string
  profilePicUrl?: string
  urlPicture?: string
  active?: boolean
  acceptAudioMessage?: boolean
  disableBot?: boolean
  tags?: Tag[]
  extraInfo?: Array<{ id: number; name: string; value: string }>
}

interface Tag {
  id: number
  name: string
  color: string
  kanban?: number
}

interface Queue {
  id: number
  name: string
  color?: string
}

interface Ticket {
  id: number
  uuid: string
  status: string
  contactId: number
  queueId?: number | null
  queue?: Queue | null
  contact: Contact
  tags?: Tag[]
  followupEnabled?: boolean
  isBot?: boolean
}

interface ExistingAppointment {
  id: number
  title: string
  startTime: string
  endTime: string
  status: string
  serviceId: number
  userId?: number
  confirmationSent?: boolean
  reminderSent?: boolean
  service?: {
    id: number
    name: string
    color: string
    duration: number
  }
  user?: {
    id: number
    name: string
  }
}

interface ContactDrawerProps {
  open: boolean
  onClose: () => void
  contact: Contact | null
  ticket: Ticket | null
  loading?: boolean
  /**
   * Callbacks opcionales para reflejar los cambios en tiempo real en el
   * componente padre (header de la conversación + lista de tickets), sin
   * esperar el rebote del socket. Son opcionales: si no se pasan, el drawer
   * funciona igual que antes (retrocompatible).
   */
  onContactPatched?: (patch: Partial<Contact>) => void
  onTicketPatched?: (patch: Partial<Ticket>) => void
}

export default function ContactDrawer({
  open,
  onClose,
  contact,
  ticket,
  loading = false,
  onContactPatched,
  onTicketPatched,
}: ContactDrawerProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedContact, setEditedContact] = useState<Partial<Contact>>({})
  const [saving, setSaving] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState<Tag[]>([])
  const [kanbanTags, setKanbanTags] = useState<Tag[]>([])
  const [selectedKanbanTag, setSelectedKanbanTag] = useState<string>('')
  const [availableQueues, setAvailableQueues] = useState<Queue[]>([])
  const [selectedQueueId, setSelectedQueueId] = useState<string>('')
  const [updatingQueue, setUpdatingQueue] = useState(false)
  const [openAppointmentModal, setOpenAppointmentModal] = useState(false)
  const [existingAppointment, setExistingAppointment] = useState<ExistingAppointment | null>(null)
  const [checkingAppointment, setCheckingAppointment] = useState(false)
  const [confirmingAppointment, setConfirmingAppointment] = useState(false)
  const [followupEnabled, setFollowupEnabled] = useState(true)
  const [togglingFollowup, setTogglingFollowup] = useState(false)
  const [togglingBot, setTogglingBot] = useState(false)
  const [openTransferMenu, setOpenTransferMenu] = useState<HTMLElement | null>(null)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [searchContact, setSearchContact] = useState('')
  const [searchResults, setSearchResults] = useState<Contact[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [searchingContacts, setSearchingContacts] = useState(false)
  const [transferring, setTransferring] = useState(false)

  useEffect(() => {
    if (contact) {
      setEditedContact({
        name: contact.name,
        email: contact.email,
        number: contact.number,
      })
    }
  }, [contact])

  useEffect(() => {
    if (ticket?.id) {
      fetchKanbanTags()
      fetchAvailableQueues()
    }
  }, [ticket?.id])

  // Sincronizar selectedQueueId con la cola actual del ticket
  useEffect(() => {
    setSelectedQueueId(ticket?.queueId ? String(ticket.queueId) : '')
  }, [ticket?.queueId])

  // Fetch existing appointment when drawer opens
  useEffect(() => {
    const fetchAppointment = async () => {
      if (!contact?.id || !open) {
        setExistingAppointment(null)
        return
      }

      try {
        const response = await api.get('/appointments/appointments', {
          params: {
            contactId: contact.id,
            status: 'pending,confirmed,scheduled',
            limit: 1
          }
        })
        const appointments = response.data.appointments || []
        if (appointments.length > 0) {
          setExistingAppointment(appointments[0])
        } else {
          setExistingAppointment(null)
        }
      } catch (error) {
        console.error('Error fetching appointment:', error)
        setExistingAppointment(null)
      }
    }

    fetchAppointment()
  }, [contact?.id, open])

  // Recarga la cita activa del contacto (reutilizable tras crear/reprogramar)
  const refreshExistingAppointment = async () => {
    if (!contact?.id) {
      setExistingAppointment(null)
      return
    }
    try {
      const response = await api.get('/appointments/appointments', {
        params: {
          contactId: contact.id,
          status: 'pending,confirmed,scheduled',
          limit: 1,
        },
      })
      const appointments = response.data.appointments || []
      setExistingAppointment(appointments.length > 0 ? appointments[0] : null)
    } catch (error) {
      console.error('Error refreshing appointment:', error)
    }
  }

  // Usar las tags del ticket directamente
  useEffect(() => {
    if (ticket?.tags) {
      setTags(ticket.tags)
      const kanbanTag = ticket.tags.find(t => t.kanban === 1)
      if (kanbanTag) {
        setSelectedKanbanTag(String(kanbanTag.id))
      } else {
        setSelectedKanbanTag('')
      }
    }
  }, [ticket?.tags])

  // Inicializar followupEnabled desde el ticket
  useEffect(() => {
    if (ticket?.followupEnabled !== undefined) {
      setFollowupEnabled(ticket.followupEnabled)
    } else {
      setFollowupEnabled(true) // default true
    }
  }, [ticket?.followupEnabled])

  const fetchKanbanTags = async () => {
    try {
      const response = await api.get('/tags/list', { params: { kanban: 1 } })
      setKanbanTags(response.data || [])
    } catch (error) {
      console.error('Error fetching kanban tags:', error)
    }
  }

  const fetchAvailableQueues = async () => {
    try {
      const response = await api.get('/queues')
      const list = Array.isArray(response.data)
        ? response.data
        : response.data?.queues || []
      setAvailableQueues(list)
    } catch (error) {
      console.error('Error fetching queues:', error)
    }
  }

  const handleChangeQueue = async (
    _event: React.SyntheticEvent | null,
    value: string | null
  ) => {
    if (!ticket?.id) return
    const nextValue = value ?? ''
    // Guardas anti-cambio-espurio del Select controlado (evitan remover la cola sin
    // que el usuario la toque de verdad):
    //  1) si el valor no cambió respecto a lo ya seleccionado, no hacer nada.
    if (nextValue === selectedQueueId) return
    //  2) si intenta poner "Sin cola" pero las colas aún NO cargaron, es un reset
    //     espurio (el value no estaba entre las <Option>) → ignorar, NO remover.
    if (nextValue === '' && availableQueues.length === 0) return
    const newQueueId = value ? Number(value) : null
    const previousQueueId = selectedQueueId
    setSelectedQueueId(value ?? '')
    setUpdatingQueue(true)
    try {
      await api.put(`/tickets/${ticket.id}`, { queueId: newQueueId })
      // Reflejar al instante en el padre (header + lista)
      const newQueue = newQueueId
        ? availableQueues.find((q) => q.id === newQueueId) ?? null
        : null
      onTicketPatched?.({ queueId: newQueueId, queue: newQueue })
      toast.success(newQueueId ? 'Cola actualizada' : 'Cola removida')
    } catch (error: any) {
      // Rollback visual si backend rechaza
      setSelectedQueueId(previousQueueId)
      const apiMsg =
        error?.response?.data?.error || error?.response?.data?.message
      toast.error(apiMsg || 'Error al actualizar la cola')
      console.error('Error updating queue:', error)
    } finally {
      setUpdatingQueue(false)
    }
  }

  const handleKanbanTagChange = async (_event: React.SyntheticEvent | null, value: string | null) => {
    if (!ticket?.id) return

    try {
      // Primero eliminar tags kanban existentes
      if (tags.some(t => t.kanban === 1)) {
        await api.delete(`/ticket-tags/${ticket.id}`)
      }

      // Si hay un valor seleccionado, agregar la nueva tag
      if (value) {
        await api.put(`/ticket-tags/${ticket.id}/${value}`)
        setSelectedKanbanTag(value)

        // Actualizar estado local de tags
        const newTag = kanbanTags.find(t => String(t.id) === value)
        if (newTag) {
          // Reemplazar tag kanban existente o agregar nueva
          const updatedTags = tags.filter(t => t.kanban !== 1)
          updatedTags.push(newTag)
          setTags(updatedTags)
          // Reflejar al instante en el padre
          onTicketPatched?.({ tags: updatedTags })
        }

        toast.success('Etapa Kanban actualizada')
      } else {
        setSelectedKanbanTag('')
        // Remover tag kanban del estado local
        const updatedTags = tags.filter(t => t.kanban !== 1)
        setTags(updatedTags)
        onTicketPatched?.({ tags: updatedTags })
      }
    } catch (error) {
      console.error('Error updating kanban tag:', error)
      toast.error('Error al actualizar etapa Kanban')
    }
  }

  const handleToggleFollowup = async () => {
    if (!ticket?.id) return
    setTogglingFollowup(true)
    try {
      const response = await api.put(`/tickets/${ticket.id}/followup`)
      setFollowupEnabled(response.data.followupEnabled)
      onTicketPatched?.({ followupEnabled: response.data.followupEnabled })
      toast.success(response.data.followupEnabled ? 'Seguimiento activado' : 'Seguimiento desactivado')
    } catch (error) {
      console.error('Error toggling followup:', error)
      toast.error('Error al cambiar configuración de seguimiento')
    } finally {
      setTogglingFollowup(false)
    }
  }

  const handleDisableBot = async () => {
    if (!ticket?.id) return
    setTogglingBot(true)
    try {
      await api.put(`/tickets/${ticket.id}`, { isBot: false })
      toast.success('Bot desactivado')
    } catch (error) {
      console.error('Error disabling bot:', error)
      toast.error('Error al desactivar el bot')
    } finally {
      setTogglingBot(false)
    }
  }

  // Buscar contactos para transferir ticket
  const handleSearchContact = async (query: string) => {
    setSearchContact(query)
    if (query.length < 3) {
      setSearchResults([])
      return
    }
    setSearchingContacts(true)
    try {
      const response = await api.get('/contacts', {
        params: {
          searchParam: query,
          rowsPerPage: 10,
          pageNumber: 1,
          // Excluir el contacto actual del ticket - filtrar en cliente
        }
      })
      const contacts = response.data.contacts || []
      // Filtrar cliente para excluir el contacto actual
      const filtered = contacts.filter((c: Contact) => c.id !== ticket?.contactId)
      setSearchResults(filtered)
    } catch (error) {
      console.error('Error searching contacts:', error)
      setSearchResults([])
    } finally {
      setSearchingContacts(false)
    }
  }

  // Transferir ticket a otro contacto
  const handleTransferTicket = async () => {
    if (!ticket?.id || !selectedContact) return
    setTransferring(true)
    try {
      await api.put(`/tickets/${ticket.id}`, { newContactId: selectedContact.id })
      toast.success(`Ticket transferido a ${selectedContact.name}`)
      setShowTransferModal(false)
      setSelectedContact(null)
      setSearchContact('')
      // Notificar al padre para actualizar
      if (onClose) onClose()
    } catch (error: any) {
      console.error('Error transferring ticket:', error)
      toast.error(error.response?.data?.message || 'Error al transferir el ticket')
    } finally {
      setTransferring(false)
    }
  }

  const handleSaveContact = async (): Promise<boolean> => {
    if (!contact?.id) return false
    setSaving(true)
    try {
      const response = await api.put(`/contacts/${contact.id}`, editedContact)
      // Reflejar al instante en el padre (header de la conversación + lista).
      // Preferimos el contacto devuelto por el backend; si no, el editado local.
      const updated = response?.data?.contact || response?.data || editedContact
      onContactPatched?.({
        name: updated.name ?? editedContact.name,
        email: updated.email ?? editedContact.email,
        number: updated.number ?? editedContact.number,
      })
      setIsEditing(false)
      return true
    } catch (error) {
      toast.error(translateBackendError(error, 'Error al guardar el contacto'))
      console.error('Error saving contact:', error)
      return false
    } finally {
      setSaving(false)
    }
  }

  // ─── Modo edición global + cierre con cambios sin guardar ──────────────────
  // "Dirty" = en modo edición y con nombre/email modificados respecto al original.
  // (Cola/Kanban/Etiquetas/Seguimiento se auto-guardan al instante, así que nunca
  // quedan "pendientes"; solo nombre/email usan el botón Guardar.)
  const isDirty =
    isEditing &&
    !!contact &&
    (((editedContact.name ?? '') !== (contact.name ?? '')) ||
      ((editedContact.email ?? '') !== (contact.email ?? '')))

  const handleCancelEdit = () => {
    if (contact) {
      setEditedContact({
        name: contact.name,
        email: contact.email,
        number: contact.number,
      })
    }
    setIsEditing(false)
  }

  const handleRequestClose = () => {
    if (isDirty) {
      setShowCloseConfirm(true)
    } else {
      onClose()
    }
  }

  const handleDiscardAndClose = () => {
    handleCancelEdit()
    setShowCloseConfirm(false)
    onClose()
  }

  const handleSaveAndClose = async () => {
    const ok = await handleSaveContact()
    if (ok) {
      setShowCloseConfirm(false)
      onClose()
    }
  }

  const handleOpenAppointmentModal = async () => {
    if (!contact?.id) return

    setCheckingAppointment(true)
    try {
      // Buscar cita activa del contacto (1 sola llamada liviana)
      const response = await api.get('/appointments/appointments', {
        params: {
          contactId: contact.id,
          status: 'pending,confirmed,scheduled',
          limit: 1
        }
      })

      const appointments = response.data.appointments || []
      if (appointments.length > 0) {
        setExistingAppointment(appointments[0])
      } else {
        setExistingAppointment(null)
      }
      setOpenAppointmentModal(true)
    } catch (error) {
      console.error('Error checking appointments:', error)
      // Abrir igual en modo crear si hay error
      setExistingAppointment(null)
      setOpenAppointmentModal(true)
    } finally {
      setCheckingAppointment(false)
    }
  }

  const handleConfirmAppointment = async () => {
    if (!existingAppointment) return

    setConfirmingAppointment(true)
    try {
      await api.post(`/appointments/appointments/${existingAppointment.id}/confirm`)
      toast.success('Cita confirmada. Se programará el recordatorio.')
      // Refresh the appointment data
      const response = await api.get('/appointments/appointments', {
        params: {
          contactId: contact?.id,
          status: 'pending,confirmed,scheduled',
          limit: 1
        }
      })
      const appointments = response.data.appointments || []
      if (appointments.length > 0) {
        setExistingAppointment(appointments[0])
      }
    } catch (error) {
      console.error('Error confirming appointment:', error)
      toast.error('Error al confirmar la cita')
    } finally {
      setConfirmingAppointment(false)
    }
  }

  const formatPhoneNumber = (number: string) => {
    if (!number) return ''
    // Formato plano internacional: +593987009472 (sin espacios ni paréntesis).
    // El formato anterior asumía 10 dígitos nacionales (US) y partía mal números
    // como Ecuador (+593 + 9 dígitos) mostrando "+59 (398) 700-9472".
    const cleaned = number.replace(/\D/g, '')
    return cleaned ? `+${cleaned}` : number
  }

  if (!contact && !loading) {
    return null
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleRequestClose}
      slotProps={{
        content: {
          sx: {
            width: 360,
            bgcolor: 'background.surface',
          },
        },
      }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography level="title-lg">Datos del contacto</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {contact && !loading && (
              isEditing ? (
                <>
                  <Button
                    size="sm"
                    variant="solid"
                    color="primary"
                    onClick={handleSaveContact}
                    loading={saving}
                  >
                    Guardar
                  </Button>
                  <Button
                    size="sm"
                    variant="plain"
                    color="neutral"
                    onClick={handleCancelEdit}
                  >
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outlined"
                  startDecorator={<EditIcon />}
                  onClick={() => setIsEditing(true)}
                >
                  Editar
                </Button>
              )
            )}
            {ticket && (
              <>
                <IconButton
                  variant="plain"
                  onClick={(e) => setOpenTransferMenu(e.currentTarget)}
                  aria-label="Más opciones"
                >
                  <MoreVertIcon />
                </IconButton>
                <Menu
                  open={Boolean(openTransferMenu)}
                  onClose={() => setOpenTransferMenu(null)}
                  anchorEl={openTransferMenu}
                  placement="bottom-end"
                >
                  <MenuItem onClick={() => {
                    setOpenTransferMenu(null)
                    setShowTransferModal(true)
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TransferIcon fontSize="small" />
                      <Typography level="body-sm">Transferir ticket</Typography>
                    </Box>
                  </MenuItem>
                </Menu>
              </>
            )}
            <IconButton variant="plain" onClick={handleRequestClose} aria-label="Cerrar">
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {loading ? (
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Skeleton variant="circular" width={120} height={120} />
              </Box>
              <Skeleton variant="text" width="60%" sx={{ mx: 'auto' }} />
              <Skeleton variant="text" width="40%" sx={{ mx: 'auto' }} />
              <Divider />
              <Skeleton variant="rectangular" height={100} />
              <Skeleton variant="rectangular" height={100} />
            </Stack>
          ) : (
            <Stack spacing={2}>
              {/* Profile Section */}
              <Card variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={2} alignItems="center">
                  <Avatar
                    src={contact?.urlPicture || contact?.profilePicUrl}
                    sx={{ width: 120, height: 120 }}
                  >
                    {contact?.name?.charAt(0)}
                  </Avatar>

                  {isEditing ? (
                    <FormControl sx={{ width: '100%' }}>
                      <FormLabel>Nombre</FormLabel>
                      <Input
                        value={editedContact.name || ''}
                        onChange={(e) =>
                          setEditedContact({ ...editedContact, name: e.target.value })
                        }
                      />
                    </FormControl>
                  ) : (
                    <Typography level="title-lg" textAlign="center">
                      {contact?.name}
                    </Typography>
                  )}

                  <Stack direction="row" spacing={1} alignItems="center">
                    <PhoneIcon sx={{ fontSize: 18, color: 'text.tertiary' }} />
                    <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                      {formatPhoneNumber(contact?.number || '')}
                    </Typography>
                  </Stack>

                  {isEditing ? (
                    <FormControl sx={{ width: '100%' }}>
                      <FormLabel>Email</FormLabel>
                      <Input
                        type="email"
                        value={editedContact.email || ''}
                        onChange={(e) =>
                          setEditedContact({ ...editedContact, email: e.target.value })
                        }
                      />
                    </FormControl>
                  ) : contact?.email ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <EmailIcon sx={{ fontSize: 18, color: 'text.tertiary' }} />
                      <Typography level="body-sm" sx={{ color: 'primary.main' }}>
                        {contact.email}
                      </Typography>
                    </Stack>
                  ) : null}

                  <Stack direction="row" spacing={1}>
                    <Tooltip title={existingAppointment ? "Reagendar cita" : "Agendar cita"} placement="top">
                      <IconButton
                        size="sm"
                        variant="outlined"
                        color="primary"
                        onClick={handleOpenAppointmentModal}
                        loading={checkingAppointment}
                        aria-label={existingAppointment ? 'Reagendar cita' : 'Agendar cita'}
                      >
                        <CalendarIcon />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
              </Card>

              {/* Appointment Section */}
              {existingAppointment && (
                <Card variant="outlined" sx={{ p: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                    <CalendarIcon sx={{ fontSize: 18 }} />
                    <Typography level="title-sm">Cita Programada</Typography>
                  </Stack>

                  {/* Appointment Info */}
                  <Stack spacing={1}>
                    <Box>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Servicio</Typography>
                      <Typography level="body-sm">{existingAppointment.service?.name || existingAppointment.title}</Typography>
                    </Box>
                    <Box>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Fecha y Hora</Typography>
                      <Typography level="body-sm">
                        {new Date(existingAppointment.startTime).toLocaleDateString('es-ES', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })} - {new Date(existingAppointment.startTime).toLocaleTimeString('es-ES', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </Typography>
                    </Box>

                    {/* Status Chips */}
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip
                        size="sm"
                        color={existingAppointment.status === 'confirmed' ? 'success' : 'warning'}
                        startDecorator={existingAppointment.status === 'confirmed' ? <CheckCircle /> : <Schedule />}
                      >
                        {existingAppointment.status === 'confirmed' ? 'Confirmada' :
                          existingAppointment.status === 'scheduled' ? 'Programada' : 'Pendiente'}
                      </Chip>
                      {existingAppointment.confirmationSent && (
                        <Chip size="sm" color="primary" variant="soft">
                          Confirmación Enviada
                        </Chip>
                      )}
                      {existingAppointment.reminderSent && (
                        <Chip size="sm" color="success" variant="soft">
                          Recordatorio Enviado
                        </Chip>
                      )}
                    </Stack>

                    {/* Action Buttons */}
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      {existingAppointment.status !== 'confirmed' && (
                        <Button
                          size="sm"
                          variant="solid"
                          color="success"
                          startDecorator={<CheckCircle />}
                          onClick={handleConfirmAppointment}
                          loading={confirmingAppointment}
                        >
                          Confirmar Cita
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outlined"
                        color="primary"
                        startDecorator={<CalendarIcon />}
                        onClick={handleOpenAppointmentModal}
                      >
                        {existingAppointment.status === 'confirmed' ? 'Ver Detalles' : 'Reagendar'}
                      </Button>
                    </Stack>
                  </Stack>
                </Card>
              )}

              {/* Settings Section */}
              <Card variant="outlined" sx={{ p: 2 }}>
                <Typography level="title-sm" sx={{ mb: 2 }}>
                  Configuraciones
                </Typography>
                <Stack spacing={1}>
                  {/* "Aceptar mensajes de audio" oculto por requerimiento: siempre habilitado. */}
                  {ticket && (
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Typography level="body-sm">
                        {followupEnabled ? 'Mensajes de seguimiento' : 'Mensajes de seguimiento'}
                      </Typography>
                      <Switch
                        checked={followupEnabled}
                        onChange={handleToggleFollowup}
                        disabled={!isEditing || togglingFollowup}
                        size="sm"
                        color={followupEnabled ? 'success' : 'danger'}
                      />
                    </Box>
                  )}
                  {ticket && ticket.isBot && (
                    <Button
                      variant="outlined"
                      color="warning"
                      size="sm"
                      onClick={handleDisableBot}
                      disabled={togglingBot}
                      startDecorator={<BlockIcon />}
                      sx={{ mt: 2 }}
                    >
                      {togglingBot ? 'Desactivando...' : 'Desactivar Bot'}
                    </Button>
                  )}
                </Stack>
              </Card>

              {/* Queue Selector */}
              <Card variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <TransferIcon sx={{ fontSize: 18 }} />
                  <Typography level="title-sm">Cola</Typography>
                </Stack>
                <FormControl size="sm">
                  <Select
                    value={selectedQueueId}
                    onChange={handleChangeQueue}
                    placeholder="Seleccionar cola"
                    disabled={!isEditing || updatingQueue}
                  >
                    <Option value="">Sin cola</Option>
                    {availableQueues.map(queue => (
                      <Option key={queue.id} value={String(queue.id)}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {queue.color && (
                            <Chip
                              size="sm"
                              sx={{
                                bgcolor: queue.color,
                                color: 'white',
                                minWidth: 14,
                                minHeight: 14,
                                p: 0,
                              }}
                            >
                              {' '}
                            </Chip>
                          )}
                          {queue.name}
                        </Box>
                      </Option>
                    ))}
                  </Select>
                </FormControl>
              </Card>

              {/* Kanban Stage Selector */}
              <Card variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <KanbanIcon sx={{ fontSize: 18 }} />
                  <Typography level="title-sm">Etapa Kanban</Typography>
                </Stack>
                <FormControl size="sm">
                  <Select
                    value={selectedKanbanTag}
                    onChange={handleKanbanTagChange}
                    placeholder="Seleccionar etapa"
                    disabled={!isEditing}
                    renderValue={(option) => {
                      if (!option) return null
                      const selectedTag = kanbanTags.find(t => String(t.id) === option.value)
                      if (!selectedTag) return null
                      return (
                        <Chip
                          size="sm"
                          sx={{
                            bgcolor: selectedTag.color,
                            color: 'white',
                            fontWeight: 'bold',
                          }}
                        >
                          {selectedTag.name}
                        </Chip>
                      )
                    }}
                  >
                    <Option value="">Sin etapa</Option>
                    {kanbanTags.map((tag) => (
                      <Option key={tag.id} value={String(tag.id)}>
                        <Chip
                          size="sm"
                          sx={{
                            bgcolor: tag.color,
                            color: 'white',
                            mr: 1,
                          }}
                        >
                          {tag.name}
                        </Chip>
                      </Option>
                    ))}
                  </Select>
                </FormControl>
              </Card>

              {/* Tags Section */}
              <Card variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <TagIcon sx={{ fontSize: 18 }} />
                  <Typography level="title-sm">Etiquetas</Typography>
                </Stack>
                {contact && (
                  <TagsContainer
                    contact={contact}
                    disabled={!isEditing}
                    onTagsChange={(newTags) => onContactPatched?.({ tags: newTags })}
                  />
                )}
              </Card>

              {/* Notes Section */}
              <Card variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <NotesIcon sx={{ fontSize: 18 }} />
                  <Typography level="title-sm">Notas</Typography>
                </Stack>
                <Textarea
                  placeholder="Agregar notas sobre este contacto..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!isEditing}
                  minRows={3}
                  maxRows={6}
                />
              </Card>

              {/* Extra Info Section */}
              {contact?.extraInfo && contact.extraInfo.length > 0 && (
                <Card variant="outlined" sx={{ p: 2 }}>
                  <Typography level="title-sm" sx={{ mb: 2 }}>
                    Información adicional
                  </Typography>
                  <Stack spacing={1}>
                    {contact.extraInfo.map((info) => (
                      <Box key={info.id}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {info.name}
                        </Typography>
                        <Typography level="body-sm">{info.value}</Typography>
                      </Box>
                    ))}
                  </Stack>
                </Card>
              )}
            </Stack>
          )}
        </Box>
      </Box>

      {/* Appointment Modal */}
      <CreateAppointmentModal
        open={openAppointmentModal}
        onClose={() => {
          setOpenAppointmentModal(false)
          setExistingAppointment(null)
        }}
        onSuccess={() => {
          // Refrescar la cita del contacto al instante tras crear/reprogramar
          setOpenAppointmentModal(false)
          void refreshExistingAppointment()
        }}
        preselectedContact={contact}
        lockContact={true}
        ticketId={ticket?.id}
        existingAppointment={existingAppointment}
        mode={existingAppointment ? 'reschedule' : 'create'}
      />

      {/* Transfer Ticket Modal */}
      <Modal
        open={showTransferModal}
        onClose={() => {
          setShowTransferModal(false)
          setSelectedContact(null)
          setSearchContact('')
          setSearchResults([])
        }}
      >
        <ModalDialog
          sx={{
            minWidth: 400,
            maxWidth: 500,
          }}
        >
          <Typography level="title-lg" sx={{ mb: 2 }}>
            Transferir Ticket
          </Typography>
          <Typography level="body-sm" sx={{ mb: 3, color: 'text.secondary' }}>
            Selecciona el nuevo contacto para este ticket. El ticket se asociará al contacto seleccionado.
          </Typography>

          <FormControl sx={{ mb: 3 }}>
            <FormLabel>Buscar contacto</FormLabel>
            <Autocomplete
              placeholder="Escribe el nombre o número..."
              value={selectedContact}
              onChange={(_event, newValue) => {
                setSelectedContact(newValue)
              }}
              inputValue={searchContact}
              onInputChange={(_event, newInputValue) => {
                handleSearchContact(newInputValue)
              }}
              loading={searchingContacts}
              options={searchResults}
              getOptionLabel={(option) => `${option.name} - ${option.number}`}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              filterOptions={(options) => options}
              renderOption={(props, option) => (
                <Box component="li" {...props}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar sx={{ width: 32, height: 32 }}>
                      {option.name?.charAt(0)}
                    </Avatar>
                    <Box>
                      <Typography level="body-sm">{option.name}</Typography>
                      <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                        {option.number}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              )}
            />
          </FormControl>

          {selectedContact && (
            <Card variant="outlined" sx={{ mb: 3, p: 2, bgcolor: 'background.level1' }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar src={selectedContact.urlPicture || selectedContact.profilePicUrl}>
                  {selectedContact.name?.charAt(0)}
                </Avatar>
                <Box>
                  <Typography level="body-sm" fontWeight="bold">
                    {selectedContact.name}
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                    {selectedContact.number}
                    {selectedContact.email && ` • ${selectedContact.email}`}
                  </Typography>
                </Box>
              </Stack>
            </Card>
          )}

          <Stack direction="row" spacing={2} justifyContent="flex-end">
            <Button
              variant="outlined"
              color="neutral"
              onClick={() => {
                setShowTransferModal(false)
                setSelectedContact(null)
                setSearchContact('')
                setSearchResults([])
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="solid"
              color="primary"
              onClick={handleTransferTicket}
              disabled={!selectedContact || transferring}
              loading={transferring}
            >
              Transferir
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Confirmación: intento de cerrar con cambios sin guardar */}
      <Modal open={showCloseConfirm} onClose={() => setShowCloseConfirm(false)}>
        <ModalDialog role="alertdialog" sx={{ maxWidth: 420 }}>
          <Typography level="title-lg">Cambios sin guardar</Typography>
          <Typography level="body-sm" sx={{ mt: 1, mb: 2, color: 'text.secondary' }}>
            Hiciste cambios en el contacto que aún no se han guardado. ¿Deseas guardarlos antes de cerrar?
          </Typography>
          <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
            <Button variant="plain" color="neutral" onClick={() => setShowCloseConfirm(false)}>
              Seguir editando
            </Button>
            <Button variant="outlined" color="danger" onClick={handleDiscardAndClose}>
              Cerrar sin guardar
            </Button>
            <Button variant="solid" color="primary" loading={saving} onClick={handleSaveAndClose}>
              Guardar y cerrar
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>
    </Drawer>
  )
}
