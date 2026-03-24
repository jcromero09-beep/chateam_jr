/**
 * Service: AgentResponseGeneratorService
 * Genera una respuesta EN PERSONAJE usando la identidad y memoria del agente.
 * Carga identidad completa + ultimas 20 memorias de AgentMemory.
 * Consume 1 credito 'agent_execution' por generacion.
 */

import OpenAI from "openai";
import AgentIdentity from "../../models/AgentIdentity";
import AgentMemory from "../../models/AgentMemory";
import AgentProfilePhoto from "../../models/AgentProfilePhoto";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { CommentType } from "../../models/UGCPostComment";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface AgentResponseGeneratorRequest {
  companyId: number;
  agentIdentityId: number;
  commentContent: string;
  commentType: CommentType;
  postContext?: string;
  userId?: number;
}

interface AgentResponseGeneratorResponse {
  response: string;
  consistencyScore: number;
}

const AgentResponseGeneratorService = async (
  params: AgentResponseGeneratorRequest
): Promise<AgentResponseGeneratorResponse> => {
  const {
    companyId,
    agentIdentityId,
    commentContent,
    commentType,
    postContext,
    userId
  } = params;

  // 1. Cargar identidad completa
  const identity = await AgentIdentity.findOne({
    where: { id: agentIdentityId, companyId },
    include: [
      {
        model: AgentProfilePhoto,
        as: "profilePhotos",
        required: false
      }
    ]
  });

  if (!identity) {
    throw new AppError("ERR_AGENT_IDENTITY_NOT_FOUND", 404);
  }

  if (identity.status !== "active") {
    throw new AppError("ERR_AGENT_IDENTITY_NOT_ACTIVE", 400);
  }

  // 2. Cargar ultimas 20 memorias
  const memories = await AgentMemory.findAll({
    where: { agentIdentityId, companyId },
    order: [["createdAt", "DESC"]],
    limit: 20
  });

  // 3. Deducir credito
  await DeductCreditsService({
    companyId,
    creditTypeKey: "agent_execution",
    amount: 1,
    description: `Generacion de respuesta en personaje: ${identity.name}`,
    userId,
    source: "ugc_agent",
    sourceId: String(agentIdentityId)
  });

  // 4. Construir contexto de memorias
  const memoriesContext = memories.length > 0
    ? memories.map(m => `[${m.memoryType}] ${m.content}`).join("\n")
    : "Sin memorias previas registradas.";

  // 5. Construir prompt
  const traits = Array.isArray(identity.personalityTraits)
    ? identity.personalityTraits.join(", ")
    : "";
  const catchphrases = Array.isArray(identity.catchphrases)
    ? identity.catchphrases.join(", ")
    : "";
  const interests = Array.isArray(identity.interests)
    ? identity.interests.join(", ")
    : "";
  const responseStyleData = identity.responseStyle || {};

  try {
    const systemPrompt = `Eres ${identity.name}, ${identity.age || "?"} anos, de ${identity.city || "Latinoamerica"}.
Ocupacion: ${identity.occupation || "Creador de contenido"}.
Tu personalidad: ${traits}.
Tu estilo de comunicacion: ${identity.communicationStyle || "Natural y cercano"}.
Tus frases tipicas: ${catchphrases}.
Tus intereses: ${interests}.

REGLAS ESTRICTAS:
1. SIEMPRE responde EN PERSONAJE como ${identity.name}
2. Usa tu estilo de comunicacion natural, incluyendo emojis si es tu estilo
3. NO reveles que eres un bot o IA
4. Manten coherencia con tus memorias previas
5. La respuesta debe ser corta (1-3 oraciones), como un comentario real de redes sociales
6. Responde SOLO el texto de la respuesta, sin JSON ni formato adicional

Estilo de respuesta segun tipo:
- A halagos: ${(responseStyleData as Record<string, string>).to_compliments || "Agradecer con calidez"}
- A preguntas: ${(responseStyleData as Record<string, string>).to_questions || "Responder informativo"}
- A intencion de compra: ${(responseStyleData as Record<string, string>).to_purchase_intent || "Guiar sutilmente"}
- A criticas: ${(responseStyleData as Record<string, string>).to_criticism || "Responder con madurez"}

MEMORIAS PREVIAS:
${memoriesContext}`;

    const userPrompt = `Tipo de comentario: ${commentType}
${postContext ? `Contexto del post: ${postContext}` : ""}
Comentario a responder: "${commentContent}"

Responde EN PERSONAJE como ${identity.name}:`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.85,
      max_tokens: 300
    });

    const responseText = completion.choices[0]?.message?.content;

    if (!responseText) {
      throw new AppError("ERR_AGENT_RESPONSE_EMPTY", 500);
    }

    // Calcular score de consistencia basado en si uso catchphrases o patrones
    let consistencyScore = 0.7; // Base
    if (catchphrases) {
      const catchphraseList = Array.isArray(identity.catchphrases)
        ? identity.catchphrases
        : [];
      const usedCatchphrase = catchphraseList.some(
        (cp: string) => responseText.toLowerCase().includes(cp.toLowerCase())
      );
      if (usedCatchphrase) consistencyScore += 0.15;
    }
    if (responseText.length > 10 && responseText.length < 300) {
      consistencyScore += 0.1;
    }
    consistencyScore = Math.min(consistencyScore, 1.0);

    logger.info(
      `[AgentResponseGeneratorService] Respuesta generada: agent=${identity.name}, ` +
      `consistencyScore=${consistencyScore.toFixed(2)}, company=${companyId}`
    );

    return {
      response: responseText.trim(),
      consistencyScore: Number(consistencyScore.toFixed(2))
    };
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AgentResponseGeneratorService] Error generando respuesta: ${errorMessage}`);
    throw new AppError("ERR_AGENT_RESPONSE_GENERATION_FAILED", 500);
  }
};

export default AgentResponseGeneratorService;
