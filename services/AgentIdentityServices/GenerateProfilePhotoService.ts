/**
 * Service: GenerateProfilePhotoService
 * Genera fotos de perfil para agentes virtuales usando DALL-E 3.
 * Primero genera un prompt optimizado a partir de la descripcion fisica,
 * luego llama a DALL-E 3 para crear la imagen.
 *
 * Genera dos variantes:
 * 1. Foto de perfil cuadrada (1024x1024) - photoType: 'profile'
 * 2. Foto para stories vertical (1024x1792) - photoType: 'story_casual'
 */

import OpenAI from "openai";
import AgentIdentity from "../../models/AgentIdentity";
import AgentProfilePhoto from "../../models/AgentProfilePhoto";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import CalculateCreditCostService from "../AICreditServices/CalculateCreditCostService";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface GenerateProfilePhotoRequest {
  agentIdentityId: number;
  companyId: number;
  userId?: number;
}

interface GenerateProfilePhotoResponse {
  profilePhoto: AgentProfilePhoto;
  storyPhoto: AgentProfilePhoto | null;
}

const GenerateProfilePhotoService = async (
  params: GenerateProfilePhotoRequest
): Promise<GenerateProfilePhotoResponse> => {
  const { agentIdentityId, companyId, userId } = params;

  // 1. Cargar la identidad del agente
  const identity = await AgentIdentity.findOne({
    where: {
      id: agentIdentityId,
      companyId
    }
  });

  if (!identity) {
    throw new AppError("ERR_AGENT_IDENTITY_NOT_FOUND", 404);
  }

  // 2. Calcular costo dinámico según proveedor configurado (imagen 1024x1024)
  const imageCost = await CalculateCreditCostService({
    companyId,
    action: 'image_generation',
    metadata: { imageSize: '1024x1024' }
  });

  // 3. Deducir creditos para generacion de imagen
  await DeductCreditsService({
    companyId,
    creditTypeKey: imageCost.creditTypeKey,
    amount: imageCost.amount,
    description: `Foto de perfil para agente: ${identity.name} (${imageCost.providerName})`,
    userId,
    source: "image_gen",
    sourceId: String(identity.id)
  });

  const physicalDesc = identity.physicalDescription || {};
  const niche = identity.niche || "lifestyle";
  const gender = (identity.metadata as Record<string, unknown>)?.gender || "Femenino";

  try {
    // 3. Generar prompt DALL-E optimizado usando GPT-4o-mini
    const promptCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Eres un experto en generar prompts para DALL-E 3 que produzcan retratos realistas de personas.
Genera prompts en ingles que creen fotos naturales tipo selfie/retrato para redes sociales.
NUNCA incluyas texto, logos o watermarks en el prompt.
El resultado debe parecer una foto real de Instagram, no una ilustracion.
Responde SOLO con el prompt, sin explicaciones ni formato adicional.`
        },
        {
          role: "user",
          content: `Genera un prompt de DALL-E 3 para una foto de perfil de redes sociales con estas caracteristicas:

Genero: ${gender}
Nombre: ${identity.name}
Edad: ${identity.age || "25"}
Ciudad: ${identity.city || "Quito"}
Nicho: ${niche}
Descripcion fisica:
- Etnia: ${(physicalDesc as Record<string, string>).ethnicity || "Latina"}
- Cabello: ${(physicalDesc as Record<string, string>).hair || "Cabello oscuro"}
- Estilo: ${(physicalDesc as Record<string, string>).style || "Casual moderno"}
- Apariencia: ${(physicalDesc as Record<string, string>).age_appearance || "Joven"}
- Rasgos distintivos: ${(physicalDesc as Record<string, string>).distinguishing_features || "Ninguno"}

El prompt debe generar una foto tipo selfie/retrato natural, con buena iluminacion,
que parezca una foto real de un creador de contenido de ${niche}.
Fondo acorde a su estilo de vida. Expresion amigable y autentica.`
        }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    const dallePrompt = promptCompletion.choices[0]?.message?.content || "";

    if (!dallePrompt) {
      throw new AppError("ERR_AGENT_PHOTO_PROMPT_EMPTY", 500);
    }

    // 4. Generar foto de perfil cuadrada (1024x1024)
    const profileImageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: dallePrompt,
      n: 1,
      size: "1024x1024",
      quality: "hd",
      style: "natural"
    });

    const profileImageUrl = profileImageResponse.data[0]?.url;
    const profileRevisedPrompt = profileImageResponse.data[0]?.revised_prompt;

    if (!profileImageUrl) {
      throw new AppError("ERR_AGENT_PHOTO_GENERATION_FAILED", 500);
    }

    // Desactivar fotos anteriores del mismo tipo
    await AgentProfilePhoto.update(
      { isActive: false },
      {
        where: {
          agentIdentityId,
          companyId,
          photoType: "profile",
          isActive: true
        }
      }
    );

    // Guardar foto de perfil
    const profilePhoto = await AgentProfilePhoto.create({
      companyId,
      agentIdentityId,
      photoType: "profile",
      url: profileImageUrl,
      originalUrl: profileImageUrl,
      dallePrompt,
      dalleRevisedPrompt: profileRevisedPrompt || null,
      isActive: true,
      version: 1,
      metadata: {
        model: "dall-e-3",
        size: "1024x1024",
        quality: "hd",
        style: "natural"
      }
    } as Partial<AgentProfilePhoto> as AgentProfilePhoto);

    logger.info(
      `[GenerateProfilePhotoService] Foto de perfil generada: identity=${agentIdentityId}, ` +
      `photo=${profilePhoto.id}, company=${companyId}`
    );

    // 5. Generar variante para stories (1024x1792)
    let storyPhoto: AgentProfilePhoto | null = null;

    try {
      // Calcular costo para imagen de story (tamaño diferente)
      const storyImageCost = await CalculateCreditCostService({
        companyId,
        action: 'image_generation',
        metadata: { imageSize: '1024x1024' } // Usar mismo precio base
      });

      // Deducir credito adicional para la segunda imagen
      await DeductCreditsService({
        companyId,
        creditTypeKey: storyImageCost.creditTypeKey,
        amount: storyImageCost.amount,
        description: `Foto story casual para agente: ${identity.name} (${storyImageCost.providerName})`,
        userId,
        source: "image_gen",
        sourceId: String(identity.id)
      });

      const storyPrompt = `${dallePrompt} Full body shot, standing naturally, lifestyle photography, vertical composition for social media stories.`;

      const storyImageResponse = await openai.images.generate({
        model: "dall-e-3",
        prompt: storyPrompt,
        n: 1,
        size: "1024x1792",
        quality: "hd",
        style: "natural"
      });

      const storyImageUrl = storyImageResponse.data[0]?.url;
      const storyRevisedPrompt = storyImageResponse.data[0]?.revised_prompt;

      if (storyImageUrl) {
        // Desactivar fotos anteriores del mismo tipo
        await AgentProfilePhoto.update(
          { isActive: false },
          {
            where: {
              agentIdentityId,
              companyId,
              photoType: "story_casual",
              isActive: true
            }
          }
        );

        storyPhoto = await AgentProfilePhoto.create({
          companyId,
          agentIdentityId,
          photoType: "story_casual",
          url: storyImageUrl,
          originalUrl: storyImageUrl,
          dallePrompt: storyPrompt,
          dalleRevisedPrompt: storyRevisedPrompt || null,
          isActive: true,
          version: 1,
          metadata: {
            model: "dall-e-3",
            size: "1024x1792",
            quality: "hd",
            style: "natural"
          }
        } as Partial<AgentProfilePhoto> as AgentProfilePhoto);

        logger.info(
          `[GenerateProfilePhotoService] Foto story generada: identity=${agentIdentityId}, ` +
          `photo=${storyPhoto.id}, company=${companyId}`
        );
      }
    } catch (storyError: unknown) {
      // Si falla la foto de story, no es critico — solo registrar el warning
      const storyMsg = storyError instanceof Error ? storyError.message : String(storyError);
      logger.warn(
        `[GenerateProfilePhotoService] No se pudo generar foto story: ${storyMsg}`
      );
    }

    return { profilePhoto, storyPhoto };
  } catch (error: unknown) {
    if (error instanceof AppError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `[GenerateProfilePhotoService] Error generando foto: ${errorMessage}`
    );
    throw new AppError("ERR_AGENT_PHOTO_GENERATION_FAILED", 500);
  }
};

export default GenerateProfilePhotoService;
