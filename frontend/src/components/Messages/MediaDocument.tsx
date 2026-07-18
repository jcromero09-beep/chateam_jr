import React from 'react'
import { Box, Stack, Typography, Button } from '@mui/joy'
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined'
import DownloadIcon from '@mui/icons-material/Download'

interface MediaDocumentProps {
  src: string
  filename?: string
  isDark: boolean
  isOwn: boolean
}

// El backend antepone un timestamp al nombre real: "1781626234357_Factura.xml"
// o "1781626234357.pdf" (sin nombre original). Limpiamos para mostrarlo legible.
const prettifyFilename = (raw: string): string => {
  if (!raw) return 'Documento'
  let name = raw.split('/').pop() || raw
  // Quitar prefijo timestamp inicial: "1781626234357_..." o "1781626234357.ext"
  name = name.replace(/^\d{10,}_/, '').replace(/^\d{10,}\./, '.')
  // Quitar sufijo timestamp antes de la extensión: "..._1781626234357.xml"
  name = name.replace(/_\d{10,}(\.[a-z0-9]+)$/i, '$1')
  return name || raw
}

const getExtensionLabel = (raw: string): string => {
  const match = (raw || '').match(/\.([a-z0-9]+)$/i)
  return match ? match[1].toUpperCase() : 'Documento'
}

export default function MediaDocument({
  src,
  filename = 'Documento',
  isDark,
  isOwn,
}: MediaDocumentProps) {
  const displayName = prettifyFilename(filename)
  const extLabel = getExtensionLabel(filename)
  // Fuerza la descarga vía backend (Content-Disposition) — el atributo `download`
  // se ignora entre dominios distintos (frontend vs backend).
  const downloadUrl = `${src}${src.includes('?') ? '&' : '?'}download=${encodeURIComponent(displayName)}`
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: '10px 14px',
        borderRadius: '8px',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
        bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.9)',
        maxWidth: '280px',
        width: '100%',
      }}
    >
      <InsertDriveFileOutlinedIcon
        sx={{
          fontSize: 36,
          color: isDark ? '#5BC2D2' : '#00A884',
          flexShrink: 0,
        }}
      />
      <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          level="body-sm"
          sx={{
            fontWeight: 600,
            color: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayName}
        </Typography>
        <Typography
          level="body-xs"
          sx={{ color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)' }}
        >
          {extLabel}
        </Typography>
      </Stack>
      <Button
        component="a"
        href={downloadUrl}
        download={displayName}
        size="sm"
        variant="soft"
        sx={{ flexShrink: 0, minWidth: 'auto', px: 1 }}
      >
        <DownloadIcon sx={{ fontSize: 18 }} />
      </Button>
    </Box>
  )
}
