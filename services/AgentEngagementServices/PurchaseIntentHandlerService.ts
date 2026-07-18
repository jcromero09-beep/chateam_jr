/**
 * Service: PurchaseIntentHandlerService
 * Maneja un intento de compra detectado en un comentario.
 * Genera respuesta que guia a WhatsApp/DM sin ser spam.
 * Registra en AgentInteraction con type: 'dm' o marca whatsappTriggered.
 */

import OpenAI from "openai";
import UGCPostComment from "../../models/UGCPostComment";
import AgentIdentity from "../../models/AgentIdentity";
import AgentInteraction from "../../models/AgentInteraction";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface PurchaseIntentHandlerRequest {
  companyId: number;
  commentId: number;
  agentIdentityId: number;
  userId?: number;
}

interface PurchaseIntentHandlerResponse {
  handled: boolean;
  actionTaken: "whatsapp_redirect" | "dm_sent";
  responseContent: string;
  interactionId: number;
}

const PurchaseIntentHandlerService = async (
  params: PurchaseIntentHandlerRequest
): Promise<PurchaseIntentHandlerResponse> => {
  const { companyId, commentId, agentIdentityId, userId } = params;

  // 1. Cargar comentario
  const comment = await UGCPostComment.findOne({
    where: { id: commentId, companyId }
  });

  if (!comment) {
    throw new AppError("ERR_UGC_COMMENT_NOT_FOUND", 404);
  }

  // 2. Cargar identidad
  const identity = await AgentIdentity.findOne({
    where: { id: agentIdentityId, companyId }
  });

  if (!identity) {
    throw new AppError("ERR_AGENT_IDENTITY_NOT_FOUND", 404);
  }

  // 3. Deducir credito
  await DeductCreditsService({
    companyId,
    creditTypeKey: "agent_execution",
    amount: 1,
    description: `Manejo de intencion de compra para @${comment.authorUsername}`,
    userId,
    source: "ugc_intent",
    sourceId: String(comment.id)
  });

  try {
    // 4. Generar respuesta que guia a WhatsApp/DM
    const systemPrompt = `Eres ${identity.name}, un creador de contenido autentico.
Alguien mostro interes en comprar un producto/servicio.
Tu tarea es guiar amablemente a la persona hacia una conversacion privada
(DM o WhatsApp) sin sonar spam ni agresivo.

REGLAS:
1. Responde EN PERSONAJE
2. Se natural y amigable
3. Sugiere continuar la conversacion por DM o WhatsApp
4. NO uses lenguaje de venta agresivo
5. Manten tu estilo de comunicacion: ${identity.communicationStyle || "Natural y cercano"}
6. Responde SOLO el texto, sin JSON ni formato adicional`;

    const userPrompt = `Comentario del usuario interesado: "${comment.content}"
Autor: @${comment.authorUsername}

Genera una respuesta que los guie amablemente a continuar por mensaje privado:`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.8,
      max_tokens: 200
    });

    const responseContent = completion.choices[0]?.message?.content?.trim() || "";

    if (!responseContent) {
      throw new AppError("ERR_PURCHASE_INTENT_EMPTY_RESPONSE", 500);
    }

    // 5. Determinar accion: WhatsApp redirect o DM
    const actionTaken: "whatsapp_redirect" | "dm_sent" =
      Number(comment.purchaseIntentScore) >= 0.8
        ? "whatsapp_redirect"
        : "dm_sent";

    // 6. Registrar interaccion
    const interaction = await AgentInteraction.create({
      companyId,
      agentIdentityId,
      type: "dm",
      platform: comment.platform,
      content: responseContent,
      targetPostId: String(comment.socialPostId),
      targetUserId: comment.authorUsername,
      targetCommentId: comment.platformCommentId,
      sentiment: "purchase_intent",
      executionStatus: "pending",
      metadata: {
        commentId: comment.id,
        actionTaken,
        purchaseIntentScore: comment.purchaseIntentScore,
        authorUsername: comment.authorUsername
      }
    } as Partial<AgentInteraction> as AgentInteraction);

    // 7. Marcar whatsappTriggered si aplica
    if (actionTaken === "whatsapp_redirect") {
      await comment.triggerWhatsapp();
    }

    logger.info(
      `[PurchaseIntentHandlerService] Intencion de compra manejada: comment=${commentId}, ` +
      `action=${actionTaken}, agent=${identity.name}, company=${companyId}`
    );

    return {
      handled: true,
      actionTaken,
      responseContent,
      interactionId: interaction.id
    };
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[PurchaseIntentHandlerService] Error: ${errorMessage}`);
    throw new AppError("ERR_PURCHASE_INTENT_HANDLER_FAILED", 500);
  }
};

export default PurchaseIntentHandlerService;
