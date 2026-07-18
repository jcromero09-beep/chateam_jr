/**
 * Service: GenerateIdentityService
 * Genera una identidad completa de agente virtual usando OpenAI GPT-4o.
 * Incluye personalidad, estilo de comunicacion, backstory y descripcion fisica.
 *
 * Consume 1 credito de tipo 'agent_execution' por generacion.
 */

import OpenAI from "openai";
import AgentIdentity from "../../models/AgentIdentity";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import CalculateCreditCostService from "../AICreditServices/CalculateCreditCostService";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface GenerateIdentityRequest {
  companyId: number;
  userId: number;
  niche: string;
  gender: string;
  ageRange: string;
  country?: string;
  platformFocus?: string[];
  style?: string;
}

interface GeneratedPersonality {
  name: string;
  username_suggestion: string;
  age: number;
  city: string;
  occupation: string;
  bio_instagram: string;
  bio_tiktok: string;
  personality_traits: string[];
  communication_style: string;
  writing_examples: string[];
  interests: string[];
  catchphrases: string[];
  favorite_brands: string[];
  content_pillars: string[];
  active_hours: Record<string, unknown>;
  response_style: {
    to_compliments: string;
    to_questions: string;
    to_purchase_intent: string;
    to_criticism: string;
  };
  physical_description: {
    ethnicity: string;
    hair: string;
    style: string;
    age_appearance: string;
    distinguishing_features: string;
  };
  backstory: string;
}

