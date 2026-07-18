import { ReactElement, useEffect, useState } from 'react'
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Stack,
  Box,
  Card,
  CardContent,
  Chip,
  Checkbox,
  Button,
  Alert,
  Divider,
  Sheet,
} from '@mui/joy'
import {
  Pause as PauseIcon,
  AttachMoney as AttachMoneyIcon,
  ContentCopy as ContentCopyIcon,
  AddCircle as AddCircleIcon,
  PlayArrow as PlayArrowIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material'
import {
  PlanResponse,
  ProposedAction,
  ExecuteResponse,
  executePlan,
} from '../services/metaAdsAgentService'
import { toast } from 'react-toastify'

interface Props {
  open: boolean
  plan: PlanResponse | null
  onClose: () => void
  onExecuted?: (result: ExecuteResponse) => void
}

const ACTION_ICONS: Record<string, ReactElement> = {
  pause_campaign: <PauseIcon fontSize="small" />,
  update_campaign_budget: <AttachMoneyIcon fontSize="small" />,
  duplicate_campaign: <ContentCopyIcon fontSize="small" />,
  create_campaign_paused: <AddCircleIcon fontSize="small" />,
}

const ACTION_LABELS: Record<string, string> = {
  pause_campaign: 'Pausar campaña',
  update_campaign_budget: 'Actualizar presupuesto',
  duplicate_campaign: 'Duplicar campaña',
  create_campaign_paused: 'Crear campaña (pausada)',
}

const RISK_COLORS: Record<ProposedAction['riskLevel'], 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
}

function formatTimeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'Expirado'
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  return `${minutes}:${String(seconds).padStart(2, '0')} restantes`
}

