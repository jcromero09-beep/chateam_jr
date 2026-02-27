import { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Input,
  FormControl,
  FormLabel,
  Switch,
  Chip,
  Table,
  Sheet,
  Modal,
  ModalDialog,
  ModalClose,
  IconButton,
  Tooltip,
  Select,
  Option,
  Divider,
} from '@mui/joy'
import {
  Webhook as WebhookIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as TestIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material'

interface Webhook {
  id: number
  name: string
  endpoint: string
  integration: 'Billie' | 'Aria Lite' | 'SmartTrack' | 'SGR' | 'Custom'
  events: string[]
  status: 'active' | 'inactive' | 'error'
  lastTrigger: string
  triggerCount: number
  enabled: boolean
}

interface WebhookLog {
  id: number
  webhookName: string
  endpoint: string
  event: string
  status: 'success' | 'failed'
  timestamp: string
  responseTime: number
  statusCode: number
}

export default function IntegrationsWebhooks() {
  const [openModal, setOpenModal] = useState(false)
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null)
  const [filterIntegration, setFilterIntegration] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const [formData, setFormData] = useState({
    name: '',
    endpoint: '',
    integration: 'Custom',
    events: [] as string[],
    enabled: true,
    secret: '',
    retryAttempts: 3,
    timeout: 30,
  })

  const webhooks: Webhook[] = [
    {
      id: 1,
      name: 'Billie Sync Webhook',
      endpoint: 'https://api.jrchateam.com/webhooks/billie/sync',
      integration: 'Billie',
      events: ['contact.created', 'contact.updated', 'invoice.created'],
      status: 'active',
      lastTrigger: '2025-10-13 10:45:23',
      triggerCount: 1245,
      enabled: true,
    },
    {
      id: 2,
      name: 'Aria Lite CRM Events',
      endpoint: 'https://api.jrchateam.com/webhooks/aria/events',
      integration: 'Aria Lite',
      events: ['lead.created', 'opportunity.updated', 'customer.created'],
      status: 'active',
      lastTrigger: '2025-10-13 10:40:12',
      triggerCount: 876,
      enabled: true,
    },
    {
      id: 3,
      name: 'SmartTrack Shipment Updates',
      endpoint: 'https://api.jrchateam.com/webhooks/smarttrack/shipments',
      integration: 'SmartTrack',
      events: ['shipment.created', 'shipment.updated', 'shipment.delivered'],
      status: 'active',
      lastTrigger: '2025-10-13 10:35:45',
      triggerCount: 2341,
      enabled: true,
    },
    {
      id: 4,
      name: 'SGR Claims Notification',
      endpoint: 'https://api.jrchateam.com/webhooks/sgr/claims',
      integration: 'SGR',
      events: ['claim.created', 'claim.updated', 'claim.closed'],
      status: 'active',
      lastTrigger: '2025-10-13 10:35:18',
      triggerCount: 567,
      enabled: true,
    },
    {
      id: 5,
      name: 'Custom Payment Webhook',
      endpoint: 'https://external.api.com/payment/notify',
      integration: 'Custom',
      events: ['payment.completed', 'payment.failed'],
      status: 'error',
      lastTrigger: '2025-10-13 09:15:22',
      triggerCount: 23,
      enabled: false,
    },
  ]

  const recentLogs: WebhookLog[] = [
    {
      id: 1,
      webhookName: 'Billie Sync Webhook',
      endpoint: 'https://api.jrchateam.com/webhooks/billie/sync',
      event: 'contact.updated',
      status: 'success',
      timestamp: '2025-10-13 10:45:23',
      responseTime: 145,
      statusCode: 200,
    },
    {
      id: 2,
      webhookName: 'Aria Lite CRM Events',
      endpoint: 'https://api.jrchateam.com/webhooks/aria/events',
      event: 'lead.created',
      status: 'success',
      timestamp: '2025-10-13 10:40:12',
      responseTime: 98,
      statusCode: 200,
    },
    {
      id: 3,
      webhookName: 'SmartTrack Shipment Updates',
      endpoint: 'https://api.jrchateam.com/webhooks/smarttrack/shipments',
      event: 'shipment.updated',
      status: 'success',
      timestamp: '2025-10-13 10:35:45',
      responseTime: 203,
      statusCode: 200,
    },
    {
      id: 4,
      webhookName: 'SGR Claims Notification',
      endpoint: 'https://api.jrchateam.com/webhooks/sgr/claims',
      event: 'claim.created',
      status: 'success',
      timestamp: '2025-10-13 10:35:18',
      responseTime: 167,
      statusCode: 200,
    },
    {
      id: 5,
      webhookName: 'Custom Payment Webhook',
      endpoint: 'https://external.api.com/payment/notify',
      event: 'payment.completed',
      status: 'failed',
      timestamp: '2025-10-13 09:15:22',
      responseTime: 0,
      statusCode: 500,
    },
  ]

  const availableEvents = [
    'contact.created',
    'contact.updated',
    'contact.deleted',
    'ticket.created',
    'ticket.updated',
    'ticket.closed',
    'message.sent',
    'message.received',
    'integration.sync.completed',
    'integration.sync.failed',
  ]

  const handleOpenModal = (webhook?: Webhook) => {
    if (webhook) {
      setEditingWebhook(webhook)
      setFormData({
        name: webhook.name,
        endpoint: webhook.endpoint,
        integration: webhook.integration,
        events: webhook.events,
        enabled: webhook.enabled,
        secret: '••••••••••••••••',
        retryAttempts: 3,
        timeout: 30,
      })
    } else {
      setEditingWebhook(null)
      setFormData({
        name: '',
        endpoint: '',
        integration: 'Custom',
        events: [],
        enabled: true,
        secret: '',
        retryAttempts: 3,
        timeout: 30,
      })
    }
    setOpenModal(true)
  }

  const handleCloseModal = () => {
    setOpenModal(false)
    setEditingWebhook(null)
  }

  const handleSave = () => {
    console.log('Guardando webhook...', formData)
    handleCloseModal()
  }

  const handleTestWebhook = (webhook: Webhook) => {
    console.log('Probando webhook...', webhook)
  }

  const handleDeleteWebhook = (id: number) => {
    console.log('Eliminando webhook...', id)
  }

  const handleCopyEndpoint = (endpoint: string) => {
    navigator.clipboard.writeText(endpoint)
    console.log('Endpoint copiado:', endpoint)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'success'
      case 'inactive':
        return 'neutral'
      case 'error':
        return 'danger'
      default:
        return 'neutral'
    }
  }

  const filteredWebhooks = webhooks.filter(webhook => {
    if (filterIntegration !== 'all' && webhook.integration !== filterIntegration) return false
    if (filterStatus !== 'all' && webhook.status !== filterStatus) return false
    return true
  })

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <WebhookIcon sx={{ fontSize: 32 }} />
            Gestión de Webhooks
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Configuración y monitoreo de webhooks para todas las integraciones
          </Typography>
        </Box>
        <Button startDecorator={<AddIcon />} onClick={() => handleOpenModal()}>
          Nuevo Webhook
        </Button>
      </Box>

      {/* KPIs */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Total Webhooks
              </Typography>
              <Typography level="h3">{webhooks.length}</Typography>
              <Typography level="body-xs" sx={{ color: 'success.500', mt: 0.5 }}>
                {webhooks.filter(w => w.enabled).length} activos
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Triggers Hoy
              </Typography>
              <Typography level="h3">5,052</Typography>
              <Typography level="body-xs" sx={{ color: 'success.500', mt: 0.5 }}>
                +8.3% vs ayer
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Tasa de Éxito
              </Typography>
              <Typography level="h3">99.2%</Typography>
              <Typography level="body-xs" sx={{ color: 'success.500', mt: 0.5 }}>
                Últimas 24 horas
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Tiempo Respuesta Prom.
              </Typography>
              <Typography level="h3">152ms</Typography>
              <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                Últimas 24 horas
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filtros */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid xs={12} sm={6} md={4}>
              <FormControl>
                <FormLabel>Filtrar por Integración</FormLabel>
                <Select
                  value={filterIntegration}
                  onChange={(_, value) => setFilterIntegration(value as string)}
                  size="sm"
                >
                  <Option value="all">Todas las integraciones</Option>
                  <Option value="Billie">Billie</Option>
                  <Option value="Aria Lite">Aria Lite</Option>
                  <Option value="SmartTrack">SmartTrack</Option>
                  <Option value="SGR">SGR</Option>
                  <Option value="Custom">Custom</Option>
                </Select>
              </FormControl>
            </Grid>
            <Grid xs={12} sm={6} md={4}>
              <FormControl>
                <FormLabel>Filtrar por Estado</FormLabel>
                <Select
                  value={filterStatus}
                  onChange={(_, value) => setFilterStatus(value as string)}
                  size="sm"
                >
                  <Option value="all">Todos los estados</Option>
                  <Option value="active">Activo</Option>
                  <Option value="inactive">Inactivo</Option>
                  <Option value="error">Error</Option>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Lista de Webhooks */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2 }}>
            Webhooks Configurados
          </Typography>

          <Sheet sx={{ overflow: 'auto' }}>
            <Table>
              <thead>
                <tr>
                  <th style={{ width: '20%' }}>Nombre</th>
                  <th style={{ width: '30%' }}>Endpoint URL</th>
                  <th>Integración</th>
                  <th>Eventos</th>
                  <th>Estado</th>
                  <th>Último Trigger</th>
                  <th>Total Triggers</th>
                  <th style={{ width: 120 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredWebhooks.map((webhook) => (
                  <tr key={webhook.id}>
                    <td>
                      <Typography level="body-sm" fontWeight="lg">
                        {webhook.name}
                      </Typography>
                    </td>
                    <td>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography level="body-xs" sx={{ fontFamily: 'monospace', flex: 1 }}>
                          {webhook.endpoint}
                        </Typography>
                        <Tooltip title="Copiar URL">
                          <IconButton size="sm" onClick={() => handleCopyEndpoint(webhook.endpoint)}>
                            <CopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </td>
                    <td>
                      <Chip size="sm" variant="outlined">
                        {webhook.integration}
                      </Chip>
                    </td>
                    <td>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {webhook.events.slice(0, 2).map((event, idx) => (
                          <Chip key={idx} size="sm" variant="soft">
                            {event}
                          </Chip>
                        ))}
                        {webhook.events.length > 2 && (
                          <Chip size="sm" variant="soft">
                            +{webhook.events.length - 2}
                          </Chip>
                        )}
                      </Box>
                    </td>
                    <td>
                      <Chip
                        size="sm"
                        color={getStatusColor(webhook.status)}
                        startDecorator={
                          webhook.status === 'active' ? <CheckCircleIcon /> :
                          webhook.status === 'error' ? <ErrorIcon /> : null
                        }
                      >
                        {webhook.status}
                      </Chip>
                    </td>
                    <td>
                      <Typography level="body-xs">
                        {webhook.lastTrigger}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm" fontWeight="lg">
                        {webhook.triggerCount.toLocaleString()}
                      </Typography>
                    </td>
                    <td>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Probar Webhook">
                          <IconButton size="sm" color="primary" onClick={() => handleTestWebhook(webhook)}>
                            <TestIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Editar">
                          <IconButton size="sm" color="neutral" onClick={() => handleOpenModal(webhook)}>
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Eliminar">
                          <IconButton size="sm" color="danger" onClick={() => handleDeleteWebhook(webhook.id)}>
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Sheet>

          {filteredWebhooks.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                No se encontraron webhooks con los filtros seleccionados
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Log de Eventos Recientes */}
      <Card>
        <CardContent>
          <Typography level="title-lg" sx={{ mb: 2 }}>
            Log de Eventos Recientes (Últimos 50)
          </Typography>

          <Sheet sx={{ overflow: 'auto' }}>
            <Table size="sm">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Webhook</th>
                  <th>Evento</th>
                  <th>Estado</th>
                  <th>Status Code</th>
                  <th>Tiempo Respuesta</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <Typography level="body-xs">
                        {log.timestamp}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">
                        {log.webhookName}
                      </Typography>
                    </td>
                    <td>
                      <Chip size="sm" variant="soft">
                        {log.event}
                      </Chip>
                    </td>
                    <td>
                      <Chip
                        size="sm"
                        color={log.status === 'success' ? 'success' : 'danger'}
                        startDecorator={log.status === 'success' ? <CheckCircleIcon /> : <ErrorIcon />}
                      >
                        {log.status}
                      </Chip>
                    </td>
                    <td>
                      <Typography
                        level="body-sm"
                        fontWeight="lg"
                        sx={{ color: log.statusCode === 200 ? 'success.500' : 'danger.500' }}
                      >
                        {log.statusCode}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">
                        {log.responseTime > 0 ? `${log.responseTime}ms` : '-'}
                      </Typography>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Sheet>
        </CardContent>
      </Card>

      {/* Modal Crear/Editar Webhook */}
      <Modal open={openModal} onClose={handleCloseModal}>
        <ModalDialog sx={{ minWidth: 600, maxWidth: '90vw' }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            {editingWebhook ? 'Editar Webhook' : 'Crear Nuevo Webhook'}
          </Typography>

          <Divider sx={{ my: 2 }} />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl required>
              <FormLabel>Nombre del Webhook</FormLabel>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Billie Sync Webhook"
              />
            </FormControl>

            <FormControl required>
              <FormLabel>URL del Endpoint</FormLabel>
              <Input
                value={formData.endpoint}
                onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                placeholder="https://api.example.com/webhook"
              />
            </FormControl>

            <FormControl required>
              <FormLabel>Integración</FormLabel>
              <Select
                value={formData.integration}
                onChange={(_, value) => setFormData({ ...formData, integration: value as string })}
              >
                <Option value="Billie">Billie</Option>
                <Option value="Aria Lite">Aria Lite</Option>
                <Option value="SmartTrack">SmartTrack</Option>
                <Option value="SGR">SGR</Option>
                <Option value="Custom">Custom</Option>
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel>Eventos</FormLabel>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {availableEvents.map((event) => (
                  <Chip
                    key={event}
                    size="sm"
                    variant={formData.events.includes(event) ? 'solid' : 'outlined'}
                    onClick={() => {
                      const newEvents = formData.events.includes(event)
                        ? formData.events.filter(e => e !== event)
                        : [...formData.events, event]
                      setFormData({ ...formData, events: newEvents })
                    }}
                    sx={{ cursor: 'pointer' }}
                  >
                    {event}
                  </Chip>
                ))}
              </Box>
            </FormControl>

            <FormControl>
              <FormLabel>Secret Key (opcional)</FormLabel>
              <Input
                type="password"
                value={formData.secret}
                onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                placeholder="••••••••••••••••"
              />
            </FormControl>

            <Grid container spacing={2}>
              <Grid xs={6}>
                <FormControl>
                  <FormLabel>Intentos de Reintento</FormLabel>
                  <Input
                    type="number"
                    value={formData.retryAttempts}
                    onChange={(e) => setFormData({ ...formData, retryAttempts: parseInt(e.target.value) })}
                    slotProps={{ input: { min: 0, max: 10 } }}
                  />
                </FormControl>
              </Grid>
              <Grid xs={6}>
                <FormControl>
                  <FormLabel>Timeout (segundos)</FormLabel>
                  <Input
                    type="number"
                    value={formData.timeout}
                    onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) })}
                    slotProps={{ input: { min: 5, max: 120 } }}
                  />
                </FormControl>
              </Grid>
            </Grid>

            <FormControl>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <FormLabel>Habilitar Webhook</FormLabel>
                <Switch
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                />
              </Box>
            </FormControl>

            <Divider sx={{ my: 1 }} />

            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button variant="outlined" onClick={handleCloseModal}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                {editingWebhook ? 'Actualizar' : 'Crear'} Webhook
              </Button>
            </Box>
          </Box>
        </ModalDialog>
      </Modal>
    </Box>
  )
}
