import { useState, useEffect } from 'react'
import {
  Sparkle,
  Plus,
  PencilSimple,
  Trash,
  ArrowClockwise,
  X,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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

// [Fase E] UI del motor de reglas de automatización. Backend: /automation-rules
// (admin-gated). Ver spec/modules/automation-rules-spec.md

// ─── Catálogos (deben coincidir con el evaluador RunTicketAutomationRules) ───
const EVENTS = [
  { value: 'ticket_created', label: 'Ticket creado' },
  { value: 'ticket_status_updated', label: 'Cambió el estado' },
  { value: 'ticket_queue_updated', label: 'Cambió la cola' },
]
const FIELDS = [
  { value: 'status', label: 'Estado' },
  { value: 'queueId', label: 'Cola' },
  { value: 'whatsappId', label: 'Conexión' },
  { value: 'channel', label: 'Canal' },
]
const OPS = [
  { value: 'eq', label: '= igual a' },
  { value: 'neq', label: '≠ distinto de' },
  { value: 'in', label: '∈ está en (lista separada por comas)' },
  { value: 'isEmpty', label: 'está vacío' },
]
const ACTION_TYPES = [
  { value: 'assign_user', label: 'Asignar agente' },
  { value: 'set_queue', label: 'Mover a cola' },
  { value: 'add_tag', label: 'Agregar etiqueta' },
  { value: 'send_message', label: 'Enviar mensaje' },
]

interface Condition {
  field: string
  op: string
  value: string
}
interface Action {
  type: string
  userId?: number
  queueId?: number
  tagId?: number
  text?: string
}
interface Rule {
  id: number
  name: string
  event: string
  conditions: Condition[]
  actions: Action[]
  active: boolean
  priority: number
}

const emptyForm = {
  name: '',
  event: 'ticket_created',
  priority: 0,
  active: true,
  conditions: [] as Condition[],
  actions: [{ type: 'assign_user' }] as Action[],
}

// Estilos base compartidos para los inputs de texto (mismos tokens que Tags/Connections).
const inputCls =
  'h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'
const rowInputCls =
  'h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

// Toggle accesible (role=switch) con tokens del design system — no hay wrapper Switch en @/components/ui.
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
        aria-hidden
      />
    </button>
  )
}

