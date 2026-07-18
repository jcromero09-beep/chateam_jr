import { useState, useEffect, useCallback } from 'react'
import { CircularProgress } from '@mui/joy'
import {
  Plus,
  PaperPlaneTilt,
  PencilSimple,
  Trash,
  Play,
  Pause,
  MagnifyingGlass,
  ArrowClockwise,
  Megaphone,
  EnvelopeSimple,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { StatTile } from '@/components/ui/stat-tile'
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
import * as emailService from '../services/emailCampaignService'

// TODO: Socket.IO listener for real-time updates

type CampaignStatus =
  | 'INACTIVA'
  | 'PROGRAMADA'
  | 'EN_ANDAMENTO'
  | 'CANCELADA'
  | 'FINALIZADA'

interface ContactList {
  id: number
  name: string
  isEmailList: boolean
}

interface EmailCampaign {
  id: number
  name: string
  subject: string
  status: CampaignStatus
  contactListId?: number
  contactList?: ContactList
  htmlContent?: string
  sendAt?: string
  createdAt: string
  updatedAt?: string
}

interface NewCampaignForm {
  name: string
  subject: string
  htmlContent: string
  contactListId: string
  sendAt: string
}

const STATUS_LABEL: Record<CampaignStatus, string> = {
  INACTIVA: 'Inactiva',
  PROGRAMADA: 'Programada',
  EN_ANDAMENTO: 'En Progreso',
  CANCELADA: 'Cancelada',
  FINALIZADA: 'Finalizada',
}

const STATUS_VARIANT: Record<CampaignStatus, BadgeProps['variant']> = {
  INACTIVA: 'neutral',
  PROGRAMADA: 'warning',
  EN_ANDAMENTO: 'primary',
  CANCELADA: 'destructive',
  FINALIZADA: 'success',
}

const EMPTY_FORM: NewCampaignForm = {
  name: '',
  subject: '',
  htmlContent: '',
  contactListId: '',
  sendAt: '',
}

// Botón de acción de fila (mismo look que RowAction del prototipo, con onClick)
function ActionBtn({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}

const inputClasses =
  'h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

export default function EmailMarketingCampaigns() {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [contactLists, setContactLists] = useState<ContactList[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [searchParam, setSearchParam] = useState('')
  const [pageNumber, setPageNumber] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [count, setCount] = useState(0)

  const [openCreateModal, setOpenCreateModal] = useState(false)
  const [openDeleteModal, setOpenDeleteModal] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<EmailCampaign | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)

  const [form, setForm] = useState<NewCampaignForm>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof NewCampaignForm, string>>>({})

  // ---- Data fetching ----

  const fetchCampaigns = useCallback(
    async (page: number = 1, append: boolean = false) => {
      setLoading(true)
      try {
        const data = await emailService.listEmailCampaigns({
          searchParam,
          pageNumber: page,
        })

        const list: EmailCampaign[] = data.campaigns ?? data.records ?? data ?? []
        const total: number = data.count ?? list.length
        const more: boolean = data.hasMore ?? false

        setCampaigns((prev) => (append ? [...prev, ...list] : list))
        setCount(total)
        setHasMore(more)
      } catch (error) {
        console.error('Error fetching email campaigns:', error)
      } finally {
        setLoading(false)
      }
    },
    [searchParam]
  )

  const fetchContactLists = async () => {
    try {
      const data = await emailService.listContactListsAll()
      const all: ContactList[] = Array.isArray(data) ? data : data.contactLists ?? []
      setContactLists(all.filter((list) => list.isEmailList === true))
    } catch (error) {
      console.error('Error fetching contact lists:', error)
    }
  }

  useEffect(() => {
    setPageNumber(1)
    fetchCampaigns(1, false)
  }, [searchParam])

  useEffect(() => {
    fetchContactLists()
  }, [])

  // ---- Refresh helper ----

  const refreshList = () => {
    setPageNumber(1)
    fetchCampaigns(1, false)
  }

  // ---- Load more ----

  const handleLoadMore = () => {
    const next = pageNumber + 1
    setPageNumber(next)
    fetchCampaigns(next, true)
  }

  // ---- Search on Enter ----

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setPageNumber(1)
      fetchCampaigns(1, false)
    }
  }

  // ---- Actions ----

  const handlePlay = async (campaign: EmailCampaign) => {
    setActionLoading(campaign.id)
    try {
      await emailService.restartCampaign(campaign.id)
      refreshList()
    } catch (error) {
      console.error('Error restarting campaign:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const handlePause = async (campaign: EmailCampaign) => {
    setActionLoading(campaign.id)
    try {
      await emailService.cancelCampaign(campaign.id)
      refreshList()
    } catch (error) {
      console.error('Error cancelling campaign:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!selectedCampaign) return
    setActionLoading(selectedCampaign.id)
    try {
      await emailService.deleteEmailCampaign(selectedCampaign.id)
      setOpenDeleteModal(false)
      setSelectedCampaign(null)
      refreshList()
    } catch (error) {
      console.error('Error deleting campaign:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const openDelete = (campaign: EmailCampaign) => {
    setSelectedCampaign(campaign)
    setOpenDeleteModal(true)
  }

  // ---- Create form ----

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof NewCampaignForm, string>> = {}
    if (!form.name.trim()) errors.name = 'El nombre es requerido'
    if (!form.subject.trim()) errors.subject = 'El asunto es requerido'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleFormChange = (field: keyof NewCampaignForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  const handleCreateSubmit = async () => {
    if (!validateForm()) return
    setFormSubmitting(true)
    try {
      await emailService.createEmailCampaign({
        name: form.name.trim(),
        subject: form.subject.trim(),
        htmlContent: form.htmlContent || undefined,
        contactListId: form.contactListId ? Number(form.contactListId) : undefined,
        sendAt: form.sendAt || undefined,
      })
      setOpenCreateModal(false)
      setForm(EMPTY_FORM)
      setFormErrors({})
      refreshList()
    } catch (error) {
      console.error('Error creating campaign:', error)
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleCloseCreateModal = () => {
    setOpenCreateModal(false)
    setForm(EMPTY_FORM)
    setFormErrors({})
  }

  // ---- Derived stats ----

  const totalByStatus = (status: CampaignStatus) =>
    campaigns.filter((c) => c.status === status).length

  // ---- Render ----

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* ---- Header ---- */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <EnvelopeSimple className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Campanas de Email
              </h1>
              <p className="text-sm text-muted-foreground">
                {count > 0 ? `${count} campanas en total` : 'Gestion de campanas con Acelle Mail'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar lista"
              className="text-muted-foreground"
              onClick={refreshList}
              disabled={loading}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={() => setOpenCreateModal(true)}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nueva Campana
            </Button>
          </div>
        </div>

        {/* ---- Stats Cards ---- */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Total" value={String(campaigns.length)} />
          <StatTile label="Inactivas" value={String(totalByStatus('INACTIVA'))} />
          <StatTile label="Programadas" value={String(totalByStatus('PROGRAMADA'))} tone="warning" />
          <StatTile label="En Progreso" value={String(totalByStatus('EN_ANDAMENTO'))} tone="primary" />
          <StatTile label="Finalizadas" value={String(totalByStatus('FINALIZADA'))} tone="success" />
        </div>

        {/* ---- Search bar ---- */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <MagnifyingGlass
              className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              placeholder="Buscar por nombre de campana... (Enter para buscar)"
              aria-label="Buscar campanas"
              value={searchParam}
              onChange={(e) => setSearchParam(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
          <Button variant="outline" size="sm" onClick={refreshList} disabled={loading}>
            <MagnifyingGlass className="size-4" aria-hidden />
            Buscar
          </Button>
        </div>

        {/* ---- Table ---- */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          {loading && campaigns.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <CircularProgress size="md" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {['Nombre', 'Asunto', 'Lista de Contactos', 'Estado', 'Fecha Creacion'].map((c) => (
                      <th
                        key={c}
                        className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {c}
                      </th>
                    ))}
                    <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {campaigns.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Megaphone className="size-12 text-muted-foreground/50" aria-hidden />
                          <p className="text-sm text-muted-foreground">
                            {searchParam
                              ? 'No se encontraron campanas con ese criterio'
                              : 'No hay campanas creadas todavia'}
                          </p>
                          {!searchParam && (
                            <Button size="sm" onClick={() => setOpenCreateModal(true)}>
                              <Plus className="size-4" weight="bold" aria-hidden />
                              Crear primera campana
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    campaigns.map((campaign) => {
                      const isActioning = actionLoading === campaign.id
                      const canPlay =
                        campaign.status === 'INACTIVA' ||
                        campaign.status === 'PROGRAMADA' ||
                        campaign.status === 'CANCELADA'
                      const canPause = campaign.status === 'EN_ANDAMENTO'

                      return (
                        <tr key={campaign.id} className="transition-colors hover:bg-accent/40">
                          {/* Nombre */}
                          <td className="px-4 py-3 font-medium text-foreground">{campaign.name}</td>

                          {/* Asunto */}
                          <td className="px-4 py-3">
                            <span className="block max-w-[220px] truncate text-muted-foreground">
                              {campaign.subject || '-'}
                            </span>
                          </td>

                          {/* Lista de Contactos */}
                          <td className="px-4 py-3">
                            {campaign.contactList ? (
                              <Badge variant="neutral">{campaign.contactList.name}</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Sin lista</span>
                            )}
                          </td>

                          {/* Estado */}
                          <td className="px-4 py-3">
                            <Badge variant={STATUS_VARIANT[campaign.status] ?? 'neutral'}>
                              {STATUS_LABEL[campaign.status] ?? campaign.status}
                            </Badge>
                          </td>

                          {/* Fecha Creacion */}
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {campaign.createdAt
                              ? new Date(campaign.createdAt).toLocaleDateString('es-ES', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                })
                              : '-'}
                          </td>

                          {/* Acciones */}
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-0.5">
                              {isActioning ? (
                                <CircularProgress size="sm" />
                              ) : (
                                <>
                                  {canPlay && (
                                    <ActionBtn
                                      label="Iniciar campana"
                                      onClick={() => handlePlay(campaign)}
                                      className="text-success-text hover:bg-success/10 hover:text-success-text"
                                    >
                                      <Play className="size-[18px]" aria-hidden />
                                    </ActionBtn>
                                  )}

                                  {canPause && (
                                    <ActionBtn
                                      label="Pausar campana"
                                      onClick={() => handlePause(campaign)}
                                      className="text-warning-text hover:bg-warning/10 hover:text-warning-text"
                                    >
                                      <Pause className="size-[18px]" aria-hidden />
                                    </ActionBtn>
                                  )}

                                  <ActionBtn
                                    label="Editar campana"
                                    onClick={() => {}}
                                    disabled
                                  >
                                    <PencilSimple className="size-[18px]" aria-hidden />
                                  </ActionBtn>

                                  <ActionBtn
                                    label="Eliminar campana"
                                    onClick={() => openDelete(campaign)}
                                    className="hover:bg-destructive/10 hover:text-destructive-text"
                                  >
                                    <Trash className="size-[18px]" aria-hidden />
                                  </ActionBtn>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center p-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                loading={loading}
              >
                Cargar mas
              </Button>
            </div>
          )}

          {/* Loading overlay while paginating */}
          {loading && campaigns.length > 0 && (
            <div className="flex justify-center py-4">
              <CircularProgress size="sm" />
            </div>
          )}
        </div>
      </div>

      {/* ---- Create Campaign Modal ---- */}
      <Dialog
        open={openCreateModal}
        onOpenChange={(o) => {
          if (!o) handleCloseCreateModal()
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PaperPlaneTilt className="size-5 text-primary" aria-hidden />
              Nueva Campana de Email
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Nombre */}
            <div className="space-y-1.5">
              <Label htmlFor="campaign-name">
                Nombre de la campana <span className="text-destructive-text">*</span>
              </Label>
              <input
                id="campaign-name"
                placeholder="Ej: Newsletter Febrero 2026"
                value={form.name}
                onChange={(e) => handleFormChange('name', e.target.value)}
                aria-invalid={!!formErrors.name || undefined}
                className={cn(
                  inputClasses,
                  formErrors.name &&
                    'border-destructive hover:border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30',
                )}
              />
              {formErrors.name && (
                <p className="text-xs text-destructive-text">{formErrors.name}</p>
              )}
            </div>

            {/* Asunto */}
            <div className="space-y-1.5">
              <Label htmlFor="campaign-subject">
                Asunto del email <span className="text-destructive-text">*</span>
              </Label>
              <input
                id="campaign-subject"
                placeholder="Asunto que veran los destinatarios"
                value={form.subject}
                onChange={(e) => handleFormChange('subject', e.target.value)}
                aria-invalid={!!formErrors.subject || undefined}
                className={cn(
                  inputClasses,
                  formErrors.subject &&
                    'border-destructive hover:border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30',
                )}
              />
              {formErrors.subject && (
                <p className="text-xs text-destructive-text">{formErrors.subject}</p>
              )}
            </div>

            {/* Lista de Contactos */}
            <div className="space-y-1.5">
              <Label htmlFor="campaign-list">Lista de contactos (email)</Label>
              {contactLists.length === 0 ? (
                <p className="rounded-md border border-input bg-muted/40 px-3.5 py-2.5 text-sm text-muted-foreground">
                  No hay listas de email disponibles
                </p>
              ) : (
                <Select
                  value={form.contactListId || undefined}
                  onValueChange={(value) => handleFormChange('contactListId', value)}
                >
                  <SelectTrigger id="campaign-list" className="h-11">
                    <SelectValue placeholder="Seleccionar lista..." />
                  </SelectTrigger>
                  <SelectContent>
                    {contactLists.map((list) => (
                      <SelectItem key={list.id} value={String(list.id)}>
                        {list.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Contenido HTML */}
            <div className="space-y-1.5">
              <Label htmlFor="campaign-html">Contenido HTML</Label>
              <textarea
                id="campaign-html"
                placeholder="Pega aqui el contenido HTML de tu email..."
                rows={5}
                value={form.htmlContent}
                onChange={(e) => handleFormChange('htmlContent', e.target.value)}
                className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 font-mono text-xs text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>

            {/* Fecha de envio */}
            <div className="space-y-1.5">
              <Label htmlFor="campaign-sendat">Fecha y hora de envio (opcional)</Label>
              <input
                id="campaign-sendat"
                type="datetime-local"
                value={form.sendAt}
                onChange={(e) => handleFormChange('sendAt', e.target.value)}
                className={inputClasses}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCloseCreateModal}
              disabled={formSubmitting}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreateSubmit} loading={formSubmitting}>
              {!formSubmitting && <PaperPlaneTilt className="size-4" aria-hidden />}
              {formSubmitting ? 'Creando...' : 'Crear Campana'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Delete Confirmation Modal ---- */}
      <Dialog
        open={openDeleteModal}
        onOpenChange={(o) => {
          if (!o) {
            setOpenDeleteModal(false)
            setSelectedCampaign(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md" role="alertdialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash className="size-5 text-destructive-text" aria-hidden />
              Eliminar campana
            </DialogTitle>
            <DialogDescription>
              Estas a punto de eliminar la campana{' '}
              <span className="font-bold text-foreground">"{selectedCampaign?.name}"</span>. Esta
              accion no se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpenDeleteModal(false)
                setSelectedCampaign(null)
              }}
              disabled={actionLoading !== null}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDeleteConfirm}
              loading={actionLoading !== null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading === null && <Trash className="size-4" aria-hidden />}
              {actionLoading !== null ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
