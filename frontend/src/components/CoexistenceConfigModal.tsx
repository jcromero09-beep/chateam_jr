/**
 * CoexistenceConfigModal — Modal para configurar coexistencia Meta + Baileys
 *
 * Permite al usuario configurar:
 * - Coexistencia activa (on/off)
 * - Canal de recepción (Meta / Baileys / Ambos)
 * - Canal de envío (Meta / Baileys)
 * - Conexión Baileys vinculada
 */
import { useState, useEffect } from 'react'
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Stack,
  Button,
  Select,
  Option,
  Switch,
  Alert,
  Chip,
  Divider,
  Box,
  FormControl,
  FormLabel,
  FormHelperText,
} from '@mui/joy'
import {
  Settings as SettingsIcon,
  Sync as SyncIcon,
  PhoneAndroid as PhoneIcon,
  Cloud as CloudIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
} from '@mui/icons-material'
import { toast } from 'sonner'
import api from '../services/api'

interface BaileysConnection {
  id: number
  name: string
  number: string | null
  status: string
  provider: string
}

interface CoexistenceConnection {
  id: number
  name: string
  status: string
  number: string | null
  displayPhoneNumber: string | null
  phoneNumberId: string | null
  wabaId: string | null
  coexistence: {
    enabled: boolean
    status: string | null
    onboardedAt: string | null
    lastAppOpenedAt: string | null
    receiveChannel: string | null
    sendChannel: string | null
    linkedWhatsappId: number | null
    linkedWhatsappName: string | null
  }
}

interface Props {
  open: boolean
  onClose: () => void
  connection: CoexistenceConnection | null
  onSaved: () => void
}

