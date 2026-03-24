/**
 * Service: GenerateSeedContentService
 * Genera 10 posts semilla para la memoria del agente usando GPT-4o-mini.
 * Estos posts sirven como historial ficticio para mantener consistencia
 * de personalidad en futuras generaciones de contenido.
 */

import OpenAI from "openai";
import AgentIdentity from "../../models/AgentIdentity";
import AgentMemory from "../../models/AgentMemory";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface GenerateSeedContentRequest {
  agentIdentityId: number;
  companyId: number;
  userId?: number;
}

interface GeneratedPost {
  content: string;
  context: string;
  platform: string;
}

const GenerateSeedContentService = async (
  params: GenerateSeedContentRequest
): Promise<AgentMemory[]> => {
  const { agentIdentityId, companyId, userId } = params;

  // 1. Cargar la identidad del agente con sus datos completos
  const identity = await AgentIdentity.findOne({
    where: {
      id: agentIdentityId,
      companyId
    }
  });

  if (!identity) {
    throw new AppError("ERR_AGENT_IDENTITY_NOT_FOUND", 404);
  }

  // 2. Deducir creditos
  await DeductCreditsService({
    companyId,
    creditTypeKey: "agent_execution",
    amount: 1,
    description: `Contenido semilla (10 posts) para agente: ${identity.name}`,
    userId,
    source: "agent_identity",
    sourceId: String(identity.id)
  });

  try {
    // 3. Generar 10 posts con OpenAI
    const platforms = identity.platformFocus?.length > 0
      ? identity.platformFocus.join(", ")
      : "Instagram, TikTok";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Eres ${identity.name}, una persona real que crea contenido en redes sociales.
Tu personalidad: ${identity.personalityTraits?.join(", ") || "autentica, creativa"}.
Tu estilo de comunicacion: ${identity.communicationStyle || "cercano y natural"}.
Tu nicho: ${identity.niche || "lifestyle"}.
Tus frases tipicas: ${identity.catchphrases?.join(", ") || "N/A"}.
Tus pilares de contenido: ${identity.contentPillars?.join(", ") || "lifestyle"}.

Genera EXACTAMENTE 10 posts que podrias haber publicado en los ultimos 3 meses.
Cada post debe reflejar tu personalidad unica y estilo de comunicacion.
Responde SOLO con un JSON valido, sin markdown ni texto adicional.`
        },
        {
          role: "user",
          content: `Genera 10 posts variados que ${identity.name} habria publicado recientemente.

Incluye una mezcla de:
- Posts sobre tu nicho (${identity.niche})
- Posts personales/lifestyle
- Posts interactuando con tu audiencia
- Posts promocionando productos/marcas (${identity.favoriteBrands?.join(", ") || "marcas del nicho"})
- Posts con opiniones/reflexiones

Plataformas: ${platforms}

Responde con este JSON:
{
  "posts": [
    {
      "content": "Texto completo del post con emojis y hashtags",
      "context": "Breve descripcion del contexto (ej: 'post despues de un evento', 'review de producto')",
      "platform": "instagram o tiktok"
    }
  ]
}

Los posts deben ser en espanol, con el tono y vocabulario de alguien de ${identity.city || "Ecuador"}.
Usa emojis, hashtags y el estilo casual de redes sociales.`
        }
      ],
      temperature: 0.9,
      max_tokens: 3000,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content;

    if (!responseText) {
      throw new AppError("ERR_AGENT_SEED_CONTENT_EMPTY_RESPONSE", 500);
    }

    // 4. Parsear la respuesta
    let parsed: { posts: GeneratedPost[] };
    try {
      parsed = JSON.parse(responseText) as { posts: GeneratedPost[] };
    } catch (parseError) {
      logger.error(
        `[GenerateSeedContentService] Error parseando JSON: ${responseText}`
      );
      throw new AppError("ERR_AGENT_SEED_CONTENT_INVALID_JSON", 500);
    }

    if (!parsed.posts || !Array.isArray(parsed.posts) || parsed.posts.length === 0) {
      throw new AppError("ERR_AGENT_SEED_CONTENT_NO_POSTS", 500);
    }

    // 5. Guardar cada post como AgentMemory
    const memories: AgentMemory[] = [];

    for (const post of parsed.posts) {
      const memory = await AgentMemory.create({
        companyId,
        agentIdentityId,
        memoryType: "past_post",
        content: post.content,
        context: post.context || null,
        extractedBy: "seed",
        confidence: 1.0,
        metadata: {
          platform: post.platform || "instagram",
          generatedAt: new Date().toISOString(),
          model: "gpt-4o-mini"
        }
      } as Partial<AgentMemory> as AgentMemory);

      memories.push(memory);
    }

    logger.info(
      `[GenerateSeedContentService] ${memories.length} posts semilla generados: ` +
      `identity=${agentIdentityId}, company=${companyId}`
    );

    return memories;
  } catch (error: unknown) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `[GenerateSeedContentService] Error generando contenido semilla: ${errorMessage}`
    );
    throw new AppError("ERR_AGENT_SEED_CONTENT_GENERATION_FAILED", 500);
  }
};

export default GenerateSeedContentService;
