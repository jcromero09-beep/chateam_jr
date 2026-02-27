/**
 * ConversationMemoryService
 * Gestiona la memoria contextual de conversaciones para evitar repeticiones
 * y mantener coherencia en preguntas/respuestas de la IA
 */

import Message from "../../models/Message.js";
import Ticket from "../../models/Ticket.js";

interface ConversationState {
  questionsAsked: string[];      // Preguntas que la IA ya hizo
  answersReceived: string[];     // Respuestas que el cliente dio
  topicsDiscussed: string[];     // Temas ya tratados
  lastResponse: string;          // Última respuesta de la IA
  collectedData: Record<string, any>; // Datos estructurados recolectados
}

class ConversationMemoryService {
  private memoryCache: Map<number, ConversationState> = new Map();

  /**
   * Obtiene el estado de la conversación para un ticket
   */
  async getConversationState(ticketId: number): Promise<ConversationState> {
    console.log("💾 [MEMORY-SVC] getConversationState ticketId:", ticketId);

    // Verificar cache
    if (this.memoryCache.has(ticketId)) {
      const cached = this.memoryCache.get(ticketId)!;
      console.log("💾 [MEMORY-SVC] ✅ Cache HIT - questionsAsked:", cached.questionsAsked?.length || 0, "answersReceived:", cached.answersReceived?.length || 0);
      return cached;
    }

    console.log("💾 [MEMORY-SVC] ❌ Cache MISS - Cargando desde DB...");

    // Cargar desde DB
    const messages = await Message.findAll({
      where: { ticketId },
      order: [["createdAt", "ASC"]],
      limit: 50 // últimos 50 mensajes
    });

    console.log("💾 [MEMORY-SVC] Mensajes cargados desde DB:", messages.length);

    const state: ConversationState = {
      questionsAsked: [],
      answersReceived: [],
      topicsDiscussed: [],
      lastResponse: "",
      collectedData: {}
    };

    // Analizar mensajes para extraer estado
    for (const msg of messages) {
      if (msg.fromMe) {
        // Mensaje de la IA/Bot
        state.lastResponse = msg.body;

        // Detectar si es una pregunta
        if (msg.body.includes("?") ||
            msg.body.toLowerCase().includes("podrías") ||
            msg.body.toLowerCase().includes("necesito saber") ||
            msg.body.toLowerCase().includes("cuál es") ||
            msg.body.toLowerCase().includes("dime")) {
          state.questionsAsked.push(msg.body);
        }
      } else {
        // Mensaje del cliente
        state.answersReceived.push(msg.body);
      }
    }

    console.log("💾 [MEMORY-SVC] Estado creado:", {
      questionsAsked: state.questionsAsked.length,
      answersReceived: state.answersReceived.length
    });

    // Cachear
    this.memoryCache.set(ticketId, state);
    console.log("💾 [MEMORY-SVC] Estado guardado en cache interno");
    return state;
  }

  /**
   * Actualiza el estado después de una interacción
   */
  async updateState(
    ticketId: number,
    update: Partial<ConversationState>
  ): Promise<void> {
    console.log("💾 [MEMORY-SVC] updateState ticketId:", ticketId, "keys:", Object.keys(update));

    const current = await this.getConversationState(ticketId);

    console.log("💾 [MEMORY-SVC] Estado actual - questions:", current.questionsAsked?.length || 0);

    const newState = { ...current, ...update };

    console.log("💾 [MEMORY-SVC] Nuevo estado - questions:", newState.questionsAsked?.length || 0);

    this.memoryCache.set(ticketId, newState);
    console.log("✅ [MEMORY-SVC] Estado actualizado en cache interno");
  }

  /**
   * Limpia el cache para un ticket (cuando se cierra)
   */
  clearCache(ticketId: number): void {
    this.memoryCache.delete(ticketId);
  }

  /**
   * Genera un resumen estructurado de lo que se ha recolectado
   */
  async getCollectedDataSummary(ticketId: number): Promise<string> {
    const state = await this.getConversationState(ticketId);

    if (Object.keys(state.collectedData).length === 0) {
      return "";
    }

    const lines: string[] = ["**INFORMACIÓN RECOLECTADA DEL CLIENTE:**"];
    for (const [key, value] of Object.entries(state.collectedData)) {
      lines.push(`- ${key}: ${value}`);
    }

    return lines.join("\n");
  }

