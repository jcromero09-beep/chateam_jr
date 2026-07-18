import { useEffect, useMemo, useState } from 'react'
import { CircularProgress } from '@mui/joy'
import {
  LinkSimple,
  ArrowClockwise,
  Plus,
  Copy,
} from '@phosphor-icons/react'
import { toast } from 'react-toastify'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
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

interface Program {
  id: number
  name: string
  rewardType: 'tokens' | 'days'
  rewardTokens: number
  rewardDays: number
  status: string
}

interface AffiliateLinkRow {
  id: number
  slug: string
  affiliateId: number
  clicks: number
  conversions: number
  createdAt: string
  status: string
  affiliate?: { id: number; name: string; rewardType: string; rewardTokens: number; rewardDays: number }
}

const columns = ['Programa', 'Recompensa', 'Link', 'Clicks', 'Conversiones', 'Creado', 'Estado', '']

const buildPublicUrl = (slug: string) => {
  const origin = window.location.origin
  return `${origin}/signup?ref=${slug}`
}

export default function AffiliateLinks() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<AffiliateLinkRow[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [openModal, setOpenModal] = useState(false)
  const [programs, setPrograms] = useState<Program[]>([])
  const [selectedProgram, setSelectedProgram] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const limit = 20
  const totalPages = Math.max(1, Math.ceil(count / limit))

  useEffect(() => { fetchLinks() }, [page])
  useEffect(() => { fetchPrograms() }, [])

  const fetchLinks = async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/affiliates/links', { params: { page, limit } })
      setRows(data?.data?.rows || [])
      setCount(data?.data?.count || 0)
    } catch (err) {
      console.error('Error cargando links', err)
      toast.error('Error al cargar links')
    } finally {
      setLoading(false)
    }
  }

  const fetchPrograms = async () => {
    try {
      const { data } = await api.get('/affiliates/programs-available', {
        params: { limit: 100, status: 'active' },
      })
      const list: Program[] = data?.data?.rows || []
      setPrograms(list.filter(p => p.status === 'active'))
    } catch (err) {
      console.error('Error cargando programas', err)
    }
  }

  const handleCreate = async () => {
    if (!selectedProgram) {
      toast.error('Selecciona un programa')
      return
    }
    try {
      setCreating(true)
      await api.post('/affiliates/links', { programId: Number(selectedProgram) })
      toast.success('Link creado')
      setOpenModal(false)
      setSelectedProgram('')
      fetchLinks()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al crear link')
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = async (slug: string) => {
    const url = buildPublicUrl(slug)
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado al portapapeles')
    } catch {
      toast.info(url)
    }
  }

  const programsById = useMemo(() => {
    const m: Record<number, Program> = {}
    programs.forEach(p => { m[p.id] = p })
    return m
  }, [programs])

  const statusBadge = (status: string): { label: string; variant: BadgeProps['variant'] } =>
    status === 'active'
      ? { label: 'Activo', variant: 'success' }
      : { label: 'Inactivo', variant: 'neutral' }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <LinkSimple className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Mis Links de Afiliado
              </h1>
              <p className="text-sm text-muted-foreground">
                Cada link redirige al signup con tu código de referencia.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar"
              className="text-muted-foreground"
              onClick={fetchLinks}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={() => setOpenModal(true)}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Crear link
            </Button>
          </div>
        </div>

        {/* Links Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center p-10 text-muted-foreground">
                <CircularProgress size="md" />
              </div>
            ) : rows.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Todavía no creaste ningún link.
              </div>
            ) : (
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
                  {rows.map((l) => {
                    const program = l.affiliate || programsById[l.affiliateId]
                    const url = buildPublicUrl(l.slug)
                    const status = statusBadge(l.status)
                    return (
                      <tr key={l.id} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3 font-medium text-foreground">{program?.name || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {program?.rewardType === 'tokens'
                            ? `${Number(program.rewardTokens || 0).toLocaleString()} tokens`
                            : program?.rewardType === 'days'
                              ? `${program?.rewardDays || 0} días`
                              : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="block max-w-[360px] break-all font-mono text-xs text-muted-foreground">
                            {url}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">{l.clicks}</td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">{l.conversions}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {l.createdAt ? new Date(l.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-0.5">
                            <button
                              type="button"
                              aria-label="Copiar link"
                              title="Copiar link"
                              onClick={() => handleCopy(l.slug)}
                              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                              <Copy className="size-[18px]" aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {count} links — página {page} de {totalPages}
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

      {/* Modal Crear link */}
      <Dialog
        open={openModal}
        onOpenChange={(o) => {
          setOpenModal(o)
          if (!o) setSelectedProgram('')
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crear nuevo link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="affiliate-program">Programa</Label>
              <Select value={selectedProgram} onValueChange={setSelectedProgram}>
                <SelectTrigger id="affiliate-program">
                  <SelectValue placeholder="Selecciona un programa" />
                </SelectTrigger>
                <SelectContent>
                  {programs.length === 0 ? (
                    <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                      No hay programas activos
                    </div>
                  ) : (
                    programs.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name} —{' '}
                        {p.rewardType === 'tokens'
                          ? `${Number(p.rewardTokens).toLocaleString()} tokens`
                          : `${p.rewardDays} días`}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setOpenModal(false)}>
                Cancelar
              </Button>
              <Button size="sm" loading={creating} onClick={handleCreate}>
                Generar link
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
