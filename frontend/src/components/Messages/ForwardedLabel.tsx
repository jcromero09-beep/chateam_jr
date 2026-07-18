import React from 'react'
import { Stack, Typography } from '@mui/joy'
import ReplyIcon from '@mui/icons-material/Reply'

interface ForwardedLabelProps {
  isDark: boolean
}

export default function ForwardedLabel({ isDark }: ForwardedLabelProps) {
  const mutedColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)'

  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.25 }}>
      <ReplyIcon sx={{ fontSize: 13, transform: 'scaleX(-1)', color: mutedColor }} />
      <Typography
        sx={{ fontSize: '12px', fontStyle: 'italic', color: mutedColor }}
      >
        Reenviado
      </Typography>
    </Stack>
  )
}
