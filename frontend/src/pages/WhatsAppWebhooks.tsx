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
  Input,
  Grid,
  Tabs,
  TabList,
  Tab,
  TabPanel,
} from '@mui/joy'
import {
  Webhook as WebhookIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  ContentCopy as ContentCopyIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material'

interface WebhookEvent {
  id: number
  event: string
  status: 'success' | 'failed' | 'pending'
  timestamp: string
  responseCode: number
  responseTime: number
  payload: string
  retries: number
}

export default function WhatsAppWebhooks() {
  const [webhookUrl] = useState('https://api.jrchateam.com/webhooks/whatsapp')
  const [verifyToken] = useState('VERIFY_TOKEN_ABC123XYZ')

  const [events] = useState<WebhookEvent[]>([
    {
      id: 1,
      event: 'messages',
      status: 'success',
      timestamp: '2025-10-13 10:45:32',
      responseCode: 200,
      responseTime: 145,
      payload: '{"from":"15550123456","type":"text","text":{"body":"Hola"}}',
      retries: 0,
    },
    {
      id: 2,
      event: 'message_status',
      status: 'success',
      timestamp: '2025-10-13 10:44:15',
      responseCode: 200,
      responseTime: 98,
      payload: '{"id":"wamid.xxx","status":"delivered"}',
      retries: 0,
    },
    {
      id: 3,
      event: 'messages',
      status: 'failed',
      timestamp: '2025-10-13 10:40:22',
      responseCode: 500,
      responseTime: 5000,
      payload: '{"from":"15550987654","type":"text","text":{"body":"Test"}}',
      retries: 3,
    },
  ])

  const [stats] = useState({
    totalEvents: 15643,
    successRate: 99.2,
    avgResponseTime: 156,
    failedLast24h: 8,
  })

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    console.log('Copiado:', text)
  }

  const getStatusColor = (status: WebhookEvent['status']) => {
    switch (status) {
      case 'success':
        return 'success'
      case 'failed':
        return 'danger'
      case 'pending':
        return 'warning'
      default:
        return 'neutral'
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <WebhookIcon sx={{ fontSize: 32 }} />
          Webhooks WhatsApp
        </Typography>
        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
          Configuración y monitoreo de webhooks para eventos de WhatsApp Business API
        </Typography>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Eventos Totales
              </Typography>
              <Typography level="h3">{stats.totalEvents.toLocaleString()}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Tasa de Éxito
              </Typography>
              <Typography level="h3" sx={{ color: 'success.500' }}>
                {stats.successRate}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Tiempo Respuesta Promedio
              </Typography>
              <Typography level="h3" sx={{ color: 'primary.500' }}>
                {stats.avgResponseTime}ms
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Fallidos (24h)
              </Typography>
              <Typography level="h3" sx={{ color: 'danger.500' }}>
                {stats.failedLast24h}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Tabs defaultValue={0}>
        <TabList>
          <Tab>Configuración</Tab>
          <Tab>Eventos Recientes</Tab>
          <Tab>Documentación</Tab>
        </TabList>

        <TabPanel value={0}>
          <Grid container spacing={3}>
            <Grid xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography level="title-lg" sx={{ mb: 2 }}>
                    Configuración del Webhook
                  </Typography>

                  <Box sx={{ mb: 3 }}>
                    <Typography level="title-sm" sx={{ mb: 1 }}>
                      URL del Webhook
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Input
                        value={webhookUrl}
                        readOnly
                        sx={{ flexGrow: 1 }}
                      />
                      <IconButton onClick={() => handleCopy(webhookUrl)}>
                        <ContentCopyIcon />
                      </IconButton>
                    </Box>
                  </Box>

                  <Box sx={{ mb: 3 }}>
                    <Typography level="title-sm" sx={{ mb: 1 }}>
                      Verify Token
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Input
                        value={verifyToken}
                        readOnly
                        sx={{ flexGrow: 1 }}
                      />
                      <IconButton onClick={() => handleCopy(verifyToken)}>
                        <ContentCopyIcon />
                      </IconButton>
                    </Box>
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography level="title-sm" sx={{ mb: 1 }}>
                      Eventos Suscritos
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      <Chip size="sm" color="primary">messages</Chip>
                      <Chip size="sm" color="primary">message_status</Chip>
                      <Chip size="sm" color="primary">message_reactions</Chip>
                      <Chip size="sm" color="primary">contacts</Chip>
                    </Box>
                  </Box>

                  <Button fullWidth startDecorator={<RefreshIcon />}>
                    Probar Webhook
                  </Button>
                </CardContent>
              </Card>
            </Grid>

            <Grid xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography level="title-lg" sx={{ mb: 2 }}>
                    Estado del Webhook
                  </Typography>

                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography level="body-sm">Estado</Typography>
                      <Chip size="sm" color="success" startDecorator={<CheckCircleIcon />}>
                        Activo
                      </Chip>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography level="body-sm">Último Evento</Typography>
                      <Typography level="body-sm">Hace 2 minutos</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography level="body-sm">Verificación Meta</Typography>
                      <Chip size="sm" color="success">Verificado</Chip>
                    </Box>
                  </Box>

                  <Typography level="title-sm" sx={{ mb: 1, mt: 3 }}>
                    Configuración en Meta Dashboard
                  </Typography>
                  <Typography level="body-sm" sx={{ mb: 2 }}>
                    1. Ve a Meta Developer Console<br />
                    2. Selecciona tu App<br />
                    3. Ve a WhatsApp {'>'} Configuration<br />
                    4. Configura la URL del webhook<br />
                    5. Ingresa el verify token<br />
                    6. Suscríbete a los eventos necesarios
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={1}>
          <Card>
            <CardContent>
              <Typography level="title-md" sx={{ mb: 2 }}>
                Eventos Recientes
              </Typography>

              <Sheet sx={{ overflow: 'auto' }}>
                <Table>
                  <thead>
                    <tr>
                      <th style={{ width: 150 }}>Timestamp</th>
                      <th style={{ width: 150 }}>Evento</th>
                      <th style={{ width: 100 }}>Estado</th>
                      <th style={{ width: 100 }}>Código HTTP</th>
                      <th style={{ width: 120 }}>Tiempo Respuesta</th>
                      <th style={{ width: 80 }}>Reintentos</th>
                      <th style={{ width: 100, textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td>
                          <Typography level="body-xs">{event.timestamp}</Typography>
                        </td>
                        <td>
                          <Chip size="sm" variant="outlined">{event.event}</Chip>
                        </td>
                        <td>
                          <Chip
                            size="sm"
                            color={getStatusColor(event.status)}
                            startDecorator={
                              event.status === 'success' ? (
                                <CheckCircleIcon />
                              ) : (
                                <ErrorIcon />
                              )
                            }
                          >
                            {event.status}
                          </Chip>
                        </td>
                        <td>
                          <Typography level="body-sm" fontWeight="lg">
                            {event.responseCode}
                          </Typography>
                        </td>
                        <td>
                          <Typography level="body-sm">{event.responseTime}ms</Typography>
                        </td>
                        <td>
                          <Typography level="body-sm">{event.retries}</Typography>
                        </td>
                        <td>
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                            <IconButton size="sm" variant="plain">
                              <VisibilityIcon />
                            </IconButton>
                            <IconButton size="sm" variant="plain">
                              <RefreshIcon />
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
        </TabPanel>

        <TabPanel value={2}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                Documentación de Webhooks
              </Typography>

              <Typography level="title-md" sx={{ mb: 1, mt: 2 }}>
                Ejemplo de Payload - Mensaje Entrante
              </Typography>
              <Box sx={{
                display: 'block',
                p: 2,
                mb: 2,
                overflow: 'auto',
                bgcolor: 'background.level1',
                borderRadius: 'sm',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                border: '1px solid',
                borderColor: 'divider'
              }}>
                <pre style={{ margin: 0 }}>{JSON.stringify({
                  object: 'whatsapp_business_account',
                  entry: [{
                    id: 'WABA_ID',
                    changes: [{
                      value: {
                        messaging_product: 'whatsapp',
                        metadata: {
                          display_phone_number: '15550123456',
                          phone_number_id: 'PHONE_NUMBER_ID'
                        },
                        contacts: [{ profile: { name: 'Usuario' }, wa_id: '15559876543' }],
                        messages: [{
                          from: '15559876543',
                          id: 'wamid.xxxxx',
                          timestamp: '1697200000',
                          type: 'text',
                          text: { body: 'Hola' }
                        }]
                      },
                      field: 'messages'
                    }]
                  }]
                }, null, 2)}</pre>
              </Box>

              <Typography level="title-md" sx={{ mb: 1 }}>
                Ejemplo de Payload - Estado de Mensaje
              </Typography>
              <Box sx={{
                display: 'block',
                p: 2,
                overflow: 'auto',
                bgcolor: 'background.level1',
                borderRadius: 'sm',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                border: '1px solid',
                borderColor: 'divider'
              }}>
                <pre style={{ margin: 0 }}>{JSON.stringify({
                  object: 'whatsapp_business_account',
                  entry: [{
                    changes: [{
                      value: {
                        statuses: [{
                          id: 'wamid.xxxxx',
                          status: 'delivered',
                          timestamp: '1697200100',
                          recipient_id: '15559876543'
                        }]
                      },
                      field: 'messages'
                    }]
                  }]
                }, null, 2)}</pre>
              </Box>
            </CardContent>
          </Card>
        </TabPanel>
      </Tabs>
    </Box>
  )
}
