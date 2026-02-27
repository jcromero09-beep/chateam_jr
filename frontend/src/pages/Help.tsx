import { Box, Typography, Sheet, Card, List, ListItem, ListItemDecorator, Divider } from '@mui/joy'
import {
  HelpOutline as HelpIcon,
  QuestionAnswer as QAIcon,
  Description as DocsIcon,
  ContactSupport as SupportIcon,
  VideoLibrary as VideoIcon,
  School as TutorialIcon,
} from '@mui/icons-material'

export default function Help() {
  const helpSections = [
    {
      title: 'Preguntas Frecuentes',
      icon: <QAIcon color="primary" />,
      description: 'Respuestas a las preguntas más comunes sobre JR Chateam',
      items: [
        '¿Cómo crear una campaña de marketing?',
        '¿Cómo gestionar tickets de soporte?',
        '¿Cómo integrar WhatsApp Business?',
        '¿Cómo configurar permisos de usuarios?',
        '¿Cómo generar reportes de analytics?',
      ],
    },
    {
      title: 'Documentación',
      icon: <DocsIcon color="success" />,
      description: 'Guías completas y documentación técnica del sistema',
      items: [
        'Manual de Usuario - Guía completa',
        'API Documentation - Endpoints disponibles',
        'Guía de Administración - Configuración avanzada',
        'Best Practices - Mejores prácticas de uso',
        'Changelog - Novedades de la versión 6.0.0',
      ],
    },
    {
      title: 'Video Tutoriales',
      icon: <VideoIcon color="warning" />,
      description: 'Tutoriales en video paso a paso',
      items: [
        'Introducción a JR Chateam (5 min)',
        'Configuración inicial del sistema (10 min)',
        'Gestión de campañas de marketing (15 min)',
        'Uso del CRM y gestión de leads (12 min)',
        'Analytics y reportes avanzados (8 min)',
      ],
    },
    {
      title: 'Capacitación',
      icon: <TutorialIcon color="info" />,
      description: 'Cursos y capacitaciones para usuarios',
      items: [
        'Curso Básico - Operaciones diarias',
        'Curso Intermedio - Funcionalidades avanzadas',
        'Curso Avanzado - Administración y configuración',
        'Webinars mensuales - Nuevas funcionalidades',
        'Certificación de usuario avanzado',
      ],
    },
  ]

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <HelpIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography level="h2">Centro de Ayuda</Typography>
        </Box>
        <Typography level="body-md" sx={{ color: 'text.secondary' }}>
          Encuentra respuestas, documentación y recursos para aprovechar al máximo JR Chateam
        </Typography>
      </Box>

      {/* Quick Support Contact */}
      <Card
        variant="soft"
        color="primary"
        sx={{
          mb: 4,
          p: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 3,
        }}
      >
        <SupportIcon sx={{ fontSize: 48 }} />
        <Box sx={{ flex: 1 }}>
          <Typography level="title-lg" sx={{ mb: 0.5 }}>
            ¿Necesitas ayuda inmediata?
          </Typography>
          <Typography level="body-sm">
            Nuestro equipo de soporte está disponible de lunes a viernes de 9:00 AM a 6:00 PM
          </Typography>
          <Typography level="body-sm" sx={{ mt: 1, fontWeight: 'bold' }}>
            Email: soporte@jrchateam.com | WhatsApp: +1 (555) 123-4567
          </Typography>
        </Box>
      </Card>

      {/* Help Sections Grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'repeat(2, 1fr)',
          },
          gap: 3,
        }}
      >
        {helpSections.map((section, index) => (
          <Sheet
            key={index}
            variant="outlined"
            sx={{
              p: 3,
              borderRadius: 'md',
              transition: 'all 0.2s',
              '&:hover': {
                boxShadow: 'md',
                transform: 'translateY(-4px)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              {section.icon}
              <Typography level="title-lg">{section.title}</Typography>
            </Box>
            <Typography level="body-sm" sx={{ color: 'text.secondary', mb: 2 }}>
              {section.description}
            </Typography>
            <Divider sx={{ my: 2 }} />
            <List size="sm">
              {section.items.map((item, idx) => (
                <ListItem key={idx}>
                  <ListItemDecorator>•</ListItemDecorator>
                  {item}
                </ListItem>
              ))}
            </List>
          </Sheet>
        ))}
      </Box>

      {/* Additional Resources */}
      <Box sx={{ mt: 4 }}>
        <Typography level="title-md" sx={{ mb: 2 }}>
          Recursos Adicionales
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(3, 1fr)',
            },
            gap: 2,
          }}
        >
          <Card variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
            <Typography level="title-sm" sx={{ mb: 0.5 }}>
              Base de Conocimiento
            </Typography>
            <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
              +150 artículos disponibles
            </Typography>
          </Card>
          <Card variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
            <Typography level="title-sm" sx={{ mb: 0.5 }}>
              Comunidad
            </Typography>
            <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
              Foro con +5,000 usuarios
            </Typography>
          </Card>
          <Card variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
            <Typography level="title-sm" sx={{ mb: 0.5 }}>
              Actualizaciones
            </Typography>
            <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
              Novedades v6.0.0
            </Typography>
          </Card>
        </Box>
      </Box>
    </Box>
  )
}
