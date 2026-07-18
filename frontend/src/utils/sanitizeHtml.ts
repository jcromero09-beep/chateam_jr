/**
 * [Ola 2 · XSS] Sanitización de HTML no confiable.
 *
 * Contexto: las plantillas de email las escribe cualquier agente del tenant y se
 * renderizaban con dangerouslySetInnerHTML sin sanitizar. Como el token de sesión
 * vive en localStorage, un <script> en una plantilla permitía robar la cuenta de
 * cualquier compañero que abriera la vista previa.
 *
 * Este helper es la PRIMERA capa (limpiar el HTML). La segunda es renderizar el
 * resultado dentro de un <iframe sandbox=""> (sin allow-scripts ni
 * allow-same-origin). Se mantienen las dos porque protegen de cosas distintas:
 * el sanitizador puede tener bypasses conocidos, y el sandbox no depende de
 * acertar con la lista de etiquetas.
 */
import DOMPurify from 'dompurify';

/**
 * Limpia el HTML de una plantilla de email conservando lo que un cliente de
 * correo sí renderizaría (tablas, estilos inline, imágenes, enlaces).
 *
 * Se prohíben explícitamente los vectores de ejecución y exfiltración:
 * script/iframe/object/embed/form y todos los manejadores on* (onerror, onload…),
 * que DOMPurify elimina por defecto y aquí se refuerzan.
 */
export const sanitizeTemplateHtml = (dirty: string): string => {
  if (!dirty) return '';

  return DOMPurify.sanitize(dirty, {
    // `style` va permitido: sin estilos inline el preview no representa el email real.
    // DOMPurify ya filtra expression()/url(javascript:) dentro de los estilos.
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'base', 'link'],
    FORBID_ATTR: ['formaction', 'srcdoc', 'ping'],
    // Solo esquemas seguros: bloquea javascript:, vbscript: y data: ejecutable.
    ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel|cid|data:image\/(?:png|jpe?g|gif|webp))/i,
    // El resultado va a srcDoc de un iframe: necesitamos el documento como string.
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
};

export default sanitizeTemplateHtml;
