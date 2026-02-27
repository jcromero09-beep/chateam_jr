import { Typography, Stack, Container, Card, CardContent, Box, Grid, Button } from '@mui/joy'
import { IntegrationInstructions as IntegrationsIcon, Add as AddIcon } from '@mui/icons-material'

export default function QueueIntegrations() {
  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <IntegrationsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box><Typography level="h2">Integraciones de Cola</Typography><Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Gestión de integraciones con colas</Typography></Box>
          </Stack>
          <Button startDecorator={<AddIcon />} color="primary">Nueva Integración</Button>
        </Stack>
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}><Card><CardContent><Typography level="body-sm" sx={{ mb: 1 }}>Integraciones</Typography><Typography level="h2">8</Typography></CardContent></Card></Grid>
          <Grid xs={12} sm={6} md={3}><Card><CardContent><Typography level="body-sm" sx={{ mb: 1 }}>Activas</Typography><Typography level="h2" sx={{ color: 'success.main' }}>6</Typography></CardContent></Card></Grid>
          <Grid xs={12} sm={6} md={3}><Card><CardContent><Typography level="body-sm" sx={{ mb: 1 }}>Eventos Hoy</Typography><Typography level="h2">3.2k</Typography></CardContent></Card></Grid>
          <Grid xs={12} sm={6} md={3}><Card><CardContent><Typography level="body-sm" sx={{ mb: 1 }}>Tasa de Éxito</Typography><Typography level="h2">99.1%</Typography></CardContent></Card></Grid>
        </Grid>
      </Stack>
    </Container>
  )
}
