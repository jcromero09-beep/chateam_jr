import {
  Container,
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Grid,
  Button,
} from '@mui/joy'
import {
  Analytics as AnalyticsIcon,
  Info as InfoIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'

export default function EmailMarketingAnalytics() {
  const navigate = useNavigate()

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 4 }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 'md',
            bgcolor: 'primary.softBg',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AnalyticsIcon sx={{ color: 'primary.plainColor', fontSize: 24 }} />
        </Box>
        <Box>
          <Typography level="h3" sx={{ fontWeight: 700 }}>
            Analytics de Email
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
            Reportes y metricas de campanas de email
          </Typography>
        </Box>
      </Stack>

      {/* ------------------------------------------------------------------ */}
      {/* Info card                                                            */}
      {/* ------------------------------------------------------------------ */}
      <Grid container spacing={2} justifyContent="center">
        <Grid xs={12}>
          <Card
            variant="outlined"
            sx={{
              borderRadius: 'lg',
              boxShadow: 'sm',
            }}
          >
            <CardContent>
              <Stack spacing={2.5} alignItems="flex-start">
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <InfoIcon sx={{ color: 'primary.plainColor', fontSize: 22 }} />
                  <Typography level="title-md" sx={{ fontWeight: 600 }}>
                    Proximamente disponible
                  </Typography>
                </Stack>

                <Typography level="body-md" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                  Los analytics detallados de campanas de email estaran disponibles proximamente.
                  Por ahora, puedes ver el estado de tus campanas en el Dashboard.
                </Typography>

                <Box
                  sx={{
                    width: '100%',
                    p: 2,
                    bgcolor: 'neutral.softBg',
                    borderRadius: 'md',
                    border: '1px solid',
                    borderColor: 'neutral.outlinedBorder',
                  }}
                >
                  <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                    Funcionalidades previstas:
                  </Typography>
                  <Stack spacing={0.75} sx={{ mt: 1 }}>
                    {[
                      'Tasa de apertura y clicks por campana',
                      'Evolucion de suscriptores y bajas',
                      'Comparativa entre campanas',
                      'Rendimiento por hora y dia de la semana',
                      'Reportes exportables en CSV y PDF',
                    ].map((item) => (
                      <Stack key={item} direction="row" spacing={1} alignItems="center">
                        <Box
                          sx={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            bgcolor: 'primary.plainColor',
                            flexShrink: 0,
                          }}
                        />
                        <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                          {item}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>

                <Button
                  variant="solid"
                  color="primary"
                  size="sm"
                  onClick={() => navigate('/email-marketing')}
                >
                  Volver al Dashboard
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  )
}