export default function CoexistenceConfigModal({ open, onClose, connection, onSaved }: Props) {
  const [loading, setLoading] = useState(false)
  const [baileysConnections, setBaileysConnections] = useState<BaileysConnection[]>([])
  const [loadingBaileys, setLoadingBaileys] = useState(false)

  // Form state
  const [enabled, setEnabled] = useState(false)
  const [receiveChannel, setReceiveChannel] = useState<string>('both')
  const [sendChannel, setSendChannel] = useState<string>('meta')
  const [linkedWhatsappId, setLinkedWhatsappId] = useState<number | null>(null)

  // Cargar estado inicial cuando se abre el modal
  useEffect(() => {
    if (connection && open) {
      setEnabled(connection.coexistence.enabled || false)
      setReceiveChannel(connection.coexistence.receiveChannel || 'both')
      setSendChannel(connection.coexistence.sendChannel || 'meta')
      setLinkedWhatsappId(connection.coexistence.linkedWhatsappId || null)
      fetchBaileysConnections()
    }
  }, [connection, open])

  const fetchBaileysConnections = async () => {
    setLoadingBaileys(true)
    try {
      const { data } = await api.get('/whatsapp/coexistence/baileys-connections')
      setBaileysConnections(data.data || [])
    } catch {
      setBaileysConnections([])
    } finally {
      setLoadingBaileys(false)
    }
  }

  const handleSave = async () => {
    if (!connection) return
    setLoading(true)
    try {
      await api.put(`/whatsapp/coexistence/${connection.id}/config`, {
        coexistenceEnabled: enabled,
        receiveChannel,
        sendChannel,
        linkedWhatsappId: linkedWhatsappId || null,
      })
      toast.success('Configuracion de coexistencia actualizada')
      onSaved()
      onClose()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      toast.error(error.response?.data?.error || 'Error guardando configuracion')
    } finally {
      setLoading(false)
    }
  }

  if (!connection) return null

  const selectedBaileys = baileysConnections.find((b) => b.id === linkedWhatsappId)
  const baileysNotConnected = sendChannel === 'baileys' && selectedBaileys && selectedBaileys.status !== 'CONNECTED'

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        variant="outlined"
        sx={{ maxWidth: 520, width: '100%', borderRadius: 'lg', p: 3 }}
      >
        <ModalClose />

        {/* Header */}
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #1877f2, #42b72a)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SettingsIcon sx={{ color: 'white', fontSize: 22 }} />
          </Box>
          <Box>
            <Typography level="title-lg">Configurar Coexistencia</Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              {connection.name}
            </Typography>
          </Box>
        </Stack>

        {/* Info */}
        <Stack spacing={0.5} sx={{ mb: 2, p: 1.5, bgcolor: 'background.level1', borderRadius: 'sm' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <PhoneIcon sx={{ fontSize: 16, color: 'text.tertiary' }} />
            <Typography level="body-xs">
              Phone Number ID: <strong>{connection.phoneNumberId || 'N/A'}</strong>
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <CloudIcon sx={{ fontSize: 16, color: 'text.tertiary' }} />
            <Typography level="body-xs">
              WABA ID: <strong>{connection.wabaId || 'N/A'}</strong>
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <SyncIcon sx={{ fontSize: 16, color: 'text.tertiary' }} />
            <Typography level="body-xs">
              Estado: <Chip size="sm" variant="soft" color={connection.status === 'CONNECTED' ? 'success' : 'warning'}>
                {connection.status}
              </Chip>
            </Typography>
          </Stack>
        </Stack>

        <Divider sx={{ my: 1 }} />

        {/* Switch: Coexistencia activa */}
        <FormControl orientation="horizontal" sx={{ justifyContent: 'space-between', mb: 2 }}>
          <Box>
            <FormLabel>Coexistencia activa</FormLabel>
            <FormHelperText sx={{ mt: 0 }}>
              Permite recibir y enviar por multiples canales
            </FormHelperText>
          </Box>
          <Switch
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            color={enabled ? 'success' : 'neutral'}
          />
        </FormControl>

        {enabled && (
          <Stack spacing={2}>
            {/* Recibir mensajes desde */}
            <FormControl>
              <FormLabel>Recibir mensajes desde</FormLabel>
              <Select
                value={receiveChannel}
                onChange={(_e, val) => val && setReceiveChannel(val)}
                size="sm"
              >
                <Option value="both">Ambos (Meta + Baileys)</Option>
                <Option value="meta">Solo Meta Cloud API</Option>
                <Option value="baileys">Solo Baileys (WhatsApp Web)</Option>
              </Select>
              <FormHelperText>
                Define de donde se aceptan mensajes entrantes para crear tickets
              </FormHelperText>
            </FormControl>

            {/* Enviar respuestas por */}
            <FormControl>
              <FormLabel>Enviar respuestas por</FormLabel>
              <Select
                value={sendChannel}
                onChange={(_e, val) => val && setSendChannel(val)}
                size="sm"
              >
                <Option value="meta">Meta Cloud API</Option>
                <Option value="baileys">Baileys (WhatsApp Web)</Option>
              </Select>
              <FormHelperText>
                Define por donde salen las respuestas (manuales y automaticas)
              </FormHelperText>
            </FormControl>

            {/* Conexion Baileys vinculada */}
            {sendChannel === 'baileys' && (
              <FormControl>
                <FormLabel>Conexion Baileys vinculada</FormLabel>
                <Select
                  value={linkedWhatsappId ? String(linkedWhatsappId) : ''}
                  onChange={(_e, val) => setLinkedWhatsappId(val ? Number(val) : null)}
                  size="sm"
                  placeholder={loadingBaileys ? 'Cargando...' : 'Seleccionar conexion Baileys'}
                  disabled={loadingBaileys}
                >
                  {baileysConnections.map((bc) => (
                    <Option key={bc.id} value={String(bc.id)}>
                      {bc.name} (#{bc.id}) — {bc.status === 'CONNECTED' ? 'Conectado' : bc.status}
                    </Option>
                  ))}
                </Select>
                <FormHelperText>
                  Sesion de WhatsApp Web que se usara para enviar las respuestas
                </FormHelperText>
              </FormControl>
            )}

            {/* Alerta: Baileys no conectado */}
            {baileysNotConnected && (
              <Alert variant="soft" color="warning" startDecorator={<WarningIcon />} size="sm">
                <Typography level="body-xs">
                  La conexion Baileys seleccionada ({selectedBaileys?.name}) esta en estado <strong>{selectedBaileys?.status}</strong>.
                  Debe estar CONNECTED para poder enviar mensajes.
                </Typography>
              </Alert>
            )}

            {/* Info */}
            <Alert variant="soft" color="primary" startDecorator={<InfoIcon />} size="sm">
              <Typography level="body-xs">
                Si seleccionas "Baileys" como canal de envio y la sesion se desconecta,
                el sistema hara fallback automatico a Meta Cloud API.
              </Typography>
            </Alert>
          </Stack>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Botones */}
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button variant="plain" color="neutral" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="solid"
            color="primary"
            onClick={handleSave}
            loading={loading}
          >
            Guardar
          </Button>
        </Stack>
      </ModalDialog>
    </Modal>
  )
}
