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
 *
 * @param isOwn — si el mensaje es propio (burbuja saliente con fondo de color),
 *   los enlaces usan un color claro para mantener contraste sobre el fondo.
 *   Si es false/undefined (mensaje entrante con fondo claro) usan azul primary.
 */
export function formatWhatsAppText(
  text: string,
  searchTerm?: string,
  isOwn?: boolean
): React.ReactNode[] {
  if (!text) return []

  const makePlaceholder = (type: string, index: number) =>
    `%%${type}PLACEHOLDER${index}%%`

  // 1. Extraer URLs temporalmente para protegerlas
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const urls: string[] = []
  let processed = text.replace(urlRegex, (match) => {
    urls.push(match)
    return makePlaceholder('URL', urls.length - 1)
  })

  // 2. Code (backticks)
  const codeRegex = /`([^`]+)`/g
  const codes: string[] = []
  processed = processed.replace(codeRegex, (_, code) => {
    codes.push(code)
    return makePlaceholder('CODE', codes.length - 1)
  })

  // 3. Bold (*texto*)
  const boldRegex = /\*(.+?)\*/g
  const boldTexts: string[] = []
  processed = processed.replace(boldRegex, (_, bold) => {
    boldTexts.push(bold)
    return makePlaceholder('BOLD', boldTexts.length - 1)
  })

  // 4. Italic (_texto_)
  const italicRegex = /_(.+?)_/g
  const italicTexts: string[] = []
  processed = processed.replace(italicRegex, (_, italic) => {
    italicTexts.push(italic)
    return makePlaceholder('ITALIC', italicTexts.length - 1)
  })

  // 5. Strikethrough (~texto~)
  const strikeRegex = /~(.+?)~/g
  const strikeTexts: string[] = []
  processed = processed.replace(strikeRegex, (_, strike) => {
    strikeTexts.push(strike)
    return makePlaceholder('STRIKE', strikeTexts.length - 1)
  })

  // 6. Reconstruir dividiendo por placeholders para mantener orden
  const parts = processed.split(/(%%[A-Z]+PLACEHOLDER\d+%%)/g)

  return parts.map((part, i) => {
    const urlMatch = part.match(/^%%URLPLACEHOLDER(\d+)%%$/)
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
            // Mensajes propios (fondo de color): blanco subrayado para contraste.
            // Mensajes entrantes (fondo claro): azul primary clásico.
            color: isOwn ? '#FFFFFF' : 'primary.500',
            textDecoration: 'underline',
            textDecorationColor: isOwn ? 'rgba(255,255,255,0.7)' : undefined,
            textUnderlineOffset: '2px',
            wordBreak: 'break-all',
            '&:hover': {
              color: isOwn ? '#FFFFFF' : 'primary.600',
              textDecorationColor: isOwn ? '#FFFFFF' : undefined,
            },
            '&:visited': {
              color: isOwn ? '#FFFFFF' : 'primary.500',
            },
          }}
        >
          {url}
        </Box>
      )
    }

    const codeMatch = part.match(/^%%CODEPLACEHOLDER(\d+)%%$/)
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

    const boldMatch = part.match(/^%%BOLDPLACEHOLDER(\d+)%%$/)
    if (boldMatch) {
      const content = applyHighlight([boldTexts[parseInt(boldMatch[1])]], searchTerm || '')
      return <strong key={i}>{content}</strong>
    }

    const italicMatch = part.match(/^%%ITALICPLACEHOLDER(\d+)%%$/)
    if (italicMatch) {
      const content = applyHighlight([italicTexts[parseInt(italicMatch[1])]], searchTerm || '')
      return <em key={i}>{content}</em>
    }

    const strikeMatch = part.match(/^%%STRIKEPLACEHOLDER(\d+)%%$/)
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
