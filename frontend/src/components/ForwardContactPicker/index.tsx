import { useState, useEffect } from 'react'
import {
  Modal,
  Typography,
  Stack,
  Button,
  Input,
  List,
  ListItem,
  ListItemButton,
  ListItemDecorator,
  Avatar,
  Checkbox,
  Divider,
  Box,
  CircularProgress,
  IconButton,
} from '@mui/joy'
import {
  Search as SearchIcon,
  Person as PersonIcon,
  Send as SendIcon,
  Close as CloseIcon,
} from '@mui/icons-material'
import api from '../../services/api'

interface Contact {
  id: number
  name: string
  number: string
  profilePicUrl?: string
  urlPicture?: string
}

interface ForwardContactPickerProps {
  open: boolean
  onClose: () => void
  onForward: (contactIds: number[]) => void
  loading: boolean
}

export default function ForwardContactPicker({
  open,
  onClose,
  onForward,
  loading,
}: ForwardContactPickerProps) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedContactIds, setSelectedContactIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!open) return
    setLoadingContacts(true)
    setSelectedContactIds(new Set())
    setSearchTerm('')
    api.get('/contacts')
      .then(({ data }) => {
        const contactsData = data.contacts || data || []
        setContacts(Array.isArray(contactsData) ? contactsData : [])
      })
      .catch(() => setContacts([]))
      .finally(() => setLoadingContacts(false))
  }, [open])

  const filteredContacts = contacts.filter(contact => {
    const term = searchTerm.toLowerCase()
    return (
      contact.name?.toLowerCase().includes(term) ||
      contact.number?.includes(term)
    )
  })

  const handleToggleContact = (contactId: number) => {
    setSelectedContactIds(prev => {
      const next = new Set(prev)
      next.has(contactId) ? next.delete(contactId) : next.add(contactId)
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedContactIds.size === filteredContacts.length) {
      setSelectedContactIds(new Set())
    } else {
      setSelectedContactIds(new Set(filteredContacts.map(c => c.id)))
    }
  }

  const handleSubmit = () => {
    if (selectedContactIds.size === 0) return
    onForward(Array.from(selectedContactIds))
  }

  const handleClose = () => {
    setSearchTerm('')
    setSelectedContactIds(new Set())
    setContacts([])
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose}>
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 480,
          maxHeight: '85vh',
          bgcolor: 'background.body',
          borderRadius: 'xl',
          boxShadow: 24,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography level="title-md" fontWeight={700}>
            Reenviar mensaje
          </Typography>
          <IconButton size="sm" variant="plain" onClick={handleClose}>
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Contenido */}
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 1.5, p: 2 }}>
          {/* Buscador */}
          <Input
            placeholder="Buscar contacto..."
            startDecorator={<SearchIcon sx={{ fontSize: 20 }} />}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
            size="sm"
          />

          {/* Lista */}
          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              borderRadius: 'sm',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            {loadingContacts ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : filteredContacts.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <PersonIcon sx={{ fontSize: 40, color: 'text.tertiary', mb: 1 }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  {searchTerm ? 'No se encontraron contactos' : 'No hay contactos'}
                </Typography>
              </Box>
            ) : (
              <List size="sm" sx={{ p: 0 }}>
                {/* Header con contador y seleccionar todo */}
                <ListItem
                  endAction={
                    <Button size="sm" variant="plain" onClick={handleSelectAll} sx={{ fontSize: '0.7rem' }}>
                      {selectedContactIds.size === filteredContacts.length && filteredContacts.length > 0
                        ? 'Deseleccionar'
                        : 'Todos'}
                    </Button>
                  }
                  sx={{ minHeight: 36 }}
                >
                  <Typography level="body-xs" sx={{ color: 'text.tertiary', fontWeight: 600 }}>
                    {filteredContacts.length} contacto{filteredContacts.length !== 1 ? 's' : ''}
                  </Typography>
                </ListItem>
                <Divider />

                {filteredContacts.map(contact => (
                  <ListItem
                    key={contact.id}
                    endAction={
                      <Checkbox
                        checked={selectedContactIds.has(contact.id)}
                        onChange={() => handleToggleContact(contact.id)}
                        size="sm"
                      />
                    }
                    sx={{ py: 0 }}
                  >
                    <ListItemButton onClick={() => handleToggleContact(contact.id)} sx={{ py: 0.75 }}>
                      <ListItemDecorator>
                        <Avatar
                          src={contact.profilePicUrl || contact.urlPicture}
                          size="sm"
                          sx={{ width: 36, height: 36 }}
                        >
                          {contact.name?.charAt(0)?.toUpperCase() || '?'}
                        </Avatar>
                      </ListItemDecorator>
                      <Stack spacing={0}>
                        <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                          {contact.name}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {contact.number}
                        </Typography>
                      </Stack>
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>

          {/* Resumen de selección */}
          {selectedContactIds.size > 0 && (
            <Typography level="body-sm" sx={{ color: '#52b788', fontWeight: 600 }}>
              {selectedContactIds.size} contacto{selectedContactIds.size !== 1 ? 's' : ''} seleccionad{selectedContactIds.size !== 1 ? 'os' : 'o'}
            </Typography>
          )}
        </Box>

        {/* Footer */}
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            gap: 1,
            justifyContent: 'flex-end',
          }}
        >
          <Button variant="soft" color="neutral" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="solid"
            onClick={handleSubmit}
            loading={loading}
            disabled={selectedContactIds.size === 0}
            startDecorator={loading ? undefined : <SendIcon sx={{ fontSize: 16 }} />}
            sx={{
              bgcolor: '#52b788',
              '&:hover': { bgcolor: '#40916c' },
            }}
          >
            Reenviar
          </Button>
        </Box>
      </Box>
    </Modal>
  )
}
