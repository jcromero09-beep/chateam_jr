import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import { selectModel } from "./ModelRouterService";
import AppointmentAvailabilityGuard from "./AppointmentAvailabilityGuard";
import AppointmentContextStore from "./AppointmentContextStore";
import type { CurrentTicketMemory } from "./CurrentTicketMemoryService";
import logger from "../../utils/logger";

// Sprint 1 (2026-05-20) — Loop de Aprendizaje: bloquear repetición de errores
// ya corregidos por humanos antes de gastar el LLM judge.
import CorrectionRepeatBlocker from "../AILearningServices/CorrectionRepeatBlocker";
import AILearningFeatureFlag from "../AILearningServices/AILearningFeatureFlag";

/**
 * ResponseGatekeeperService — Capa de reflexión antes del envío
 *
 * Patrón: Reflection / Critic. El agente principal (sales/support/appointment/rag)
 * GENERA un borrador; este gatekeeper lo EVALÚA en contexto antes de que se envíe.
 *
 * Decisiones posibles:
 *   - "send":     Enviar la respuesta tal cual
 *   - "rewrite":  Reescribir el borrador (devuelve texto corregido en `rewritten`)
 *   - "escalate": Pasar a humano sin responder
 *   - "ignore":   NO enviar nada (ej: cliente solo agradeció, no requiere respuesta)
 *
 * Qué detecta:
 *   - Alucinaciones: la respuesta menciona precios/horarios/servicios que no
 *     aparecen en las toolCalls previas
 *   - Incoherencia con el historial: contradice algo dicho 2-3 turnos atrás
 *   - Desalineación: el cliente preguntó X y la respuesta habla de Y
 *   - Mensajes que no requieren respuesta: "ok", "gracias", stickers
 *   - Respuestas vagas cuando se espera una acción concreta
 *
 * Modelo: se obtiene dinámicamente vía ModelRouterService.selectModel() con
 *   agentType='gatekeeper' y tier 'mini'. Si la empresa no tiene config, hace
 *   fallback al default del sistema.
 */

/**
 * Detecta si un texto afirma que una cita fue creada/confirmada/agendada.
 * Usado por el guardrail anti-alucinación para detectar cuando un agente
 * (RAG, sales) está a punto de mentirle al cliente diciendo que agendó
 * sin haber ejecutado la tool de booking correspondiente.
 */
function detectFalseBookingClaim(textLower: string): boolean {
  const patterns = [
    /cita (ha sido |está |fue )?(confirmada|agendada|creada|registrada|reservada)/,
    /tu cita (ya |está |queda )?(confirmada|agendada|creada|registrada|reservada)/,
    /ya (te )?(agend|reserv|program)[eéó]/,
    /listo[,\s!]+.*?cita/,
    /perfecto[,\s!]+.*?cita (está|queda|confirmada|agendada)/,
    /(te )?agend(o|é) (tu |la )?cita/,
    /(te )?reserv(o|é) (tu |el )?(cita|turno|horario)/,
    /te espero (mañana|el lunes|el martes|el miércoles|el jueves|el viernes|el sábado|el domingo)/
  ];
  return patterns.some(p => p.test(textLower));
}

export type GatekeeperDecision = 'send' | 'rewrite' | 'escalate' | 'ignore';

export interface GatekeeperInput {
  clientMessage: string;
  draftResponse: string;
  /** Últimos 3-5 turnos del historial (role + content) */
  recentHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Agente que generó el borrador */
  agentUsed?: string;
  /** Intent detectado por el orquestador */
  intent?: string;
  /** Tools invocadas por el agente (solo nombres) */
  toolsUsed?: string[];
  /** Contexto adicional opcional (ticket, productos, citas, etc.) */
  extraContext?: string;
  companyId: number;
  /** 🆕 Fecha YYYY-MM-DD resuelta por QueryEnrichmentAgent (si viene) */
  resolvedDate?: string;
  /** 🆕 Hora HH:mm resuelta por QueryEnrichmentAgent (si viene) */
  resolvedTime?: string;
  /** 🆕 ticketId y contactId — necesarios para que el Guard persista
   * el contexto awaiting_confirmation cuando sugiera slots al cliente */
  ticketId?: number;
  contactId?: number;
  /** 🆕 (2026-04-22) Memoria del ticket para consistency/repeat checks */
  ticketMemory?: CurrentTicketMemory | null;
  /** 🆕 Emotion state ya evaluado aguas arriba */
  emotionState?: string;
  /** 🆕 Fuente del borrador (para distinguir reuse memoria vs agente) */
  responseSource?: 'current_ticket' | 'historical_qa' | 'kb' | 'tool' | 'agent' | 'human';
  /** 🆕 Sprint 1 (2026-05-20) — Contexto para CorrectionRepeatBlocker */
  queueId?: number | null;
  productKey?: string | null;
}

