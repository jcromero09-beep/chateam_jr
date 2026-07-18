import React, { useMemo } from 'react'
import { Box, Stack, Typography, Button } from '@mui/joy'
import LocationOnIcon from '@mui/icons-material/LocationOn'

interface LocationMessageProps {
  body: string
  dataJson?: string
  isDark: boolean
}

interface ParsedLocation {
  thumbnail?: string // base64 data URL
  mapsUrl?: string
  latitude?: number
  longitude?: number
  label?: string
}

function parseLocation(body: string, dataJson?: string): ParsedLocation {
  // Formato pipe-separated: data:image/png;base64,[thumb] | https://maps.google.com/... | lat,lon
  const parts = body.split(' | ')
  const result: ParsedLocation = {}

  for (const part of parts) {
    if (part.startsWith('data:image/')) {
      result.thumbnail = part
    } else if (part.startsWith('http')) {
      result.mapsUrl = part
      // Extraer coordenadas de la URL si es Google Maps
      const coordsMatch = part.match(/q=([-+]?[0-9.]+)%2C([-+]?[0-9.]+)/)
      if (coordsMatch) {
        result.latitude = parseFloat(coordsMatch[1])
        result.longitude = parseFloat(coordsMatch[2])
      }
    } else if (part.includes(',') && /^[-+0-9. ]+$/.test(part.trim())) {
      // Formato "lat, lon"
      const coords = part.split(',').map((c) => parseFloat(c.trim()))
      if (coords.length === 2) {
        result.latitude = coords[0]
        result.longitude = coords[1]
      }
    } else if (part.startsWith('Latitude:')) {
      // Live location format
      const latMatch = part.match(/Latitude:\s*([-+]?[0-9.]+)/)
      const lonMatch = part.match(/Longitude:\s*([-+]?[0-9.]+)/)
      if (latMatch) result.latitude = parseFloat(latMatch[1])
      if (lonMatch) result.longitude = parseFloat(lonMatch[1])
      result.label = part
    }
  }

  // Si tenemos coords pero no mapsUrl, generar el URL
  if (result.latitude && result.longitude && !result.mapsUrl) {
    result.mapsUrl = `https://www.google.com/maps?q=${result.latitude},${result.longitude}&z=17`
  }

  return result
}

// Mapa estático gratuito sin API key (OpenStreetMap tile)
function getStaticMapUrl(lat: number, lon: number, zoom = 15): string {
  // Usar el servicio estático de OSM
  return `https://static-maps.yandex.ru/1.x/?ll=${lon},${lat}&z=${zoom}&size=300,150&l=map&pt=${lon},${lat},pm2rdl`
}

export default function LocationMessage({ body, isDark }: LocationMessageProps) {
  const location = useMemo(() => parseLocation(body), [body])

  const coordsLabel =
    location.latitude && location.longitude
      ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
      : undefined

  return (
    <Box sx={{ maxWidth: '300px', width: '100%' }}>
      {/* Mapa / Thumbnail */}
      <Box
        component={location.mapsUrl ? 'a' : 'div'}
        href={location.mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          display: 'block',
          position: 'relative',
          borderRadius: '8px',
          overflow: 'hidden',
          cursor: location.mapsUrl ? 'pointer' : 'default',
          mb: 0.5,
        }}
      >
        {location.thumbnail ? (
          <Box
            component="img"
            src={location.thumbnail}
            alt="Ubicación"
            sx={{ width: '100%', height: 'auto', display: 'block', maxHeight: '200px', objectFit: 'cover' }}
          />
        ) : location.latitude && location.longitude ? (
          <Box
            component="img"
            src={getStaticMapUrl(location.latitude, location.longitude)}
            alt="Mapa"
            sx={{ width: '100%', height: 'auto', display: 'block' }}
          />
        ) : (
          <Box
            sx={{
              width: '100%',
              height: 100,
              bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LocationOnIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
          </Box>
        )}

        {/* Icono de ubicación superpuesto */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 6,
            right: 6,
            bgcolor: 'rgba(0,0,0,0.55)',
            borderRadius: '50%',
            p: 0.5,
          }}
        >
          <LocationOnIcon sx={{ fontSize: 18, color: '#fff' }} />
        </Box>
      </Box>

      {/* Info y botón */}
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        <Stack spacing={0.25}>
          {location.label && (
            <Typography
              level="body-sm"
              sx={{ color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)' }}
            >
              {location.label}
            </Typography>
          )}
          {coordsLabel && !location.label && (
            <Typography
              level="body-xs"
              sx={{ color: isDark ? '#8A8D91' : '#65676B', fontFamily: 'monospace' }}
            >
              {coordsLabel}
            </Typography>
          )}
        </Stack>

        {location.mapsUrl && (
          <Button
            size="sm"
            variant="soft"
            component="a"
            href={location.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ flexShrink: 0 }}
          >
            <LocationOnIcon sx={{ fontSize: 14, mr: 0.5 }} />
            Maps
          </Button>
        )}
      </Stack>
    </Box>
  )
}
