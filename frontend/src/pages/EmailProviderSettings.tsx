import { useState, useEffect, useCallback } from "react"
import {
  ArrowClockwise,
  CheckCircle,
  XCircle,
  PaperPlaneTilt,
  Info,
  FloppyDisk,
  EnvelopeSimple,
  Cloud,
  Database,
  type Icon,
} from "@phosphor-icons/react"
// [Rule 3] CircularProgress se conserva como MUI (no hay equivalente en el DS).
import { CircularProgress } from "@mui/joy"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import api from "../services/api"

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type ProviderKey = "listmonk" | "acelle"

interface BackendProviderConfig {
  id: number
  companyId: number
  provider: string
  apiKey?: string
  apiSecret?: string
  domain?: string
  region?: string
  verifiedSenderEmail?: string
  verifiedSenderName?: string
  isActive: boolean
  settings?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

interface ProviderField {
  name: string
  label: string
  type: "text" | "password" | "number"
  required: boolean
  placeholder?: string
  helper?: string
  /** Si true, el valor se guarda dentro de `settings` en vez de top-level */
  inSettings?: boolean
}

interface ProviderMeta {
  key: ProviderKey
  name: string
  shortName: string
  description: string
  icon: Icon
  badge: string
  fields: ProviderField[]
}

// ---------------------------------------------------------------------------
// Metadata SOLO de los providers permitidos
// ---------------------------------------------------------------------------

const PROVIDERS: ProviderMeta[] = [
  {
    key: "listmonk",
    name: "Listmonk",
    shortName: "Self-hosted",
    description:
      "Servidor de email marketing self-hosted (Docker en tu VM). Open-source, gratis, control total. Maneja listas, campanas masivas, plantillas y tracking. Usa tu SMTP propio para enviar.",
    icon: Database,
    badge: "Recomendado",
    fields: [
      {
        name: "listmonkUrl",
        label: "URL de Listmonk",
        type: "text",
        required: true,
        placeholder: "http://192.168.100.21:9000",
        helper: "URL base sin /api. Acceso solo LAN o via dominio publico.",
        inSettings: true
      },
      {
        name: "apiKey",
        label: "API User",
        type: "text",
        required: true,
        placeholder: "chateam_app",
        helper: "Username del API user creado en Listmonk → Admin → Users."
      },
      {
        name: "apiSecret",
        label: "API Token",
        type: "password",
        required: true,
        placeholder: "••••••••••••••••",
        helper: "Token de acceso del API user."
      },
      {
        name: "fromEmail",
        label: "Email Remitente",
        type: "text",
        required: false,
        placeholder: "marketing@chateam.ws",
        inSettings: true
      },
      {
        name: "fromName",
        label: "Nombre Remitente",
        type: "text",
        required: false,
        placeholder: "ChatEAM Marketing",
        inSettings: true
      }
    ]
  },
  {
    key: "acelle",
    name: "Acelle Mail",
    shortName: "Externo SaaS",
    description:
      "Plataforma SaaS externa (https://emarketing.ariasofts.com). Listas y suscriptores. No soporta envio transaccional directo via API. Util si ya tienes campanas migradas a Acelle.",
    icon: Cloud,
    badge: "Externo",
    fields: [
      {
        name: "acelleUrl",
        label: "URL de Acelle",
        type: "text",
        required: true,
        placeholder: "https://emarketing.ariasofts.com",
        helper: "URL base sin /api/v1.",
        inSettings: true
      },
      {
        name: "apiKey",
        label: "API Token",
        type: "password",
        required: true,
        placeholder: "API token de Acelle",
        helper: "Token disponible en panel Acelle → Profile → API Token."
      },
      {
        name: "verifiedSenderEmail",
        label: "Email Remitente",
        type: "text",
        required: false,
        placeholder: "marketing@chateam.ws"
      },
      {
        name: "verifiedSenderName",
        label: "Nombre Remitente",
        type: "text",
        required: false,
        placeholder: "ChatEAM Marketing"
      }
    ]
  }
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusVariant(isActive: boolean | undefined, isConfigured: boolean): BadgeProps["variant"] {
  if (isActive) return "success"
  if (isConfigured) return "neutral"
  return "warning"
}

function statusLabel(isActive: boolean | undefined, isConfigured: boolean): string {
  if (isActive) return "Activo"
  if (isConfigured) return "Configurado (inactivo)"
  return "Sin configurar"
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function EmailProviderSettings() {
  const [configs, setConfigs] = useState<BackendProviderConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testingProvider, setTestingProvider] = useState<ProviderKey | null>(null)
  const [savingProvider, setSavingProvider] = useState<ProviderKey | null>(null)
  const [activatingProvider, setActivatingProvider] = useState<ProviderKey | null>(null)
  const [formData, setFormData] = useState<Record<ProviderKey, Record<string, string>>>({
    listmonk: {},
    acelle: {}
  })

  // -------------------------------------------------------------------------
  // Carga
  // -------------------------------------------------------------------------

  const fetchConfigs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get("/email-provider-configs")
      const raw: BackendProviderConfig[] = Array.isArray(data)
        ? data
        : (data?.data ?? data?.configs ?? [])
      setConfigs(raw)

      // Hidratar form con valores existentes
      const initial: Record<ProviderKey, Record<string, string>> = {
        listmonk: {},
        acelle: {}
      }
      for (const cfg of raw) {
        if (cfg.provider !== "listmonk" && cfg.provider !== "acelle") continue
        const key = cfg.provider as ProviderKey
        const meta = PROVIDERS.find(p => p.key === key)
        if (!meta) continue

        initial[key] = {}
        const settings = (cfg.settings || {}) as Record<string, string>

        for (const field of meta.fields) {
          if (field.inSettings) {
            initial[key][field.name] = settings[field.name] ?? ""
          } else {
            const v = (cfg as unknown as Record<string, string>)[field.name]
            initial[key][field.name] = v ?? ""
          }
        }
      }
      setFormData(initial)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al cargar configuraciones"
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfigs()
  }, [fetchConfigs])

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const getConfigFor = (provider: ProviderKey): BackendProviderConfig | undefined => {
    return configs.find(c => c.provider === provider)
  }

