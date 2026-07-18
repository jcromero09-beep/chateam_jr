import { useState, useEffect, useCallback } from "react"
// [Fase2·G] CircularProgress se conserva como MUI Joy a propósito (no hay equivalente
// en el design system; mismo criterio que EmailMarketingCampaigns.tsx).
import { CircularProgress } from "@mui/joy"
import {
  ArrowLeft,
  ArrowRight,
  PaperPlaneTilt,
  EnvelopeSimple,
  ListBullets,
  Article,
  Clock,
  CheckCircle,
  type Icon as PhosphorIcon
} from "@phosphor-icons/react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import api from "../services/api"

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface ContactList {
  id: number
  name: string
  isEmailList: boolean
  provider?: string | null
  providerListId?: string | null
}

interface EmailTemplate {
  id: number
  name: string
  subject: string
  htmlContent: string
  textContent?: string | null
  status: string
  type: string
}

interface CampaignFormState {
  // Paso 1
  name: string
  subject: string
  fromEmail: string
  fromName: string
  replyTo: string

  // Paso 2
  contactListId: number | null

  // Paso 3
  templateId: number | null
  htmlContent: string
  textContent: string

  // Paso 4
  scheduleMode: "now" | "scheduled" | "draft"
  sendAt: string
  sendIntervalSeconds: number
  trackOpens: boolean
  trackClicks: boolean
}

const EMPTY_FORM: CampaignFormState = {
  name: "",
  subject: "",
  fromEmail: "",
  fromName: "",
  replyTo: "",
  contactListId: null,
  templateId: null,
  htmlContent: "",
  textContent: "",
  scheduleMode: "draft",
  sendAt: "",
  sendIntervalSeconds: 0,
  trackOpens: true,
  trackClicks: true
}

const STEPS: { key: number; title: string; icon: PhosphorIcon }[] = [
  { key: 1, title: "Datos basicos", icon: EnvelopeSimple },
  { key: 2, title: "Lista de contactos", icon: ListBullets },
  { key: 3, title: "Plantilla", icon: Article },
  { key: 4, title: "Programacion", icon: Clock },
  { key: 5, title: "Confirmar", icon: CheckCircle }
]

// ---------------------------------------------------------------------------
// Primitivas locales del design system (no existen wrappers en @/components/ui)
// ---------------------------------------------------------------------------

/** Separador horizontal, con etiqueta opcional centrada. */
function Divider({ children }: { children?: React.ReactNode }) {
  if (!children) return <div role="separator" className="h-px w-full bg-border" />
  return (
    <div className="flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-border" aria-hidden />
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {children}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  )
}

/** Toggle accesible (role="switch") — mismo patrón que IntegrationBillie/IntegrationSmartTrack. */
function Toggle({
  checked,
  onChange,
  id,
  label
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  id?: string
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        checked ? "bg-primary" : "bg-input"
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-card shadow-sm transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        )}
        aria-hidden
      />
    </button>
  )
}

/** Indicador visual de radio (círculo + punto). */
function RadioDot({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
        checked ? "border-primary" : "border-input"
      )}
      aria-hidden
    >
      {checked && <span className="size-2.5 rounded-full bg-primary" />}
    </span>
  )
}

/** Opción de radio accesible (role="radio") para usar dentro de un role="radiogroup". */
function RadioOption({
  checked,
  onSelect,
  label
}: {
  checked: boolean
  onSelect: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-md px-1 py-1.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <RadioDot checked={checked} />
      <span>{label}</span>
    </button>
  )
}

