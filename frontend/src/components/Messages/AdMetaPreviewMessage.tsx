import React from 'react'
import { Box, Typography, Stack } from '@mui/joy'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { formatWhatsAppText } from '../../utils/formatWhatsAppText'

interface AdMetaPreviewMessageProps {
  body?: string
  dataJson?: string
  isDark: boolean
  isOwn: boolean
  searchTerm?: string
}

interface AdPreviewData {
  thumbnail?: string
  sourceUrl?: string
  title?: string
  description?: string
  userText?: string
}

const cleanDataImage = (value?: string): string | undefined => {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed.startsWith('data:image/')) return trimmed
  return trimmed.replace(/^data:image\/([^;,]+);base64,\s+/, 'data:image/$1;base64,')
}

const getNested = (input: any, path: string[]): any =>
  path.reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), input)

const parseJsonPreview = (dataJson?: string): Partial<AdPreviewData> => {
  if (!dataJson) return {}

  try {
    const parsed = JSON.parse(dataJson)
    const extended = getNested(parsed, ['message', 'extendedTextMessage'])
    const adReply = extended?.contextInfo?.externalAdReply

    return {
      thumbnail: cleanDataImage(
        adReply?.thumbnailUrl ||
        adReply?.originalImageUrl ||
        (extended?.jpegThumbnail ? `data:image/jpeg;base64,${extended.jpegThumbnail}` : undefined)
      ),
      sourceUrl: adReply?.sourceUrl,
      title: adReply?.title || extended?.title,
      description: adReply?.body || extended?.description,
      userText: extended?.text,
    }
  } catch {
    return {}
  }
}

const parsePipePreview = (body?: string): Partial<AdPreviewData> => {
  if (!body) return {}

  const parts = body.split(' | ')
  if (parts.length < 5) return { userText: body }

  const [thumbnail, sourceUrl, title, description, ...rest] = parts

  return {
    thumbnail: cleanDataImage(thumbnail),
    sourceUrl: sourceUrl?.trim(),
    title: title?.trim(),
    description: description?.trim(),
    userText: rest.join(' | ').trim(),
  }
}

const parseAdPreview = (body?: string, dataJson?: string): AdPreviewData => {
  const fromBody = parsePipePreview(body)
  const fromJson = parseJsonPreview(dataJson)

  return {
    ...fromBody,
    ...Object.fromEntries(
      Object.entries(fromJson).filter(([, value]) => Boolean(value))
    ),
  }
}

export default function AdMetaPreviewMessage({
  body,
  dataJson,
  isDark,
  isOwn,
  searchTerm,
}: AdMetaPreviewMessageProps) {
  const preview = parseAdPreview(body, dataJson)
  const cardBg = isOwn
    ? (isDark ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.08)')
    : (isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)')

  const cardText = isOwn
    ? 'inherit'
    : (isDark ? '#E9EDEF' : 'rgba(0,0,0,0.85)')

  return (
    <Stack spacing={0.75} sx={{ minWidth: { xs: 240, sm: 320 }, maxWidth: 520 }}>
      <Box
        component={preview.sourceUrl ? 'a' : 'div'}
        href={preview.sourceUrl}
        target={preview.sourceUrl ? '_blank' : undefined}
        rel={preview.sourceUrl ? 'noopener noreferrer' : undefined}
        sx={{
          display: 'grid',
          gridTemplateColumns: preview.thumbnail ? '96px minmax(0, 1fr)' : '1fr',
          gap: 1,
          alignItems: 'stretch',
          bgcolor: cardBg,
          borderRadius: '8px',
          overflow: 'hidden',
          color: cardText,
          textDecoration: 'none',
          border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.05)',
          '&:hover': {
            textDecoration: 'none',
            filter: 'brightness(0.98)',
          },
        }}
      >
        {preview.thumbnail && (
          <Box
            component="img"
            src={preview.thumbnail}
            alt={preview.title || 'Vista previa'}
            sx={{
              width: 96,
              height: 96,
              objectFit: 'cover',
              bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
            }}
          />
        )}

        <Stack spacing={0.35} sx={{ minWidth: 0, p: 1 }}>
          {preview.title && (
            <Typography
              level="body-sm"
              sx={{
                color: 'inherit',
                fontWeight: 700,
                lineHeight: 1.25,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {preview.title}
            </Typography>
          )}

          {preview.description && (
            <Typography
              level="body-xs"
              sx={{
                color: isOwn ? 'rgba(255,255,255,0.86)' : (isDark ? 'rgba(233,237,239,0.78)' : 'rgba(0,0,0,0.64)'),
                lineHeight: 1.35,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {preview.description}
            </Typography>
          )}

          {preview.sourceUrl && (
            <Stack direction="row" spacing={0.4} alignItems="center" sx={{ minWidth: 0 }}>
              <Typography
                level="body-xs"
                sx={{
                  color: isOwn ? 'rgba(255,255,255,0.76)' : (isDark ? 'rgba(233,237,239,0.58)' : 'rgba(0,0,0,0.5)'),
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {preview.sourceUrl.replace(/^https?:\/\//, '')}
              </Typography>
              <OpenInNewIcon sx={{ fontSize: 12, flex: '0 0 auto', opacity: 0.65 }} />
            </Stack>
          )}
        </Stack>
      </Box>

      {preview.userText && (
        <Typography
          level="body-sm"
          sx={{
            color: isOwn ? 'inherit' : (isDark ? '#E9EDEF' : 'rgba(0,0,0,0.85)'),
            fontWeight: 500,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          {formatWhatsAppText(preview.userText, searchTerm, isOwn)}
        </Typography>
      )}
    </Stack>
  )
}
