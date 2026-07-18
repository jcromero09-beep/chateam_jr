import { useState, useEffect, useRef, forwardRef } from 'react'
import {
  Plus,
  Trash,
  PencilSimple,
  Users,
  UploadSimple,
  MagnifyingGlass,
  ArrowClockwise,
  EnvelopeSimple,
  ListBullets,
  CaretLeft,
} from '@phosphor-icons/react'
// [Fase2·G] CircularProgress se conserva como MUI (design system sin equivalente Radix).
import { CircularProgress } from '@mui/joy'
import { StatTile } from '@/components/ui/stat-tile'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
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

const LIST_COLUMNS = [
  'Nombre',
  'Email Remitente',
  'Nombre Remitente',
  'Contactos',
  'Acelle UID',
  '',
]

const CONTACT_COLUMNS = ['Nombre', 'Email', 'Número', 'Estado WhatsApp', '']

// Botón de acción de fila (mismo look que RowAction, con onClick).
// forwardRef + spread de props: Radix `TooltipTrigger asChild` clona el hijo y le
// inyecta ref y handlers; sin esto el tooltip no abre.
// Sin `title` nativo: lo aporta el Tooltip de Radix (evita tooltip duplicado).
interface ActionBtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
}

const ActionBtn = forwardRef<HTMLButtonElement, ActionBtnProps>(
  ({ label, className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        'appearance-none border-0 bg-transparent [font-family:inherit] cursor-pointer flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
)
ActionBtn.displayName = 'ActionBtn'

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
  const [listFromEmail, setListFromEmail] = useState('')
  const [listFromName, setListFromName] = useState('')
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
    setListFromEmail('')
    setListFromName('')
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <EnvelopeSimple className="size-6" weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Listas de Email
            </h1>
            <p className="text-sm text-muted-foreground">
              Gestiona las listas de contactos para campañas de Acelle Mail
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setOpenCreateListModal(true)}>
          <Plus className="size-4" weight="bold" aria-hidden />
          Nueva Lista de Email
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile label="Total de Listas" value={String(contactLists.length)} />
        <StatTile
          label="Listas Acelle"
          value={String(contactLists.filter((l) => l.acelleListUid).length)}
          tone="success"
        />
        <StatTile
          label="Total de Contactos"
          value={contactLists
            .reduce((acc, l) => acc + (l.contactsCount ?? 0), 0)
            .toLocaleString()}
        />
      </div>

      {/* Search + Refresh */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Input
            placeholder="Buscar listas..."
            aria-label="Buscar listas"
            value={searchParam}
            onChange={(e) => setSearchParam(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchLists()}
            leftIcon={<MagnifyingGlass aria-hidden />}
            className="h-10"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSearchLists}
          loading={loading}
          disabled={loading}
        >
          {!loading && <ArrowClockwise className="size-4" aria-hidden />}
          Buscar
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                {LIST_COLUMNS.map((c, i) => (
                  <th
                    key={i}
                    className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    <CircularProgress size="sm" />
                  </td>
                </tr>
              ) : contactLists.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No hay listas de email. Crea la primera lista.
                  </td>
                </tr>
              ) : (
                contactLists.map((list) => (
                  <tr key={list.id} className="transition-colors hover:bg-accent/40">
                    <td className="px-4 py-3 font-medium text-foreground">{list.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{list.fromEmail}</td>
                    <td className="px-4 py-3 text-foreground">{list.fromName}</td>
                    <td className="px-4 py-3 tabular-nums text-foreground">
                      {list.contactsCount?.toLocaleString() ?? '--'}
                    </td>
                    <td className="px-4 py-3">
                      {list.acelleListUid ? (
                        <Badge variant="success">{list.acelleListUid.slice(0, 12)}...</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin sincronizar</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <Tooltip title="Ver contactos">
                          <ActionBtn
                            label="Ver contactos"
                            onClick={() => handleViewContacts(list)}
                            className="text-primary hover:bg-primary/10 hover:text-primary"
                          >
                            <Users className="size-[18px]" aria-hidden />
                          </ActionBtn>
                        </Tooltip>
                        <Tooltip title="Editar">
                          <ActionBtn label="Editar" onClick={() => {}}>
                            <PencilSimple className="size-[18px]" aria-hidden />
                          </ActionBtn>
                        </Tooltip>
                        <Tooltip title="Eliminar">
                          <ActionBtn
                            label="Eliminar"
                            onClick={() => confirmDelete('list', list.id)}
                            className="hover:bg-destructive/10 hover:text-destructive-text"
                          >
                            <Trash className="size-[18px]" aria-hidden />
                          </ActionBtn>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )

  // ---- Render: List Detail View ----

  const renderDetailView = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleBackToLists}>
            <CaretLeft className="size-4" weight="bold" aria-hidden />
            Volver
          </Button>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {selectedList?.name}
            </h2>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{selectedList?.fromEmail}</span>
              {selectedList?.acelleListUid && <Badge variant="success">Acelle</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setUploadResult(null)
              setUploadFile(null)
              setOpenUploadModal(true)
            }}
          >
            <UploadSimple className="size-4" aria-hidden />
            Importar Excel
          </Button>
          <Button size="sm" onClick={() => setOpenCreateContactModal(true)}>
            <Plus className="size-4" weight="bold" aria-hidden />
            Agregar Contacto
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Input
            placeholder="Buscar contactos por nombre o email..."
            aria-label="Buscar contactos"
            value={searchParam}
            onChange={(e) => setSearchParam(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchContacts()}
            leftIcon={<MagnifyingGlass aria-hidden />}
            className="h-10"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSearchContacts}
          loading={loading}
          disabled={loading}
        >
          {!loading && <ArrowClockwise className="size-4" aria-hidden />}
          Buscar
        </Button>
      </div>

      {/* Contacts Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                {CONTACT_COLUMNS.map((c, i) => (
                  <th
                    key={i}
                    className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && contacts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    <CircularProgress size="sm" />
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No hay contactos en esta lista. Agrega o importa contactos.
                  </td>
                </tr>
              ) : (
                contacts.map((contact) => (
                  <tr key={contact.id} className="transition-colors hover:bg-accent/40">
                    <td className="px-4 py-3 font-medium text-foreground">{contact.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{contact.email}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-foreground">
                      {contact.number ?? '--'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={contact.isWhatsappValid ? 'success' : 'neutral'} dot>
                        {contact.isWhatsappValid ? 'Válido' : 'Sin validar'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <Tooltip title="Eliminar contacto">
                          <ActionBtn
                            label="Eliminar contacto"
                            onClick={() => confirmDelete('contact', contact.id)}
                            className="hover:bg-destructive/10 hover:text-destructive-text"
                          >
                            <Trash className="size-[18px]" aria-hidden />
                          </ActionBtn>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <div className="border-t border-border p-4 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadMore}
              loading={loading}
              disabled={loading}
            >
              Cargar más
            </Button>
          </div>
        )}
      </div>
    </div>
  )

  // ---- Main Render ----

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] p-5 sm:p-6 lg:p-8">
          {selectedList ? renderDetailView() : renderListsView()}
        </div>
      </div>

      {/* Modal: Create List */}
      <Dialog
        open={openCreateListModal}
        onOpenChange={(o) => {
          if (!o) setOpenCreateListModal(false)
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListBullets className="size-5 text-primary" aria-hidden />
              Nueva Lista de Email
            </DialogTitle>
            <DialogDescription>
              Define el remitente que usarán las campañas enviadas a esta lista.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="list-name">Nombre de la lista</Label>
              <Input
                id="list-name"
                required
                placeholder="Ej: Clientes Premium 2025"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="list-from-email">Email remitente</Label>
              <Input
                id="list-from-email"
                required
                type="email"
                placeholder="noreply@tuempresa.com"
                value={listFromEmail}
                onChange={(e) => setListFromEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="list-from-name">Nombre remitente</Label>
              <Input
                id="list-from-name"
                required
                placeholder="Tu Empresa"
                value={listFromName}
                onChange={(e) => setListFromName(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpenCreateListModal(false)}
              disabled={listFormLoading}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleCreateList}
              loading={listFormLoading}
              disabled={
                listFormLoading ||
                !listName.trim() ||
                !listFromEmail.trim() ||
                !listFromName.trim()
              }
            >
              {!listFormLoading && <Plus className="size-4" weight="bold" aria-hidden />}
              Crear Lista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Create Contact */}
      <Dialog
        open={openCreateContactModal}
        onOpenChange={(o) => {
          if (!o) setOpenCreateContactModal(false)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-5 text-primary" aria-hidden />
              Agregar Contacto
            </DialogTitle>
            <DialogDescription>
              El contacto se añadirá a la lista {selectedList?.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="contact-name">Nombre</Label>
              <Input
                id="contact-name"
                required
                placeholder="Nombre del contacto"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                required
                type="email"
                placeholder="correo@ejemplo.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-number">Número (opcional)</Label>
              <Input
                id="contact-number"
                placeholder="+52 55 1234 5678"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpenCreateContactModal(false)}
              disabled={contactFormLoading}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleCreateContact}
              loading={contactFormLoading}
              disabled={contactFormLoading || !contactName.trim() || !contactEmail.trim()}
            >
              {!contactFormLoading && <Plus className="size-4" weight="bold" aria-hidden />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Upload Excel */}
      <Dialog
        open={openUploadModal}
        onOpenChange={(o) => {
          if (!o) handleCloseUploadModal()
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UploadSimple className="size-5 text-primary" aria-hidden />
              Importar Contactos desde Excel
            </DialogTitle>
            <DialogDescription>
              Selecciona un archivo .xlsx con las columnas: nombre, email, numero (opcional).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setUploadFile(f)
                setUploadResult(null)
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Seleccionar archivo .xlsx"
              className={cn(
                'appearance-none [font-family:inherit] cursor-pointer flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed bg-transparent p-6 text-center outline-none transition-colors hover:border-primary hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                uploadFile ? 'border-success' : 'border-border',
              )}
            >
              <UploadSimple className="size-10 text-muted-foreground" aria-hidden />
              {uploadFile ? (
                <span className="text-sm font-medium text-success-text">{uploadFile.name}</span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Haz clic para seleccionar un archivo .xlsx
                </span>
              )}
            </button>

            {/* Upload result */}
            {uploadResult && (
              <div
                className={cn(
                  'rounded-lg p-4',
                  uploadResult.errors.length > 0 ? 'bg-warning/16' : 'bg-success/14',
                )}
              >
                <p className="text-sm font-medium text-foreground">
                  Importados: {uploadResult.imported} contactos
                </p>
                {uploadResult.errors.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    <p className="text-xs font-medium text-destructive-text">
                      Errores ({uploadResult.errors.length}):
                    </p>
                    {uploadResult.errors.slice(0, 5).map((err, i) => (
                      <p key={i} className="text-xs text-destructive-text">
                        - {err}
                      </p>
                    ))}
                    {uploadResult.errors.length > 5 && (
                      <p className="text-xs text-muted-foreground">
                        ... y {uploadResult.errors.length - 5} errores más
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCloseUploadModal}
              disabled={uploadLoading}
            >
              Cerrar
            </Button>
            <Button
              size="sm"
              onClick={handleUpload}
              loading={uploadLoading}
              disabled={!uploadFile || uploadLoading}
            >
              {!uploadLoading && <UploadSimple className="size-4" aria-hidden />}
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Delete Confirmation */}
      <Dialog
        open={openDeleteModal}
        onOpenChange={(o) => {
          if (!o && !deleteLoading) {
            setOpenDeleteModal(false)
            setDeleteTarget(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash className="size-5 text-destructive-text" aria-hidden />
              Confirmar eliminación
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.type === 'list'
                ? 'Esta acción eliminará la lista de email y todos sus contactos. No se puede deshacer.'
                : 'Esta acción eliminará el contacto de la lista. No se puede deshacer.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpenDeleteModal(false)}
              disabled={deleteLoading}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleDelete}
              loading={deleteLoading}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {!deleteLoading && <Trash className="size-4" aria-hidden />}
              {deleteLoading ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
