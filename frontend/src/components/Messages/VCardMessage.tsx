import React, { useMemo } from 'react'
import { Box, Stack, Typography, Button } from '@mui/joy'
import PersonIcon from '@mui/icons-material/Person'

interface VCardMessageProps {
  body: string
  dataJson?: string
  isDark: boolean
  isOwn: boolean
}

interface ParsedContact {
  fullName: string
  phone: string
  waid?: string
}

function unescapeVCardText(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

function parseStructuredName(value: string): string {
  const [lastName = '', firstName = ''] = value.split(';')
  return unescapeVCardText(`${firstName} ${lastName}`.trim()) || 'Contacto'
}

function parseVCards(body: string): ParsedContact[] {
  // Split múltiples vCards
  const vcardBlocks = body.split(/(?=BEGIN:VCARD)/)
  const contacts: ParsedContact[] = []

  for (const block of vcardBlocks) {
    if (!block.includes('BEGIN:VCARD')) continue

    // Extraer FN (full name)
    const fnMatch = block.match(/^FN(?:;[^:]*)?:(.+)$/m)
    const nMatch = block.match(/^N(?:;[^:]*)?:(.+)$/m)
    const fullName = fnMatch
      ? unescapeVCardText(fnMatch[1])
      : nMatch
        ? parseStructuredName(nMatch[1])
        : 'Contacto'

    // Extraer TEL con waid opcional
    const telMatch = block.match(/TEL[^:]*:([+]?[0-9 ]+)/)
    const phone = telMatch ? telMatch[1].trim() : ''

    // Extraer waid de WhatsApp
    const waidMatch = block.match(/waid=([0-9]+)/)
    const waid = waidMatch ? waidMatch[1] : undefined

    if (phone || fullName !== 'Contacto') {
      contacts.push({ fullName, phone, waid })
    }
  }

  return contacts
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export default function VCardMessage({ body, isDark, isOwn }: VCardMessageProps) {
  const contacts = useMemo(() => parseVCards(body), [body])

  if (contacts.length === 0) {
    // Fallback: mostrar el body raw truncado
    return (
      <Typography level="body-sm" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
        📇 Contacto
      </Typography>
    )
  }

  return (
    <Stack spacing={1} sx={{ maxWidth: '280px', width: '100%' }}>
      {contacts.map((contact, i) => (
        <Box
          key={i}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: '10px 14px',
            borderRadius: '8px',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
            bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.9)',
          }}
        >
          {/* Avatar */}
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              bgcolor: isOwn ? '#25D366' : (isDark ? '#5BC2D2' : '#00A884'),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <PersonIcon sx={{ fontSize: 22, color: '#fff' }} />
          </Box>

          {/* Info */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              level="title-sm"
              sx={{
                color: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)',
                fontWeight: 700,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {contact.fullName}
            </Typography>
            {contact.phone && (
              <Typography
                level="body-xs"
                sx={{ color: isDark ? '#8A8D91' : '#65676B' }}
              >
                {contact.phone}
              </Typography>
            )}
          </Box>

          {/* Botón mensaje */}
          {contact.phone && (
            <Button
              size="sm"
              variant="soft"
              component="a"
              href={`/tickets?number=${encodeURIComponent(contact.phone)}`}
              sx={{ flexShrink: 0, minWidth: 'auto', px: 1 }}
            >
              💬
            </Button>
          )}
        </Box>
      ))}
    </Stack>
  )
}
