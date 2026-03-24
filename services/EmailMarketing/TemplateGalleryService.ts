/**
 * TemplateGalleryService
 *
 * Servicio de galeria de templates predefinidos de email.
 * Proporciona templates responsive listos para usar en campanas de email.
 *
 * Categorias: newsletter, promotional, welcome, transactional, event, ecommerce
 * Minimo 2 templates por categoria = 12 templates.
 *
 * Cada template incluye:
 * - HTML responsive (max-width: 600px)
 * - Estilos inline
 * - Variables: {{nombre}}, {{empresa}}, {{enlace_accion}}, {{enlace_unsub}}
 * - Colores ChatEAM: primary #3b82f6, dark #1e293b, success #52b788
 */

import EmailTemplate from "../../models/EmailMarketing/EmailTemplate";
import logger from "../../utils/logger";

// ============================================================================
// TIPOS
// ============================================================================

interface PresetTemplate {
  name: string;
  category: string;
  description: string;
  htmlContent: string;
  previewImage: string;
}

// ============================================================================
// TEMPLATES PREDEFINIDOS
// ============================================================================

function buildEmailWrapper(
  headerBg: string,
  headerContent: string,
  bodyContent: string,
  footerExtra?: string
): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Email</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f9fa;font-family:'Segoe UI',Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f8f9fa;">
<tr>
<td align="center" style="padding:24px 10px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

<!-- Header -->
<tr>
<td style="background-color:${headerBg};padding:32px 40px;text-align:center;">
${headerContent}
</td>
</tr>

<!-- Body -->
<tr>
<td style="padding:36px 40px;">
${bodyContent}
</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color:#f1f5f9;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0;">
${footerExtra || ""}
<p style="color:#64748b;font-size:13px;line-height:1.5;margin:8px 0;">
{{empresa}}
</p>
<p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">
<a href="{{enlace_unsub}}" style="color:#94a3b8;text-decoration:underline;">Desuscribirse</a> | <a href="{{enlace_accion}}" style="color:#94a3b8;text-decoration:underline;">Ver en navegador</a>
</p>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;
}

function ctaButton(text: string, bgColor: string = "#3b82f6"): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:24px auto;">
<tr>
<td style="background-color:${bgColor};border-radius:8px;">
<a href="{{enlace_accion}}" style="display:inline-block;padding:14px 36px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;letter-spacing:0.3px;">
${text}
</a>
</td>
</tr>
</table>`;
}

const PRESET_TEMPLATES: PresetTemplate[] = [
  // ============================
  // NEWSLETTER (2 templates)
  // ============================
  {
    name: "Newsletter Semanal",
    category: "newsletter",
    description: "Boletin semanal con resumen de noticias y articulos destacados. Ideal para mantener informada a tu audiencia.",
    previewImage: "/email-templates/previews/newsletter-weekly.png",
    htmlContent: buildEmailWrapper(
      "#1e293b",
      `<h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:700;">Novedades de la Semana</h1>
