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

export default function MediaDocument({
  src,
  filename = 'Documento',
  isDark,
  isOwn,
}: MediaDocumentProps) {
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
          {filename}
        </Typography>
        <Typography
          level="body-xs"
          sx={{ color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)' }}
        >
          Documento
        </Typography>
      </Stack>
      <Button
        component="a"
        href={src}
        download
        target="_blank"
        size="sm"
        variant="soft"
        sx={{ flexShrink: 0, minWidth: 'auto', px: 1 }}
      >
        <DownloadIcon sx={{ fontSize: 18 }} />
      </Button>
    </Box>
  )
}
