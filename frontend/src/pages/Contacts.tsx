import { useState, useEffect, useRef } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AddressBook,
  UploadSimple,
  DownloadSimple,
  Plus,
  MagnifyingGlass,
  WhatsappLogo,
  PencilSimple,
  Trash,
  Prohibit,
  ArrowClockwise,
  CaretLeft,
  CaretRight,
  CaretDoubleLeft,
  CaretDoubleRight,
  CheckCircle,
  XCircle,
  Clock,
  SpinnerGap,
  Phone,
  EnvelopeSimple,
  X,
} from '@phosphor-icons/react'
import { toast } from 'react-toastify'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { StatTile } from '@/components/ui/stat-tile'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import api from '../services/api'
import { socketService } from '../services/socket'
import { useAuth } from '../hooks/useAuth'
import { UserRole } from '../utils/permissions'
import translateBackendError from '../utils/translateBackendError'
import { contactAvatarInitial, displayContactName } from '../utils/contactDisplay'

interface WhatsappLite {
  id: number
  name: string
}

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
  active?: boolean
  acceptAudioMessage?: boolean
  disableBot?: boolean
  createdAt: string
  remoteJid?: string | null
  whatsappId?: number | null
  whatsapp?: WhatsappLite | null
  // Estado de verificación de WhatsApp: null=sin verificar | pending | valid | invalid
  whatsappValid?: string | null
}

const isTechnicalLidContact = (contact: Contact): boolean => {
  const number = String(contact.number || '').trim()
  const remoteJid = contact.remoteJid || ''
  const isTechnicalJid = Boolean(
    remoteJid &&
    !remoteJid.endsWith('@s.whatsapp.net') &&
    !remoteJid.endsWith('@g.us')
  )

  return Boolean(
    isTechnicalJid &&
    contact.name === contact.number &&
    /^[0-9]+$/.test(number)
  )
}

const contactNameForTable = (contact: Contact): string => {
  if (isTechnicalLidContact(contact)) return 'Sin nombre'
  return displayContactName(contact)
}

