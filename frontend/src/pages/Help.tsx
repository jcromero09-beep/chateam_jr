import type { ReactNode } from 'react'
import {
  Question,
  ChatCircleDots,
  FileText,
  Headset,
  VideoCamera,
  GraduationCap,
} from '@phosphor-icons/react'

interface HelpSection {
  title: string
  icon: ReactNode
  description: string
  items: string[]
}

export default function Help() {
  const helpSections: HelpSection[] = [
    {
      title: 'Preguntas Frecuentes',
      icon: <ChatCircleDots className="size-6 text-brand-teal" weight="fill" aria-hidden />,
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
      icon: <FileText className="size-6 text-success-text" weight="fill" aria-hidden />,
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
      icon: <VideoCamera className="size-6 text-warning-text" weight="fill" aria-hidden />,
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
      icon: <GraduationCap className="size-6 text-brand-cyan" weight="fill" aria-hidden />,
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

  const resources = [
    { title: 'Base de Conocimiento', description: '+150 artículos disponibles' },
    { title: 'Comunidad', description: 'Foro con +5,000 usuarios' },
    { title: 'Actualizaciones', description: 'Novedades v6.0.0' },
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <Question className="size-6" weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Centro de Ayuda
            </h1>
            <p className="text-sm text-muted-foreground">
              Encuentra respuestas, documentación y recursos para aprovechar al máximo JR Chateam
            </p>
          </div>
        </div>

        {/* Quick Support Contact */}
        <div className="flex items-center gap-4 rounded-xl border border-border bg-accent p-6 text-accent-foreground">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <Headset className="size-7" weight="fill" aria-hidden />
          </span>
          <div className="flex-1">
            <h2 className="mb-1 text-lg font-semibold text-foreground">
              ¿Necesitas ayuda inmediata?
            </h2>
            <p className="text-sm text-muted-foreground">
              Nuestro equipo de soporte está disponible de lunes a viernes de 9:00 AM a 6:00 PM
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              Email: soporte@jrchateam.com | WhatsApp: Disponible en horario laboral
            </p>
          </div>
        </div>

        {/* Help Sections Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {helpSections.map((section, index) => (
            <div
              key={index}
              className="rounded-xl border border-border bg-card p-6 shadow-sm shadow-black/[0.02] transition-all hover:-translate-y-1 hover:shadow-md"
            >
              <div className="mb-2 flex items-center gap-2">
                {section.icon}
                <h3 className="text-lg font-semibold text-foreground">{section.title}</h3>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">{section.description}</p>
              <div className="my-3 border-t border-border" />
              <ul className="space-y-1.5">
                {section.items.map((item, idx) => (
                  <li key={idx} className="flex gap-2 text-sm text-foreground">
                    <span className="text-muted-foreground" aria-hidden>
                      •
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Additional Resources */}
        <div>
          <h2 className="mb-3 text-base font-semibold text-foreground">Recursos Adicionales</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {resources.map((resource, index) => (
              <div
                key={index}
                className="rounded-xl border border-border bg-card p-4 text-center shadow-sm shadow-black/[0.02]"
              >
                <p className="mb-0.5 text-sm font-semibold text-foreground">{resource.title}</p>
                <p className="text-xs text-muted-foreground">{resource.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
