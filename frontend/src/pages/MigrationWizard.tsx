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
import {
  Box,
  Typography,
  Stack,
  Card,
  CardContent,
  Button,
  Chip,
  Alert,
  CircularProgress,
  Divider,
  Sheet,
  Table,
  Stepper,
  Step,
  StepIndicator,
  Select,
  Option,
  Checkbox,
  LinearProgress,
} from '@mui/joy'
import {
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  ArrowForward as ArrowForwardIcon,
  ArrowBack as ArrowBackIcon,
  SwapHoriz as SwapIcon,
  PhoneAndroid as PhoneIcon,
  CloudDone as CloudDoneIcon,
  Assignment as TicketIcon,
  Security as SecurityIcon,
  Celebration as CelebrationIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
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

  // Render por paso
  const renderStep = () => {
    switch (step) {
      // ═══════════════════════════════════════════════════════════════
      // PASO 0: Seleccionar conexión Baileys
      // ═══════════════════════════════════════════════════════════════
      case 0:
        return (
          <Card>
            <CardContent>
              <Typography level="title-lg" startDecorator={<PhoneIcon />} sx={{ mb: 2 }}>
                Seleccionar Conexion Baileys
              </Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 3 }}>
                Elige la conexion Baileys que deseas migrar a Meta Coexistencia.
                Solo se muestran conexiones de tipo WhatsApp (Baileys).
              </Typography>

              {connectionsLoading ? (
                <Stack alignItems="center" sx={{ py: 4 }}>
                  <CircularProgress />
                </Stack>
              ) : baileysConnections.length === 0 ? (
                <Alert variant="soft" color="neutral">
                  <Typography level="body-sm">
                    No hay conexiones Baileys disponibles para migrar.
                  </Typography>
                </Alert>
              ) : (
                <>
                  <Sheet variant="outlined" sx={{ borderRadius: 'sm', overflow: 'auto', mb: 2 }}>
                    <Table size="sm" stripe="even">
                      <thead>
                        <tr>
                          <th style={{ width: 50 }}></th>
                          <th style={{ width: 50 }}>ID</th>
                          <th>Nombre</th>
                          <th>Numero</th>
                          <th style={{ width: 100 }}>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {baileysConnections.map((conn) => (
                          <tr
                            key={conn.id}
                            onClick={() => setSelectedId(conn.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td>
                              <Checkbox
                                checked={selectedId === conn.id}
                                onChange={() => setSelectedId(conn.id)}
                              />
                            </td>
                            <td>
                              <Typography level="body-xs" fontWeight={600}>
                                #{conn.id}
                              </Typography>
                            </td>
                            <td>
                              <Typography level="body-sm">{conn.name}</Typography>
                            </td>
                            <td>
                              <Typography level="body-sm">{conn.number || '—'}</Typography>
                            </td>
                            <td>
                              <Chip
                                size="sm"
                                variant="soft"
                                color={conn.status === 'CONNECTED' ? 'success' : 'neutral'}
                              >
                                {conn.status}
                              </Chip>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </Sheet>

                  <Button
                    variant="solid"
                    color="primary"
                    endDecorator={<ArrowForwardIcon />}
                    onClick={checkEligibility}
                    disabled={!selectedId}
                    loading={loading}
                    fullWidth
                  >
                    Verificar Elegibilidad
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )

      // ═══════════════════════════════════════════════════════════════
      // PASO 1: Resultado de elegibilidad
      // ═══════════════════════════════════════════════════════════════
      case 1:
        if (!eligibility) return null
        return (
          <Card>
            <CardContent>
              <Typography
                level="title-lg"
                startDecorator={eligibility.eligible ? <CheckIcon color="success" /> : <ErrorIcon color="error" />}
                sx={{ mb: 2 }}
              >
                {eligibility.eligible ? 'Elegible para Migracion' : 'No Elegible'}
              </Typography>

              {/* Info de la conexión */}
              <Sheet variant="soft" sx={{ p: 2, borderRadius: 'sm', mb: 2 }}>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Conexion:</Typography>
                    <Typography level="body-sm" fontWeight={600}>{eligibility.connectionName} (#{eligibility.whatsappId})</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Numero:</Typography>
                    <Typography level="body-sm">{eligibility.phoneNumber || 'Sin identificar'}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Estado:</Typography>
                    <Chip size="sm" variant="soft" color={eligibility.status === 'CONNECTED' ? 'success' : 'neutral'}>
                      {eligibility.status}
                    </Chip>
                  </Stack>
                </Stack>
              </Sheet>

              {/* Tickets afectados */}
              <Typography level="title-sm" startDecorator={<TicketIcon />} sx={{ mb: 1 }}>
                Tickets Afectados
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mb: 2 }}>
                <Card variant="outlined" size="sm">
                  <CardContent sx={{ textAlign: 'center', py: 1 }}>
                    <Typography level="h4" color="primary">{eligibility.ticketSummary.open}</Typography>
                    <Typography level="body-xs">Abiertos</Typography>
                  </CardContent>
                </Card>
                <Card variant="outlined" size="sm">
                  <CardContent sx={{ textAlign: 'center', py: 1 }}>
                    <Typography level="h4" color="warning">{eligibility.ticketSummary.pending}</Typography>
                    <Typography level="body-xs">Pendientes</Typography>
                  </CardContent>
                </Card>
                <Card variant="outlined" size="sm">
                  <CardContent sx={{ textAlign: 'center', py: 1 }}>
                    <Typography level="h4">{eligibility.ticketSummary.closed}</Typography>
                    <Typography level="body-xs">Cerrados</Typography>
                  </CardContent>
                </Card>
              </Box>

              {/* Razones de no elegibilidad */}
              {eligibility.reasons.length > 0 && (
                <Stack spacing={1} sx={{ mb: 2 }}>
                  {eligibility.reasons.map((reason, i) => (
                    <Alert key={i} variant="soft" color="danger" size="sm" startDecorator={<ErrorIcon />}>
                      <Typography level="body-xs">{reason}</Typography>
                    </Alert>
                  ))}
                </Stack>
              )}

              {/* Advertencias */}
              {eligibility.warnings.length > 0 && (
                <Stack spacing={1} sx={{ mb: 2 }}>
                  {eligibility.warnings.map((warning, i) => (
                    <Alert key={i} variant="soft" color="warning" size="sm" startDecorator={<WarningIcon />}>
                      <Typography level="body-xs">{warning}</Typography>
                    </Alert>
                  ))}
                </Stack>
              )}

              {/* Conexión Meta existente */}
              {eligibility.existingMetaConnection.exists && (
                <Alert variant="soft" color="primary" sx={{ mb: 2 }}>
                  <Typography level="body-xs">
                    Ya existe conexion Meta #{eligibility.existingMetaConnection.id} "{eligibility.existingMetaConnection.name}".
                    Los tickets se migraran a esa conexion.
                  </Typography>
                </Alert>
              )}

              <Divider sx={{ my: 2 }} />

              <Stack direction="row" spacing={2}>
                <Button
                  variant="outlined"
                  color="neutral"
                  startDecorator={<ArrowBackIcon />}
                  onClick={() => setStep(0)}
                  sx={{ flex: 1 }}
                >
                  Volver
                </Button>
                {eligibility.eligible && (
                  <Button
                    variant="solid"
                    color="primary"
                    endDecorator={<ArrowForwardIcon />}
                    onClick={() => setStep(2)}
                    sx={{ flex: 1 }}
                  >
                    Continuar
                  </Button>
                )}
              </Stack>
            </CardContent>
          </Card>
        )

      // ═══════════════════════════════════════════════════════════════
      // PASO 2: Confirmar desconexión Baileys
      // ═══════════════════════════════════════════════════════════════
      case 2:
        return (
          <Card>
            <CardContent>
              <Typography level="title-lg" startDecorator={<SecurityIcon />} sx={{ mb: 2 }}>
                Confirmar Desconexion de Baileys
              </Typography>

              <Alert variant="soft" color="danger" sx={{ mb: 3 }}>
                <Box>
                  <Typography level="body-sm" fontWeight={600}>
                    Accion irreversible
                  </Typography>
                  <Typography level="body-xs">
                    Al desconectar Baileys, la sesion actual se cerrara permanentemente.
                    No podras recibir ni enviar mensajes por esta conexion hasta completar
                    el Embedded Signup con Meta.
                  </Typography>
                </Box>
              </Alert>

              <Stack spacing={2} sx={{ mb: 3 }}>
                <Typography level="body-sm">
                  <strong>Conexion:</strong> {eligibility?.connectionName} (#{selectedId})
                </Typography>
                <Typography level="body-sm">
                  <strong>Numero:</strong> {eligibility?.phoneNumber || 'Sin identificar'}
                </Typography>
                <Typography level="body-sm">
                  <strong>Tickets activos:</strong> {(eligibility?.ticketSummary.open || 0) + (eligibility?.ticketSummary.pending || 0)} (seran reasignados)
                </Typography>
              </Stack>

              <Checkbox
                label="Entiendo que la sesion Baileys se cerrara y necesitare completar el Embedded Signup"
                checked={disconnectConfirm}
                onChange={(e) => setDisconnectConfirm(e.target.checked)}
                sx={{ mb: 3 }}
              />

              <Stack direction="row" spacing={2}>
                <Button
                  variant="outlined"
                  color="neutral"
                  startDecorator={<ArrowBackIcon />}
                  onClick={() => { setStep(1); setDisconnectConfirm(false) }}
                  sx={{ flex: 1 }}
                >
                  Volver
                </Button>
                <Button
                  variant="solid"
                  color="danger"
                  endDecorator={<SwapIcon />}
                  onClick={handleDisconnect}
                  disabled={!disconnectConfirm}
                  loading={loading}
                  sx={{ flex: 1 }}
                >
                  Desconectar Baileys
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )

      // ═══════════════════════════════════════════════════════════════
      // PASO 3: Embedded Signup
      // ═══════════════════════════════════════════════════════════════
      case 3:
        return (
          <Card>
            <CardContent>
              <Typography level="title-lg" startDecorator={<CloudDoneIcon />} sx={{ mb: 2 }}>
                Conectar con Meta Embedded Signup
              </Typography>

              {disconnectResult?.success && (
                <Alert variant="soft" color="success" sx={{ mb: 2 }}>
                  <Typography level="body-xs">{disconnectResult.message}</Typography>
                </Alert>
              )}

              <Alert variant="soft" color="primary" sx={{ mb: 3 }}>
                <Box>
                  <Typography level="body-sm" fontWeight={600}>
                    Siguiente paso: Embedded Signup
                  </Typography>
                  <Typography level="body-xs">
                    Haz clic en el boton para iniciar el Embedded Signup de Meta.
                    Usa el MISMO numero de telefono ({eligibility?.phoneNumber || 'el de la conexion anterior'})
                    para que la migracion sea correcta.
                  </Typography>
                </Box>
              </Alert>

              <Stack spacing={2}>
                {!embeddedSignupDone ? (
                  <Button
                    variant="solid"
                    color="primary"
                    size="lg"
                    startDecorator={<CloudDoneIcon />}
                    onClick={() => setEmbeddedSignupOpen(true)}
                    sx={{
                      bgcolor: '#1877f2',
                      '&:hover': { bgcolor: '#166fe5' },
                      fontWeight: 700,
                    }}
                    fullWidth
                  >
                    Iniciar Embedded Signup
                  </Button>
                ) : (
                  <Alert variant="soft" color="success" startDecorator={<CheckIcon />}>
                    <Typography level="body-sm">
                      Embedded Signup completado. Procediendo a la migracion de tickets...
                    </Typography>
                  </Alert>
                )}

                <Button
                  variant="outlined"
                  color="neutral"
                  onClick={() => {
                    // Skip al paso 4 si ya tienen una conexión Meta
                    handleEmbeddedSignupSuccess()
                  }}
                  size="sm"
                >
                  Ya tengo una conexion Meta configurada → Saltar
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )

      // ═══════════════════════════════════════════════════════════════
      // PASO 4: Completar migración (reasignar tickets)
      // ═══════════════════════════════════════════════════════════════
      case 4:
        return (
          <Card>
            <CardContent>
              <Typography level="title-lg" startDecorator={<TicketIcon />} sx={{ mb: 2 }}>
                Migrar Tickets
              </Typography>

              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 2 }}>
                Selecciona la conexion Meta destino donde se reasignaran los tickets
                activos de la conexion Baileys original.
              </Typography>

              {metaConnections.length === 0 ? (
                <Alert variant="soft" color="warning" sx={{ mb: 2 }}>
                  <Box>
                    <Typography level="body-sm" fontWeight={600}>
                      No se encontraron conexiones Meta
                    </Typography>
                    <Typography level="body-xs">
                      Completa el Embedded Signup primero, o verifica que la conexion Meta este creada.
                    </Typography>
                  </Box>
                </Alert>
              ) : (
                <Select
                  value={selectedMetaId}
                  onChange={(_e, val) => setSelectedMetaId(val)}
                  placeholder="Seleccionar conexion Meta destino"
                  sx={{ mb: 3 }}
                >
                  {metaConnections.map((conn) => (
                    <Option key={conn.id} value={conn.id}>
                      #{conn.id} — {conn.name} ({conn.number || 'Sin numero'}) — {conn.status}
                    </Option>
                  ))}
                </Select>
              )}

              <Sheet variant="soft" sx={{ p: 2, borderRadius: 'sm', mb: 3 }}>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Origen (Baileys):</Typography>
                    <Typography level="body-xs" fontWeight={600}>#{selectedId}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Destino (Meta):</Typography>
                    <Typography level="body-xs" fontWeight={600}>
                      {selectedMetaId ? `#${selectedMetaId}` : '(seleccionar)'}
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Tickets a migrar:</Typography>
                    <Typography level="body-xs" fontWeight={600}>
                      {(eligibility?.ticketSummary.open || 0) + (eligibility?.ticketSummary.pending || 0)} activos
                    </Typography>
                  </Stack>
                </Stack>
              </Sheet>

              <Stack direction="row" spacing={2}>
                <Button
                  variant="outlined"
                  color="neutral"
                  startDecorator={<ArrowBackIcon />}
                  onClick={() => setStep(3)}
                  sx={{ flex: 1 }}
                >
                  Volver
                </Button>
                <Button
                  variant="solid"
                  color="success"
                  endDecorator={<SwapIcon />}
                  onClick={handleComplete}
                  disabled={!selectedMetaId}
                  loading={loading}
                  sx={{ flex: 1 }}
                >
                  Completar Migracion
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )

      // ═══════════════════════════════════════════════════════════════
      // PASO 5: Resultado final
      // ═══════════════════════════════════════════════════════════════
      case 5:
        return (
          <Card>
            <CardContent>
              <Stack spacing={3} alignItems="center" sx={{ py: 3 }}>
                <CelebrationIcon sx={{ fontSize: 64, color: 'success.500' }} />
                <Typography level="h3" sx={{ color: 'success.700' }}>
                  Migracion Completada
                </Typography>

                <Sheet variant="soft" color="success" sx={{ p: 3, borderRadius: 'md', width: '100%' }}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography level="body-sm">Conexion Baileys (origen):</Typography>
                      <Chip variant="outlined" color="neutral" size="sm">
                        #{completeResult?.oldWhatsappId || selectedId} — MIGRADA
                      </Chip>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography level="body-sm">Conexion Meta (destino):</Typography>
                      <Chip variant="outlined" color="success" size="sm">
                        #{completeResult?.newWhatsappId || selectedMetaId} — ACTIVA
                      </Chip>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography level="body-sm">Tickets migrados:</Typography>
                      <Typography level="body-sm" fontWeight={700}>
                        {completeResult?.ticketsMigrated || 0}
                      </Typography>
                    </Stack>
                  </Stack>
                </Sheet>

                <Alert variant="soft" color="primary" sx={{ width: '100%' }}>
                  <Typography level="body-xs">
                    Recuerda abrir la WhatsApp Business App al menos cada 14 dias
                    para mantener la coexistencia activa. El sistema te alertara
                    cuando se acerque el limite.
                  </Typography>
                </Alert>

                <Stack direction="row" spacing={2} sx={{ width: '100%' }}>
                  <Button
                    variant="outlined"
                    color="neutral"
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
                    startDecorator={<RefreshIcon />}
                    sx={{ flex: 1 }}
                  >
                    Migrar Otra
                  </Button>
                  <Button
                    variant="solid"
                    color="success"
                    onClick={() => window.location.href = '/coexistence'}
                    endDecorator={<ArrowForwardIcon />}
                    sx={{ flex: 1 }}
                  >
                    Ir al Dashboard
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        )

      default:
        return null
    }
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 800, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #25d366, #1877f2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SwapIcon sx={{ color: 'white', fontSize: 28 }} />
        </Box>
        <Box>
          <Typography level="h3">Wizard de Migracion</Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Baileys → Meta Coexistencia
          </Typography>
        </Box>
      </Stack>

      {/* Stepper */}
      <Stepper sx={{ mb: 4 }}>
        {STEP_LABELS.map((label, index) => (
          <Step
            key={label}
            indicator={
              <StepIndicator
                variant={step >= index ? 'solid' : 'outlined'}
                color={
                  step > index
                    ? 'success'
                    : step === index
                    ? 'primary'
                    : 'neutral'
                }
              >
                {step > index ? <CheckIcon sx={{ fontSize: 16 }} /> : index + 1}
              </StepIndicator>
            }
            sx={{
              '&::after': {
                ...(step > index && {
                  bgcolor: 'success.solidBg',
                }),
              },
            }}
          >
            <Typography
              level="body-xs"
              sx={{
                fontWeight: step === index ? 700 : 400,
                color: step >= index ? 'text.primary' : 'text.tertiary',
              }}
            >
              {label}
            </Typography>
          </Step>
        ))}
      </Stepper>

      {/* Contenido del paso actual */}
      {renderStep()}

      {/* Embedded Signup Modal */}
      <EmbeddedSignupModal
        open={embeddedSignupOpen}
        onClose={() => setEmbeddedSignupOpen(false)}
        onSuccess={handleEmbeddedSignupSuccess}
      />
    </Box>
  )
}