const GenerateIdentityService = async (
  params: GenerateIdentityRequest
): Promise<AgentIdentity> => {
  const {
    companyId,
    userId,
    niche,
    gender,
    ageRange,
    country = "Ecuador",
    platformFocus = ["instagram", "tiktok"],
    style = "ugc_creator"
  } = params;

  if (!niche || !gender || !ageRange) {
    throw new AppError("ERR_AGENT_IDENTITY_MISSING_FIELDS", 400);
  }

  // 1. Calcular costo dinámico según proveedor configurado
  const cost = await CalculateCreditCostService({
    companyId,
    action: 'agent_execution'
  });

  // 2. Verificar y deducir creditos según el costo calculado
  await DeductCreditsService({
    companyId,
    creditTypeKey: cost.creditTypeKey,
    amount: cost.amount,
    description: `Generación de identidad de agente UGC - nicho: ${niche} (${cost.providerName})`,
    userId,
    source: "agent_identity",
    sourceId: "new"
  });

  // 2. Crear registro con estado 'generating'
  const identity = await AgentIdentity.create({
    companyId,
    name: "Generando...",
    niche,
    platformFocus,
    status: "generating",
    createdBy: userId,
    metadata: {
      gender,
      ageRange,
      country,
      style,
      generationModel: "gpt-5.5"
    }
  } as Partial<AgentIdentity> as AgentIdentity);

  try {
    // 3. Generar personalidad con OpenAI
    const systemPrompt = `Eres un experto en creacion de personajes ficticios para redes sociales y UGC (User Generated Content).
Tu tarea es crear una identidad completa y coherente para un agente virtual que actuara como creador de contenido.
El personaje debe ser realista, con personalidad unica, y adaptado al mercado latinoamericano.
SIEMPRE responde en formato JSON valido, sin markdown ni texto adicional.`;

    const userPrompt = `Crea una identidad completa para un agente virtual con estas caracteristicas:

- Nicho: ${niche}
- Genero: ${gender}
- Rango de edad: ${ageRange}
- Pais: ${country}
- Plataformas principales: ${platformFocus.join(", ")}
- Estilo: ${style}

Genera un JSON con EXACTAMENTE esta estructura:
{
  "name": "Nombre completo realista del pais",
  "username_suggestion": "username creativo para redes (sin @)",
  "age": 25,
  "city": "Ciudad real de ${country}",
  "occupation": "Ocupacion relacionada al nicho",
  "bio_instagram": "Bio de Instagram (max 150 chars, con emojis)",
  "bio_tiktok": "Bio de TikTok (max 80 chars, con emojis)",
  "personality_traits": ["rasgo1", "rasgo2", "rasgo3", "rasgo4", "rasgo5"],
  "communication_style": "Descripcion detallada de como habla y escribe",
  "writing_examples": [
    "Ejemplo de caption/post 1 en su voz unica",
    "Ejemplo de caption/post 2 en su voz unica",
    "Ejemplo de caption/post 3 en su voz unica"
  ],
  "interests": ["interes1", "interes2", "interes3", "interes4", "interes5", "interes6"],
  "catchphrases": ["frase1", "frase2", "frase3"],
  "favorite_brands": ["marca1", "marca2", "marca3"],
  "content_pillars": ["pilar1", "pilar2", "pilar3"],
  "active_hours": {
    "weekdays": "7am-9am, 12pm-2pm, 7pm-10pm",
    "weekends": "10am-1pm, 5pm-11pm",
    "peak_engagement": "8pm-10pm"
  },
  "response_style": {
    "to_compliments": "Como responde a halagos",
    "to_questions": "Como responde a preguntas sobre productos",
    "to_purchase_intent": "Como responde cuando alguien quiere comprar",
    "to_criticism": "Como responde a criticas o comentarios negativos"
  },
  "physical_description": {
    "ethnicity": "Etnia/apariencia acorde al pais",
    "hair": "Color y estilo de cabello",
    "style": "Estilo de vestimenta habitual",
    "age_appearance": "Como luce fisicamente para su edad",
    "distinguishing_features": "Rasgos distintivos (tatuajes, piercings, etc)"
  },
  "backstory": "Historia de fondo de 3-4 oraciones: de donde viene, por que empezo a crear contenido, que la motiva"
}

IMPORTANTE:
- El nombre debe ser realista para ${country}
- La edad debe estar en el rango ${ageRange}
- Todo el contenido debe estar en espanol
- Los writing_examples deben reflejar la personalidad y el nicho
- Las marcas deben ser populares en ${country} y relevantes al nicho`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.9,
      max_tokens: 2000,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content;

    if (!responseText) {
      throw new AppError("ERR_AGENT_IDENTITY_EMPTY_RESPONSE", 500);
    }

    // 4. Parsear respuesta JSON
    let personality: GeneratedPersonality;
    try {
      personality = JSON.parse(responseText) as GeneratedPersonality;
    } catch (parseError) {
      logger.error(
        `[GenerateIdentityService] Error parseando JSON de OpenAI: ${responseText}`
      );
      throw new AppError("ERR_AGENT_IDENTITY_INVALID_JSON", 500);
    }

    // 5. Actualizar la identidad con todos los campos generados
    await identity.update({
      name: personality.name,
      usernameSuggestion: personality.username_suggestion,
      age: personality.age,
      city: personality.city,
      occupation: personality.occupation,
      bioInstagram: personality.bio_instagram,
      bioTiktok: personality.bio_tiktok,
      personalityTraits: personality.personality_traits || [],
      communicationStyle: personality.communication_style,
      writingExamples: personality.writing_examples || [],
      interests: personality.interests || [],
      catchphrases: personality.catchphrases || [],
      favoriteBrands: personality.favorite_brands || [],
      contentPillars: personality.content_pillars || [],
      activeHours: personality.active_hours || {},
      responseStyle: personality.response_style || {},
      physicalDescription: personality.physical_description || {},
      backstory: personality.backstory,
      status: "active"
    });

    await identity.reload();

    logger.info(
      `[GenerateIdentityService] Identidad generada exitosamente: id=${identity.id}, ` +
      `name=${identity.name}, company=${companyId}, nicho=${niche}`
    );

    return identity;
  } catch (error: unknown) {
    // Si falla, marcar como draft para que se pueda reintentar
    await identity.update({ status: "draft" });

    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `[GenerateIdentityService] Error generando identidad: ${errorMessage}`
    );
    throw new AppError("ERR_AGENT_IDENTITY_GENERATION_FAILED", 500);
  }
};

export default GenerateIdentityService;
