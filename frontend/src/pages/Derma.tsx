/**
 * Página: Derma · Análisis facial profesional
 * Módulo: derma
 *
 * Lista de pacientes + ficha del paciente seleccionado (historial de análisis)
 * + diálogo "Nuevo análisis" (foto, métricas a analizar, detalle clínico, coste
 * en créditos). El resultado se abre en /derma/analyses/:id.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowClockwise,
  CaretLeft,
  CaretRight,
  Coins,
  ImageSquare,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Scan,
  Sparkle,
  SpinnerGap,
  Trash,
  UserCircle,
  X,
} from '@phosphor-icons/react'
import { toast } from 'react-toastify'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import toastError from '../errors/toastError'
import {
  dermaService,
  formatDate,
  formatDateTime,
  scoreTone,
  type DermaAnalysis,
  type DermaCatalog,
  type DermaCredits,
  type DermaPatient,
  type DermaPatientInput,
} from '../services/dermaService'

// Logging solo en desarrollo (misma convención que AIMultimodal)
const devError = (...args: unknown[]) => {
  // eslint-disable-next-line no-console
  if (import.meta.env.DEV) console.error(...args)
}

const EMPTY_PATIENT: DermaPatientInput = { name: '', email: '', phone: '', birthDate: '', gender: '', notes: '' }

const statusBadge = (a: DermaAnalysis) => {
  switch (a.status) {
    case 'completed':
      return <Badge variant="success">Completado</Badge>
    case 'failed':
      return <Badge variant="warning">Fallido</Badge>
    case 'processing':
      return <Badge variant="primary">Procesando</Badge>
    default:
      return <Badge variant="neutral">Pendiente</Badge>
  }
}

const ScorePill = ({ score }: { score: number | null }) => {
  const tone = scoreTone(score)
  return (
    <span
      className={cn(
        'inline-flex min-w-[2.5rem] items-center justify-center rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums',
        tone === 'success' && 'bg-success/14 text-success-text',
        tone === 'warning' && 'bg-warning/16 text-warning-text',
        tone === 'destructive' && 'bg-destructive/12 text-destructive-text',
        tone === 'neutral' && 'bg-muted text-muted-foreground',
      )}
    >
      {score ?? '—'}
    </span>
  )
}

export default function Derma() {
  const navigate = useNavigate()
  const { patientId: patientIdParam } = useParams<{ patientId?: string }>()
  const { user } = useAuth()
  const { canWrite } = usePermissions()
  const isSuperAdmin = user?.super === true
  const canEdit = canWrite('derma')

  // ─── Catálogo y créditos ──────────────────────────────────────────────────
  const [catalog, setCatalog] = useState<DermaCatalog | null>(null)
  const [credits, setCredits] = useState<DermaCredits | null>(null)

  const loadCredits = useCallback(async () => {
    try {
      setCredits(await dermaService.getCredits())
    } catch (err) {
      devError('[Derma] créditos', err)
    }
  }, [])

  useEffect(() => {
    dermaService
      .getCatalog()
      .then(setCatalog)
      .catch((err) => devError('[Derma] catálogo', err))
    void loadCredits()
  }, [loadCredits])

  // ─── Pacientes ────────────────────────────────────────────────────────────
  const [patients, setPatients] = useState<DermaPatient[]>([])
  const [loadingPatients, setLoadingPatients] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [pageNumber, setPageNumber] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const rowsPerPage = 20

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])

  const loadPatients = useCallback(async () => {
    try {
      setLoadingPatients(true)
      const data = await dermaService.listPatients({ searchParam: debouncedSearch, pageNumber, rowsPerPage })
      setPatients(data.patients)
      setHasMore(data.hasMore)
      setTotalCount(data.count)
    } catch (err) {
      devError('[Derma] pacientes', err)
    } finally {
      setLoadingPatients(false)
    }
  }, [debouncedSearch, pageNumber])

  useEffect(() => {
    void loadPatients()
  }, [loadPatients])

  // ─── Paciente seleccionado ────────────────────────────────────────────────
  const selectedId = patientIdParam ? Number(patientIdParam) : null
  const [selected, setSelected] = useState<(DermaPatient & { analyses: DermaAnalysis[]; analysesCount: number }) | null>(null)
  const [loadingSelected, setLoadingSelected] = useState(false)

  const loadSelected = useCallback(async () => {
    if (!selectedId) {
      setSelected(null)
      return
    }
    try {
      setLoadingSelected(true)
      setSelected(await dermaService.getPatient(selectedId))
    } catch (err) {
      devError('[Derma] paciente', err)
      setSelected(null)
    } finally {
      setLoadingSelected(false)
    }
  }, [selectedId])

  useEffect(() => {
    void loadSelected()
  }, [loadSelected])

  // ─── Alta / edición de paciente ───────────────────────────────────────────
  const [patientDialogOpen, setPatientDialogOpen] = useState(false)
  const [editingPatient, setEditingPatient] = useState<DermaPatient | null>(null)
  const [patientForm, setPatientForm] = useState<DermaPatientInput>(EMPTY_PATIENT)
  const [savingPatient, setSavingPatient] = useState(false)

  const openCreatePatient = () => {
    setEditingPatient(null)
    setPatientForm(EMPTY_PATIENT)
    setPatientDialogOpen(true)
  }
  const openEditPatient = (p: DermaPatient) => {
    setEditingPatient(p)
    setPatientForm({
      name: p.name,
      email: p.email ?? '',
      phone: p.phone ?? '',
      birthDate: p.birthDate ?? '',
      gender: p.gender ?? '',
      notes: p.notes ?? '',
    })
    setPatientDialogOpen(true)
  }

  const submitPatient = async (e: FormEvent) => {
    e.preventDefault()
    if (!patientForm.name.trim()) {
      toast.warning('El nombre es obligatorio')
      return
    }
    try {
      setSavingPatient(true)
      const payload: DermaPatientInput = {
        name: patientForm.name.trim(),
        email: patientForm.email?.trim() || null,
        phone: patientForm.phone?.trim() || null,
        birthDate: patientForm.birthDate?.trim() || null,
        gender: patientForm.gender?.trim() || null,
        notes: patientForm.notes?.trim() || null,
      }
      if (editingPatient) {
        await dermaService.updatePatient(editingPatient.id, payload)
        toast.success('Paciente actualizado')
      } else {
        const created = await dermaService.createPatient(payload)
        toast.success('Paciente creado')
        navigate(`/derma/patients/${created.id}`)
      }
      setPatientDialogOpen(false)
      await Promise.allSettled([loadPatients(), loadSelected()])
    } catch (err) {
      toastError(err as Parameters<typeof toastError>[0])
    } finally {
      setSavingPatient(false)
    }
  }

  const removePatient = async (p: DermaPatient) => {
    if (!confirm(`¿Archivar al paciente "${p.name}"? Su historial de análisis se conserva.`)) return
    try {
      await dermaService.deletePatient(p.id)
      toast.success('Paciente archivado')
      if (selectedId === p.id) navigate('/derma')
      await loadPatients()
    } catch (err) {
      toastError(err as Parameters<typeof toastError>[0])
    }
  }

  // ─── Nuevo análisis ───────────────────────────────────────────────────────
  const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set())
  const [clinicalDetail, setClinicalDetail] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const allMetricKeys = useMemo(() => (catalog?.metrics ?? []).map((m) => m.key), [catalog])

  const openAnalysisDialog = () => {
    setImageFile(null)
    setImagePreview(null)
    setClinicalDetail(false)
    setSelectedMetrics(new Set(allMetricKeys))
    setAnalysisDialogOpen(true)
  }

  const handleImageSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.warning('Solo se aceptan archivos de imagen (JPG, PNG, WEBP, HEIC).')
      return
    }
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }
  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleImageSelect(f)
  }
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleImageSelect(f)
  }
  const clearImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const toggleMetric = (key: string, checked: boolean) => {
    setSelectedMetrics((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }
  const toggleAllMetrics = () => {
    setSelectedMetrics((prev) => (prev.size === allMetricKeys.length ? new Set() : new Set(allMetricKeys)))
  }

  const analysisCost = clinicalDetail ? (catalog?.clinicalAnalysisCost ?? 15) : (catalog?.basicAnalysisCost ?? 1)
  const insufficientCredits = !isSuperAdmin && credits !== null && credits.remaining < analysisCost

  const runAnalysis = async () => {
    if (!selected || !imageFile) return
    if (selectedMetrics.size === 0) {
      toast.warning('Selecciona al menos una métrica')
      return
    }
    try {
      setAnalyzing(true)
      const analysis = await dermaService.analyze(selected.id, imageFile, Array.from(selectedMetrics), clinicalDetail)
      toast.success('Análisis completado')
      setAnalysisDialogOpen(false)
      await Promise.allSettled([loadCredits(), loadPatients(), loadSelected()])
      navigate(`/derma/analyses/${analysis.id}`)
    } catch (err) {
      const e = err as { response?: { data?: { error?: string; message?: string } } }
      const msg = e.response?.data?.error ?? e.response?.data?.message
      if (msg) toast.error(msg)
      else toastError(err as Parameters<typeof toastError>[0])
      await loadCredits()
    } finally {
      setAnalyzing(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage))

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <Sparkle className="size-6" weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Derma · Análisis facial</h1>
            <p className="text-sm text-muted-foreground">
              Analiza, explica, recomienda y da seguimiento. Tu paciente no solo escucha tu valoración: ahora puede verla.
            </p>
          </div>
        </div>

        <div className="min-w-[240px] rounded-lg border border-border bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <Coins className="size-4 text-muted-foreground" aria-hidden />
            <span className="text-xs text-muted-foreground">Créditos Derma</span>
            <button
              type="button"
              aria-label="Actualizar créditos"
              onClick={() => void loadCredits()}
              className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-accent"
            >
              <ArrowClockwise className="size-3.5" aria-hidden />
            </button>
          </div>
          <p className="mt-0.5 text-xl font-semibold text-primary">
            {isSuperAdmin ? '∞ Ilimitado' : (credits?.remaining ?? '—').toLocaleString('es-ES')}
          </p>
          {!isSuperAdmin && credits && (
            <p className="text-xs text-muted-foreground">
              {credits.configured
                ? `≈ ${credits.basicAnalysesAvailable} análisis, o ${credits.clinicalAnalysesAvailable} con Detalle clínico`
                : 'Tipo de crédito derma_analysis no configurado'}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ── Lista de pacientes ─────────────────────────────────────────── */}
        <section className="lg:col-span-5">
          <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
              <h2 className="text-base font-semibold text-foreground">Pacientes</h2>
              <div className="flex flex-1 items-center gap-2 sm:justify-end">
                <div className="w-full sm:w-56">
                  <Input
                    aria-label="Buscar paciente"
                    placeholder="Buscar por nombre..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setPageNumber(1)
                    }}
                    leftIcon={<MagnifyingGlass aria-hidden />}
                    className="h-10"
                  />
                </div>
                {canEdit && (
                  <Button size="sm" onClick={openCreatePatient}>
                    <Plus className="size-4" aria-hidden />
                    Nuevo paciente
                  </Button>
                )}
              </div>
            </div>

            <ul className="divide-y divide-border">
              {loadingPatients ? (
                <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <SpinnerGap className="size-4 animate-spin" weight="bold" aria-hidden />
                    Cargando pacientes...
                  </span>
                </li>
              ) : patients.length === 0 ? (
                <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {debouncedSearch ? 'Sin resultados para la búsqueda' : 'Aún no hay pacientes. Crea el primero.'}
                </li>
              ) : (
                patients.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/derma/patients/${p.id}`)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40',
                        selectedId === p.id && 'bg-accent/60',
                      )}
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
                        {p.name
                          .split(' ')
                          .slice(0, 2)
                          .map((s) => s[0]?.toUpperCase() ?? '')
                          .join('')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">{p.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {p.age != null ? `Edad: ${p.age} · ` : ''}
                          Última visita: {formatDate(p.lastAnalysisAt)}
                        </span>
                      </span>
                      <ScorePill score={p.lastScore} />
                    </button>
                  </li>
                ))
              )}
            </ul>

            <div className="mt-auto flex items-center justify-between border-t border-border px-4 py-2 text-sm text-muted-foreground">
              <span>
                {totalCount} paciente{totalCount === 1 ? '' : 's'}
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Página anterior"
                  disabled={pageNumber <= 1}
                  onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-input p-1 hover:bg-accent disabled:opacity-40"
                >
                  <CaretLeft className="size-4" aria-hidden />
                </button>
                <span className="px-1">
                  {pageNumber} / {totalPages}
                </span>
                <button
                  type="button"
                  aria-label="Página siguiente"
                  disabled={!hasMore}
                  onClick={() => setPageNumber((p) => p + 1)}
                  className="rounded-md border border-input p-1 hover:bg-accent disabled:opacity-40"
                >
                  <CaretRight className="size-4" aria-hidden />
                </button>
              </span>
            </div>
          </div>
        </section>

        {/* ── Ficha del paciente ─────────────────────────────────────────── */}
        <section className="lg:col-span-7">
          <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            {!selectedId ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
                <UserCircle className="size-12" aria-hidden />
                <p className="text-sm">Selecciona un paciente para ver su historial o crear un análisis.</p>
              </div>
            ) : loadingSelected || !selected ? (
              <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">
                <SpinnerGap className="mr-2 size-4 animate-spin" weight="bold" aria-hidden />
                Cargando paciente...
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">{selected.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {[
                        selected.age != null ? `${selected.age} años` : null,
                        selected.gender || null,
                        selected.phone || null,
                        selected.email || null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Sin datos de contacto'}
                    </p>
                    {selected.notes && <p className="mt-2 text-sm text-foreground/80">{selected.notes}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canEdit && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openEditPatient(selected)}>
                          <PencilSimple className="size-4" aria-hidden />
                          Editar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void removePatient(selected)} aria-label="Archivar paciente">
                          <Trash className="size-4" aria-hidden />
                        </Button>
                        <Button size="sm" onClick={openAnalysisDialog} disabled={!catalog}>
                          <Scan className="size-4" aria-hidden />
                          Nuevo análisis
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Último score</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{selected.lastScore ?? '—'}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Análisis</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{selected.analysesCount}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Última visita</p>
                    <p className="mt-1 text-base font-semibold text-foreground">{formatDate(selected.lastAnalysisAt)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Alta</p>
                    <p className="mt-1 text-base font-semibold text-foreground">{formatDate(selected.createdAt)}</p>
                  </div>
                </div>

                <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Historial de análisis</h3>
                {selected.analyses.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-dashed border-input p-6 text-center text-sm text-muted-foreground">
                    Sin análisis todavía. Sube una foto del rostro para obtener la primera valoración.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                    {selected.analyses.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          disabled={a.status !== 'completed'}
                          onClick={() => navigate(`/derma/analyses/${a.id}`)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40 disabled:cursor-default disabled:hover:bg-transparent"
                        >
                          <ScorePill score={a.globalScore} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-foreground">
                              {formatDateTime(a.createdAt)} · {a.metricsCount} métricas
                              {a.clinicalDetail ? ' · Detalle clínico' : ''}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {a.status === 'failed' ? a.errorMessage || 'Error' : a.skinType ? `Piel ${a.skinType}` : ''}
                              {a.skinAge != null ? ` · Edad de piel ${a.skinAge}` : ''}
                            </span>
                          </span>
                          {statusBadge(a)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </section>
      </div>

      {/* ── Diálogo paciente ───────────────────────────────────────────────── */}
      <Dialog open={patientDialogOpen} onOpenChange={setPatientDialogOpen}>
        <DialogContent>
          <form onSubmit={submitPatient} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{editingPatient ? 'Editar paciente' : 'Nuevo paciente'}</DialogTitle>
              <DialogDescription>Datos básicos para el seguimiento de sus análisis.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label htmlFor="derma-name">Nombre *</Label>
                <Input
                  id="derma-name"
                  value={patientForm.name}
                  onChange={(e) => setPatientForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="derma-birth">Fecha de nacimiento</Label>
                  <Input
                    id="derma-birth"
                    type="date"
                    value={patientForm.birthDate ?? ''}
                    onChange={(e) => setPatientForm((f) => ({ ...f, birthDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="derma-gender">Género</Label>
                  <select
                    id="derma-gender"
                    value={patientForm.gender ?? ''}
                    onChange={(e) => setPatientForm((f) => ({ ...f, gender: e.target.value }))}
                    className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    <option value="">—</option>
                    <option value="femenino">Femenino</option>
                    <option value="masculino">Masculino</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="derma-phone">Teléfono</Label>
                  <Input
                    id="derma-phone"
                    value={patientForm.phone ?? ''}
                    onChange={(e) => setPatientForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="derma-email">Email</Label>
                  <Input
                    id="derma-email"
                    type="email"
                    value={patientForm.email ?? ''}
                    onChange={(e) => setPatientForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="derma-notes">Notas del profesional</Label>
                <textarea
                  id="derma-notes"
                  rows={3}
                  value={patientForm.notes ?? ''}
                  onChange={(e) => setPatientForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Alergias, tratamientos previos, objetivos..."
                  className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPatientDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={savingPatient}>
                {editingPatient ? 'Guardar cambios' : 'Crear paciente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo nuevo análisis ─────────────────────────────────────────── */}
      <Dialog open={analysisDialogOpen} onOpenChange={(o) => !analyzing && setAnalysisDialogOpen(o)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nuevo análisis · {selected?.name}</DialogTitle>
            <DialogDescription>
              Sube una foto frontal del rostro, con buena luz, sin maquillaje y sin gafas. Selecciona qué analizar.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 md:grid-cols-2">
            {/* Foto */}
            <div>
              {!imagePreview ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setIsDragOver(true)
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'flex aspect-[4/5] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors',
                    isDragOver ? 'border-primary bg-accent/60' : 'border-input bg-muted/40 hover:border-primary/60 hover:bg-accent/40',
                  )}
                >
                  <ImageSquare className="size-10 text-muted-foreground" aria-hidden />
                  <p className="mt-3 text-sm text-muted-foreground">Arrastra la foto aquí</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">o haz clic para seleccionar (JPG, PNG, WEBP, HEIC · máx. 15 MB)</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="aspect-[4/5] overflow-hidden rounded-lg bg-muted/40">
                    <img src={imagePreview} alt="Foto del paciente" className="size-full object-cover" />
                  </div>
                  <button
                    type="button"
                    aria-label="Quitar foto"
                    onClick={clearImage}
                    className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileInput} />
            </div>

            {/* Métricas */}
            <div className="flex flex-col">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Selecciona qué analizar</p>
                <button type="button" onClick={toggleAllMetrics} className="text-xs text-primary hover:underline">
                  {selectedMetrics.size === allMetricKeys.length ? 'Quitar todo' : 'Seleccionar todo'}
                </button>
              </div>
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {(catalog?.metrics ?? []).map((m) => (
                  <li key={m.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`derma-m-${m.key}`}
                      checked={selectedMetrics.has(m.key)}
                      onCheckedChange={(c) => toggleMetric(m.key, c)}
                    />
                    <label htmlFor={`derma-m-${m.key}`} className="cursor-pointer text-sm text-foreground">
                      {m.label}
                    </label>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
                <Checkbox id="derma-clinical" checked={clinicalDetail} onCheckedChange={setClinicalDetail} />
                <label htmlFor="derma-clinical" className="cursor-pointer text-sm">
                  <span className="font-medium text-foreground">Detalle clínico</span>
                  <span className="block text-xs text-muted-foreground">
                    Valoración ampliada por zonas, tratamientos de cabina sugeridos, rutina en casa y precauciones. Usa{' '}
                    {catalog?.clinicalAnalysisCost ?? 15} créditos.
                  </span>
                </label>
              </div>

              <div className="mt-auto pt-4">
                {insufficientCredits && (
                  <p className="mb-2 text-xs text-destructive-text">
                    Créditos insuficientes: necesitas {analysisCost} y tienes {credits?.remaining ?? 0}.
                  </p>
                )}
                <Button
                  className="w-full"
                  disabled={!imageFile || selectedMetrics.size === 0 || insufficientCredits}
                  loading={analyzing}
                  onClick={() => void runAnalysis()}
                >
                  {!analyzing && <Sparkle className="size-4" weight="fill" aria-hidden />}
                  Analizar · {analysisCost} crédito{analysisCost === 1 ? '' : 's'}
                </Button>
                {analyzing && (
                  <p className="mt-2 text-center text-xs text-muted-foreground">Analizando la foto, suele tardar 15-40 segundos...</p>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
