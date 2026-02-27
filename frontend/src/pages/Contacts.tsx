import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Select as _Select,
  Option as _Option,
  Avatar,
  Textarea as _Textarea,
  Tooltip,
  CircularProgress,
} from '@mui/joy'
import {
  Contacts as ContactsIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  WhatsApp as WhatsAppIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  Block as BlockIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
} from '@mui/icons-material'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'

interface Contact {
  id: number
  name: string
  number: string
  email?: string
  profilePicUrl?: string
  companyId: number
  extraInfo?: any[]
  tags?: any[]
  wallets?: any[]
  isGroup?: boolean
  acceptAudioMessage?: boolean
  disableBot?: boolean
  createdAt: string
}

export default function Contacts() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [openModal, setOpenModal] = useState(false)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [openingChatId, setOpeningChatId] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    number: '',
    email: '',
  })

  useEffect(() => {
    fetchContacts()
  }, [])

  const fetchContacts = async () => {
    try {
      setLoading(true)
      const response = await api.get('/contacts')
      console.log('Contacts API response:', response.data)

      // Backend returns { contacts, count, hasMore }
      const contactsData = response.data.contacts || response.data || []
      setContacts(contactsData)

      if (contactsData.length === 0) {
        console.log('No contacts found in database')
      }
    } catch (error) {
      console.error('Error fetching contacts:', error)
      // Show empty array on error to see real state
      setContacts([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      await api.post('/contacts', formData)
      fetchContacts()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error creating contact:', error)
    }
  }

  const handleUpdate = async () => {
    if (!selectedContact) return
    try {
      await api.put(`/contacts/${selectedContact.id}`, formData)
      fetchContacts()
      setOpenModal(false)
      resetForm()
    } catch (error) {
      console.error('Error updating contact:', error)
    }
  }

  const handleDelete = async (contactId: number) => {
    if (confirm('¿Estás seguro de eliminar este contacto?')) {
      try {
        await api.delete(`/contacts/${contactId}`)
        fetchContacts()
      } catch (error) {
        console.error('Error deleting contact:', error)
      }
    }
  }

  const handleBlockUnblock = async (contactId: number) => {
    try {
      await api.put(`/contacts/block/${contactId}`)
      fetchContacts()
    } catch (error) {
      console.error('Error blocking/unblocking contact:', error)
    }
  }

  const _handleToggleBot = async (contactId: number) => {
    try {
      await api.put(`/contacts/toggleDisableBot/${contactId}`)
      fetchContacts()
    } catch (error) {
      console.error('Error toggling bot:', error)
    }
  }

  const _handleToggleAudio = async (contactId: number) => {
    try {
      await api.put(`/contacts/toggleAcceptAudio/${contactId}`)
      fetchContacts()
    } catch (error) {
      console.error('Error toggling audio:', error)
    }
  }

  const handleImportContacts = async () => {
    // Trigger file input or show import modal
    console.log('Import contacts')
  }

  const handleExportContacts = async () => {
    try {
      await api.post('/contacts/export/excel')
      console.log('Export initiated')
    } catch (error) {
      console.error('Error exporting contacts:', error)
    }
  }

  const handleOpenChat = async (contact: Contact) => {
    try {
      setOpeningChatId(contact.id)
      // Intentar crear ticket nuevo
      await api.post('/tickets', {
        contactId: contact.id,
        status: 'open',
        userId: user?.id,
      })
    } catch (error: any) {
      // Si ya tiene ticket abierto u otro error, no importa
      console.error('Error opening chat:', error)
    } finally {
      setOpeningChatId(null)
      // Siempre navegar a tickets con el contactId para auto-seleccionar el ticket
      navigate('/tickets', { state: { contactId: contact.id } })
    }
  }

  const openEditModal = (contact: Contact) => {
    setSelectedContact(contact)
    setFormData({
      name: contact.name,
      number: contact.number,
      email: contact.email || '',
    })
    setOpenModal(true)
  }

  const openCreateModal = () => {
    setSelectedContact(null)
    resetForm()
    setOpenModal(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      number: '',
      email: '',
    })
  }

  const filteredContacts = contacts.filter((contact) =>
    contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.number.includes(searchTerm) ||
    (contact.email && contact.email.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const stats = {
    total: contacts.length,
    individuals: contacts.filter((c) => !c.isGroup).length,
    groups: contacts.filter((c) => c.isGroup).length,
    botDisabled: contacts.filter((c) => c.disableBot).length,
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <ContactsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Contactos</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Gestión de contactos y clientes
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button
              startDecorator={<UploadIcon />}
              variant="outlined"
              color="neutral"
              onClick={handleImportContacts}
            >
              Importar
            </Button>
            <Button
              startDecorator={<DownloadIcon />}
              variant="outlined"
              color="neutral"
              onClick={handleExportContacts}
            >
              Exportar
            </Button>
            <IconButton variant="outlined" color="neutral" onClick={fetchContacts}>
              <RefreshIcon />
            </IconButton>
            <Button startDecorator={<AddIcon />} color="primary" onClick={openCreateModal}>
              Nuevo Contacto
            </Button>
          </Stack>
        </Stack>

        {/* Stats */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Total Contactos
                </Typography>
                <Typography level="h2">{stats.total}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Individuales
                </Typography>
                <Typography level="h2" sx={{ color: 'primary.main' }}>
                  {stats.individuals}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Grupos
                </Typography>
                <Typography level="h2" sx={{ color: 'success.main' }}>
                  {stats.groups}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>
                  Bot Deshabilitado
                </Typography>
                <Typography level="h2">{stats.botDisabled}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Search */}
        <Card>
          <CardContent>
            <Input
              placeholder="Buscar contactos por nombre, teléfono o email..."
              startDecorator={<SearchIcon />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </CardContent>
        </Card>

        {/* Contacts Table */}
        <Card>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 60 }}></th>
                  <th style={{ width: 200 }}>Nombre</th>
                  <th style={{ width: 150 }}>Teléfono</th>
                  <th style={{ width: 200 }}>Email</th>
                  <th style={{ width: 100 }}>Tipo</th>
                  <th>Tags</th>
                  <th style={{ width: 100 }}>Audio</th>
                  <th style={{ width: 80 }}>Bot</th>
                  <th style={{ width: 180 }}>Fecha Creación</th>
                  <th style={{ width: 180 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>Cargando contactos...</Typography>
                    </td>
                  </tr>
                ) : filteredContacts.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>No se encontraron contactos</Typography>
                    </td>
                  </tr>
                ) : (
                  filteredContacts.map((contact) => (
                    <tr key={contact.id}>
                      <td>
                        <Avatar size="sm" src={contact.profilePicUrl}>
                          {contact.name.charAt(0)}
                        </Avatar>
                      </td>
                      <td>
                        <Typography level="body-sm" fontWeight="bold">
                          {contact.name}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-xs">{contact.number}</Typography>
                      </td>
                      <td>
                        <Typography level="body-xs">{contact.email || '-'}</Typography>
                      </td>
                      <td>
                        <Chip size="sm" color={contact.isGroup ? 'success' : 'primary'}>
                          {contact.isGroup ? 'Grupo' : 'Individual'}
                        </Chip>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          {contact.tags?.map((tag: any, index) => (
                            <Chip key={index} size="sm" variant="soft">
                              {typeof tag === 'string' ? tag : tag.name}
                            </Chip>
                          ))}
                        </Stack>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={contact.acceptAudioMessage ? 'success' : 'neutral'}
                          variant="soft"
                        >
                          {contact.acceptAudioMessage ? 'Sí' : 'No'}
                        </Chip>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={contact.disableBot ? 'danger' : 'success'}
                          variant="soft"
                        >
                          {contact.disableBot ? 'Off' : 'On'}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-xs">
                          {contact.createdAt && !isNaN(new Date(contact.createdAt).getTime())
                            ? new Date(contact.createdAt).toLocaleDateString('es-ES')
                            : '-'}
                        </Typography>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          <Tooltip title="Abrir conversacion">
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="success"
                              onClick={() => handleOpenChat(contact)}
                              disabled={openingChatId === contact.id}
                            >
                              {openingChatId === contact.id
                                ? <CircularProgress size="sm" />
                                : <WhatsAppIcon />}
                            </IconButton>
                          </Tooltip>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="primary"
                            onClick={() => openEditModal(contact)}
                            title="Editar"
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="warning"
                            onClick={() => handleBlockUnblock(contact.id)}
                            title="Bloquear"
                          >
                            <BlockIcon />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={() => handleDelete(contact.id)}
                            title="Eliminar"
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

        {/* Modal Create/Edit */}
        <Modal open={openModal} onClose={() => setOpenModal(false)}>
          <ModalDialog sx={{ minWidth: 500 }}>
            <ModalClose />
            <Typography level="h4" sx={{ mb: 2 }}>
              {selectedContact ? 'Editar Contacto' : 'Nuevo Contacto'}
            </Typography>
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>Nombre</FormLabel>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nombre del contacto"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Teléfono</FormLabel>
                <Input
                  value={formData.number}
                  onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                  placeholder="+34 XXX XXX XXX"
                  startDecorator={<PhoneIcon />}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Email (Opcional)</FormLabel>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@ejemplo.com"
                  startDecorator={<EmailIcon />}
                />
              </FormControl>
              <Box
                sx={{
                  display: 'flex',
                  gap: 1,
                  alignItems: 'center',
                  p: 2,
                  bgcolor: 'background.level1',
                  borderRadius: 'sm',
                }}
              >
                <Typography level="body-sm" sx={{ flex: 1 }}>
                  <strong>Vista Previa:</strong>
                  <br />
                  <strong>{formData.name || 'Nombre del contacto'}</strong>
                  <br />
                  {formData.number || 'Teléfono'}
                  {formData.email && (
                    <>
                      <br />
                      {formData.email}
                    </>
                  )}
                </Typography>
              </Box>
              <Button color="primary" onClick={selectedContact ? handleUpdate : handleCreate}>
                {selectedContact ? 'Actualizar' : 'Crear'} Contacto
              </Button>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
