import { useState } from 'react'
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Stack,
  FormControl,
  FormLabel,
  Input,
  Button,
  Divider,
  FormHelperText,
} from '@mui/joy'
import { toast } from 'react-toastify'
import api from '../../services/api'

interface MetaCloudModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function MetaCloudModal({ open, onClose, onSuccess }: MetaCloudModalProps) {
  const [accessToken, setAccessToken] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ accessToken?: string; phoneNumberId?: string }>({})

  const handleClose = () => {
    setAccessToken('')
    setPhoneNumberId('')
    setName('')
    setErrors({})
    onClose()
  }

  const validate = () => {
    const newErrors: { accessToken?: string; phoneNumberId?: string } = {}

    if (!accessToken.trim()) {
      newErrors.accessToken = 'El Access Token es requerido'
    }

    if (!phoneNumberId.trim()) {
      newErrors.phoneNumberId = 'El Phone Number ID es requerido'
    } else if (!/^\d+$/.test(phoneNumberId.trim())) {
      newErrors.phoneNumberId = 'Solo debe contener numeros'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return

    setLoading(true)
    try {
      await api.post('/meta', {
        accessToken: accessToken.trim(),
        number: phoneNumberId.trim(),
        name: name.trim() || undefined,
      })

      toast.success('Conexion Meta guardada correctamente')
      handleClose()
      onSuccess?.()
    } catch (error: any) {
      console.error('Error saving Meta connection:', error)
      const message = error.response?.data?.error || error.response?.data?.message || 'Error al guardar'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose}>
      <ModalDialog sx={{ width: 500, maxHeight: '90vh', overflow: 'auto' }}>
        <ModalClose />
        <Typography level="h4">Conectar Meta (WhatsApp Cloud API)</Typography>

        <Stack spacing={2} sx={{ mt: 2 }}>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Conecta tu numero de WhatsApp Business usando la API oficial de Meta Cloud.
            Necesitas obtener estos datos desde tu cuenta de Meta Business.
          </Typography>

          <Divider />

          <FormControl error={!!errors.accessToken}>
            <FormLabel>Access Token (Meta)</FormLabel>
            <Input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="EAAG... (System/User token)"
            />
            {errors.accessToken && (
              <FormHelperText>{errors.accessToken}</FormHelperText>
            )}
            <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
              Obten el token desde Meta Business Suite &gt; API Configuration
            </Typography>
          </FormControl>

          <FormControl error={!!errors.phoneNumberId}>
            <FormLabel>Phone Number ID</FormLabel>
            <Input
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="Ej: 123456789012345"
            />
            {errors.phoneNumberId && (
              <FormHelperText>{errors.phoneNumberId}</FormHelperText>
            )}
            <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
              ID del numero de telefono en WhatsApp Business Platform
            </Typography>
          </FormControl>

          <FormControl>
            <FormLabel>Nombre (opcional)</FormLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Meta + numero o alias de la conexion"
            />
          </FormControl>

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
              Guardar
            </Button>
          </Stack>
        </Stack>
      </ModalDialog>
    </Modal>
  )
}
