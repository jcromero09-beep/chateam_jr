/**
 * Service: KeywordMatcherService
 * Maneja el matching de keywords en comentarios de redes sociales.
 * Soporta matching exacto (n-gramas) y por contenido (contains).
 * Incluye procesamiento de spintax y reemplazo de variables.
 */

import { KeywordRule } from "../../models/CommentAutoReplyCampaign";

/**
 * Genera n-gramas a partir de tokens de texto.
 * Ejemplo: ["hola","mundo","feliz"] con n=2 => ["hola mundo", "mundo feliz"]
 */
const generateNGrams = (tokens: string[], n: number): string[] => {
  const ngrams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(" "));
  }
  return ngrams;
};

/**
 * Busca coincidencia de keywords en el texto del comentario.
 * Para 'exact': tokeniza el comentario en 1-grams, 2-grams, 3-grams y compara.
 * Para 'contains': verifica si alguna keyword esta contenida en el texto (case-insensitive).
 */
const matchKeywords = (
  commentText: string,
  rules: KeywordRule[],
  matchingType: "exact" | "contains"
): KeywordRule | null => {
  if (!commentText || !rules || rules.length === 0) return null;

  const normalizedComment = commentText.toLowerCase().trim();

  if (matchingType === "exact") {
    // Tokenizar el comentario y generar n-gramas (1, 2, 3)
    const tokens = normalizedComment
      .replace(/[^\w\sáéíóúñüÁÉÍÓÚÑÜ]/g, "")
      .split(/\s+/)
      .filter(t => t.length > 0);

    const allNGrams = new Set<string>([
      ...generateNGrams(tokens, 1),
      ...generateNGrams(tokens, 2),
      ...generateNGrams(tokens, 3)
    ]);

    for (const rule of rules) {
      if (!rule.keywords || rule.keywords.length === 0) continue;
      for (const keyword of rule.keywords) {
        const normalizedKeyword = keyword.toLowerCase().trim();
        if (allNGrams.has(normalizedKeyword)) {
          return rule;
        }
      }
    }
  } else {
    // matchingType === "contains"
    for (const rule of rules) {
      if (!rule.keywords || rule.keywords.length === 0) continue;
      for (const keyword of rule.keywords) {
        const normalizedKeyword = keyword.toLowerCase().trim();
        if (normalizedKeyword && normalizedComment.includes(normalizedKeyword)) {
          return rule;
        }
      }
    }
  }

  return null;
};

/**
 * Procesa spintax en un texto: {opcion1|opcion2|opcion3} => selecciona una al azar.
 */
const processSpintax = (text: string): string => {
  if (!text) return text;
  return text.replace(/\{([^{}]+)\}/g, (_match, group: string) => {
    const options = group.split("|");
    return options[Math.floor(Math.random() * options.length)];
  });
};

/**
 * Reemplaza variables de plantilla en el texto.
 * Variables soportadas: {name}, {first_name}, {last_name}
 */
const replaceVariables = (
  text: string,
  vars: { name: string; firstName: string; lastName: string }
): string => {
  if (!text) return text;
  return text
    .replace(/\{name\}/gi, vars.name || "")
    .replace(/\{first_name\}/gi, vars.firstName || "")
    .replace(/\{last_name\}/gi, vars.lastName || "");
};

export { matchKeywords, processSpintax, replaceVariables };
