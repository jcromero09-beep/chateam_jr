import RouterAgentService, { ClassificationResult } from "./RouterAgentService";
import QueryEnrichmentAgent, { EnrichmentResult } from "./QueryEnrichmentAgent";
import RAGAgentService, { RAGResponse } from "./RAGAgentService";
import SupportAgentService, { SupportResponse } from "./SupportAgentService";
import AppointmentAgentService from "./AppointmentAgentService";
import AppointmentContextStore from "./AppointmentContextStore";
import AgentLogService from "./AgentLogService";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import SupervisorActionsService from "./SupervisorActionsService";
import TicketContextService from "./TicketContextService";
import PromptContextBuilder from "./PromptContextBuilder";
import ToolRegistry from "./ToolRegistry";
import ToolExecutor from "./ToolExecutor";
import AIAgentConfig from "../../models/AIAgentConfig";
import { add as addJob } from "../../queues";
import logger from "../../utils/logger";

// ─── NUEVOS SERVICIOS: Lenguaje Natural + Calidad de Respuesta ──────────
import SentimentDetectionService, { SentimentResult } from "./SentimentDetectionService";
import PreprocessingService, { ProcessedMessage } from "./PreprocessingService";
import DynamicPromptBuilder, { ContactContext, CompanyContext } from "./DynamicPromptBuilder";
import ResponseGatekeeperService from "./ResponseGatekeeperService";

/**
 * Supervisor Service — Orquestador central del sistema Multi-Agente
 *
 * Flujo:
 * 1. Recibe mensaje del usuario (desde WhatsApp, WebChat, etc.)
 * 2. Router Agent clasifica la intención
 * 3. Despacha al agente especializado correcto
 * 4. Evalúa calidad de la respuesta
 * 5. Si la confianza es baja, reintenta con otro agente
 * 6. Deduce créditos de IA
 * 7. Retorna la respuesta final
 *
 * Es el punto de entrada principal para TODA interacción con IA.
 */

export interface SupervisorRequest {
  message: string;
  companyId: number;
  ticketId?: number;
  contactId?: number;
  whatsappId?: number;
  ticketHistory?: Array<{ role: string; content: string }>;
  contactInfo?: Record<string, unknown>;
  chatbotId?: number; // Si viene de un chatbot específico
  ticketContext?: string; // Contexto de tags del ticket (kanban + notas)
  channel?: string; // Canal de origen: "whatsapp", "webchat", "facebook", "instagram", "telegram"
}

export interface SupervisorResponse {
  message: string;
  intent: string;
  agentUsed: string;
  confidence: number;
  shouldEscalate: boolean;
  escalationReason?: string;
  sources?: Array<{ title: string; relevance: number }>;
  totalLatencyMs: number;
  totalTokens: { input: number; output: number };
  creditsDeducted: number;
  sentiment?: string; // positive | neutral | negative | frustrated
  metadata: Record<string, unknown>;
  /**
   * 🆕 Si es true, el consumidor (wbotMessageListener) NO debe enviar
   * el mensaje al cliente. Usado cuando el ResponseGatekeeperService
   * decide 'ignore' (ej: el cliente solo dijo "gracias" y no amerita
   * respuesta del bot).
   */
  skipSend?: boolean;
  /** Decisión cruda del gatekeeper para auditoría */
  gatekeeperDecision?: 'send' | 'rewrite' | 'escalate' | 'ignore';
}

// ─── SALUDOS Y DESPEDIDAS PERSONALIZADOS ────────────────────────────────
// Se movieron a DynamicPromptBuilder.buildPersonalizedGreeting/Farewell
// para usar el nombre del contacto cuando esté disponible.

/**
 * Procesa un mensaje completo a través del sistema Multi-Agente
 */
