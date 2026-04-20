/**
 * CiphertextMessage
 *
 * Muestra un placeholder para mensajes CIPHERTEXT (aun no descifrados por WhatsApp).
 * Incluye un boton de reintento con logica de throttle:
 * - Se habilita despues de 1 minuto desde la creacion del mensaje
 * - Si falla, se bloquea por 5 minutos
 * - Si se descifra exitosamente, el componente desaparece (el padre re-renderiza)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Box, Typography, Button, CircularProgress, Tooltip } from '@mui/joy'
import LockIcon from '@mui/icons-material/Lock'
import RefreshIcon from '@mui/icons-material/Refresh'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import api from '../../services/api'

interface CiphertextMessageProps {
  messageId: number
  createdAt: string
  isDark: boolean
}

type RetryState = 'waiting' | 'ready' | 'loading' | 'success' | 'cooldown'

const ENABLE_DELAY_MS = 60_000    // 1 minuto para habilitarse
const COOLDOWN_MS = 300_000       // 5 minutos de bloqueo tras error

export default function CiphertextMessage({ messageId, createdAt, isDark }: CiphertextMessageProps) {
  const [retryState, setRetryState] = useState<RetryState>('waiting')
  const [countdown, setCountdown] = useState(0)
  const [statusText, setStatusText] = useState('')
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Calcular si ya paso 1 minuto desde la creacion
  const calcTimeLeft = useCallback(() => {
    const created = new Date(createdAt).getTime()
    const now = Date.now()
    return Math.max(0, ENABLE_DELAY_MS - (now - created))
  }, [createdAt])

  useEffect(() => {
    const timeLeft = calcTimeLeft()

    if (timeLeft <= 0) {
      setRetryState('ready')
      return
    }

    setRetryState('waiting')
    setCountdown(Math.ceil(timeLeft / 1000))

    timerRef.current = setInterval(() => {
      const remaining = calcTimeLeft()
      if (remaining <= 0) {
        setRetryState('ready')
        setCountdown(0)
        if (timerRef.current) clearInterval(timerRef.current)
      } else {
        setCountdown(Math.ceil(remaining / 1000))
      }
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [calcTimeLeft])

  const startCooldown = useCallback(() => {
    setRetryState('cooldown')
    setCountdown(Math.ceil(COOLDOWN_MS / 1000))

    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setRetryState('ready')
          if (timerRef.current) clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  const handleRetry = async () => {
    setRetryState('loading')
    setStatusText('')

    try {
      const { data } = await api.post(`/messages/${messageId}/retry-decrypt`)

      if (data.decrypted) {
        setRetryState('success')
        setStatusText('Descifrado')
      } else if (data.success) {
        // Se envio solicitud pero aun no descifrado
        setStatusText(data.message || 'Solicitud enviada')
        startCooldown()
      } else {
        setStatusText(data.message || 'No se pudo descifrar')
        startCooldown()
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Error de conexion'
      setStatusText(msg)
      startCooldown()
    }
  }

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`
  }

  const bgColor = isDark ? 'rgba(255, 193, 7, 0.08)' : 'rgba(255, 193, 7, 0.06)'
  const borderColor = isDark ? 'rgba(255, 193, 7, 0.25)' : 'rgba(255, 193, 7, 0.3)'

  if (retryState === 'success') {
    return (
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        px: 1.5, py: 1, borderRadius: 'sm',
        bgcolor: isDark ? 'rgba(82, 183, 136, 0.1)' : 'rgba(82, 183, 136, 0.08)',
        border: '1px solid',
        borderColor: isDark ? 'rgba(82, 183, 136, 0.3)' : 'rgba(82, 183, 136, 0.35)',
      }}>
        <CheckCircleIcon sx={{ fontSize: 16, color: '#52b788' }} />
        <Typography level="body-sm" sx={{ color: '#52b788', fontStyle: 'italic' }}>
          Mensaje descifrado
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', gap: 0.75,
      px: 1.5, py: 1, borderRadius: 'sm',
      bgcolor: bgColor,
      border: '1px dashed',
      borderColor: borderColor,
      minWidth: 220,
    }}>
      {/* Icono + texto principal */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LockIcon sx={{ fontSize: 16, color: isDark ? '#f3a43b' : '#c98b2e' }} />
        <Typography level="body-sm" sx={{
          fontStyle: 'italic',
          color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
          fontSize: '12.5px',
        }}>
          Esperando mensaje. Esto puede tardar un momento.
        </Typography>
      </Box>

      {/* Boton de reintento */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {retryState === 'waiting' && (
          <Tooltip title={`Disponible en ${formatCountdown(countdown)}`} placement="top">
            <span>
              <Button
                size="sm"
                variant="soft"
                color="neutral"
                disabled
                startDecorator={<HourglassEmptyIcon sx={{ fontSize: 14 }} />}
                sx={{ fontSize: '11px', py: 0.25, px: 1, minHeight: 26 }}
              >
                {formatCountdown(countdown)}
              </Button>
            </span>
          </Tooltip>
        )}

        {retryState === 'ready' && (
          <Button
            size="sm"
            variant="soft"
            color="warning"
            onClick={handleRetry}
            startDecorator={<RefreshIcon sx={{ fontSize: 14 }} />}
            sx={{ fontSize: '11px', py: 0.25, px: 1, minHeight: 26 }}
          >
            Recuperar mensaje
          </Button>
        )}

        {retryState === 'loading' && (
          <Button
            size="sm"
            variant="soft"
            color="warning"
            disabled
            startDecorator={<CircularProgress size="sm" sx={{ '--CircularProgress-size': '14px' }} />}
            sx={{ fontSize: '11px', py: 0.25, px: 1, minHeight: 26 }}
          >
            Consultando...
          </Button>
        )}

        {retryState === 'cooldown' && (
          <Tooltip title={statusText || 'Reintento en espera'} placement="top">
            <span>
              <Button
                size="sm"
                variant="soft"
                color="danger"
                disabled
                startDecorator={<ErrorOutlineIcon sx={{ fontSize: 14 }} />}
                sx={{ fontSize: '11px', py: 0.25, px: 1, minHeight: 26 }}
              >
                Reintentar en {formatCountdown(countdown)}
              </Button>
            </span>
          </Tooltip>
        )}
      </Box>

      {/* Texto de estado */}
      {statusText && retryState !== 'cooldown' && (
        <Typography level="body-xs" sx={{
          color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
          fontStyle: 'italic'
        }}>
          {statusText}
        </Typography>
      )}
    </Box>
  )
}
