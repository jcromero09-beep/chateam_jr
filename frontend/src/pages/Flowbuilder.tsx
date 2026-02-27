import { Typography, Stack, Container, Card, CardContent, Box, Grid, Button } from '@mui/joy'
import { AccountTree as FlowbuilderIcon, Add as AddIcon } from '@mui/icons-material'

export default function Flowbuilder() {
  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <FlowbuilderIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Flowbuilder</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Constructor visual de flujos automatizados</Typography>
            </Box>
          </Stack>
          <Button startDecorator={<AddIcon />} color="primary">Nuevo Flujo</Button>
        </Stack>
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}><Card><CardContent><Typography level="body-sm" sx={{ mb: 1 }}>Flujos Activos</Typography><Typography level="h2">12</Typography></CardContent></Card></Grid>
          <Grid xs={12} sm={6} md={3}><Card><CardContent><Typography level="body-sm" sx={{ mb: 1 }}>Ejecuciones Hoy</Typography><Typography level="h2">1,245</Typography></CardContent></Card></Grid>
          <Grid xs={12} sm={6} md={3}><Card><CardContent><Typography level="body-sm" sx={{ mb: 1 }}>Tasa de Éxito</Typography><Typography level="h2" sx={{ color: 'success.main' }}>94.2%</Typography></CardContent></Card></Grid>
          <Grid xs={12} sm={6} md={3}><Card><CardContent><Typography level="body-sm" sx={{ mb: 1 }}>Total Flujos</Typography><Typography level="h2">28</Typography></CardContent></Card></Grid>
        </Grid>
        <Card sx={{ height: 500 }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Box sx={{ textAlign: 'center' }}>
              <FlowbuilderIcon sx={{ fontSize: 64, color: 'text.tertiary', mb: 2 }} />
              <Typography level="h4" sx={{ mb: 1 }}>Constructor de Flujos</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Editor visual drag-and-drop para flujos</Typography>
            </Box>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  )
}
