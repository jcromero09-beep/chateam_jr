import { useState, useEffect } from 'react'
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Stack,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Button,
  Switch,
  Divider,
  Box,
  Chip,
  CircularProgress,
} from '@mui/joy'
import { toast } from 'react-toastify'
import api from '../../services/api'

interface TelegramModalProps {
  open: boolean
  onClose: () => void
  telegramId?: number | null
  onSuccess?: () => void
}

interface TelegramData {
  name: string
  botToken: string
  botUsername: string
  greetingMessage: string
  farewellMessage: string
  outOfHoursMessage: string
  isDefault: boolean
  allowGroup: boolean
  status?: string
}

const initialState: TelegramData = {
  name: '',
  botToken: '',
  botUsername: '',
  greetingMessage: '',
  farewellMessage: '',
  outOfHoursMessage: '',
  isDefault: false,
  allowGroup: false,
}

export default function TelegramModal({ open, onClose, telegramId, onSuccess }: TelegramModalProps) {
  const [telegram, setTelegram] = useState<TelegramData>(initialState)
  const [loading, setLoading] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)
  const [botStatus, setBotStatus] = useState<string | null>(null)

  useEffect(() => {
    if (telegramId && open) {
      fetchTelegram()
    } else if (!telegramId && open) {
      setTelegram(initialState)
      setBotStatus(null)
    }
  }, [telegramId, open])

  const fetchTelegram = async () => {
    if (!telegramId) return

    try {
      setLoading(true)
      const { data } = await api.get(`/telegram/${telegramId}`)
      setTelegram({
        name: data.name || '',
        botToken: data.botToken || '',
        botUsername: data.botUsername || '',
        greetingMessage: data.greetingMessage || '',
        farewellMessage: data.farewellMessage || '',
        outOfHoursMessage: data.outOfHoursMessage || '',
        isDefault: data.isDefault || false,
        allowGroup: data.allowGroup || false,
        status: data.status,
      })
      setBotStatus(data.status)
    } catch (error) {
      console.error('Error fetching telegram:', error)
      toast.error('Error al cargar datos del bot')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setTelegram(initialState)
    setBotStatus(null)
    onClose()
  }

  const handleSubmit = async () => {
    if (!telegram.name.trim()) {
      toast.error('El nombre es requerido')
      return
    }

    if (!telegram.botToken.trim()) {
      toast.error('El token del bot es requerido')
      return
    }

    // Validar formato del token
    const tokenRegex = /^\d+:[A-Za-z0-9_-]{35}$/
    if (!tokenRegex.test(telegram.botToken)) {
      toast.error('Token invalido. Formato esperado: 1234567890:AAEhBOweik6ad2r_PE4GVQVQai7zOqv4Org')
      return
    }

    setLoading(true)
    try {
      const telegramData = {
        ...telegram,
        channel: 'telegram',
      }

      if (telegramId) {
        await api.put(`/telegram/${telegramId}`, telegramData)
        toast.success('Bot de Telegram actualizado')
      } else {
        const { data } = await api.post('/telegram', telegramData)
        toast.success('Bot de Telegram creado')

        // Auto-iniciar el bot
        if (data.id) {
          try {
            await api.post(`/telegram/${data.id}/restart`)
          } catch (e) {
            // Ignorar error de inicio, el bot se puede iniciar despues
          }
        }
      }

      handleClose()
      onSuccess?.()
    } catch (error: any) {
      console.error('Error saving telegram:', error)
      const message = error.response?.data?.error || error.response?.data?.message || 'Error al guardar'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleRestartBot = async () => {
    if (!telegramId) return

    setIsRestarting(true)
    try {
      await api.post(`/telegram/${telegramId}/restart`)
      toast.success('Bot reiniciado exitosamente')
      await fetchTelegram()
    } catch (error: any) {
      console.error('Error restarting bot:', error)
      toast.error('Error al reiniciar el bot')
    } finally {
      setIsRestarting(false)
    }
  }

  const getStatusChip = () => {
    switch (botStatus?.toUpperCase()) {
      case 'CONNECTED':
        return <Chip color="success" size="sm">Conectado</Chip>
      case 'DISCONNECTED':
        return <Chip color="danger" size="sm">Desconectado</Chip>
      case 'ERROR':
        return <Chip color="warning" size="sm">Error</Chip>
      default:
        return <Chip color="neutral" size="sm">Desconocido</Chip>
    }
  }

  return (
    <Modal open={open} onClose={handleClose}>
      <ModalDialog sx={{ width: 600, maxHeight: '90vh', overflow: 'auto' }}>
        <ModalClose />
        <Typography level="h4">
          {telegramId ? 'Editar Bot de Telegram' : 'Agregar Bot de Telegram'}
        </Typography>

        <Stack spacing={2} sx={{ mt: 2 }}>
          {/* Informacion Basica */}
          <Typography level="title-md" sx={{ color: 'primary.500' }}>
            Informacion Basica
          </Typography>
          <Divider />

          <Stack direction="row" spacing={2}>
            <FormControl sx={{ flex: 1 }}>
              <FormLabel>Nombre del Bot</FormLabel>
              <Input
                value={telegram.name}
                onChange={(e) => setTelegram({ ...telegram, name: e.target.value })}
                placeholder="Mi Bot de Telegram"
              />
            </FormControl>

            <FormControl sx={{ flex: 1 }}>
              <FormLabel>Username (opcional)</FormLabel>
              <Input
                value={telegram.botUsername}
                onChange={(e) => setTelegram({ ...telegram, botUsername: e.target.value })}
                placeholder="mi_bot_username"
              />
            </FormControl>
          </Stack>

          <FormControl>
            <FormLabel>Token del Bot</FormLabel>
            <Input
              value={telegram.botToken}
              onChange={(e) => setTelegram({ ...telegram, botToken: e.target.value })}
              placeholder="1234567890:AAEhBOweik6ad2r_PE4GVQVQai7zOqv4Org"
            />
            <Typography level="body-xs" sx={{ mt: 0.5 }}>
              Obten el token de @BotFather en Telegram
            </Typography>
          </FormControl>

          {/* Configuraciones */}
          <Typography level="title-md" sx={{ color: 'primary.500', mt: 2 }}>
            Configuraciones
          </Typography>
          <Divider />

          <Stack direction="row" spacing={4}>
            <FormControl orientation="horizontal">
              <FormLabel>Bot por defecto</FormLabel>
              <Switch
                checked={telegram.isDefault}
                onChange={(e) => setTelegram({ ...telegram, isDefault: e.target.checked })}
              />
            </FormControl>

            <FormControl orientation="horizontal">
              <FormLabel>Permitir grupos</FormLabel>
              <Switch
                checked={telegram.allowGroup}
                onChange={(e) => setTelegram({ ...telegram, allowGroup: e.target.checked })}
              />
            </FormControl>
          </Stack>

          {/* Mensajes Automaticos */}
          <Typography level="title-md" sx={{ color: 'primary.500', mt: 2 }}>
            Mensajes Automaticos
          </Typography>
          <Divider />

          <FormControl>
            <FormLabel>Mensaje de Bienvenida</FormLabel>
            <Textarea
              value={telegram.greetingMessage}
              onChange={(e) => setTelegram({ ...telegram, greetingMessage: e.target.value })}
              minRows={2}
              placeholder="Mensaje cuando un usuario inicia conversacion"
            />
          </FormControl>

          <Stack direction="row" spacing={2}>
            <FormControl sx={{ flex: 1 }}>
              <FormLabel>Mensaje de Despedida</FormLabel>
              <Textarea
                value={telegram.farewellMessage}
                onChange={(e) => setTelegram({ ...telegram, farewellMessage: e.target.value })}
                minRows={2}
                placeholder="Mensaje al cerrar ticket"
              />
            </FormControl>

            <FormControl sx={{ flex: 1 }}>
              <FormLabel>Mensaje Fuera de Horario</FormLabel>
              <Textarea
                value={telegram.outOfHoursMessage}
                onChange={(e) => setTelegram({ ...telegram, outOfHoursMessage: e.target.value })}
                minRows={2}
                placeholder="Mensaje fuera de horario de atencion"
              />
            </FormControl>
          </Stack>

          {/* Estado del Bot (solo en edicion) */}
          {telegramId && (
            <>
              <Typography level="title-md" sx={{ color: 'primary.500', mt: 2 }}>
                Estado del Bot
              </Typography>
              <Divider />

              <Stack direction="row" spacing={2} alignItems="center">
                <Box>
                  <Typography level="body-sm">Estado actual:</Typography>
                  {getStatusChip()}
                </Box>

                <Button
                  variant="outlined"
                  color="primary"
                  onClick={handleRestartBot}
                  disabled={isRestarting}
                  startDecorator={isRestarting ? <CircularProgress size="sm" /> : null}
                >
                  {isRestarting ? 'Reiniciando...' : 'Reiniciar Bot'}
                </Button>
              </Stack>
            </>
          )}

          {/* Botones */}
          <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 2 }}>
            <Button variant="outlined" color="neutral" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              variant="solid"
              color="primary"
              onClick={handleSubmit}
              loading={loading}
            >
              {telegramId ? 'Guardar' : 'Crear'}
            </Button>
          </Stack>
        </Stack>
      </ModalDialog>
    </Modal>
  )
}
