import { useState, useEffect, useRef } from 'react'
import {
  Container,
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  Sheet,
  Table,
  Input,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  IconButton,
  Tooltip,
  CircularProgress,
  Switch,
} from '@mui/joy'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  People as PeopleIcon,
  Upload as UploadIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Email as EmailIcon,
  List as ListIcon,
} from '@mui/icons-material'
import * as emailService from '../services/emailCampaignService'

// ---- Type definitions ----

interface ContactList {
  id: number
  name: string
  fromEmail: string
  fromName: string
  acelleListUid?: string
  contactsCount?: number
  createdAt?: string
}

interface Contact {
  id: number
  name: string
  email: string
  number?: string
  isWhatsappValid?: boolean
  contactListId: number
}

interface DeleteTarget {
  type: 'list' | 'contact'
  id: number
}

interface UploadResult {
  imported: number
  errors: string[]
}

// ---- Component ----

export default function EmailMarketingTemplates() {
  // List state
  const [contactLists, setContactLists] = useState<ContactList[]>([])
  const [selectedList, setSelectedList] = useState<ContactList | null>(null)

  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>([])
  const [pageNumber, setPageNumber] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  // UI state
  const [loading, setLoading] = useState(false)
  const [searchParam, setSearchParam] = useState('')

  // Modal state
  const [openCreateListModal, setOpenCreateListModal] = useState(false)
  const [openCreateContactModal, setOpenCreateContactModal] = useState(false)
  const [openUploadModal, setOpenUploadModal] = useState(false)
  const [openDeleteModal, setOpenDeleteModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  // Create list form
  const [listName, setListName] = useState('')
  const [listFromEmail, setListFromEmail] = useState('noreply@ariasofts.com')
  const [listFromName, setListFromName] = useState('Ariasofts')
  const [listFormLoading, setListFormLoading] = useState(false)

  // Create contact form
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [contactFormLoading, setContactFormLoading] = useState(false)

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Delete state
  const [deleteLoading, setDeleteLoading] = useState(false)

  // ---- Effects ----

  useEffect(() => {
    fetchContactLists()
  }, [])

  useEffect(() => {
    if (selectedList) {
      setContacts([])
      setPageNumber(1)
      setHasMore(false)
      fetchContacts(selectedList.id, 1, true)
    }
  }, [selectedList])

  // ---- Data fetching ----

  const fetchContactLists = async () => {
    setLoading(true)
    try {
      const data = await emailService.listContactLists({ searchParam })
      // API may return { records: [...] } or an array directly
      const records = Array.isArray(data) ? data : data?.records ?? data?.contactLists ?? []
      setContactLists(records)
    } catch (err) {
      console.error('Error fetching contact lists:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchContacts = async (listId: number, page: number, replace = false) => {
    setLoading(true)
    try {
      const data = await emailService.listContactListItems({
        contactListId: listId,
        searchParam,
        pageNumber: page,
      })
      const records: Contact[] = Array.isArray(data) ? data : data?.records ?? data?.contactListItems ?? []
      if (replace) {
        setContacts(records)
      } else {
        setContacts((prev) => [...prev, ...records])
      }
      // Assume hasMore if we got a full page (20 items)
      setHasMore(records.length >= 20)
    } catch (err) {
      console.error('Error fetching contacts:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleLoadMore = () => {
    if (!selectedList) return
    const nextPage = pageNumber + 1
    setPageNumber(nextPage)
    fetchContacts(selectedList.id, nextPage, false)
  }

  // ---- Search handlers ----

  const handleSearchLists = () => {
    fetchContactLists()
  }

  const handleSearchContacts = () => {
    if (!selectedList) return
    setContacts([])
    setPageNumber(1)
    fetchContacts(selectedList.id, 1, true)
  }

  // ---- Create List ----

  const handleCreateList = async () => {
    if (!listName.trim() || !listFromEmail.trim() || !listFromName.trim()) return
    setListFormLoading(true)
    try {
      await emailService.createContactList({
        name: listName.trim(),
        fromEmail: listFromEmail.trim(),
        fromName: listFromName.trim(),
        isEmailList: true,
      })
      setOpenCreateListModal(false)
      resetListForm()
      fetchContactLists()
    } catch (err) {
      console.error('Error creating contact list:', err)
    } finally {
      setListFormLoading(false)
    }
  }

  const resetListForm = () => {
    setListName('')
    setListFromEmail('noreply@ariasofts.com')
    setListFromName('Ariasofts')
  }

  // ---- Create Contact ----

  const handleCreateContact = async () => {
    if (!contactName.trim() || !contactEmail.trim() || !selectedList) return
    setContactFormLoading(true)
    try {
      await emailService.createContactListItem({
        name: contactName.trim(),
        email: contactEmail.trim(),
        number: contactNumber.trim() || undefined,
        contactListId: selectedList.id,
      })
      setOpenCreateContactModal(false)
      resetContactForm()
      fetchContacts(selectedList.id, 1, true)
    } catch (err) {
      console.error('Error creating contact:', err)
    } finally {
      setContactFormLoading(false)
    }
  }

  const resetContactForm = () => {
    setContactName('')
    setContactEmail('')
    setContactNumber('')
  }

  // ---- Upload ----

  const handleUpload = async () => {
    if (!uploadFile || !selectedList) return
    setUploadLoading(true)
    setUploadResult(null)
    try {
      const result = await emailService.uploadContactsToList(selectedList.id, uploadFile)
      setUploadResult({
        imported: result?.imported ?? result?.count ?? 0,
        errors: result?.errors ?? [],
      })
      fetchContacts(selectedList.id, 1, true)
    } catch (err) {
      console.error('Error uploading contacts:', err)
      setUploadResult({ imported: 0, errors: ['Error al procesar el archivo'] })
    } finally {
      setUploadLoading(false)
    }
  }

  const handleCloseUploadModal = () => {
    setOpenUploadModal(false)
    setUploadFile(null)
    setUploadResult(null)
  }

  // ---- Delete ----

  const confirmDelete = (type: 'list' | 'contact', id: number) => {
    setDeleteTarget({ type, id })
    setOpenDeleteModal(true)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      if (deleteTarget.type === 'list') {
        await emailService.deleteContactList(deleteTarget.id)
        if (selectedList?.id === deleteTarget.id) {
          setSelectedList(null)
        }
        fetchContactLists()
      } else {
        await emailService.deleteContactListItem(deleteTarget.id)
        if (selectedList) {
          fetchContacts(selectedList.id, 1, true)
        }
      }
      setOpenDeleteModal(false)
      setDeleteTarget(null)
    } catch (err) {
      console.error('Error deleting:', err)
    } finally {
      setDeleteLoading(false)
    }
  }

  // ---- Navigation ----

  const handleViewContacts = (list: ContactList) => {
    setSelectedList(list)
    setSearchParam('')
  }

  const handleBackToLists = () => {
    setSelectedList(null)
    setSearchParam('')
    setContacts([])
  }

  // ---- Render: Lists View ----

  const renderListsView = () => (
    <Stack spacing={3}>
      {/* Header */}
      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
        <Stack direction="row" spacing={2} alignItems="center">
          <EmailIcon sx={{ fontSize: 32, color: 'primary.500' }} />
          <Box>
            <Typography level="h2">Listas de Email</Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              Gestiona las listas de contactos para campanas de Acelle Mail
            </Typography>
          </Box>
        </Stack>
        <Button
          startDecorator={<AddIcon />}
          color="primary"
          onClick={() => setOpenCreateListModal(true)}
        >
          Nueva Lista de Email
        </Button>
      </Stack>

      {/* Stats */}
      <Grid container spacing={2}>
        <Grid xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                    Total de Listas
                  </Typography>
                  <Typography level="h2">{contactLists.length}</Typography>
                </Box>
                <ListIcon sx={{ fontSize: 48, color: 'primary.500', opacity: 0.3 }} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                    Listas Acelle
                  </Typography>
                  <Typography level="h2">
                    {contactLists.filter((l) => l.acelleListUid).length}
                  </Typography>
                </Box>
                <EmailIcon sx={{ fontSize: 48, color: 'success.500', opacity: 0.3 }} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                    Total de Contactos
                  </Typography>
                  <Typography level="h2">
                    {contactLists.reduce((acc, l) => acc + (l.contactsCount ?? 0), 0).toLocaleString()}
                  </Typography>
                </Box>
                <PeopleIcon sx={{ fontSize: 48, color: 'warning.500', opacity: 0.3 }} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Search + Refresh */}
      <Card>
        <CardContent>
          <Stack direction="row" spacing={1}>
            <Input
              placeholder="Buscar listas..."
              value={searchParam}
              onChange={(e) => setSearchParam(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchLists()}
              startDecorator={<SearchIcon />}
              sx={{ flexGrow: 1 }}
            />
            <Button
              variant="outlined"
              color="neutral"
              startDecorator={loading ? <CircularProgress size="sm" /> : <RefreshIcon />}
              onClick={handleSearchLists}
              disabled={loading}
            >
              Buscar
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <Sheet sx={{ overflow: 'auto', borderRadius: 'sm' }}>
          <Table stickyHeader>
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Nombre</th>
                <th style={{ minWidth: 220 }}>Email Remitente</th>
                <th style={{ minWidth: 120 }}>Nombre Remitente</th>
                <th style={{ minWidth: 100 }}>Contactos</th>
                <th style={{ minWidth: 140 }}>Acelle UID</th>
                <th style={{ minWidth: 160 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                    <CircularProgress size="sm" />
                  </td>
                </tr>
              ) : contactLists.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      No hay listas de email. Crea la primera lista.
                    </Typography>
                  </td>
                </tr>
              ) : (
                contactLists.map((list) => (
                  <tr key={list.id}>
                    <td>
                      <Typography level="body-sm" fontWeight="lg">
                        {list.name}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                        {list.fromEmail}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">{list.fromName}</Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">
                        {list.contactsCount?.toLocaleString() ?? '--'}
                      </Typography>
                    </td>
                    <td>
                      {list.acelleListUid ? (
                        <Chip size="sm" color="success" variant="soft">
                          {list.acelleListUid.slice(0, 12)}...
                        </Chip>
                      ) : (
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          Sin sincronizar
                        </Typography>
                      )}
                    </td>
                    <td>
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Ver contactos">
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="primary"
                            onClick={() => handleViewContacts(list)}
                          >
                            <PeopleIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Editar">
                          <IconButton size="sm" variant="plain" color="neutral">
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Eliminar">
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={() => confirmDelete('list', list.id)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Sheet>
      </Card>
    </Stack>
  )

  // ---- Render: List Detail View ----

  const renderDetailView = () => (
    <Stack spacing={3}>
      {/* Header */}
      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            variant="outlined"
            color="neutral"
            size="sm"
            onClick={handleBackToLists}
            sx={{ whiteSpace: 'nowrap' }}
          >
            &lt; Volver
          </Button>
          <Box>
            <Typography level="h3">{selectedList?.name}</Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                {selectedList?.fromEmail}
              </Typography>
              {selectedList?.acelleListUid && (
                <Chip size="sm" color="success" variant="soft">
                  Acelle
                </Chip>
              )}
            </Stack>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            color="neutral"
            startDecorator={<UploadIcon />}
            onClick={() => {
              setUploadResult(null)
              setUploadFile(null)
              setOpenUploadModal(true)
            }}
          >
            Importar Excel
          </Button>
          <Button
            startDecorator={<AddIcon />}
            color="primary"
            onClick={() => setOpenCreateContactModal(true)}
          >
            Agregar Contacto
          </Button>
        </Stack>
      </Stack>

      {/* Search */}
      <Card>
        <CardContent>
          <Stack direction="row" spacing={1}>
            <Input
              placeholder="Buscar contactos por nombre o email..."
              value={searchParam}
              onChange={(e) => setSearchParam(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchContacts()}
              startDecorator={<SearchIcon />}
              sx={{ flexGrow: 1 }}
            />
            <Button
              variant="outlined"
              color="neutral"
              startDecorator={loading ? <CircularProgress size="sm" /> : <RefreshIcon />}
              onClick={handleSearchContacts}
              disabled={loading}
            >
              Buscar
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Contacts Table */}
      <Card>
        <Sheet sx={{ overflow: 'auto', borderRadius: 'sm' }}>
          <Table stickyHeader>
            <thead>
              <tr>
                <th style={{ minWidth: 180 }}>Nombre</th>
                <th style={{ minWidth: 220 }}>Email</th>
                <th style={{ minWidth: 150 }}>Numero</th>
                <th style={{ minWidth: 120 }}>Estado WhatsApp</th>
                <th style={{ minWidth: 100 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && contacts.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                    <CircularProgress size="sm" />
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      No hay contactos en esta lista. Agrega o importa contactos.
                    </Typography>
                  </td>
                </tr>
              ) : (
                contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>
                      <Typography level="body-sm" fontWeight="md">
                        {contact.name}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                        {contact.email}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">
                        {contact.number ?? '--'}
                      </Typography>
                    </td>
                    <td>
                      <Switch
                        checked={!!contact.isWhatsappValid}
                        disabled
                        size="sm"
                        color={contact.isWhatsappValid ? 'success' : 'neutral'}
                      />
                    </td>
                    <td>
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Eliminar contacto">
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="danger"
                            onClick={() => confirmDelete('contact', contact.id)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Sheet>

        {hasMore && (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Button
              variant="outlined"
              color="neutral"
              size="sm"
              onClick={handleLoadMore}
              loading={loading}
            >
              Cargar mas
            </Button>
          </Box>
        )}
      </Card>
    </Stack>
  )

  // ---- Main Render ----

  return (
    <Container maxWidth="xl">
      {selectedList ? renderDetailView() : renderListsView()}

      {/* Modal: Create List */}
      <Modal open={openCreateListModal} onClose={() => setOpenCreateListModal(false)}>
        <ModalDialog sx={{ minWidth: 480, maxWidth: '90vw' }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            Nueva Lista de Email
          </Typography>
          <Stack spacing={2}>
            <FormControl required>
              <FormLabel>Nombre de la lista</FormLabel>
              <Input
                placeholder="Ej: Clientes Premium 2025"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
              />
            </FormControl>
            <FormControl required>
              <FormLabel>Email remitente</FormLabel>
              <Input
                type="email"
                placeholder="noreply@ariasofts.com"
                value={listFromEmail}
                onChange={(e) => setListFromEmail(e.target.value)}
              />
            </FormControl>
            <FormControl required>
              <FormLabel>Nombre remitente</FormLabel>
              <Input
                placeholder="Ariasofts"
                value={listFromName}
                onChange={(e) => setListFromName(e.target.value)}
              />
            </FormControl>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button
                fullWidth
                variant="outlined"
                color="neutral"
                onClick={() => setOpenCreateListModal(false)}
                disabled={listFormLoading}
              >
                Cancelar
              </Button>
              <Button
                fullWidth
                color="primary"
                startDecorator={listFormLoading ? <CircularProgress size="sm" /> : <AddIcon />}
                onClick={handleCreateList}
                disabled={listFormLoading || !listName.trim() || !listFromEmail.trim() || !listFromName.trim()}
              >
                Crear Lista
              </Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Modal: Create Contact */}
      <Modal open={openCreateContactModal} onClose={() => setOpenCreateContactModal(false)}>
        <ModalDialog sx={{ minWidth: 440, maxWidth: '90vw' }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            Agregar Contacto
          </Typography>
          <Stack spacing={2}>
            <FormControl required>
              <FormLabel>Nombre</FormLabel>
              <Input
                placeholder="Nombre del contacto"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </FormControl>
            <FormControl required>
              <FormLabel>Email</FormLabel>
              <Input
                type="email"
                placeholder="correo@ejemplo.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Numero (opcional)</FormLabel>
              <Input
                placeholder="+52 55 1234 5678"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
              />
            </FormControl>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button
                fullWidth
                variant="outlined"
                color="neutral"
                onClick={() => setOpenCreateContactModal(false)}
                disabled={contactFormLoading}
              >
                Cancelar
              </Button>
              <Button
                fullWidth
                color="primary"
                startDecorator={contactFormLoading ? <CircularProgress size="sm" /> : <AddIcon />}
                onClick={handleCreateContact}
                disabled={contactFormLoading || !contactName.trim() || !contactEmail.trim()}
              >
                Agregar
              </Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Modal: Upload Excel */}
      <Modal open={openUploadModal} onClose={handleCloseUploadModal}>
        <ModalDialog sx={{ minWidth: 480, maxWidth: '90vw' }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            Importar Contactos desde Excel
          </Typography>
          <Stack spacing={2}>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              Selecciona un archivo .xlsx con las columnas: nombre, email, numero (opcional).
            </Typography>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setUploadFile(f)
                setUploadResult(null)
              }}
            />

            <Box
              sx={{
                border: '2px dashed',
                borderColor: uploadFile ? 'success.400' : 'divider',
                borderRadius: 'md',
                p: 3,
                textAlign: 'center',
                cursor: 'pointer',
                '&:hover': { borderColor: 'primary.400', bgcolor: 'background.level1' },
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon sx={{ fontSize: 40, color: 'text.tertiary', mb: 1 }} />
              {uploadFile ? (
                <Typography level="body-sm" fontWeight="md" sx={{ color: 'success.600' }}>
                  {uploadFile.name}
                </Typography>
              ) : (
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Haz clic para seleccionar un archivo .xlsx
                </Typography>
              )}
            </Box>

            {/* Upload result */}
            {uploadResult && (
              <Box
                sx={{
                  p: 2,
                  borderRadius: 'md',
                  bgcolor: uploadResult.errors.length > 0 ? 'warning.softBg' : 'success.softBg',
                }}
              >
                <Typography level="body-sm" fontWeight="md">
                  Importados: {uploadResult.imported} contactos
                </Typography>
                {uploadResult.errors.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography level="body-xs" sx={{ color: 'danger.600' }}>
                      Errores ({uploadResult.errors.length}):
                    </Typography>
                    {uploadResult.errors.slice(0, 5).map((err, i) => (
                      <Typography key={i} level="body-xs" sx={{ color: 'danger.500' }}>
                        - {err}
                      </Typography>
                    ))}
                    {uploadResult.errors.length > 5 && (
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        ... y {uploadResult.errors.length - 5} errores mas
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            )}

            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button
                fullWidth
                variant="outlined"
                color="neutral"
                onClick={handleCloseUploadModal}
                disabled={uploadLoading}
              >
                Cerrar
              </Button>
              <Button
                fullWidth
                color="primary"
                startDecorator={uploadLoading ? <CircularProgress size="sm" /> : <UploadIcon />}
                onClick={handleUpload}
                disabled={!uploadFile || uploadLoading}
              >
                Importar
              </Button>
            </Stack>
          </Stack>
        </ModalDialog>
      </Modal>

      {/* Modal: Delete Confirmation */}
      <Modal open={openDeleteModal} onClose={() => !deleteLoading && setOpenDeleteModal(false)}>
        <ModalDialog sx={{ maxWidth: 400 }}>
          <ModalClose disabled={deleteLoading} />
          <Typography level="h4" sx={{ mb: 1 }}>
            Confirmar eliminacion
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.secondary', mb: 3 }}>
            {deleteTarget?.type === 'list'
              ? 'Esta accion eliminara la lista de email y todos sus contactos. No se puede deshacer.'
              : 'Esta accion eliminara el contacto de la lista. No se puede deshacer.'}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              fullWidth
              variant="outlined"
              color="neutral"
              onClick={() => setOpenDeleteModal(false)}
              disabled={deleteLoading}
            >
              Cancelar
            </Button>
            <Button
              fullWidth
              color="danger"
              startDecorator={deleteLoading ? <CircularProgress size="sm" /> : <DeleteIcon />}
              onClick={handleDelete}
              disabled={deleteLoading}
            >
              Eliminar
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>
    </Container>
  )
}