const processMessage = async (request: SupervisorRequest): Promise<SupervisorResponse> => {
  const startTime = Date.now();
  const {
    message, companyId, ticketId, contactId,
    ticketHistory = [], contactInfo = {}
  } = request;

  logger.info(
    `[Supervisor] Procesando: company=${companyId}, ticket=${ticketId}, ` +
    `msg="${message.substring(0, 80)}..."`
  );

  // ─── PASO 0a: PREPROCESAMIENTO DEL MENSAJE ───────────────────────
  const processedMsg: ProcessedMessage = PreprocessingService.process(
    message, request.channel
  );

  // ─── PASO 0b: DETECCIÓN DE SENTIMIENTO ────────────────────────────
  const sentimentResult: SentimentResult = SentimentDetectionService.analyze(
    processedMsg.normalizedText
  );

  // Si frustración SEVERA → forzar escalado inmediato sin pasar por LLM
  if (sentimentResult.shouldForceEscalate) {
    logger.warn(
      `[Supervisor] 🚨 Frustración severa detectada, forzando escalado: ` +
      `patterns=[${sentimentResult.matchedPatterns.join(",")}]`
    );
    return {
      message: "Entiendo tu frustración y lamento mucho esta situación. " +
               "Voy a conectarte con uno de nuestros asesores ahora mismo " +
               "para que te atiendan de forma personalizada. Un momento por favor... 🤝",
      intent: "escalation",
      agentUsed: "sentiment_escalation",
      confidence: 0.98,
      shouldEscalate: true,
      escalationReason: `Frustración severa detectada: ${sentimentResult.matchedPatterns.join(", ")}`,
      totalLatencyMs: Date.now() - startTime,
      totalTokens: { input: 0, output: 0 },
      creditsDeducted: 0,
      sentiment: sentimentResult.sentiment,
      metadata: { sentimentResult, processedMsg: { language: processedMsg.language, channel: processedMsg.channel } }
    };
  }

  // 🔍 TIMEOUT DE SEGURIDAD: 20 segundos máximo para todo el proceso
  const TIMEOUT_MS = 20000;
  let timedOut = false;
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      timedOut = true;
      reject(new Error(`[Supervisor] ⏰ TIMEOUT después de ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);
  });

  try {
    // 🆕 0a. Verificar si hay contexto de cita activo (esperando confirmación
    // en flujo de agendamiento inicial — el cliente está eligiendo un slot)
    if (ticketId && !timedOut) {
      const appointmentContext = await AppointmentContextStore.get(ticketId);
      if (appointmentContext?.step === 'awaiting_confirmation') {
        logger.info(`[Supervisor] Contexto de cita activo detectado para ticket ${ticketId}, delegando a AppointmentAgent`);

        // El usuario está esperando confirmación, delegar siempre al AppointmentAgent
        return await handleAppointmentAgent(
          message, companyId, ticketId, contactId,
          { intent: 'appointment_request', targetAgent: 'appointment', confidence: 1.0 } as ClassificationResult,
          startTime, request
        );
      }
    }

    // 🆕 0b. Ventana post-recordatorio: si hay cita scheduled pendiente para
    // este contacto, clasificamos la respuesta semánticamente (confirm/
    // reschedule/cancel/ambiguous). Si el clasificador resuelve, retornamos;
    // si es ambiguous, continuamos al flujo normal para que Sales/Support
    // con tools decidan (opción b).
    if (ticketId && contactId && !timedOut) {
      try {
        const Appointment = require("../../models/Appointments/Appointment").default;
        const pending = await Appointment.findOne({
          where: { contactId, companyId, status: 'scheduled' },
          order: [["startTime", "ASC"]]
        });

        if (pending) {
          logger.info(
            `[Supervisor] Cita scheduled pendiente (ID=${pending.id}) detectada — ` +
            `clasificando respuesta semánticamente antes del flujo normal`
          );

          const apptResp = await AppointmentAgentService.processAppointmentRequest(
            message,
            { companyId, ticketId, contactId }
          );

          if (apptResp.action !== 'none') {
            // Clasificador resolvió con confianza suficiente → cortamos aquí
            const intentMap: Record<string, string> = {
              confirm: 'appointment_confirmed',
              reschedule: 'appointment_request',
              cancel: 'appointment_cancelled',
              create: 'appointment_request',
              list: 'appointment_list'
            };
            return {
              message: apptResp.message,
              intent: intentMap[apptResp.action] || 'appointment_request',
              agentUsed: 'appointment',
              confidence: apptResp.confidence,
              shouldEscalate: false,
              totalLatencyMs: Date.now() - startTime,
              totalTokens: { input: 0, output: 0 },
              creditsDeducted: 0,
              metadata: {
                appointmentAction: apptResp.action,
                appointmentId: apptResp.appointmentId,
                appointmentDetails: apptResp.appointmentDetails
              }
            } as SupervisorResponse;
          }

          logger.info(
            `[Supervisor] Intent ambiguo con cita pendiente — continuando a flujo normal (Sales/Support con tools)`
          );
        }
      } catch (preClassifyErr: any) {
        logger.warn(
          `[Supervisor] Error en pre-clasificación de cita pendiente: ${preClassifyErr.message} — continuando flujo normal`
        );
      }
    }

    // 1. QueryEnrichmentAgent — Clasificar intención + enriquecer query (reemplaza RouterAgent)
    let classification: ClassificationResult;
    let enrichment: EnrichmentResult | null = null;
    logger.info(`[Supervisor] 🔍 Clasificando y enriqueciendo con QueryEnrichmentAgent...`);
    try {
      const enrichPromise = QueryEnrichmentAgent.enrich({
        message, companyId, ticketId, contactId,
        ticketHistory, contactInfo
      });
      enrichment = await Promise.race([enrichPromise, timeoutPromise]);

      // 🆕 Bug C fix: propagar entidades temporales resueltas como strings
      // dentro de `entities` para que AppointmentAgent pueda leerlas sin
      // cambiar el contrato de ClassificationResult.
      const baseEntities = { ...(enrichment.entities || {}) };
      if (enrichment.temporalEntities) {
        if (enrichment.temporalEntities.originalText) {
          baseEntities.temporal_text = enrichment.temporalEntities.originalText;
        }
        if (enrichment.temporalEntities.resolvedDate) {
          baseEntities.temporal_date = enrichment.temporalEntities.resolvedDate;
        }
        if (enrichment.temporalEntities.resolvedTime) {
          baseEntities.temporal_time = enrichment.temporalEntities.resolvedTime;
        }
        if (enrichment.temporalEntities.timezone) {
          baseEntities.temporal_tz = enrichment.temporalEntities.timezone;
        }
      }

      // Mapear EnrichmentResult a ClassificationResult (compatibilidad)
      classification = {
        intent: enrichment.intent,
        confidence: enrichment.confidence,
        targetAgent: enrichment.targetAgent,
        entities: baseEntities,
        urgency: enrichment.urgency || "medium",
        language: enrichment.language || "es",
        modelUsed: enrichment.modelUsed,
        latencyMs: enrichment.latencyMs,
        cacheHit: enrichment.cacheHit
      };

      logger.info(
        `[Supervisor] ✅ Enriquecimiento: intent=${classification.intent}, agent=${classification.targetAgent}, ` +
        `confidence=${classification.confidence}, enrichedQuery="${(enrichment.enrichedQuery || "").substring(0, 60)}..."`
      );
    } catch (routerError: any) {
      if (timedOut) throw routerError;
      logger.error(`[Supervisor] ❌ Error en QueryEnrichment: ${routerError.message}`);
      return buildErrorResponse(message, startTime);
    }

    // 2. Manejar intenciones simples (greeting, farewell) — CON personalización
    if (classification.targetAgent === 'self') {
      const isGreeting = classification.intent === 'greeting';
      const contactCtx = contactInfo as ContactContext | undefined;

      // Cargar info de empresa para saludos personalizados
      let companyCtx: CompanyContext | undefined;
      try {
        const Company = require("../../models/Company").default;
        const company = await Company.findByPk(companyId, {
          attributes: ["name", "phone", "email"]
        });
        if (company) {
          companyCtx = { name: company.name, phone: company.phone, email: company.email };
        }
      } catch { /* silenciar */ }

      const personalizedResponse = isGreeting
        ? DynamicPromptBuilder.buildPersonalizedGreeting(contactCtx, companyCtx)
        : DynamicPromptBuilder.buildPersonalizedFarewell(contactCtx);

    return {
      message: personalizedResponse,
      intent: classification.intent,
      agentUsed: 'router',
      confidence: classification.confidence,
      shouldEscalate: false,
      totalLatencyMs: Date.now() - startTime,
      totalTokens: { input: 0, output: 0 },
      creditsDeducted: 0,
      sentiment: sentimentResult.sentiment,
      metadata: { classification, processedMsg: { language: processedMsg.language, channel: processedMsg.channel } }
    };
  }

  // 🆕 2b. Construir bloque de CONTEXTO DISPONIBLE con etiquetas semánticas
  // Reemplaza ticketContext simple por el bloque unificado con empresa, kanban,
  // historial, Quick Replies semánticos y memorias del contacto
  let unifiedContext = '';
  try {
    unifiedContext = await PromptContextBuilder.buildSupervisorContext({
      companyId,
      ticketId,
      contactId,
      currentMessage: message,
      ticketHistory,
      contactInfo
    });
    logger.info(`[Supervisor] Bloque CONTEXTO DISPONIBLE construido, length=${unifiedContext.length}`);
  } catch (ctxError: any) {
    logger.warn(`[Supervisor] Error construyendo contexto: ${ctxError.message}`);
    // Fallback: usar solo ticketContext simple
    if (ticketId) {
      try {
        const tagContext = await TicketContextService.getTicketContext(ticketId);
        unifiedContext = TicketContextService.buildContextPrompt(tagContext);
      } catch {
        unifiedContext = '';
      }
    }
  }

  // 2c. Buscar QuickReplies relevantes (para enviar media si tienen imagen)
  // ⚠️ GATE: en el PRIMER mensaje del ticket NO buscamos QuickReplies.
  // Razón: el cliente aún no ha especificado qué necesita (tipo de vehículo,
  // modalidad, etc.) y enviar una imagen ahora viola el protocolo del KB
  // ("pregunta primero, recomienda después"). Además, como no se envía, el
  // historial de "QuickReply ya enviado" no se contamina y puede mandarse
  // correctamente en el siguiente turno cuando haya contexto.
  // "Primer turno" = el bot aún no ha respondido en este ticket.
  // OJO: request.ticketHistory incluye el mensaje actual del cliente (ya guardado
  // en BD antes de llegar aquí), por eso .length nunca es 0. Lo correcto es
  // verificar que no haya ningún mensaje del bot (role='assistant').
  const history = Array.isArray(request.ticketHistory) ? request.ticketHistory : [];
  const botHasResponded = history.some(m => m.role === "assistant");
  const isFirstTurn = !botHasResponded;

  const queryForQuickReply = enrichment?.enrichedQuery || message;
  let matchedQuickReplies: Array<{ id: number; shortcode: string; message: string; mediaPath?: string; mediaName?: string; similarity: number }> = [];

  if (isFirstTurn) {
    logger.info(`[Supervisor] Primer turno del ticket → búsqueda de QuickReplies OMITIDA (evita enviar catálogo sin contexto)`);
  } else {
    try {
      const QuickReplySemanticService = require("./QuickReplySemanticService").default;
      matchedQuickReplies = await QuickReplySemanticService.findRelevant(queryForQuickReply, companyId);
      if (matchedQuickReplies.length > 0) {
        logger.info(`[Supervisor] QuickReplies matcheados: ${matchedQuickReplies.map(q => `${q.shortcode}(${q.similarity.toFixed(2)})`).join(', ')}`);
      }
    } catch (qrError: any) {
      logger.warn(`[Supervisor] Error buscando QuickReplies: ${qrError.message}`);
    }
  }

  // Enriquecer request con el contexto unificado + datos de enriquecimiento
  const enrichedRequest = {
    ...request,
    ticketContext: unifiedContext,
    // Datos de QueryEnrichmentAgent para búsqueda multi-query
    enrichedQuery: enrichment?.enrichedQuery || message,
    hydeQuery: enrichment?.hydeQuery || "",
    alternativeQueries: enrichment?.alternativeQueries || [],
    keywords: enrichment?.keywords || []
  };

  // 3. Despachar al agente especializado
  let agentResponse: SupervisorResponse;
  logger.info(`[Supervisor] 🚀 Despachando a agente: ${classification.targetAgent} (intent=${classification.intent})`);

  switch (classification.targetAgent) {
    case 'rag':
      // 🆕 Log explícito: literal para LLM final, enriched para búsqueda de chunks
      logger.info(
        `[Supervisor] → RAGAgent: ` +
        `literalMsg="${message.substring(0, 60)}..." (usado por LLM final), ` +
        `enrichedQuery="${(enrichment?.enrichedQuery || message).substring(0, 60)}..." (usado para búsqueda), ` +
        `company=${companyId}`
      );
      agentResponse = await handleRAGAgent(
        message, companyId, ticketId, contactId, classification, startTime, enrichedRequest
      );
      logger.info(`[Supervisor] ← RAGAgent resultado: confidence=${agentResponse.confidence}, sources=${agentResponse.sources?.length || 0}, shouldEscalate=${agentResponse.shouldEscalate}`);
      break;

    case 'support':
      agentResponse = await handleAgentWithTools(
        message, companyId, ticketId, contactId, classification, startTime,
        'support', 'soporte-tecnico', ticketHistory, contactInfo, enrichedRequest
      );
      break;

    case 'escalation':
      agentResponse = {
        message: "Entiendo que prefieres hablar con un agente humano. " +
                 "Te estoy transfiriendo ahora mismo. Un momento por favor... 🤝",
        intent: 'escalation',
        agentUsed: 'escalation',
        confidence: 0.98,
        shouldEscalate: true,
        escalationReason: 'Solicitud explícita del usuario',
        totalLatencyMs: Date.now() - startTime,
        totalTokens: { input: 0, output: 0 },
        creditsDeducted: 0,
        metadata: { classification }
      };
      break;

    case 'sales':
      agentResponse = await handleAgentWithTools(
        message, companyId, ticketId, contactId, classification, startTime,
        'sales', 'agente-ventas', ticketHistory, contactInfo, enrichedRequest
      );
      break;

    case 'appointment':
      agentResponse = await handleAppointmentAgent(
        message, companyId, ticketId, contactId, classification, startTime, enrichedRequest
      );
      break;

    default:
      agentResponse = await handleRAGAgent(
        message, companyId, ticketId, contactId, classification, startTime, enrichedRequest
      );
  }

  // 4. Evaluar calidad — considerar confianza + sentimiento
  // Solo escalar o agregar disclaimer si la confianza es MUY baja (< 0.15)
  // Confianzas entre 0.15-0.5 son normales para queries cortas con RAG
  if (agentResponse.confidence < 0.15 && !agentResponse.shouldEscalate) {
    // Si además hay frustración moderada, escalar directamente
    if (sentimentResult.frustrationLevel >= 2) {
      agentResponse.shouldEscalate = true;
      agentResponse.escalationReason = "Baja confianza en respuesta + frustración detectada";
      agentResponse.message += "\n\nVeo que no estoy resolviendo tu consulta como necesitas. " +
        "Te voy a conectar con un asesor para que te ayude directamente.";
    } else {
      agentResponse.shouldEscalate = true;
      agentResponse.escalationReason = "Confianza muy baja en respuesta RAG";
    }
  }

  // Inyectar sentiment en la respuesta para métricas
  agentResponse.sentiment = sentimentResult.sentiment;

  // 5. Deducir créditos basado en tokens reales consumidos
  const tokensConsumed = (agentResponse.totalTokens.input || 0) + (agentResponse.totalTokens.output || 0);
  if (tokensConsumed > 0) {
    // Calcular créditos: 1 crédito por cada 1000 tokens (ajustar según necesidad)
    const creditsToDeduct = Math.ceil(tokensConsumed / 1000);
    try {
      await DeductCreditsService({
        companyId,
        creditTypeKey: 'message',
        amount: creditsToDeduct,
        description: `Agente ${agentResponse.agentUsed}: ${message.substring(0, 50)}`,
        source: "agent_execution",
        sourceId: ticketId ? String(ticketId) : String(contactId || "unknown"),
        tokensUsed: tokensConsumed
      });
      agentResponse.creditsDeducted = creditsToDeduct;
    } catch (creditError: any) {
      logger.warn(`[Supervisor] Error deduciendo créditos: ${creditError.message}`);
      // No fallar por créditos — el mensaje ya fue procesado
    }
  }

  // 5b. Clasificar etapa kanban del ticket
  if (ticketId) {
    try {
      await SupervisorActionsService.classifyTicketStage(
        ticketId,
        companyId,
        agentResponse.intent,
        agentResponse.agentUsed
      );
      logger.info(`[Supervisor] Etapa kanban clasificada: ticket=${ticketId}, intent=${agentResponse.intent}`);
    } catch (stageError: any) {
      logger.warn(`[Supervisor] Error clasificando etapa kanban: ${stageError.message}`);
      // No fallar por esto — el mensaje ya fue procesado
    }
  }

  // 6. Log del supervisor
  try {
    await AgentLogService.logExecution({
      companyId,
      ticketId,
      contactId,
      agentType: 'supervisor',
      modelUsed: 'orchestrator',
      inputTokens: agentResponse.totalTokens.input,
      outputTokens: agentResponse.totalTokens.output,
      costUsd: 0,
      latencyMs: agentResponse.totalLatencyMs,
      confidence: agentResponse.confidence,
      wasEscalated: agentResponse.shouldEscalate,
      escalationReason: agentResponse.escalationReason,
      inputSummary: message.substring(0, 200),
      outputSummary: agentResponse.message.substring(0, 200),
      metadata: {
        intent: agentResponse.intent,
        agentUsed: agentResponse.agentUsed,
        creditsDeducted: agentResponse.creditsDeducted
      }
    });
  } catch (logError: any) {
    logger.warn(`[Supervisor] Error en log: ${logError.message}`);
  }

  // Adjuntar SOLO el QuickReply más relevante con media (máximo 1 imagen por respuesta)
  // REGLA: Enviar imagen solo cuando el bot da info concreta del producto
  // Si SOLO pregunta (sin dar info) → no enviar imagen (aún no sabe qué recomendar)
  // Si da info concreta (precio, nombre producto) + pregunta al final → SÍ enviar
  const hasQuestion = agentResponse.message.includes("?");
  const hasConcreteInfo = /\$\d|plan |GPS |cuesta|precio|incluye|instalación/i.test(agentResponse.message);
  const botIsAsking = hasQuestion && !hasConcreteInfo;
  const bestQuickReply = matchedQuickReplies.find(qr => qr.mediaPath);

  if (bestQuickReply && !botIsAsking) {
    agentResponse.metadata.quickReplies = [bestQuickReply];
    logger.info(`[Supervisor] QuickReply adjuntado: /${bestQuickReply.shortcode} (bot no pregunta, envía ficha)`);
  } else if (bestQuickReply && botIsAsking) {
    logger.info(`[Supervisor] QuickReply omitido: /${bestQuickReply.shortcode} (bot está preguntando, espera respuesta del cliente)`);
  }

  // 🆕 7. RESPONSE GATEKEEPER (capa de reflexión antes del envío)
  // Evalúa el borrador generado por el agente y decide:
  //   - send: enviar tal cual
  //   - rewrite: reescribir con datos reales (pisa agentResponse.message)
  //   - escalate: forzar escalamiento a humano
  //   - ignore: no enviar nada (skipSend=true)
  //
  // 🆕 FIX ticket 1099: el gatekeeper AHORA corre incluso si shouldEscalate=true.
  // Antes se saltaba y eso permitió que RAG alucinara "cita confirmada" +
  // escalara, y el mensaje mentiroso se envió al cliente sin filtro. El
  // AvailabilityGuard + guardrail anti-mentira detectan esas alucinaciones.
  //
  // Se salta SOLO si:
  //   - message está vacío (agente no produjo respuesta)
  //   - agentUsed es 'router' (saludos/despedidas personalizados — no evaluar)
  const shouldRunGatekeeper =
    agentResponse.message &&
    agentResponse.message.trim().length > 0 &&
    agentResponse.agentUsed !== 'router';

  if (shouldRunGatekeeper) {
    try {
      const recentHistory = (ticketHistory || []).slice(-5).map(m => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.content
      }));

      const gatekeeperResult = await ResponseGatekeeperService.evaluate({
        clientMessage: message,
        draftResponse: agentResponse.message,
        recentHistory,
        agentUsed: agentResponse.agentUsed,
        intent: agentResponse.intent,
        toolsUsed: (agentResponse.metadata?.toolsUsed as string[]) || [],
        companyId,
        // 🆕 Propagar fecha/hora resueltas por el enriquecedor para que
        // el AvailabilityGuard no tenga que re-extraerlas con LLM.
        resolvedDate: classification?.entities?.temporal_date,
        resolvedTime: classification?.entities?.temporal_time,
        // 🆕 ticket/contact para que el Guard persista contexto awaiting_confirmation
        ticketId,
        contactId
      });

      agentResponse.gatekeeperDecision = gatekeeperResult.decision;
      agentResponse.metadata.gatekeeperReasoning = gatekeeperResult.reasoning;

      switch (gatekeeperResult.decision) {
        case 'rewrite':
          if (gatekeeperResult.rewritten) {
            logger.info(
              `[Supervisor] Gatekeeper → rewrite. Draft reemplazado. ` +
              `Motivo: ${gatekeeperResult.reasoning}`
            );
            agentResponse.message = gatekeeperResult.rewritten;
          }
          break;

        case 'escalate':
          logger.info(
            `[Supervisor] Gatekeeper → escalate. ` +
            `Motivo: ${gatekeeperResult.reasoning}`
          );
          agentResponse.shouldEscalate = true;
          agentResponse.escalationReason =
            agentResponse.escalationReason || `Gatekeeper: ${gatekeeperResult.reasoning}`;
          break;

        case 'ignore':
          logger.info(
            `[Supervisor] Gatekeeper → ignore (no enviar). ` +
            `Motivo: ${gatekeeperResult.reasoning}`
          );
          agentResponse.skipSend = true;
          break;

        case 'send':
        default:
          // Enviar el borrador original, no hacer nada
          break;
      }
    } catch (gkErr: any) {
      // Fallo del gatekeeper NUNCA bloquea el envío de la respuesta
      logger.warn(
        `[Supervisor] Gatekeeper falló, enviando borrador original: ${gkErr.message}`
      );
    }
  }

  logger.info(
    `[Supervisor] Completado: intent=${agentResponse.intent}, agent=${agentResponse.agentUsed}, ` +
    `confidence=${agentResponse.confidence.toFixed(2)}, escalate=${agentResponse.shouldEscalate}, ` +
    `skipSend=${agentResponse.skipSend || false}, ` +
    `gatekeeper=${agentResponse.gatekeeperDecision || 'n/a'}, ` +
    `quickRepliesWithMedia=${matchedQuickReplies.filter(q => q.mediaPath).length}, ` +
    `latency=${agentResponse.totalLatencyMs}ms`
  );

  return agentResponse;
  } catch (err: any) {
    logger.error(`[Supervisor] ❌ Error en processMessage: ${err.message}`);
    return buildErrorResponse(message, startTime);
  }
};

/**
 * Handler para RAG Agent
 */
async function handleRAGAgent(
  message: string,
  companyId: number,
  ticketId: number | undefined,
  contactId: number | undefined,
  classification: ClassificationResult,
  startTime: number,
  request: SupervisorRequest
): Promise<SupervisorResponse> {
  try {
    const ragResult: RAGResponse = await RAGAgentService.processQuery(
      message, companyId, {
        ticketId,
        contactId,
        chatbotId: request.chatbotId,
        ticketContext: request.ticketContext,
        channel: request.channel,
        ticketHistory: request.ticketHistory,
        // Datos de QueryEnrichmentAgent para búsqueda multi-query
        enrichedQuery: (request as any).enrichedQuery,
        hydeQuery: (request as any).hydeQuery,
        alternativeQueries: (request as any).alternativeQueries,
        keywords: (request as any).keywords
      }
    );

    // Propagar flags del RAGAgent (fallback LLM, handoff textual)
    const shouldEscalate =
      ragResult.shouldEscalate === true ||
      ragResult.isFallback === true ||
      ragResult.confidence < 0.2;

    const escalationReason =
      ragResult.escalationReason ||
      (ragResult.isFallback
        ? "Fallback por error LLM — escalar a humano"
        : ragResult.confidence < 0.2
          ? "Confianza muy baja en respuesta RAG"
          : undefined);

    return {
      message: ragResult.answer,
      intent: classification.intent,
      agentUsed: 'rag',
      confidence: ragResult.confidence,
      shouldEscalate,
      escalationReason,
      sources: ragResult.sources.map(s => ({
        title: s.title,
        relevance: s.relevance
      })),
      totalLatencyMs: Date.now() - startTime,
      totalTokens: ragResult.tokensUsed,
      creditsDeducted: 0,
      metadata: {
        classification,
        searchResults: ragResult.searchResults,
        cacheHit: ragResult.cacheHit,
        isFallback: ragResult.isFallback === true
      }
    };
  } catch (error: any) {
    logger.error(`[Supervisor] Error en RAG Agent: ${error.message}`);
    return buildErrorResponse(message, startTime);
  }
}

/**
 * Handler para Support Agent
 */
async function handleSupportAgent(
  message: string,
  companyId: number,
  ticketId: number | undefined,
  contactId: number | undefined,
  classification: ClassificationResult,
  startTime: number,
  ticketHistory: Array<{ role: string; content: string }>,
  contactInfo: Record<string, unknown>,
  request: SupervisorRequest
): Promise<SupervisorResponse> {
  try {
    const ticketContext = request.ticketContext || '';
    const supportResult: SupportResponse = await SupportAgentService.processRequest(
      message, companyId, {
        ticketId,
        contactId,
        ticketHistory,
        contactInfo,
        ticketContext
      }
    );

    return {
      message: supportResult.message,
      intent: classification.intent,
      agentUsed: 'support',
      confidence: supportResult.confidence,
      shouldEscalate: supportResult.shouldEscalate,
      escalationReason: supportResult.escalationReason,
      totalLatencyMs: Date.now() - startTime,
      totalTokens: supportResult.tokensUsed,
      creditsDeducted: 0,
      metadata: {
        classification,
        diagnosticSteps: supportResult.diagnosticSteps,
        actionsCount: supportResult.actions.length
      }
    };
  } catch (error: any) {
    logger.error(`[Supervisor] Error en Support Agent: ${error.message}`);
    return buildErrorResponse(message, startTime);
  }
}

/**
 * Handler universal con Tool Calling — Para agentes que pueden ejecutar acciones
 *
 * Flujo:
 * 1. Carga systemPrompt de BD + prompt hardcodeado de fallback
 * 2. Obtiene tools disponibles del ToolRegistry para este agente
 * 3. Llama al LLM con tools (OpenAI function calling)
 * 4. Si el LLM pide ejecutar tools → ToolExecutor las ejecuta
 * 5. Envía resultados de tools al LLM para respuesta final
 * 6. Máximo 3 iteraciones de tool calling
 */
async function handleAgentWithTools(
  message: string,
  companyId: number,
  ticketId: number | undefined,
  contactId: number | undefined,
  classification: ClassificationResult,
  startTime: number,
  agentType: string,
  agentSlug: string,
  ticketHistory: Array<{ role: string; content: string }>,
  contactInfo: Record<string, unknown>,
  request: SupervisorRequest
): Promise<SupervisorResponse> {
  try {
    const AIClientService = require("../AIClientService").default;

    // 1. Cargar systemPrompt de BD
    let dbSystemPrompt: string | undefined;
    try {
      const agentConfig = await AIAgentConfig.findOne({ where: { slug: agentSlug } });
      if (agentConfig?.systemPrompt) {
        dbSystemPrompt = agentConfig.systemPrompt;
      }
    } catch (configErr: any) {
      logger.warn(`[Supervisor] No se pudo cargar config de BD para ${agentSlug}: ${configErr.message}`);
    }

    // ─── NUEVO: Construir system prompt dinámico con identidad + reglas ───
    // Detectar sentimiento y preprocesar (si no viene del Supervisor principal)
    const localSentiment = SentimentDetectionService.analyze(message);
    const localProcessed = PreprocessingService.process(message, request.channel);

    // Cargar info de empresa
    let companyCtx: CompanyContext | undefined;
    try {
      const Company = require("../../models/Company").default;
      const company = await Company.findByPk(companyId, {
        attributes: ["name", "phone", "email", "city"]
      });
      if (company) {
        companyCtx = { name: company.name, phone: company.phone, email: company.email, city: company.city };
      }
    } catch { /* silenciar */ }

    let systemPrompt = DynamicPromptBuilder.buildSystemPrompt({
      agentIdentity: { agentType: agentType as any },
      contactInfo: contactInfo as ContactContext | undefined,
      companyInfo: companyCtx,
      sentiment: localSentiment,
      language: localProcessed.language,
      channel: localProcessed.channel,
      dbSystemPrompt,
    });

    // Agregar instrucciones de tools al system prompt
    systemPrompt += `\n\nTienes acceso a herramientas para ejecutar acciones reales (agendar citas, consultar disponibilidad, enviar emails, etc.). ` +
      `Usa las herramientas cuando el cliente lo solicite o cuando sea apropiado. ` +
      `IMPORTANTE: Cuando uses una herramienta, espera el resultado antes de responder al cliente.

## Protocolo de citas (OBLIGATORIO)
Los "servicios" son TIPOS OPERATIVOS de cita (instalación, capacitación, soporte, etc.), NO productos en catálogo. No los listes al cliente como menú.

Cuando el cliente responda a un mensaje de confirmación de cita:
1. Si responde afirmativo ("sí", "confirmo", "ok", "de acuerdo", "perfecto"):
   → Llama primero get_my_appointments para localizar la cita pendiente.
   → Luego llama confirm_appointment con ese appointmentId.
   → Esto dispara automáticamente el segundo mensaje de recordatorio; no debes enviarlo tú.

2. Si pide cambio de fecha/hora ("puedes cambiarla", "para el viernes", "mejor a otra hora"):
   → Llama get_my_appointments para obtener el appointmentId.
   → Llama check_availability con la nueva fecha tentativa.
   → Luego llama reschedule_appointment con appointmentId + newDate + newTime.

3. Si pide cancelar ("no puedo", "cancela", "ya no"):
   → Llama get_my_appointments + cancel_appointment.

PROHIBIDO: confirmar, reagendar o cancelar respondiendo texto sin invocar la tool correspondiente. El cambio de estado en BD es lo que dispara los mensajes automáticos — si solo respondes texto, la cita queda sin confirmar y el seguimiento no se ejecuta.`;

    // 2. Construir mensajes con historial
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt }
    ];

    // Inyectar contexto unificado (empresa, kanban, quickreplies, etc.)
    if (request.ticketContext) {
      messages.push({ role: 'system', content: request.ticketContext });
    }

    // Inyectar chunks obligatorios (reglas, horarios, protocolo) — sourceType='manual'
    // Estos son críticos para que el agente de ventas/soporte conozca las políticas
    try {
      const { QueryTypes: QT } = require("sequelize");
      const db = require("../../database").default;
      const mandatoryChunks = await db.query(`
        SELECT c.content FROM "AIChunks" c
        JOIN "AIDocuments" d ON d.id = c."documentId"
        WHERE c."companyId" = :companyId AND d."sourceType" = 'manual' AND d.status = 'completed'
        ORDER BY c.id ASC
      `, { replacements: { companyId }, type: QT.SELECT });

      if (mandatoryChunks.length > 0) {
        const rulesContent = mandatoryChunks.map((c: any) => c.content).join('\n\n');
        messages.push({
          role: 'system',
          content: `--- REGLAS Y POLÍTICAS DE LA EMPRESA (CUMPLIMIENTO OBLIGATORIO) ---\n${rulesContent}\n\nResponde SOLO con datos que aparecen aquí. Si no tienes la información, ofrece conectar con un asesor.`
        });
      }
    } catch (chunkErr: any) {
      logger.warn(`[Supervisor] Error cargando chunks obligatorios para ${agentType}: ${chunkErr.message}`);
    }

    // Agregar historial de conversación
    if (ticketHistory && ticketHistory.length > 0) {
      for (const msg of ticketHistory.slice(-10)) { // Últimos 10 mensajes
        messages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        });
      }
    }

    // Agregar contexto del contacto formateado (NO como JSON crudo)
    if (contactInfo && Object.keys(contactInfo).length > 0) {
      const ci = contactInfo as Record<string, any>;
      const contactLines: string[] = [];
      if (ci.name) contactLines.push(`Nombre: ${ci.name}`);
      if (ci.email) contactLines.push(`Email: ${ci.email}`);
      if (ci.phone) contactLines.push(`Teléfono: ${ci.phone}`);
      if (ci.plan) contactLines.push(`Plan: ${ci.plan}`);
      if (ci.company) contactLines.push(`Empresa: ${ci.company}`);

      if (contactLines.length > 0) {
        messages.push({
          role: 'system',
          content: `Información del cliente:\n${contactLines.join("\n")}`
        });
      }
    }

    // Agregar el mensaje actual
    messages.push({ role: 'user', content: message });

    // 3. Obtener tools disponibles para este agente
    const tools = ToolRegistry.getToolsForAgent(agentType);
    logger.info(`[Supervisor] Tools disponibles para ${agentType}: ${tools.map(t => t.function.name).join(', ')}`);

    // 4. Tool calling loop (máx 3 iteraciones)
    let finalContent = '';
    let totalTokens = { input: 0, output: 0 };
    let shouldEscalate = false;
    let escalationReason: string | undefined;
    let toolsUsed: string[] = [];
    const conversationMessages: any[] = [...messages];

    const MAX_TOOL_ITERATIONS = 3;
    // max_tokens dinámico: WhatsApp=500, WebChat=1024, etc.
    const dynamicMaxTokens = PreprocessingService.getMaxTokensForChannel(localProcessed.channel);

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      // 📤 Log del prompt enviado al LLM
      logger.info(
        `[Supervisor] 📤 Enviando al LLM (iter ${iteration + 1}): ` +
        `${conversationMessages.length} mensajes, model=gpt-4.1-mini, company=${companyId}`
      );

      // Debug: mostrar system prompt y user message
      const systemMsg = conversationMessages.find(m => m.role === 'system');
      const userMsg = conversationMessages.find(m => m.role === 'user');
      logger.debug(`[Supervisor] 📝 System prompt (${systemMsg?.content?.length || 0} chars): "${systemMsg?.content?.substring(0, 100)}..."`);
      logger.debug(`[Supervisor] 📝 User message: "${userMsg?.content?.substring(0, 100)}..."`);

      const llmResponse = await AIClientService.chatCompletionWithTools({
        messages: conversationMessages,
        model: 'gpt-4.1-mini',
        maxTokens: dynamicMaxTokens,
        temperature: 0.4,
        companyId,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined
      });

      // Acumular tokens
      totalTokens.input += llmResponse.usage?.prompt_tokens || llmResponse.usage?.input_tokens || 0;
      totalTokens.output += llmResponse.usage?.completion_tokens || llmResponse.usage?.output_tokens || 0;

      // Si no hay tool calls, tenemos la respuesta final
      if (!llmResponse.toolCalls || llmResponse.toolCalls.length === 0) {
        finalContent = llmResponse.content;
        break;
      }

      // Ejecutar tool calls
      logger.info(
        `[Supervisor] Tool calls recibidos (iter ${iteration + 1}): ` +
        llmResponse.toolCalls.map((tc: any) => tc.function.name).join(', ')
      );

      const toolContext = {
        companyId,
        ticketId,
        contactId,
        whatsappId: request.whatsappId
      };

      const toolResults = await ToolExecutor.executeToolCalls(
        llmResponse.toolCalls,
        toolContext,
        agentType
      );

      // Registrar tools usados
      toolsUsed.push(...toolResults.map(r => r.toolName));

      // Verificar si alguna tool fue transfer_to_human
      for (const result of toolResults) {
        if (result.toolName === 'transfer_to_human' && result.result.success) {
          shouldEscalate = true;
          escalationReason = result.result.data?.reason || 'Transferencia solicitada por agente IA';
        }
      }

      // Agregar el mensaje del asistente con tool_calls al historial
      conversationMessages.push({
        role: 'assistant',
        content: llmResponse.content || null,
        tool_calls: llmResponse.toolCalls
      });

      // Agregar resultados de tools al historial
      const toolMessages = ToolExecutor.toolResultsToMessages(toolResults);
      conversationMessages.push(...toolMessages);

      // Si es la última iteración y aún hay tool calls, forzar respuesta de texto
      if (iteration === MAX_TOOL_ITERATIONS - 1) {
        conversationMessages.push({
          role: 'system',
          content: 'Ya ejecutaste las herramientas necesarias. Ahora genera tu respuesta final al cliente basándote en los resultados obtenidos.'
        });
      }
    }

    // Si no obtuvimos respuesta final, hacer una última llamada sin tools
    if (!finalContent) {
      const finalResponse = await AIClientService.chatCompletion({
        messages: conversationMessages,
        model: 'gpt-4.1-mini',
        maxTokens: dynamicMaxTokens,
        temperature: 0.4,
        companyId
      });
      finalContent = finalResponse.content;
      totalTokens.input += finalResponse.usage?.prompt_tokens || 0;
      totalTokens.output += finalResponse.usage?.completion_tokens || 0;
    }

    return {
      message: finalContent || 'Lo siento, no pude procesar tu solicitud. ¿Necesitas hablar con un asesor?',
      intent: classification.intent,
      agentUsed: agentType,
      confidence: shouldEscalate ? 0.95 : 0.8,
      shouldEscalate,
      escalationReason,
      totalLatencyMs: Date.now() - startTime,
      totalTokens,
      creditsDeducted: 0,
      sentiment: localSentiment.sentiment,
      metadata: {
        classification,
        toolsUsed,
        toolCallIterations: toolsUsed.length > 0 ? Math.ceil(toolsUsed.length) : 0,
        language: localProcessed.language,
        channel: localProcessed.channel,
        frustrationLevel: localSentiment.frustrationLevel
      }
    };
  } catch (error: any) {
    logger.error(`[Supervisor] Error en ${agentType} con tools: ${error.message}`);

    // Fallback: intentar sin tools usando el handler legacy
    if (agentType === 'support') {
      try {
        const supportResult: SupportResponse = await SupportAgentService.processRequest(
          message, companyId, { ticketId, contactId, ticketHistory, contactInfo }
        );
        return {
          message: supportResult.message,
          intent: classification.intent,
          agentUsed: 'support (fallback)',
          confidence: supportResult.confidence,
          shouldEscalate: supportResult.shouldEscalate,
          escalationReason: supportResult.escalationReason,
          totalLatencyMs: Date.now() - startTime,
          totalTokens: supportResult.tokensUsed,
          creditsDeducted: 0,
          metadata: { classification, fallback: true }
        };
      } catch (fallbackErr: any) {
        logger.error(`[Supervisor] Fallback de support también falló: ${fallbackErr.message}`);
      }
    }

    return buildErrorResponse(message, startTime);
  }
}

/**
 * Construye respuesta de error genérica
 */
function buildErrorResponse(message: string, startTime: number): SupervisorResponse {
  return {
    message: "Disculpa, estoy teniendo dificultades técnicas. " +
             "¿Quieres que te transfiera a un agente humano?",
    intent: 'general',
    agentUsed: 'error_handler',
    confidence: 0,
    shouldEscalate: true,
    escalationReason: 'Error técnico en procesamiento IA',
    totalLatencyMs: Date.now() - startTime,
    totalTokens: { input: 0, output: 0 },
    creditsDeducted: 0,
    metadata: { error: true }
  };
}

/**
 * Handler para Appointment Agent — Gestión de Citas
 *
 * Maneja:
 * - Agendar nuevas citas
 * - Reagendar citas existentes
 * - Cancelar citas
 * - Listar citas del contacto
 * - Confirmar citas
 */
async function handleAppointmentAgent(
  message: string,
  companyId: number,
  ticketId: number | undefined,
  contactId: number | undefined,
  classification: ClassificationResult,
  startTime: number,
  request: SupervisorRequest
): Promise<SupervisorResponse> {
  try {
    logger.info(`[handleAppointmentAgent] Iniciando con mensaje: "${message.substring(0, 50)}..."`);

    // 🆕 Bug C fix: propagar entidades temporales resueltas por el enriquecedor
    const appointmentResponse = await AppointmentAgentService.processAppointmentRequest(
      message,
      {
        companyId,
        ticketId,
        contactId,
        resolvedDate: classification.entities?.temporal_date,
        resolvedTime: classification.entities?.temporal_time,
        resolvedTimezone: classification.entities?.temporal_tz
      }
    );

    logger.info(`[handleAppointmentAgent] Respuesta: action=${appointmentResponse.action}, message="${appointmentResponse.message.substring(0, 50)}..."`);

    // Si no se detectó intención de cita, delegar a RAG
    if (appointmentResponse.action === "none") {
      logger.info(`[handleAppointmentAgent] Acción = none, derivando a RAG`);
      return await handleRAGAgent(
        message, companyId, ticketId, contactId, classification, startTime, request
      );
    }

    // Mapear acción a intención
    const intentMap: Record<string, string> = {
      'create': 'appointment_request',
      'reschedule': 'appointment_reschedule',
      'cancel': 'appointment_cancel',
      'list': 'appointment_list',
      'confirm': 'appointment_confirm'
    };

    return {
      message: appointmentResponse.message,
      intent: intentMap[appointmentResponse.action] || 'appointment_request',
      agentUsed: 'appointment',
      confidence: appointmentResponse.confidence,
      shouldEscalate: false,
      totalLatencyMs: Date.now() - startTime,
      totalTokens: { input: 0, output: 0 },
      creditsDeducted: 0,
      metadata: {
        classification,
        appointmentAction: appointmentResponse.action,
        appointmentId: appointmentResponse.appointmentId,
        appointmentDetails: appointmentResponse.appointmentDetails
      }
    };
  } catch (error: any) {
    logger.error(`[handleAppointmentAgent] Error: ${error.message}, stack: ${error.stack}`);
    return buildErrorResponse(message, startTime);
  }
}

export default {
  processMessage
};
