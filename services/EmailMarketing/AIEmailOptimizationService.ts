/**
 * AIEmailOptimizationService
 *
 * Servicio de IA para optimizacion de emails:
 * - Generacion de subject lines optimizados
 * - Analisis de spam score
 * - Generacion de contenido de email completo
 *
 * Usa AIClientService centralizado para todas las llamadas de IA.
 * Incluye fallback con templates predefinidos si la IA no esta disponible.
 */

import { chatCompletion, isCapabilityAvailable } from "../AIClientService";
import logger from "../../utils/logger";
import {
  chargeMessage,
  chargeAgentExecution
} from "../AICreditServices/AIUsagePricingService";

// ============================================================================
// TIPOS
// ============================================================================

interface GenerateSubjectLinesParams {
  companyId: number;
  content: string;
  targetAudience?: string;
  tone?: string; // professional, friendly, urgent, casual
  count?: number;
}

interface GenerateSubjectLinesResult {
  subjects: string[];
  reasoning: string;
}

interface AnalyzeSpamScoreParams {
  subject: string;
  htmlContent: string;
  fromEmail: string;
}

interface SpamIssue {
  severity: "high" | "medium" | "low";
  issue: string;
  suggestion: string;
}

interface AnalyzeSpamScoreResult {
  score: number;
  issues: SpamIssue[];
  overall: "excellent" | "good" | "needs_improvement" | "critical";
}

interface GenerateEmailContentParams {
  companyId: number;
  prompt: string;
  type?: string; // newsletter, promotional, transactional, welcome, followup
  tone?: string;
  brandName?: string;
}

interface GenerateEmailContentResult {
  htmlContent: string;
  textContent: string;
  suggestedSubject: string;
}

// ============================================================================
// PALABRAS SPAM CONOCIDAS
// ============================================================================

const SPAM_TRIGGER_WORDS: Array<{ word: string; severity: "high" | "medium" | "low"; suggestion: string }> = [
  { word: "gratis", severity: "high", suggestion: "Evita la palabra 'gratis', usa 'sin costo' o 'cortesia'" },
  { word: "free", severity: "high", suggestion: "Evita 'free', usa 'complimentary' o 'no-cost'" },
  { word: "click here", severity: "medium", suggestion: "Usa un texto de enlace mas descriptivo" },
  { word: "haz clic aqui", severity: "medium", suggestion: "Usa un texto de enlace descriptivo como 'Ver oferta'" },
  { word: "compra ahora", severity: "medium", suggestion: "Usa 'Conoce mas' o 'Descubre'" },
  { word: "buy now", severity: "medium", suggestion: "Usa 'Learn more' o 'Discover'" },
  { word: "act now", severity: "high", suggestion: "Elimina urgencia excesiva, usa un tono mas informativo" },
  { word: "limited time", severity: "medium", suggestion: "Indica la fecha exacta de vencimiento en su lugar" },
  { word: "tiempo limitado", severity: "medium", suggestion: "Indica la fecha exacta de vencimiento" },
  { word: "oferta exclusiva", severity: "low", suggestion: "Usa un lenguaje menos promocional" },
  { word: "descuento", severity: "low", suggestion: "Modera el uso de palabras de descuento" },
  { word: "100%", severity: "medium", suggestion: "Evita porcentajes absolutos en el subject" },
  { word: "garantizado", severity: "medium", suggestion: "Evita promesas absolutas" },
  { word: "guaranteed", severity: "medium", suggestion: "Avoid absolute promises" },
  { word: "winner", severity: "high", suggestion: "Avoid words like 'winner' or 'you won'" },
  { word: "ganador", severity: "high", suggestion: "Evita palabras como 'ganador' o 'has ganado'" },
  { word: "urgent", severity: "high", suggestion: "Reduce urgency language" },
  { word: "urgente", severity: "high", suggestion: "Reduce el lenguaje de urgencia" },
  { word: "congratulations", severity: "high", suggestion: "Evita 'congratulations' en subjects" },
  { word: "felicidades", severity: "high", suggestion: "Evita 'felicidades' en el asunto del email" },
  { word: "dinero", severity: "medium", suggestion: "Reduce referencias directas a dinero" },
  { word: "money", severity: "medium", suggestion: "Reduce direct money references" },
  { word: "no obligation", severity: "medium", suggestion: "Avoid 'no obligation' phrases" },
  { word: "sin compromiso", severity: "medium", suggestion: "Evita 'sin compromiso' en el asunto" }
];

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Genera subject lines optimizados para emails usando IA.
 * Si la IA no esta disponible, retorna subjects generados con templates.
 */
