/**
 * Service: WebhookCommentProcessor
 * Procesa comentarios entrantes desde webhooks de Facebook/Instagram.
 * Busca campanas activas que coincidan, evalua palabras ofensivas,
 * ejecuta keyword matching o IA, y envia respuestas via Graph API.
 * Nunca lanza excepciones al webhook handler — todo error se captura y loguea.
 */

import { Op } from "sequelize";
import CommentAutoReplyCampaign from "../../models/CommentAutoReplyCampaign";
import CommentAutoReplyLog from "../../models/CommentAutoReplyLog";
import logger from "../../utils/logger";

import { matchKeywords, processSpintax, replaceVariables } from "./KeywordMatcherService";
import { evaluateOffensiveWords } from "./OffensiveWordService";
import {
  replyToComment,
  sendPrivateReply,
  likeComment,
  hideComment,
  deleteComment,
  blockCommenter,
  replyToIGComment
} from "./CommentReplyExecutor";

import CommentClassifierService from "../AgentEngagementServices/CommentClassifierService";
import AgentResponseGeneratorService from "../AgentEngagementServices/AgentResponseGeneratorService";

interface WebhookCommentData {
  pageId: string;
  postId: string;
  commentId: string;
  commentText: string;
  commenterName: string;
  commenterId: string;
  commentedAt: Date;
  platform: "facebook" | "instagram";
}

/**
 * Genera un delay aleatorio entre min y max segundos.
 */