export default function MetaAgentPlanCard({ open, plan, onClose, onExecuted }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [executing, setExecuting] = useState(false)
  const [timeLeft, setTimeLeft] = useState<string>('')
  const [result, setResult] = useState<ExecuteResponse | null>(null)

  // Preseleccionar todas las acciones al abrir
  useEffect(() => {
    if (plan) {
      setSelectedIds(new Set(plan.proposedActions.map((a) => a.id)))
      setResult(null)
    }
  }, [plan])

  // Tick para countdown
  useEffect(() => {
    if (!open || !plan) return
    const upd = () => setTimeLeft(formatTimeLeft(plan.expiresAt))
    upd()
    const t = setInterval(upd, 1000)
    return () => clearInterval(t)
  }, [open, plan])

  if (!plan) return null

  const expired = new Date(plan.expiresAt).getTime() <= Date.now()

  const toggleAction = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleExecute = async () => {
    if (selectedIds.size === 0) {
      toast.warn('Selecciona al menos una acción para ejecutar')
      return
    }
    setExecuting(true)
    try {
      const r = await executePlan({
        planId: plan.planId,
        confirmActionIds: Array.from(selectedIds),
      })
      setResult(r)
      toast.success(
        r.alreadyExecuted
          ? 'Plan ya estaba ejecutado'
          : `Ejecutadas ${r.executedActions.filter((a) => a.success).length}/${
              r.executedActions.length
            } acciones`,
      )
      if (onExecuted) onExecuted(r)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Error al ejecutar plan'
      toast.error(msg)
    } finally {
      setExecuting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        size="lg"
        sx={{ maxWidth: 760, width: '100%', maxHeight: '90vh', overflow: 'auto' }}
      >
        <ModalClose />
        <Typography level="h4" sx={{ mb: 1 }}>
          Plan del Agente IA · Meta Ads
        </Typography>

        {/* Header de cuenta + tiempo */}
        <Sheet
          variant="soft"
          color="primary"
          sx={{ p: 1.5, borderRadius: 'md', mb: 2 }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <Box>
              <Typography level="body-sm" sx={{ opacity: 0.8 }}>
                Cuenta destino
              </Typography>
              <Typography level="body-md" fontWeight="lg">
                {plan.account.adAccountId || 'Cuenta principal de la empresa'}
                {plan.account.whatsappName && ` · ${plan.account.whatsappName}`}
              </Typography>
            </Box>
            <Chip
              color={expired ? 'danger' : 'neutral'}
              variant="soft"
              size="sm"
            >
              {timeLeft}
            </Chip>
          </Stack>
        </Sheet>

        {/* Summary */}
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Typography level="title-md" sx={{ mb: 1 }}>
              Resumen
            </Typography>
            <Typography level="body-sm" sx={{ whiteSpace: 'pre-wrap' }}>
              {plan.summary || '(sin resumen)'}
            </Typography>
          </CardContent>
        </Card>

        {/* Resultado de ejecución (si ya se ejecutó) */}
        {result && (
          <Alert
            color={result.executedActions.every((a) => a.success) ? 'success' : 'warning'}
            startDecorator={
              result.executedActions.every((a) => a.success) ? (
                <CheckCircleIcon />
              ) : (
                <WarningIcon />
              )
            }
            sx={{ mb: 2 }}
          >
            <Stack>
              <Typography level="body-sm" fontWeight="lg">
                Plan #{result.planId} · status: {result.status}
              </Typography>
              {result.executedActions.map((a) => (
                <Typography key={a.id} level="body-xs">
                  {a.success ? '✅' : '❌'} {ACTION_LABELS[a.action] || a.action}
                  {a.errorMessage ? ` — ${a.errorMessage}` : ''}
                </Typography>
              ))}
            </Stack>
          </Alert>
        )}

        {/* Lista de acciones propuestas */}
        {plan.proposedActions.length === 0 ? (
          <Alert color="neutral" sx={{ mb: 2 }}>
            El agente no propuso acciones. Puedes refinar el prompt o pedir un análisis distinto.
          </Alert>
        ) : (
          <Stack spacing={1.5} sx={{ mb: 2 }}>
            <Typography level="title-md">
              Acciones propuestas ({plan.proposedActions.length})
            </Typography>
            {plan.proposedActions.map((a) => {
              const checked = selectedIds.has(a.id)
              return (
                <Card
                  key={a.id}
                  variant="outlined"
                  sx={{
                    borderColor: checked ? 'primary.500' : 'neutral.outlinedBorder',
                  }}
                >
                  <CardContent>
                    <Stack direction="row" alignItems="flex-start" spacing={1.5}>
                      <Checkbox
                        checked={checked}
                        onChange={() => toggleAction(a.id)}
                        disabled={!!result || expired}
                      />
                      <Box flex={1}>
                        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                          {ACTION_ICONS[a.action]}
                          <Typography level="body-md" fontWeight="lg">
                            {ACTION_LABELS[a.action] || a.action}
                          </Typography>
                          <Chip color={RISK_COLORS[a.riskLevel]} size="sm" variant="soft">
                            riesgo {a.riskLevel}
                          </Chip>
                        </Stack>
                        <Typography level="body-sm" sx={{ mt: 0.5 }}>
                          {a.reason}
                        </Typography>
                        <Box
                          component="pre"
                          sx={{
                            mt: 1,
                            p: 1,
                            bgcolor: 'background.level1',
                            borderRadius: 'sm',
                            fontSize: '0.75rem',
                            overflow: 'auto',
                            margin: 0,
                          }}
                        >
                          {JSON.stringify(a.params, null, 2)}
                        </Box>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              )
            })}
          </Stack>
        )}

        <Divider sx={{ my: 1 }} />

        {/* Acciones */}
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button variant="plain" color="neutral" onClick={onClose}>
            Cerrar
          </Button>
          {!result && plan.proposedActions.length > 0 && (
            <Button
              startDecorator={<PlayArrowIcon />}
              loading={executing}
              disabled={selectedIds.size === 0 || expired}
              onClick={handleExecute}
            >
              Ejecutar {selectedIds.size}/{plan.proposedActions.length} acciones
            </Button>
          )}
        </Stack>
      </ModalDialog>
    </Modal>
  )
}
