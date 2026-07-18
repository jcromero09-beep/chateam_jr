import { useState, useEffect, useCallback } from 'react'
import { CircularProgress } from '@mui/joy'
import {
  TextAa,
  Plus,
  PencilSimple,
  Trash,
  MagnifyingGlass,
  WhatsappLogo,
  TreeStructure,
  ArrowClockwise,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { RowAction } from '@/components/ui/row-action'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import api from '../services/api'
import { toast } from 'react-toastify'

interface FlowCampaign {
  id: number
  name: string
  phrase: string
  flowId: number
  whatsappId: number
  status: boolean
  companyId: number
  createdAt: string
}

interface FlowOption {
  id: number
  name: string
}

interface WhatsappOption {
  id: number
  name: string
}

export default function FlowbuilderCampaign() {
  const [campaigns, setCampaigns] = useState<FlowCampaign[]>([])
  const [flows, setFlows] = useState<FlowOption[]>([])
  const [whatsapps, setWhatsapps] = useState<WhatsappOption[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Modal
  const [openModal, setOpenModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    phrase: '',
    flowId: '',
    whatsappId: '',
  })
  const [saving, setSaving] = useState(false)

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/flowcampaign')
      setCampaigns(data.flow || data || [])
    } catch (error) {
      console.error('Error cargando palabras clave:', error)
      toast.error('Error al cargar las palabras clave')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchFlows = useCallback(async () => {
    try {
      const { data } = await api.get('/flowbuilder')
      const flowList = (data.flows || data || []).map((f: any) => ({
        id: f.id,
        name: f.name,
      }))
      setFlows(flowList)
    } catch (error) {
      console.error('Error cargando flujos:', error)
    }
  }, [])

  const fetchWhatsapps = useCallback(async () => {
    try {
      const { data } = await api.get('/whatsapp')
      const list = (data || []).map((w: any) => ({
        id: w.id,
        name: w.name,
      }))
      setWhatsapps(list)
    } catch (error) {
      console.error('Error cargando conexiones:', error)
    }
  }, [])

  useEffect(() => {
    fetchCampaigns()
    fetchFlows()
    fetchWhatsapps()
  }, [fetchCampaigns, fetchFlows, fetchWhatsapps])

  const resetForm = () => {
    setFormData({ name: '', phrase: '', flowId: '', whatsappId: '' })
    setEditingId(null)
  }

  const handleOpenCreate = () => {
    resetForm()
    setOpenModal(true)
  }

  const handleOpenEdit = (campaign: FlowCampaign) => {
    setEditingId(campaign.id)
    setFormData({
      name: campaign.name,
      phrase: campaign.phrase,
      flowId: campaign.flowId?.toString() || '',
      whatsappId: campaign.whatsappId?.toString() || '',
    })
    setOpenModal(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) return toast.error('El nombre es obligatorio')
    if (!formData.phrase.trim()) return toast.error('La palabra clave es obligatoria')
    if (!formData.flowId) return toast.error('Selecciona un flujo')
    if (!formData.whatsappId) return toast.error('Selecciona una conexion')

    try {
      setSaving(true)
      if (editingId) {
        await api.put('/flowcampaign', {
          id: editingId,
          name: formData.name,
          phrase: formData.phrase,
          flowId: Number(formData.flowId),
          whatsappId: formData.whatsappId,
        })
        toast.success('Palabra clave actualizada')
      } else {
        await api.post('/flowcampaign', {
          name: formData.name,
          phrase: formData.phrase,
          flowId: Number(formData.flowId),
          whatsappId: formData.whatsappId,
        })
        toast.success('Palabra clave creada')
      }
      setOpenModal(false)
      resetForm()
      fetchCampaigns()
    } catch (error: any) {
      console.error('Error guardando:', error)
      toast.error(error.response?.data?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Eliminar esta palabra clave?')) return
    try {
      await api.delete(`/flowcampaign/${id}`)
      toast.success('Palabra clave eliminada')
      fetchCampaigns()
    } catch (error) {
      toast.error('Error al eliminar')
    }
  }

  const handleToggleStatus = async (campaign: FlowCampaign) => {
    try {
      await api.put('/flowcampaign', {
        id: campaign.id,
        name: campaign.name,
        phrase: campaign.phrase,
        flowId: campaign.flowId,
        whatsappId: campaign.whatsappId.toString(),
        status: !campaign.status,
      })
      fetchCampaigns()
    } catch (error) {
      toast.error('Error al cambiar estado')
    }
  }

  const getFlowName = (id: number) => flows.find(f => f.id === id)?.name || `#${id}`
  const getWhatsappName = (id: number) => whatsapps.find(w => w.id === id)?.name || `#${id}`

  const filtered = campaigns.filter(c =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phrase?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const closeModal = () => {
    setOpenModal(false)
    resetForm()
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <TextAa className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Palabras Clave
              </h1>
              <p className="text-sm text-muted-foreground">
                Configura palabras que disparan flujos automaticamente
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={fetchCampaigns}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={handleOpenCreate}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nueva Palabra Clave
            </Button>
          </div>
        </div>

        {/* Info */}
        <div className="rounded-lg border border-border bg-accent/50 p-4 text-sm text-accent-foreground">
          Cuando un cliente envia un mensaje que contenga la palabra clave configurada,
          se ejecutara automaticamente el flujo asignado en la conexion seleccionada.
          La comparacion ignora mayusculas, tildes y espacios extra.
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <MagnifyingGlass
            className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            placeholder="Buscar por nombre o palabra clave..."
            aria-label="Buscar palabras clave"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          {loading ? (
            <div className="flex justify-center py-12">
              <CircularProgress size="lg" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <TextAa className="size-12 text-muted-foreground" aria-hidden />
              <p className="text-base text-muted-foreground">
                {searchTerm ? 'Sin resultados' : 'No hay palabras clave configuradas'}
              </p>
              <p className="text-sm text-muted-foreground">
                {searchTerm ? 'Intenta con otro termino' : 'Crea tu primera palabra clave para disparar flujos'}
              </p>
              {!searchTerm && (
                <Button variant="outline" size="sm" className="mt-2" onClick={handleOpenCreate}>
                  <Plus className="size-4" weight="bold" aria-hidden />
                  Crear primera palabra clave
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nombre</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Palabra Clave</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Flujo</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conexion</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((campaign) => {
                    const active = campaign.status !== false
                    return (
                      <tr key={campaign.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3 font-medium text-foreground">{campaign.name}</td>
                        <td className="px-4 py-3">
                          <Badge variant="primary">
                            <TextAa className="size-3.5" aria-hidden />
                            {campaign.phrase}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-foreground">
                            <TreeStructure className="size-4 text-brand-teal" aria-hidden />
                            <span>{getFlowName(campaign.flowId)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-foreground">
                            <WhatsappLogo className="size-4 text-wa" weight="fill" aria-hidden />
                            <span>{getWhatsappName(campaign.whatsappId)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={active}
                            aria-label={active ? 'Desactivar palabra clave' : 'Activar palabra clave'}
                            onClick={() => handleToggleStatus(campaign)}
                            className={cn(
                              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                              active ? 'bg-success' : 'bg-muted-foreground/40',
                            )}
                          >
                            <span
                              className={cn(
                                'inline-block size-5 rounded-full bg-white shadow transition-transform',
                                active ? 'translate-x-5' : 'translate-x-0.5',
                              )}
                              aria-hidden
                            />
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-0.5">
                            <RowAction label="Editar">
                              <button
                                type="button"
                                aria-label="Editar"
                                onClick={() => handleOpenEdit(campaign)}
                                className="flex size-full items-center justify-center"
                              >
                                <PencilSimple className="size-[18px]" aria-hidden />
                              </button>
                            </RowAction>
                            <button
                              type="button"
                              aria-label="Eliminar"
                              title="Eliminar"
                              onClick={() => handleDelete(campaign.id)}
                              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-text"
                            >
                              <Trash className="size-[18px]" aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Stats */}
        {campaigns.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Total: {campaigns.length}</Badge>
            <Badge variant="success">
              Activas: {campaigns.filter(c => c.status !== false).length}
            </Badge>
            <Badge variant="neutral">
              Inactivas: {campaigns.filter(c => c.status === false).length}
            </Badge>
          </div>
        )}
      </div>

      {/* Modal Crear/Editar */}
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
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">
                {editingId ? 'Editar Palabra Clave' : 'Nueva Palabra Clave'}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {editingId
                  ? 'Modifica la configuracion de esta palabra clave'
                  : 'Cuando un cliente envie un mensaje con esta palabra, se ejecutara el flujo seleccionado'}
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="fc-name">Nombre</Label>
                <input
                  id="fc-name"
                  placeholder="Ej: Saludo inicial, Soporte..."
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fc-phrase">Palabra Clave</Label>
                <div className="relative">
                  <TextAa
                    className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <input
                    id="fc-phrase"
                    placeholder="Ej: hola, menu, soporte, precios..."
                    value={formData.phrase}
                    onChange={(e) => setFormData(prev => ({ ...prev, phrase: e.target.value }))}
                    className="h-11 w-full rounded-md border border-input bg-card pl-10 pr-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Se activara cuando el mensaje del cliente CONTENGA esta palabra (sin importar mayusculas o tildes)
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fc-flow">Flujo a ejecutar</Label>
                <Select
                  value={formData.flowId}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, flowId: value }))}
                >
                  <SelectTrigger id="fc-flow" className="h-11">
                    <span className="flex items-center gap-2 truncate">
                      <TreeStructure className="size-[18px] shrink-0 text-brand-teal" aria-hidden />
                      <SelectValue placeholder="Selecciona un flujo..." />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {flows.map(f => (
                      <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fc-whatsapp">Conexion</Label>
                <Select
                  value={formData.whatsappId}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, whatsappId: value }))}
                >
                  <SelectTrigger id="fc-whatsapp" className="h-11">
                    <span className="flex items-center gap-2 truncate">
                      <WhatsappLogo className="size-[18px] shrink-0 text-wa" weight="fill" aria-hidden />
                      <SelectValue placeholder="Selecciona una conexion..." />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {whatsapps.map(w => (
                      <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  La palabra clave solo se detectara en mensajes de esta conexion
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={closeModal}>
                  Cancelar
                </Button>
                <Button size="sm" loading={saving} onClick={handleSave}>
                  {editingId ? 'Guardar Cambios' : 'Crear Palabra Clave'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