const randomDelay = (minSeconds: number, maxSeconds: number): Promise<void> => {
  const ms = (Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds) * 1000;
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Extrae firstName y lastName de un nombre completo.
 */
const parseCommenterName = (name: string): { firstName: string; lastName: string } => {
  const parts = (name || "").trim().split(/\s+/);
  return {
    firstName: parts[0] || "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : ""
  };
};

/**
 * Procesa un comentario entrante contra todas las campanas activas que coincidan.
 * Flujo:
 * 1. Buscar campanas activas por postId, pageId o campaignType='all'
 * 2. Para cada campana: evaluar ofensivas, keywords, IA o default
 * 3. Ejecutar acciones (reply, private, like, hide) via Graph API
 * 4. Registrar log y actualizar contadores
 */
const processIncomingComment = async (data: WebhookCommentData): Promise<void> => {
  const { pageId, postId, commentId, commentText, commenterName, commenterId, commentedAt, platform } = data;

  try {
    // 1. Buscar campanas activas para este post/pagina
    const campaigns = await CommentAutoReplyCampaign.findAll({
      where: {
        pageId,
        status: "active",
        platform,
        [Op.or]: [
          { postId },
          { campaignType: "page" },
          { campaignType: "all" }
        ]
      }
    });

    if (campaigns.length === 0) {
      logger.info(`[WebhookProcessor] Sin campanas activas para pageId=${pageId}, postId=${postId}`);
      return;
    }

    const { firstName, lastName } = parseCommenterName(commenterName);
    const vars = { name: commenterName, firstName, lastName };

    // 2. Procesar cada campana
    for (const campaign of campaigns) {
      try {
        await processCampaign(campaign, {
          commentId,
          postId,
          commentText,
          commenterName,
          commenterId,
          commentedAt,
          platform,
          vars
        });
      } catch (campaignError: unknown) {
        const errMsg = campaignError instanceof Error ? campaignError.message : String(campaignError);
        logger.error(
          `[WebhookProcessor] Error procesando campana ${campaign.id} para comentario ${commentId}: ${errMsg}`
        );
      }
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[WebhookProcessor] Error general procesando comentario ${commentId}: ${errMsg}`);
  }
};

interface ProcessCampaignContext {
  commentId: string;
  postId: string;
  commentText: string;
  commenterName: string;
  commenterId: string;
  commentedAt: Date;
  platform: "facebook" | "instagram";
  vars: { name: string; firstName: string; lastName: string };
}

/**
 * Procesa un comentario contra una campana individual.
 */
const processCampaign = async (
  campaign: CommentAutoReplyCampaign,
  ctx: ProcessCampaignContext
): Promise<void> => {
  const { commentId, postId, commentText, commenterName, commenterId, commentedAt, platform, vars } = ctx;
  const accessToken = campaign.pageAccessToken;

  // a. Skip si el que comenta es la misma pagina
  if (commenterId === campaign.pageId) {
    return;
  }

  // b. Si multipleReply=false, verificar si ya se respondio a este commenter en esta campana
  if (!campaign.multipleReply) {
    const existingLog = await CommentAutoReplyLog.findOne({
      where: {
        campaignId: campaign.id,
        commenterId,
        companyId: campaign.companyId,
        publicReplyStatus: "sent"
      }
    });

    if (existingLog) {
      logger.info(
        `[WebhookProcessor] Commenter ${commenterId} ya respondido en campana ${campaign.id}, saltando`
      );
      return;
    }
  }

  // c. Delay si esta habilitado
  if (campaign.delayEnabled) {
    await randomDelay(campaign.delayMinSeconds, campaign.delayMaxSeconds);
  }

  // Variables para el log
  let publicReplyText: string | null = null;
  let publicReplyId: string | null = null;
  let publicReplyStatus: "sent" | "failed" | "skipped" = "skipped";
  let privateReplyText: string | null = null;
  let privateReplyId: string | null = null;
  let privateReplyStatus: "sent" | "failed" | "skipped" = "skipped";
  let wasLiked = false;
  let wasHidden = false;
  let wasDeleted = false;
  let wasBlocked = false;
  let matchedKeyword: string | null = null;
  let replySource: "keyword" | "ai" | "default" | "offensive" = "default";
  let aiClassification: string | null = null;
  let aiSentiment: string | null = null;
  let aiPurchaseIntentScore: number | null = null;
  let errorMessage: string | null = null;

  // d. Evaluar palabras ofensivas
  if (campaign.offensiveWordsEnabled && campaign.offensiveWords) {
    const offensiveResult = evaluateOffensiveWords(
      commentText,
      campaign.offensiveWords,
      campaign.triggerMatchingType
    );

    if (offensiveResult.isOffensive) {
      replySource = "offensive";
      matchedKeyword = offensiveResult.matchedWord;

      // Ejecutar accion ofensiva
      try {
        if (campaign.offensiveAction === "hide") {
          await hideComment(commentId, accessToken);
          wasHidden = true;
        } else if (campaign.offensiveAction === "delete") {
          await deleteComment(commentId, accessToken);
          wasDeleted = true;
        } else if (campaign.offensiveAction === "block") {
          await hideComment(commentId, accessToken);
          wasHidden = true;
          await blockCommenter(campaign.pageId, commenterId, accessToken);
          wasBlocked = true;
        }
      } catch (actionError: unknown) {
        errorMessage = actionError instanceof Error ? actionError.message : String(actionError);
      }

      // Enviar mensaje privado ofensivo si esta configurado
      if (campaign.offensivePrivateMessage) {
        try {
          const processedMsg = replaceVariables(processSpintax(campaign.offensivePrivateMessage), vars);
          const result = await sendPrivateReply(commentId, processedMsg, accessToken);
          privateReplyText = processedMsg;
          privateReplyId = result.id || null;
          privateReplyStatus = "sent";
        } catch (privError: unknown) {
          privateReplyStatus = "failed";
          errorMessage = (errorMessage || "") + " | " + (privError instanceof Error ? privError.message : String(privError));
        }
      }

      // Crear log y actualizar contadores para ofensivo
      await createLogEntry(campaign, {
        commentId, postId, commentText, commenterName, commenterId, commentedAt,
        publicReplyText, publicReplyId, publicReplyStatus,
        privateReplyText, privateReplyId, privateReplyStatus,
        wasLiked, wasHidden, wasDeleted, wasBlocked,
        matchedKeyword, replySource, aiClassification, aiSentiment, aiPurchaseIntentScore,
        errorMessage
      });
      await updateCampaignCounters(campaign, { wasHidden, wasDeleted, wasLiked, publicReplyStatus, privateReplyStatus });
      return;
    }
  }

  // e. Intentar match por keywords
  const keywordMatch = matchKeywords(commentText, campaign.keywordRules || [], campaign.triggerMatchingType);

  if (keywordMatch) {
    replySource = "keyword";
    matchedKeyword = keywordMatch.keywords.join(", ");
    publicReplyText = keywordMatch.publicReply || null;
    privateReplyText = keywordMatch.privateReply || null;
  } else if (campaign.aiEnabled && campaign.aiAgentIdentityId) {
    // f. Usar IA para clasificar y generar respuesta
    replySource = "ai";
    try {
      const classification = await CommentClassifierService({
        companyId: campaign.companyId,
        commentContent: commentText,
        authorUsername: commenterName,
        postContext: campaign.postDescription || undefined
      });

      aiClassification = classification.commentType;
      aiSentiment = classification.sentiment;
      aiPurchaseIntentScore = classification.purchaseIntentScore;

      const aiResponse = await AgentResponseGeneratorService({
        companyId: campaign.companyId,
        agentIdentityId: campaign.aiAgentIdentityId,
        commentContent: commentText,
        commentType: classification.commentType,
        postContext: campaign.postDescription || undefined
      });

      publicReplyText = aiResponse.response;
    } catch (aiError: unknown) {
      const aiMsg = aiError instanceof Error ? aiError.message : String(aiError);
      logger.error(`[WebhookProcessor] Error IA campana ${campaign.id}: ${aiMsg}`);
      // Fallback a respuesta por defecto
      publicReplyText = campaign.defaultPublicReply || null;
      privateReplyText = campaign.defaultPrivateReply || null;
      replySource = "default";
    }
  } else {
    // g. Usar respuestas por defecto
    replySource = "default";
    publicReplyText = campaign.defaultPublicReply || null;
    privateReplyText = campaign.defaultPrivateReply || null;
  }

  // Procesar spintax y variables en los textos de respuesta
  if (publicReplyText) {
    publicReplyText = replaceVariables(processSpintax(publicReplyText), vars);
  }
  if (privateReplyText) {
    privateReplyText = replaceVariables(processSpintax(privateReplyText), vars);
  }

  // h. Ejecutar respuesta publica
  if (campaign.sendPublicReply && publicReplyText) {
    try {
      const replyFn = platform === "instagram" ? replyToIGComment : replyToComment;
      const result = await replyFn(commentId, publicReplyText, accessToken);
      publicReplyId = result.id || null;
      publicReplyStatus = "sent";
    } catch (replyError: unknown) {
      publicReplyStatus = "failed";
      errorMessage = replyError instanceof Error ? replyError.message : String(replyError);
    }
  }

  // i. Ejecutar respuesta privada (solo Facebook soporta private_replies)
  if (campaign.sendPrivateReply && privateReplyText && platform === "facebook") {
    try {
      const result = await sendPrivateReply(commentId, privateReplyText, accessToken);
      privateReplyId = result.id || null;
      privateReplyStatus = "sent";
    } catch (privError: unknown) {
      privateReplyStatus = "failed";
      errorMessage = (errorMessage || "") + " | " + (privError instanceof Error ? privError.message : String(privError));
    }
  }

  // j. Auto-like
  if (campaign.autoLikeComment) {
    try {
      await likeComment(commentId, accessToken);
      wasLiked = true;
    } catch (likeError: unknown) {
      logger.error(
        `[WebhookProcessor] Error dando like en campana ${campaign.id}: ${likeError instanceof Error ? likeError.message : String(likeError)}`
      );
    }
  }

  // k. Ocultar despues de responder
  if (campaign.hideCommentAfterReply) {
    try {
      await hideComment(commentId, accessToken);
      wasHidden = true;
    } catch (hideError: unknown) {
      logger.error(
        `[WebhookProcessor] Error ocultando en campana ${campaign.id}: ${hideError instanceof Error ? hideError.message : String(hideError)}`
      );
    }
  }

  // l. Crear log
  await createLogEntry(campaign, {
    commentId, postId, commentText, commenterName, commenterId, commentedAt,
    publicReplyText, publicReplyId, publicReplyStatus,
    privateReplyText, privateReplyId, privateReplyStatus,
    wasLiked, wasHidden, wasDeleted, wasBlocked,
    matchedKeyword, replySource, aiClassification, aiSentiment, aiPurchaseIntentScore,
    errorMessage
  });

  // m. Actualizar contadores
  await updateCampaignCounters(campaign, { wasHidden, wasDeleted, wasLiked, publicReplyStatus, privateReplyStatus });
};

interface LogEntryData {
  commentId: string;
  postId: string;
  commentText: string;
  commenterName: string;
  commenterId: string;
  commentedAt: Date;
  publicReplyText: string | null;
  publicReplyId: string | null;
  publicReplyStatus: string;
  privateReplyText: string | null;
  privateReplyId: string | null;
  privateReplyStatus: string;
  wasLiked: boolean;
  wasHidden: boolean;
  wasDeleted: boolean;
  wasBlocked: boolean;
  matchedKeyword: string | null;
  replySource: string;
  aiClassification: string | null;
  aiSentiment: string | null;
  aiPurchaseIntentScore: number | null;
  errorMessage: string | null;
}

/**
 * Crea una entrada de log para un comentario procesado.
 */
const createLogEntry = async (
  campaign: CommentAutoReplyCampaign,
  data: LogEntryData
): Promise<void> => {
  try {
    await CommentAutoReplyLog.create({
      companyId: campaign.companyId,
      campaignId: campaign.id,
      platformCommentId: data.commentId,
      postId: data.postId,
      commentText: data.commentText,
      commenterName: data.commenterName,
      commenterId: data.commenterId,
      commentedAt: data.commentedAt,
      publicReplyText: data.publicReplyText,
      publicReplyId: data.publicReplyId,
      publicReplyStatus: data.publicReplyStatus,
      privateReplyText: data.privateReplyText,
      privateReplyId: data.privateReplyId,
      privateReplyStatus: data.privateReplyStatus,
      wasLiked: data.wasLiked,
      wasHidden: data.wasHidden,
      wasDeleted: data.wasDeleted,
      wasBlocked: data.wasBlocked,
      matchedKeyword: data.matchedKeyword,
      replySource: data.replySource,
      aiClassification: data.aiClassification,
      aiSentiment: data.aiSentiment,
      aiPurchaseIntentScore: data.aiPurchaseIntentScore,
      errorMessage: data.errorMessage,
      processedAt: new Date()
    } as any);
  } catch (logError: unknown) {
    const msg = logError instanceof Error ? logError.message : String(logError);
    logger.error(`[WebhookProcessor] Error creando log para comentario ${data.commentId}: ${msg}`);
  }
};

interface CounterUpdate {
  wasHidden: boolean;
  wasDeleted: boolean;
  wasLiked: boolean;
  publicReplyStatus: string;
  privateReplyStatus: string;
}

/**
 * Actualiza los contadores de la campana usando sequelize increment.
 */
const updateCampaignCounters = async (
  campaign: CommentAutoReplyCampaign,
  counters: CounterUpdate
): Promise<void> => {
  try {
    const increments: Record<string, number> = {};

    if (counters.publicReplyStatus === "sent") {
      increments.totalRepliesSent = 1;
    }
    if (counters.privateReplyStatus === "sent") {
      increments.totalPrivateRepliesSent = 1;
    }
    if (counters.wasHidden) {
      increments.totalCommentsHidden = 1;
    }
    if (counters.wasDeleted) {
      increments.totalCommentsDeleted = 1;
    }
    if (counters.wasLiked) {
      increments.totalLikesGiven = 1;
    }

    const fields = Object.keys(increments);
    if (fields.length > 0) {
      for (const field of fields) {
        await campaign.increment(field as keyof CommentAutoReplyCampaign, { by: increments[field] });
      }
      await campaign.update({ lastReplyAt: new Date() });
    }
  } catch (counterError: unknown) {
    const msg = counterError instanceof Error ? counterError.message : String(counterError);
    logger.error(`[WebhookProcessor] Error actualizando contadores campana ${campaign.id}: ${msg}`);
  }
};

export { processIncomingComment, WebhookCommentData };
