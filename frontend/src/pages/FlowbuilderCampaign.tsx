import { Typography, Stack, Container, Card, CardContent, Box } from '@mui/joy'
import { Campaign as CampaignIcon } from '@mui/icons-material'

export default function FlowbuilderCampaign() {
  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        <Stack direction="row" spacing={2} alignItems="center">
          <CampaignIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography level="h2">Flujo de Campaña</Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Constructor de flujos para campañas automatizadas</Typography>
          </Box>
        </Stack>
        <Card sx={{ height: 500 }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Box sx={{ textAlign: 'center' }}>
              <CampaignIcon sx={{ fontSize: 64, color: 'text.tertiary', mb: 2 }} />
              <Typography level="h4">Editor de Flujo de Campaña</Typography>
            </Box>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  )
}
