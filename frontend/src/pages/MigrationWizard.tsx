/**
 * MigrationWizard — Wizard paso a paso para migrar Baileys → Meta Coexistencia
 *
 * Pasos:
 * 1. Seleccionar conexión Baileys a migrar
 * 2. Verificar elegibilidad + mostrar impacto
 * 3. Confirmar y desconectar Baileys
 * 4. Embedded Signup con el mismo número
 * 5. Completar migración (reasignar tickets)
 * 6. Resultado final
 */
import { useState, useEffect, useCallback } from 'react'
// [Fase2·G] Conservado como MUI a propósito: no hay equivalente en el design system.
import { CircularProgress } from '@mui/joy'
import {
  Check,
  CheckCircle,
  XCircle,
  Warning,
  ArrowRight,
  ArrowLeft,
  ArrowsLeftRight,
  DeviceMobile,
  CloudCheck,
  Ticket,
  ShieldCheck,
  Confetti,
  ArrowClockwise,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import api from '../services/api'
import EmbeddedSignupModal from '../components/EmbeddedSignupModal'

// Tipos
interface BaileysConnection {
  id: number
  name: string
  status: string
  number: string | null
  provider: string
  channel: string
}

interface EligibilityData {
  eligible: boolean
  whatsappId: number
  connectionName: string
  phoneNumber: string | null
  provider: string
  channel: string
  status: string
  reasons: string[]
  warnings: string[]
  ticketSummary: {
    open: number
    pending: number
    closed: number
    total: number
  }
  existingMetaConnection: {
    exists: boolean
    id?: number
    name?: string
    status?: string
  }
}

interface MetaConnection {
  id: number
  name: string
  status: string
  number: string | null
}

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5

const STEP_LABELS = [
  'Seleccionar Conexion',
  'Verificar Elegibilidad',
  'Desconectar Baileys',
  'Embedded Signup',
  'Migrar Tickets',
  'Completado',
]

const TABLE_COLUMNS = ['', 'ID', 'Nombre', 'Numero', 'Estado']

/** Tarjeta contenedora del paso (reemplaza Card/CardContent de Joy). */
function StepCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] sm:p-6">
      {children}
    </div>
  )
}

