import { useEffect, useState } from 'react'
import {
  Handshake,
  ArrowClockwise,
  Plus,
  PencilSimple,
  CircleNotch,
} from '@phosphor-icons/react'
import { toast } from 'react-toastify'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import api from '../services/api'

type RewardType = 'tokens' | 'days'

interface Program {
  id: number
  name: string
  description: string | null
  status: 'active' | 'inactive' | string
  rewardType: RewardType
  rewardTokens: number
  rewardDays: number
  referralCode: string
  createdAt: string
  company?: { id: number; name: string }
}

const columns = ['Nombre', 'Recompensa', 'Cantidad', 'Empresa dueña', 'Estado', 'Creado', '']

export default function AffiliatePrograms() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Program[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [openModal, setOpenModal] = useState(false)
  const [editing, setEditing] = useState<Program | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    rewardType: 'tokens' as RewardType,
    rewardTokens: '1000',
    rewardDays: '7',
    status: 'active',
  })
  const [saving, setSaving] = useState(false)
  const limit = 20
  const totalPages = Math.max(1, Math.ceil(count / limit))

  useEffect(() => { fetchPrograms() }, [page])

  const fetchPrograms = async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/affiliates/programs', { params: { page, limit } })
      setRows(data?.data?.rows || [])
      setCount(data?.data?.count || 0)
    } catch (e) {
      console.error(e)
      toast.error('Error al cargar programas')
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({
      name: '',
      description: '',
      rewardType: 'tokens',
      rewardTokens: '1000',
      rewardDays: '7',
      status: 'active',
    })
    setOpenModal(true)
  }

  const openEdit = (p: Program) => {
    setEditing(p)
    setForm({
      name: p.name || '',
      description: p.description || '',
      rewardType: p.rewardType || 'tokens',
      rewardTokens: String(p.rewardTokens ?? 0),
      rewardDays: String(p.rewardDays ?? 0),
      status: p.status || 'active',
    })
    setOpenModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    if (form.rewardType === 'tokens' && Number(form.rewardTokens) <= 0) {
      toast.error('Debes especificar una cantidad de tokens mayor a 0')
      return
    }
    if (form.rewardType === 'days' && Number(form.rewardDays) <= 0) {
      toast.error('Debes especificar una cantidad de días mayor a 0')
      return
    }

    try {
      setSaving(true)
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        rewardType: form.rewardType,
        rewardTokens: form.rewardType === 'tokens' ? Number(form.rewardTokens) : 0,
        rewardDays: form.rewardType === 'days' ? Number(form.rewardDays) : 0,
        status: form.status,
      }

      if (editing) {
        await api.put(`/affiliates/programs/${editing.id}`, payload)
        toast.success('Programa actualizado')
      } else {
        await api.post('/affiliates/programs', payload)
        toast.success('Programa creado')
      }
      setOpenModal(false)
      fetchPrograms()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (p: Program) => {
    try {
      const action = p.status === 'active' ? 'deactivate' : 'activate'
      await api.post(`/affiliates/programs/${p.id}/${action}`)
      fetchPrograms()
    } catch {
      toast.error('Error al cambiar estado')
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Handshake className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Programas de Afiliados
              </h1>
              <p className="text-sm text-muted-foreground">
                Define qué recompensa entregas al afiliador por cada cliente.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={fetchPrograms}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nuevo programa
            </Button>
          </div>
        </div>

        {/* Programs Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
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
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <CircleNotch className="size-5 animate-spin" aria-hidden />
                        Cargando programas...
                      </span>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      No hay programas creados todavía.
                    </td>
                  </tr>
                ) : (
                  rows.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{p.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {p.description || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={p.rewardType === 'tokens' ? 'primary' : 'success'}>
                          {p.rewardType === 'tokens' ? 'Tokens IA' : 'Días extra'}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                        {p.rewardType === 'tokens'
                          ? `${Number(p.rewardTokens).toLocaleString()} tokens`
                          : `${p.rewardDays} días`}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.company?.name || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={p.status === 'active' ? 'success' : 'neutral'} dot>
                          {p.status === 'active' ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString('es-ES') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            aria-label="Editar"
                            title="Editar"
                            onClick={() => openEdit(p)}
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            <PencilSimple className="size-[18px]" aria-hidden />
                          </button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={
                              p.status === 'active'
                                ? undefined
                                : 'text-success-text hover:bg-success/10 hover:text-success-text'
                            }
                            onClick={() => toggleStatus(p)}
                          >
                            {p.status === 'active' ? 'Desactivar' : 'Activar'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {count} programas — página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>

      {/* Modal Create/Edit */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar programa' : 'Nuevo programa'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ap-name">Nombre</Label>
              <Input
                id="ap-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Programa Pro"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ap-description">Descripción</Label>
              <textarea
                id="ap-description"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ap-reward-type">Tipo de recompensa</Label>
              <Select
                value={form.rewardType}
                onValueChange={(v) => setForm({ ...form, rewardType: (v as RewardType) || 'tokens' })}
              >
                <SelectTrigger id="ap-reward-type">
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tokens">Tokens IA</SelectItem>
                  <SelectItem value="days">Días extra de suscripción</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.rewardType === 'tokens' ? (
              <div className="space-y-1.5">
                <Label htmlFor="ap-tokens">Cantidad de tokens IA</Label>
                <Input
                  id="ap-tokens"
                  type="number"
                  min={1}
                  value={form.rewardTokens}
                  onChange={(e) => setForm({ ...form, rewardTokens: e.target.value })}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="ap-days">Cantidad de días extra</Label>
                <Input
                  id="ap-days"
                  type="number"
                  min={1}
                  value={form.rewardDays}
                  onChange={(e) => setForm({ ...form, rewardDays: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ap-status">Estado</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v || 'active' })}
              >
                <SelectTrigger id="ap-status">
                  <SelectValue placeholder="Selecciona un estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="inactive">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpenModal(false)}>
              Cancelar
            </Button>
            <Button size="sm" loading={saving} onClick={handleSave}>
              {editing ? 'Guardar cambios' : 'Crear programa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
