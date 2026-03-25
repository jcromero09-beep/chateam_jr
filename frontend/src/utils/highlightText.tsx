import React from 'react'
import { Box } from '@mui/joy'

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Envuelve fragmentos de texto que coinciden con searchTerm en <mark>.
 * Case-insensitive. Retorna un solo React node.
 */
export function highlightText(
  text: string,
  searchTerm: string
): React.ReactNode {
  if (!searchTerm.trim() || !text) return text

  const term = searchTerm.trim()
  const escapedTerm = escapeRegex(term)
  const regex = new RegExp(`(${escapedTerm})`, 'gi')
  const parts = text.split(regex)

  if (parts.length === 1) return text

  return parts.map((part, i) => {
    if (part.toLowerCase() === term.toLowerCase()) {
      return (
        <Box
          key={i}
          component="mark"
          sx={{
            bgcolor: 'rgba(255, 193, 7, 0.35)',
            color: 'inherit',
            borderRadius: '2px',
            px: 0.25,
          }}
        >
          {part}
        </Box>
      )
    }
    return part
  })
}
