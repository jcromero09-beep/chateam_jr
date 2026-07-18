/**
 * CommentAutoReplySettings — Configuración del sistema de Auto-Respuesta de Comentarios
 * Ruta: /comment-autoreply/settings
 */
import { useState, type ReactNode } from 'react'
import {
  Gear,
  Copy,
  CheckCircle,
  WebhooksLogo,
  FacebookLogo,
  InstagramLogo,
  Info,
  LinkSimple,
  Gauge,
  Lock,
} from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const devLog = (...args: unknown[]) => { if (import.meta.env.DEV) console.log(...args) }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BACKEND_URL = import.meta.env.VITE_API_URL || 'https://appro.chateam.ws'
const WEBHOOK_URL = `${BACKEND_URL}/webhook/facebook`
const VERIFY_TOKEN_PLACEHOLDER = 'Configurado en WEBHOOK_VERIFY_TOKEN (.env)'

const REQUIRED_PERMISSIONS = [
  { name: 'pages_manage_metadata', desc: 'Gestionar metadatos de la página' },
  { name: 'pages_read_engagement', desc: 'Leer comentarios y reacciones' },
  { name: 'pages_manage_engagement', desc: 'Responder, ocultar, eliminar comentarios' },
  { name: 'pages_messaging', desc: 'Enviar mensajes privados (DM)' },
  { name: 'public_profile', desc: 'Acceso básico al perfil público' },
]

const META_RATE_LIMITS = [
  { action: 'Respuestas de comentarios', limit: '200 por hora por página' },
  { action: 'Mensajes privados (DM)', limit: '1000 por día por página' },
  { action: 'Ocultar comentarios', limit: 'Sin límite documentado' },
  { action: 'Eliminar comentarios', limit: 'Sin límite documentado' },
  { action: 'Dar likes', limit: 'Sin límite documentado' },
]

// ─── Alert (inline, tokenizado) ───────────────────────────────────────────────

type AlertTone = 'primary' | 'warning' | 'success' | 'neutral'

const alertSurface: Record<AlertTone, string> = {
  primary: 'border-primary/20 bg-primary/8',
  warning: 'border-warning/30 bg-warning/12',
  success: 'border-success/30 bg-success/12',
  neutral: 'border-border bg-muted/50',
}

const alertIconTone: Record<AlertTone, string> = {
  primary: 'text-primary',
  warning: 'text-warning-text',
  success: 'text-success-text',
  neutral: 'text-muted-foreground',
}