const textareaClass =
  "w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function EmailCampaignWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<CampaignFormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  const [lists, setLists] = useState<ContactList[]>([])
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loadingLists, setLoadingLists] = useState(false)
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  // -------------------------------------------------------------------------
  // Carga
  // -------------------------------------------------------------------------

  const fetchLists = useCallback(async () => {
    setLoadingLists(true)
    try {
      const { data } = await api.get("/contact-lists/list")
      const all: ContactList[] = Array.isArray(data) ? data : (data?.records || [])
      setLists(all.filter(l => l.isEmailList))
    } catch {
      toast.error("Error cargando listas")
    } finally {
      setLoadingLists(false)
    }
  }, [])

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true)
    try {
      const { data } = await api.get("/email-templates", {
        params: { status: "active", type: "campaign", pageNumber: "1" }
      })
      setTemplates(data?.records || [])
    } catch {
      toast.error("Error cargando plantillas")
    } finally {
      setLoadingTemplates(false)
    }
  }, [])

  useEffect(() => {
    if (step === 2) fetchLists()
    if (step === 3) fetchTemplates()
  }, [step, fetchLists, fetchTemplates])

  // -------------------------------------------------------------------------
  // Validaciones por paso
  // -------------------------------------------------------------------------

  function canAdvance(currentStep: number): boolean {
    switch (currentStep) {
      case 1:
        return !!form.name && !!form.subject
      case 2:
        return !!form.contactListId
      case 3:
        return !!form.htmlContent
      case 4:
        return form.scheduleMode === "draft"
          || form.scheduleMode === "now"
          || (form.scheduleMode === "scheduled" && !!form.sendAt)
      default:
        return true
    }
  }

  // -------------------------------------------------------------------------
  // Submit final
  // -------------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!form.name || !form.subject || !form.contactListId || !form.htmlContent) {
      toast.error("Faltan datos obligatorios")
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        name: form.name,
        subject: form.subject,
        from_email: form.fromEmail || undefined,
        from_name: form.fromName || undefined,
        reply_to: form.replyTo || undefined,
        contactListId: form.contactListId,
        templateId: form.templateId || undefined,
        htmlContent: form.htmlContent,
        sendAt: form.scheduleMode === "scheduled" ? form.sendAt : null,
        launchNow: form.scheduleMode === "now",
        sendIntervalSeconds: form.sendIntervalSeconds,
        trackOpens: form.trackOpens,
        trackClicks: form.trackClicks
      }

      const { data } = await api.post("/email-campaigns/create-and-launch", payload)

      if (data?.success) {
        toast.success(data.message || "Campana creada")
        navigate("/email-marketing/campaigns")
      } else {
        toast.error(data?.message || "Error al crear campana")
      }
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string }
      toast.error(ax.response?.data?.message || ax.message || "Error al crear campana")
    } finally {
      setSubmitting(false)
    }
  }

  const handleApplyTemplate = (id: number) => {
    const tpl = templates.find(t => t.id === id)
    if (!tpl) return
    setForm({
      ...form,
      templateId: id,
      subject: form.subject || tpl.subject,
      htmlContent: tpl.htmlContent,
      textContent: tpl.textContent || ""
    })
    toast.success(`Plantilla "${tpl.name}" aplicada`)
  }

  // -------------------------------------------------------------------------
  // Render por paso
  // -------------------------------------------------------------------------

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1200px] space-y-5 p-5 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Tooltip title="Volver">
              <Button
                variant="outline"
                size="icon"
                aria-label="Volver"
                onClick={() => navigate("/email-marketing/campaigns")}
              >
                <ArrowLeft className="size-5" aria-hidden />
              </Button>
            </Tooltip>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Nueva campana de email
            </h1>
          </div>

          {/* Stepper */}
          <ol className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Progreso del asistente">
            {STEPS.map((s, i) => {
              const Icon = s.icon
              const completed = step > s.key
              const active = step === s.key
              return (
                <li key={s.key} className="flex flex-1 items-center gap-2">
                  <div
                    className="flex min-w-0 items-center gap-2"
                    aria-current={active ? "step" : undefined}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
                        completed || active
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {completed ? (
                        <CheckCircle className="size-5" weight="fill" aria-hidden />
                      ) : (
                        <Icon className="size-5" aria-hidden />
                      )}
                    </span>
                    <span
                      className={cn(
                        "hidden truncate text-sm sm:block",
                        active
                          ? "font-semibold text-foreground"
                          : "font-medium text-muted-foreground"
                      )}
                    >
                      {s.title}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <span className="h-px min-w-4 flex-1 bg-border" aria-hidden />
                  )}
                </li>
              )
            })}
          </ol>

          {/* Step body */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            {step === 1 && <StepBasicData form={form} setForm={setForm} />}
            {step === 2 && (
              <StepContactList
                lists={lists}
                loading={loadingLists}
                selectedId={form.contactListId}
                onSelect={id => setForm({ ...form, contactListId: id })}
                onRefresh={fetchLists}
              />
            )}
            {step === 3 && (
              <StepTemplate
                templates={templates}
                loading={loadingTemplates}
                form={form}
                setForm={setForm}
                onApply={handleApplyTemplate}
                onRefresh={fetchTemplates}
              />
            )}
            {step === 4 && <StepSchedule form={form} setForm={setForm} />}
            {step === 5 && <StepConfirm form={form} lists={lists} templates={templates} />}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={step <= 1 || submitting}
              onClick={() => setStep(s => Math.max(1, s - 1))}
            >
              <ArrowLeft className="size-4" aria-hidden />
              Anterior
            </Button>

            {step < STEPS.length ? (
              <Button
                size="sm"
                disabled={!canAdvance(step) || submitting}
                onClick={() => setStep(s => Math.min(STEPS.length, s + 1))}
              >
                Siguiente
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            ) : (
              <Button size="sm" loading={submitting} onClick={handleSubmit}>
                {!submitting && <PaperPlaneTilt className="size-4" aria-hidden />}
                {submitting
                  ? "Procesando..."
                  : form.scheduleMode === "now"
                  ? "Crear y lanzar"
                  : form.scheduleMode === "scheduled"
                  ? "Crear y programar"
                  : "Crear borrador"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

// ===========================================================================
// Sub-componentes por paso
// ===========================================================================

function StepBasicData({ form, setForm }: { form: CampaignFormState; setForm: (f: CampaignFormState) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">
        Datos basicos de la campana
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="campaign-name">
            Nombre interno <span className="text-destructive-text">*</span>
          </Label>
          <Input
            id="campaign-name"
            required
            placeholder="Newsletter Octubre"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">Solo visible para tu equipo</p>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="campaign-subject">
            Asunto del email <span className="text-destructive-text">*</span>
          </Label>
          <Input
            id="campaign-subject"
            required
            placeholder="Hola {{nombre}}, novedades de octubre"
            value={form.subject}
            onChange={e => setForm({ ...form, subject: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="campaign-from-email">Email remitente</Label>
          <Input
            id="campaign-from-email"
            placeholder="marketing@chateam.ws"
            value={form.fromEmail}
            onChange={e => setForm({ ...form, fromEmail: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">Si vacio, usa el del provider</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="campaign-from-name">Nombre remitente</Label>
          <Input
            id="campaign-from-name"
            placeholder="ChatEAM Marketing"
            value={form.fromName}
            onChange={e => setForm({ ...form, fromName: e.target.value })}
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="campaign-reply-to">Reply-To (opcional)</Label>
          <Input
            id="campaign-reply-to"
            placeholder="soporte@chateam.ws"
            value={form.replyTo}
            onChange={e => setForm({ ...form, replyTo: e.target.value })}
          />
        </div>
      </div>
    </div>
  )
}

function StepContactList({
  lists,
  loading,
  selectedId,
  onSelect,
  onRefresh
}: {
  lists: ContactList[]
  loading: boolean
  selectedId: number | null
  onSelect: (id: number) => void
  onRefresh: () => void
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <CircularProgress />
      </div>
    )
  }

  if (lists.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <ListBullets className="size-12 text-muted-foreground/50" aria-hidden />
        <h2 className="text-base font-semibold text-foreground">Sin listas de email</h2>
        <p className="text-sm text-muted-foreground">
          Primero crea una lista marcada como "isEmailList"
        </p>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          Recargar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">
        Selecciona la lista de contactos
      </h2>
      <div
        className="grid grid-cols-1 gap-3 md:grid-cols-2"
        role="radiogroup"
        aria-label="Lista de contactos"
      >
        {lists.map(list => {
          const isSelected = list.id === selectedId
          return (
            <button
              key={list.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(list.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border p-4 text-left outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isSelected
                  ? "border-primary bg-primary/8"
                  : "border-border bg-card hover:border-muted-foreground/40 hover:bg-accent/40"
              )}
            >
              <RadioDot checked={isSelected} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{list.name}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {list.provider ? (
                    <Badge variant="primary">{list.provider}</Badge>
                  ) : (
                    <Badge variant="warning">Sin sync</Badge>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StepTemplate({
  templates,
  loading,
  form,
  setForm,
  onApply,
  onRefresh
}: {
  templates: EmailTemplate[]
  loading: boolean
  form: CampaignFormState
  setForm: (f: CampaignFormState) => void
  onApply: (id: number) => void
  onRefresh: () => void
}) {
  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-foreground">Plantilla y contenido</h2>

      <div className="space-y-2">
        <p className="text-sm text-foreground">Aplicar plantilla existente:</p>
        {loading ? (
          <CircularProgress size="sm" />
        ) : templates.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/16 p-3">
            <p className="text-sm text-warning-text">
              No hay plantillas activas. Puedes editar el HTML directamente abajo.
            </p>
            <Button size="sm" variant="outline" onClick={onRefresh}>
              Recargar
            </Button>
          </div>
        ) : (
          <div className="max-h-[200px] overflow-y-auto rounded-md border border-border bg-card p-1">
            <div className="space-y-0.5">
              {templates.map(t => (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-center gap-2 rounded-sm p-2 transition-colors",
                    form.templateId === t.id ? "bg-primary/12" : "hover:bg-accent/40"
                  )}
                >
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {t.name}
                  </p>
                  <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {t.subject}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => onApply(t.id)}>
                    Aplicar
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Divider>O edita HTML directo</Divider>

      <div className="space-y-1.5">
        <Label htmlFor="campaign-html">
          HTML del email <span className="text-destructive-text">*</span>
        </Label>
        <textarea
          id="campaign-html"
          required
          rows={12}
          placeholder="<div>...</div>"
          value={form.htmlContent}
          onChange={e => setForm({ ...form, htmlContent: e.target.value })}
          className={cn(textareaClass, "max-h-[480px] font-mono text-xs")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="campaign-text">Texto plano (opcional)</Label>
        <textarea
          id="campaign-text"
          rows={2}
          value={form.textContent}
          onChange={e => setForm({ ...form, textContent: e.target.value })}
          className={cn(textareaClass, "max-h-[120px]")}
        />
      </div>

      {form.htmlContent && (
        <div className="h-[280px] overflow-hidden rounded-md border border-border">
          <iframe
            title="Vista previa del email"
            srcDoc={form.htmlContent}
            width="100%"
            height="280"
            className="block size-full border-0 bg-white"
          />
        </div>
      )}
    </div>
  )
}

function StepSchedule({ form, setForm }: { form: CampaignFormState; setForm: (f: CampaignFormState) => void }) {
  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-foreground">
        Programacion y opciones de envio
      </h2>

      <div className="space-y-2">
        <Label id="schedule-mode-label">Cuando enviar</Label>
        <div className="space-y-1" role="radiogroup" aria-labelledby="schedule-mode-label">
          <RadioOption
            checked={form.scheduleMode === "draft"}
            onSelect={() => setForm({ ...form, scheduleMode: "draft" })}
            label="Guardar como borrador (no envia)"
          />
          <RadioOption
            checked={form.scheduleMode === "now"}
            onSelect={() => setForm({ ...form, scheduleMode: "now" })}
            label="Enviar ahora"
          />
          <RadioOption
            checked={form.scheduleMode === "scheduled"}
            onSelect={() => setForm({ ...form, scheduleMode: "scheduled" })}
            label="Programar para fecha/hora"
          />
        </div>
      </div>

      {form.scheduleMode === "scheduled" && (
        <div className="space-y-1.5">
          <Label htmlFor="campaign-send-at">
            Fecha y hora <span className="text-destructive-text">*</span>
          </Label>
          <Input
            id="campaign-send-at"
            required
            type="datetime-local"
            value={form.sendAt}
            onChange={e => setForm({ ...form, sendAt: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">Tu zona horaria local</p>
        </div>
      )}

      <Divider>Opciones avanzadas</Divider>

      <div className="space-y-1.5">
        <Label htmlFor="campaign-interval">Intervalo entre emails (segundos)</Label>
        <Input
          id="campaign-interval"
          type="number"
          min={0}
          max={3600}
          step={1}
          value={form.sendIntervalSeconds}
          onChange={e => setForm({ ...form, sendIntervalSeconds: Number(e.target.value || 0) })}
        />
        <p className="text-xs text-muted-foreground">
          0 = enviar via campana nativa del provider (rapido).
          {' >0 = enviar uno-a-uno con esta espera (mas lento, evita bloqueos).'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <Toggle
            id="campaign-track-opens"
            checked={form.trackOpens}
            onChange={checked => setForm({ ...form, trackOpens: checked })}
            label="Trackear aperturas"
          />
          <Label htmlFor="campaign-track-opens" className="font-normal">
            Trackear aperturas
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Toggle
            id="campaign-track-clicks"
            checked={form.trackClicks}
            onChange={checked => setForm({ ...form, trackClicks: checked })}
            label="Trackear clicks"
          />
          <Label htmlFor="campaign-track-clicks" className="font-normal">
            Trackear clicks
          </Label>
        </div>
      </div>
    </div>
  )
}

function StepConfirm({
  form,
  lists,
  templates
}: {
  form: CampaignFormState
  lists: ContactList[]
  templates: EmailTemplate[]
}) {
  const list = lists.find(l => l.id === form.contactListId)
  const tpl = templates.find(t => t.id === form.templateId)

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">Revisar antes de enviar</h2>

      <div className="space-y-3 rounded-md border border-border bg-card p-4">
        <dl className="space-y-2.5">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-sm text-muted-foreground">Nombre</dt>
            <dd className="text-right text-sm font-semibold text-foreground">
              {form.name || "—"}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-sm text-muted-foreground">Asunto</dt>
            <dd className="text-right text-sm font-semibold text-foreground">
              {form.subject || "—"}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-sm text-muted-foreground">Remitente</dt>
            <dd className="text-right text-sm text-foreground">
              {form.fromName} {form.fromEmail && `<${form.fromEmail}>`}
            </dd>
          </div>
          {form.replyTo && (
            <div className="flex items-start justify-between gap-4">
              <dt className="text-sm text-muted-foreground">Reply-To</dt>
              <dd className="text-right text-sm text-foreground">{form.replyTo}</dd>
            </div>
          )}
        </dl>

        <Divider />

        <dl className="space-y-2.5">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-sm text-muted-foreground">Lista</dt>
            <dd className="flex items-center gap-2 text-right text-sm font-semibold text-foreground">
              {list?.name || "—"}
              {list?.provider && <Badge variant="neutral">{list.provider}</Badge>}
            </dd>
          </div>
          {tpl && (
            <div className="flex items-start justify-between gap-4">
              <dt className="text-sm text-muted-foreground">Plantilla</dt>
              <dd className="text-right text-sm text-foreground">{tpl.name}</dd>
            </div>
          )}
        </dl>

        <Divider />

        <dl className="space-y-2.5">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-sm text-muted-foreground">Modo</dt>
            <dd className="text-right">
              <Badge
                variant={
                  form.scheduleMode === "now"
                    ? "success"
                    : form.scheduleMode === "scheduled"
                    ? "primary"
                    : "neutral"
                }
              >
                {form.scheduleMode === "now"
                  ? "Enviar ahora"
                  : form.scheduleMode === "scheduled"
                  ? `Programado: ${form.sendAt}`
                  : "Borrador"}
              </Badge>
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-sm text-muted-foreground">Intervalo</dt>
            <dd className="text-right text-sm text-foreground">
              {form.sendIntervalSeconds === 0
                ? "Provider nativo"
                : `${form.sendIntervalSeconds} segundos entre cada email`}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-sm text-muted-foreground">Tracking</dt>
            <dd className="flex flex-wrap justify-end gap-1">
              {form.trackOpens && <Badge variant="neutral">Aperturas</Badge>}
              {form.trackClicks && <Badge variant="neutral">Clicks</Badge>}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