export interface GatekeeperResult {
  decision: GatekeeperDecision;
  confidence: number;
  reasoning: string;
  /** Solo cuando decision='rewrite': texto reescrito */
  rewritten?: string;
  modelUsed: string;
  latencyMs: number;
  tokensUsed: { input: number; output: number };
}

/**
 * Evalúa un borrador de respuesta y decide si enviarlo, reescribirlo,
 * escalarlo o ignorarlo.
 */
const evaluate = async (input: GatekeeperInput): Promise<GatekeeperResult> => {
  const startTime = Date.now();

  // 🆕 PRE-CHECK AGENTE-AGENTE: AppointmentAvailabilityGuard
  // Si el borrador habla de citas/disponibilidad y niega horarios, delegamos
  // al Guard para que verifique contra BD antes de invocar el LLM judge.
  // Esto resuelve el bug "mañana no hay cita" cuando sí hay bloques reales.
  const looksLikeAppointmentContext =
    (input.intent && input.intent.toLowerCase().includes('appointment')) ||
    (input.agentUsed === 'appointment') ||
    /cita|agend|horario|disponibilidad/i.test(input.draftResponse);

  if (looksLikeAppointmentContext) {
    try {
      const guardResult = await AppointmentAvailabilityGuard.verify({
        companyId: input.companyId,
        clientMessage: input.clientMessage,
        draftResponse: input.draftResponse,
        resolvedDate: input.resolvedDate,
        resolvedTime: input.resolvedTime
      });

      // Si el Guard detectó una contradicción borrador ↔ BD, corregimos YA
      if (guardResult.suggestedCorrection) {
        logger.info(
          `[ResponseGatekeeper] AvailabilityGuard detectó falso negativo — rewrite forzado. ` +
          `Razón: ${guardResult.reasoning}`
        );

        // 🆕 FIX ticket 1101: persistir contexto awaiting_confirmation con los
        // slots reales. Antes solo se reescribía el texto pero el contexto
        // NO se guardaba, así que el siguiente turno ("2" eligiendo slot)
        // no encontraba nada y RAG alucinaba. Ahora el AppointmentAgent
        // podrá leer el contexto y crear la cita en el turno siguiente.
        if (input.ticketId && guardResult.availableSlots.length > 0) {
          try {
            await AppointmentContextStore.set({
              ticketId: input.ticketId,
              step: 'awaiting_confirmation',
              serviceId: guardResult.serviceId,
              contactId: input.contactId,
              lastAction: 'create',
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
              metadata: { availableSlots: guardResult.availableSlots }
            } as any);
            logger.info(
              `[ResponseGatekeeper] ✅ Contexto awaiting_confirmation persistido para ticket ${input.ticketId} ` +
              `con ${guardResult.availableSlots.length} slots reales`
            );
          } catch (ctxErr: any) {
            logger.warn(
              `[ResponseGatekeeper] Error persistiendo contexto: ${ctxErr.message}`
            );
          }
        }

        return {
          decision: 'rewrite',
          confidence: 0.95,
          reasoning: `AvailabilityGuard: ${guardResult.reasoning}`,
          rewritten: guardResult.suggestedCorrection,
          modelUsed: 'availability-guard',
          latencyMs: Date.now() - startTime,
          tokensUsed: { input: 0, output: 0 }
        };
      }

      // Si el Guard confirmó que realmente NO hay disponibilidad en esa fecha,
      // el borrador es correcto → dejamos pasar sin gastar otro LLM call.
      if (guardResult.verifiedDate && !guardResult.actuallyAvailable) {
        logger.info(
          `[ResponseGatekeeper] AvailabilityGuard confirmó borrador correcto ` +
          `(sin slots para ${guardResult.verifiedDate}). Decisión: send.`
        );
        return {
          decision: 'send',
          confidence: 0.9,
          reasoning: guardResult.reasoning,
          modelUsed: 'availability-guard',
          latencyMs: Date.now() - startTime,
          tokensUsed: { input: 0, output: 0 }
        };
      }
      // Si no hubo fecha verificable o el borrador no contradice, seguimos al LLM judge
    } catch (guardErr: any) {
      logger.warn(
        `[ResponseGatekeeper] AvailabilityGuard falló, continuando con LLM judge: ${guardErr.message}`
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🆕 Sprint 1 (2026-05-20) — CORRECTION REPEAT BLOCKER
  // Si el draft repite un error que un humano ya corrigió antes para esta
  // empresa/queue/producto, bloquear ANTES de gastar el LLM judge y reescribir
  // con la solución verificada.
  //
  // Solo aplica si AI_LEARNING_LEVEL >= 1 para esta empresa. Si está
  // desactivado, este bloque es un no-op silencioso.
  // ═══════════════════════════════════════════════════════════════════
  if (AILearningFeatureFlag.isEnabled(input.companyId)) {
    try {
      const blockerResult = await CorrectionRepeatBlocker.check({
        draft: input.draftResponse,
        turn: {
          companyId: input.companyId,
          queueId: input.queueId,
          productKey: input.productKey,
          intent: input.intent
        },
        toolsUsedThisTurn: input.toolsUsed
      });

      if (blockerResult.shouldBlock && blockerResult.replacementText) {
        logger.info(
          `[ResponseGatekeeper] 🚫 CorrectionRepeatBlocker activado: ` +
          `corrId=${blockerResult.blockingCorrectionId} type=${blockerResult.blockingCorrectionType} ` +
          `sim=${blockerResult.similarityScore?.toFixed(3)} — rewrite forzado`
        );
        return {
          decision: 'rewrite',
          confidence: 0.95,
          reasoning: blockerResult.reasoning ||
            `Repeating previously corrected error (correctionId=${blockerResult.blockingCorrectionId})`,
          rewritten: blockerResult.replacementText,
          modelUsed: 'correction-repeat-blocker',
          latencyMs: Date.now() - startTime,
          tokensUsed: { input: 0, output: 0 }
        };
      }
    } catch (blockErr: any) {
      // Nunca bloquea el flujo: si el blocker falla, sigue al LLM judge.
      logger.debug(`[ResponseGatekeeper] CorrectionRepeatBlocker silenciado: ${blockErr.message}`);
    }
  }

  // 1. Modelo del gatekeeper: juez estructurado JSON con maxTokens=400.
  //    2026-07-10: NO usar gpt-5.5 aquí. gpt-5.5 es de razonamiento y usa max_completion_tokens
  //    para "pensar"; con 400 tokens gasta todo razonando y devuelve contenido VACÍO →
  //    JSON.parse("") → "Unexpected end of JSON input" (medido: 5/5 fallos en la prueba). El
  //    gatekeeper corre en CADA respuesta, así que forzamos tier mini (gpt-4.x) por velocidad
  //    y fiabilidad de JSON. NO es tema de costo — es correctitud.
  const modelSelection = await selectModel('gatekeeper', input.clientMessage, 'mini');
  const selectedGkKey = modelSelection?.entity.key;
  const modelKey = selectedGkKey && selectedGkKey.startsWith('gpt-4') ? selectedGkKey : 'gpt-4.1-mini';

  // 2. Preparar historial (máx últimos 5 turnos para no saturar contexto)
  const historyText = (input.recentHistory || [])
    .slice(-5)
    .map(m => `${m.role === 'assistant' ? 'AGENTE' : 'CLIENTE'}: ${m.content}`)
    .join('\n') || '(sin historial)';

  const toolsText = (input.toolsUsed || []).length > 0
    ? input.toolsUsed!.join(', ')
    : '(ninguna tool invocada)';

  const prompt = `Eres un auditor de calidad de respuestas de un asistente virtual empresarial.
Tu trabajo es revisar un borrador de respuesta ANTES de que se envíe al cliente
y decidir si debe enviarse, reescribirse, escalarse a humano o ignorarse.

## CONTEXTO
Agente que generó el borrador: ${input.agentUsed || 'desconocido'}
Intent detectado: ${input.intent || 'desconocido'}
Tools invocadas por el agente: ${toolsText}
${input.extraContext ? `\nContexto adicional:\n${input.extraContext}\n` : ''}

## HISTORIAL RECIENTE
${historyText}

## MENSAJE DEL CLIENTE (turno actual)
"${input.clientMessage}"

## BORRADOR DE RESPUESTA DEL AGENTE
"${input.draftResponse}"

## TU TAREA
Decide UNA acción sobre este borrador:

1. "send" — El borrador es correcto, coherente y responde lo que el cliente pidió.

2. "rewrite" — El borrador tiene problemas pero es salvable. Ejemplos:
   - Desalineado con la pregunta (cliente preguntó X, respuesta habla de Y)
   - Menciona precios/horarios/servicios/datos específicos que NO aparecen en tools invocadas (posible alucinación)
   - Contradice algo dicho en turnos previos
   - Muy vago cuando se esperaba acción concreta
   → Devuelve "rewritten" con el texto corregido (mismo tono, mismos datos REALES, sin inventar).

3. "escalate" — El caso debe ir a un humano. Ejemplos:
   - El cliente está frustrado/enojado (2+ mensajes negativos)
   - Amenazas, reclamos legales, problemas complejos que el agente no puede resolver
   - El borrador es incoherente o no tiene sentido

4. "ignore" — NO enviar nada. Ejemplos:
   - Cliente envió solo "ok", "gracias", un sticker, emoji sin pregunta
   - Cliente respondió a un mensaje anterior pero ya la conversación cerró naturalmente
   - Cliente envió info sin pedir respuesta (ej: "aquí está mi dirección: ..." después de que ya la cita fue confirmada)

## REGLAS CRÍTICAS
- Si el borrador menciona un precio, horario, servicio específico, o detalle del negocio
  y NO hubo tool invocada que los traiga, considera ALUCINACIÓN → "rewrite" o "escalate".
- Si el cliente solo agradece sin preguntar nada → "ignore".
- Prefiere "send" si el borrador es razonable; no seas hipercrítico.
- "rewrite" solo si puedes PRODUCIR una mejor versión con los datos que SÍ tienes.
- Conserva el tono y estilo del agente cuando reescribas (no robótico).

## REGLA ANTI-MENTIRA EN CITAS (CRÍTICA)
Si el borrador del agente dice frases como:
  - "No tienes citas pendientes"
  - "No encuentro tu cita"
  - "No hay cita programada"
Y el cliente está pidiendo agendar, NUNCA lo reescribas como "Cita confirmada"
o "Listo, ya agendé". Eso crearía una mentira: el agente dice que no hay cita,
tú la "confirmas" pero la BD NO tiene nada creado.
En ese caso usa "escalate" o "rewrite" a un mensaje tipo:
"Déjame revisar tu solicitud con un asesor para agendar correctamente."
NUNCA inventes que una cita fue agendada si el agente no la creó.

Responde SOLO con JSON válido:
{
  "decision": "send" | "rewrite" | "escalate" | "ignore",
  "confidence": 0.0 a 1.0,
  "reasoning": "1-2 oraciones explicando por qué",
  "rewritten": "solo si decision=rewrite, texto reescrito; si no, omitir"
}`;

  try {
    const AIClientService = require("../AIClientService").default;
    const llmResponse = await AIClientService.generateText({
      prompt,
      modelKey,
      maxTokens: 400,
      temperature: 0.2, // Determinista pero con flexibilidad para reescribir
      responseFormat: 'json',
      companyId: input.companyId
    });

    const parsed = JSON.parse(llmResponse.text);

    const validDecisions: GatekeeperDecision[] = ['send', 'rewrite', 'escalate', 'ignore'];
    const decision: GatekeeperDecision = validDecisions.includes(parsed.decision)
      ? parsed.decision
      : 'send'; // Fallback seguro: enviar el borrador original

    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.7;

    const result: GatekeeperResult = {
      decision,
      confidence,
      reasoning: parsed.reasoning || 'Sin razonamiento',
      rewritten: decision === 'rewrite' && typeof parsed.rewritten === 'string'
        ? parsed.rewritten
        : undefined,
      modelUsed: modelKey,
      latencyMs: Date.now() - startTime,
      tokensUsed: {
        input: llmResponse.usage?.promptTokens || Math.ceil(prompt.length / 4),
        output: llmResponse.usage?.completionTokens || Math.ceil(llmResponse.text.length / 4)
      }
    };

    logger.info(
      `[ResponseGatekeeper] decision=${decision}, confidence=${confidence.toFixed(2)}, ` +
      `agent=${input.agentUsed}, intent=${input.intent}, ` +
      `reasoning="${result.reasoning.substring(0, 80)}", ` +
      `latency=${result.latencyMs}ms, model=${modelKey}`
    );

    // Validación defensiva: si dijo "rewrite" pero no dio texto, mejor enviar original
    if (decision === 'rewrite' && !result.rewritten) {
      logger.warn(
        `[ResponseGatekeeper] decision=rewrite sin texto reescrito, cayendo a 'send'`
      );
      result.decision = 'send';
    }

    // 🆕 Guardrail anti-mentira para citas (defensa en profundidad):
    // Si el borrador original admite "no hay cita" y la reescritura afirma
    // que la cita fue agendada/confirmada, REVERTIR a escalate. Eso significa
    // que el agente NO pudo crear la cita y el LLM está a punto de mentirle
    // al cliente diciendo que sí.
    if (result.decision === 'rewrite' && result.rewritten) {
      const draftLower = input.draftResponse.toLowerCase();
      const rewrittenLower = result.rewritten.toLowerCase();

      const draftAdmitsNoAppointment =
        /no tienes (citas? )?pendientes/.test(draftLower) ||
        /no encuentro (tu |la )?cita/.test(draftLower) ||
        /no hay cita (programada|registrada)/.test(draftLower) ||
        /sin citas? (pendientes|programadas)/.test(draftLower);

      const rewriteClaimsBooked = detectFalseBookingClaim(rewrittenLower);

      if (draftAdmitsNoAppointment && rewriteClaimsBooked) {
        logger.warn(
          `[ResponseGatekeeper] ⚠️ GUARDRAIL ACTIVADO: el rewrite intentaba confirmar cita ` +
          `que NO existe. Forzando escalate para evitar mentira al cliente.`
        );
        result.decision = 'escalate';
        result.reasoning = `Guardrail: borrador admitía que no había cita pero rewrite la "confirmaba" sin crearla en BD`;
        result.rewritten = undefined;
      }
    }

    // 🆕 FIX ticket 1099: detección de ALUCINACIÓN DE AGENDAMIENTO en cualquier
    // agente (RAG, sales, support) cuando:
    //   1. El borrador afirma que la cita "está agendada/confirmada"
    //   2. NO se invocaron tools de creación de cita (schedule_appointment /
    //      confirm_appointment / reschedule_appointment)
    // → se bloquea el envío y fuerza escalate. Evita que el RAG/sales
    //   alucinen confirmaciones sin pasar por el AppointmentAgent.
    if (result.decision !== 'escalate') {
      const draftLower = input.draftResponse.toLowerCase();
      const claimsBooking = detectFalseBookingClaim(draftLower);

      const bookingTools = ['schedule_appointment', 'confirm_appointment', 'reschedule_appointment'];
      const usedBookingTool = (input.toolsUsed || []).some(t => bookingTools.includes(t));

      // Solo aplica si el agente NO usó una tool de booking y el borrador
      // afirma que la cita fue creada. Si fue el AppointmentAgent directo
      // (agentUsed='appointment'), confiamos porque tiene su propio flujo.
      const shouldBlock =
        claimsBooking &&
        !usedBookingTool &&
        input.agentUsed !== 'appointment';

      if (shouldBlock) {
        logger.warn(
          `[ResponseGatekeeper] ⚠️ GUARDRAIL HALLUCINATION BLOCKED: agente=${input.agentUsed} ` +
          `afirma que agendó la cita pero NO invocó tool de booking. Tools usadas: ` +
          `[${(input.toolsUsed || []).join(',')}]. Forzando rewrite+escalate.`
        );
        result.decision = 'rewrite';
        result.rewritten =
          `Gracias por confirmar los datos. Dame un momento para procesar tu agendamiento — ` +
          `te confirmo en breve con un asesor.`;
        result.reasoning = `Anti-alucinación: agente ${input.agentUsed} afirmó agendamiento sin usar tool de booking`;
        // Después de rewrite, escalamos también para que un humano cierre la cita
        // Señal: SupervisorService detecta gatekeeperDecision='escalate-after-rewrite' via reasoning
      }
    }

    // 🆕 FIX ticket 1102: detección de ALUCINACIÓN DE HORARIOS COMERCIALES.
    // Cuando el agente (especialmente sales/support) menciona horarios de
    // atención ("atendemos de X a Y", "horarios entre lunes y viernes",
    // "de 9am a 5pm") SIN haber invocado check_availability o
    // list_appointment_services, está inventando datos.
    // Se reescribe para pedir al cliente que especifique cuándo quiere
    // y delega al AppointmentAgent en el siguiente turno.
    if (result.decision !== 'escalate' && result.decision !== 'rewrite') {
      const draftLower = input.draftResponse.toLowerCase();

      const mentionsBusinessHours =
        /horario(s)?\s+(entre|de|son|disponibles)/.test(draftLower) ||
        /tenemos horarios/.test(draftLower) ||
        /(atendemos|atención)\s+(de|desde|los)/.test(draftLower) ||
        /estamos abiertos\s+(de|desde|los|entre)/.test(draftLower) ||
        /(lunes|martes|miércoles|jueves|viernes|sábado|domingo).*(a|al|y).*?(lunes|martes|miércoles|jueves|viernes|sábado|domingo)/.test(draftLower) ||
        /\b\d{1,2}\s*(am|pm|h|:00)\s+a\s+\d{1,2}\s*(am|pm|h|:00)\b/.test(draftLower) ||
        /de \d{1,2}(:\d{2})?\s*(am|pm|h)?\s+a(\s+las)?\s+\d{1,2}(:\d{2})?\s*(am|pm|h)?/.test(draftLower);

      const availabilityTools = ['check_availability', 'list_appointment_services', 'get_my_appointments'];
      const usedAvailabilityTool = (input.toolsUsed || []).some(t => availabilityTools.includes(t));

      const shouldBlockHours =
        mentionsBusinessHours &&
        !usedAvailabilityTool &&
        input.agentUsed !== 'appointment' && // appointment agent tiene su propio flujo
        input.agentUsed !== 'router';

      if (shouldBlockHours) {
        logger.warn(
          `[ResponseGatekeeper] ⚠️ GUARDRAIL HORARIOS BLOCKED: agente=${input.agentUsed} ` +
          `inventó horarios comerciales sin consultar check_availability. Tools usadas: ` +
          `[${(input.toolsUsed || []).join(',')}]. Forzando rewrite.`
        );
        result.decision = 'rewrite';
        result.rewritten =
          `¡Excelente elección! ¿Qué día y hora te gustaría para la instalación? ` +
          `Dime la fecha y horario preferido y reviso la disponibilidad real para agendarte.`;
        result.reasoning = `Anti-alucinación: agente ${input.agentUsed} mencionó horarios comerciales sin invocar check_availability/list_appointment_services`;
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🆕 (2026-04-22) GUARDRAILS DE MEMORIA DEL TICKET ACTUAL
    //   1. Consistency:  el draft contradice un answeredFact previo
    //   2. Repetition:   el draft es casi idéntico al último turno del bot
    //   3. IntentMismatch: el draft no responde nada de lo que el cliente
    //      preguntó y el ticket ya tiene fricción (emotion frustrated/angry
    //      o agentFailures ≥ 2)
    // Todos son best-effort. Si hay match, se corrige a 'rewrite'/'escalate'.
    // ═══════════════════════════════════════════════════════════════════
    if (input.ticketMemory && result.decision !== 'ignore') {
      const mem = input.ticketMemory;
      const draftLower = (result.rewritten || input.draftResponse).toLowerCase();

      // --- (1) CONSISTENCY: detecta contradicción "sí/no" con hecho previo ---
      for (const fact of mem.answeredFacts.slice(-5)) {
        const answerLower = (fact.answer || "").toLowerCase();
        const mentionsNegation = /\bno\s+(tiene|incluye|ofrece|hay|se puede)\b/.test(draftLower);
        const previouslyPositive = /\b(s[ií]|claro)\s+(tiene|incluye|ofrece|hay|se puede|lo incluye)/.test(answerLower);
        const mentionsPositive = /\b(s[ií]|claro)\s+(tiene|incluye|ofrece|hay|se puede|lo incluye)/.test(draftLower);
        const previouslyNegative = /\bno\s+(tiene|incluye|ofrece|hay|se puede)\b/.test(answerLower);

        const contradicts =
          (mentionsNegation && previouslyPositive) ||
          (mentionsPositive && previouslyNegative);

        if (contradicts) {
          logger.warn(
            `[ResponseGatekeeper] ⚠️ GUARDRAIL CONSISTENCY: draft contradice ` +
            `answeredFact turno #${fact.turnId} → forzar rewrite consistente`
          );
          result.decision = 'rewrite';
          result.rewritten = fact.answer;
          result.reasoning = `Consistency: draft contradecía respuesta previa del mismo ticket (turno #${fact.turnId}). ` +
            `Se reutilizó la respuesta anterior para mantener coherencia.`;
          break;
        }
      }

      // --- (2) REPETITION: casi idéntico al último turno del bot ---
      if (result.decision === 'send' || result.decision === 'rewrite') {
        const lastAssistant = (input.recentHistory || [])
          .filter(m => m.role === 'assistant').slice(-1)[0];
        if (lastAssistant && lastAssistant.content) {
          const a = (result.rewritten || input.draftResponse).trim();
          const b = lastAssistant.content.trim();
          const similarityRatio = jaccardRatio(a, b);
          if (similarityRatio >= 0.85 && a.length > 40) {
            logger.warn(
              `[ResponseGatekeeper] ⚠️ GUARDRAIL REPETITION: draft ~85% idéntico al ` +
              `último mensaje del bot (ratio=${similarityRatio.toFixed(2)}). Compactando.`
            );
            result.decision = 'rewrite';
            result.rewritten =
              `Como te comenté: ${shorten(b, 220)}\n\n¿Hay algo específico que te ayude a decidir o prefieres que te pase con un asesor?`;
            result.reasoning = `Repetition: draft casi idéntico al último turno del bot.`;
          }
        }
      }

      // --- (3) INTENT MISMATCH con fricción: si el cliente pregunta algo y el
      // draft no contiene ninguna palabra de la pregunta (solapamiento ≈ 0)
      // y la emoción es frustrated/angry o hay fallos acumulados, escalar.
      if (result.decision === 'send' && (input.clientMessage || '').length > 5) {
        const overlap = jaccardRatio(input.clientMessage, result.rewritten || input.draftResponse);
        const friction =
          input.emotionState === 'frustrated' || input.emotionState === 'angry' ||
          mem.agentFailures >= 2 || mem.consecutiveLowConfidence >= 2;
        if (overlap < 0.04 && friction) {
          logger.warn(
            `[ResponseGatekeeper] ⚠️ GUARDRAIL INTENT-MISMATCH: overlap=${overlap.toFixed(2)} ` +
            `con friction activa → escalate`
          );
          result.decision = 'escalate';
          result.reasoning = `IntentMismatch+Friction: respuesta no se alinea con la pregunta y el ticket tiene fricción acumulada. Escalando a humano.`;
          result.rewritten = undefined;
        }
      }
    }

    return result;
  } catch (error: any) {
    logger.error(
      `[ResponseGatekeeper] Error evaluando: ${error.message}. ` +
      `Fallback seguro: decision='send' (enviar borrador original).`
    );

    // Fallback SEGURO: si el gatekeeper falla, enviamos el borrador original.
    // No queremos que una falla del auditor bloquee todas las respuestas.
    return {
      decision: 'send',
      confidence: 0.3,
      reasoning: `Fallback por error del gatekeeper: ${error.message}`,
      modelUsed: 'fallback',
      latencyMs: Date.now() - startTime,
      tokensUsed: { input: 0, output: 0 }
    };
  }
};

/**
 * Solapamiento Jaccard entre dos textos (0..1), por tokens sin stopwords
 * mínimas. Determinista, sin dependencias externas.
 */
function jaccardRatio(a: string, b: string): number {
  const norm = (s: string) =>
    (s || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñü\s]/g, " ")
      .split(/\s+/)
      .filter(w => w && w.length > 2);
  const A = new Set(norm(a));
  const B = new Set(norm(b));
  if (A.size === 0 && B.size === 0) return 0;
  const inter = [...A].filter(t => B.has(t)).length;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 0 : inter / union;
}

function shorten(s: string, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max) + "...";
}

export default { evaluate };
