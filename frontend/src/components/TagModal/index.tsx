import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControlLabel,
  Switch,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
  Box,
  Typography,
  Chip,
  Stack,
  IconButton,
  Select,
  MenuItem,
  InputLabel,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DeleteIcon from '@mui/icons-material/Delete'
import api from '../../services/api'
import { toast } from 'react-toastify'

interface TagData {
  id?: number
  name: string
  color: string
  kanban?: number
  timeLane?: number
  nextLaneId?: number
  greetingMessageLane?: string
  rollbackLaneId?: number
  description?: string
  followupEnabled?: boolean
  followupCount?: number
  followupMessage1?: string
  followupDelay1?: number
  followupMessage2?: string
  followupDelay2?: number
  followupMessage3?: string
  followupDelay3?: number
}

interface TagModalProps {
  open: boolean
  onClose: () => void
  tagId?: number
  kanban?: number
}

const TagModal: React.FC<TagModalProps> = ({ open, onClose, tagId, kanban = 1 }) => {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<TagData>({
    name: '',
    color: '#3b82f6',
    kanban: kanban,
    timeLane: 0,
    nextLaneId: undefined,
    greetingMessageLane: '',
    rollbackLaneId: undefined,
    description: '',
    followupEnabled: false,
    followupCount: 1,
    followupMessage1: '',
    followupDelay1: 1,
    followupMessage2: '',
    followupDelay2: 3,
    followupMessage3: '',
    followupDelay3: 4,
  })

  useEffect(() => {
    if (tagId) {
      loadTag()
    } else {
      resetForm()
    }
  }, [tagId])

  const loadTag = async () => {
    if (!tagId) return
    try {
      setLoading(true)
      const response = await api.get(`/tags/${tagId}`)
      const tag = response.data
      setFormData({
        name: tag.name || '',
        color: tag.color || '#3b82f6',
        kanban: tag.kanban || kanban,
        timeLane: tag.timeLane || 0,
        nextLaneId: tag.nextLaneId || undefined,
        greetingMessageLane: tag.greetingMessageLane || '',
        rollbackLaneId: tag.rollbackLaneId || undefined,
        description: tag.description || '',
        followupEnabled: tag.followupEnabled || false,
        followupCount: tag.followupCount || 1,
        followupMessage1: tag.followupMessage1 || '',
        followupDelay1: tag.followupDelay1 || 1,
        followupMessage2: tag.followupMessage2 || '',
        followupDelay2: tag.followupDelay2 || 3,
        followupMessage3: tag.followupMessage3 || '',
        followupDelay3: tag.followupDelay3 || 4,
      })
    } catch (error) {
      console.error('Error loading tag:', error)
      toast.error('Error al cargar la etiqueta')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      color: '#3b82f6',
      kanban: kanban,
      timeLane: 0,
      nextLaneId: undefined,
      greetingMessageLane: '',
      rollbackLaneId: undefined,
      description: '',
      followupEnabled: false,
      followupCount: 1,
      followupMessage1: '',
      followupDelay1: 1,
      followupMessage2: '',
      followupDelay2: 3,
      followupMessage3: '',
      followupDelay3: 4,
    })
  }

  const handleChange = (field: keyof TagData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async () => {
    if (!formData.name || formData.name.length < 3) {
      toast.error('El nombre debe tener al menos 3 caracteres')
      return
    }

    try {
      setLoading(true)
      const data = {
        ...formData,
        timeLane: formData.timeLane || 0,
        nextLaneId: formData.nextLaneId || null,
        greetingMessageLane: formData.greetingMessageLane || '',
        rollbackLaneId: formData.rollbackLaneId || null,
      }

      if (tagId) {
        await api.put(`/tags/${tagId}`, data)
        toast.success('Etiqueta actualizada correctamente')
      } else {
        await api.post('/tags', data)
        toast.success('Etiqueta creada correctamente')
      }
      onClose()
    } catch (error: any) {
      console.error('Error saving tag:', error)
      toast.error(error.response?.data?.message || 'Error al guardar la etiqueta')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!tagId) return
    if (!window.confirm('¿Estás seguro de eliminar esta etiqueta?')) return

    try {
      setLoading(true)
      await api.delete(`/tags/${tagId}`)
      toast.success('Etiqueta eliminada correctamente')
      onClose()
    } catch (error) {
      console.error('Error deleting tag:', error)
      toast.error('Error al eliminar la etiqueta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {tagId ? 'Editar Etiqueta Kanban' : 'Nueva Etiqueta Kanban'}
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Basic Info */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="Nombre"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
              sx={{ flex: 1, minWidth: 200 }}
              size="small"
            />
            <TextField
              label="Color"
              type="color"
              value={formData.color}
              onChange={(e) => handleChange('color', e.target.value)}
              size="small"
              sx={{ width: 100 }}
            />
          </Box>

          {/* Preview */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2">Vista previa:</Typography>
            <Chip
              label={formData.name || 'Etiqueta'}
              sx={{ bgcolor: formData.color, color: 'white' }}
            />
          </Box>

          {/* Description - Ahora se usa greetingMessageLane */}

          {/* Lane Settings - Comentado */}
          {/* <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="Tiempo en lane (horas)"
              type="number"
              value={formData.timeLane || 0}
              onChange={(e) => handleChange('timeLane', parseInt(e.target.value) || 0)}
              size="small"
              sx={{ width: 150 }}
            />
          </Box> */}

          {/* Description - Usando Mensaje de bienvenida como descripción */}
          <TextField
            label="Descripción"
            value={formData.greetingMessageLane || ''}
            onChange={(e) => handleChange('greetingMessageLane', e.target.value)}
            multiline
            rows={3}
            fullWidth
            size="small"
            placeholder="Descripción de la etiqueta kanban"
          />

          {/* Followup Section */}
          <Box sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            p: 2,
            bgcolor: formData.followupEnabled ? 'action.hover' : 'transparent'
          }}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.followupEnabled || false}
                  onChange={(e) => handleChange('followupEnabled', e.target.checked)}
                />
              }
              label={
                <Typography fontWeight="bold">
                  Mensajes de Seguimiento
                </Typography>
              }
            />

            {formData.followupEnabled && (
              <Box sx={{ mt: 2 }}>
                {/* Number of messages */}
                <FormControl component="fieldset" sx={{ mb: 2 }}>
                  <FormLabel component="legend">Cantidad de mensajes de seguimiento</FormLabel>
                  <RadioGroup
                    row
                    value={formData.followupCount || 1}
                    onChange={(e) => handleChange('followupCount', parseInt(e.target.value))}
                  >
                    <FormControlLabel value={1} control={<Radio />} label="1 mensaje" />
                    <FormControlLabel value={2} control={<Radio />} label="2 mensajes" />
                    <FormControlLabel value={3} control={<Radio />} label="3 mensajes" />
                  </RadioGroup>
                </FormControl>

                {/* Followup Message 1 */}
                {((formData.followupCount ?? 1) >= 1) && (
                  <Box sx={{ mb: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                      <Chip label="1" size="small" color="primary" />
                      <Typography variant="body2" fontWeight="bold">Mensaje 1</Typography>
                      <FormControl size="small" sx={{ width: 100 }}>
                        <InputLabel>Delay (hs)</InputLabel>
                        <Select
                          value={formData.followupDelay1 || 1}
                          label="Delay (hs)"
                          onChange={(e) => handleChange('followupDelay1', e.target.value)}
                        >
                          {[1, 2, 3, 4, 5, 6, 8, 12, 24, 48].map((h) => (
                            <MenuItem key={h} value={h}>{h} hora{h > 1 ? 's' : ''}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Stack>
                    <TextField
                      label="Mensaje de seguimiento 1"
                      value={formData.followupMessage1 || ''}
                      onChange={(e) => handleChange('followupMessage1', e.target.value)}
                      multiline
                      rows={2}
                      fullWidth
                      size="small"
                      placeholder="Escribe el mensaje que se enviará de seguimiento..."
                    />
                  </Box>
                )}

                {/* Followup Message 2 */}
                {((formData.followupCount ?? 1) >= 2) && (
                  <Box sx={{ mb: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                      <Chip label="2" size="small" color="primary" />
                      <Typography variant="body2" fontWeight="bold">Mensaje 2</Typography>
                      <FormControl size="small" sx={{ width: 100 }}>
                        <InputLabel>Delay (hs)</InputLabel>
                        <Select
                          value={formData.followupDelay2 || 3}
                          label="Delay (hs)"
                          onChange={(e) => handleChange('followupDelay2', e.target.value)}
                        >
                          {[1, 2, 3, 4, 5, 6, 8, 12, 24, 48].map((h) => (
                            <MenuItem key={h} value={h}>{h} hora{h > 1 ? 's' : ''}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Stack>
                    <TextField
                      label="Mensaje de seguimiento 2"
                      value={formData.followupMessage2 || ''}
                      onChange={(e) => handleChange('followupMessage2', e.target.value)}
                      multiline
                      rows={2}
                      fullWidth
                      size="small"
                      placeholder="Escribe el segundo mensaje de seguimiento..."
                    />
                  </Box>
                )}

                {/* Followup Message 3 */}
                {((formData.followupCount ?? 1) >= 3) && (
                  <Box sx={{ mb: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                      <Chip label="3" size="small" color="primary" />
                      <Typography variant="body2" fontWeight="bold">Mensaje 3</Typography>
                      <FormControl size="small" sx={{ width: 100 }}>
                        <InputLabel>Delay (hs)</InputLabel>
                        <Select
                          value={formData.followupDelay3 || 4}
                          label="Delay (hs)"
                          onChange={(e) => handleChange('followupDelay3', e.target.value)}
                        >
                          {[1, 2, 3, 4, 5, 6, 8, 12, 24, 48].map((h) => (
                            <MenuItem key={h} value={h}>{h} hora{h > 1 ? 's' : ''}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Stack>
                    <TextField
                      label="Mensaje de seguimiento 3"
                      value={formData.followupMessage3 || ''}
                      onChange={(e) => handleChange('followupMessage3', e.target.value)}
                      multiline
                      rows={2}
                      fullWidth
                      size="small"
                      placeholder="Escribe el tercer mensaje de seguimiento..."
                    />
                  </Box>
                )}
              </Box>
            )}
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
        {tagId ? (
          <Button
            startIcon={<DeleteIcon />}
            color="error"
            onClick={handleDelete}
            disabled={loading}
          >
            Eliminar
          </Button>
        ) : (
          <Box />
        )}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={loading || !formData.name}
          >
            {loading ? 'Guardando...' : (tagId ? 'Actualizar' : 'Crear')}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  )
}

export default TagModal
