import { Box, Card, Chip, Stack, Typography } from '@mui/joy'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import TextFieldsRoundedIcon from '@mui/icons-material/TextFieldsRounded'
import RecordVoiceOverRoundedIcon from '@mui/icons-material/RecordVoiceOverRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import {
  PIPELINE_MODES,
  type PipelineMode
} from '../../services/ugcModelSelectorService'

interface PipelineModeSelectorProps {
  value: PipelineMode | null
  onChange: (mode: PipelineMode) => void
}

const ICON_FOR_MODE = {
  'image-to-video': ImageRoundedIcon,
  'text-to-video': TextFieldsRoundedIcon,
  'talking-head': RecordVoiceOverRoundedIcon
} as const

const STEPS_LABEL: Record<PipelineMode, string> = {
  'image-then-video': '2 pasos',
  'text-to-video-direct': '1 paso',
  'lipsync-talking-head': '4 pasos'
}

function PipelineModeSelector({ value, onChange }: PipelineModeSelectorProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
        gap: 2
      }}
    >
      {PIPELINE_MODES.map(opt => {
        const Icon = ICON_FOR_MODE[opt.iconHint]
        const isSelected = value === opt.mode
        return (
          <Card
            key={opt.mode}
            variant={isSelected ? 'solid' : 'outlined'}
            color={isSelected ? 'primary' : 'neutral'}
            onClick={() => onChange(opt.mode)}
            sx={{
              cursor: 'pointer',
              p: 3,
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              boxShadow: isSelected ? 'lg' : 'sm',
              border: isSelected ? '2px solid' : '1px solid',
              borderColor: isSelected
                ? 'primary.500'
                : 'neutral.outlinedBorder',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: 'md' }
            }}
          >
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 2 }}
            >
              <Icon
                sx={{
                  fontSize: 36,
                  color: isSelected ? 'common.white' : 'primary.500'
                }}
              />
              {isSelected && (
                <CheckCircleRoundedIcon sx={{ color: 'common.white' }} />
              )}
            </Stack>

            <Typography
              level="title-lg"
              sx={{
                fontWeight: 700,
                color: isSelected ? 'common.white' : 'text.primary',
                mb: 0.5
              }}
            >
              {opt.title}
            </Typography>
            <Typography
              level="body-sm"
              sx={{
                color: isSelected ? 'rgba(255,255,255,0.85)' : 'text.secondary',
                mb: 1.5
              }}
            >
              {opt.subtitle}
            </Typography>
            <Typography
              level="body-sm"
              sx={{
                color: isSelected ? 'rgba(255,255,255,0.78)' : 'text.tertiary',
                mb: 2,
                minHeight: 40
              }}
            >
              {opt.description}
            </Typography>

            <Chip
              size="sm"
              variant="soft"
              color={isSelected ? 'neutral' : 'primary'}
            >
              {STEPS_LABEL[opt.mode]}
            </Chip>
          </Card>
        )
      })}
    </Box>
  )
}

export default PipelineModeSelector
