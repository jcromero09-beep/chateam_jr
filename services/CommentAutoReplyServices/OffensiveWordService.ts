/**
 * Service: OffensiveWordService
 * Evalua si un comentario contiene palabras ofensivas definidas por la campana.
 * Soporta matching exacto (palabra completa) y por contenido (substring).
 */

interface OffensiveEvalResult {
  isOffensive: boolean;
  matchedWord: string | null;
}

/**
 * Evalua si el texto del comentario contiene alguna de las palabras ofensivas.
 * @param commentText - Texto del comentario a evaluar
 * @param offensiveWords - Lista de palabras separadas por coma
 * @param matchingType - 'exact' para palabra completa, 'contains' para substring
 */
const evaluateOffensiveWords = (
  commentText: string,
  offensiveWords: string,
  matchingType: "exact" | "contains"
): OffensiveEvalResult => {
  if (!commentText || !offensiveWords) {
    return { isOffensive: false, matchedWord: null };
  }

  const normalizedComment = commentText.toLowerCase().trim();
  const wordList = offensiveWords
    .split(",")
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 0);

  if (wordList.length === 0) {
    return { isOffensive: false, matchedWord: null };
  }

  if (matchingType === "exact") {
    // Tokenizar el comentario en palabras individuales
    const commentTokens = normalizedComment
      .replace(/[^\w\sáéíóúñüÁÉÍÓÚÑÜ]/g, "")
      .split(/\s+/)
      .filter(t => t.length > 0);

    for (const word of wordList) {
      if (commentTokens.includes(word)) {
        return { isOffensive: true, matchedWord: word };
      }
    }
  } else {
    // matchingType === "contains"
    for (const word of wordList) {
      if (normalizedComment.includes(word)) {
        return { isOffensive: true, matchedWord: word };
      }
    }
  }

  return { isOffensive: false, matchedWord: null };
};

export { evaluateOffensiveWords, OffensiveEvalResult };