const contactNumberForTable = (contact: Contact): string => {
  if (isTechnicalLidContact(contact)) return '-'
  return contact.number || '-'
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Badge del estado de verificación de WhatsApp del contacto.
const WHATSAPP_BADGE: Record<
  string,
  { label: string; variant: 'success' | 'destructive' | 'warning'; icon: ReactNode }
> = {
  valid: { label: 'Verificado', variant: 'success', icon: <CheckCircle className="size-3" weight="fill" aria-hidden /> },
  invalid: { label: 'Sin WhatsApp', variant: 'destructive', icon: <XCircle className="size-3" weight="fill" aria-hidden /> },
  pending: { label: 'Verificando…', variant: 'warning', icon: <Clock className="size-3" weight="fill" aria-hidden /> },
}

function renderWhatsappBadge(contact: Contact) {
  const state = contact.whatsappValid || ''
  const cfg = WHATSAPP_BADGE[state]
  if (!cfg) return null
  return (
    <Badge variant={cfg.variant} title={`WhatsApp: ${cfg.label}`}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  )
}

// Botón de acción compacto para las filas de la tabla (soporta onClick/disabled).
function ActionButton({
  label,
  className,
  onClick,
  disabled,
  children,
}: {
  label: string
  className?: string
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}

export default function Contacts() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // Obtener rol del usuario
  const userRole: UserRole = (user?.profile?.toLowerCase()?.includes('super') ? 'super' :
    user?.profile?.toLowerCase()?.includes('admin') ? 'admin' :
    user?.profile?.toLowerCase()?.includes('supervisor') ? 'supervisor' : 'user') as UserRole

  // Permisos de acciones sobre contactos
  const canEditContacts = userRole === 'super' || userRole === 'admin' || userRole === 'supervisor'
  const canDeleteContacts = userRole === 'super' || userRole === 'admin'
  const canBlockContacts = userRole === 'super' || userRole === 'admin' || userRole === 'supervisor'
  const canCreateContacts = userRole === 'super' || userRole === 'admin' || userRole === 'supervisor'

  const [contacts, setContacts] = useState<Contact[]>([])
  const [whatsapps, setWhatsapps] = useState<WhatsappLite[]>([])
  const [whatsappFilter, setWhatsappFilter] = useState<number | ''>('')
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [openModal, setOpenModal] = useState(false)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [openingChatId, setOpeningChatId] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [formData, setFormData] = useState<{
    name: string
    number: string
    email: string
  }>({
    name: '',
    number: '',
    email: '',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  // Debounce de búsqueda para no saturar el backend
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
      setPageNumber(1) // Resetear a página 1 al buscar
    }, 500)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Resetear a página 1 cuando cambia el filtro por conexión
  useEffect(() => {
    setPageNumber(1)
  }, [whatsappFilter])

  // Cargar lista de conexiones WhatsApp para el filtro
  useEffect(() => {
    const fetchWhatsapps = async () => {
      try {
        const response = await api.get('/whatsapp/')
        const data: WhatsappLite[] = Array.isArray(response.data)
          ? response.data.map((w: any) => ({ id: Number(w.id), name: String(w.name ?? `#${w.id}`) }))
          : []
        setWhatsapps(data)
      } catch (error) {
        console.error('Error fetching whatsapps:', error)
        setWhatsapps([])
      }
    }
    fetchWhatsapps()
  }, [])

  useEffect(() => {
    fetchContacts()
  }, [pageNumber, debouncedSearch, rowsPerPage, whatsappFilter])

  const fetchContacts = async () => {
    try {
      setLoading(true)
      const params: Record<string, string | number> = {
        pageNumber,
        rowsPerPage,
      }
      if (debouncedSearch) {
        params.searchParam = debouncedSearch
      }
      if (whatsappFilter !== '') {
        params.whatsappId = whatsappFilter
      }
      const response = await api.get('/contacts', { params })

      // Backend returns { contacts, count, hasMore }
      const contactsData = response.data.contacts || response.data || []
      setContacts(contactsData)
      setTotalCount(response.data.count || 0)
      setHasMore(response.data.hasMore || false)
    } catch (error) {
      console.error('Error fetching contacts:', error)
      setContacts([])
      setTotalCount(0)
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    setFormError(null)
    if (!formData.name?.trim()) {
      setFormError('El nombre es obligatorio')
      return
    }
    if (!formData.number?.trim()) {
      setFormError('El teléfono es obligatorio')
      return
    }
    try {
      await api.post('/contacts', formData)
      fetchContacts()
      setOpenModal(false)
      resetForm()
    } catch (error: unknown) {
      setFormError(translateBackendError(error, 'Error al crear el contacto'))
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
      setFormError(translateBackendError(error, 'Error al actualizar el contacto'))
      console.error('Error updating contact:', error)
    }
  }

  const handleDelete = async (contactId: number) => {
    if (confirm('¿Estás seguro de eliminar este contacto?')) {
      try {
        await api.delete(`/contacts/${contactId}`)
        toast.success('Contacto eliminado')
        fetchContacts()
      } catch (error) {
        toast.error(translateBackendError(error, 'Error al eliminar el contacto'))
        console.error('Error deleting contact:', error)
      }
    }
  }

  const handleBlockUnblock = async (contact: Contact) => {
    const nextActive = !contact.active
    try {
      await api.put(`/contacts/block/${contact.id}`, { active: nextActive })
      toast.success(nextActive ? 'Contacto desbloqueado' : 'Contacto bloqueado')
      fetchContacts()
    } catch (error) {
      toast.error(translateBackendError(error, 'Error al bloquear/desbloquear el contacto'))
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

  // Refresca el badge de verificación de WhatsApp en tiempo real (job en background).
  useEffect(() => {
    if (!user?.companyId) return
    const socket = socketService.getSocket()
    if (!socket) return
    const channel = `company-${user.companyId}-contact`
    const handler = (data: any) => {
      // Solo nos interesa el estado de verificación; y solo si viene en el payload,
      // para no pisar el badge cuando otro emisor manda 'update' sin whatsappValid.
      if (data?.action === 'update' && data.contact?.id && data.contact.whatsappValid !== undefined) {
        setContacts(prev =>
          prev.map(c =>
            c.id === data.contact.id
              ? { ...c, whatsappValid: data.contact.whatsappValid }
              : c
          )
        )
      }
    }
    socket.on(channel, handler)
    return () => { socket.off(channel, handler) }
  }, [user?.companyId])

  const handleImportContacts = async () => {
    importInputRef.current?.click()
  }

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    try {
      setImporting(true)
      const { data } = await api.post('/contacts/upload', formData)
      const created = data?.createdCount ?? 0
      const duplicated = data?.duplicated ?? 0
      const skipped = data?.skippedInvalid ?? 0

      if (created > 0) {
        const extra: string[] = []
        if (duplicated > 0) extra.push(`${duplicated} ya existían`)
        if (skipped > 0) extra.push(`${skipped} inválidos omitidos`)
        toast.success(
          `Importación completada: ${created} nuevos` +
          (extra.length ? ` (${extra.join(', ')})` : '') +
          '. Verificando WhatsApp en segundo plano…'
        )
      } else {
        const reason =
          skipped > 0 ? `${skipped} filas inválidas` :
          duplicated > 0 ? 'todos los contactos ya existían' : 'sin contactos nuevos'
        toast.info(`Importación finalizada: ${reason}.`)
      }
      fetchContacts()
    } catch (error) {
      toast.error(translateBackendError(error, 'Error al importar contactos'))
      console.error('Error importing contacts:', error)
    } finally {
      setImporting(false)
    }
  }

  const handleExportContacts = async () => {
    try {
      setExporting(true)
      // Respeta el filtro de conexión activo en la vista: si hay una conexión
      // seleccionada, se exportan solo sus contactos; si es "Todas", se exporta todo.
      const response = await api.post('/contacts/export/excel', {
        whatsappId: whatsappFilter || undefined,
      })
      const jobId = response.data?.jobId
      const filename = response.data?.filename || `contactos-${Date.now()}.xlsx`

      if (!jobId) {
        throw new Error('No se recibió jobId de exportación')
      }

      const selectedConn = whatsappFilter
        ? whatsapps.find((w) => w.id === whatsappFilter)?.name
        : null
      toast.info(
        selectedConn
          ? `Exportando contactos de "${selectedConn}". Preparando el archivo...`
          : 'Exportación iniciada. Preparando el archivo...'
      )

      for (let attempt = 0; attempt < 18; attempt += 1) {
        try {
          const downloadResponse = await api.get(`/contacts/export/download/${jobId}`, {
            params: { filename },
            responseType: 'blob',
            timeout: 60000,
          })
          downloadBlob(downloadResponse.data, filename)
          toast.success('Exportación descargada')
          return
        } catch (downloadError) {
          if (attempt === 17) throw downloadError
          await sleep(5000)
        }
      }
    } catch (error) {
      toast.error(translateBackendError(error, 'Error al exportar contactos'))
      console.error('Error exporting contacts:', error)
    } finally {
      setExporting(false)
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
    setFormError(null)
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
    setFormError(null)
    setFormData({
      name: '',
      number: '',
      email: '',
    })
  }

  const closeModal = () => {
    setOpenModal(false)
    setFormError(null)
  }

  const totalPages = Math.ceil(totalCount / rowsPerPage)

  const stats = {
    total: totalCount,
    individuals: contacts.filter((c) => !c.isGroup).length,
    groups: contacts.filter((c) => c.isGroup).length,
    botDisabled: contacts.filter((c) => c.disableBot).length,
  }

  const columns = ['Nombre', 'Teléfono', 'Email', 'Conexión', 'Tipo', 'Tags', 'Bot', 'Creado', '']
  const colSpan = columns.length

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <AddressBook className="size-6" weight="duotone" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Contactos</h1>
            <p className="text-sm text-muted-foreground">Gestión de contactos y clientes</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreateContacts && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleImportContacts}
                loading={importing}
                disabled={importing || exporting}
              >
                {!importing && <UploadSimple className="size-4" aria-hidden />}
                <span className="hidden sm:inline">Importar</span>
              </Button>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={handleImportFileChange}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportContacts}
                loading={exporting}
                disabled={importing || exporting}
              >
                {!exporting && <DownloadSimple className="size-4" aria-hidden />}
                <span className="hidden sm:inline">Exportar</span>
              </Button>
            </>
          )}
          <Button variant="outline" size="icon" className="size-9" onClick={fetchContacts} aria-label="Refrescar">
            <ArrowClockwise className="size-4" aria-hidden />
          </Button>
          {canCreateContacts && (
            <Button size="sm" onClick={openCreateModal}>
              <Plus className="size-4" weight="bold" aria-hidden />
              <span className="hidden sm:inline">Nuevo contacto</span>
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Total Contactos" value={stats.total.toLocaleString()} />
        <StatTile label="Individuales" value={String(stats.individuals)} tone="primary" />
        <StatTile label="Grupos" value={String(stats.groups)} tone="success" />
        <StatTile label="Bot Deshabilitado" value={String(stats.botDisabled)} />
      </div>

      {/* Search + connection filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative w-full sm:max-w-md">
          <MagnifyingGlass
            className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            placeholder="Buscar por nombre, teléfono o email"
            aria-label="Buscar contactos"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
        <div className="relative w-full sm:w-64">
          <WhatsappLogo
            className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <select
            aria-label="Filtrar por conexión"
            value={whatsappFilter === '' ? '' : String(whatsappFilter)}
            onChange={(e) => {
              const v = e.target.value
              setWhatsappFilter(v === '' ? '' : Number(v))
            }}
            className="h-10 w-full appearance-none rounded-lg border border-input bg-card pl-10 pr-8 text-sm text-foreground outline-none transition-colors hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <option value="">Todas las conexiones</option>
            {whatsapps.map((w) => (
              <option key={w.id} value={String(w.id)}>
                {w.name}
              </option>
            ))}
          </select>
          <CaretLeft className="pointer-events-none absolute right-3 top-1/2 size-3 -translate-y-1/2 -rotate-90 text-muted-foreground" aria-hidden />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                {columns.map((c, i) => (
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
                  <td colSpan={colSpan} className="px-4 py-12 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <SpinnerGap className="size-4 animate-spin" weight="bold" aria-hidden />
                      Cargando contactos...
                    </span>
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-12 text-center text-muted-foreground">
                    {whatsappFilter !== ''
                      ? 'No hay contactos en esta conexión'
                      : 'No se encontraron contactos'}
                  </td>
                </tr>
              ) : (
                contacts.map((contact) => (
                  <tr key={contact.id} className="transition-colors hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={isTechnicalLidContact(contact) ? '?' : contactAvatarInitial(contact)} size="sm" />
                        <span className="font-medium text-foreground">{contactNameForTable(contact)}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="tabular-nums text-muted-foreground">{contactNumberForTable(contact)}</span>
                        {renderWhatsappBadge(contact)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{contact.email || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {contact.whatsapp?.name ? (
                        <Badge variant="neutral">{contact.whatsapp.name}</Badge>
                      ) : (
                        <Badge variant="primary">Global</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={contact.isGroup ? 'success' : 'accent'}>
                        {contact.isGroup ? 'Grupo' : 'Individual'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {contact.tags?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {contact.tags.map((tag: any, index) => (
                            <Badge key={index} variant="neutral">
                              {typeof tag === 'string' ? tag : tag.name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={contact.disableBot ? 'neutral' : 'success'} dot>
                        {contact.disableBot ? 'Off' : 'On'}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {contact.createdAt && !isNaN(new Date(contact.createdAt).getTime())
                        ? new Date(contact.createdAt).toLocaleDateString('es-ES')
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <ActionButton
                          label="Abrir conversación"
                          className="text-wa hover:bg-wa/10 hover:text-wa"
                          onClick={() => handleOpenChat(contact)}
                          disabled={openingChatId === contact.id}
                        >
                          {openingChatId === contact.id ? (
                            <SpinnerGap className="size-[18px] animate-spin" weight="bold" aria-hidden />
                          ) : (
                            <WhatsappLogo className="size-[18px]" weight="fill" aria-hidden />
                          )}
                        </ActionButton>
                        {canEditContacts && (
                          <ActionButton label="Editar" onClick={() => openEditModal(contact)}>
                            <PencilSimple className="size-[18px]" aria-hidden />
                          </ActionButton>
                        )}
                        {canBlockContacts && (
                          <ActionButton
                            label={contact.active === false ? 'Desbloquear' : 'Bloquear'}
                            className="hover:text-warning-text"
                            onClick={() => handleBlockUnblock(contact)}
                          >
                            <Prohibit className="size-[18px]" aria-hidden />
                          </ActionButton>
                        )}
                        {canDeleteContacts && (
                          <ActionButton
                            label="Eliminar"
                            className="hover:text-destructive-text"
                            onClick={() => handleDelete(contact.id)}
                          >
                            <Trash className="size-[18px]" aria-hidden />
                          </ActionButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {contacts.length === 0 ? 0 : (pageNumber - 1) * rowsPerPage + 1}
            {' - '}
            {Math.min(pageNumber * rowsPerPage, totalCount)} de{' '}
            <strong className="text-foreground">{totalCount.toLocaleString()}</strong> contactos
          </p>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              Filas:
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value))
                  setPageNumber(1)
                }}
                className="h-8 rounded-md border border-input bg-card px-2 text-sm text-foreground outline-none transition-colors hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <ActionButton
              label="Primera página"
              className="border border-input hover:bg-accent"
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber(1)}
            >
              <CaretDoubleLeft className="size-4" aria-hidden />
            </ActionButton>
            <ActionButton
              label="Página anterior"
              className="border border-input hover:bg-accent"
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            >
              <CaretLeft className="size-4" aria-hidden />
            </ActionButton>
            <span className="whitespace-nowrap px-1 text-sm text-muted-foreground">
              Página <strong className="text-foreground">{pageNumber}</strong> de{' '}
              <strong className="text-foreground">{totalPages || 1}</strong>
            </span>
            <ActionButton
              label="Página siguiente"
              className="border border-input hover:bg-accent"
              disabled={!hasMore}
              onClick={() => setPageNumber((p) => p + 1)}
            >
              <CaretRight className="size-4" aria-hidden />
            </ActionButton>
            <ActionButton
              label="Última página"
              className="border border-input hover:bg-accent"
              disabled={!hasMore}
              onClick={() => setPageNumber(totalPages)}
            >
              <CaretDoubleRight className="size-4" aria-hidden />
            </ActionButton>
          </div>
        </div>
      </div>

      {/* Modal Create/Edit */}
      {openModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {selectedContact ? 'Editar Contacto' : 'Nuevo Contacto'}
              </h2>
              <ActionButton label="Cerrar" onClick={closeModal}>
                <X className="size-[18px]" aria-hidden />
              </ActionButton>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="contact-name">Nombre</Label>
                <Input
                  id="contact-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nombre del contacto"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-number">Teléfono</Label>
                <Input
                  id="contact-number"
                  value={formData.number}
                  onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                  placeholder="+34 XXX XXX XXX"
                  leftIcon={<Phone aria-hidden />}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-email">Email (Opcional)</Label>
                <Input
                  id="contact-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@ejemplo.com"
                  leftIcon={<EnvelopeSimple aria-hidden />}
                />
              </div>
              {formError && (
                <p className="rounded-md bg-destructive/12 px-3 py-2 text-sm text-destructive-text">
                  {formError}
                </p>
              )}
              <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                <strong className="text-foreground">Vista Previa:</strong>
                <br />
                <strong className="text-foreground">{formData.name || 'Nombre del contacto'}</strong>
                <br />
                {formData.number || 'Teléfono'}
                {formData.email && (
                  <>
                    <br />
                    {formData.email}
                  </>
                )}
              </div>
              <Button className="w-full" onClick={selectedContact ? handleUpdate : handleCreate}>
                {selectedContact ? 'Actualizar' : 'Crear'} Contacto
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
