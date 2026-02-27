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
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Alert,
} from '@mui/joy'
import {
  LocalShipping as ShippingIcon,
  Save as SaveIcon,
  Sync as SyncIcon,
} from '@mui/icons-material'

export default function IntegrationSmartTrack() {
  const [config, setConfig] = useState({
    enabled: true,
    apiUrl: 'https://api.smarttrack.com/v3.1',
    apiKey: '••••••••••••••••',
    accountId: 'ST_789456',
    syncInterval: 20,
    trackShipments: true,
    trackDeliveries: true,
    sendNotifications: true,
  })

  const handleSave = () => {
    console.log('Guardando configuración SmartTrack...', config)
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <ShippingIcon sx={{ fontSize: 32 }} />
            Integración SmartTrack
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Seguimiento de envíos y logística v3.1
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

      <Alert color="warning" sx={{ mb: 3 }}>
        Sincronización en progreso - Alto volumen de datos detectado. Tiempo estimado: 5 minutos
      </Alert>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>Envíos Activos</Typography>
              <Typography level="h3">456</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>Entregas Hoy</Typography>
              <Typography level="h3">89</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>En Tránsito</Typography>
              <Typography level="h3">234</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>Pendientes</Typography>
              <Typography level="h3">89</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Tabs defaultValue={0}>
        <TabList>
          <Tab>Configuración</Tab>
          <Tab>Notificaciones</Tab>
          <Tab>Tracking</Tab>
        </TabList>

        <TabPanel value={0}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 3 }}>Configuración de Conexión</Typography>
              <Grid container spacing={2}>
                <Grid xs={12}>
                  <FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <FormLabel>Habilitar Integración</FormLabel>
                      <Switch checked={config.enabled} onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} />
                    </Box>
                  </FormControl>
                </Grid>
                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>URL de API</FormLabel>
                    <Input value={config.apiUrl} onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })} />
                  </FormControl>
                </Grid>
                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>API Key</FormLabel>
                    <Input type="password" value={config.apiKey} onChange={(e) => setConfig({ ...config, apiKey: e.target.value })} />
                  </FormControl>
                </Grid>
                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Account ID</FormLabel>
                    <Input value={config.accountId} onChange={(e) => setConfig({ ...config, accountId: e.target.value })} />
                  </FormControl>
                </Grid>
                <Grid xs={12} md={6}>
                  <FormControl>
                    <FormLabel>Intervalo de Sync (min)</FormLabel>
                    <Input type="number" value={config.syncInterval} onChange={(e) => setConfig({ ...config, syncInterval: parseInt(e.target.value) })} />
                  </FormControl>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value={1}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 3 }}>Configuración de Notificaciones</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FormLabel>Notificar Cambios de Estado</FormLabel>
                    <Switch checked={config.sendNotifications} onChange={(e) => setConfig({ ...config, sendNotifications: e.target.checked })} />
                  </Box>
                </FormControl>
                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FormLabel>Trackear Envíos</FormLabel>
                    <Switch checked={config.trackShipments} onChange={(e) => setConfig({ ...config, trackShipments: e.target.checked })} />
                  </Box>
                </FormControl>
                <FormControl>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FormLabel>Trackear Entregas</FormLabel>
                    <Switch checked={config.trackDeliveries} onChange={(e) => setConfig({ ...config, trackDeliveries: e.target.checked })} />
                  </Box>
                </FormControl>
              </Box>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value={2}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>Tracking en Tiempo Real</Typography>
              <Alert color="primary">
                El sistema está monitoreando 456 envíos activos. Las actualizaciones se sincronizan cada 20 minutos.
              </Alert>
            </CardContent>
          </Card>
        </TabPanel>
      </Tabs>
    </Box>
  )
}
