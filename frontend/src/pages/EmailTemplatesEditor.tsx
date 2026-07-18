import { useState, useEffect, useCallback, useMemo } from "react"
import {
  FileHtml,
  Plus,
  ArrowClockwise,
  MagnifyingGlass,
  PencilSimple,
  Archive,
  Copy,
  PaperPlaneTilt,
  Eye,
  FloppyDisk,
  X,
  EnvelopeSimple,
} from "@phosphor-icons/react"
// [Fase2·G] CircularProgress se conserva como MUI (design system sin equivalente Radix).
import { CircularProgress } from "@mui/joy"
import { Button } from "@/components/ui/button"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import api from "../services/api"

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type TemplateType = "campaign" | "tx"
type TemplateStatus = "draft" | "active" | "archived"

interface EmailTemplate {
  id: number
  companyId: number
  name: string
  subject: string
  previewText?: string | null
  htmlContent: string
  textContent?: string | null
  type: TemplateType
  category: string
  status: TemplateStatus
  tags?: string[]
  provider?: string | null
  providerTemplateId?: string | null
  createdAt?: string
  updatedAt?: string
}

interface ListResp {
  records: EmailTemplate[]
  count: number
  hasMore: boolean
}

interface FormState {
  id: number | null
  name: string
  subject: string
  previewText: string
  htmlContent: string
  textContent: string
  type: TemplateType
  category: string
  status: TemplateStatus
  tagsCsv: string
}

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  subject: "",
  previewText: "",
  htmlContent: "",
  textContent: "",
  type: "campaign",
  category: "general",
  status: "draft",
  tagsCsv: ""
}

const TEMPLATE_VARIABLES = [
  { key: "{{nombre}}", desc: "Nombre del suscriptor" },
  { key: "{{empresa}}", desc: "Tu empresa" },
  { key: "{{enlace_accion}}", desc: "URL del CTA principal" },
  { key: "{{enlace_unsub}}", desc: "URL para desuscribirse" }
]

// [Fase2·G] Radix Select no admite value="" → centinela solo de presentación.
const ALL = "all"

const columns = ["Nombre", "Asunto", "Tipo", "Estado", "Provider", "Acciones"]

