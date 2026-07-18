import { useState, useEffect, useCallback } from 'react'
import { CircularProgress } from '@mui/joy'
import { Stack, Plus, WarningCircle, Medal, TrendUp } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }

interface Tier {
  id: number
  name: string
  level: number
  commissionRate: number
  level2Rate: number
  level3Rate: number
  minReferrals: number
  minEarnings: number
  bonusRate: number
  status: string
}

// --- Modal Crear Tier ---
function CreateTierModal({ open, onClose, onSuccess }: {
  open: boolean; onClose: () => void; onSuccess: () => void
}) {
  const [name, setName] = useState('')
  const [level, setLevel] = useState(1)
  const [commissionRate, setCommissionRate] = useState(10)
  const [level2Rate, setLevel2Rate] = useState(5)
  const [level3Rate, setLevel3Rate] = useState(2)
  const [minReferrals, setMinReferrals] = useState(0)
  const [minEarnings, setMinEarnings] = useState(0)
  const [bonusRate, setBonusRate] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!name.trim()) { setError('El nombre es requerido'); return }
    setSaving(true)
    setError(null)
    try {
      await api.post('/affiliates/tiers', {
        name, level, commissionRate, level2Rate, level3Rate,
        minReferrals, minEarnings, bonusRate
      })
      onSuccess()
      onClose()
      setName('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear nivel'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear Nivel MLM</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive-text">
              <WarningCircle className="size-[18px] shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="tier-name">Nombre *</Label>
              <Input
                id="tier-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Bronce, Plata, Oro..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tier-level">Nivel *</Label>
              <Input
                id="tier-level"
                type="number"
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
                min={1}
              />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">Comisiones por nivel</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tier-n1">Nivel 1 (%) *</Label>
                <Input id="tier-n1" type="number" value={commissionRate} onChange={(e) => setCommissionRate(Number(e.target.value))} min={0} max={100} step={0.5} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tier-n2">Nivel 2 (%)</Label>
                <Input id="tier-n2" type="number" value={level2Rate} onChange={(e) => setLevel2Rate(Number(e.target.value))} min={0} max={100} step={0.5} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tier-n3">Nivel 3 (%)</Label>
                <Input id="tier-n3" type="number" value={level3Rate} onChange={(e) => setLevel3Rate(Number(e.target.value))} min={0} max={100} step={0.5} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">Requisitos minimos</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tier-refs">Min. Referidos</Label>
                <Input id="tier-refs" type="number" value={minReferrals} onChange={(e) => setMinReferrals(Number(e.target.value))} min={0} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tier-earn">Min. Ganancias ($)</Label>
                <Input id="tier-earn" type="number" value={minEarnings} onChange={(e) => setMinEarnings(Number(e.target.value))} min={0} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tier-bonus">Bono (%)</Label>
                <Input id="tier-bonus" type="number" value={bonusRate} onChange={(e) => setBonusRate(Number(e.target.value))} min={0} max={100} step={0.5} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button loading={saving} onClick={handleSubmit}>Crear Nivel</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// --- Main Page ---
export default function AffiliateTiers() {
  const [tiers, setTiers] = useState<Tier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const fetchTiers = useCallback(async () => {
    try {
      setLoading(true)
      const { data: res } = await api.get('/affiliates/tiers')
      if (res.success) {
        setTiers(res.data || [])
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar'
      setError(msg)
      devLog('[AffiliateTiers] Error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTiers() }, [fetchTiers])

  // Paleta de acento por nivel (data-coding decorativo, análogo a tag.color)
  const LEVEL_COLORS = ['#3b82f6', '#52b788', '#f3a43b', '#a855f7', '#ef4444']

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Stack className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Niveles MLM
              </h1>
              <p className="text-sm text-muted-foreground">
                Estructura de comisiones escalonadas
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="size-4" weight="bold" aria-hidden />
            Nuevo Nivel
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <CircularProgress size="lg" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text">
            <WarningCircle className="size-5 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        ) : tiers.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm shadow-black/[0.02]">
            <p className="text-base text-foreground">Sin niveles configurados</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea niveles MLM para comisiones escalonadas.
            </p>
            <Button size="sm" className="mt-4" onClick={() => setModalOpen(true)}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Crear Primer Nivel
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tiers.map((tier, idx) => {
              const color = LEVEL_COLORS[idx % LEVEL_COLORS.length]
              return (
                <div
                  key={tier.id}
                  className="h-full rounded-xl border border-l-4 border-border bg-card p-5 shadow-sm shadow-black/[0.02]"
                  style={{ borderLeftColor: color }}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Medal className="size-5" style={{ color }} weight="fill" aria-hidden />
                      <span className="text-base font-semibold text-foreground">{tier.name}</span>
                    </div>
                    <Badge variant={tier.status === 'active' ? 'success' : 'neutral'}>
                      Nivel {tier.level}
                    </Badge>
                  </div>

                  <p className="mb-2 text-sm text-muted-foreground">Comisiones</p>
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    <Badge variant="primary">
                      <TrendUp className="size-3" aria-hidden />
                      N1: {tier.commissionRate}%
                    </Badge>
                    {tier.level2Rate > 0 && (
                      <Badge variant="success">N2: {tier.level2Rate}%</Badge>
                    )}
                    {tier.level3Rate > 0 && (
                      <Badge variant="warning">N3: {tier.level3Rate}%</Badge>
                    )}
                    {tier.bonusRate > 0 && (
                      <Badge variant="outline">Bono: {tier.bonusRate}%</Badge>
                    )}
                  </div>

                  <p className="mb-1.5 text-sm text-muted-foreground">Requisitos</p>
                  <div className="flex flex-col gap-1 text-xs text-foreground">
                    <span>
                      Min. Referidos: <strong>{tier.minReferrals}</strong>
                    </span>
                    <span>
                      Min. Ganancias: <strong>${Number(tier.minEarnings || 0).toLocaleString()}</strong>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <CreateTierModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchTiers}
      />
    </div>
  )
}
