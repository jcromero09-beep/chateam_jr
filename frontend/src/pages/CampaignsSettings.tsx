import { Typography, Stack, Container, Card, CardContent, Box, Switch, FormControl, FormLabel, Input, Select, Option } from '@mui/joy'
import { Settings as SettingsIcon } from '@mui/icons-material'

export default function CampaignsSettings() {
  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        <Stack direction="row" spacing={2} alignItems="center">
          <SettingsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography level="h2">Configuración de Campañas</Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Ajustes generales de campañas</Typography>
          </Box>
        </Stack>
        <Card>
          <CardContent>
            <Stack spacing={3}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box><Typography level="body-sm" fontWeight="bold">Envío Automático</Typography><Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Activar envío automático de campañas</Typography></Box>
                <Switch defaultChecked />
              </Box>
              <FormControl><FormLabel>Horario de Envío</FormLabel><Select defaultValue="morning"><Option value="morning">Mañana (9:00 - 12:00)</Option><Option value="afternoon">Tarde (14:00 - 18:00)</Option></Select></FormControl>
              <FormControl><FormLabel>Límite Diario de Envíos</FormLabel><Input type="number" defaultValue="1000" /></FormControl>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  )
}
