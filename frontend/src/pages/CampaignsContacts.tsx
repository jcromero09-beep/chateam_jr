import { Typography, Stack, Container, Card, CardContent, Box, Grid, Button } from '@mui/joy'
import { Contacts as ContactsIcon, Upload as UploadIcon } from '@mui/icons-material'

export default function CampaignsContacts() {
  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <ContactsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Contactos de Campañas</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Gestión de listas de contactos para campañas</Typography>
            </Box>
          </Stack>
          <Button startDecorator={<UploadIcon />} color="primary">Importar Contactos</Button>
        </Stack>
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}><Card><CardContent><Typography level="body-sm" sx={{ mb: 1 }}>Total Contactos</Typography><Typography level="h2">12,543</Typography></CardContent></Card></Grid>
          <Grid xs={12} sm={6} md={3}><Card><CardContent><Typography level="body-sm" sx={{ mb: 1 }}>Activos</Typography><Typography level="h2" sx={{ color: 'success.main' }}>10,234</Typography></CardContent></Card></Grid>
          <Grid xs={12} sm={6} md={3}><Card><CardContent><Typography level="body-sm" sx={{ mb: 1 }}>Listas</Typography><Typography level="h2">24</Typography></CardContent></Card></Grid>
          <Grid xs={12} sm={6} md={3}><Card><CardContent><Typography level="body-sm" sx={{ mb: 1 }}>Importados Hoy</Typography><Typography level="h2">456</Typography></CardContent></Card></Grid>
        </Grid>
      </Stack>
    </Container>
  )
}
