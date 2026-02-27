import { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Table,
  Sheet,
  Chip,
  IconButton,
  Modal,
  ModalDialog,
  Input,
  FormControl,
  FormLabel,
  Select,
  Option,
  Textarea,
  Grid,
  LinearProgress,
} from '@mui/joy'
import {
  Add as AddIcon,
  Send as SendIcon,
  Pause as PauseIcon,
  PlayArrow as PlayArrowIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  Campaign as CampaignIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material'

interface Campaign {
  id: number
  name: string
  templateName: string
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'paused' | 'failed'
  recipientsTotal: number
  sent: number
  delivered: number
  read: number
  failed: number
  scheduledDate?: string
  createdAt: string
  completedAt?: string
  deliveryRate: number
  readRate: number
}

export default function WhatsAppCampaigns() {
  const [campaigns] = useState<Campaign[]>([
    {
      id: 1,
      name: 'Promoción Verano 2025',
      templateName: 'promocion_mensual',
      status: 'completed',
      recipientsTotal: 5000,
      sent: 5000,
      delivered: 4925,
      read: 3567,
      failed: 75,
      scheduledDate: '2025-10-10 09:00',
      createdAt: '2025-10-08',
      completedAt: '2025-10-10 11:30',
      deliveryRate: 98.5,
      readRate: 72.4,
    },
    {
      id: 2,
      name: 'Recordatorio de Pago',
      templateName: 'recordatorio_pago',
      status: 'sending',
      recipientsTotal: 1200,
      sent: 850,
      delivered: 834,
      read: 512,
      failed: 16,
      createdAt: '2025-10-13',
      deliveryRate: 98.1,
      readRate: 61.4,
    },
    {
      id: 3,
      name: 'Bienvenida Nuevos Clientes',
      templateName: 'bienvenida_cliente',
      status: 'scheduled',
      recipientsTotal: 320,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      scheduledDate: '2025-10-14 10:00',
      createdAt: '2025-10-12',
      deliveryRate: 0,
      readRate: 0,
    },
    {
      id: 4,
      name: 'Encuesta Satisfacción',
      templateName: 'encuesta_nps',
      status: 'draft',
      recipientsTotal: 800,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      createdAt: '2025-10-13',
      deliveryRate: 0,
      readRate: 0,
    },
  ])

  const [openModal, setOpenModal] = useState(false)

  const getStatusColor = (status: Campaign['status']) => {
    switch (status) {
      case 'completed':
        return 'success'
      case 'sending':
        return 'primary'
      case 'scheduled':
        return 'warning'
      case 'paused':
        return 'neutral'
      case 'failed':
        return 'danger'
      default:
        return 'neutral'
    }
  }

  const getStatusText = (status: Campaign['status']) => {
    switch (status) {
      case 'draft':
        return 'Borrador'
      case 'scheduled':
        return 'Programada'
      case 'sending':
        return 'Enviando'
      case 'completed':
        return 'Completada'
      case 'paused':
        return 'Pausada'
      case 'failed':
        return 'Fallida'
      default:
        return status
    }
  }

  const calculateProgress = (campaign: Campaign) => {
    if (campaign.recipientsTotal === 0) return 0
    return (campaign.sent / campaign.recipientsTotal) * 100
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <CampaignIcon sx={{ fontSize: 32 }} />
            Campañas de Broadcasting WhatsApp
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Envío masivo de mensajes con templates aprobados
          </Typography>
        </Box>
        <Button startDecorator={<AddIcon />} onClick={() => setOpenModal(true)}>
          Nueva Campaña
        </Button>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Total Campañas
              </Typography>
              <Typography level="h3">{campaigns.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Activas
              </Typography>
              <Typography level="h3" sx={{ color: 'primary.500' }}>
                {campaigns.filter((c) => c.status === 'sending' || c.status === 'scheduled').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Mensajes Enviados (Total)
              </Typography>
              <Typography level="h3" sx={{ color: 'success.500' }}>
                {campaigns.reduce((acc, c) => acc + c.sent, 0).toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Tasa Entrega Promedio
              </Typography>
              <Typography level="h3" sx={{ color: 'warning.500' }}>
                {(
                  campaigns.reduce((acc, c) => acc + c.deliveryRate, 0) / campaigns.length
                ).toFixed(1)}
                %
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabla de Campañas */}
      <Card>
        <CardContent>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table>
              <thead>
                <tr>
                  <th style={{ width: 220 }}>Campaña</th>
                  <th style={{ width: 120 }}>Estado</th>
                  <th style={{ width: 200 }}>Progreso</th>
                  <th style={{ width: 100 }}>Destinatarios</th>
                  <th style={{ width: 100 }}>Enviados</th>
                  <th style={{ width: 100 }}>Entregados</th>
                  <th style={{ width: 100 }}>Leídos</th>
                  <th style={{ width: 150 }}>Fecha Programada</th>
                  <th style={{ width: 140, textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>
                      <Box>
                        <Typography level="body-sm" fontWeight="lg">
                          {campaign.name}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          Template: {campaign.templateName}
                        </Typography>
                      </Box>
                    </td>
                    <td>
                      <Chip size="sm" color={getStatusColor(campaign.status)}>
                        {getStatusText(campaign.status)}
                      </Chip>
                    </td>
                    <td>
                      <Box>
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            mb: 0.5,
                          }}
                        >
                          <Typography level="body-xs">
                            {campaign.sent} / {campaign.recipientsTotal}
                          </Typography>
                          <Typography level="body-xs" fontWeight="lg">
                            {calculateProgress(campaign).toFixed(1)}%
                          </Typography>
                        </Box>
                        <LinearProgress
                          determinate
                          value={calculateProgress(campaign)}
                          color={getStatusColor(campaign.status)}
                          size="sm"
                        />
                      </Box>
                    </td>
                    <td>
                      <Typography level="body-sm">
                        {campaign.recipientsTotal.toLocaleString()}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm" fontWeight="lg">
                        {campaign.sent.toLocaleString()}
                      </Typography>
                    </td>
                    <td>
                      <Box>
                        <Typography level="body-sm" fontWeight="lg">
                          {campaign.delivered.toLocaleString()}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'success.500' }}>
                          {campaign.deliveryRate.toFixed(1)}%
                        </Typography>
                      </Box>
                    </td>
                    <td>
                      <Box>
                        <Typography level="body-sm" fontWeight="lg">
                          {campaign.read.toLocaleString()}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'primary.500' }}>
                          {campaign.readRate.toFixed(1)}%
                        </Typography>
                      </Box>
                    </td>
                    <td>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {campaign.scheduledDate || '-'}
                      </Typography>
                    </td>
                    <td>
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        {campaign.status === 'sending' && (
                          <IconButton size="sm" variant="plain" color="warning">
                            <PauseIcon />
                          </IconButton>
                        )}
                        {campaign.status === 'paused' && (
                          <IconButton size="sm" variant="plain" color="success">
                            <PlayArrowIcon />
                          </IconButton>
                        )}
                        {campaign.status === 'draft' && (
                          <IconButton size="sm" variant="plain" color="primary">
                            <SendIcon />
                          </IconButton>
                        )}
                        <IconButton size="sm" variant="plain" color="neutral">
                          <VisibilityIcon />
                        </IconButton>
                        <IconButton size="sm" variant="plain" color="danger">
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Sheet>
        </CardContent>
      </Card>

      {/* Modal Nueva Campaña */}
      <Modal open={openModal} onClose={() => setOpenModal(false)}>
        <ModalDialog sx={{ minWidth: 600 }}>
          <Typography level="h4" sx={{ mb: 2 }}>
            Nueva Campaña de Broadcasting
          </Typography>

          <FormControl sx={{ mb: 2 }}>
            <FormLabel>Nombre de la Campaña</FormLabel>
            <Input placeholder="Ej: Promoción Black Friday" />
          </FormControl>

          <FormControl sx={{ mb: 2 }}>
            <FormLabel>Seleccionar Template</FormLabel>
            <Select placeholder="Selecciona un template aprobado">
              <Option value="promocion_mensual">promocion_mensual</Option>
              <Option value="bienvenida_cliente">bienvenida_cliente</Option>
              <Option value="confirmacion_pedido">confirmacion_pedido</Option>
            </Select>
          </FormControl>

          <FormControl sx={{ mb: 2 }}>
            <FormLabel>Lista de Destinatarios</FormLabel>
            <Select placeholder="Selecciona una lista de contactos">
              <Option value="todos">Todos los contactos (5,234)</Option>
              <Option value="clientes">Solo clientes activos (3,456)</Option>
              <Option value="prospectos">Prospectos (1,778)</Option>
            </Select>
          </FormControl>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid xs={6}>
              <FormControl>
                <FormLabel>Fecha de Envío</FormLabel>
                <Input type="date" />
              </FormControl>
            </Grid>
            <Grid xs={6}>
              <FormControl>
                <FormLabel>Hora de Envío</FormLabel>
                <Input type="time" defaultValue="09:00" />
              </FormControl>
            </Grid>
          </Grid>

          <FormControl sx={{ mb: 2 }}>
            <FormLabel>Variables del Template (Opcional)</FormLabel>
            <Textarea
              minRows={2}
              placeholder='{"1": "Cliente", "2": "JR Chateam"}'
            />
          </FormControl>

          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 2 }}>
            <Button variant="outlined" color="neutral" onClick={() => setOpenModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="outlined"
              startDecorator={<ScheduleIcon />}
              onClick={() => setOpenModal(false)}
            >
              Programar
            </Button>
            <Button startDecorator={<SendIcon />} onClick={() => setOpenModal(false)}>
              Enviar Ahora
            </Button>
          </Box>
        </ModalDialog>
      </Modal>
    </Box>
  )
}