<p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">Tu resumen semanal de {{empresa}}</p>`,
      `<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 20px;">
Hola {{nombre}},
</p>
<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 24px;">
Te traemos las novedades mas importantes de esta semana. Mantente al dia con las ultimas actualizaciones y recursos.
</p>

<!-- Articulo 1 -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:20px;border-left:4px solid #3b82f6;padding-left:16px;">
<tr>
<td>
<h3 style="color:#1e293b;font-size:18px;margin:0 0 6px;font-weight:600;">Articulo Destacado</h3>
<p style="color:#64748b;font-size:14px;line-height:1.5;margin:0;">
Descripcion breve del primer articulo o noticia relevante de esta semana.
</p>
</td>
</tr>
</table>

<!-- Articulo 2 -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:20px;border-left:4px solid #52b788;padding-left:16px;">
<tr>
<td>
<h3 style="color:#1e293b;font-size:18px;margin:0 0 6px;font-weight:600;">Segunda Noticia</h3>
<p style="color:#64748b;font-size:14px;line-height:1.5;margin:0;">
Descripcion breve del segundo articulo o noticia de la semana.
</p>
</td>
</tr>
</table>

<!-- Articulo 3 -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;border-left:4px solid #f3a43b;padding-left:16px;">
<tr>
<td>
<h3 style="color:#1e293b;font-size:18px;margin:0 0 6px;font-weight:600;">Tercera Noticia</h3>
<p style="color:#64748b;font-size:14px;line-height:1.5;margin:0;">
Descripcion breve del tercer articulo o noticia importante.
</p>
</td>
</tr>
</table>

${ctaButton("Leer todo el boletin")}`
    )
  },
  {
    name: "Newsletter Minimalista",
    category: "newsletter",
    description: "Newsletter limpio y minimalista con enfoque en contenido de texto. Perfecto para actualizaciones rapidas.",
    previewImage: "/email-templates/previews/newsletter-minimal.png",
    htmlContent: buildEmailWrapper(
      "#3b82f6",
      `<h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:600;">Actualizaciones</h1>`,
      `<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 16px;">
Hola {{nombre}},
</p>
<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 16px;">
Queremos compartir contigo las ultimas novedades de {{empresa}}. Aqui va un resumen rapido:
</p>
<ul style="color:#475569;font-size:15px;line-height:2;padding-left:20px;margin:0 0 24px;">
<li>Primera novedad importante del periodo</li>
<li>Segunda actualizacion relevante</li>
<li>Tercer punto de interes para tu equipo</li>
</ul>
<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 24px;">
Para ver todos los detalles, haz clic en el boton.
</p>
${ctaButton("Ver detalles completos")}`
    )
  },

  // ============================
  // PROMOTIONAL (2 templates)
  // ============================
  {
    name: "Promocion Destacada",
    category: "promotional",
    description: "Template para promociones y ofertas especiales con diseno llamativo y CTA prominente.",
    previewImage: "/email-templates/previews/promo-featured.png",
    htmlContent: buildEmailWrapper(
      "#1e293b",
      `<p style="color:#52b788;margin:0 0 8px;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:2px;">Oferta Especial</p>
<h1 style="color:#ffffff;margin:0;font-size:32px;font-weight:800;">Aprovecha esta oportunidad</h1>
<p style="color:#94a3b8;margin:12px 0 0;font-size:15px;">Solo por tiempo limitado para clientes de {{empresa}}</p>`,
      `<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 20px;">
Hola {{nombre}},
</p>
<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 24px;">
Tenemos una propuesta especial pensada para ti. Descubre como podemos ayudarte a alcanzar tus objetivos con nuestra solucion.
</p>

<!-- Beneficios -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:28px;">
<tr>
<td width="50%" style="padding:12px;vertical-align:top;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f0f9ff;border-radius:8px;padding:16px;">
<tr>
<td style="padding:16px;">
<p style="color:#3b82f6;font-size:24px;margin:0 0 8px;font-weight:700;">+50%</p>
<p style="color:#475569;font-size:13px;margin:0;">Mayor productividad</p>
</td>
</tr>
</table>
</td>
<td width="50%" style="padding:12px;vertical-align:top;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f0fdf4;border-radius:8px;padding:16px;">
<tr>
<td style="padding:16px;">
<p style="color:#52b788;font-size:24px;margin:0 0 8px;font-weight:700;">24/7</p>
<p style="color:#475569;font-size:13px;margin:0;">Soporte dedicado</p>
</td>
</tr>
</table>
</td>
</tr>
</table>

${ctaButton("Conocer la propuesta", "#52b788")}`
    )
  },
  {
    name: "Lanzamiento de Producto",
    category: "promotional",
    description: "Ideal para anunciar nuevos productos o servicios con seccion de caracteristicas y CTA.",
    previewImage: "/email-templates/previews/promo-launch.png",
    htmlContent: buildEmailWrapper(
      "#3b82f6",
      `<p style="color:#bfdbfe;margin:0 0 8px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:2px;">Nuevo Lanzamiento</p>
<h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;">Presentamos algo nuevo</h1>`,
      `<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 20px;">
Hola {{nombre}},
</p>
<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 28px;">
Estamos emocionados de presentarte nuestra ultima novedad. Diseñada pensando en las necesidades de {{empresa}} y equipos como el tuyo.
</p>

<!-- Caracteristicas -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:28px;">
<tr>
<td style="padding:16px 0;border-bottom:1px solid #f1f5f9;">
<h4 style="color:#1e293b;font-size:15px;margin:0 0 4px;font-weight:600;">Facil de implementar</h4>
<p style="color:#64748b;font-size:14px;margin:0;">Configuracion rapida en minutos, sin necesidad de soporte tecnico.</p>
</td>
</tr>
<tr>
<td style="padding:16px 0;border-bottom:1px solid #f1f5f9;">
<h4 style="color:#1e293b;font-size:15px;margin:0 0 4px;font-weight:600;">Resultados medibles</h4>
<p style="color:#64748b;font-size:14px;margin:0;">Metricas en tiempo real para que tomes decisiones informadas.</p>
</td>
</tr>
<tr>
<td style="padding:16px 0;">
<h4 style="color:#1e293b;font-size:15px;margin:0 0 4px;font-weight:600;">Integracion completa</h4>
<p style="color:#64748b;font-size:14px;margin:0;">Se conecta con tus herramientas actuales sin friccion.</p>
</td>
</tr>
</table>

${ctaButton("Descubrir ahora")}`
    )
  },

  // ============================
  // WELCOME (2 templates)
  // ============================
  {
    name: "Bienvenida Clasica",
    category: "welcome",
    description: "Email de bienvenida para nuevos usuarios con pasos de inicio y CTA para explorar la plataforma.",
    previewImage: "/email-templates/previews/welcome-classic.png",
    htmlContent: buildEmailWrapper(
      "#1e293b",
      `<h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;">Bienvenido a bordo</h1>
<p style="color:#94a3b8;margin:10px 0 0;font-size:15px;">Nos alegra tenerte en {{empresa}}</p>`,
      `<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 20px;">
Hola {{nombre}},
</p>
<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 28px;">
Tu cuenta esta lista. Aqui tienes los primeros pasos para comenzar:
</p>

<!-- Pasos -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:28px;">
<tr>
<td style="padding:16px 0;border-bottom:1px solid #f1f5f9;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="width:40px;vertical-align:top;">
<div style="width:32px;height:32px;background-color:#3b82f6;border-radius:50%;text-align:center;line-height:32px;color:#ffffff;font-weight:700;font-size:14px;">1</div>
</td>
<td style="padding-left:12px;">
<h4 style="color:#1e293b;font-size:15px;margin:0 0 4px;font-weight:600;">Completa tu perfil</h4>
<p style="color:#64748b;font-size:14px;margin:0;">Agrega tu foto y datos de contacto.</p>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:16px 0;border-bottom:1px solid #f1f5f9;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="width:40px;vertical-align:top;">
<div style="width:32px;height:32px;background-color:#3b82f6;border-radius:50%;text-align:center;line-height:32px;color:#ffffff;font-weight:700;font-size:14px;">2</div>
</td>
<td style="padding-left:12px;">
<h4 style="color:#1e293b;font-size:15px;margin:0 0 4px;font-weight:600;">Configura tu equipo</h4>
<p style="color:#64748b;font-size:14px;margin:0;">Invita a tus colaboradores a la plataforma.</p>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:16px 0;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="width:40px;vertical-align:top;">
<div style="width:32px;height:32px;background-color:#3b82f6;border-radius:50%;text-align:center;line-height:32px;color:#ffffff;font-weight:700;font-size:14px;">3</div>
</td>
<td style="padding-left:12px;">
<h4 style="color:#1e293b;font-size:15px;margin:0 0 4px;font-weight:600;">Explora las funciones</h4>
<p style="color:#64748b;font-size:14px;margin:0;">Descubre todo lo que puedes hacer.</p>
</td>
</tr>
</table>
</td>
</tr>
</table>

${ctaButton("Ir a mi cuenta")}`
    )
  },
  {
    name: "Bienvenida Moderna",
    category: "welcome",
    description: "Email de bienvenida con diseño moderno, mensaje personalizado y enlace directo de acceso.",
    previewImage: "/email-templates/previews/welcome-modern.png",
    htmlContent: buildEmailWrapper(
      "#52b788",
      `<h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:700;">Hola, {{nombre}}</h1>
<p style="color:#d1fae5;margin:8px 0 0;font-size:15px;">Bienvenido a {{empresa}}</p>`,
      `<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 20px;">
Estamos encantados de que te hayas unido. Nuestro objetivo es ayudarte a lograr resultados extraordinarios.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f0fdf4;border-radius:8px;margin-bottom:24px;">
<tr>
<td style="padding:24px;">
<p style="color:#166534;font-size:15px;line-height:1.6;margin:0;font-style:italic;">
"La mejor forma de comenzar es dar el primer paso. Estamos aqui para acompañarte en cada momento."
</p>
<p style="color:#166534;font-size:13px;margin:12px 0 0;font-weight:600;">— El equipo de {{empresa}}</p>
</td>
</tr>
</table>

<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 24px;">
Si necesitas ayuda, nuestro equipo de soporte esta disponible para ti. No dudes en contactarnos.
</p>

${ctaButton("Comenzar ahora", "#52b788")}`
    )
  },

  // ============================
  // TRANSACTIONAL (2 templates)
  // ============================
  {
    name: "Confirmacion de Accion",
    category: "transactional",
    description: "Email transaccional para confirmar acciones del usuario como compras, registros o cambios de cuenta.",
    previewImage: "/email-templates/previews/transactional-confirm.png",
    htmlContent: buildEmailWrapper(
      "#1e293b",
      `<h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">Confirmacion</h1>`,
      `<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 20px;">
Hola {{nombre}},
</p>
<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 24px;">
Tu solicitud ha sido procesada exitosamente. Aqui estan los detalles:
</p>

<!-- Detalles -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f8fafc;border-radius:8px;margin-bottom:24px;border:1px solid #e2e8f0;">
<tr>
<td style="padding:20px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
<tr>
<td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
<span style="color:#64748b;font-size:14px;">Numero de referencia</span>
<span style="color:#1e293b;font-size:14px;font-weight:600;float:right;">#REF-001</span>
</td>
</tr>
<tr>
<td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
<span style="color:#64748b;font-size:14px;">Fecha</span>
<span style="color:#1e293b;font-size:14px;font-weight:600;float:right;">01/03/2026</span>
</td>
</tr>
<tr>
<td style="padding:8px 0;">
<span style="color:#64748b;font-size:14px;">Estado</span>
<span style="color:#52b788;font-size:14px;font-weight:600;float:right;">Confirmado</span>
</td>
</tr>
</table>
</td>
</tr>
</table>

<p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 24px;">
Si no realizaste esta accion, contacta a nuestro equipo de soporte inmediatamente.
</p>

${ctaButton("Ver detalles")}`
    )
  },
  {
    name: "Notificacion de Estado",
    category: "transactional",
    description: "Email de notificacion para informar cambios de estado en pedidos, tickets o procesos.",
    previewImage: "/email-templates/previews/transactional-status.png",
    htmlContent: buildEmailWrapper(
      "#3b82f6",
      `<h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">Actualizacion de Estado</h1>`,
      `<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 20px;">
Hola {{nombre}},
</p>

<!-- Estado badge -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-bottom:24px;">
<tr>
<td style="background-color:#f0fdf4;border:2px solid #52b788;border-radius:50px;padding:12px 32px;text-align:center;">
<span style="color:#166534;font-size:16px;font-weight:700;">Estado: En Progreso</span>
</td>
</tr>
</table>

<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 24px;">
Queremos informarte que el estado de tu solicitud ha sido actualizado. Puedes revisar los detalles completos en tu panel de control.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#eff6ff;border-radius:8px;margin-bottom:24px;">
<tr>
<td style="padding:20px;">
<p style="color:#1e40af;font-size:14px;line-height:1.6;margin:0;">
<strong>Siguiente paso:</strong> Nuestro equipo esta revisando tu solicitud. Te notificaremos cuando haya novedades.
</p>
</td>
</tr>
</table>

${ctaButton("Ver en mi panel")}`
    )
  },

  // ============================
  // EVENT (2 templates)
  // ============================
  {
    name: "Invitacion a Evento",
    category: "event",
    description: "Template para invitaciones a eventos, webinars o conferencias con fecha, hora y registro.",
    previewImage: "/email-templates/previews/event-invitation.png",
    htmlContent: buildEmailWrapper(
      "#1e293b",
      `<p style="color:#f3a43b;margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">Te Invitamos</p>
<h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:700;">Nombre del Evento</h1>
<p style="color:#94a3b8;margin:12px 0 0;font-size:15px;">Un evento exclusivo de {{empresa}}</p>`,
      `<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 20px;">
Hola {{nombre}},
</p>
<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 28px;">
Queremos invitarte a un evento especial. Sera una oportunidad unica para aprender, conectar y crecer con nosotros.
</p>

<!-- Detalles del evento -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#fefce8;border-radius:8px;border-left:4px solid #f3a43b;margin-bottom:28px;">
<tr>
<td style="padding:24px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
<tr>
<td style="padding:6px 0;">
<span style="color:#92400e;font-size:14px;font-weight:600;">Fecha:</span>
<span style="color:#78350f;font-size:14px;margin-left:8px;">15 de marzo, 2026</span>
</td>
</tr>
<tr>
<td style="padding:6px 0;">
<span style="color:#92400e;font-size:14px;font-weight:600;">Hora:</span>
<span style="color:#78350f;font-size:14px;margin-left:8px;">10:00 AM (GMT-5)</span>
</td>
</tr>
<tr>
<td style="padding:6px 0;">
<span style="color:#92400e;font-size:14px;font-weight:600;">Formato:</span>
<span style="color:#78350f;font-size:14px;margin-left:8px;">Virtual (Zoom)</span>
</td>
</tr>
<tr>
<td style="padding:6px 0;">
<span style="color:#92400e;font-size:14px;font-weight:600;">Duracion:</span>
<span style="color:#78350f;font-size:14px;margin-left:8px;">90 minutos</span>
</td>
</tr>
</table>
</td>
</tr>
</table>

${ctaButton("Registrarme ahora", "#f3a43b")}`
    )
  },
  {
    name: "Recordatorio de Evento",
    category: "event",
    description: "Email de recordatorio para eventos proximos con cuenta regresiva y enlace de acceso directo.",
    previewImage: "/email-templates/previews/event-reminder.png",
    htmlContent: buildEmailWrapper(
      "#3b82f6",
      `<p style="color:#bfdbfe;margin:0 0 6px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:2px;">Recordatorio</p>
<h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">Tu evento es pronto</h1>`,
      `<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 20px;">
Hola {{nombre}},
</p>
<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 24px;">
Te recordamos que el evento al que te registraste esta por comenzar. Asegurate de tener todo listo.
</p>

<!-- Countdown visual -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:28px;">
<tr>
<td align="center">
<table role="presentation" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="background-color:#eff6ff;border-radius:8px;padding:16px 24px;text-align:center;margin:0 8px;">
<p style="color:#3b82f6;font-size:28px;font-weight:800;margin:0;">01</p>
<p style="color:#64748b;font-size:11px;margin:4px 0 0;text-transform:uppercase;">Dia</p>
</td>
<td style="width:12px;"></td>
<td style="background-color:#eff6ff;border-radius:8px;padding:16px 24px;text-align:center;">
<p style="color:#3b82f6;font-size:28px;font-weight:800;margin:0;">03</p>
<p style="color:#64748b;font-size:11px;margin:4px 0 0;text-transform:uppercase;">Horas</p>
</td>
<td style="width:12px;"></td>
<td style="background-color:#eff6ff;border-radius:8px;padding:16px 24px;text-align:center;">
<p style="color:#3b82f6;font-size:28px;font-weight:800;margin:0;">30</p>
<p style="color:#64748b;font-size:11px;margin:4px 0 0;text-transform:uppercase;">Min</p>
</td>
</tr>
</table>
</td>
</tr>
</table>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f8fafc;border-radius:8px;margin-bottom:24px;">
<tr>
<td style="padding:20px;">
<p style="color:#475569;font-size:14px;line-height:1.6;margin:0;">
<strong>Consejo:</strong> Conectate 5 minutos antes para verificar tu audio y video.
</p>
</td>
</tr>
</table>

${ctaButton("Unirme al evento")}`
    )
  },

  // ============================
  // ECOMMERCE (2 templates)
  // ============================
  {
    name: "Resumen de Pedido",
    category: "ecommerce",
    description: "Email de confirmacion de pedido con tabla de productos, totales y datos de envio.",
    previewImage: "/email-templates/previews/ecommerce-order.png",
    htmlContent: buildEmailWrapper(
      "#1e293b",
      `<h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">Pedido Confirmado</h1>
<p style="color:#52b788;margin:8px 0 0;font-size:14px;font-weight:600;">Pedido #12345</p>`,
      `<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 20px;">
Hola {{nombre}},
</p>
<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 24px;">
Hemos recibido tu pedido y lo estamos procesando. Aqui tienes el resumen:
</p>

<!-- Tabla de productos -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
<tr style="background-color:#f8fafc;">
<td style="padding:12px 16px;font-size:13px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">Producto</td>
<td style="padding:12px 16px;font-size:13px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;text-align:center;">Cant.</td>
<td style="padding:12px 16px;font-size:13px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;text-align:right;">Precio</td>
</tr>
<tr>
<td style="padding:12px 16px;font-size:14px;color:#334155;border-bottom:1px solid #f1f5f9;">Producto Ejemplo 1</td>
<td style="padding:12px 16px;font-size:14px;color:#334155;border-bottom:1px solid #f1f5f9;text-align:center;">1</td>
<td style="padding:12px 16px;font-size:14px;color:#334155;border-bottom:1px solid #f1f5f9;text-align:right;">$29.99</td>
</tr>
<tr>
<td style="padding:12px 16px;font-size:14px;color:#334155;border-bottom:1px solid #f1f5f9;">Producto Ejemplo 2</td>
<td style="padding:12px 16px;font-size:14px;color:#334155;border-bottom:1px solid #f1f5f9;text-align:center;">2</td>
<td style="padding:12px 16px;font-size:14px;color:#334155;border-bottom:1px solid #f1f5f9;text-align:right;">$19.98</td>
</tr>
<tr style="background-color:#f8fafc;">
<td colspan="2" style="padding:12px 16px;font-size:15px;color:#1e293b;font-weight:700;">Total</td>
<td style="padding:12px 16px;font-size:15px;color:#1e293b;font-weight:700;text-align:right;">$49.97</td>
</tr>
</table>

${ctaButton("Seguir mi pedido", "#52b788")}`,
      `<p style="color:#475569;font-size:13px;margin:0 0 8px;">Necesitas ayuda? Responde a este email o contactanos.</p>`
    )
  },
  {
    name: "Carrito Abandonado",
    category: "ecommerce",
    description: "Email de recuperacion de carrito abandonado con recordatorio de productos y llamada a la accion.",
    previewImage: "/email-templates/previews/ecommerce-cart.png",
    htmlContent: buildEmailWrapper(
      "#f3a43b",
      `<h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:700;">Olvidaste algo?</h1>
<p style="color:#fef3c7;margin:8px 0 0;font-size:15px;">Tus productos te esperan</p>`,
      `<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 20px;">
Hola {{nombre}},
</p>
<p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 24px;">
Notamos que dejaste algunos articulos en tu carrito de compras. Los hemos guardado para ti por si quieres completar tu pedido.
</p>

<!-- Producto en carrito -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:16px;">
<tr>
<td style="padding:16px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
<tr>
<td style="width:80px;vertical-align:top;">
<div style="width:72px;height:72px;background-color:#f1f5f9;border-radius:8px;text-align:center;line-height:72px;color:#94a3b8;font-size:12px;">Imagen</div>
</td>
<td style="padding-left:16px;vertical-align:top;">
<h4 style="color:#1e293b;font-size:15px;margin:0 0 4px;font-weight:600;">Producto en tu carrito</h4>
<p style="color:#64748b;font-size:13px;margin:0 0 4px;">Cantidad: 1</p>
<p style="color:#3b82f6;font-size:16px;margin:0;font-weight:700;">$29.99</p>
</td>
</tr>
</table>
</td>
</tr>
</table>

<p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 24px;text-align:center;">
Los articulos en tu carrito pueden agotarse. Completa tu compra pronto.
</p>

${ctaButton("Completar mi compra", "#f3a43b")}`
    )
  }
];