export async function generateSubjectLines(
  params: GenerateSubjectLinesParams
): Promise<GenerateSubjectLinesResult> {
  const { companyId, content, targetAudience, tone = "professional", count = 5 } = params;

  logger.info(`[AIEmailOptimization] Generando ${count} subject lines para company ${companyId}`);

  const aiAvailable = await isCapabilityAvailable("text");

  if (!aiAvailable) {
    logger.warn("[AIEmailOptimization] IA no disponible, usando fallback con templates");
    return generateSubjectLinesFallback(content, count);
  }

  // 💳 COBRO UNIFICADO (fail-closed): cada subject = 'message' configurable.
  await chargeMessage({
    companyId,
    units: count,
    source: "email_ai:subject_lines",
    description: `Email IA: ${count} subject lines`,
    metadata: { tone, count }
  });

  try {
    const systemPrompt = `Eres un experto en email marketing y copywriting. Tu tarea es generar subject lines de email que maximicen la tasa de apertura (open rate).

Reglas:
- Maximo 60 caracteres por subject line
- Evita palabras que disparen filtros de spam (gratis, urgente, oferta, etc.)
- Usa personalizacion cuando sea posible ({{nombre}})
- Cada subject debe ser unico y con un enfoque diferente
- Tono: ${tone}
${targetAudience ? `- Audiencia objetivo: ${targetAudience}` : ""}

Responde SOLO con un JSON valido con esta estructura:
{
  "subjects": ["subject1", "subject2", ...],
  "reasoning": "Breve explicacion de la estrategia usada"
}`;

    const userPrompt = `Genera ${count} subject lines optimizados para el siguiente contenido de email:

${content.substring(0, 2000)}`;

    const response = await chatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      companyId,
      maxTokens: 800,
      temperature: 0.8,
      module: "chat"
    });

    const parsed = parseJsonResponse<GenerateSubjectLinesResult>(response.content);

    if (parsed && parsed.subjects && Array.isArray(parsed.subjects)) {
      logger.info(`[AIEmailOptimization] ${parsed.subjects.length} subject lines generados exitosamente`);
      return parsed;
    }

    logger.warn("[AIEmailOptimization] Respuesta IA no parseable, usando fallback");
    return generateSubjectLinesFallback(content, count);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AIEmailOptimization] Error generando subjects: ${errorMessage}`);
    return generateSubjectLinesFallback(content, count);
  }
}

/**
 * Analiza el spam score de un email basandose en reglas conocidas y patrones.
 * Combina analisis estatico de reglas + analisis IA si esta disponible.
 */
export async function analyzeSpamScore(
  params: AnalyzeSpamScoreParams
): Promise<AnalyzeSpamScoreResult> {
  const { subject, htmlContent, fromEmail } = params;

  logger.info("[AIEmailOptimization] Analizando spam score");

  const issues: SpamIssue[] = [];
  let score = 0;

  // --- Analisis estatico de reglas ---

  // 1. Verificar palabras spam en subject
  const subjectLower = subject.toLowerCase();
  for (const trigger of SPAM_TRIGGER_WORDS) {
    if (subjectLower.includes(trigger.word.toLowerCase())) {
      issues.push({
        severity: trigger.severity,
        issue: `Subject contiene palabra spam: "${trigger.word}"`,
        suggestion: trigger.suggestion
      });
      score += trigger.severity === "high" ? 20 : trigger.severity === "medium" ? 10 : 5;
    }
  }

  // 2. Verificar palabras spam en contenido HTML
  const contentLower = htmlContent.toLowerCase();
  const contentSpamCount = SPAM_TRIGGER_WORDS.filter(t =>
    contentLower.includes(t.word.toLowerCase())
  ).length;
  if (contentSpamCount > 3) {
    issues.push({
      severity: "medium",
      issue: `El contenido contiene ${contentSpamCount} palabras que pueden activar filtros de spam`,
      suggestion: "Revisa y reduce el uso de palabras promocionales en el cuerpo del email"
    });
    score += Math.min(contentSpamCount * 3, 20);
  }

  // 3. Subject en mayusculas
  const upperCount = (subject.match(/[A-Z]/g) || []).length;
  const totalLetters = (subject.match(/[a-zA-Z]/g) || []).length;
  if (totalLetters > 0 && upperCount / totalLetters > 0.5) {
    issues.push({
      severity: "high",
      issue: "El subject tiene mas del 50% de letras en mayusculas",
      suggestion: "Usa capitalizacion normal, evita MAYUSCULAS excesivas"
    });
    score += 15;
  }

  // 4. Signos de exclamacion excesivos
  const exclamationCount = (subject.match(/!/g) || []).length;
  if (exclamationCount > 1) {
    issues.push({
      severity: "medium",
      issue: `El subject tiene ${exclamationCount} signos de exclamacion`,
      suggestion: "Usa maximo un signo de exclamacion en el subject"
    });
    score += exclamationCount * 5;
  }

  // 5. Emojis excesivos en subject
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}]/gu;
  const emojiCount = (subject.match(emojiRegex) || []).length;
  if (emojiCount > 2) {
    issues.push({
      severity: "low",
      issue: `El subject tiene ${emojiCount} emojis`,
      suggestion: "Limita a 1-2 emojis maximo en el subject"
    });
    score += 5;
  }

  // 6. fromEmail con dominio generico
  const genericDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com"];
  const emailDomain = fromEmail.split("@")[1]?.toLowerCase() || "";
  if (genericDomains.includes(emailDomain)) {
    issues.push({
      severity: "high",
      issue: `El email de envio usa un dominio generico (${emailDomain})`,
      suggestion: "Usa un dominio corporativo para mejorar la entregabilidad"
    });
    score += 15;
  }

  // 7. Ratio texto/HTML
  const textOnlyContent = htmlContent.replace(/<[^>]*>/g, "").trim();
  const htmlLength = htmlContent.length;
  if (htmlLength > 0 && textOnlyContent.length / htmlLength < 0.2) {
    issues.push({
      severity: "medium",
      issue: "El email tiene muy poco texto comparado con HTML",
      suggestion: "Agrega mas contenido de texto y reduce el HTML innecesario"
    });
    score += 10;
  }

  // 8. Falta de enlace de desuscripcion
  if (!contentLower.includes("unsubscribe") && !contentLower.includes("desuscribir") && !contentLower.includes("baja") && !contentLower.includes("unsub")) {
    issues.push({
      severity: "high",
      issue: "No se encontro un enlace de desuscripcion",
      suggestion: "Agrega un enlace de desuscripcion visible, es requerido por ley (CAN-SPAM, GDPR)"
    });
    score += 20;
  }

  // 9. Subject muy corto o muy largo
  if (subject.length < 10) {
    issues.push({
      severity: "low",
      issue: "El subject es muy corto (menos de 10 caracteres)",
      suggestion: "Un subject de 30-50 caracteres tiene mejor rendimiento"
    });
    score += 5;
  } else if (subject.length > 70) {
    issues.push({
      severity: "low",
      issue: "El subject es muy largo (mas de 70 caracteres), puede cortarse en moviles",
      suggestion: "Acorta el subject a menos de 60 caracteres para mejor visualizacion"
    });
    score += 5;
  }

  // 10. Imagenes sin alt text
  const imgTags: string[] = htmlContent.match(/<img[^>]*>/gi) || [];
  const imgsWithoutAlt = imgTags.filter(img => !img.includes("alt=") || img.includes('alt=""'));
  if (imgsWithoutAlt.length > 0) {
    issues.push({
      severity: "low",
      issue: `${imgsWithoutAlt.length} imagen(es) sin texto alternativo (alt)`,
      suggestion: "Agrega atributos alt descriptivos a todas las imagenes"
    });
    score += imgsWithoutAlt.length * 2;
  }

  // Normalizar score a 0-100
  score = Math.min(score, 100);

  // Determinar overall
  let overall: "excellent" | "good" | "needs_improvement" | "critical";
  if (score <= 15) {
    overall = "excellent";
  } else if (score <= 35) {
    overall = "good";
  } else if (score <= 60) {
    overall = "needs_improvement";
  } else {
    overall = "critical";
  }

  logger.info(`[AIEmailOptimization] Spam score: ${score}/100 (${overall}), ${issues.length} issues`);

  return { score, issues, overall };
}

/**
 * Genera contenido de email completo con IA.
 * Si la IA no esta disponible, retorna un template basico con el prompt.
 */
export async function generateEmailContent(
  params: GenerateEmailContentParams
): Promise<GenerateEmailContentResult> {
  const { companyId, prompt, type = "newsletter", tone = "professional", brandName } = params;

  logger.info(`[AIEmailOptimization] Generando contenido email tipo '${type}' para company ${companyId}`);

  const aiAvailable = await isCapabilityAvailable("text");

  if (!aiAvailable) {
    logger.warn("[AIEmailOptimization] IA no disponible, usando fallback con template basico");
    return generateEmailContentFallback(prompt, type, brandName);
  }

  // 💳 COBRO UNIFICADO (fail-closed): generacion de email completo = agent_execution
  // (mas pesado que un simple subject line; configurable).
  await chargeAgentExecution({
    companyId,
    units: 1,
    source: "email_ai:full_content",
    description: `Email IA: contenido tipo=${type}`,
    metadata: { type, tone, brand: brandName }
  });

  try {
    const brand = brandName || "Nuestra empresa";
    const systemPrompt = `Eres un experto en email marketing y diseño de emails. Genera emails HTML responsive y profesionales.

