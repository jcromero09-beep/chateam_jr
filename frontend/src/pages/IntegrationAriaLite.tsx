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
} from '@mui/joy'
import {
  CloudSync as CloudSyncIcon,
  Save as SaveIcon,
  Sync as SyncIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material'

export default function IntegrationAriaLite() {
  const [config, setConfig] = useState({
    enabled: true,
    apiUrl: 'https://api.aria-lite.com/v1.8',
    apiKey: '••••••••••••••••',
    tenantId: 'TENANT_123',
    syncInterval: 10,
    syncCustomers: true,
    syncLeads: true,
    syncOpportunities: true,
    bidirectionalSync: true,
  })

  const stats = {
    lastSync: '2025-10-13 10:40:12',
    nextSync: '2025-10-13 10:50:00',
    totalRecords: 3234,
    syncedToday: 187,
    pending: 67,
    uptime: 100,
  }

  const handleSave = () => {
    console.log('Guardando configuración Aria Lite...', config)
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <CloudSyncIcon sx={{ fontSize: 32 }} />
            Integración Aria Lite CRM
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Sincronización bidireccional con Aria Lite CRM v1.8
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startDecorator={<SyncIcon />}>
            Sincronizar Ahora
          </Button>
          <Button startDecorator={<SaveIcon />} onClick={handleSave}>
            Guardar Cambios
          </Button>
        </Box>
      </Box>

      {/* Estado General */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography level="title-lg">Estado de Conexión</Typography>
                <Chip color="success" startDecorator={<CheckCircleIcon />}>
                  Activo - 100% Uptime
                </Chip>
              </Box>
              <Grid container spacing={2}>
                <Grid xs={6}>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Última Sincronización</Typography>
                  <Typography level="body-sm" fontWeight="lg">{stats.lastSync}</Typography>
                </Grid>
                <Grid xs={6}>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Total Registros</Typography>
                  <Typography level="body-sm" fontWeight="lg">{stats.totalRecords.toLocaleString()}</Typography>
                </Grid>
                <Grid xs={6}>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Sincronizados Hoy</Typography>
                  <Typography level="body-sm" fontWeight="lg" sx={{ color: 'success.500' }}>{stats.syncedToday}</Typography>
                </Grid>
                <Grid xs={6}>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Pendientes</Typography>
                  <Typography level="body-sm" fontWeight="lg" sx={{ color: 'warning.500' }}>{stats.pending}</Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography level="title-md" sx={{ mb: 2 }}>Módulos Sincronizados</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography level="body-sm">Clientes</Typography>
                  <Chip size="sm" color="success">1,245 registros</Chip>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography level="body-sm">Leads</Typography>
                  <Chip size="sm" color="success">876 registros</Chip>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography level="body-sm">Oportunidades</Typography>
                  <Chip size="sm" color="success">1,113 registros</Chip>
                </Box>
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
          <Tab>Mapeo de Campos</Tab>
          <Tab>Historial</Tab>
        </TabList>

        <TabPanel value={0}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 3 }}>
                Configuración de Conexión
              </Typography>

              <Grid container spacing={2}>
                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <FormLabel>Habilitar Integración</FormLabel>
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
                    <FormLabel>Tenant ID</FormLabel>
                    <Input
                      value={config.tenantId}
                      onChange={(e) => setConfig({ ...config, tenantId: e.target.value })}
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
                Módulos de Sincronización
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FormLabel>Sincronizar Clientes</FormLabel>
                    <Switch
                      checked={config.syncCustomers}
                      onChange={(e) => setConfig({ ...config, syncCustomers: e.target.checked })}
                    />
                  </Box>
                </FormControl>

                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FormLabel>Sincronizar Leads</FormLabel>
                    <Switch
                      checked={config.syncLeads}
                      onChange={(e) => setConfig({ ...config, syncLeads: e.target.checked })}
                    />
                  </Box>
                </FormControl>

                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FormLabel>Sincronizar Oportunidades</FormLabel>
                    <Switch
                      checked={config.syncOpportunities}
                      onChange={(e) => setConfig({ ...config, syncOpportunities: e.target.checked })}
                    />
                  </Box>
                </FormControl>

                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <FormLabel>Sincronización Bidireccional</FormLabel>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        Los cambios fluyen en ambas direcciones
                      </Typography>
                    </Box>
                    <Switch
                      checked={config.bidirectionalSync}
                      onChange={(e) => setConfig({ ...config, bidirectionalSync: e.target.checked })}
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
              <Typography level="title-lg" sx={{ mb: 2 }}>
                Mapeo de Campos
              </Typography>
              <Typography level="body-sm" sx={{ mb: 2, color: 'text.tertiary' }}>
                Configura cómo se mapean los campos entre JR Chateam y Aria Lite
              </Typography>

              <Sheet sx={{ overflow: 'auto' }}>
                <Table>
                  <thead>
                    <tr>
                      <th>Campo JR Chateam</th>
                      <th>Campo Aria Lite</th>
                      <th>Tipo</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>contact.name</td>
                      <td>customer.fullName</td>
                      <td>String</td>
                      <td><Chip size="sm" color="success">Activo</Chip></td>
                    </tr>
                    <tr>
                      <td>contact.email</td>
                      <td>customer.email</td>
                      <td>Email</td>
                      <td><Chip size="sm" color="success">Activo</Chip></td>
                    </tr>
                    <tr>
                      <td>contact.phone</td>
                      <td>customer.phoneNumber</td>
                      <td>Phone</td>
                      <td><Chip size="sm" color="success">Activo</Chip></td>
                    </tr>
                    <tr>
                      <td>contact.company</td>
                      <td>customer.companyName</td>
                      <td>String</td>
                      <td><Chip size="sm" color="success">Activo</Chip></td>
                    </tr>
                  </tbody>
                </Table>
              </Sheet>
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
                    <tr>
                      <td>2025-10-13 10:40:12</td>
                      <td>Clientes</td>
                      <td>87</td>
                      <td><Chip size="sm" color="success">success</Chip></td>
                      <td>12s</td>
                    </tr>
                    <tr>
                      <td>2025-10-13 10:30:45</td>
                      <td>Leads</td>
                      <td>56</td>
                      <td><Chip size="sm" color="success">success</Chip></td>
                      <td>8s</td>
                    </tr>
                    <tr>
                      <td>2025-10-13 10:20:23</td>
                      <td>Oportunidades</td>
                      <td>44</td>
                      <td><Chip size="sm" color="success">success</Chip></td>
                      <td>15s</td>
                    </tr>
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
