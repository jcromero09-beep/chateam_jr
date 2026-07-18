/**
 * Service: AgentMemoryExtractorService
 * Extrae datos nuevos de una respuesta del agente para mantener coherencia.
 * Usa GPT-4o-mini para analizar la respuesta y extraer opiniones,
 * datos personales o preferencias reveladas.
 * Crea registros AgentMemory con extractedBy: 'haiku_auto'.
 */

import OpenAI from "openai";
import AgentMemory, { AgentMemoryType } from "../../models/AgentMemory";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface AgentMemoryExtractorRequest {
  companyId: number;
  agentIdentityId: number;
  responseContent: string;
  context?: string;
}

interface MemoryFragment {
  memoryType: AgentMemoryType;
  content: string;
  confidence: number;
}

interface AgentMemoryExtractorResponse {
  memoriesExtracted: number;
  memories: AgentMemory[];
}

const AgentMemoryExtractorService = async (
  params: AgentMemoryExtractorRequest
): Promise<AgentMemoryExtractorResponse> => {
  const { companyId, agentIdentityId, responseContent, context } = params;

  if (!responseContent) {
    return { memoriesExtracted: 0, memories: [] };
  }

  try {
    const systemPrompt = `Eres un extractor de memorias para agentes virtuales de redes sociales.
Analiza la respuesta del agente y extrae cualquier informacion nueva que deba recordarse
para mantener la coherencia del personaje en futuras interacciones.
SIEMPRE responde en formato JSON valido, sin markdown ni texto adicional.`;

    const userPrompt = `Analiza esta respuesta de un agente virtual y extrae opiniones, datos personales o preferencias reveladas:

Respuesta del agente: "${responseContent}"
${context ? `Contexto: ${context}` : ""}

Responde con este JSON:
{
  "memories": [
    {
      "memoryType": "opinion" | "personal_fact" | "preference" | "interaction",
      "content": "Descripcion de la memoria extraida",
      "confidence": 0.0 a 1.0
    }
  ]
}

REGLAS:
- Solo extrae memorias si hay informacion NUEVA y relevante
- No extraer informacion obvia o redundante
- Si no hay nada nuevo que extraer, devuelve { "memories": [] }
- Cada memoria debe ser una oracion concisa`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content;

    if (!responseText) {
      return { memoriesExtracted: 0, memories: [] };
    }

    const parsed = JSON.parse(responseText) as { memories: MemoryFragment[] };

    if (!parsed.memories || !Array.isArray(parsed.memories) || parsed.memories.length === 0) {
      return { memoriesExtracted: 0, memories: [] };
    }

    // Validar y crear memorias
    const validTypes: AgentMemoryType[] = [
      "past_post", "opinion", "personal_fact", "interaction", "preference"
    ];

    const createdMemories: AgentMemory[] = [];

    for (const fragment of parsed.memories) {
      if (!fragment.content || fragment.content.trim().length === 0) continue;

      const memoryType = validTypes.includes(fragment.memoryType)
        ? fragment.memoryType
        : "interaction";

      const confidence = (
        typeof fragment.confidence === "number" &&
        fragment.confidence >= 0 &&
        fragment.confidence <= 1
      )
        ? fragment.confidence
        : 0.7;

      const memory = await AgentMemory.create({
        companyId,
        agentIdentityId,
        memoryType,
        content: fragment.content.trim(),
        context: context || "auto-extracted from response",
        extractedBy: "haiku_auto",
        confidence,
        metadata: { source: "AgentMemoryExtractorService" }
      } as Partial<AgentMemory> as AgentMemory);

      createdMemories.push(memory);
    }

    logger.info(
      `[AgentMemoryExtractorService] Extraidas ${createdMemories.length} memorias: ` +
      `agentIdentity=${agentIdentityId}, company=${companyId}`
    );

    return {
      memoriesExtracted: createdMemories.length,
      memories: createdMemories
    };
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AgentMemoryExtractorService] Error extrayendo memorias: ${errorMessage}`);
    // No lanzar error — la extraccion de memorias no es critica
    return { memoriesExtracted: 0, memories: [] };
  }
};

export default AgentMemoryExtractorService;
