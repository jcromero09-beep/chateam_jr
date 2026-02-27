import { Typography, Stack, Container, Card, CardContent, Box, Button } from '@mui/joy'
import { Description as TermsIcon, Edit as EditIcon } from '@mui/icons-material'

export default function Terms() {
  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <TermsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Términos y Condiciones</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>Gestión de términos y políticas</Typography>
            </Box>
          </Stack>
          <Button startDecorator={<EditIcon />} color="primary">Editar</Button>
        </Stack>
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography level="h4">Términos del Servicio</Typography>
              <Typography level="body-sm">
                Última actualización: 10 de Enero, 2025
              </Typography>
              <Box sx={{ p: 2, bgcolor: 'background.level2', borderRadius: 'sm', minHeight: 400 }}>
                <Typography level="body-sm">
                  Aquí se mostrarían los términos y condiciones completos del servicio...
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  )
}
