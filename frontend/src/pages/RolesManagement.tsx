// [Fase3·N2.0] Gestión de Roles y Usuarios (admin de empresa):
// - Banner de asientos usados/totales del plan.
// - Tabla de usuarios con asignación de rol (dropdown).
// - Tabla de roles (presets de sistema + roles de la empresa) con nº de módulos y clonar.
import { useEffect, useMemo, useState } from 'react'
import {
  UsersThree, IdentificationBadge, Copy, ShieldCheck, WarningCircle,
  PencilSimple, MagnifyingGlass, Check
} from '@phosphor-icons/react'
import api from '../services/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PLAN_MANAGED_MODULES, type Module } from '../utils/permissions'
import { moduleCategories, categoryNames, formatModuleName, CATEGORY_ORDER } from '../utils/moduleCatalog'

interface Role {
  id: number
  companyId: number | null
  name: string
  key: string
  isSystem: boolean
  unrestricted: boolean
  editable: boolean
  permissions: Record<string, unknown>
}
interface UserRow {
  id: number
  name: string
  email: string
  profile: string
  roleId: number | null
}
interface Seats { used: number; total: number; unlimited: boolean }

export default function RolesManagement() {
  const [roles, setRoles] = useState<Role[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [seats, setSeats] = useState<Seats | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  // Editor de matriz de permisos
  const [editing, setEditing] = useState<Role | null>(null)
  const [draft, setDraft] = useState<Record<string, boolean>>({})
  const [permSearch, setPermSearch] = useState('')
  const [savingPerms, setSavingPerms] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [r, s, u] = await Promise.all([
        api.get('/roles'),
        api.get('/roles/seats'),
        api.get('/users/list')
      ])
      setRoles(r.data.roles || [])
      setSeats(s.data)
      const list = u.data?.users || u.data || []
      setUsers(Array.isArray(list) ? list : [])
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo cargar la gestión de roles.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const roleName = useMemo(() => {
    const m = new Map<number, string>()
    roles.forEach(r => m.set(r.id, r.name))
    return m
  }, [roles])

  const permCount = (r: Role) => (r.unrestricted ? '∞' : String(Object.keys(r.permissions || {}).length))

  const assignRole = async (userId: number, roleId: number | null) => {
    setSavingId(userId)
    try {
      await api.put(`/users/${userId}`, { roleId })
      setUsers(prev => prev.map(u => (u.id === userId ? { ...u, roleId } : u)))
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo asignar el rol.')
    } finally {
      setSavingId(null)
    }
  }

  const cloneRole = async (fromRoleId: number, name: string) => {
    try {
      await api.post('/roles', { fromRoleId, name: `${name} (copia)` })
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo clonar el rol.')
    }
  }

  // ── Editor de matriz de permisos ──────────────────────────────────────────
  const openEditor = (r: Role) => {
    const d: Record<string, boolean> = {}
    PLAN_MANAGED_MODULES.forEach((m) => { d[m] = (r.permissions as any)?.[m] === true })
    setDraft(d)
    setPermSearch('')
    setEditing(r)
  }
  const toggleModule = (m: string) => setDraft((prev) => ({ ...prev, [m]: !prev[m] }))
  const setGroup = (mods: Module[], on: boolean) =>
    setDraft((prev) => { const n = { ...prev }; mods.forEach((m) => { n[m] = on }); return n })

  // Módulos agrupados por categoría (respetando búsqueda).
  const groups = useMemo(() => {
    const q = permSearch.trim().toLowerCase()
    const byCat: Record<string, Module[]> = {}
    for (const m of PLAN_MANAGED_MODULES) {
      const label = formatModuleName(m).toLowerCase()
      if (q && !label.includes(q) && !m.includes(q)) continue
      const cat = moduleCategories[m] || 'general'
      ;(byCat[cat] = byCat[cat] || []).push(m)
    }
    return CATEGORY_ORDER.filter((c) => byCat[c]?.length).map((c) => ({ cat: c, mods: byCat[c] }))
  }, [permSearch])

  const draftCount = useMemo(() => Object.values(draft).filter(Boolean).length, [draft])

  const savePerms = async () => {
    if (!editing) return
    setSavingPerms(true)
    try {
      const permissions: Record<string, boolean> = {}
      Object.entries(draft).forEach(([m, on]) => { if (on) permissions[m] = true })
      const { data } = await api.put(`/roles/${editing.id}`, { permissions })
      setRoles((prev) => prev.map((r) => (r.id === editing.id ? { ...r, permissions: data.permissions } : r)))
      setEditing(null)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudieron guardar los permisos.')
    } finally {
      setSavingPerms(false)
    }
  }

  const seatPct = seats && seats.total > 0 ? Math.min(100, Math.round((seats.used / seats.total) * 100)) : 0
  const atLimit = seats && !seats.unlimited && seats.used >= seats.total

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal">
            <IdentificationBadge className="size-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-bold text-foreground">Roles y Usuarios</h1>
            <p className="text-sm text-muted-foreground">
              Asigna un tipo de rol a cada usuario. El acceso efectivo es <strong>plan ∩ rol</strong>.
            </p>
          </div>
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/12 px-3 py-2 text-sm text-destructive-text">
            <WarningCircle className="size-4 shrink-0" aria-hidden /> {error}
          </div>
        )}

        {/* Banner de asientos */}
        {seats && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <UsersThree className="size-5 text-brand-teal" aria-hidden /> Asientos del plan
              </span>
              <span className={`text-sm font-bold ${atLimit ? 'text-destructive-text' : 'text-foreground'}`}>
                {seats.used} / {seats.unlimited ? '∞' : seats.total}
              </span>
            </div>
            {!seats.unlimited && (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${atLimit ? 'bg-destructive' : 'bg-brand-teal'}`}
                  style={{ width: `${seatPct}%` }}
                />
              </div>
            )}
            {atLimit && (
              <p className="mt-2 text-xs text-destructive-text">
                Alcanzaste el límite de usuarios del plan. Amplía el plan para crear más.
              </p>
            )}
          </div>
        )}

        {/* Usuarios */}
        <section className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Usuarios ({users.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Usuario</th>
                  <th className="px-4 py-2 font-medium">Perfil</th>
                  <th className="px-4 py-2 font-medium">Rol asignado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">Cargando…</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">Sin usuarios.</td></tr>
                ) : users.map(u => (
                  <tr key={u.id} className="hover:bg-accent/40">
                    <td className="px-4 py-2">
                      <div className="font-medium text-foreground">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={u.profile === 'admin' ? 'primary' : 'neutral'}>{u.profile}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Select
                        value={u.roleId != null ? String(u.roleId) : '__none__'}
                        onValueChange={(v) => assignRole(u.id, v === '__none__' ? null : Number(v))}
                        disabled={savingId === u.id}
                      >
                        <SelectTrigger className="h-8 w-[220px] text-xs" aria-label={`Rol de ${u.name}`}>
                          <SelectValue placeholder="Sin rol" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sin rol (solo plan)</SelectItem>
                          {roles.map(r => (
                            <SelectItem key={r.id} value={String(r.id)}>
                              {r.name}{r.isSystem ? '' : ' · empresa'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Roles */}
        <section className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Roles disponibles ({roles.length})</h2>
            <p className="text-xs text-muted-foreground">Los presets del sistema se clonan para editarlos.</p>
          </div>
          <div className="divide-y divide-border">
            {roles.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <ShieldCheck className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">{r.name}</span>
                      {r.isSystem
                        ? <Badge variant="outline">preset</Badge>
                        : <Badge variant="primary">empresa</Badge>}
                      {r.unrestricted && <Badge variant="success">acceso total</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.unrestricted ? 'El plan decide todo' : `${permCount(r)} módulos permitidos`}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!r.isSystem && !r.unrestricted && (
                    <Button variant="outline" size="sm" onClick={() => openEditor(r)}>
                      <PencilSimple className="size-4" aria-hidden /> Editar permisos
                    </Button>
                  )}
                  {r.isSystem && !r.unrestricted && (
                    <Button variant="outline" size="sm" onClick={() => cloneRole(r.id, r.name)}>
                      <Copy className="size-4" aria-hidden /> Clonar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Editor de matriz de permisos módulo-por-módulo */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Permisos de «{editing?.name}»</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Marca los módulos que este rol puede ver. El acceso real sigue siendo <strong>plan ∩ rol</strong>:
              activar aquí un módulo que el plan no compró no lo habilita.
            </p>
          </DialogHeader>

          <div className="flex items-center gap-2 rounded-md border border-input bg-card px-3">
            <MagnifyingGlass className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              value={permSearch}
              onChange={(e) => setPermSearch(e.target.value)}
              placeholder="Buscar módulo…"
              aria-label="Buscar módulo"
              className="h-9 w-full border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <span className="shrink-0 text-xs text-muted-foreground">{draftCount} activos</span>
          </div>

          <ScrollArea className="max-h-[52vh]">
          <div className="space-y-4 pr-3">
            {groups.map(({ cat, mods }) => {
              const allOn = mods.every((m) => draft[m])
              return (
                <div key={cat}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">{categoryNames[cat]}</span>
                    <button
                      type="button"
                      onClick={() => setGroup(mods, !allOn)}
                      className="text-xs text-brand-teal hover:underline"
                    >
                      {allOn ? 'Quitar todos' : 'Marcar todos'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {mods.map((m) => {
                      const on = !!draft[m]
                      return (
                        <button
                          key={m}
                          type="button"
                          role="switch"
                          aria-checked={on}
                          onClick={() => toggleModule(m)}
                          className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors ${
                            on ? 'border-brand-teal/40 bg-brand-teal/10 text-foreground' : 'border-border bg-card text-muted-foreground hover:bg-accent/40'
                          }`}
                        >
                          <span className="truncate">{formatModuleName(m)}</span>
                          <span className={`flex size-4 shrink-0 items-center justify-center rounded ${on ? 'bg-brand-teal text-white' : 'border border-input'}`}>
                            {on && <Check className="size-3" weight="bold" aria-hidden />}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {groups.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Sin módulos para «{permSearch}».</p>
            )}
          </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button variant="primary" loading={savingPerms} onClick={savePerms}>Guardar permisos</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