  const isProviderActive = (provider: ProviderKey): boolean => {
    return configs.some(c => c.provider === provider && c.isActive)
  }

  const getFormValues = (provider: ProviderKey): Record<string, string> => {
    return formData[provider] ?? {}
  }

  const updateFormField = (provider: ProviderKey, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [provider]: {
        ...(prev[provider] ?? {}),
        [field]: value
      }
    }))
  }

  // -------------------------------------------------------------------------
  // Construir payload separando top-level vs settings
  // -------------------------------------------------------------------------

  function buildPayload(provider: ProviderKey): Record<string, unknown> {
    const meta = PROVIDERS.find(p => p.key === provider)!
    const values = getFormValues(provider)
    const top: Record<string, unknown> = { provider }
    const settings: Record<string, unknown> = {}

    for (const field of meta.fields) {
      const v = values[field.name]
      if (v === undefined) continue
      if (field.inSettings) {
        settings[field.name] = v
      } else {
        top[field.name] = v
      }
    }

    if (Object.keys(settings).length > 0) {
      top.settings = settings
    }

    return top
  }

  // -------------------------------------------------------------------------
  // Acciones
  // -------------------------------------------------------------------------

  const handleSave = async (provider: ProviderKey) => {
    setSavingProvider(provider)
    try {
      const existing = getConfigFor(provider)
      const payload = buildPayload(provider)

      if (existing) {
        await api.put(`/email-provider-configs/${existing.id}`, payload)
      } else {
        await api.post("/email-provider-configs", payload)
      }

      toast.success(`Configuracion de ${provider} guardada`)
      await fetchConfigs()
    } catch (err) {
      const ax = err as { response?: { data?: { error?: string; message?: string } }; message?: string }
      const msg = ax.response?.data?.error || ax.response?.data?.message || ax.message || "Error al guardar"
      toast.error(msg)
    } finally {
      setSavingProvider(null)
    }
  }

  const handleActivate = async (provider: ProviderKey) => {
    setActivatingProvider(provider)
    try {
      const existing = getConfigFor(provider)
      if (!existing) {
        toast.error("Primero guarda la configuracion antes de activar")
        return
      }
      await api.put(`/email-provider-configs/${existing.id}`, { isActive: true })
      toast.success(`${provider} activado`)
      await fetchConfigs()
    } catch (err) {
      const ax = err as { response?: { data?: { error?: string } }; message?: string }
      toast.error(ax.response?.data?.error || ax.message || "Error al activar")
    } finally {
      setActivatingProvider(null)
    }
  }

  const handleTest = async (provider: ProviderKey) => {
    setTestingProvider(provider)
    try {
      const existing = getConfigFor(provider)
      const payload = buildPayload(provider)

      const endpoint = existing
        ? `/email-provider-configs/${existing.id}/test`
        : "/email-provider-configs/test"

      const { data } = await api.post(endpoint, existing ? {} : payload)

      if (data?.success) {
        toast.success(`Conexion con ${provider}: OK`)
      } else {
        toast.error(data?.message ?? `Error al probar ${provider}`)
      }
    } catch (err) {
      const ax = err as { response?: { data?: { error?: string; message?: string } }; message?: string }
      const msg = ax.response?.data?.error || ax.response?.data?.message || ax.message || "Error al probar"
      toast.error(msg)
    } finally {
      setTestingProvider(null)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <EnvelopeSimple className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Proveedor de Email Marketing
              </h1>
              <p className="text-sm text-muted-foreground">
                Solo 1 provider puede estar activo a la vez. Acelle o Listmonk.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualizar"
            className="text-muted-foreground"
            onClick={fetchConfigs}
            disabled={loading}
          >
            <ArrowClockwise className="size-5" aria-hidden />
          </Button>
        </div>

        {/* Info */}
        <div className="flex gap-3 rounded-lg border border-border bg-accent/50 p-4">
          <Info className="mt-0.5 size-5 shrink-0 text-primary" weight="fill" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-foreground">
              Listmonk es self-hosted, Acelle es un SaaS externo
            </p>
            <p className="text-sm text-muted-foreground">
              Listmonk corre en tu VM via Docker (sin costos por envio). Acelle requiere suscripcion a Ariasofts.
              Los proveedores transaccionales (SendGrid, Mailgun, SES, Carbonio) ya no se usan en Email Marketing.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-80 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <CircularProgress size="lg" />
              <p className="text-sm text-muted-foreground">Cargando configuraciones...</p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-border bg-card px-6 py-12 text-center shadow-sm">
            <XCircle className="mx-auto mb-3 size-12 text-destructive-text" aria-hidden />
            <p className="mb-4 text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchConfigs}>
              <ArrowClockwise className="size-4" aria-hidden />
              Reintentar
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {PROVIDERS.map(provider => {
              const existing = getConfigFor(provider.key)
              const isConfigured = !!existing
              const isActive = isProviderActive(provider.key)
              const values = getFormValues(provider.key)
              const ProviderIcon = provider.icon

              return (
                <div
                  key={provider.key}
                  className={cn(
                    "flex h-full flex-col rounded-xl bg-card p-5 shadow-sm transition-shadow hover:shadow-md",
                    isActive ? "border-2 border-success" : "border border-border"
                  )}
                >
                  {/* Card header */}
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-lg",
                          isActive
                            ? "bg-success/14 text-success-text"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        <ProviderIcon className="size-[22px]" weight="fill" aria-hidden />
                      </span>
                      <div>
                        <p className="font-semibold text-foreground">{provider.name}</p>
                        <div className="mt-1">
                          <Badge variant={statusVariant(isActive, isConfigured)}>
                            {isActive && <CheckCircle className="size-3.5" weight="fill" aria-hidden />}
                            {statusLabel(isActive, isConfigured)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <Badge variant="primary">{provider.badge}</Badge>
                  </div>

                  <p className="mb-4 text-sm text-muted-foreground">{provider.description}</p>

                  <div className="my-2 border-t border-border" />

                  {/* Form */}
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Configuracion
                    </p>
                    <div className="space-y-3">
                      {provider.fields.map(field => {
                        const inputId = `${provider.key}-${field.name}`
                        const commonProps = {
                          id: inputId,
                          placeholder: field.placeholder,
                          required: field.required,
                          value: values[field.name] ?? "",
                          onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                            updateFormField(provider.key, field.name, e.target.value)
                        }
                        return (
                          <div key={field.name} className="space-y-1.5">
                            <Label htmlFor={inputId}>
                              {field.label}
                              {field.required && (
                                <span className="ml-0.5 text-destructive-text">*</span>
                              )}
                            </Label>
                            {field.type === "password" ? (
                              <PasswordInput {...commonProps} />
                            ) : (
                              <Input type={field.type} {...commonProps} />
                            )}
                            {field.helper && (
                              <p className="text-xs text-muted-foreground">{field.helper}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        loading={savingProvider === provider.key}
                        onClick={() => handleSave(provider.key)}
                      >
                        {savingProvider !== provider.key && (
                          <FloppyDisk className="size-4" aria-hidden />
                        )}
                        {savingProvider === provider.key ? "Guardando..." : "Guardar"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        loading={testingProvider === provider.key}
                        onClick={() => handleTest(provider.key)}
                      >
                        {testingProvider !== provider.key && (
                          <PaperPlaneTilt className="size-4" aria-hidden />
                        )}
                        {testingProvider === provider.key ? "Probando..." : "Probar conexion"}
                      </Button>
                      {isConfigured && !isActive && (
                        <Button
                          size="sm"
                          className="bg-success text-primary-foreground hover:bg-success/90"
                          loading={activatingProvider === provider.key}
                          onClick={() => handleActivate(provider.key)}
                        >
                          {activatingProvider !== provider.key && (
                            <CheckCircle className="size-4" weight="fill" aria-hidden />
                          )}
                          {activatingProvider === provider.key
                            ? "Activando..."
                            : "Activar este provider"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
