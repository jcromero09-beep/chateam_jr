/**
 * Service: CommentClassifierService
 * Clasifica un comentario de redes sociales usando OpenAI GPT-4o-mini.
 * Determina tipo (purchase_intent, question, praise, complaint, neutral, spam),
 * sentimiento y puntuacion de intencion de compra (0-1).
 * Consume 1 credito 'agent_execution' por clasificacion.
 */

import OpenAI from "openai";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { CommentType, CommentSentiment } from "../../models/UGCPostComment";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface CommentClassifierRequest {
  companyId: number;
  commentContent: string;
  authorUsername: string;
  postContext?: string;
  userId?: number;
}

interface CommentClassifierResponse {
  commentType: CommentType;
  sentiment: CommentSentiment;
  purchaseIntentScore: number;
}

const CommentClassifierService = async (
  params: CommentClassifierRequest
): Promise<CommentClassifierResponse> => {
  const { companyId, commentContent, authorUsername, postContext, userId } = params;

  if (!commentContent) {
    throw new AppError("ERR_COMMENT_CLASSIFIER_EMPTY_CONTENT", 400);
  }

  // Deducir credito
  await DeductCreditsService({
    companyId,
    creditTypeKey: "agent_execution",
    amount: 1,
    description: `Clasificacion de comentario de @${authorUsername}`,
    userId,
    source: "ugc_classifier",
    sourceId: String(authorUsername)
  });

  try {
    const systemPrompt = `Eres un clasificador de comentarios de redes sociales para un sistema CRM.
Analiza el comentario y clasifica segun tipo, sentimiento e intencion de compra.
SIEMPRE responde en formato JSON valido, sin markdown ni texto adicional.`;

    const userPrompt = `Clasifica este comentario de redes sociales:

Autor: @${authorUsername}
Comentario: "${commentContent}"
${postContext ? `Contexto del post: ${postContext}` : ""}

Responde con este JSON exacto:
{
  "commentType": "purchase_intent" | "question" | "praise" | "complaint" | "neutral" | "spam",
  "sentiment": "positive" | "neutral" | "negative",
  "purchaseIntentScore": 0.0 a 1.0
}

Criterios:
- purchase_intent: El usuario quiere comprar, preguntas de precio, "donde lo consigo", "lo quiero"
- question: Pregunta sobre el producto/servicio sin intencion clara de compra
- praise: Elogio, felicitacion, comentario positivo
- complaint: Queja, reclamo, comentario negativo sobre el producto/servicio
- neutral: Comentario generico sin intencion clara
- spam: Publicidad no solicitada, enlaces sospechosos, contenido irrelevante
- purchaseIntentScore: 0.0 = sin intencion, 1.0 = intencion maxima`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content;

    if (!responseText) {
      throw new AppError("ERR_COMMENT_CLASSIFIER_EMPTY_RESPONSE", 500);
    }

    const parsed = JSON.parse(responseText) as CommentClassifierResponse;

    // Validar tipos
    const validTypes: CommentType[] = [
      "purchase_intent", "question", "praise", "complaint", "neutral", "spam"
    ];
    const validSentiments: CommentSentiment[] = ["positive", "neutral", "negative"];

    if (!validTypes.includes(parsed.commentType)) {
      parsed.commentType = "neutral";
    }
    if (!validSentiments.includes(parsed.sentiment)) {
      parsed.sentiment = "neutral";
    }
    if (
      typeof parsed.purchaseIntentScore !== "number" ||
      parsed.purchaseIntentScore < 0 ||
      parsed.purchaseIntentScore > 1
    ) {
      parsed.purchaseIntentScore = 0;
    }

    logger.info(
      `[CommentClassifierService] Comentario clasificado: type=${parsed.commentType}, ` +
      `sentiment=${parsed.sentiment}, intentScore=${parsed.purchaseIntentScore}, ` +
      `author=@${authorUsername}, company=${companyId}`
    );

    return parsed;
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[CommentClassifierService] Error clasificando comentario: ${errorMessage}`);
    throw new AppError("ERR_COMMENT_CLASSIFIER_FAILED", 500);
  }
};

export default CommentClassifierService;
