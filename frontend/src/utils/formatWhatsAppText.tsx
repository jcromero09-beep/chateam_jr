import React from 'react'
import { Box, Typography } from '@mui/joy'

// Escapa caracteres especiales de regex
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Aplica highlighting a fragmentos de texto
function applyHighlight(fragments: string[], searchTerm: string): React.ReactNode[] {
  if (!searchTerm.trim()) return fragments

  const term = searchTerm.trim()
  const escapedTerm = escapeRegex(term)
  const regex = new RegExp(`(${escapedTerm})`, 'gi')
  const result: React.ReactNode[] = []

  fragments.forEach((fragment, i) => {
    const parts = fragment.split(regex)
    if (parts.length === 1) {
      result.push(fragment)
    } else {
      parts.forEach((part, j) => {
        if (part.toLowerCase() === term.toLowerCase()) {
          result.push(
            <Box
              key={`hl-${i}-${j}`}
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
        } else {
          result.push(part)
        }
      })
    }
  })

  return result
}

/**
 * Parsea formato WhatsApp y retorna React nodes.
 * Orden: URLs → code → bold → italic → strikethrough.
 * Si searchTerm, los fragmentos de texto plano reciben highlighting.
 */
export function formatWhatsAppText(
  text: string,
  searchTerm?: string
): React.ReactNode[] {
  if (!text) return []

  // 1. Extraer URLs temporalmente para protegerlas
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const urls: string[] = []
  let processed = text.replace(urlRegex, (match) => {
    urls.push(match)
    return `__URL_PLACEHOLDER_${urls.length - 1}__`
  })

  // 2. Code (backticks)
  const codeRegex = /`([^`]+)`/g
  const codes: string[] = []
  processed = processed.replace(codeRegex, (_, code) => {
    codes.push(code)
    return `__CODE_PLACEHOLDER_${codes.length - 1}__`
  })

  // 3. Bold (*texto*)
  const boldRegex = /\*(.+?)\*/g
  const boldTexts: string[] = []
  processed = processed.replace(boldRegex, (_, bold) => {
    boldTexts.push(bold)
    return `__BOLD_PLACEHOLDER_${boldTexts.length - 1}__`
  })

  // 4. Italic (_texto_)
  const italicRegex = /_(.+?)_/g
  const italicTexts: string[] = []
  processed = processed.replace(italicRegex, (_, italic) => {
    italicTexts.push(italic)
    return `__ITALIC_PLACEHOLDER_${italicTexts.length - 1}__`
  })

  // 5. Strikethrough (~texto~)
  const strikeRegex = /~(.+?)~/g
  const strikeTexts: string[] = []
  processed = processed.replace(strikeRegex, (_, strike) => {
    strikeTexts.push(strike)
    return `__STRIKE_PLACEHOLDER_${strikeTexts.length - 1}__`
  })

  // 6. Reconstruir dividiendo por placeholders para mantener orden
  const parts = processed.split(/(__[A-Z_]+_PLACEHOLDER_\d+__)/g)

  return parts.map((part, i) => {
    const urlMatch = part.match(/^__URL_PLACEHOLDER_(\d+)__$/)
    if (urlMatch) {
      const url = urls[parseInt(urlMatch[1])]
      return (
        <Box
          key={i}
          component="a"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            color: 'primary.500',
            textDecoration: 'underline',
            wordBreak: 'break-all',
          }}
        >
          {url}
        </Box>
      )
    }

    const codeMatch = part.match(/^__CODE_PLACEHOLDER_(\d+)__$/)
    if (codeMatch) {
      return (
        <Box
          key={i}
          component="code"
          sx={{
            bgcolor: 'background.level2',
            borderRadius: '4px',
            px: 0.5,
            fontFamily: '"Roboto Mono", monospace',
            fontSize: '0.85em',
          }}
        >
          {codes[parseInt(codeMatch[1])]}
        </Box>
      )
    }

    const boldMatch = part.match(/^__BOLD_PLACEHOLDER_(\d+)__$/)
    if (boldMatch) {
      const content = applyHighlight([boldTexts[parseInt(boldMatch[1])]], searchTerm || '')
      return <strong key={i}>{content}</strong>
    }

    const italicMatch = part.match(/^__ITALIC_PLACEHOLDER_(\d+)__$/)
    if (italicMatch) {
      const content = applyHighlight([italicTexts[parseInt(italicMatch[1])]], searchTerm || '')
      return <em key={i}>{content}</em>
    }

    const strikeMatch = part.match(/^__STRIKE_PLACEHOLDER_(\d+)__$/)
    if (strikeMatch) {
      const content = applyHighlight([strikeTexts[parseInt(strikeMatch[1])]], searchTerm || '')
      return <s key={i}>{content}</s>
    }

    // Texto plano: aplicar highlight si hay término
    if (searchTerm && searchTerm.trim()) {
      return applyHighlight([part], searchTerm)
    }

    return part
  })
}