export default function AutomationRules() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [openModal, setOpenModal] = useState(false)
  const [selected, setSelected] = useState<Rule | null>(null)
  const [form, setForm] = useState<typeof emptyForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  // Catálogos para los selectores de acciones
  const [users, setUsers] = useState<{ id: number; name: string }[]>([])
  const [queues, setQueues] = useState<{ id: number; name: string }[]>([])
  const [tags, setTags] = useState<{ id: number; name: string }[]>([])

  useEffect(() => {
    fetchRules()
    fetchCatalogs()
  }, [])

  const fetchRules = async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/automation-rules')
      setRules(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Error cargando reglas:', e)
      setRules([])
    } finally {
      setLoading(false)
    }
  }

  const fetchCatalogs = async () => {
    try {
      const [u, q, t] = await Promise.all([
        api.get('/users'),
        api.get('/queue'),
        api.get('/tags'),
      ])
      setUsers(u.data.users || u.data || [])
      setQueues(q.data.queues || q.data || [])
      setTags(t.data.tags || t.data || [])
    } catch (e) {
      console.error('Error cargando catálogos:', e)
    }
  }

  const openCreate = () => {
    setSelected(null)
    setForm({ ...emptyForm, conditions: [], actions: [{ type: 'assign_user' }] })
    setOpenModal(true)
  }

  const openEdit = (rule: Rule) => {
    setSelected(rule)
    setForm({
      name: rule.name,
      event: rule.event,
      priority: rule.priority ?? 0,
      active: rule.active,
      conditions: Array.isArray(rule.conditions) ? rule.conditions : [],
      actions: Array.isArray(rule.actions) && rule.actions.length ? rule.actions : [{ type: 'assign_user' }],
    })
    setOpenModal(true)
  }

  const save = async () => {
    if (!form.name.trim()) {
      alert('El nombre es obligatorio')
      return
    }
    // Normaliza el valor de la condición "in" a arreglo
    const conditions = form.conditions.map((c) =>
      c.op === 'in'
        ? { ...c, value: String(c.value).split(',').map((s) => s.trim()).filter(Boolean) as any }
        : c
    )
    const payload = { ...form, conditions }
    try {
      setSaving(true)
      if (selected) await api.put(`/automation-rules/${selected.id}`, payload)
      else await api.post('/automation-rules', payload)
      setOpenModal(false)
      fetchRules()
    } catch (e: any) {
      console.error('Error guardando regla:', e)
      alert(e?.response?.data?.error || e?.response?.data?.message || 'No se pudo guardar la regla')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (rule: Rule) => {
    try {
      await api.put(`/automation-rules/${rule.id}`, { active: !rule.active })
      fetchRules()
    } catch (e) {
      console.error('Error cambiando estado:', e)
    }
  }

  const remove = async (rule: Rule) => {
    if (!confirm(`¿Eliminar la regla "${rule.name}"?`)) return
    try {
      await api.delete(`/automation-rules/${rule.id}`)
      fetchRules()
    } catch (e) {
      console.error('Error eliminando regla:', e)
    }
  }

  // ─── Helpers de edición de condiciones/acciones ───
  const setCond = (i: number, patch: Partial<Condition>) =>
    setForm((f) => ({ ...f, conditions: f.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }))
  const addCond = () =>
    setForm((f) => ({ ...f, conditions: [...f.conditions, { field: 'status', op: 'eq', value: '' }] }))
  const delCond = (i: number) =>
    setForm((f) => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }))

  const setAction = (i: number, patch: Partial<Action>) =>
    setForm((f) => ({ ...f, actions: f.actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) }))
  const addAction = () =>
    setForm((f) => ({ ...f, actions: [...f.actions, { type: 'assign_user' }] }))
  const delAction = (i: number) =>
    setForm((f) => ({ ...f, actions: f.actions.filter((_, idx) => idx !== i) }))

  const eventLabel = (v: string) => EVENTS.find((e) => e.value === v)?.label || v
  const summarizeActions = (as: Action[]) =>
    (as || [])
      .map((a) => {
        if (a.type === 'assign_user') return `→ ${users.find((u) => u.id === a.userId)?.name || 'agente'}`
        if (a.type === 'set_queue') return `⇒ ${queues.find((q) => q.id === a.queueId)?.name || 'cola'}`
        if (a.type === 'add_tag') return `# ${tags.find((t) => t.id === a.tagId)?.name || 'etiqueta'}`
        if (a.type === 'send_message') return '✉ mensaje'
        return a.type
      })
      .join('  ')

  const closeModal = () => setOpenModal(false)

  const stats = {
    total: rules.length,
    active: rules.filter((r) => r.active).length,
    events: new Set(rules.map((r) => r.event)).size,
  }

  const columns = ['Activa', 'Nombre', 'Evento', 'Condiciones', 'Acciones', 'Prioridad', '']

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Sparkle className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Automatizaciones
              </h1>
              <p className="text-sm text-muted-foreground">
                Reglas que se ejecutan sobre los tickets según eventos
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refrescar"
              className="text-muted-foreground"
              onClick={fetchRules}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nueva Regla
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile label="Total Reglas" value={String(stats.total)} />
          <StatTile label="Activas" value={String(stats.active)} tone="success" />
          <StatTile label="Eventos cubiertos" value={`${stats.events}/3`} />
        </div>

        {/* Tabla */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
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
                      Cargando reglas...
                    </td>
                  </tr>
                ) : rules.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      Aún no hay reglas. Crea la primera con "Nueva Regla".
                    </td>
                  </tr>
                ) : (
                  rules.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <Toggle
                          checked={!!r.active}
                          onChange={() => toggleActive(r)}
                          label={r.active ? 'Desactivar regla' : 'Activar regla'}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="primary">{eventLabel(r.event)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {(r.conditions?.length || 0) === 0 ? 'Siempre' : `${r.conditions.length} condición(es)`}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{summarizeActions(r.actions)}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.priority ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <RowAction label="Editar">
                            <button
                              type="button"
                              aria-label="Editar"
                              onClick={() => openEdit(r)}
                              className="flex size-full items-center justify-center"
                            >
                              <PencilSimple className="size-[18px]" aria-hidden />
                            </button>
                          </RowAction>
                          <button
                            type="button"
                            aria-label="Eliminar"
                            title="Eliminar"
                            onClick={() => remove(r)}
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-text"
                          >
                            <Trash className="size-[18px]" aria-hidden />
                          </button>
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

      {/* Modal crear/editar */}
      {openModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
        >
          <div
            className="max-h-[90vh] w-full max-w-[720px] overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {selected ? 'Editar regla' : 'Nueva regla'}
              </h2>
              <RowAction label="Cerrar">
                <button
                  type="button"
                  aria-label="Cerrar"
                  onClick={closeModal}
                  className="flex size-full items-center justify-center"
                >
                  <X className="size-[18px]" aria-hidden />
                </button>
              </RowAction>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="rule-name">Nombre</Label>
                  <input
                    id="rule-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ej: Auto-asignar nuevos"
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="rule-event">Evento</Label>
                  <Select value={form.event} onValueChange={(v) => setForm({ ...form, event: v })}>
                    <SelectTrigger id="rule-event" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENTS.map((e) => (
                        <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-1">
                  <Label htmlFor="rule-priority">Prioridad</Label>
                  <input
                    id="rule-priority"
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label>Regla activa</Label>
                <Toggle
                  checked={form.active}
                  onChange={() => setForm({ ...form, active: !form.active })}
                  label="Regla activa"
                />
              </div>

              <div className="border-t border-border" />

              {/* Condiciones */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Condiciones (todas deben cumplirse)</h3>
                  <Button variant="outline" size="sm" onClick={addCond}>
                    <Plus className="size-4" weight="bold" aria-hidden />
                    Añadir
                  </Button>
                </div>
                {form.conditions.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sin condiciones → la regla se aplica siempre.</p>
                )}
                <div className="space-y-2">
                  {form.conditions.map((c, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <Select value={c.field} onValueChange={(v) => setCond(i, { field: v })}>
                        <SelectTrigger className="min-w-[120px] flex-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELDS.map((f) => (
                            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={c.op} onValueChange={(v) => setCond(i, { op: v })}>
                        <SelectTrigger className="min-w-[140px] flex-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OPS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {c.op !== 'isEmpty' && (
                        <input
                          value={c.value ?? ''}
                          onChange={(e) => setCond(i, { value: e.target.value })}
                          placeholder="valor"
                          aria-label="Valor de la condición"
                          className={cn(rowInputCls, 'min-w-[120px] flex-1')}
                        />
                      )}
                      <button
                        type="button"
                        aria-label="Quitar condición"
                        title="Quitar condición"
                        onClick={() => delCond(i)}
                        className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-text"
                      >
                        <Trash className="size-[18px]" aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Acciones */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Acciones</h3>
                  <Button variant="outline" size="sm" onClick={addAction}>
                    <Plus className="size-4" weight="bold" aria-hidden />
                    Añadir
                  </Button>
                </div>
                <div className="space-y-2">
                  {form.actions.map((a, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <Select value={a.type} onValueChange={(v) => setAction(i, { type: v })}>
                        <SelectTrigger className="min-w-[170px] flex-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACTION_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {a.type === 'assign_user' && (
                        <Select
                          value={a.userId != null ? String(a.userId) : undefined}
                          onValueChange={(v) => setAction(i, { userId: Number(v) })}
                        >
                          <SelectTrigger className="min-w-[160px] flex-1">
                            <SelectValue placeholder="Agente" />
                          </SelectTrigger>
                          <SelectContent>
                            {users.map((u) => (
                              <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {a.type === 'set_queue' && (
                        <Select
                          value={a.queueId != null ? String(a.queueId) : undefined}
                          onValueChange={(v) => setAction(i, { queueId: Number(v) })}
                        >
                          <SelectTrigger className="min-w-[160px] flex-1">
                            <SelectValue placeholder="Cola" />
                          </SelectTrigger>
                          <SelectContent>
                            {queues.map((q) => (
                              <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {a.type === 'add_tag' && (
                        <Select
                          value={a.tagId != null ? String(a.tagId) : undefined}
                          onValueChange={(v) => setAction(i, { tagId: Number(v) })}
                        >
                          <SelectTrigger className="min-w-[160px] flex-1">
                            <SelectValue placeholder="Etiqueta" />
                          </SelectTrigger>
                          <SelectContent>
                            {tags.map((t) => (
                              <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {a.type === 'send_message' && (
                        <input
                          value={a.text ?? ''}
                          onChange={(e) => setAction(i, { text: e.target.value })}
                          placeholder="Texto del mensaje"
                          aria-label="Texto del mensaje"
                          className={cn(rowInputCls, 'min-w-[160px] flex-1')}
                        />
                      )}
                      <button
                        type="button"
                        aria-label="Quitar acción"
                        title="Quitar acción"
                        onClick={() => delAction(i)}
                        className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-text"
                      >
                        <Trash className="size-[18px]" aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={closeModal}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={save} loading={saving}>
                  {selected ? 'Guardar' : 'Crear'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