Tipo de email: ${type}
Tono: ${tone}
Marca: ${brand}

REGLAS IMPORTANTES:
1. El HTML debe ser responsive (max-width: 600px para el contenedor principal)
2. Usa estilos INLINE (no <style> tags externos)
3. Incluye variables de personalizacion: {{nombre}}, {{empresa}}
4. Colores de marca: primary #3b82f6, oscuro #1e293b, success #52b788
5. Incluye un enlace de desuscripcion con {{enlace_unsub}}
6. Incluye un CTA principal con {{enlace_accion}}
7. El email debe verse bien en clientes de correo antiguos (tablas para layout)
8. NO uses JavaScript ni CSS avanzado
9. Genera tambien una version de texto plano

Responde SOLO con un JSON valido:
{
  "htmlContent": "<html>...</html>",
  "textContent": "Version texto plano...",
  "suggestedSubject": "Subject sugerido para este email"
}`;

    const response = await chatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Genera un email completo basado en: ${prompt}` }
      ],
      companyId,
      maxTokens: 3000,
      temperature: 0.7,
      module: "chat"
    });

    const parsed = parseJsonResponse<GenerateEmailContentResult>(response.content);

    if (parsed && parsed.htmlContent) {
      logger.info("[AIEmailOptimization] Contenido de email generado exitosamente con IA");
      return {
        htmlContent: parsed.htmlContent,
        textContent: parsed.textContent || stripHtml(parsed.htmlContent),
        suggestedSubject: parsed.suggestedSubject || "Email generado con IA"
      };
    }

    logger.warn("[AIEmailOptimization] Respuesta IA no parseable, usando fallback");
    return generateEmailContentFallback(prompt, type, brandName);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AIEmailOptimization] Error generando contenido: ${errorMessage}`);
    return generateEmailContentFallback(prompt, type, brandName);
  }
}

// ============================================================================
// FUNCIONES DE FALLBACK
// ============================================================================

function generateSubjectLinesFallback(content: string, count: number): GenerateSubjectLinesResult {
  const textContent = content.replace(/<[^>]*>/g, "").trim();
  const firstWords = textContent.substring(0, 50).trim();

  const templates = [
    `{{nombre}}, tenemos algo para ti`,
    `Novedades de esta semana`,
    `${firstWords.substring(0, 30)}...`,
    `Actualizacion importante para ti`,
    `{{nombre}}, no te pierdas esto`,
    `Lo ultimo que necesitas saber`,
    `Tu resumen personalizado`,
    `Descubre lo que preparamos para ti`
  ];

  const subjects = templates.slice(0, count);

  return {
    subjects,
    reasoning: "Subjects generados con templates predefinidos. Configura un proveedor de IA en el panel de administracion para obtener resultados personalizados con inteligencia artificial."
  };
}

function generateEmailContentFallback(
  prompt: string,
  type: string,
  brandName?: string
): GenerateEmailContentResult {
  const brand = brandName || "Nuestra Empresa";

  const typeLabels: Record<string, string> = {
    newsletter: "Newsletter",
    promotional: "Oferta Especial",
    transactional: "Notificacion",
    welcome: "Bienvenida",
    followup: "Seguimiento"
  };

  const heading = typeLabels[type] || "Newsletter";

  const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f9fa;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f8f9fa;">
<tr>
<td align="center" style="padding:20px 10px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;">

<!-- Header -->
<tr>
<td style="background-color:#1e293b;padding:30px 40px;text-align:center;">
<h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">${brand}</h1>
</td>
</tr>

<!-- Body -->
<tr>
<td style="padding:40px;">
<p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 16px;">
Hola {{nombre}},
</p>
<p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 24px;">
${prompt}
</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
<tr>
<td style="background-color:#3b82f6;border-radius:6px;">
<a href="{{enlace_accion}}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;">
Ver mas
</a>
</td>
</tr>
</table>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color:#f1f5f9;padding:24px 40px;text-align:center;">
<p style="color:#64748b;font-size:13px;line-height:1.5;margin:0 0 8px;">
${brand} | {{empresa}}
</p>
<p style="color:#94a3b8;font-size:12px;margin:0;">
<a href="{{enlace_unsub}}" style="color:#94a3b8;text-decoration:underline;">Desuscribirse</a>
</p>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;

  const textContent = `${heading}\n\nHola {{nombre}},\n\n${prompt}\n\nVisita: {{enlace_accion}}\n\n---\n${brand} | {{empresa}}\nDesuscribirse: {{enlace_unsub}}`;

  return {
    htmlContent,
    textContent,
    suggestedSubject: `${heading} - ${brand}`
  };
}

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Parsea una respuesta JSON de la IA de forma segura.
 * Maneja bloques ```json ... ``` y JSON puro.
 */
function parseJsonResponse<T>(content: string): T | null {
  try {
    // Intentar extraer JSON de bloques de codigo
    const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonBlockMatch ? jsonBlockMatch[1].trim() : content.trim();

    return JSON.parse(jsonStr) as T;
  } catch {
    // Intentar encontrar el primer { y ultimo }
    try {
      const firstBrace = content.indexOf("{");
      const lastBrace = content.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const extracted = content.substring(firstBrace, lastBrace + 1);
        return JSON.parse(extracted) as T;
      }
    } catch {
      // No se pudo parsear
    }
    return null;
  }
}

/**
 * Elimina tags HTML dejando solo texto.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default {
  generateSubjectLines,
  analyzeSpamScore,
  generateEmailContent
};
