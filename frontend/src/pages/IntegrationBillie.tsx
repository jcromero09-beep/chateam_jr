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
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Table,
  Sheet,
  Divider,
  Alert,
} from '@mui/joy'
import {
  Business as BusinessIcon,
  Save as SaveIcon,
  Sync as SyncIcon,
  CheckCircle as CheckCircleIcon,
  Settings as SettingsIcon,
  Timeline as TimelineIcon,
} from '@mui/icons-material'

interface SyncRecord {
  id: number
  timestamp: string
  type: string
  records: number
  status: 'success' | 'error' | 'warning'
  duration: number
}

export default function IntegrationBillie() {
  const [config, setConfig] = useState({
    enabled: true,
    apiUrl: 'https://api.billie.com/v2.5',
    apiKey: '••••••••••••••••',
    companyCode: 'DEMO001',
    syncInterval: 15,
    syncContacts: true,
    syncInvoices: true,
    syncProducts: true,
    syncOrders: true,
    bidirectionalSync: true,
    autoCreateRecords: false,
    webhookUrl: 'https://api.jrchateam.com/webhooks/billie',
    webhookSecret: '••••••••••••••••',
  })

  const stats = {
    lastSync: '2025-10-13 10:45:23',
    nextSync: '2025-10-13 11:00:00',
    totalRecords: 5482,
    syncedToday: 245,
    pending: 45,
    errors: 2,
    uptime: 99.8,
  }

  const syncHistory: SyncRecord[] = [
    { id: 1, timestamp: '2025-10-13 10:45:23', type: 'Contactos', records: 245, status: 'success', duration: 18 },
    { id: 2, timestamp: '2025-10-13 10:30:15', type: 'Facturas', records: 89, status: 'success', duration: 24 },
    { id: 3, timestamp: '2025-10-13 10:15:47', type: 'Productos', records: 156, status: 'success', duration: 12 },
    { id: 4, timestamp: '2025-10-13 10:00:12', type: 'Órdenes', records: 67, status: 'warning', duration: 32 },
    { id: 5, timestamp: '2025-10-13 09:45:33', type: 'Contactos', records: 0, status: 'error', duration: 0 },
  ]

  const handleSave = () => {
    console.log('Guardando configuración Billie...', config)
  }

  const handleSyncNow = () => {
    console.log('Iniciando sincronización manual...')
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <BusinessIcon sx={{ fontSize: 32 }} />
            Integración Billie ERP
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Sincronización con sistema ERP Billie v2.5
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startDecorator={<SyncIcon />} onClick={handleSyncNow}>
            Sincronizar Ahora
          </Button>
          <Button startDecorator={<SaveIcon />} onClick={handleSave}>
            Guardar Cambios
          </Button>
        </Box>
      </Box>

      {/* Estado General */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} md={8}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography level="title-lg">Estado de Conexión</Typography>
                <Chip color="success" startDecorator={<CheckCircleIcon />}>
                  Activo
                </Chip>
              </Box>
              <Grid container spacing={2}>
                <Grid xs={6} sm={4}>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Última Sincronización</Typography>
                  <Typography level="body-sm" fontWeight="lg">{stats.lastSync}</Typography>
                </Grid>
                <Grid xs={6} sm={4}>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Próxima Sincronización</Typography>
                  <Typography level="body-sm" fontWeight="lg">{stats.nextSync}</Typography>
                </Grid>
                <Grid xs={6} sm={4}>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Total Registros</Typography>
                  <Typography level="body-sm" fontWeight="lg">{stats.totalRecords.toLocaleString()}</Typography>
                </Grid>
                <Grid xs={6} sm={4}>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Sincronizados Hoy</Typography>
                  <Typography level="body-sm" fontWeight="lg" sx={{ color: 'success.500' }}>{stats.syncedToday}</Typography>
                </Grid>
                <Grid xs={6} sm={4}>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Pendientes</Typography>
                  <Typography level="body-sm" fontWeight="lg" sx={{ color: 'warning.500' }}>{stats.pending}</Typography>
                </Grid>
                <Grid xs={6} sm={4}>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Uptime</Typography>
                  <Typography level="body-sm" fontWeight="lg" sx={{ color: 'success.500' }}>{stats.uptime}%</Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography level="title-md" sx={{ mb: 2 }}>Acciones Rápidas</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button variant="outlined" size="sm" fullWidth startDecorator={<SyncIcon />}>
                  Sincronizar Contactos
                </Button>
                <Button variant="outlined" size="sm" fullWidth startDecorator={<SyncIcon />}>
                  Sincronizar Facturas
                </Button>
                <Button variant="outlined" size="sm" fullWidth startDecorator={<TimelineIcon />}>
                  Ver Logs Completos
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Configuración */}
      <Tabs defaultValue={0}>
        <TabList>
          <Tab>Configuración General</Tab>
          <Tab>Sincronización</Tab>
          <Tab>Webhooks</Tab>
          <Tab>Historial</Tab>
        </TabList>

        <TabPanel value={0}>
          <Card>
            <CardContent>
              <Typography level="title-lg" startDecorator={<SettingsIcon />} sx={{ mb: 3 }}>
                Configuración de Conexión
              </Typography>

              <Grid container spacing={2}>
                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <FormLabel>Habilitar Integración</FormLabel>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          Activar o desactivar la sincronización con Billie
                        </Typography>
                      </Box>
                      <Switch
                        checked={config.enabled}
                        onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                      />
                    </Box>
                  </FormControl>
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>URL de API</FormLabel>
                    <Input
                      value={config.apiUrl}
                      onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>API Key</FormLabel>
                    <Input
                      type="password"
                      value={config.apiKey}
                      onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Código de Empresa</FormLabel>
                    <Input
                      value={config.companyCode}
                      onChange={(e) => setConfig({ ...config, companyCode: e.target.value })}
                    />
                  </FormControl>
                </Grid>

                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Intervalo de Sincronización (minutos)</FormLabel>
                    <Input
                      type="number"
                      value={config.syncInterval}
                      onChange={(e) => setConfig({ ...config, syncInterval: parseInt(e.target.value) })}
                      slotProps={{ input: { min: 5, max: 60 } }}
                    />
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value={1}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 3 }}>
                Configuración de Sincronización
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FormLabel>Sincronizar Contactos</FormLabel>
                    <Switch
                      checked={config.syncContacts}
                      onChange={(e) => setConfig({ ...config, syncContacts: e.target.checked })}
                    />
                  </Box>
                </FormControl>

                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FormLabel>Sincronizar Facturas</FormLabel>
                    <Switch
                      checked={config.syncInvoices}
                      onChange={(e) => setConfig({ ...config, syncInvoices: e.target.checked })}
                    />
                  </Box>
                </FormControl>

                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FormLabel>Sincronizar Productos</FormLabel>
                    <Switch
                      checked={config.syncProducts}
                      onChange={(e) => setConfig({ ...config, syncProducts: e.target.checked })}
                    />
                  </Box>
                </FormControl>

                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FormLabel>Sincronizar Órdenes</FormLabel>
                    <Switch
                      checked={config.syncOrders}
                      onChange={(e) => setConfig({ ...config, syncOrders: e.target.checked })}
                    />
                  </Box>
                </FormControl>

                <Divider sx={{ my: 2 }} />

                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <FormLabel>Sincronización Bidireccional</FormLabel>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        Permite que los cambios fluyan en ambas direcciones
                      </Typography>
                    </Box>
                    <Switch
                      checked={config.bidirectionalSync}
                      onChange={(e) => setConfig({ ...config, bidirectionalSync: e.target.checked })}
                    />
                  </Box>
                </FormControl>

                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <FormLabel>Crear Registros Automáticamente</FormLabel>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        Crea nuevos registros si no existen en el destino
                      </Typography>
                    </Box>
                    <Switch
                      checked={config.autoCreateRecords}
                      onChange={(e) => setConfig({ ...config, autoCreateRecords: e.target.checked })}
                    />
                  </Box>
                </FormControl>
              </Box>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value={2}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 3 }}>
                Configuración de Webhooks
              </Typography>

              <Alert color="primary" sx={{ mb: 3 }}>
                Los webhooks permiten recibir notificaciones en tiempo real cuando ocurren cambios en Billie
              </Alert>

              <Grid container spacing={2}>
                <Grid xs={12}>
                  <FormControl>
                    <FormLabel>URL del Webhook</FormLabel>
                    <Input
                      value={config.webhookUrl}
                      onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
                    />
                    <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                      Billie enviará notificaciones a esta URL
                    </Typography>
                  </FormControl>
                </Grid>

                <Grid xs={12}>
                  <FormControl>
                    <FormLabel>Webhook Secret</FormLabel>
                    <Input
                      type="password"
                      value={config.webhookSecret}
                      onChange={(e) => setConfig({ ...config, webhookSecret: e.target.value })}
                    />
                    <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                      Usado para verificar la autenticidad de las notificaciones
                    </Typography>
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value={3}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                Historial de Sincronización
              </Typography>

              <Sheet sx={{ overflow: 'auto' }}>
                <Table>
                  <thead>
                    <tr>
                      <th>Fecha y Hora</th>
                      <th>Tipo</th>
                      <th>Registros</th>
                      <th>Estado</th>
                      <th>Duración</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncHistory.map((record) => (
                      <tr key={record.id}>
                        <td>{record.timestamp}</td>
                        <td>{record.type}</td>
                        <td>{record.records}</td>
                        <td>
                          <Chip
                            size="sm"
                            color={
                              record.status === 'success'
                                ? 'success'
                                : record.status === 'error'
                                ? 'danger'
                                : 'warning'
                            }
                          >
                            {record.status}
                          </Chip>
                        </td>
                        <td>{record.duration}s</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Sheet>
            </CardContent>
          </Card>
        </TabPanel>
      </Tabs>
    </Box>
  )
}
