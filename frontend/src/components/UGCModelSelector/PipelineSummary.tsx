import { useMemo } from 'react'
import {
  Box,
  Card,
  Chip,
  Divider,
  Sheet,
  Stack,
  Typography
} from '@mui/joy'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import MovieRoundedIcon from '@mui/icons-material/MovieRounded'
import RecordVoiceOverRoundedIcon from '@mui/icons-material/RecordVoiceOverRounded'
import MicNoneRoundedIcon from '@mui/icons-material/MicNoneRounded'
import type {
  FalCatalogEntry,
  PipelineMode
} from '../../services/ugcModelSelectorService'
import {
  falCostUsdToCompanyTokens,
  formatFalPricingAsTokens,
  formatTokenAmount
} from '../../utils/falTokenPricing'

interface SlotChoice {
  model: FalCatalogEntry
  defaults: Record<string, unknown>
}

interface PipelineSummaryProps {
  pipelineMode: PipelineMode
  imageSlot: SlotChoice | null
  videoSlot: SlotChoice | null
  voiceSlot: SlotChoice | null
  lipsyncSlot: SlotChoice | null
  /** Caracteres aproximados del script para estimar costo TTS */
  estimatedScriptChars?: number
}

import type { ReactElement } from 'react'

interface RowProps {
  icon: ReactElement
  label: string
  slot: SlotChoice | null
  costNote?: string
  tokens?: number
  required: boolean
  modeApplies: boolean
}

function SummaryRow({
  icon,
  label,
  slot,
  costNote,
  tokens,
  required,
  modeApplies
}: RowProps) {
  if (!modeApplies) return null
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={2}
      sx={{ py: 1.5 }}
    >
      <Box sx={{ color: 'primary.500', display: 'flex', alignItems: 'center' }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 80 }}>
        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
          {label}
        </Typography>
      </Box>
      <Box sx={{ flex: 1 }}>
        {slot ? (
          <Typography level="title-sm">{slot.model.displayName}</Typography>
        ) : required ? (
          <Chip size="sm" variant="soft" color="danger">
            Falta seleccionar
          </Chip>
        ) : (
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            (opcional, no seleccionado)
          </Typography>
        )}
      </Box>
      <Box sx={{ textAlign: 'right', minWidth: 110 }}>
        {slot ? (
          <>
            <Typography level="title-sm">
              {tokens !== undefined
                ? formatTokenAmount(tokens)
                : formatFalPricingAsTokens(slot.model.pricing)}
            </Typography>
            {costNote && (
              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                {costNote}
              </Typography>
            )}
          </>
        ) : null}
      </Box>
    </Stack>
  )
}

/**
 * Estima el costo de un slot en USD antes de aplicar la misma conversión
 * a tokens que usa el backend: ceil(estimatedCostUsd * 100).
 */
function estimateSlotCostUsd(
  slot: SlotChoice | null,
  estimatedScriptChars: number
): number | undefined {
  if (!slot) return undefined
  const { pricing, defaults } = slot.model
  const merged = { ...slot.model.defaults, ...defaults }

  if (pricing.unit === 'image') {
    const num = Number(merged.num_images ?? 1)
    return pricing.estimateUsd * (num || 1)
  }

  if (pricing.unit === 'character') {
    return pricing.estimateUsd * estimatedScriptChars
  }

  if (pricing.unit === 'second') {
    // Heurística de duración: para video, parseInt del default duration
    // (puede venir como "5" o "8s"). Si no, usamos 5s.
    const rawDuration = String(merged.duration ?? '5')
    const seconds = parseInt(rawDuration.replace(/[^\d]/g, ''), 10) || 5
    return pricing.estimateUsd * seconds
  }

  return undefined
}

function estimateSlotTokens(
  slot: SlotChoice | null,
  estimatedScriptChars: number
): number | undefined {
  const usd = estimateSlotCostUsd(slot, estimatedScriptChars)
  return usd === undefined ? undefined : falCostUsdToCompanyTokens(usd)
}

function PipelineSummary({
  pipelineMode,
  imageSlot,
  videoSlot,
  voiceSlot,
  lipsyncSlot,
  estimatedScriptChars = 1000
}: PipelineSummaryProps) {
  const modeApplies = useMemo(
    () => ({
      image: pipelineMode !== 'text-to-video-direct',
      video: true,
      voice: true, // siempre visible — required en lipsync-talking-head
      lipsync: pipelineMode === 'lipsync-talking-head'
    }),
    [pipelineMode]
  )

  const required = {
    image: pipelineMode !== 'text-to-video-direct',
    video: true,
    voice: pipelineMode === 'lipsync-talking-head',
    lipsync: pipelineMode === 'lipsync-talking-head'
  }

  const tokens = {
    image: estimateSlotTokens(imageSlot, estimatedScriptChars),
    video: estimateSlotTokens(videoSlot, estimatedScriptChars),
    voice: estimateSlotTokens(voiceSlot, estimatedScriptChars),
    lipsync: estimateSlotTokens(lipsyncSlot, estimatedScriptChars)
  }

  const totalTokens = [tokens.image, tokens.video, tokens.voice, tokens.lipsync]
    .filter((value): value is number => typeof value === 'number')
    .reduce((acc, value) => acc + value, 0)

  return (
    <Card variant="outlined" sx={{ p: 3 }}>
      <Typography level="title-lg" sx={{ fontWeight: 700, mb: 0.5 }}>
        Resumen del Pipeline
      </Typography>
      <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 2 }}>
        Modo:{' '}
        <Chip size="sm" variant="soft" color="primary">
          {pipelineMode}
        </Chip>
      </Typography>

      <Box>
        <SummaryRow
          icon={<ImageRoundedIcon />}
          label="Imagen"
          slot={imageSlot}
          tokens={tokens.image}
          required={required.image}
          modeApplies={modeApplies.image}
        />
        <Divider />
        <SummaryRow
          icon={<MovieRoundedIcon />}
          label="Video"
          slot={videoSlot}
          tokens={tokens.video}
          required={required.video}
          modeApplies={modeApplies.video}
        />
        <Divider />
        <SummaryRow
          icon={<RecordVoiceOverRoundedIcon />}
          label="Voz"
          slot={voiceSlot}
          tokens={tokens.voice}
          costNote={
            voiceSlot && voiceSlot.model.pricing.unit === 'character'
              ? `~${estimatedScriptChars} chars`
              : undefined
          }
          required={required.voice}
          modeApplies={modeApplies.voice}
        />
        <Divider />
        <SummaryRow
          icon={<MicNoneRoundedIcon />}
          label="Lipsync"
          slot={lipsyncSlot}
          tokens={tokens.lipsync}
          required={required.lipsync}
          modeApplies={modeApplies.lipsync}
        />
      </Box>

      <Sheet
        variant="soft"
        color="primary"
        sx={{ mt: 2, p: 2, borderRadius: 'sm' }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography level="title-md">Costo total estimado / UGC</Typography>
          <Typography level="h2" sx={{ fontWeight: 800, color: 'primary.700' }}>
            {formatTokenAmount(totalTokens)}
          </Typography>
        </Stack>
        <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
          Cifras orientativas en tokens internos. El cobro real se confirma
          con el output de fal.ai en runtime.
        </Typography>
      </Sheet>
    </Card>
  )
}

export default PipelineSummary