  /**
   * Verifica si una pregunta ya fue hecha (similar)
   */
  async wasQuestionAsked(ticketId: number, question: string): Promise<boolean> {
    const state = await this.getConversationState(ticketId);

    // 🛡️ Protección: verificar que questionsAsked sea un array válido
    if (!Array.isArray(state.questionsAsked)) {
      return false;
    }

    // Normalizar pregunta
    const normalized = this.normalizeText(question);

    return state.questionsAsked.some(q => {
      const similarity = this.calculateSimilarity(normalized, this.normalizeText(q));
      return similarity > 0.7; // 70% similar
    });
  }

  /**
   * Extrae datos estructurados de las respuestas del cliente
   */
  async extractStructuredData(
    ticketId: number,
    category: string
  ): Promise<Record<string, any>> {
    const state = await this.getConversationState(ticketId);
    const data: Record<string, any> = {};

    // Patrones comunes según categoría
    const patterns: Record<string, RegExp[]> = {
      restaurante: [
        /reserva.*?(\d+)\s+personas?/i,
        /(\d{1,2}:\d{2}|[0-9]{1,2}\s*(?:am|pm))/i,
        /(lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i
      ],
      alquiler_autos: [
        /(?:del|desde)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
        /(?:hasta|al)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
        /(sedán|suv|camioneta|compacto)/i
      ],
      soporte: [
        /error\s+#?(\d+)/i,
        /orden\s+#?(\d+)/i,
        /(no funciona|no carga|problema con)/i
      ]
    };

    const relevantPatterns = patterns[category] || [];

    // 🛡️ Protección: verificar que answersReceived sea un array válido
    const answers = Array.isArray(state.answersReceived) ? state.answersReceived : [];

    for (const answer of answers) {
      for (let i = 0; i < relevantPatterns.length; i++) {
        const match = answer.match(relevantPatterns[i]);
        if (match) {
          data[`campo_${i + 1}`] = match[1] || match[0];
        }
      }
    }

    // Actualizar estado
    state.collectedData = { ...state.collectedData, ...data };
    this.memoryCache.set(ticketId, state);

    return data;
  }

  /**
   * Genera un prompt mejorado con memoria
   */
  async generateContextualPrompt(
    ticketId: number,
    basePrompt: string
  ): Promise<string> {
    const state = await this.getConversationState(ticketId);

    console.log("💾 [MEMORY-SVC] generateContextualPrompt ticketId:", ticketId, "questionsAsked:", state.questionsAsked?.length || 0);

    let enhancedPrompt = basePrompt + "\n\n";

    // Agregar información de lo que YA se preguntó
    // 🛡️ Protección: verificar que questionsAsked sea un array válido
    if (Array.isArray(state.questionsAsked) && state.questionsAsked.length > 0) {
      enhancedPrompt += "**IMPORTANTE - PREGUNTAS YA REALIZADAS:**\n";
      enhancedPrompt += "Ya preguntaste lo siguiente (NO REPETIR):\n";
      state.questionsAsked.slice(-3).forEach(q => {
        enhancedPrompt += `- ${q}\n`;
      });
      enhancedPrompt += "\n";
    }

    // Agregar resumen de datos recolectados
    const dataSummary = await this.getCollectedDataSummary(ticketId);
    if (dataSummary) {
      enhancedPrompt += dataSummary + "\n\n";
    }

    // Instrucciones anti-repetición
    enhancedPrompt += `
**REGLAS ESTRICTAS:**
1. NO repitas preguntas que ya hiciste
2. NO vuelvas a preguntar información que el cliente ya proporcionó
3. Si ya tienes toda la información necesaria, procede con la siguiente acción
4. Mantén coherencia: recuerda TODO lo que el cliente dijo en esta conversación
5. Si necesitas aclarar algo, reformula la pregunta de manera diferente
`;

    return enhancedPrompt;
  }

  // Helpers privados
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, "")
      .trim();
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}

export default new ConversationMemoryService();