/** Aviso con tono semántico (reemplaza Alert de Joy). */
function Notice({
  tone,
  icon,
  className,
  children,
}: {
  tone: 'neutral' | 'primary' | 'success' | 'warning' | 'destructive'
  icon?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  const toneClasses: Record<typeof tone, string> = {
    neutral: 'border-border bg-muted/40 text-muted-foreground',
    primary: 'border-primary/30 bg-primary/10 text-foreground',
    success: 'border-success/30 bg-success/10 text-success-text',
    warning: 'border-warning/30 bg-warning/10 text-warning-text',
    destructive: 'border-destructive/30 bg-destructive/10 text-destructive-text',
  }
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm',
        toneClasses[tone],
        className,
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** Fila etiqueta → valor de los paneles de resumen (reemplaza Stack+Typography). */
function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

export default function MigrationWizard() {
  const [step, setStep] = useState<WizardStep>(0)
  const [loading, setLoading] = useState(false)

  // Step 0: Selección
  const [baileysConnections, setBaileysConnections] = useState<BaileysConnection[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [connectionsLoading, setConnectionsLoading] = useState(true)

  // Step 1: Elegibilidad
  const [eligibility, setEligibility] = useState<EligibilityData | null>(null)

  // Step 2: Desconexión
  const [disconnectConfirm, setDisconnectConfirm] = useState(false)
  const [disconnectResult, setDisconnectResult] = useState<{ success: boolean; message: string } | null>(null)

  // Step 3: Embedded Signup
  const [embeddedSignupOpen, setEmbeddedSignupOpen] = useState(false)
  const [embeddedSignupDone, setEmbeddedSignupDone] = useState(false)

  // Step 4: Completar migración
  const [metaConnections, setMetaConnections] = useState<MetaConnection[]>([])
  const [selectedMetaId, setSelectedMetaId] = useState<number | null>(null)
  const [completeResult, setCompleteResult] = useState<{
    success: boolean
    ticketsMigrated: number
    message: string
    oldWhatsappId: number
    newWhatsappId: number
  } | null>(null)

  // Cargar conexiones Baileys
  const fetchBaileysConnections = useCallback(async () => {
    setConnectionsLoading(true)
    try {
      const { data } = await api.get('/whatsapps')
      const baileys = (data || []).filter(
        (c: BaileysConnection) =>
          (c.provider === 'stable' || !c.provider) &&
          (c.channel === 'whatsapp' || !c.channel)
      )
      setBaileysConnections(baileys)
    } catch {
      toast.error('Error cargando conexiones')
    } finally {
      setConnectionsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBaileysConnections()
  }, [fetchBaileysConnections])

  // Step 1: Verificar elegibilidad
  const checkEligibility = async () => {
    if (!selectedId) return
    setLoading(true)
    try {
      const { data } = await api.get(`/whatsapp/migration/eligibility/${selectedId}`)
      setEligibility(data.data)
      setStep(1)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      toast.error(error.response?.data?.error || 'Error verificando elegibilidad')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Desconectar Baileys
  const handleDisconnect = async () => {
    if (!selectedId) return
    setLoading(true)
    try {
      const { data } = await api.post(`/whatsapp/migration/start/${selectedId}`)
      setDisconnectResult(data.data)
      if (data.data.success) {
        toast.success('Baileys desconectado exitosamente')
        setStep(3) // Saltar a Embedded Signup
      } else {
        toast.error(data.data.message)
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      toast.error(error.response?.data?.error || 'Error desconectando Baileys')
    } finally {
      setLoading(false)
    }
  }

  // Step 3: Callback del Embedded Signup
  const handleEmbeddedSignupSuccess = async () => {
    setEmbeddedSignupDone(true)
    setEmbeddedSignupOpen(false)
    toast.success('Embedded Signup completado')

    // Cargar conexiones Meta para seleccionar destino
    try {
      const { data } = await api.get('/whatsapps')
      const meta = (data || []).filter(
        (c: MetaConnection & { provider?: string; channel?: string }) =>
          c.provider === 'meta' && c.channel === 'meta'
      )
      setMetaConnections(meta)

      // Auto-seleccionar si solo hay una
      if (meta.length === 1) {
        setSelectedMetaId(meta[0].id)
      }

      setStep(4)
    } catch {
      toast.error('Error cargando conexiones Meta')
    }
  }

  // Step 4: Completar migración
  const handleComplete = async () => {
    if (!selectedId || !selectedMetaId) return
    setLoading(true)
    try {
      const { data } = await api.post('/whatsapp/migration/complete', {
        oldWhatsappId: selectedId,
        newWhatsappId: selectedMetaId,
      })
      setCompleteResult(data.data)
      if (data.data.success) {
        toast.success(`Migracion completada! ${data.data.ticketsMigrated} tickets migrados`)
        setStep(5)
      } else {
        toast.error(data.data.message)
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      toast.error(error.response?.data?.error || 'Error completando migración')
    } finally {
      setLoading(false)
    }
  }

  const statusVariant = (status: string): BadgeProps['variant'] =>
    status === 'CONNECTED' ? 'success' : 'neutral'

  // Render por paso
  const renderStep = () => {
    switch (step) {
      // ═══════════════════════════════════════════════════════════════
      // PASO 0: Seleccionar conexión Baileys
      // ═══════════════════════════════════════════════════════════════
      case 0:
        return (
          <StepCard>
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-foreground">
              <DeviceMobile className="size-5 text-muted-foreground" aria-hidden />
              Seleccionar Conexion Baileys
            </h2>
            <p className="mb-5 text-sm text-muted-foreground">
              Elige la conexion Baileys que deseas migrar a Meta Coexistencia.
              Solo se muestran conexiones de tipo WhatsApp (Baileys).
            </p>

            {connectionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <CircularProgress />
              </div>
            ) : baileysConnections.length === 0 ? (
              <Notice tone="neutral">
                No hay conexiones Baileys disponibles para migrar.
              </Notice>
            ) : (
              <>
                <div className="mb-4 overflow-hidden rounded-lg border border-border">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-left">
                          {TABLE_COLUMNS.map((c, i) => (
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
                        {baileysConnections.map((conn) => (
                          <tr
                            key={conn.id}
                            onClick={() => setSelectedId(conn.id)}
                            className={cn(
                              'cursor-pointer transition-colors hover:bg-accent/40',
                              selectedId === conn.id && 'bg-accent/50',
                            )}
                          >
                            <td className="px-4 py-3">
                              <Checkbox
                                id={`baileys-conn-${conn.id}`}
                                checked={selectedId === conn.id}
                                onCheckedChange={() => setSelectedId(conn.id)}
                              />
                            </td>
                            <td className="px-4 py-3 text-xs font-semibold tabular-nums text-foreground">
                              #{conn.id}
                            </td>
                            <td className="px-4 py-3">
                              {/* El <label> asociado nombra al checkbox (que no expone aria-label). */}
                              <label
                                htmlFor={`baileys-conn-${conn.id}`}
                                className="cursor-pointer font-medium text-foreground"
                              >
                                {conn.name}
                              </label>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                              {conn.number || '—'}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={statusVariant(conn.status)} dot>
                                {conn.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={checkEligibility}
                  disabled={!selectedId}
                  loading={loading}
                >
                  Verificar Elegibilidad
                  <ArrowRight className="size-4" weight="bold" aria-hidden />
                </Button>
              </>
            )}
          </StepCard>
        )

      // ═══════════════════════════════════════════════════════════════
      // PASO 1: Resultado de elegibilidad
      // ═══════════════════════════════════════════════════════════════
      case 1:
        if (!eligibility) return null
        return (
          <StepCard>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              {eligibility.eligible ? (
                <CheckCircle className="size-5 text-success-text" weight="fill" aria-hidden />
              ) : (
                <XCircle className="size-5 text-destructive-text" weight="fill" aria-hidden />
              )}
              {eligibility.eligible ? 'Elegible para Migracion' : 'No Elegible'}
            </h2>

            {/* Info de la conexión */}
            <div className="mb-5 space-y-2 rounded-lg bg-muted/50 p-4">
              <SummaryRow label="Conexion:">
                <span className="text-sm font-semibold text-foreground">
                  {eligibility.connectionName} (#{eligibility.whatsappId})
                </span>
              </SummaryRow>
              <SummaryRow label="Numero:">
                <span className="text-sm tabular-nums text-foreground">
                  {eligibility.phoneNumber || 'Sin identificar'}
                </span>
              </SummaryRow>
              <SummaryRow label="Estado:">
                <Badge variant={statusVariant(eligibility.status)} dot>
                  {eligibility.status}
                </Badge>
              </SummaryRow>
            </div>

            {/* Tickets afectados */}
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Ticket className="size-4 text-muted-foreground" aria-hidden />
              Tickets Afectados
            </h3>
            <div className="mb-5 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                <p className="text-2xl font-semibold tabular-nums text-foreground">
                  {eligibility.ticketSummary.open}
                </p>
                <p className="text-xs text-muted-foreground">Abiertos</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                <p className="text-2xl font-semibold tabular-nums text-warning-text">
                  {eligibility.ticketSummary.pending}
                </p>
                <p className="text-xs text-muted-foreground">Pendientes</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                <p className="text-2xl font-semibold tabular-nums text-foreground">
                  {eligibility.ticketSummary.closed}
                </p>
                <p className="text-xs text-muted-foreground">Cerrados</p>
              </div>
            </div>

            {/* Razones de no elegibilidad */}
            {eligibility.reasons.length > 0 && (
              <div className="mb-5 space-y-2">
                {eligibility.reasons.map((reason, i) => (
                  <Notice
                    key={i}
                    tone="destructive"
                    icon={<XCircle className="mt-px size-4 shrink-0" weight="fill" aria-hidden />}
                  >
                    <span className="text-xs">{reason}</span>
                  </Notice>
                ))}
              </div>
            )}

            {/* Advertencias */}
            {eligibility.warnings.length > 0 && (
              <div className="mb-5 space-y-2">
                {eligibility.warnings.map((warning, i) => (
                  <Notice
                    key={i}
                    tone="warning"
                    icon={<Warning className="mt-px size-4 shrink-0" weight="fill" aria-hidden />}
                  >
                    <span className="text-xs">{warning}</span>
                  </Notice>
                ))}
              </div>
            )}

            {/* Conexión Meta existente */}
            {eligibility.existingMetaConnection.exists && (
              <Notice tone="primary" className="mb-5">
                <span className="text-xs">
                  Ya existe conexion Meta #{eligibility.existingMetaConnection.id} "{eligibility.existingMetaConnection.name}".
                  Los tickets se migraran a esa conexion.
                </span>
              </Notice>
            )}

            <div className="my-5 border-t border-border" />

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(0)}>
                <ArrowLeft className="size-4" weight="bold" aria-hidden />
                Volver
              </Button>
              {eligibility.eligible && (
                <Button className="flex-1" onClick={() => setStep(2)}>
                  Continuar
                  <ArrowRight className="size-4" weight="bold" aria-hidden />
                </Button>
              )}
            </div>
          </StepCard>
        )

      // ═══════════════════════════════════════════════════════════════
      // PASO 2: Confirmar desconexión Baileys
      // ═══════════════════════════════════════════════════════════════
      case 2:
        return (
          <StepCard>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <ShieldCheck className="size-5 text-muted-foreground" aria-hidden />
              Confirmar Desconexion de Baileys
            </h2>

            <Notice
              tone="destructive"
              className="mb-5"
              icon={<Warning className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />}
            >
              <p className="text-sm font-semibold">Accion irreversible</p>
              <p className="mt-0.5 text-xs">
                Al desconectar Baileys, la sesion actual se cerrara permanentemente.
                No podras recibir ni enviar mensajes por esta conexion hasta completar
                el Embedded Signup con Meta.
              </p>
            </Notice>

            <div className="mb-5 space-y-2 text-sm text-foreground">
              <p>
                <strong className="font-semibold">Conexion:</strong> {eligibility?.connectionName} (#{selectedId})
              </p>
              <p>
                <strong className="font-semibold">Numero:</strong> {eligibility?.phoneNumber || 'Sin identificar'}
              </p>
              <p>
                <strong className="font-semibold">Tickets activos:</strong>{' '}
                {(eligibility?.ticketSummary.open || 0) + (eligibility?.ticketSummary.pending || 0)} (seran reasignados)
              </p>
            </div>

            <div className="mb-6 flex items-start gap-3">
              <Checkbox
                id="migration-disconnect-confirm"
                checked={disconnectConfirm}
                onCheckedChange={setDisconnectConfirm}
                className="mt-0.5"
              />
              <Label
                htmlFor="migration-disconnect-confirm"
                className="cursor-pointer font-normal leading-snug"
              >
                Entiendo que la sesion Baileys se cerrara y necesitare completar el Embedded Signup
              </Label>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setStep(1); setDisconnectConfirm(false) }}
              >
                <ArrowLeft className="size-4" weight="bold" aria-hidden />
                Volver
              </Button>
              <Button
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDisconnect}
                disabled={!disconnectConfirm}
                loading={loading}
              >
                Desconectar Baileys
                <ArrowsLeftRight className="size-4" weight="bold" aria-hidden />
              </Button>
            </div>
          </StepCard>
        )

      // ═══════════════════════════════════════════════════════════════
      // PASO 3: Embedded Signup
      // ═══════════════════════════════════════════════════════════════
      case 3:
        return (
          <StepCard>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <CloudCheck className="size-5 text-muted-foreground" aria-hidden />
              Conectar con Meta Embedded Signup
            </h2>

            {disconnectResult?.success && (
              <Notice tone="success" className="mb-4">
                <span className="text-xs">{disconnectResult.message}</span>
              </Notice>
            )}

            <Notice tone="primary" className="mb-5">
              <p className="text-sm font-semibold">Siguiente paso: Embedded Signup</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Haz clic en el boton para iniciar el Embedded Signup de Meta.
                Usa el MISMO numero de telefono ({eligibility?.phoneNumber || 'el de la conexion anterior'})
                para que la migracion sea correcta.
              </p>
            </Notice>

            <div className="space-y-3">
              {!embeddedSignupDone ? (
                <Button
                  size="lg"
                  className="w-full bg-[#1877f2] font-bold text-white hover:bg-[#166fe5]"
                  onClick={() => setEmbeddedSignupOpen(true)}
                >
                  <CloudCheck className="size-5" weight="fill" aria-hidden />
                  Iniciar Embedded Signup
                </Button>
              ) : (
                <Notice
                  tone="success"
                  icon={<CheckCircle className="mt-px size-4 shrink-0" weight="fill" aria-hidden />}
                >
                  Embedded Signup completado. Procediendo a la migracion de tickets...
                </Notice>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  // Skip al paso 4 si ya tienen una conexión Meta
                  handleEmbeddedSignupSuccess()
                }}
              >
                Ya tengo una conexion Meta configurada → Saltar
              </Button>
            </div>
          </StepCard>
        )

      // ═══════════════════════════════════════════════════════════════
      // PASO 4: Completar migración (reasignar tickets)
      // ═══════════════════════════════════════════════════════════════
      case 4:
        return (
          <StepCard>
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Ticket className="size-5 text-muted-foreground" aria-hidden />
              Migrar Tickets
            </h2>

            <p className="mb-4 text-sm text-muted-foreground">
              Selecciona la conexion Meta destino donde se reasignaran los tickets
              activos de la conexion Baileys original.
            </p>

            {metaConnections.length === 0 ? (
              <Notice
                tone="warning"
                className="mb-4"
                icon={<Warning className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />}
              >
                <p className="text-sm font-semibold">No se encontraron conexiones Meta</p>
                <p className="mt-0.5 text-xs">
                  Completa el Embedded Signup primero, o verifica que la conexion Meta este creada.
                </p>
              </Notice>
            ) : (
              <div className="mb-5 space-y-1.5">
                <Label htmlFor="meta-target-connection">Conexion Meta destino</Label>
                <Select
                  value={selectedMetaId ? String(selectedMetaId) : ''}
                  onValueChange={(value) => setSelectedMetaId(Number(value))}
                >
                  <SelectTrigger id="meta-target-connection" className="h-11">
                    <SelectValue placeholder="Seleccionar conexion Meta destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {metaConnections.map((conn) => (
                      <SelectItem key={conn.id} value={String(conn.id)}>
                        #{conn.id} — {conn.name} ({conn.number || 'Sin numero'}) — {conn.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="mb-5 space-y-2 rounded-lg bg-muted/50 p-4">
              <SummaryRow label="Origen (Baileys):">
                <span className="text-xs font-semibold tabular-nums text-foreground">#{selectedId}</span>
              </SummaryRow>
              <SummaryRow label="Destino (Meta):">
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {selectedMetaId ? `#${selectedMetaId}` : '(seleccionar)'}
                </span>
              </SummaryRow>
              <SummaryRow label="Tickets a migrar:">
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {(eligibility?.ticketSummary.open || 0) + (eligibility?.ticketSummary.pending || 0)} activos
                </span>
              </SummaryRow>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(3)}>
                <ArrowLeft className="size-4" weight="bold" aria-hidden />
                Volver
              </Button>
              <Button
                className="flex-1 bg-success text-primary-foreground hover:bg-success/90"
                onClick={handleComplete}
                disabled={!selectedMetaId}
                loading={loading}
              >
                Completar Migracion
                <ArrowsLeftRight className="size-4" weight="bold" aria-hidden />
              </Button>
            </div>
          </StepCard>
        )

      // ═══════════════════════════════════════════════════════════════
      // PASO 5: Resultado final
      // ═══════════════════════════════════════════════════════════════
      case 5:
        return (
          <StepCard>
            <div className="flex flex-col items-center gap-5 py-3">
              <Confetti className="size-16 text-success-text" weight="fill" aria-hidden />
              <h2 className="text-2xl font-semibold tracking-tight text-success-text">
                Migracion Completada
              </h2>

              <div className="w-full space-y-3 rounded-lg border border-success/30 bg-success/10 p-5">
                <SummaryRow label="Conexion Baileys (origen):">
                  <Badge variant="outline">
                    #{completeResult?.oldWhatsappId || selectedId} — MIGRADA
                  </Badge>
                </SummaryRow>
                <SummaryRow label="Conexion Meta (destino):">
                  <Badge variant="success">
                    #{completeResult?.newWhatsappId || selectedMetaId} — ACTIVA
                  </Badge>
                </SummaryRow>
                <SummaryRow label="Tickets migrados:">
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {completeResult?.ticketsMigrated || 0}
                  </span>
                </SummaryRow>
              </div>

              <Notice tone="primary" className="w-full">
                <span className="text-xs text-muted-foreground">
                  Recuerda abrir la WhatsApp Business App al menos cada 14 dias
                  para mantener la coexistencia activa. El sistema te alertara
                  cuando se acerque el limite.
                </span>
              </Notice>

              <div className="flex w-full gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    // Reset wizard
                    setStep(0)
                    setSelectedId(null)
                    setEligibility(null)
                    setDisconnectConfirm(false)
                    setDisconnectResult(null)
                    setEmbeddedSignupDone(false)
                    setSelectedMetaId(null)
                    setCompleteResult(null)
                    fetchBaileysConnections()
                  }}
                >
                  <ArrowClockwise className="size-4" weight="bold" aria-hidden />
                  Migrar Otra
                </Button>
                <Button
                  className="flex-1 bg-success text-primary-foreground hover:bg-success/90"
                  onClick={() => window.location.href = '/coexistence'}
                >
                  Ir al Dashboard
                  <ArrowRight className="size-4" weight="bold" aria-hidden />
                </Button>
              </div>
            </div>
          </StepCard>
        )

      default:
        return null
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[800px] p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <ArrowsLeftRight className="size-6" weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Wizard de Migracion
            </h1>
            <p className="text-sm text-muted-foreground">Baileys → Meta Coexistencia</p>
          </div>
        </div>

        {/* Stepper */}
        <ol className="mb-8 flex items-start" aria-label="Progreso de la migracion">
          {STEP_LABELS.map((label, index) => {
            const done = step > index
            const current = step === index
            return (
              <li key={label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full items-center">
                  <span
                    className={cn(
                      'h-0.5 flex-1 rounded-full',
                      index === 0 && 'invisible',
                      step >= index ? 'bg-success' : 'bg-border',
                    )}
                    aria-hidden
                  />
                  <span
                    aria-current={current ? 'step' : undefined}
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
                      done && 'border-transparent bg-success text-primary-foreground',
                      current && 'border-transparent bg-primary text-primary-foreground',
                      !done && !current && 'border-border bg-card text-muted-foreground',
                    )}
                  >
                    {done ? <Check className="size-4" weight="bold" aria-hidden /> : index + 1}
                  </span>
                  <span
                    className={cn(
                      'h-0.5 flex-1 rounded-full',
                      index === STEP_LABELS.length - 1 && 'invisible',
                      done ? 'bg-success' : 'bg-border',
                    )}
                    aria-hidden
                  />
                </div>
                <span
                  className={cn(
                    'px-1 text-center text-[11px] leading-tight',
                    current
                      ? 'font-bold text-foreground'
                      : done
                        ? 'text-foreground'
                        : 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
              </li>
            )
          })}
        </ol>

        {/* Contenido del paso actual */}
        {renderStep()}

        {/* Embedded Signup Modal */}
        <EmbeddedSignupModal
          open={embeddedSignupOpen}
          onClose={() => setEmbeddedSignupOpen(false)}
          onSuccess={handleEmbeddedSignupSuccess}
        />
      </div>
    </div>
  )
}