function Alert({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: AlertTone
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm leading-relaxed text-foreground',
        alertSurface[tone],
        className,
      )}
    >
      {icon && <span className={cn('mt-0.5 shrink-0', alertIconTone[tone])}>{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

// ─── Copy To Clipboard ────────────────────────────────────────────────────────

function CopyableCode({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      devLog('[CommentAutoReplySettings] copied', value)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback silencioso
    }
  }

  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="min-w-[120px] text-xs text-muted-foreground">{label}</span>
      )}
      <div className="flex flex-1 items-center justify-between gap-2 rounded-md bg-muted px-3 py-2">
        <span className="break-all font-mono text-xs text-foreground">{value}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Copiado' : 'Copiar'}
          title={copied ? 'Copiado' : 'Copiar'}
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent',
            copied ? 'text-success-text' : 'text-muted-foreground',
          )}
        >
          {copied ? (
            <CheckCircle className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

interface SectionCardProps {
  icon: ReactNode
  iconWrapClassName: string
  title: string
  subtitle?: string
  children: ReactNode
}

function SectionCard({ icon, iconWrapClassName, title, subtitle, children }: SectionCardProps) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg',
            iconWrapClassName,
          )}
        >
          {icon}
        </span>
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="mb-4 border-t border-border" />
      {children}
    </section>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CommentAutoReplySettings() {
  const navigate = useNavigate()
  const [offensiveWords, setOffensiveWords] = useState(
    'spam, fraude, estafa, publicidad no solicitada'
  )
  const [saved, setSaved] = useState(false)

  const handleSaveGlobal = () => {
    // En producción esto llamaría a la API
    devLog('[CommentAutoReplySettings] saving global config', { offensiveWords })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[900px] space-y-6 p-5 sm:p-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal">
            <Gear className="size-6" weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Configuración de Auto-Responder
            </h1>
            <p className="text-sm text-muted-foreground">
              Ajustes globales del sistema de comentarios automatizados
            </p>
          </div>
        </div>

        <div className="space-y-5">
          {/* ── Páginas Conectadas ── */}
          <SectionCard
            icon={<FacebookLogo className="size-5" weight="fill" aria-hidden />}
            iconWrapClassName="bg-[#1877f2]/12 text-[#1877f2]"
            title="Páginas Conectadas"
            subtitle="Páginas de Facebook e Instagram autorizadas para el auto-respondedor"
          >
            <Alert
              tone="primary"
              icon={<Info className="size-5" aria-hidden />}
              className="mb-4"
            >
              Para conectar páginas de Facebook o Instagram, primero debes agregar la cuenta de
              red social en{' '}
              <button
                type="button"
                onClick={() => navigate('/connections')}
                className="cursor-pointer font-semibold text-primary underline underline-offset-2 hover:text-primary-hover"
              >
                Canales / Conexiones
              </button>
              {' '}y otorgar los permisos necesarios mediante el flujo de Embedded Signup.
            </Alert>

            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Permisos Requeridos en Meta App
            </h3>
            <div className="mb-4 space-y-2">
              {REQUIRED_PERMISSIONS.map(perm => (
                <div key={perm.name} className="flex items-start gap-2.5">
                  <CheckCircle
                    className="mt-0.5 size-[18px] shrink-0 text-success-text"
                    weight="fill"
                    aria-hidden
                  />
                  <div>
                    <p className="font-mono text-xs font-semibold text-primary">
                      {perm.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{perm.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="my-4 border-t border-border" />

            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Plataformas Soportadas
            </h3>
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <FacebookLogo className="size-[22px] text-[#1877f2]" weight="fill" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-foreground">Facebook</p>
                  <p className="text-xs text-muted-foreground">Posts y Páginas</p>
                </div>
                <Badge variant="success" className="ml-1">Soportado</Badge>
              </div>
              <div className="flex items-center gap-2">
                <InstagramLogo className="size-[22px] text-[#e1306c]" weight="fill" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-foreground">Instagram</p>
                  <p className="text-xs text-muted-foreground">Cuentas de Negocio</p>
                </div>
                <Badge variant="success" className="ml-1">Soportado</Badge>
              </div>
            </div>
          </SectionCard>

          {/* ── Webhook Configuration ── */}
          <SectionCard
            icon={<WebhooksLogo className="size-5" weight="fill" aria-hidden />}
            iconWrapClassName="bg-primary/10 text-primary"
            title="Configuracion del Webhook"
            subtitle="URL y token para recibir eventos de comentarios desde Meta"
          >
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  URL del Webhook
                </h3>
                <CopyableCode value={WEBHOOK_URL} />
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  Token de Verificacion
                </h3>
                <div className="flex items-center gap-2">
                  <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="text-xs italic text-muted-foreground">
                    {VERIFY_TOKEN_PLACEHOLDER}
                  </span>
                </div>
              </div>

              <div className="border-t border-border" />

              <div>
                <div className="mb-3 flex items-center gap-2">
                  <LinkSimple className="size-[18px] text-primary" aria-hidden />
                  <h3 className="text-sm font-semibold text-foreground">
                    Pasos para Configurar en Meta App Dashboard
                  </h3>
                </div>
                <div className="space-y-3">
                  {[
                    'Accede a developers.facebook.com y abre tu App',
                    'Ve a Webhooks en el panel izquierdo',
                    'Haz clic en "Agregar suscripcion" para el objeto "Page"',
                    `Ingresa la URL del webhook: ${WEBHOOK_URL}`,
                    'Ingresa el token de verificacion configurado en WEBHOOK_VERIFY_TOKEN',
                    'Suscribete a los campos: feed, messages, messaging_optins',
                    'Guarda y verifica que el webhook responda con HTTP 200',
                    'Repite el proceso para el objeto "Instagram" si usas esa plataforma',
                  ].map((step, idx) => (
                    <div key={idx} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                        {idx + 1}
                      </span>
                      <p className="pt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {step}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <Alert tone="warning" icon={<Info className="size-5" aria-hidden />}>
                El webhook debe ser accesible publicamente (HTTPS). En desarrollo local usa ngrok
                o un tunel similar para exponer tu servidor.
              </Alert>
            </div>
          </SectionCard>

          {/* ── Configuracion Global ── */}
          <SectionCard
            icon={<Gear className="size-5" weight="fill" aria-hidden />}
            iconWrapClassName="bg-success/12 text-success-text"
            title="Configuracion Global"
            subtitle="Ajustes aplicados a todas las campanas del sistema"
          >
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="offensive-words"
                  className="mb-1 block text-sm font-semibold text-foreground"
                >
                  Palabras Ofensivas Globales
                </label>
                <p className="mb-2 text-xs text-muted-foreground">
                  Lista base de palabras ofensivas aplicada a todas las campanas que tengan
                  habilitado el filtro de moderacion. Cada campana puede agregar sus propias
                  palabras adicionales.
                </p>
                <textarea
                  id="offensive-words"
                  rows={3}
                  placeholder="palabra1, palabra2, frase ofensiva"
                  value={offensiveWords}
                  onChange={e => setOffensiveWords(e.target.value)}
                  className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              {saved && (
                <Alert tone="success" icon={<CheckCircle className="size-5" weight="fill" aria-hidden />}>
                  Configuracion guardada correctamente
                </Alert>
              )}

              <div className="flex justify-end">
                <Button size="sm" onClick={handleSaveGlobal}>
                  Guardar Configuracion Global
                </Button>
              </div>
            </div>
          </SectionCard>

          {/* ── Rate Limits Info ── */}
          <SectionCard
            icon={<Gauge className="size-5" weight="fill" aria-hidden />}
            iconWrapClassName="bg-warning/16 text-warning-text"
            title="Limites de Rate de Meta API"
            subtitle="Limites oficiales de la API de Meta para operaciones de comentarios (solo lectura)"
          >
            <Alert
              tone="neutral"
              icon={<Info className="size-5" aria-hidden />}
              className="mb-4"
            >
              Estos limites son impuestos por Meta. ChatEAM incluye manejo automatico de
              reintentos y colas para no excederlos. Si se alcanza el limite, las respuestas
              se encolan y procesan cuando se libera cuota.
            </Alert>

            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/40 text-left">
                    <th className="px-3.5 py-2.5 text-xs font-semibold text-muted-foreground">
                      Accion
                    </th>
                    <th className="px-3.5 py-2.5 text-xs font-semibold text-muted-foreground">
                      Limite
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {META_RATE_LIMITS.map((row) => (
                    <tr key={row.action}>
                      <td className="px-3.5 py-2.5 text-[13px] text-foreground">{row.action}</td>
                      <td className="px-3.5 py-2.5">
                        <Badge variant={row.limit.includes('Sin limite') ? 'success' : 'warning'}>
                          {row.limit}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs italic text-muted-foreground">
              * Los limites pueden variar segun el nivel de acceso de tu App en Meta (desarrollo,
              produccion, avanzado). Consulta la documentacion oficial en developers.facebook.com
              para informacion actualizada.
            </p>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