// Botón de acción de fila (mismo look que RowAction del prototipo, con onClick).
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
    <Tooltip title={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function EmailTemplatesEditor() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [count, setCount] = useState(0)
  const [searchParam, setSearchParam] = useState("")
  const [pageNumber, setPageNumber] = useState(1)
  const [typeFilter, setTypeFilter] = useState<"" | TemplateType>("")
  const [statusFilter, setStatusFilter] = useState<"" | TemplateStatus>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editorTab, setEditorTab] = useState<"editor" | "preview" | "variables">("editor")
  const [saving, setSaving] = useState(false)

  const [testOpen, setTestOpen] = useState(false)
  const [testEmail, setTestEmail] = useState("")
  const [testFromEmail, setTestFromEmail] = useState("")
  const [testFromName, setTestFromName] = useState("")
  const [testTemplateId, setTestTemplateId] = useState<number | null>(null)
  const [testing, setTesting] = useState(false)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string | number> = {
        searchParam,
        pageNumber
      }
      if (typeFilter) params.type = typeFilter
      if (statusFilter) params.status = statusFilter

      const { data } = await api.get<ListResp>("/email-templates", { params })
      setTemplates(data.records || [])
      setCount(data.count || 0)
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string }
      setError(ax.response?.data?.message || ax.message || "Error al cargar plantillas")
    } finally {
      setLoading(false)
    }
  }, [searchParam, pageNumber, typeFilter, statusFilter])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  // -------------------------------------------------------------------------
  // Handlers CRUD
  // -------------------------------------------------------------------------

  const openNew = () => {
    setForm({ ...EMPTY_FORM })
    setEditorTab("editor")
    setEditorOpen(true)
  }

  const openEdit = (tpl: EmailTemplate) => {
    setForm({
      id: tpl.id,
      name: tpl.name,
      subject: tpl.subject,
      previewText: tpl.previewText || "",
      htmlContent: tpl.htmlContent,
      textContent: tpl.textContent || "",
      type: tpl.type === "tx" ? "tx" : "campaign",
      category: tpl.category || "general",
      status: tpl.status,
      tagsCsv: (tpl.tags || []).join(", ")
    })
    setEditorTab("editor")
    setEditorOpen(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.subject || !form.htmlContent) {
      toast.error("Nombre, asunto y contenido HTML son obligatorios")
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        subject: form.subject,
        previewText: form.previewText,
        htmlContent: form.htmlContent,
        textContent: form.textContent,
        type: form.type,
        category: form.category,
        status: form.status,
        tags: form.tagsCsv.split(",").map(s => s.trim()).filter(Boolean)
      }

      if (form.id) {
        await api.put(`/email-templates/${form.id}`, payload)
        toast.success("Plantilla actualizada")
      } else {
        await api.post("/email-templates", payload)
        toast.success("Plantilla creada")
      }
      setEditorOpen(false)
      await fetchTemplates()
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string }
      toast.error(ax.response?.data?.message || ax.message || "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  const handleDuplicate = async (id: number) => {
    try {
      await api.post(`/email-templates/${id}/duplicate`)
      toast.success("Plantilla duplicada")
      await fetchTemplates()
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string }
      toast.error(ax.response?.data?.message || ax.message || "Error al duplicar")
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm("¿Archivar esta plantilla? (se mantiene en BD, no se borra)")) return
    try {
      await api.delete(`/email-templates/${id}`)
      toast.success("Plantilla archivada")
      await fetchTemplates()
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string }
      toast.error(ax.response?.data?.message || ax.message || "Error al archivar")
    }
  }

  const openTest = (id: number) => {
    setTestTemplateId(id)
    setTestEmail("")
    setTestFromEmail("")
    setTestFromName("")
    setTestOpen(true)
  }

  const handleSendTest = async () => {
    if (!testTemplateId || !testEmail) {
      toast.error("Email destinatario es obligatorio")
      return
    }
    setTesting(true)
    try {
      await api.post(`/email-templates/${testTemplateId}/test-send`, {
        to: testEmail,
        fromEmail: testFromEmail || undefined,
        fromName: testFromName || undefined
      })
      toast.success(`Prueba enviada a ${testEmail}`)
      setTestOpen(false)
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string }
      toast.error(ax.response?.data?.message || ax.message || "Error al enviar prueba")
    } finally {
      setTesting(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const previewSrcDoc = useMemo(() => {
    return form.htmlContent
  }, [form.htmlContent])

  const statusVariant = (status: TemplateStatus): BadgeProps["variant"] =>
    status === "active" ? "success" : status === "archived" ? "neutral" : "warning"

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <FileHtml className="size-6" weight="fill" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Plantillas de Email
                </h1>
                <p className="text-sm text-muted-foreground">
                  Crea y gestiona plantillas para campanas masivas (sync con tu provider activo)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip title="Recargar">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Recargar"
                  className="text-muted-foreground"
                  onClick={fetchTemplates}
                  disabled={loading}
                >
                  <ArrowClockwise className="size-5" aria-hidden />
                </Button>
              </Tooltip>
              <Button size="sm" onClick={openNew}>
                <Plus className="size-4" weight="bold" aria-hidden />
                Nueva plantilla
              </Button>
            </div>
          </div>

          {/* Filtros */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className="space-y-1.5 md:col-span-6">
                <Label htmlFor="tpl-search">Buscar</Label>
                <Input
                  id="tpl-search"
                  className="h-10"
                  leftIcon={<MagnifyingGlass aria-hidden />}
                  placeholder="Buscar por nombre..."
                  value={searchParam}
                  onChange={e => {
                    setSearchParam(e.target.value)
                    setPageNumber(1)
                  }}
                />
              </div>
              <div className="space-y-1.5 md:col-span-3">
                <Label htmlFor="tpl-type">Tipo</Label>
                <Select
                  value={typeFilter || ALL}
                  onValueChange={v => {
                    setTypeFilter(v === ALL ? "" : (v as TemplateType))
                    setPageNumber(1)
                  }}
                >
                  <SelectTrigger id="tpl-type" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todos</SelectItem>
                    <SelectItem value="campaign">Campana</SelectItem>
                    <SelectItem value="tx">Transaccional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-3">
                <Label htmlFor="tpl-status">Estado</Label>
                <Select
                  value={statusFilter || ALL}
                  onValueChange={v => {
                    setStatusFilter(v === ALL ? "" : (v as TemplateStatus))
                    setPageNumber(1)
                  }}
                >
                  <SelectTrigger id="tpl-status" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todos</SelectItem>
                    <SelectItem value="draft">Borrador</SelectItem>
                    <SelectItem value="active">Activa</SelectItem>
                    <SelectItem value="archived">Archivada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Lista */}
          {loading ? (
            <div className="flex min-h-60 items-center justify-center">
              <CircularProgress />
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text"
            >
              {error}
            </div>
          ) : templates.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-6 py-14 text-center shadow-sm shadow-black/[0.02]">
              <FileHtml className="mx-auto mb-4 size-12 text-muted-foreground/60" aria-hidden />
              <h2 className="mb-1 text-base font-semibold text-foreground">
                Sin plantillas todavia
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Crea tu primera plantilla para usar en campanas
              </p>
              <Button size="sm" onClick={openNew}>
                <Plus className="size-4" weight="bold" aria-hidden />
                Crear plantilla
              </Button>
            </div>
          ) : (
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
                    {templates.map(tpl => (
                      <tr key={tpl.id} className="transition-colors hover:bg-accent/40">
                        <td className="min-w-[200px] px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-foreground">{tpl.name}</span>
                            {tpl.previewText && (
                              <span className="text-xs text-muted-foreground">
                                {tpl.previewText.slice(0, 50)}...
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="min-w-[220px] px-4 py-3 text-xs text-muted-foreground">
                          {tpl.subject}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={tpl.type === "tx" ? "warning" : "primary"}>
                            {tpl.type === "tx" ? "TX" : "Campana"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusVariant(tpl.status)}>{tpl.status}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          {tpl.provider ? (
                            <Badge variant="outline">{tpl.provider}</Badge>
                          ) : (
                            <Badge variant="neutral">No sync</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-0.5">
                            <ActionBtn label="Editar" onClick={() => openEdit(tpl)}>
                              <PencilSimple className="size-[18px]" aria-hidden />
                            </ActionBtn>
                            <ActionBtn label="Duplicar" onClick={() => handleDuplicate(tpl.id)}>
                              <Copy className="size-[18px]" aria-hidden />
                            </ActionBtn>
                            <ActionBtn
                              label="Enviar prueba"
                              onClick={() => openTest(tpl.id)}
                              className="hover:bg-success/10 hover:text-success-text"
                            >
                              <PaperPlaneTilt className="size-[18px]" aria-hidden />
                            </ActionBtn>
                            <ActionBtn
                              label="Archivar"
                              onClick={() => handleDelete(tpl.id)}
                              className="hover:bg-destructive/10 hover:text-destructive-text"
                            >
                              <Archive className="size-[18px]" aria-hidden />
                            </ActionBtn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Footer paginacion simple */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">Total: {count}</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pageNumber <= 1 || loading}
                onClick={() => setPageNumber(p => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">Pagina {pageNumber}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || pageNumber * 20 >= count}
                onClick={() => setPageNumber(p => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </div>

        {/* ---------------- Editor modal ---------------- */}
        <Dialog open={editorOpen} onOpenChange={o => { if (!o) setEditorOpen(false) }}>
          <DialogContent className="max-w-[1100px]">
            <DialogHeader>
              <DialogTitle>{form.id ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
            </DialogHeader>

            <Tabs
              value={editorTab}
              onValueChange={v => setEditorTab((v || "editor") as typeof editorTab)}
            >
              <TabsList>
                <TabsTrigger value="editor">
                  <PencilSimple className="size-4" aria-hidden />
                  Editor
                </TabsTrigger>
                <TabsTrigger value="preview">
                  <Eye className="size-4" aria-hidden />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="variables">Variables</TabsTrigger>
              </TabsList>

              <TabsContent value="editor">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                  <div className="space-y-1.5 md:col-span-6">
                    <Label htmlFor="form-name">
                      Nombre <span className="text-destructive-text">*</span>
                    </Label>
                    <Input
                      id="form-name"
                      className="h-10"
                      required
                      placeholder="Newsletter Octubre 2026"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-6">
                    <Label htmlFor="form-subject">
                      Asunto <span className="text-destructive-text">*</span>
                    </Label>
                    <Input
                      id="form-subject"
                      className="h-10"
                      required
                      placeholder="Hola {{nombre}}, novedades de {{empresa}}"
                      value={form.subject}
                      onChange={e => setForm({ ...form, subject: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-12">
                    <Label htmlFor="form-preview-text">Preview text</Label>
                    <Input
                      id="form-preview-text"
                      className="h-10"
                      placeholder="Texto que aparece como vista previa en la bandeja"
                      value={form.previewText}
                      onChange={e => setForm({ ...form, previewText: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-4">
                    <Label htmlFor="form-type">Tipo</Label>
                    <Select
                      value={form.type}
                      onValueChange={v => setForm({ ...form, type: (v || "campaign") as TemplateType })}
                    >
                      <SelectTrigger id="form-type" className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="campaign">Campana (masiva)</SelectItem>
                        <SelectItem value="tx">Transaccional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 md:col-span-4">
                    <Label htmlFor="form-category">Categoria</Label>
                    <Select
                      value={form.category}
                      onValueChange={v => setForm({ ...form, category: v || "general" })}
                    >
                      <SelectTrigger id="form-category" className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="newsletter">Newsletter</SelectItem>
                        <SelectItem value="promotional">Promocional</SelectItem>
                        <SelectItem value="welcome">Bienvenida</SelectItem>
                        <SelectItem value="transactional">Transaccional</SelectItem>
                        <SelectItem value="event">Evento</SelectItem>
                        <SelectItem value="ecommerce">E-commerce</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 md:col-span-4">
                    <Label htmlFor="form-status">Estado</Label>
                    <Select
                      value={form.status}
                      onValueChange={v => setForm({ ...form, status: (v || "draft") as TemplateStatus })}
                    >
                      <SelectTrigger id="form-status" className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Borrador</SelectItem>
                        <SelectItem value="active">Activa (sync con provider)</SelectItem>
                        <SelectItem value="archived">Archivada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 md:col-span-12">
                    <Label htmlFor="form-html">
                      HTML <span className="text-destructive-text">*</span>
                    </Label>
                    <textarea
                      id="form-html"
                      required
                      rows={14}
                      placeholder="<div>...</div>"
                      value={form.htmlContent}
                      onChange={e => setForm({ ...form, htmlContent: e.target.value })}
                      className="min-h-[300px] w-full resize-y rounded-md border border-input bg-card p-3 font-mono text-xs leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                    />
                    <p className="text-xs text-muted-foreground">
                      Usa variables como {"{{nombre}}"} y {"{{enlace_unsub}}"}. El render se hace en el provider.
                    </p>
                  </div>
                  <div className="space-y-1.5 md:col-span-12">
                    <Label htmlFor="form-text">Texto plano (opcional)</Label>
                    <textarea
                      id="form-text"
                      rows={3}
                      placeholder="Version texto para clientes que no rendericen HTML"
                      value={form.textContent}
                      onChange={e => setForm({ ...form, textContent: e.target.value })}
                      className="min-h-[84px] w-full resize-y rounded-md border border-input bg-card p-3 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-12">
                    <Label htmlFor="form-tags">Tags (separados por coma)</Label>
                    <Input
                      id="form-tags"
                      className="h-10"
                      placeholder="newsletter, octubre"
                      value={form.tagsCsv}
                      onChange={e => setForm({ ...form, tagsCsv: e.target.value })}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview">
                <div className="space-y-3">
                  <div className="rounded-lg border border-primary/25 bg-primary/8 px-4 py-3">
                    <p className="text-sm font-semibold text-foreground">
                      {form.subject || "(sin asunto)"}
                    </p>
                    {form.previewText && (
                      <p className="text-xs text-muted-foreground">{form.previewText}</p>
                    )}
                  </div>
                  <div className="h-[60vh] overflow-hidden rounded-md border border-border bg-white">
                    <iframe
                      title="preview"
                      srcDoc={previewSrcDoc}
                      width="100%"
                      height="100%"
                      className="size-full border-0 bg-white"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="variables">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/8 px-4 py-3">
                    <EnvelopeSimple className="size-5 shrink-0 text-primary" aria-hidden />
                    <p className="text-sm text-foreground">
                      Variables comunes que el provider sustituye al renderizar
                    </p>
                  </div>
                  <div className="overflow-hidden rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-left">
                          <th className="w-[200px] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Variable
                          </th>
                          <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Descripcion
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {TEMPLATE_VARIABLES.map(v => (
                          <tr key={v.key} className="transition-colors hover:bg-accent/40">
                            <td className="px-4 py-2.5">
                              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                                {v.key}
                              </code>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">{v.desc}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="border-t border-border" />

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditorOpen(false)}>
                <X className="size-4" aria-hidden />
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} loading={saving}>
                {!saving && <FloppyDisk className="size-4" aria-hidden />}
                {saving ? "Guardando..." : form.id ? "Actualizar" : "Crear"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ---------------- Test send modal ---------------- */}
        <Dialog open={testOpen} onOpenChange={o => { if (!o) setTestOpen(false) }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Enviar prueba</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="test-email">
                  Email destinatario <span className="text-destructive-text">*</span>
                </Label>
                <Input
                  id="test-email"
                  type="email"
                  className="h-10"
                  required
                  placeholder="tu-email@dominio.com"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="test-from-email">Email remitente (opcional)</Label>
                <Input
                  id="test-from-email"
                  type="email"
                  className="h-10"
                  placeholder="marketing@chateam.ws"
                  value={testFromEmail}
                  onChange={e => setTestFromEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="test-from-name">Nombre remitente (opcional)</Label>
                <Input
                  id="test-from-name"
                  className="h-10"
                  placeholder="ChatEAM Marketing"
                  value={testFromName}
                  onChange={e => setTestFromName(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setTestOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSendTest} loading={testing}>
                {!testing && <PaperPlaneTilt className="size-4" aria-hidden />}
                {testing ? "Enviando..." : "Enviar prueba"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
