import React from 'react'
import { Typography } from '@mui/joy'
import type { MessageContact } from '../../types/Message'

const SENDER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F0B27A', '#82E0AA',
]

interface GroupSenderNameProps {
  contact: MessageContact
  isDark: boolean
}

export default function GroupSenderName({ contact, isDark }: GroupSenderNameProps) {
  const color = SENDER_COLORS[contact.id % SENDER_COLORS.length]

  return (
    <Typography
      sx={{
        fontSize: '13px',
        fontWeight: 700,
        color: color,
        mb: 0.25,
        lineHeight: 1.2,
      }}
    >
      {contact.name}
    </Typography>
  )
}