// ============================================================================
// FUNCIONES PUBLICAS
// ============================================================================

/**
 * Retorna la lista de templates predefinidos de la galeria.
 */
export function getPresetTemplates(): PresetTemplate[] {
  return PRESET_TEMPLATES.map((template, index) => ({
    ...template,
    // No incluir htmlContent completo en el listado para reducir payload
    htmlContent: "",
    _index: index
  })) as unknown as PresetTemplate[];
}

/**
 * Retorna un template predefinido con su HTML completo por indice.
 */
export function getPresetTemplateByIndex(index: number): PresetTemplate | null {
  if (index < 0 || index >= PRESET_TEMPLATES.length) {
    return null;
  }
  return PRESET_TEMPLATES[index];
}

/**
 * Retorna todos los templates con HTML completo (para preview individual).
 */
export function getPresetTemplatesFull(): PresetTemplate[] {
  return PRESET_TEMPLATES;
}

/**
 * Instala un template preset en la BD para una company.
 * Crea un EmailTemplate con el contenido del preset y status='published'.
 */
export async function installPreset(
  companyId: number,
  presetIndex: number,
  userId: number
): Promise<typeof EmailTemplate.prototype> {
  const preset = PRESET_TEMPLATES[presetIndex];

  if (!preset) {
    throw new Error(`Template preset con indice ${presetIndex} no encontrado. Rango valido: 0-${PRESET_TEMPLATES.length - 1}`);
  }

  logger.info(
    `[TemplateGallery] Instalando preset "${preset.name}" (index=${presetIndex}) para company ${companyId}`
  );

  const template = await EmailTemplate.create({
    name: preset.name,
    subject: `${preset.name} - {{empresa}}`,
    htmlContent: preset.htmlContent,
    textContent: "",
    category: preset.category,
    tags: [preset.category, "preset", "gallery"],
    thumbnailUrl: preset.previewImage,
    status: "published",
    isAiGenerated: false,
    companyId,
    createdBy: userId
  } as Partial<typeof EmailTemplate.prototype>);

  logger.info(
    `[TemplateGallery] Preset "${preset.name}" instalado como template ID ${template.id}`
  );

  return template;
}

/**
 * Retorna las categorias disponibles con sus conteos.
 */
export function getCategories(): Array<{ category: string; count: number; label: string }> {
  const categoryLabels: Record<string, string> = {
    newsletter: "Boletines",
    promotional: "Promocionales",
    welcome: "Bienvenida",
    transactional: "Transaccionales",
    event: "Eventos",
    ecommerce: "E-commerce"
  };

  const counts: Record<string, number> = {};
  for (const t of PRESET_TEMPLATES) {
    counts[t.category] = (counts[t.category] || 0) + 1;
  }

  return Object.entries(counts).map(([category, count]) => ({
    category,
    count,
    label: categoryLabels[category] || category
  }));
}

export default {
  getPresetTemplates,
  getPresetTemplateByIndex,
  getPresetTemplatesFull,
  installPreset,
  getCategories
};
